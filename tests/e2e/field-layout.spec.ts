import { expect, test } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import { loot } from '../fixtures/discovery';

const ui = (page: import('@playwright/test').Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);

for (const { width, height } of [
  { width: 320, height: 740 }, { width: 390, height: 844 }, { width: 960, height: 640 },
]) test(`places facilities and SEND in the world at ${width}px`, async ({ page }) => {
  const state = createGameState(901);
  state.run.depth.unlocked.push('D-030', 'D-060'); state.meta.runIndex = 2;
  if (width === 960) state.run.character.x = 269;
  if (width === 390) state.run.elevator.cargo = [loot('IRON', 'send-panel-check')];
  await page.setViewportSize({ width, height });
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
    { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  const send = ui(page, 'send'); await expect(send).toBeVisible();
  const sendBox = (await send.boundingBox())!;
  const worldBox = (await page.locator('.game-canvas').boundingBox())!;
  expect(sendBox.width).toBeGreaterThanOrEqual(44);
  expect(sendBox.height).toBeGreaterThanOrEqual(44);
  expect(sendBox.x + sendBox.width / 2).toBeCloseTo(worldBox.x + 269 * worldBox.width / 480, 0);
  expect(sendBox.y + sendBox.height / 2).toBeCloseTo(worldBox.y + 200 * worldBox.height / 270, 0);
  await page.screenshot({ path: `/tmp/loop-shaft-field-${width}.png` });
  if (width === 390) {
    await send.click();
    await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'ASCENDING');
  }
  await ui(page, 'base').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  for (let i = 0; i < 20 && await page.getByRole('dialog').getAttribute('data-selected-item') !== 'archive'; i++) {
    const archive = ui(page, 'station-item-archive');
    if (await archive.count()) { await archive.click(); break; }
    await ui(page, 'station-next').click();
  }
  await expect(page.getByRole('dialog')).toHaveAttribute('data-selected-item', 'archive');
  await ui(page, 'station-activate').click();
  await expect(page.getByRole('dialog')).toHaveAttribute('data-station', 'archive');
});

test('hides and restores normal controls around floor travel', async ({ page }) => {
  const state = createGameState(902);
  state.run.depth.unlocked.push('D-030');
  state.run.elevator.travel = { from: 'D-001', to: 'D-030', remaining: 2.8, duration: 2.8, viaSurface: true };
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); },
    { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  await expect(ui(page, 'send')).toHaveCount(0);
  await expect(ui(page, 'base')).toHaveCount(0);
  await expect(page.getByTestId('resource-status')).toHaveCount(0);
  await expect(ui(page, 'send')).toBeVisible({ timeout: 10000 });
  await expect(ui(page, 'base')).toBeVisible();
});
