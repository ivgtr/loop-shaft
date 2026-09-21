import { ANOMALIES, CORE_PROTOCOLS, LOOT, PASSIVES, RESEARCH } from '../config';
import type { GameState } from '../types';
import type { GameCommand } from '../../runtime/commands';

/** Describe the result, not the internal command or the name of the clicked row. */
export function managementFeedback(state: GameState, command: GameCommand): string {
  const crew = 'crewId' in command ? state.run.phase5.crew.members.find((member) => member.id === command.crewId) : undefined;
  switch (command.type) {
    case 'assign-crew': return `${crew?.name ?? 'Worker'} is heading to ${command.depth}.`;
    case 'miner-priority': case 'porter-priority': return `${crew?.name ?? 'Worker'} now prioritizes ${command.priority.toLowerCase()}.`;
    case 'equip-item': case 'equip-crew-item': {
      const item = state.run.phase5.equipment.inventory.find((candidate) => candidate.id === command.itemId);
      return `${item?.name ?? 'Equipment'} equipped by ${crew?.name ?? 'Player'}.`;
    }
    case 'restore-fossil': return state.meta.collection.entries.some((entry) => entry.kind === command.kind && entry.restored) ? `${LOOT[command.kind].name} restored for the collection.` : 'Restoration is not available.';
    case 'research': return `${RESEARCH[command.research].name} started.`;
    case 'protocol': return `${CORE_PROTOCOLS[command.protocol].name} installed permanently.`;
    case 'toggle-passive': return `${PASSIVES[command.passive].name} ${state.meta.passives.active.includes(command.passive) ? 'activated' : 'deactivated'}.`;
    case 'choose-anomaly': return `${ANOMALIES[command.anomaly].name} is active for this Run.`;
    case 'hire-crew': return `${state.run.phase5.crew.members.at(-1)?.name ?? 'Worker'} joined the shift.`;
    case 'expand-crew': return `Shift expanded to ${state.run.phase5.crew.slots} slots. Hire another worker.`;
    case 'unlock-crew': return 'First shift opened. Assign your workers.';
    case 'cargo-priority': return `Central Lift now prioritizes ${command.priority.toLowerCase()} cargo.`;
    case 'rail-priority': return `${state.run.logistics.lines.find((line) => line.id === command.lineId)?.depth ?? 'Rail'} loading priority: ${command.priority.toLowerCase()}.`;
    case 'freight-priority': return `Freight loading priority: ${command.priority.toLowerCase()}.`;
    case 'build-rail': return 'Engineer dispatched to restore the D-250 Rail.';
    case 'build-freight': return state.run.logistics.freightCage.state === 'UNBUILT' ? 'Engineer dispatched to build the Freight Cage.' : 'Freight Cage ready for cargo.';
    case 'install-bore': return 'Engineer dispatched to install the Bore.';
    default: return 'Order accepted.';
  }
}
