import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../src/render/assets/assetStore';
import { D001_ASSET_FILES, D001_FALLBACK_GROUPS } from '../src/render/assets/d001Manifest';

const root = resolve(import.meta.dirname, '..');
const runtime = resolve(root, 'public/assets/d001/runtime');

function opaqueBounds(path: string, crop?: string): [number, number, number, number] {
  const args = [path, ...(crop ? ['-crop', crop, '+repage'] : []), '-format', '%@', 'info:'];
  const value = execFileSync('magick', args, { encoding: 'utf8' }).trim();
  const match = value.match(/^(\d+)x(\d+)\+(\d+)\+(\d+)$/);
  if (!match) throw new Error(`Cannot read opaque bounds for ${path}: ${value}`);
  return match.slice(1).map(Number) as [number, number, number, number];
}

function contactXs(path: string, frame: number, row: number): number[] {
  const text = execFileSync('magick', [
    path, '-crop', `40x40+${frame * 40}+${row * 40}`, '+repage', '-crop', '40x1+0+37', '+repage', 'txt:-',
  ], { encoding: 'utf8' });
  return [...text.matchAll(/^(\d+),0:.*#[0-9A-F]{8}/gm)]
    .filter((match) => !match[0].includes('#00000000'))
    .map((match) => Number(match[1]));
}

describe('D-001 assets', () => {
  it('matches every generated PNG to the generation specification dimensions', () => {
    const specification = JSON.parse(readFileSync(resolve(root, 'art/d001/generation-spec.json'), 'utf8')) as {
      runtimeAssets: Array<{ file: string; size: [number, number] }>;
    };
    const palette = JSON.parse(readFileSync(resolve(root, 'art/d001/palette.json'), 'utf8')) as {
      colors: string[];
    };
    expect(specification.runtimeAssets.map((asset) => asset.file).sort())
      .toEqual(Object.values(D001_ASSET_FILES).sort());
    for (const asset of specification.runtimeAssets) {
      const bytes = readFileSync(resolve(root, 'public/assets/d001/runtime', asset.file));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(asset.size);
      const alpha = execFileSync('magick', [
        resolve(root, 'public/assets/d001/runtime', asset.file), '-alpha', 'extract', '-unique-colors', 'txt:-',
      ], { encoding: 'utf8' });
      const values = [...alpha.matchAll(/gray\((\d+)\)/g)].map((match) => Number(match[1]));
      expect(values.every((value) => value === 0 || value === 255)).toBe(true);
      const colors = execFileSync('magick', [
        resolve(root, 'public/assets/d001/runtime', asset.file), '-alpha', 'off', '-unique-colors', 'txt:-',
      ], { encoding: 'utf8' });
      const allowedCount = ['npc-porter-atlas.png', 'npc-crew-porter-atlas.png'].includes(asset.file) ? 32 : 30;
      const allowed = new Set(palette.colors.slice(0, allowedCount).map((color) => color.toUpperCase()));
      allowed.add('#000000'); // canonical RGB stored below fully transparent pixels
      const opaqueColors = [...colors.matchAll(/#[0-9A-Fa-f]{6}/g)].map((match) => match[0]!.toUpperCase());
      expect(opaqueColors.every((color) => allowed.has(color)), `${asset.file} uses the shared palette`).toBe(true);
    }
  });

  it('keeps fixed shaft and tunnel regions present at their logical destinations', () => {
    const shaft = resolve(runtime, 'background-shaft-back.png');
    const tunnel = resolve(runtime, 'background-tunnel-back.png');
    const structure = resolve(runtime, 'background-tunnel-structure.png');
    expect(opaqueBounds(shaft)).toEqual([49, 196, 216, 38]);
    expect(opaqueBounds(tunnel)).toEqual([436, 45, 22, 183]);
    expect(opaqueBounds(structure)).toEqual([436, 48, 22, 180]);

    for (const crop of ['194x45+22+183', '193x45+265+183']) {
      const alphaMean = Number(execFileSync('magick', [
        tunnel, '-crop', crop, '+repage', '-alpha', 'extract', '-format', '%[fx:mean]', 'info:',
      ], { encoding: 'utf8' }));
      expect(alphaMean).toBe(1);
    }
    for (const crop of ['194x8+22+180', '193x8+265+180']) {
      const beamCoverage = Number(execFileSync('magick', [
        structure, '-crop', crop, '+repage', '-alpha', 'extract', '-format', '%[fx:mean]', 'info:',
      ], { encoding: 'utf8' }));
      expect(beamCoverage).toBeGreaterThan(0.35);
    }
  });

  it('grounds every mining node frame in its cell', () => {
    for (const file of [
      'node-scrap-ledge-atlas.png',
      'node-copper-pocket-atlas.png',
      'node-fossil-crack-atlas.png',
    ]) {
      for (let frame = 0; frame < 4; frame += 1) {
        const [, height, , y] = opaqueBounds(resolve(runtime, file), `48x40+${frame * 48}+0`);
        expect(y + height - 1, `${file} frame ${frame} is grounded`).toBe(39);
      }
    }
  });

  it('keeps every Workshop layer above its shared contact row', () => {
    const workbench = resolve(runtime, 'workbench-atlas.png');
    for (let frame = 0; frame < 7; frame += 1) {
      const [, height, , y] = opaqueBounds(workbench, `32x32+${frame * 32}+0`);
      expect(y + height - 1, `Workshop frame ${frame} contact`).toBe(26);
    }
  });

  it('keeps all Cargo classes large, grounded and silhouette-distinct', () => {
    const cargo = resolve(runtime, 'cargo-items-atlas.png');
    const silhouettes = new Set<string>();
    for (let frame = 0; frame < 12; frame += 1) {
      const [width, height, , y] = opaqueBounds(cargo, `12x10+${frame * 12}+0`);
      expect(width).toBeGreaterThanOrEqual(7);
      expect(height).toBeGreaterThanOrEqual(6);
      expect(y + height - 1).toBe(9);
      const hash = execFileSync('magick', [
        cargo, '-crop', `12x10+${frame * 12}+0`, '+repage', '-alpha', 'extract', '-format', '%#', 'info:',
      ], { encoding: 'utf8' }).trim();
      silhouettes.add(hash);
    }
    expect(silhouettes.size).toBe(12);
  });

  it('keeps idle invariants and planted walk feet stable in world space', () => {
    const temporary = mkdtempSync(join(tmpdir(), 'loop-shaft-assets-test-'));
    const composite = join(temporary, 'player-composite.png');
    try {
      execFileSync('magick', [
        '-size', '320x320', 'xc:none',
        '(', resolve(runtime, 'player-pack-atlas.png'), '-crop', '320x320+0+0', '+repage', ')', '-composite',
        resolve(runtime, 'player-body-atlas.png'), '-composite',
        '(', resolve(runtime, 'player-boots-atlas.png'), '-crop', '320x320+0+0', '+repage', ')', '-composite',
        '(', resolve(runtime, 'player-tool-atlas.png'), '-crop', '320x320+0+0', '+repage', ')', '-composite',
        resolve(runtime, 'player-helmet-atlas.png'), '-composite', composite,
      ]);
      for (const region of ['20x10+10+7', '40x5+0+33', '5x12+12+18']) {
        const difference = execFileSync('magick', [
          '(', composite, '-crop', '40x40+0+0', '+repage', '-crop', region, '+repage',
          '-background', '#08080b', '-alpha', 'remove', ')',
          '(', composite, '-crop', '40x40+40+0', '+repage', '-crop', region, '+repage',
          '-background', '#08080b', '-alpha', 'remove', ')',
          '-compose', 'difference', '-composite', '-threshold', '0', '-format', '%[fx:mean]', 'info:',
        ], { encoding: 'utf8' });
        expect(Number(difference)).toBe(0);
      }
      for (const row of [1, 5]) {
        for (const [first, second] of [[0, 1], [2, 3]] as const) {
          const firstContact = contactXs(composite, first, row);
          const secondContact = contactXs(composite, second, row);
          expect(firstContact.length).toBeGreaterThan(0);
          expect(secondContact.length).toBeGreaterThan(0);
          const firstCenter = firstContact.reduce((sum, x) => sum + x, 0) / firstContact.length;
          const secondCenter = secondContact.reduce((sum, x) => sum + x, 0) / secondContact.length;
          expect(firstCenter - secondCenter).toBe(4);
        }
      }
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it('keeps Player, each NPC role and Cargo as independent fallback groups', () => {
    expect(Object.keys(D001_FALLBACK_GROUPS)).toEqual([
      'player', 'porter', 'crewMiner', 'crewPorter', 'engineer', 'cargo',
    ]);
    expect(D001_FALLBACK_GROUPS.player).toHaveLength(5);
    for (const group of ['porter', 'crewMiner', 'crewPorter', 'engineer', 'cargo'] as const) {
      expect(D001_FALLBACK_GROUPS[group]).toHaveLength(1);
    }
    const keys = Object.values(D001_FALLBACK_GROUPS).flat();
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('caches loading, ready and error independently by URL', () => {
    const images: Array<HTMLImageElement & { trigger: (result: 'load' | 'error') => void }> = [];
    const factory = () => {
      const image = {
        src: '', onload: null, onerror: null,
        trigger(result: 'load' | 'error') {
          if (result === 'load') this.onload?.(new Event('load'));
          else this.onerror?.(new Event('error'));
        },
      } as unknown as HTMLImageElement & { trigger: (result: 'load' | 'error') => void };
      images.push(image);
      return image;
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const store = new AssetStore({ player: '/player.png', elevator: '/elevator.png' }, factory);
    store.preload();
    store.preload();
    expect(images).toHaveLength(2);
    expect(store.get('player').state).toBe('loading');
    images[0]!.trigger('load');
    images[1]!.trigger('error');
    expect(store.get('player').state).toBe('ready');
    expect(store.get('elevator').state).toBe('error');
    expect(store.groupReady(['player'])).toBe(true);
    expect(store.groupReady(['player', 'elevator'])).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
