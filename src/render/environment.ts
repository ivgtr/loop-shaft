import { WORLD } from '../game/config';
import type { DepthId, GameState } from '../game/types';
import { INTERACTION_LAYOUT } from './interactionLayout';
import { PALETTE } from './palette';
import {
  drawD001Background,
  drawD001Rope,
  drawD001ShaftBottom,
  drawD001SurfaceJunction,
  type D001AssetStore,
} from './d001ImageRenderer';
import { d001RopeEndY, deriveSemanticRenderState } from './semanticRenderState';
import { drawPixelText } from './pixelText';
import { displayText } from '../i18n/display';
import type { Locale } from '../i18n';

export function drawEnvironment(ctx: CanvasRenderingContext2D, state: GameState, assets?: D001AssetStore, now = state.elapsed * 1000, locale: Locale = 'en'): void {
  const depth = state.run.depth.current;
  if (depth === 'D-001' && assets && drawD001Background(ctx, assets)) {
    drawD001SurfaceJunction(ctx, assets) || drawSurfaceStationFrame(ctx, locale);
    const semantic = deriveSemanticRenderState(state, state.elapsed * 1000);
    drawD001ShaftBottom(ctx, semantic, assets) || drawShaftBottomFallback(ctx, semantic.shaftBottom);
    drawD001DynamicEnvironment(ctx, state, semantic, assets, locale);
    return;
  }
  ctx.fillStyle = PALETTE.void;
  ctx.fillRect(0, 0, WORLD.width, WORLD.height);
  drawRock(ctx, depth);
  drawSurfaceStation(ctx, state, locale);
  drawShaft(ctx, state);
  drawTunnel(ctx, depth);
  if (depth === 'D-030') drawD030Details(ctx, state);
  if (depth === 'D-060') drawD060Details(ctx, state);
  if (depth === 'D-100') drawD100Details(ctx, state);
  if (depth === 'D-180') drawAncientRuins(ctx, now);
  if (depth === 'D-001') {
    const semantic = deriveSemanticRenderState(state, state.elapsed * 1000);
    if (assets) drawD001ShaftBottom(ctx, semantic, assets) || drawShaftBottomFallback(ctx, semantic.shaftBottom);
    else drawShaftBottomFallback(ctx, semantic.shaftBottom);
  }
}

function drawD001DynamicEnvironment(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  semantic: ReturnType<typeof deriveSemanticRenderState>,
  assets: D001AssetStore,
  locale: Locale,
): void {
  if (state.run.depth.unlocked.includes('D-030')) drawArchive(ctx, state, locale);
  if (state.run.depth.unlocked.includes('D-060')) drawResearchTerminal(ctx, state, locale);
  if (state.meta.runIndex > 1 || state.meta.core > 0 || state.meta.protocols.length > 0) drawCoreConsole(ctx, state, locale);
  if (!drawD001Rope(ctx, semantic, assets)) drawRopeFallback(ctx, semantic.elevator.y);
  for (const [label, y] of [['001', 65], ['030', 103], ['060', 141], ['100', 179]] as const) {
    const depth = `D-${label}` as DepthId;
    ctx.fillStyle = state.run.depth.unlocked.includes(depth) ? depthLamp(depth) : '#43413e';
    ctx.fillRect(258, y - 4, 2, 2);
    drawPixelText(ctx, label, 267, y, { font: 'compact', baseline: 'bottom' });
  }
}

function drawSurfaceStationFrame(ctx: CanvasRenderingContext2D, locale: Locale = 'en'): void {
  ctx.fillStyle = '#17121b';
  ctx.fillRect(199, 0, 82, 38);
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(199, 4, 82, 34);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(204, 8, 72, 3);
  ctx.fillRect(204, 30, 72, 3);
  ctx.fillStyle = PALETTE.white;
  drawPixelText(ctx, displayText(locale, 'SURFACE EXCHANGE'), WORLD.elevatorX, 27, { font: 'standard', align: 'center', baseline: 'bottom' });
}

function drawRopeFallback(ctx: CanvasRenderingContext2D, elevatorYPosition: number): void {
  const height = d001RopeEndY(elevatorYPosition) - 36;
  if (height <= 0) return;
  ctx.fillStyle = '#715a4d';
  ctx.fillRect(WORLD.elevatorX - 1, 36, 2, height);
}

