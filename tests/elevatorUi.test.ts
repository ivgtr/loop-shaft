import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { DEPTH_ORDER } from '../src/game/depth';
import { canStartD650Construction, canUnlockD250, canUnlockD400 } from '../src/game/deepGame';
import { elevatorItems, selectedElevatorItem, shipmentStatus, travelBlockReason, type ElevatorTab, type ElevatorUiState } from '../src/game/elevatorUi';
import { canPushD180, canTravelPhase5 } from '../src/game/phase5';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { canDispatchElevator, canExtendD030, canExtendD060, canExtendD100, selectNode, updateGame } from '../src/game/simulation';
import type { GameState, LootStack } from '../src/game/types';
import { layoutGameUi } from '../src/render/gameUi';
import { GameRuntime } from '../src/runtime/GameRuntime';

const ore = (): LootStack => ({ id: 'ore', kind: 'IRON', name: 'Iron', rarity: 'COMMON', category: 'ORE', weight: 2, value: 12, dataValue: 0, coreValue: 0, x: 118, y: 210 });
function ready(): GameState {
  const state = createGameState(650);
  state.run.scrap = 5000; state.run.porter.enabled = true; state.run.automation.autoDispatch.unlocked = true;
  state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;
  return state;
}
function windowState(state: GameState, tab: ElevatorTab, selectedId = elevatorItems(state, tab)[0]!.id): ElevatorUiState {
  return { tab, selectedId, notice: null, runIndex: state.meta.runIndex, depth: state.run.depth.current };
}

beforeEach(() => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) });
});

describe('elevator presentation follows the simulation', () => {
  it('keeps shipment, destinations, and new connections in separate views', () => {
    const state = ready();
    expect(elevatorItems(state, 'dispatch').map((i) => i.id)).toEqual(['shipment', 'relay', 'dispatch-BALANCED', 'dispatch-BULK', 'dispatch-PRIORITY', 'porter-hold']);
    expect(elevatorItems(state, 'travel').map((i) => i.id)).toEqual(['D-001']);
    expect(elevatorItems(state, 'extend').map((i) => i.id)).toEqual(['D-030']);
    expect(elevatorItems(state, 'extend')[0]!.command).toEqual({ type: 'extend-d030' });
    expect(travelBlockReason(state, 'D-001')).toBe('You are here.');
    expect(travelBlockReason(state, 'D-030')).toContain('EXTEND');
  });

  it('explains empty lift, cargo, and transit without granting extra commands', () => {
    const state = ready(); state.run.depth.unlocked.push('D-030');
    expect(travelBlockReason(state, 'D-030')).toBeNull();
    state.run.character.carried = [ore()];
    expect(travelBlockReason(state, 'D-030')).toContain('backpack');
    state.run.character.carried = []; state.run.porter.carried = [ore()];
    expect(travelBlockReason(state, 'D-030')).toContain('Porter');
    state.run.porter.carried = []; state.run.elevator.cargo = [ore()];
    expect(travelBlockReason(state, 'D-030')).toContain('Send');
    expect(elevatorItems(state, 'dispatch')[0]!.command).toEqual({ type: 'send' });
    state.run.elevator.state = 'ASCENDING';
    expect(shipmentStatus(state)).toBe('TO SURFACE');
    expect(elevatorItems(state, 'dispatch')[0]!.command).toBeNull();
    expect(travelBlockReason(state, 'D-030')).toContain('busy');
  });

  it('exposes prerequisites and exact missing amounts including Shaft Blueprint pricing', () => {
    const state = createGameState(651);
    expect(elevatorItems(state, 'extend')[0]!.reason).toContain('Deliver one shipment');
    state.run.stats.elevatorTrips = 1; state.meta.protocols.push('SHAFT_BLUEPRINT'); state.run.automation.autoSwing.unlocked = true;
    expect(elevatorItems(state, 'extend')[0]).toMatchObject({ summary: '360 SCRAP · NEW CONNECTION', reason: 'Need 360 more Scrap.' });
    state.run.scrap = 360;
    expect(elevatorItems(state, 'extend')[0]!.command).not.toBeNull();
  });

  it('never mutates state while deriving views or resolving a stale selection', () => {
    const state = ready(); const saved = serializeGameState(state);
    for (const tab of ['dispatch', 'travel', 'extend'] as const) {
      expect(selectedElevatorItem(state, windowState(state, tab, 'missing'))).toBeDefined();
      elevatorItems(state, tab);
    }
    expect(serializeGameState(state)).toBe(saved);
  });

  it('matches the authoritative predicates at every depth, including late construction', () => {
    const predicates = [canExtendD030, canExtendD060, canExtendD100, canPushD180, canUnlockD250, canUnlockD400, canStartD650Construction];
    for (const depth of DEPTH_ORDER) for (const loaded of [false, true]) for (const funds of [0, 100000]) {
      const state = ready(); state.run.depth.current = depth;
      state.run.depth.unlocked = DEPTH_ORDER.slice(0, DEPTH_ORDER.indexOf(depth) + 1);
      state.run.scrap = funds; if (loaded) state.run.elevator.cargo = [ore()];
      for (const item of elevatorItems(state, 'extend')) {
        const index = DEPTH_ORDER.findIndex((d) => d === item.id) - 1;
        expect(Boolean(item.command), `${depth} -> ${item.id}`).toBe(predicates[index]!(state) && !item.complete);
        if (!item.command) expect(item.reason).toBeTruthy();
      }
      for (const item of elevatorItems(state, 'travel')) {
        const target = DEPTH_ORDER.find((d) => d === item.id)!;
        expect(Boolean(item.command)).toBe(canTravelPhase5(state, target));
      }
      expect(Boolean(elevatorItems(state, 'dispatch')[0]!.command)).toBe(canDispatchElevator(state));
    }
  });
});

