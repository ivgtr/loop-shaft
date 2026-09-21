import { useGameRuntime, useGameState } from '../../app/GameProvider';
import { deriveInitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { currentFloor } from '../../game/simulation';
import type { GameState } from '../../game/types';
import { ContextLayout, ActionButton } from './common';
import { CrewContext } from './CrewPanel';
import { DeepControls } from './DeepControls';
import { ArchiveContext, CoreConsoleContext, ResearchContext, ScannerContext } from './ProgressionPanels';
import { BoreContext, CargoHubContext, FreightContext, NodeContext, RailContext } from './WorldPanels';

export function ContextPanel() {
  const state = useGameState();
  const run = state.run;
  const initialGuide = deriveInitialLogisticsGuide(state);
  if (run.elevator.travel) return null;

  const selection = state.selection;
  if (selection?.type === 'node') {
    const node = currentFloor(state).nodes.find((candidate) => candidate.id === selection.id);
    if (node?.access === 'REMOTE_ONLY') return <NodeContext state={state} node={node} guide={initialGuide} />;
  }
  if (selection?.type === 'rail-stop') {
    const line = run.logistics.lines.find((candidate) => candidate.id === selection.id);
    if (line) return <RailContext state={state} line={line} />;
  }
  if (selection?.type === 'cargo-hub') {
    const hub = run.logistics.cargoHubs.find((candidate) => candidate.id === selection.id);
    if (hub) return <CargoHubContext state={state} hub={hub} />;
  }
  if (selection?.type === 'freight-control') return <FreightContext cage={run.logistics.freightCage} />;
  if (selection?.type === 'bore-console') {
    const bore = run.deepAutomation.bores.find((candidate) => candidate.id === selection.id);
    if (bore) return <BoreContext state={state} bore={bore} />;
  }
  if (selection?.type === 'elevator') return null;
  if (selection?.type === 'scanner') return <ScannerContext state={state} />;
  if (selection?.type === 'archive') return <ArchiveContext state={state} />;
  if (selection?.type === 'research') return <ResearchContext state={state} />;
  if (selection?.type === 'core-console') return <CoreConsoleContext state={state} />;
  if (selection?.type === 'core-chamber') return <CoreChamberContext state={state} />;
  if (selection?.type === 'crew-board') return <CrewContext state={state} />;
  // No ordinary controls or default metadata outside the game. Deep logistics
  // remain here until their third-stage equipment windows are migrated.
  return run.depth.unlocked.includes('D-250') && !selection
    ? <ContextLayout title="Deep logistics" meta="Rail and Freight equipment controls"><DeepControls state={state} /></ContextLayout> : null;
}

function CoreChamberContext({ state }: { state: GameState }) {
  const runtime = useGameRuntime();
  const run = state.run;
  return <ContextLayout title="Core Chamber" meta={run.pendingCore ? `CORE CHARGE ${run.pendingCore} · Reboot remains a choice while pushing deeper.` : 'Core cargo must be appraised before Reboot.'}>
    {run.coreChamber.rebootAvailable && <ActionButton command={{ type: 'reboot' }} className="reboot-action">{run.coreChamber.rebootArmed ? `CONFIRM REBOOT · CORE +${run.pendingCore}` : `ARM REBOOT · CORE +${run.pendingCore}`}</ActionButton>}
    {run.coreChamber.rebootAvailable && <button className="action" onClick={() => runtime.openElevator('extend')}>SHAFT CONNECTIONS</button>}
    <DeepControls state={state} />
  </ContextLayout>;
}
