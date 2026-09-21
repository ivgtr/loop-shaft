import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const source = JSON.parse(readFileSync(new URL('../../art/discovery/sprites.json', import.meta.url), 'utf8'));
import { createGameState } from '../../src/game/createGame';
import { advanceProspecting, applyOreQuality, floorProspects, sealSpecimen } from '../../src/game/prospecting';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import { loot } from '../fixtures/discovery';
import { observeDiscoveryArt, expectDiscoveryArt } from './helpers/discoveryArt';

for (const width of [390, 1280]) test(`real discovery and cargo atlases survive reload at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await observeDiscoveryArt(page);
  const state = createGameState(771); const floor = state.run.floors['D-001'];
  for (let i = 0; i < 18; i++) advanceProspecting(floor, floor.nodes[0]!);
  floor.prospecting!.prospectWork = [0, 1];
  for (const [index, grade] of (['NORMAL', 'FINE', 'PURE'] as const).entries()) {
    const item = loot('IRON', `quality-${grade}`); applyOreQuality(item, grade); item.x = 98 + index * 18; floor.loot.push(item);
  }
  const specimen = loot('AMMONITE', 'hidden-specimen'); sealSpecimen(specimen, floor, 1); specimen.x = 381; floor.loot.push(specimen);
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: SAVE_KEY, value: serializeGameState(state) });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  for (const grade of ['normal', 'fine', 'pure']) await expectDiscoveryArt(page, 'cargo', `iron-${grade}`);
  await expectDiscoveryArt(page, 'cargo', 'specimen');
  const plan = floorProspects(floor)[1]!; await expectDiscoveryArt(page, 'traces', `${plan.signal.toLowerCase()}-exposed`);
  await info.attach(`discovery-world-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload(); await expectDiscoveryArt(page, 'cargo', 'specimen');
  await expectDiscoveryArt(page, 'traces', `${plan.signal.toLowerCase()}-exposed`);
  expect(errors).toEqual([]);
});

test('browser atlas and failure fallback have exactly identical pixels for all 31 frames', async ({ page }, info) => {
  await page.goto('/');
  const result = await page.evaluate(async (source) => {
    const artUrl = '/src/render/assets/discoveryArt.ts'; const storeUrl = '/src/render/assets/assetStore.ts';
    const { drawDiscoveryArt, discoveryAssets } = await import(artUrl); const { AssetStore } = await import(storeUrl);
    discoveryAssets.preload();
    for (let n = 0; n < 100 && (!discoveryAssets.ready('cargo') || !discoveryAssets.ready('traces')); n++) await new Promise((resolve) => setTimeout(resolve, 20));
    const atlasCanvas = document.createElement('canvas'); const fallbackCanvas = document.createElement('canvas');
    atlasCanvas.width = fallbackCanvas.width = 256; atlasCanvas.height = fallbackCanvas.height = 160;
    const a = atlasCanvas.getContext('2d')!; const b = fallbackCanvas.getContext('2d')!;
    const imageFailures: HTMLImageElement[] = [];
    const failed = new AssetStore({ traces: '/bad-traces.png', cargo: '/bad-cargo.png' }, () => {
      // No network and no separate fallback art: trigger the same Image.onerror path.
      const image = { src: '', onerror: null, onload: null } as unknown as HTMLImageElement; imageFailures.push(image); return image;
    });
    failed.preload(); imageFailures.forEach((image) => image.onerror!(new Event('error')));
    let index = 0;
    for (const bank of ['traces', 'cargo'] as const) for (const key of Object.keys(source[bank].frames)) {
      const x = (index % 8) * 32; const y = Math.floor(index / 8) * 32;
      drawDiscoveryArt(a, bank, key, x, y); drawDiscoveryArt(b, bank, key, x, y, failed); index++;
    }
    const first = a.getImageData(0, 0, 256, 160).data; const second = b.getImageData(0, 0, 256, 160).data;
    return { ready: ['traces', 'cargo'].every((bank) => discoveryAssets.get(bank).state === 'ready'), failed: ['traces', 'cargo'].every((bank) => failed.get(bank).state === 'error'),
      frames: index, different: first.reduce((count, value, i) => count + Number(value !== second[i]), 0), image: atlasCanvas.toDataURL() };
  }, source);
  expect(result.ready).toBe(true); expect(result.failed).toBe(true); expect(result.frames).toBe(31); expect(result.different).toBe(0);
  await info.attach('all-discovery-frames', { body: Buffer.from(result.image.split(',')[1]!, 'base64'), contentType: 'image/png' });
});

