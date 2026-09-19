import { WORLD } from '../game/config';
import type { GameState, LootKind, MiningNode } from '../game/types';
import type { AssetStore } from './assets/assetStore';
import {
  D001_ASSET_FILES,
  D001_BACKGROUND_KEYS,
  D001_NODE_ASSETS,
  D001_PLAYER_KEYS,
  type D001AssetKey,
} from './assets/d001Manifest';
import type { SemanticRenderState } from './semanticRenderState';

export type D001AssetStore = AssetStore<D001AssetKey>;

export function drawD001Background(ctx: CanvasRenderingContext2D, assets: D001AssetStore): boolean {
  if (!assets.groupReady(D001_BACKGROUND_KEYS)) return false;
  for (const key of D001_BACKGROUND_KEYS) {
    const image = assets.ready(key);
    if (image) ctx.drawImage(image, 0, 0);
  }
  return true;
}

export function drawD001Node(
  ctx: CanvasRenderingContext2D,
  node: MiningNode,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): boolean {
  const key = D001_NODE_ASSETS[node.id as keyof typeof D001_NODE_ASSETS];
  if (!key) return false;
  const image = assets.ready(key);
  if (!image) return false;
  const visualState = semantic.nodes.get(node.id) ?? 'full';
  const frame = { full: 0, damaged: 1, critical: 2, depleted: 3 }[visualState];
  ctx.drawImage(image, frame * 48, 0, 48, 40, Math.round(node.x) - 24, Math.round(node.y) - 40, 48, 40);
  return true;
}

export function drawD001Workbench(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): boolean {
  const image = assets.ready('workbench');
  if (!image) return false;
  const x = WORLD.workbenchX - 16;
  const y = WORLD.floorY - 28;
  const frames = [0, state.run.tool.level, 2 + state.run.boots.level, 4 + state.run.pack.level] as const;
  for (const frame of frames) ctx.drawImage(image, frame * 32, 0, 32, 32, x, y, 32, 32);
  return true;
}

export function canDrawD001Player(assets: D001AssetStore): boolean {
  return assets.groupReady(D001_PLAYER_KEYS);
}

export function drawD001Player(
  ctx: CanvasRenderingContext2D,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): void {
  const character = semantic.character;
  const destinationX = -20;
  const destinationY = character.worldAnchor.y - 38;
  ctx.save();
  ctx.translate(character.worldAnchor.x, 0);
  if (character.facing < 0) ctx.scale(-1, 1);
  drawPlayerLayer(ctx, assets, 'playerBody', character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerHelmet', character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerTool', character.toolBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerPack', character.packBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerBoots', character.bootsBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  ctx.restore();
}

function drawPlayerLayer(
  ctx: CanvasRenderingContext2D,
  assets: D001AssetStore,
  key: D001AssetKey,
  sx: number,
  sy: number,
  dx: number,
  dy: number,
): void {
  const image = assets.ready(key);
  if (image) ctx.drawImage(image, sx, sy, 40, 40, dx, dy, 40, 40);
}

export function drawD001Elevator(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): boolean {
  const image = assets.ready('elevator');
  if (!image) return false;
  const narrow = semantic.elevator.width === 'narrow';
  const x = WORLD.elevatorX - 28;
  const y = Math.round(semantic.elevator.y) - 20;
  const variant = narrow ? 1 : 0;
  ctx.drawImage(image, variant * 56, 0, 56, 44, x, y, 56, 44);

  const count = Math.min(9, state.run.elevator.cargo.length);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 3);
    const column = index % 3;
    ctx.fillStyle = lootColor(state.run.elevator.cargo[index]!.kind);
    ctx.fillRect(WORLD.elevatorX - 12 + column * 9, Math.round(semantic.elevator.y) + 8 - row * 6, 7, 5);
  }

  ctx.drawImage(image, (2 + variant) * 56, 0, 56, 44, x, y, 56, 44);
  if (semantic.elevator.door === 'closed') ctx.drawImage(image, variant * 56, 44, 56, 44, x, y, 56, 44);
  ctx.drawImage(image, 2 * 56, 44, 56, 44, 269 - 28, 198 - 20, 56, 44);

  ctx.fillStyle = state.run.elevator.state !== 'IDLE_BOTTOM' || state.run.elevator.cargo.length > 0 ? '#e6a02b' : '#564537';
  ctx.fillRect(WORLD.elevatorX + (narrow ? 8 : 13), Math.round(semantic.elevator.y) - 12, 3, 3);
  return true;
}

export function assetDebugSummary(assets: D001AssetStore): Record<string, string> {
  return Object.fromEntries((Object.keys(D001_ASSET_FILES) as D001AssetKey[]).map((key) => [key, assets.get(key).state]));
}

function lootColor(kind: LootKind): string {
  if (kind === 'STONE') return '#715a4d';
  if (kind === 'IRON') return '#b8a795';
  if (kind === 'COPPER') return '#b45f2e';
  if (kind === 'GOLD_NUGGET' || kind === 'NATURAL_GOLD') return '#e6a02b';
  if (kind === 'GEM') return '#916a4e';
  return '#9f7353';
}
