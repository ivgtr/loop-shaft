import { WORLD } from '../game/config';
import type { GameState, MiningNode } from '../game/types';
import type { AssetStore } from './assets/assetStore';
import {
  D001_ASSET_FILES,
  D001_BACKGROUND_KEYS,
  D001_NODE_ASSETS,
  D001_PLAYER_KEYS,
  type D001AssetKey,
} from './assets/d001Manifest';
import {
  D001_WORKBENCH_IMAGE_OFFSET,
  D001_VISUAL_GROUND_OFFSET,
  D001_ROPE_START_Y,
  d001RopeEndY,
  type ActorRenderState,
  type CrewRenderState,
  type EngineerRenderState,
  type SemanticRenderState,
} from './semanticRenderState';

export type D001AssetStore = AssetStore<D001AssetKey>;

export function drawD001Background(ctx: CanvasRenderingContext2D, assets: D001AssetStore): boolean {
  if (!assets.groupReady(D001_BACKGROUND_KEYS)) return false;
  for (const key of D001_BACKGROUND_KEYS) {
    const image = assets.ready(key);
    if (image) ctx.drawImage(image, 0, 0);
  }
  return true;
}

export function drawD001SurfaceJunction(ctx: CanvasRenderingContext2D, assets: D001AssetStore): boolean {
  const image = assets.ready('shaftSurfaceJunction');
  if (!image) return false;
  ctx.drawImage(image, 199, 0, 82, 38);
  return true;
}

export function drawD001ShaftBottom(
  ctx: CanvasRenderingContext2D,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): boolean {
  const image = assets.ready('shaftBottomJunction');
  if (!image) return false;
  const frame = semantic.shaftBottom === 'open' ? 1 : 0;
  ctx.drawImage(image, frame * 49, 0, 49, 47, 216, 223, 49, 47);
  return true;
}

export function drawD001Rope(
  ctx: CanvasRenderingContext2D,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): boolean {
  const image = assets.ready('elevatorRopeTile');
  if (!image) return false;
  const top = D001_ROPE_START_Y;
  const bottom = d001RopeEndY(semantic.elevator.y);
  for (let y = top; y < bottom; y += 8) {
    const height = Math.min(8, bottom - y);
    ctx.drawImage(image, 0, 0, 4, height, WORLD.elevatorX - 2, y, 4, height);
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
  ctx.drawImage(image, frame * 48, 0, 48, 40,
    Math.round(node.x) - 24, Math.round(node.y) + D001_VISUAL_GROUND_OFFSET - 40, 48, 40);
  return true;
}

export function drawD001Workbench(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): boolean {
  const image = assets.ready('workbench');
  if (!image) return false;
  const x = WORLD.workbenchX - 16;
  const y = WORLD.floorY - 28 + D001_WORKBENCH_IMAGE_OFFSET;
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
  drawPlayerLayer(ctx, assets, 'playerPack', character.packBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerBody', character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerBoots', character.bootsBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerTool', character.toolBank * 320 + character.frame * 40, character.row * 40, destinationX, destinationY);
  drawPlayerLayer(ctx, assets, 'playerHelmet', character.frame * 40, character.row * 40, destinationX, destinationY);
  ctx.restore();
}

export function drawD001Porter(ctx: CanvasRenderingContext2D, semantic: SemanticRenderState, assets: D001AssetStore): boolean {
  const porter = semantic.porter;
  if (!porter || !assets.ready('npcPorter')) return false;
  drawActor(ctx, assets, 'npcPorter', porter);
  return true;
}

export function drawD001Crew(ctx: CanvasRenderingContext2D, actor: CrewRenderState, assets: D001AssetStore): boolean {
  const key = actor.role === 'MINER' ? 'npcCrewMiner' : 'npcCrewPorter';
  if (!actor.visible || !assets.ready(key)) return false;
  drawActor(ctx, assets, key, actor, actor.role === 'MINER' ? actor.toolBank * 320 : 0);
  return true;
}

export function drawD001Engineer(ctx: CanvasRenderingContext2D, actor: EngineerRenderState, assets: D001AssetStore): boolean {
  if (!actor.visible || !assets.ready('npcEngineer')) return false;
  drawActor(ctx, assets, 'npcEngineer', actor);
  return true;
}

function drawActor(
  ctx: CanvasRenderingContext2D,
  assets: D001AssetStore,
  key: D001AssetKey,
  actor: ActorRenderState<string>,
  bankOffset = 0,
): void {
  const image = assets.ready(key);
  if (!image) return;
  ctx.save();
  ctx.translate(actor.worldAnchor.x, 0);
  if (actor.facing < 0) ctx.scale(-1, 1);
  ctx.drawImage(image, bankOffset + actor.frame * 40, actor.row * 40, 40, 40, -20, actor.worldAnchor.y - 38, 40, 40);
  ctx.restore();
}

export function drawD001ActorShadow(
  ctx: CanvasRenderingContext2D,
  actor: Pick<ActorRenderState<string>, 'worldAnchor'>,
): void {
  ctx.fillStyle = '#08080b';
  ctx.fillRect(Math.round(actor.worldAnchor.x) - 7, Math.round(actor.worldAnchor.y) - 1, 14, 2);
}

export function drawD001CargoShadow(ctx: CanvasRenderingContext2D, anchorX: number, anchorY: number): void {
  ctx.fillStyle = '#08080b';
  ctx.fillRect(Math.round(anchorX) - 4, Math.round(anchorY) - 1, 8, 1);
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

export function drawD001ElevatorBack(
  ctx: CanvasRenderingContext2D,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): boolean {
  const image = assets.ready('elevator');
  if (!image) return false;
  const variant = semantic.elevator.width === 'narrow' ? 1 : 0;
  ctx.drawImage(image, variant * 56, 0, 56, 44,
    WORLD.elevatorX - 28, Math.round(semantic.elevator.y) - 20, 56, 44);
  return true;
}

export function drawD001ElevatorFront(
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
