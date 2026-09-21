import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGameRuntime, useGameSnapshot } from '../../app/GameProvider';
import { selectedWorkshopItem, workshopItems } from '../../game/workshop';
import { drawWorkshopUi, layoutWorkshopUi, type UiViewport } from '../../render/workshopUi';
import '../workshop/workshop.css';
import { drawGameUi, layoutGameUi, type GameUiAction } from '../../render/gameUi';
import { elevatorItems, selectedElevatorItem } from '../../game/elevatorUi';
import { sceneReadout } from '../../game/hud';
import { stationView, selectedStationItem } from '../../game/management';
import { drawManagementUi, layoutManagementUi } from '../../render/managementUi';
import { cargoValue, carriedWeight } from '../../game/simulation';

/** The visible interface is painted on Canvas. Transparent native buttons supply
 * focus, touch hit areas and screen-reader semantics from the SAME layout. */
export function GameUiCanvas() {
  const runtime = useGameRuntime();
  const { state, workshop, elevatorUi, helpOpen, management } = useGameSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const focusSelectedItem = useRef(false);
  const [viewport, setViewport] = useState<UiViewport>({ width: 0, height: 0, world: { x: 0, y: 0, width: 0, height: 0 } });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const open = workshop !== null || elevatorUi !== null || helpOpen || management !== null;
  const heldPointer = useRef<{ id: number; button: string } | null>(null);
  const managementLayout = management ? layoutManagementUi(state, management, viewport) : null;
  const layout = workshop ? layoutWorkshopUi(state, workshop, viewport) : layoutGameUi(state, elevatorUi, helpOpen, viewport);
  const buttons = managementLayout?.buttons ?? layout.buttons;
  const readout = sceneReadout(state);

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
    if (management) drawManagementUi(ctx, viewport, layoutManagementUi(state, management, viewport), focused, hovered);
    else if (workshop) drawWorkshopUi(ctx, state, workshop, viewport, layoutWorkshopUi(state, workshop, viewport), focused, hovered);
    else drawGameUi(ctx, state, elevatorUi, helpOpen, viewport, layoutGameUi(state, elevatorUi, helpOpen, viewport), focused, hovered);
  }, [state, workshop, elevatorUi, helpOpen, management, viewport, focused, hovered]);

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
    inputsRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"][data-item="true"]')?.focus({ preventScroll: true });
  }, [open, state, workshop, elevatorUi, management]);

  function activate(action: GameUiAction): void {
    runtime.unlockAudio();
    if (action.type === 'station-open') runtime.openManagement(action.request);
    else if (action.type === 'station-close') runtime.closeManagement();
    else if (action.type === 'station-back') runtime.backManagement();
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
      if (managementLayout) runtime.setManagementPage(Math.max(0, Math.min(managementLayout.pages.length - 1, managementLayout.page + (event.code === 'PageDown' ? 1 : -1))));
    }
    if ((workshop || elevatorUi || (management && !management.confirmation)) && ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      const offset = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1;
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
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}
      aria-label={management ? stationView(state, management).title : workshop ? 'Workshop' : elevatorUi ? 'Elevator controls' : helpOpen ? 'Controls help' : undefined}
      aria-describedby={management ? 'management-detail' : workshop ? 'workshop-detail' : elevatorUi ? 'elevator-detail' : undefined}
      onPointerDown={(event) => { if (open && event.target === event.currentTarget) event.preventDefault(); }}
      onKeyDown={handleKeyDown} onPointerCancel={() => runtime.releaseInputs()}>
      {management && managementLayout && <div className="canvas-semantics" id="management-detail">
        <h2>{managementLayout.title}</h2>
        <p>{managementLayout.item.name}. {managementLayout.item.summary}. {managementLayout.item.reason}</p>
        {managementLayout.item.lines.map((line, index) => <p key={index}>{line}</p>)}
        <p>Arrow keys browse items. Page Up/Down reads all details. Tab chooses an action. Escape cancels confirmation, then closes the facility.</p>
        <p data-testid="detail-page">Detail {managementLayout.page + 1}/{managementLayout.pages.length}</p>
        <p role="status" aria-live="polite">{management.notice}</p>
      </div>}
      {workshop && layout.item && <div className="canvas-semantics" id="workshop-detail">
        <h2>Workshop · {state.run.scrap} Scrap</h2>
        <p>{selectedWorkshopItem(workshopItems(state), workshop.selectedId).name}. {selectedWorkshopItem(workshopItems(state), workshop.selectedId).comparison}. {layout.item.description}. {layout.item.reason}</p>
        <p>Arrow keys browse. Tab selects an action. Enter or Space activates it. Escape closes without clearing your vein.</p>
        <p role="status" aria-live="polite">{workshop?.notice}</p>
      </div>}
      {elevatorUi && <div className="canvas-semantics" id="elevator-detail">
        <h2>Central Elevator · {state.run.depth.current} · {state.run.scrap} Scrap</h2>
        <p>{layout.item?.name}. {selectedElevatorItem(state, elevatorUi).summary}. {layout.item?.description}. {layout.item?.reason}</p>
        <p>Arrow keys browse destinations or controls. Tab selects an action. Enter or Space activates it. Escape returns to mining.</p>
        <p role="status" aria-live="polite">{elevatorUi.notice}</p>
      </div>}
      {helpOpen && <div className="canvas-semantics"><h2>Controls and current objective</h2><p>{readout.detail || readout.goal}</p>
        <p>A/D or arrows to walk. Space to mine. E to interact. F to send. RETURN to unload. Escape to close or stop. Hold the direction buttons to walk on touch.</p></div>}
      {!open && <section className="canvas-semantics" aria-label="Mining status">
        <h2 data-testid="scene-title">{readout.title}</h2>
        <p data-testid="scene-detail">{readout.detail}</p>
        <p data-testid="pack-status">PACK {carriedWeight(state).toFixed(1)}/{state.run.character.backpackCapacity}kg · value {cargoValue(state.run.character.carried)} Scrap · {readout.short}</p>
        <p data-testid="resource-status">SCRAP {state.run.scrap} · DATA {state.run.data} · CORE {state.meta.core}</p>
        <p id="player-control-help">A/D or arrows walk. Space mines. E interacts. F sends. Escape stops. Click a vein to approach it or click the floor to walk.</p>
      </section>}
      {viewport.width > 0 && buttons.map((button) => <button key={button.id} type="button"
        className="canvas-hit" aria-label={button.label} disabled={button.disabled}
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
        onClick={(event) => { if (event.detail < 2) activate(button.action); }}>
        <span className="canvas-semantics">{button.label}</span>
      </button>)}
    </div>
  </>;
}
