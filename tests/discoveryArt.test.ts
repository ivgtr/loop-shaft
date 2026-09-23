import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { advanceProspecting, applyOreQuality, floorProspects } from '../src/game/prospecting';
import { equipPlayerItem, generateEquipmentItem } from '../src/game/phase5';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { equipmentPreview } from '../src/game/management/equipment';
import { cargoSprite, drawCargoFallback, FOSSIL_ART, ORE_ART, SEALED_SPECIMEN_ART } from '../src/render/cargoSprites';
import { DISCOVERY_ART } from '../src/render/discoveryArt';
import { drawDiscoveryCues } from '../src/render/discoveryCues';
import { drawD001Cargo, drawD001CarriedCargo, drawD001ElevatorCargo, drawD001Player, type D001AssetStore } from '../src/render/d001ImageRenderer';
import { deriveSemanticRenderState } from '../src/render/semanticRenderState';
import { TOOL_ICONS, toolProfile } from '../src/render/equipmentArt';
import { drawPixelSprite, pixelSprite, type PixelSprite } from '../src/render/pixelSprite';
import { loot } from './fixtures/discovery';
import type { EquipmentAffixId } from '../src/game/types';

function context() {
  const paint: { color: string; rect: number[] }[] = [];
  const ctx = { fillStyle: '', save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(), drawImage: vi.fn(),
    fillRect(...rect: number[]) { paint.push({ color: this.fillStyle, rect }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, paint };
}
const missingAssets = { ready: () => null } as unknown as D001AssetStore;
const silhouette = (sprite: PixelSprite) => sprite.rows.map((row) => row.replace(/[^.]/g, '#')).join('\n');
const shapes = Object.values(DISCOVERY_ART).flatMap((stages) => Object.values(stages));
function grayscale(sprite: PixelSprite) {
  const pixels = Array(sprite.width * sprite.height).fill(-1);
  for (const run of sprite.runs) {
    const [r, g, b] = run.color.slice(1).match(/../g)!.map((hex) => parseInt(hex, 16));
    for (let dx = 0; dx < run.width; dx++) pixels[run.y * sprite.width + run.x + dx] = Math.round(r! * .2126 + g! * .7152 + b! * .0722);
  }
  return pixels.join(',');
}

function fieldTool(affix: EquipmentAffixId) {
  const state = createGameState(500);
  for (let seed = 1; seed <= 500; seed++) {
    const item = generateEquipmentItem(state, seed, 'field-pick', 'TOOL');
    if (item.affixes[0]?.id !== affix) continue;
    state.run.phase5.equipment.inventory.push(item); equipPlayerItem(state, item.id);
    return { state, item };
  }
  throw new Error(`Missing field tool ${affix}`);
}

describe('authored pixel assets', () => {
  it.each(shapes.map((sprite, i) => [i, sprite] as const))('validates discovery frame %s as opaque 20x16 runs', (_, sprite) => {
    expect(sprite.width).toBe(20); expect(sprite.height).toBe(16);
    expect(sprite.runs.every((run) => run.x >= 0 && run.x + run.width <= 20 && run.y < 16 && /^#[0-9a-f]{6}$/.test(run.color))).toBe(true);
  });
  it('keeps signal and stage readable without color', () => {
    expect(new Set(shapes.map(grayscale)).size).toBe(9);
    for (const stages of Object.values(DISCOVERY_ART)) expect(silhouette(stages.EXPOSED)).not.toBe(silhouette(stages.SEALED));
    for (const stages of Object.values(DISCOVERY_ART)) expect(stages.SPENT.runs.every((run) => !['#e2cea0', '#7a9b9d'].includes(run.color))).toBe(true);
  });
  it.each(['STONE', 'IRON', 'COPPER', 'ANCIENT_ALLOY'] as const)('gives %s quality different silhouettes, not only a tint', (kind) => {
    expect(new Set(Object.values(ORE_ART[kind]).map(silhouette)).size).toBe(3);
    expect(new Set(Object.values(ORE_ART[kind]).map(grayscale)).size).toBe(3);
  });
  it('uses distinct known fossil and tool silhouettes', () => {
    expect(new Set(Object.values(FOSSIL_ART).map(silhouette)).size).toBe(5);
    expect(new Set(Object.values(TOOL_ICONS).map(silhouette)).size).toBe(4);
  });
  it('rejects malformed art rather than silently padding, and draws only integer pixels', () => {
    expect(() => pixelSprite(['..', '.'], {})).toThrow();
    expect(() => pixelSprite(['z'], {})).toThrow('Missing pixel color');
    const { ctx, paint } = context(); drawPixelSprite(ctx, SEALED_SPECIMEN_ART, 1.4, 2.7, 2);
    expect(paint.every(({ rect }) => rect.every(Number.isInteger))).toBe(true);
  });
});

describe('physical cargo appearance', () => {
  it('never leaks species, grade or locked value from a sealed specimen', () => {
    for (const kind of Object.keys(FOSSIL_ART) as (keyof typeof FOSSIL_ART)[]) for (const grade of ['INTACT', 'PRISTINE'] as const) {
      expect(cargoSprite({ ...loot(kind), specimen: { grade, value: grade === 'INTACT' ? 63 : 999 } })).toBe(SEALED_SPECIMEN_ART);
    }
  });
  it.each(['NORMAL', 'FINE', 'PURE'] as const)('shares exact %s cargo pixels across the PNG and image-failure paths', (quality) => {
    const item = loot('COPPER'); applyOreQuality(item, quality);
    const a = context(); const b = context();
    expect(drawD001Cargo(a.ctx, item, 20, 30, missingAssets)).toBe(true);
    drawCargoFallback(b.ctx, item, 20, 30); expect(a.paint).toEqual(b.paint);
    expect(item.quality).toBe(quality);
  });
  it('carries the same sealed package through the actor and lift without requiring cargo PNGs', () => {
    const state = createGameState(17); const item = loot('TRILOBITE'); item.specimen = { grade: 'PRISTINE', value: 126 };
    state.run.character.carried = [item]; state.run.elevator.cargo = [item];
    const original = serializeGameState(state); const semantic = deriveSemanticRenderState(state, 0);
    const actor = context(); const lift = context();
    expect(drawD001CarriedCargo(actor.ctx, semantic.character, missingAssets)).toBe(true);
    expect(drawD001ElevatorCargo(lift.ctx, state, semantic, missingAssets)).toBe(true);
    expect(actor.paint.map(({ color, rect }) => [color, rect[2], rect[3]])).toEqual(lift.paint.map(({ color, rect }) => [color, rect[2], rect[3]]));
    expect(serializeGameState(state)).toBe(original);
  });
});

describe('state-driven rendering and recovered tools', () => {
  it('preserves exposed and spent art through node regeneration, clock changes and save reload', () => {
    const state = createGameState(77); const floor = state.run.floors['D-001'];
    for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
    const prospect = floorProspects(floor)[0]!; const node = floor.nodes.find((entry) => entry.id === prospect.nodeId)!;
    for (const stage of ['SEALED', 'EXPOSED', 'SPENT']) {
      const before = serializeGameState(state); const original = context();
      const semantic = deriveSemanticRenderState(state, 0); expect(semantic.discoveries.get(node.id)?.stage).toBe(stage);
      drawDiscoveryCues(original.ctx, state, semantic);
      const restored = restoreGameState(before)!; const nextNode = restored.run.floors['D-001'].nodes.find((entry) => entry.id === node.id)!;
      nextNode.hp = 0; nextNode.respawnTimer = 10;
      const after = context(); drawDiscoveryCues(after.ctx, restored, deriveSemanticRenderState(restored, 999999));
      expect(after.paint).toEqual(original.paint); expect(serializeGameState(state)).toBe(before);
      advanceProspecting(floor, node);
    }
  });
  it.each([['FOSSIL_BREAKER', 'fossil', 1], ['LIGHT_FRAME', 'light', 2], ['RESEARCH_PRISM', 'survey', 3]] as const)('maps actual %s ownership to the correct pose bank and comparison', (affix, profile, bank) => {
    const { state, item } = fieldTool(affix); state.run.character.state = 'MINING'; state.run.character.swing = { elapsed: .2, hitApplied: false };
    const before = serializeGameState(state); const semantic = deriveSemanticRenderState(state, 0);
    expect(semantic.character.recoveredTool).toBe(profile);
    const images = new Map<string, object>();
    const assets = { ready(key: string) { if (!images.has(key)) images.set(key, { key }); return images.get(key); } } as unknown as D001AssetStore;
    const { ctx } = context(); drawD001Player(ctx, semantic, assets);
    expect(vi.mocked(ctx.drawImage)).toHaveBeenCalledWith(images.get('playerRecoveredTools'), bank * 320 + semantic.character.frame * 40, 120, 40, 40, -20, 185, 40, 40);
    const preview = equipmentPreview(state, item); expect(toolProfile(preview.currentTool)).toBe(profile); expect(toolProfile(preview.candidateTool)).toBe(profile);
    expect(serializeGameState(state)).toBe(before);
    state.run.phase5.equipment.equippedPlayer.TOOL = undefined;
    expect(deriveSemanticRenderState(state, 0).character.recoveredTool).toBeNull();
  });
  it('falls back to the original posed tool atlas when only the optional recovered atlas fails', () => {
    const { state } = fieldTool('LIGHT_FRAME'); state.run.character.state = 'MINING';
    const base = { id: 'base' }; const assets = { ready: (key: string) => key === 'playerRecoveredTools' ? null : base } as unknown as D001AssetStore;
    const { ctx } = context(); const semantic = deriveSemanticRenderState(state, 0); drawD001Player(ctx, semantic, assets);
    expect(vi.mocked(ctx.drawImage).mock.calls).toHaveLength(5);
    expect(vi.mocked(ctx.drawImage).mock.calls[3]![0]).toBe(base);
  });
});
