import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'art/d001/sources');
const output = join(root, 'public/assets/d001/runtime');
const palette = JSON.parse(readFileSync(join(root, 'art/d001/palette.json'), 'utf8'));
const specification = JSON.parse(readFileSync(join(root, 'art/d001/generation-spec.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'loop-shaft-d001-'));
const playerCompositeReference = join(work, 'player-composite-reference.png');
mkdirSync(output, { recursive: true });

function magick(...args) {
  execFileSync('magick', args, { stdio: 'inherit' });
}

function paletteImage() {
  const common = palette.colors.slice(0, 30).flatMap((color) => [`xc:${color}`]);
  const all = palette.colors.flatMap((color) => [`xc:${color}`]);
  magick(...common, '+append', join(work, 'palette.png'));
  magick(...all, '+append', join(work, 'palette-all.png'));
  for (const [role, colors] of Object.entries(specification.paletteRoles)) {
    magick(...colors.flatMap((color) => [`xc:${color}`]), '+append', join(work, `palette-${role}.png`));
    if (role === 'character') {
      magick(...[...colors, ...palette.reserved.automationAndLaterDepth].flatMap((color) => [`xc:${color}`]),
        '+append', join(work, 'palette-character-reserved.png'));
    }
  }
}

function quantize(input, destination, includeReserved = false, role = null) {
  const alpha = join(work, `alpha-${Math.random().toString(16).slice(2)}.png`);
  const color = join(work, `color-${Math.random().toString(16).slice(2)}.png`);
  magick(input, '-alpha', 'extract', '-threshold', '50%', alpha);
  const paletteFile = role
    ? `palette-${role}${includeReserved && role === 'character' ? '-reserved' : ''}.png`
    : includeReserved ? 'palette-all.png' : 'palette.png';
  magick(input, '-alpha', 'off', '-colorspace', 'sRGB', '+dither', '-remap', join(work, paletteFile), color);
  magick(color, alpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite',
    '-background', '#000000', '-alpha', 'background', '-strip', destination);
}

function selectComponents(input, destination, keepTop = 1) {
  const mask = join(work, `component-${Math.random().toString(16).slice(2)}.png`);
  magick(input, '-alpha', 'extract', '-threshold', '50%', '-define', `connected-components:keep-top=${keepTop}`,
    '-connected-components', '8', '-auto-level', '-threshold', '0', mask);
  magick(input, mask, '-compose', 'DstIn', '-composite', destination);
}

function selectLargestComponent(input, destination) {
  selectComponents(input, destination, 1);
}

function addKeyline(input, destination, clearFootPerimeter = false) {
  const [width, height] = imageSize(input);
  const mask = join(work, `keyline-mask-${Math.random().toString(16).slice(2)}.png`);
  const outline = join(work, `keyline-${Math.random().toString(16).slice(2)}.png`);
  const merged = join(work, `keyline-merged-${Math.random().toString(16).slice(2)}.png`);
  magick(input, '-alpha', 'extract', '-morphology', 'Dilate', 'Diamond:1', mask);
  magick('-size', `${width}x${height}`, 'xc:#140e0c', mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', outline);
  magick(outline, input, '-compose', 'Over', '-composite', merged);
  if (clearFootPerimeter) {
    magick('-size', `${width}x${height}`, 'xc:none',
      '(', merged, '-crop', `${width - 2}x37+1+1`, '+repage', ')', '-geometry', '+1+1', '-composite', destination);
  } else magick(merged, destination);
}

function placeFixedCrops(entries, destination, role, opaqueFill = null, postprocess = null) {
  const canvas = join(work, `fixed-canvas-${destination}`);
  const baseArgs = ['-size', '480x270', 'xc:none'];
  if (opaqueFill) {
    baseArgs.push('-fill', opaqueFill);
    for (const entry of entries) {
      const [x, y, width, height] = entry.destination;
      baseArgs.push('-draw', `rectangle ${x},${y} ${x + width - 1},${y + height - 1}`);
    }
  }
  magick(...baseArgs, canvas);
  let current = canvas;
  for (const [index, entry] of entries.entries()) {
    const [cropX, cropY, cropWidth, cropHeight] = entry.crop;
    const [x, y, width, height] = entry.destination;
    const raw = join(work, `fixed-raw-${destination}-${index}.png`);
    const selected = join(work, `fixed-selected-${destination}-${index}.png`);
    const resized = join(work, `fixed-resized-${destination}-${index}.png`);
    const next = join(work, `fixed-next-${destination}-${index}.png`);
    magick(join(source, entry.source), '-crop', `${cropWidth}x${cropHeight}+${cropX}+${cropY}`, '+repage', raw);
    selectLargestComponent(raw, selected);
    magick(selected, '-filter', 'point', '-resize', `${width}x${height}!`, resized);
    magick(current, resized, '-geometry', `+${x}+${y}`, '-composite', next);
    current = next;
  }
  const processed = join(work, `fixed-processed-${destination}`);
  if (postprocess) postprocess(current, processed);
  else magick(current, processed);
  quantize(processed, join(output, destination), false, role);
}

function placeTrimmed(sourceFile, width, height, x, y, destination, role = null, postprocess = null) {
  const object = join(work, `object-${Math.random().toString(16).slice(2)}.png`);
  const canvas = join(work, `canvas-${Math.random().toString(16).slice(2)}.png`);
  magick(join(source, sourceFile), '-trim', '+repage', '-filter', 'point', '-resize', `${width}x${height}!`, object);
  magick('-size', '480x270', 'xc:none', object, '-geometry', `+${x}+${y}`, '-composite', canvas);
  const processed = join(work, `trimmed-processed-${destination}`);
  if (postprocess) postprocess(canvas, processed);
  else magick(canvas, processed);
  quantize(processed, join(output, destination), false, role);
}

function cropResize(sourceFile, crop, width, height, destination, role = null) {
  const [x, y, cropWidth, cropHeight] = crop;
  const raw = join(work, `crop-${destination}-raw.png`);
  const resized = join(work, `crop-${destination}-resized.png`);
  magick(join(source, sourceFile), '-crop', `${cropWidth}x${cropHeight}+${x}+${y}`, '+repage', raw);
  magick(raw, '-alpha', 'on', '-channel', 'A', '-threshold', '50%', '+channel',
    '-filter', 'point', '-resize', `${width}x${height}!`, resized);
  quantize(resized, join(output, destination), false, role);
}

function clearShaftOpening(file) {
  magick(file, '-alpha', 'on', '-fill', 'none', '-draw', 'rectangle 216,223 264,269', file);
}

function applyTunnelMaterialPass(input, destination) {
  const commands = [input,
    '-fill', '#1c1413', '-draw', 'rectangle 22,180 215,183', '-draw', 'rectangle 265,180 457,183',
    '-fill', '#583828',
    '-draw', 'rectangle 34,184 37,226', '-draw', 'rectangle 103,184 106,226',
    '-draw', 'rectangle 174,184 177,226', '-draw', 'rectangle 296,184 299,226',
    '-draw', 'rectangle 365,184 368,226', '-draw', 'rectangle 439,184 442,226',
    '-fill', '#6f4930',
    '-draw', 'rectangle 35,184 35,225', '-draw', 'rectangle 104,184 104,225',
    '-draw', 'rectangle 175,184 175,225', '-draw', 'rectangle 297,184 297,225',
    '-draw', 'rectangle 366,184 366,225', '-draw', 'rectangle 440,184 440,225',
    '-fill', '#392319',
    '-draw', 'rectangle 29,181 43,183', '-draw', 'rectangle 98,181 112,183',
    '-draw', 'rectangle 169,181 183,183', '-draw', 'rectangle 291,181 305,183',
    '-draw', 'rectangle 360,181 374,183', '-draw', 'rectangle 434,181 448,183',
    '-draw', 'rectangle 38,204 40,206', '-draw', 'rectangle 107,195 109,197',
    '-draw', 'rectangle 178,212 180,214', '-draw', 'rectangle 300,198 302,200',
    '-draw', 'rectangle 369,209 371,211', '-draw', 'rectangle 443,193 445,195',
    '-fill', '#43413e',
    '-draw', 'rectangle 31,180 44,181', '-draw', 'rectangle 100,180 113,181',
    '-draw', 'rectangle 171,180 184,181', '-draw', 'rectangle 293,180 306,181',
    '-draw', 'rectangle 362,180 375,181', '-draw', 'rectangle 436,180 449,181',
    '-fill', '#b8a795',
    '-draw', 'rectangle 34,180 35,181', '-draw', 'rectangle 103,180 104,181',
    '-draw', 'rectangle 174,180 175,181', '-draw', 'rectangle 296,180 297,181',
    '-draw', 'rectangle 365,180 366,181', '-draw', 'rectangle 439,180 440,181',
    destination,
  ];
  magick(...commands);
}

function applyShaftMaterialPass(input, destination) {
  const commands = [input,
    '-fill', '#392319', '-draw', 'rectangle 216,38 219,223', '-draw', 'rectangle 261,38 264,223',
    '-fill', '#6f4930', '-draw', 'rectangle 217,39 217,222', '-draw', 'rectangle 262,39 262,222',
    '-fill', '#43413e', '-draw', 'rectangle 220,52 225,54', '-draw', 'rectangle 255,52 260,54',
    '-draw', 'rectangle 220,76 225,78', '-draw', 'rectangle 255,76 260,78',
    '-draw', 'rectangle 220,100 225,102', '-draw', 'rectangle 255,100 260,102',
    '-draw', 'rectangle 220,124 225,126', '-draw', 'rectangle 255,124 260,126',
    '-draw', 'rectangle 220,148 225,150', '-draw', 'rectangle 255,148 260,150',
    '-draw', 'rectangle 220,172 225,174', '-draw', 'rectangle 255,172 260,174',
    '-draw', 'rectangle 220,196 225,198', '-draw', 'rectangle 255,196 260,198',
    '-fill', '#77706c', '-draw', 'rectangle 225,38 226,222', '-draw', 'rectangle 253,38 254,222',
    '-fill', '#b8a795', '-draw', 'rectangle 220,52 220,52', '-draw', 'rectangle 256,52 256,52',
    '-draw', 'rectangle 220,100 220,100', '-draw', 'rectangle 256,100 256,100',
    '-draw', 'rectangle 220,172 220,172', '-draw', 'rectangle 256,172 256,172',
    destination,
  ];
  magick(...commands);
}

function applyFloorMaterialPass(input, destination) {
  const commands = [input,
    '-fill', '#1c1413', '-draw', 'rectangle 22,214 215,215', '-draw', 'rectangle 265,214 457,215',
    '-fill', '#77706c', '-draw', 'rectangle 22,214 215,214', '-draw', 'rectangle 265,214 457,214',
    '-fill', '#43413e',
    '-draw', 'rectangle 42,211 45,213', '-draw', 'rectangle 91,211 94,213',
    '-draw', 'rectangle 143,211 146,213', '-draw', 'rectangle 187,211 190,213',
    '-draw', 'rectangle 285,211 288,213', '-draw', 'rectangle 337,211 340,213',
    '-draw', 'rectangle 389,211 392,213', '-draw', 'rectangle 431,211 434,213',
    destination,
  ];
  magick(...commands);
}

function applyElevatorMaterialPass(input, destination, index, bounds) {
  const [x, y, width, height] = bounds;
  const right = x + width - 1;
  const bottom = y + height - 1;
  const commands = [input,
    '-fill', '#140e0c',
    '-draw', `rectangle ${x},${y} ${right},${y}`,
    '-draw', `rectangle ${x},${bottom} ${right},${bottom}`,
    '-draw', `rectangle ${x},${y} ${x},${bottom}`,
    '-draw', `rectangle ${right},${y} ${right},${bottom}`,
    '-fill', '#77706c',
    '-draw', `rectangle ${x + 1},${y + 1} ${right - 1},${y + 1}`,
    '-draw', `rectangle ${x + 1},${bottom - 1} ${right - 1},${bottom - 1}`,
    '-fill', '#6f4930', '-draw', `rectangle ${x + 3},${bottom - 3} ${right - 3},${bottom - 2}`,
    '-fill', '#b8a795',
    '-draw', `rectangle ${x + 2},${y + 3} ${x + 2},${y + 4}`,
    '-draw', `rectangle ${right - 2},${y + 3} ${right - 2},${y + 4}`,
  ];
  if (index === 4 || index === 5) {
    commands.push('-fill', '#43413e', '-draw', `rectangle ${Math.floor((x + right) / 2)},${y + 4} ${Math.floor((x + right) / 2)},${bottom - 5}`);
  }
  if (index === 6) {
    commands.push(
      '-fill', '#43413e', '-draw', `rectangle ${x + 2},${y + 5} ${right - 2},${bottom - 3}`,
      '-fill', '#b8a795', '-draw', `rectangle ${x + 4},${y + 8} ${x + 5},${y + 9}`,
      '-draw', `rectangle ${x + 8},${y + 8} ${x + 9},${y + 9}`,
      '-fill', '#d06055', '-draw', `rectangle ${right - 4},${y + 8} ${right - 3},${y + 9}`,
    );
  }
  commands.push(destination);
  magick(...commands);
}

function processJunctions() {
  cropResize('generated-background-surface-station.png', [650, 256, 400, 353], 82, 38,
    'shaft-surface-junction.png', 'structure');

  const ropeRaw = join(work, 'rope-source.png');
  const ropeResized = join(work, 'rope-resized.png');
  const ropeHalf = join(work, 'rope-half.png');
  const ropePeriodic = join(work, 'rope-periodic.png');
  magick(join(source, 'generated-background-surface-station.png'), '-crop', '14x64+1354+380', '+repage', ropeRaw);
  magick(ropeRaw, '-alpha', 'on', '-channel', 'A', '-threshold', '50%', '+channel',
    '-filter', 'point', '-resize', '4x8!', ropeResized);
  magick(ropeResized, '-crop', '4x4+0+0', '+repage', ropeHalf);
  magick(ropeHalf, ropeHalf, '-append', ropePeriodic);
  quantize(ropePeriodic, join(output, 'elevator-rope-tile.png'), false, 'structure');

  const openRaw = join(work, 'shaft-bottom-open-raw.png');
  const open = join(work, 'shaft-bottom-open.png');
  const sealRaw = join(work, 'shaft-bottom-seal-raw.png');
  const seal = join(work, 'shaft-bottom-seal.png');
  const sealed = join(work, 'shaft-bottom-sealed.png');
  magick(join(source, 'generated-background-shaft-back.png'), '-crop', '194x219+739+707', '+repage', openRaw);
  magick(openRaw, '-alpha', 'on', '-channel', 'A', '-threshold', '50%', '+channel',
    '-filter', 'point', '-resize', '49x47!', open);
  magick(join(source, 'generated-background-surface-station.png'), '-crop', '245x152+730+457', '+repage', sealRaw);
  magick(sealRaw, '-alpha', 'on', '-channel', 'A', '-threshold', '50%', '+channel',
    '-filter', 'point', '-resize', '49x31!', seal);
  magick(open, seal, '-geometry', '+0+16', '-composite', sealed);
  const bottomAtlas = join(work, 'shaft-bottom-junction-atlas.png');
  magick(sealed, open, '+append', bottomAtlas);
  quantize(bottomAtlas, join(output, 'shaft-bottom-junction-atlas.png'), false, 'structure');
}

function processBackgrounds() {
  const underground = join(work, 'rock-underground.png');
  const raw = join(work, 'rock-base.png');
  magick(join(source, 'generated-background-rock-base.png'), '-crop', '1672x786+0+155', '+repage',
    '-filter', 'point', '-resize', '480x232!', '-modulate', '68,72,100', underground);
  magick('-size', '480x270', 'xc:#08080b', underground, '-geometry', '+0+38', '-composite', raw);
  quantize(raw, join(output, 'background-rock-base.png'), false, 'rock');
  placeFixedCrops([
    specification.sourceCrops.tunnelBackLeft,
    specification.sourceCrops.tunnelBackRight,
  ], 'background-tunnel-back.png', 'tunnelInterior', '#140e0c');
  placeTrimmed('generated-background-surface-station.png', 82, 34, 199, 4, 'background-surface-station.png', 'structure');
  placeFixedCrops([specification.sourceCrops.backgroundShaft], 'background-shaft-back.png', 'structure', '#140e0c', applyShaftMaterialPass);
  placeFixedCrops([
    specification.sourceCrops.tunnelStructureLeft,
    specification.sourceCrops.tunnelStructureRight,
  ], 'background-tunnel-structure.png', 'structure', null, applyTunnelMaterialPass);
  placeTrimmed('generated-background-floor.png', 480, 60, 0, 210, 'background-floor.png', 'rock', applyFloorMaterialPass);
  clearShaftOpening(join(output, 'background-floor.png'));
  processJunctions();
}

function cropStrip(sourceFile, count, cellWidth, cellHeight, destination, paddingX = 4, paddingY = 4) {
  const info = execFileSync('identify', ['-format', '%w %h', join(source, sourceFile)], { encoding: 'utf8' }).trim().split(' ').map(Number);
  const [width, height] = info;
  const cells = [];
  for (let index = 0; index < count; index += 1) {
    const left = Math.round(width * index / count);
    const right = Math.round(width * (index + 1) / count);
    const ungrounded = join(work, `ungrounded-${destination}-${index}.png`);
    const cell = join(work, `${destination}-${index}.png`);
    magick(join(source, sourceFile), '-crop', `${right - left}x${height}+${left}+0`, '+repage', '-trim', '+repage',
      '-filter', 'point', '-resize', `${cellWidth - paddingX}x${cellHeight - paddingY}>`, '-gravity', 'south',
      '-background', 'none', '-extent', `${cellWidth}x${cellHeight}`, ungrounded);
    magick(ungrounded, '-trim', '+repage', '-gravity', 'south', '-background', 'none',
      '-extent', `${cellWidth}x${cellHeight}`, cell);
    cells.push(cell);
  }
  const strip = join(work, `strip-${destination}`);
  const quantized = join(work, `quantized-${destination}`);
  magick(...cells, '+append', strip);
  quantize(strip, quantized, false, 'interactable');
  const grounded = [];
  for (let index = 0; index < count; index += 1) {
    const cell = join(work, `grounded-${destination}-${index}.png`);
    magick(quantized, '-crop', `${cellWidth}x${cellHeight}+${index * cellWidth}+0`, '+repage',
      '-trim', '+repage', '-gravity', 'south', '-background', 'none',
      '-extent', `${cellWidth}x${cellHeight}`, cell);
    grounded.push(cell);
  }
  magick(...grounded, '+append', '-strip', join(output, destination));
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
    const rawOverlay = join(work, `workbench-overlay-raw-${index}.png`);
    const overlay = join(work, `workbench-overlay-${index}.png`);
    magick(workbenchCells[index], workbenchCells[0], '-compose', 'difference', '-composite', '-colorspace', 'gray', '-threshold', '24%', mask);
    magick(workbenchCells[index], mask, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', rawOverlay);
    magick(rawOverlay, '-trim', '+repage', '-gravity', 'south', '-background', 'none', '-extent', '32x27',
      '-gravity', 'north', '-extent', '32x32', overlay);
    overlays.push(overlay);
  }
  const workbenchAtlas = join(work, 'workbench-atlas.png');
  magick(...overlays, '+append', workbenchAtlas);
  quantize(workbenchAtlas, join(output, 'workbench-atlas.png'), false, 'interactable');

  const elevatorCells = [
    { crop: [55, 20, 330, 643], bounds: [7, 1, 42, 43] },
    { crop: [416, 18, 206, 645], bounds: [12, 1, 32, 43] },
    { crop: [670, 17, 327, 646], bounds: [7, 1, 42, 43] },
    { crop: [1048, 17, 213, 646], bounds: [12, 1, 32, 43] },
    { crop: [1307, 17, 327, 646], bounds: [7, 1, 42, 43] },
    { crop: [1680, 17, 217, 646], bounds: [12, 1, 32, 43] },
    { crop: [1948, 141, 155, 521], bounds: [19, 10, 18, 34] },
  ];
  const cells = elevatorCells.map(({ crop, bounds }, index) => {
    const [cropX, cropY, cropWidth, cropHeight] = crop;
    const [x, y, targetWidth, targetHeight] = bounds;
    const raw = join(work, `elevator-${index}-raw.png`);
    const resized = join(work, `elevator-${index}-resized.png`);
    const cell = join(work, `elevator-${index}.png`);
    magick(join(source, 'generated-central-elevator.png'), '-crop', `${cropWidth}x${cropHeight}+${cropX}+${cropY}`, '+repage', raw);
    magick(raw, '-alpha', 'on', '-channel', 'A', '-threshold', '50%', '+channel',
      '-filter', 'point', '-resize', `${targetWidth}x${targetHeight}!`, resized);
    const rawCell = join(work, `elevator-${index}-raw-cell.png`);
    magick('-size', '56x44', 'xc:none', resized, '-geometry', `+${x}+${y}`, '-composite', rawCell);
    applyElevatorMaterialPass(rawCell, cell, index, bounds);
    return cell;
  });
  const blank = join(work, 'elevator-blank.png');
  magick('-size', '56x44', 'xc:none', blank);
  const row0 = join(work, 'elevator-row0.png');
  const row1 = join(work, 'elevator-row1.png');
  const atlas = join(work, 'elevator-atlas.png');
  magick(...cells.slice(0, 4), '+append', row0);
  magick(...cells.slice(4), blank, '+append', row1);
  magick(row0, row1, '-append', atlas);
  quantize(atlas, join(output, 'central-elevator-atlas.png'), false, 'interactable');
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

function extractStandaloneCell(sourceFile, label) {
  const file = join(source, sourceFile);
  const rawCell = join(work, `${label}-raw-cell.png`);
  const silhouette = join(work, `${label}-silhouette.png`);
  const cell = join(work, `${label}-cell.png`);
  magick(file, '-alpha', 'on', '-fuzz', '8%', '-fill', 'none', '-draw', 'alpha 0,0 floodfill',
    '-trim', '+repage', '-filter', 'point', '-resize', '38x32>',
    '-gravity', 'south', '-background', 'none', '-extent', '40x38', '-gravity', 'north', '-extent', '40x40', rawCell);
  magick(rawCell, '-alpha', 'extract', '-threshold', '50%', '-define', 'connected-components:keep-top=1',
    '-connected-components', '8', '-auto-level', '-threshold', '0', '-alpha', 'copy', silhouette);
  magick(rawCell, silhouette, '-compose', 'DstIn', '-composite', '-fill', 'none',
    '-draw', 'rectangle 0,36 39,39', '-compose', 'Over', '-trim', '+repage',
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
  if (options.keyline !== false) addCharacterKeylines(rows, sourceFile);
  const full = assembleCharacterRows(rows, sourceFile, blank);
  return { full, rows };
}

function assembleCharacterRows(rows, sourceFile, blank) {
  const rowFiles = rows.map((frames, row) => {
    const file = join(work, `${sourceFile}-row-${row}.png`);
    magick(...frames, ...Array(8 - frames.length).fill(blank), '+append', file);
    return file;
  });
  const full = join(work, `${sourceFile}-atlas.png`);
  magick(...rowFiles, '-append', full);
  return full;
}

function addCharacterKeylines(rows, label) {
  rows.forEach((frames, row) => frames.forEach((cell, frame) => {
    const outlined = join(work, `outlined-${label}-${row}-${frame}.png`);
    addKeyline(cell, outlined, true);
    frames[frame] = outlined;
  }));
}

function restoreRegion(base, transformed, rect, destination) {
  const [x, y, width, height] = rect;
  const region = join(work, `restore-${Math.random().toString(16).slice(2)}.png`);
  magick(base, '-crop', `${width}x${height}+${x}+${y}`, '+repage', region);
  magick(transformed, region, '-geometry', `+${x}+${y}`, '-composite', destination);
}

function rebuildIdleFrame(base, label, immutableRegions) {
  const shifted = join(work, `${label}-idle-shifted.png`);
  const chest = join(work, `${label}-idle-chest.png`);
  const cleared = join(work, `${label}-idle-cleared.png`);
  magick(base, '-crop', '15x15+15+17', '+repage', chest);
  magick(base, '-region', '15x15+15+17', '-channel', 'A', '-evaluate', 'set', '0', '+channel', '+region', cleared);
  magick(cleared, chest, '-geometry', '+15+16', '-composite', shifted);
  let current = shifted;
  immutableRegions.forEach((region, index) => {
    const restored = join(work, `${label}-idle-restored-${index}.png`);
    restoreRegion(base, current, region.rect, restored);
    current = restored;
  });
  return current;
}

function rebuildWalkFrame(base, upperOffset, label, lowerSource) {
  const cleared = join(work, `${label}-walk-cleared.png`);
  const upper = join(work, `${label}-walk-upper.png`);
  const shifted = join(work, `${label}-walk-shifted.png`);
  const lower = join(work, `${label}-walk-lower.png`);
  const lowerCleared = join(work, `${label}-walk-lower-cleared.png`);
  const combined = join(work, `${label}-walk-combined.png`);
  const { lowerBodyRegionY: lowerY, lowerBodyRegionHeight: lowerHeight } = specification.playerMotion.walk;

  // Keep the source pose's upper body and replace only the lower-body region.
  // The two traveling poses come from separately generated right-facing
  // sprites; horizontal flipping is deliberately not part of the walk pass.
  magick(base, '-region', '40x33+0+0', '-channel', 'A', '-evaluate', 'set', '0', '+channel', '+region', cleared);
  magick(base, '-crop', '40x33+0+0', '+repage', upper);
  magick(cleared, upper, '-geometry', `+0${upperOffset >= 0 ? '+' : ''}${upperOffset}`, '-composite', shifted);
  magick(lowerSource, '-crop', `40x${lowerHeight}+0+${lowerY}`, '+repage', lower);
  magick(shifted, '-region', `40x${lowerHeight}+0+${lowerY}`, '-channel', 'A', '-evaluate', 'set', '0', '+channel', '+region', lowerCleared);
  magick(lowerCleared, lower, '-geometry', `+0+${lowerY}`, '-composite',
    '-region', '40x2+0+38', '-channel', 'A', '-evaluate', 'set', '0', '+channel', '+region', combined);
  return combined;
}

function rebuildPlayerMotion(rows, generatedWalkPoses) {
  const idle = specification.playerMotion.idle;
  const walk = specification.playerMotion.walk;
  rows[0][1] = rebuildIdleFrame(rows[0][0], 'idle', idle.immutableRegions);
  rows[6][1] = rebuildIdleFrame(rows[6][0], 'carry-idle', idle.immutableRegions);
  for (const row of [1, 5]) {
    const original = [...rows[row]];
    const baseline = row === 5
      ? walk.carryWalkSourceBaselineCorrectionY
      : walk.walkSourceBaselineCorrectionY;
    const offsets = original.map((_, frame) => baseline[frame]
      + (walk.sideFrames.includes(frame) ? walk.sideUpperBodyOffsetY : 0));
    const lowerSources = [
      generatedWalkPoses.leftFoot,
      original[1],
      generatedWalkPoses.rightFoot,
      original[3],
    ];
    rows[row][0] = rebuildWalkFrame(original[0], offsets[0], `row-${row}-frame-0-left-foot`, lowerSources[0]);
    rows[row][1] = rebuildWalkFrame(original[1], offsets[1], `row-${row}-frame-1-side`, lowerSources[1]);
    rows[row][2] = rebuildWalkFrame(original[2], offsets[2], `row-${row}-frame-2-right-foot`, lowerSources[2]);
    rows[row][3] = rebuildWalkFrame(original[3], offsets[3], `row-${row}-frame-3-side`, lowerSources[3]);
  }
}

function restoreOutlinedIdleInvariants(rows) {
  for (const row of [0, 6]) {
    let current = rows[row][1];
    specification.playerMotion.idle.immutableRegions.forEach((region, index) => {
      const restored = join(work, `outlined-idle-${row}-${index}.png`);
      restoreRegion(rows[row][0], current, region.rect, restored);
      current = restored;
    });
    rows[row][1] = current;
  }
}

function restoreIdleRegionsInAtlas(atlas) {
  let current = atlas;
  for (const row of [0, 6]) {
    for (const [index, region] of specification.playerMotion.idle.immutableRegions.entries()) {
      const [x, y, width, height] = region.rect;
      const pixels = join(work, `atlas-idle-region-${row}-${index}.png`);
      const next = join(work, `atlas-idle-restored-${row}-${index}.png`);
      magick(current, '-crop', `${width}x${height}+${x}+${row * 40 + y}`, '+repage', pixels);
      magick(current, pixels, '-geometry', `+${40 + x}+${row * 40 + y}`, '-composite', next);
      current = next;
    }
  }
  magick(current, '-strip', atlas);
}

function processPlayer() {
  const ownershipSpec = specification.playerOwnership.toolMasks;
  const walk = specification.playerMotion.walk;
  const { rows } = assembleCharacterAtlas(
    'generated-player-animation.png', CHARACTER_FRAMES, 8, [0, 1, 2, 3, 4, 5, 6, 7],
    {
      gridColumns: 8, backgroundFuzz: '8%', keepTopByRow: [1, 1, 2, 2, 1, 1, 1, 1],
      keyline: false,
    },
  );

  // A few source cells contain a small detached dark component near the
  // helmet.  Remove only the recorded orphan rectangle; the remaining source
  // components are retained so a separated swing head is not lost.
  for (const [row, clip] of [[2, 'mine-ready'], [3, 'mine-swing']]) {
    const orphanRects = ownershipSpec.orphanRects[clip];
    for (let frame = 0; frame < rows[row].length; frame += 1) {
      const sourceCell = rows[row][frame];
      const cleaned = join(work, `player-cleaned-${row}-${frame}.png`);
      const clearMask = join(work, `player-clean-mask-${row}-${frame}.png`);
      const args = ['-size', '40x40', 'xc:none', '-fill', 'white'];
      for (const rect of orphanRects[frame] ?? []) {
        const [x, y, width, height] = rect;
        args.push('-draw', `rectangle ${x},${y} ${x + width - 1},${y + height - 1}`);
      }
      args.push(clearMask);
      magick(...args);
      magick(sourceCell, clearMask, '-compose', 'DstOut', '-composite', cleaned);
      rows[row][frame] = cleaned;
    }
  }
  const generatedWalkPoses = {
    leftFoot: extractStandaloneCell(walk.leftFootSource, 'walk-generated-left-foot'),
    rightFoot: extractStandaloneCell(walk.rightFootSource, 'walk-generated-right-foot'),
  };
  rebuildPlayerMotion(rows, generatedWalkPoses);

  // The first and fourth swing source cells crop the pickaxe head at the
  // source-cell boundary.  Reuse the intact frame-2 head at the recorded
  // runtime head anchors and bridge it to the existing handle; this keeps the
  // repair deterministic and leaves level-specific remapping to the material
  // pass below.
  const swingHeadSource = rows[3][2];
  for (const [frame, rect, sourceRect] of [
    [0, [31, 17, 7, 6], [17, 2, 12, 8]],
    [3, [18, 8, 12, 7], [17, 2, 12, 8]],
  ]) {
    const [x, y, width, height] = rect;
    const [sourceX, sourceY, sourceWidth, sourceHeight] = sourceRect;
    const patch = join(work, `player-swing-head-repair-${frame}.png`);
    const repaired = join(work, `player-swing-repaired-${frame}.png`);
    magick(swingHeadSource, '-crop', `${sourceWidth}x${sourceHeight}+${sourceX}+${sourceY}`, '+repage',
      '-filter', 'point', '-resize', `${width}x${height}!`, patch);
    magick(rows[3][frame], patch, '-geometry', `+${x}+${y}`, '-composite', repaired);
    const bridged = join(work, `player-swing-bridged-${frame}.png`);
    if (frame === 0) {
      magick(repaired, '-stroke', '#583828', '-strokewidth', '2', '-draw', 'line 28,24 32,20', bridged);
    } else {
      magick(repaired, '-stroke', '#583828', '-strokewidth', '2', '-draw', 'line 27,14 33,24', bridged);
    }
    rows[3][frame] = bridged;
  }
  addCharacterKeylines(rows, 'player');
  restoreOutlinedIdleInvariants(rows);
  const blank = join(work, 'player-blank.png');
  const full = assembleCharacterRows(rows, 'generated-player-animation.png', blank);
  quantize(full, playerCompositeReference, false, 'character');
  restoreIdleRegionsInAtlas(playerCompositeReference);

  // Pickaxe ownership is intentionally frame-specific.  The source art has the
  // hands touching the handle, so connected-component extraction would assign
  // both materials to the same component.  These conservative rectangles are
  // clipped to the visible pickaxe area below and are kept in the generation
  // spec as the reviewable ownership boundary.
  const toolRects = {
    2: ownershipSpec.toolRects['mine-ready'],
    3: ownershipSpec.toolRects['mine-swing'],
  };
  const headRects = {
    2: ownershipSpec.headRects['mine-ready'],
    3: ownershipSpec.headRects['mine-swing'],
  };
  const makeMask = (name, definitions) => {
    const mask = join(work, `player-${name}-mask.png`);
    const commands = [];
    for (const [rowString, rects] of Object.entries(definitions)) {
      const row = Number(rowString);
      rects.forEach((rect, column) => {
        const [x, y, width, height] = rect;
        commands.push('-draw', `rectangle ${column * 40 + x},${row * 40 + y} ${column * 40 + x + width - 1},${row * 40 + y + height - 1}`);
      });
    }
    magick('-size', '320x320', 'xc:none', '-fill', 'white', ...commands, mask);
    return mask;
  };
  const toolMask = makeMask('tool', toolRects);
  const headRectMask = makeMask('head', headRects);
  const headMask = join(work, 'player-head-mask-clipped.png');
  magick(headRectMask, toolMask, '-compose', 'DstIn', '-composite', headMask);
  const handleMask = join(work, 'player-handle-mask.png');
  magick(toolMask, headMask, '-compose', 'DstOut', '-composite', handleMask);
  const helmetCandidate = makeHelmetOwnershipMask(playerCompositeReference);
  const helmetOnlyCandidate = join(work, 'player-helmet-only-candidate.png');
  magick(helmetCandidate, headRectMask, '-compose', 'DstOut', '-composite', helmetOnlyCandidate);

  const materialPalette = (name, colors) => {
    const file = join(work, `palette-${name}.png`);
    magick(...colors.flatMap((color) => [`xc:${color}`]), '+append', file);
    return file;
  };
  const handlePalette = materialPalette('tool-handle', ['#1c1413', '#392319', '#583828', '#6f4930']);
  const headLevel1Palette = materialPalette('tool-head-level1', ['#140e0c', '#43413e', '#564537', '#655b4f']);
  const headLevel2Palette = materialPalette('tool-head-level2', ['#140e0c', '#43413e', '#655b4f', '#b8a795']);
  const toolLayer = join(work, 'player-tool-layer.png');
  const toolLayerClean = join(work, 'player-tool-layer-clean.png');
  const effectiveToolMask = join(work, 'player-tool-mask-effective.png');
  const handleLayer = join(work, 'player-tool-handle-layer.png');
  const headLayer = join(work, 'player-tool-head-layer.png');
  const handleRemapped = join(work, 'player-tool-handle-remapped.png');
  const headLevel1 = join(work, 'player-tool-head-level1.png');
  const headLevel2 = join(work, 'player-tool-head-level2.png');
  const toolLevel1 = join(work, 'player-tool-level1.png');
  const toolLevel2 = join(work, 'player-tool-level2.png');
  magick(playerCompositeReference, toolMask, '-compose', 'DstIn', '-composite', toolLayer);
  const toolLayerCleanRaw = join(work, 'player-tool-layer-clean-raw.png');
  magick(toolLayer, '-fill', 'none', '-opaque', '#e6a02b', '-opaque', '#d89c67', '-opaque', '#a55b2c', '-opaque', '#b45f2e', toolLayerCleanRaw);
  const toolLayerWithoutHelmet = join(work, 'player-tool-layer-without-helmet.png');
  magick(toolLayerCleanRaw, helmetOnlyCandidate, '-compose', 'DstOut', '-composite', toolLayerWithoutHelmet);
  const applyToolBridges = (input, destination) => {
    const bridgeCommands = [input, '-alpha', 'on', '-fill', '#583828', '-stroke', 'none'];
    for (const [rowString, bridges] of Object.entries(ownershipSpec.toolBridges)) {
      const row = Number(rowString === 'mine-ready' ? 2 : 3);
      bridges.forEach((bridge, frame) => {
        if (bridge.length === 0) return;
        const [x1, y1, x2, y2] = bridge;
        const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
        for (let step = 0; step <= steps; step += 1) {
          const x = frame * 40 + Math.round(x1 + (x2 - x1) * step / steps);
          const y = row * 40 + Math.round(y1 + (y2 - y1) * step / steps);
          bridgeCommands.push('-draw', `rectangle ${x - 1},${y - 1} ${x + 1},${y + 1}`);
        }
      });
    }
    bridgeCommands.push(destination);
    magick(...bridgeCommands);
  };
  const toolLayerWithBridges = join(work, 'player-tool-layer-with-bridges.png');
  applyToolBridges(toolLayerWithoutHelmet, toolLayerWithBridges);
  const toolOrphanMask = join(work, 'player-tool-orphan-mask.png');
  const orphanCommands = ['-size', '320x320', 'xc:none', '-fill', 'white'];
  for (const [rowString, rectsByFrame] of Object.entries(ownershipSpec.toolOrphanRects)) {
    const row = Number(rowString === 'mine-ready' ? 2 : 3);
    rectsByFrame.forEach((rects, frame) => {
      for (const rect of rects) {
        const [x, y, width, height] = rect;
        orphanCommands.push('-draw', `rectangle ${frame * 40 + x},${row * 40 + y} ${frame * 40 + x + width - 1},${row * 40 + y + height - 1}`);
      }
    });
  }
  orphanCommands.push(toolOrphanMask);
  magick(...orphanCommands);
  magick(toolLayerWithBridges, toolOrphanMask, '-compose', 'DstOut', '-composite', toolLayerClean);
  const effectiveToolAlpha = join(work, 'player-tool-mask-effective-alpha.png');
  const effectiveToolMaskRaw = join(work, 'player-tool-mask-effective-raw.png');
  magick(toolLayerClean, '-alpha', 'extract', '-threshold', '50%', effectiveToolAlpha);
  magick('-size', '320x320', 'xc:white', effectiveToolAlpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', effectiveToolMaskRaw);
  magick(effectiveToolMaskRaw, helmetOnlyCandidate, '-compose', 'DstOut', '-composite', effectiveToolMask);
  magick(toolLayerClean, handleMask, '-compose', 'DstIn', '-composite', handleLayer);
  magick(toolLayerClean, headMask, '-compose', 'DstIn', '-composite', headLayer);
  const remapMaterial = (input, paletteFile, destination) => {
    const alpha = join(work, `material-alpha-${Math.random().toString(16).slice(2)}.png`);
    const color = join(work, `material-color-${Math.random().toString(16).slice(2)}.png`);
    magick(input, '-alpha', 'extract', alpha);
    magick(input, '-alpha', 'off', '-colorspace', 'sRGB', '+dither', '-remap', paletteFile, color);
    magick(color, alpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', destination);
  };
  remapMaterial(handleLayer, handlePalette, handleRemapped);
  remapMaterial(headLayer, headLevel1Palette, headLevel1);
  remapMaterial(headLayer, headLevel2Palette, headLevel2);
  const handleRemappedBridged = join(work, 'player-tool-handle-remapped-bridged.png');
  applyToolBridges(handleRemapped, handleRemappedBridged);
  magick(handleRemappedBridged, headLevel1, '-compose', 'Over', '-composite', toolLevel1);
  magick(handleRemappedBridged, headLevel2, '-compose', 'Over', '-composite', toolLevel2);

  // Make the level-1 composite the canonical reference used by body/layer
  // extraction and reassembly checks.  The level-2 bank only replaces head
  // pixels, leaving handle and hand pixels byte-identical.
  const clearedComposite = join(work, 'player-composite-cleared.png');
  const renderedComposite = join(work, 'player-composite-rendered.png');
  magick(playerCompositeReference, effectiveToolMask, '-compose', 'DstOut', '-composite', clearedComposite);
  magick(clearedComposite, toolLevel1, '-compose', 'Over', '-composite', renderedComposite);
  quantize(renderedComposite, playerCompositeReference, false, 'character');

  const compositeWithoutTool = join(work, 'player-composite-without-tool.png');
  magick(playerCompositeReference, effectiveToolMask, '-compose', 'DstOut', '-composite', compositeWithoutTool);

  function makeBandComponentMask(sourceFile, name, bandY, bandHeight, keepTop) {
    const mask = join(work, `player-${name}-mask.png`);
    let current = join(work, `player-${name}-mask-empty.png`);
    magick('-size', '320x320', 'xc:none', current);
    for (const [row, frameCount] of CHARACTER_FRAMES.entries()) {
      for (let frame = 0; frame < frameCount; frame += 1) {
        const x = frame * 40;
        const y = row * 40 + bandY;
        const cell = join(work, `player-${name}-cell-${row}-${frame}.png`);
        const selected = join(work, `player-${name}-selected-${row}-${frame}.png`);
        const next = join(work, `player-${name}-mask-next-${row}-${frame}.png`);
        magick(sourceFile, '-crop', `${40}x${bandHeight}+${x}+${y}`, '+repage', cell);
        selectComponents(cell, selected, keepTop);
        magick(current, selected, '-geometry', `+${x}+${y}`, '-composite', next);
        current = next;
      }
    }
    magick(current, '-strip', mask);
    return mask;
  }

  function makeHelmetOwnershipMask(sourceFile) {
    let current = makeBandComponentMask(sourceFile, 'helmet-candidate-band', 0, 16, 2);
    for (const [row, clip] of [[2, 'mine-ready'], [3, 'mine-swing']]) {
      const definitions = ownershipSpec.helmetRects[clip];
      for (let frame = 0; frame < definitions.length; frame += 1) {
        const x = frame * 40;
        const y = row * 40;
        const cleared = join(work, `player-helmet-cleared-${row}-${frame}.png`);
        const sourceCell = join(work, `player-helmet-source-${row}-${frame}.png`);
        const regionMask = join(work, `player-helmet-region-${row}-${frame}.png`);
        const pixels = join(work, `player-helmet-pixels-${row}-${frame}.png`);
        const next = join(work, `player-helmet-next-${row}-${frame}.png`);
        const cellClearMask = join(work, `player-helmet-cell-clear-mask-${row}-${frame}.png`);
        magick('-size', '320x320', 'xc:none', '-fill', 'white',
          '-draw', `rectangle ${x},${y} ${x + 39},${y + 39}`, cellClearMask);
        magick(current, cellClearMask, '-compose', 'DstOut', '-composite', cleared);
        magick(sourceFile, '-crop', `40x40+${x}+${y}`, '+repage', sourceCell);
        const [rectX, rectY, rectWidth, rectHeight] = definitions[frame];
        magick('-size', '40x40', 'xc:none', '-fill', 'white',
          '-draw', `rectangle ${rectX},${rectY} ${rectX + rectWidth - 1},${rectY + rectHeight - 1}`, regionMask);
        magick(sourceCell, regionMask, '-compose', 'DstIn', '-composite', pixels);
        magick(cleared, pixels, '-geometry', `+${x}+${y}`, '-composite', next);
        current = next;
      }
    }
    for (const [row, clip] of [[2, 'mine-ready'], [3, 'mine-swing']]) {
      const orphanRects = ownershipSpec.helmetOrphanRects[clip];
      for (let frame = 0; frame < orphanRects.length; frame += 1) {
        const x = frame * 40;
        const y = row * 40;
        const rects = orphanRects[frame] ?? [];
        if (rects.length === 0) continue;
        const next = join(work, `player-helmet-orphans-cleared-${row}-${frame}.png`);
        const clearMask = join(work, `player-helmet-orphan-mask-${row}-${frame}.png`);
        const args = ['-size', '320x320', 'xc:none', '-fill', 'white'];
        for (const rect of rects) {
          const [rectX, rectY, rectWidth, rectHeight] = rect;
          args.push('-draw', `rectangle ${x + rectX},${y + rectY} ${x + rectX + rectWidth - 1},${y + rectY + rectHeight - 1}`);
        }
        args.push(clearMask);
        magick(...args);
        magick(current, clearMask, '-compose', 'DstOut', '-composite', next);
        current = next;
      }
    }
    return current;
  }


  function makeRectangleMask(name, definitions) {
    const mask = join(work, `player-${name}-mask.png`);
    const commands = [];
    for (const [rowString, rects] of Object.entries(definitions)) {
      const row = Number(rowString);
      rects.forEach((rect, column) => {
        const [x, y, width, height] = rect;
        commands.push('-draw', `rectangle ${column * 40 + x},${row * 40 + y} ${column * 40 + x + width - 1},${row * 40 + y + height - 1}`);
      });
    }
    magick('-size', '320x320', 'xc:none', '-fill', 'white', ...commands, mask);
    return mask;
  }

  // Helmet and lamp use the protected frame-local mask above.  Boots are
  // extracted from the five-pixel contact band, so legs and the swinging tool
  // cannot claim the whole 40px row.
  const helmetMask = helmetOnlyCandidate;
  const bootsMask = makeBandComponentMask(compositeWithoutTool, 'boots', 33, 5, 2);
  const packDefinitions = {};
  CHARACTER_FRAMES.forEach((frameCount, row) => {
    packDefinitions[row] = Array.from({ length: frameCount }, () => [16, 16, 15, 17]);
  });
  const packMask = makeRectangleMask('pack', packDefinitions);
  const masks = { helmet: helmetMask, pack: packMask, boots: bootsMask };
  const nonBodyMask = join(work, 'player-non-body-mask.png');
  magick('-size', '320x320', 'xc:none', helmetMask, '-composite', packMask, '-composite', bootsMask, '-composite', nonBodyMask);
  const body = join(work, 'player-body.png');
  magick(compositeWithoutTool, nonBodyMask, '-compose', 'DstOut', '-composite', body);
  quantize(body, join(output, 'player-body-atlas.png'), false, 'character');

  function layer(name, tint, destination, doubleBank = false) {
    if (name === 'tool') {
      const atlas = join(work, 'player-tool-banks.png');
      magick(toolLevel1, toolLevel2, '+append', atlas);
      quantize(atlas, join(output, destination), false, 'character');
      return;
    }
    const layerFile = join(work, `player-${name}-layer.png`);
    const mask = masks[name];
    magick(playerCompositeReference, mask, '-compose', 'DstIn', '-composite', layerFile);
    if (!doubleBank) {
      quantize(layerFile, join(output, destination), false, 'character');
      return;
    }
    const variant = join(work, `player-${name}-variant.png`);
    magick(layerFile, '-fill', tint, '-colorize', '38%', variant);
    const atlas = join(work, `player-${name}-banks.png`);
    magick(layerFile, variant, '+append', atlas);
    quantize(atlas, join(output, destination), false, 'character');
  }
  layer('helmet', '#d89c67', 'player-helmet-atlas.png');
  layer('tool', '#b8a795', 'player-tool-atlas.png', true);
  layer('pack', '#916a4e', 'player-pack-atlas.png', true);
  layer('boots', '#b8a795', 'player-boots-atlas.png', true);
}

function processNpcAtlas(sourceFile, sourceFrames, targetRows, destination, options = {}) {
  const { full } = assembleCharacterAtlas(sourceFile, sourceFrames, sourceFrames.length, targetRows, options);
  if (!options.banks) {
    quantize(full, join(output, destination), options.includeReserved ?? false, 'character');
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
  quantize(banked, join(output, destination), options.includeReserved ?? false, 'character');
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
  const minerBanks = [playerCompositeReference];
  for (const tint of ['#d89c67', '#916a4e', '#e6a02b']) {
    const variant = join(work, `crew-miner-${tint.replace('#', '')}.png`);
    magick(playerCompositeReference, '-fill', tint, '-colorize', '10%', variant);
    minerBanks.push(variant);
  }
  const minerAtlas = join(work, 'npc-crew-miner-banks.png');
  magick(...minerBanks, '+append', minerAtlas);
  quantize(minerAtlas, join(output, 'npc-crew-miner-atlas.png'), false, 'character');
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
  addCharacterKeylines(engineerRows, 'engineer');
  const blank = join(work, 'engineer-blank.png');
  magick('-size', '40x40', 'xc:none', blank);
  const rowFiles = engineerRows.map((frames, row) => {
    const file = join(work, `engineer-row-${row}.png`);
    magick(...frames, ...Array(4 - frames.length).fill(blank), '+append', file);
    return file;
  });
  const atlas = join(work, 'engineer-atlas.png');
  magick(...rowFiles, '-append', atlas);
  quantize(atlas, join(output, 'npc-engineer-atlas.png'), false, 'character');
}

function processCargo() {
  const cells = [];
  for (const [frame, definition] of specification.cargoCells.entries()) {
    const [x, y, width, height] = definition.crop;
    const [targetWidth, targetHeight] = definition.targetBounds;
    const raw = join(work, `cargo-raw-${frame}.png`);
    const selected = join(work, `cargo-selected-${frame}.png`);
    const trimmed = join(work, `cargo-trimmed-${frame}.png`);
    const positioned = join(work, `cargo-positioned-${frame}.png`);
    const outlined = join(work, `cargo-outlined-${frame}.png`);
    magick(join(source, 'generated-cargo-items.png'), '-crop', `${width}x${height}+${x}+${y}`, '+repage', raw);
    selectLargestComponent(raw, selected);
    magick(selected, '-trim', '+repage', '-filter', 'point', '-resize', `${targetWidth - 2}x${targetHeight - 2}!`, trimmed);
    magick(trimmed, '-gravity', 'south', '-background', 'none', '-extent', '12x9', '-gravity', 'north', '-extent', '12x10', positioned);
    addKeyline(positioned, outlined);
    cells.push(outlined);
  }
  const atlas = join(work, 'cargo-items-atlas.png');
  magick(...cells, '+append', atlas);
  quantize(atlas, join(output, 'cargo-items-atlas.png'), false, 'cargo');
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
  const canonicalComposite = join(work, 'validate-player-composite-canonical.png');
  const canonicalReference = join(work, 'validate-player-reference-canonical.png');
  const compositeAlpha = join(work, 'validate-player-composite-alpha.png');
  const referenceAlpha = join(work, 'validate-player-reference-alpha.png');
  magick(composite, '-alpha', 'extract', compositeAlpha);
  magick(playerCompositeReference, '-alpha', 'extract', referenceAlpha);
  magick('-size', '320x320', 'xc:#000000', compositeAlpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', canonicalComposite);
  magick('-size', '320x320', 'xc:#000000', referenceAlpha, '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', canonicalReference);
  const compositeDifference = Number(execFileSync('magick', [
    canonicalComposite, canonicalReference, '-compose', 'difference', '-composite', '-format', '%[fx:mean]', 'info:',
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
