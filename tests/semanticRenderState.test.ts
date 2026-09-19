import { describe, expect, it } from 'vitest';
import { COLLECT_DURATION, LOAD_DURATION, SWING } from '../src/game/config';
import { createGameState } from '../src/game/createGame';
import { characterClip, deriveSemanticRenderState, nodeVisualState } from '../src/render/semanticRenderState';

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
  });
});
