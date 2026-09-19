import { CARGO_HUB_X, RAIL_STOP_X, WORLD } from '../game/config';
import { canPlayerAccessNode } from '../game/deepGame';
import { canShowCrewBoard } from '../game/phase5';
import { canDispatchElevator, canMine, cargoWeight, currentFloor } from '../game/simulation';
import type { GameState, Selection } from '../game/types';
import { elevatorY } from './environment';
import { INTERACTION_LAYOUT } from './interactionLayout';

export { INTERACTION_LAYOUT } from './interactionLayout';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type HitShape =
  | { readonly type: 'rect'; readonly rect: Rect }
  | { readonly type: 'circle'; readonly center: Point; readonly radius: number };

export type InteractionTargetRef = NonNullable<Selection>;

export interface InteractionTarget {
  readonly ref: InteractionTargetRef;
  readonly key: string;
  readonly position: Point;
  readonly stableOrder: number;
  readonly hitShapes: readonly HitShape[];
  readonly emphasisRects: readonly Rect[];
  readonly labelAnchor: Point;
  readonly displayName: string;
  readonly shortStatus: string | null;
  readonly selectable: true;
  readonly primaryActionAvailable: boolean;
  readonly hitPriority: number;
  readonly visualLayer: number;
}

export interface CanvasClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const PRIORITY = {
  node: 200,
  machine: 400,
  elevator: 410,
  freight: 440,
  logistics: 450,
  bore: 460,
} as const;

export function clientToWorldPoint(clientX: number, clientY: number, rect: CanvasClientRect): Point | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * WORLD.width,
    y: ((clientY - rect.top) / rect.height) * WORLD.height,
  };
}

export function interactionTargetKey(ref: InteractionTargetRef): string {
  return 'id' in ref ? `${ref.type}:${ref.id}` : ref.type;
}

export function sameInteractionTarget(a: InteractionTargetRef | Selection, b: InteractionTargetRef | Selection): boolean {
  if (!a || !b || a.type !== b.type) return false;
  if ('id' in a) return 'id' in b && a.id === b.id;
  return !('id' in b);
}

