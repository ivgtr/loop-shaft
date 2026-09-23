from pathlib import Path

def replace(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    assert text.count(old) == count, (path, old, text.count(old))
    p.write_text(text.replace(old, new))

for path in ['src/render/gameRenderer.ts', 'src/render/phase5Renderer.ts']:
    p = Path(path)
    p.write_text("import type { FeedbackOutput } from '../game/rewardFeedback';\n" + p.read_text())
replace('src/render/gameRenderer.ts', 'constructor(canvas: HTMLCanvasElement) {', 'constructor(canvas: HTMLCanvasElement, output?: FeedbackOutput) {')
replace('src/render/gameRenderer.ts', 'new Phase5Renderer(canvas, this.assets)', 'new Phase5Renderer(canvas, this.assets, output)')
replace('src/render/phase5Renderer.ts', 'constructor(canvas: HTMLCanvasElement, private readonly assets: D001AssetStore) {', 'constructor(canvas: HTMLCanvasElement, private readonly assets: D001AssetStore, output?: FeedbackOutput) {')
replace('src/render/phase5Renderer.ts', 'new CanvasRenderer(canvas, assets)', 'new CanvasRenderer(canvas, assets, output)')
for path in ['src/render/gameRenderer.ts', 'src/render/phase5Renderer.ts']:
    replace(path, '  handleEvent(event: GameEvent, state: GameState, now: number): void {', '  clearFeedback(): void { this.base.clearFeedback(); }\n\n  handleEvent(event: GameEvent, state: GameState, now: number): void {')

# Add only a PUBLIC appearance key. Sealed specimens/tools never disclose kind or grade.
replace('src/game/mining.ts', "emit('DISCOVERY_FOUND', { id: item.id, name: item.name, rarity: item.rarity, category: item.category });", "emit('DISCOVERY_FOUND', { id: item.id, name: item.name, rarity: item.rarity, category: item.category,\n        publicKind: item.specimen || item.equipmentSeed !== undefined ? 'SEALED' : item.kind });")
replace('src/game/phase5.ts', "emit(state, 'DISCOVERY_FOUND', { id: loot.id, name: loot.name, rarity: loot.rarity, category: loot.category, nodeId: node.id, depth: D180 });", "emit(state, 'DISCOVERY_FOUND', { id: loot.id, name: loot.name, rarity: loot.rarity, category: loot.category, nodeId: node.id, depth: D180, publicKind: 'SEALED' });")

runtime = 'src/runtime/GameRuntime.ts'
p = Path(runtime)
p.write_text("import { loadPresentationSettings, savePresentationSettings, type PresentationSettings } from '../game/presentationSettings';\n" + p.read_text())
replace(runtime, '  readonly revision: number;', '  readonly revision: number;\n  readonly presentation: PresentationSettings;')
replace(runtime, '  private readonly audio = new GameAudio();', '  private readonly audio = new GameAudio();\n  private presentation = loadPresentationSettings();')
replace(runtime, 'this.renderer = new GameRenderer(canvas);', 'this.renderer = new GameRenderer(canvas, { reward: notice => this.audio.playReward(notice), settings: () => this.presentation });')
replace(runtime, '  unlockAudio(): void { this.audio.unlock(); }', '''  unlockAudio(): void { this.audio.setVolume(this.presentation.volume); this.audio.unlock(); }

  changePresentation(setting: keyof PresentationSettings): void {
    if (!this.helpOpen) return;
    this.presentation = { ...this.presentation, [setting]: setting === 'volume'
      ? this.presentation.volume === 0 ? .5 : this.presentation.volume < 1 ? 1 : 0
      : !this.presentation[setting] };
    this.audio.setVolume(this.presentation.volume);
    savePresentationSettings(this.presentation);
    this.publish();
  }''')
replace(runtime, '    this.canvas = null;\n    this.renderer = null;', '    this.renderer?.clearFeedback(); this.audio.reset();\n    this.canvas = null;\n    this.renderer = null;')
replace(runtime, '    this.animationFrame = null;\n    this.releaseInputs();', '    this.animationFrame = null;\n    this.renderer?.clearFeedback(); this.audio.reset();\n    this.releaseInputs();')
replace(runtime, '      this.renderer?.handleEvent(gameEvent, this.state, now);\n      this.audio.handle(gameEvent);', '      if (!document.hidden) {\n        this.renderer?.handleEvent(gameEvent, this.state, now);\n        this.audio.handle(gameEvent, this.state);\n      }')
replace(runtime, "if (document.visibilityState === 'hidden') { this.releaseInputs(); saveToStorage(this.state); }", "if (document.visibilityState === 'hidden') { this.releaseInputs(); this.renderer?.clearFeedback(); this.audio.reset(); saveToStorage(this.state); }")
replace(runtime, 'return Object.freeze({ revision: this.revision, state: structuredClone(this.state),', 'return Object.freeze({ revision: this.revision, presentation: { ...this.presentation }, state: structuredClone(this.state),')
replace('src/game/audio.ts', 'this.voices.size >= 24', 'this.voices.size >= (reward ? 24 : 16)')

ui = 'src/render/gameUi.ts'
p = Path(ui)
p.write_text("import { DEFAULT_PRESENTATION, type PresentationSettings } from '../game/presentationSettings';\n" + p.read_text())
replace(ui, "  | { type: 'lift-tab'; tab: ElevatorTab }", "  | { type: 'presentation'; setting: keyof PresentationSettings }\n  | { type: 'lift-tab'; tab: ElevatorTab }")
replace(ui, 'help: boolean, viewport: UiViewport): GameUiLayout', 'help: boolean, viewport: UiViewport, presentation: PresentationSettings = DEFAULT_PRESENTATION): GameUiLayout')
replace(ui, '    if (help) return { buttons, panel, compact, item: null };', '''    if (help) {
      const settings: Array<{ setting: keyof PresentationSettings; text: string; label: string }> = [
        { setting: 'volume', text: `VOL ${Math.round(presentation.volume * 100)}%`, label: `Sound volume ${Math.round(presentation.volume * 100)} percent` },
        { setting: 'motion', text: `MOTION ${presentation.motion ? 'ON' : 'OFF'}`, label: `Screen shake and effect motion ${presentation.motion ? 'on' : 'off'}` },
        { setting: 'highlights', text: `LIGHT ${presentation.highlights ? 'ON' : 'OFF'}`, label: `Effect highlights ${presentation.highlights ? 'on' : 'off'}` },
      ];
      settings.forEach((setting, n) => buttons.push({ id: `presentation-${setting.setting}`, text: setting.text, label: setting.label,
        action: { type: 'presentation', setting: setting.setting }, x: panel.x + 8 + n * (panel.width - 16) / 3,
        y: panel.y + panel.height - 54, width: (panel.width - 16) / 3 - 4, height: 44 }));
      return { buttons, panel, compact, item: null };
    }''')
replace(ui, 'controls.forEach((label, n) => text(ctx, label, x, p.y + 72 + n * 24, 12));\n      lines(ctx, sceneReadout(state).detail || sceneReadout(state).goal, x, p.y + 264, width, 12, compact ? 4 : 3, C.gold);', 'controls.forEach((label, n) => text(ctx, label, x, p.y + 72 + n * (p.height < 350 ? 18 : 24), 12));\n      if (p.height >= 350) lines(ctx, sceneReadout(state).detail || sceneReadout(state).goal, x, p.y + 258, width, 12, 2, C.gold);')
component = 'src/components/game/GameUiCanvas.tsx'
replace(component, 'const { state, workshop, elevatorUi, helpOpen, management } = useGameSnapshot();', 'const { state, workshop, elevatorUi, helpOpen, management, presentation } = useGameSnapshot();')
replace(component, 'layoutGameUi(state, elevatorUi, helpOpen, viewport), [state, workshop, elevatorUi, helpOpen, viewport]', 'layoutGameUi(state, elevatorUi, helpOpen, viewport, presentation), [state, workshop, elevatorUi, helpOpen, viewport, presentation]')
replace(component, "    if (action.type === 'station-open')", "    if (action.type === 'presentation') runtime.changePresentation(action.setting);\n    else if (action.type === 'station-open')")

# Keep existing regressions; change only the old assertion that EVERY hit shakes the world.
replace('tests/miningImpactEffects.test.ts', 'expect(Math.abs(effects.shake(state, 150))).toBe(1);', "expect(effects.shake(state, 150)).toBe(0);\n      effects.hit({ ...hit(state), type: 'NODE_BREAK' }, state, 100);\n      expect(Math.abs(effects.shake(state, 150))).toBe(1);")
replace('tests/e2e/mining-impact.spec.ts', "    renderer.handleEvent({ id: 2, at: 0, type: 'DATA_GAIN'", "    renderer.handleEvent({ id: 10, at: 0, type: 'NODE_BREAK', data: { depth: 'D-001', nodeId: state.run.character.targetNodeId } }, state, 100);\n    renderer.handleEvent({ id: 2, at: 0, type: 'DATA_GAIN'")

replace('docs/game-design-requirements.md', '## Reference Concept Art', '## 報酬演出 第1段階（2026-09-23）\n\n[報酬演出と音の仕様](./reward-presentation.md)を併せて適用します。通常打撃は局所反応、画面揺れはプレイヤーの実破壊に限定します。品質・金品・鑑定・遺物の音と演出を同期し、抽選や物流は変更しません。\n\n## Reference Concept Art')
replace('docs/discovery-visuals.md', '## 打撃演出', '## 打撃演出\n\n以下は統合時点の記録です。現在の打撃／破壊の強弱と報酬演出は [reward-presentation.md](reward-presentation.md) を優先します。')
Path(__file__).unlink()
