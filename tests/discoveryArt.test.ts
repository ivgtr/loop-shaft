import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { appraisePhysicalCargo, restoreFossil } from '../src/game/appraisal';
import { advanceProspecting, floorProspects } from '../src/game/prospecting';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { rewardNotice } from '../src/game/rewardFeedback';
import { collectionSpriteFrame, cargoSpriteFrame, discoveryHostFrame, visibleCargo } from '../src/render/discoveryVisuals';
import { deriveSemanticRenderState } from '../src/render/semanticRenderState';
import { drawD001Cargo, drawD001CarriedCargo, drawD001ElevatorCargo, type D001AssetStore } from '../src/render/d001ImageRenderer';
import { drawDiscoveryCues } from '../src/render/discoveryCues';
import { deriveInteractionTargets } from '../src/render/interactionTargets';
import type { LootKind } from '../src/game/types';
import { loot } from './fixtures/discovery';

type Sheet = { cell: [number, number]; anchor: [number, number]; columns: number; frames: { name: string; pixels: string[] }[] };
const art = JSON.parse(readFileSync(new URL('../art/d001/discovery-sprites.json', import.meta.url), 'utf8')) as { palette: Record<string, string>; sheets: Record<string, Sheet> };
const fossils = ['TRILOBITE', 'AMMONITE', 'ANCIENT_FISH', 'REPTILE_TOOTH', 'STRANGE_VERTEBRA'] as const;
const context = () => ({ drawImage: vi.fn(), save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D);
const assets = { ready: (key: string) => ({ src: key }) } as unknown as D001AssetStore;
const pixels = (sheet: string, index: number) => art.sheets[sheet]!.frames[index]!.pixels;

// Quantized luminance: evidence for shape/contrast differences, not a substitute for human legibility.
function grayscale(rows: string[]): string {
  return rows.map(row => [...row].map(key => {
    if (key === '.') return '.';
    const color = art.palette[key]!; const r = parseInt(color.slice(1, 3), 16); const g = parseInt(color.slice(3, 5), 16); const b = parseInt(color.slice(5, 7), 16);
    return Math.floor((.2126 * r + .7152 * g + .0722 * b) / 48);
  }).join('')).join('\n');
}

describe('authored discovery assets', () => {
  it('ships 75 palette-only frames with fixed integer anchors and matching PNG dimensions under 8 KiB total', () => {
    let count = 0; let bytes = 0;
    for (const [name, sheet] of Object.entries(art.sheets)) {
      const [w, h] = sheet.cell; expect(sheet.anchor).toEqual([w / 2, h]);
      const png = readFileSync(new URL(`../public/assets/d001/runtime/${name}.png`, import.meta.url));
      expect(png.readUInt32BE(16)).toBe(w * sheet.columns);
      expect(png.readUInt32BE(20)).toBe(h * Math.ceil(sheet.frames.length / sheet.columns));
      expect(png.subarray(1, 4).toString()).toBe('PNG'); bytes += png.length;
      for (const frame of sheet.frames) {
        expect(frame.pixels.length).toBe(h);
        for (const row of frame.pixels) { expect(row.length).toBe(w); for (const key of row) expect(art.palette[key]).toBeDefined(); }
      }
      count += sheet.frames.length;
    }
    expect(count).toBe(75); expect(bytes).toBeLessThan(8192);
    expect(statSync(new URL('../art/d001/discovery-sprites.json', import.meta.url)).size).toBeLessThan(130000);
  });

  it.each(['rock', 'metal', 'copper'])('%s quality changes faces, not the size of the cargo', material => {
    const frames = art.sheets['discovery-cargo-atlas']!.frames.filter(f => f.name.startsWith(`${material}-`));
    expect(frames).toHaveLength(3);
    expect(new Set(frames.map(f => grayscale(f.pixels))).size).toBe(3);
    const bounds = frames.map(({ pixels: rows }) => {
      const points = rows.flatMap((row, y) => [...row].flatMap((key, x) => key === '.' ? [] : [{ x, y }]));
      return [Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.x)), Math.min(...points.map(p => p.y)), Math.max(...points.map(p => p.y))];
    });
    expect(bounds[1]).toEqual(bounds[0]); expect(bounds[2]).toEqual(bounds[0]);
  });

  it('keeps three full deposit silhouettes distinguishable in grayscale', () => {
    const names = ['scrap-ledge', 'copper-pocket', 'fossil-crack'];
    expect(new Set(names.map(name => grayscale(pixels(`node-${name}-atlas`, 0)))).size).toBe(3);
  });

  it('keeps all painted rock pixels inside the existing hit circle without moving its feet', () => {
    const state = createGameState(11); const targets = deriveInteractionTargets(state);
    for (const node of state.run.floors['D-001'].nodes) {
      const target = targets.find(t => t.key === `node:${node.id}`)!;
      expect(target.position.x).toBe(node.x);
      const sheet = art.sheets[`node-${node.id}-atlas`]!;
      // Cell/feet contract is stable. No new invisible click object or altered game coordinates.
      expect(sheet.cell).toEqual([48, 40]); expect(sheet.anchor).toEqual([24, 40]);
      const hit = target.hitShapes[0]!; expect(hit.type).toBe('circle');
      if (hit.type !== 'circle') throw new Error('Expected original node hit circle');
      for (const { pixels: rows } of sheet.frames) for (let y = 0; y < 40; y++) for (let x = 0; x < 48; x++) {
        if (rows[y]![x] !== '.') expect((x - 24) ** 2 + (y - 31) ** 2).toBeLessThanOrEqual(hit.radius ** 2);
      }
    }
  });

  it('has separate opaque extraction molds and distinct public exposure steps', () => {
    for (const signal of ['METAL', 'FOSSIL', 'RESEARCH'] as const) {
      const frames = [
        discoveryHostFrame({ signal, stage: 'SEALED', remaining: 3 }),
        discoveryHostFrame({ signal, stage: 'EXPOSED', remaining: 2 }),
        discoveryHostFrame({ signal, stage: 'EXPOSED', remaining: 1 }),
        discoveryHostFrame({ signal, stage: 'SPENT', remaining: 0 }),
      ];
      expect(new Set(frames.map(index => grayscale(pixels('discovery-host-atlas', index)))).size).toBe(4);
      const spent = pixels('discovery-host-atlas', frames[3]!);
      expect(spent[28]![33]).not.toBe('.'); // opaque dark cavity covers renewable ore behind it
    }
  });
});

