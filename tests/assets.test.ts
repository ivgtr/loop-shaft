import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../src/render/assets/assetStore';
import { D001_ASSET_FILES } from '../src/render/assets/d001Manifest';

describe('D-001 assets', () => {
  it('matches every generated PNG to the generation specification dimensions', () => {
    const root = resolve(import.meta.dirname, '..');
    const specification = JSON.parse(readFileSync(resolve(root, 'art/d001/generation-spec.json'), 'utf8')) as {
      runtimeAssets: Array<{ file: string; size: [number, number] }>;
    };
    expect(specification.runtimeAssets.map((asset) => asset.file).sort())
      .toEqual(Object.values(D001_ASSET_FILES).sort());
    for (const asset of specification.runtimeAssets) {
      const bytes = readFileSync(resolve(root, 'public/assets/d001/runtime', asset.file));
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual(asset.size);
    }
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