export function deriveInteractionTargets(state: GameState): InteractionTarget[] {
  if (state.run.elevator.travel) return [];

  const targets: InteractionTarget[] = [];
  let stableOrder = 0;
  const add = (target: Omit<InteractionTarget, 'key' | 'stableOrder' | 'selectable'>): void => {
    targets.push({ ...target, key: interactionTargetKey(target.ref), stableOrder: stableOrder++, selectable: true });
  };

  if (canShowCrewBoard(state)) add(rectTarget({
    ref: { type: 'crew-board' },
    rect: INTERACTION_LAYOUT.crewBoard,
    displayName: state.run.phase5.crew.unlocked ? 'Shift Board' : 'Crew Board',
    priority: PRIORITY.machine,
    visualLayer: 20,
  }));

  if (state.run.depth.unlocked.includes('D-060')) add(rectTarget({
    ref: { type: 'research' }, rect: INTERACTION_LAYOUT.research, displayName: 'Surface Analyzer',
    priority: PRIORITY.machine, visualLayer: 10,
  }));
  if (state.run.depth.unlocked.includes('D-030')) add(rectTarget({
    ref: { type: 'archive' }, rect: INTERACTION_LAYOUT.archive, displayName: 'Archive Terminal',
    priority: PRIORITY.machine, visualLayer: 10,
  }));
  if (state.meta.runIndex > 1 || state.meta.core > 0 || state.meta.protocols.length > 0) add(rectTarget({
    ref: { type: 'core-console' }, rect: INTERACTION_LAYOUT.coreConsole, displayName: 'Core Console',
    priority: PRIORITY.machine, visualLayer: 10,
  }));

  const depth = state.run.depth.current;
  if (depth === 'D-030') add(rectTarget({
    ref: { type: 'scanner' }, rect: INTERACTION_LAYOUT.scanner, displayName: 'Geological Scanner',
    hitRect: { x: 270, y: 180, width: 24, height: 32 },
    priority: PRIORITY.machine, visualLayer: 10,
  }));
  if (depth === 'D-100') add(rectTarget({
    ref: { type: 'core-chamber' }, rect: INTERACTION_LAYOUT.coreChamberControl, displayName: 'Core Chamber',
    priority: PRIORITY.machine, visualLayer: 10,
    available: state.run.coreChamber.rebootAvailable,
    status: state.run.coreChamber.rebootAvailable ? null : 'NO CORE',
  }));

  // Before the D-030 anomaly choice, selectNode intentionally redirects to the
  // scanner. Keeping nodes out of the target set prevents hover/selection drift.
  if (depth !== 'D-030' || state.run.anomaly.selected) {
    for (const node of currentFloor(state).nodes) {
      const remote = !canPlayerAccessNode(node);
      const depleted = node.hp <= 0;
      const atTarget = state.run.character.targetNodeId === node.id;
      const canMove = !remote && !depleted
        && state.run.character.carried.length === 0
        && ['IDLE', 'MINING', 'MOVING_TO_NODE'].includes(state.run.character.state);
      const available = atTarget ? canMine(state) : canMove;
      const status = remote ? 'NO WALKWAY' : depleted ? 'DEPLETED' : available ? null : 'BUSY';
      const center = { x: node.x, y: node.y - 9 };
      const tall = node.id === 'core-shell' || node.id === 'sealed-chamber';
      const width = tall ? 46 : 38;
      const height = tall ? 38 : 32;
      add({
        ref: { type: 'node', id: node.id },
        position: center,
        hitShapes: [{ type: 'circle', center, radius: tall ? 25 : 22 }],
        emphasisRects: [{ x: node.x - width / 2, y: node.y - height + 3, width, height }],
        labelAnchor: { x: node.x, y: node.y - height },
        displayName: node.name,
        shortStatus: status,
        primaryActionAvailable: available,
        hitPriority: PRIORITY.node,
        visualLayer: 10,
      });
    }
  }

  add(rectTarget({
    ref: { type: 'workbench' }, rect: INTERACTION_LAYOUT.workbench, displayName: 'Workshop',
    priority: PRIORITY.machine, visualLayer: 10,
  }));

  addElevatorTarget(add, state);

  const line = state.run.logistics.lines.find((candidate) => candidate.depth === depth);
  if (line) {
    const available = line.state === 'READY';
    add(rectTarget({
      ref: { type: 'rail-stop', id: line.id },
      rect: { x: RAIL_STOP_X - 15, y: WORLD.floorY - 28, width: 30, height: 24 },
      hitRect: { x: RAIL_STOP_X - 18, y: WORLD.floorY - 40, width: 36, height: 44 },
      displayName: 'Rail Stop', priority: PRIORITY.logistics, visualLayer: 30,
      available, status: available ? null : line.state === 'JAMMED' ? 'JAMMED' : 'BUSY',
    }));
  }

  const hub = state.run.logistics.cargoHubs.find((candidate) => candidate.depth === depth);
  if (hub) {
    const full = cargoWeight(hub.buffer) >= hub.maxWeight;
    add(rectTarget({
      ref: { type: 'cargo-hub', id: hub.id },
      rect: { x: CARGO_HUB_X - 18, y: WORLD.floorY - 32, width: 36, height: 28 },
      hitRect: { x: CARGO_HUB_X - 20, y: WORLD.floorY - 42, width: 40, height: 47 },
      displayName: 'Cargo Hub', priority: PRIORITY.logistics, visualLayer: 30,
      available: !full, status: full ? 'FULL' : null,
    }));
  }

  const freight = state.run.logistics.freightCage;
  if (freight.state !== 'UNBUILT') {
    const cageX = WORLD.elevatorX + 26;
    const bottom = WORLD.floorY - 4;
    const cageY = Math.round(bottom + (72 - bottom) * freight.position);
    const available = freight.state === 'IDLE';
    const status = available ? null
      : freight.state === 'JAMMED' ? 'JAMMED'
        : freight.state === 'ASCENDING' || freight.state === 'DESCENDING' ? freight.state : 'BUSY';
    add({
      ref: { type: 'freight-control' },
      position: { x: cageX, y: cageY - 9 },
      hitShapes: [
        { type: 'rect', rect: { x: WORLD.elevatorX + 14, y: 69, width: 25, height: WORLD.floorY - 65 } },
        { type: 'rect', rect: { x: cageX - 13, y: cageY - 23, width: 27, height: 27 } },
      ],
      emphasisRects: [
        { x: cageX - 12, y: cageY - 22, width: 24, height: 24 },
        { x: cageX - 13, y: 69, width: 26, height: WORLD.floorY - 73 },
      ],
      labelAnchor: { x: cageX, y: cageY - 24 },
      displayName: 'Freight Cage', shortStatus: status,
      primaryActionAvailable: available, hitPriority: PRIORITY.freight, visualLayer: 30,
    });
  }

  for (const bore of state.run.deepAutomation.bores) {
    if (bore.depth !== depth) continue;
    const node = state.run.floors[depth].nodes.find((candidate) => candidate.id === bore.siteId);
    if (!node) continue;
    const available = bore.state === 'IDLE' || bore.state === 'DRILLING';
    const status = available ? null
      : bore.state === 'JAMMED' ? 'JAMMED'
        : bore.state === 'BLOCKED' ? 'BLOCKED' : 'BUSY';
    add(rectTarget({
      ref: { type: 'bore-console', id: bore.id },
      rect: { x: node.x - 15, y: WORLD.floorY - 42, width: 30, height: 43 },
      hitRect: { x: node.x - 21, y: WORLD.floorY - 43, width: 42, height: 47 },
      displayName: 'Remote Bore Console', priority: PRIORITY.bore, visualLayer: 40,
      available, status,
    }));
  }

  return targets;
}

