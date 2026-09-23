import { surveyView } from './survey';
import { canShowCrewBoard } from '../phase5';
import type { GameState, Selection } from '../types';
import { crewView } from './crew';
import { equipmentView } from './equipment';
import { logisticsView } from './logistics';
import { archiveView, coreView, rebootView, researchView, scannerView } from './progression';
import { information, type ManagementState, type Station, type StationItem, type StationRequest, type StationView } from './types';
export type { ManagementState, Station, StationItem, StationRequest } from './types';

export function stationAvailable(state: GameState, station: Station): boolean {
  const { run, meta } = state;
  switch (station) {
    case 'facilities': case 'equipment': return true;
    case 'survey': return !(run.depth.current === 'D-030' && !run.anomaly.selected);
    case 'research': return run.depth.unlocked.includes('D-060');
    case 'archive': return run.depth.unlocked.includes('D-030');
    case 'scanner': return run.depth.current === 'D-030';
    case 'crew': return canShowCrewBoard(state);
    case 'core': return meta.runIndex > 1 || meta.core > 0 || meta.protocols.length > 0;
    case 'reboot': return run.depth.current === 'D-100';
    case 'logistics': return run.depth.unlocked.includes('D-250');
  }
}

export function stationSelection(station: Station): Selection {
  switch (station) {
    case 'research': return { type: 'research' };
    case 'archive': return { type: 'archive' };
    case 'scanner': return { type: 'scanner' };
    case 'crew': return { type: 'crew-board' };
    case 'core': return { type: 'core-console' };
    case 'reboot': return { type: 'core-chamber' };
    default: return null;
  }
}

export function createManagementState(state: GameState, request: StationRequest, returnSelection = state.selection): ManagementState {
  const ui: ManagementState = { ...request, tab: request.tab ?? '', subjectId: request.subjectId ?? null,
    selectedId: request.selectedId ?? '', detailPage: 0, detailsOpen: false, optionId: null, confirmation: null, notice: null,
    depth: state.run.depth.current, runIndex: state.meta.runIndex, returnSelection };
  if (ui.station === 'crew' && !ui.subjectId && !['hire', 'routes'].includes(ui.tab) && state.run.phase5.crew.unlocked) {
    ui.subjectId = state.run.phase5.crew.members[0]?.id ?? null;
    ui.tab = 'assign';
  }
  const view = stationView(state, ui);
  if (!view.tabs.some((tab) => tab.id === ui.tab)) ui.tab = view.tabs[0]?.id ?? '';
  const items = stationView(state, ui).items;
  if (!items.some((item) => item.id === ui.selectedId)) ui.selectedId = items[0]!.id;
  return ui;
}

export function stationView(state: GameState, ui: ManagementState): StationView {
  let view: StationView;
  switch (ui.station) {
    case 'survey': view = surveyView(state, ui); break;
    case 'equipment': view = equipmentView(state, ui); break;
    case 'research': view = researchView(state, ui); break;
    case 'archive': view = archiveView(state, ui); break;
    case 'scanner': view = scannerView(state); break;
    case 'crew': view = crewView(state, ui); break;
    case 'core': view = coreView(state, ui); break;
    case 'reboot': view = rebootView(state); break;
    case 'logistics': view = logisticsView(state, ui); break;
    case 'facilities': view = facilitiesView(state); break;
  }
  return { ...view, items: view.items.length ? view.items : [information('empty', 'Nothing here yet', 'Return later as the expedition progresses.')],
    back: view.back ?? (ui.station === 'facilities' ? undefined : { station: 'facilities', selectedId: ui.station }) };
}
export function selectedStationItem(state: GameState, ui: ManagementState): StationItem {
  const items = stationView(state, ui).items;
  return items.find((item) => item.id === ui.selectedId) ?? items[0]!;
}

function facilitiesView(state: GameState): StationView {
  const names: [Station, string, string][] = [
    ['survey', 'Field notes', 'Inspect veins, discoveries and cargo.'],
    ['equipment', 'Recovered gear', 'Compare and equip recovered tools.'],
    ['research', 'Surface analyzer', 'Continue research and plan the next discovery.'],
    ['crew', 'Shift board', 'Hire, assign floors, set priorities and fit worker equipment.'],
    ['archive', 'Archive terminal', 'Collection, active passives and permanent records.'],
    ['scanner', 'Geological scanner', 'Inspect the three Anomaly responses before choosing one.'],
    ['core', 'Core console', 'Inspect and install permanent Core Protocols.'],
    ['reboot', 'Core chamber', 'Review Core gain, retained discoveries and everything that resets.'],
    ['logistics', 'Deep logistics', 'Find a bottleneck and adjust the route.'],
  ];
  return { title: 'BASE FACILITIES', tabs: [], items: [
    { ...information('workshop', 'Workshop', 'Upgrade basic tools and automation.'), actionLabel: 'OPEN WORKSHOP', action: { type: 'workshop' } },
    ...names.filter(([station]) => stationAvailable(state, station)).map(([station, name, summary]): StationItem => ({
      ...information(station, name, summary),
      actionLabel: `OPEN ${station === 'archive' ? 'COLLECTION' : station.toUpperCase()}`, action: { type: 'navigate', request: { station } },
    })),
  ] };
}
