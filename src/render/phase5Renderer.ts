import { drawToolHead, equipmentColor, toolProfile } from './equipmentArt';
import { drawCargoFallback } from './cargoSprites';
import { WORLD } from '../game/config';
import { canShowCrewBoard, phase5Floor } from '../game/phase5';
import type { CrewMember, GameEvent, GameState, Phase5DepthId } from '../game/types';
import { CanvasRenderer } from './canvasRenderer';
import { INTERACTION_LAYOUT } from './interactionLayout';
import { PALETTE } from './palette';
import {
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
import { drawPixelText } from './pixelText';

export class Phase5Renderer {
  private readonly base: CanvasRenderer;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement, private readonly assets: D001AssetStore) {
    this.base = new CanvasRenderer(canvas, assets);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required.');
    context.imageSmoothingEnabled = false;
    this.ctx = context;
  }

  handleEvent(event: GameEvent, state: GameState, now: number): void {
    this.base.handleEvent(event, state, now);
  }

  drawForegroundFx(now: number): void {
    this.base.drawForegroundFx(now);
  }

  render(state: GameState, now: number): void {
    this.base.render(state, now);
    if (state.run.elevator.travel) return;
    this.ctx.save();
    if ((state.run.depth.current as string) === 'D-180') drawAncientRuins(this.ctx, now);
    const semantic = deriveSemanticRenderState(state, now);
    if (state.run.phase5.crew.unlocked) {
      drawCargoPlatform(this.ctx, state, this.assets);
      drawCrew(this.ctx, state, now, semantic, this.assets);
    }
    drawCrewBoard(this.ctx, state, now);
    drawCargoRouteIndicator(this.ctx, state);
    this.ctx.restore();
  }

}

function drawCrewBoard(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
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
  drawPixelText(ctx, crew.unlocked ? 'SHIFT BOARD' : 'CREW BOARD', x + 5, y + 27, { font: 'standard', baseline: 'bottom' });
}

