import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { MiningImpactEffects } from '../src/render/miningImpactEffects';
import { miningContact } from '../src/render/workEquipment';
import type { GameEvent, GameState } from '../src/game/types';
import { selectNode, requestMine, updateGame, drainEvents } from '../src/game/simulation';

const hit = (state: GameState): GameEvent => ({ id: 1, at: 0, type: 'MINER_SWING_HIT', data: { nodeId: state.run.floors[state.run.depth.current].nodes[0]!.id, depth: state.run.depth.current, damage: 1 } });
describe('visible, finite mining impacts', () => {
  it('keeps chips on the equipped tool contact from both sides and expires chips and shake', () => {
    const state = createGameState(1); const node = state.run.floors['D-001'].nodes[0]!;
    for (const facing of [-1, 1] as const) {
      Object.assign(state.run.character, { targetNodeId: node.id, facing, x: node.x - facing * 16 });
      const effects = new MiningImpactEffects(); effects.hit(hit(state), state, 100);
      expect(effects.pixels(100)[0]).toEqual({ x: node.x - facing * 3, y: node.y + 13 - 12 });
      expect(effects.pixels(100)[0]).toEqual(miningContact(state));
      expect(effects.shake(state, 150)).toBe(0);
      effects.hit({ ...hit(state), type: 'NODE_BREAK' }, state, 100);
      expect(Math.abs(effects.shake(state, 150))).toBe(1);
      expect(effects.shake(state, 211)).toBe(0); expect(effects.pixels(360)).toHaveLength(0);
    }
  });
  it('ignores remote, unidentified, invalid and non-damaging hits but retains visible crew impacts', () => {
    const state = createGameState(2); const effects = new MiningImpactEffects(); const event = hit(state);
    for (const data of [
      { ...event.data, depth: 'D-030', crewId: 'remote-miner' },
      { ...event.data, depth: undefined }, { ...event.data, nodeId: 'missing' },
      ...[0, -1, Infinity, NaN].map(damage => ({ ...event.data, damage })),
    ]) effects.hit({ ...event, data }, state, 0);
    effects.hit({ ...event, type: 'MINER_SWING_START' }, state, 0);
    expect(effects.pixels(10)).toHaveLength(0); expect(effects.shake(state, 10)).toBe(0);
    effects.hit({ ...event, data: { ...event.data, crewId: 'local-miner' } }, state, 20);
    const node = state.run.floors['D-001'].nodes[0]!;
    expect(effects.pixels(20)[0]).toEqual({ x: node.x, y: node.y + 13 - 8 });
  });
  it('clears on travel, arrival, restored run and reboot, without leaking the D001 ground offset', () => {
    const state = createGameState(3); const effects = new MiningImpactEffects(); effects.hit(hit(state), state, 0);
    state.run.depth.current = 'D-030'; expect(effects.shake(state, 10)).toBe(0); expect(effects.pixels(10)).toHaveLength(0);
    const node = state.run.floors['D-030'].nodes[0]!;
    Object.assign(state.run.character, { x: node.x - 13, facing: 1 });
    effects.hit(hit(state), state, 20);
    expect(effects.pixels(20)[0]).toEqual({ x: node.x, y: node.y - 12 });
    state.run.elevator.travel = { from: 'D-030', to: 'D-001', remaining: 1, duration: 2, viaSurface: false };
    effects.hit(hit(state), state, 30); expect(effects.pixels(30)).toHaveLength(0);
    state.run.elevator.travel = null; effects.hit(hit(state), state, 40);
    state.run = createGameState(4).run; expect(effects.shake(state, 50)).toBe(0); expect(effects.pixels(50)).toHaveLength(0);
    effects.hit(hit(state), state, 60);
    effects.hit({ id: 2, at: 0, type: 'REBOOT_COMMITTED' }, state, 70);
    expect(effects.shake(state, 70)).toBe(0); expect(effects.pixels(70)).toHaveLength(0);
  });
  it('bounds simultaneous hits and resets both effects when the rendering clock goes backward', () => {
    const state = createGameState(5); const effects = new MiningImpactEffects();
    for (let i = 0; i < 1000; i++) effects.hit({ ...hit(state), id: i }, state, 100);
    expect(effects.pixels(110)).toHaveLength(16 * 5);
    expect(effects.shake(state, 99)).toBe(0); expect(effects.pixels(99)).toHaveLength(0);
    expect(effects.shake(state, 150)).toBe(0); expect(effects.pixels(150)).toHaveLength(0);
  });
  it('receives depth and contact from a real player swing, not the rendered floor by default', () => {
    const state = createGameState(6); const node = state.run.floors['D-001'].nodes[0]!;
    state.run.character.x = node.x + 13; selectNode(state, node.id);
    for (let i = 0; i < 20; i++) updateGame(state, .1);
    drainEvents(state); requestMine(state);
    const effects = new MiningImpactEffects(); const events: GameEvent[] = [];
    for (let i = 0; i < 10; i++) {
      updateGame(state, .05);
      for (const event of drainEvents(state)) {
        events.push(event);
        effects.hit(event, state, i * 50);
        if (event.type === 'MINER_SWING_HIT') expect(effects.pixels(i * 50)[0]).toEqual(miningContact(state));
      }
    }
    for (const type of ['MINER_SWING_START', 'MINER_SWING_HIT', 'NODE_DAMAGE']) {
      const matching = events.filter(event => event.type === type);
      expect(matching.length).toBeGreaterThan(0);
      expect(matching.every(event => event.data?.depth === 'D-001')).toBe(true);
    }
  });
});
