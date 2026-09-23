import { CARGO_HUB_X, RAIL_STOP_X, WORLD } from '../game/config';
import { cargoWeight } from '../game/simulation';
import type { GameState, LootStack, RailCart, RemoteBore, TransportLine } from '../game/types';
import { drawD001Cargo, type D001AssetStore } from './d001ImageRenderer';
import { visibleCargo } from './discoveryVisuals';

const PART = { footing: 0, uprights: 1, hopper: 2, hub: 3, cart: 4, tipped: 5, control: 6, piston: 7, bit: 8, drive: 9, gate: 11, freight: 12 } as const;
const ground = (state: GameState) => WORLD.floorY + (state.run.depth.current === 'D-001' ? 13 : 0);
export const constructionRatio = (progress: number, required: number) => Math.max(0, Math.min(1, progress / Math.max(1, required)));

/** Motion depends on completed work/travel, not an ambient wall-clock loop. */
export function railMotion(line: TransportLine, cart: RailCart): number {
  if (line.state !== 'READY') return 0;
  if (cart.state === 'TRAVELING_TO_HUB' || cart.state === 'TRAVELING_TO_STOP') return cart.position;
  if ((cart.state === 'LOADING' && line.inputBuffer.length > 0) || (cart.state === 'UNLOADING' && cart.cargo.length > 0)) return cart.stateTimer;
  return 0;
}
export function boreMotion(bore: RemoteBore): number {
  return bore.state === 'DRILLING' ? bore.cycleProgress / Math.max(.001, bore.cycleDuration) : 0;
}

function part(ctx: CanvasRenderingContext2D, assets: D001AssetStore, frame: number, x: number, y: number): void {
  const image = assets.ready('workMachines');
  if (image) ctx.drawImage(image, frame % 5 * 40, Math.floor(frame / 5) * 40, 40, 40, Math.round(x) - 20, Math.round(y) - 38, 40, 40);
}
function pile(ctx: CanvasRenderingContext2D, assets: D001AssetStore, items: readonly LootStack[], x: number, y: number, columns: number, rows: number): void {
  const visible = visibleCargo(items, columns * rows);
  for (let i = visible.length - 1; i >= 0; i--) {
    drawD001Cargo(ctx, visible[i]!, x + (i % columns - (columns - 1) / 2) * 11, y - Math.floor(i / columns) * 7, assets);
  }
}
function rail(ctx: CanvasRenderingContext2D, from: number, to: number, y: number): void {
  const left = Math.round(Math.min(from, to)); const width = Math.round(Math.abs(to - from));
  ctx.fillStyle = '#382924';
  for (let x = left; x < left + width; x += 12) ctx.fillRect(x, y - 2, 4, 7);
  ctx.fillStyle = '#655b4f'; ctx.fillRect(left, y - 2, width, 1); ctx.fillRect(left, y + 3, width, 1);
}

/** Returns false while the optional component sheet loads, allowing the existing device fallback. */
export function drawWorksite(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): boolean {
  if (!assets.ready('workMachines')) return false;
  drawRail(ctx, state, assets);
  drawFreight(ctx, state, assets);
  drawBores(ctx, state, assets);
  return true;
}

function drawRail(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): void {
  const depth = state.run.depth.current;
  const line = state.run.logistics.lines.find((entry) => entry.depth === depth);
  const hub = state.run.logistics.cargoHubs.find((entry) => entry.depth === depth);
  const y = ground(state);
  const progress = !line ? 1 : line.state === 'READY' || line.state === 'JAMMED' ? 1 : constructionRatio(line.buildProgress, line.requiredBuildProgress);
  if (hub) {
    const ratio = Math.min(1, cargoWeight(hub.buffer) / Math.max(1, hub.maxWeight));
    part(ctx, assets, PART.footing, CARGO_HUB_X, y);
    if (progress >= .3) part(ctx, assets, PART.hub, CARGO_HUB_X, y);
    if (progress >= .7) part(ctx, assets, PART.control, CARGO_HUB_X - 34, y);
    // The rack settles under its real weight. No fabricated cargo fills the empty slots.
    pile(ctx, assets, hub.buffer, CARGO_HUB_X, y - 6 + (ratio >= 1 ? 2 : 0), 3, Math.max(1, Math.ceil(ratio * 4)));
    if (ratio >= 1) part(ctx, assets, PART.gate, CARGO_HUB_X, y + 4);
  }
  if (!line) return;
  // The cart stops beside the receiving rack, not inside it. Position still comes directly from the real trip.
  const dock = CARGO_HUB_X + 35;
  rail(ctx, RAIL_STOP_X, RAIL_STOP_X + (dock - RAIL_STOP_X) * progress, y);
  part(ctx, assets, PART.footing, RAIL_STOP_X, y);
  if (progress >= .3) part(ctx, assets, PART.uprights, RAIL_STOP_X, y);
  if (progress >= .7) part(ctx, assets, PART.hopper, RAIL_STOP_X, y);
  if (progress >= 1) part(ctx, assets, PART.control, RAIL_STOP_X + 20, y);
  pile(ctx, assets, line.inputBuffer, RAIL_STOP_X, y - 20, 3, 3);
  const cart = state.run.logistics.railCarts.find((entry) => entry.lineId === line.id);
  if (!cart || progress < .7) return;
  const x = Math.round(RAIL_STOP_X + (dock - RAIL_STOP_X) * cart.position);
  const waiting = cart.cargo.length > 0 && cart.position >= 1 && (cart.state === 'UNLOADING' || cart.state === 'JAMMED');
  const tipped = waiting && (cart.state === 'JAMMED' || cart.stateTimer > 0);
  part(ctx, assets, tipped ? PART.tipped : PART.cart, x, y);
  if (progress >= 1) {
    const motion = railMotion(line, cart);
    part(ctx, assets, PART.drive + Math.floor(motion * 12) % 2, x + 6, y + 11);
  }
  pile(ctx, assets, cart.cargo, x - (tipped ? 3 : 0), y - (tipped ? 13 : 15), 2, 3);
  if (waiting) {
    ctx.fillStyle = '#655b4f'; ctx.fillRect(CARGO_HUB_X + 16, y - 12, 7, 2);
    // A lowered intake shutter sits between the waiting cart and its full destination.
    if (cart.state === 'JAMMED') { ctx.fillStyle = '#b8a795'; ctx.fillRect(CARGO_HUB_X + 18, y - 20, 2, 12); }
  }
}

