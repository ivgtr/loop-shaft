import { localCargoDropX } from '../game/deepGame';
import { COLLECT_DURATION, LOAD_DURATION, PORTER_COLLECT_DURATION, PORTER_LOAD_DURATION, WORLD } from '../game/config';
import { partitionCargo } from '../game/cargoSelection';
import { crewPickupItems } from '../game/phase5';
import { cargoWeight, playerPickupItems, porterPickupItems, PORTER_LOAD_X } from '../game/simulation';
import type { GameState, LootStack } from '../game/types';
import { visibleCargo } from './discoveryVisuals';
import type { ActorRenderState, SemanticRenderState } from './semanticRenderState';

export interface CargoPoint { readonly x: number; readonly y: number }
export type CargoPositions = ReadonlyMap<string, CargoPoint>;
type Carrier = Pick<ActorRenderState<string>, 'worldAnchor' | 'facing' | 'carried'>;

export function carriedCargoPoint(actor: Carrier, index: number): CargoPoint {
  return { x: actor.worldAnchor.x + actor.facing * (8 + index * 4), y: actor.worldAnchor.y - 7 - index * 5 };
}
export function liftCargoPoint(index: number, y: number): CargoPoint {
  return { x: WORLD.elevatorX - 8 + index % 3 * 9, y: Math.round(y) + 13 - Math.floor(index / 3) * 6 };
}
export function platformCargoPoint(index: number, d001: boolean, dropX = WORLD.elevatorX + 48): CargoPoint {
  return { x: dropX - 3 + index % 4 * 8, y: WORLD.floorY - 8 + (d001 ? 8 : 0) - Math.floor(index / 4) * 5 };
}
function transferPoint(from: CargoPoint, to: CargoPoint, progress: number): CargoPoint {
  const t = Math.max(0, Math.min(1, progress));
  return { x: Math.round(from.x + (to.x - from.x) * t), y: Math.round(from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 2) };
}

/** A per-frame projection only. Items remain in their real owner until the existing simulation timer completes. */
export function deriveCargoMotion(state: GameState, semantic: SemanticRenderState): {
  floor: CargoPositions; player: CargoPositions; porter: CargoPositions; crew: ReadonlyMap<string, CargoPositions>;
} {
  const floor = new Map<string, CargoPoint>();
  const player = new Map<string, CargoPoint>();
  const porter = new Map<string, CargoPoint>();
  const crew = new Map<string, CargoPositions>();
  const result = { floor, player, porter, crew };
  if (state.run.elevator.travel) return result;
  const currentFloor = state.run.floors[state.run.depth.current];
  const d001 = state.run.depth.current === 'D-001';
  const pickups: { actor: Carrier; items: LootStack[]; timer: number; duration: number }[] = [];
  const c = state.run.character;
  if (c.state === 'COLLECTING') pickups.push({ actor: semantic.character, items: playerPickupItems(state), timer: c.collectTimer, duration: COLLECT_DURATION });
  const p = state.run.porter;
  if (semantic.porter && p.state === 'COLLECTING') {
    const target = currentFloor.loot.find((item) => item.id === p.targetLootId);
    if (target) pickups.push({ actor: { ...semantic.porter, facing: PORTER_LOAD_X >= p.x ? 1 : -1 }, items: porterPickupItems(state, target), timer: p.collectTimer, duration: PORTER_COLLECT_DURATION });
  }
  for (const member of state.run.phase5.crew.members) {
    const actor = semantic.crew.get(member.id);
    if (!actor?.visible || member.role !== 'PORTER') continue;
    if (member.state === 'COLLECTING') {
      const target = currentFloor.loot.find((item) => item.id === member.targetLootId);
      if (target) pickups.push({ actor, items: crewPickupItems(member, currentFloor, target), timer: member.collectTimer, duration: PORTER_COLLECT_DURATION });
    }
    if (member.state === 'DEPOSITING') {
      const placements = new Map<string, CargoPoint>();
      const dropX = localCargoDropX(state, member.assignedDepth);
      const destination = visibleCargo([...currentFloor.cargo.filter(item => floorCargoDropX(state, item) === dropX), ...actor.carried], 8);
      visibleCargo(actor.carried, 3).forEach((item, index) => {
        const slot = destination.indexOf(item);
        placements.set(item.id, transferPoint(carriedCargoPoint(actor, index), platformCargoPoint(Math.max(0, slot), d001, dropX), (member.loadingTimer / COLLECT_DURATION - .2) / .8));
      });
      crew.set(member.id, placements);
    }
  }
  // Competing collectors never draw a second copy of one floor item. Nearest completion wins, with simulation order on ties.
  pickups.sort((a, b) => (a.duration - a.timer) - (b.duration - b.timer));
  for (const pickup of pickups) {
    const futureHand = visibleCargo([...pickup.actor.carried, ...pickup.items], 3);
    for (const item of pickup.items) {
      if (floor.has(item.id)) continue;
      const index = futureHand.indexOf(item);
      const destination = index >= 0 ? carriedCargoPoint(pickup.actor, index)
        : { x: pickup.actor.worldAnchor.x, y: pickup.actor.worldAnchor.y - 15 }; // excess pieces disappear into the pack
      floor.set(item.id, transferPoint({ x: item.x, y: d001 ? WORLD.floorY + 13 : item.y + 1 }, destination, (pickup.timer / pickup.duration - .3) / .7));
    }
  }
  const pending: {actor: Carrier; timer: number; duration: number; positions: Map<string, CargoPoint>}[] = [];
  if (c.state === 'LOADING') pending.push({actor: semantic.character, timer: c.loadingTimer, duration: LOAD_DURATION, positions: player});
  if (p.state === 'LOADING' && semantic.porter) pending.push({actor: semantic.porter, timer: p.loadingTimer, duration: PORTER_LOAD_DURATION, positions: porter});
  const futureCargo = [...state.run.elevator.cargo];
  for (const {actor, timer, duration, positions} of pending.sort((a, b) => a.duration - a.timer - (b.duration - b.timer))) {
    const deposited = partitionCargo(actor.carried, state.run.elevator.maxLoad - cargoWeight(futureCargo)).deposited;
    futureCargo.push(...deposited);
    const destination = visibleCargo(futureCargo, 9);
    visibleCargo(actor.carried, 3).forEach((item, index) => {
      if (!deposited.includes(item)) return; // cargo that cannot fit stays in the hands
      positions.set(item.id, transferPoint(carriedCargoPoint(actor, index), liftCargoPoint(Math.max(0, destination.indexOf(item)), semantic.elevator.y), (timer / duration - .2) / .8));
    });
  }
  return result;
}

/** Floor queues retain their physical drop site, including cargo held outside a jammed Rail stop. */
export function floorCargoDropX(state: GameState, item: LootStack): number {
  const local = localCargoDropX(state, state.run.depth.current);
  return Math.abs(item.x - local) <= 16 ? local : WORLD.elevatorX + 48;
}
