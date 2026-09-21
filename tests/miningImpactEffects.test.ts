import { describe, expect, it } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { MiningImpactEffects } from '../src/render/miningImpactEffects';
import type { GameEvent, GameState } from '../src/game/types';
import { selectNode, requestMine, updateGame, drainEvents } from '../src/game/simulation';

const hit = (state: GameState): GameEvent => ({ id: 1, at: 0, type: 'MINER_SWING_HIT', data: { nodeId: state.run.floors[state.run.depth.current].nodes[0]!.id, depth: state.run.depth.current, damage: 1 } });
describe('visible, finite mining impacts', () => {
  it('anchors chips to the D001 art ground and expires both chips and shake', () => {
    const state = createGameState(1); const effects = new MiningImpactEffects(); effects.hit(hit(state), state, 100);
    const node = state.run.floors['D-001'].nodes[0]!;
    expect(effects.pixels(100)[0]).toEqual({ x: node.x, y: node.y + 13 - 8 });
    expect(Math.abs(effects.shake(state, 150))).toBe(1);
    expect(effects.shake(state, 211)).toBe(0); expect(effects.pixels(360)).toHaveLength(0);
  });
  it('does not shake for offscreen crew, unknown sites, zero damage or idle state events', () => {
    const state = createGameState(2); const effects = new MiningImpactEffects(); const event = hit(state);
    for (const altered of [
      { ...event, data: { ...event.data, depth: 'D-030', crewId: 'remote-miner' } },
      { ...event, data: { ...event.data, nodeId: 'missing' } },
      { ...event, data: { ...event.data, damage: 0 } },
      { ...event, type: 'MINER_SWING_START' as const },
    ]) effects.hit(altered, state, 0);
    expect(effects.pixels(10)).toHaveLength(0); expect(effects.shake(state, 10)).toBe(0);
  });
  it('clears on travel, arrival, restored run and reboot, and uses later-floor ground without D001 offset', () => {
    const state = createGameState(3); const effects = new MiningImpactEffects(); effects.hit(hit(state), state, 0);
    state.run.depth.current = 'D-030'; expect(effects.shake(state, 10)).toBe(0); expect(effects.pixels(10)).toHaveLength(0);
    effects.hit(hit(state), state, 20); const node = state.run.floors['D-030'].nodes[0]!;
    expect(effects.pixels(20)[0]).toEqual({ x: node.x, y: node.y - 8 });
    state.run.elevator.travel = { from: 'D-030', to: 'D-001', remaining: 1, duration: 2, viaSurface: false };
    effects.hit(hit(state), state, 30); expect(effects.pixels(30)).toHaveLength(0);
    state.run.elevator.travel = null; effects.hit(hit(state), state, 40);
    state.run = createGameState(4).run; expect(effects.shake(state, 50)).toBe(0); expect(effects.pixels(50)).toHaveLength(0);
  });
  it('bounds dense simultaneous hits and ignores backward timestamps', () => {
    const state = createGameState(5); const effects = new MiningImpactEffects();
    for (let i = 0; i < 1000; i++) effects.hit({ ...hit(state), id: i }, state, 100);
    expect(effects.pixels(110)).toHaveLength(16 * 5); expect(effects.pixels(99)).toHaveLength(0);
  });
  it('receives depth from a real player swing instead of guessing the currently viewed floor', () => {
    const state = createGameState(6); const node = state.run.floors['D-001'].nodes[0]!;
    state.run.character.x = node.x + 13; selectNode(state, node.id);
    for (let i = 0; i < 20; i++) updateGame(state, 0.1);
    requestMine(state); for (let i = 0; i < 10; i++) updateGame(state, 0.1);
    const events = drainEvents(state).filter((event) => event.type === 'MINER_SWING_HIT');
    expect(events).not.toHaveLength(0); expect(events.every((event) => event.data?.depth === 'D-001')).toBe(true);
  });
});
