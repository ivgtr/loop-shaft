import type { LootStack, OreQuality } from '../game/types';
import { drawPixelSprite, pixelSprite, type PixelSprite } from './pixelSprite';

export type CargoAppearance = Pick<LootStack, 'kind' | 'quality' | 'specimen'>;
const ORE_ROWS = {
  NORMAL: [
    '............', '............', '....oooo....', '..oorrrro...', '..orsrrrro..',
    '.orssrrrsro.', '.orrrrssrro.', '..orrrrrro..', '...oooooo...', '............',
  ],
  FINE: [
    '............', '....ooo.....', '...ohhro....', '..ohhhrro...', '.ohhrrrsro..',
    '.ohrrrssrro.', '.orrrrssrro.', '..orrrrrro..', '...oooooo...', '............',
  ],
  PURE: [
    '.....o......', '....ohho....', '..o.ohhro...', '.ohhohhrro..', '.ohhrohrrro.',
    '.ohhrrohrro.', '..orrrrsro..', '...orrsro...', '....oooo....', '............',
  ],
} as const satisfies Record<OreQuality, readonly string[]>;
const ORE_PALETTES = {
  STONE: { o: '#2c292c', r: '#75686a', s: '#a1938a', h: '#e3d3b7' },
  IRON: { o: '#252c30', r: '#677780', s: '#9aaeb0', h: '#e3e6d5' },
  COPPER: { o: '#362826', r: '#9b563b', s: '#ce8652', h: '#f1ce8c' },
  ANCIENT_ALLOY: { o: '#2b2c32', r: '#656c83', s: '#9c9cb1', h: '#e4d8c1' },
} as const;
export const ORE_ART = Object.fromEntries(Object.entries(ORE_PALETTES).map(([kind, palette]) => [kind,
  Object.fromEntries(Object.entries(ORE_ROWS).map(([quality, rows]) => [quality, pixelSprite(rows, palette)])),
])) as Record<keyof typeof ORE_PALETTES, Record<OreQuality, PixelSprite>>;

const F = { o: '#34312c', r: '#8b7659', s: '#b6a07a', h: '#e0cca1' };
export const FOSSIL_ART = {
  TRILOBITE: pixelSprite([
    '............', '....oooo....', '...ohhhho...', '..oshhhhsro.', '..orhsshrro.',
    '..oshhhhsro.', '..orhsshrro.', '...oshhso...', '....oooo....', '............',
  ], F),
  AMMONITE: pixelSprite([
    '............', '....oooo....', '..oohhhhoo..', '.ohhsrrshho.', '.ohroooorho.',
    '.ohrohhorho.', '.ohroororho.', '..ohrrrhho..', '...oooooo...', '............',
  ], F),
  ANCIENT_FISH: pixelSprite([
    '............', '......o.....', '..o..ohho...', '..hoohhoo...', '..ohhhhhho..',
    '.oohshsshoo.', '..ohhhhhho..', '..hoohhoo...', '..o..ooo....', '............',
  ], F),
  REPTILE_TOOTH: pixelSprite([
    '............', '..oooooo....', '..ohhhho....', '...ohhho....', '...ohhro....',
    '...ohhro....', '....ohro....', '....oro.....', '....oo......', '............',
  ], F),
  STRANGE_VERTEBRA: pixelSprite([
    '............', '....o..o....', '...ohhoho...', '..oohhhoo...', '.ohhorrhho..',
    '.ohhoorhho..', '..oohhhoo...', '...ohroho...', '....o..o....', '............',
  ], F),
} as const;
export const SEALED_SPECIMEN_ART = pixelSprite([
  '............', '....oooo....', '..oorrssro..', '.orrssrrsro.', '.orsrrsrsro.',
  '.orrssssooo.', '.orsrrrohhho', '..orrsrohrho', '...ooooohhho', '........ooo.',
], { ...F, r: '#645b4d', s: '#95836b' });

/** A sealed specimen's hidden species/grade never enter sprite selection. */
export function cargoSprite(item: CargoAppearance): PixelSprite | null {
  if (item.specimen) return SEALED_SPECIMEN_ART;
  if (item.kind === 'STONE' || item.kind === 'IRON' || item.kind === 'COPPER' || item.kind === 'ANCIENT_ALLOY') {
    return ORE_ART[item.kind][item.quality ?? 'NORMAL'];
  }
  return FOSSIL_ART[item.kind as keyof typeof FOSSIL_ART] ?? null;
}

export function drawDetailedCargo(ctx: CanvasRenderingContext2D, item: CargoAppearance, x: number, y: number): boolean {
  const sprite = cargoSprite(item);
  if (!sprite) return false;
  drawPixelSprite(ctx, sprite, x - 6, y - 10);
  return true;
}

/** Shared non-image path for every physical carrier; never changes cargo ownership/order. */
export function drawCargoFallback(ctx: CanvasRenderingContext2D, item: CargoAppearance, x: number, y: number, color = '#8b795f'): void {
  if (drawDetailedCargo(ctx, item, x, y)) return;
  ctx.save();
  ctx.fillStyle = '#302a25'; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 7, 8, 7);
  ctx.fillStyle = color; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 6, 6, 5);
  ctx.restore();
}
