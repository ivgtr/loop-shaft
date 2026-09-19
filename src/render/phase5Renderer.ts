import { WORLD } from '../game/config';
import { canShowCrewBoard, phase5Floor } from '../game/phase5';
import type { CrewMember, EquipmentItem, EquipmentRarity, GameEvent, GameState, Phase5DepthId } from '../game/types';
import { CanvasRenderer } from './canvasRenderer';
import { INTERACTION_LAYOUT } from './interactionLayout';
import { PALETTE } from './palette';

export class Phase5Renderer {
  private readonly base: CanvasRenderer;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(canvas: HTMLCanvasElement) {
    this.base = new CanvasRenderer(canvas);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D context is required.');
    context.imageSmoothingEnabled = false;
    this.ctx = context;
  }

  handleEvent(event: GameEvent, state: GameState, now: number): void {
    this.base.handleEvent(event, state, now);
  }

  render(state: GameState, now: number): void {
    this.base.render(state, now);
    if (state.run.elevator.travel) return;
    this.ctx.save();
    if ((state.run.depth.current as string) === 'D-180') drawAncientRuins(this.ctx, state, now);
    if (state.run.phase5.crew.unlocked) {
      drawCargoPlatform(this.ctx, state);
      drawCrew(this.ctx, state, now);
    }
    drawCrewBoard(this.ctx, state, now);
    drawCargoRouteIndicator(this.ctx, state);
    drawPlayerEquipment(this.ctx, state);
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
  ctx.font = '5px monospace'; ctx.fillStyle = PALETTE.white; ctx.fillText(crew.unlocked ? 'SHIFT BOARD' : 'CREW BOARD', x + 5, y + 27);
}

function drawCargoPlatform(ctx: CanvasRenderingContext2D, state: GameState): void {
  const floor = phase5Floor(state, state.run.depth.current as Phase5DepthId);
  if (!floor) return;
  const x = WORLD.elevatorX + 38;
  const y = WORLD.floorY - 4;
  ctx.fillStyle = '#3a3935'; ctx.fillRect(x, y, 38, 4);
  ctx.fillStyle = '#67635c'; ctx.fillRect(x + 2, y - 3, 34, 3);
  ctx.fillStyle = '#272724'; ctx.fillRect(x + 4, y + 4, 3, 5); ctx.fillRect(x + 30, y + 4, 3, 5);
  const count = Math.min(8, floor.cargo.length);
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / 4); const col = index % 4;
    const item = floor.cargo[index]!;
    ctx.fillStyle = item.equipmentSeed !== undefined ? '#8b795f' : item.category === 'CORE' ? '#9e8067' : item.category === 'RESEARCH' ? '#718e96' : '#755f43';
    ctx.fillRect(x + 4 + col * 8, y - 8 - row * 5, 6, 4);
  }
  if (floor.cargo.length > 8) {
    ctx.font = '4px monospace'; ctx.fillStyle = '#c8bda8'; ctx.fillText(`+${floor.cargo.length - 8}`, x + 27, y - 10);
  }
}

function drawCrew(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const depth = state.run.depth.current as Phase5DepthId;
  for (const member of state.run.phase5.crew.members) {
    if (member.assignedDepth !== depth || member.state === 'TRAVELING') continue;
    drawCrewMember(ctx, state, member, now);
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
  if (member.role === 'MINER') drawCrewPick(ctx, state, member, x, y, dir);
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

function drawCargoRouteIndicator(ctx: CanvasRenderingContext2D, state: GameState): void {
  const route = state.run.phase5.cargo.route;
  if (!route) return;
  ctx.fillStyle = '#16181a'; ctx.fillRect(267, 41, 36, 11);
  ctx.font = '4px monospace'; ctx.fillStyle = '#9f9278'; ctx.fillText(`LIFT→${route.targetDepth.replace('D-', '')}`, 270, 48);
  const ratio = 1 - route.remaining / route.duration;
  ctx.fillStyle = '#776a50'; ctx.fillRect(270, 50, Math.max(1, Math.round(29 * ratio)), 1);
}

function drawAncientRuins(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
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

  const floor = phase5Floor(state, 'D-180');
  for (const node of floor.nodes) {
    if (node.hp <= 0) continue;
    if (node.id === 'ruined-workshop') {
      ctx.fillStyle = '#403c34'; ctx.fillRect(node.x - 17, 188, 34, 19);
      ctx.fillStyle = '#746b5d'; ctx.fillRect(node.x - 12, 191, 21, 3); ctx.fillRect(node.x + 8, 194, 3, 11);
      ctx.fillStyle = '#5c5143'; ctx.fillRect(node.x - 10, 199, 8, 6);
    } else if (node.id === 'archive-vault') {
      ctx.fillStyle = '#343633'; ctx.fillRect(node.x - 18, 184, 36, 23);
      ctx.fillStyle = '#77766c'; ctx.fillRect(node.x - 13, 188, 26, 2); ctx.fillRect(node.x - 13, 197, 26, 2);
      ctx.fillStyle = '#202320'; ctx.fillRect(node.x - 8, 191, 16, 5);
    } else if (node.id === 'sealed-chamber') {
      ctx.fillStyle = '#302f2b'; ctx.fillRect(node.x - 22, 178, 44, 29);
      ctx.strokeStyle = '#706a5c'; ctx.strokeRect(node.x - 16.5, 183.5, 33, 22);
      ctx.fillStyle = '#514a3f'; ctx.fillRect(node.x - 2, 185, 4, 18);
    }
  }
}

function drawPlayerEquipment(ctx: CanvasRenderingContext2D, state: GameState): void {
  const equipped = state.run.phase5.equipment.equippedPlayer;
  if (Object.keys(equipped).length === 0) return;
  const c = state.run.character; const x = Math.round(c.x); const y = Math.round(c.y); const dir = c.facing;
  const tool = itemFor(state, equipped.TOOL); const pack = itemFor(state, equipped.PACK); const boots = itemFor(state, equipped.BOOTS); const lamp = itemFor(state, equipped.LAMP);
  if (tool) { ctx.fillStyle = equipmentColor(tool.rarity); ctx.fillRect(x + dir * 8 - (dir < 0 ? 4 : 0), y - 10, 5, 2); }
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
