import { WORLD } from '../game/config';
import { currentFloor } from '../game/simulation';
import type { DepthId, GameState, LootKind, MiningNode, Rarity } from '../game/types';
import { elevatorY } from './environment';
import { INTERACTION_LAYOUT } from './interactionLayout';
import { PALETTE } from './palette';
import {
  canDrawD001Player,
  drawD001Elevator,
  drawD001Node,
  drawD001Player,
  drawD001Workbench,
  type D001AssetStore,
} from './d001ImageRenderer';
import type { SemanticRenderState } from './semanticRenderState';

export function drawEntities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  now: number,
  semantic?: SemanticRenderState,
  assets?: D001AssetStore,
): void {
  drawNodes(ctx, state, semantic, assets);
  drawWorkbench(ctx, state, assets);
  if (state.run.depth.current === 'D-030') drawScanner(ctx, state, now);
  if (state.run.porter.enabled) drawPorter(ctx, state, now);
  if (state.run.depth.current === 'D-001' && semantic && assets && canDrawD001Player(assets)) drawD001Player(ctx, semantic, assets);
  else drawCharacter(ctx, state, now);
  drawLoot(ctx, state, now);
  const elevatorImage = Boolean(state.run.depth.current === 'D-001' && semantic && assets && drawD001Elevator(ctx, state, semantic, assets));
  if (!elevatorImage) drawElevator(ctx, state, now);
  drawLiftControl(ctx, state, elevatorImage);
}

function drawNodes(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  semantic?: SemanticRenderState,
  assets?: D001AssetStore,
): void {
  for (const node of currentFloor(state).nodes) {
    if (state.run.depth.current === 'D-001' && semantic && assets && drawD001Node(ctx, node, semantic, assets)) continue;
    drawNode(ctx, node, state.run.depth.current);
  }
}

function drawNode(ctx: CanvasRenderingContext2D, node: MiningNode, depth: DepthId): void {
  if (node.hp <= 0) {
    ctx.fillStyle = depth === 'D-060' ? '#344951' : depth === 'D-100' ? '#49433e' : depth === 'D-030' ? '#394244' : '#443840';
    ctx.fillRect(node.x - 10, node.y - 4, 20, 5);
    ctx.fillRect(node.x - 5, node.y - 8, 4, 4);
    ctx.fillRect(node.x + 5, node.y - 7, 3, 3);
    return;
  }
  const ratio = node.hp / node.maxHp;
  if (node.id === 'dense-vein') {
    ctx.fillStyle = '#354044'; ctx.fillRect(node.x - 14, node.y - 20, 29, 20); ctx.fillStyle = '#68777a'; ctx.fillRect(node.x - 8, node.y - 16, 4, 3); ctx.fillRect(node.x + 4, node.y - 12, 5, 3);
  } else if (node.id === 'fossil-seam' || node.id === 'fossil-bloom') {
    ctx.fillStyle = depth === 'D-060' ? '#31414a' : '#3d3c38'; ctx.fillRect(node.x - 13, node.y - 18, 27, 18); ctx.fillStyle = PALETTE.fossil; ctx.fillRect(node.x - 8, node.y - 13, 13, 2); ctx.fillRect(node.x - 1, node.y - 16, 2, 8);
  } else if (node.id === 'black-glass-fault') {
    ctx.fillStyle = '#262b2e'; ctx.fillRect(node.x - 14, node.y - 22, 29, 22); ctx.fillStyle = PALETTE.glass; ctx.fillRect(node.x - 8, node.y - 18, 5, 7); ctx.fillRect(node.x + 2, node.y - 16, 7, 10);
  } else if (node.id === 'crystal-bank') {
    ctx.fillStyle = '#31434b'; ctx.fillRect(node.x - 14, node.y - 20, 29, 20); ctx.fillStyle = PALETTE.crystal; ctx.fillRect(node.x - 8, node.y - 17, 3, 11); ctx.fillRect(node.x, node.y - 14, 4, 8); ctx.fillRect(node.x + 7, node.y - 18, 3, 12);
  } else if (node.id === 'machine-grave') {
    ctx.fillStyle = '#29343a'; ctx.fillRect(node.x - 15, node.y - 21, 31, 21); ctx.fillStyle = '#778087'; ctx.fillRect(node.x - 8, node.y - 15, 15, 3); ctx.fillRect(node.x + 5, node.y - 12, 3, 9); ctx.fillStyle = '#4d6870'; ctx.fillRect(node.x - 9, node.y - 9, 4, 4);
  } else if (node.id === 'core-shell') {
    ctx.fillStyle = '#44403d'; ctx.fillRect(node.x - 18, node.y - 29, 37, 29); ctx.fillStyle = '#6c6259'; ctx.fillRect(node.x - 12, node.y - 24, 25, 4); ctx.fillRect(node.x - 8, node.y - 14, 16, 3); ctx.fillStyle = PALETTE.core; ctx.fillRect(node.x - 2, node.y - 20, 4, 14);
  } else if (depth === 'D-100') {
    ctx.fillStyle = '#3a3938'; ctx.fillRect(node.x - 13, node.y - 18, 27, 18); ctx.fillStyle = '#71685f'; ctx.fillRect(node.x - 7, node.y - 13, 13, 2); ctx.fillRect(node.x + 5, node.y - 17, 2, 9);
  } else {
    ctx.fillStyle = '#3a3036'; ctx.fillRect(node.x - 12, node.y - 18, 25, 18); ctx.fillStyle = '#51434a'; ctx.fillRect(node.x - 9, node.y - 21, 9, 4); ctx.fillRect(node.x + 4, node.y - 16, 8, 6);
    if (node.id === 'copper-pocket') { ctx.fillStyle = PALETTE.copper; ctx.fillRect(node.x - 6, node.y - 13, 3, 3); ctx.fillRect(node.x + 6, node.y - 9, 2, 3); }
    else if (node.id === 'fossil-crack') { ctx.fillStyle = '#aaa07d'; ctx.fillRect(node.x - 4, node.y - 12, 8, 2); ctx.fillRect(node.x, node.y - 15, 2, 7); }
    else { ctx.fillStyle = PALETTE.metal; ctx.fillRect(node.x - 5, node.y - 11, 3, 2); ctx.fillRect(node.x + 4, node.y - 14, 3, 2); }
  }
  if (ratio < 0.75) { ctx.fillStyle = '#17191a'; ctx.fillRect(node.x, node.y - 17, 1, 8); ctx.fillRect(node.x, node.y - 11, 5, 1); }
  if (ratio < 0.4) { ctx.fillRect(node.x - 7, node.y - 8, 8, 1); ctx.fillRect(node.x - 3, node.y - 13, 1, 6); }
}

