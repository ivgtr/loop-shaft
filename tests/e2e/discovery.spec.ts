import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { appraisePhysicalCargo } from '../../src/game/appraisal';
import { advanceProspecting, appraisedLoot, createProspectingState, floorProspects } from '../../src/game/prospecting';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import { deriveInteractionTargets } from '../../src/render/interactionTargets';
import { loot, specimenGame } from '../fixtures/discovery';
import type { GameState } from '../../src/game/types';
import { observeDiscoveryArt, expectDiscoveryArt } from './helpers/discoveryArt';

const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const modal = (page: Page) => page.getByRole('dialog');
const saved = (page: Page): Promise<GameState> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
}
async function choose(page: Page, id: string) {
  for (let n = 0; n < 40; n++) {
    if (await modal(page).getAttribute('data-selected-item') === id) return;
    const row = ui(page, `station-item-${id}`);
    if (await row.count()) { await row.click(); return; }
    await ui(page, 'station-next').click();
  }
  throw new Error(`Cannot select ${id}`);
}
async function open(page: Page, id: string) {
  await ui(page, 'base').click(); await choose(page, id); await ui(page, 'station-activate').click();
}
async function selectNode(page: Page, state: GameState, id: string) {
  const pos = deriveInteractionTargets(state).find((target) => target.key === `node:${id}`)!.position;
  const rect = (await page.locator('.game-canvas').boundingBox())!;
  await page.mouse.click(rect.x + rect.width * pos.x / 480, rect.y + rect.height * pos.y / 270);
}
async function paintedText(page: Page) {
  await page.addInitScript(() => {
    const record = window as unknown as { discoveryPaint: string[] }; record.discoveryPaint = [];
    const clear = CanvasRenderingContext2D.prototype.clearRect;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.clearRect = function (...args) { if (this.canvas.classList.contains('game-ui-canvas')) record.discoveryPaint = []; return clear.apply(this, args); };
    CanvasRenderingContext2D.prototype.fillText = function (label, x, y, maxWidth) {
      if (this.canvas.classList.contains('game-ui-canvas')) record.discoveryPaint.push(label);
      return maxWidth === undefined ? fill.call(this, label, x, y) : fill.call(this, label, x, y, maxWidth);
    };
  });
}
const paint = (page: Page) => page.evaluate(() => (window as unknown as { discoveryPaint: string[] }).discoveryPaint.join(' ').replace(/\s/g, ''));

