import { expect, test } from '@playwright/test';
import type { GameEvent } from '../../src/game/types';
import type { RewardNotice } from '../../src/game/rewardFeedback';

test('exceptional cargo retains its silhouette through discovery, handling and appraisal', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.game-canvas').click({ position: { x: 10, y: 10 } });
  const result = await page.evaluate(async () => {
    const [rendering, fixture, create, appraisal, assetModule, audioModule] = await Promise.all([
      '/src/render/gameRenderer.ts', '/tests/fixtures/discovery.ts', '/src/game/createGame.ts',
      '/src/game/appraisal.ts', '/src/render/assets/gameAssets.ts', '/src/game/audio.ts',
    ].map(url => import(url)));
    const assets = assetModule.gameAssets();
    for (let n = 0; n < 100 && (!assets.ready('discoveryCargo') || !assets.ready('discoveryCollection')); n++) await new Promise(resolve => setTimeout(resolve, 20));
    const settings = { volume: .5, motion: true, highlights: true };
    const context = new AudioContext(); await context.resume();
    const audio = new audioModule.GameAudio(() => context); audio.unlock();
    const shots: Array<{ name: string; image: string }> = [];
    const rows: Array<{ effect: string | undefined; artifact: string | undefined; starts: number; immutable: boolean }> = [];
    for (const kind of ['CHORUS_GEODE', 'GRAVITY_KNOT']) {
      const state = create.createGameState(93); state.run.depth.current = 'D-100';
      state.run.depth.unlocked.push('D-030', 'D-060', 'D-100'); state.meta.bestDepth = 'D-100';
      const floor = state.run.floors['D-100']; const node = floor.nodes[0];
      const item = fixture.loot(kind, kind, 'D-100'); item.x = node.x; item.y = node.y - 4; floor.loot.push(item);
      const canvas = document.createElement('canvas'); const notices: RewardNotice[] = [];
      const renderer = new rendering.GameRenderer(canvas, { settings: () => settings, reward: (notice: RewardNotice | null) => {
        if (notice) notices.push(notice); audio.playReward(notice);
      } });
      const event: GameEvent = { id: 1, type: 'DISCOVERY_FOUND', at: 0, data: { id: item.id, name: item.name,
        category: item.category, publicKind: kind, depth: 'D-100', nodeId: node.id } };
      renderer.handleEvent(event, state, 1000, [event]); renderer.render(state, 1000); renderer.render(state, 1330);
      shots.push({ name: `${kind}-found`, image: canvas.toDataURL() });
      const effect = notices[0]?.effect;
      renderer.clearFeedback(); floor.loot = []; state.run.character.carried = [item]; renderer.render(state, 2000);
      shots.push({ name: `${kind}-carried`, image: canvas.toDataURL() });
      state.run.character.carried = [];
      const batch: GameEvent[] = []; appraisal.appraisePhysicalCargo(state, [item], (type: GameEvent['type'], data: GameEvent['data']) => batch.push({ id: batch.length + 2, at: 0, type, data }));
      const before = JSON.stringify(state); const starts = notices.length;
      for (const e of batch) renderer.handleEvent(e, state, 3000, batch);
      renderer.render(state, 3000); renderer.render(state, 3900);
      shots.push({ name: `${kind}-appraised`, image: canvas.toDataURL() });
      const artifact = notices.at(-1)?.shipment?.highlight?.artifact;
      const immutable = JSON.stringify(state) === before;
      rows.push({ effect, artifact, starts: notices.length - starts, immutable });
      renderer.clearFeedback(); settings.motion = false; settings.highlights = false;
      renderer.handleEvent(event, state, 5000, [event]); renderer.render(state, 5000); renderer.render(state, 5300);
      shots.push({ name: `${kind}-reduced`, image: canvas.toDataURL() });
      renderer.clearFeedback(); settings.motion = true; settings.highlights = true;
    }
    const audioRunning = context.state === 'running'; audio.reset(); await context.close();
    return { rows, shots, audioRunning };
  });
  expect(result.rows).toEqual([
    { effect: 'chorus', artifact: 'CHORUS_GEODE', starts: 1, immutable: true },
    { effect: 'gravity', artifact: 'GRAVITY_KNOT', starts: 1, immutable: true },
  ]);
  expect(result.audioRunning).toBe(true);
  expect(result.shots[0]?.image).not.toBe(result.shots[4]?.image);
  for (const shot of result.shots) await info.attach(shot.name, { body: Buffer.from(shot.image.split(',')[1]!, 'base64'), contentType: 'image/png' });
});
