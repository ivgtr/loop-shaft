import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { rollMiningLoot } from '../src/game/mining';
import { rewardNotice, RewardNoticeQueue } from '../src/game/rewardFeedback';
import { rewardNotes } from '../src/game/rewardSounds';
import { loadPresentationSettings, savePresentationSettings } from '../src/game/presentationSettings';
import { serializeGameState } from '../src/game/save';
import { GameAudio } from '../src/game/audio';
import type { GameEvent } from '../src/game/types';

const event = (type: GameEvent['type'], data: NonNullable<GameEvent['data']> = {}, id = 1): GameEvent => ({ id, type, at: 0, data });
afterEach(() => vi.unstubAllGlobals());

describe('reward presentation', () => {
  it('uses disclosed material, never a hidden fossil grade or equipment seed, to choose the motif', () => {
    const find = (data: NonNullable<GameEvent['data']>) => rewardNotice(event('DISCOVERY_FOUND', data))!;
    expect(find({ publicKind: 'GEM', category: 'VALUABLE' }).effect).toBe('gem');
    expect(find({ publicKind: 'NATURAL_GOLD', category: 'VALUABLE' }).effect).toBe('metal');
    expect(find({ publicKind: 'FRACTURE_CORE', category: 'RELIC' }).effect).toBe('relic');
    const sealed = { publicKind: 'SEALED', category: 'FOSSIL', name: 'Unidentified fossil' };
    expect(find({ ...sealed, kind: 'AMMONITE', grade: 'INTACT' })).toEqual(find({ ...sealed, kind: 'STRANGE_VERTEBRA', grade: 'PRISTINE' }));
    expect(find({ publicKind: 'SEALED', category: 'RELIC', seed: 1 })).toEqual(find({ publicKind: 'SEALED', category: 'RELIC', seed: 900 }));
  });

  it('emits safe appearance keys on actual physical drops and leaves simulation/RNG untouched when selecting feedback', () => {
    const state = createGameState(12); const floor = state.run.floors['D-030']; const node = floor.nodes[0]!;
    const events: GameEvent[] = []; const cargo = [];
    for (let i = 0; i < 40; i++) cargo.push(...rollMiningLoot(state, floor, node, (type, data) => events.push(event(type, data, events.length))));
    expect(cargo.some(item => item.specimen)).toBe(true);
    expect(cargo.some(item => item.equipmentSeed !== undefined)).toBe(true);
    for (const item of cargo.filter(item => item.specimen || item.equipmentSeed !== undefined)) {
      const found = events.find(e => e.type === 'DISCOVERY_FOUND' && e.data?.id === item.id)!;
      expect(found.data?.publicKind).toBe('SEALED'); expect(found.data?.grade).toBeUndefined();
    }
    const before = serializeGameState(state);
    for (const e of events) { const notice = rewardNotice(e); if (notice) rewardNotes(notice); }
    expect(serializeGameState(state)).toBe(before);
  });

  it('keeps important appraisals above ore, deduplicates finished events, and expires queued discoveries', () => {
    const queue = new RewardNoticeQueue();
    const first = rewardNotice(event('SPECIMEN_APPRAISED', { first: true }))!;
    queue.push(first, 0);
    for (let i = 0; i < 100; i++) queue.push(rewardNotice(event('ORE_QUALITY_FOUND', { quality: 'FINE' }, i + 10))!, i);
    expect(queue.at(100)?.key).toBe(first.key);
    expect(queue.at(2400)).toBeNull(); queue.push(first, 2401); expect(queue.at(2401)).toBeNull();
    queue.clear(); queue.push(first, 0);
    queue.push(rewardNotice(event('DISCOVERY_FOUND', { id: 'late' }))!, 1);
    expect(queue.at(9000)).toBeNull();
  });

  it('gives material families different rhythms/timbres and reserves the resolving chord for important appraisals', () => {
    const motifs = ['pure', 'metal', 'gem', 'fossil', 'relic', 'anomaly'] as const;
    const base = { key: 'a', label: '', detail: '', priority: 3, duration: 1600 };
    expect(new Set(motifs.map(effect => JSON.stringify(rewardNotes({ ...base, effect })))).size).toBe(motifs.length);
    expect(rewardNotes({ ...base, effect: 'anomaly' })[0]!.at).toBeGreaterThan(0);
    expect(rewardNotes({ ...base, effect: 'specimen', priority: 5 }).length).toBeGreaterThan(rewardNotes({ ...base, effect: 'specimen', priority: 1 }).length);
  });

  it('persists only device presentation preferences and tolerates unavailable storage', () => {
    let stored: string | null = null;
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    vi.stubGlobal('localStorage', { getItem: () => stored, setItem: (_: string, value: string) => { stored = value; } });
    expect(loadPresentationSettings()).toEqual({ volume: .5, motion: false, highlights: false });
    savePresentationSettings({ volume: 0, motion: true, highlights: false });
    expect(loadPresentationSettings()).toEqual({ volume: 0, motion: true, highlights: false });
    stored = '{"volume":9,"motion":"yes"}';
    expect(loadPresentationSettings()).toEqual({ volume: 1, motion: false, highlights: false });
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } });
    expect(() => savePresentationSettings(loadPresentationSettings())).not.toThrow();
  });

  it('bounds scheduled voices, cancels preempted reward tails and survives blocked audio', () => {
    const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
    const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    const oscillators: Array<ReturnType<typeof node> & { type: string; frequency: ReturnType<typeof param>; start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn>; onended: (() => void) | null }> = [];
    const context = { currentTime: 1, state: 'running', destination: {},
      createGain: () => ({ ...node(), gain: param() }),
      createDynamicsCompressor: () => ({ ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }),
      createOscillator: () => { const osc = { ...node(), type: '', frequency: param(), start: vi.fn(), stop: vi.fn(), onended: null }; oscillators.push(osc); return osc; },
    } as unknown as AudioContext;
    const audio = new GameAudio(() => context); audio.unlock();
    for (let i = 0; i < 100; i++) audio.handle(event('DATA_GAIN'));
    expect(oscillators.length).toBe(16);
    const first = rewardNotice(event('SPECIMEN_APPRAISED', { first: true }))!;
    audio.playReward(first); expect(oscillators.length).toBe(21);
    const rewardVoices = oscillators.slice(16); audio.playReward(null);
    expect(rewardVoices.every(voice => voice.stop.mock.calls.some(args => args[0] === 1.025))).toBe(true);
    audio.reset(); expect(oscillators.every(voice => voice.stop.mock.calls.length >= 2)).toBe(true);
    expect(() => new GameAudio(() => { throw new Error('not supported'); }).unlock()).not.toThrow();
  });
});
