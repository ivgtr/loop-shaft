import { GameAudio } from '../game/audio';
import { SAVE_INTERVAL, WORLD } from '../game/config';
import { createGameState } from '../game/createGame';
import {
  canPlayerAccessNode,
  installBore,
  setFreightPriority,
  setRailPriority,
  startD650Construction,
  startFreightConstruction,
  startRailConstruction,
  unlockD250,
  unlockD400,
} from '../game/deepGame';
import { deeperDepth } from '../game/depth';
import {
  applyOfflineProgress,
  armPhase5Reboot,
  assignCrew,
  equipCrewItem,
  equipPlayerItem,
  expandCrewSlots,
  hireCrew,
  processPhase5Events,
  pushD180,
  requestPhase5Travel,
  selectCrewBoard,
  setCargoPriority,
  setMinerPriority,
  setPorterPriority,
  unlockCrewOperations,
  updatePhase5,
} from '../game/phase5';
import { cancelPlayerAction, movePlayerTo, playerInteraction, playerWalkBounds } from '../game/playerControls';
import { loadFromStorage, saveToStorage } from '../game/save';
import {
  chooseAnomaly,
  currentFloor,
  drainEvents,
  moveToSelectedNode,
  purchaseCoreProtocol,
  requestPlayerInteraction,
  requestPlayerReturn,
  selectArchive,
  selectCoreChamber,
  selectCoreConsole,
  selectElevator,
  selectNode,
  selectResearchTerminal,
  selectScanner,
  sendElevator,
  startResearch,
  toggleAutoDispatch,
  toggleAutoSwing,
  togglePassive,
  unlockAutoDispatch,
  unlockAutoSwing,
  unlockD030,
  unlockD060,
  unlockD100,
  unlockPorter,
  updateGame,
  upgradeBoots,
  upgradePack,
  upgradeTool,
} from '../game/simulation';
import type { GameState, MinerPriority, PorterPriority } from '../game/types';
import { GameRenderer } from '../render/gameRenderer';
import type { InteractionTarget, Point } from '../render/interactionTargets';
import type { GameCommand } from './commands';
import { MiningInput } from './MiningInput';
import { nextWorkshopUpgrade, selectedWorkshopItem, workshopItems, type WorkshopState } from '../game/workshop';

const FIXED_STEP = 1 / 60;
const UI_UPDATE_INTERVAL = 100;
const MINER_PRIORITIES: readonly MinerPriority[] = ['ANY', 'RESEARCH', 'RARE', 'NEAREST'];
const PORTER_PRIORITIES: readonly PorterPriority[] = ['NEAREST', 'RESEARCH', 'CORE', 'RELIC', 'RARE', 'VALUE'];
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];

export interface GameSnapshot {
  readonly revision: number;
  readonly state: GameState;
  readonly workshop: WorkshopState | null;
}

type Listener = () => void;

export class GameRuntime {
  private readonly audio = new GameAudio();
  private readonly listeners = new Set<Listener>();
  private readonly heldKeys = new Set<string>();
  private readonly miningInput: MiningInput;
  private pointerDirection: -1 | 0 | 1 = 0;
  private directMoving = false;
  private renderer: GameRenderer | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrame: number | null = null;
  private accumulator = 0;
  private saveTimer = 0;
  private previous = 0;
  private lastUiUpdate = 0;
  private revision = 0;
  private snapshot: GameSnapshot;
  private pointerClient: Point | null = null;
  private pointerWorld: Point | null = null;
  private hoveredKey: string | null = null;
  private workshop: WorkshopState | null = null;

  constructor(private readonly state: GameState) {
    // Held directional input must never continue after reloading a save.
    if (state.run.character.state === 'MOVING_TO_POINT' || state.run.character.state === 'WAITING_FOR_ELEVATOR') cancelPlayerAction(state);
    // Old saves may contain a workbench selection; windows are deliberately not saved.
    if (state.selection?.type === 'workbench') state.selection = null;
    this.miningInput = new MiningInput(state);
    this.snapshot = this.createSnapshot();
  }

