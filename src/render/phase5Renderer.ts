import type { FeedbackOutput } from '../game/rewardFeedback';
import { floorCargoDropX } from './cargoMotion';
import { visibleCargo } from './discoveryVisuals';
import { drawCargoMark } from './discoveryCues';
import { WORLD } from '../game/config';
import { canShowCrewBoard, phase5Floor } from '../game/phase5';
import type { CrewMember, EquipmentItem, EquipmentRarity, GameEvent, GameState, Phase5DepthId } from '../game/types';
import { CanvasRenderer } from './canvasRenderer';
import { INTERACTION_LAYOUT } from './interactionLayout';
import { PALETTE } from './palette';
import {
  canDrawD001Player,
  drawD001ActorShadow,
  drawD001Cargo,
  drawD001CargoShadow,
  drawD001CarriedCargo,
  drawD001Crew,
  type D001AssetStore,
} from './d001ImageRenderer';
import {
  D001_CARGO_PLATFORM_OFFSET,
  D001_VISUAL_GROUND_OFFSET,
  deriveSemanticRenderState,
  type SemanticRenderState,
} from './semanticRenderState';
import { WorldUi } from './worldUi';
import { displayText } from '../i18n/display';
import type { Locale } from '../i18n';

export class Phase5Renderer {
  private readonly base: CanvasRenderer;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, private readonly assets: D001AssetStore, output?: FeedbackOutput, private readonly ui = new WorldUi()) {
    this.base = new CanvasRenderer(canvas, assets, output, ui);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required.');
    context.imageSmoothingEnabled = false;
    this.ctx = context;
  }

  clearFeedback(): void { this.base.clearFeedback(); }

  handleEvent(event: GameEvent, state: GameState, now: number, batch: readonly GameEvent[] = [event]): void {
    this.base.handleEvent(event, state, now, batch);
  }

  worldShake(state: GameState, now: number): number {
    return this.base.worldShake(state, now);
  }

  drawForegroundFx(now: number, shake = 0): void {
    this.base.drawForegroundFx(now, shake);
  }

  render(state: GameState, now: number, frame?: SemanticRenderState, locale: Locale = 'en'): void {
    const semantic = frame ?? deriveSemanticRenderState(state, now);
    this.base.render(state, now, semantic, locale);
    if (state.run.elevator.travel) return;
    this.ctx.save();
    if (state.run.phase5.crew.unlocked) {
      drawCargoPlatform(this.ctx, state, this.assets, this.ui);
      drawCrew(this.ctx, state, now, semantic, this.assets);
    }
    drawCrewBoard(this.ctx, state, now, locale, this.ui);
    drawCargoRouteIndicator(this.ctx, state, this.ui);
    if (!canDrawD001Player(this.assets)) drawPlayerEquipment(this.ctx, state);
    this.ctx.restore();
  }

}

function drawCrewBoard(ctx: CanvasRenderingContext2D, state: GameState, now: number, locale: Locale, ui: WorldUi): void {
  if (!canShowCrewBoard(state)) return;
  const crew = state.run.phase5.crew;
  const { x, y } = INTERACTION_LAYOUT.crewBoard;
  ctx.fillStyle = '#24211f'; ctx.fillRect(x, y, 82, 27);
  ctx.fillStyle = '#68605a'; ctx.fillRect(x + 3, y + 3, 76, 2); ctx.fillRect(x + 3, y + 20, 76, 2);
  ctx.fillStyle = '#141311'; ctx.fillRect(x + 5, y + 7, 43, 11);
  for (let index = 0; index < Math.max(2, crew.slots); index += 1) {
    const member = crew.members[index];
    ctx.fillStyle = member ? (member.role === 'MINER' ? '#b29355' : '#668b91') : '#49443d';
    ctx.fillRect(x + 54 + (index % 2) * 9, y + 8 + Math.floor(index / 2) * 6, 4, 3);
  }
  if (!crew.unlocked) {
    ctx.fillStyle = Math.floor(now / 500) % 2 === 0 ? '#987d58' : '#62533e';
    ctx.fillRect(x + 72, y + 9, 3, 3);
  }
  if (state.run.phase5.offline.lastReport) {
    ctx.fillStyle = '#b6aa8d'; ctx.fillRect(x + 44, y + 18, 8, 5);
    ctx.fillStyle = '#5c5447'; ctx.fillRect(x + 46, y + 19, 4, 1);
  }
  ctx.fillStyle = PALETTE.white;
  ui.text(ctx, displayText(locale, 'CREW'), x + 5, y + 27, { baseline: 'bottom' });
}

