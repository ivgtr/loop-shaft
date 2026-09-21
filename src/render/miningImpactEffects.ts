import type { GameEvent, GameState } from '../game/types';
import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';

type Impact = { x: number; y: number; startedAt: number };
const LIFETIME = 260;
const OFFSETS = [[-8, -4], [-4, -8], [3, -7], [7, -3], [10, -6]] as const;

/** Transient presentation only: never saved, and never inferred from a worker's idle animation. */
export class MiningImpactEffects {
  private run: GameState['run'] | null = null;
  private depth: string | null = null;
  private impacts: Impact[] = [];
  private shakeUntil = 0;

  private sync(state: GameState, now: number): void {
    if (this.run !== state.run || this.depth !== state.run.depth.current || state.run.elevator.travel) {
      this.impacts = [];
      this.shakeUntil = 0;
    }
    this.run = state.run;
    this.depth = state.run.depth.current;
    this.impacts = this.impacts.filter((fx) => now >= fx.startedAt && now - fx.startedAt < LIFETIME);
  }

  hit(event: GameEvent, state: GameState, now: number): void {
    this.sync(state, now);
    if (event.type !== 'MINER_SWING_HIT' || state.run.elevator.travel || event.data?.depth !== state.run.depth.current) return;
    const node = state.run.floors[state.run.depth.current].nodes.find((candidate) => candidate.id === event.data?.nodeId);
    if (!node || !(Number(event.data?.damage) > 0)) return;
    const ground = state.run.depth.current === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0;
    this.impacts.push({ x: Math.round(node.x), y: Math.round(node.y) + ground - 8, startedAt: now });
    this.impacts = this.impacts.slice(-16);
    this.shakeUntil = now + 110;
  }

  shake(state: GameState, now: number): number {
    this.sync(state, now);
    return now < this.shakeUntil ? (Math.floor(now / 28) % 2 === 0 ? 1 : -1) : 0;
  }

  pixels(now: number): readonly { x: number; y: number }[] {
    return this.impacts.filter((fx) => now >= fx.startedAt && now - fx.startedAt < LIFETIME).flatMap((fx) => {
      const age = (now - fx.startedAt) / LIFETIME;
      return OFFSETS.map(([ox, oy], index) => ({
        x: Math.round(fx.x + ox * age),
        y: Math.round(fx.y + oy * age + 12 * age * age + index % 2),
      }));
    });
  }
}
