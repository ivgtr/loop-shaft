import { AssetStore } from './assetStore';
import { d001AssetUrls, type D001AssetKey } from './d001Manifest';
let shared: AssetStore<D001AssetKey> | undefined;
/** World and Canvas archive share requests, errors and ready images. */
export function gameAssets(): AssetStore<D001AssetKey> {
  if (!shared) { shared = new AssetStore(d001AssetUrls()); shared.preload(); }
  return shared;
}
