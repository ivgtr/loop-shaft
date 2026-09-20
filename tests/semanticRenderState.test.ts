import { describe, expect, it } from 'vitest';
import { COLLECT_DURATION, LOAD_DURATION, LOOT, PORTER_COLLECT_DURATION, PORTER_LOAD_DURATION, SWING } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { unlockCrewOperations } from '../src/game/phase5';
import type { LootKind, LootStack } from '../src/game/types';
import {
  cargoVisualClass,
  characterClip,
  crewClip,
  d001ElevatorVisualY,
  d001RopeEndY,
  deriveSemanticRenderState,
  engineerClip,
  nodeVisualState,
  playerIdleFrame,
  PLAYER_WALK_STRIDE_STEP,
  playerWalkFrame,
  porterClip,
} from '../src/render/semanticRenderState';

describe('semantic render state', () => {
  it('maps every CharacterState to the fixed Stage 3 clip', () => {
    expect(characterClip('IDLE', false)).toBe('idle');
    expect(characterClip('MOVING_TO_NODE', false)).toBe('walk');
    expect(characterClip('MINING', false)).toBe('mine-ready');
    expect(characterClip('MINING', true)).toBe('mine-swing');
    expect(characterClip('COLLECTING', false)).toBe('collect');
    expect(characterClip('RETURNING', false)).toBe('carry-walk');
    expect(characterClip('WAITING_FOR_ELEVATOR', false)).toBe('carry-idle');
    expect(characterClip('LOADING', false)).toBe('load');
  });

  it('starts the mining hit frame at the existing HP hit time', () => {
    const state = createGameState(9401);
    state.run.character.state = 'MINING';
    state.run.character.swing = { elapsed: SWING.hitAt - 0.0001, hitApplied: false };
    expect(deriveSemanticRenderState(state, 0).character.frame).toBe(2);
    state.run.character.swing.elapsed = SWING.hitAt;
    expect(deriveSemanticRenderState(state, 0).character.frame).toBe(3);
    state.run.character.swing.elapsed = SWING.total - 0.001;
    expect(deriveSemanticRenderState(state, 0).character.frame).toBe(7);
  });

  it('uses existing collection and loading progress without saved frame state', () => {
    const state = createGameState(9402);
    state.run.character.state = 'COLLECTING';
    state.run.character.collectTimer = COLLECT_DURATION * 0.75;
    expect(deriveSemanticRenderState(state, 0).character.frame).toBe(3);
    state.run.character.state = 'LOADING';
    state.run.character.loadingTimer = LOAD_DURATION * 0.5;
    expect(deriveSemanticRenderState(state, 0).character.frame).toBe(2);
    expect('frame' in state.run.character).toBe(false);
  });

  it('derives Player walk and carry-walk frames from distance in both directions', () => {
    const right = playerWalkFrame(100, 1);
    expect(playerWalkFrame(100 + PLAYER_WALK_STRIDE_STEP, 1)).toBe((right + 1) % 4);
    expect(playerWalkFrame(100 + PLAYER_WALK_STRIDE_STEP * 4, 1)).toBe(right);

    const left = playerWalkFrame(100, -1);
    expect(playerWalkFrame(100 - PLAYER_WALK_STRIDE_STEP, -1)).toBe((left + 1) % 4);
    expect(playerWalkFrame(100 - PLAYER_WALK_STRIDE_STEP * 4, -1)).toBe(left);

    const state = createGameState(9410);
    state.run.character.state = 'MOVING_TO_NODE';
    state.run.character.x = 124;
    const walkFrame = deriveSemanticRenderState(state, 0).character.frame;
    expect(deriveSemanticRenderState(state, 9999).character.frame).toBe(walkFrame);
    state.run.character.state = 'RETURNING';
    expect(deriveSemanticRenderState(state, 4321).character.frame).toBe(walkFrame);
    state.run.boots.level = 2;
    state.run.character.moveSpeed = 66;
    expect(deriveSemanticRenderState(state, 8888).character.frame).toBe(walkFrame);
  });

  it('uses the asymmetric idle interval without changing non-idle progress clips', () => {
    expect(playerIdleFrame(0)).toBe(0);
    expect(playerIdleFrame(1199)).toBe(0);
    expect(playerIdleFrame(1200)).toBe(1);
    expect(playerIdleFrame(1599)).toBe(1);
    expect(playerIdleFrame(1600)).toBe(0);

    const state = createGameState(9411);
    expect(deriveSemanticRenderState(state, 1199).character.frame).toBe(0);
    expect(deriveSemanticRenderState(state, 1200).character.frame).toBe(1);
    state.run.character.state = 'WAITING_FOR_ELEVATOR';
    expect(deriveSemanticRenderState(state, 1200).character.frame).toBe(1);
  });

  it('places D-001 characters on the visual tunnel floor without changing GameState coordinates', () => {
    const state = createGameState(9412);
    const originalY = state.run.character.y;
    expect(deriveSemanticRenderState(state, 0).character.worldAnchor.y).toBe(223);
    expect(state.run.character.y).toBe(originalY);

    state.run.porter.enabled = true;
    expect(deriveSemanticRenderState(state, 0).porter?.worldAnchor.y).toBe(223);
  });

  it('keeps exact node HP boundaries and elevator visual state', () => {
    expect(nodeVisualState({ hp: 75, maxHp: 100 })).toBe('full');
    expect(nodeVisualState({ hp: 74, maxHp: 100 })).toBe('damaged');
    expect(nodeVisualState({ hp: 40, maxHp: 100 })).toBe('damaged');
    expect(nodeVisualState({ hp: 39, maxHp: 100 })).toBe('critical');
    expect(nodeVisualState({ hp: 0, maxHp: 100 })).toBe('depleted');

    const state = createGameState(9403);
    state.run.anomaly.selected = 'EMPTY_SHAFT';
    state.run.elevator.state = 'ASCENDING';
    const semantic = deriveSemanticRenderState(state, 0);
    expect(semantic.elevator).toMatchObject({ width: 'narrow', door: 'closed' });
    expect(semantic.shaftBottom).toBe('sealed');
    state.run.depth.unlocked.push('D-030');
    expect(deriveSemanticRenderState(state, 0).shaftBottom).toBe('open');
    expect(d001RopeEndY(d001ElevatorVisualY(0))).toBe(184);
    expect(d001RopeEndY(d001ElevatorVisualY(1))).toBe(36);
    expect(d001ElevatorVisualY(0)).toBe(200);
    expect(d001ElevatorVisualY(0.5)).toBe(126);
    expect(d001ElevatorVisualY(1)).toBe(52);
  });

  it('maps Porter timers and carried states without saving display frames', () => {
    const state = createGameState(9404);
    state.run.porter.enabled = true;
    state.run.porter.state = 'COLLECTING';
    state.run.porter.collectTimer = PORTER_COLLECT_DURATION * 0.75;
    expect(deriveSemanticRenderState(state, 0).porter).toMatchObject({ clip: 'collect', row: 4, frame: 3 });
    state.run.porter.state = 'LOADING';
    state.run.porter.loadingTimer = PORTER_LOAD_DURATION * 0.5;
    expect(deriveSemanticRenderState(state, 0).porter).toMatchObject({ clip: 'load', row: 7, frame: 2 });
    expect(porterClip('WAITING_FOR_ELEVATOR', true)).toBe('carry-idle');
  });

  it('maps Crew role states and shares the mining hit frame', () => {
    const state = createGameState(9405);
    state.meta.runIndex = 2;
    state.run.scrap = 50_000;
    state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100'];
    state.run.research.completed = ['DEEP_SURVEY', 'CORE_RESONANCE', 'CREW_ROUTING', 'CARGO_SCHEDULER'];
    state.run.porter.enabled = true;
    state.run.porter.state = 'FIND_LOOT';
    expect(unlockCrewOperations(state)).toBe(true);
    const miner = state.run.phase5.crew.members.find((member) => member.role === 'MINER')!;
    miner.state = 'MINING';
    miner.swing = { elapsed: SWING.hitAt, hitApplied: true };
    expect(crewClip(miner)).toBe('mine-swing');
    expect(deriveSemanticRenderState(state, 0).crew.get(miner.id)).toMatchObject({ clip: 'mine-swing', row: 3, frame: 3 });
    const porter = state.run.phase5.crew.members.find((member) => member.role === 'PORTER')!;
    porter.state = 'DEPOSITING';
    porter.loadingTimer = COLLECT_DURATION * 0.75;
    expect(deriveSemanticRenderState(state, 0).crew.get(porter.id)).toMatchObject({ clip: 'load', row: 7, frame: 3 });
  });

  it('derives Engineer work frames and direction from job progress', () => {
    const state = createGameState(9406);
    state.run.engineer.unlocked = true;
    state.run.engineer.state = 'INSTALLING';
    state.run.engineer.x = 300;
    state.run.engineer.job = { id: 'job', kind: 'RAIL_INSTALL', targetId: 'rail', depth: 'D-001', progress: 5, requiredProgress: 10 };
    expect(engineerClip(state.run.engineer.state)).toBe('work');
    expect(deriveSemanticRenderState(state, 0).engineer).toMatchObject({ clip: 'work', row: 2, frame: 2, facing: 1 });
  });

  it('maps every LootKind to a Cargo visual class and prioritizes equipmentSeed', () => {
    const mapped = (Object.keys(LOOT) as LootKind[]).map((kind) => cargoVisualClass({ kind, category: LOOT[kind].category }));
    expect(mapped).toHaveLength(35);
    expect(new Set(mapped)).toEqual(new Set([
      'rock', 'metal', 'copper', 'gold', 'gem', 'fossil', 'relic', 'research', 'anomaly', 'core',
      'equipment-crate', 'industrial-crate',
    ]));
    expect(cargoVisualClass({ kind: 'STONE', category: 'CORE' })).toBe('core');
    expect(cargoVisualClass({ kind: 'STONE', category: 'RESEARCH' })).toBe('research');
    expect(cargoVisualClass({ kind: 'STONE', category: 'ORE', equipmentSeed: 1 } as Pick<LootStack, 'kind' | 'category' | 'equipmentSeed'>))
      .toBe('equipment-crate');
  });
});