for (const width of [390, 1280]) test(`sealed cargo auto-appraises, stays in RECENT and never rerolls at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await paintedText(page);
  const state = specimenGame(); state.run.depth.unlocked.push('D-030'); state.meta.bestDepth = 'D-030';
  const outcome = appraisedLoot(state.run.elevator.cargo[0]!);
  await seed(page, state);
  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 0 ·');
  expect((await saved(page)).run.elevator.cargo[0]!.name).toBe('Unidentified fossil');
  await info.attach(`sealed-cargo-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('.game-canvas').focus(); await page.keyboard.press('KeyF');
  await expect.poll(async () => (await saved(page)).run.scrap, { timeout: 15000 }).toBe(outcome.value);
  await open(page, 'archive'); await ui(page, 'station-tab-recent').click();
  await expect(modal(page)).toContainText(outcome.name);
  await expect.poll(() => paint(page)).toContain(outcome.name.replace(/\s/g, ''));
  await info.attach(`appraised-recent-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload(); expect((await saved(page)).run.scrap).toBe(outcome.value);
  expect((await saved(page)).run.discovery.recentFinds?.some((entry) => entry.name === outcome.name)).toBe(true);
});

for (const width of [390, 1280]) test(`restoration requires confirmation and paints its real cost at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 844 }); await paintedText(page);
  const state = createGameState(112); state.run.depth.unlocked.push('D-030');
  appraisePhysicalCargo(state, Array.from({ length: 6 }, (_, i) => loot('TRILOBITE', `t${i}`)), () => undefined);
  await seed(page, state); await open(page, 'archive'); await choose(page, 'AMMONITE');
  await expect(modal(page)).toContainText('????'); await ui(page, 'station-activate').click();
  await expect(ui(page, 'station-cancel')).toBeFocused();
  await expect.poll(() => paint(page)).toContain('SPEND:5duplicateshellfossils.');
  await expect.poll(() => paint(page)).toContain('KEEP:Firstspecimensandcollectionhistory.');
  await info.attach(`restoration-review-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape');
  expect((await saved(page)).meta.collection.entries.find((e) => e.kind === 'AMMONITE')?.discovered).toBe(false);
  await ui(page, 'station-activate').click(); await ui(page, 'station-activate').click();
  await expect(ui(page, 'station-activate')).toBeDisabled();
  const next = await saved(page);
  expect(next.meta.collection.entries.find((e) => e.kind === 'AMMONITE')).toMatchObject({ discovered: true, restored: true, count: 0 });
  expect(next.run.scrap).toBe(state.run.scrap);
  await page.reload(); expect((await saved(page)).meta.collection.entries.find((e) => e.kind === 'TRILOBITE')?.restorationSpent).toBe(5);
});

test('a real D030 break creates a field tool, shipping identifies it, and Run 1 can equip it', async ({ page }, info) => {
  const state = createGameState(515); state.run.depth.unlocked.push('D-030'); state.run.depth.current = 'D-030'; state.meta.bestDepth = 'D-030';
  state.run.anomaly.selected = 'HEAVY_WORLD';
  const floor = state.run.floors['D-030']; floor.prospecting = { ...createProspectingState(), breaks: 5 };
  const node = floor.nodes[0]!; node.hp = 1; state.run.character.x = node.x + 13;
  state.run.pack.level = 2; state.run.character.backpackCapacity = 15;
  await seed(page, state); await selectNode(page, state, node.id);
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-player-state', 'MINING'); await page.keyboard.press('Space');
  await expect.poll(async () => (await saved(page)).run.floors['D-030'].loot.some((item) => item.equipmentSeed !== undefined), { timeout: 8000 }).toBe(true);
  expect((await saved(page)).run.phase5.equipment.inventory).toHaveLength(0);
  await ui(page, 'interact').click(); await expect(page.locator('.game-canvas')).not.toHaveAttribute('data-carried-weight', '0.00'); await ui(page, 'return').click();
  await expect(ui(page, 'send')).toBeEnabled({ timeout: 15000 }); await ui(page, 'send').click();
  await expect.poll(async () => (await saved(page)).run.phase5.equipment.inventory.length, { timeout: 15000 }).toBe(1);
  const item = (await saved(page)).run.phase5.equipment.inventory[0]!;
  await open(page, 'equipment'); await expect(modal(page)).toContainText(item.name); await ui(page, 'station-activate').click();
  expect((await saved(page)).run.phase5.equipment.equippedPlayer.TOOL).toBe(item.id);
  await info.attach('first-run-field-tool', { body: await page.screenshot(), contentType: 'image/png' });
});

test('a visible persistent trace changes from sealed to exposed to spent through mining and reload', async ({ page }, info) => {
  test.setTimeout(60000);
  await observeDiscoveryArt(page);
  const state = createGameState(771); const floor = state.run.floors['D-001'];
  for (let i = 0; i < 6; i++) advanceProspecting(floor, floor.nodes[0]!);
  const plan = floorProspects(floor)[0]!; const node = floor.nodes.find((n) => n.id === plan.nodeId)!;
  node.hp = 1; state.run.character.x = node.x - 13;
  await seed(page, state); await selectNode(page, state, node.id);
  await expect(page.getByTestId('scene-detail')).toContainText('2 breaks to extract');
  await expectDiscoveryArt(page, 'traces', `${plan.signal.toLowerCase()}-sealed`);
  await info.attach('trace-sealed', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Space'); await expect(page.getByTestId('scene-detail')).toContainText('1 breaks to extract');
  await expect.poll(async () => (await saved(page)).run.floors['D-001'].prospecting?.prospectWork[0], { timeout: 8000 }).toBe(1);
  await expectDiscoveryArt(page, 'traces', `${plan.signal.toLowerCase()}-nearly`);
  await info.attach('trace-exposed', { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload(); await selectNode(page, state, node.id);
  await expect(page.getByTestId('scene-detail')).toContainText('1 breaks to extract');
  // Resume using the ordinary action; the clue does not expire during rock regeneration.
  await expect.poll(async () => (await saved(page)).run.floors['D-001'].nodes.find((n) => n.id === node.id)!.hp, { timeout: 30000 }).toBe(node.maxHp);
  // The restored job is already selected; clicking it again would count as the first mining swing.
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-player-state', 'MINING');
  for (let i = 0; i < Math.ceil(node.maxHp / 10); i++) {
    await expect(page.locator('.game-canvas')).toHaveAttribute('data-swing', 'ready'); await page.keyboard.press('Space');
    await expect(page.locator('.game-canvas')).toHaveAttribute('data-swing', 'active');
    await expect(page.locator('.game-canvas')).toHaveAttribute('data-swing', 'ready');
  }
  await expect.poll(async () => (await saved(page)).run.floors['D-001'].prospecting?.prospectWork[0], { timeout: 8000 }).toBe(2);
  await expectDiscoveryArt(page, 'traces', `${plan.signal.toLowerCase()}-spent`);
  await info.attach('trace-spent', { body: await page.screenshot(), contentType: 'image/png' });
});

test('pickup hold leaves uncollected ore and releases the lift without draining the whole floor', async ({ page }, info) => {
  const state = createGameState(667); state.run.depth.unlocked.push('D-030'); state.run.porter.enabled = true;
  state.run.porter.state = 'RETURNING_TO_ELEVATOR'; state.run.porter.carried = [loot('IRON', 'held')];
  state.run.floors['D-001'].loot = Array.from({ length: 50 }, (_, i) => ({ ...loot('IRON', `floor-${i}`), x: 154 }));
  await seed(page, state); await ui(page, 'lift-open').click();
  await ui(page, 'lift-item-porter-hold').click(); await ui(page, 'lift-activate').click();
  await expect(modal(page)).toContainText('NEW PICKUPS PAUSED');
  await info.attach('porter-pickup-hold', { body: await page.screenshot(), contentType: 'image/png' });
  await page.keyboard.press('Escape'); await expect(ui(page, 'send')).toBeEnabled({ timeout: 8000 }); await ui(page, 'send').click();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'IDLE_BOTTOM', { timeout: 12000 });
  await ui(page, 'lift-open').click(); await ui(page, 'lift-tab-travel').click(); await ui(page, 'lift-item-D-030').click(); await ui(page, 'lift-activate').click();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-depth', 'D-030', { timeout: 8000 });
  await expect.poll(async () => (await saved(page)).run.depth.current, { timeout: 8000 }).toBe('D-030');
  const next = await saved(page); expect(next.run.porter.holdForTravel).toBe(false); expect(next.run.floors['D-001'].loot.length).toBeGreaterThan(40);
});
