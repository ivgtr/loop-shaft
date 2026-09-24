import { fieldActionHint, type FieldHint } from '../game/fieldUi';
import { surveyRequest } from '../game/management/survey';
import { loadPresentationSettings, savePresentationSettings, type PresentationSetting, type PresentationSettings } from '../game/presentationSettings';
import { togglePorterHold } from '../game/simulation';
import { restoreFossil } from '../game/appraisal';
import { setDispatchPolicy } from '../game/dispatch';
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
  confirmPhase5Reboot,
  assignCrew,
  equipCrewItem,
  equipPlayerItem,
  expandCrewSlots,
  hireCrew,
  processPhase5Events,
  pushD180,
  requestPhase5Travel,
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
  selectNode,
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
import type { DepthId, GameState } from '../game/types';
import { GameRenderer } from '../render/gameRenderer';
import type { InteractionTarget, Point } from '../render/interactionTargets';
import type { GameCommand } from './commands';
import { MiningInput } from './MiningInput';
import { elevatorItems, selectedElevatorItem, type ElevatorTab, type ElevatorUiState } from '../game/elevatorUi';
import { nextWorkshopUpgrade, selectedWorkshopItem, workshopItems, type WorkshopState } from '../game/workshop';
import type { Locale } from '../i18n';

import { managementFeedback } from '../game/management/feedback';
import { createManagementState, selectedStationItem, stationAvailable, stationSelection, stationView, type ManagementState, type StationRequest } from '../game/management';

const FIXED_STEP = 1 / 60;
const UI_UPDATE_INTERVAL = 100;
const LEFT_KEYS = ['KeyA', 'ArrowLeft'];
const RIGHT_KEYS = ['KeyD', 'ArrowRight'];

export interface GameSnapshot {
  readonly revision: number;
  readonly presentation: PresentationSettings;
  readonly state: GameState;
  readonly workshop: WorkshopState | null;
  readonly elevatorUi: ElevatorUiState | null;
  readonly helpOpen: boolean;
  readonly controlHint: FieldHint | null;
  readonly management: ManagementState | null;
}

type Listener = () => void;

export class GameRuntime {
  private readonly audio = new GameAudio();
  private presentation = loadPresentationSettings();
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
  private elevatorUi: ElevatorUiState | null = null;
  private helpOpen = false;
  private controlHint: FieldHint | null = null;
  private hintExpiresAt = 0;
  private management: ManagementState | null = null;

  private get windowOpen(): boolean { return this.workshop !== null || this.elevatorUi !== null || this.helpOpen || this.management !== null; }

  constructor(private readonly state: GameState) {
    // Held directional input must never continue after reloading a save.
    if (state.run.character.state === 'MOVING_TO_POINT' || state.run.character.state === 'WAITING_FOR_ELEVATOR') cancelPlayerAction(state);
    // Old saves may contain a workbench selection; windows are deliberately not saved.
    if (state.selection && !['node', 'elevator'].includes(state.selection.type)) state.selection = null;
    state.run.coreChamber.rebootArmed = false;
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
    this.renderer = new GameRenderer(canvas, { reward: notice => this.audio.playReward(notice), settings: () => this.presentation });
  }

  detachCanvas(canvas: HTMLCanvasElement): void {
    if (this.canvas !== canvas) return;
    this.releaseInputs();
    this.clearPointer();
    this.renderer?.clearFeedback(); this.audio.reset();
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
    this.renderer?.clearFeedback(); this.audio.reset();
    this.releaseInputs();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    window.removeEventListener('beforeunload', this.handleBeforeUnload);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    saveToStorage(this.state);
  }

  unlockAudio(): void { this.audio.setVolume(this.presentation.volume); this.audio.unlock(); }

  changePresentation(setting: PresentationSetting): void {
    if (!this.helpOpen) return;
    this.presentation = { ...this.presentation, [setting]: setting === 'volume'
      ? this.presentation.volume === 0 ? .5 : this.presentation.volume < 1 ? 1 : 0
      : !this.presentation[setting] };
    this.audio.setVolume(this.presentation.volume);
    savePresentationSettings(this.presentation);
    this.publish();
  }

