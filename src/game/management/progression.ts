import { ANOMALIES, CORE_PROTOCOLS, PASSIVES, RESEARCH } from '../config';
import { createNewRun } from '../createGame';
import { legacyEquipmentForReboot } from '../phase5';
import { researchBlockReason } from '../simulation';
import type { CoreProtocolId, GameState, PassiveId, ResearchId } from '../types';
import { commandAction, information, type ManagementState, type StationItem, type StationView } from './types';

export function researchView(state: GameState, ui: ManagementState): StationView {
  const { run } = state;
  const all = (Object.keys(RESEARCH) as ResearchId[]).map((id): StationItem => {
    const definition = RESEARCH[id]; const done = run.research.completed.includes(id); const active = run.research.active?.id === id;
    const reason = researchBlockReason(state, id);
    return { id, name: definition.name, summary: done ? 'COMPLETE' : active ? `RUNNING · ${Math.ceil(run.research.active!.remaining)}s remaining`
      : `${definition.dataCost} Data · ${definition.duration}s · owned ${run.data}`,
      lines: [definition.description, `Prerequisite: ${definition.prerequisite ? RESEARCH[definition.prerequisite].name : 'None'}.`],
      badge: done ? 'COMPLETE' : active ? 'RUNNING' : reason ? 'LOCKED' : 'READY',
      listDetail: `${definition.dataCost} Data · ${definition.duration}s`,
      progress: active ? { value: definition.duration - run.research.active!.remaining, total: definition.duration, label: `${Math.ceil(run.research.active!.remaining)}s remaining` } : undefined,
      reason, active: done || active, actionLabel: done ? 'COMPLETE' : active ? 'RESEARCHING' : `START · ${definition.dataCost} DATA`,
      action: reason ? null : commandAction({ type: 'research', research: id }) };
  });
  const filtered = all.filter((item) => ui.tab === 'done' ? run.research.completed.includes(item.id as ResearchId)
    : ui.tab === 'plans' ? item.id === ui.selectedId || (!run.research.completed.includes(item.id as ResearchId) && !item.action && run.research.active?.id !== item.id)
      : item.action || run.research.active?.id === item.id || item.id === ui.selectedId);
  return { title: 'SURFACE ANALYZER', running: run.research.active ? { name: RESEARCH[run.research.active.id].name, value: run.research.active.duration - run.research.active.remaining, total: run.research.active.duration, remaining: Math.ceil(run.research.active.remaining) } : undefined, tabs: [{ id: 'work', label: 'CURRENT' }, { id: 'plans', label: 'PLANS' }, { id: 'done', label: 'DONE' }],
    items: filtered.length ? filtered : [information('empty', ui.tab === 'done' ? 'No completed research' : 'No project available',
      ui.tab === 'done' ? 'Completed projects appear here.' : 'Inspect PLANS for prerequisites and missing Data.')] };
}

export function archiveView(state: GameState, ui: ManagementState): StationView {
  const tabs = [{ id: 'finds', label: 'FINDS' }, { id: 'passives', label: 'PASSIVES' }, { id: 'records', label: 'RECORDS' }];
  let items: StationItem[];
  if (ui.tab === 'passives') items = (Object.keys(PASSIVES) as PassiveId[]).map((id) => {
    const unlocked = state.meta.passives.unlocked.includes(id); const active = state.meta.passives.active.includes(id);
    const reason = !unlocked ? 'Discover the matching relic and appraise it at Surface.' : !active && state.meta.passives.active.length >= 2 ? 'Two passives are active. Deactivate one before activating another.' : null;
    return { id, name: unlocked ? PASSIVES[id].name : 'Undiscovered passive', summary: `${active ? 'ACTIVE' : unlocked ? 'STORED' : 'LOCKED'} · ${state.meta.passives.active.length}/2 active`,
      lines: unlocked ? [PASSIVES[id].description, 'Unlocked and active passives persist across Reboot.'] : ['Find and appraise more relics to reveal this passive.'],
      active, badge: active ? 'ACTIVE' : unlocked ? 'INACTIVE' : 'LOCKED', reason, actionLabel: active ? 'DEACTIVATE' : 'ACTIVATE PASSIVE', action: reason ? null : commandAction({ type: 'toggle-passive', passive: id }) };
  });
  else if (ui.tab === 'records') {
    items = [information('depth', 'Expedition record', `Best depth ${state.meta.bestDepth} · Run ${state.meta.runIndex}`,
      ['Collection, equipment discoveries and deep records persist across Reboot.']),
    ...state.meta.equipmentDiscoveries.map((id) => information(`equipment:${id}`, recordName(id), 'Equipment discovered')),
    ...state.meta.ancientDiscoveries.map((id) => information(`ancient:${id}`, recordName(id), 'Ancient discovery')),
    ...state.meta.deepDiscoveries.map((id) => information(`deep:${id}`, recordName(id), 'Deep discovery'))];
  } else items = state.meta.collection.entries.map((entry) => ({ ...information(entry.kind, entry.discovered ? entry.name : '????',
    entry.discovered ? `${entry.rarity} · ${entry.category} · ${entry.count} appraised` : `UNDISCOVERED · ${entry.category}`,
    [entry.discovered ? 'Recorded at Surface. This discovery survives Reboot.' : 'Bring this discovery to Surface to identify it.']), discovery: { category: entry.category, discovered: entry.discovered }, badge: entry.discovered ? `×${entry.count}` : '?' }));
  return { title: 'ARCHIVE TERMINAL', tabs, items, gallery: ui.tab === 'finds' };
}

