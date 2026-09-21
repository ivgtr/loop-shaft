import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = JSON.parse(readFileSync(resolve(root, 'art/discovery/sprites.json'), 'utf8'));
const check = process.argv.includes('--check');

// Native, deterministic RGBA PNG output; no image library or build-time network required.
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, bytes) {
  const tag = Buffer.from(type);
  const header = Buffer.alloc(4); header.writeUInt32BE(bytes.length);
  const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([tag, bytes])));
  return Buffer.concat([header, tag, bytes, checksum]);
}
for (const bank of ['traces', 'cargo']) {
  const { width, height, columns, frames } = source[bank];
  if (![width, height, columns].every((v) => Number.isInteger(v) && v > 0 && v <= 256)) throw new Error(`Invalid ${bank} dimensions`);
  const entries = Object.entries(frames);
  const atlasWidth = columns * width;
  const atlasHeight = Math.ceil(entries.length / columns) * height;
  const stride = atlasWidth * 4 + 1;
  const pixels = Buffer.alloc(stride * atlasHeight);
  entries.forEach(([name, rows], frame) => {
    if (rows.length !== height || rows.some((row) => row.length !== width)) throw new Error(`Invalid frame ${name}`);
    rows.forEach((row, y) => [...row].forEach((ink, x) => {
      if (!Object.hasOwn(source.palette, ink)) throw new Error(`Unknown ink ${ink} in ${name}`);
      const color = source.palette[ink];
      if (color === null) return;
      if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error(`Invalid color ${color}`);
      const offset = (Math.floor(frame / columns) * height + y) * stride + 1 + ((frame % columns) * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = parseInt(color.slice(1 + channel * 2, 3 + channel * 2), 16);
      pixels[offset + 3] = 255;
    }));
  });
  const header = Buffer.alloc(13);
  header.writeUInt32BE(atlasWidth, 0); header.writeUInt32BE(atlasHeight, 4);
  header[8] = 8; header[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
  const target = resolve(root, `src/render/assets/discovery-${bank}.png`);
  if (check) {
    if (!readFileSync(target).equals(png)) throw new Error(`${target} is stale; run npm run assets:discovery`);
  } else writeFileSync(target, png);
  console.log(`${check ? 'Verified' : 'Wrote'} discovery-${bank}.png: ${entries.length} frames, ${atlasWidth}x${atlasHeight}`);
}
