import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { createD001Nodes, PLAYER_TOOL_DAMAGE, UPGRADE_COSTS, WORLD } from '../../src/game/config';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState } from '../../src/game/types';

const node = createD001Nodes()[0]!;
const canvasOf = (page: Page) => page.getByLabel('LOOP SHAFT mining floor');
const action = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const workshop = (page: Page) => page.getByRole('dialog', { name: 'Workshop', exact: true });

function observeErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => {
    // Cached assets may legitimately return 304 after a reload.
    if (/\.(?:js|css|png)(?:\?|$)/.test(response.url()) && response.status() >= 400) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });
  return errors;
}

async function worldPoint(page: Page, x: number, y: number) {
  const box = await canvasOf(page).boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width * x / WORLD.width, y: box!.y + box!.height * y / WORLD.height };
}

async function clickWorld(page: Page, x: number, y: number): Promise<void> {
  const point = await worldPoint(page, x, y);
  await page.mouse.click(point.x, point.y);
}

async function saved(page: Page): Promise<GameState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
}

test('a fresh production game mines, collects and physically delivers its first cargo', async ({ page }) => {
  const errors = observeErrors(page);
  await page.goto('/');
  const canvas = canvasOf(page);
  await expect(canvas).toBeVisible();
  await clickWorld(page, node.x, 214);
  await expect(canvas).toHaveAttribute('data-player-state', 'MINING');
  const rock = page.getByRole('progressbar', { name: `${node.name} rock remaining` });
  const swings = Math.ceil(node.maxHp / PLAYER_TOOL_DAMAGE[1]);
  for (let hit = 0; hit < swings; hit++) {
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
    const before = Number(await rock.getAttribute('aria-valuenow'));
    await page.keyboard.press('Space');
    // Observe a durable result, not a sub-frame animation state.
    if (hit < swings - 1) {
      await expect.poll(async () => Number(await rock.getAttribute('aria-valuenow'))).toBeLessThan(before);
    }
  }
  await expect(canvas).not.toHaveAttribute('data-floor-loot', '0');
  await action(page, 'interact').click();
  await expect(canvas).not.toHaveAttribute('data-carried-weight', '0.00');
  await page.getByRole('button', { name: 'RETURN', exact: true }).click();
  await expect(action(page, 'send')).toBeEnabled();
  await expect(canvas).toHaveAttribute('data-carried-weight', '0.00');
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0');
  await canvas.focus();
  await page.keyboard.press('KeyF');
  await expect(page.getByTestId('resource-status')).toContainText(/SCRAP [1-9]/);
  expect(errors).toEqual([]);
});

test.describe('continuing a saved game', () => {
  test.use({
    // Storage is installed once when the browser context is created. A reload
    // MUST NOT reseed it, even if the app loses or overwrites its save.
    storageState: async ({ baseURL }, use) => {
      const state = createGameState(9402);
      state.run.scrap = 1000;
      state.run.data = 7;
      state.run.depth.unlocked.push('D-030');
      state.meta.bestDepth = 'D-030';
      state.run.character.carried = [{ id: 'smoke-pending-copper', kind: 'COPPER', name: 'Copper',
        rarity: 'UNCOMMON', category: 'ORE', weight: 1.7, value: 18, dataValue: 0, coreValue: 0,
        x: WORLD.elevatorX, y: 206, originDepth: 'D-001' }];
      await use({ cookies: [], origins: [{ origin: new URL(baseURL!).origin,
        localStorage: [{ name: SAVE_KEY, value: serializeGameState(state) }] }] });
    },
  });

  test('a real purchase survives reload without losing or appraising held cargo', async ({ page }) => {
    const errors = observeErrors(page);
    await page.goto('/');
    const canvas = canvasOf(page);
    await expect(canvas).toHaveAttribute('data-carried-weight', '1.70');
    await clickWorld(page, WORLD.workbenchX, 216);
    await expect(workshop(page)).toBeVisible();
    await action(page, 'item-upgrade-tool').click();
    await action(page, 'buy').click();
    await expect(action(page, 'buy')).toBeDisabled();
    const expectedScrap = 1000 - UPGRADE_COSTS.tool;
    await expect.poll(async () => (await saved(page)).run.tool.level).toBe(2);
    const before = await saved(page);
    expect(before.run.scrap).toBe(expectedScrap);
    expect(before.run.character.carried.map(item => item.id)).toEqual(['smoke-pending-copper']);
    await page.reload();
    await expect(workshop(page)).toHaveCount(0);
    await expect(canvas).toHaveAttribute('data-carried-weight', '1.70');
    await expect(page.getByTestId('resource-status')).toContainText(`SCRAP ${expectedScrap}`);
    await clickWorld(page, WORLD.workbenchX, 216);
    await action(page, 'item-upgrade-tool').click();
    await expect(action(page, 'buy')).toBeDisabled();
    const after = await saved(page);
    expect(after.run.tool.level).toBe(2);
    expect(after.run.scrap).toBe(expectedScrap);
    expect(after.run.data).toBe(7);
    expect(after.run.depth.unlocked).toContain('D-030');
    expect(after.run.character.carried).toEqual(before.run.character.carried);
    expect(errors).toEqual([]);
  });
});

test.describe('small-screen touch', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('touch mining resumes after opening and closing a facility', async ({ page }) => {
    const errors = observeErrors(page);
    await page.goto('/');
    const canvas = canvasOf(page);
    let point = await worldPoint(page, node.x, 214);
    await page.touchscreen.tap(point.x, point.y);
    await expect(canvas).toHaveAttribute('data-player-state', 'MINING');
    const rock = page.getByRole('progressbar', { name: `${node.name} rock remaining` });
    const initialHp = Number(await rock.getAttribute('aria-valuenow'));
    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(async () => Number(await rock.getAttribute('aria-valuenow'))).toBeLessThan(initialHp);
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
    const remainingHp = Number(await rock.getAttribute('aria-valuenow'));
    point = await worldPoint(page, WORLD.workbenchX, 216);
    await page.touchscreen.tap(point.x, point.y);
    await expect(workshop(page)).toBeVisible();
    await action(page, 'close').tap();
    await expect(workshop(page)).toHaveCount(0);
    point = await worldPoint(page, node.x, 214);
    // Closing a facility stops the old job; reselect, then issue a new swing.
    await page.touchscreen.tap(point.x, point.y);
    await expect(canvas).toHaveAttribute('data-player-state', 'MINING');
    await expect(canvas).toHaveAttribute('data-swing', 'ready');
    await page.getByRole('button', { name: 'MINE', exact: true }).tap();
    await expect.poll(async () => Number(await rock.getAttribute('aria-valuenow'))).toBeLessThan(remainingHp);
    expect(errors).toEqual([]);
  });
});