function drawShaftBottomFallback(ctx: CanvasRenderingContext2D, frame: 'sealed' | 'open'): void {
  ctx.fillStyle = frame === 'open' ? '#08080b' : '#17121b';
  ctx.fillRect(216, 223, 49, 47);
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(216, 223, 3, 47);
  ctx.fillRect(262, 223, 3, 47);
  ctx.fillStyle = PALETTE.timber;
  ctx.fillRect(216, 223, 49, 3);
  ctx.fillRect(216, 264, 49, 3);
  if (frame === 'sealed') {
    ctx.fillStyle = '#4e3d2c';
    ctx.fillRect(221, 239, 39, 15);
    ctx.fillStyle = '#715a4d';
    ctx.fillRect(224, 236, 33, 3);
    ctx.fillRect(224, 254, 33, 3);
  }
}

function drawRock(ctx: CanvasRenderingContext2D, depth: DepthId): void {
  const [base, shelf, speck] = depth === 'D-030'
    ? [PALETTE.d030Rock0, PALETTE.d030Rock1, PALETTE.d030Rock2]
    : depth === 'D-060'
      ? [PALETTE.d060Rock0, PALETTE.d060Rock1, PALETTE.d060Rock2]
      : depth === 'D-100'
        ? [PALETTE.d100Rock0, PALETTE.d100Rock1, PALETTE.d100Rock2]
        : [PALETTE.rock0, PALETTE.rock1, PALETTE.rock2];
  ctx.fillStyle = base;
  ctx.fillRect(0, 38, WORLD.width, WORLD.height - 38);
  ctx.fillStyle = shelf;
  for (let row = 0; row < 7; row += 1) {
    const y = 46 + row * 29;
    const offset = row % 2 === 0 ? 0 : 22;
    for (let x = -20 + offset; x < WORLD.width; x += 92) ctx.fillRect(x, y, 68 + (row % 3) * 6, 7 + (row % 2) * 3);
  }
  ctx.fillStyle = speck;
  for (let x = 16; x < WORLD.width; x += 39) {
    ctx.fillRect(x, 65 + ((x / 39) % 4) * 25, 2, 2);
    ctx.fillRect(x + 11, 135 + ((x / 39) % 3) * 20, 3, 2);
  }
}

function drawSurfaceStation(ctx: CanvasRenderingContext2D, state: GameState, locale: Locale): void {
  ctx.fillStyle = '#17121b';
  ctx.fillRect(0, 0, WORLD.width, 38);
  ctx.fillStyle = PALETTE.metalDark;
  ctx.fillRect(199, 4, 82, 34);
  ctx.fillStyle = PALETTE.metal;
  ctx.fillRect(204, 8, 72, 3);
  ctx.fillRect(204, 30, 72, 3);
  ctx.fillStyle = PALETTE.white;
  drawPixelText(ctx, 'LOOP SHAFT', WORLD.elevatorX, 20, { font: 'standard', align: 'center', baseline: 'bottom' });
  ctx.fillStyle = depthLamp(state.run.depth.current);
  drawPixelText(ctx, displayText(locale, 'SURFACE EXCHANGE'), WORLD.elevatorX, 27, { font: 'standard', align: 'center', baseline: 'bottom' });
  if (state.run.depth.unlocked.includes('D-030')) drawArchive(ctx, state, locale);
  if (state.run.depth.unlocked.includes('D-060')) drawResearchTerminal(ctx, state, locale);
  if (state.meta.runIndex > 1 || state.meta.core > 0 || state.meta.protocols.length > 0) drawCoreConsole(ctx, state, locale);
}

