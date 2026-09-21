import type { EquipmentItem, EquipmentRarity } from '../game/types';
import { drawPixelSprite, pixelSprite } from './pixelSprite';

export type ToolProfile = 'basic' | 'fossil' | 'light' | 'survey';
/** Stable precedence for multi-affix tools; a drawing never claims to summarize every effect. */
export function toolProfile(item?: Pick<EquipmentItem, 'affixes'>): ToolProfile {
  const has = (id: EquipmentItem['affixes'][number]['id']) => item?.affixes.some((affix) => affix.id === id);
  return has('FOSSIL_BREAKER') ? 'fossil' : has('LIGHT_FRAME') ? 'light' : has('RESEARCH_PRISM') ? 'survey' : 'basic';
}
export function equipmentColor(rarity?: EquipmentRarity): string {
  return rarity === 'ANCIENT' ? '#c1a56e' : rarity === 'EPIC' ? '#9f8cae' : rarity === 'RARE' ? '#78949a' : '#9b978d';
}
const P = { o: '#2b2422', r: '#795238', h: '#d4c5a0', s: '#899794', c: '#91bcc0' };
export const TOOL_ICONS = {
  basic: pixelSprite([
    '................', '................', '..oooooooooo....', '.ohhhhhhhhso....',
    '.osoorrrooso....', '..o.orro..o.....', '....orro........', '....orro........',
    '....orro........', '....orro........', '....orro........', '....orro........',
    '....orro........', '.....oo.........', '................', '................',
  ], P),
  fossil: pixelSprite([
    '................', '..ooooooooo.....', '.ohhhhhhhhoo....', '.ohhhhhhhhsso...',
    '.ohhoorroosso...', '..oo.orro.oo....', '.....orro.......', '.....orro.......',
    '.....orro.......', '.....orro.......', '.....orro.......', '.....orro.......',
    '.....orro.......', '......oo........', '................', '................',
  ], P),
  light: pixelSprite([
    '................', '................', '...ooooooo......', '..ohhhhhhoo.....',
    '.osoorrrooso....', '..o.orro..o.....', '.....oro........', '.....oro........',
    '.....oro........', '.....oro........', '.....oro........', '.....oro........',
    '.....oro........', '......o.........', '................', '................',
  ], P),
  survey: pixelSprite([
    '................', '....o...........', '...ohco.........', '..ohhccooooo....',
    '.ohhccchhhso....', '..occoorroso....', '...oo.orro.o....', '......orro......',
    '......orro......', '......orro......', '......orro......', '......orro......',
    '......orro......', '.......oo.......', '................', '................',
  ], P),
} as const;
export function drawToolIcon(ctx: CanvasRenderingContext2D, item: Pick<EquipmentItem, 'affixes'> | undefined, x: number, y: number, scale: number): void {
  drawPixelSprite(ctx, TOOL_ICONS[toolProfile(item)], x, y, scale);
}

/** The fallback head follows the same swing position as its handle, never an independent overlay. */
export function drawToolHead(ctx: CanvasRenderingContext2D, profile: ToolProfile, x: number, y: number, facing: -1 | 1, metal: string): void {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(facing, 1);
  ctx.fillStyle = '#2b2422'; ctx.fillRect(-1, -2, 7, profile === 'fossil' ? 5 : 4);
  ctx.fillStyle = profile === 'fossil' ? '#d4c5a0' : profile === 'survey' ? '#91bcc0' : metal;
  ctx.fillRect(0, -1, 5, profile === 'fossil' ? 3 : 1);
  if (profile === 'survey') { ctx.fillRect(1, -3, 2, 2); ctx.fillStyle = '#e3e6d5'; ctx.fillRect(1, -3, 1, 1); }
  if (profile === 'basic' || profile === 'fossil') ctx.fillRect(4, 0, 1, 2);
  ctx.restore();
}
