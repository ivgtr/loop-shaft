import { describe, expect, it } from 'vitest';
import { D060_EXTENSION_COST, D100_EXTENSION_COST } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { nextObjective, sceneReadout } from '../src/game/hud';
import { serializeGameState } from '../src/game/save';

function atD030() {
  const state = createGameState(831);
  state.run.depth.current = 'D-030';
  state.run.depth.unlocked = ['D-001', 'D-030'];
  state.run.porter.enabled = true;
  state.run.automation.autoDispatch.unlocked = true;
  return state;
}

describe('live HUD objectives', () => {
  it('advances from scanner and collection prerequisites to opening and travel', () => {
    const state = atD030();
    expect(nextObjective(state)).toContain('Anomaly');
    state.run.anomaly.selected = 'GOLD_RUSH';
    expect(nextObjective(state)).toContain('collectible');
    state.meta.collection.entries[0]!.discovered = true;
    expect(nextObjective(state)).toContain('passive');
    state.meta.passives.unlocked.push('PROSPECTORS_EYE');
    expect(nextObjective(state)).toContain(`Need ${D060_EXTENSION_COST} more Scrap`);
    state.run.scrap = D060_EXTENSION_COST;
    expect(nextObjective(state)).toBe('LIFT · OPEN D-060');
    state.run.depth.unlocked.push('D-060');
    expect(nextObjective(state)).toBe('LIFT · TRAVEL TO D-060');
  });

  it('does not keep asking for completed Core Resonance research', () => {
    const state = atD030();
    state.run.depth.current = 'D-060'; state.run.depth.unlocked.push('D-060');
    expect(nextObjective(state)).toContain('Core Resonance');
    state.run.research.completed.push('CORE_RESONANCE');
    state.run.scrap = D100_EXTENSION_COST;
    expect(nextObjective(state)).toBe('LIFT · OPEN D-100');
    state.run.depth.unlocked.push('D-100');
    expect(nextObjective(state)).toBe('LIFT · TRAVEL TO D-100');
  });

  it('includes the current objective in help without losing vein details', () => {
    const state = atD030(); state.run.depth.unlocked.push('D-060');
    const node = state.run.floors['D-030'].nodes[0]!;
    state.selection = { type: 'node', id: node.id };
    const before = serializeGameState(state);
    const readout = sceneReadout(state);
    expect(readout.detail).toContain('LIFT · TRAVEL TO D-060');
    expect(readout.detail).toContain(node.name);
    expect(readout.detail).toContain(`HP ${node.hp}/${node.maxHp}`);
    expect(serializeGameState(state)).toBe(before);
  });

  it('keeps the initial delivery and first workshop guidance ahead of shaft progression', () => {
    const state = createGameState(832);
    expect(sceneReadout(state).goal).toBe('CLICK/TAP TO MOVE');
    expect(sceneReadout(state).detail).toContain('click or tap the vein');
    state.run.scrap = 90; state.run.stats.elevatorTrips = 1;
    expect(sceneReadout(state).goal).toContain('Steel Pick');
    expect(sceneReadout(state).detail).toContain('Steel Pick');
  });

  it('distinguishes the first reboot from later deep progression', () => {
    const state = atD030();
    state.run.depth.current = 'D-100'; state.run.depth.unlocked.push('D-060', 'D-100');
    expect(nextObjective(state)).toContain('Core Shell');
    state.run.pendingCore = 1;
    expect(nextObjective(state)).toContain('Reboot at the Core Chamber');
    state.meta.runIndex = 2;
    expect(nextObjective(state)).toContain('Ancient Signal');
    state.run.depth.unlocked.push('D-180');
    expect(nextObjective(state)).toBe('LIFT · TRAVEL TO D-180');
  });
});
