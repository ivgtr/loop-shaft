import type { GameState } from '../game/types';
import { DISCOVERY_ART } from './discoveryArt';
import { drawPixelSprite } from './pixelSprite';
import type { SemanticRenderState } from './semanticRenderState';
import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';

/** Draw with the rock layer, behind workers/cargo. Ordinary rock regeneration never resets a clue. */
export function drawDiscoveryCues(ctx: CanvasRenderingContext2D, state: GameState, semantic: SemanticRenderState): void {
  const floor = state.run.floors[state.run.depth.current];
  ctx.save();
  for (const node of floor.nodes) {
    const cue = semantic.discoveries.get(node.id);
    if (!cue) continue;
    const x = Math.round(node.x - 10);
    const y = Math.round(node.y - 30 + (floor.id === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0));
    drawPixelSprite(ctx, DISCOVERY_ART[cue.signal][cue.stage], x, y);
    if (cue.stage === 'SPENT') continue;
    // Small cuts are work remaining, not a timer or a new progress state.
    for (let i = 0; i < cue.remaining; i++) {
      ctx.fillStyle = '#211e20'; ctx.fillRect(x + 5 + i * 4, y + 16, 3, 3);
      ctx.fillStyle = '#e2cea0'; ctx.fillRect(x + 6 + i * 4, y + 17, 1, 1);
    }
  }
  ctx.restore();
}
