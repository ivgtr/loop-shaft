import { BORE_INSTALL_COST, FREIGHT_INSTALL_COST, RAIL_INSTALL_COST, RAIL_PARTS_REQUIRED } from '../config';
import { canInstallBore, canStartFreightConstruction, canStartRailConstruction, isRailReady } from '../deepGame';
import { cargoWeight } from '../simulation';
import type { FreightPriority, GameState, RailPriority, TransportLine } from '../types';
import { commandAction, information, number, type ManagementState, type RouteStop, type StationItem, type StationOption, type StationView } from './types';

const RAIL_PRIORITIES: RailPriority[] = ['BULK', 'RESEARCH', 'RARE', 'ANY'];
const FREIGHT_PRIORITIES: FreightPriority[] = ['BULK', 'BALANCED'];

export function logisticsView(state: GameState, ui: ManagementState): StationView {
  const run = state.run; const { lines, freightCage: cage } = run.logistics;
  const tabs = [{ id: 'rail', label: 'RAIL' }, { id: 'freight', label: 'FREIGHT' }, { id: 'bore', label: 'BORE' }];
  const engineer = run.engineer.job ? `Engineer: ${run.engineer.job.kind.replaceAll('_', ' ').toLowerCase()} on ${run.engineer.job.depth}.` : 'Engineer available.';
  let items: StationItem[] = [];
  if (ui.tab === 'freight') {
    if (cage.state === 'UNBUILT') {
      const building = run.engineer.job?.kind === 'FREIGHT_INSTALL';
      const reason = canStartFreightConstruction(state) ? null : !isRailReady(state, 'D-250') ? 'Restore the D-250 Rail first.'
        : !run.research.completed.includes('FREIGHT_ARCHITECTURE') ? 'Requires Freight Architecture.'
          : run.engineer.job ? engineer : `Need ${Math.max(0, FREIGHT_INSTALL_COST - run.scrap)} more Scrap.`;
      items = [{ id: 'build-freight', name: 'Freight Cage', summary: building ? 'UNDER CONSTRUCTION' : `${FREIGHT_INSTALL_COST} Scrap · owned ${run.scrap}`,
        badge: building ? 'BUILDING' : reason ? 'LOCKED' : 'READY',
        progress: building ? { value: cage.buildProgress, total: cage.requiredBuildProgress, label: 'Freight construction' } : undefined,
        lines: ['Carries cargo from the hub to Surface. Personnel use the Central Lift.', engineer],
        reason, actionLabel: building ? 'BUILDING' : `BUILD FREIGHT · ${FREIGHT_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'build-freight' }) }];
    } else {
      const priority = FREIGHT_PRIORITIES.find((candidate) => candidate === ui.optionId) ?? cage.priority;
      const active = priority === cage.priority;
      items = [{ id: 'freight-cage', name: 'Freight Cage', summary: readable(cage.state), badge: readable(cage.state),
        options: options(FREIGHT_PRIORITIES, cage.priority, priority),
        route: [
          ...run.logistics.cargoHubs.map((hub) => bufferStop(hub.depth, hub.buffer, hub.maxWeight)),
          bufferStop('Freight', cage.cargo, cage.maxLoad), { label: 'Surface', detail: 'Appraisal', blocked: false },
        ],
        lines: [`Destination: ${cage.targetDepth ?? 'Waiting for cargo'}.`, `Current priority: ${cage.priority}.`,
          priority === 'BULK' ? 'Prefer bulk cargo from the hubs.' : 'Balance cargo waiting at the hubs.',
          'The Central Lift still carries personnel and priority cargo.'],
        reason: active ? 'Current freight priority.' : null, actionLabel: `SET ${priority}`,
        action: active ? null : commandAction({ type: 'freight-priority', priority }) }];
    }
  } else if (ui.tab === 'bore') {
    items = run.floors['D-400'].nodes.filter((node) => node.access === 'REMOTE_ONLY').map((node) => {
      const bore = run.deepAutomation.bores.find((candidate) => candidate.siteId === node.id);
      const line = lines.find((candidate) => candidate.id === bore?.connectedLineId);
      if (bore) return { ...information(node.id, node.name, `${bore.state} · HP ${node.hp}/${node.maxHp}`, [
        line ? `${line.depth} transport: ${readable(line.state)}.` : 'Transport disconnected. The Bore cannot send its output.',
        ...(line?.jamReason ? [`Stopped: ${readable(line.jamReason)}.`] : []), engineer,
        'Clearing space in the transport route lets the Bore resume.',
      ]), badge: bore.state,
      progress: { value: bore.state === 'INSTALLING' ? bore.installProgress : bore.cycleProgress,
        total: bore.state === 'INSTALLING' ? bore.requiredInstallProgress : bore.cycleDuration,
        label: bore.state === 'INSTALLING' ? 'Bore installation' : 'Drill cycle' },
      route: [bufferStop('Bore output', bore.outputBuffer, bore.maxOutputWeight),
        ...(line ? railRoute(state, line) : [{ label: 'Transport', detail: 'Disconnected', blocked: true }])],
      };
      const reason = canInstallBore(state, node.id) ? null : !run.deepProgress.d400Unlocked ? 'Connect D-400 first.'
        : !run.research.completed.includes('REMOTE_BORE_CONTROL') ? 'Requires Remote Bore Control.'
          : run.engineer.job ? engineer : `Need ${Math.max(0, BORE_INSTALL_COST - run.scrap)} more Scrap.`;
      return { id: node.id, name: node.name, summary: `${BORE_INSTALL_COST} Scrap · owned ${run.scrap}`, badge: reason ? 'LOCKED' : 'READY',
        lines: ['No walkway. Install a Bore to mine this vein.', 'The Engineer connects its output to the transport line.', engineer],
        reason, actionLabel: `INSTALL BORE · ${BORE_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'install-bore', siteId: node.id }) };
    });
  } else {
    if (!lines.some((line) => line.id === 'rail-d250')) {
      const reason = canStartRailConstruction(state) ? null : !run.deepProgress.d250Unlocked ? 'Connect D-250 first.'
        : !run.research.completed.includes('RAIL_LOGISTICS') ? 'Requires Rail Logistics.'
          : !run.deepProgress.railBlueprint && run.deepProgress.railPartsDelivered < RAIL_PARTS_REQUIRED ? `Deliver ${RAIL_PARTS_REQUIRED - run.deepProgress.railPartsDelivered} more Rail Parts.`
            : run.engineer.job ? engineer : `Need ${Math.max(0, RAIL_INSTALL_COST - run.scrap)} more Scrap.`;
      items.push({ id: 'build-rail', name: 'D-250 Rail', summary: `${RAIL_INSTALL_COST} Scrap · owned ${run.scrap}`, badge: reason ? 'LOCKED' : 'READY',
        lines: ['Carry ore from the Rail Stop to the Cargo Hub by minecart.', engineer], reason,
        actionLabel: `RESTORE RAIL · ${RAIL_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'build-rail' }) });
    }
    for (const line of lines) {
      const priority = line.id === ui.selectedId ? RAIL_PRIORITIES.find((candidate) => candidate === ui.optionId) ?? line.priority : line.priority;
      const active = line.priority === priority;
      items.push({ id: line.id, name: `${line.depth} Rail`, summary: readable(line.state), badge: readable(line.state),
        listDetail: `Loading: ${line.priority.toLowerCase()}`, route: railRoute(state, line),
        progress: line.state === 'BUILDING' ? { value: line.buildProgress, total: line.requiredBuildProgress, label: 'Rail construction' } : undefined,
        options: options(RAIL_PRIORITIES, line.priority, priority),
        lines: [`${line.from} → ${line.to}.`, `Current loading priority: ${line.priority}.`,
          `Stopped: ${line.jamReason ? readable(line.jamReason) : 'No blockage'}.`, engineer,
          `Selected priority: ${priority.toLowerCase()}. Changes which cargo the minecart loads next.`],
        reason: active ? 'Current line priority.' : null, actionLabel: `SET ${priority}`,
        action: active ? null : commandAction({ type: 'rail-priority', lineId: line.id, priority }) });
    }
  }
  return { title: 'DEEP LOGISTICS', tabs, items: items.length ? items : [information('empty', 'No remote site', 'Connect D-400 to inspect Bore sites.')],
    back: { station: 'crew', tab: 'routes' } };
}
function options(values: readonly string[], active: string, selected: string): StationOption[] {
  return values.map((id) => ({ id, label: id, active: id === active, selected: id === selected }));
}
function readable(value: string): string { return value.replaceAll('_', ' '); }
function bufferStop(label: string, cargo: Parameters<typeof cargoWeight>[0], capacity: number): RouteStop {
  const weight = cargoWeight(cargo);
  return { label, detail: `${number(weight)}/${capacity} kg`, blocked: capacity > 0 && weight >= capacity - .001 };
}
function railRoute(state: GameState, line: TransportLine): RouteStop[] {
  const cart = state.run.logistics.railCarts.find((candidate) => candidate.lineId === line.id);
  const hub = state.run.logistics.cargoHubs.find((candidate) => candidate.depth === line.depth);
  return [bufferStop('Rail stop', line.inputBuffer, line.maxInputWeight),
    { label: 'Minecart', detail: cart ? `${number(cargoWeight(cart.cargo))} kg · ${readable(cart.state)}` : 'Missing cart', blocked: !cart || cart.state === 'JAMMED' },
    hub ? { ...bufferStop('Cargo hub', hub.buffer, hub.maxWeight), blocked: line.jamReason === 'CARGO_HUB_FULL' || cargoWeight(hub.buffer) >= hub.maxWeight - .001 }
      : { label: 'Cargo hub', detail: 'Disconnected', blocked: true },
    { label: 'Surface', detail: 'Via lifts', blocked: false },
  ];
}
