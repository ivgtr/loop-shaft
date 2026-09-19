import { useGameState } from '../../app/GameProvider';
import { D180_EXTENSION_COST } from '../../game/config';
import { deriveInitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { canPushD180 } from '../../game/phase5';
import { currentFloor } from '../../game/simulation';
import type { GameState } from '../../game/types';
import { ContextLayout, ActionButton } from './common';
import { CrewContext } from './CrewPanel';
import { DeepControls } from './DeepControls';
import { ElevatorContext, WorkbenchContext } from './OperationsPanels';
import { ArchiveContext, CoreConsoleContext, ResearchContext, ScannerContext } from './ProgressionPanels';
import { BoreContext, CargoHubContext, FreightContext, NodeContext, RailContext } from './WorldPanels';

export function ContextPanel() {
  const state = useGameState();
  const run = state.run;
  const initialGuide = deriveInitialLogisticsGuide(state);
  if (run.elevator.travel) {
    const travel = run.elevator.travel;
    return <ContextLayout title="Central Elevator" meta={`${travel.from} → ${travel.to} · ${travel.remaining.toFixed(1)}s`} />;
  }

  const selection = state.selection;
  if (selection?.type === 'node') {
    const node = currentFloor(state).nodes.find((candidate) => candidate.id === selection.id);
    if (node) return <NodeContext state={state} node={node} guide={initialGuide} />;
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
  if (selection?.type === 'elevator') return <ElevatorContext state={state} guide={guideForElevator(initialGuide)} />;
  if (selection?.type === 'workbench') return <WorkbenchContext state={state} objective={nextObjective(state)} />;
  if (selection?.type === 'scanner') return <ScannerContext state={state} />;
  if (selection?.type === 'archive') return <ArchiveContext state={state} />;
  if (selection?.type === 'research') return <ResearchContext state={state} />;
  if (selection?.type === 'core-console') return <CoreConsoleContext state={state} />;
  if (selection?.type === 'core-chamber') return <CoreChamberContext state={state} />;
  if (selection?.type === 'crew-board') return <CrewContext state={state} />;
  return <ContextLayout
    title={`${run.depth.current} · ${biomeName(run.depth.current)}`}
    meta={initialGuide?.context ?? nextObjective(state)}
  >
    {!initialGuide && <DeepControls state={state} />}
  </ContextLayout>;
}

function guideForElevator(guide: ReturnType<typeof deriveInitialLogisticsGuide>) {
  return guide?.target.kind === 'interaction' && guide.target.ref.type === 'elevator' ? guide : null;
}

function CoreChamberContext({ state }: { state: GameState }) {
  const run = state.run;
  return <ContextLayout title="Core Chamber" meta={run.pendingCore ? `CORE CHARGE ${run.pendingCore} · Reboot remains a choice while pushing deeper.` : 'Core cargo must be appraised before Reboot.'}>
    {run.coreChamber.rebootAvailable && <ActionButton command={{ type: 'reboot' }} className="reboot-action">{run.coreChamber.rebootArmed ? `CONFIRM REBOOT · CORE +${run.pendingCore}` : `ARM REBOOT · CORE +${run.pendingCore}`}</ActionButton>}
    {run.coreChamber.rebootAvailable && !run.depth.unlocked.includes('D-180') && <ActionButton command={{ type: 'push-d180' }} className="primary" disabled={!canPushD180(state)}>PUSH D-180 · {D180_EXTENSION_COST}</ActionButton>}
    <DeepControls state={state} />
  </ContextLayout>;
}

function nextObjective(state: GameState): string {
  const run = state.run;
  if (run.depth.current === 'D-650') return 'D-650 · ??? · The shaft reaches an unreadable structure. This is the current endpoint.';
  if (run.depth.current === 'D-400') {
    if (!run.deepAutomation.bores.length) return 'Null Strata breaks ordinary walking. Inspect Remote-only sites and install a Bore.';
    if (run.deepProgress.deepComponentsDelivered < 3) return 'Keep Bore output connected through a Line and Freight route until Deep Components reach Surface.';
    return 'Analyze the delivered Deep Components and complete Deep Shaft Geometry.';
  }
  if (run.depth.current === 'D-250') {
    if (!run.logistics.lines.length) return 'The Lost makes Porter walking the bottleneck. Recover Rail Parts, research Rail Logistics, then restore the line.';
    if (run.logistics.freightCage.state === 'UNBUILT') return 'Rail moves horizontal cargo faster. Its Hub now exposes the vertical bottleneck: build Freight Cage.';
    return 'Route bulk through Rail → Freight while preserving Central Elevator for rare / research cargo.';
  }
  if (run.depth.unlocked.includes('D-180') && !run.depth.unlocked.includes('D-250')) return run.deepProgress.lostSampleDelivered ? 'Complete Lost Survey and reinforce the shaft for D-250.' : 'In Run 3, recover the Lost Signal Sample at D-180 and physically return it to Surface.';
  if (run.depth.current === 'D-180') return 'Ancient Ruins: split Crew and Central Elevator capacity, then decide whether to Reboot or push deeper.';
  if (!run.depth.unlocked.includes('D-100')) return 'Build the early mine, collect Data, complete Core Resonance, and extend D-100.';
  if (run.pendingCore === 0) return 'Break the D-100 Core Shell and return its fragments to Surface.';
  if (state.meta.runIndex === 1) return 'Reboot converts this Run into permanent Core and unlocks the next automation layer.';
  return 'Use the Shift Board to distribute Miner / Porter work across Floors while one Central Elevator remains shared.';
}

function biomeName(depth: GameState['run']['depth']['current']): string {
  if (depth === 'D-250') return 'THE LOST';
  if (depth === 'D-400') return 'NULL STRATA';
  if (depth === 'D-650') return '???';
  if (depth === 'D-180') return 'ANCIENT RUINS';
  return 'SHAFT';
}
