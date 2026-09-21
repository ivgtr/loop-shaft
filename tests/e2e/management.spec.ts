import { expect, test, type Page } from '@playwright/test';
import { LOOT, PASSIVES, RESEARCH } from '../../src/game/config';
import { equipCrewItem, equipPlayerItem, hireCrew } from '../../src/game/phase5';
import { startRailConstruction, updateDeepGame } from '../../src/game/deepGame';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import type { GameState, PassiveId } from '../../src/game/types';
import { managementGame } from '../fixtures/management';

const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const modal = (page: Page) => page.getByRole('dialog');
async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
}
async function saved(page: Page): Promise<GameState> { return page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY); }
async function choose(page: Page, id: string) {
  for (let n = 0; n < 40; n++) {
    if (await modal(page).getAttribute('data-selected-item') === id) return;
    const row = ui(page, `station-item-${id}`);
    if (await row.count()) { await row.click(); return; }
    await ui(page, 'station-next').click();
  }
  throw new Error(`Could not select ${id}`);
}
async function open(page: Page, id: string) {
  await ui(page, 'base').click(); await choose(page, id); await ui(page, 'station-activate').click();
}
async function contained(page: Page) {
  const bounds = (await page.locator('.game-shell').boundingBox())!;
  const boxes = [];
  for (const button of await modal(page).getByRole('button').all()) {
    const rect = (await button.boundingBox())!; boxes.push(rect);
    expect(rect.width).toBeGreaterThanOrEqual(44); expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.x).toBeGreaterThanOrEqual(bounds.x); expect(rect.y).toBeGreaterThanOrEqual(bounds.y);
    expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + .01);
    expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height + .01);
  }
  for (let i = 0; i < boxes.length; i++) for (const b of boxes.slice(i + 1)) {
    const a = boxes[i]!;
    expect(a.x < b.x + b.width - .1 && a.x + a.width > b.x + .1 && a.y < b.y + b.height - .1 && a.y + a.height > b.y + .1).toBe(false);
  }
}

