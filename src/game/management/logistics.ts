import { BORE_INSTALL_COST, FREIGHT_INSTALL_COST, RAIL_INSTALL_COST, RAIL_PARTS_REQUIRED } from '../config';
import { canInstallBore, canStartFreightConstruction, canStartRailConstruction, isRailReady } from '../deepGame';
import { cargoWeight } from '../simulation';
import type { FreightPriority, GameState, RailPriority } from '../types';
import { commandAction, information, number, type ManagementState, type StationItem, type StationView } from './types';

export function logisticsView(state: GameState, ui: ManagementState): StationView {
  const run = state.run; const { lines, freightCage: cage } = run.logistics;
  const tabs = [{ id: 'rail', label: 'RAIL' }, { id: 'freight', label: 'FREIGHT' }, { id: 'bore', label: 'BORE' }];
  const engineer = run.engineer.job ? `Engineer: ${run.engineer.job.kind.replaceAll('_', ' ')} on ${run.engineer.job.depth}.`
    : 'Engineer available.';
  let items: StationItem[] = [];
  if (ui.tab === 'freight') {
    if (cage.state === 'UNBUILT') {
      const reason = canStartFreightConstruction(state) ? null
        : !isRailReady(state, 'D-250') ? 'Restore the D-250 Rail first.'
          : !run.research.completed.includes('FREIGHT_ARCHITECTURE') ? 'Requires Freight Architecture.'
            : run.engineer.job ? engineer : `Need ${Math.max(0, FREIGHT_INSTALL_COST - run.scrap)} more Scrap.`;
      items = [{ id: 'build-freight', name: 'Build Freight Cage', summary: `${FREIGHT_INSTALL_COST} Scrap · owned ${run.scrap}`,
        lines: ['Cargo-only vertical route: Cargo Hub → Surface appraisal.', `Build progress: ${number(cage.buildProgress)}/${number(cage.requiredBuildProgress)}.`, engineer],
        reason, actionLabel: `BUILD FREIGHT · ${FREIGHT_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'build-freight' }) }];
    } else {
      items = (['BULK', 'BALANCED'] as FreightPriority[]).map((priority) => {
        const active = cage.priority === priority;
        return { id: priority, name: `Freight ${priority}`, summary: `${cage.state.replaceAll('_', ' ')} · ${number(cargoWeight(cage.cargo))}/${cage.maxLoad} kg`,
          lines: [`Destination: ${cage.targetDepth ?? 'Waiting for cargo'}.`, 'Cargo-only transport. Personnel still use the Central Elevator.',
            priority === 'BULK' ? 'Prefer bulk cargo from hub buffers.' : 'Balance the available hub cargo.',
            ...run.logistics.cargoHubs.map((hub) => `${hub.depth} hub: ${number(cargoWeight(hub.buffer))}/${hub.maxWeight} kg.`)],
          active, reason: active ? 'Current freight priority.' : null, actionLabel: `SET ${priority}`,
          action: active ? null : commandAction({ type: 'freight-priority', priority }) };
      });
    }
  } else if (ui.tab === 'bore') {
    items = run.floors['D-400'].nodes.filter((node) => node.access === 'REMOTE_ONLY').map((node) => {
      const bore = run.deepAutomation.bores.find((candidate) => candidate.siteId === node.id);
      const line = lines.find((candidate) => candidate.id === bore?.connectedLineId);
      if (bore) return information(node.id, node.name, `${bore.state} · HP ${node.hp}/${node.maxHp}`, [
        `Cycle: ${Math.round(bore.cycleProgress / Math.max(.001, bore.cycleDuration) * 100)}%. Installation: ${number(bore.installProgress)}/${number(bore.requiredInstallProgress)}.`,
        `Output: ${number(cargoWeight(bore.outputBuffer))}/${bore.maxOutputWeight} kg.`,
        `Connected line: ${line ? `${line.id} · ${line.state}` : 'DISCONNECTED'}.`, ...(line?.jamReason ? [`Jam: ${line.jamReason}.`] : []), engineer,
        'Remote sites have no walkway. The Bore damages the actual node and outputs physical cargo.',
      ]);
      const reason = canInstallBore(state, node.id) ? null : !run.deepProgress.d400Unlocked ? 'Connect D-400 first.'
        : !run.research.completed.includes('REMOTE_BORE_CONTROL') ? 'Requires Remote Bore Control.'
          : run.engineer.job ? engineer : `Need ${Math.max(0, BORE_INSTALL_COST - run.scrap)} more Scrap.`;
      return { id: node.id, name: node.name, summary: `REMOTE SITE · ${BORE_INSTALL_COST} Scrap · owned ${run.scrap}`,
        lines: ['No walkway: install a Bore, not a player move command.', 'The Engineer installs the Bore and links its physical output to transport.', engineer],
        reason, actionLabel: `INSTALL BORE · ${BORE_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'install-bore', siteId: node.id }) };
    });
  } else {
    const main = lines.find((line) => line.id === 'rail-d250');
    if (!main) {
      const reason = canStartRailConstruction(state) ? null : !run.deepProgress.d250Unlocked ? 'Connect D-250 first.'
        : !run.research.completed.includes('RAIL_LOGISTICS') ? 'Requires Rail Logistics.'
          : !run.deepProgress.railBlueprint && run.deepProgress.railPartsDelivered < RAIL_PARTS_REQUIRED ? `Deliver ${RAIL_PARTS_REQUIRED - run.deepProgress.railPartsDelivered} more Rail Parts.`
            : run.engineer.job ? engineer : `Need ${Math.max(0, RAIL_INSTALL_COST - run.scrap)} more Scrap.`;
      items.push({ id: 'build-rail', name: 'Restore D-250 Rail', summary: `${RAIL_INSTALL_COST} Scrap · owned ${run.scrap}`,
        lines: ['Rail Stop → Minecart → Cargo Hub. Freight takes bulk cargo onward to Surface.', engineer], reason,
        actionLabel: `RESTORE RAIL · ${RAIL_INSTALL_COST}`, action: reason ? null : commandAction({ type: 'build-rail' }) });
    }
    for (const line of lines) for (const priority of ['BULK', 'RESEARCH', 'RARE', 'ANY'] as RailPriority[]) {
      const cart = run.logistics.railCarts.find((candidate) => candidate.lineId === line.id);
      const active = line.priority === priority;
      items.push({ id: `${line.id}:${priority}`, name: `${line.depth} ${priority}`, summary: `${line.state} · Stop ${number(cargoWeight(line.inputBuffer))}/${line.maxInputWeight} kg`,
        lines: [`Line: ${line.from} → ${line.to}.`, `Construction: ${number(line.buildProgress)}/${number(line.requiredBuildProgress)}.`,
          `Cart: ${cart?.state ?? 'MISSING'} · ${number(cargoWeight(cart?.cargo ?? []))} kg.`, `Output: ${number(cargoWeight(line.outputBuffer))}/${line.maxOutputWeight} kg.`,
          `Jam: ${line.jamReason ?? 'None'}.`, engineer, 'Priority changes loading order, not cargo location or ownership.'],
        active, reason: active ? 'Current line priority.' : null, actionLabel: `SET ${priority}`,
        action: active ? null : commandAction({ type: 'rail-priority', lineId: line.id, priority }) });
    }
  }
  return { title: 'DEEP LOGISTICS', tabs, items: items.length ? items : [information('empty', 'No remote site', 'Connect D-400 to inspect remote Bore sites.')],
    back: { station: 'crew', tab: 'routes' } };
}
