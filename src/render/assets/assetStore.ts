export type AssetRecord =
  | { readonly state: 'loading' }
  | { readonly state: 'ready'; readonly image: HTMLImageElement }
  | { readonly state: 'error'; readonly error: unknown };

type ImageFactory = () => HTMLImageElement;

export class AssetStore<Key extends string> {
  private readonly records = new Map<Key, AssetRecord>();
  private readonly warned = new Set<Key>();
  private readonly requested = new Set<Key>();

  constructor(
    private readonly urls: Readonly<Record<Key, string>>,
    private readonly imageFactory: ImageFactory | null = typeof Image === 'undefined' ? null : () => new Image(),
  ) {
    for (const key of Object.keys(urls) as Key[]) this.records.set(key, { state: 'loading' });
  }

  preload(): void {
    if (!this.imageFactory) return;
    for (const key of Object.keys(this.urls) as Key[]) {
      const current = this.records.get(key);
      if (current?.state !== 'loading' || this.requested.has(key)) continue;
      this.requested.add(key);
      const image = this.imageFactory();
      image.onload = () => this.records.set(key, { state: 'ready', image });
      image.onerror = (error) => {
        this.records.set(key, { state: 'error', error });
        if (this.warned.has(key)) return;
        this.warned.add(key);
        console.warn(`LOOP SHAFT asset failed to load: ${this.urls[key]}`);
      };
      image.src = this.urls[key];
    }
  }

  get(key: Key): AssetRecord {
    return this.records.get(key) ?? { state: 'error', error: new Error(`Unknown asset: ${key}`) };
  }

  ready(key: Key): HTMLImageElement | null {
    const record = this.get(key);
    return record.state === 'ready' ? record.image : null;
  }

  groupReady(keys: readonly Key[]): boolean {
    return keys.every((key) => this.get(key).state === 'ready');
  }
}
