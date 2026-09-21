/** D-001 finishing pass. Run after process-d001-assets.mjs, never over its own output.
 * Edits the existing art at logical resolution; no new source generation, randomness,
 * animation timing, anchors, collision areas or simulation state are introduced.
 * ImageMagick is an authoring dependency only, not a build/test dependency.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'public/assets/d001/runtime');
const colors = JSON.parse(readFileSync(join(root, 'art/d001/palette.json'), 'utf8')).colors;
const rgba = (hex) => [...hex.slice(1).match(/../g).map((value) => parseInt(value, 16)), 255];
const ink = Object.fromEntries(colors.map((color) => [color, rgba(color)]));

function read(name) {
  const file = join(output, `${name}.png`);
  const [width, height] = execFileSync('magick', ['identify', '-format', '%w %h', file], { encoding: 'utf8' }).split(' ').map(Number);
  const data = execFileSync('magick', [file, '-depth', '8', 'rgba:-']);
  return { width, height, data };
}
function blank(width = 480, height = 270) { return { width, height, data: Buffer.alloc(width * height * 4) }; }
function pixel(image, x, y) { return image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4); }
function put(image, x, y, color) {
  if (x >= 0 && y >= 0 && x < image.width && y < image.height) image.data.set(color, (y * image.width + x) * 4);
}
function rect(image, x, y, width, height, color) {
  for (let yy = y; yy < y + height; yy++) for (let xx = x; xx < x + width; xx++) put(image, xx, yy, ink[color]);
}
function hex(pixel) { return `#${Buffer.from(pixel.subarray(0, 3)).toString('hex')}`; }
function remap(image, table, predicate = () => true) {
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
    const p = pixel(image, x, y);
    if (p[3] && predicate(x, y) && table[hex(p)]) put(image, x, y, ink[table[hex(p)]]);
  }
}
function save(name, image) {
  for (let i = 0; i < image.data.length; i += 4) {
    const p = image.data.subarray(i, i + 4);
    if (p[3] !== 0 && (p[3] !== 255 || !ink[hex(p)])) throw new Error(`${name}: non-palette or partial-alpha pixel`);
  }
  execFileSync('magick', ['-size', `${image.width}x${image.height}`, '-depth', '8', 'rgba:-',
    '-type', 'PaletteAlpha', '-strip', '-define', 'png:compression-level=9', join(output, `${name}.png`)], { input: image.data });
}
function copy(source, target, sx, sy, width, height, dx, dy) {
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const p = pixel(source, sx + x, sy + y);
    if (p[3]) put(target, dx + x, dy + y, p);
  }
}

// Retain the source rock's large masses, remove isolated one-pixel texture and
// reserve the lightest values for the working floor, actors and physical cargo.
const rock = read('background-rock-base');
const original = { ...rock, data: Buffer.from(rock.data) };
for (let y = 42; y < 270; y++) for (let x = 1; x < 479; x++) {
  const counts = new Map();
  for (let yy = Math.max(42, y - 1); yy <= Math.min(269, y + 1); yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    const key = hex(pixel(original, xx, yy));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let winner = hex(pixel(original, x, y));
  for (const [key, count] of counts) if (count > (counts.get(winner) ?? 0)) winner = key;
  const rgb = rgba(winner);
  const value = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  put(rock, x, y, ink[value < 15 ? '#08080b' : value < 23 ? '#140e0c' : value < 32 ? '#1c1413' : '#251815']);
}
save('background-rock-base', rock);

// Two excavated rooms, not a uniformly stretched backdrop. Ceiling profiles are
// integer-pixel cuts in the rock. The original floor (y=223) and shaft are untouched.
const back = blank();
const rooms = [
  { left: 22, right: 215, roof: [[22,164],[35,145],[70,138],[107,143],[144,137],[180,144],[200,157],[215,169]] },
  { left: 265, right: 457, roof: [[265,168],[285,150],[310,142],[339,147],[367,136],[394,142],[423,133],[445,145],[457,165]] },
];
for (const room of rooms) {
  for (let x = room.left; x <= room.right; x++) {
    const i = Math.min(room.roof.length - 2, room.roof.findIndex((p) => p[0] >= x) - 1);
    const a = room.roof[Math.max(0, i)], b = room.roof[Math.max(0, i) + 1];
    const top = Math.round(a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]));
    for (let y = top; y <= 223; y++) {
      const edge = y - top;
      const source = pixel(rock, x, y);
      put(back, x, y, edge < 8 ? source : ink[y >= 216 ? '#1c1413'
        : edge < 25 && hex(source) === '#251815' ? '#140e0c' : '#08080b']);
    }
  }

}
save('background-tunnel-back', back);

// Reuse the existing beam, braces and lamp pixels without scaling their grain.
// Extend only the posts; remove the old knee-height decorative rail.
const oldStructure = read('background-tunnel-structure');
const structure = blank();
for (const [left, width] of [[22,194],[265,193]]) {
  copy(oldStructure, structure, left, 180, width, 17, left, 148);
  copy(oldStructure, structure, left, 222, width, 5, left, 222);
}
for (const x of [34,103,174,296,365,439]) {
  for (let y = 155; y < 222; y++) copy(oldStructure, structure, x, 192 + (y - 155) % 14, 4, 1, x, y);
  // Foot plates and a single directional wood highlight.
  rect(structure, x - 1, 220, 6, 3, '#362f2b');
  rect(structure, x, 220, 4, 1, '#655b4f');
}
remap(structure, { '#b8a795':'#655b4f', '#b18b67':'#715a4d', '#d89c67':'#9f7353' });
save('background-tunnel-structure', structure);
const floor = read('background-floor');
for (const [left, right] of [[22,215],[265,457]]) {
  for (let y = 200; y < 222; y++) for (let x = left; x <= right; x++) put(floor, x, y, [0,0,0,0]);
}
save('background-floor', floor);

// Stage the existing veins in shallow cut faces. The rim remains inside each
// 48x40 cell and follows the actual damage silhouette; depleted cells stay rubble.
for (const name of ['node-scrap-ledge-atlas','node-copper-pocket-atlas','node-fossil-crack-atlas']) {
  const image = read(name);
  const rim = blank(image.width, image.height);
  for (let frame = 0; frame < 3; frame++) {
    for (let y = 8; y < 40; y++) for (let x = 1; x < 47; x++) {
      if (!pixel(image, frame * 48 + x, y)[3]) continue;
      for (const [dx,dy] of [[-1,0],[1,0],[0,1]]) put(rim, frame * 48 + x + dx, y + dy, ink['#362f2b']);
    }
  }
  copy(image, rim, 0, 0, image.width, image.height, 0, 0);
  if (name.includes('scrap')) remap(rim, { '#583828':'#43413e', '#6f4930':'#655b4f', '#916a4e':'#b8a795', '#9f7353':'#b8a795' });
  save(name, rim);
}

// Clothing reads as a broad neutral material, skin and warm equipment keep their
// existing hues. All poses, ownership masks, hit frames and alpha remain unchanged.
const cloth = { '#392319':'#362f2b', '#47291a':'#43413e', '#56311b':'#564537', '#583828':'#655b4f', '#6f4930':'#715a4d' };
const body = read('player-body-atlas');
remap(body, cloth, (_x, y) => y % 40 >= 17 && y % 40 < 33);
save('player-body-atlas', body);
const helmet = read('player-helmet-atlas');
remap(helmet, { '#8d5431':'#a55b2c', '#a55b2c':'#e6a02b', '#916a4e':'#d89c67', '#9f7353':'#d89c67' });
save('player-helmet-atlas', helmet);
const porter = read('npc-porter-atlas');
remap(porter, cloth, (_x, y) => y % 40 >= 17 && y % 40 < 33);
save('npc-porter-atlas', porter);
const cargo = read('cargo-items-atlas');
remap(cargo, { '#43413e':'#655b4f', '#655b4f':'#b8a795', '#715a4d':'#b8a795' }, (x) => x < 24);
save('cargo-items-atlas', cargo);
console.log('D-001 finishing pass: chamber silhouettes, restrained rock, timber, veins, clothing and cargo.');
