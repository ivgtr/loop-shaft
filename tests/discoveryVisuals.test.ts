import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import source from '../art/discovery/sprites.json';
import { AssetStore } from '../src/render/assets/assetStore';
import { drawDiscoveryArt, type CargoFrame, type TraceFrame } from '../src/render/assets/discoveryArt';
import { cargoFrame, drawCarriedCargo, drawCompactCargo, drawLiftCargo, drawPhysicalCargo } from '../src/render/cargoRenderer';
import { discoveryFrame, drawDiscoveryCues } from '../src/render/discoveryCues';
import { createGameState } from '../src/game/createGame';
import { advanceProspecting, floorProspects } from '../src/game/prospecting';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { deriveSemanticRenderState } from '../src/render/semanticRenderState';
import { loot } from './fixtures/discovery';

function raster(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 4);
  const ctx = {
    fillStyle: '', save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
    fillRect(x: number, y: number, w: number, h: number) {
      const ink = this.fillStyle.slice(1);
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const offset = (yy * width + xx) * 4;
        for (let c = 0; c < 3; c++) pixels[offset + c] = parseInt(ink.slice(c * 2, c * 2 + 2), 16);
        pixels[offset + 3] = 255;
      }
    },
  };
  return { pixels, ctx: ctx as unknown as CanvasRenderingContext2D };
}
// Generated PNGs intentionally use filter 0, RGBA8; fail rather than silently ignore another format.
function pngPixels(bank: 'cargo' | 'traces') {
  const png = readFileSync(new URL(`../src/render/assets/discovery-${bank}.png`, import.meta.url));
  const width = png.readUInt32BE(16); const height = png.readUInt32BE(20);
  expect([...png.subarray(24, 29)]).toEqual([8, 6, 0, 0, 0]);
  const chunks: Buffer[] = [];
  for (let p = 8; p < png.length;) {
    const size = png.readUInt32BE(p);
    if (png.toString('ascii', p + 4, p + 8) === 'IDAT') chunks.push(png.subarray(p + 8, p + 8 + size));
    p += 12 + size;
  }
  const raw = inflateSync(Buffer.concat(chunks)); const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    expect(raw[y * (width * 4 + 1)]).toBe(0);
    raw.copy(pixels, y * width * 4, y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1));
  }
  return { width, height, pixels };
}

it('rebuilds both committed PNGs byte-for-byte with no external image tools', () => {
  expect(execFileSync(process.execPath, ['scripts/build-discovery-assets.mjs', '--check'], { encoding: 'utf8' })).toContain('19 frames');
});
for (const bank of ['traces', 'cargo'] as const) describe(`${bank} pixel source and atlas`, () => {
  const definition = source[bank]; const atlas = pngPixels(bank);
  const entries = Object.entries(definition.frames);
  it('uses only the existing palette and binary alpha, within the declared atlas dimensions', () => {
    const palette = JSON.parse(readFileSync(new URL('../art/d001/palette.json', import.meta.url), 'utf8')).colors;
    expect(atlas.width).toBe(definition.width * definition.columns);
    expect(atlas.height).toBe(Math.ceil(entries.length / definition.columns) * definition.height);
    for (let i = 0; i < atlas.pixels.length; i += 4) {
      expect([0, 255]).toContain(atlas.pixels[i + 3]);
      if (atlas.pixels[i + 3]) expect(palette).toContain(`#${atlas.pixels.subarray(i, i + 3).toString('hex')}`);
    }
  });
  it.each(entries)('%s keeps the exact same pixels while loading or on image failure', (name, _rows) => {
    const index = entries.findIndex(([key]) => key === name);
    const loading = new AssetStore({ traces: '/traces.png', cargo: '/cargo.png' }, null);
    const images: HTMLImageElement[] = [];
    const failed = new AssetStore({ traces: '/traces.png', cargo: '/cargo.png' }, () => {
      const image = { src: '', onerror: null, onload: null } as unknown as HTMLImageElement; images.push(image); return image;
    });
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    failed.preload(); images.forEach((image) => image.onerror!(new Event('error'))); warning.mockRestore();
    expect(failed.get(bank).state).toBe('error');
    for (const assets of [loading, failed]) {
      const output = raster(definition.width, definition.height);
      drawDiscoveryArt(output.ctx, bank, name as TraceFrame | CargoFrame, 0.1, -0.1, assets);
      for (let y = 0; y < definition.height; y++) {
        const start = (((Math.floor(index / definition.columns) * definition.height + y) * atlas.width) + (index % definition.columns) * definition.width) * 4;
        expect(output.pixels.subarray(y * definition.width * 4, (y + 1) * definition.width * 4)).toEqual(atlas.pixels.subarray(start, start + definition.width * 4));
      }
    }
  });
  it('uses integer, bounded source rectangles and the image path after decode', () => {
    const images: HTMLImageElement[] = [];
    const assets = new AssetStore({ traces: '/traces.png', cargo: '/cargo.png' }, () => {
      const image = { src: '', onload: null, onerror: null } as unknown as HTMLImageElement; images.push(image); return image;
    });
    assets.preload(); images.forEach((image) => image.onload!(new Event('load')));
    entries.forEach(([name], index) => {
      const { ctx } = raster(1, 1);
      drawDiscoveryArt(ctx, bank, name as TraceFrame | CargoFrame, 3.4, 7.6, assets);
      expect(ctx.drawImage).toHaveBeenCalledWith(images[bank === 'traces' ? 0 : 1], (index % definition.columns) * definition.width,
        Math.floor(index / definition.columns) * definition.height, definition.width, definition.height, 3, 8, definition.width, definition.height);
    });
  });
});

