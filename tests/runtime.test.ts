import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_COSTS } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { serializeGameState } from '../src/game/save';
import { updateGame } from '../src/game/simulation';
import { GameRuntime } from '../src/runtime/GameRuntime';
import { createD001Nodes } from '../src/game/config';
const SCRAP_X = createD001Nodes()[0]!.x;


describe('GameRuntime', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
  });

  it('publishes an immutable snapshot after a typed command', () => {
    const state = createGameState(7001);
    state.run.scrap = UPGRADE_COSTS.tool;
    const runtime = new GameRuntime(state);
    const initial = runtime.getSnapshot();
    const listener = vi.fn();
    runtime.subscribe(listener);

    runtime.dispatch({ type: 'upgrade-tool' });

    expect(initial.state.run.tool.level).toBe(1);
    expect(runtime.getSnapshot().state.run.tool.level).toBe(2);
    expect(runtime.getSnapshot().revision).toBe(initial.revision + 1);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('updates hover and cursor without changing game state, revision, or subscribers', () => {
    const state = createGameState(7002);
    const runtime = new GameRuntime(state);
    const canvas = fakeCanvas();
    runtime.attachCanvas(canvas);
    const beforeSave = serializeGameState(state);
    const beforeSnapshot = runtime.getSnapshot();
    const listener = vi.fn();
    runtime.subscribe(listener);

    runtime.updateCanvasPointer(SCRAP_X, 201);

    expect(runtime.getHoveredTargetKey()).toBe('node:scrap-ledge');
    expect(canvas.style.cursor).toBe('pointer');
    expect(canvas.dataset.interactionTarget).toBe('node:scrap-ledge');
    expect(serializeGameState(state)).toBe(beforeSave);
    expect(runtime.getSnapshot()).toBe(beforeSnapshot);
    expect(listener).not.toHaveBeenCalled();

    runtime.clearCanvasPointer();
    expect(canvas.style.cursor).toBe('default');
    expect(runtime.getHoveredTargetKey()).toBeNull();
  });

  it('uses the same resolved target for hover and click while preserving blank-click selection', () => {
    const state = createGameState(7003);
    const runtime = new GameRuntime(state);
    const canvas = fakeCanvas();
    runtime.attachCanvas(canvas);
    runtime.updateCanvasPointer(SCRAP_X, 201);
    const hovered = runtime.getHoveredTargetKey();

    runtime.selectCanvasTarget(SCRAP_X, 201);
    expect(hovered).toBe('node:scrap-ledge');
    expect(state.selection).toEqual({ type: 'node', id: 'scrap-ledge' });

    runtime.selectCanvasTarget(20, 100);
    expect(state.selection).toEqual({ type: 'node', id: 'scrap-ledge' });
  });

  it('preserves D-001 selection, movement, and same-node click mining', () => {
    const state = createGameState(7004);
    const runtime = new GameRuntime(state);
    runtime.attachCanvas(fakeCanvas());
    runtime.selectCanvasTarget(SCRAP_X, 201);
    expect(state.run.character.state).toBe('MOVING_TO_NODE');

    for (let index = 0; index < 300 && state.run.character.state !== 'MINING'; index += 1) updateGame(state, 1 / 60);
    expect(state.run.character.state).toBe('MINING');
    runtime.selectCanvasTarget(SCRAP_X, 201);
    expect(state.run.character.swing).not.toBeNull();
  });
});

function fakeCanvas(): HTMLCanvasElement {
  const context = { imageSmoothingEnabled: false } as CanvasRenderingContext2D;
  return {
    width: 480,
    height: 270,
    style: { cursor: '' },
    dataset: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
  } as unknown as HTMLCanvasElement;
}
