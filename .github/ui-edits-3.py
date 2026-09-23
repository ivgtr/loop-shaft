write('src/runtime/GameRuntime.ts', 'ffc0e13d1e33a6e1c2b8228b24cf25ef03a60eb291ed4bba7b050b81f9728e81', '15d262fab3aa33ae2539fe962c08c0ac65625e947426402fdea4a27bea8bc3d7', [
(0,0,"import { fieldActionHint, type FieldHint } from '../game/fieldUi';\nimport { surveyRequest } from '../game/management/survey';\n"),
(86,86,'  readonly controlHint: FieldHint | null;\n'),
(114,114,'  private controlHint: FieldHint | null = null;\n  private hintExpiresAt = 0;\n'),
(193,193,'''  explainControl(command: GameCommand): void {
    if (this.windowOpen) return;
    this.setControlHint(command);
    this.publish();
  }

  private setControlHint(command: GameCommand): void {
    this.controlHint = fieldActionHint(this.state, command);
    this.hintExpiresAt = performance.now() + 2200;
  }

'''),
(237,237,"      if (node?.hp === 0) this.setControlHint({ type: 'mine', nodeId: ref.id });\n      else this.controlHint = null;\n"),
(459,459,'    if (!this.windowOpen) this.setControlHint(command);\n'),
(559,560,'''    if (this.controlHint && now >= this.hintExpiresAt) this.controlHint = null;
    this.renderer?.render(this.state, now, this.hoveredKey, this.windowOpen ? null : this.controlHint);
'''),
(578,579,"    if (![...LEFT_KEYS, ...RIGHT_KEYS, 'Space', 'KeyE', 'KeyF', 'KeyI'].includes(event.code)) return;\n"),
(588,588,"    else if (event.code === 'KeyI') this.openManagement(surveyRequest(this.state));\n"),
(644,644,'    this.controlHint = null;\n'),
(656,657,'    return Object.freeze({ revision: this.revision, controlHint: this.controlHint ? { ...this.controlHint } : null, presentation: { ...this.presentation }, state: structuredClone(this.state),\n')])
write('src/style.css', '7a91b35fcc2fb53df27e480e10a5b64d45f3e652cf043bae6c339a1493929a85', '93aca4a20728f06d5ed88baa212988f85312fbdc5021065f9b443883b1cd2182', [
(6,7,'.game-shell { position:relative; width:100%; border:1px solid #302a32; background:#0b0a0d; box-shadow:0 18px 54px #000; padding-bottom:100px; }\n'),
(18,19,'    padding-top:110px; padding-bottom:144px; }\n')])
write('tests/e2e/quiet-ui.spec.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'b5e0ef8c7226180c62ac97c81083be3b2edd7d9af3126f25756c50643a55f490', [(0,0,'''import { expect, test } from '@playwright/test';
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
''')])
write('tests/e2e/workshop.spec.ts', 'ed80e43d7a353ba4430c5452f864f3a50077f03ff850f92c2af3e1d72eecdb40', 'ab290ba7e0f06e1e84605f1675c3fe3abeae42eb1836a5bf41978e446743b724', [
(60,61,"  await expect(page.getByTestId('resource-status')).toContainText('SCRAP 164', { timeout: 15_000 });\n  await expect(ui(page, 'goal')).toHaveCount(0);\n"),
(63,64,'  await clickWorld(page, 202, 216);\n'),
(78,79,"  await expect(page.getByTestId('scene-detail')).toContainText('Runner Boots');\n  await expect(ui(page, 'goal')).toHaveCount(0);\n"),
(99,100,'  await clickWorld(page, 202, 216);\n'),
(135,136,'  await clickWorld(page, 202, 216);\n'),
(194,195,"      const bench = (await page.locator('.game-canvas').boundingBox())!;\n      await page.touchscreen.tap(bench.x + bench.width * 202 / 480, bench.y + bench.height * 216 / 270);\n")])
