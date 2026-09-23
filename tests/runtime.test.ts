import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UPGRADE_COSTS } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { updateGame } from '../src/game/simulation';
import { advanceProspecting, floorProspects } from '../src/game/prospecting';
import { sceneReadout } from '../src/game/hud';
import { deriveInteractionTargets } from '../src/render/interactionTargets';
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

  it('restores inspection when clicking the same depleted mining job after reload', () => {
    const initial = createGameState(771);
    const floor = initial.run.floors['D-001'];
    for (let index = 0; index < 6; index++) advanceProspecting(floor, floor.nodes[0]!);
    const prospect = floorProspects(floor)[0]!;
    const node = floor.nodes.find((candidate) => candidate.id === prospect.nodeId)!;
    advanceProspecting(floor, node);
    node.hp = 0; node.respawnTimer = node.respawnDelay;
    initial.run.character.targetNodeId = node.id;
    initial.run.character.state = 'MINING';
    initial.run.character.x = node.x - 13;
    const state = restoreGameState(serializeGameState(initial))!;
    state.selection = null;
    const runtime = new GameRuntime(state);
    runtime.attachCanvas(fakeCanvas());
    const target = deriveInteractionTargets(state).find((candidate) => candidate.key === `node:${node.id}`)!;
    runtime.selectCanvasTarget(target.position.x, target.position.y);
    expect(state.selection).toEqual({ type: 'node', id: node.id });
    expect(sceneReadout(state).detail).toContain('1 breaks to extract');
    expect(state.run.character.swing).toBeNull();
    expect(state.run.floors['D-001'].prospecting?.prospectWork[0]).toBe(1);
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
