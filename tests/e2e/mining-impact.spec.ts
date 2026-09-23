import { expect, test } from '@playwright/test';
import { managementGame } from '../fixtures/management';

// Fixed-time rendering regression, not an additional simulated play-through.
test('merged world layers share impacts, ancient clues stay in front, and gear uses the equipped atlas', async ({ page }, info) => {
  await page.goto('/');
  const state = managementGame();
  state.run.porter.enabled = true;
  state.run.elevator.state = 'ASCENDING';
  state.run.logistics.freightCage.state = 'IDLE';
  const node = state.run.floors['D-001'].nodes[0]!;
  Object.assign(state.run.character, { x: node.x - 16, facing: 1, targetNodeId: node.id, state: 'MINING' });
  const result = await page.evaluate(async state => {
    const [rendering, assetsModule, prospecting, uiModule, management] = await Promise.all([
      '/src/render/gameRenderer.ts', '/src/render/assets/gameAssets.ts', '/src/game/prospecting.ts',
      '/src/render/managementUi.ts', '/src/game/management/index.ts',
    ].map(url => import(url)));
    const canvas = document.createElement('canvas');
    const renderer = new rendering.GameRenderer(canvas);
    const assets = assetsModule.gameAssets();
    const required = ['backgroundRock', 'playerBody', 'npcCrewMiner', 'npcPorter', 'workMachines', 'discoveryHost', 'workTools', 'elevator', 'discoveryGate'];
    for (let n = 0; n < 100 && required.some(key => !assets.ready(key)); n++) await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = canvas.getContext('2d')!;
    type Paint = { file: string; source: number[]; x: number; y: number };
    let images: Paint[] = []; let chips: { x: number; y: number }[] = []; let notices: number[] = []; let order: string[] = [];
    const draw = ctx.drawImage.bind(ctx); const fill = ctx.fillRect.bind(ctx);
    ctx.drawImage = (...args: Parameters<typeof draw>) => {
      if (args[0] instanceof HTMLImageElement) {
        const file = args[0].src.split('/').pop()!.split('?')[0]!;
        const point = ctx.getTransform().transformPoint(new DOMPoint(Number(args[args.length === 9 ? 5 : 1]), Number(args[args.length === 9 ? 6 : 2])));
        images.push({ file, source: args.slice(1, 5) as number[], x: point.x, y: point.y });
        order.push(file);
      }
      draw(...args);
    };
    ctx.fillRect = (x, y, w, h) => {
      const point = ctx.getTransform().transformPoint(new DOMPoint(x, y));
      if (ctx.fillStyle === '#8b7770' && w === 2 && h === 2) chips.push({ x: point.x, y: point.y });
      if (x === 147 && y === 9 && w === 186 && h === 16) notices.push(point.x);
      if (x === 0 && y === 42 && w === 214 && h === 134) order.push('ancient-background');
      if ((w === 34 && h === 19 && y === 188) || (w === 36 && h === 23 && y === 184) || (w === 44 && h === 29 && y === 178)) order.push('ancient-facade');
      fill(x, y, w, h);
    };
    const reset = () => { images = []; chips = []; notices = []; order = []; };
    renderer.render(state, 100); const resting = images;
    reset();
    renderer.handleEvent({ id: 1, at: 0, type: 'MINER_SWING_HIT', data: { depth: 'D-001', nodeId: state.run.character.targetNodeId, damage: 1 } }, state, 100);
    renderer.handleEvent({ id: 2, at: 0, type: 'DATA_GAIN', data: { amount: 1 } }, state, 100);
    renderer.render(state, 100);
    const shifts = images.map((paint, i) => ({ file: paint.file, same: paint.file === resting[i]?.file && JSON.stringify(paint.source) === JSON.stringify(resting[i]?.source), dx: paint.x - resting[i]!.x, dy: paint.y - resting[i]!.y }));
    const impact = { shifts, chips, notices, count: images.length, resting: resting.length };
    reset(); renderer.render(state, 361); const expiredChips = chips.length;
    // A still-live impact cannot follow the player into a different floor.
    renderer.handleEvent({ id: 3, at: 0, type: 'MINER_SWING_HIT', data: { depth: 'D-001', nodeId: state.run.character.targetNodeId, damage: 1 } }, state, 400);
    state.run.depth.current = 'D-030'; reset(); renderer.render(state, 410); const offscreenChips = chips.length;

    state.run.depth.current = 'D-180';
    const floor = state.run.floors['D-180'];
    for (let n = 0; n < 6; n++) prospecting.advanceProspecting(floor, floor.nodes[0]);
    reset(); renderer.render(state, 500); const ancientOrder = order;
    const ancientImage = canvas.toDataURL();

    // The comparison reuses the same work-tools sheet, with no second tool-style mapping.
    const [current, candidate] = state.run.phase5.equipment.inventory;
    current!.affixes = [{ id: 'FOSSIL_BREAKER', name: 'Fossil', description: '', value: .2 }];
    candidate!.affixes = [{ id: 'RESEARCH_PRISM', name: 'Research', description: '', value: .2 }];
    state.run.phase5.equipment.equippedPlayer.TOOL = current!.id;
    const ui = management.createManagementState(state, { station: 'equipment', selectedId: candidate!.id });
    const viewport = { width: 960, height: 568, world: { x: 0, y: 0, width: 480, height: 270 } };
    const layout = uiModule.layoutManagementUi(state, ui, viewport);
    canvas.width = 960; canvas.height = 568; ctx.imageSmoothingEnabled = false;
    reset(); uiModule.drawManagementUi(ctx, viewport, layout, null, null, assets);
    return { ready: required.every(key => assets.ready(key)), impact, expiredChips, offscreenChips, ancientOrder, ancientImage,
      toolRows: images.filter(p => p.file === 'work-tools-atlas.png' && p.source[2] === 16).map(p => p.source[1]), equipmentImage: canvas.toDataURL() };
  }, state);
  expect(result.ready).toBe(true);
  expect(result.impact.count).toBe(result.impact.resting);
  for (const name of ['background-rock-base.png', 'player-body-atlas.png', 'npc-crew-miner-atlas.png', 'npc-porter-atlas.png', 'work-machines-atlas.png', 'discovery-lift-gate-atlas.png']) {
    expect(result.impact.shifts.some(p => p.file === name), name).toBe(true);
  }
  expect(result.impact.shifts.every(p => p.same && p.dx === -1 && p.dy === 0)).toBe(true);
  expect(result.impact.chips).toHaveLength(5);
  expect(result.impact.chips[0]).toEqual({ x: node.x - 4, y: node.y + 13 - 12 });
  expect(result.impact.notices).toEqual([147]);
  expect(result.expiredChips).toBe(0); expect(result.offscreenChips).toBe(0);
  const host = result.ancientOrder.indexOf('discovery-host-atlas.png');
  expect(host).toBeGreaterThan(result.ancientOrder.lastIndexOf('ancient-facade'));
  expect(result.ancientOrder.indexOf('ancient-background')).toBeLessThan(result.ancientOrder.indexOf('ancient-facade'));
  expect(result.ancientOrder.indexOf('player-body-atlas.png')).toBeGreaterThan(host);
  expect(result.toolRows).toEqual([94, 174]);
  for (const [name, image] of [['ancient-layer-order', result.ancientImage], ['shared-tool-comparison', result.equipmentImage]]) {
    await info.attach(name!, { body: Buffer.from(image!.split(',')[1]!, 'base64'), contentType: 'image/png' });
  }
});