function drawArchive(ctx: CanvasRenderingContext2D, state: GameState, locale: Locale): void {
  const { x, y } = INTERACTION_LAYOUT.archive;
  ctx.fillStyle = '#22252a'; ctx.fillRect(x, y, 54, 27);
  ctx.fillStyle = PALETTE.metal; ctx.fillRect(x + 3, y + 3, 48, 2); ctx.fillRect(x + 3, y + 20, 48, 2);
  ctx.fillStyle = '#0d1012'; ctx.fillRect(x + 5, y + 7, 25, 11);
  const lamps = Math.min(6, state.meta.collection.entries.filter((entry) => entry.discovered).length);
  for (let i = 0; i < 6; i += 1) {
    ctx.fillStyle = i < lamps ? PALETTE.d030Lamp : '#45433a';
    ctx.fillRect(x + 34 + (i % 3) * 5, y + 8 + Math.floor(i / 3) * 6, 2, 2);
  }
  ctx.fillStyle = PALETTE.white; drawPixelText(ctx, displayText(locale, 'ARCHIVE'), x + 5, y + 27, { font: 'standard', baseline: 'bottom' });
}

function drawResearchTerminal(ctx: CanvasRenderingContext2D, state: GameState, locale: Locale): void {
  const { x, y } = INTERACTION_LAYOUT.research;
  ctx.fillStyle = '#20272b'; ctx.fillRect(x, y, 58, 27);
  ctx.fillStyle = PALETTE.metal; ctx.fillRect(x + 4, y + 4, 50, 2);
  ctx.fillStyle = '#091217'; ctx.fillRect(x + 6, y + 9, 30, 10);
  const active = state.run.research.active;
  ctx.fillStyle = active ? (Math.floor(state.elapsed * 4) % 2 === 0 ? PALETTE.d060Lamp : '#42616a') : '#3c4a4e';
  ctx.fillRect(x + 42, y + 10, 3, 3); ctx.fillRect(x + 48, y + 10, 3, 3);
  ctx.fillStyle = PALETTE.white; drawPixelText(ctx, displayText(locale, 'ANALYZER'), x + 6, y + 27, { font: 'standard', baseline: 'bottom' });
}

function drawCoreConsole(ctx: CanvasRenderingContext2D, state: GameState, locale: Locale): void {
  const { x, y } = INTERACTION_LAYOUT.coreConsole;
  ctx.fillStyle = '#242321'; ctx.fillRect(x, y, 76, 27);
  ctx.fillStyle = PALETTE.metal; ctx.fillRect(x + 4, y + 4, 68, 2);
  ctx.fillStyle = '#100f0e'; ctx.fillRect(x + 6, y + 9, 34, 10);
  const lit = Math.min(5, state.meta.protocols.length + (state.meta.core > 0 ? 1 : 0));
  for (let i = 0; i < 5; i += 1) { ctx.fillStyle = i < lit ? PALETTE.d100Lamp : '#4a4339'; ctx.fillRect(x + 48 + i * 5, y + 11, 2, 2); }
  ctx.fillStyle = PALETTE.white; drawPixelText(ctx, displayText(locale, 'CORE CONSOLE'), x + 6, y + 27, { font: 'standard', baseline: 'bottom' });
}

function drawShaft(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#09090d'; ctx.fillRect(216, 38, 49, 196);
  ctx.fillStyle = PALETTE.metalDark; ctx.fillRect(216, 38, 3, 196); ctx.fillRect(262, 38, 3, 196);
  ctx.fillStyle = PALETTE.rail; ctx.fillRect(225, 38, 2, 196); ctx.fillRect(253, 38, 2, 196);
  ctx.fillStyle = '#77706c'; ctx.fillRect(239, 36, 2, Math.max(2, elevatorY(state) - 16));
  ctx.fillStyle = PALETTE.metalDark;
  for (let y = 52; y < 226; y += 18) { ctx.fillRect(219, y, 6, 2); ctx.fillRect(255, y, 6, 2); }
  for (const [label, y] of [['001', 65], ['030', 103], ['060', 141], ['100', 179]] as const) {
    const depth = `D-${label}` as DepthId;
    ctx.fillStyle = state.run.depth.unlocked.includes(depth) ? depthLamp(depth) : '#3e3b3a';
    ctx.fillRect(258, y - 4, 2, 2);
    drawPixelText(ctx, label, 267, y, { font: 'compact', baseline: 'bottom' });
  }
}

