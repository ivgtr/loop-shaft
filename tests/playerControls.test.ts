import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import {
  cancelPlayerAction, canMoveToNode, miningTarget, movePlayerTo, playerInteraction,
  playerWalkBounds, upgradeBlockReason,
} from '../src/game/playerControls';
import { restoreGameState, serializeGameState } from '../src/game/save';
import {
  canMine, canRequestMine, cargoWeight, currentFloor, requestMine, requestPlayerInteraction,
  requestPlayerReturn, selectNode, sendElevator, unlockAutoDispatch, unlockAutoSwing, unlockPorter,
  updateGame, upgradeBoots, upgradePack, upgradeTool,
} from '../src/game/simulation';
import type { GameState, LootStack } from '../src/game/types';
import { deriveInteractionTargets, resolveInteractionTarget, INTERACTION_LAYOUT } from '../src/render/interactionTargets';
import { characterClip, deriveSemanticRenderState, D001_VISUAL_GROUND_OFFSET, D001_WORKBENCH_FALLBACK_OFFSET, d001ElevatorVisualY } from '../src/render/semanticRenderState';
import { GameRuntime } from '../src/runtime/GameRuntime';
import { MiningInput } from '../src/runtime/MiningInput';
import { createD001Nodes } from '../src/game/config';
const SCRAP_X = createD001Nodes()[0]!.x;


beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined }));
afterEach(() => vi.unstubAllGlobals());

function ticks(state: GameState, count: number, input?: MiningInput): void {
  for (let i = 0; i < count; i += 1) { updateGame(state, 1 / 60); input?.update(); }
}
function atVein(): GameState {
  const state = createGameState(42001);
  const node = currentFloor(state).nodes.find((item) => item.id === 'scrap-ledge')!;
  state.run.character.x = node.x + 13;
  state.run.character.state = 'MINING';
  state.run.character.targetNodeId = node.id;
  state.selection = { type: 'node', id: node.id };
  return state;
}
function iron(id = 'iron', x = SCRAP_X, weight = 2): LootStack {
  return { id, x, y: 206, weight, kind: 'IRON', name: 'Iron', rarity: 'COMMON', category: 'ORE', value: 12, dataValue: 0, coreValue: 0 };
}
function ownership(state: GameState): string[] {
  return [...currentFloor(state).loot, ...state.run.character.carried, ...state.run.porter.carried, ...state.run.elevator.cargo].map((item) => item.id);
}

