import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'art/d001/sources');
const output = join(root, 'public/assets/d001/runtime');
const palette = JSON.parse(readFileSync(join(root, 'art/d001/palette.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'loop-shaft-d001-'));
const playerCompositeReference = join(work, 'player-composite-reference.png');
const playerFullAtlas = join(work, 'generated-player-animation.png-atlas.png');
mkdirSync(output, { recursive: true });

function magick(...args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

function paletteImage() {
  const common = palette.colors.slice(0, 30).flatMap((color) => [`xc:${color}`]);
  const all = palette.colors.flatMap((color) => [`xc:${color}`]);
  magick(...common, '+append', join(work, 'palette.png'));
  magick(...all, '+append', join(work, 'palette-all.png'));
}

function quantize(input, destination, includeReserved = false) {
  const alpha = join(work, `alpha-${Math.random().toString(16).slice(2)}.png`);
  const color = join(work, `color-${Math.random().toString(16).slice(2)}.png`);
  magick(input, '-alpha', 'extract', '-threshold', '50%', alpha);
  magick(input, '-alpha', 'off', '-colorspace', 'sRGB', '+dither', '-remap', join(work, includeReserved ? 'palette-all.png' : 'palette.png'), color);
  magick(color, alpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
    '-background', '#000000', '-alpha', 'background', '-strip', destination);
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

const CHARACTER_FRAMES = [2, 4, 2, 8, 4, 4, 2, 4];

function imageSize(file) {
  return execFileSync('identify', ['-format', '%w %h', file], { encoding: 'utf8' }).trim().split(' ').map(Number);
}

function extractCell(sourceFile, row, rows, frame, frames, options = {}) {
  const file = join(source, sourceFile);
  const [width, height] = imageSize(file);
  const gridColumns = options.gridColumns ?? frames;
  const frameRegion = options.frameRegions?.[row]?.[frame];
  const left = frameRegion?.[0] ?? Math.round(width * frame / gridColumns);
  const right = frameRegion?.[1] ?? Math.round(width * (frame + 1) / gridColumns);
  const region = options.rowRegions?.[row];
  const top = region?.[0] ?? Math.round(height * row / rows);
  const bottom = region?.[1] ?? Math.round(height * (row + 1) / rows);
  const rawCell = join(work, `raw-${sourceFile}-${row}-${frame}.png`);
  const positioned = join(work, `positioned-${sourceFile}-${row}-${frame}.png`);
  const cell = join(work, `${sourceFile}-${row}-${frame}.png`);
  magick(file, '-crop', `${right - left}x${bottom - top}+${left}+${top}`, '+repage',
    '-alpha', 'on', '-fuzz', options.backgroundFuzz ?? '4%', '-fill', 'none', '-draw', 'alpha 0,0 floodfill',
    '-trim', '+repage', '-filter', 'point', '-resize', options.resize ?? '38x32>',
    '-gravity', 'south', '-background', 'none', '-extent', '40x38', '-gravity', 'north', '-extent', '40x40', rawCell);
  const silhouette = join(work, `silhouette-${sourceFile}-${row}-${frame}.png`);
  const keepTop = options.keepTopByRow?.[row] ?? 1;
  const [offsetX, offsetY] = options.frameOffsets?.[row]?.[frame] ?? [0, 0];
  magick(rawCell, '-alpha', 'extract', '-threshold', '50%', '-define', `connected-components:keep-top=${keepTop}`,
    '-connected-components', '8', '-auto-level', '-threshold', '0', '-alpha', 'copy', silhouette);
  magick(rawCell, silhouette, '-compose', 'DstIn', '-composite', '-fill', 'none', '-draw', 'rectangle 0,36 39,39',
    '-compose', 'Over', '-trim', '+repage', '-gravity', 'south', '-background', 'none', '-extent', '40x38', '-gravity', 'north', '-extent', '40x40',
    ...(offsetX || offsetY ? ['-roll', `${offsetX >= 0 ? '+' : ''}${offsetX}${offsetY >= 0 ? '+' : ''}${offsetY}`] : []), positioned);
  const finalSilhouette = join(work, `final-silhouette-${sourceFile}-${row}-${frame}.png`);
  magick(positioned, '-alpha', 'extract', '-threshold', '50%', '-define', `connected-components:keep-top=${keepTop}`,
    '-connected-components', '8', '-auto-level', '-threshold', '0', '-alpha', 'copy', finalSilhouette);
  magick(positioned, finalSilhouette, '-compose', 'DstIn', '-composite', '-compose', 'Over', '-trim', '+repage',
    '-gravity', 'south', '-background', 'none', '-extent', '40x38', '-gravity', 'north', '-extent', '40x40', cell);
  return cell;
}

function assembleCharacterAtlas(sourceFile, sourceFrames, sourceRows, targetRows, options = {}) {
  const blank = join(work, 'player-blank.png');
  magick('-size', '40x40', 'xc:none', blank);
  const rows = Array.from({ length: 8 }, () => []);
  sourceFrames.forEach((count, sourceRow) => {
    const targetRow = targetRows[sourceRow];
    rows[targetRow] = Array.from({ length: count }, (_, frame) => extractCell(
      sourceFile, sourceRow, sourceRows, frame, count, options,
    ));
  });
  const rowFiles = rows.map((frames, row) => {
    const file = join(work, `${sourceFile}-row-${row}.png`);
    magick(...frames, ...Array(8 - frames.length).fill(blank), '+append', file);
    return file;
  });
  const full = join(work, `${sourceFile}-atlas.png`);
  magick(...rowFiles, '-append', full);
  return { full, rows };
}

function processPlayer() {
  const { full, rows } = assembleCharacterAtlas(
    'generated-player-animation.png', CHARACTER_FRAMES, 8, [0, 1, 2, 3, 4, 5, 6, 7],
    {
      gridColumns: 8, backgroundFuzz: '8%', keepTopByRow: [1, 1, 2, 2, 1, 1, 1, 1],
      frameOffsets: [[[0, 0], [1, 0]]],
    },
  );
  quantize(full, playerCompositeReference);

  const activeRects = [];
  rows.forEach((frames, row) => frames.forEach((_, column) => activeRects.push({ x: column * 40, y: row * 40 })));
  const masks = {
    helmet: activeRects.map(({ x, y }) => `rectangle ${x},${y} ${x + 39},${y + 15}`).join(' '),
    pack: activeRects.map(({ x, y }) => `rectangle ${x},${y + 16} ${x + 14},${y + 32}`).join(' '),
    boots: activeRects.map(({ x, y }) => `rectangle ${x},${y + 33} ${x + 39},${y + 39}`).join(' '),
    tool: [2, 3].flatMap((row) => rows[row].map((_, column) => `rectangle ${column * 40 + 23},${row * 40 + 16} ${column * 40 + 39},${row * 40 + 32}`)).join(' '),
  };
  const union = Object.values(masks).join(' ');

  const body = join(work, 'player-body.png');
  magick(full, '-fill', 'none', '-draw', union, body);
  quantize(body, join(output, 'player-body-atlas.png'));

  function layer(name, tint, destination, doubleBank = false) {
    const layerFile = join(work, `player-${name}-layer.png`);
    const mask = join(work, `player-${name}-mask.png`);
    magick('-size', '320x320', 'xc:none', '-fill', 'white', '-draw', masks[name], mask);
    magick(full, mask, '-compose', 'DstIn', '-composite', layerFile);
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

function processNpcAtlas(sourceFile, sourceFrames, targetRows, destination, options = {}) {
  const { full } = assembleCharacterAtlas(sourceFile, sourceFrames, sourceFrames.length, targetRows, options);
  if (!options.banks) {
    quantize(full, join(output, destination), options.includeReserved ?? false);
    return;
  }
  const banks = [full];
  for (const tint of options.banks.slice(1)) {
    const variant = join(work, `${destination}-${tint.replace('#', '')}.png`);
    magick(full, '-fill', tint, '-colorize', '12%', variant);
    banks.push(variant);
  }
  const banked = join(work, `${destination}-banks.png`);
  magick(...banks, '+append', banked);
  quantize(banked, join(output, destination), options.includeReserved ?? false);
}

function processNpcs() {
  processNpcAtlas('generated-npc-porter.png', [2, 4, 4, 4, 2, 4], [0, 1, 4, 5, 6, 7], 'npc-porter-atlas.png', {
    backgroundFuzz: '24%', includeReserved: true,
    rowRegions: [[0, 270], [270, 535], [535, 800], [800, 1070], [1070, 1300], [1300, 1536]],
    frameRegions: [
      [[290, 510], [520, 740]],
      [[20, 280], [270, 530], [520, 780], [764, 1024]],
      [[20, 280], [270, 530], [520, 780], [764, 1024]],
      [[20, 280], [270, 530], [520, 780], [764, 1024]],
      [[290, 510], [520, 740]],
      [[20, 280], [270, 530], [520, 780], [764, 1024]],
    ],
  });
  const minerBanks = [playerFullAtlas];
  for (const tint of ['#d89c67', '#916a4e', '#e6a02b']) {
    const variant = join(work, `crew-miner-${tint.replace('#', '')}.png`);
    magick(playerFullAtlas, '-fill', tint, '-colorize', '10%', variant);
    minerBanks.push(variant);
  }
  const minerAtlas = join(work, 'npc-crew-miner-banks.png');
  magick(...minerBanks, '+append', minerAtlas);
  quantize(minerAtlas, join(output, 'npc-crew-miner-atlas.png'));
  processNpcAtlas('generated-npc-crew-porter.png', [2, 4, 4, 4, 2, 4], [0, 1, 4, 5, 6, 7], 'npc-crew-porter-atlas.png', {
    backgroundFuzz: '0%', includeReserved: true,
    rowRegions: [[0, 200], [205, 400], [415, 605], [615, 805], [815, 995], [1005, 1214]],
    frameRegions: [
      [[430, 650], [650, 870]],
      [[205, 420], [420, 640], [640, 860], [860, 1080]],
      [[205, 420], [420, 640], [640, 860], [860, 1080]],
      [[205, 420], [420, 640], [640, 860], [860, 1080]],
      [[430, 650], [650, 870]],
      [[205, 420], [420, 640], [640, 860], [860, 1080]],
    ],
  });
  const engineerFrames = [2, 4, 4, 2];
  const engineerRows = engineerFrames.map((count, row) => Array.from({ length: count }, (_, frame) => extractCell(
    'generated-npc-engineer.png', row, 4, frame, count, {
      backgroundFuzz: '24%', rowRegions: [[0, 250], [250, 510], [510, 760], [760, 1024]],
      keepTopByRow: [1, 1, 2, 2],
      frameRegions: [
        [[520, 780], [770, 1030]],
        [[260, 520], [520, 780], [780, 1040], [1040, 1300]],
        [[260, 520], [520, 780], [780, 1040], [1040, 1300]],
        [[520, 780], [770, 1030]],
      ],
    },
  )));
  const blank = join(work, 'engineer-blank.png');
  magick('-size', '40x40', 'xc:none', blank);
  const rowFiles = engineerRows.map((frames, row) => {
    const file = join(work, `engineer-row-${row}.png`);
    magick(...frames, ...Array(4 - frames.length).fill(blank), '+append', file);
    return file;
  });
  const atlas = join(work, 'engineer-atlas.png');
  magick(...rowFiles, '-append', atlas);
  quantize(atlas, join(output, 'npc-engineer-atlas.png'));
}

function processCargo() {
  const [width, height] = imageSize(join(source, 'generated-cargo-items.png'));
  const cells = [];
  for (let frame = 0; frame < 12; frame += 1) {
    const left = Math.round(width * frame / 12);
    const right = Math.round(width * (frame + 1) / 12);
    const cell = join(work, `cargo-${frame}.png`);
    magick(join(source, 'generated-cargo-items.png'), '-crop', `${right - left}x${height}+${left}+0`, '+repage',
      '-alpha', 'on', '-fuzz', '0%', '-fill', 'none', '-draw', 'alpha 0,0 floodfill', '-trim', '+repage',
      '-filter', 'point', '-resize', '10x8>', '-gravity', 'south', '-background', 'none', '-extent', '12x10', cell);
    cells.push(cell);
  }
  const atlas = join(work, 'cargo-items-atlas.png');
  magick(...cells, '+append', atlas);
  quantize(atlas, join(output, 'cargo-items-atlas.png'));
}

function validate() {
  const specification = JSON.parse(readFileSync(join(root, 'art/d001/generation-spec.json'), 'utf8'));
  const expected = specification.runtimeAssets;
  for (const asset of expected) {
    const path = join(output, asset.file);
    const actual = execFileSync('identify', ['-format', '%w %h', path], { encoding: 'utf8' }).trim().split(' ').map(Number);
    if (actual[0] !== asset.size[0] || actual[1] !== asset.size[1]) {
      throw new Error(`${asset.file}: expected ${asset.size.join('x')}, got ${actual.join('x')}`);
    }
    const alphaValues = execFileSync('magick', [path, '-alpha', 'extract', '-unique-colors', 'txt:-'], { encoding: 'utf8' });
    const invalidAlpha = [...alphaValues.matchAll(/gray\((\d+)\)/g)].map((match) => Number(match[1]))
      .filter((value) => value !== 0 && value !== 255);
    if (invalidAlpha.length > 0) {
      throw new Error(`${asset.file}: alpha channel contains values other than 0 and 255`);
    }
  }

  const pack = join(work, 'validate-pack.png');
  const boots = join(work, 'validate-boots.png');
  const tool = join(work, 'validate-tool.png');
  magick(join(output, 'player-pack-atlas.png'), '-crop', '320x320+0+0', '+repage', pack);
  magick(join(output, 'player-boots-atlas.png'), '-crop', '320x320+0+0', '+repage', boots);
  magick(join(output, 'player-tool-atlas.png'), '-crop', '320x320+0+0', '+repage', tool);
  const composite = join(work, 'validate-player-composite.png');
  magick('-size', '320x320', 'xc:none', pack, '-composite', join(output, 'player-body-atlas.png'), '-composite',
    boots, '-composite', tool, '-composite', join(output, 'player-helmet-atlas.png'), '-composite', composite);
  const compositeDifference = Number(execFileSync('magick', [
    composite, playerCompositeReference, '-compose', 'difference', '-composite', '-format', '%[fx:mean]', 'info:',
  ], { encoding: 'utf8' }));
  if (compositeDifference !== 0) throw new Error('Player ownership layers do not reconstruct the reference composite');

  const hashes = new Set();
  CHARACTER_FRAMES.forEach((count, row) => {
    let previous = null;
    for (let frame = 0; frame < count; frame += 1) {
      const cell = join(work, `validate-player-${row}-${frame}.png`);
      magick(composite, '-crop', `40x40+${frame * 40}+${row * 40}`, '+repage', cell);
      const hash = execFileSync('identify', ['-format', '%#', cell], { encoding: 'utf8' }).trim();
      if (hashes.has(hash)) throw new Error(`Player frame ${row}:${frame} duplicates another frame`);
      hashes.add(hash);
      const bottomAlpha = Number(execFileSync('magick', [
        cell, '-crop', '40x2+0+38', '+repage', '-alpha', 'extract', '-format', '%[max]', 'info:',
      ], { encoding: 'utf8' }));
      if (bottomAlpha !== 0) throw new Error(`Player frame ${row}:${frame} crosses the foot anchor perimeter`);
      const contactAlpha = Number(execFileSync('magick', [
        cell, '-crop', '40x1+0+37', '+repage', '-alpha', 'extract', '-format', '%[max]', 'info:',
      ], { encoding: 'utf8' }));
      if (contactAlpha === 0) throw new Error(`Player frame ${row}:${frame} does not reach the y=38 foot anchor`);
      for (const [edge, geometry] of [['top', '40x1+0+0'], ['left', '1x40+0+0'], ['right', '1x40+39+0']]) {
        const edgeAlpha = Number(execFileSync('magick', [
          cell, '-crop', geometry, '+repage', '-alpha', 'extract', '-format', '%[max]', 'info:',
        ], { encoding: 'utf8' }));
        if (edgeAlpha !== 0) throw new Error(`Player frame ${row}:${frame} crosses the ${edge} cell perimeter`);
      }
      if (previous) {
        const changed = Number(execFileSync('magick', [
          previous, cell, '-compose', 'difference', '-composite', '-threshold', '0', '-format', '%[fx:mean*w*h]', 'info:',
        ], { encoding: 'utf8' }));
        const clip = specification.characterClips[row].id;
        const minimum = specification.postprocess.frameDifferenceMinimum[clip];
        if (changed < minimum) throw new Error(`Player ${clip} frame ${frame - 1}->${frame} changes only ${changed} pixels; expected ${minimum}`);
      }
      previous = cell;
    }
  });
}

try {
  paletteImage();
  processBackgrounds();
  processNodesAndEquipment();
  processPlayer();
  processNpcs();
  processCargo();
  validate();
} finally {
  rmSync(work, { recursive: true, force: true });
}
