import { drawCompactCargo } from './cargoRenderer';
import { discoveryAssets } from './assets/discoveryArt';
import { CARGO_HUB_X, RAIL_STOP_X, WORLD } from '../game/config';
import { deriveInitialLogisticsGuide, isFirstLiveScrapGain } from '../game/initialLogisticsGuide';
import { cargoWeight } from '../game/simulation';
import type { GameEvent, GameState } from '../game/types';
import { Phase5Renderer } from './phase5Renderer';
import { drawInteractionOverlay } from './interactionOverlay';
import { drawDeliveryNotice, initialGuideTargetKey } from './initialGuideOverlay';
import {
  clientToWorldPoint,
  deriveInteractionTargets,
  resolveInteractionTarget,
  type InteractionTarget,
  type Point,
} from './interactionTargets';
import { AssetStore } from './assets/assetStore';
import { d001AssetUrls, type D001AssetKey } from './assets/d001Manifest';
import { drawD001ActorShadow, drawD001Engineer } from './d001ImageRenderer';
import { drawD001ElevatorFrontLayer } from './entities';
import { D001_VISUAL_GROUND_OFFSET, deriveSemanticRenderState } from './semanticRenderState';
import { drawPixelText } from './pixelText';

export class GameRenderer {
  private readonly base: Phase5Renderer;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly assets: AssetStore<D001AssetKey>;
  private deliveryNotice: { amount: number; expiresAt: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.assets = new AssetStore(d001AssetUrls());
    this.assets.preload();
    discoveryAssets.preload();
    this.base = new Phase5Renderer(canvas, this.assets);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context is required.');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  handleEvent(event: GameEvent, state: GameState, now: number): void {
    this.base.handleEvent(event, state, now);
    if (isFirstLiveScrapGain(state, event)) {
      this.deliveryNotice = { amount: Number(event.data?.amount ?? 0), expiresAt: now + 2500 };
    }
  }

  render(state: GameState, now: number, hoveredKey: string | null = null): void {
    const shake = this.base.worldShake(state, now);
    this.ctx.save();
    this.ctx.translate(shake, 0);
    this.base.render(state, now);
    const semantic = deriveSemanticRenderState(state, now);
    if (state.run.elevator.travel) {
      this.ctx.restore();
      this.base.drawForegroundFx(now);
      return;
    }
    const depth = state.run.depth.current;
    if (depth === 'D-250') drawTheLost(this.ctx, state);
    if (depth === 'D-400') drawNullStrata(this.ctx, state, now);
    if (depth === 'D-650') drawD650(this.ctx, now);
    drawTransportLine(this.ctx, state);
    drawFreightCage(this.ctx, state);
    drawBores(this.ctx, state, now);
    const engineer = semantic.engineer;
    if (engineer?.visible && state.run.depth.current === 'D-001' && this.assets.ready('npcEngineer')) {
      drawD001ActorShadow(this.ctx, engineer);
    }
    if (!engineer || state.run.depth.current !== 'D-001' || !drawD001Engineer(this.ctx, engineer, this.assets)) {
      this.ctx.save();
      if (state.run.depth.current === 'D-001') this.ctx.translate(0, D001_VISUAL_GROUND_OFFSET);
      drawEngineer(this.ctx, state, now);
      this.ctx.restore();
    }
    if (depth === 'D-001') drawD001ElevatorFrontLayer(this.ctx, state, semantic, now, this.assets);
    const targets = deriveInteractionTargets(state);
    const guide = deriveInitialLogisticsGuide(state);
    const guideTargetKey = initialGuideTargetKey(guide, targets);
    drawInteractionOverlay(this.ctx, targets, state.selection, hoveredKey, guideTargetKey);
    this.ctx.restore();
    // The shared Canvas HUD owns instructions; world overlay only marks the target.
    if (this.deliveryNotice && now < this.deliveryNotice.expiresAt) {
      drawDeliveryNotice(this.ctx, this.deliveryNotice.amount);
    } else if (this.deliveryNotice) this.deliveryNotice = null;
    this.base.drawForegroundFx(now, shake);
  }

  clientToWorld(clientX: number, clientY: number): Point | null {
    const rect = this.canvas.getBoundingClientRect();
    return clientToWorldPoint(clientX, clientY, rect);
  }

  resolveTarget(point: Point, state: GameState): InteractionTarget | null {
    return resolveInteractionTarget(point, deriveInteractionTargets(state));
  }
}

