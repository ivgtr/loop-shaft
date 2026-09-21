import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import { D001_ASSET_VERSION } from '../../src/render/assets/d001Manifest';

const colors: string[] = JSON.parse(readFileSync(new URL('../../art/d001/palette.json', import.meta.url), 'utf8')).colors;
import { createD001Nodes } from '../../src/game/config';
const SCRAP_X = createD001Nodes()[0]!.x;


test('D-001 PNGs keep their palette, binary alpha and logical dimensions', async ({ page }) => {
  await page.goto('/');
  const dimensions: Record<string, [number, number]> = {
    'background-rock-base': [480, 270], 'background-tunnel-back': [480, 270],
    'background-tunnel-structure': [480, 270], 'background-floor': [480, 270],
    'node-scrap-ledge-atlas': [192, 40], 'node-copper-pocket-atlas': [192, 40],
    'node-fossil-crack-atlas': [192, 40], 'player-body-atlas': [320, 320],
    'player-recovered-tools-atlas': [1280, 320], 'player-helmet-atlas': [320, 320], 'npc-porter-atlas': [320, 320], 'cargo-items-atlas': [144, 10],
  };
  const results = await page.evaluate(async ({ dimensions, colors, version }) => {
    return Promise.all(Object.keys(dimensions).map(async (name) => {
      const image = new Image();
      image.src = new URL(`assets/d001/runtime/${name}.png?v=${version}`, location.href).href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      // Porter already uses the reserved automation pair; retain that identity.
      const allowed = ['npc-porter-atlas', 'player-recovered-tools-atlas'].includes(name) ? colors : colors.slice(0, 30);
      let opaque = 0, invalid = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) continue;
        opaque++;
        const color = `#${Array.from(data.slice(i, i + 3)).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        if (data[i + 3] !== 255 || !allowed.includes(color)) invalid++;
      }
      return { name, dimensions: [image.width, image.height], opaque, invalid,
        cornerAlpha: data[3], chamberAlpha: name === 'background-tunnel-back' ? data[(164 * image.width + 80) * 4 + 3] : null,
        shaftAlpha: name === 'background-tunnel-back' ? data[(180 * image.width + 240) * 4 + 3] : null };
    }));
  }, { dimensions, colors, version: D001_ASSET_VERSION });
  for (const result of results) {
    expect(result.dimensions, result.name).toEqual(dimensions[result.name]);
    expect(result.opaque, result.name).toBeGreaterThan(0);
    expect(result.invalid, result.name).toBe(0);
    if (result.name !== 'background-rock-base') expect(result.cornerAlpha, result.name).toBe(0);
  }
  expect(results.find((result) => result.name === 'background-tunnel-back')).toMatchObject({ chamberAlpha: 255, shaftAlpha: 0 });
});

test('keeps D-001 readable through the first real manual delivery', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1200, height: 820 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-001');
  await expect(page.getByTestId('resource-status')).not.toContainText(/LOCKED|UNBUILT|RESEARCH/);
  const box = await canvas.boundingBox();
  expect(box?.width).toBe(960);
  // Decode the largest changed image before capturing the initial state.
  await page.evaluate(async (version) => {
    const image = new Image(); image.src = `assets/d001/runtime/background-rock-base.png?v=${version}`; await image.decode();
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }, D001_ASSET_VERSION);
  await testInfo.attach('d001-initial', { body: await page.screenshot(), contentType: 'image/png' });
  const point = (x: number, y: number) => ({ x: box!.x + x * 2, y: box!.y + y * 2 });
  await page.mouse.click(point(SCRAP_X, 201).x, point(SCRAP_X, 201).y);
  const mine = page.getByRole('button', { name: 'MINE', exact: true });
  await expect(mine).toBeEnabled({ timeout: 10_000 });
  await page.mouse.move(0, 0);
  await testInfo.attach('d001-mine-ready', { body: await page.screenshot(), contentType: 'image/png' });
  for (let swing = 0; swing < 3; swing++) {
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
    await page.keyboard.press('Space');
    await expect(canvas).toHaveAttribute('data-swing', 'active');
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
  }
  await page.getByRole('button', { name: 'PICK UP', exact: true }).click();
  await expect(canvas).not.toHaveAttribute('data-carried-weight', '0.00');
  await page.getByRole('button', { name: 'RETURN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SEND', exact: true })).toBeEnabled({ timeout: 15_000 });
  await testInfo.attach('d001-loaded', { body: await page.screenshot(), contentType: 'image/png' });
  await page.getByRole('button', { name: 'SEND', exact: true }).click();
  await expect(page.getByTestId('resource-status')).toContainText(/SCRAP [1-9]/, { timeout: 15_000 });
  expect(errors).toEqual([]);
});

test('uses 3x on a large D-001 viewport and preserves later-depth layout and HUD', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.goto('/');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-001');
  expect((await page.locator('.game-canvas').boundingBox())?.width).toBe(1440);
  const state = createGameState(9103);
  state.run.depth.current = 'D-030';
  state.run.depth.unlocked.push('D-030');
  state.meta.bestDepth = 'D-030';
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
  await page.reload();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-030');
  await expect(page.getByTestId('resource-status')).not.toContainText('ENGINEER LOCKED');
  expect((await page.locator('.game-canvas').boundingBox())?.width).toBe(1440);
});
