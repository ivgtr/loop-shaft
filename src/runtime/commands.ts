import type {
  AnomalyId,
  CargoRoutingPriority,
  CoreProtocolId,
  DepthId,
  FreightPriority,
  PassiveId,
  MinerPriority,
  PorterPriority,
  RailPriority,
  ResearchId,
} from '../game/types';

export type GameCommand =
  | { type: 'move' }
  | { type: 'walk'; x: number }
  | { type: 'mine'; nodeId?: string }
  | { type: 'interact' }
  | { type: 'return' }
  | { type: 'cancel' }
  | { type: 'send' }
  | { type: 'upgrade-tool' }
  | { type: 'upgrade-boots' }
  | { type: 'unlock-auto-swing' }
  | { type: 'toggle-auto-swing' }
  | { type: 'upgrade-pack' }
  | { type: 'unlock-porter' }
  | { type: 'unlock-auto-dispatch' }
  | { type: 'toggle-auto-dispatch' }
  | { type: 'dispatch-policy'; policy: import('../game/dispatch').DispatchPolicy }
  | { type: 'extend-d030' }
  | { type: 'extend-d060' }
  | { type: 'extend-d100' }
  | { type: 'push-d180' }
  | { type: 'extend-d250' }
  | { type: 'build-rail' }
  | { type: 'build-freight' }
  | { type: 'extend-d400' }
  | { type: 'build-d650' }
  | { type: 'install-bore'; siteId: string }
  | { type: 'rail-priority'; lineId: string; priority: RailPriority }
  | { type: 'freight-priority'; priority: FreightPriority }
  | { type: 'unlock-crew' }
  | { type: 'expand-crew' }
  | { type: 'hire-crew'; role: 'MINER' | 'PORTER' }
  | { type: 'assign-crew'; crewId: string; depth: DepthId }
  | { type: 'miner-priority'; crewId: string; priority: MinerPriority }
  | { type: 'porter-priority'; crewId: string; priority: PorterPriority }
  | { type: 'cargo-priority'; priority: CargoRoutingPriority }
  | { type: 'equip-item'; itemId: string }
  | { type: 'equip-crew-item'; itemId: string; crewId: string }
  | { type: 'travel'; depth: DepthId }
  | { type: 'choose-anomaly'; anomaly: AnomalyId }
  | { type: 'toggle-passive'; passive: PassiveId }
  | { type: 'research'; research: ResearchId }
  | { type: 'protocol'; protocol: CoreProtocolId }
  | { type: 'reboot' };
