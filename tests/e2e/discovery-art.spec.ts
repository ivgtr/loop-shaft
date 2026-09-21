import { expect, test, type Page } from '@playwright/test';
import { createGameState } from '../../src/game/createGame';
import { SAVE_INTERVAL } from '../../src/game/config';
import { appraisePhysicalCargo, restoreFossil } from '../../src/game/appraisal';
import { advanceProspecting, applyOreQuality, floorProspects } from '../../src/game/prospecting';
import { SAVE_KEY, serializeGameState } from '../../src/game/save';
import { cargoSpriteFrame, discoveryHostFrame } from '../../src/render/discoveryVisuals';
import { deriveSemanticRenderState } from '../../src/render/semanticRenderState';
import type { GameState } from '../../src/game/types';
import { loot } from '../fixtures/discovery';

type Paint = { file: string; args: number[]; ui: boolean };
type Capture = Window & { spritePaint: Paint[] };
const ui = (page: Page, id: string) => page.locator(`.canvas-hit[data-ui-action="${id}"]`);
const saved = (page: Page): Promise<GameState> => page.evaluate(key => JSON.parse(localStorage.getItem(key)!), SAVE_KEY);
// Async pickup/loading finish after the command save; allow the next periodic save.
const persisted = { timeout: SAVE_INTERVAL * 2000 };
async function seed(page: Page, state: GameState) {
  await page.addInitScript(({ key, value }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
    const capture = window as unknown as Capture; capture.spritePaint = [];
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (image: CanvasImageSource, ...args: number[]) {
      if (image instanceof HTMLImageElement && /(?:discovery|node-).*atlas\.png/.test(image.src)) {
        capture.spritePaint.push({ file: image.src.split('/').pop()!.split('?')[0]!, args, ui: this.canvas.classList.contains('game-ui-canvas') });
        if (capture.spritePaint.length > 1200) capture.spritePaint.splice(0, 600);
      }
      return Reflect.apply(draw, this, [image, ...args]);
    };
  }, { key: SAVE_KEY, value: serializeGameState(state) });
  await page.goto('/');
  await expect.poll(() => paints(page, 'discovery-cargo-atlas.png')).not.toHaveLength(0);
}
const paints = (page: Page, file: string): Promise<Paint[]> => page.evaluate(file => (window as unknown as Capture).spritePaint.filter(p => p.file === file), file);
const resetPaint = (page: Page) => page.evaluate(() => { (window as unknown as Capture).spritePaint = []; });
function frame(p: Paint, w: number, h: number, columns: number): number { return p.args[0]! / w + p.args[1]! / h * columns; }
async function openArchive(page: Page) {
  await ui(page, 'base').click();
  for (let i = 0; i < 20; i++) {
    if (await page.getByRole('dialog').getAttribute('data-selected-item') === 'archive') break;
    const row = ui(page, 'station-item-archive');
    if (await row.count()) { await row.click(); break; }
    await ui(page, 'station-next').click();
  }
  await ui(page, 'station-activate').click();
  await expect(ui(page, 'station-tab-finds')).toBeVisible();
}
function displayGame(): GameState {
  const state = createGameState(771); const floor = state.run.floors['D-001'];
  for (let i = 0; i < 18; i++) advanceProspecting(floor, floor.nodes[0]!);
  const first = floorProspects(floor)[0]!;
  const node = floor.nodes.find(n => n.id === first.nodeId)!;
  for (let i = first.work; i < first.required; i++) advanceProspecting(floor, node);
  node.hp = node.maxHp; // ordinary ore has regenerated; finite host must stay spent
  const second = floorProspects(floor)[1]!;
  advanceProspecting(floor, floor.nodes.find(n => n.id === second.nodeId)!);
  floor.loot = (['NORMAL', 'FINE', 'PURE'] as const).map((quality, i) => {
    const item = { ...loot('IRON', `floor-${quality}`), x: 58 + i * 14 }; applyOreQuality(item, quality); return item;
  });
  state.run.character.carried = [{ ...loot('AMMONITE', 'hand-sealed'), specimen: { grade: 'INTACT', value: 63 } }];
  state.run.elevator.cargo = [{ ...loot('STRANGE_VERTEBRA', 'lift-sealed'), specimen: { grade: 'PRISTINE', value: 500 } },
    { ...loot('IRON', 'lift-pure'), quality: 'PURE' }];
  state.run.depth.unlocked.push('D-030'); state.meta.bestDepth = 'D-030';
  appraisePhysicalCargo(state, Array.from({ length: 6 }, (_, i) => ({ ...loot('TRILOBITE', `known-${i}`), specimen: { grade: 'INTACT', value: 63 } })), () => undefined);
  restoreFossil(state, 'AMMONITE');
  appraisePhysicalCargo(state, [{ ...loot('ANCIENT_FISH', 'pristine'), specimen: { grade: 'PRISTINE', value: 200 } }], () => undefined);
  return state;
}

