import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { appraisePhysicalCargo } from '../src/game/appraisal';
import { cargoEffect, cargoTransfer } from '../src/game/cargoFeedback';
import { shipmentNotice, APPRAISAL_TIMING } from '../src/game/shipmentFeedback';
import { rewardNotes, transportNotes } from '../src/game/rewardSounds';
import { RewardNoticeQueue } from '../src/game/rewardFeedback';
import { WorkFeedback } from '../src/game/workFeedback';
import { drainEvents, sendElevator, updateGame, upgradeTool, upgradeBoots } from '../src/game/simulation';
import { processPhase5Events } from '../src/game/phase5';
import { loot, specimenGame } from './fixtures/discovery';
import type { GameEvent, GameState } from '../src/game/types';

const event = (type: GameEvent['type'], data: NonNullable<GameEvent['data']> = {}, id = 1): GameEvent => ({ id, type, at: 0, data });
const frame = (state: GameState) => { const base = drainEvents(state); processPhase5Events(state, base); return [...base, ...drainEvents(state)]; };

describe('shipment and completed work feedback', () => {
  it('selects short handling motifs from public cargo only and aggregates a mixed transfer once', () => {
    const sealed = specimenGame().run.elevator.cargo[0]!;
    const hidden = { ...sealed, kind: 'BLACK_GLASS_HEART' as const, value: 99999, rarity: 'ANOMALY' as const,
      specimen: { ...sealed.specimen!, kind: 'STRANGE_VERTEBRA' as const, grade: 'PRISTINE' as const } };
    expect(cargoEffect([sealed])).toBe('fossil');
    expect(cargoEffect([hidden])).toBe('fossil');
    expect(cargoEffect([{ ...loot('GEM'), equipmentSeed: 1 }])).toBe('find');
    expect(cargoEffect([{ ...loot('BLACK_GLASS_HEART'), equipmentSeed: 999 }])).toBe('find');
    const items = [loot('IRON'), loot('NATURAL_GOLD')];
    expect(cargoTransfer('DEPOSIT', 'PLAYER', 'D-001', items, 240)).toMatchObject({ items: 2, effect: 'metal', stage: 'DEPOSIT' });
    expect(cargoEffect(items)).toBe(cargoEffect([...items].reverse()));
    expect(transportNotes('metal', false)).not.toEqual(transportNotes('gem', false));
    expect(transportNotes('metal', true).every(note => note.duration <= .13 && note.gain < .04)).toBe(true);
  });

  it('credits a physical central shipment once, then presents its best appraisal without changing state or RNG', () => {
    const state = specimenGame(); const sealed = state.run.elevator.cargo[0]!;
    state.run.elevator.cargo.push(loot('IRON', 'ore'), loot('NATURAL_GOLD', 'gold'));
    frame(state); const initial = state.run.scrap;
    expect(sendElevator(state)).toBe(true);
    let batch: GameEvent[] = []; let receipts = 0;
    for (let i = 0; i < 250; i++) {
      updateGame(state, .1); const events = frame(state);
      const received = events.filter(e => e.type === 'SHIPMENT_APPRAISED');
      if (received.length) { receipts += received.length; batch = events; }
      else if (!receipts) expect(state.run.scrap).toBe(initial);
    }
    expect(receipts).toBe(1);
    const receipt = batch.find(e => e.type === 'SHIPMENT_APPRAISED')!;
    expect(receipt.data).toMatchObject({ shipmentId: `CENTRAL:${sealed.id}`, items: 3 });
    const before = JSON.stringify(state); const notice = shipmentNotice(receipt, batch)!;
    expect(notice.shipment?.highlight?.effect).toBe('specimen');
    expect(notice.shipment?.ordinary).toBeGreaterThan(0);
    expect(notice.shipment!.ordinary + notice.shipment!.special).toBe(state.run.scrap - initial);
    expect(rewardNotes(notice).filter(note => note.at === APPRAISAL_TIMING.grade / 1000)).toHaveLength(2);
    const queue = new RewardNoticeQueue(); queue.push(notice, 0); queue.push(notice, 1);
    expect(queue.at(3200)).toBeNull();
    expect(JSON.stringify(state)).toBe(before);
  });

  it('keeps simultaneous central and freight batches separate, including deferred equipment results', () => {
    const state = createGameState(27); const events: GameEvent[] = [];
    const sink = (type: GameEvent['type'], data: NonNullable<GameEvent['data']>) => events.push(event(type, data, events.length));
    appraisePhysicalCargo(state, [loot('IRON', 'central')], sink);
    appraisePhysicalCargo(state, [loot('GEM', 'freight')], sink, 'FREIGHT');
    events.push(event('EQUIPMENT_APPRAISED', { shipmentId: 'CENTRAL:central', id: 'gear', name: 'Survey Pick', first: true, benefit: 'Research weight +15%' }, 80));
    const receipts = events.filter(e => e.type === 'SHIPMENT_APPRAISED').map(e => shipmentNotice(e, events)!);
    expect(receipts).toHaveLength(2);
    expect(receipts[0]?.shipment?.highlight).toMatchObject({ effect: 'equipment', benefit: 'Research weight +15%' });
    expect(receipts[1]?.shipment?.highlight?.effect).toBe('gem');
    expect(receipts[1]?.shipment?.items).toBe(1);
    const size = events.length; appraisePhysicalCargo(state, [], sink); expect(events).toHaveLength(size);
  });

  it('arms equipment through a real upgrade, acknowledges a real hit once, and preserves it behind a find', () => {
    const state = createGameState(4); state.run.scrap = 10000;
    const feedback = new WorkFeedback(); expect(upgradeTool(state)).toBe(true);
    for (const e of drainEvents(state)) expect(feedback.handle(e, state)).toEqual([]);
    expect(feedback.handle(event('MINER_SWING_START'), state)).toEqual([]);
    expect(feedback.handle(event('MINER_SWING_HIT', { damage: 0 }), state)).toEqual([]);
    const first = feedback.handle(event('MINER_SWING_HIT', { damage: 3, depth: 'D-001' }), state);
    expect(first).toHaveLength(1); expect(first[0]?.detail).toContain('3 DAMAGE');
    expect(feedback.handle(event('MINER_SWING_HIT', { damage: 3 }), state)).toEqual([]);
    const queue = new RewardNoticeQueue(); queue.push(first[0]!, 0);
    queue.push({ key: 'valuable', label: 'GEM', detail: '', priority: 3, duration: 1000 }, 0);
    expect(queue.at(1000)?.key).toBe(first[0]!.key);
    expect(queue.at(2500)).toBeNull();
  });

  it('requires actual movement and never treats floor travel or loading a save as first use', () => {
    const state = createGameState(4); state.run.scrap = 10000;
    const feedback = new WorkFeedback(); expect(upgradeBoots(state)).toBe(true);
    for (const e of drainEvents(state)) feedback.handle(e, state);
    expect(feedback.movement(state)).toBeNull();
    state.run.depth.current = 'D-030'; state.run.character.x += 80; state.run.character.state = 'MOVING_TO_POINT';
    expect(feedback.movement(state)).toBeNull();
    state.run.character.x += 5;
    expect(feedback.movement(state)?.detail).toContain('FIRST WALK');
    expect(feedback.movement(state)).toBeNull();
    expect(new WorkFeedback().movement(state)).toBeNull();
  });

  it('acknowledges automation only after successful work and the matching automatic shipment', () => {
    const state = createGameState(); const feedback = new WorkFeedback();
    expect(feedback.handle(event('AUTOMATION_UNLOCKED', { automation: 'AUTO_SWING' }), state)).toEqual([]);
    feedback.handle(event('AUTO_SWING_TRIGGER', { nodeId: 'rock' }), state);
    feedback.handle(event('MINER_SWING_START', { crewId: 'crew', nodeId: 'other-rock' }), state);
    expect(feedback.handle(event('MINER_SWING_HIT', { nodeId: 'rock', damage: 0 }), state)).toEqual([]);
    expect(feedback.handle(event('MINER_SWING_HIT', { nodeId: 'rock', damage: 2 }), state)[0]?.label).toBe('AUTO SWING WORKING');
    expect(feedback.handle(event('MINER_SWING_HIT', { nodeId: 'rock', damage: 2 }), state)).toEqual([]);
    feedback.handle(event('PORTER_UNLOCKED'), state);
    expect(feedback.handle(event('PORTER_PICKUP', { items: 1 }), state)).toEqual([]);
    expect(feedback.handle(event('PORTER_DEPOSIT', { items: 0 }), state)).toEqual([]);
    expect(feedback.handle(event('PORTER_DEPOSIT', { items: 1 }), state)).toHaveLength(1);
    feedback.handle(event('AUTOMATION_UNLOCKED', { automation: 'AUTO_DISPATCH' }), state);
    feedback.handle(event('AUTO_DISPATCH_TRIGGER', { shipmentId: 'CENTRAL:auto' }), state);
    expect(feedback.handle(event('SHIPMENT_APPRAISED', { shipmentId: 'CENTRAL:manual' }), state)).toEqual([]);
    expect(feedback.handle(event('SHIPMENT_APPRAISED', { shipmentId: 'CENTRAL:auto' }), state)[0]?.label).toBe('AUTO DISPATCH WORKING');
    expect(new WorkFeedback().handle(event('PORTER_DEPOSIT', { items: 1 }), state)).toEqual([]);
  });
});
