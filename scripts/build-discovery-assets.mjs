/** Rasterize the editable palette-index pixel sheets. Node built-ins only.
 * No source generation, randomness, image resizing or simulation state here.
 * Runtime loads the checked-in PNGs; this is an authoring/verification command.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const source = JSON.parse(readFileSync(resolve(root, 'art/d001/discovery-sprites.json'), 'utf8'));
const palette = Object.fromEntries(Object.entries(source.palette).map(([key, color]) => [key,
  [...color.slice(1).match(/../g).map((hex) => parseInt(hex, 16)), ...(color.length === 7 ? [255] : [])]]));
const crcTable = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type); let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}
for (const [name, sheet] of Object.entries(source.sheets)) {
  const [cw, ch] = sheet.cell; const width = cw * sheet.columns;
  const height = ch * Math.ceil(sheet.frames.length / sheet.columns);
  const rgba = Buffer.alloc(width * height * 4); const names = new Set();
  sheet.frames.forEach((frame, index) => {
    if (names.has(frame.name) || frame.pixels.length !== ch) throw new Error(`${name}: invalid frame ${frame.name}`);
    names.add(frame.name);
    frame.pixels.forEach((row, y) => {
      if (row.length !== cw) throw new Error(`${name}: invalid row width`);
      [...row].forEach((key, x) => {
        const color = palette[key];
        if (!color || color.length !== 4 || ![0, 255].includes(color[3])) throw new Error(`${name}: invalid pixel ${key}`);
        rgba.set(color, ((Math.floor(index / sheet.columns) * ch + y) * width + index % sheet.columns * cw + x) * 4);
      });
    });
  });
  const scanlines = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rgba.copy(scanlines, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  const path = resolve(root, 'public/assets/d001/runtime', `${name}.png`);
  if (process.argv.includes('--check')) {
    if (!png.equals(readFileSync(path))) throw new Error(`${name}: PNG differs from editable pixels. Run npm run assets:discoveries.`);
  } else writeFileSync(path, png);
  console.log(`${name}: ${sheet.frames.length} cells, ${width}x${height}, ${png.length} bytes`);
}
