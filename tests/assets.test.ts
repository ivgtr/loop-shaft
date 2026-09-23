import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../src/render/assets/assetStore';
import {
  D001_ASSET_FILES,
  D001_ASSET_VERSION,
  D001_FALLBACK_GROUPS,
  d001AssetUrls,
} from '../src/render/assets/d001Manifest';

describe('D-001 assets', () => {
  it('ships every runtime manifest entry as a nonempty PNG', () => {
    // Cheap packaging guard. Palette, anchor and authored-pixel checks are opt-in.
    for (const name of Object.values(D001_ASSET_FILES)) {
      const png = readFileSync(new URL(`../public/assets/d001/runtime/${name}`, import.meta.url));
      expect(png.subarray(0, 8), name).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(png.readUInt32BE(16), name).toBeGreaterThan(0);
      expect(png.readUInt32BE(20), name).toBeGreaterThan(0);
    }
  });

  it('version-tags runtime URLs so changed PNGs bypass the browser cache', () => {
    const urls = Object.values(d001AssetUrls());
    expect(urls).toHaveLength(Object.keys(D001_ASSET_FILES).length);
    expect(urls.every((url) => url.endsWith(`?v=${D001_ASSET_VERSION}`))).toBe(true);
  });

  it('does not couple independent fallback groups through shared assets', () => {
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