function drawFreight(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): void {
  const cage = state.run.logistics.freightCage;
  const installing = cage.state === 'UNBUILT' && state.run.engineer.job?.kind === 'FREIGHT_INSTALL';
  if (cage.state === 'UNBUILT' && !installing) return;
  const x = WORLD.elevatorX + 26; const bottom = ground(state) - 4; const top = 72;
  const progress = installing ? constructionRatio(cage.buildProgress, cage.requiredBuildProgress) : 1;
  part(ctx, assets, PART.footing, x, bottom);
  if (progress < .3) return;
  ctx.fillStyle = '#564537';
  for (const dx of [-10, 11]) ctx.fillRect(x + dx, bottom - (bottom - top) * progress, 2, (bottom - top) * progress);
  if (progress < .7) return;
  // Never paint another copy of a cage serving a different underground floor.
  if (!installing && cage.targetDepth && cage.targetDepth !== state.run.depth.current && cage.position > 0) return;
  const y = Math.round(top + (bottom - top) * cage.position);
  if (progress >= 1) part(ctx, assets, PART.control, x + 16, bottom);
  part(ctx, assets, PART.freight, x, y);
  pile(ctx, assets, cage.cargo, x, y - 5, 2, 3);
  if (['MOVING_TO_FLOOR', 'ASCENDING', 'DESCENDING'].includes(cage.state)) {
    part(ctx, assets, PART.drive + Math.floor(cage.position * 16) % 2, x + 8, top - 1);
  } else if (!installing) part(ctx, assets, PART.drive, x + 8, top - 1);
}

function drawBores(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): void {
  const depth = state.run.depth.current; const y = ground(state);
  for (const bore of state.run.deepAutomation.bores) {
    if (bore.depth !== depth) continue;
    const node = state.run.floors[depth].nodes.find((entry) => entry.id === bore.siteId);
    if (!node) continue;
    const progress = bore.state === 'BLUEPRINT' || bore.state === 'INSTALLING'
      ? constructionRatio(bore.installProgress, bore.requiredInstallProgress) : 1;
    const x = node.x;
    part(ctx, assets, PART.footing, x, y);
    if (progress >= .3) part(ctx, assets, PART.uprights, x, y - 15);
    if (progress >= .7) {
      const phase = boreMotion(bore);
      const hit = Math.max(.001, Math.min(.999, bore.hitAt / bore.cycleDuration));
      const stroke = bore.state === 'DRILLING' ? Math.round(24 * Math.max(0, phase <= hit ? phase / hit : (1 - phase) / (1 - hit))) : 0;
      part(ctx, assets, PART.piston, x, y - 37 + stroke);
      part(ctx, assets, PART.bit, x, y - 32 + stroke);
      if (progress >= 1) {
        part(ctx, assets, PART.control, x - 23, y - 13);
        part(ctx, assets, PART.drive + Math.floor(phase * 8) % 2, x + 10, y - 14);
      }
    }
    // Separate outlet pile and physically closed chute: a blocked bore parks its bit above the rock.
    const outletX = x + (x < WORLD.elevatorX ? 27 : -27);
    const line = state.run.logistics.lines.find((entry) => entry.id === bore.connectedLineId);
    if (progress >= 1 && line) rail(ctx, outletX, RAIL_STOP_X, y + 5);
    pile(ctx, assets, bore.outputBuffer, outletX, y - 5, 2, 3);
    if (bore.state === 'BLOCKED' || bore.state === 'JAMMED') part(ctx, assets, PART.gate, outletX, y + 5);
  }
}
