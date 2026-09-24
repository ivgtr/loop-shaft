import { inspectedNode } from '../../game/fieldUi';
import { shipmentStatus } from '../../game/elevatorUi';
import { gameAssets } from '../../render/assets/gameAssets';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useGameRuntime, useGameSnapshot } from '../../app/GameProvider';
import { selectedWorkshopItem, workshopItems } from '../../game/workshop';
import { drawWorkshopUi, layoutWorkshopUi, type UiViewport } from '../../render/workshopUi';
import '../workshop/workshop.css';
import { drawGameUi, layoutGameUi, type GameUiAction } from '../../render/gameUi';
import { elevatorItems, selectedElevatorItem } from '../../game/elevatorUi';
import { sceneReadout } from '../../game/hud';
import { stationView, selectedStationItem } from '../../game/management';
import { drawManagementUi, layoutManagementUi } from '../../render/managementUi';
import { cargoValue, carriedWeight, cargoWeight } from '../../game/simulation';
import { t } from '../../i18n';
import { displayText } from '../../i18n/display';

/** The visible interface is painted on Canvas. Transparent native buttons supply
 * focus, touch hit areas and screen-reader semantics from the SAME layout. */
export function GameUiCanvas() {
  const runtime = useGameRuntime();
  const assets = useMemo(gameAssets, []);
  const { state, workshop, elevatorUi, helpOpen, management, presentation, controlHint } = useGameSnapshot();
  const locale = presentation.locale;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const focusSelectedItem = useRef(false);
  const [viewport, setViewport] = useState<UiViewport>({ width: 0, height: 0, world: { x: 0, y: 0, width: 0, height: 0 } });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const open = workshop !== null || elevatorUi !== null || helpOpen || management !== null;
  const heldPointer = useRef<{ id: number; button: string } | null>(null);
  const managementLayout = useMemo(() => management ? layoutManagementUi(state, management, viewport, locale) : null, [state, management, viewport, locale]);
  const layout = useMemo(() => workshop ? layoutWorkshopUi(state, workshop, viewport, locale) : layoutGameUi(state, elevatorUi, helpOpen, viewport, presentation), [state, workshop, elevatorUi, helpOpen, viewport, presentation, locale]);
  const buttons = managementLayout?.buttons ?? layout.buttons;
  const readout = sceneReadout(state, locale);
  const node = inspectedNode(state);

  useEffect(() => { document.documentElement.lang = locale; }, [locale]);

  useLayoutEffect(() => {
    // A lost browser focus may never deliver pointerup to the original button.
    const releasePointer = () => { heldPointer.current = null; runtime.releaseInputs(); };
    const visibility = () => { if (document.hidden) releasePointer(); };
    window.addEventListener('blur', releasePointer);
    document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('blur', releasePointer); document.removeEventListener('visibilitychange', visibility); };
  }, [runtime]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const stage = canvas?.parentElement;
    const world = stage?.querySelector<HTMLCanvasElement>('.game-canvas');
    if (!stage || !world) return;
    const measure = () => {
      const box = stage.getBoundingClientRect(); const scene = world.getBoundingClientRect();
      setViewport({ width: stage.clientWidth, height: stage.clientHeight,
        world: { x: scene.left - box.left - stage.clientLeft, y: scene.top - box.top - stage.clientTop, width: scene.width, height: scene.height } });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(stage); observer.observe(world);
    window.addEventListener('resize', measure); measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewport.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.round(viewport.width * dpr); const height = Math.round(viewport.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.imageSmoothingEnabled = false;
    if (managementLayout) drawManagementUi(ctx, viewport, managementLayout, focused, hovered, assets);
    else if (workshop && 'itemCount' in layout) drawWorkshopUi(ctx, state, workshop, viewport, layout, focused, hovered, locale);
    else if (!('itemCount' in layout)) drawGameUi(ctx, state, elevatorUi, helpOpen, viewport, layout, focused, hovered, locale);
  }, [state, workshop, elevatorUi, helpOpen, managementLayout, layout, viewport, focused, hovered, assets, locale]);

  useLayoutEffect(() => {
    setHovered(null);
    if (!open) return;
    heldPointer.current = null;
    // Opening never focuses the purchase button: the player inspects before buying.
    const selected = management?.confirmation ? inputsRef.current?.querySelector<HTMLButtonElement>('[data-ui-action="station-cancel"]')
      : inputsRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"][data-item="true"]');
    (selected ?? inputsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  }, [open, workshop !== null, elevatorUi?.tab, management?.station, management?.subjectId, management?.tab, Boolean(management?.confirmation), layout.compact]);

  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    if (!focusSelectedItem.current && active !== document.body
      && !(active instanceof HTMLButtonElement && active.disabled)) return;
    // Paging can remove the previously focused slot; arrow navigation follows the new selection.
    focusSelectedItem.current = false;
    const fallback = inputsRef.current?.querySelector<HTMLButtonElement>('[data-ui-action="station-cancel"], [data-selected="true"][data-item="true"], [data-ui-action="station-details"]')
      ?? inputsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)');
    fallback?.focus({ preventScroll: true });
  }, [open, state, workshop, elevatorUi, management]);

  function activate(action: GameUiAction): void {
    runtime.unlockAudio();
    if (action.type === 'presentation') runtime.changePresentation(action.setting);
    else if (action.type === 'locale') runtime.setLocale(action.locale);
    else if (action.type === 'station-open') runtime.openManagement(action.request);
    else if (action.type === 'station-close') runtime.closeManagement();
    else if (action.type === 'station-back') runtime.backManagement();
    else if (action.type === 'station-details') runtime.toggleManagementDetails();
    else if (action.type === 'station-option') runtime.selectManagementOption(action.id);
    else if (action.type === 'station-select') runtime.selectManagementItem(action.id);
    else if (action.type === 'station-tab') runtime.selectManagementTab(action.tab);
    else if (action.type === 'station-page') runtime.setManagementPage(action.page);
    else if (action.type === 'station-cancel-confirm') runtime.cancelManagementConfirmation();
    else if (action.type === 'station-activate') runtime.activateManagementItem();
    else if (action.type === 'open') runtime.openWorkshop();
    else if (action.type === 'close') runtime.closeWorkshop();
    else if (action.type === 'select') runtime.selectWorkshopItem(action.id);
    else if (action.type === 'buy') runtime.activateWorkshopItem();
    else if (action.type === 'lift-open') { runtime.openElevator(action.tab); if (action.id) runtime.selectElevatorItem(action.id); }
    else if (action.type === 'lift-close') runtime.closeElevator();
    else if (action.type === 'lift-tab') runtime.selectElevatorTab(action.tab);
    else if (action.type === 'lift-select') runtime.selectElevatorItem(action.id);
    else if (action.type === 'lift-activate') runtime.activateElevatorItem();
    else if (action.type === 'help-open') runtime.openHelp();
    else if (action.type === 'help-close') runtime.closeHelp();
    else if (action.type === 'command') { runtime.dispatch(action.command); const snapshot = runtime.getSnapshot();
      if (!snapshot.workshop && !snapshot.elevatorUi && !snapshot.helpOpen && !snapshot.management) runtime.focusCanvas(); }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    // Native Space/Enter activates exactly once; OS repeat cannot buy then toggle.
    if (event.repeat && ['Space', 'Enter'].includes(event.code)) { event.preventDefault(); return; }
    if (!open) return;
    if (management && ['PageUp', 'PageDown'].includes(event.code)) {
      event.preventDefault();
      if (managementLayout && (managementLayout.detailsAvailable || managementLayout.reading)) runtime.setManagementPage(managementLayout.reading ? Math.max(0, Math.min(managementLayout.pages.length - 1, managementLayout.page + (event.code === 'PageDown' ? 1 : -1))) : 0);
    }
    if ((workshop || elevatorUi || (management && !management.confirmation)) && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      const offset = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1;
      const options = managementLayout?.item.options;
      if (options?.length && document.activeElement?.getAttribute('data-ui-action')?.startsWith('station-option-')) {
        const index = options.findIndex((option) => option.selected);
        const next = options[(index + offset + options.length) % options.length]!;
        runtime.selectManagementOption(next.id);
        inputsRef.current?.querySelector<HTMLButtonElement>(`[data-ui-action="station-option-${next.id}"]`)?.focus({ preventScroll: true });
        return;
      }
      focusSelectedItem.current = true;
      if (workshop) {
        const items = workshopItems(state); const item = selectedWorkshopItem(items, workshop.selectedId);
        const group = layout.compact ? items : items.filter((candidate) => candidate.tab === item.tab);
        runtime.selectWorkshopItem(group[(group.indexOf(item) + offset + group.length) % group.length]!.id);
      } else if (management) {
        const items = stationView(state, management).items; const item = selectedStationItem(state, management);
        runtime.selectManagementItem(items[(items.findIndex((candidate) => candidate.id === item.id) + offset + items.length) % items.length]!.id);
      } else if (elevatorUi) {
        const items = elevatorItems(state, elevatorUi.tab); const item = selectedElevatorItem(state, elevatorUi);
        runtime.selectElevatorItem(items[(items.findIndex((candidate) => candidate.id === item.id) + offset + items.length) % items.length]!.id);
      }
    }
    if (event.code === 'Tab') {
      const buttons = Array.from(inputsRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = buttons[0]; const last = buttons.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
  }

  function finishPointer(event: import('react').PointerEvent<HTMLButtonElement>): void {
    if (heldPointer.current?.id !== event.pointerId) return;
    heldPointer.current = null; runtime.setPointerMovement(0);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return <>
    <canvas ref={canvasRef} className="game-ui-canvas" aria-hidden="true" />
    <div ref={inputsRef} className={`canvas-inputs${open ? ' window-open' : ''}`}
      data-station={management?.station} data-selected-item={managementLayout?.item.id}
      data-detail-open={management?.detailsOpen} data-detail-pages={managementLayout?.pages.length} data-item-count={managementLayout?.count}
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}
      aria-label={management ? managementLayout?.title : workshop ? t(locale, 'ui.workshopDialog') : elevatorUi ? t(locale, 'ui.elevatorDialog') : helpOpen ? t(locale, 'ui.helpDialog') : undefined}
      aria-describedby={management ? 'management-detail' : workshop ? 'workshop-detail' : elevatorUi ? 'elevator-detail' : undefined}
      onPointerDown={(event) => { if (open && event.target === event.currentTarget) event.preventDefault(); }}
      onKeyDown={handleKeyDown} onPointerCancel={() => runtime.releaseInputs()}>
      {management && managementLayout && <div className="canvas-semantics" id="management-detail">
        <h2>{managementLayout.title}</h2>
        <p>{managementLayout.item.name}. {managementLayout.item.summary}. {managementLayout.item.reason}</p>
        {managementLayout.item.decision && <section data-testid="management-consequences" aria-label={displayText(locale, 'Consequences')}>
          {managementLayout.item.decision.facts.map((fact) => <p key={fact.label}>{fact.label}: {fact.value}</p>)}
        </section>}
        {managementLayout.item.route && <ol aria-label={displayText(locale, 'Cargo route')}>{managementLayout.item.route.map((stop, index) =>
          <li key={index}>{stop.label}: {stop.detail}{stop.blocked ? ' · BLOCKED' : ''}</li>)}</ol>}
        {managementLayout.item.equipment && <p>Current: {managementLayout.item.equipment.current}. Candidate: {managementLayout.item.equipment.candidate}.</p>}
        {managementLayout.bars.map((bar, index) => <p key={index} role="progressbar" aria-label={bar.label}
          aria-valuemin={0} aria-valuemax={bar.total} aria-valuenow={Math.max(0, Math.min(bar.total, bar.value))}>{bar.label}</p>)}
        {managementLayout.item.lines.map((line, index) => <p key={index}>{line}</p>)}
        <p>{displayText(locale, 'Arrow keys browse items.')} {displayText(locale, 'Page Up/Down reads all details.')} {displayText(locale, 'Tab chooses an action.')} {displayText(locale, 'Escape cancels confirmation, then closes the facility.')}</p>
        <p data-testid="detail-page">{displayText(locale, `Detail ${managementLayout.page + 1}/${managementLayout.pages.length}`)}</p>
        <p role="status" aria-live="polite">{management.notice ? displayText(locale, management.notice) : ''}</p>
      </div>}
      {workshop && layout.item && <div className="canvas-semantics" id="workshop-detail">
        <h2>{t(locale, 'ui.workshopDialog')} · {state.run.scrap} {t(locale, 'ui.scrapTitle')}</h2>
        <p>{layout.item.name}. {layout.item.description}. {layout.item.reason}</p>
        <p>{displayText(locale, 'Arrow keys browse items.')} {displayText(locale, 'Tab chooses an action.')} {displayText(locale, 'Enter or Space activates it.')} {displayText(locale, 'Escape closes without clearing your vein.')}</p>
        <p role="status" aria-live="polite">{workshop?.notice ? displayText(locale, workshop.notice) : ''}</p>
      </div>}
      {elevatorUi && <div className="canvas-semantics" id="elevator-detail">
        <h2>{t(locale, 'ui.centralLift')} · {state.run.depth.current} · {state.run.scrap} {t(locale, 'ui.scrapTitle')}</h2>
        <p>{displayText(locale, layout.item?.name ?? '')}. {displayText(locale, selectedElevatorItem(state, elevatorUi).summary)}. {displayText(locale, layout.item?.description ?? '')}. {displayText(locale, layout.item?.reason ?? '')}</p>
        <p>{displayText(locale, 'Arrow keys browse items.')} {displayText(locale, 'Tab chooses an action.')} {displayText(locale, 'Enter or Space activates it.')} {displayText(locale, 'Escape returns to mining.')}</p>
        <p role="status" aria-live="polite">{elevatorUi.notice ? displayText(locale, elevatorUi.notice) : ''}</p>
      </div>}
      {helpOpen && <div className="canvas-semantics"><h2>{t(locale, 'ui.helpCurrentGoal')}</h2><p>{readout.detail || readout.goal}</p>
        <p>{t(locale, 'ui.helpHowTo')}</p></div>}
      {!open && <section className="canvas-semantics" aria-label={t(locale, 'ui.sceneStatus')}>
        <h2 data-testid="scene-title">{readout.title}</h2>
        <p data-testid="scene-detail">{readout.detail}</p>
        <p data-testid="pack-status">{t(locale, 'ui.pack')} {carriedWeight(state).toFixed(1)}/{state.run.character.backpackCapacity}{t(locale, 'ui.kilograms')} · {t(locale, 'ui.value')} {cargoValue(state.run.character.carried)} {t(locale, 'ui.scrap')} · {readout.short}</p>
        <p data-testid="resource-status">{t(locale, 'ui.scrap')} {state.run.scrap} · {t(locale, 'ui.data')} {state.run.data} · {t(locale, 'ui.core')} {state.meta.core}</p>
        {node && <p role="progressbar" aria-label={t(locale, 'ui.nodeRemaining', { name: displayText(locale, node.name) })} aria-valuemin={0} aria-valuemax={node.maxHp}
          aria-valuenow={Math.max(0, Math.min(node.maxHp, node.hp))}>HP {node.hp}/{node.maxHp}</p>}
        <p role="progressbar" aria-label={t(locale, 'ui.capacityBackpack')} aria-valuemin={0} aria-valuemax={state.run.character.backpackCapacity}
          aria-valuenow={Math.min(state.run.character.backpackCapacity, carriedWeight(state))}>{carriedWeight(state)} {t(locale, 'ui.kilograms')}</p>
        <p role="progressbar" aria-label={t(locale, 'ui.capacityLift')} aria-valuemin={0} aria-valuemax={state.run.elevator.maxLoad}
          aria-valuenow={Math.min(state.run.elevator.maxLoad, cargoWeight(state.run.elevator.cargo))}>{cargoWeight(state.run.elevator.cargo)} {t(locale, 'ui.kilograms')}</p>
        <p id="shipment-status">{displayText(locale, shipmentStatus(state))}</p>
        <p role="status" aria-live="polite">{controlHint?.text}</p>
        <p id="player-control-help">{t(locale, 'ui.helpHowTo')}</p>
      </section>}
      {viewport.width > 0 && buttons.map((button) => <button key={button.id} type="button"
        className="canvas-hit" aria-label={button.label} disabled={button.disabled && button.action.type !== 'command'} aria-disabled={button.disabled || undefined}
        data-status={button.badge} aria-describedby={button.id === 'lift-open' ? 'shipment-status' : button.badge || button.detail ? `status-${button.id}` : undefined}
        aria-pressed={button.selected === undefined ? undefined : button.selected}
        data-ui-action={button.id} data-selected={button.selected} data-item={button.icon || button.id.startsWith('lift-item-') || button.id === 'lift-selected' || button.id.startsWith('station-item-') || button.id === 'station-selected' ? 'true' : undefined}
        style={{ left: button.x, top: button.y, width: button.width, height: button.height }}
        onFocus={() => setFocused(button.id)} onBlur={() => {
          setFocused(null);
          if (button.action.type === 'direction') { heldPointer.current = null; runtime.setPointerMovement(0); }
        }}
        onPointerDown={(event) => {
          if (button.action.type !== 'direction' || event.button !== 0 || heldPointer.current !== null) return;
          event.preventDefault(); runtime.unlockAudio(); runtime.focusCanvas();
          heldPointer.current = { id: event.pointerId, button: button.id };
          event.currentTarget.setPointerCapture(event.pointerId); runtime.setPointerMovement(button.action.direction);
        }}
        onPointerUp={finishPointer} onPointerCancel={finishPointer} onLostPointerCapture={finishPointer}
        onKeyDown={(event) => {
          if (button.action.type === 'direction' && ['Space', 'Enter'].includes(event.code) && !event.altKey && !event.ctrlKey && !event.metaKey) {
            event.preventDefault(); event.stopPropagation();
            if (!event.repeat) { runtime.unlockAudio(); runtime.setPointerMovement(button.action.direction); }
          }
        }}
        onKeyUp={(event) => {
          if (button.action.type === 'direction' && ['Space', 'Enter'].includes(event.code)) { event.preventDefault(); runtime.setPointerMovement(0); }
        }}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(button.id); }}
        onPointerLeave={() => setHovered(null)}
        onClick={(event) => {
          if (button.disabled) {
            if (button.action.type === 'command') runtime.explainControl(button.action.command);
            return;
          }
          // Rapid read-only navigation must not be mistaken for a purchase double click.
          const navigation = ['station-close', 'station-back', 'station-select', 'station-tab', 'station-page',
            'station-cancel-confirm', 'station-details', 'station-option', 'station-open', 'close', 'select', 'lift-close', 'lift-tab', 'lift-select', 'help-close'];
          if (event.detail >= 2 && !navigation.includes(button.action.type)) {
            // A second pointerdown focuses CONFIRM before click is suppressed. Return
            // focus to Cancel so a following Enter cannot accidentally commit.
            if (management?.confirmation) inputsRef.current?.querySelector<HTMLButtonElement>('[data-ui-action="station-cancel"]')?.focus({ preventScroll: true });
            return;
          }
          activate(button.action);
        }}>
        <span className="canvas-semantics">{button.label}</span>
        {(button.badge || button.detail) && <span className="canvas-semantics" id={`status-${button.id}`}>{button.badge}. {button.detail}</span>}
      </button>)}
    </div>
  </>;
}