it('maps every public stage and remaining-work state, without a cosmetic clock', () => {
  for (const signal of ['METAL', 'FOSSIL', 'RESEARCH'] as const) {
    const prefix = signal.toLowerCase();
    expect(discoveryFrame({ signal, stage: 'SEALED', remaining: 3 })).toBe(`${prefix}-sealed`);
    expect(discoveryFrame({ signal, stage: 'EXPOSED', remaining: 2 })).toBe(`${prefix}-exposed`);
    expect(discoveryFrame({ signal, stage: 'EXPOSED', remaining: 1 })).toBe(`${prefix}-nearly`);
    expect(discoveryFrame({ signal, stage: 'SPENT', remaining: 0 })).toBe(`${prefix}-spent`);
    const spent = source.traces.frames[`${prefix}-spent` as TraceFrame].join('');
    expect(spent).not.toMatch(/[ghq]/); // no active gold, fossil or crystal highlights on an empty cavity
  }
});
it('keeps undiscovered clues invisible, and spent clues persistent through regeneration and reload', () => {
  let state = createGameState(81); const floor = state.run.floors['D-001'];
  const initial = raster(480, 270); drawDiscoveryCues(initial.ctx, state, deriveSemanticRenderState(state, 0));
  expect(initial.pixels.some((v) => v !== 0)).toBe(false);
  for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
  const prospect = floorProspects(floor)[0]!; const node = floor.nodes.find((n) => n.id === prospect.nodeId)!;
  for (let i = 0; i < prospect.required; i++) advanceProspecting(floor, node);
  const before = serializeGameState(state); const a = raster(480, 270);
  drawDiscoveryCues(a.ctx, state, deriveSemanticRenderState(state, 0));
  expect(serializeGameState(state)).toBe(before);
  node.hp = 0; node.respawnTimer = 2;
  const b = raster(480, 270); drawDiscoveryCues(b.ctx, state, deriveSemanticRenderState(state, 200000)); expect(b.pixels.equals(a.pixels)).toBe(true);
  state = restoreGameState(serializeGameState(state))!;
  const c = raster(480, 270); drawDiscoveryCues(c.ctx, state, deriveSemanticRenderState(state, 400000)); expect(c.pixels.equals(a.pixels)).toBe(true);
});
it('separates quality by silhouette, not just hue, and renders unknown specimens identically', () => {
  for (const kind of ['stone', 'iron', 'copper'] as const) {
    const silhouettes = ['normal', 'fine', 'pure'].map((grade) => source.cargo.frames[`${kind}-${grade}` as CargoFrame].join('').replace(/[^.]/g, 'x'));
    expect(new Set(silhouettes).size).toBe(3);
  }
  const fingerprints = [];
  for (const kind of ['TRILOBITE', 'AMMONITE', 'ANCIENT_FISH', 'REPTILE_TOOTH', 'STRANGE_VERTEBRA'] as const) for (const grade of ['INTACT', 'PRISTINE'] as const) {
    const item = loot(kind); item.specimen = { grade, value: grade === 'INTACT' ? 63 : 270 };
    expect(cargoFrame(item)).toBe('specimen');
    const output = raster(12, 10); drawPhysicalCargo(output.ctx, item, 6, 10); fingerprints.push(output.pixels.toString('hex'));
  }
  expect(new Set(fingerprints).size).toBe(1);
});
it('never invents cargo for empty carriers/containers, and places the first real item in front', () => {
  const empty = raster(80, 80); const actor = { carried: [], facing: 1 as const, worldAnchor: { x: 40, y: 60 } };
  drawCarriedCargo(empty.ctx, actor); drawLiftCargo(empty.ctx, [], 40, 60); drawCompactCargo(empty.ctx, [], 40, 60);
  expect(empty.pixels.some((v) => v !== 0)).toBe(false);
  const first = loot('IRON'); first.quality = 'PURE';
  const pile = raster(80, 80); const solo = raster(80, 80);
  drawCompactCargo(pile.ctx, [first, loot('COPPER'), loot('STONE')], 40, 60); drawPhysicalCargo(solo.ctx, first, 40, 60);
  for (let i = 0; i < solo.pixels.length; i += 4) if (solo.pixels[i + 3]) expect(pile.pixels.subarray(i, i + 4)).toEqual(solo.pixels.subarray(i, i + 4));
});
