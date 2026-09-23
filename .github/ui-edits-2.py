write('src/render/gameRenderer.ts', 'c1c2c6b7a2902390c54ca9c0c5cac7d78240ace77f10f44b66bd1a2ee2da3a1a', 'b475a4588d69f1f071a2b8ce3448363e43579060aa3434dc9236f356cb37267c', [
(0,0,"import { fieldGuideTarget, type FieldHint } from '../game/fieldUi';\n"),
(6,7,"import { isFirstLiveScrapGain } from '../game/initialLogisticsGuide';\n"),
(11,12,"import { drawDeliveryNotice } from './initialGuideOverlay';\n"),
(13,13,'  sameInteractionTarget,\n'),
(52,53,'  render(state: GameState, now: number, hoveredKey: string | null = null, hint: FieldHint | null = null): void {\n'),
(84,87,'''    const guide = fieldGuideTarget(state);
    const guideTargetKey = targets.find(target => sameInteractionTarget(target.ref, guide))?.key ?? null;
    drawInteractionOverlay(this.ctx, targets, state.selection, hoveredKey, guideTargetKey, state, hint);
''')])
write('src/render/gameUi.ts', 'd7114655cd9370587f1b1836a7b0d1eca07182bc027a62a2e78c45e50d448bfe', '4c88ca958755e0ab00baef7230658a6c1a32df31ab7e64b06056955e45675670', [
(2,2,'''import { fieldResources, fieldInstruction, liftNeedsAttention } from '../game/fieldUi';
import { stationAvailable } from '../game/management';
import { surveyRequest } from '../game/management/survey';
import { drawMeter } from './meters';
'''),
(6,8,"import { C, drawButton, lines, text, icon, type UiButton, type UiViewport, type WorkshopUiAction } from './workshopUi';\n"),
(66,74,'''    { id: 'left', label: 'Walk left', text: '<', action: { type: 'direction', direction: -1 }, tone: 'quiet', disabled: !available },
    { id: 'right', label: 'Walk right', text: '>', action: { type: 'direction', direction: 1 }, tone: 'quiet', disabled: !available },
    { id: 'mine', label: 'MINE', text: 'MINE', action: { type: 'command', command: { type: 'mine' } }, disabled: !canRequestMine(state), tone: 'primary', busy: available && Boolean(state.run.character.swing) },
    { id: 'interact', label: interaction.label, text: interaction.label, action: { type: 'command', command: { type: 'interact' } }, disabled: interaction.reason !== null, tone: 'primary', busy: ['COLLECTING', 'LOADING'].includes(state.run.character.state) },
    { id: 'return', label: 'RETURN', text: 'RETURN', tone: 'quiet', action: { type: 'command', command: { type: 'return' } }, disabled: !available || carriedWeight(state) === 0 },
    { id: 'stop', label: 'CANCEL', text: 'STOP', action: { type: 'command', command: { type: 'cancel' } }, disabled: state.run.character.state === 'IDLE' && state.selection === null, tone: 'quiet' },
    { id: 'lift-open', label: 'Open elevator controls', text: 'LIFT', tone: 'quiet', action: { type: 'lift-open' }, disabled: Boolean(state.run.elevator.travel) },
    { id: 'help', label: 'Controls and current objective', text: '?', tone: 'quiet', action: { type: 'help-open' } },
'''),
(90,102,'''    width: 96, height: 44, disabled: !canDispatchElevator(state), tone: 'primary' });
  const top = h - (compact ? 144 : 100);
  buttons.push({ id: 'pack-inspect', label: `Inspect backpack: ${Number(carriedWeight(state).toFixed(1))} of ${state.run.character.backpackCapacity} kilograms`, text: '',
    action: { type: 'station-open', request: { station: 'survey', tab: 'cargo', selectedId: 'backpack' } },
    x: 8, y: top, width: 156, height: 44, disabled: !stationAvailable(state, 'survey') || Boolean(state.run.elevator.travel) });
  buttons.push({ id: 'inspect', label: 'Inspect mining site', text: 'INSPECT', tone: 'quiet',
    action: { type: 'station-open', request: surveyRequest(state) }, x: w - 104, y: top, width: 96, height: 44,
    disabled: !stationAvailable(state, 'survey') || Boolean(state.run.elevator.travel) });
  buttons.push({ id: 'base', label: 'Open base facilities', text: 'BASE', tone: 'quiet', action: { type: 'station-open', request: { station: 'facilities' } },
'''),
(123,124,'''      const reason = item.reason ?? (elevator.tab === 'dispatch' && item.id === 'shipment' ? shipmentStatus(state) : null);
      if (reason) lines(ctx, reason, x, p.y + p.height - 106, width, 12, 2, C.installed);
'''),
(127,128,"      const controls = ['A / D or arrows: walk', 'Space / MINE: one swing', 'E: pick up, load, or inspect', 'F / SEND: send loaded cargo', 'RETURN: walk back and unload', 'Esc: close a window / stop', 'I / INSPECT: field notes'];\n"),
(129,130,'      if (p.height >= 350) lines(ctx, sceneReadout(state).goal, x, p.y + 258, width, 12, 2, C.gold);\n'),
(133,133,'    const resources = fieldResources(state);\n'),
(134,140,'''    const wallet = [`SCRAP ${amount(run.scrap)}`, resources.data ? `DATA ${amount(run.data)}` : '', resources.core ? `CORE ${amount(state.meta.core)}` : ''].filter(Boolean).join('  ');
    text(ctx, wallet, 10, 22, 12, C.gold);
    text(ctx, `${run.depth.current}${resources.run ? `  RUN ${String(state.meta.runIndex).padStart(2, '0')}` : ''}`,
      compact ? 10 : w - 10, compact ? 44 : 22, 12, C.light, compact ? 'left' : 'right');
    const instruction = fieldInstruction(state);
    if (instruction) lines(ctx, instruction, 12, compact ? 77 : 62, Math.min(w - 104, 440), 12, 2, C.gold);
    const top = h - (compact ? 144 : 100);
'''),
(141,156,'''    const bag = layout.buttons.find(button => button.id === 'pack-inspect')!;
    const bagFocused = focused === bag.id || hovered === bag.id;
    if (bagFocused) { ctx.strokeStyle = C.light; ctx.lineWidth = 1; ctx.strokeRect(bag.x + 1, bag.y + 1, bag.width - 2, bag.height - 2); }
    icon(ctx, 'pack', bag.x + 3, bag.y + 7, 2, false);
    const weight = carriedWeight(state); const capacity = run.character.backpackCapacity;
    drawMeter(ctx, { x: bag.x + 40, y: bag.y + 18, width: 100, height: 8 }, weight, capacity, weight >= capacity);
    if (bagFocused) text(ctx, `${Number(weight.toFixed(1))}/${capacity} kg`, bag.x + 40, bag.y + 13, 10, C.light);

    const send = layout.buttons.find(button => button.id === 'send')!;
    const cabinet = { x: send.x - 4, y: send.y - 32, width: send.width + 8, height: 80 };
'''),
(159,163,'''    const load = cargoWeight(run.elevator.cargo);
    drawMeter(ctx, { x: send.x + 4, y: send.y - 13, width: send.width - 8, height: 8 }, load, run.elevator.maxLoad, load >= run.elevator.maxLoad);
    if (focused === 'send' || hovered === 'send') text(ctx, `${Number(load.toFixed(1))}/${run.elevator.maxLoad} kg`, send.x + 4, send.y - 18, 10, C.light);
    else if (liftNeedsAttention(state)) text(ctx, run.porter.holdForTravel ? 'II' : run.automation.autoDispatch.enabled ? 'A' : 'II', send.x + 4, send.y - 18, 10, C.gold);
    else if (['ASCENDING', 'DESCENDING', 'UNLOADING'].includes(run.elevator.state)) {
      // A tiny directional indicator complements the actual moving cage, not another status caption.
      const x = send.x + 9; const y = send.y - 23; const down = run.elevator.state === 'DESCENDING';
      ctx.fillStyle = C.muted;
      for (let row = 0; row < 3; row++) ctx.fillRect(x - row, y + (down ? -row : row), row * 2 + 1, 1);
    }
'''),
(165,166,"  for (const button of layout.buttons) if (button.id !== 'pack-inspect') drawButton(ctx, button, focused === button.id, compact, hovered === button.id);\n")])
write('src/render/interactionOverlay.ts', 'b79c62166a51bd3129940bc8ec3e0794797c690be029d8aa06fd15d3f42414ba', '49f7e467004f2c4e3397c10bc62426b0211a3125d57799ada97b936433811786', [
(0,0,"import { D001_VISUAL_GROUND_OFFSET } from './semanticRenderState';\nimport { drawMeter } from './meters';\nimport type { FieldHint } from '../game/fieldUi';\n"),
(1,2,"import type { GameState, Selection } from '../game/types';\n"),
(22,22,'  state?: GameState,\n  hint: FieldHint | null = null,\n'),
(30,33,'''      if (selected || hovered) drawCornerFrame(ctx, rect, hovered, selected);
    }
    if (guided && !selected && !hovered) {
      const x = Math.round(target.labelAnchor.x); const y = Math.round(target.labelAnchor.y - 4);
      ctx.fillStyle = COLORS.selected;
      ctx.fillRect(x - 3, y - 3, 7, 1); ctx.fillRect(x - 2, y - 2, 5, 1); ctx.fillRect(x - 1, y - 1, 3, 1);
    }
    if (state && target.ref.type === 'node') {
      const id = target.ref.id;
      const node = state.run.floors[state.run.depth.current].nodes.find(node => node.id === id);
      const working = state.run.character.targetNodeId === id && state.run.character.state === 'MINING';
      if (node && node.hp > 0 && (selected || hovered || working)) {
        const rect = target.emphasisRects[0]!;
        drawMeter(ctx, { x: rect.x + 4, y: rect.y - 6, width: rect.width - 8, height: 4 }, node.hp, node.maxHp);
      }
'''),
(37,37,"  if (hint) drawFieldHint(ctx, { ...hint, y: hint.y + (state?.run.depth.current === 'D-001' ? D001_VISUAL_GROUND_OFFSET : 0) });\n"),
(40,42,'''function drawCornerFrame(ctx: CanvasRenderingContext2D, rect: Rect, hovered: boolean, selected = false): void {
  ctx.strokeStyle = hovered ? COLORS.hover : selected ? COLORS.selected : COLORS.normal;
'''),
(53,74,''),
(75,76,'''  const warning = target.shortStatus && !/^(DEPLETED|TRAVELING|ASCENDING|DESCENDING|UNLOADING|LOADING|MOVING|SWINGING|COLLECTING)/.test(target.shortStatus) ? target.shortStatus : null;
  const text = warning ? `${target.displayName} · ${warning}` : target.displayName;
'''),
(80,81,'  let y = Math.round(target.labelAnchor.y - height - 8);\n'),
(98,98,'''\nexport function drawFieldHint(ctx: CanvasRenderingContext2D, hint: FieldHint): void {
  const font = fitPixelFont(hint.text, WORLD.width - 12);
  const width = measurePixelText(hint.text, font) + 8;
  const x = Math.round(clamp(hint.x - width / 2, 2, WORLD.width - width - 2));
  const y = Math.round(clamp(hint.y - 12, 39, WORLD.height - 14));
  ctx.fillStyle = COLORS.labelBackground; ctx.fillRect(x, y, width, 12);
  ctx.fillStyle = COLORS.selected; ctx.fillRect(x, y + 11, width, 1);
  ctx.fillStyle = COLORS.labelText; drawPixelText(ctx, hint.text, x + 4, y + 8, { font, baseline: 'bottom' });
}
''')])
write('src/render/interactionTargets.ts', '90a7c97503ac4054726fae482003f6b15ffe3d0748089355d5014014dd986407', '45190dcf188756b001cda67314af2603cece05c33340dcbdc3376b8b5fc88d0e', [
(4,5,"import { canDispatchElevator, cargoWeight, currentFloor } from '../game/simulation';\n"),
(91,95,'''      // Affordance describes the site, not the input buffer of an individual swing.
      const available = canMoveToNode(state, node);
      const status = remote ? 'NO WALKWAY' : depleted ? 'DEPLETED' : available ? null : 'USE THE SCANNER';
''')])
write('src/render/managementUi.ts', '44ca5933f23584b1816ddb36bed10bfc29ab6ee1c73b7d1356f5baf2520a0e40', '8b60aa43eaa1e14ef18fa5c133b274773c8cc6a267c257fb0b4297983d798bc2', [
(234,235,"  if (ui.station !== 'survey') add('station-activate', confirming ? decision?.confirmLabel ?? 'CONFIRM CHOICE' : item.actionLabel,\n"),
(247,247,"  if (ui.station === 'survey') return ui.tab === 'veins' ? 'VEIN' : 'CARGO';\n")])
write('src/render/meters.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '62d28b836e6771157083e764474882a7517c3ba4178772021a9069828b8abcbd', [(0,0,'''import type { Rect } from './interactionTargets';

/** Integer pixels, actual proportions, no labels or animated/fabricated progress. */
export function drawMeter(ctx: CanvasRenderingContext2D, box: Rect, value: number, total: number, warning = false): void {
  const x = Math.round(box.x); const y = Math.round(box.y);
  const width = Math.max(3, Math.round(box.width)); const height = Math.max(3, Math.round(box.height));
  const ratio = total > 0 && Number.isFinite(value / total) ? Math.max(0, Math.min(1, value / total)) : 0;
  ctx.fillStyle = '#b0a397'; ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#171519'; ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
  ctx.fillStyle = warning ? '#e3aa89' : '#caaa68';
  const fill = Math.round((width - 2) * ratio);
  if (fill) ctx.fillRect(x + 1, y + 1, fill, height - 2);
  if (warning) {
    // Hatching identifies a full/blocked capacity without relying on color.
    ctx.fillStyle = '#171519';
    for (let offset = 4; offset < fill; offset += 6) ctx.fillRect(x + offset, y + 1, 1, height - 2);
  }
}
''')])
write('src/render/workshopUi.ts', 'dc68442d23ca40dd62bb8eaba00bbe9d2f2cf4cc9b559e929ad99f54d57cf7f0', 'b36faa563b02746b66efdb9250636f4d56a3ace89b34403a60df85ba89141e8f', [
(11,12,"  disabled?: boolean; selected?: boolean; tone?: 'primary' | 'quiet'; busy?: boolean; icon?: WorkshopIcon; owned?: boolean; badge?: string; detail?: string;\n"),
(90,91,'\n'),
(98,101,'''    if (!item.owned && item.reason) lines(ctx, item.reason, x, statusY, width, 12, 2, C.warning);
    // Owned marker and action already express fitted/active state. Only announce a purchase once.
    if (workshop.notice) lines(ctx, workshop.notice, x, p.y + p.height - 78, width, 11, 1, C.installed);
'''),
(107,109,'''  const dimmed = b.disabled && !b.busy;
  ctx.fillStyle = dimmed ? '#19171b' : b.selected || b.tone === 'primary' ? '#3b3025' : hovered ? '#302a2e' : b.tone === 'quiet' ? C.background : '#282228'; ctx.fillRect(b.x, b.y, b.width, b.height);
  ctx.strokeStyle = focused ? C.light : b.selected || (b.tone === 'primary' && !dimmed) ? C.gold : b.tone === 'quiet' && !hovered ? C.background : '#594a42'; ctx.lineWidth = focused ? 2 : 1;
'''),
(128,129,"    text(ctx, label, b.x + b.width / 2, b.y + b.height / 2 + 4, 12, dimmed ? C.disabled : b.tone === 'quiet' ? C.muted : C.light, 'center');\n")])
