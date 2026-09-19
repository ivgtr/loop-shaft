import { expect, test } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';

test('guides a new game through the first manual delivery and Scrap gain', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.context-meta')).toContainText('Scrap Ledge · click or tap');

  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const point = (x: number, y: number) => ({
    x: box!.x + box!.width * (x / 480),
    y: box!.y + box!.height * (y / 270),
  });

  await page.mouse.click(point(118, 201).x, point(118, 201).y);
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  const mine = page.getByRole('button', { name: 'MINE' });
  await expect(mine).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('.context-meta')).toContainText('clicking / tapping the vein again, pressing Space, or using MINE');

  for (let swing = 0; swing < 3; swing += 1) {
    await expect(mine).toBeEnabled({ timeout: 3_000 });
    await page.keyboard.press('Space');
  }

  await expect(page.locator('.context-meta')).toContainText('Click or tap the loaded Elevator', { timeout: 15_000 });
  await page.mouse.click(point(240, 190).x, point(240, 190).y);
  await expect(page.getByRole('heading', { name: 'Central Elevator' })).toBeVisible();
  await expect(page.locator('.context-meta')).toContainText('Use SEND to dispatch');
  await page.getByRole('button', { name: 'SEND', exact: true }).click();
  await expect(page.locator('.context-meta')).toContainText('carrying cargo to Surface');
  await expect(page.locator('.hud-left strong').first()).toContainText(/SCRAP [1-9]/, { timeout: 15_000 });
  await expect(page.locator('.context-meta')).not.toContainText('Use SEND to dispatch');
});

test('selects, moves to, and mines a visible node through the React UI', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'D-001 · SHAFT' })).toBeVisible();
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * (118 / 480), box!.y + box!.height * (201 / 270));

  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await page.getByRole('button', { name: 'MOVE' }).click();
  const mine = page.getByRole('button', { name: 'MINE' });
  await expect(mine).toBeEnabled({ timeout: 10_000 });
  await page.keyboard.press('Space');
  await expect(page.locator('.context-meta')).not.toContainText('HP 118/118', { timeout: 3_000 });

  await page.reload();
  const restoredBox = await canvas.boundingBox();
  expect(restoredBox).not.toBeNull();
  await page.mouse.click(restoredBox!.x + restoredBox!.width * (118 / 480), restoredBox!.y + restoredBox!.height * (201 / 270));
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await expect(page.locator('.context-meta')).not.toContainText('HP 118/118');
  expect(pageErrors).toEqual([]);
});

test('uses a pointer cursor only on targets and selects the hovered target', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + box!.width * (20 / 480), box!.y + box!.height * (100 / 270));
  await expect(canvas).toHaveCSS('cursor', 'default');
  await expect(canvas).not.toHaveAttribute('data-interaction-target');

  const x = box!.x + box!.width * (118 / 480);
  const y = box!.y + box!.height * (201 / 270);
  await page.mouse.move(x, y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');

  await page.mouse.move(box!.x - 2, box!.y - 2);
  await expect(canvas).not.toHaveAttribute('data-interaction-target');
  await canvas.dispatchEvent('pointermove', { pointerType: 'pen', clientX: x, clientY: y, bubbles: true });
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
});

test('keeps Bore hover and selected context aligned in a later-game state', async ({ page }) => {
  const state = createGameState(9101);
  state.run.depth.current = 'D-400';
  state.run.depth.unlocked.push('D-400');
  state.run.deepAutomation.bores.push({
    id: 'bore-echo-pocket', depth: 'D-400', siteId: 'echo-pocket', targetNodeId: 'echo-pocket',
    state: 'JAMMED', cycleProgress: 0, cycleDuration: 1.35, hitAt: 0.72, damage: 18,
    outputBuffer: [], maxOutputWeight: 26, connectedLineId: null, installProgress: 10, requiredInstallProgress: 10,
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: serializeGameState(state),
  });
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * (364 / 480);
  const y = box!.y + box!.height * (190 / 270);

  await page.mouse.move(x, y);
  await expect(canvas).toHaveAttribute('data-interaction-target', 'bore-console:bore-echo-pocket');
  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: 'Remote Bore Console' })).toBeVisible();
  await expect(page.locator('.context-meta')).toContainText('JAMMED');
});

test.describe('touch selection', () => {
  test.use({ hasTouch: true });

  test('reaches the same node context without hover', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByLabel('LOOP SHAFT mining floor');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.tap({ position: { x: box!.width * (118 / 480), y: box!.height * (201 / 270) } });
    await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
    await expect(page.locator('.context-meta')).toContainText(/Moving to Scrap Ledge|Mine by clicking/);
    await expect(canvas).not.toHaveAttribute('data-interaction-target');

    const mine = page.getByRole('button', { name: 'MINE' });
    await expect(mine).toBeEnabled({ timeout: 10_000 });
    await canvas.tap({ position: { x: box!.width * (118 / 480), y: box!.height * (201 / 270) } });
    await expect(page.locator('.context-meta')).not.toContainText('HP 30/30', { timeout: 3_000 });
  });
});
