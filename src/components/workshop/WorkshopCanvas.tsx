import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useGameRuntime, useGameSnapshot } from '../../app/GameProvider';
import { selectedWorkshopItem, workshopItems } from '../../game/workshop';
import { drawWorkshopUi, layoutWorkshopUi, type UiViewport, type WorkshopUiAction } from '../../render/workshopUi';
import './workshop.css';

/** The visible interface is painted on Canvas. Transparent native buttons supply
 * focus, touch hit areas and screen-reader semantics from the SAME layout. */
export function WorkshopCanvas() {
  const runtime = useGameRuntime();
  const { state, workshop } = useGameSnapshot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputsRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<UiViewport>({ width: 0, height: 0, world: { x: 0, y: 0, width: 0, height: 0 } });
  const [focused, setFocused] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const open = workshop !== null;
  const layout = layoutWorkshopUi(state, workshop, viewport);

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
    drawWorkshopUi(ctx, state, workshop, viewport, layout, focused, hovered);
  }, [state, workshop, viewport, layout, focused, hovered]);

  useLayoutEffect(() => {
    setHovered(null);
    if (!open) return;
    // Opening never focuses the purchase button: the player inspects before buying.
    const selected = inputsRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"][data-item="true"]');
    (selected ?? inputsRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)'))?.focus({ preventScroll: true });
  }, [open, layout.compact]);

  useLayoutEffect(() => {
    if (!open || !(document.activeElement instanceof HTMLButtonElement) || !document.activeElement.disabled) return;
    inputsRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"][data-item="true"]')?.focus({ preventScroll: true });
  }, [open, state, workshop]);

  function activate(action: WorkshopUiAction): void {
    runtime.unlockAudio();
    if (action.type === 'open') runtime.openWorkshop();
    else if (action.type === 'close') runtime.closeWorkshop();
    else if (action.type === 'select') runtime.selectWorkshopItem(action.id);
    else if (action.type === 'buy') runtime.activateWorkshopItem();
    else if (action.type === 'command') { runtime.dispatch(action.command); runtime.focusCanvas(); }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
    // Native Space/Enter activates exactly once; OS repeat cannot buy then toggle.
    if (event.repeat && ['Space', 'Enter'].includes(event.code)) { event.preventDefault(); return; }
    if (!workshop) return;
    if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.code)) {
      event.preventDefault();
      if (event.repeat) return;
      const items = workshopItems(state);
      const item = selectedWorkshopItem(items, workshop.selectedId);
      const group = layout.compact ? items : items.filter((candidate) => candidate.tab === item.tab);
      const offset = ['ArrowLeft', 'ArrowUp'].includes(event.code) ? -1 : 1;
      runtime.selectWorkshopItem(group[(group.indexOf(item) + offset + group.length) % group.length]!.id);
    }
    if (event.code === 'Tab') {
      const buttons = Array.from(inputsRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const first = buttons[0]; const last = buttons.at(-1);
      if ((event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
        event.preventDefault(); (event.shiftKey ? last : first)?.focus();
      }
    }
  }

  return <>
    <canvas ref={canvasRef} className="workshop-canvas" aria-hidden="true" />
    <div ref={inputsRef} className={`canvas-inputs${open ? ' window-open' : ''}`}
      role={open ? 'dialog' : undefined} aria-modal={open ? true : undefined}
      aria-label={open ? 'Workshop' : undefined} aria-describedby={open ? 'workshop-detail' : undefined}
      onPointerDown={(event) => { if (open && event.target === event.currentTarget) event.preventDefault(); }}
      onKeyDown={handleKeyDown} onPointerCancel={() => runtime.releaseInputs()}>
      {open && layout.item && <div className="canvas-semantics" id="workshop-detail">
        <h2>Workshop · {state.run.scrap} Scrap</h2>
        <p>{layout.item.name}. {layout.item.comparison}. {layout.item.description}. {layout.item.reason}</p>
        <p>Arrow keys browse. Tab selects an action. Enter or Space activates it. Escape closes without clearing your vein.</p>
        <p role="status" aria-live="polite">{workshop?.notice}</p>
      </div>}
      {viewport.width > 0 && layout.buttons.map((button) => <button key={button.id} type="button"
        className="canvas-hit" aria-label={button.label} disabled={button.disabled}
        aria-pressed={button.selected === undefined ? undefined : button.selected}
        data-ui-action={button.id} data-selected={button.selected} data-item={button.icon ? 'true' : undefined}
        style={{ left: button.x, top: button.y, width: button.width, height: button.height }}
        onFocus={() => setFocused(button.id)} onBlur={() => setFocused(null)}
        onPointerEnter={(event) => { if (event.pointerType !== 'touch') setHovered(button.id); }}
        onPointerLeave={() => setHovered(null)}
        onClick={(event) => { if (event.detail < 2) activate(button.action); }}>
        <span className="canvas-semantics">{button.label}</span>
      </button>)}
    </div>
  </>;
}