function drawLoot(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  for (const item of currentFloor(state).loot) {
    const special = rarityRank(item.rarity) >= 2;
    const bob = special && Math.floor(now / 180) % 2 === 0 ? -1 : 0;
    ctx.fillStyle = lootColor(item.kind);
    ctx.fillRect(Math.round(item.x) - 2, Math.round(item.y) - 3 + bob, 5, 4);
    if (special) { ctx.fillStyle = rarityColor(item.rarity); ctx.fillRect(Math.round(item.x), Math.round(item.y) - 6 + bob, 1, 1); }
  }
}

function drawWorkbench(ctx: CanvasRenderingContext2D, state: GameState, assets?: D001AssetStore): void {
  if (state.run.depth.current === 'D-001' && assets && drawD001Workbench(ctx, state, assets)) {
    if (state.run.automation.autoSwing.unlocked) {
      ctx.fillStyle = state.run.automation.autoSwing.enabled ? PALETTE.cyan : '#3f5355';
      ctx.fillRect(WORLD.workbenchX + 2, WORLD.floorY - 22, 3, 3);
    }
    return;
  }
  const x = WORLD.workbenchX; const run = state.run;
  ctx.fillStyle = PALETTE.timber; ctx.fillRect(x - 12, WORLD.floorY - 8, 25, 4); ctx.fillRect(x - 9, WORLD.floorY - 4, 3, 8); ctx.fillRect(x + 7, WORLD.floorY - 4, 3, 8);
  ctx.fillStyle = run.tool.level === 1 ? PALETTE.rust : PALETTE.steel; ctx.fillRect(x - 1, WORLD.floorY - 18, 2, 11); ctx.fillRect(x - 5, WORLD.floorY - 19, 9, 2);
  ctx.fillStyle = run.boots.level === 1 ? '#51463d' : PALETTE.steel; ctx.fillRect(x - 11, WORLD.floorY - 13, 4, 4); ctx.fillRect(x - 6, WORLD.floorY - 13, 4, 4);
  ctx.fillStyle = run.pack.level === 1 ? '#685642' : '#846c47'; const packW = run.pack.level === 1 ? 5 : 7; const packH = run.pack.level === 1 ? 6 : 8; ctx.fillRect(x + 6, WORLD.floorY - 12 - (packH - 6), packW, packH);
  if (run.automation.autoSwing.unlocked) { ctx.fillStyle = run.automation.autoSwing.enabled ? PALETTE.cyan : '#3f5355'; ctx.fillRect(x + 2, WORLD.floorY - 22, 3, 3); }
}

