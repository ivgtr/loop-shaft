import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { DEPTH_ORDER } from '../../src/game/depth';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, LootStack } from '../../src/game/types';
import { createD001Nodes } from '../../src/game/config';
const SCRAP_X = createD001Nodes()[0]!.x;


const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const lift = (page: Page) => page.getByRole('dialog', { name: 'Elevator controls', exact: true });
const ore = (): LootStack => ({ id: 'lift-ore', kind: 'IRON', name: 'Iron', rarity: 'COMMON', category: 'ORE', weight: 2, value: 12, dataValue: 0, coreValue: 0, x: SCRAP_X, y: 210 });
async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
}
function ready(): GameState {
  const state = createGameState(771); state.run.scrap = 5000;
  state.run.porter.enabled = true; state.run.automation.autoDispatch.unlocked = true;
  state.run.stats.playerDeposits = 1; state.run.stats.elevatorTrips = 1;
  return state;
}
async function saved(page: Page): Promise<GameState> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}
async function selectVein(page: Page) {
  const box = (await page.locator('.game-canvas').boundingBox())!;
  await page.mouse.click(box.x + SCRAP_X / 480 * box.width, box.y + 214 / 270 * box.height);
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
}
async function contained(page: Page) {
  const stage = (await page.locator('.game-shell').boundingBox())!;
  const boxes = await Promise.all((await page.locator('.canvas-hit').all()).map(async (b) => ({ id: await b.getAttribute('data-ui-action'), box: (await b.boundingBox())! })));
  for (const { id, box } of boxes) {
    expect(box.width, id!).toBeGreaterThanOrEqual(44); expect(box.height, id!).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(stage.x); expect(box.y).toBeGreaterThanOrEqual(stage.y);
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + .01);
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + .01);
    for (const other of boxes.filter((b) => b.id !== id)) {
      const intersectX = Math.min(box.x + box.width, other.box.x + other.box.width) - Math.max(box.x, other.box.x);
      const intersectY = Math.min(box.y + box.height, other.box.y + other.box.height) - Math.max(box.y, other.box.y);
      expect(intersectX > .1 && intersectY > .1, `${id} overlaps ${other.id}`).toBe(false);
    }
  }
}

test('opens D-030 once without moving, then travels explicitly without changing the world scale', async ({ page }, info) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await seed(page, ready()); await page.goto('/');
  const canvas = page.locator('.game-canvas'); const world = await canvas.boundingBox();
  const stage = await page.locator('.game-shell').boundingBox();
  await expect(page.locator('.legacy-controls button')).toHaveCount(0);
  await info.attach('stage-two-hud', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'lift-open').click();
  await expect(lift(page)).toContainText('LIFT EMPTY');
  await expect(ui(page, 'lift-activate')).toBeDisabled();
  await ui(page, 'lift-tab-extend').click();
  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('OPEN D-030');
  await expect(lift(page)).toContainText('1200 SCRAP');
  await contained(page);
  await info.attach('stage-two-open-connection', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'lift-activate').click();
  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('D-030 CONNECTED');
  await expect(ui(page, 'lift-activate')).toBeDisabled();
  expect((await saved(page)).run.scrap).toBe(3800);
  await expect(canvas).toHaveAttribute('data-depth', 'D-001');
  await expect(canvas).toHaveAttribute('data-elevator-state', 'IDLE_BOTTOM');
  await ui(page, 'lift-tab-travel').click();
  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('TRAVEL TO D-030');
  await info.attach('stage-two-travel', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'lift-activate').click();
  await expect(lift(page)).toHaveCount(0); await expect(canvas).toBeFocused();
  await expect(canvas).toHaveAttribute('data-elevator-state', 'TRAVELING');
  await expect(canvas).toHaveAttribute('data-depth', 'D-030', { timeout: 15_000 });
  expect(await canvas.boundingBox()).toEqual(world);
  expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
  await info.attach('stage-two-d030', { body: await page.screenshot(), contentType: 'image/png' });
});