describe('manual work without forced cargo jobs', () => {
  it('leaves broken ore on the floor and permits the next movement immediately', () => {
    const state = atVein();
    miningTarget(state)!.hp = 10;
    expect(requestMine(state)).toBe(true);
    ticks(state, 30);
    expect(currentFloor(state).loot.length).toBeGreaterThan(0);
    expect(state.run.character.carried).toEqual([]);
    expect(state.run.character.state).toBe('MINING');
    expect(state.run.scrap).toBe(0);
    expect(selectNode(state, 'copper-pocket')).toBe(true);
    expect(state.run.character.state).toBe('MOVING_TO_NODE');
  });

  it('batch-picks nearby ore without a selected node and can mine while carrying', () => {
    const state = atVein();
    cancelPlayerAction(state);
    currentFloor(state).loot.push(iron('a'), iron('b', SCRAP_X + 5));
    expect(requestPlayerInteraction(state)).toBe(true);
    ticks(state, 30);
    expect(state.run.character.carried.map((item) => item.id)).toEqual(['a', 'b']);
    expect(currentFloor(state).loot).toEqual([]);
    expect(state.run.character.state).toBe('IDLE');
    expect(canMine(state)).toBe(true);
    expect(requestMine(state)).toBe(true);
    ticks(state, 30);
    expect(state.run.scrap).toBe(0);
    expect(state.run.character.carried).toHaveLength(2);
  });

  it('a full pack blocks only pickup, not mining, movement, or target changes', () => {
    const state = atVein();
    state.run.character.carried = Array.from({ length: 4 }, (_, i) => iron(`held-${i}`));
    currentFloor(state).loot.push(iron('extra'));
    expect(playerInteraction(state).reason).toContain('PACK FULL');
    expect(requestPlayerInteraction(state)).toBe(false);
    expect(requestMine(state)).toBe(true);
    ticks(state, 30);
    expect(currentFloor(state).loot.map((item) => item.id)).toContain('extra');
    expect(selectNode(state, 'copper-pocket')).toBe(true);
    expect(movePlayerTo(state, 170)).toBe(true);
    ticks(state, 90);
    expect(state.run.character.x).toBe(170);
    expect(cargoWeight(state.run.character.carried)).toBe(8);
  });

  it('cancelling collection keeps every item on the floor', () => {
    const state = atVein();
    currentFloor(state).loot.push(iron());
    requestPlayerInteraction(state);
    ticks(state, 10);
    movePlayerTo(state, 160);
    ticks(state, 60);
    expect(state.run.character.carried).toEqual([]);
    expect(ownership(state)).toEqual(['iron']);
  });

  it('cancelling loading retains cargo and releases only the player loading lock', () => {
    const state = createGameState(42002);
    state.run.character.carried.push(iron());
    expect(requestPlayerInteraction(state)).toBe(true);
    expect(state.run.elevator.state).toBe('LOADING');
    ticks(state, 10);
    cancelPlayerAction(state);
    expect(state.run.elevator.state).toBe('IDLE_BOTTOM');
    expect(state.run.character.carried).toHaveLength(1);
    expect(state.run.elevator.cargo).toEqual([]);
    ticks(state, 90);
    expect(ownership(state)).toEqual(['iron']);
    state.run.porter.state = 'LOADING';
    state.run.elevator.state = 'LOADING';
    cancelPlayerAction(state);
    expect(state.run.elevator.state).toBe('LOADING');
  });

  it('partial unloading leaves remaining items usable rather than entering a forced wait', () => {
    const state = createGameState(42003);
    state.run.elevator.cargo.push(iron('existing', 240, 19));
    state.run.character.carried.push(iron('too-large'), iron('fits', SCRAP_X, 0.8));
    expect(requestPlayerInteraction(state)).toBe(true);
    ticks(state, 45);
    expect(state.run.character.state).toBe('IDLE');
    expect(state.run.character.carried.map((item) => item.id)).toEqual(['too-large']);
    expect(cargoWeight(state.run.elevator.cargo)).toBeCloseTo(19.8);
    expect(new Set(ownership(state)).size).toBe(3);
    expect(selectNode(state, 'scrap-ledge')).toBe(true);
  });

  it.each(['ASCENDING', 'IDLE_BOTTOM'] as const)('returning to an unavailable/full lift (%s) never freezes the player', (liftState) => {
    const state = atVein();
    state.run.character.carried.push(iron());
    state.run.elevator.state = liftState;
    if (liftState === 'IDLE_BOTTOM') state.run.elevator.cargo.push(iron('full', 240, 20));
    expect(requestPlayerReturn(state)).toBe(true);
    ticks(state, 150);
    expect(state.run.character.state).toBe('IDLE');
    expect(state.run.character.carried).toHaveLength(1);
    expect(selectNode(state, 'copper-pocket')).toBe(true);
  });

  it('credits no Scrap until explicitly loaded cargo reaches Surface', () => {
    const state = atVein();
    currentFloor(state).loot.push(iron());
    requestPlayerInteraction(state);
    ticks(state, 30);
    requestPlayerReturn(state);
    ticks(state, 190);
    expect(state.run.elevator.cargo).toHaveLength(1);
    expect(state.run.scrap).toBe(0);
    expect(sendElevator(state)).toBe(true);
    ticks(state, 60);
    expect(state.run.scrap).toBe(0);
    ticks(state, 240);
    expect(state.run.scrap).toBe(12);
    expect(state.run.elevator.cargo).toEqual([]);
  });

  it('allows manual pickup with a Porter, without double ownership when both collect', () => {
    const state = atVein();
    currentFloor(state).loot.push(iron());
    Object.assign(state.run.porter, { enabled: true, state: 'COLLECTING', x: SCRAP_X, targetLootId: 'iron', collectTimer: 0 });
    expect(requestPlayerInteraction(state)).toBe(true);
    ticks(state, 30);
    expect(ownership(state)).toEqual(['iron']);
    expect(state.run.porter.carried).toHaveLength(1);
    expect(state.run.character.carried).toEqual([]);
  });

  it('keeps auto-dispatch effective when a player cannot fit remaining cargo', () => {
    const state = createGameState(42004);
    state.run.automation.autoDispatch = { unlocked: true, enabled: true };
    state.run.elevator.cargo.push(iron('full', 240, 20));
    state.run.character.carried.push(iron());
    ticks(state, 1);
    expect(state.run.elevator.state).toBe('ASCENDING');
    expect(movePlayerTo(state, 150)).toBe(true);
  });

  it('keeps anomaly/travel and remote-only access guards while adding free movement', () => {
    const state = createGameState(42005);
    state.run.depth.current = 'D-030';
    expect(movePlayerTo(state, 20)).toBe(false);
    expect(requestMine(state)).toBe(false);
    expect(playerInteraction(state).type).toBe('scanner');
    state.run.depth.current = 'D-400';
    const remote = currentFloor(state).nodes.find((node) => node.access === 'REMOTE_ONLY')!;
    expect(canMoveToNode(state, remote)).toBe(false);
    expect(requestMine(state, remote.id)).toBe(false);
    expect(movePlayerTo(state, 1_000)).toBe(true);
    ticks(state, 600);
    expect(state.run.character.x).toBe(playerWalkBounds(state)[1]);
    expect(state.run.character.x).toBeLessThan(remote.x);
    state.run.elevator.travel = { from: 'D-400', to: 'D-001', remaining: 2, duration: 2, viaSurface: false };
    expect(movePlayerTo(state, 20)).toBe(false);
  });

  it('accepts old v6 saves and does not restore a held movement or input buffer', () => {
    const state = atVein();
    state.run.character.carried.push(iron());
    delete state.run.character.moveTargetX;
    const restored = restoreGameState(serializeGameState(state))!;
    expect(restored.run.character.carried[0]!.id).toBe('iron');
    movePlayerTo(restored, 300);
    const reloaded = restoreGameState(serializeGameState(restored))!;
    const runtime = new GameRuntime(reloaded);
    expect(runtime.getSnapshot().state.run.character.state).toBe('IDLE');
    expect(runtime.getSnapshot().state.run.character.carried).toHaveLength(1);
  });
});

