import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'art/d001/sources');
const output = join(root, 'public/assets/d001/runtime');
const palette = JSON.parse(readFileSync(join(root, 'art/d001/palette.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'loop-shaft-d001-'));
mkdirSync(output, { recursive: true });

function magick(...args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

function paletteImage() {
  const inputs = palette.colors.slice(0, 30).flatMap((color) => [`xc:${color}`]);
  magick(...inputs, '+append', join(work, 'palette.png'));
}

function quantize(input, destination) {
  const alpha = join(work, `alpha-${Math.random().toString(16).slice(2)}.png`);
  const color = join(work, `color-${Math.random().toString(16).slice(2)}.png`);
  magick(input, '-alpha', 'extract', '-threshold', '50%', alpha);
  magick(input, '-alpha', 'off', '-colorspace', 'sRGB', '+dither', '-remap', join(work, 'palette.png'), color);
  magick(color, alpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', destination);
}

function placeTrimmed(sourceFile, width, height, x, y, destination) {
  const object = join(work, `object-${Math.random().toString(16).slice(2)}.png`);
  const canvas = join(work, `canvas-${Math.random().toString(16).slice(2)}.png`);
  magick(join(source, sourceFile), '-trim', '+repage', '-filter', 'point', '-resize', `${width}x${height}!`, object);
  magick('-size', '480x270', 'xc:none', object, '-geometry', `+${x}+${y}`, '-composite', canvas);
  quantize(canvas, join(output, destination));
}

function processBackgrounds() {
  const underground = join(work, 'rock-underground.png');
  const raw = join(work, 'rock-base.png');
  magick(join(source, 'generated-background-rock-base.png'), '-crop', '1672x786+0+155', '+repage',
    '-filter', 'point', '-resize', '480x232!', '-modulate', '68,72,100', underground);
  magick('-size', '480x270', 'xc:#08080b', underground, '-geometry', '+0+38', '-composite', raw);
  quantize(raw, join(output, 'background-rock-base.png'));
  placeTrimmed('generated-background-tunnel-back.png', 436, 45, 22, 183, 'background-tunnel-back.png');
  placeTrimmed('generated-background-surface-station.png', 82, 34, 199, 4, 'background-surface-station.png');
  placeTrimmed('generated-background-shaft-back.png', 49, 196, 216, 38, 'background-shaft-back.png');
  placeTrimmed('generated-background-tunnel-structure.png', 436, 38, 22, 180, 'background-tunnel-structure.png');
  placeTrimmed('generated-background-floor.png', 480, 60, 0, 210, 'background-floor.png');
}

function cropStrip(sourceFile, count, cellWidth, cellHeight, destination, paddingX = 4, paddingY = 4) {
  const info = execFileSync('identify', ['-format', '%w %h', join(source, sourceFile)], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const [width, height] = info;
  const cells = [];
  for (let index = 0; index < count; index += 1) {
    const left = Math.round(width * index / count);
    const right = Math.round(width * (index + 1) / count);
    const cell = join(work, `${destination}-${index}.png`);
    magick(join(source, sourceFile), '-crop', `${right - left}x${height}+${left}+0`, '+repage', '-trim', '+repage',
      '-filter', 'point', '-resize', `${cellWidth - paddingX}x${cellHeight - paddingY}>`, '-gravity', 'south',
      '-background', 'none', '-extent', `${cellWidth}x${cellHeight}`, cell);
    cells.push(cell);
  }
  const strip = join(work, `strip-${destination}`);
  magick(...cells, '+append', strip);
  quantize(strip, join(output, destination));
}

function processNodesAndEquipment() {
  cropStrip('generated-node-scrap-ledge.png', 4, 48, 40, 'node-scrap-ledge-atlas.png', 10, 8);
  cropStrip('generated-node-copper-pocket.png', 4, 48, 40, 'node-copper-pocket-atlas.png', 10, 8);
  cropStrip('generated-node-fossil-crack.png', 4, 48, 40, 'node-fossil-crack-atlas.png', 10, 8);

  const workbenchInfo = execFileSync('identify', ['-format', '%w %h', join(source, 'generated-workbench.png')], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const [workbenchWidth, workbenchHeight] = workbenchInfo;
  const workbenchCells = [];
  for (let index = 0; index < 7; index += 1) {
    const left = Math.round(workbenchWidth * index / 7);
    const right = Math.round(workbenchWidth * (index + 1) / 7);
    const cell = join(work, `workbench-${index}.png`);
    magick(join(source, 'generated-workbench.png'), '-crop', `${right - left}x${workbenchHeight}+${left}+0`, '+repage', '-trim', '+repage',
      '-filter', 'point', '-resize', '24x24>', '-gravity', 'south', '-background', 'none', '-extent', '32x32', cell);
    workbenchCells.push(cell);
  }
  const overlays = [workbenchCells[0]];
  for (let index = 1; index < workbenchCells.length; index += 1) {
    const mask = join(work, `workbench-mask-${index}.png`);
    const overlay = join(work, `workbench-overlay-${index}.png`);
    magick(workbenchCells[index], workbenchCells[0], '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', '24%', mask);
    magick(workbenchCells[index], mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', overlay);
    overlays.push(overlay);
  }
  const workbenchAtlas = join(work, 'workbench-atlas.png');
  magick(...overlays, '+append', workbenchAtlas);
  quantize(workbenchAtlas, join(output, 'workbench-atlas.png'));

  const info = execFileSync('identify', ['-format', '%w %h', join(source, 'generated-central-elevator.png')], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const [width, height] = info;
  const cells = [];
  for (let index = 0; index < 7; index += 1) {
    const left = Math.round(width * index / 7);
    const right = Math.round(width * (index + 1) / 7);
    const cell = join(work, `elevator-${index}.png`);
    magick(join(source, 'generated-central-elevator.png'), '-crop', `${right - left}x${height}+${left}+0`, '+repage', '-trim', '+repage',
      '-filter', 'point', '-resize', '52x42>', '-gravity', 'south', '-background', 'none', '-extent', '56x44', cell);
    cells.push(cell);
  }
  const blank = join(work, 'elevator-blank.png');
  magick('-size', '56x44', 'xc:none', blank);
  const row0 = join(work, 'elevator-row0.png');
  const row1 = join(work, 'elevator-row1.png');
  const atlas = join(work, 'elevator-atlas.png');
  magick(...cells.slice(0, 4), '+append', row0);
  magick(...cells.slice(4), blank, '+append', row1);
  magick(row0, row1, '-append', atlas);
  quantize(atlas, join(output, 'central-elevator-atlas.png'));
}

const poses = {
  idle: [132, 65, 211, 355],
  walk: [522, 65, 235, 355],
  ready: [938, 79, 319, 341],
  swing: [1340, 85, 389, 335],
  collect: [97, 553, 310, 270],
  carryWalk: [517, 469, 242, 354],
  carryIdle: [934, 473, 209, 348],
  load: [1307, 497, 436, 328],
};

function poseCell(name) {
  const [x, y, width, height] = poses[name];
  const cell = join(work, `player-${name}.png`);
  magick(join(source, 'reference-character.png'), '-crop', `${width}x${height}+${x}+${y}`, '+repage', '-trim', '+repage',
    '-filter', 'point', '-resize', '38x32>', '-gravity', 'south', '-background', 'none', '-extent', '40x40', cell);
  return cell;
}

function processPlayer() {
  const cell = Object.fromEntries(Object.keys(poses).map((name) => [name, poseCell(name)]));
  const blank = join(work, 'player-blank.png');
  magick('-size', '40x40', 'xc:none', blank);
  const rows = [
    [cell.idle, cell.idle],
    [cell.walk, cell.walk, cell.walk, cell.walk],
    [cell.ready, cell.ready],
    [cell.ready, cell.ready, cell.ready, cell.swing, cell.swing, cell.swing, cell.swing, cell.swing],
    [cell.collect, cell.collect, cell.collect, cell.collect],
    [cell.carryWalk, cell.carryWalk, cell.carryWalk, cell.carryWalk],
    [cell.carryIdle, cell.carryIdle],
    [cell.load, cell.load, cell.load, cell.load],
  ];
  const rowFiles = rows.map((frames, row) => {
    const file = join(work, `player-row-${row}.png`);
    magick(...frames, ...Array(8 - frames.length).fill(blank), '+append', file);
    return file;
  });
  const full = join(work, 'player-full.png');
  magick(...rowFiles, '-append', full);

  const activeRects = [];
  rows.forEach((frames, row) => frames.forEach((_, column) => activeRects.push({ x: column * 40, y: row * 40 })));
  const masks = {
    helmet: activeRects.map(({ x, y }) => `rectangle ${x},${y} ${x + 39},${y + 10}`).join(' '),
    pack: activeRects.map(({ x, y }) => `rectangle ${x},${y + 11} ${x + 10},${y + 32}`).join(' '),
    boots: activeRects.map(({ x, y }) => `rectangle ${x},${y + 33} ${x + 39},${y + 39}`).join(' '),
    tool: [2, 3].flatMap((row) => rows[row].map((_, column) => `rectangle ${column * 40 + 24},${row * 40 + 11} ${column * 40 + 39},${row * 40 + 32}`)).join(' '),
  };
  const union = Object.values(masks).join(' ');

  const body = join(work, 'player-body.png');
  magick(full, '-fill', 'none', '-draw', union, body);
  quantize(body, join(output, 'player-body-atlas.png'));

  function layer(name, tint, destination, doubleBank = false) {
    const layerFile = join(work, `player-${name}-layer.png`);
    magick('-size', '320x320', 'xc:none', full, '-compose', 'over', '-composite',
      '-fill', 'none', '-draw', `rectangle 0,0 319,319`, layerFile);
    const mask = join(work, `player-${name}-mask.png`);
    magick('-size', '320x320', 'xc:black', '-fill', 'white', '-draw', masks[name], mask);
    magick(full, mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', layerFile);
    if (!doubleBank) {
      quantize(layerFile, join(output, destination));
      return;
    }
    const variant = join(work, `player-${name}-variant.png`);
    magick(layerFile, '-fill', tint, '-colorize', '38%', variant);
    const atlas = join(work, `player-${name}-banks.png`);
    magick(layerFile, variant, '+append', atlas);
    quantize(atlas, join(output, destination));
  }
  layer('helmet', '#d89c67', 'player-helmet-atlas.png');
  layer('tool', '#b8a795', 'player-tool-atlas.png', true);
  layer('pack', '#916a4e', 'player-pack-atlas.png', true);
  layer('boots', '#b8a795', 'player-boots-atlas.png', true);
}

function validate() {
  const expected = JSON.parse(readFileSync(join(root, 'art/d001/generation-spec.json'), 'utf8')).runtimeAssets;
  for (const asset of expected) {
    const path = join(output, asset.file);
    const actual = execFileSync('identify', ['-format', '%w %h', path], { encoding: 'utf8' }).trim().split(' ').map(Number);
    if (actual[0] !== asset.size[0] || actual[1] !== asset.size[1]) {
      throw new Error(`${asset.file}: expected ${asset.size.join('x')}, got ${actual.join('x')}`);
    }
    const alphaColorCount = Number(execFileSync('magick', [
      path, '-alpha', 'extract', '-unique-colors', '-format', '%w', 'info:',
    ], { encoding: 'utf8' }).trim());
    if (alphaColorCount > 2) {
      throw new Error(`${asset.file}: alpha channel must contain only transparent and opaque pixels`);
    }
  }
}

try {
  paletteImage();
  processBackgrounds();
  processNodesAndEquipment();
  processPlayer();
  validate();
} finally {
  rmSync(work, { recursive: true, force: true });
}