describe('elevator input boundary', () => {
  it('opens a connection once and only moves when travel is explicitly requested', () => {
    const state = ready(); selectNode(state, 'scrap-ledge');
    const runtime = new GameRuntime(state); runtime.openElevator('extend'); runtime.activateElevatorItem();
    expect(state.run.depth.unlocked).toContain('D-030'); expect(state.run.depth.current).toBe('D-001');
    expect(state.run.elevator.travel).toBeNull(); expect(state.run.scrap).toBe(3800);
    expect(runtime.getSnapshot().elevatorUi?.selectedId).toBe('D-030');
    runtime.activateElevatorItem(); expect(state.run.scrap).toBe(3800);
    expect(selectedElevatorItem(state, runtime.getSnapshot().elevatorUi!).complete).toBe(true);
    runtime.selectElevatorTab('travel'); runtime.activateElevatorItem();
    expect(state.run.elevator.travel?.to).toBe('D-030'); expect(state.run.depth.current).toBe('D-001');
    expect(runtime.getSnapshot().elevatorUi).toBeNull();
  });

  it('releases held inputs and only accepts the inspected item command', () => {
    const state = ready(); selectNode(state, 'scrap-ledge');
    state.run.character.carried = [ore()];
    const runtime = new GameRuntime(state); runtime.setPointerMovement(1); runtime.openElevator('extend');
    const before = serializeGameState(state);
    runtime.dispatch({ type: 'send' }); runtime.dispatch({ type: 'walk', x: 410 });
    runtime.dispatch({ type: 'mine' }); runtime.dispatch({ type: 'interact' }); runtime.dispatch({ type: 'return' });
    runtime.dispatch({ type: 'travel', depth: 'D-030' }); runtime.setPointerMovement(-1); runtime.openWorkshop();
    expect(serializeGameState(state)).toBe(before); expect(state.run.character.state).toBe('IDLE');
    expect(runtime.getSnapshot().workshop).toBeNull();
    runtime.dispatch({ type: 'cancel' });
    expect(runtime.getSnapshot().elevatorUi).toBeNull(); expect(state.selection).toEqual({ type: 'node', id: 'scrap-ledge' });
    runtime.dispatch({ type: 'walk', x: 400 }); expect(state.run.character.state).toBe('MOVING_TO_POINT');
  });

  it('ships without changing the selected vein and keeps delivery running inside the console', () => {
    const state = ready(); selectNode(state, 'scrap-ledge'); state.run.elevator.cargo = [ore()];
    const runtime = new GameRuntime(state); runtime.openElevator(); runtime.activateElevatorItem();
    expect(state.selection).toEqual({ type: 'node', id: 'scrap-ledge' });
    expect(state.run.elevator.state).toBe('ASCENDING');
    const position = state.run.elevator.position;
    for (let i = 0; i < 60; i++) updateGame(state, 1 / 60);
    expect(state.run.elevator.position).toBeGreaterThan(position);
    expect(runtime.getSnapshot().elevatorUi).not.toBeNull();
  });

  it('never serializes windows or preserves held movement after help closes', () => {
    const state = ready(); const runtime = new GameRuntime(state); runtime.openHelp();
    const before = serializeGameState(state);
    runtime.dispatch({ type: 'walk', x: 400 }); runtime.dispatch({ type: 'mine' }); runtime.openElevator();
    expect(serializeGameState(state)).toBe(before); expect(runtime.getSnapshot().elevatorUi).toBeNull();
    runtime.dispatch({ type: 'cancel' }); runtime.openElevator('extend');
    const saved = serializeGameState(state);
    expect(saved).not.toContain('selectedId'); expect(saved).not.toContain('elevatorUi');
    const restored = new GameRuntime(restoreGameState(saved)!);
    expect(restored.getSnapshot()).toMatchObject({ elevatorUi: null, helpOpen: false });
  });
});

