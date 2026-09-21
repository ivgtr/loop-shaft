import { createGameState } from '../../src/game/createGame';
import { generateEquipmentItem, unlockCrewOperations } from '../../src/game/phase5';
import type { GameState } from '../../src/game/types';

export function managementGame(): GameState {
  const state = createGameState(31003);
  state.meta.runIndex = 2; state.meta.core = 30;
  state.run.scrap = 50000; state.run.data = 40;
  state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180', 'D-250', 'D-400'];
  state.run.research.completed = ['DEEP_SURVEY', 'CORE_RESONANCE', 'CREW_ROUTING', 'CARGO_SCHEDULER'];
  state.run.porter.enabled = true; state.run.porter.state = 'FIND_LOOT';
  unlockCrewOperations(state);
  state.run.deepProgress.d250Unlocked = true; state.run.deepProgress.d400Unlocked = true;
  state.run.deepProgress.railBlueprint = true;
  for (let i = 0; i < 14; i++) {
    const item = generateEquipmentItem(state, 130 + i, 'ancient-pick', 'TOOL');
    item.name = `Recovered pick ${i}`;
    state.run.phase5.equipment.inventory.push(item);
  }
  for (const slot of ['BOOTS', 'PACK', 'LAMP'] as const) state.run.phase5.equipment.inventory.push(generateEquipmentItem(state, 567, `ancient-${slot.toLowerCase()}`, slot));
  state.run.character.x = 131;
  return state;
}