describe('one target-bound manual mining input', () => {
  it('does not cancel a live swing when clicking its node rapidly', () => {
    const state = atVein();
    const runtime = new GameRuntime(state);
    runtime.attachCanvas({ width: 480, height: 270, style: {}, dataset: {},
      getContext: () => ({ imageSmoothingEnabled: false }),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 270 }),
    } as unknown as HTMLCanvasElement);
    runtime.selectCanvasTarget(SCRAP_X, 214);
    const current = state.run.character.swing;
    ticks(state, 5);
    runtime.selectCanvasTarget(SCRAP_X, 214);
    expect(state.run.character.swing).toBe(current);
    ticks(state, 10);
    expect(miningTarget(state)!.hp).toBe(20);
    expect(state.run.stats.manualSwings).toBe(1);
  });

  it('buffers at most one next swing, only within 150ms of recovery', () => {
    const state = atVein();
    const input = new MiningInput(state);
    expect(input.request()).toBe(true);
    ticks(state, 5, input);
    expect(input.request()).toBe(false);
    ticks(state, 14, input);
    expect(canRequestMine(state)).toBe(true);
    for (let i = 0; i < 20; i += 1) expect(input.request()).toBe(true);
    ticks(state, 90, input);
    expect(state.run.stats.manualSwings).toBe(2);
    expect(miningTarget(state)!.hp).toBe(10);
    expect(state.run.character.swing).toBeNull();
  });

  it('accepts a near-arrival input without allowing attacks while moving', () => {
    const state = createGameState(42006);
    const node = currentFloor(state).nodes[0]!;
    selectNode(state, node.id);
    state.run.character.x = node.x + 13 + state.run.character.moveSpeed * 0.1;
    const input = new MiningInput(state);
    expect(input.request(node.id)).toBe(true);
    expect(state.run.character.swing).toBeNull();
    ticks(state, 10, input);
    expect(state.run.stats.manualSwings).toBe(1);
    expect(state.run.character.state).toBe('MINING');
  });

  it.each(['cancel', 'target', 'depth', 'run', 'expired', 'depleted'] as const)('discards buffered input after %s', (change) => {
    const state = atVein();
    const input = new MiningInput(state);
    input.request();
    ticks(state, 19, input);
    input.request();
    if (change === 'cancel') input.cancel();
    if (change === 'target') selectNode(state, 'copper-pocket');
    if (change === 'depth') state.run.depth.current = 'D-060';
    if (change === 'run') state.meta.runIndex += 1;
    if (change === 'expired') state.elapsed += 0.2;
    if (change === 'depleted') currentFloor(state).nodes[0]!.hp = 0;
    ticks(state, 60, input);
    expect(state.run.stats.manualSwings).toBe(1);
  });
});

