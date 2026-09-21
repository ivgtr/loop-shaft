import { BORE_INSTALL_COST, FREIGHT_INSTALL_COST } from '../../game/config';
import type { InitialLogisticsGuide } from '../../game/initialLogisticsGuide';
import { canInstallBore, canPlayerAccessNode, canStartFreightConstruction } from '../../game/deepGame';
import { playerHasEquipmentAffix } from '../../game/phase5';
import { canMoveToNode } from '../../game/playerControls';
import { cargoWeight, effectiveTreasureChance, mineBlockReason } from '../../game/simulation';
import type { CargoHub, FreightCage, GameState, MiningNode, RemoteBore, TransportLine } from '../../game/types';
import { fmt, formatState, signal } from '../shared/format';
import { ActionButton, ContextLayout } from './common';
import { FreightPriorities, RailPriorities } from './DeepControls';

export function NodeContext({ state, node, guide }: { state: GameState; node: MiningNode; guide?: InitialLogisticsGuide | null }) {
  const remote = !canPlayerAccessNode(node);
  const broken = node.hp <= 0;
  const bore = state.run.deepAutomation.bores.find((candidate) => candidate.siteId === node.id);
  const reason = mineBlockReason(state, node.id);
  const meta = `${broken ? `DEPLETED · respawn ${Math.ceil(node.respawnTimer)}s` : `HP ${node.hp}/${node.maxHp}`} · ${node.distanceMeters}m${nodeReadout(state, node)}${reason ? ` · ${reason}` : ' · READY TO MINE'}`;

  return <ContextLayout title={node.name} meta={guide ? <>{guide.context} <span className="muted">· {meta}</span></> : meta}>
    <ActionButton command={{ type: 'move' }} disabled={!canMoveToNode(state, node)} title={reason ?? 'Walk to this vein'}>MOVE</ActionButton>
    {remote && !bore && <ActionButton command={{ type: 'install-bore', siteId: node.id }} className="primary" disabled={!canInstallBore(state, node.id)}>INSTALL REMOTE BORE · {BORE_INSTALL_COST}</ActionButton>}
    {bore && <span className="inline-status">BORE {formatState(bore.state)} · cycle {Math.round((bore.cycleProgress / Math.max(0.001, bore.cycleDuration)) * 100)}%</span>}
  </ContextLayout>;
}

export function RailContext({ state, line }: { state: GameState; line: TransportLine }) {
  const cart = state.run.logistics.railCarts.find((candidate) => candidate.lineId === line.id);
  return <ContextLayout title="Rail Stop / Line Control" meta={`${formatState(line.state)} · stop ${fmt(cargoWeight(line.inputBuffer))}/${fmt(line.maxInputWeight)}kg · cart ${cart ? formatState(cart.state) : 'MISSING'} ${cart ? fmt(cargoWeight(cart.cargo)) : 0}kg${line.jamReason ? ` · JAM ${line.jamReason}` : ''}`}>
    <RailPriorities lineId={line.id} selected={line.priority} />
  </ContextLayout>;
}

export function CargoHubContext({ state, hub }: { state: GameState; hub: CargoHub }) {
  const freight = state.run.logistics.freightCage;
  return <ContextLayout title="Cargo Hub" meta={`${hub.depth} · ${fmt(cargoWeight(hub.buffer))}/${fmt(hub.maxWeight)}kg · bulk waits for Freight; rare/research can return to Central Elevator.`}>
    {freight.state === 'UNBUILT'
      ? <ActionButton command={{ type: 'build-freight' }} className="primary" disabled={!canStartFreightConstruction(state)}>BUILD FREIGHT CAGE · {FREIGHT_INSTALL_COST}</ActionButton>
      : <FreightPriorities selected={freight.priority} />}
  </ContextLayout>;
}

export function FreightContext({ cage }: { cage: FreightCage }) {
  return <ContextLayout title="Freight Cage" meta={`${formatState(cage.state)} · cargo-only · ${fmt(cargoWeight(cage.cargo))}/${fmt(cage.maxLoad)}kg${cage.targetDepth ? ` · target ${cage.targetDepth}` : ''}. Central Elevator remains the priority/personnel route.`}>
    <FreightPriorities selected={cage.priority} />
  </ContextLayout>;
}

export function BoreContext({ state, bore }: { state: GameState; bore: RemoteBore }) {
  const line = bore.connectedLineId ? state.run.logistics.lines.find((candidate) => candidate.id === bore.connectedLineId) : undefined;
  return <ContextLayout title="Remote Bore Console" meta={`${bore.siteId} · ${formatState(bore.state)} · target ${bore.targetNodeId ?? 'NONE'} · cycle ${Math.round((bore.cycleProgress / Math.max(0.001, bore.cycleDuration)) * 100)}% · output ${fmt(cargoWeight(bore.outputBuffer))}/${fmt(bore.maxOutputWeight)}kg · line ${line ? formatState(line.state) : 'DISCONNECTED'}`} />;
}

function nodeReadout(state: GameState, node: MiningNode): string {
  const depth = state.run.depth.current;
  if (node.id === 'core-shell') return ' · Core cargo must reach Surface';
  if (depth === 'D-180') return ` · ANCIENT · ${node.id === 'ruined-workshop' ? 'Equipment / Scrap' : node.id === 'archive-vault' ? 'Relic / Data' : 'Rare / Core'}`;
  if (depth === 'D-250') return ` · THE LOST · ${node.id === 'lost-depot' ? 'Alloy / Rail Parts' : node.id === 'hanging-vein' ? 'Valuable / Equipment · long route' : 'Research / Relic · high logistics load'}`;
  if (depth === 'D-400') return ` · NULL STRATA · ${node.id === 'null-edge' ? 'Player / Miner access' : node.id === 'echo-pocket' ? 'Remote Bore / Research' : 'Deep Component / Core'}`;
  if (playerHasEquipmentAffix(state, 'SURVEY_LAMP')) return ` · Research ${signal(node.researchWeight)} · Rare ${signal(effectiveTreasureChance(state, node))}`;
  return '';
}
