import { Fragment } from 'react';
import {
  FREIGHT_INSTALL_COST,
  RAIL_INSTALL_COST,
} from '../../game/config';
import {
  canStartFreightConstruction,
  canStartRailConstruction,
} from '../../game/deepGame';
import type { FreightPriority, GameState, RailPriority } from '../../game/types';
import { ActionButton } from './common';

const RAIL_PRIORITIES: readonly RailPriority[] = ['BULK', 'RESEARCH', 'RARE', 'ANY'];
const FREIGHT_PRIORITIES: readonly FreightPriority[] = ['BULK', 'BALANCED'];

export function DeepControls({ state }: { state: GameState }) {
  const run = state.run;
  const controls = [];

  if (run.depth.unlocked.includes('D-250')) {
    const line = run.logistics.lines.find((candidate) => candidate.depth === 'D-250');
    controls.push(line
      ? <RailPriorities key="rail-priority" lineId={line.id} selected={line.priority} />
      : <ActionButton key="rail-build" command={{ type: 'build-rail' }} className="primary" disabled={!canStartRailConstruction(state)}>RESTORE RAIL · {RAIL_INSTALL_COST}</ActionButton>);
    controls.push(run.logistics.freightCage.state === 'UNBUILT'
      ? <ActionButton key="freight-build" command={{ type: 'build-freight' }} disabled={!canStartFreightConstruction(state)}>BUILD FREIGHT CAGE · {FREIGHT_INSTALL_COST}</ActionButton>
      : <FreightPriorities key="freight-priority" selected={run.logistics.freightCage.priority} prefix="FREIGHT " />);
  }
  return <>{controls}</>;
}

export function RailPriorities({ lineId, selected }: { lineId: string; selected: RailPriority }) {
  return <span className="depth-buttons">{RAIL_PRIORITIES.map((priority) => <ActionButton key={priority} command={{ type: 'rail-priority', lineId, priority }} className={selected === priority ? 'toggle-on' : ''}>{priority}</ActionButton>)}</span>;
}

export function FreightPriorities({ selected, prefix = '' }: { selected: FreightPriority; prefix?: string }) {
  return <span className="depth-buttons">{FREIGHT_PRIORITIES.map((priority) => <Fragment key={priority}><ActionButton command={{ type: 'freight-priority', priority }} className={selected === priority ? 'toggle-on' : ''}>{prefix}{priority}</ActionButton></Fragment>)}</span>;
}
