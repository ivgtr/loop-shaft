import { CREW_BOARD_COST, CREW_HIRE_COSTS, CREW_SLOT_COSTS } from '../config';
import { canUnlockCrewOperations, crewAssignmentBlockReason } from '../phase5';
import type { CargoRoutingPriority, GameState, MinerPriority, PorterPriority } from '../types';
import { commandAction, information, number, type ManagementState, type StationItem, type StationView } from './types';

export const MINER_PRIORITIES: MinerPriority[] = ['ANY', 'RESEARCH', 'RARE', 'NEAREST'];
export const PORTER_PRIORITIES: PorterPriority[] = ['NEAREST', 'RESEARCH', 'CORE', 'RELIC', 'RARE', 'VALUE'];
const ROUTES: CargoRoutingPriority[] = ['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'];
const PRIORITY_HELP: Record<string, string> = {
  ANY: 'Choose available veins without a specialist signal preference.', RESEARCH: 'Favor research signals or physical Research cargo.',
  RARE: 'Favor rare signals or higher-rarity cargo.', NEAREST: 'Favor the nearest eligible vein or cargo.',
  CORE: 'Favor Core cargo.', RELIC: 'Favor Relic cargo.', VALUE: 'Favor higher appraisal value.',
  BALANCED: 'Share the Central Elevator between waiting floor queues.', ANCIENT: 'Favor Ancient cargo queues.',
};

