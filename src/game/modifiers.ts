import {
  BASE_ELEVATOR_CAPACITY,
  BASE_ELEVATOR_SPEED,
  PLAYER_MOVE_SPEED,
  PORTER_MOVE_SPEED,
} from './config';
import type { EquipmentItem, GameState, LootCategory } from './types';

export interface EffectiveModifiers {
  playerMoveSpeed: number;
  porterMoveSpeed: number;
  elevatorCapacity: number;
  elevatorSpeed: number;
  miningDamageMultiplier: number;
  commonYieldMultiplier: number;
  treasureChanceMultiplier: number;
  valuableWeightMultiplier: number;
  fossilWeightMultiplier: number;
  relicWeightMultiplier: number;
  anomalyWeightMultiplier: number;
  researchWeightMultiplier: number;
  respawnSpeedMultiplier: number;
}

export function getModifiers(state: GameState, carrying = state.run.character.carried.length > 0): EffectiveModifiers {
  const run = state.run;
  let playerMoveSpeed = PLAYER_MOVE_SPEED[run.boots.level];
  let porterMoveSpeed = PORTER_MOVE_SPEED;
  let elevatorCapacity = BASE_ELEVATOR_CAPACITY;
  let elevatorSpeed = BASE_ELEVATOR_SPEED;
  let miningDamageMultiplier = 1;
  let commonYieldMultiplier = 1;
  let treasureChanceMultiplier = 1;
  let valuableWeightMultiplier = 1;
  let fossilWeightMultiplier = 1;
  let relicWeightMultiplier = 1;
  let anomalyWeightMultiplier = 1;
  let researchWeightMultiplier = 1;
  let respawnSpeedMultiplier = 1;

  if (state.meta.passives.active.includes('LONG_STRIDE') && !carrying) playerMoveSpeed *= 1.65;
  if (state.meta.passives.active.includes('FOSSIL_HUNTER')) fossilWeightMultiplier *= 2.35;
  if (run.elevator.rhythmBoostTrips > 0) elevatorSpeed *= 1.65;

  switch (run.anomaly.selected) {
    case 'GOLD_RUSH':
      commonYieldMultiplier *= 0.85;
      valuableWeightMultiplier *= 3.2;
      treasureChanceMultiplier *= 1.25;
      break;
    case 'HEAVY_WORLD':
      playerMoveSpeed *= 0.8;
      porterMoveSpeed *= 0.8;
      break;
    case 'EMPTY_SHAFT':
      elevatorCapacity *= 0.65;
      elevatorSpeed *= 1.9;
      break;
    case 'FOSSIL_AGE':
      fossilWeightMultiplier *= 3.1;
      break;
    case 'LIVING_ROCK':
      respawnSpeedMultiplier *= 2.2;
      commonYieldMultiplier *= 1.2;
      break;
    case 'FRAGILE_REALITY':
      miningDamageMultiplier *= 1.6;
      commonYieldMultiplier *= 0.75;
      anomalyWeightMultiplier *= 2.5;
      researchWeightMultiplier *= 1.15;
      treasureChanceMultiplier *= 1.1;
      break;
    case null:
      break;
  }

  for (const equipment of equippedPlayerItems(state)) {
    for (const affix of equipment.affixes) {
      switch (affix.id) {
        case 'POWERED_EDGE':
          miningDamageMultiplier *= 1 + affix.value;
          break;
        case 'RESEARCH_PRISM':
          researchWeightMultiplier *= 1 + affix.value;
          break;
        case 'LIGHT_FRAME':
          if (carrying) playerMoveSpeed *= 1 + affix.value;
          break;
        case 'SURVEY_LAMP':
          treasureChanceMultiplier *= 1 + affix.value * 0.25;
          break;
        default:
          break;
      }
    }
  }

  return {
    playerMoveSpeed,
    porterMoveSpeed,
    elevatorCapacity,
    elevatorSpeed,
    miningDamageMultiplier,
    commonYieldMultiplier,
    treasureChanceMultiplier,
    valuableWeightMultiplier,
    fossilWeightMultiplier,
    relicWeightMultiplier,
    anomalyWeightMultiplier,
    researchWeightMultiplier,
    respawnSpeedMultiplier,
  };
}

function equippedPlayerItems(state: GameState): EquipmentItem[] {
  const equipment = state.run.phase5.equipment;
  return Object.values(equipment.equippedPlayer).flatMap((id) => {
    const item = equipment.inventory.find((candidate) => candidate.id === id);
    return item ? [item] : [];
  });
}

export function appraisalMultiplier(state: GameState, category: LootCategory): number {
  let value = state.run.anomaly.selected === 'HEAVY_WORLD' ? 1.35 : 1;
  if (state.run.anomaly.selected === 'FOSSIL_AGE' && category === 'ORE') value *= 0.62;
  if (state.meta.passives.active.includes('FOSSIL_HUNTER') && category === 'ORE') value *= 0.78;
  return value;
}
