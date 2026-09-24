import { expect, test } from '@playwright/test';
import type { GameEvent } from '../../src/game/types';
import type { RewardNotice } from '../../src/game/rewardFeedback';

test('a delivered shipment reveals once, settles once, and leaves work and reduced-motion controls live', async ({ page }, info) => {
  await page.goto('/');
  await page.locator('.game-canvas').click({ position: { x: 10, y: 10 } });
  const result = await page.evaluate(async () => {
    const { createRenderSurface } = await import('/tests/fixtures/' + 'renderSurface.ts');
    const [rendering, fixture, sim, phase5, assetModule, audioModule] = await Promise.all([
      '/src/render/gameRenderer.ts', '/tests/fixtures/discovery.ts', '/src/game/simulation.ts',
      '/src/game/phase5.ts', '/src/render/assets/gameAssets.ts', '/src/game/audio.ts',
    ].map(url => import(url)));
    const state = fixture.specimenGame(611);
    state.run.elevator.cargo[0].specimen.grade = 'PRISTINE';
    state.run.elevator.cargo.push(fixture.loot('IRON', 'ordinary'), fixture.loot('NATURAL_GOLD', 'gold'));
    sim.drainEvents(state);
    const surface = createRenderSurface(); const { canvas, ui } = surface;
    const starts: Array<{ key: string; highlight: string | undefined }> = [];
    const settings = { volume: .5, motion: true, highlights: true, locale: 'en' };
    const context = new AudioContext(); await context.resume();
    const audio = new audioModule.GameAudio(() => context); audio.unlock();
    const renderer = new rendering.GameRenderer(canvas, { settings: () => settings, reward: (notice: RewardNotice | null) => {
      if (notice) starts.push({ key: notice.key, highlight: notice.shipment?.highlight?.effect });
      audio.playReward(notice);
    } }, ui);
    const assets = assetModule.gameAssets();
    for (let n = 0; n < 100 && (!assets.ready('backgroundRock') || !assets.ready('discoveryCollection')); n++)
      await new Promise(resolve => setTimeout(resolve, 20));
    sim.sendElevator(state);
    let delivered: GameEvent[] = [];
    for (let n = 0; n < 150 && !delivered.length; n++) {
      sim.updateGame(state, .1);
      const base = sim.drainEvents(state); phase5.processPhase5Events(state, base);
      const events = [...base, ...sim.drainEvents(state)];
      if (events.some(e => e.type === 'SHIPMENT_APPRAISED')) delivered = events;
    }
    const initial = JSON.stringify(state);
    for (const e of delivered) { renderer.handleEvent(e, state, 1000, delivered); audio.handle(e, state); }
    const beforeRender = starts.length;
    const shots: Array<{ name: string; image: string }> = [];
    const crop = () => ui.toDataURL();
    const stages: string[] = [];
    for (const [age, name] of [[0, 'covered'], [400, 'revealed'], [900, 'grade'], [1600, 'ordinary'], [1900, 'valuable'], [2250, 'settled']] as const) {
      renderer.render(state, 1000 + age); stages.push(crop());
      shots.push({ name, image: surface.capture() });
    }
    const unchangedByPresentation = JSON.stringify(state) === initial;
    const firstStarts = starts.slice();
    const receipt = delivered.find(e => e.type === 'SHIPMENT_APPRAISED')!;
    renderer.handleEvent(receipt, state, 3300, delivered); renderer.render(state, 3400);
    const noDuplicate = starts.length === 1;
    // A real tool purchase is silent until its first real damaging hit.
    renderer.clearFeedback(); state.run.scrap += 1000; sim.upgradeTool(state);
    for (const e of sim.drainEvents(state)) renderer.handleEvent(e, state, 5000);
    renderer.render(state, 5000); const beforeHit = starts.length;
    const node = state.run.floors['D-001'].nodes[0]; state.run.character.x = node.x - 13;
    sim.requestMine(state, node.id);
    for (let n = 0; n < 20; n++) {
      sim.updateGame(state, .1); const events = sim.drainEvents(state);
      for (const e of events) renderer.handleEvent(e, state, 5100 + n * 100, events);
      renderer.render(state, 5100 + n * 100);
      if (starts.length > beforeHit) break;
    }
    const actualFirstHit = starts.slice(beforeHit).some(start => start.key.startsWith('gear:PLAYER:TOOL:'));
    shots.push({ name: 'first-tool-use', image: surface.capture() });
    // Re-display a different delivered receipt with motion and highlights disabled.
    renderer.clearFeedback(); settings.motion = false; settings.highlights = false;
    const quietBatch = delivered.map(e => ({ ...e, data: { ...e.data, shipmentId: 'quiet' } }));
    for (const e of quietBatch) renderer.handleEvent(e, state, 9000, quietBatch);
    renderer.render(state, 9000); const reducedStart = crop(); renderer.render(state, 9150);
    const reducedStatic = reducedStart === crop(); renderer.render(state, 9900);
    const reducedRevealed = reducedStart !== crop();
    shots.push({ name: 'reduced-grade', image: surface.capture() });
    // Clearing during the count-up drops all pending receipt audio and does not reverse its credit.
    const credited = state.run.scrap; renderer.clearFeedback(); renderer.render(state, 12000);
    const cleared = starts.length; renderer.render(state, 20000);
    const noReplay = starts.length === cleared && state.run.scrap === credited;
    const audioRunning = context.state === 'running'; audio.reset(); await context.close();
    surface.dispose();
    return { beforeRender, firstStarts, unchangedByPresentation, noDuplicate, actualFirstHit, reducedStatic,
      reducedRevealed, noReplay, audioRunning, stageCount: new Set(stages).size, shots };
  });
  expect(result.beforeRender).toBe(0);
  expect(result.firstStarts).toHaveLength(1);
  expect(result.firstStarts[0]?.highlight).toBe('specimen');
  expect(result.unchangedByPresentation).toBe(true); expect(result.noDuplicate).toBe(true);
  expect(result.actualFirstHit).toBe(true);
  expect(result.reducedStatic).toBe(true); expect(result.reducedRevealed).toBe(true);
  expect(result.noReplay).toBe(true); expect(result.audioRunning).toBe(true);
  expect(result.stageCount).toBe(6);
  for (const shot of result.shots) await info.attach(shot.name, { body: Buffer.from(shot.image.split(',')[1]!, 'base64'), contentType: 'image/png' });
});