test('keeps cargo-blocked travel inspectable and isolates menu focus and gameplay input', async ({ page }) => {
  const state = ready(); state.run.depth.unlocked.push('D-030'); state.run.character.carried = [ore()];
  await seed(page, state); await page.goto('/'); await selectVein(page);
  const canvas = page.locator('.game-canvas');
  await ui(page, 'lift-open').click(); await ui(page, 'lift-tab-travel').click();
  await expect(lift(page)).toContainText('Unload your backpack');
  await expect(ui(page, 'lift-activate')).toBeDisabled();
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  const position = await canvas.getAttribute('data-player-x');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width - 5, box.y + box.height - 5);
  await page.keyboard.press('KeyA'); await page.keyboard.press('KeyE'); await page.keyboard.press('KeyF');
  await expect(canvas).toHaveAttribute('data-player-x', position!); await expect(canvas).toHaveAttribute('data-carried-weight', '2.00');
  await ui(page, 'window-close').focus(); await page.keyboard.press('Shift+Tab');
  await expect(ui(page, 'lift-item-D-030')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(ui(page, 'window-close')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(canvas).toBeFocused();
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
  await page.keyboard.down('KeyA'); await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.keyboard.up('KeyA');
});

test('ships from the console, preserves the vein, and continues physical delivery while open', async ({ page }, info) => {
  const state = ready(); state.run.elevator.cargo = [ore()];
  await seed(page, state); await page.goto('/'); await selectVein(page);
  await ui(page, 'lift-open').click(); await expect(lift(page)).toContainText('EST 12 Scrap');
  await expect(ui(page, 'lift-activate')).toHaveAccessibleName('SEND TO SURFACE');
  await ui(page, 'lift-activate').click();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'ASCENDING');
  await expect(lift(page)).toContainText('TO SURFACE');
  await expect(ui(page, 'lift-activate')).toBeDisabled();
  await info.attach('stage-two-shipment', { body: await page.screenshot(), contentType: 'image/png' });
  await expect(lift(page)).toContainText('5012 Scrap', { timeout: 15_000 });
  await expect(lift(page)).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
});

test('pages through every connected destination with keyboard focus following the selection', async ({ page }) => {
  const state = ready(); state.run.depth.unlocked = [...DEPTH_ORDER];
  await seed(page, state); await page.goto('/'); await ui(page, 'lift-open').click(); await ui(page, 'lift-tab-travel').click();
  for (const depth of DEPTH_ORDER.slice(2)) {
    await page.keyboard.press('ArrowRight');
    await expect(ui(page, `lift-item-${depth}`)).toHaveAttribute('aria-pressed', 'true');
    await expect(ui(page, `lift-item-${depth}`)).toBeFocused();
  }
  await page.keyboard.press('ArrowRight'); await expect(ui(page, 'lift-item-D-001')).toBeFocused();
  await expect(ui(page, 'lift-activate')).toBeDisabled(); await expect(lift(page)).toContainText('You are here.');
  await contained(page);
});

test('help consumes commands and a lost pointer focus does not poison the next hold', async ({ page }) => {
  await page.goto('/'); const canvas = page.locator('.game-canvas');
  const right = ui(page, 'right'); const box = (await right.boundingBox())!;
  await page.mouse.move(box.x + 22, box.y + 22); await page.mouse.down();
  await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE'); await page.mouse.up();
  await page.mouse.down(); await expect(canvas).toHaveAttribute('data-player-state', 'MOVING_TO_POINT'); await page.mouse.up();
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE');
  await ui(page, 'help').click(); await expect(page.getByRole('dialog', { name: 'Controls help' })).toBeVisible();
  await ui(page, 'window-close').focus();
  for (const id of ['presentation-volume', 'presentation-motion', 'presentation-highlights', 'window-close']) {
    await page.keyboard.press('Tab'); await expect(ui(page, id)).toBeFocused();
  }
  await page.keyboard.press('Shift+Tab'); await expect(ui(page, 'presentation-highlights')).toBeFocused();
  await page.keyboard.press('KeyE'); await page.keyboard.press('KeyD');
  await expect(canvas).toHaveAttribute('data-player-state', 'IDLE'); await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await page.keyboard.press('Escape'); await expect(canvas).toBeFocused();
});

for (const width of [320, 390]) test.describe(`Canvas lift at ${width}px`, () => {
  test.use({ hasTouch: true, viewport: { width, height: 844 } });
  test('keeps touch controls in the stage across tabs, purchase, travel and help', async ({ page }, info) => {
    await seed(page, ready()); await page.goto('/');
    const stage = await page.locator('.game-shell').boundingBox(); const world = await page.locator('.game-canvas').boundingBox();
    await contained(page);
    await info.attach(`stage-two-hud-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await ui(page, 'lift-open').tap(); await contained(page);
    await ui(page, 'lift-tab-travel').tap(); await expect(ui(page, 'lift-selected')).toHaveAccessibleName('D-001');
    await ui(page, 'lift-tab-extend').tap(); await contained(page);
    await info.attach(`stage-two-lift-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await ui(page, 'lift-activate').tap(); await expect(ui(page, 'lift-activate')).toBeDisabled();
    expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
    await ui(page, 'lift-tab-travel').tap(); await ui(page, 'lift-previous').tap();
    await expect(ui(page, 'lift-selected')).toHaveAccessibleName('D-001'); await expect(ui(page, 'lift-activate')).toBeDisabled();
    await ui(page, 'lift-next').tap(); await expect(ui(page, 'lift-selected')).toHaveAccessibleName('D-030');
    await ui(page, 'lift-activate').tap();
    await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-030', { timeout: 15_000 });
    expect(await page.locator('.game-shell').boundingBox()).toEqual(stage);
    expect(await page.locator('.game-canvas').boundingBox()).toEqual(world);
    await ui(page, 'help').tap(); await contained(page); await ui(page, 'window-close').tap();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
});
