write('tests/fieldUi.test.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '92b8f66e66155464276c4c4710ba0d5332f66605a5512fe279361e481c028c60', [(0,0,'''import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { fieldActionHint, fieldGuideTarget, fieldInstruction, fieldResources } from '../src/game/fieldUi';
import { sceneReadout } from '../src/game/hud';
import { createManagementState, stationView } from '../src/game/management';
import { surveyRequest } from '../src/game/management/survey';
import { serializeGameState } from '../src/game/save';
import { canRequestMine } from '../src/game/simulation';
import { drawGameUi, layoutGameUi } from '../src/render/gameUi';
import { drawInteractionOverlay } from '../src/render/interactionOverlay';
import { deriveInteractionTargets } from '../src/render/interactionTargets';
import { layoutManagementUi } from '../src/render/managementUi';
import { drawMeter } from '../src/render/meters';
import { GameRuntime } from '../src/runtime/GameRuntime';

function paint() {
  const captions: string[] = []; const rects: number[][] = [];
  const ctx = new Proxy({ fillText: (text: string) => captions.push(text), fillRect: (...rect: number[]) => rects.push(rect),
    measureText: (text: string) => ({ width: text.length * 7 }) }, {
    get: (target, key) => target[key as keyof typeof target] ?? (() => undefined),
    set: () => true,
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, captions, rects };
}
const viewport = (width: number) => ({ width, height: width < 680 ? 844 : 640,
  world: { x: 0, y: width < 680 ? 298 : 0, width, height: width * 9 / 16 } });
afterEach(() => vi.unstubAllGlobals());

describe('quiet worksite UI', () => {
  it.each([390, 960])('paints gauges, not state narration, at %ipx; detailed readout is retained', width => {
    const state = createGameState(); const node = state.run.floors['D-001'].nodes[0]!;
    state.selection = { type: 'node', id: node.id }; state.run.character.x = node.x + 13;
    state.run.character.state = 'MINING'; state.run.character.targetNodeId = node.id;
    state.run.character.swing = { elapsed: 0.05, hitApplied: false }; node.hp = 20;
    const { ctx, captions } = paint(); const view = viewport(width);
    const layout = layoutGameUi(state, null, false, view);
    drawGameUi(ctx, state, null, false, view, layout, null, null);
    expect(captions.join(' ')).not.toMatch(/HP|SWINGING|READY TO MINE|MOVING|DATA|CORE|RUN 01|SMALL LOADS|PACK /);
    expect(captions).toContain('MINE'); expect(captions).toContain('SEND');
    expect(sceneReadout(state).short).toContain('HP 20/30');
    expect(layout.buttons.find(button => button.id === 'mine')).toMatchObject({ busy: true, disabled: true });
  });

  it('draws only relevant HP gauges and never turns a depleted rock into a refill gauge', () => {
    const state = createGameState(); const node = state.run.floors['D-001'].nodes[0]!;
    const idle = paint();
    drawInteractionOverlay(idle.ctx, deriveInteractionTargets(state), null, null, null, state);
    expect(idle.rects).toHaveLength(0);
    state.selection = { type: 'node', id: node.id }; node.hp = 15;
    const selected = paint();
    drawInteractionOverlay(selected.ctx, deriveInteractionTargets(state), state.selection, null, null, state);
    expect(selected.rects.filter(rect => rect[3] === 4)).toHaveLength(1);
    expect(selected.rects.at(-1)?.[2]).toBe(14); // 28 interior pixels, half remaining.
    node.hp = 0;
    const depleted = paint();
    drawInteractionOverlay(depleted.ctx, deriveInteractionTargets(state), state.selection, null, null, state);
    expect(depleted.rects).toHaveLength(0);
    const meter = paint(); drawMeter(meter.ctx, { x: 0, y: 0, width: 30, height: 4 }, Infinity, 0);
    expect(meter.rects).toHaveLength(2); // Invalid proportions cannot draw outside the track.
  });

  it('keeps node affordances stable during a swing without changing input eligibility', () => {
    const state = createGameState(); const node = state.run.floors['D-001'].nodes[0]!;
    state.run.character.x = node.x + 13; state.run.character.state = 'MINING'; state.run.character.targetNodeId = node.id;
    const before = deriveInteractionTargets(state).find(target => target.key === `node:${node.id}`)!;
    state.run.character.swing = { elapsed: 0, hitApplied: false };
    expect(canRequestMine(state)).toBe(false);
    expect(deriveInteractionTargets(state).find(target => target.key === before.key)).toEqual(before);
    expect(fieldActionHint(state, { type: 'mine' })).toBeNull();
  });

  it('reveals relevant currencies and teaches actions rather than reporting routine work', () => {
    const state = createGameState();
    expect(fieldResources(state)).toEqual({ data: false, core: false, run: false });
    expect(fieldInstruction(state)).toBe('SELECT A VEIN');
    state.run.character.state = 'MOVING_TO_POINT'; expect(fieldInstruction(state)).toBeNull();
    state.run.elevator.state = 'ASCENDING'; expect(fieldInstruction(state)).toBeNull();
    state.run.depth.unlocked.push('D-060'); expect(fieldResources(state).data).toBe(true);
    state.run.pendingCore = 1; expect(fieldResources(state).core).toBe(true);
    state.meta.runIndex = 2; expect(fieldResources(state).run).toBe(true);
    state.run.depth.current = 'D-060'; state.run.depth.unlocked.push('D-100');
    expect(fieldGuideTarget(state)).toEqual({ type: 'elevator' });
  });

  it('gives actionable feedback only on an explicit attempt and never serializes hints', () => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
    const state = createGameState(); const runtime = new GameRuntime(state); const before = serializeGameState(state);
    expect(runtime.getSnapshot().controlHint).toBeNull();
    runtime.explainControl({ type: 'send' });
    expect(runtime.getSnapshot().controlHint?.text).toBe('LOAD CARGO FIRST');
    expect(serializeGameState(state)).toBe(before);
    runtime.openManagement(surveyRequest(state));
    expect(runtime.getSnapshot().controlHint).toBeNull();
  });

  it('keeps complete finite reserves and probabilities in read-only, paged field notes', () => {
    const state = createGameState(); state.run.depth.current = 'D-100'; state.run.depth.unlocked.push('D-100');
    const node = state.run.floors['D-100'].nodes.find(node => node.id === 'core-shell')!;
    node.coreExtracted = 1; state.selection = { type: 'node', id: node.id };
    const before = serializeGameState(state); const ui = createManagementState(state, surveyRequest(state));
    const view = stationView(state, ui); const item = view.items.find(item => item.id === node.id)!;
    expect(item.lines.join(' ')).toMatch(/CORE|Core/); expect(item.lines.join(' ')).toContain('finite');
    expect(view.items.every(item => item.action === null)).toBe(true);
    ui.detailsOpen = true;
    const layout = layoutManagementUi(state, ui, { width: 320, height: 540, world: { x: 0, y: 0, width: 320, height: 180 } });
    expect(layout.pages.flat().join(' ')).toContain('finite');
    expect(layout.buttons.some(button => button.id === 'station-activate')).toBe(false);
    expect(serializeGameState(state)).toBe(before);
  });

  it('keeps primary control positions and non-overlapping touch areas stable', () => {
    for (const width of [320, 390, 679, 680, 960]) {
      const state = createGameState(); const view = viewport(width);
      const before = layoutGameUi(state, null, false, view).buttons;
      state.run.scrap = 1500; state.run.stats.elevatorTrips = 1;
      const after = layoutGameUi(state, null, false, view).buttons;
      expect(after.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })))
        .toEqual(before.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })));
      for (const [index, b] of after.entries()) {
        expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
        expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width); expect(b.y + b.height).toBeLessThanOrEqual(view.height);
        for (const other of after.slice(index + 1)) expect(Math.min(b.x + b.width, other.x + other.width) > Math.max(b.x, other.x)
          && Math.min(b.y + b.height, other.y + other.height) > Math.max(b.y, other.y)).toBe(false);
      }
    }
  });
});
''')])
write('tests/management.test.ts', 'b1feec025197e28eaa6b8301e4b33e5b7db2c19cceb824d609308b6b6f24ee42', 'ca01dcbea7b91f599eb7de0cc636f8d10597d8def07bc71e973e0e219ee99aae', [(107,108,"    expect(view.items.map((i) => i.id)).toEqual(['workshop', 'survey', 'equipment']);\n")])