export function resolveInteractionTarget(point: Point, targets: readonly InteractionTarget[]): InteractionTarget | null {
  const candidates = targets.filter((target) => target.hitShapes.some((shape) => containsPoint(shape, point)));
  candidates.sort((a, b) => {
    if (a.hitPriority !== b.hitPriority) return b.hitPriority - a.hitPriority;
    if (a.visualLayer !== b.visualLayer) return b.visualLayer - a.visualLayer;
    if (a.ref.type === 'node' && b.ref.type === 'node') {
      const distance = squaredDistance(point, a.position) - squaredDistance(point, b.position);
      if (distance !== 0) return distance;
    }
    return a.stableOrder - b.stableOrder;
  });
  return candidates[0] ?? null;
}

function addElevatorTarget(
  add: (target: Omit<InteractionTarget, 'key' | 'stableOrder' | 'selectable'>) => void,
  state: GameState,
): void {
  const y = elevatorY(state);
  const half = state.run.anomaly.selected === 'EMPTY_SHAFT' ? 15 : 20;
  const cageRect = { x: WORLD.elevatorX - half - 3, y: y - 20, width: half * 2 + 7, height: 42 };
  const controlHit = inflate(INTERACTION_LAYOUT.liftControl, 3);
  const elevator = state.run.elevator;
  const canSend = canDispatchElevator(state);
  const status = canSend ? null
    : elevator.state === 'ASCENDING' || elevator.state === 'DESCENDING' ? elevator.state
      : elevator.state === 'LOADING' || elevator.state === 'UNLOADING' ? 'BUSY' : 'EMPTY';
  add({
    ref: { type: 'elevator' },
    position: { x: WORLD.elevatorX, y },
    hitShapes: [
      { type: 'rect', rect: controlHit },
      { type: 'rect', rect: { x: WORLD.elevatorX - 25, y: y - 17, width: 50, height: 36 } },
    ],
    emphasisRects: [cageRect, inflate(INTERACTION_LAYOUT.liftControl, 2)],
    labelAnchor: { x: WORLD.elevatorX, y: y - 22 },
    displayName: 'Central Elevator', shortStatus: status,
    primaryActionAvailable: canSend, hitPriority: PRIORITY.elevator, visualLayer: 15,
  });
}

function rectTarget(options: {
  readonly ref: InteractionTargetRef;
  readonly rect: Rect;
  readonly hitRect?: Rect;
  readonly displayName: string;
  readonly priority: number;
  readonly visualLayer: number;
  readonly available?: boolean;
  readonly status?: string | null;
}): Omit<InteractionTarget, 'key' | 'stableOrder' | 'selectable'> {
  const hitRect = options.hitRect ?? inflate(options.rect, 3);
  return {
    ref: options.ref,
    position: rectCenter(options.rect),
    hitShapes: [{ type: 'rect', rect: hitRect }],
    emphasisRects: [inflate(options.rect, 2)],
    labelAnchor: { x: options.rect.x + options.rect.width / 2, y: options.rect.y - 3 },
    displayName: options.displayName,
    shortStatus: options.status ?? null,
    primaryActionAvailable: options.available ?? true,
    hitPriority: options.priority,
    visualLayer: options.visualLayer,
  };
}

function containsPoint(shape: HitShape, point: Point): boolean {
  if (shape.type === 'circle') return squaredDistance(point, shape.center) <= shape.radius * shape.radius;
  const { rect } = shape;
  return point.x >= rect.x && point.x <= rect.x + rect.width
    && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function squaredDistance(a: Point, b: Point): number {
  return (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
}

function inflate(rect: Rect, amount: number): Rect {
  return {
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  };
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