for (const width of [320, 390, 1280]) test(`real atlas projections and archive at ${width}px`, async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width, height: 844 }); const state = displayGame();
  const expectedHosts = [...deriveSemanticRenderState(state, 0).discoveries.values()].map(discoveryHostFrame).sort();
  await seed(page, state);
  await expect.poll(async () => [...new Set((await paints(page, 'discovery-host-atlas.png')).map(p => frame(p, 48, 40, 4)))].sort()).toEqual(expectedHosts);
  await expect.poll(async () => [...new Set((await paints(page, 'discovery-cargo-atlas.png')).map(p => frame(p, 12, 10, 10)))]).toEqual(expect.arrayContaining([3, 4, 5, 9]));
  for (const p of await paints(page, 'discovery-cargo-atlas.png')) expect(p.args.slice(-2)).toEqual([12, 10]);
  await info.attach(`world-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.locator('.game-canvas').evaluate(element => { element.style.filter = 'grayscale(1)'; });
  await info.attach(`world-grayscale-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  await page.reload();
  await expect.poll(async () => [...new Set((await paints(page, 'discovery-host-atlas.png')).map(p => frame(p, 48, 40, 4)))].sort()).toEqual(expectedHosts);
  await openArchive(page); await resetPaint(page);
  await expect.poll(async () => [...new Set((await paints(page, 'discovery-collection-atlas.png')).filter(p => p.ui).map(p => frame(p, 24, 24, 5)))]).toEqual(expect.arrayContaining([0, 5, 12, 16]));
  await info.attach(`archive-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
  expect(errors).toEqual([]);
});

test('the same Pure ore sprite travels from floor through hands and a closed moving lift', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); const state = createGameState(840);
  const item = { ...loot('IRON', 'tracked-pure'), x: 120 }; applyOreQuality(item, 'PURE');
  state.run.character.x = 120; state.run.floors['D-001'].loot = [item]; await seed(page, state);
  const hasPure = async () => (await paints(page, 'discovery-cargo-atlas.png')).some(p => frame(p, 12, 10, 10) === cargoSpriteFrame(item));
  await expect.poll(hasPure).toBe(true); await ui(page, 'interact').click();
  await expect(page.getByRole('region', { name: 'Mining status' })).toContainText('PACK 2.0/8kg');
  await expect.poll(async () => (await saved(page)).run.character.carried.map(i => i.id), persisted).toEqual([item.id]);
  await resetPaint(page); await expect.poll(hasPure).toBe(true);
  await info.attach('pure-in-hands', { body: await page.screenshot(), contentType: 'image/png' });
  await ui(page, 'return').click(); await expect(ui(page, 'send')).toBeEnabled({ timeout: 15000 });
  await expect.poll(async () => (await saved(page)).run.elevator.cargo.map(i => i.id), persisted).toEqual([item.id]);
  await resetPaint(page); await expect.poll(hasPure).toBe(true); await ui(page, 'send').click();
  await expect(page.locator('.game-canvas')).toHaveAttribute('data-elevator-state', 'ASCENDING');
  await expect.poll(() => paints(page, 'discovery-lift-gate-atlas.png')).not.toHaveLength(0);
  await info.attach('pure-in-moving-lift', { body: await page.screenshot(), contentType: 'image/png' });
  await expect.poll(async () => (await saved(page)).run.scrap, { timeout: 15000 }).toBe(item.value);
  await page.reload(); expect((await saved(page)).run.scrap).toBe(item.value);
  expect((await saved(page)).run.floors['D-001'].loot).toHaveLength(0);
});
