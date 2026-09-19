import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import {
  deriveInitialLogisticsGuide,
  isFirstLiveScrapGain,
  isInitialLogisticsGuideEligible,
} from '../src/game/initialLogisticsGuide';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { canDispatchElevator, currentFloor, requestMine, selectNode, updateGame } from '../src/game/simulation';
import type { GameEvent, GameState, LootStack } from '../src/game/types';

describe('initial logistics guide', () => {
  it('starts at Scrap Ledge and follows another selected target through movement', () => {
    const state = createGameState(12001);
    expect(summary(state)).toEqual(['choose-vein', 'CLICK/TAP TO MOVE', 'node:scrap-ledge']);

    expect(selectNode(state, 'copper-pocket')).toBe(true);
    expect(summary(state)).toEqual(['moving-to-vein', 'MOVING TO VEIN', 'node:copper-pocket']);
  });

  it('uses canMine and shows detailed controls only before the first manual swing', () => {
    const state = arrivedAtScrapLedge();
    expect(summary(state)).toEqual(['mine-ready', 'MINE', 'node:scrap-ledge']);
    expect(deriveInitialLogisticsGuide(state)?.detailedMiningHelp).toBe(true);

    expect(requestMine(state)).toBe(true);
    expect(summary(state)).toEqual(['mining', 'MINING', 'character']);
    while (state.run.character.swing) updateGame(state, 1 / 60);

    expect(summary(state)).toEqual(['mine-ready', 'MINE', 'node:scrap-ledge']);
    expect(deriveInitialLogisticsGuide(state)?.detailedMiningHelp).toBe(false);
  });

  it('prioritizes automatic cargo states and an actionable full lift', () => {
    const state = createGameState(12003);
    const cargo = loot();
    state.run.character.targetNodeId = 'scrap-ledge';

    state.run.character.state = 'COLLECTING';
    expect(summary(state)).toEqual(['collecting', 'COLLECTING', 'character']);

    state.run.character.state = 'RETURNING';
    state.run.character.carried = [cargo];
    expect(summary(state)).toEqual(['returning', 'RETURNING WITH CARGO', 'character']);

    state.run.character.state = 'WAITING_FOR_ELEVATOR';
    expect(summary(state)).toEqual(['waiting-for-lift', 'WAITING FOR LIFT', 'character']);

    state.run.character.state = 'LOADING';
    state.run.elevator.state = 'LOADING';
    expect(summary(state)).toEqual(['loading-lift', 'LOADING LIFT', 'character']);

    state.run.character.state = 'WAITING_FOR_ELEVATOR';
    state.run.character.carried = [loot('cargo-2', 3)];
    state.run.elevator.state = 'IDLE_BOTTOM';
    state.run.elevator.cargo = [cargo];
    expect(canDispatchElevator(state)).toBe(true);
    expect(summary(state)).toEqual(['select-elevator', 'SELECT ELEVATOR', 'elevator']);
  });

  it('guides selection, dispatch, ascent, and appraisal from elevator state', () => {
    const state = createGameState(12004);
    state.run.elevator.cargo = [loot()];
    expect(summary(state)).toEqual(['select-elevator', 'SELECT ELEVATOR', 'elevator']);

    state.selection = { type: 'elevator' };
    expect(summary(state)).toEqual(['send-to-surface', 'SEND TO SURFACE', 'elevator']);

    state.run.elevator.state = 'ASCENDING';
    expect(summary(state)).toEqual(['to-surface', 'TO SURFACE', 'elevator']);

    state.run.elevator.state = 'UNLOADING';
    expect(summary(state)).toEqual(['appraising', 'APPRAISING', 'elevator']);
  });

  it('restores an in-progress stage without relying on selection', () => {
    const state = createGameState(12005);
    state.selection = { type: 'elevator' };
    state.run.character.state = 'RETURNING';
    state.run.character.targetNodeId = 'scrap-ledge';
    state.run.character.carried = [loot()];
    const restored = restoreGameState(serializeGameState(state));

    expect(restored?.selection).toBeNull();
    expect(restored && summary(restored)).toEqual(['returning', 'RETURNING WITH CARGO', 'character']);
  });

  it.each([
    ['Run 2', (state: GameState) => { state.meta.runIndex = 2; }],
    ['spent first delivery', (state: GameState) => { state.run.stats.elevatorTrips = 1; }],
    ['Auto Swing', (state: GameState) => { state.run.automation.autoSwing.unlocked = true; }],
    ['Porter', (state: GameState) => { state.run.porter.enabled = true; }],
    ['Crew', (state: GameState) => { state.run.phase5.crew.unlocked = true; }],
    ['Auto Dispatch', (state: GameState) => { state.run.automation.autoDispatch.unlocked = true; }],
    ['D-030', (state: GameState) => { state.run.depth.unlocked.push('D-030'); }],
    ['advanced equipment', (state: GameState) => { state.run.tool.level = 2; state.run.tool.name = 'Steel Pickaxe'; }],
  ])('suppresses the guide for %s progress', (_name, advance) => {
    const state = createGameState(12006);
    advance(state);
    expect(isInitialLogisticsGuideEligible(state)).toBe(false);
    expect(deriveInitialLogisticsGuide(state)).toBeNull();
  });

  it('recognizes only the live first Scrap gain as the completion notice', () => {
    const state = createGameState(12007);
    const first = event(10, 6);
    state.eventHistory.push(first);
    state.run.stats.elevatorTrips = 1;
    expect(isFirstLiveScrapGain(state, first)).toBe(true);

    const second = event(20, 4);
    state.eventHistory.push(second);
    state.run.stats.elevatorTrips = 2;
    expect(isFirstLiveScrapGain(state, second)).toBe(false);

    const restored = restoreGameState(serializeGameState(state))!;
    expect(restored.events).toEqual([]);
    expect(isInitialLogisticsGuideEligible(restored)).toBe(false);
  });
});

function arrivedAtScrapLedge(): GameState {
  const state = createGameState(12002);
  selectNode(state, 'scrap-ledge');
  for (let index = 0; index < 600 && state.run.character.state !== 'MINING'; index += 1) updateGame(state, 1 / 60);
  expect(state.run.character.state).toBe('MINING');
  return state;
}

function summary(state: GameState): [string, string, string] | null {
  const guide = deriveInitialLogisticsGuide(state);
  if (!guide) return null;
  const target = guide.target.kind === 'character'
    ? 'character'
    : 'id' in guide.target.ref ? `${guide.target.ref.type}:${guide.target.ref.id}` : guide.target.ref.type;
  return [guide.step, guide.label, target];
}

function loot(id = 'cargo-1', weight = 2): LootStack {
  return {
    id,
    kind: 'STONE',
    name: 'Stone',
    rarity: 'COMMON',
    category: 'ORE',
    weight,
    value: 2,
    dataValue: 0,
    coreValue: 0,
    x: currentFloor(createGameState(1)).nodes[0]!.x,
    y: 201,
  };
}

function event(id: number, amount: number): GameEvent {
  return { id, type: 'RESOURCE_GAIN', at: id, data: { resource: 'Scrap', amount, total: amount } };
}