describe('Canvas HUD and lift geometry', () => {
  it.each([320, 390, 639, 640, 680, 960, 1440])('keeps %ipx targets contained, at least 44px and mutually exclusive', (width) => {
    const state = ready(); state.run.depth.unlocked = [...DEPTH_ORDER];
    const worldHeight = width * 9 / 16; const compact = width < 640;
    const viewport = { width, height: worldHeight + (compact ? 242 : 88), world: { x: 0, y: compact ? 110 : 0, width, height: worldHeight } };
    const windows = [null, ...(['dispatch', 'travel', 'extend'] as const).map((tab) => windowState(state, tab))];
    for (const ui of windows) {
      const layout = layoutGameUi(state, ui, false, viewport);
      for (const b of layout.buttons) {
        expect(b.x).toBeGreaterThanOrEqual(0); expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.width).toBeLessThanOrEqual(width); expect(b.y + b.height).toBeLessThanOrEqual(viewport.height);
        expect(b.width).toBeGreaterThanOrEqual(44); expect(b.height).toBeGreaterThanOrEqual(44);
        for (const other of layout.buttons.filter((c) => c !== b)) {
          const overlapX = Math.min(b.x + b.width, other.x + other.width) - Math.max(b.x, other.x);
          const overlapY = Math.min(b.y + b.height, other.y + other.height) - Math.max(b.y, other.y);
          expect(overlapX > .01 && overlapY > .01, `${b.id} overlaps ${other.id}`).toBe(false);
        }
      }
    }
  });

  it('shows and focuses the selected destination after crossing a page boundary', () => {
    const state = ready(); state.run.depth.unlocked = [...DEPTH_ORDER];
    const viewport = { width: 960, height: 628, world: { x: 0, y: 0, width: 960, height: 540 } };
    const layout = layoutGameUi(state, windowState(state, 'travel', 'D-650'), false, viewport);
    expect(layout.buttons.find((b) => b.id === 'lift-item-D-650')?.selected).toBe(true);
    expect(layout.buttons.find((b) => b.id === 'lift-next')?.action).toEqual({ type: 'lift-select', id: 'D-001' });
  });
});
