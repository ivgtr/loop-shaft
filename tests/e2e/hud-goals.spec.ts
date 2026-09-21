import { expect, test } from '@playwright/test';
import { D100_EXTENSION_COST } from '../../src/game/config';
import { createGameState } from '../../src/game/createGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';

test('updates both the HUD and help from completed research to opening, then travel', async ({ page }, info) => {
  const state = createGameState(833);
  state.run.depth.current = 'D-060';
  state.run.depth.unlocked = ['D-001', 'D-030', 'D-060'];
  state.run.research.completed.push('CORE_RESONANCE');
  state.run.scrap = D100_EXTENSION_COST;
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  const action = (id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
  await expect(page.getByTestId('scene-detail')).toContainText('LIFT · OPEN D-100');
  await action('help').click();
  await expect(page.getByRole('dialog', { name: 'Controls help' })).toContainText('LIFT · OPEN D-100');
  await page.keyboard.press('Escape');
  await action('lift-open').click();
  await action('lift-tab-extend').click();
  await expect(action('lift-activate')).toHaveAccessibleName('OPEN D-100');
  await action('lift-activate').click();
  await expect(action('lift-activate')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('scene-detail')).toContainText('LIFT · TRAVEL TO D-100');
  await action('help').click();
  await expect(page.getByRole('dialog', { name: 'Controls help' })).toContainText('LIFT · TRAVEL TO D-100');
  await info.attach('stage-two-live-objective-help', { body: await page.screenshot(), contentType: 'image/png' });
});