describe('shared availability and matching visual interaction geometry', () => {
  const upgrades = [
    ['upgrade-tool', upgradeTool], ['upgrade-boots', upgradeBoots], ['unlock-auto-swing', unlockAutoSwing],
    ['upgrade-pack', upgradePack], ['unlock-porter', unlockPorter], ['unlock-auto-dispatch', unlockAutoDispatch],
  ] as const;
  it.each(upgrades)('%s agrees with its UI prerequisite reason', (action, purchase) => {
    const state = createGameState(42007);
    state.run.scrap = 10_000;
    state.run.stats.manualSwings = 6; state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;
    const available = upgradeBlockReason(state, action) === null;
    expect(purchase(state)).toBe(available);
    if (!available) expect(state.run.scrap).toBe(10_000);
  });
  it('unlocks every upgrade in order and reports missing Scrap instead of silently failing', () => {
    const state = createGameState(42008);
    expect(upgradeBlockReason(state, 'upgrade-tool')).toBe('NEED 90 MORE SCRAP');
    state.run.scrap = 10_000;
    state.run.stats.manualSwings = 6; state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;
    for (const [action, purchase] of upgrades) {
      expect(upgradeBlockReason(state, action)).toBeNull();
      expect(purchase(state)).toBe(true);
      expect(upgradeBlockReason(state, action)).toBe('ALREADY OWNED');
    }
  });
  it('hits the displayed D-001 node lower edge, workshop, and lift cage', () => {
    const state = createGameState(42009);
    const node = currentFloor(state).nodes[0]!;
    const targets = deriveInteractionTargets(state);
    const nodeTarget = targets.find((target) => target.key === `node:${node.id}`)!;
    expect(nodeTarget.position.y).toBe(node.y - 9 + D001_VISUAL_GROUND_OFFSET);
    expect(resolveInteractionTarget({ x: node.x, y: nodeTarget.position.y + 21 }, targets)?.key).toBe(nodeTarget.key);
    const workshop = INTERACTION_LAYOUT.workbench;
    expect(resolveInteractionTarget({ x: workshop.x + 4, y: workshop.y + workshop.height + D001_WORKBENCH_FALLBACK_OFFSET }, targets)?.key).toBe('workbench');
    expect(resolveInteractionTarget({ x: 240, y: d001ElevatorVisualY(0) + 20 }, targets)?.key).toBe('elevator');
  });
  it('uses existing walking/carrying sprites for keyboard movement and idle cargo', () => {
    expect(characterClip('MOVING_TO_POINT', false)).toBe('walk');
    expect(characterClip('MOVING_TO_POINT', false, true)).toBe('carry-walk');
    expect(characterClip('IDLE', false, true)).toBe('carry-idle');
    const state = createGameState(42010);
    state.run.character.carried.push(iron());
    movePlayerTo(state, 170);
    expect(deriveSemanticRenderState(state, 0).character.clip).toBe('carry-walk');
  });
});
