import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameState } from '../src/game/createGame';
import { appraisePhysicalCargo } from '../src/game/appraisal';
import { advanceProspecting, applyOreQuality } from '../src/game/prospecting';
import { rewardNotice, RewardNoticeQueue } from '../src/game/rewardFeedback';
import { deriveSemanticRenderState } from '../src/render/semanticRenderState';
import { drawCargoMark, drawDiscoveryCues } from '../src/render/discoveryCues';
import { restoreGameState, serializeGameState } from '../src/game/save';
import { canTravelToDepth, requestFloorTravel, sendElevator, togglePorterHold } from '../src/game/simulation';
import { GameRuntime } from '../src/runtime/GameRuntime';
import type { GameEvent } from '../src/game/types';
import { loot, tick } from './fixtures/discovery';
const event = (type: GameEvent['type'], data = {}): GameEvent => ({ id: 1, at: 1, type, data });
const ctx = () => ({ save: vi.fn(), restore: vi.fn(), fillRect: vi.fn(), fillStyle: '' } as unknown as CanvasRenderingContext2D);

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() }));
describe('reward feedback and semantic marks', () => {
  it('prioritizes first/pristine/usable gear over ordinary discoveries and skips duplicate specimen notifications', () => {
    const ordinary = rewardNotice(event('DISCOVERY_FOUND', { name: 'Relic', rarity: 'RELIC' }))!;
    const first = rewardNotice(event('SPECIMEN_APPRAISED', { name: 'Intact Trilobite', value: 63, first: true }))!;
    expect(first.priority).toBeGreaterThan(ordinary.priority);
    expect(rewardNotice(event('COLLECTION_REGISTERED', { fromSpecimen: true }))).toBeNull();
    expect(rewardNotice(event('EQUIPMENT_APPRAISED', { first: true }))!.priority).toBe(first.priority);
  });
  it('does not overwrite appraisal with low-priority spam or hold a stale infinite queue', () => {
    const queue = new RewardNoticeQueue();
    queue.push({ key: 'first', label: 'First fossil', detail: 'delivered', priority: 5, duration: 2000 }, 0);
    for (let i = 0; i < 100; i++) queue.push({ key: `ore-${i}`, label: 'Ore', detail: '', priority: 1, duration: 850 }, i);
    expect(queue.at(1000)?.label).toBe('First fossil'); expect(queue.at(2500)).toBeNull();
    for (let i = 0; i < 20; i++) queue.push({ key: `find-${i}`, label: 'Find', detail: '', priority: 2, duration: 1000 }, i);
    expect(queue.at(10000)).toBeNull(); queue.clear(); expect(queue.at(10001)).toBeNull();
  });
  it('derives stable discovery stages without mutating the simulation or consuming RNG', () => {
    const state = createGameState(81); const floor = state.run.floors['D-001'];
    for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
    const before = serializeGameState(state); const a = deriveSemanticRenderState(state, 0);
    const b = deriveSemanticRenderState(state, 900000); expect(b.discoveries).toEqual(a.discoveries);
    expect(a.discoveries.size).toBe(1); const c = ctx(); drawDiscoveryCues(c, state, a); expect(c.fillRect).toHaveBeenCalled();
    expect(serializeGameState(state)).toBe(before);
    const id = [...a.discoveries.keys()][0]!; advanceProspecting(floor, floor.nodes.find((node) => node.id === id)!);
    expect(deriveSemanticRenderState(state, 0).discoveries.get(id)?.stage).toBe('EXPOSED');
  });
  it('uses different shape patterns, not color alone, for metal, fossil and research', () => {
    const state = createGameState(82); const node = state.run.floors['D-001'].nodes[0]!;
    const signatures = ['METAL', 'FOSSIL', 'RESEARCH'].map((signal) => {
      const context = ctx(); const semantic = deriveSemanticRenderState(state, 0);
      drawDiscoveryCues(context, state, { ...semantic, discoveries: new Map([[node.id, { signal: signal as 'METAL', stage: 'SEALED', remaining: 2 }]]) });
      return JSON.stringify(vi.mocked(context.fillRect).mock.calls);
    });
    expect(new Set(signatures).size).toBe(3);
  });
  it('marks quality and unidentified cargo without revealing pristine grade', () => {
    const normal = ctx(); drawCargoMark(normal, loot('IRON'), 20, 30); expect(normal.fillRect).not.toHaveBeenCalled();
    const fine = ctx(); const a = loot('IRON'); applyOreQuality(a, 'FINE'); drawCargoMark(fine, a, 20, 30);
    const pure = ctx(); applyOreQuality(a, 'PURE'); drawCargoMark(pure, a, 20, 30);
    expect(vi.mocked(pure.fillRect).mock.calls.length).toBeGreaterThan(vi.mocked(fine.fillRect).mock.calls.length);
    const b = loot('AMMONITE'); b.specimen = { grade: 'INTACT', value: 69 };
    const intact = ctx(); drawCargoMark(intact, b, 20, 30); b.specimen = { grade: 'PRISTINE', value: 138 };
    const pristine = ctx(); drawCargoMark(pristine, b, 20, 30);
    expect(vi.mocked(pristine.fillRect).mock.calls).toEqual(vi.mocked(intact.fillRect).mock.calls);
  });
  it('requires the live confirmation screen to spend duplicates, including direct commands', () => {
    const state = createGameState(83); state.run.depth.unlocked.push('D-030');
    appraisePhysicalCargo(state, Array.from({ length: 6 }, (_, i) => loot('TRILOBITE', `t${i}`)), () => undefined);
    const runtime = new GameRuntime(state);
    runtime.dispatch({ type: 'restore-fossil', kind: 'AMMONITE' });
    expect(state.meta.collection.entries.find((entry) => entry.kind === 'AMMONITE')?.discovered).toBe(false);
    runtime.openManagement({ station: 'archive', tab: 'finds', selectedId: 'AMMONITE' }); runtime.activateManagementItem();
    expect(runtime.getSnapshot().management?.confirmation).toBeTruthy(); runtime.activateManagementItem(); runtime.activateManagementItem();
    expect(state.meta.collection.entries.find((entry) => entry.kind === 'TRILOBITE')?.restorationSpent).toBe(5);
  });
});

it('pickup hold finishes owned cargo, leaves ground cargo intact and resumes after actual floor travel', () => {
  let state = createGameState(84); state.run.depth.unlocked.push('D-030'); state.run.porter.enabled = true;
  state.run.porter.carried = [loot('IRON', 'held')]; state.run.porter.state = 'RETURNING_TO_ELEVATOR';
  state.run.floors['D-001'].loot.push(loot('IRON', 'unclaimed')); togglePorterHold(state);
  state = restoreGameState(serializeGameState(state))!; tick(state, 2);
  expect(state.run.porter.holdForTravel).toBe(true); expect(state.run.porter.carried).toHaveLength(0);
  expect(state.run.elevator.cargo).toHaveLength(1); expect(state.run.floors['D-001'].loot).toHaveLength(1);
  sendElevator(state); tick(state, 10); expect(canTravelToDepth(state, 'D-030')).toBe(true);
  expect(requestFloorTravel(state, 'D-030')).toBe(true); tick(state, 4);
  expect(state.run.porter.holdForTravel).toBe(false); expect(state.run.floors['D-001'].loot).toHaveLength(1);
});