function drawCargoPlatform(ctx: CanvasRenderingContext2D, state: GameState, assets: D001AssetStore): void {
  const floor = phase5Floor(state, state.run.depth.current as Phase5DepthId);
  if (!floor) return;
  const x = WORLD.elevatorX + 38;
  const y = WORLD.floorY - 4 + (state.run.depth.current === 'D-001' ? D001_CARGO_PLATFORM_OFFSET : 0);
  ctx.fillStyle = '#3a3935'; ctx.fillRect(x, y, 38, 4);
  ctx.fillStyle = '#67635c'; ctx.fillRect(x + 2, y - 3, 34, 3);
  ctx.fillStyle = '#272724'; ctx.fillRect(x + 4, y + 4, 3, 5); ctx.fillRect(x + 30, y + 4, 3, 5);
  const count = Math.min(8, floor.cargo.length);
  for (let index = count - 1; index >= 0; index -= 1) {
    const row = Math.floor(index / 4); const col = index % 4;
    const item = floor.cargo[index]!;
    if (state.run.depth.current === 'D-001' && assets.ready('cargoItems')) {
      drawD001CargoShadow(ctx, x + 7 + col * 8, y - 4 - row * 5);
    }
    const cargoImage = state.run.depth.current === 'D-001' && drawD001Cargo(ctx, item, x + 7 + col * 8, y - 4 - row * 5, assets);
    if (!cargoImage) {
      const color = item.equipmentSeed !== undefined ? '#8b795f' : item.category === 'CORE' ? '#9e8067' : item.category === 'RESEARCH' ? '#718e96' : '#755f43';
      drawCargoFallback(ctx, item, x + 7 + col * 8, y - 4 - row * 5, color);
    }
  }
  if (floor.cargo.length > 8) {
    ctx.fillStyle = '#c8bda8';
    drawPixelText(ctx, `+${floor.cargo.length - 8}`, x + 27, y - 10, { font: 'compact', baseline: 'bottom' });
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
    if (state.run.depth.current === 'D-001' && actor?.visible) drawD001ActorShadow(ctx, actor);
    const imageDrawn = Boolean(state.run.depth.current === 'D-001' && actor && drawD001Crew(ctx, actor, assets));
    if (!imageDrawn) {
      ctx.save();
      if (state.run.depth.current === 'D-001') ctx.translate(0, D001_VISUAL_GROUND_OFFSET);
      drawCrewMember(ctx, state, member, now);
      ctx.restore();
    }
    else if (actor && !drawD001CarriedCargo(ctx, actor, assets) && actor.carried.length > 0) {
      ctx.fillStyle = '#735e43';
      ctx.fillRect(actor.worldAnchor.x + actor.facing * 6 - (actor.facing > 0 ? 0 : 6), actor.worldAnchor.y - 12, 6, 8);
      drawCargoFallback(ctx, actor.carried[0]!, actor.worldAnchor.x + actor.facing * 8, actor.worldAnchor.y - 4);
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
  if (member.role === 'MINER' && (member.state === 'MINING' || member.swing)) drawCrewPick(ctx, state, member, x, y, dir);
  if (member.body.carried.length > 0) { ctx.fillStyle = '#735e43'; ctx.fillRect(x - dir * 7 - (dir > 0 ? 6 : 0), y - 5, 6, 8); drawCargoFallback(ctx, member.body.carried[0]!, x - dir * 7, y + 3); }
  if (member.pendingDepth) { ctx.fillStyle = '#a98e62'; ctx.fillRect(x - 1, y - 13, 3, 2); }
}

function drawCrewPick(ctx: CanvasRenderingContext2D, state: GameState, member: CrewMember, x: number, y: number, dir: -1 | 1): void {
  const equipped = member.equipment.TOOL ? state.run.phase5.equipment.inventory.find((item) => item.id === member.equipment.TOOL) : undefined;
  const metal = equipped ? equipmentColor(equipped.rarity) : '#9aa3a4';
  ctx.strokeStyle = '#77583f'; ctx.lineWidth = 1;
  const swing = member.swing;
  if (!swing) {
    ctx.beginPath(); ctx.moveTo(x + dir * 3, y - 2); ctx.lineTo(x + dir * 8, y - 8); ctx.stroke();
    drawToolHead(ctx, toolProfile(equipped), x + dir * 7, y - 9, dir, metal); return;
  }
  const progress = Math.min(1, swing.elapsed / 0.44); const phase = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55;
  const headX = x + dir * (5 + Math.round(phase * 9)); const headY = y - 12 + Math.round(phase * 8);
  ctx.beginPath(); ctx.moveTo(x + dir * 2, y - 3); ctx.lineTo(headX, headY); ctx.stroke();
  drawToolHead(ctx, toolProfile(equipped), headX, headY, dir, metal);
}

function drawCargoRouteIndicator(ctx: CanvasRenderingContext2D, state: GameState): void {
  const route = state.run.phase5.cargo.route;
  if (!route) return;
  ctx.fillStyle = '#16181a'; ctx.fillRect(267, 41, 36, 11);
  ctx.fillStyle = '#9f9278';
  drawPixelText(ctx, `LIFT→${route.targetDepth.replace('D-', '')}`, 270, 48, { font: 'compact', baseline: 'bottom' });
  const ratio = 1 - route.remaining / route.duration;
  ctx.fillStyle = '#776a50'; ctx.fillRect(270, 50, Math.max(1, Math.round(29 * ratio)), 1);
}

function drawAncientRuins(ctx: CanvasRenderingContext2D, now: number): void {
  ctx.fillStyle = '#191816'; ctx.fillRect(0, 42, 214, 134); ctx.fillRect(266, 42, 214, 134);
  ctx.fillStyle = '#292723';
  for (const x of [22, 76, 142, 188, 286, 344, 402, 454]) {
    ctx.fillRect(x, 62, 12, 113); ctx.fillStyle = '#4c4941'; ctx.fillRect(x - 3, 62, 18, 5); ctx.fillRect(x - 2, 166, 16, 5); ctx.fillStyle = '#292723';
  }
  ctx.fillStyle = '#3b3933'; ctx.fillRect(20, 82, 194, 5); ctx.fillRect(266, 82, 195, 5);
  ctx.fillStyle = '#565047'; ctx.fillRect(22, 169, 92, 2); ctx.fillRect(132, 169, 82, 2); ctx.fillRect(268, 169, 73, 2); ctx.fillRect(366, 169, 95, 2);
  ctx.fillStyle = '#272721'; ctx.fillRect(114, 164, 18, 8); ctx.fillRect(341, 164, 25, 8);
  ctx.fillStyle = '#6b6558'; ctx.fillRect(47, 98, 25, 14); ctx.fillRect(385, 104, 31, 15);
  ctx.fillStyle = '#1c1c19'; ctx.fillRect(50, 101, 19, 8); ctx.fillRect(389, 107, 23, 9);
  ctx.fillStyle = Math.floor(now / 900) % 2 === 0 ? '#766d57' : '#5f594a'; ctx.fillRect(54, 104, 2, 2);
  ctx.fillRect(397, 111, 2, 2);
}
