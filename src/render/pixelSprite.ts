/** Authored pixel rows, compiled once into opaque horizontal runs. No clock, RNG or asset loading. */
export interface PixelSprite {
  readonly width: number;
  readonly height: number;
  readonly rows: readonly string[];
  readonly runs: readonly { x: number; y: number; width: number; color: string }[];
}

export function pixelSprite(rows: readonly string[], palette: Readonly<Record<string, string>>): PixelSprite {
  const width = rows[0]?.length ?? 0;
  if (!width || rows.some((row) => row.length !== width)) throw new Error('Pixel sprite rows must have equal, nonzero widths.');
  const runs: { x: number; y: number; width: number; color: string }[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < width;) {
      const key = row[x]!; const start = x;
      while (x < width && row[x] === key) x++;
      if (key === '.') continue;
      const color = palette[key];
      if (!color) throw new Error(`Missing pixel color: ${key}`);
      runs.push({ x: start, y, width: x - start, color });
    }
  });
  return { width, height: rows.length, rows, runs };
}

export function drawPixelSprite(ctx: CanvasRenderingContext2D, sprite: PixelSprite, x: number, y: number, scale = 1): void {
  const size = Math.max(1, Math.floor(scale)); const left = Math.round(x); const top = Math.round(y);
  ctx.save();
  for (const run of sprite.runs) {
    ctx.fillStyle = run.color;
    ctx.fillRect(left + run.x * size, top + run.y * size, run.width * size, size);
  }
  ctx.restore();
}