function drawScanner(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const { x: left, y } = INTERACTION_LAYOUT.scanner; const x = left + INTERACTION_LAYOUT.scanner.width / 2; ctx.fillStyle = '#2b3032'; ctx.fillRect(left, y, 18, 25); ctx.fillStyle = PALETTE.metal; ctx.fillRect(x - 7, y + 3, 14, 2); ctx.fillRect(x - 5, y + 18, 10, 3);
  const pulse = state.run.anomaly.selected ? '#56605e' : Math.floor(now / 360) % 2 === 0 ? PALETTE.d030Lamp : '#71623f';
  ctx.fillStyle = pulse; ctx.fillRect(x - 3, y + 7, 2, 2); ctx.fillRect(x + 1, y + 7, 2, 2); ctx.fillRect(x - 1, y + 11, 2, 2);
}

function drawCharacter(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const run = state.run; const c = run.character; const walking = c.state === 'MOVING_TO_NODE' || c.state === 'RETURNING'; const step = walking && Math.floor(now / 120) % 2 === 0 ? 1 : 0;
  const x = Math.round(c.x); const y = Math.round(c.y) - step; const dir = c.facing;
  ctx.fillStyle = '#6a4935'; ctx.fillRect(x - 3, y - 7, 7, 7); ctx.fillStyle = PALETTE.helmet; ctx.fillRect(x - 4, y - 9, 8, 3); ctx.fillStyle = PALETTE.worker; ctx.fillRect(x - 3, y - 4, 7, 6);
  ctx.fillStyle = run.boots.level === 1 ? '#4a5660' : '#87979d'; ctx.fillRect(x - 3, y + 2, 2, 4 + step); ctx.fillRect(x + 2, y + 2, 2, 5 - step);
  if (c.carried.length > 0 || run.pack.level === 2) { const w = run.pack.level === 1 ? 5 : 7; const h = run.pack.level === 1 ? 7 : 9; ctx.fillStyle = run.pack.level === 1 ? '#685642' : '#846c47'; ctx.fillRect(x - dir * (run.pack.level === 1 ? 6 : 7) - (dir > 0 ? w : 0), y - 5, w, h); }
  drawPickaxe(ctx, state, x, y, dir);
}

function drawPorter(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const p = state.run.porter; const walking = p.state === 'MOVING_TO_LOOT' || p.state === 'RETURNING_TO_ELEVATOR'; const step = walking && Math.floor(now / 135) % 2 === 0 ? 1 : 0;
  const x = Math.round(p.x); const y = Math.round(p.y) - step; const dir = p.facing;
  ctx.fillStyle = '#5b4537'; ctx.fillRect(x - 3, y - 7, 7, 7); ctx.fillStyle = PALETTE.cyan; ctx.fillRect(x - 4, y - 9, 8, 3); ctx.fillStyle = '#8f8b72'; ctx.fillRect(x - 3, y - 4, 7, 6); ctx.fillStyle = '#46535a'; ctx.fillRect(x - 3, y + 2, 2, 4 + step); ctx.fillRect(x + 2, y + 2, 2, 5 - step);
  if (p.carried.length > 0) { ctx.fillStyle = '#705a3d'; ctx.fillRect(x - dir * 7 - (dir > 0 ? 6 : 0), y - 5, 6, 8); }
}

function drawPickaxe(ctx: CanvasRenderingContext2D, state: GameState, x: number, y: number, dir: -1 | 1): void {
  const swing = state.run.character.swing; const metal = state.run.tool.level === 1 ? PALETTE.rust : PALETTE.steel; ctx.strokeStyle = '#805c3d'; ctx.lineWidth = 1;
  if (!swing) { ctx.beginPath(); ctx.moveTo(x + dir * 3, y - 2); ctx.lineTo(x + dir * 9, y - 8); ctx.stroke(); ctx.fillStyle = metal; ctx.fillRect(x + dir * 8 - (dir < 0 ? 4 : 0), y - 10, 5, 2); return; }
  const progress = Math.min(1, swing.elapsed / 0.44); const phase = progress < 0.45 ? progress / 0.45 : 1 - (progress - 0.45) / 0.55; const headX = x + dir * (5 + Math.round(phase * 9)); const headY = y - 12 + Math.round(phase * 8);
  ctx.beginPath(); ctx.moveTo(x + dir * 2, y - 3); ctx.lineTo(headX, headY); ctx.stroke(); ctx.fillStyle = metal; ctx.fillRect(headX - (dir < 0 ? 4 : 0), headY - 1, 5, 2);
}

