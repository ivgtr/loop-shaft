/** Derive optional recovered-tool layers from the existing, reviewed pose masks.
 * ImageMagick is an art-authoring dependency only. Does not modify the source atlases.
 * Banks: ordinary recovered / fossil / light / survey. Same handles and frame positions.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const dir = join(root, 'public/assets/d001/runtime');
const masks = JSON.parse(readFileSync(join(root, 'art/d001/generation-spec.json'), 'utf8')).playerOwnership.toolMasks;
const src = execFileSync('magick', [join(dir, 'player-tool-atlas.png'), '-crop', '320x320+320+0', '+repage', '-depth', '8', 'rgba:-']);
if (src.length !== 320 * 320 * 4) throw new Error('Unexpected tool atlas dimensions.');
const output = Buffer.alloc(1280 * 320 * 4);
const ink = (hex) => [...Buffer.from(hex.slice(1), 'hex'), 255];
const colors = [
  ['#43413e', '#655b4f', '#b8a795'], ['#715a4d', '#b18b67', '#b8a795'],
  ['#43413e', '#655b4f', '#b8a795'], ['#43413e', '#3f7070', '#72afb3'],
].map((bank) => bank.map(ink));
const at = (x, y) => src.subarray((y * 320 + x) * 4, (y * 320 + x) * 4 + 4);
const put = (bank, x, y, color) => output.set(color, (y * 1280 + bank * 320 + x) * 4);
for (let bank = 0; bank < 4; bank++) {
  for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) put(bank, x, y, at(x, y));
  for (const [clip, frames] of Object.entries(masks.headRects)) {
    const row = masks.rows[clip];
    frames.forEach(([rx, ry, w, h], frame) => {
      const x0 = frame * 40 + rx, y0 = row * 40 + ry;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
        const p = at(x, y);
        if (!p[3]) continue;
        const luminance = (p[0] + p[1] + p[2]) / 3;
        if (luminance < 35) continue; // Keep the existing opaque outline and handle ownership.
        const band = luminance > 120 ? 2 : luminance > 75 ? 1 : 0;
        put(bank, x, y, colors[bank][band]);
        if (bank === 1 && y + 1 < y0 + h && !at(x, y + 1)[3]) put(bank, x, y + 1, colors[bank][0]);
        if (bank === 2 && y > y0 + h / 2 && !at(x, y + 1)[3]) put(bank, x, y, [0, 0, 0, 0]);
        if (bank === 3 && (x - x0 + y - y0) % 4 === 0) put(bank, x, y, colors[bank][2]);
      }
    });
  }
}
execFileSync('magick', ['-size', '1280x320', '-depth', '8', 'rgba:-', '-type', 'PaletteAlpha', '-strip',
  '-define', 'png:compression-level=9', join(dir, 'player-recovered-tools-atlas.png')], { input: output });
console.log('Wrote player-recovered-tools-atlas.png (4 banks, original handles and mining poses).');
