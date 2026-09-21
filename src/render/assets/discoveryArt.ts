import source from '../../../art/discovery/sprites.json';
import tracesUrl from './discovery-traces.png';
import cargoUrl from './discovery-cargo.png';
import { AssetStore } from './assetStore';

type Bank = 'traces' | 'cargo';
export type TraceFrame = keyof typeof source.traces.frames;
export type CargoFrame = keyof typeof source.cargo.frames;
type Frames = { traces: TraceFrame; cargo: CargoFrame };
type Span = { x: number; y: number; width: number; ink: string };
type Frame = { x: number; y: number; width: number; height: number; spans: readonly Span[] };

export const discoveryAssets = new AssetStore<Bank>({ traces: tracesUrl, cargo: cargoUrl });

// Compile immutable row spans once. They are also the exact loading/error fallback;
// selecting an image never creates another gameplay state or advances a random stream.
function compile(bank: Bank): Map<string, Frame> {
  const { width, height, columns, frames } = source[bank];
  const palette: Readonly<Record<string, string | null>> = source.palette;
  return new Map(Object.entries(frames).map(([name, rows], index) => {
    const spans: Span[] = [];
    rows.forEach((row, y) => {
      for (let x = 0; x < width;) {
        const symbol = row[x]!;
        let end = x + 1;
        while (end < width && row[end] === symbol) end++;
        const ink = palette[symbol];
        if (ink) spans.push({ x, y, width: end - x, ink });
        x = end;
      }
    });
    return [name, { x: (index % columns) * width, y: Math.floor(index / columns) * height, width, height, spans }];
  }));
}
const compiled = { traces: compile('traces'), cargo: compile('cargo') };

export function drawDiscoveryArt<B extends Bank>(
  ctx: CanvasRenderingContext2D, bank: B, key: Frames[B], x: number, y: number,
  assets: AssetStore<Bank> = discoveryAssets,
): void {
  const frame = compiled[bank].get(key);
  if (!frame) return;
  const dx = Math.round(x); const dy = Math.round(y);
  const image = assets.ready(bank);
  if (image) {
    ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, dx, dy, frame.width, frame.height);
    return;
  }
  ctx.save();
  for (const span of frame.spans) {
    ctx.fillStyle = span.ink;
    ctx.fillRect(dx + span.x, dy + span.y, span.width, 1);
  }
  ctx.restore();
}