function drawElevator(ctx: CanvasRenderingContext2D, state: GameState, now: number): void {
  const e = state.run.elevator; const y = elevatorY(state); const half = state.run.anomaly.selected === 'EMPTY_SHAFT' ? 15 : 20;
  ctx.fillStyle = '#22262b'; ctx.fillRect(WORLD.elevatorX - half, y - 16, half * 2 + 1, 35); ctx.fillStyle = PALETTE.metal; ctx.fillRect(WORLD.elevatorX - half, y - 16, half * 2 + 1, 3); ctx.fillRect(WORLD.elevatorX - half, y + 16, half * 2 + 1, 3); ctx.fillRect(WORLD.elevatorX - half, y - 16, 3, 35); ctx.fillRect(WORLD.elevatorX + half - 2, y - 16, 3, 35);
  const closed = e.state === 'ASCENDING' || e.state === 'DESCENDING' || e.state === 'TRAVELING';
  if (closed) { ctx.fillStyle = '#3d4448'; ctx.fillRect(WORLD.elevatorX - half + 5, y - 11, half - 5, 25); ctx.fillRect(WORLD.elevatorX + 1, y - 11, half - 5, 25); }
  else { const count = Math.min(9, e.cargo.length); for (let i = 0; i < count; i += 1) { const row = Math.floor(i / 3); const col = i % 3; ctx.fillStyle = lootColor(e.cargo[i]!.kind); ctx.fillRect(WORLD.elevatorX - 12 + col * 9, y + 8 - row * 6, 7, 5); } }
  ctx.fillStyle = e.state !== 'IDLE_BOTTOM' || e.cargo.length > 0 ? depthAccent(state.run.depth.current) : '#47413a'; ctx.fillRect(WORLD.elevatorX + Math.max(8, half - 7), y - 12, 3, 3);
  if (e.state === 'IDLE_BOTTOM' && e.cargo.length > 0 && !state.run.automation.autoDispatch.enabled && Math.floor(now / 500) % 2 === 0) { ctx.font = '5px monospace'; ctx.fillStyle = PALETTE.lamp; ctx.textAlign = 'center'; ctx.fillText('SEND', WORLD.elevatorX, y - 22); ctx.textAlign = 'left'; }
}

function drawLiftControl(ctx: CanvasRenderingContext2D, state: GameState, housingDrawn = false): void {
  const { x, y } = INTERACTION_LAYOUT.liftControl;
  if (!housingDrawn) { ctx.fillStyle = '#24272a'; ctx.fillRect(x, y, 8, 12); }
  ctx.fillStyle = state.run.automation.autoDispatch.enabled ? PALETTE.cyan : state.run.automation.autoDispatch.unlocked ? PALETTE.lampDim : '#3c3b3b'; ctx.fillRect(x + 3, y + 2, 2, 2);
  if (!housingDrawn) { ctx.fillStyle = PALETTE.metal; ctx.fillRect(x + 2, y + 7, 4, 2); }
  if (state.meta.protocols.includes('VETERAN_ELEVATOR')) { ctx.fillStyle = PALETTE.d100Lamp; ctx.fillRect(x + 6, y + 1, 1, 5); }
}

function depthAccent(depth: DepthId): string {
  if (depth === 'D-060') return PALETTE.d060Lamp;
  if (depth === 'D-100') return PALETTE.d100Lamp;
  if (depth === 'D-030') return PALETTE.d030Lamp;
  return PALETTE.lamp;
}

export function lootColor(kind: LootKind): string {
  switch (kind) {
    case 'STONE': return '#777078'; case 'IRON': return '#9aa0a2'; case 'COPPER': return PALETTE.copper;
    case 'GOLD_NUGGET': case 'NATURAL_GOLD': return '#d2ad45'; case 'GEM': return '#9f8fbd'; case 'OLD_COIN': case 'POCKET_WATCH': return '#b4874b';
    case 'TRILOBITE': case 'AMMONITE': case 'ANCIENT_FISH': case 'REPTILE_TOOTH': case 'STRANGE_VERTEBRA': return PALETTE.fossil;
    case 'PROSPECTOR_LENS': return '#8da3a2'; case 'RHYTHM_RELAY': return '#a18461'; case 'HUNTER_COMPASS': return '#9b8154'; case 'STRIDE_MODULE': return '#6f8890'; case 'FRACTURE_CORE': return '#886d7c'; case 'BLACK_GLASS_HEART': return '#555d63';
    case 'CRYSTAL_MEMORY': case 'SURVEY_CARTRIDGE': case 'DAMAGED_RESEARCH_LOG': case 'RESONANCE_SHARD': case 'UNKNOWN_INSTRUMENT': return PALETTE.d060Lamp;
    case 'CORE_FRAGMENT': return '#9e8067'; case 'CORE_MATRIX': return '#c09b78';
    default: return '#8b795f';
  }
}
function rarityRank(r: Rarity): number { return ({ COMMON: 0, UNCOMMON: 1, RARE: 2, EPIC: 3, RELIC: 4, ANOMALY: 5 } as const)[r]; }
function rarityColor(r: Rarity): string { if (r === 'ANOMALY') return '#9a8ba1'; if (r === 'RELIC') return '#c2a36f'; if (r === 'EPIC') return '#a990bd'; if (r === 'RARE') return PALETTE.rare; return PALETTE.white; }
