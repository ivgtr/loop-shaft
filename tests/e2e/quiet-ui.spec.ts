import { expect, test } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';

for (const width of [390, 1280]) test(`quiet HUD and complete field notes at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 });
  const state = createGameState(9301); const node = state.run.floors['D-001'].nodes[0]!;
  state.run.character.x = node.x + 13;
  await page.addInitScript(({ key, value }) => {
    localStorage.setItem(key, value);
    const labels: string[] = [];
    Object.assign(window, { fieldUiLabels: labels });
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const text = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('game-ui-canvas')) labels.length = 0;
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (...args) {
      if (this.canvas.classList.contains('game-ui-canvas')) labels.push(args[0]);
      return text.apply(this, args);
    };
  }, { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  const canvas = page.locator('.game-canvas');
  await canvas.focus(); await page.keyboard.press('Space');
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  const rock = page.getByRole('progressbar', { name: 'Scrap Ledge rock remaining' });
  await expect(rock).toHaveAttribute('aria-valuenow', '20');
  await expect(rock).toHaveAttribute('aria-valuemax', '30');
  const painted = await page.evaluate(() => (window as unknown as { fieldUiLabels: string[] }).fieldUiLabels.join(' '));
  expect(painted).not.toMatch(/HP|SWINGING|READY TO MINE|MOVING|DATA|CORE|RUN 01|SMALL LOADS/);
  await expect(page.locator('[data-ui-action="goal"]')).toHaveCount(0);
  await info.attach(`quiet-worksite-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('KeyI');
  const notes = page.getByRole('dialog', { name: 'FIELD NOTES' });
  await expect(notes).toBeVisible(); await expect(notes).toContainText('HP 20/30');
  await expect(notes).toContainText('finite within this Run');
  await expect(notes.locator('[data-ui-action="station-activate"]')).toHaveCount(0);
  await info.attach(`field-notes-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(canvas).toBeFocused();
  await page.locator('[data-ui-action="pack-inspect"]').click();
  await expect(notes).toContainText('A full bag does not stop mining');
  await expect(notes.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '8');
});

test('an unavailable command explains the obstacle briefly without changing the shipment', async ({ page }) => {
  await page.goto('/');
  const send = page.locator('[data-ui-action="send"]');
  await expect(send).toBeDisabled();
  // Native pointer/keyboard events are allowed solely to explain aria-disabled commands.
  await send.click({ force: true });
  await expect(page.locator('.canvas-inputs [role="status"]')).toHaveText('LOAD CARGO FIRST');
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'IDLE_BOTTOM');
  await expect(page.locator('.canvas-inputs [role="status"]')).toBeEmpty({ timeout: 4000 });
});
