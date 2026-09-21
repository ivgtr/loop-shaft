import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, LootStack } from '../../src/game/types';

async function seed(page: Page, state: GameState): Promise<void> {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, { key: SAVE_KEY, value: serializeGameState(state) });
}
async function clickWorld(page: Page, x: number, y: number): Promise<void> {
  const box = (await page.locator('.game-canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * x / 480, box.y + box.height * y / 270);
}
async function saved(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}
function atVein(): GameState {
  const state = createGameState(9301);
  state.run.character.x = 131;
  state.run.character.state = 'IDLE';
  state.run.character.targetNodeId = null;
  return state;
}
function ore(id: string, value: number): LootStack {
  return { id, x: 131, y: 206, kind: 'GOLD_NUGGET', name: 'Gold Nugget', category: 'VALUABLE', rarity: 'RARE',
    weight: .8, value, dataValue: 0, coreValue: 0, originDepth: 'D-001' };
}
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Workshop', exact: true });
const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);

async function assertContained(page: Page): Promise<void> {
  const box = (await page.locator('.game-shell').boundingBox())!;
  for (const button of await dialog(page).getByRole('button').all()) {
    const rect = (await button.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(box.x);
    expect(rect.y).toBeGreaterThanOrEqual(box.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(box.x + box.width);
    expect(rect.y + rect.height).toBeLessThanOrEqual(box.y + box.height);
  }
}

test('first delivery funds an in-world purchase without using the outside controls', async ({ page }, testInfo) => {
  // Seed physical finds, NOT money. Mining itself is covered by game.spec.ts and player-controls.spec.ts.
  const state = atVein(); state.run.floors['D-001'].loot.push(ore('gold-a', 82), ore('gold-b', 82));
  await seed(page, state); await page.goto('/');
  const canvas = page.locator('.game-canvas');
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0 ·');
  await ui(page, 'interact').click();
  await expect(canvas).toHaveAttribute('data-carried-weight', '1.60');
  await clickWorld(page, 240, 213);
  await expect(ui(page, 'send')).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0 ·');
  await ui(page, 'send').click();
  await expect(canvas).toHaveAttribute('data-elevator-state', 'ASCENDING');
  await expect(ui(page, 'goal')).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
  await expect(dialog(page)).toHaveCount(0); // Guidance does not force the window open.
  const stage = await page.locator('.game-shell').boundingBox();
  await ui(page, 'goal').click();
  await expect(dialog(page)).toContainText('Hit power 10 → 16');
  await expect(page.locator('.legacy-controls, .context-strip')).toHaveCount(0);
  await assertContained(page);
  await testInfo.attach('workshop-before-purchase', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'buy').click();
  await expect(dialog(page).getByRole('status')).toContainText('Steel Pick equipped');
  await expect(ui(page, 'item-upgrade-tool')).toHaveAttribute('aria-pressed', 'true');
  await expect(ui(page, 'buy')).toBeDisabled();
  expect((await saved(page)).run.scrap).toBe(74);
  expect((await saved(page)).run.tool.level).toBe(2);
  expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
  await testInfo.attach('workshop-after-purchase', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'close').click();
  await expect(canvas).toBeFocused();
  await expect(ui(page, 'goal')).toHaveAccessibleName('Inspect next workshop upgrade');
  await clickWorld(page, 118, 214);
  await expect(canvas).toHaveAttribute('data-player-state', 'MINING');
  await page.keyboard.press('Space');
  await expect(canvas).toHaveAttribute('data-swing', 'active');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await expect(page.getByTestId('scene-detail')).toContainText('HP 14/30');
  await page.reload();
  await expect(dialog(page)).toHaveCount(0);
  expect((await saved(page)).run.tool.level).toBe(2);
});

test('keeps locked items inspectable, focus trapped, and all world inputs blocked', async ({ page }) => {
  const state = atVein(); state.run.scrap = 1000;
  await seed(page, state); await page.goto('/');
  const canvas = page.locator('.game-canvas');
  // Selection is deliberately not restored by save loading; establish it through the real UI.
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await canvas.focus(); await page.keyboard.down('KeyD');
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await ui(page, 'goal').click();
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  const x = await canvas.getAttribute('data-player-x');
  await page.keyboard.up('KeyD');
  await ui(page, 'item-upgrade-boots').click();
  await expect(ui(page, 'buy')).toBeDisabled();
  await expect(dialog(page)).toContainText('REQUIRES STEEL PICK');
  await ui(page, 'item-upgrade-tool').click();
  // Backdrop must consume the click without clearing selection or moving to this vein.
  await clickWorld(page, 440, 214);
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyF'); await page.keyboard.press('KeyA');
  await expect(canvas).toHaveAttribute('data-player-x', x!);
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await ui(page, 'close').focus(); await page.keyboard.press('Shift+Tab');
  await expect(ui(page, 'buy')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(ui(page, 'close')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(canvas).toBeFocused();
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await page.keyboard.down('KeyA');
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.keyboard.up('KeyA');
});

test('purchasing Auto Swing neither repeats on held Enter nor starts a hidden mining job', async ({ page }) => {
  const state = atVein(); state.run.scrap = 1000; state.run.tool.level = 2; state.run.tool.damage = 16;
  state.run.boots.level = 2; state.run.stats.manualSwings = 6;
  await seed(page, state); await page.goto('/');
  await clickWorld(page, 118, 214);
  await expect(page.getByTestId('scene-detail')).toContainText('HP 30/30');
  await ui(page, 'goal').click();
  await expect(dialog(page)).toContainText('Manual swings → repeated swings');
  await ui(page, 'buy').focus(); await page.keyboard.down('Enter');
  await expect(ui(page, 'buy')).toHaveAccessibleName('Switch Auto Swing OFF');
  for (let i = 0; i < 6; i++) await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(ui(page, 'buy')).toHaveAccessibleName('Switch Auto Swing OFF');
  await page.waitForTimeout(650);
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-swing', 'ready');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-player-state', 'IDLE');
  expect((await saved(page)).run.scrap).toBe(820);
  await ui(page, 'close').click();
  await expect(page.getByTestId('scene-detail')).toContainText('HP 30/30');
});

test('keeps an ascending shipment running and reflects funds while inspecting the workshop', async ({ page }) => {
  const state = atVein(); state.run.elevator.cargo = [ore('shipment', 82)];
  state.run.elevator.state = 'ASCENDING'; state.run.elevator.position = .3;
  await seed(page, state); await page.goto('/'); await clickWorld(page, 202, 216);
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText('NEED 90 MORE SCRAP');
  await expect(dialog(page)).toContainText('NEED 8 MORE SCRAP', { timeout: 15_000 });
  await expect(dialog(page)).toBeVisible();
  await expect(page.locator('.game-canvas')).not.toHaveAttribute('data-elevator-state', 'ASCENDING');
});

test('offers all recovered equipment, including items older than the last eight', async ({ page }) => {
  const state = atVein();
  for (let i = 0; i < 12; i++) state.run.phase5.equipment.inventory.push({ id: `gear-${i}`, baseId: 'ancient-pick',
    name: `Recovered pick ${i}`, slot: 'TOOL', rarity: 'RARE', level: 1, affixes: [], originDepth: 'D-180' });
  await seed(page, state); await page.goto('/'); await clickWorld(page, 202, 216);
  await ui(page, 'tab-recovered').click();
  await ui(page, 'buy').click(); // FINDS opens the common recovered equipment inspector.
  await expect(ui(page, 'station-item-gear-0')).toBeVisible();
  await ui(page, 'station-activate').click();
  expect((await saved(page)).run.phase5.equipment.equippedPlayer.TOOL).toBe('gear-0');
  await ui(page, 'station-previous').click();
  await expect(ui(page, 'station-item-gear-11')).toHaveAttribute('aria-pressed', 'true');
  await ui(page, 'station-item-gear-11').focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(ui(page, `station-item-gear-${i}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(ui(page, `station-item-gear-${i}`)).toBeFocused();
  }
  await expect(page.getByRole('dialog', { name: 'RECOVERED GEAR', exact: true })).toContainText('Base hit:');

});

for (const width of [320, 390]) {
  test.describe(`workshop touch layout at ${width}px`, () => {
    test.use({ hasTouch: true, viewport: { width, height: 844 } });
    test('keeps a fixed viewport and usable controls before, during and after purchase', async ({ page }, testInfo) => {
      const state = atVein(); state.run.scrap = 1000;
      await seed(page, state); await page.goto('/');
      const stage = await page.locator('.game-shell').boundingBox();
      const world = await page.locator('.game-canvas').boundingBox();
      await ui(page, 'goal').tap();
      await assertContained(page);
      await ui(page, 'next').tap();
      await expect(dialog(page)).toContainText('REQUIRES STEEL PICK');
      await ui(page, 'previous').tap();
      await ui(page, 'buy').tap();
      await expect(dialog(page).getByRole('status')).toContainText('Steel Pick equipped');
      await expect(ui(page, 'selected')).toHaveAccessibleName('Steel Pick');
      expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
      expect(await page.locator('.game-canvas').boundingBox()).toEqual(world);
      await testInfo.attach(`workshop-${width}px`, { body: await page.screenshot(), contentType: 'image/png' });
      await ui(page, 'close').tap();
      await expect(dialog(page)).toHaveCount(0);
      expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  });
}
