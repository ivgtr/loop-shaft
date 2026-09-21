import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { LOOT } from '../../src/game/config';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, LootStack } from '../../src/game/types';

const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const saved = (page: Page): Promise<GameState> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: SAVE_KEY, value: serializeGameState(state) });
}
async function selectFar(page: Page) {
  const box = (await page.locator('.game-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 438 / 480, box.y + box.height * 214 / 270);
}

test('shows and consumes the first fossil seam, then credits only physically delivered cargo', async ({ page }, info) => {
  const state = createGameState(12345); state.run.character.x = 425;
  state.run.tool.level = 2; state.run.tool.damage = 16;
  await seed(page, state); await page.goto('/'); await selectFar(page);
  const canvas = page.locator('.game-canvas');
  await expect(page.getByTestId('scene-detail')).toContainText('Trilobite in 1 breaks');
  await expect(canvas).toHaveAttribute('data-player-state', 'MINING');
  for (let i = 0; i < 6; i++) {
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
    await page.keyboard.press('Space');
    await expect(canvas).toHaveAttribute('data-swing', 'active');
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
  }
  await expect(page.getByTestId('scene-detail')).toContainText('Ammonite in 2 breaks');
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0 ·');
  await info.attach('finite-fossil-seam', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'interact').click();
  await expect(canvas).not.toHaveAttribute('data-carried-weight', '0.00');
  await ui(page, 'return').click();
  await expect(ui(page, 'send')).toBeEnabled({ timeout: 10000 });
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0 ·');
  await ui(page, 'send').click();
  await expect.poll(async () => (await saved(page)).meta.collection.entries.find((entry) => entry.kind === 'TRILOBITE')?.discovered, { timeout: 15000 }).toBe(true);
  await page.reload(); await selectFar(page);
  await expect(page.getByTestId('scene-detail')).toContainText('Ammonite in 2 breaks');
  expect((await saved(page)).run.floors['D-001'].nodes[2]!.minedCount).toBe(1);
});

for (const width of [390, 1280]) test(`selects the real priority policy and ships a lone research item at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const state = createGameState(12346);
  state.run.automation.autoDispatch = { unlocked: true, enabled: false };
  const d = LOOT.CRYSTAL_MEMORY;
  const item: LootStack = { id: 'memory', kind: 'CRYSTAL_MEMORY', name: d.name, category: d.category, rarity: d.rarity,
    weight: d.weight, value: d.value, dataValue: d.dataValue!, coreValue: 0, x: 240, y: 210, originDepth: 'D-060' };
  state.run.elevator.cargo.push(item);
  await seed(page, state); await page.goto('/'); await ui(page, 'lift-open').click();
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await expect(ui(page, 'lift-item-dispatch-PRIORITY')).toHaveAttribute('aria-pressed', 'true');
  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('USE PRIORITY');
  await ui(page, 'lift-activate').click();
  expect((await saved(page)).run.automation.dispatchPolicy).toBe('PRIORITY');
  await info.attach(`shipment-policy-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft');
  await expect(ui(page, 'lift-item-relay')).toHaveAttribute('aria-pressed', 'true');
  await ui(page, 'lift-activate').click();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'ASCENDING');
  expect((await saved(page)).run.data).toBe(0);
  await expect.poll(async () => (await saved(page)).run.data, { timeout: 15000 }).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
});