test('base facilities use Canvas controls and release held input without losing the selected vein', async ({ page }, info) => {
  await seed(page, managementGame()); const canvas = page.locator('.game-canvas');
  const world = (await canvas.boundingBox())!;
  await page.mouse.click(world.x + world.width * 118 / 480, world.y + world.height * 214 / 270);
  await canvas.focus(); await page.keyboard.down('KeyD');
  await open(page, 'research');
  const position = await canvas.getAttribute('data-player-x');
  await page.keyboard.press('KeyF'); await page.keyboard.press('Space');
  await expect(canvas).toHaveAttribute('data-player-x', position!);
  await expect(canvas).toHaveAttribute('data-swing', 'ready');
  await expect(page.locator('.legacy-controls, .context-strip')).toHaveCount(0);
  await page.keyboard.up('KeyD');
  await contained(page);
  await info.attach('research-current', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(canvas).toBeFocused();
  await expect(page.getByTestId('scene-title')).toHaveText('Scrap Ledge');
});

test('equipment transfer requires confirmation and returns to actual player ownership', async ({ page }, info) => {
  const state = managementGame(); const item = state.run.phase5.equipment.inventory[0]!; const worker = state.run.phase5.crew.members[0]!;
  equipCrewItem(state, worker.id, item.id);
  await seed(page, state); await open(page, 'equipment');
  await expect(modal(page)).toContainText(worker.name);
  await expect(modal(page)).toContainText('Base hit:');
  await ui(page, 'station-activate').click(); await expect(ui(page, 'station-cancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(modal(page)).toBeVisible(); await expect(ui(page, 'station-cancel')).toHaveCount(0);
  expect((await saved(page)).run.phase5.crew.members[0]!.equipment.TOOL).toBe(item.id);
  await ui(page, 'station-activate').click(); await contained(page);
  await info.attach('equipment-transfer', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'station-activate').click();
  expect((await saved(page)).run.phase5.equipment.equippedPlayer.TOOL).toBe(item.id);
  expect((await saved(page)).run.phase5.crew.members[0]!.equipment.TOOL).toBeUndefined();
  await expect(ui(page, 'station-activate')).toBeDisabled();
});

test('research finishes while browsing, keeps its selected row and preserves plans and history', async ({ page }, info) => {
  const state = managementGame(); state.run.research.active = { id: 'PRIORITY_CARGO_TAG', remaining: 5, duration: RESEARCH.PRIORITY_CARGO_TAG.duration };
  await seed(page, state); await open(page, 'research');
  await expect(modal(page)).toHaveAttribute('data-selected-item', 'PRIORITY_CARGO_TAG');
  await expect(modal(page)).toContainText('COMPLETE', { timeout: 8000 });
  await ui(page, 'station-tab-plans').click(); await expect(modal(page)).toContainText('Requires');
  await expect(ui(page, 'station-activate')).toBeDisabled();
  await info.attach('research-locked-plans', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'station-tab-done').click(); await expect(modal(page)).toContainText('COMPLETE');
  await ui(page, 'station-close').click(); await open(page, 'research');
  await choose(page, 'MULTI_STOP_RELAY'); await ui(page, 'station-activate').dblclick();
  expect((await saved(page)).run.data).toBe(40 - RESEARCH.MULTI_STOP_RELAY.dataCost);
  await expect(modal(page).getByRole('status')).toContainText('Multi-Stop Relay started.');
});

test('crew uses explicit priorities, physical transfers, and worker equipment selection', async ({ page }, info) => {
  const state = managementGame(); const worker = state.run.phase5.crew.members[0]!;
  await seed(page, state); await open(page, 'crew');
  await expect(ui(page, `station-worker-${worker.id}`)).toHaveAttribute('data-selected', 'true');
  await ui(page, 'station-tab-priority').click(); await choose(page, 'RESEARCH'); await ui(page, 'station-activate').click();
  expect((await saved(page)).run.phase5.crew.members[0]!.minerPriority).toBe('RESEARCH');
  await ui(page, 'station-tab-assign').click(); await choose(page, 'D-060'); await ui(page, 'station-activate').click();
  const assigned = (await saved(page)).run.phase5.crew.members[0]!;
  expect(assigned.assignedDepth).toBe('D-001'); expect(assigned.pendingDepth).toBe('D-060');
  await expect(modal(page)).toContainText('Wait for the current transfer');
  await info.attach('crew-assignment', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'station-tab-gear').click(); await ui(page, 'station-activate').click();
  await expect(modal(page)).toHaveAccessibleName(`${worker.name} GEAR`);
  await expect(modal(page)).toContainText('Hit on');
  await ui(page, 'station-activate').click();
  expect((await saved(page)).run.phase5.crew.members[0]!.equipment.TOOL).toBe(state.run.phase5.equipment.inventory[0]!.id);
  await ui(page, 'station-back').click(); await expect(modal(page)).toHaveAttribute('data-station', 'crew');
});

test('Collection uses permanent records and enforces two active passives', async ({ page }, info) => {
  const state = managementGame(); state.meta.passives.unlocked = Object.keys(PASSIVES) as PassiveId[];
  state.meta.passives.active = state.meta.passives.unlocked.slice(0, 2);
  await seed(page, state); await open(page, 'archive');
  await expect(modal(page)).toContainText('????');
  await ui(page, 'station-tab-passives').click(); await choose(page, state.meta.passives.unlocked[2]!);
  await expect(modal(page)).toContainText('Two passives'); await expect(ui(page, 'station-activate')).toBeDisabled();
  await choose(page, state.meta.passives.active[0]!); await ui(page, 'station-activate').click();
  await choose(page, state.meta.passives.unlocked[2]!); await ui(page, 'station-activate').click();
  expect((await saved(page)).meta.passives.active).toContain(state.meta.passives.unlocked[2]);
  await info.attach('archive-passives', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload(); await expect(modal(page)).toHaveCount(0);
});

test('Anomaly has an inspectable irreversible choice and cannot consume double clicks', async ({ page }, info) => {
  const state = managementGame(); state.run.depth.current = 'D-030';
  state.run.anomaly.options = ['GOLD_RUSH', 'HEAVY_WORLD', 'FOSSIL_AGE']; state.run.anomaly.selected = null;
  await seed(page, state); await open(page, 'scanner');
  await choose(page, 'FOSSIL_AGE'); await ui(page, 'station-activate').dblclick();
  await expect(ui(page, 'station-cancel')).toBeFocused();
  expect((await saved(page)).run.anomaly.selected).toBeNull();
  await info.attach('anomaly-confirmation', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'station-activate').click();
  expect((await saved(page)).run.anomaly.selected).toBe('FOSSIL_AGE');
  await expect(ui(page, 'station-activate')).toBeDisabled();
});

test('Core protocols stay selected after purchase and show installed ownership', async ({ page }, info) => {
  await seed(page, managementGame()); await open(page, 'core');
  await choose(page, 'LEGACY_LOCKER'); await ui(page, 'station-activate').dblclick();
  expect((await saved(page)).meta.core).toBe(25); await expect(ui(page, 'station-activate')).toBeDisabled();
  await expect(modal(page)).toHaveAttribute('data-selected-item', 'LEGACY_LOCKER');
  await ui(page, 'station-tab-owned').click(); await expect(modal(page)).toContainText('Legacy Locker');
  await info.attach('core-installed', { body: await page.screenshot(), contentType: 'image/png' });
});

test('Reboot previews actual carryover, cancels safely, reloads unarmed, and pays only appraised Core', async ({ page }, info) => {
  const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
  state.meta.protocols.push('LEGACY_LOCKER'); equipPlayerItem(state, state.run.phase5.equipment.inventory[0]!.id);
  const loot = LOOT.CORE_FRAGMENT;
  state.run.character.carried.push({ ...loot, id: 'unappraised-core', kind: 'CORE_FRAGMENT', x: 240, y: 206, originDepth: 'D-100', dataValue: 0, coreValue: 99 });
  await seed(page, state); await open(page, 'reboot');
  await expect(modal(page)).toContainText('GAIN 7 CORE'); await expect(modal(page)).toContainText(state.run.phase5.equipment.inventory[0]!.name);
  await ui(page, 'station-activate').click(); await expect(ui(page, 'station-cancel')).toBeFocused();
  await page.keyboard.press('Escape'); await expect(modal(page)).toBeVisible();
  await ui(page, 'station-activate').click(); await page.reload();
  await expect(modal(page)).toHaveCount(0); expect((await saved(page)).meta.runIndex).toBe(2);
  await open(page, 'reboot'); await ui(page, 'station-activate').click();
  await contained(page); await info.attach('reboot-preview', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'station-activate').click(); await expect(modal(page)).toHaveCount(0);
  const result = await saved(page);
  expect(result.meta.runIndex).toBe(3); expect(result.meta.core).toBe(37);
  expect(result.run.phase5.equipment.inventory.map((item) => item.id)).toEqual([state.run.phase5.equipment.inventory[0]!.id]);
  expect(result.run.character.carried).toHaveLength(0); await expect(page.locator('.game-canvas')).toBeFocused();
});

test('deep logistics retain construction, routing and remote Bore controls within Canvas', async ({ page }, info) => {
  const state = managementGame(); state.run.depth.current = 'D-400'; state.run.research.completed.push('RAIL_LOGISTICS', 'REMOTE_BORE_CONTROL');
  state.run.deepProgress.boreBlueprint = true;
  await seed(page, state); await open(page, 'logistics');
  await ui(page, 'station-activate').click(); expect((await saved(page)).run.logistics.lines).toHaveLength(1);
  await choose(page, 'rail-d250'); await ui(page, 'station-option-RESEARCH').click(); await ui(page, 'station-activate').click();
  expect((await saved(page)).run.logistics.lines[0]!.priority).toBe('RESEARCH');
  await ui(page, 'station-tab-freight').click(); await expect(modal(page)).toContainText(/Restore the D-250 Rail first|Requires Freight Architecture/);
  await ui(page, 'station-tab-bore').click(); await expect(modal(page)).toContainText('Engineer');
  await info.attach('deep-bore-site', { body: await page.screenshot(), contentType: 'image/png' });
});

for (const width of [320, 390]) test.describe(`management touch ${width}px`, () => {
  test.use({ hasTouch: true, viewport: { width, height: 844 } });
  test('keeps all facilities fixed, pages every detail and traps keyboard focus', async ({ page }, info) => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
    state.meta.protocols.push('LEGACY_LOCKER');
    await seed(page, state); const bounds = await page.locator('.game-shell').boundingBox();
    for (const station of ['equipment', 'research', 'crew', 'archive', 'core', 'logistics', 'reboot']) {
      await open(page, station); await contained(page);
      expect(await page.locator('.game-shell').boundingBox()).toEqual(bounds);
      if (await ui(page, 'station-details').count()) await ui(page, 'station-details').tap();
      for (let n = 0; n < 60 && await ui(page, 'station-page-next').count() && await ui(page, 'station-page-next').isEnabled(); n++) await ui(page, 'station-page-next').tap();
      if (await ui(page, 'station-page-next').count()) await expect(ui(page, 'station-page-next')).toBeDisabled();
      const last = await page.getByTestId('detail-page').innerText(); const [current, total] = last.replace('Detail ', '').split('/');
      expect(current).toBe(total);
      const buttons = modal(page).getByRole('button').filter({ visible: true });
      const first = buttons.first(); await first.focus(); await page.keyboard.press('Shift+Tab');
      expect(await modal(page).evaluate((element) => element.contains(document.activeElement))).toBe(true);
      if (station === 'equipment' || station === 'reboot') await info.attach(`${station}-${width}px-last-page`, { body: await page.screenshot(), contentType: 'image/png' });
      if (station === 'reboot') {
        await ui(page, 'station-activate').tap(); await contained(page);
        await expect(ui(page, 'station-cancel')).toBeFocused();
        await info.attach(`reboot-${width}px-confirm`, { body: await page.screenshot(), contentType: 'image/png' });
      }
      await ui(page, 'station-close').tap();
      await expect(modal(page)).toHaveCount(0);
      expect(await page.locator('.game-shell').boundingBox()).toEqual(bounds);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
});

test('D-030 SCAN and E open the same Canvas choice as the scanner in the world', async ({ page }) => {
  const state = managementGame(); state.run.depth.current = 'D-030';
  state.run.anomaly.options = ['GOLD_RUSH', 'HEAVY_WORLD', 'FOSSIL_AGE']; state.run.anomaly.selected = null;
  await seed(page, state);
  const canvas = page.locator('.game-canvas');
  await expect(ui(page, 'interact')).toHaveAccessibleName('SCAN');
  await ui(page, 'interact').click(); await expect(modal(page)).toHaveAttribute('data-station', 'scanner');
  await page.keyboard.press('Escape'); await canvas.focus(); await page.keyboard.press('KeyE');
  await expect(modal(page)).toHaveAttribute('data-station', 'scanner');
  await page.keyboard.press('Escape');
  const world = (await canvas.boundingBox())!;
  await page.mouse.click(world.x + world.width * 282 / 480, world.y + world.height * 190 / 270);
  await expect(modal(page)).toHaveAttribute('data-station', 'scanner');
  expect((await saved(page)).run.anomaly.selected).toBeNull();
});

test('rapid inspection and close gestures are not discarded as purchases', async ({ page }) => {
  await seed(page, managementGame()); await open(page, 'equipment');
  const first = await modal(page).getAttribute('data-selected-item');
  await ui(page, 'station-next').dispatchEvent('click', { detail: 2 });
  await expect(modal(page)).not.toHaveAttribute('data-selected-item', first!);
  await ui(page, 'station-close').dispatchEvent('click', { detail: 2 });
  await expect(modal(page)).toHaveCount(0);
  await expect(page.locator('.game-canvas')).toBeFocused();
});

/** Observe the visible Canvas paint, not only the offscreen accessibility copy. */
async function observePaint(page: Page) {
  await page.addInitScript(() => {
    type Paint = { label: string; x: number; y: number; width: number; size: number };
    const record = window as unknown as { uiPaint: Paint[] }; record.uiPaint = [];
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) {
      if (this.canvas.classList.contains('game-ui-canvas')) record.uiPaint = [];
      return clear.apply(this, args);
    };
    CanvasRenderingContext2D.prototype.fillText = function (label, x, y, maxWidth) {
      if (this.canvas.classList.contains('game-ui-canvas')) record.uiPaint.push({ label, x, y, width: this.measureText(label).width, size: parseFloat(this.font) });
      return maxWidth === undefined ? fill.call(this, label, x, y) : fill.call(this, label, x, y, maxWidth);
    };
  });
}
async function painted(page: Page) {
  return page.evaluate(() => (window as unknown as { uiPaint: { label: string; x: number; y: number; width: number; size: number }[] }).uiPaint);
}

for (const width of [320, 390]) test.describe(`review consequences ${width}px`, () => {
  test.use({ hasTouch: true, viewport: { width, height: width === 320 ? 568 : 844 } });
  test('all Reboot consequences stay painted on every page beside a fixed confirm button', async ({ page }, info) => {
    const state = managementGame(); state.run.depth.current = 'D-100'; state.run.pendingCore = 7; state.run.coreChamber.rebootAvailable = true;
    state.meta.protocols.push('LEGACY_LOCKER'); equipPlayerItem(state, state.run.phase5.equipment.inventory[0]!.id);
    await observePaint(page); await seed(page, state); await open(page, 'reboot');
    await ui(page, 'station-activate').tap(); await expect(ui(page, 'station-cancel')).toBeFocused();
    const actionBounds = await ui(page, 'station-activate').boundingBox(); const shell = (await page.locator('.game-shell').boundingBox())!;
    const expected = ['GAIN: +7 Core (37 total)', `KEEP GEAR: ${state.run.phase5.equipment.inventory[0]!.name}`, 'LOSE: 16 other gear and ALL undelivered cargo.', 'RESET: Run resources, buildings, research, crew and floors.', 'KEEP: Core, protocols, discoveries and passives.'];
    const verify = async () => {
      await expect.poll(async () => (await painted(page)).map((run) => run.label).join('').replaceAll(/\s/g, '')).toContain(expected[3]!.replaceAll(/\s/g, ''));
      const paint = await painted(page); const whole = paint.map((run) => run.label).join('').replaceAll(/\s/g, '');
      for (const fact of expected) expect(whole).toContain(fact.replaceAll(/\s/g, ''));
      // Pinned facts precede all extra detail text and both action buttons.
      const reset = paint.find((run) => run.label.startsWith('RESET:'))!;
      expect(reset.y + shell.y).toBeLessThan(actionBounds!.y - 44);
      expect(reset.x + reset.width).toBeLessThanOrEqual(shell.width);
      expect(await ui(page, 'station-activate').boundingBox()).toEqual(actionBounds);
    };
    await verify(); await info.attach(`reboot-consequences-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    await ui(page, 'station-details').tap(); await verify();
    for (let n = 0; n < 60 && await ui(page, 'station-page-next').count() && await ui(page, 'station-page-next').isEnabled(); n++) {
      await ui(page, 'station-page-next').tap(); await verify();
    }
    await ui(page, 'station-cancel').tap(); await expect(modal(page)).toHaveCount(0);
    expect((await saved(page)).meta.runIndex).toBe(2);
  });
});

test('equipped and active badges remain when inspecting other rows and grouped pages reach every gear item', async ({ page }, info) => {
  const state = managementGame(); const first = state.run.phase5.equipment.inventory[0]!;
  equipPlayerItem(state, first.id); await seed(page, state); await open(page, 'equipment');
  await choose(page, state.run.phase5.equipment.inventory[1]!.id);
  await expect(ui(page, `station-item-${first.id}`)).toHaveAttribute('data-status', 'EQUIPPED');
  await expect(ui(page, `station-item-${first.id}`)).toHaveAttribute('data-selected', 'false');
  await expect(ui(page, 'station-page-next')).toHaveCount(0);
  await info.attach('equipment-changed-stats', { body: await page.screenshot(), contentType: 'image/png' });
  for (const item of state.run.phase5.equipment.inventory.filter((item) => item.slot === 'TOOL')) await choose(page, item.id);
  await ui(page, 'station-details').click(); await expect(modal(page)).toHaveAttribute('data-detail-open', 'true');
  await ui(page, 'station-details').click(); await expect(modal(page)).toHaveAttribute('data-detail-open', 'false');
});

test('roster lists every worker and opens inline controls without a second inspect screen', async ({ page }, info) => {
  const state = managementGame(); state.run.phase5.crew.slots = 4; hireCrew(state, 'MINER'); hireCrew(state, 'PORTER');
  await seed(page, state); await open(page, 'crew');
  for (const worker of state.run.phase5.crew.members) await expect(ui(page, `station-worker-${worker.id}`)).toBeVisible();
  const worker = state.run.phase5.crew.members[2]!;
  await ui(page, `station-worker-${worker.id}`).click(); await ui(page, 'station-tab-priority').click(); await choose(page, 'RESEARCH');
  await ui(page, 'station-activate').click(); expect((await saved(page)).run.phase5.crew.members[2]!.minerPriority).toBe('RESEARCH');
  await expect(modal(page)).toContainText(`${worker.name} now prioritizes research.`);
  await info.attach('crew-inline-board', { body: await page.screenshot(), contentType: 'image/png' });
});

test('rail priorities are selectable options, keep the current badge and do not execute on arrow navigation', async ({ page }, info) => {
  const state = managementGame(); state.run.research.completed.push('RAIL_LOGISTICS'); startRailConstruction(state);
  for (let n = 0; n < 1500; n++) updateDeepGame(state, .1);
  await seed(page, state); await open(page, 'logistics');
  await expect(modal(page)).toHaveAttribute('data-item-count', '1/1');
  await ui(page, 'station-option-RESEARCH').click();
  await expect(ui(page, 'station-option-BULK')).toHaveAttribute('data-status', 'ACTIVE');
  expect((await saved(page)).run.logistics.lines[0]!.priority).toBe('BULK');
  await page.keyboard.press('ArrowRight'); await expect(ui(page, 'station-option-RARE')).toBeFocused();
  expect((await saved(page)).run.logistics.lines[0]!.priority).toBe('BULK');
  await ui(page, 'station-activate').click(); expect((await saved(page)).run.logistics.lines[0]!.priority).toBe('RARE');
  await expect(ui(page, 'station-option-RARE')).toHaveAttribute('data-status', 'ACTIVE');
  await info.attach('rail-route-and-priority', { body: await page.screenshot(), contentType: 'image/png' });
});

test('research progress and discovered collection tiles are visible instead of a text-only form', async ({ page }, info) => {
  const state = managementGame(); state.run.research.active = { id: 'PRIORITY_CARGO_TAG', remaining: 24, duration: 28 };
  state.meta.collection.entries.slice(0, 3).forEach((entry, i) => { entry.discovered = true; entry.count = i + 1; });
  await seed(page, state); await open(page, 'research');
  await expect(modal(page).getByRole('progressbar')).toHaveCount(1);
  await ui(page, 'station-tab-plans').click(); await expect(modal(page).getByRole('progressbar')).toHaveCount(1);
  await info.attach('research-running-plan', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await open(page, 'archive');
  for (const entry of state.meta.collection.entries.slice(0, 3)) await expect(ui(page, `station-item-${entry.kind}`)).toBeVisible();
  await info.attach('collection-gallery', { body: await page.screenshot(), contentType: 'image/png' });
});

for (const width of [679, 680, 716]) test(`responsive boundary ${width}px uses one coordinate model without overlapping hit areas`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await seed(page, managementGame()); const before = await page.locator('.game-canvas').boundingBox();
  await open(page, 'equipment'); await contained(page); await ui(page, 'station-details').click(); await contained(page);
  expect(await page.locator('.game-canvas').boundingBox()).toEqual(before);
  await ui(page, 'station-close').click(); expect(await page.locator('.game-canvas').boundingBox()).toEqual(before);
});