function drawTunnel(ctx: CanvasRenderingContext2D, depth: DepthId): void {
  const dark = depth === 'D-060' ? '#091217' : depth === 'D-100' ? '#0d0d0e' : depth === 'D-030' ? '#0b1011' : '#0d0c11';
  ctx.fillStyle = dark; ctx.fillRect(22, 183, 194, 45); ctx.fillRect(265, 183, 193, 45);
  ctx.fillStyle = depth === 'D-030' ? '#514536' : depth === 'D-060' ? '#48565b' : depth === 'D-100' ? '#55504b' : PALETTE.timber;
  for (const x of [37, 119, 176, 302, 374, 444]) { ctx.fillRect(x, 180, 4, 35); ctx.fillRect(x - 5, 181, 14, 3); }
  ctx.fillStyle = PALETTE.rail; ctx.fillRect(18, WORLD.floorY + 4, 198, 2); ctx.fillRect(265, WORLD.floorY + 4, 199, 2);
  ctx.fillStyle = depth === 'D-060' ? PALETTE.d060Rock2 : depth === 'D-100' ? PALETTE.d100Rock2 : depth === 'D-030' ? PALETTE.d030Rock2 : PALETTE.rock2;
  ctx.fillRect(0, WORLD.floorY + 7, WORLD.width, 63);
  for (const x of [52, 157, 323, 405]) drawLamp(ctx, x, 187, depth);
}

function drawD030Details(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#394244'; ctx.fillRect(72, 118, 9, 3); ctx.fillRect(75, 114, 3, 9); ctx.fillRect(423, 132, 2, 8); ctx.fillRect(419, 136, 9, 2);
  if (state.run.anomaly.selected === 'FOSSIL_AGE') { ctx.fillStyle = PALETTE.fossil; ctx.fillRect(34, 151, 9, 2); ctx.fillRect(38, 148, 2, 8); }
  if (state.run.anomaly.selected === 'FRAGILE_REALITY') { ctx.fillStyle = '#465255'; for (const x of [42, 88, 154, 316, 381, 446]) ctx.fillRect(x, 91, 1, 17); }
}

function drawD060Details(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = PALETTE.crystal;
  for (const [x, y] of [[31, 141], [69, 115], [163, 151], [326, 121], [398, 144], [456, 106]] as const) {
    ctx.fillRect(x, y, 2, 10); ctx.fillRect(x - 2, y + 4, 6, 2);
  }
  ctx.fillStyle = '#69767a';
  ctx.fillRect(405, 97, 18, 7); ctx.fillRect(409, 92, 2, 12); ctx.fillRect(55, 103, 16, 5);
  ctx.fillStyle = '#4c5c62';
  ctx.fillRect(286, 113, 2, 41); ctx.fillRect(288, 151, 22, 2);
  if (state.run.research.active) { ctx.fillStyle = PALETTE.d060Lamp; ctx.fillRect(291, 149, 2, 2); }
}

function drawD100Details(ctx: CanvasRenderingContext2D, state: GameState): void {
  ctx.fillStyle = '#2a2927'; ctx.fillRect(387, 88, 78, 92);
  ctx.fillStyle = '#55504b'; ctx.fillRect(394, 95, 64, 4); ctx.fillRect(394, 169, 64, 4);
  ctx.strokeStyle = PALETTE.core; ctx.strokeRect(405.5, 111.5, 40, 40);
  ctx.fillStyle = '#161616'; ctx.fillRect(414, 120, 23, 23);
  ctx.fillStyle = state.run.coreChamber.rebootAvailable ? PALETTE.d100Lamp : '#52483d';
  ctx.fillRect(379, 157, 5, 5);
  ctx.fillStyle = '#5f554e'; ctx.fillRect(336, 109, 31, 3); ctx.fillRect(364, 111, 3, 38);
  ctx.fillStyle = '#453f3a'; for (const x of [28, 74, 121, 170, 303, 348]) ctx.fillRect(x, 126, 2, 22);
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, depth: DepthId): void {
  ctx.fillStyle = '#5f5133'; ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = depthLamp(depth); ctx.fillRect(x, y, 2, 2);
}

function depthLamp(depth: DepthId): string {
  if (depth === 'D-030') return PALETTE.d030Lamp;
  if (depth === 'D-060') return PALETTE.d060Lamp;
  if (depth === 'D-100') return PALETTE.d100Lamp;
  return PALETTE.lamp;
}

export function elevatorY(state: GameState): number {
  return WORLD.elevatorBottomY + (WORLD.topY - WORLD.elevatorBottomY) * state.run.elevator.position;
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
