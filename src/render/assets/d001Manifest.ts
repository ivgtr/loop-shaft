export type D001AssetKey = keyof typeof D001_ASSET_FILES;

// Public runtime PNGs keep stable filenames for the fallback manifest. Bump this
// value whenever those files change so a deployed browser cannot reuse an older
// atlas from its HTTP cache.
export const D001_ASSET_VERSION = 'd001-chambers-1';

export const D001_ASSET_FILES = {
  backgroundRock: 'background-rock-base.png',
  backgroundTunnel: 'background-tunnel-back.png',
  backgroundSurface: 'background-surface-station.png',
  backgroundShaft: 'background-shaft-back.png',
  backgroundStructure: 'background-tunnel-structure.png',
  backgroundFloor: 'background-floor.png',
  elevatorRopeTile: 'elevator-rope-tile.png',
  shaftSurfaceJunction: 'shaft-surface-junction.png',
  shaftBottomJunction: 'shaft-bottom-junction-atlas.png',
  playerBody: 'player-body-atlas.png',
  playerHelmet: 'player-helmet-atlas.png',
  playerTool: 'player-tool-atlas.png',
  playerPack: 'player-pack-atlas.png',
  playerBoots: 'player-boots-atlas.png',
  npcPorter: 'npc-porter-atlas.png',
  npcCrewMiner: 'npc-crew-miner-atlas.png',
  npcCrewPorter: 'npc-crew-porter-atlas.png',
  npcEngineer: 'npc-engineer-atlas.png',
  cargoItems: 'cargo-items-atlas.png',
  nodeScrapLedge: 'node-scrap-ledge-atlas.png',
  nodeCopperPocket: 'node-copper-pocket-atlas.png',
  nodeFossilCrack: 'node-fossil-crack-atlas.png',
  workbench: 'workbench-atlas.png',
  elevator: 'central-elevator-atlas.png',
} as const;

export const D001_BACKGROUND_KEYS = [
  'backgroundRock', 'backgroundTunnel', 'backgroundShaft', 'backgroundStructure', 'backgroundFloor',
] as const satisfies readonly D001AssetKey[];

export const D001_PLAYER_KEYS = [
  'playerBody', 'playerHelmet', 'playerTool', 'playerPack', 'playerBoots',
] as const satisfies readonly D001AssetKey[];

export const D001_FALLBACK_GROUPS = {
  player: D001_PLAYER_KEYS,
  porter: ['npcPorter'],
  crewMiner: ['npcCrewMiner'],
  crewPorter: ['npcCrewPorter'],
  engineer: ['npcEngineer'],
  cargo: ['cargoItems'],
  elevator: ['elevator'],
  rope: ['elevatorRopeTile'],
  surfaceJunction: ['shaftSurfaceJunction'],
  shaftBottom: ['shaftBottomJunction'],
} as const satisfies Record<string, readonly D001AssetKey[]>;

export const D001_NODE_ASSETS = {
  'scrap-ledge': 'nodeScrapLedge',
  'copper-pocket': 'nodeCopperPocket',
  'fossil-crack': 'nodeFossilCrack',
} as const satisfies Record<string, D001AssetKey>;

export function d001AssetUrl(key: D001AssetKey): string {
  return `${import.meta.env.BASE_URL}assets/d001/runtime/${D001_ASSET_FILES[key]}?v=${D001_ASSET_VERSION}`;
}

export function d001AssetUrls(): Record<D001AssetKey, string> {
  return Object.fromEntries(
    (Object.keys(D001_ASSET_FILES) as D001AssetKey[]).map((key) => [key, d001AssetUrl(key)]),
  ) as Record<D001AssetKey, string>;
}
