import { expect, test } from '@playwright/test';

// One fixed-state browser scenario covers the shared audio/visual onset, real pixels and settings.
test('reward motifs share one presentation onset, keep cargo intact and respect effect controls', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.game-canvas').click({ position: { x: 10, y: 10 } });
  const result = await page.evaluate(async () => {
    const [rendering, game, assetsModule, audioModule] = await Promise.all([
      '/src/render/gameRenderer.ts', '/src/game/createGame.ts', '/src/render/assets/gameAssets.ts', '/src/game/audio.ts',
    ].map(url => import(url)));
    const state = game.createGameState(31); const node = state.run.floors['D-001'].nodes[0];
    const assets = assetsModule.gameAssets();
    for (let n = 0; n < 100 && !assets.ready('backgroundRock'); n++) await new Promise(resolve => setTimeout(resolve, 20));
    const canvas = document.createElement('canvas');
    const starts: string[] = [];
    const context = new AudioContext(); await context.resume();
    const audio = new audioModule.GameAudio(() => context); audio.unlock();
    const settings = { volume: .5, motion: true, highlights: true };
    const renderer = new rendering.GameRenderer(canvas, { settings: () => settings, reward: (notice: { key: string } | null) => {
      if (notice) starts.push(notice.key); audio.playReward(notice);
    } });
    const before = JSON.stringify(state);
    renderer.handleEvent({ id: 1, type: 'ORE_QUALITY_FOUND', at: 0, data: { quality: 'PURE', value: 54, nodeId: node.id, depth: 'D-001' } }, state, 100);
    renderer.handleEvent({ id: 2, type: 'SPECIMEN_APPRAISED', at: 0, data: { id: 'first', name: 'Intact Ammonite', first: true, kind: 'AMMONITE', grade: 'INTACT', value: 69 } }, state, 100);
    const beforeRender = starts.length;
    renderer.render(state, 100); renderer.render(state, 165);
    const afterRender = starts.slice();
    const firstImage = canvas.toDataURL();
    const shots: Array<{ name: string; image: string }> = [];
    for (const [index, kind] of ['NATURAL_GOLD', 'GEM', 'FRACTURE_CORE', 'BLACK_GLASS_HEART'].entries()) {
      const at = 3000 + index * 3000;
      const category = index < 2 ? 'VALUABLE' : index === 2 ? 'RELIC' : 'ANOMALY';
      renderer.clearFeedback();
      renderer.handleEvent({ id: 10 + index, type: 'DISCOVERY_FOUND', at: 0, data: { id: kind, publicKind: kind, name: kind, category, nodeId: node.id, depth: 'D-001' } }, state, at);
      renderer.render(state, at); renderer.render(state, at + 260);
      shots.push({ name: kind, image: canvas.toDataURL() });
    }
    const startsBeforeRemote = starts.length;
    renderer.clearFeedback();
    renderer.handleEvent({ id: 30, type: 'DISCOVERY_FOUND', at: 0, data: { id: 'remote', publicKind: 'GEM', category: 'VALUABLE', depth: 'D-030', nodeId: state.run.floors['D-030'].nodes[0].id } }, state, 16000);
    renderer.render(state, 16000);
    const remoteIgnored = starts.length === startsBeforeRemote;
    // A queued old result is cleared when changing floors, including its scheduled sound.
    renderer.handleEvent({ id: 31, type: 'SPECIMEN_APPRAISED', at: 0, data: { id: 'delivered', first: true } }, state, 16100);
    renderer.handleEvent({ id: 32, type: 'DISCOVERY_FOUND', at: 0, data: { id: 'queued', category: 'FOSSIL', nodeId: node.id, depth: 'D-001' } }, state, 16100);
    renderer.render(state, 16100);
    const beforeTravel = starts.length;
    state.run.depth.current = 'D-030'; renderer.render(state, 16200); renderer.render(state, 20000);
    const cleared = starts.length === beforeTravel;
    state.run.depth.current = 'D-001';
    settings.motion = false; settings.highlights = false;
    renderer.handleEvent({ id: 40, type: 'NODE_BREAK', at: 0, data: { nodeId: node.id, depth: 'D-001' } }, state, 21000);
    renderer.handleEvent({ id: 41, type: 'DISCOVERY_FOUND', at: 0, data: { id: 'quiet', publicKind: 'GEM', category: 'VALUABLE', nodeId: node.id, depth: 'D-001' } }, state, 21000);
    renderer.render(state, 21000);
    const quietImage = canvas.toDataURL();
    const unchanged = JSON.stringify(state) === before;
    const audioRunning = context.state === 'running';
    audio.reset(); await context.close();
    return { beforeRender, afterRender, remoteIgnored, cleared, unchanged, audioRunning, firstImage, quietImage, shots };
  });
  expect(result.beforeRender).toBe(0);
  expect(result.afterRender).toEqual(['SPECIMEN_APPRAISED:first']);
  expect(result.remoteIgnored).toBe(true); expect(result.cleared).toBe(true);
  expect(result.unchanged).toBe(true); expect(result.audioRunning).toBe(true);
  expect(new Set(result.shots.map(shot => shot.image)).size).toBe(4);
  for (const shot of [{ name: 'first-specimen', image: result.firstImage }, ...result.shots, { name: 'reduced-effects', image: result.quietImage }]) {
    await info.attach(shot.name, { body: Buffer.from(shot.image.split(',')[1]!, 'base64'), contentType: 'image/png' });
  }
  await page.getByRole('button', { name: 'Controls and current objective', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound volume 50 percent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sound volume 50 percent', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sound volume 100 percent', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Screen shake and effect motion on', exact: true }).click();
  await page.getByRole('button', { name: 'Effect highlights on', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: 'Controls and current objective', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Screen shake and effect motion off', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Effect highlights off', exact: true })).toBeVisible();
});
