import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';

async function clickWorld(page: Page, x: number, y: number): Promise<void> {
  const box = await page.getByLabel('LOOP SHAFT mining floor').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width * x / 480, box!.y + box!.height * y / 270);
}

async function swing(page: Page): Promise<void> {
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await page.keyboard.press('Space');
  await expect(canvas).toHaveAttribute('data-swing', 'active');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
}

test('guides a new game through optional pickup, return, and first physical delivery', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('scene-detail')).toContainText('Scrap Ledge · click or tap');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await expect(canvas).toHaveAttribute('data-player-state', 'MINING', { timeout: 10_000 });
  await expect(page.getByTestId('scene-detail')).toContainText('clicking / tapping the vein again, pressing Space, or using MINE');
  for (let index = 0; index < 3; index += 1) await swing(page);
  await expect(canvas).not.toHaveAttribute('data-floor-loot', '0');
  await expect(canvas).toHaveAttribute('data-carried-weight', '0.00');
  await expect(page.getByTestId('scene-detail')).toContainText('collect it later');
  await page.keyboard.press('KeyE');
  await expect(canvas).not.toHaveAttribute('data-carried-weight', '0.00');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await expect(page.getByTestId('scene-detail')).toContainText('Keep mining with cargo');
  await page.getByRole('button', { name: 'RETURN', exact: true }).click();
  await expect(page.getByRole('button', { name: 'SEND', exact: true })).toBeEnabled({ timeout: 10_000 });
  await expect(canvas).toHaveAttribute('data-carried-weight', '0.00');
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await page.keyboard.press('KeyF');
  await expect(canvas).toHaveAttribute('data-elevator-state', 'ASCENDING');
  await expect(page.getByTestId('scene-detail')).toContainText('carrying cargo to Surface');
  await expect(page.getByTestId('resource-status')).toContainText(/SCRAP [1-9]/, { timeout: 15_000 });
});

test('selects, moves to, and mines a visible node through the Canvas controls', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  await expect(page.getByTestId('scene-title')).toHaveText('D-001 · SHAFT');
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await expect(canvas).toHaveAttribute('data-player-state', 'MINING', { timeout: 10_000 });
  await swing(page);
  await expect(page.getByTestId('scene-detail')).toContainText('HP 20/30');
  await page.reload();
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await expect(page.getByTestId('scene-detail')).toContainText('HP 20/30');
  expect(pageErrors).toEqual([]);
});

test('uses a pointer cursor only on targets and selects the hovered target', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 20 / 480, box!.y + box!.height * 100 / 270);
  await expect(canvas).toHaveCSS('cursor', 'default');
  await expect(canvas).not.toHaveAttribute('data-interaction-target');
  const x = box!.x + box!.width * 118 / 480;
  const y = box!.y + box!.height * 214 / 270;
  await page.mouse.move(x, y);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
  await page.mouse.click(x, y);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
  await page.mouse.move(box!.x - 2, box!.y - 2);
  await expect(canvas).not.toHaveAttribute('data-interaction-target');
  await canvas.dispatchEvent('pointermove', { pointerType: 'pen', clientX: x, clientY: y, bubbles: true });
  await expect(canvas).toHaveAttribute('data-interaction-target', 'node:scrap-ledge');
});

test('keeps D-001 operable when individual image targets fail to load', async ({ page }) => {
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  for (const file of ['player-body-atlas.png', 'node-scrap-ledge-atlas.png', 'elevator-rope-tile.png',
    'central-elevator-atlas.png', 'shaft-surface-junction.png', 'shaft-bottom-junction-atlas.png']) {
    await page.route(`**/${file}`, (route) => route.abort());
  }
  await page.goto('/');
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await expect(page.getByRole('button', { name: 'MINE', exact: true })).toBeEnabled({ timeout: 10_000 });
  expect(pageErrors).toEqual([]);
});

test('keeps NPC and Cargo paths operable when their image groups fail independently', async ({ page }) => {
  const state = createGameState(9100);
  state.run.porter.enabled = true;
  state.run.porter.state = 'FIND_LOOT';
  state.run.floors['D-001'].loot.push({ id: 'fallback-cargo', kind: 'COPPER', name: 'Copper', rarity: 'UNCOMMON', category: 'ORE',
    weight: 1.7, value: 18, dataValue: 0, coreValue: 0, x: 300, y: 206, originDepth: 'D-001' });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
  for (const file of ['npc-porter-atlas.png', 'npc-crew-miner-atlas.png', 'npc-crew-porter-atlas.png', 'npc-engineer-atlas.png', 'cargo-items-atlas.png']) {
    await page.route(`**/${file}`, (route) => route.abort());
  }
  const pageErrors: Error[] = [];
  page.on('pageerror', (error) => pageErrors.push(error));
  await page.goto('/');
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await expect(page.getByRole('button', { name: 'MINE', exact: true })).toBeEnabled({ timeout: 10_000 });
  expect(pageErrors).toEqual([]);
});

test('keeps Bore hover and selected context aligned in a later-game state', async ({ page }) => {
  const state = createGameState(9101);
  state.run.depth.current = 'D-400';
  state.run.depth.unlocked.push('D-250', 'D-400');
  state.run.deepAutomation.bores.push({ id: 'bore-echo-pocket', depth: 'D-400', siteId: 'echo-pocket', targetNodeId: 'echo-pocket',
    state: 'JAMMED', cycleProgress: 0, cycleDuration: 1.35, hitAt: 0.72, damage: 18, outputBuffer: [], maxOutputWeight: 26,
    connectedLineId: null, installProgress: 10, requiredInstallProgress: 10 });
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = (await canvas.boundingBox())!;
  const x = box.x + box.width * 364 / 480; const y = box.y + box.height * 190 / 270;
  await page.mouse.move(x, y);
  await expect(canvas).toHaveAttribute('data-interaction-target', 'bore-console:bore-echo-pocket');
  await page.mouse.click(x, y);
  await expect(canvas).not.toHaveAttribute('data-interaction-target');
  const facility = page.getByRole('dialog', { name: 'DEEP LOGISTICS' });
  await expect(facility).toBeVisible();
  await expect(facility).toHaveAttribute('data-selected-item', 'echo-pocket');
  await expect(facility).toContainText('JAMMED');
});

test.describe('touch selection', () => {
  test.use({ hasTouch: true });
  test('reaches the same node context without hover', async ({ page }) => {
    await page.goto('/');
    const canvas = page.getByLabel('LOOP SHAFT mining floor');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    const position = { x: box!.width * 118 / 480, y: box!.height * 214 / 270 };
    await canvas.tap({ position });
    await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
    await expect(page.getByTestId('scene-detail')).toContainText(/Moving to Scrap Ledge|Mine by clicking/);
    await expect(canvas).not.toHaveAttribute('data-interaction-target');
    await expect(canvas).toHaveAttribute('data-player-state', 'MINING', { timeout: 10_000 });
    await canvas.tap({ position });
    await expect(page.getByTestId('scene-detail')).toContainText('HP 20/30');
  });
});