describe('a projection of physical discovery state', () => {
  it('never reads species or grade to draw an unidentified specimen', () => {
    const sealed = { specimen: { get grade() { throw new Error('Hidden grade read'); }, value: 100 },
      get kind() { throw new Error('Hidden species read'); }, get equipmentSeed() { throw new Error('Hidden seed read'); }, category: 'FOSSIL' as const };
    expect(cargoSpriteFrame(sealed)).toBe(9); expect(visibleCargo([sealed], 1)[0]).toBe(sealed);
    for (const kind of fossils) for (const grade of ['INTACT', 'PRISTINE'] as const) {
      expect(cargoSpriteFrame({ ...loot(kind), specimen: { grade, value: 1000 } })).toBe(9);
      expect(collectionSpriteFrame({ kind, count: 0, discovered: false, bestSpecimenGrade: grade })).toBe(0);
    }
  });

  it('selects real high-value cargo without mutating loading order, IDs, weight or value', () => {
    const source = [loot('STONE', 'plain'), { ...loot('IRON', 'fine'), quality: 'FINE' as const },
      { ...loot('COPPER', 'pure'), quality: 'PURE' as const }, { ...loot('AMMONITE', 'sealed'), specimen: { grade: 'INTACT' as const, value: 90 } }];
    const before = JSON.stringify(source); const visible = visibleCargo(source, 2);
    expect(visible.map(i => i.id)).toEqual(['sealed', 'pure']); expect(visible[0]).toBe(source[3]); expect(JSON.stringify(source)).toBe(before);
    expect(visibleCargo(source, 0)).toEqual([]);
  });

  it('draws identical source cells at floor, hands and elevator anchors at a fixed 12x10', () => {
    for (const item of [loot('COPPER'), { ...loot('IRON'), quality: 'PURE' as const }, { ...loot('AMMONITE'), specimen: { grade: 'PRISTINE' as const, value: 200 } }]) {
      const floor = context(); drawD001Cargo(floor, item, 120, 223, assets);
      const state = createGameState(44); state.run.character.carried = [item]; state.run.elevator.cargo = [item];
      const semantic = deriveSemanticRenderState(state, 0);
      const hand = context(); drawD001CarriedCargo(hand, semantic.character, assets);
      const lift = context(); drawD001ElevatorCargo(lift, state, semantic, assets);
      const calls = [floor, hand, lift].map(ctx => vi.mocked(ctx.drawImage).mock.calls[0]!);
      expect(calls.map(args => args.slice(1, 5))).toEqual(Array(3).fill(calls[0]!.slice(1, 5)));
      for (const args of calls) expect(args.slice(-2)).toEqual([12, 10]);
    }
  });

  it('never replenishes a SPENT socket during ordinary rock regrowth or save/reload', () => {
    let state = createGameState(771); let floor = state.run.floors['D-001'];
    for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
    const plan = floorProspects(floor)[0]!; let node = floor.nodes.find(n => n.id === plan.nodeId)!;
    expect(deriveSemanticRenderState(state, 0).discoveries.get(node.id)?.stage).toBe('SEALED');
    advanceProspecting(floor, node);
    expect(deriveSemanticRenderState(state, 0).discoveries.get(node.id)?.stage).toBe('EXPOSED');
    advanceProspecting(floor, node); node.hp = 0;
    const id = node.id; const cue = deriveSemanticRenderState(state, 0).discoveries.get(id)!;
    expect(cue.stage).toBe('SPENT'); const frame = discoveryHostFrame(cue);
    state = restoreGameState(serializeGameState(state))!; floor = state.run.floors['D-001']; node = floor.nodes.find(n => n.id === id)!; node.hp = node.maxHp;
    const before = serializeGameState(state);
    for (const now of [0, 10000, 999999]) {
      const semantic = deriveSemanticRenderState(state, now);
      expect(discoveryHostFrame(semantic.discoveries.get(id)!)).toBe(frame);
      drawDiscoveryCues(context(), state, semantic, assets);
    }
    expect(serializeGameState(state)).toBe(before);
  });

  it.each(['CENTRAL', 'FREIGHT'])('records the best known specimen only at actual %s appraisal and persists it', via => {
    let state = createGameState(45); const a = { ...loot('AMMONITE'), specimen: { grade: 'PRISTINE' as const, value: 222 } };
    state.run.elevator.cargo = [a];
    expect(state.meta.collection.entries.find(e => e.kind === 'AMMONITE')?.bestSpecimenGrade).toBeUndefined();
    appraisePhysicalCargo(state, [a], () => undefined, via); state.run.elevator.cargo = [];
    appraisePhysicalCargo(state, [{ ...a, id: 'second', specimen: { grade: 'INTACT', value: 111 } }], () => undefined, via);
    state = restoreGameState(serializeGameState(state))!;
    const entry = state.meta.collection.entries.find(e => e.kind === 'AMMONITE')!;
    expect(entry.bestSpecimenGrade).toBe('PRISTINE'); expect(entry.count).toBe(2); expect(collectionSpriteFrame(entry)).toBe(11);
  });

  it('restored and physically appraised fossils remain different, and old saves do not invent grade', () => {
    const state = createGameState(46); state.meta.bestDepth = 'D-030';
    appraisePhysicalCargo(state, Array.from({ length: 6 }, (_, i) => loot('TRILOBITE', String(i))), () => undefined);
    expect(restoreFossil(state, 'AMMONITE')).toBe(true);
    let entry = state.meta.collection.entries.find(e => e.kind === 'AMMONITE')!;
    expect(entry.bestSpecimenGrade).toBeUndefined(); expect(collectionSpriteFrame(entry)).toBe(16);
    appraisePhysicalCargo(state, [loot('AMMONITE')], () => undefined);
    entry = restoreGameState(serializeGameState(state))!.meta.collection.entries.find(e => e.kind === 'AMMONITE')!;
    expect(entry.bestSpecimenGrade).toBeUndefined(); expect(collectionSpriteFrame(entry)).toBe(6);
  });

  it('does not show a known-specimen portrait in a mining notification', () => {
    const hidden = rewardNotice({ id: 1, at: 0, type: 'DISCOVERY_FOUND', data: { kind: 'AMMONITE', name: 'Unidentified fossil' } });
    expect(hidden?.specimen).toBeUndefined();
    const delivered = rewardNotice({ id: 2, at: 0, type: 'SPECIMEN_APPRAISED', data: { kind: 'AMMONITE', grade: 'PRISTINE' } });
    expect(delivered?.specimen).toEqual({ kind: 'AMMONITE', grade: 'PRISTINE' });
  });

  it('covers each collection fossil shape and each ore quality without unknown frame indices', () => {
    for (const kind of fossils) expect(cargoSpriteFrame(loot(kind))).toBeLessThan(23);
    for (const kind of ['STONE', 'IRON', 'COPPER'] as LootKind[]) for (const quality of ['NORMAL', 'FINE', 'PURE'] as const) {
      expect(cargoSpriteFrame({ ...loot(kind), quality })).toBeLessThan(9);
    }
  });
});
