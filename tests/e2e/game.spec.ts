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

test('keeps D-001 operable when individual image targets fail to load', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  for (const file of [
    'player-body-atlas.png', 'node-scrap-ledge-atlas.png', 'elevator-rope-tile.png',
    'central-elevator-atlas.png', 'shaft-surface-junction.png', 'shaft-bottom-junction-atlas.png',
  ]) await page.route(`**/${file}`, (route) => route.abort());
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * (118 / 480);
  const y = box!.y + box!.height * (201 / 270);
  await page.mouse.move(x, y);
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MINE' })).toBeEnabled({ timeout: 10_000 });
  expect(pageErrors).toEqual([]);
});

test('keeps NPC and Cargo paths visible and operable when their image groups fail independently', async ({ page }) => {
  const state = createGameState(9100);
  state.run.porter.enabled = true;
  state.run.porter.state = 'FIND_LOOT';
  state.run.floors['D-001'].loot.push({
    id: 'fallback-cargo', kind: 'COPPER', name: 'Copper', rarity: 'UNCOMMON', category: 'ORE',
    weight: 1.7, value: 18, dataValue: 0, coreValue: 0, x: 300, y: 206, originDepth: 'D-001',
  });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: serializeGameState(state),
  });
  const failed = [
    'npc-porter-atlas.png', 'npc-crew-miner-atlas.png', 'npc-crew-porter-atlas.png',
    'npc-engineer-atlas.png', 'cargo-items-atlas.png',
  ];
  for (const file of failed) await page.route(`**/${file}`, (route) => route.abort());
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');

  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * (118 / 480);
  const y = box!.y + box!.height * (201 / 270);
  await page.mouse.click(x, y);
  await expect(page.getByRole('heading', { name: 'Scrap Ledge' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'MINE' })).toBeEnabled({ timeout: 10_000 });
  expect(pageErrors).toEqual([]);
});

test('opens the D-001 shaft bottom only after EXTEND D-030 succeeds', async ({ page }) => {
  const state = createGameState(9102);
  state.run.scrap = 5_000;
  state.run.porter.enabled = true;
  state.run.automation.autoDispatch.unlocked = true;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_KEY,
    value: serializeGameState(state),
  });
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * (240 / 480), box!.y + box!.height * (190 / 270));
  await expect(page.getByRole('heading', { name: 'Central Elevator' })).toBeVisible();
  const extend = page.getByRole('button', { name: /EXTEND D-030/ });
  await expect(extend).toBeEnabled();
  await extend.click();
  await expect(page.getByRole('button', { name: /EXTEND D-030/ })).toHaveCount(0);
  await expect(page.locator('.context-meta')).toContainText(/Priority transport|Use SEND/);
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
