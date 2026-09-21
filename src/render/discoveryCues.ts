import type { GameState } from '../game/types';
import type { nodeDiscoveryCue } from '../game/prospecting';
import type { SemanticRenderState } from './semanticRenderState';
import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';
import { drawDiscoveryArt, type TraceFrame } from './assets/discoveryArt';

/** A nearly extracted image is a view of remaining work, not another progression state. */
export function discoveryFrame(cue: NonNullable<ReturnType<typeof nodeDiscoveryCue>>): TraceFrame {
  const signal = { METAL: 'metal', FOSSIL: 'fossil', RESEARCH: 'research' }[cue.signal] as 'metal' | 'fossil' | 'research';
  const stage = cue.stage === 'SPENT' ? 'spent' : cue.stage === 'SEALED' ? 'sealed' : cue.remaining === 1 ? 'nearly' : 'exposed';
  return `${signal}-${stage}`;
}

/** Persistent, non-animated motherrock. Draw between the rock and actors, not over their bodies. */
export function drawDiscoveryCues(ctx: CanvasRenderingContext2D, state: GameState, semantic: SemanticRenderState): void {
  const floor = state.run.floors[state.run.depth.current];
  for (const node of floor.nodes) {
    const cue = semantic.discoveries.get(node.id);
    if (!cue) continue;
    const x = Math.round(node.x) - 12;
    const y = Math.round(node.y) - 27 + (floor.id === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0);
    drawDiscoveryArt(ctx, 'traces', discoveryFrame(cue), x, y);
  }
}
