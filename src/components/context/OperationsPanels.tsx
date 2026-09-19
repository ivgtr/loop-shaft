import {
  AUTO_SWING_MANUAL_SWINGS_REQUIRED,
  D060_EXTENSION_COST,
  D100_EXTENSION_COST,
  UPGRADE_COSTS,
} from '../../game/config';
import type { InitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { canTravelPhase5, unlockedPhase5Depths } from '../../game/phase5';
import {
  canDispatchElevator,
  canExtendD030,
  canExtendD060,
  canExtendD100,
  cargoValue,
  cargoWeight,
  d030ExtensionCost,
} from '../../game/simulation';
import type { CargoRoutingPriority, GameState } from '../../game/types';
import { fmt, formatState } from '../shared/format';
import { ActionButton, CommandButton, ContextLayout } from './common';
import { DeepControls } from './DeepControls';

const CARGO_PRIORITIES: readonly CargoRoutingPriority[] = ['BALANCED', 'CORE', 'RESEARCH', 'ANCIENT'];

export function ElevatorContext({ state, guide }: { state: GameState; guide?: InitialLogisticsGuide | null }) {
  const run = state.run;
  const weight = cargoWeight(run.elevator.cargo);
  const canSend = canDispatchElevator(state);
  const travelDepths = unlockedPhase5Depths(state).filter((depth) => depth !== run.depth.current);

  const status = `Priority transport · ${fmt(weight)}/${fmt(run.elevator.maxLoad)}kg · EST ${cargoValue(run.elevator.cargo)} Scrap · ${formatState(run.elevator.state)}`;

  return <ContextLayout title="Central Elevator" meta={guide ? <>{guide.context} <span className="muted">· {status}</span></> : status}>
    <ActionButton command={{ type: 'send' }} className="primary" disabled={!canSend}>SEND</ActionButton>
    {run.porter.enabled && !run.automation.autoDispatch.unlocked && <ActionButton command={{ type: 'unlock-auto-dispatch' }} className="primary" disabled={run.scrap < UPGRADE_COSTS.autoDispatch}>FIT AUTO RELAY · {UPGRADE_COSTS.autoDispatch}</ActionButton>}
    {run.automation.autoDispatch.unlocked && <ActionButton command={{ type: 'toggle-auto-dispatch' }} className={run.automation.autoDispatch.enabled ? 'toggle-on' : ''}>AUTO DISPATCH {run.automation.autoDispatch.enabled ? 'ON' : 'OFF'}</ActionButton>}
    {run.depth.current === 'D-001' && !run.depth.unlocked.includes('D-030') && <ActionButton command={{ type: 'extend-d030' }} className="depth-action" disabled={!canExtendD030(state)}>EXTEND D-030 · {d030ExtensionCost(state)}</ActionButton>}
    {run.depth.current === 'D-030' && !run.depth.unlocked.includes('D-060') && <ActionButton command={{ type: 'extend-d060' }} className="depth-action" disabled={!canExtendD060(state)}>EXTEND D-060 · {D060_EXTENSION_COST}</ActionButton>}
    {run.depth.current === 'D-060' && !run.depth.unlocked.includes('D-100') && <ActionButton command={{ type: 'extend-d100' }} className="depth-action" disabled={!canExtendD100(state)}>EXTEND D-100 · {D100_EXTENSION_COST}</ActionButton>}
    <DeepControls state={state} />
    {travelDepths.length > 0 && <span className="depth-buttons">{travelDepths.map((depth) => <ActionButton key={depth} command={{ type: 'travel', depth }} className="travel-action" disabled={!canTravelPhase5(state, depth)}>{depth}</ActionButton>)}</span>}
    {run.phase5.cargo.unlocked && <span className="depth-buttons">{CARGO_PRIORITIES.map((priority) => <ActionButton key={priority} command={{ type: 'cargo-priority', priority }} className={run.phase5.cargo.priority === priority ? 'toggle-on' : ''}>{priority}</ActionButton>)}</span>}
  </ContextLayout>;
}

export function WorkbenchContext({ state, objective }: { state: GameState; objective: string }) {
  const run = state.run;
  const items = run.phase5.equipment.inventory.slice(-8);
  return <ContextLayout title="Workshop" meta={objective}>
    {run.tool.level === 1 && <Upgrade command="upgrade-tool" label="STEEL PICK" cost={UPGRADE_COSTS.tool} scrap={run.scrap} />}
    {run.boots.level === 1 && <Upgrade command="upgrade-boots" label="RUNNER BOOTS" cost={UPGRADE_COSTS.boots} scrap={run.scrap} />}
    {!run.automation.autoSwing.unlocked
      ? <ActionButton command={{ type: 'unlock-auto-swing' }} disabled={run.scrap < UPGRADE_COSTS.autoSwing || run.stats.manualSwings < AUTO_SWING_MANUAL_SWINGS_REQUIRED}>AUTO SWING · {UPGRADE_COSTS.autoSwing}</ActionButton>
      : <ActionButton command={{ type: 'toggle-auto-swing' }} className={run.automation.autoSwing.enabled ? 'toggle-on' : ''}>AUTO SWING {run.automation.autoSwing.enabled ? 'ON' : 'OFF'}</ActionButton>}
    {run.pack.level === 1 && <Upgrade command="upgrade-pack" label="FRAME PACK" cost={UPGRADE_COSTS.pack} scrap={run.scrap} />}
    {!run.porter.enabled && !run.phase5.crew.unlocked && <Upgrade command="unlock-porter" label="HIRE PORTER" cost={UPGRADE_COSTS.porter} scrap={run.scrap} />}
    {items.length > 0 && <div className="research-stack">{items.map((item) => <CommandButton key={item.id} command={{ type: 'equip-item', itemId: item.id }} className={`research-line ${run.phase5.equipment.equippedPlayer[item.slot] === item.id ? 'complete' : ''}`}><strong>{item.rarity} · {item.name}</strong><span>{item.slot} · {item.affixes.map((affix) => affix.name).join(' / ')}</span></CommandButton>)}</div>}
  </ContextLayout>;
}

function Upgrade({ command, label, cost, scrap }: { command: 'upgrade-tool' | 'upgrade-boots' | 'upgrade-pack' | 'unlock-porter'; label: string; cost: number; scrap: number }) {
  return <ActionButton command={{ type: command }} className="primary" disabled={scrap < cost}>{label} · {cost}</ActionButton>;
}