function drawCargoPlatform(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore, ui: WorldUi): void {
  const floor = phase5Floor(state, state.run.depth.current as Phase5DepthId);
  if (!floor) return;
  const groups = new Map<number, typeof floor.cargo>([[WORLD.elevatorX + 48, []]]);
  for (const item of floor.cargo) {
    const dropX = floorCargoDropX(state, item);
    if (!groups.has(dropX)) groups.set(dropX, []);
    groups.get(dropX)!.push(item);
  }
  for (const [dropX, items] of groups) {
    const x = dropX - 10;
    const y = WORLD.floorY - 4 + (state.run.depth.current === 'D-001' ? D001_CARGO_PLATFORM_OFFSET : 0);
    ctx.fillStyle = '#3a3935'; ctx.fillRect(x, y, 38, 4);
    ctx.fillStyle = '#67635c'; ctx.fillRect(x + 2, y - 3, 34, 3);
    ctx.fillStyle = '#272724'; ctx.fillRect(x + 4, y + 4, 3, 5); ctx.fillRect(x + 30, y + 4, 3, 5);
    const visible = visibleCargo(items, 8);
    const count = visible.length;
    for (let index = count - 1; index >= 0; index -= 1) {
      const row = Math.floor(index / 4); const col = index % 4;
      const item = visible[index]!;
      if (state.run.depth.current === 'D-001' && assets.ready('cargoItems')) {
        drawD001CargoShadow(ctx, x + 7 + col * 8, y - 4 - row * 5);
      }
      const cargoImage = drawD001Cargo(ctx, item, x + 7 + col * 8, y - 4 - row * 5, assets);
      if (!cargoImage) {
        ctx.fillStyle = item.equipmentSeed !== undefined ? '#8b795f' : item.category === 'CORE' ? '#9e8067' : item.category === 'RESEARCH' ? '#718e96' : '#755f43';
        ctx.fillRect(x + 4 + col * 8, y - 8 - row * 5, 6, 4);
        drawCargoMark(ctx, item, x + 7 + col * 8, y - 4 - row * 5);
      }
    }
    if (items.length > 8) {
      ctx.fillStyle = '#c8bda8';
      ui.text(ctx, `+${items.length - 8}`, x + 27, y - 10, { baseline: 'bottom' });
    }
  }
}

function drawCrew(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  semantic: SemanticRenderState,
  assets: D001AssetStore,
): void {
  const depth = state.run.depth.current as Phase5DepthId;
  for (const member of state.run.phase5.crew.members) {
    if (member.assignedDepth !== depth || member.state === 'TRAVELING') continue;
    const actor = semantic.crew.get(member.id);
    if (actor?.visible) drawD001ActorShadow(ctx, actor);
    const imageDrawn = Boolean(actor && drawD001Crew(ctx, actor, assets));
    if (!imageDrawn) {
      ctx.save();
      if (state.run.depth.current === 'D-001') ctx.translate(0, D001_VISUAL_GROUND_OFFSET);
      drawCrewMember(ctx, state, member, now);
      ctx.restore();
    }
    if (actor && !drawD001CarriedCargo(ctx, actor, assets) && actor.carried.length > 0) {
      ctx.fillStyle = '#735e43';
      ctx.fillRect(actor.worldAnchor.x + actor.facing * 6 - (actor.facing > 0 ? 0 : 6), actor.worldAnchor.y - 12, 6, 8);
      drawCargoMark(ctx, actor.carried[0]!, actor.worldAnchor.x + actor.facing * 8, actor.worldAnchor.y - 4);
    }
  }
}

function drawCrewMember(ctx: CanvasRenderingContext2D, state: GameState, member: CrewMember, now: number): void {
  const moving = member.state === 'MOVING_TO_NODE' || member.state === 'MOVING_TO_LOOT' || member.state === 'RETURNING_TO_CARGO' || member.state === 'MOVING_TO_ELEVATOR';
  const step = moving && Math.floor(now / 135) % 2 === 0 ? 1 : 0;
  const x = Math.round(member.body.x); const y = Math.round(member.body.y) - step; const dir = member.body.facing;
  ctx.fillStyle = member.role === 'MINER' ? '#604936' : '#57483b'; ctx.fillRect(x - 3, y - 7, 7, 7);
  ctx.fillStyle = member.role === 'MINER' ? '#b29355' : '#668b91'; ctx.fillRect(x - 4, y - 9, 8, 3);
  ctx.fillStyle = member.role === 'MINER' ? '#a6906d' : '#8b8c79'; ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = '#49545a'; ctx.fillRect(x - 3, y + 2, 2, 4 + step); ctx.fillRect(x + 2, y + 2, 2, 5 - step);
  if (member.role === 'MINER' && (member.swing || member.state === 'MINING')) drawCrewPick(ctx, state, member, x, y, dir);
  if (member.body.carried.length > 0) { ctx.fillStyle = '#735e43'; ctx.fillRect(x - dir * 7 - (dir > 0 ? 6 : 0), y - 5, 6, 8); }
  if (member.pendingDepth) { ctx.fillStyle = '#a98e62'; ctx.fillRect(x - 1, y - 13, 3, 2); }
}

