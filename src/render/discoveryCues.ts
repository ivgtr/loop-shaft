import type { D001AssetStore } from './d001ImageRenderer';
import { discoveryHostFrame, DISCOVERY_ATLAS } from './discoveryVisuals';
import type { GameState, LootStack } from '../game/types';
import type { SemanticRenderState } from './semanticRenderState';
import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';

/** Persistent host rocks are painted before actors. Original markings are load-error fallbacks only. */
export function drawDiscoveryCues(ctx: CanvasRenderingContext2D, state: GameState, semantic: SemanticRenderState, assets?: D001AssetStore): void {
  const floor = state.run.floors[state.run.depth.current];
  ctx.save();
  for (const node of floor.nodes) {
    const cue = semantic.discoveries.get(node.id);
    if (!cue) continue;
    const image = assets?.ready('discoveryHost');
    if (image) {
      const cell = DISCOVERY_ATLAS.host; const frame = discoveryHostFrame(cue);
      const offset = floor.id === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0;
      ctx.drawImage(image, frame % cell.columns * cell.width, Math.floor(frame / cell.columns) * cell.height,
        cell.width, cell.height, Math.round(node.x) - cell.anchorX, Math.round(node.y) + offset - cell.anchorY, cell.width, cell.height);
      continue;
    }
    const x = Math.round(node.x - 4);
    const y = Math.round(node.y - 23 + (floor.id === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0));
    // Keep the landmark visible while ordinary rock regenerates. Spent clues cannot look active.
    if (cue.stage === 'SPENT') {
      ctx.fillStyle = '#625b50'; ctx.fillRect(x, y + 7, 9, 1); ctx.fillRect(x + 6, y + 4, 1, 3);
      continue;
    }
    ctx.fillStyle = '#201e1b'; ctx.fillRect(x - 2, y - 2, 13, 13);
    ctx.fillStyle = cue.stage === 'EXPOSED' ? '#e7dab1' : '#b2a286';
    if (cue.signal === 'METAL') {
      for (const [dx, dy] of [[0, 1], [5, 0], [3, 5]]) { ctx.fillRect(x + dx!, y + dy!, 3, 2); }
    } else if (cue.signal === 'FOSSIL') {
      ctx.fillRect(x, y, 8, 1); ctx.fillRect(x, y + 1, 1, 6); ctx.fillRect(x, y + 7, 8, 1);
      ctx.fillRect(x + 7, y + 1, 1, 7); ctx.fillRect(x + 3, y + 3, 4, 1); ctx.fillRect(x + 3, y + 3, 1, 3);
    } else {
      for (let row = 0; row < 3; row++) ctx.fillRect(x + row * 2, y + row * 3, 8 - row * 2, 1);
    }
    if (cue.stage === 'EXPOSED') { ctx.fillRect(x - 3, y + 3, 1, 5); ctx.fillRect(x + 11, y, 1, 5); }
    for (let i = 0; i < cue.remaining; i++) ctx.fillRect(x + i * 4, y + 12, 2, 2);
  }
  ctx.restore();
}

/** The same mark follows physical cargo through ground, carriers, lift and freight. */
export function drawCargoMark(ctx: CanvasRenderingContext2D, item: Pick<LootStack, 'quality' | 'specimen'>, anchorX: number, anchorY: number): void {
  if (!item.specimen && (!item.quality || item.quality === 'NORMAL')) return;
  const x = Math.round(anchorX); const y = Math.round(anchorY);
  ctx.save();
  if (item.specimen) {
    ctx.fillStyle = '#292b29'; ctx.fillRect(x + 2, y - 9, 5, 7);
    ctx.fillStyle = '#dfd0ae'; ctx.fillRect(x + 3, y - 8, 3, 1); ctx.fillRect(x + 5, y - 7, 1, 2);
    ctx.fillRect(x + 4, y - 5, 1, 1); ctx.fillRect(x + 4, y - 3, 1, 1);
  } else {
    ctx.fillStyle = '#f0dfae'; ctx.fillRect(x - 3, y - 7, 2, 3);
    if (item.quality === 'PURE') ctx.fillRect(x + 1, y - 7, 2, 3);
  }
  ctx.restore();
}
