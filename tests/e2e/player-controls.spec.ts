import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, LootStack } from '../../src/game/types';
import { createD001Nodes } from '../../src/game/config';
const SCRAP_X = createD001Nodes()[0]!.x;


async function seed(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
}
function atVein(): GameState {
  const state = createGameState(52001);
  state.run.character.x = (SCRAP_X + 13);
  state.run.character.state = 'MINING';
  state.run.character.targetNodeId = 'scrap-ledge';
  return state;
}
function iron(id = 'held', x = SCRAP_X, weight = 2): LootStack {
  return { id, x, y: 206, weight, kind: 'IRON', name: 'Iron', category: 'ORE', rarity: 'COMMON', value: 12, dataValue: 0, coreValue: 0 };
}
async function x(page: Page): Promise<number> { return Number(await page.getByLabel('LOOP SHAFT mining floor').getAttribute('data-player-x')); }
async function swing(page: Page): Promise<void> {
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await page.keyboard.press('Space');
  await expect(canvas).toHaveAttribute('data-swing', 'active');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
}

test('completes the first physical delivery using only keyboard controls', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await canvas.focus();
  await page.keyboard.down('KeyA');
  await expect.poll(() => x(page)).toBeLessThan(SCRAP_X + 20);
  await page.keyboard.up('KeyA');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  for (let i = 0; i < 3; i += 1) await swing(page);
  await expect(canvas).not.toHaveAttribute('data-floor-loot', '0');
  await expect(canvas).toHaveAttribute('data-carried-weight', '0.00');
  await page.keyboard.press('KeyE');
  await expect(canvas).not.toHaveAttribute('data-carried-weight', '0.00');
  await page.keyboard.down('ArrowRight');
  await expect.poll(() => x(page)).toBeGreaterThan(211);
  await page.keyboard.up('ArrowRight');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await page.keyboard.press('KeyE');
  await expect(canvas).toHaveAttribute('data-carried-weight', '0.00');
  await expect(page.getByRole('button', { name: 'SEND', exact: true })).toBeEnabled();
  await page.keyboard.press('KeyF');
  await expect(canvas).toHaveAttribute('data-elevator-state', 'ASCENDING');
  await page.keyboard.down('ArrowLeft');
  const start = await x(page);
  await expect.poll(() => x(page)).toBeLessThan(start - 5);
  await page.keyboard.up('ArrowLeft');
  await expect(page.getByTestId('resource-status')).toContainText(/SCRAP [1-9]/, { timeout: 15_000 });
});

test('holding Space or its OS repeat does not become unpaid Auto Swing', async ({ page }) => {
  await seed(page, atVein());
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await canvas.focus();
  await page.keyboard.down('Space');
  await expect(canvas).toHaveAttribute('data-swing', 'active');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  for (let i = 0; i < 8; i += 1) await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await expect(page.getByTestId('scene-detail')).toContainText('HP 20/30');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('scene-detail')).toContainText('HP 20/30');
});

test('Tab, window blur, and Escape release movement instead of leaving stuck keys', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await canvas.focus();
  await page.keyboard.down('KeyD');
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.keyboard.press('Tab');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await page.keyboard.up('KeyD');
  let stopped = await x(page);
  await page.waitForTimeout(250);
  expect(await x(page)).toBe(stopped);
  await canvas.focus();
  await page.keyboard.down('KeyA');
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  stopped = await x(page);
  await page.waitForTimeout(250);
  expect(await x(page)).toBe(stopped);
  await page.keyboard.up('KeyA');
  await page.keyboard.down('KeyD');
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.keyboard.press('Escape');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await page.keyboard.up('KeyD');
});

test('native button focus keeps Space activation without also mining', async ({ page }) => {
  const state = atVein();
  state.run.scrap = 200;
  await seed(page, state);
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * 200 / 480, box.y + box.height * 209 / 270);
  const dialog = page.getByRole('dialog', { name: 'Workshop' });
  await dialog.getByRole('button', { name: 'Runner Boots', exact: true }).click();
  await expect(dialog).toContainText('Walk speed');
  await expect(dialog.getByRole('button', { name: /Buy Runner Boots/ })).toBeEnabled();
  const steel = dialog.getByRole('button', { name: 'Steel Pick', exact: true });
  await steel.click();
  await dialog.getByRole('button', { name: /Buy Steel Pick/ }).focus();
  await page.keyboard.press('Space');
  await expect(steel).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog).toContainText('Steel Pick equipped');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await canvas.focus();
  await swing(page);
  // Only this explicit canvas key performs a swing, now using the purchased tool.
  await expect(page.getByTestId('scene-detail')).toContainText('HP 14/30');
});

test('a full pack still allows movement and mining while pickup explains the limit', async ({ page }) => {
  const state = atVein();
  state.run.character.carried = [iron('full-pack', SCRAP_X, 8)];
  state.run.floors['D-001'].loot.push(iron('extra'));
  await seed(page, state);
  await page.goto('/');
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await expect(page.getByRole('button', { name: 'PICK UP', exact: true })).toBeDisabled();
  await expect(page.getByTestId('pack-status')).toContainText('PACK FULL');
  await canvas.focus();
  await swing(page);
  await page.keyboard.down('KeyD');
  await expect.poll(() => x(page)).toBeGreaterThan(137);
  await page.keyboard.up('KeyD');
  await expect(canvas).toHaveAttribute('data-carried-weight', '8.00');
  await expect(canvas).toHaveAttribute('data-floor-loot', '1');
});

test('pointer capture cancellation stops a held direction button', async ({ page }) => {
  await page.goto('/');
  const button = page.getByRole('button', { name: 'Walk right', exact: true });
  const box = (await button.boundingBox())!;
  const canvas = page.getByLabel('LOOP SHAFT mining floor');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await button.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', bubbles: true });
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await page.mouse.up();
  const stopped = await x(page);
  await page.waitForTimeout(250);
  expect(await x(page)).toBe(stopped);
});

test.describe('compact touch controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('picks up, returns and sends with visible touch controls', async ({ page }) => {
    const state = atVein();
    state.run.floors['D-001'].loot.push(iron());
    await seed(page, state);
    await page.goto('/');
    const canvas = page.getByLabel('LOOP SHAFT mining floor');
    await page.getByRole('button', { name: 'PICK UP', exact: true }).tap();
    await expect(canvas).toHaveAttribute('data-carried-weight', '2.00');
    await page.getByRole('button', { name: 'RETURN', exact: true }).tap();
    const send = page.getByRole('button', { name: 'SEND', exact: true });
    await expect(send).toBeEnabled({ timeout: 10_000 });
    await send.tap();
    await expect(canvas).toHaveAttribute('data-elevator-state', 'ASCENDING');
    const controls = page.locator('.canvas-hit');
    for (const button of await controls.all()) {
      const box = (await button.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await test.info().attach('touch-controls', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  });
});
