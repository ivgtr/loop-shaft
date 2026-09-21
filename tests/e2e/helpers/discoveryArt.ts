import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../../../art/discovery/sprites.json', import.meta.url), 'utf8'));

/** Observe real drawImage calls on the live world canvas, not a debug semantic attribute. */
export async function observeDiscoveryArt(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const record = window as unknown as { discoverySprites: string[] }; record.discoverySprites = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: Parameters<typeof draw>) {
      const image = args[0];
      if (this.canvas.classList.contains('game-canvas') && image instanceof HTMLImageElement && args.length === 9) {
        const bank = image.src.includes('discovery-traces.png') ? 'traces' : image.src.includes('discovery-cargo.png') ? 'cargo' : null;
        if (bank) {
          const key = `${bank}:${args[1]}:${args[2]}`;
          if (!record.discoverySprites.includes(key)) record.discoverySprites.push(key);
        }
      }
      return draw.apply(this, args);
    };
  });
}
export async function expectDiscoveryArt(page: Page, bank: 'traces' | 'cargo', key: string): Promise<void> {
  const definition = source[bank]; const index = Object.keys(definition.frames).indexOf(key);
  expect(index, `Unknown ${bank} frame: ${key}`).toBeGreaterThanOrEqual(0);
  const expected = `${bank}:${(index % definition.columns) * definition.width}:${Math.floor(index / definition.columns) * definition.height}`;
  await expect.poll(() => page.evaluate(() => (window as unknown as { discoverySprites: string[] }).discoverySprites)).toContain(expected);
}
