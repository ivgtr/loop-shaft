import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../src/render/assets/assetStore';
import { D001_ASSET_FILES, D001_FALLBACK_GROUPS } from '../src/render/assets/d001Manifest';

describe('D-001 assets', () => {
  it('matches every generated PNG to the generation specification dimensions', () => {
    const root = resolve(import.meta.dirname, '..');
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