function drawCrewPick(ctx: CanvasRenderingContext2D, state: GameState, member: CrewMember, x: number, y: number, dir: -1 | 1): void {
  const equipped = member.equipment.TOOL ? state.run.phase5.equipment.inventory.find((item) => item.id === member.equipment.TOOL) : undefined;
  const metal = equipped ? equipmentColor(equipped.rarity) : '#9aa3a4';
  ctx.strokeStyle = '#77583f'; ctx.lineWidth = 1;
  const swing = member.swing;
  if (!swing) {
    ctx.beginPath(); ctx.moveTo(x + dir * 3, y - 2); ctx.lineTo(x + dir * 8, y - 8); ctx.stroke();
    ctx.fillStyle = metal; ctx.fillRect(x + dir * 7 - (dir < 0 ? 4 : 0), y - 10, 5, 2); return;
  }
  const progress = Math.min(1, swing.elapsed / 0.44); const phase = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
  const headX = x + dir * (5 + Math.round(phase * 9)); const headY = y - 12 + Math.round(phase * 8);
  ctx.beginPath(); ctx.moveTo(x + dir * 2, y - 3); ctx.lineTo(headX, headY); ctx.stroke();
  ctx.fillStyle = metal; ctx.fillRect(headX - (dir < 0 ? 4 : 0), headY - 1, 5, 2);
}

function drawCargoRouteIndicator(ctx: CanvasRenderingContext2D, state: GameState, ui: WorldUi): void {
  const route = state.run.phase5.cargo.route;
  if (!route) return;
  ctx.fillStyle = '#16181a'; ctx.fillRect(267, 41, 36, 11);
  ctx.fillStyle = '#9f9278';
  ui.text(ctx, `LIFT→${route.targetDepth.replace('D-', '')}`, 270, 48, { baseline: 'bottom' });
  const ratio = 1 - route.remaining / route.duration;
  ctx.fillStyle = '#776a50'; ctx.fillRect(270, 50, Math.max(1, Math.round(29 * ratio)), 1);
}

function drawPlayerEquipment(ctx: CanvasRenderingContext2D, state: GameState): void {
  const equipped = state.run.phase5.equipment.equippedPlayer;
  if (Object.keys(equipped).length === 0) return;
  const c = state.run.character; const x = Math.round(c.x); const y = Math.round(c.y) + (state.run.depth.current === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0); const dir = c.facing;
  const pack = itemFor(state, equipped.PACK); const boots = itemFor(state, equipped.BOOTS); const lamp = itemFor(state, equipped.LAMP);
  if (pack) { ctx.strokeStyle = equipmentColor(pack.rarity); ctx.strokeRect(x - dir * 8 - (dir > 0 ? 7 : 0) + 0.5, y - 6.5, 7, 9); }
  if (boots) { ctx.fillStyle = equipmentColor(boots.rarity); ctx.fillRect(x - 3, y + 3, 2, 2); ctx.fillRect(x + 2, y + 3, 2, 2); }
  if (lamp) {
    const color = equipmentColor(lamp.rarity); ctx.fillStyle = color; ctx.fillRect(x - 1, y - 11, 3, 2);
    ctx.fillStyle = `${color}66`; ctx.fillRect(x - 5, y - 12, 1, 1); ctx.fillRect(x + 5, y - 12, 1, 1);
  }
}

function itemFor(state: GameState, id: string | undefined): EquipmentItem | undefined {
  return id ? state.run.phase5.equipment.inventory.find((item) => item.id === id) : undefined;
}

function equipmentColor(rarity: EquipmentRarity): string {
  if (rarity === 'ANCIENT') return '#c1a56e';
  if (rarity === 'EPIC') return '#9f8cae';
  if (rarity === 'RARE') return '#78949a';
  return '#9b978d';
}