  static fromStorage(): GameRuntime {
    const state = loadFromStorage() ?? createGameState();
    if (state.run.character.state === 'MOVING_TO_POINT' || state.run.character.state === 'WAITING_FOR_ELEVATOR') cancelPlayerAction(state);
    if (applyOfflineProgress(state)) saveToStorage(state);
    return new GameRuntime(state);
  }

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  readonly getSnapshot = (): GameSnapshot => this.snapshot;

  attachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas === canvas) return;
    this.canvas = canvas;
    this.renderer = new GameRenderer(canvas);
  }

  detachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas !== canvas) return;
    this.releaseInputs();
    this.clearPointer();
    this.canvas = null;
    this.renderer = null;
  }

  start(): void {
    if (this.animationFrame !== null) return;
    this.previous = performance.now();
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.releaseInputs();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    saveToStorage(this.state);
  }

  unlockAudio(): void { this.audio.unlock(); }

  focusCanvas(): void { this.canvas?.focus({ preventScroll: true }); }

  setPointerMovement(direction: -1 | 0 | 1): void {
    if (this.workshop) return;
    this.pointerDirection = direction;
    this.synchronizeMovement();
  }

  releaseInputs(): void {
    this.miningInput.cancel();
    this.clearMovementKeys();
  }

  updateCanvasPointer(clientX: number, clientY: number): void {
    this.pointerClient = { x: clientX, y: clientY };
    this.refreshPointerTarget();
  }

  clearCanvasPointer(): void {
    this.pointerClient = null;
    this.pointerWorld = null;
    this.setHoveredTarget(null);
  }

  getHoveredTargetKey(): string | null { return this.hoveredKey; }

  selectCanvasTarget(clientX: number, clientY: number): void {
    if (this.workshop) return;
    const point = this.renderer?.clientToWorld(clientX, clientY);
    const target = point ? this.renderer?.resolveTarget(point, this.state) : null;
    if (!target) {
      // Blank scenery is not a command; the walkable floor is.
      if (point && point.y >= WORLD.floorY - 2 && point.y <= WORLD.floorY + 35) this.dispatch({ type: 'walk', x: point.x });
      return;
    }
    this.clearMovementKeys();
    this.applyCanvasTarget(target);
    this.publish();
  }

  private applyCanvasTarget(target: InteractionTarget): void {
    const ref = target.ref;
    if (ref.type === 'node') {
      const node = currentFloor(this.state).nodes.find((candidate) => candidate.id === ref.id);
      if (node && !canPlayerAccessNode(node)) {
        this.miningInput.cancel();
        this.state.selection = { type: 'node', id: ref.id };
      } else if (this.state.run.character.targetNodeId === ref.id
        && ['MINING', 'MOVING_TO_NODE'].includes(this.state.run.character.state)) {
        // Busy same-node clicks are mining requests, never movement/cancel commands.
        this.miningInput.request(ref.id);
      } else {
        this.miningInput.cancel();
        selectNode(this.state, ref.id);
      }
      return;
    }
    this.miningInput.cancel();
    if (ref.type === 'rail-stop') this.state.selection = { type: 'rail-stop', id: ref.id };
    else if (ref.type === 'cargo-hub') this.state.selection = { type: 'cargo-hub', id: ref.id };
    else if (ref.type === 'freight-control') this.state.selection = { type: 'freight-control' };
    else if (ref.type === 'bore-console') this.state.selection = { type: 'bore-console', id: ref.id };
    else if (ref.type === 'crew-board') selectCrewBoard(this.state);
    else if (ref.type === 'elevator') {
      selectElevator(this.state);
      if (this.state.run.character.carried.length > 0 && !['RETURNING', 'LOADING'].includes(this.state.run.character.state)) requestPlayerReturn(this.state);
    } else if (ref.type === 'workbench') this.openWorkshop();
    else if (ref.type === 'scanner') selectScanner(this.state);
    else if (ref.type === 'archive') selectArchive(this.state);
    else if (ref.type === 'research') selectResearchTerminal(this.state);
    else if (ref.type === 'core-console') selectCoreConsole(this.state);
    else selectCoreChamber(this.state);
  }

  openWorkshop(): void {
    if (this.workshop || this.state.run.elevator.travel) return;
    this.releaseInputs();
    this.clearPointer();
    // Cancel only the player's instruction, retaining cargo and the selected vein.
    // The lift, Porter, research and other autonomous work keep running.
    cancelPlayerAction(this.state);
    this.workshop = { selectedId: nextWorkshopUpgrade(this.state)?.id ?? 'upgrade-tool', notice: null,
      runIndex: this.state.meta.runIndex, depth: this.state.run.depth.current };
    this.publish();
  }

  closeWorkshop(): void {
    if (!this.workshop) return;
    this.releaseInputs();
    this.workshop = null;
    this.publish();
    this.focusCanvas();
  }

  selectWorkshopItem(id: string): void {
    if (!this.workshop || !workshopItems(this.state).some((item) => item.id === id)) return;
    this.workshop = { ...this.workshop, selectedId: id, notice: null };
    this.publish();
  }

  activateWorkshopItem(): void {
    if (!this.workshop) return;
    const item = selectedWorkshopItem(workshopItems(this.state), this.workshop.selectedId);
    if (!item.command) return;
    this.dispatch(item.command);
    if (!this.workshop) return;
    const current = selectedWorkshopItem(workshopItems(this.state), item.id);
    this.workshop = { ...this.workshop, notice: item.owned
      ? current.comparison : `${item.name} ${item.tab === 'automation' ? 'installed' : 'equipped'}. ${item.comparison}` };
    this.publish();
  }

  dispatch(command: GameCommand): void {
    if (this.workshop) {
      if (command.type === 'cancel') { this.closeWorkshop(); return; }
      // Only the displayed item's validated command can cross the modal boundary.
      const allowed = selectedWorkshopItem(workshopItems(this.state), this.workshop.selectedId).command;
      if (!allowed || command.type !== allowed.type
        || ('itemId' in allowed && (!('itemId' in command) || command.itemId !== allowed.itemId))) return;
    }
    if (command.type === 'interact' && playerInteraction(this.state).type === 'workbench') {
      this.openWorkshop(); return;
    }
    if (['move', 'walk', 'return', 'interact', 'cancel', 'travel', 'reboot'].includes(command.type)) this.releaseInputs();
    switch (command.type) {
      case 'move': moveToSelectedNode(this.state); break;
      case 'walk': movePlayerTo(this.state, command.x); break;
      case 'mine': this.miningInput.request(command.nodeId); break;
      case 'interact': requestPlayerInteraction(this.state); break;
      case 'return': requestPlayerReturn(this.state); break;
      case 'cancel': cancelPlayerAction(this.state); this.state.selection = null; break;
      case 'send': sendElevator(this.state); break;
      case 'upgrade-tool': upgradeTool(this.state); break;
      case 'upgrade-boots': upgradeBoots(this.state); break;
      case 'unlock-auto-swing': unlockAutoSwing(this.state); break;
      case 'toggle-auto-swing': toggleAutoSwing(this.state); break;
      case 'upgrade-pack': upgradePack(this.state); break;
      case 'unlock-porter': unlockPorter(this.state); break;
      case 'unlock-auto-dispatch': unlockAutoDispatch(this.state); break;
      case 'toggle-auto-dispatch': toggleAutoDispatch(this.state); break;
      case 'extend-d030': unlockD030(this.state); break;
      case 'extend-d060': unlockD060(this.state); break;
      case 'extend-d100': unlockD100(this.state); break;
      case 'push-d180': pushD180(this.state); break;
      case 'extend-d250': unlockD250(this.state); break;
      case 'build-rail': startRailConstruction(this.state); break;
      case 'build-freight': startFreightConstruction(this.state); break;
      case 'extend-d400': unlockD400(this.state); break;
      case 'build-d650': startD650Construction(this.state); break;
      case 'install-bore': installBore(this.state, command.siteId); break;
      case 'rail-priority': setRailPriority(this.state, command.lineId, command.priority); break;
      case 'freight-priority': setFreightPriority(this.state, command.priority); break;
      case 'unlock-crew': unlockCrewOperations(this.state); break;
      case 'expand-crew': expandCrewSlots(this.state); break;
      case 'hire-crew': hireCrew(this.state, command.role); break;
      case 'assign-crew': assignCrew(this.state, command.crewId, command.depth); break;
      case 'cycle-miner-priority': this.cycleMinerPriority(command.crewId); break;
      case 'cycle-porter-priority': this.cyclePorterPriority(command.crewId); break;
      case 'cargo-priority': setCargoPriority(this.state, command.priority); break;
      case 'equip-item': equipPlayerItem(this.state, command.itemId); break;
      case 'equip-crew-item': equipCrewItem(this.state, command.crewId, command.itemId); break;
      case 'travel': requestPhase5Travel(this.state, command.depth); break;
      case 'choose-anomaly': chooseAnomaly(this.state, command.anomaly); break;
      case 'toggle-passive': togglePassive(this.state, command.passive); break;
      case 'research': startResearch(this.state, command.research); break;
      case 'protocol': purchaseCoreProtocol(this.state, command.protocol); break;
      case 'reboot': armPhase5Reboot(this.state); break;
    }
    saveToStorage(this.state);
    this.publish();
  }

  private readonly frame = (now: number): void => {
    const delta = Math.min(0.25, (now - this.previous) / 1000);
    this.previous = now;
    this.accumulator += delta;
    this.saveTimer += delta;
    while (this.accumulator >= FIXED_STEP) {
      updateGame(this.state, FIXED_STEP);
      this.miningInput.update();
      updatePhase5(this.state, FIXED_STEP);
      this.state.meta.bestDepth = deeperDepth(this.state.meta.bestDepth, this.state.run.depth.current);
      this.accumulator -= FIXED_STEP;
    }
    const baseEvents = drainEvents(this.state);
    processPhase5Events(this.state, baseEvents);
    const events = [...baseEvents, ...drainEvents(this.state)];
    for (const gameEvent of events) {
      this.renderer?.handleEvent(gameEvent, this.state, now);
      this.audio.handle(gameEvent);
    }
    if (this.saveTimer >= SAVE_INTERVAL) {
      saveToStorage(this.state);
      this.saveTimer = 0;
    }
    if (this.workshop && (this.workshop.runIndex !== this.state.meta.runIndex
      || this.workshop.depth !== this.state.run.depth.current || this.state.run.elevator.travel)) this.closeWorkshop();
    this.refreshPointerTarget();
    this.renderer?.render(this.state, now, this.hoveredKey);
    if (now - this.lastUiUpdate >= UI_UPDATE_INTERVAL) {
      this.lastUiUpdate = now;
      this.publish();
    }
    this.animationFrame = requestAnimationFrame(this.frame);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
    const canvasFocused = this.canvas !== null && document.activeElement === this.canvas;
    const inGame = canvasFocused || Boolean(this.canvas?.closest('.game-root')?.contains(event.target as Node));
    if (event.code === 'Escape' && (inGame || this.workshop)) {
      event.preventDefault();
      if (!event.repeat) { this.dispatch({ type: 'cancel' }); this.focusCanvas(); }
      return;
    }
    // Native UI buttons retain Space/Enter activation; text editing never controls the miner.
    if (this.workshop || !canvasFocused) return;
    if (![...LEFT_KEYS, ...RIGHT_KEYS, 'Space', 'KeyE', 'KeyF'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    this.unlockAudio();
    if (LEFT_KEYS.includes(event.code) || RIGHT_KEYS.includes(event.code)) {
      this.heldKeys.add(event.code);
      this.synchronizeMovement();
    } else if (event.code === 'Space') this.dispatch({ type: 'mine' });
    else if (event.code === 'KeyE') this.dispatch({ type: 'interact' });
    else if (event.code === 'KeyF') this.dispatch({ type: 'send' });
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    if (this.heldKeys.delete(event.code)) this.synchronizeMovement();
  };

  private synchronizeMovement(): void {
    const left = LEFT_KEYS.some((key) => this.heldKeys.has(key)) || this.pointerDirection < 0;
    const right = RIGHT_KEYS.some((key) => this.heldKeys.has(key)) || this.pointerDirection > 0;
    const direction = Number(right) - Number(left);
    this.miningInput.cancel();
    if (direction === 0) {
      if (this.directMoving && this.state.run.character.state === 'MOVING_TO_POINT') cancelPlayerAction(this.state);
      this.directMoving = false;
    } else {
      const [min, max] = playerWalkBounds(this.state);
      this.directMoving = movePlayerTo(this.state, direction < 0 ? min : max);
    }
    this.publish();
  }

  private clearMovementKeys(): void {
    this.heldKeys.clear();
    this.pointerDirection = 0;
    if (this.directMoving && this.state.run.character.state === 'MOVING_TO_POINT') cancelPlayerAction(this.state);
    this.directMoving = false;
  }

  private readonly handleWindowBlur = (): void => { this.releaseInputs(); };
  private readonly handleBeforeUnload = (): void => { this.releaseInputs(); saveToStorage(this.state); };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') { this.releaseInputs(); saveToStorage(this.state); }
  };

  private cycleMinerPriority(crewId: string): void {
    const member = this.state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'MINER');
    if (!member) return;
    const next = MINER_PRIORITIES[(MINER_PRIORITIES.indexOf(member.minerPriority) + 1) % MINER_PRIORITIES.length]!;
    setMinerPriority(this.state, crewId, next);
  }

  private cyclePorterPriority(crewId: string): void {
    const member = this.state.run.phase5.crew.members.find((candidate) => candidate.id === crewId && candidate.role === 'PORTER');
    if (!member) return;
    const next = PORTER_PRIORITIES[(PORTER_PRIORITIES.indexOf(member.porterPriority) + 1) % PORTER_PRIORITIES.length]!;
    setPorterPriority(this.state, crewId, next);
  }

  private refreshPointerTarget(): void {
    if (this.workshop || !this.renderer || !this.pointerClient) {
      this.pointerWorld = null;
      this.setHoveredTarget(null);
      return;
    }
    this.pointerWorld = this.renderer.clientToWorld(this.pointerClient.x, this.pointerClient.y);
    const target = this.pointerWorld ? this.renderer.resolveTarget(this.pointerWorld, this.state) : null;
    this.setHoveredTarget(target?.key ?? null);
  }

  private setHoveredTarget(key: string | null): void {
    if (this.hoveredKey === key) return;
    this.hoveredKey = key;
    if (!this.canvas) return;
    this.canvas.style.cursor = key ? 'pointer' : 'default';
    if (key) this.canvas.dataset.interactionTarget = key;
    else delete this.canvas.dataset.interactionTarget;
  }

  private clearPointer(): void {
    this.pointerClient = null;
    this.pointerWorld = null;
    this.setHoveredTarget(null);
  }

  private publish(): void {
    this.revision += 1;
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private createSnapshot(): GameSnapshot {
    return Object.freeze({ revision: this.revision, state: structuredClone(this.state),
      workshop: this.workshop ? { ...this.workshop } : null });
  }
}
