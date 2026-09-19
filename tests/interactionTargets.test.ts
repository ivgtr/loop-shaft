import { describe, expect, it } from 'vitest';
import { WORLD } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import type { GameState, RemoteBore, TransportLine } from '../src/game/types';
import {
  clientToWorldPoint,
  deriveInteractionTargets,
  resolveInteractionTarget,
} from '../src/render/interactionTargets';

describe('interaction targets', () => {
  it('converts CSS client coordinates to the 480x270 logical canvas', () => {
    expect(clientToWorldPoint(580, 320, { left: 100, top: 50, width: 960, height: 540 }))
      .toEqual({ x: 240, y: 135 });
    expect(clientToWorldPoint(0, 0, { left: 0, top: 0, width: 0, height: 270 })).toBeNull();
  });

  it('uses inclusive hit boundaries and padding beyond a node body', () => {
    const state = createGameState(8101);
    const targets = deriveInteractionTargets(state);
    expect(resolveInteractionTarget({ x: 140, y: 201 }, targets)?.key).toBe('node:scrap-ledge');
    expect(resolveInteractionTarget({ x: 140.01, y: 201 }, targets)?.key).not.toBe('node:scrap-ledge');
    // The rendered Scrap Ledge ends around x=131; the logical hit remains forgiving.
    expect(resolveInteractionTarget({ x: 136, y: 201 }, targets)?.key).toBe('node:scrap-ledge');
  });

  it('tracks the moving elevator cage while retaining the fixed control panel', () => {
    const state = createGameState(8102);
    let elevator = deriveInteractionTargets(state).find((target) => target.key === 'elevator')!;
    expect(elevator.position.y).toBe(WORLD.elevatorBottomY + 10);
    expect(resolveInteractionTarget({ x: WORLD.elevatorX, y: WORLD.elevatorBottomY }, [elevator])?.key).toBe('elevator');

    state.run.elevator.position = 1;
    elevator = deriveInteractionTargets(state).find((target) => target.key === 'elevator')!;
    expect(elevator.position.y).toBe(WORLD.topY);
    expect(resolveInteractionTarget({ x: WORLD.elevatorX, y: WORLD.topY }, [elevator])?.key).toBe('elevator');
    expect(resolveInteractionTarget({ x: WORLD.elevatorX + 29, y: WORLD.floorY - 12 }, [elevator])?.key).toBe('elevator');
  });

  it('moves D-001 Workshop emphasis while retaining its original hit region', () => {
    const state = createGameState(8108);
    const workshop = deriveInteractionTargets(state).find((target) => target.key === 'workbench')!;
    expect(workshop.position.y).toBe(210);
    expect(resolveInteractionTarget({ x: WORLD.workbenchX, y: WORLD.floorY - 20 }, [workshop])?.key).toBe('workbench');
  });

  it('excludes hidden, locked, unbuilt, and not-yet-selectable targets', () => {
    const state = createGameState(8103);
    const initialKeys = deriveInteractionTargets(state).map((target) => target.key);
    expect(initialKeys).not.toContain('archive');
    expect(initialKeys).not.toContain('research');
    expect(initialKeys).not.toContain('crew-board');
    expect(initialKeys).not.toContain('freight-control');
    expect(initialKeys.some((key) => key.startsWith('rail-stop:'))).toBe(false);
    expect(initialKeys.some((key) => key.startsWith('bore-console:'))).toBe(false);

    state.run.depth.current = 'D-030';
    state.run.depth.unlocked.push('D-030');
    const pendingKeys = deriveInteractionTargets(state).map((target) => target.key);
    expect(pendingKeys).toContain('scanner');
    expect(pendingKeys.some((key) => key.startsWith('node:'))).toBe(false);
  });

  it('prioritizes Bore and logistics controls over overlapping nodes', () => {
    const boreState = prepareD400State();
    const boreTargets = deriveInteractionTargets(boreState);
    expect(resolveInteractionTarget({ x: 364, y: 201 }, boreTargets)?.key).toBe('bore-console:bore-echo-pocket');

    const railState = createGameState(8105);
    railState.run.depth.current = 'D-250';
    railState.run.depth.unlocked.push('D-250');
    railState.run.floors['D-250'].nodes[0]!.x = 414;
    railState.run.logistics.lines.push(makeLine('line-overlap', 'D-250', 'JAMMED'));
    railState.run.logistics.cargoHubs.push({ id: 'hub-overlap', depth: 'D-250', buffer: [], maxWeight: 64 });
    const railTargets = deriveInteractionTargets(railState);
    expect(resolveInteractionTarget({ x: 414, y: 201 }, railTargets)?.key).toBe('rail-stop:line-overlap');
  });

  it('resolves equal-distance nodes by their stable floor order', () => {
    const state = createGameState(8106);
    const [first, second] = state.run.floors['D-001'].nodes;
    second!.x = first!.x;
    expect(resolveInteractionTarget({ x: first!.x, y: first!.y - 9 }, deriveInteractionTargets(state))?.key)
      .toBe(`node:${first!.id}`);
  });

  it('keeps diagnostic targets selectable while deriving unavailable states', () => {
    const state = prepareD400State();
    state.run.floors['D-400'].nodes[0]!.hp = 0;
    state.run.deepAutomation.bores[0]!.state = 'JAMMED';
    state.run.elevator.state = 'ASCENDING';
    const targets = deriveInteractionTargets(state);
    const depleted = targets.find((target) => target.key === 'node:null-edge')!;
    const remote = targets.find((target) => target.key === 'node:echo-pocket')!;
    const bore = targets.find((target) => target.key === 'bore-console:bore-echo-pocket')!;
    const elevator = targets.find((target) => target.key === 'elevator')!;
    expect([depleted.shortStatus, remote.shortStatus, bore.shortStatus, elevator.shortStatus])
      .toEqual(['DEPLETED', 'NO WALKWAY', 'JAMMED', 'ASCENDING']);
    expect([depleted.selectable, remote.selectable, bore.selectable, elevator.selectable]).toEqual([true, true, true, true]);
    expect([depleted.primaryActionAvailable, remote.primaryActionAvailable, bore.primaryActionAvailable, elevator.primaryActionAvailable])
      .toEqual([false, false, false, false]);
  });

  it('returns no world targets during floor travel', () => {
    const state = createGameState(8107);
    state.run.elevator.travel = { from: 'D-001', to: 'D-030', remaining: 2, duration: 2.8, viaSurface: true };
    expect(deriveInteractionTargets(state)).toEqual([]);
  });
});

function prepareD400State(): GameState {
  const state = createGameState(8104);
  state.run.depth.current = 'D-400';
  state.run.depth.unlocked.push('D-400');
  state.run.deepAutomation.bores.push(makeBore());
  return state;
}

function makeBore(): RemoteBore {
  return {
    id: 'bore-echo-pocket', depth: 'D-400', siteId: 'echo-pocket', targetNodeId: 'echo-pocket',
    state: 'DRILLING', cycleProgress: 0, cycleDuration: 1.35, hitAt: 0.72, damage: 18,
    outputBuffer: [], maxOutputWeight: 26, connectedLineId: null, installProgress: 10, requiredInstallProgress: 10,
  };
}

function makeLine(id: string, depth: TransportLine['depth'], state: TransportLine['state']): TransportLine {
  return {
    id, type: 'RAIL', depth, from: 'Stop', to: 'Hub', state, capacity: 26, priority: 'ANY',
    buildProgress: 9, requiredBuildProgress: 9, inputBuffer: [], outputBuffer: [],
    maxInputWeight: 34, maxOutputWeight: 64, jamReason: state === 'JAMMED' ? 'test' : null,
  };
}