export function crewView(state: GameState, ui: ManagementState): StationView {
  const run = state.run; const crew = run.phase5.crew;
  const member = crew.members.find((candidate) => candidate.id === ui.subjectId);
  if (member) {
    const status = `${member.assignedDepth}${member.pendingDepth ? ` → ${member.pendingDepth}` : ''} · ${member.state.replaceAll('_', ' ')}`;
    const load = `Carried: ${number(member.body.carried.reduce((sum, item) => sum + item.weight, 0))} kg. Transfers use the Central Elevator; work is not teleported.`;
    let items: StationItem[];
    if (ui.tab === 'priority') {
      items = (member.role === 'MINER' ? MINER_PRIORITIES : PORTER_PRIORITIES).map((priority) => {
        const active = priority === (member.role === 'MINER' ? member.minerPriority : member.porterPriority);
        return { id: priority, name: priority, summary: status, lines: [PRIORITY_HELP[priority]!, load], active,
          reason: active ? 'Current priority.' : null, actionLabel: active ? 'ACTIVE' : `SET ${priority}`,
          action: active ? null : commandAction(member.role === 'MINER'
            ? { type: 'miner-priority', crewId: member.id, priority: priority as MinerPriority }
            : { type: 'porter-priority', crewId: member.id, priority: priority as PorterPriority }) };
      });
    } else if (ui.tab === 'gear') {
      items = (['TOOL', 'LAMP'] as const).map((slot) => {
        const current = run.phase5.equipment.inventory.find((item) => item.id === member.equipment[slot]);
        return { id: slot, name: slot, summary: current?.name ?? 'No recovered equipment fitted', lines: [status, 'Browse every eligible instance and compare it before equipping. Equipment cannot be shared by two owners.'],
          reason: null, actionLabel: `INSPECT ${slot}`, action: { type: 'navigate', request: { station: 'equipment', subjectId: member.id, tab: slot } } };
      });
    } else {
      items = run.depth.unlocked.map((depth) => {
        const reason = crewAssignmentBlockReason(state, member.id, depth);
        return { id: depth, name: depth, summary: status, lines: [load, ...(member.travel ? [`Travel: ${Math.ceil(member.travel.remaining)}s remaining.`] : [])],
          reason, active: member.assignedDepth === depth, actionLabel: `ASSIGN TO ${depth}`,
          action: reason ? null : commandAction({ type: 'assign-crew', crewId: member.id, depth }) };
      });
    }
    return { title: member.name, tabs: [{ id: 'assign', label: 'ASSIGN' }, { id: 'priority', label: 'PRIORITY' }, { id: 'gear', label: 'GEAR' }],
      items, back: { station: 'crew', selectedId: member.id } };
  }
  const tabs = [{ id: 'members', label: 'CREW' }, { id: 'hire', label: 'HIRE' }, { id: 'routes', label: 'ROUTES' }];
  if (!crew.unlocked) {
    const reason = unlockReason(state);
    return { title: 'SHIFT BOARD', tabs, items: [{ id: 'unlock', name: 'Open first shift', summary: `${CREW_BOARD_COST} Scrap · owned ${run.scrap}`,
      lines: ['Adds one Miner and converts the existing Porter into an assignable worker.', 'Requires Crew Routing and Cargo Scheduler research. The Porter must finish unloading.'],
      reason, actionLabel: `OPEN SHIFT · ${CREW_BOARD_COST}`, action: reason ? null : commandAction({ type: 'unlock-crew' }) }] };
  }
  if (ui.tab === 'hire') {
    const items = (['MINER', 'PORTER'] as const).map((role): StationItem => {
      const cost = CREW_HIRE_COSTS[role];
      const reason = crew.members.length >= crew.slots ? 'All shift slots are occupied. Expand the shift first.' : run.scrap < cost ? `Need ${cost - run.scrap} more Scrap.` : null;
      return { id: role, name: `Hire ${role}`, summary: `${crew.members.length}/${crew.slots} staffed · ${cost} Scrap · owned ${run.scrap}`,
        lines: [role === 'MINER' ? 'Mines selected veins on the assigned floor.' : 'Carries physical loot to Floor Cargo for elevator collection.', `Starts on ${run.depth.current}. Assign a floor and priority after hiring.`],
        reason, actionLabel: `HIRE ${role} · ${cost}`, action: reason ? null : commandAction({ type: 'hire-crew', role }) };
    });
    const cost = CREW_SLOT_COSTS[crew.slots] ?? 5200;
    const reason = crew.slots >= 4 ? 'Maximum shift size reached.' : run.scrap < cost ? `Need ${cost - run.scrap} more Scrap.` : null;
    items.push({ id: 'expand', name: 'Expand shift', summary: `${crew.slots}/4 slots · ${crew.slots >= 4 ? 'Complete' : `${cost} Scrap · owned ${run.scrap}`}`,
      lines: ['Adds one empty shift slot, not a worker. Hire separately.'], reason, actionLabel: `EXPAND · ${cost}`,
      action: reason ? null : commandAction({ type: 'expand-crew' }) });
    return { title: 'SHIFT BOARD', tabs, items };
  }
  if (ui.tab === 'routes') {
    const items = ROUTES.map((priority): StationItem => {
      const active = run.phase5.cargo.priority === priority;
      const reason = !run.phase5.cargo.unlocked ? 'Cargo Scheduler routing is not available.' : active ? 'Current routing priority.' : null;
      return { id: priority, name: priority, summary: 'Central Elevator · Floor Cargo queues', lines: [PRIORITY_HELP[priority]!, 'Scheduling changes which physical queue is served next. It does not teleport cargo or pay before appraisal.'],
        active, reason, actionLabel: `SET ${priority}`, action: reason ? null : commandAction({ type: 'cargo-priority', priority }) };
    });
    if (run.depth.unlocked.includes('D-250')) items.push({ ...information('plant', 'Deep logistics', 'Rail / Freight / Bore controls'),
      actionLabel: 'INSPECT LOGISTICS', action: { type: 'navigate', request: { station: 'logistics' } } });
    return { title: 'SHIFT BOARD', tabs, items };
  }
  return { title: 'SHIFT BOARD', tabs, items: crew.members.map((worker) => ({
    id: worker.id, name: worker.name, summary: `${worker.assignedDepth}${worker.pendingDepth ? ` → ${worker.pendingDepth}` : ''} · ${worker.state.replaceAll('_', ' ')}`,
    lines: [`${crew.members.length}/${crew.slots} staffed.`, `Priority: ${worker.role === 'MINER' ? worker.minerPriority : worker.porterPriority}.`,
      `Carried: ${number(worker.body.carried.reduce((sum, item) => sum + item.weight, 0))} kg.`, 'Inspect to choose a destination, explicit priority, or equipment.'],
    reason: null, actionLabel: 'INSPECT WORKER', action: { type: 'navigate', request: { station: 'crew', subjectId: worker.id } },
  })) };
}

function unlockReason(state: GameState): string | null {
  if (canUnlockCrewOperations(state)) return null;
  const run = state.run;
  if (state.meta.runIndex < 2) return 'Available after the first Reboot.';
  if (!run.research.completed.includes('CREW_ROUTING')) return 'Requires Crew Routing.';
  if (!run.research.completed.includes('CARGO_SCHEDULER')) return 'Requires Cargo Scheduler.';
  if (!run.porter.enabled) return 'Hire the original Porter at the workshop first.';
  if (run.porter.carried.length || run.porter.state === 'LOADING') return 'Wait for the Porter to finish unloading.';
  return `Need ${CREW_BOARD_COST - run.scrap} more Scrap.`;
}