function drawTheLost(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#111314';
  ctx.fillRect(0, 44, 182, 119);
  ctx.fillRect(302, 44, 178, 119);
  ctx.fillStyle = '#242526';
  ctx.fillRect(18, 72, 118, 5);
  ctx.fillRect(332, 84, 105, 5);
  ctx.fillRect(48, 118, 88, 4);
  ctx.fillRect(350, 130, 93, 4);
  ctx.fillStyle = '#44433e';
  for (const x of [25, 82, 126, 350, 405, 445]) ctx.fillRect(x, 75, 5, 89);
  ctx.fillStyle = '#696258';
  ctx.fillRect(136, 160, 38, 3);
  ctx.fillRect(307, 160, 44, 3);
  ctx.fillStyle = '#0a0b0c';
  ctx.fillRect(174, 43, 132, 121);
  ctx.fillStyle = '#363531';
  ctx.fillRect(174, 150, 32, 5);
  ctx.fillRect(273, 150, 33, 5);
  ctx.fillStyle = '#575148';
  ctx.fillRect(183, 147, 14, 3);
  ctx.fillRect(282, 147, 14, 3);
  ctx.strokeStyle = '#514b43';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(198, 155);
  ctx.lineTo(234, 173);
  ctx.moveTo(282, 155);
  ctx.lineTo(247, 173);
  ctx.stroke();
  if (state.run.logistics.lines.some((line) => line.depth === 'D-250' && line.state === 'READY')) {
    ctx.fillStyle = '#615c52';
    ctx.fillRect(CARGO_HUB_X, WORLD.floorY - 3, RAIL_STOP_X - CARGO_HUB_X, 2);
    for (let x = CARGO_HUB_X; x < RAIL_STOP_X; x += 16) ctx.fillRect(x, WORLD.floorY - 6, 2, 6);
  } else {
    ctx.fillStyle = '#514b43';
    ctx.fillRect(321, WORLD.floorY - 3, 38, 2);
    ctx.fillRect(380, WORLD.floorY - 3, 22, 2);
  }
  label(ctx, 'THE LOST', 8, 48);
}

function drawNullStrata(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  ctx.fillStyle = '#090a0b';
  ctx.fillRect(0, 43, 480, 126);
  ctx.fillStyle = '#1d2020';
  ctx.fillRect(0, 151, 116, 18);
  ctx.fillRect(145, 132, 82, 10);
  ctx.fillRect(276, 158, 61, 11);
  ctx.fillRect(377, 121, 103, 14);
  ctx.fillStyle = '#343533';
  ctx.fillRect(19, 145, 75, 4);
  ctx.fillRect(156, 126, 52, 3);
  ctx.fillRect(388, 115, 68, 3);
  ctx.fillStyle = '#050506';
  ctx.fillRect(119, 58, 22, 105);
  ctx.fillRect(232, 43, 39, 121);
  ctx.fillRect(342, 62, 30, 107);
  ctx.fillStyle = Math.floor(now / 850) % 2 ? '#55544e' : '#474843';
  for (const node of state.run.floors['D-400'].nodes) {
    if (node.access === 'REMOTE_ONLY') {
      ctx.fillRect(node.x - 7, WORLD.floorY - 54, 14, 3);
      ctx.fillRect(node.x - 2, WORLD.floorY - 59, 4, 5);
    }
  }
  label(ctx, 'NULL STRATA', 8, 48);
}

function drawD650(ctx: CanvasRenderingContext2D, now: number): void {
  ctx.fillStyle = '#090909';
  ctx.fillRect(0, 40, 480, 130);
  ctx.fillStyle = '#242422';
  ctx.fillRect(61, 55, 358, 111);
  ctx.fillStyle = '#393832';
  ctx.fillRect(74, 68, 332, 5);
  ctx.fillRect(74, 151, 332, 5);
  ctx.fillStyle = '#101111';
  ctx.fillRect(116, 82, 248, 59);
  ctx.fillStyle = Math.floor(now / 1200) % 2 ? '#635e53' : '#4e4b43';
  ctx.fillRect(230, 101, 20, 4);
  ctx.fillStyle = '#8d887b';
  drawPixelText(ctx, '???', 232, 95, { font: 'standard', baseline: 'bottom' });
  drawPixelText(ctx, 'D-650', 8, 48, { font: 'standard', baseline: 'bottom' });
}

