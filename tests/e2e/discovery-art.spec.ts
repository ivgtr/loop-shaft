import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGameState } from '../../src/game/createGame';
import { applyOreQuality, createProspectingState, floorProspects } from '../../src/game/prospecting';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, ProspectSignal } from '../../src/game/types';
import { DISCOVERY_ART } from '../../src/render/discoveryArt';
import { ORE_ART } from '../../src/render/cargoSprites';
import { PLAYER_LAMP_ANCHORS } from '../../src/render/d001ImageRenderer';
import { D001_ASSET_VERSION } from '../../src/render/assets/d001Manifest';
import type { PixelSprite } from '../../src/render/pixelSprite';
import { loot } from '../fixtures/discovery';

async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, data }) => localStorage.setItem(key, data), { key: SAVE_KEY, data: serializeGameState(state) });
  await page.goto('/');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', state.run.depth.current);
}
/** Inspect actual world-canvas pixels, not a DOM label or an independently rendered test image. */
async function matchingPixels(page: Page, sprite: PixelSprite, x: number, y: number) {
  return page.evaluate(({ sprite, x, y }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('.game-canvas')!;
    const pixels = canvas.getContext('2d')!.getImageData(x, y, sprite.width, sprite.height).data;
    let matches = 0, expected = 0;
    for (const run of sprite.runs) {
      const rgb = run.color.slice(1).match(/../g)!.map((hex) => parseInt(hex, 16));
      for (let dx = 0; dx < run.width; dx++) {
        const offset = (run.y * sprite.width + run.x + dx) * 4; expected++;
        if (rgb.every((value, index) => pixels[offset + index] === value) && pixels[offset + 3] === 255) matches++;
      }
    }
    return matches / expected;
  }, { sprite, x, y });
}

for (const width of [390, 1280]) for (const images of [true, false]) {
  test(`quality silhouettes reach the real floor canvas at ${width}px / images ${images}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    if (!images) await page.route('**/assets/d001/runtime/*.png*', (route) => route.abort());
    const state = createGameState(220);
    state.run.floors['D-001'].loot = (['NORMAL', 'FINE', 'PURE'] as const).map((quality, index) => {
      const item = loot('COPPER', `quality-${index}`); applyOreQuality(item, quality); item.x = 46 + index * 28; return item;
    });
    await seed(page, state);
    for (const [index, quality] of (['NORMAL', 'FINE', 'PURE'] as const).entries()) {
      await expect.poll(() => matchingPixels(page, ORE_ART.COPPER[quality], 40 + index * 28, 213)).toBe(1);
    }
    await info.attach(`quality-${width}-${images ? 'images' : 'fallback'}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

function traceState(signal: ProspectSignal, stage: 'SEALED' | 'EXPOSED' | 'SPENT') {
  const depth = signal === 'RESEARCH' ? 'D-060' : 'D-001';
  for (let seed = 1; seed < 200; seed++) {
    const state = createGameState(seed); const floor = state.run.floors[depth];
    const plan = floorProspects(floor)[0]!; if (plan.signal !== signal) continue;
    floor.prospecting = { ...createProspectingState(), breaks: 6 };
    floor.prospecting.prospectWork[0] = stage === 'SEALED' ? 0 : stage === 'EXPOSED' ? 1 : plan.required;
    const node = floor.nodes.find((entry) => entry.id === plan.nodeId)!;
    // Ordinary rock can be absent; finite landmark art must remain.
    node.hp = 0; node.respawnTimer = 30;
    state.run.depth.current = depth; state.meta.bestDepth = depth;
    state.run.depth.unlocked = depth === 'D-001' ? ['D-001'] : ['D-001', 'D-030', 'D-060'];
    state.run.anomaly.selected = 'LIVING_ROCK';
    return { state, x: node.x - 10, y: node.y - 30 + (depth === 'D-001' ? 13 : 0) };
  }
  throw new Error(`No trace fixture for ${signal}`);
}
for (const signal of ['METAL', 'FOSSIL', 'RESEARCH'] as const) for (const stage of ['SEALED', 'EXPOSED', 'SPENT'] as const) {
  test(`real ${signal} ${stage} landmark survives an empty ordinary node`, async ({ page }, info) => {
    const { state, x, y } = traceState(signal, stage); await seed(page, state);
    await expect.poll(() => matchingPixels(page, DISCOVERY_ART[signal][stage], x, y)).toBe(1);
    await info.attach(`${signal}-${stage}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('recovered tool atlas changes heads only and is empty outside real mining poses', async ({ page }) => {
  await page.goto('/');
  const masks = JSON.parse(readFileSync(new URL('../../art/d001/generation-spec.json', import.meta.url), 'utf8')).playerOwnership.toolMasks;
  const result = await page.evaluate(async ({ version, masks }) => {
    async function load(name: string) {
      const image = new Image(); image.src = `assets/d001/runtime/${name}.png?v=${version}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(image, 0, 0);
      return { width: image.width, data: ctx.getImageData(0, 0, image.width, image.height).data };
    }
    const source = await load('player-tool-atlas'); const target = await load('player-recovered-tools-atlas');
    let nonMining = 0, alteredHandle = 0, invalidAlpha = 0;
    const signatures = [0, 0, 0, 0];
    for (let bank = 0; bank < 4; bank++) for (let y = 0; y < 320; y++) for (let x = 0; x < 320; x++) {
      const row = Math.floor(y / 40), frame = Math.floor(x / 40);
      const a = (y * source.width + 320 + x) * 4, b = (y * target.width + bank * 320 + x) * 4;
      const alpha = target.data[b + 3]; if (alpha !== 0 && alpha !== 255) invalidAlpha++;
      if (row !== 2 && row !== 3 && alpha) nonMining++;
      const rect = (row === 2 ? masks.headRects['mine-ready'] : row === 3 ? masks.headRects['mine-swing'] : [])?.[frame];
      const head = rect && x % 40 >= rect[0] && x % 40 < rect[0] + rect[2] && y % 40 >= rect[1] && y % 40 < rect[1] + rect[3];
      if (!head && (source.data[a + 3] !== alpha || alpha && [0, 1, 2].some((c) => source.data[a + c] !== target.data[b + c]))) alteredHandle++;
      if (head && alpha) signatures[bank] += target.data[b] + target.data[b + 1] * 3 + target.data[b + 2] * 7;
    }
    return { nonMining, alteredHandle, invalidAlpha, distinct: new Set(signatures).size };
  }, { version: D001_ASSET_VERSION, masks });
  expect(result).toEqual({ nonMining: 0, alteredHandle: 0, invalidAlpha: 0, distinct: 4 });
});


test('every recovered lamp anchor follows an actual helmet pixel, including collection and swing poses', async ({ page }) => {
  await page.goto('/');
  const mismatches = await page.evaluate(async ({ anchors, version }) => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 320;
    const ctx = canvas.getContext('2d')!;
    for (const layer of ['pack', 'body', 'boots', 'tool', 'helmet']) {
      const image = new Image(); image.src = `assets/d001/runtime/player-${layer}-atlas.png?v=${version}`;
      await image.decode(); ctx.drawImage(image, 0, 0);
    }
    const failures: number[][] = [];
    anchors.forEach((frames, row) => frames.forEach(([x, y], frame) => {
      const pixel = Array.from(ctx.getImageData(frame * 40 + x + 1, row * 40 + y, 1, 1).data);
      if (pixel.join(',') !== '230,160,43,255') failures.push([row, frame]);
    }));
    return failures;
  }, { anchors: PLAYER_LAMP_ANCHORS, version: D001_ASSET_VERSION });
  expect(mismatches).toEqual([]);
});