export function scannerView(state: GameState): StationView {
  const selected = state.run.anomaly.selected;
  return { title: 'GEOLOGICAL SCANNER', tabs: [], items: (selected ? [selected] : state.run.anomaly.options).map((id) => ({
    id, name: ANOMALIES[id].name, summary: selected ? 'ACTIVE FOR THIS RUN' : 'ONE CHOICE FOR THIS RUN',
    lines: [ANOMALIES[id].description, 'This choice cannot be changed until Reboot. Inspect all responses before committing.'],
    reason: selected ? 'Anomaly already selected.' : null, active: selected === id, badge: selected === id ? 'ACTIVE' : 'CANDIDATE', actionLabel: selected ? 'ACTIVE' : 'CHOOSE ANOMALY',
    decision: { confirmLabel: 'CHOOSE ANOMALY', cancelLabel: 'GO BACK', facts: [{ label: 'CHOOSE', value: ANOMALIES[id].name }, { label: 'EFFECT', value: ANOMALIES[id].description }, { label: 'DURATION', value: 'Cannot be changed until Reboot.', warning: true }] },
    action: selected ? null : commandAction({ type: 'choose-anomaly', anomaly: id }), confirmKey: selected ? undefined : id,
  })) };
}

export function coreView(state: GameState, ui: ManagementState): StationView {
  const ids = Object.keys(CORE_PROTOCOLS) as CoreProtocolId[];
  const items = ids.filter((id) => ui.tab === 'owned' ? state.meta.protocols.includes(id) : !state.meta.protocols.includes(id) || id === ui.selectedId).map((id): StationItem => {
    const definition = CORE_PROTOCOLS[id]; const owned = state.meta.protocols.includes(id);
    const reason = owned ? 'Protocol installed permanently.' : state.meta.core < definition.cost ? `Need ${definition.cost - state.meta.core} more Core.` : null;
    return { id, name: definition.name, summary: `${owned ? 'INSTALLED' : `${definition.cost} Core`} · owned ${state.meta.core}`,
      lines: [definition.description, 'Permanent. Applies again at the start of each Run.'], active: owned, badge: owned ? 'INSTALLED' : reason ? 'LOCKED' : 'READY', reason,
      actionLabel: owned ? 'INSTALLED' : `INSTALL · ${definition.cost} CORE`, action: reason ? null : commandAction({ type: 'protocol', protocol: id }) };
  });
  return { title: 'CORE CONSOLE', tabs: [{ id: 'available', label: 'PROTOCOLS' }, { id: 'owned', label: 'INSTALLED' }],
    items: items.length ? items : [information('empty', 'No protocols here', 'Choose the other tab to inspect protocols.')] };
}

export function rebootView(state: GameState): StationView {
  const { run, meta } = state; const legacy = legacyEquipmentForReboot(state);
  const next = createNewRun({ ...meta, runIndex: meta.runIndex + 1, core: meta.core + run.pendingCore, legacyEquipment: legacy });
  const reason = !run.coreChamber.rebootAvailable || run.pendingCore <= 0 ? 'Appraise Core cargo at Surface before Reboot.' : null;
  const lines = [
    `KEEP: ${meta.core} Core + ${run.pendingCore} appraised charge = ${meta.core + run.pendingCore} Core.`,
    `KEEP: ${meta.protocols.length} Core Protocols, ${meta.collection.entries.filter((entry) => entry.discovered).length} collection discoveries and Best Depth ${meta.bestDepth}.`,
    `KEEP: ${meta.passives.unlocked.length} unlocked / ${meta.passives.active.length} active passives, equipment and deep discovery records.`,
    legacy ? `LEGACY LOCKER: ${legacy.name} (${legacy.rarity}, Lv.${legacy.level}) is the one retained equipment instance.`
      : 'GEAR RESET: no equipment instance retained. Legacy Locker is required to keep one.',
    'The locker keeps your equipped tool, otherwise the highest rarity, then level.',
    `RESET: Scrap ${run.scrap} → ${next.scrap}; Data ${run.data} → ${next.data}.`,
    'RESET: all unappraised cargo in the backpack, workers, lifts, floors and transport buffers. It is NOT included in the Core reward.',
    `RESET: ${run.depth.unlocked.length} connected floors → D-001. Buildings, assignments and this Run\'s Anomaly reset.`,
    `NEXT RUN: research ${next.research.completed.length}, crew ${next.phase5.crew.members.length}, tool level ${next.tool.level}. Permanent protocols determine the starting setup.`,
    'You can close this window and keep mining instead. Reboot is optional.',
  ];
  return { title: 'CORE CHAMBER', tabs: [], items: [{ id: 'reboot', name: `Reboot into Run ${meta.runIndex + 1}`,
    summary: `GAIN ${run.pendingCore} CORE · irreversible reset`, lines, reason,
    decision: { confirmLabel: 'CONFIRM REBOOT', cancelLabel: 'KEEP MINING', closeOnCancel: true, facts: [
      { label: 'GAIN', value: `+${run.pendingCore} Core (${meta.core + run.pendingCore} total)` },
      { label: 'KEEP GEAR', value: legacy ? legacy.name : 'None' },
      { label: 'LOSE', value: `${run.phase5.equipment.inventory.length - (legacy ? 1 : 0)} other gear and ALL undelivered cargo.`, warning: true },
      { label: 'RESET', value: 'Run resources, buildings, research, crew and floors.', warning: true },
      { label: 'KEEP', value: 'Core, protocols, discoveries and passives.' },
    ] },
    actionLabel: 'REVIEW REBOOT', action: reason ? null : commandAction({ type: 'reboot' }),
    confirmKey: JSON.stringify([meta.runIndex, run.pendingCore, meta.core, legacy?.id ?? null, meta.protocols, run.phase5.equipment.inventory.map((item) => item.id)]) }] };
}

function recordName(id: string): string {
  if (/^D-\d+$/.test(id)) return `${id} explored`;
  return id.replaceAll('-', ' ').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