  setLocale(locale: Locale): void {
    if (this.presentation.locale === locale) return;
    this.presentation = { ...this.presentation, locale };
    this.controlHint = null;
    savePresentationSettings(this.presentation);
    this.publish();
  }

  explainControl(command: GameCommand): void {
    if (this.windowOpen) return;
    this.setControlHint(command);
    this.publish();
  }

  private setControlHint(command: GameCommand): void {
    this.controlHint = fieldActionHint(this.state, command, this.presentation.locale);
    this.hintExpiresAt = performance.now() + 2200;
  }

  focusCanvas(): void { this.canvas?.focus({ preventScroll: true }); }

  setPointerMovement(direction: -1 | 0 | 1): void {
    if (this.windowOpen) return;
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
    if (this.windowOpen) return;
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
      if (node?.hp === 0) this.setControlHint({ type: 'mine', nodeId: ref.id });
      else this.controlHint = null;
      if (node && !canPlayerAccessNode(node)) {
        this.miningInput.cancel();
        this.openManagement({ station: 'logistics', tab: 'bore', selectedId: ref.id });
      } else if (this.state.run.character.targetNodeId === ref.id
        && ['MINING', 'MOVING_TO_NODE'].includes(this.state.run.character.state)) {
        // Restore inspection independently of the mining request (including depleted jobs after reload).
        this.state.selection = ref;
        // Busy same-node clicks are mining requests, never movement/cancel commands.
        this.miningInput.request(ref.id);
      } else {
        this.miningInput.cancel();
        selectNode(this.state, ref.id);
      }
      return;
    }
    this.miningInput.cancel();
    if (ref.type === 'rail-stop') {
      const line = this.state.run.logistics.lines.find((line) => line.id === ref.id);
      this.openManagement({ station: 'logistics', tab: 'rail', selectedId: line?.id });
    } else if (ref.type === 'cargo-hub' || ref.type === 'freight-control') this.openManagement({ station: 'logistics', tab: 'freight' });
    else if (ref.type === 'bore-console') this.openManagement({ station: 'logistics', tab: 'bore', selectedId: this.state.run.deepAutomation.bores.find((bore) => bore.id === ref.id)?.siteId });
    else if (ref.type === 'crew-board') this.openManagement({ station: 'crew' });
    else if (ref.type === 'elevator') {
      if (this.state.run.character.carried.length > 0) requestPlayerReturn(this.state);
      else this.openElevator();
    } else if (ref.type === 'workbench') this.openWorkshop();
    else if (ref.type === 'scanner') this.openManagement({ station: 'scanner' });
    else if (ref.type === 'archive') this.openManagement({ station: 'archive' });
    else if (ref.type === 'research') this.openManagement({ station: 'research' });
    else if (ref.type === 'core-console') this.openManagement({ station: 'core' });
    else this.openManagement({ station: 'reboot' });
  }

  openManagement(request: StationRequest): void {
    if (this.state.run.elevator.travel || !stationAvailable(this.state, request.station)) return;
    // Only the workshop's FINDS entry and navigation inside this window may switch windows.
    if (this.elevatorUi || this.helpOpen || (this.workshop && request.station !== 'equipment')) return;
    const returning = this.management ? this.management.returnSelection : this.state.selection;
    this.releaseInputs(); this.clearPointer(); cancelPlayerAction(this.state);
    this.workshop = null;
    this.management = createManagementState(this.state, request, returning);
    this.state.selection = stationSelection(request.station);
    this.state.run.coreChamber.rebootArmed = false;
    this.publish();
  }

  closeManagement(): void {
    if (!this.management) return;
    const ui = this.management;
    this.releaseInputs(); this.management = null;
    if (ui.runIndex === this.state.meta.runIndex && ui.depth === this.state.run.depth.current) this.state.selection = ui.returnSelection;
    this.state.run.coreChamber.rebootArmed = false;
    this.publish(); this.focusCanvas();
  }

  backManagement(): void {
    if (!this.management) return;
    if (this.management.confirmation) { this.cancelManagementConfirmation(); return; }
    const back = stationView(this.state, this.management).back;
    if (back === 'workshop') { this.closeManagement(); this.openWorkshop(); }
    else if (back) this.openManagement(back);
  }

  selectManagementTab(tab: string): void {
    if (!this.management || this.management.confirmation || !stationView(this.state, this.management).tabs.some((candidate) => candidate.id === tab)) return;
    this.management = createManagementState(this.state, { station: this.management.station, subjectId: this.management.subjectId ?? undefined, tab }, this.management.returnSelection);
    this.publish();
  }

  selectManagementItem(id: string): void {
    if (!this.management || this.management.confirmation || !stationView(this.state, this.management).items.some((item) => item.id === id)) return;
    this.management = { ...this.management, selectedId: id, optionId: null, detailsOpen: false, detailPage: 0, notice: null };
    this.publish();
  }

  toggleManagementDetails(): void {
    if (!this.management) return;
    this.management = { ...this.management, detailsOpen: !this.management.detailsOpen, detailPage: 0 }; this.publish();
  }

  selectManagementOption(id: string): void {
    if (!this.management || this.management.confirmation) return;
    const item = selectedStationItem(this.state, this.management);
    if (!item.options?.some((option) => option.id === id)) return;
    this.management = { ...this.management, selectedId: item.id, optionId: id, notice: null }; this.publish();
  }

  setManagementPage(page: number): void {
    if (!this.management || !Number.isFinite(page)) return;
    this.management = { ...this.management, detailsOpen: true, detailPage: Math.max(0, Math.floor(page)) }; this.publish();
  }

  cancelManagementConfirmation(): void {
    if (!this.management) return;
    this.management = { ...this.management, confirmation: null, detailsOpen: false, detailPage: 0, notice: null };
    this.publish();
  }

  activateManagementItem(): void {
    if (!this.management) return;
    const item = selectedStationItem(this.state, this.management);
    if (!item.action || item.reason) return;
    if (item.confirmKey && this.management.confirmation !== item.confirmKey) {
      this.management = { ...this.management, confirmation: item.confirmKey, detailsOpen: false, detailPage: 0, notice: null };
      this.publish(); return;
    }
    if (item.action.type === 'navigate') { this.openManagement(item.action.request); return; }
    if (item.action.type === 'workshop') { this.closeManagement(); this.openWorkshop(); return; }
    this.dispatch(item.action.command);
    if (!this.management) return;
    const selected = selectedStationItem(this.state, this.management);
    this.management = { ...this.management, selectedId: selected.id, confirmation: null, notice: managementFeedback(this.state, item.action.command) };
    this.publish();
  }

  openWorkshop(): void {
    if (this.windowOpen || this.state.run.elevator.travel) return;
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

  openElevator(tab: ElevatorTab = 'dispatch'): void {
    if (this.windowOpen || this.state.run.elevator.travel) return;
    this.releaseInputs(); this.clearPointer(); cancelPlayerAction(this.state);
    const items = elevatorItems(this.state, tab);
    this.elevatorUi = { tab, selectedId: (items.find((item) => !item.complete) ?? items[0]!).id,
      notice: null, runIndex: this.state.meta.runIndex, depth: this.state.run.depth.current };
    this.publish();
  }

  closeElevator(): void {
    if (!this.elevatorUi) return;
    this.releaseInputs(); this.elevatorUi = null; this.publish(); this.focusCanvas();
  }

  selectElevatorTab(tab: ElevatorTab): void {
    if (!this.elevatorUi) return;
    const items = elevatorItems(this.state, tab);
    this.elevatorUi = { ...this.elevatorUi, tab, selectedId: (items.find((item) => !item.complete) ?? items[0]!).id, notice: null };
    this.publish();
  }

  selectElevatorItem(id: string): void {
    if (!this.elevatorUi || !elevatorItems(this.state, this.elevatorUi.tab).some((item) => item.id === id)) return;
    this.elevatorUi = { ...this.elevatorUi, selectedId: id, notice: null }; this.publish();
  }

  activateElevatorItem(): void {
    if (!this.elevatorUi) return;
    const item = selectedElevatorItem(this.state, this.elevatorUi);
    if (!item.command) return;
    this.dispatch(item.command);
    if (!this.elevatorUi) return;
    this.elevatorUi = { ...this.elevatorUi, notice: item.command.type === 'send' ? 'Shipment sent. Payment happens at Surface.'
      : this.elevatorUi.tab === 'extend' ? `${item.name}: ${this.state.run.depth.unlocked.includes(item.id as DepthId) ? 'connection open. Choose TRAVEL to visit.' : 'construction started.'}`
      : 'Control updated.' };
    this.publish();
  }

  openHelp(): void {
    if (this.windowOpen) return;
    this.releaseInputs(); this.clearPointer(); cancelPlayerAction(this.state);
    this.helpOpen = true; this.publish();
  }

  closeHelp(): void {
    if (!this.helpOpen) return;
    this.releaseInputs(); this.helpOpen = false; this.publish(); this.focusCanvas();
  }

  dispatch(command: GameCommand): void {
    if (this.management) {
      if (command.type === 'cancel') { if (this.management.confirmation) this.cancelManagementConfirmation(); else this.closeManagement(); return; }
      const item = selectedStationItem(this.state, this.management);
      if (item.reason || item.action?.type !== 'command' || JSON.stringify(item.action.command) !== JSON.stringify(command)
        || (item.confirmKey && item.confirmKey !== this.management.confirmation)) return;
    } else if (command.type === 'reboot' || command.type === 'restore-fossil') return; // A saved or direct command cannot bypass the review screen.
    if (this.helpOpen) { if (command.type === 'cancel') this.closeHelp(); return; }
    if (this.elevatorUi) {
      if (command.type === 'cancel') { this.closeElevator(); return; }
      const allowed = selectedElevatorItem(this.state, this.elevatorUi).command;
      if (!allowed || JSON.stringify(command) !== JSON.stringify(allowed)) return;
    }
    if (this.workshop) {
      if (command.type === 'cancel') { this.closeWorkshop(); return; }
      // Only the displayed item's validated command can cross the modal boundary.
      const allowed = selectedWorkshopItem(workshopItems(this.state), this.workshop.selectedId).command;
      if (!allowed || command.type !== allowed.type
        || ('itemId' in allowed && (!('itemId' in command) || command.itemId !== allowed.itemId))) return;
    }
    if (!this.windowOpen) this.setControlHint(command);
    if (command.type === 'interact' && playerInteraction(this.state).type === 'scanner') {
      this.openManagement({ station: 'scanner' }); return;
    }
    if (command.type === 'interact' && playerInteraction(this.state).type === 'elevator') {
      this.openElevator(); return;
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
      case 'dispatch-policy': setDispatchPolicy(this.state, command.policy); break;
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
      case 'miner-priority': setMinerPriority(this.state, command.crewId, command.priority); break;
      case 'porter-priority': setPorterPriority(this.state, command.crewId, command.priority); break;
      case 'cargo-priority': setCargoPriority(this.state, command.priority); break;
      case 'equip-item': equipPlayerItem(this.state, command.itemId); break;
      case 'equip-crew-item': equipCrewItem(this.state, command.crewId, command.itemId); break;
      case 'travel': requestPhase5Travel(this.state, command.depth); break;
      case 'choose-anomaly': chooseAnomaly(this.state, command.anomaly); break;
      case 'toggle-passive': togglePassive(this.state, command.passive); break;
      case 'toggle-porter-hold': togglePorterHold(this.state); break;
      case 'restore-fossil': restoreFossil(this.state, command.kind); break;
      case 'research': startResearch(this.state, command.research); break;
      case 'protocol': purchaseCoreProtocol(this.state, command.protocol); break;
      case 'reboot': confirmPhase5Reboot(this.state); break;
    }
    if (this.elevatorUi && this.state.run.elevator.travel) this.closeElevator();
    if (this.management && this.management.runIndex !== this.state.meta.runIndex) this.closeManagement();
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
      if (!document.hidden) {
        this.renderer?.handleEvent(gameEvent, this.state, now, events);
        this.audio.handle(gameEvent, this.state);
      }
    }
    if (this.saveTimer >= SAVE_INTERVAL) {
      saveToStorage(this.state);
      this.saveTimer = 0;
    }
    if (this.workshop && (this.workshop.runIndex !== this.state.meta.runIndex
      || this.workshop.depth !== this.state.run.depth.current || this.state.run.elevator.travel)) this.closeWorkshop();
    if (this.elevatorUi && (this.elevatorUi.runIndex !== this.state.meta.runIndex
      || this.elevatorUi.depth !== this.state.run.depth.current || this.state.run.elevator.travel)) this.closeElevator();
    if (this.management && (this.management.runIndex !== this.state.meta.runIndex || this.management.depth !== this.state.run.depth.current || this.state.run.elevator.travel)) this.closeManagement();
    if (this.management?.confirmation) {
      const item = selectedStationItem(this.state, this.management);
      if (item.confirmKey !== this.management.confirmation || item.reason) {
        this.management = { ...this.management, confirmation: null, detailsOpen: false, detailPage: 0, notice: 'State changed. Review again.' };
      }
    }
    this.refreshPointerTarget();
    if (this.controlHint && now >= this.hintExpiresAt) this.controlHint = null;
    this.renderer?.render(this.state, now, this.hoveredKey, this.windowOpen ? null : this.controlHint, this.presentation.locale);
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
    if (event.code === 'Escape' && (inGame || this.windowOpen)) {
      event.preventDefault();
      if (!event.repeat) { this.dispatch({ type: 'cancel' }); if (!this.windowOpen) this.focusCanvas(); }
      return;
    }
    // Native UI buttons retain Space/Enter activation; text editing never controls the miner.
    if (this.windowOpen || !canvasFocused) return;
    if (![...LEFT_KEYS, ...RIGHT_KEYS, 'Space', 'KeyE', 'KeyF', 'KeyI'].includes(event.code)) return;
    event.preventDefault();
    if (event.repeat) return;
    this.unlockAudio();
    if (LEFT_KEYS.includes(event.code) || RIGHT_KEYS.includes(event.code)) {
      this.heldKeys.add(event.code);
      this.synchronizeMovement();
    } else if (event.code === 'Space') this.dispatch({ type: 'mine' });
    else if (event.code === 'KeyE') this.dispatch({ type: 'interact' });
    else if (event.code === 'KeyF') this.dispatch({ type: 'send' });
    else if (event.code === 'KeyI') this.openManagement(surveyRequest(this.state));
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
    if (document.visibilityState === 'hidden') { this.releaseInputs(); this.renderer?.clearFeedback(); this.audio.reset(); saveToStorage(this.state); }
  };

  private refreshPointerTarget(): void {
    if (this.windowOpen || !this.renderer || !this.pointerClient) {
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
    this.controlHint = null;
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
    return Object.freeze({ revision: this.revision, controlHint: this.controlHint ? { ...this.controlHint } : null, presentation: { ...this.presentation }, state: structuredClone(this.state),
      workshop: this.workshop ? { ...this.workshop } : null,
      elevatorUi: this.elevatorUi ? { ...this.elevatorUi } : null, helpOpen: this.helpOpen, management: this.management ? structuredClone(this.management) : null });
  }
}