function drawTransportLine(ctx: CanvasRenderingContext2D, state: GameState): void {
  const depth = state.run.depth.current;
  const line = state.run.logistics.lines.find((candidate) => candidate.depth === depth);
  if (!line) return;
  const y = WORLD.floorY - 8;
  ctx.fillStyle = line.state === 'JAMMED' ? '#784d45' : '#57544e';
  ctx.fillRect(RAIL_STOP_X - 13, y - 15, 26, 17);
  ctx.fillStyle = '#242522';
  ctx.fillRect(RAIL_STOP_X - 9, y - 11, 18, 9);
  drawCompactCargo(ctx, line.inputBuffer, RAIL_STOP_X, y - 7);
  const hub = state.run.logistics.cargoHubs.find((candidate) => candidate.depth === depth);
  if (hub) {
    const ratio = Math.min(1, cargoWeight(hub.buffer) / Math.max(1, hub.maxWeight));
    ctx.fillStyle = ratio > 0.82 ? '#76534a' : '#4c4b46';
    ctx.fillRect(CARGO_HUB_X - 16, y - 20, 32, 22);
    ctx.fillStyle = '#232422';
    ctx.fillRect(CARGO_HUB_X - 11, y - 15, 22, 12);
    drawCompactCargo(ctx, hub.buffer, CARGO_HUB_X, y - 7);
  }
  const cart = state.run.logistics.railCarts.find((candidate) => candidate.lineId === line.id);
  if (cart) {
    const x = Math.round(RAIL_STOP_X + (CARGO_HUB_X - RAIL_STOP_X) * cart.position);
    ctx.fillStyle = cart.state === 'JAMMED' ? '#784d45' : '#69625a';
    ctx.fillRect(x - 10, y - 7, 20, 8);
    ctx.fillStyle = '#292a27';
    ctx.fillRect(x - 7, y - 10, 14, 4);
    ctx.fillRect(x - 7, y + 1, 4, 3);
    ctx.fillRect(x + 4, y + 1, 4, 3);
    drawCompactCargo(ctx, cart.cargo, x, y - 2);
  }
}

function drawFreightCage(ctx: CanvasRenderingContext2D, state: GameState): void {
  const cage = state.run.logistics.freightCage;
  if (cage.state === 'UNBUILT') return;
  const x = WORLD.elevatorX + 26;
  const top = 72;
  const bottom = WORLD.floorY - 4;
  ctx.fillStyle = '#323431';
  ctx.fillRect(x - 10, top, 2, bottom - top);
  ctx.fillRect(x + 9, top, 2, bottom - top);
  const y = Math.round(bottom + (top - bottom) * cage.position);
  ctx.strokeStyle = cage.state === 'JAMMED' ? '#805047' : '#777267';
  ctx.strokeRect(x - 9.5, y - 19.5, 20, 20);
  ctx.fillStyle = '#4b4944';
  ctx.fillRect(x - 7, y - 17, 16, 15);
  drawCompactCargo(ctx, cage.cargo, x, y - 4);
}

function drawBores(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const depth = state.run.depth.current;
  for (const bore of state.run.deepAutomation.bores) {
    if (bore.depth !== depth) continue;
    const node = state.run.floors[depth].nodes.find((candidate) => candidate.id === bore.siteId);
    if (!node) continue;
    const x = node.x;
    const y = WORLD.floorY - 13;
    ctx.fillStyle = '#4c4c47';
    ctx.fillRect(x - 12, y - 19, 24, 19);
    ctx.fillStyle = '#777166';
    ctx.fillRect(x - 7, y - 24, 14, 6);
    ctx.fillStyle = '#2a2b29';
    ctx.fillRect(x - 2, y, 4, 12);
    if (bore.state === 'DRILLING') {
      const offset = Math.floor(now / 80) % 2;
      ctx.fillStyle = '#93866f';
      ctx.fillRect(x - 3 + offset, y + 10, 6, 2);
    }
    drawCompactCargo(ctx, bore.outputBuffer, x, y - 17);
  }
}

function drawEngineer(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const engineer = state.run.engineer;
  if (!engineer.unlocked || engineer.assignedDepth !== state.run.depth.current) return;
  const step = engineer.state === 'MOVING_TO_MACHINE' && Math.floor(now / 150) % 2 === 0 ? 1 : 0;
  const x = Math.round(engineer.x);
  const y = WORLD.floorY - 9 - step;
  ctx.fillStyle = '#5b5548';
  ctx.fillRect(x - 3, y - 7, 7, 7);
  ctx.fillStyle = '#b09a68';
  ctx.fillRect(x - 4, y - 9, 9, 3);
  ctx.fillStyle = '#76766e';
  ctx.fillRect(x - 3, y - 3, 7, 6);
  if (engineer.state === 'INSTALLING' || engineer.state === 'REPAIRING') {
    ctx.fillStyle = '#9b927f';
    ctx.fillRect(x + 5, y - 5, 5, 2);
    ctx.fillRect(x + 8, y - 7, 2, 6);
  }
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  ctx.fillStyle = '#8c877d';
  drawPixelText(ctx, text, x, y, { font: 'standard', baseline: 'bottom' });
}
