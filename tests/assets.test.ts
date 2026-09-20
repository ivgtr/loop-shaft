import { describe, expect, it, vi } from 'vitest';
import { AssetStore } from '../src/render/assets/assetStore';
import {
  D001_ASSET_FILES,
  D001_ASSET_VERSION,
  D001_FALLBACK_GROUPS,
  d001AssetUrls,
} from '../src/render/assets/d001Manifest';

describe('D-001 assets', () => {
  it('version-tags runtime URLs so changed PNGs bypass the browser cache', () => {
    const urls = Object.values(d001AssetUrls());
    expect(urls).toHaveLength(Object.keys(D001_ASSET_FILES).length);
    expect(urls.every((url) => url.endsWith(`?v=${D001_ASSET_VERSION}`))).toBe(true);
  });

  it('keeps Player, each NPC role and Cargo as independent fallback groups', () => {
    expect(Object.keys(D001_FALLBACK_GROUPS)).toEqual([
      'player', 'porter', 'crewMiner', 'crewPorter', 'engineer', 'cargo',
      'elevator', 'rope', 'surfaceJunction', 'shaftBottom',
    ]);
    expect(D001_FALLBACK_GROUPS.player).toHaveLength(5);
    for (const group of ['porter', 'crewMiner', 'crewPorter', 'engineer', 'cargo'] as const) {
      expect(D001_FALLBACK_GROUPS[group]).toHaveLength(1);
    }
    for (const group of ['elevator', 'rope', 'surfaceJunction', 'shaftBottom'] as const) {
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
