write('docs/game-design-requirements.md', 'bc5030713eca1feb0d1b727a0e434b9aa49d88d53962ff09a7605f68e2efb4b1', 'da123430149e1a4cfbadf5229159d61f1645500913c68f10c6846ac2410bae5f', [(29,29,'''\n## 状態説明を減らすUI（2026-09-23）

[通常画面と詳細確認の表示分担](./quiet-worksite-ui.md)を適用します。HP・容量をゲージへ移し、通常動作の実況と目標バナーを撤去します。正確な値・前提条件・有限報酬は読み上げと詳細画面に残します。ゲーム判定・バランス・セーブ形式は変更しません。
''')])
write('docs/quiet-worksite-ui.md', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '1f9ba8a530f5e6becacb1f03e32db06adf0498394791994eec03c6a8ba771665', [(0,0,'''# 状態を実況しない採掘UI

通常画面は現場・選択対象・主操作を中心とする。`sceneReadout` は正確な読み上げと詳細確認用に維持し、通常のCanvas HUDには流さない。

## 表示の分担

- 鉱脈HPは選択・ホバー・プレイヤーの採掘対象にだけ短いゲージで表示する。破壊後は消す。岩の亀裂と有限の手掛かりの既存素材はそのまま使う。全対象の枠や操作可否点滅は表示しない。
- 鉱脈の役割・確率・濃集部・Core残量・往復時間は `INSPECT` / `I` のFIELD NOTESにまとめる。バッグのゲージから貨物の重量・容量・見込み額・内訳を確認できる。既存のページ送りとフォーカス管理を使用する。
- 歩行・スイング・回収・積み込みは動作で伝える。失敗した操作だけ対象の近くに短い理由を2.2秒表示する。通常動作の待ち時間には失敗表示を出さない。
- 初回配送までは次の操作だけ短く案内する。以後は設備の小さな目印とヘルプ内の目標に分ける。目標バナーによる購入誘導は撤去する。
- SCRAPと深度は常設。DATA・COREは関連する進行や取得時に、RUNは2周目から表示する。読み上げには全資源を残す。
- バッグとリフトは容量ゲージを主表示とする。満杯は斜線で色以外でも識別する。数値はフォーカス・ホバーまたは詳細から確認できる。リフトの通常動作は本体の動きと小さな方向印、自動発送はA、回収保留／自動発送停止はIIで示す。正確な待機条件・物流障害はLIFTと既存の設備詳細に残す。
- MINE・その場の操作・SENDを主操作にする。左右・RETURN・STOP・LIFT・ヘルプは静かな副操作にし、位置と44px以上のヒット領域は固定する。短いスイング中にボタンの見た目を点滅させないが、入力判定は変更しない。
- ワークショップの常設FITTED／Ready／Installedの重複を減らす。価格、性能差、不足条件、一度の購入通知は残す。階層開通・移動・送荷は別操作を維持し、Reboot等の確認は変更しない。

## 入力とアクセシビリティ

ゲージの値は実際のHP・重量から導出し、ARIA progressbarにも同じ値を渡す。無効な現場コマンドは`aria-disabled`で示し、押した場合は理由だけを提示する。購入等の無効操作は従来のnative disabledを維持する。新しい案内・ウィンドウ状態はセーブに保存しない。音を聞けない場合も現場の状態と容量を確認できる。

## 検証の範囲

既存のシミュレーション・入力・セーブのテストを維持。表示文言を調べるテスト、ゲージ・操作領域・詳細ページのテスト、およびPC／小画面での読み上げ値・詳細確認・案内の消去を対象にする。視覚の完成度と遊び心地は人間のプレイで確認する。
''')])
write('src/components/game/GameUiCanvas.tsx', '80b0d1eda66a5e367461b9d79620c872ef46e7a17642b9011e2ae3e30553436f', '5dd93fee65fd6f2681194e868669c3cd5a880ddaf7b381f16bb7af93af3529bf', [
(0,0,"import { inspectedNode } from '../../game/fieldUi';\nimport { shipmentStatus } from '../../game/elevatorUi';\n"),
(11,12,"import { cargoValue, carriedWeight, cargoWeight } from '../../game/simulation';\n"),
(18,19,"  const { state, workshop, elevatorUi, helpOpen, management, presentation, controlHint } = useGameSnapshot();\n"),
(31,31,"  const node = inspectedNode(state);\n"),
(209,210,'''        <p>A/D or arrows to walk. Space to mine. E to interact. F to send. I to inspect. RETURN to unload. Escape to close or stop. Hold the direction buttons to walk on touch.</p></div>}
'''),
(215,216,'''        {node && <p role="progressbar" aria-label={`${node.name} rock remaining`} aria-valuemin={0} aria-valuemax={node.maxHp}
          aria-valuenow={Math.max(0, Math.min(node.maxHp, node.hp))}>HP {node.hp}/{node.maxHp}</p>}
        <p role="progressbar" aria-label="Backpack capacity" aria-valuemin={0} aria-valuemax={state.run.character.backpackCapacity}
          aria-valuenow={Math.min(state.run.character.backpackCapacity, carriedWeight(state))}>{carriedWeight(state)} kg</p>
        <p role="progressbar" aria-label="Lift capacity" aria-valuemin={0} aria-valuemax={state.run.elevator.maxLoad}
          aria-valuenow={Math.min(state.run.elevator.maxLoad, cargoWeight(state.run.elevator.cargo))}>{cargoWeight(state.run.elevator.cargo)} kg</p>
        <p id="shipment-status">{shipmentStatus(state)}</p>
        <p role="status" aria-live="polite">{controlHint?.text}</p>
        <p id="player-control-help">A/D or arrows walk. Space mines. E interacts. F sends. I opens field notes. Escape stops. Click a vein to approach it or click the floor to walk.</p>
'''),
(218,220,'''        className="canvas-hit" aria-label={button.label} disabled={button.disabled && button.action.type !== 'command'} aria-disabled={button.disabled || undefined}
        data-status={button.badge} aria-describedby={button.id === 'lift-open' ? 'shipment-status' : button.badge || button.detail ? `status-${button.id}` : undefined}
'''),
(246,246,'''          if (button.disabled) {
            if (button.action.type === 'command') runtime.explainControl(button.action.command);
            return;
          }
''')])
write('src/game/elevatorUi.ts', 'cb69c427f5395db164044c8d56714bc0025938495fb73974260a740b81a3f389', 'e0280307d620976fb11ff78ff3f6197017465cd1e47dcb62536bd8e58050d634', [
(61,62,"      description: `Travel to this floor${viaSurface ? ' via Surface' : ''}. Unload cargo and empty the lift first.`,\n"),
(68,69,"    description: 'Send cargo to Surface. Paid on arrival.',\n"),
(151,152,"          : 'Open this connection, then select it in TRAVEL.',\n")])
write('src/game/fieldUi.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '0b7586e2644402fca5476f1abbb7d74041d19491e0570308aba0f244b799e077', [(0,0,'''import { DEPTH_ORDER } from './depth';
import { WORLD } from './config';
import { deriveInitialLogisticsGuide } from './initialLogisticsGuide';
import { miningTarget, playerInteraction } from './playerControls';
import { canDispatchElevator, carriedWeight, currentFloor, mineBlockReason } from './simulation';
import { workshopGuide } from './workshop';
import type { GameState, Selection } from './types';
import type { GameCommand } from '../runtime/commands';

/** Presentation only. Detailed state and prerequisites remain in sceneReadout. */
export function inspectedNode(state: GameState) {
  const selection = state.selection;
  return selection?.type === 'node'
    ? currentFloor(state).nodes.find(node => node.id === selection.id) : miningTarget(state);
}

export function fieldResources(state: GameState) {
  const { run, meta } = state;
  return {
    data: run.data > 0 || run.depth.unlocked.includes('D-060') || Boolean(run.research.active) || run.research.completed.length > 0,
    core: meta.core > 0 || run.pendingCore > 0 || meta.runIndex > 1 || run.depth.unlocked.includes('D-100'),
    run: meta.runIndex > 1,
  };
}

export function fieldInstruction(state: GameState): string | null {
  const guide = deriveInitialLogisticsGuide(state);
  if (!guide) return null;
  switch (guide.step) {
    case 'choose-vein': return 'SELECT A VEIN';
    case 'mine-ready': return state.run.stats.manualSwings === 0 ? 'SPACE / MINE' : null;
    case 'pickup-ready': return 'E / PICK UP ORE';
    case 'carrying': return 'RETURN TO UNLOAD';
    case 'load-ready': return playerInteraction(state).reason ? null : 'E / LOAD CARGO';
    case 'select-elevator': case 'send-to-surface': return 'SEND CARGO TO SURFACE';
    default: return null; // Walking, swinging, loading and delivery are visible work.
  }
}

/** One quiet marker points to the relevant facility, rather than a permanent quest banner. */
export function fieldGuideTarget(state: GameState): Selection {
  const guide = deriveInitialLogisticsGuide(state);
  if (guide) return fieldInstruction(state) && guide.target.kind === 'interaction' ? guide.target.ref : null;
  const { run, meta } = state;
  if (run.elevator.travel || run.depth.current === 'D-650') return null;
  const next = DEPTH_ORDER[DEPTH_ORDER.indexOf(run.depth.current) + 1];
  if (next && run.depth.unlocked.includes(next)) return { type: 'elevator' };
  if (workshopGuide(state)) return { type: 'workbench' };
  if (run.depth.current === 'D-030') {
    if (!run.anomaly.selected) return { type: 'scanner' };
    if (!run.porter.enabled || !run.automation.autoDispatch.unlocked) return { type: 'workbench' };
    if (meta.collection.entries.some(entry => entry.discovered) && !meta.passives.unlocked.length) return { type: 'archive' };
  }
  if (run.depth.current === 'D-060' && !run.research.completed.includes('CORE_RESONANCE')) return { type: 'research' };
  if (run.depth.current === 'D-100' && meta.runIndex === 1) {
    return run.pendingCore > 0 ? { type: 'core-chamber' } : { type: 'node', id: 'core-shell' };
  }
  return { type: 'elevator' };
}

export interface FieldHint { text: string; x: number; y: number; }
/** Only explicit unsuccessful attempts get a short local hint. Never narrate normal work. */
export function fieldActionHint(state: GameState, command: GameCommand): FieldHint | null {
  const player = { x: state.run.character.x, y: state.run.character.y - 35 };
  const lift = { x: WORLD.elevatorX, y: WORLD.floorY - 55 };
  if (command.type === 'mine') {
    const reason = mineBlockReason(state, command.nodeId);
    if (!reason || /^(TRAVELING|SWINGING|MOVING|COLLECTING|LOADING)/.test(reason)) return null;
    const node = command.nodeId ? currentFloor(state).nodes.find(node => node.id === command.nodeId) : inspectedNode(state);
    const text = node?.access === 'REMOTE_ONLY' ? 'NO WALKWAY'
      : node?.hp === 0 ? 'CHOOSE ANOTHER VEIN'
      : reason === 'CHOOSE ANOMALY' ? 'USE THE SCANNER' : 'MOVE CLOSER TO A VEIN';
    return { text, ...(node ? { x: node.x, y: node.y - 44 } : player) };
  }
  if (command.type === 'interact') {
    const reason = playerInteraction(state).reason;
    if (!reason || /^(TRAVELING|COLLECTING|LOADING)/.test(reason)) return null;
    if (reason.startsWith('PACK FULL')) return { text: 'BAG FULL - ORE STAYS HERE', ...player };
    if (reason.startsWith('LIFT FULL')) return { text: 'SEND CARGO FIRST', ...lift };
    if (reason.startsWith('LIFT UNAVAILABLE')) return { text: 'LIFT AWAY', ...lift };
    return { text: 'NOTHING IN REACH', ...player };
  }
  if (command.type === 'send' && !canDispatchElevator(state)) {
    if (state.run.elevator.state === 'IDLE_BOTTOM' && !state.run.elevator.travel) return { text: 'LOAD CARGO FIRST', ...lift };
  }
  if (command.type === 'return' && carriedWeight(state) === 0) return { text: 'BAG EMPTY', ...player };
  return null;
}

/** Waiting policies matter; normal ascending/loading/unloading does not need a caption. */
export function liftNeedsAttention(state: GameState): boolean {
  const { elevator, porter, automation } = state.run;
  return !elevator.travel && elevator.state === 'IDLE_BOTTOM'
    && (Boolean(porter.holdForTravel) || (elevator.cargo.length > 0 && automation.autoDispatch.unlocked));
}
''')])
write('src/game/hud.ts', '0ecebcb17ff26b2e0cbd402dde00f7e92234c64e23e0c37f4d31f3bdbb945b3e', '633db56bf025834620eb4e0ba3da488fbc851fa4f4e07bd2aae5605de2e707f4', [(9,10,'/** Detailed readout for assistive technology and help, not the always-visible HUD. */\n')])
write('src/game/management/index.ts', '4f4495dfe9e4a8c9f0e6a6c45ac5cfda64569749aa434d11d8201ff9d1e3b98f', 'ec45eb3fa172f7094013964a7472ab544417b86a0f780dfd2de5ea4b3ff9491c', [
(0,0,"import { surveyView } from './survey';\n"),
(13,13,"    case 'survey': return !(run.depth.current === 'D-030' && !run.anomaly.selected);\n"),
(53,53,"    case 'survey': view = surveyView(state, ui); break;\n"),
(73,73,"    ['survey', 'Field notes', 'Inspect veins, discoveries and cargo.'],\n")])
write('src/game/management/survey.ts', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', '5e9a9943c5905da557cedacf9ce0a814f4f29a03d237203b057e389d39d1c699', [(0,0,'''import { inspectedNode } from '../fieldUi';
import { nodeSurvey, nodeTripEstimate } from '../mining';
import { cargoValue, cargoWeight, currentFloor } from '../simulation';
import { shipmentStatus } from '../elevatorUi';
import type { GameState, LootStack } from '../types';
import { information, number, type ManagementState, type StationItem, type StationView } from './types';

/** Read-only field notes reuse the existing paged Canvas window and keyboard navigation. */
export function surveyView(state: GameState, ui: ManagementState): StationView {
  const floor = currentFloor(state);
  const load = (id: string, name: string, items: LootStack[], total: number): StationItem => {
    const weight = cargoWeight(items);
    return { ...information(id, name, `${number(weight)}/${total} kg · EST ${cargoValue(items)} Scrap`, [
      ...(id === 'backpack' ? ['Carry ore to the lift to unload. A full bag does not stop mining.'] : [shipmentStatus(state)]),
      ...items.map(item => `${item.name}${item.quality ? ` · ${item.quality}` : ''}: ${number(item.weight)} kg · ${item.value} Scrap`),
      ...(!items.length ? ['Empty'] : []),
    ]), progress: { value: weight, total, label: 'Capacity' } };
  };
  return { title: 'FIELD NOTES', tabs: [{ id: 'veins', label: 'VEINS' }, { id: 'cargo', label: 'CARGO' }],
    items: ui.tab === 'cargo' ? [load('backpack', 'Backpack', state.run.character.carried, state.run.character.backpackCapacity),
      load('lift', 'Lift cargo', state.run.elevator.cargo, state.run.elevator.maxLoad)]
      : floor.nodes.map(node => {
        const trip = nodeTripEstimate(state, node);
        return { ...information(node.id, node.name, node.access === 'REMOTE_ONLY' ? 'No walkway · remote equipment required' : 'Mining vein', [
          `HP ${node.hp}/${node.maxHp}${node.hp <= 0 ? ` · Returns in ${Math.ceil(node.respawnTimer)}s` : ''}`,
          ...nodeSurvey(state, floor, node).split(' · '),
          `Haul about ${trip.walkSeconds.toFixed(1)}s round trip; average ore ${trip.averageWeight.toFixed(1)}kg`,
          'Ordinary ore returns. Revealed discoveries and Core reserves are finite within this Run.',
        ]), progress: node.hp > 0 ? { value: node.hp, total: node.maxHp, label: 'Rock remaining' } : undefined };
      }) };
}

export function surveyRequest(state: GameState) {
  return { station: 'survey' as const, tab: 'veins', selectedId: inspectedNode(state)?.id };
}
''')])
write('src/game/management/types.ts', '46987cd7145daf67c83a0a9b41827eb77d4675af1364ece3a4b92ce1d67788dc', '42d8c2d7865214b3e1913f1c814eb1e3e99fa3f005210709ff5d4410a1b0a0ba', [(4,5,"export type Station = 'survey' | 'facilities' | 'equipment' | 'research' | 'crew' | 'archive' | 'scanner' | 'core' | 'reboot' | 'logistics';\n")])