test('blocked discovery PNG requests do not hide finds or break the live game', async ({ page }, info) => {
  const state = createGameState(887); const floor = state.run.floors['D-001'];
  for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
  const item = loot('COPPER'); applyOreQuality(item, 'PURE'); item.x = 300; floor.loot.push(item);
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
  await page.route(/discovery-(cargo|traces)\.png(?:\?.*)?$/, (route) => {
    // Vite's ?import request is a JS module, not the Image request being tested.
    return new URL(route.request().url()).searchParams.has('import') ? route.continue() : route.abort();
  });
  const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-001');
  const pixels = await page.evaluate(async () => {
    const url = '/src/render/assets/discoveryArt.ts'; const { discoveryAssets } = await import(url);
    for (let i = 0; i < 100 && ['traces', 'cargo'].some((bank) => discoveryAssets.get(bank).state === 'loading'); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    const canvas = document.querySelector<HTMLCanvasElement>('.game-canvas')!;
    const data = canvas.getContext('2d')!.getImageData(294, 214, 12, 10).data;
    return { failed: ['traces', 'cargo'].every((bank) => discoveryAssets.get(bank).state === 'error'),
      copperPixels: Array.from({ length: data.length / 4 }, (_, i) => i * 4).filter((i) => data[i] === 180 && data[i + 1] === 95 && data[i + 2] === 46).length };
  });
  expect(pixels.failed).toBe(true); expect(pixels.copperPixels).toBeGreaterThan(0); expect(errors).toEqual([]);
  await info.attach('discovery-image-failure', { body: await page.screenshot(), contentType: 'image/png' });
});

// Renderer-only ownership fixtures: no elapsed simulation and no assertion about unlock timing.
// Every owner gets a different frame, so a forgotten rendering path cannot pass accidentally.
for (const depth of ['D-001', 'D-250', 'D-400'] as const) test(`all physical cargo owners use the same atlas on ${depth}`, async ({ page }, info) => {
  await page.goto('/');
  const result = await page.evaluate(async (depth) => {
    const [game, crew, config, art, rendering] = await Promise.all([
      '/src/game/createGame.ts', '/src/game/phase5.ts', '/src/game/config.ts', '/src/render/assets/discoveryArt.ts', '/src/render/gameRenderer.ts',
    ].map((url) => import(url)));
    const state = game.createGameState(999); state.meta.runIndex = 2; state.run.scrap = 50000;
    state.run.depth.current = depth; state.run.depth.unlocked = ['D-001', 'D-030', 'D-060', 'D-100', 'D-180', 'D-250', 'D-400'];
    state.run.research.completed = ['CREW_ROUTING', 'CARGO_SCHEDULER']; state.run.porter.enabled = true; crew.unlockCrewOperations(state);
    // Explicitly activate the earlier porter as a separate ownership renderer case.
    state.run.porter.enabled = true; state.run.porter.x = 195; state.run.porter.state = 'IDLE';
    const item = (kind: string, quality = 'NORMAL') => ({ ...config.LOOT[kind], id: kind, kind, quality, x: 100, y: 207, originDepth: depth });
    state.run.floors[depth].loot = [item('STONE', 'PURE')];
    state.run.character.carried = [item('IRON', 'FINE')]; state.run.character.x = 165;
    state.run.porter.carried = [item('COPPER', 'PURE')];
    const member = state.run.phase5.crew.members[0]; member.state = 'IDLE'; member.body.x = 330; member.body.carried = [item('GOLD_NUGGET')];
    const hidden = item('TRILOBITE'); hidden.specimen = { grade: 'PRISTINE', value: 126 };
    state.run.floors[depth].cargo = [hidden];
    state.run.elevator.cargo = [item('CRYSTAL_MEMORY')];
    state.run.logistics.lines = [{ id: 'test-line', type: 'RAIL', depth, from: 'stop', to: 'hub', state: 'READY', capacity: 12, priority: 'ANY', buildProgress: 1,
      requiredBuildProgress: 1, inputBuffer: [item('PROSPECTOR_LENS')], outputBuffer: [], maxInputWeight: 20, maxOutputWeight: 20, jamReason: null }];
    state.run.logistics.railCarts = [{ id: 'test-cart', lineId: 'test-line', position: 0.5, state: 'IDLE_AT_STOP', stateTimer: 0, cargo: [item('CORE_FRAGMENT')] }];
    state.run.logistics.cargoHubs = [{ id: 'test-hub', depth, buffer: [item('GEM')], maxWeight: 20 }];
    state.run.logistics.freightCage.state = 'IDLE'; state.run.logistics.freightCage.cargo = [item('ANCIENT_TOOL_CRATE')];
    state.run.deepAutomation.bores = [{ id: 'test-bore', depth, siteId: state.run.floors[depth].nodes[0].id, state: 'IDLE', outputBuffer: [item('RAIL_PARTS')],
      targetNodeId: null, cycleProgress: 0, cycleDuration: 1, hitAt: 0.72, damage: 18, maxOutputWeight: 26, connectedLineId: 'test-line', installProgress: 10, requiredInstallProgress: 10 }];
    const canvas = document.createElement('canvas'); canvas.id = 'discovery-owner-probe';
    const renderer = new rendering.GameRenderer(canvas);
    for (let i = 0; i < 100 && !art.discoveryAssets.ready('cargo'); i++) await new Promise((resolve) => setTimeout(resolve, 20));
    if (depth === 'D-001') {
      const manifestUrl = '/src/render/assets/d001Manifest.ts'; const manifest = await import(manifestUrl);
      await Promise.all(Object.values(manifest.d001AssetUrls()).map(async (url) => { const image = new Image(); image.src = String(url); await image.decode(); }));
    }
    const calls: string[] = []; const ctx = canvas.getContext('2d')!; const draw = ctx.drawImage.bind(ctx);
    ctx.drawImage = (...args: Parameters<typeof draw>) => {
      if (args[0] instanceof HTMLImageElement && args[0].src.includes('discovery-cargo.png')) calls.push(`${args[1]}:${args[2]}`);
      return draw(...args);
    };
    renderer.render(state, 2000);
    return { calls, image: canvas.toDataURL(), members: state.run.phase5.crew.members.length };
  }, depth);
  expect(result.members).toBeGreaterThan(0);
  for (const frame of ['stone-pure', 'iron-fine', 'copper-pure', 'gold', 'specimen', 'research', 'relic', 'gem', 'core', 'equipment-crate', 'industrial-crate']) {
    const index = Object.keys(source.cargo.frames).indexOf(frame);
    expect(result.calls, `${depth}: ${frame}`).toContain(`${(index % source.cargo.columns) * source.cargo.width}:${Math.floor(index / source.cargo.columns) * source.cargo.height}`);
  }
  await info.attach(`owners-${depth}`, { body: Buffer.from(result.image.split(',')[1]!, 'base64'), contentType: 'image/png' });
});
