import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { COLLECT_DURATION, LOAD_DURATION, PORTER_COLLECT_DURATION } from '../src/game/config';
import { generateEquipmentItem } from '../src/game/phase5';
import { cargoWeight, updateGame } from '../src/game/simulation';
import { deriveSemanticRenderState } from '../src/render/semanticRenderState';
import { carriedCargoPoint, liftCargoPoint } from '../src/render/cargoMotion';
import { workEquipment } from '../src/render/workEquipment';
import { boreMotion, railMotion } from '../src/render/worksiteRenderer';
import type { RemoteBore, TransportLine, RailCart } from '../src/game/types';
import { loot } from './fixtures/discovery';

const frame = (state: ReturnType<typeof createGameState>) => deriveSemanticRenderState(state, 1000);

describe('visible equipment and physical hand-offs', () => {
  it('selects three field-tool shapes, pack and lamp parts from equipped inventory without changing effects', () => {
    const state = createGameState(901);
    for (const [affix, expected] of [['FOSSIL_BREAKER', 2], ['LIGHT_FRAME', 3], ['RESEARCH_PRISM', 4]] as const) {
      const item = generateEquipmentItem(state, 901, 'field-pick', 'TOOL');
      item.affixes = [{ id: affix, name: affix, description: '', value: .2 }];
      state.run.phase5.equipment.inventory.push(item); state.run.phase5.equipment.equippedPlayer.TOOL = item.id;
      const before = JSON.stringify(state);
      expect(workEquipment(state)).toMatchObject({ tool: expected, stowed: true });
      frame(state); expect(JSON.stringify(state)).toBe(before);
    }
    for (const [slot, base, affix] of [['PACK', 'field-frame', 'CARGO_HOOK'], ['LAMP', 'survey-lamp', 'SURVEY_LAMP_MK2']] as const) {
      const item = generateEquipmentItem(state, 902, base, slot);
      item.affixes = [{ id: affix, name: affix, description: '', value: .2 }];
      state.run.phase5.equipment.inventory.push(item); state.run.phase5.equipment.equippedPlayer[slot] = item.id;
    }
    expect(workEquipment(state)).toMatchObject({ pack: 2, lamp: 2 });
    state.run.phase5.equipment.equippedPlayer.TOOL = 'missing-item';
    expect(workEquipment(state)).toMatchObject({ tool: 0, stowed: false });
  });

  it('moves a floor item toward its eventual hand without creating another owner', () => {
    const state = createGameState(902); const item = { ...loot('IRON', 'moving'), x: 110 };
    const c = state.run.character; c.x = item.x; c.state = 'COLLECTING'; c.collectTimer = COLLECT_DURATION - .001;
    state.run.floors['D-001'].loot = [item];
    const before = JSON.stringify(state); const drawing = frame(state);
    const landing = carriedCargoPoint(drawing.character, 0);
    const point = drawing.floorCargoPositions!.get(item.id)!;
    expect(Math.abs(point.x - landing.x) + Math.abs(point.y - landing.y)).toBeLessThanOrEqual(1);
    expect(c.carried).toEqual([]); expect(JSON.stringify(state)).toBe(before);
    updateGame(state, .01);
    expect(state.run.floors['D-001'].loot).toEqual([]); expect(c.carried).toEqual([item]);
    expect(frame(state).floorCargoPositions!.has(item.id)).toBe(false);
    // A Porter collecting on the right turns back toward the lift without a cargo jump at completion.
    const p = state.run.porter; const parcel = { ...loot('IRON', 'porter-turn'), x: 350 };
    state.run.floors['D-001'].loot = [parcel];
    Object.assign(p, { enabled: true, x: 350, facing: 1, state: 'COLLECTING', collectTimer: PORTER_COLLECT_DURATION - .001, targetLootId: parcel.id });
    const beforeTurn = frame(state).floorCargoPositions!.get(parcel.id)!;
    updateGame(state, .01);
    expect(frame(state).porter!.carried).toEqual([parcel]);
    const afterTurn = carriedCargoPoint(frame(state).porter!, 0);
    expect(Math.abs(beforeTurn.x - afterTurn.x) + Math.abs(beforeTurn.y - afterTurn.y)).toBeLessThanOrEqual(1);
  });

  it('leaves cancelled and overweight pickups on the floor, including competing collectors', () => {
    const state = createGameState(903); const item = { ...loot('IRON', 'shared'), x: 120 };
    const heavy = { ...loot('STONE', 'too-heavy'), x: 120, weight: 99 };
    state.run.floors['D-001'].loot = [item, heavy];
    Object.assign(state.run.character, { x: 120, state: 'COLLECTING', collectTimer: .2 });
    Object.assign(state.run.porter, { enabled: true, x: 120, state: 'COLLECTING', targetLootId: item.id, collectTimer: .2 });
    expect([...frame(state).floorCargoPositions!.keys()]).toEqual([item.id]);
    state.run.character.state = 'IDLE'; state.run.porter.state = 'IDLE';
    expect(frame(state).floorCargoPositions!.size).toBe(0);
    expect(state.run.floors['D-001'].loot).toEqual([item, heavy]);
  });

  it('lands only fitting cargo on the real deck at the existing deposit boundary', () => {
    const state = createGameState(904); const item = { ...loot('IRON', 'fits'), weight: 2 };
    const held = { ...loot('COPPER', 'stays'), weight: 3 };
    const present = { ...loot('STONE', 'present'), weight: 17 };
    state.run.elevator.cargo = [present]; state.run.elevator.state = 'LOADING';
    Object.assign(state.run.character, { x: 212, facing: 1, state: 'LOADING', loadingTimer: LOAD_DURATION - .001, carried: [item, held] });
    const drawing = frame(state); const point = drawing.character.cargoPositions!.get(item.id)!;
    const destination = liftCargoPoint(1, drawing.elevator.y);
    expect(Math.abs(point.x - destination.x) + Math.abs(point.y - destination.y)).toBeLessThanOrEqual(1);
    expect(drawing.character.cargoPositions!.has(held.id)).toBe(false);
    expect(state.run.elevator.cargo).toEqual([present]);
    updateGame(state, .01);
    expect(state.run.elevator.cargo).toEqual([present, item]); expect(state.run.character.carried).toEqual([held]);
    expect(cargoWeight(state.run.elevator.cargo) + cargoWeight(state.run.character.carried)).toBe(22);
    expect(frame(state).character.cargoPositions!.size).toBe(0);
    state.run.depth.current = 'D-030';
    expect(frame(state).elevator.y).toBeLessThan(drawing.elevator.y); // deeper-floor deck has no D-001 art offset
  });

  it('uses a stationary empty hold or loaded wait pose without inventing cargo', () => {
    const state = createGameState(905); const p = state.run.porter; p.enabled = true; p.holdForTravel = true;
    expect(frame(state).porter).toMatchObject({ pause: 'travel', carried: [] });
    p.holdForTravel = false; p.state = 'WAITING_FOR_ELEVATOR'; p.carried = [loot('IRON')];
    expect(frame(state).porter?.pause).toBe('lift');
    expect(deriveSemanticRenderState(state, 0).porter?.frame).toBe(deriveSemanticRenderState(state, 50000).porter?.frame);
  });

  it('does not run construction, jammed, empty-transfer or blocked-output mechanisms', () => {
    const line = { state: 'READY', inputBuffer: [] } as unknown as TransportLine;
    const cart = { state: 'TRAVELING_TO_HUB', position: .4, stateTimer: 1, cargo: [] } as unknown as RailCart;
    expect(railMotion(line, cart)).toBeGreaterThan(0);
    line.state = 'BUILDING'; expect(railMotion(line, cart)).toBe(0);
    line.state = 'JAMMED'; expect(railMotion(line, cart)).toBe(0);
    line.state = 'READY'; cart.state = 'LOADING'; expect(railMotion(line, cart)).toBe(0);
    const bore = { state: 'DRILLING', cycleProgress: 1, cycleDuration: 2 } as RemoteBore;
    expect(boreMotion(bore)).toBeGreaterThan(0); bore.state = 'BLOCKED'; expect(boreMotion(bore)).toBe(0);
  });
});
