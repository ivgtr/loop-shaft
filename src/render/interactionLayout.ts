import { WORLD } from '../game/config';
import type { Rect } from './interactionTargets';

export const INTERACTION_LAYOUT = {
  research: { x: 102, y: 52, width: 58, height: 27 },
  coreConsole: { x: 382, y: 52, width: 76, height: 27 },
  crewBoard: { x: 10, y: 52, width: 82, height: 27 },
  sendPanel: { x: 241, y: 178, width: 56, height: 44 },
  scanner: { x: 273, y: WORLD.floorY - 26, width: 18, height: 25 },
  coreChamberControl: { x: 374, y: 151, width: 15, height: 17 },
  workbench: { x: WORLD.workbenchX - 12, y: WORLD.floorY - 22, width: 25, height: 26 },
  liftControl: { x: WORLD.elevatorX + 25, y: WORLD.floorY - 18, width: 8, height: 12 },
} as const satisfies Record<string, Rect>;
