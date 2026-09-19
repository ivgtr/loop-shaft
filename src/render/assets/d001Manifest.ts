export type D001AssetKey = keyof typeof D001_ASSET_FILES;

export const D001_ASSET_FILES = {
  backgroundRock: 'background-rock-base.png',
  backgroundTunnel: 'background-tunnel-back.png',
  backgroundSurface: 'background-surface-station.png',
  backgroundShaft: 'background-shaft-back.png',
  backgroundStructure: 'background-tunnel-structure.png',
  backgroundFloor: 'background-floor.png',
  playerBody: 'player-body-atlas.png',
  playerHelmet: 'player-helmet-atlas.png',
  playerTool: 'player-tool-atlas.png',
  playerPack: 'player-pack-atlas.png',
  playerBoots: 'player-boots-atlas.png',
  nodeScrapLedge: 'node-scrap-ledge-atlas.png',
  nodeCopperPocket: 'node-copper-pocket-atlas.png',
  nodeFossilCrack: 'node-fossil-crack-atlas.png',
  workbench: 'workbench-atlas.png',
  elevator: 'central-elevator-atlas.png',
} as const;

export const D001_BACKGROUND_KEYS = [
  'backgroundRock', 'backgroundTunnel', 'backgroundSurface', 'backgroundShaft', 'backgroundStructure', 'backgroundFloor',
] as const satisfies readonly D001AssetKey[];

export const D001_PLAYER_KEYS = [
  'playerBody', 'playerHelmet', 'playerTool', 'playerPack', 'playerBoots',
] as const satisfies readonly D001AssetKey[];

export const D001_NODE_ASSETS = {
  'scrap-ledge': 'nodeScrapLedge',
  'copper-pocket': 'nodeCopperPocket',
  'fossil-crack': 'nodeFossilCrack',
} as const satisfies Record<string, D001AssetKey>;

export function d001AssetUrl(key: D001AssetKey): string {
  return `${import.meta.env.BASE_URL}assets/d001/runtime/${D001_ASSET_FILES[key]}`;
}

export function d001AssetUrls(): Record<D001AssetKey, string> {
  return Object.fromEntries(
    (Object.keys(D001_ASSET_FILES) as D001AssetKey[]).map((key) => [key, d001AssetUrl(key)]),
  ) as Record<D001AssetKey, string>;
}
