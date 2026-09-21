import { D060_EXTENSION_COST, D100_EXTENSION_COST, UPGRADE_COSTS } from '../../game/config';
import type { InitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { canTravelPhase5, unlockedPhase5Depths } from '../../game/phase5';
import { upgradeBlockReason, type UpgradeAction } from '../../game/playerControls';
import {
  canExtendD030,
  canExtendD060,
  canExtendD100,
  cargoValue,
  cargoWeight,
  d030ExtensionCost,
} from '../../game/simulation';
import type { CargoRoutingPriority, GameState } from '../../game/types';
import { fmt, formatState } from '../shared/format';
import { ActionButton, ContextLayout } from './common';
import { DeepControls } from './DeepControls';

const CARGO_PRIORITIES: readonly CargoRoutingPriority[] = ['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'];

export function ElevatorContext({ state, guide }: { state: GameState; guide?: InitialLogisticsGuide | null }) {
  const run = state.run;
  const weight = cargoWeight(run.elevator.cargo);
  const travelDepths = unlockedPhase5Depths(state).filter((depth) => depth !== run.depth.current);
  const status = `Priority transport · ${fmt(weight)}/${fmt(run.elevator.maxLoad)}kg · EST ${cargoValue(run.elevator.cargo)} Scrap · ${formatState(run.elevator.state)} · F / SEND beside the shaft dispatches loaded cargo.`;

  return <ContextLayout title="Central Elevator" meta={guide ? <>{guide.context} <span className="muted">· {status}</span></> : status}>
    {run.porter.enabled && !run.automation.autoDispatch.unlocked && <Upgrade state={state} command="unlock-auto-dispatch" label="FIT AUTO RELAY" cost={UPGRADE_COSTS.autoDispatch} />}
    {run.automation.autoDispatch.unlocked && <ActionButton command={{ type: 'toggle-auto-dispatch' }} className={run.automation.autoDispatch.enabled ? 'toggle-on' : ''}>AUTO DISPATCH {run.automation.autoDispatch.enabled ? 'ON' : 'OFF'}</ActionButton>}
    {run.depth.current === 'D-001' && !run.depth.unlocked.includes('D-030') && <ActionButton command={{ type: 'extend-d030' }} className="depth-action" disabled={!canExtendD030(state)}>EXTEND D-030 · {d030ExtensionCost(state)}</ActionButton>}
    {run.depth.current === 'D-030' && !run.depth.unlocked.includes('D-060') && <ActionButton command={{ type: 'extend-d060' }} className="depth-action" disabled={!canExtendD060(state)}>EXTEND D-060 · {D060_EXTENSION_COST}</ActionButton>}
    {run.depth.current === 'D-060' && !run.depth.unlocked.includes('D-100') && <ActionButton command={{ type: 'extend-d100' }} className="depth-action" disabled={!canExtendD100(state)}>EXTEND D-100 · {D100_EXTENSION_COST}</ActionButton>}
    <DeepControls state={state} />
    {travelDepths.length > 0 && <span className="depth-buttons">{travelDepths.map((depth) => <ActionButton key={depth} command={{ type: 'travel', depth }} className="travel-action" disabled={!canTravelPhase5(state, depth)}>{depth}</ActionButton>)}</span>}
    {run.phase5.cargo.unlocked && <span className="depth-buttons">{CARGO_PRIORITIES.map((priority) => <ActionButton key={priority} command={{ type: 'cargo-priority', priority }} className={run.phase5.cargo.priority === priority ? 'toggle-on' : ''}>{priority}</ActionButton>)}</span>}
  </ContextLayout>;
}


function Upgrade({ command, label, cost, state }: { command: UpgradeAction; label: string; cost: number; state: GameState }) {
  const reason = upgradeBlockReason(state, command);
  return <span className="upgrade-option">
    <ActionButton command={{ type: command }} className="primary" disabled={reason !== null} title={reason ?? label}>{label} · {cost}</ActionButton>
    {reason && <small>{reason}</small>}
  </span>;
}
