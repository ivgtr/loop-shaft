from pathlib import Path
import re, json, subprocess

def replace(path, old, new):
    p=Path(path); s=p.read_text(); assert old in s, (path, old[:100]); p.write_text(s.replace(old,new))
def section(path,start,end,new):
    p=Path(path); s=p.read_text(); a=s.index(start); b=s.index(end,a); p.write_text(s[:a]+new+s[b:])

# Short, reliable loads versus a harder bulk site; test both equipped and unequipped routes.
replace('src/game/config.ts', "154, 30, 7, ['STONE', 'IRON']", "154, 30, 7, ['IRON']")
replace('src/game/config.ts', "'Copper Pocket', 'MID', 356, 96,", "'Copper Pocket', 'MID', 356, 110,")
replace('src/game/config.ts', 'D060_EXTENSION_COST = 4800', 'D060_EXTENSION_COST = 3600')
replace('src/game/config.ts', 'D100_EXTENSION_COST = 6000', 'D100_EXTENSION_COST = 5000')
replace('src/game/mining.ts', "  'scrap-ledge': [1, 9], 'copper-pocket': [1, 4]", "  'copper-pocket': [1, 4]")
replace('tests/workshop.test.ts', 'Walk speed  78.4 px/s', 'Walk speed  87.1 px/s')
p=Path('tests/e2e/d001-visual.spec.ts'); s=p.read_text(); s=re.sub(r'\b118\b','SCRAP_X',s)
last=list(re.finditer(r'import\b.*?;',s,re.S))[-1].end(); s=s[:last]+"\nimport { createD001Nodes } from '../../src/game/config';\nconst SCRAP_X = createD001Nodes()[0]!.x;\n"+s[last:]; p.write_text(s)

# First-find protection is a one-time discovery guarantee, not an unlimited zero-wallet bonus.
replace('src/game/types.ts', '  foundThisRun: number;', '  foundThisRun: number;\n  categoriesFound?: LootCategory[];')
replace('src/game/createGame.ts', '      foundThisRun: 0,', '      foundThisRun: 0,\n      categoriesFound: [],')
replace('src/game/mining.ts', "    if (item.category !== 'ORE') {\n      state.run.discovery.foundThisRun += 1;", "    if (item.category !== 'ORE') {\n      const categories = state.run.discovery.categoriesFound ??= [];\n      if (!categories.includes(item.category)) categories.push(item.category);\n      state.run.discovery.foundThisRun += 1;")
replace('src/game/mining.ts', '  const hasFossil = state.meta.collection', '  const categories = discovery.categoriesFound ?? [];\n  const hasFossil = state.meta.collection')
replace('src/game/mining.ts', "floor.id === 'D-030' && !hasFossil &&", "floor.id === 'D-030' && !hasFossil && !categories.includes('FOSSIL') &&")
replace('src/game/mining.ts', "floor.id === 'D-030' && !state.meta.passives.unlocked.length &&", "floor.id === 'D-030' && !state.meta.passives.unlocked.length && !categories.includes('RELIC') &&")
replace('src/game/mining.ts', "floor.id === 'D-060' && state.run.data === 0 &&", "floor.id === 'D-060' && state.run.data === 0 && !categories.includes('RESEARCH') &&")
replace('src/game/save.ts', '  if (hasPhase5) normalizePhase5Run(run, rawRun.phase5);', "  run.discovery.categoriesFound = normalizeStringArray(discovery?.categoriesFound, ['VALUABLE', 'FOSSIL', 'RELIC', 'ANOMALY', 'RESEARCH', 'CORE'] as const);\n  if (!discovery?.categoriesFound) {\n    if (run.data > 0 || run.research.completed.length) run.discovery.categoriesFound.push('RESEARCH');\n    if (meta.passives.unlocked.length) run.discovery.categoriesFound.push('RELIC');\n    if (meta.collection.entries.some((entry) => entry.discovered && entry.category === 'FOSSIL')) run.discovery.categoriesFound.push('FOSSIL');\n  }\n  if (hasPhase5) normalizePhase5Run(run, rawRun.phase5);")

# Exhausted Shells are not advertised or selected as the best rare source.
replace('src/game/mining.ts', '  return Math.min(0.95, node.treasureChance * getModifiers(state).treasureChanceMultiplier);', "  if (node.id === 'core-shell') return coreReserveRemaining(node) > 0 ? 1 : 0;\n  return Math.min(0.95, node.treasureChance * getModifiers(state).treasureChanceMultiplier);")
replace('src/game/phase5.ts', 'finishingDamage, rollMiningLoot, nodeTripEstimate, treasureCategoryChance,', 'finishingDamage, rollMiningLoot, nodeTripEstimate, treasureChance, treasureCategoryChance,')
replace('src/game/phase5.ts', '(node.treasureChance + bonusRate +', '(treasureChance(state, node) + bonusRate +')
section('src/game/mining.ts', 'export function nodeSurvey(', '/** Approximate round trip', """export function nodeSurvey(state: GameState, floor: FloorState, node: MiningNode): string {
  const parts = [nodeRole(node)];
  const seam = visibleSeams(floor, node)[0];
  if (floor.id === 'D-180' && (node.minedCount ?? 0) === 0) parts.push('Sealed equipment on first break');
  if (seam) parts.push(`${LOOT[seam.kind].name} in ${seam.at - (node.minedCount ?? 0)} breaks`);
  const reserve = CORE_RESERVES[node.id];
  if (reserve) parts.push(`${coreReserveRemaining(node)}/${reserve} Core left this Run`);
  const exact = state.meta.passives.active.includes('PROSPECTORS_EYE') || state.run.research.completed.includes('STRATA_SCANNER');
  if (!seam) parts.push(`STEADY ORE${exact ? ` · FIND ${(treasureChance(state, node) * 100).toFixed(0)}%` : ''}`);
  return parts.join(' · ');
}

""")
# Deep permanent shortcuts require the corresponding expedition record, not just a hoard of shallow Core.
replace('src/game/config.ts', 'export interface ProtocolDefinition { name: string; description: string; cost: number; }', "export interface ProtocolDefinition { name: string; description: string; cost: number; requiredDepth?: import('./types').DepthId; }")
p=Path('src/game/config.ts'); s=p.read_text()
for id, depth in {'RAIL_BLUEPRINT':'D-250','FREIGHT_CHARTER':'D-250','ENGINEER_LICENSE':'D-250','BORE_MEMORY':'D-400','DEEP_SURVEY_ARCHIVE':'D-180'}.items():
    s,n=re.subn(r'(^  '+id+r': \{[^\n]*?)( \},)', lambda m:m[1]+", requiredDepth: '"+depth+"'"+m[2], s, flags=re.M); assert n==1, id
p.write_text(s)
replace('src/game/simulation.ts', 'export function purchaseCoreProtocol(state:', """export function coreProtocolBlockReason(state: GameState, id: CoreProtocolId): string | null {
  const definition = CORE_PROTOCOLS[id];
  if (state.meta.protocols.includes(id)) return 'Protocol installed permanently.';
  if (definition.requiredDepth && DEPTH_RANK[state.meta.bestDepth] < DEPTH_RANK[definition.requiredDepth]) {
    return `Reach ${definition.requiredDepth} before installing this deep Protocol.`;
  }
  return state.meta.core < definition.cost ? `Need ${definition.cost - state.meta.core} more Core.` : null;
}

export function purchaseCoreProtocol(state:""")
replace('src/game/simulation.ts', "if (state.selection?.type !== 'core-console' || state.meta.protocols.includes(id) || state.meta.core < definition.cost) return false;", "if (state.selection?.type !== 'core-console' || coreProtocolBlockReason(state, id)) return false;")
replace('src/game/management/progression.ts', "import { researchBlockReason } from '../simulation';", "import { coreProtocolBlockReason, researchBlockReason } from '../simulation';\nimport { coreReserveRemaining } from '../mining';")
replace('src/game/management/progression.ts', "const reason = owned ? 'Protocol installed permanently.' : state.meta.core < definition.cost ? `Need ${definition.cost - state.meta.core} more Core.` : null;", 'const reason = coreProtocolBlockReason(state, id);')
replace('src/game/management/progression.ts', "lines: [definition.description, 'Permanent. Applies again at the start of each Run.'],", "lines: [definition.description, definition.requiredDepth ? `Requires the ${definition.requiredDepth} expedition record.` : 'Available from the first Core expedition.', 'Permanent. Applies again at the start of each Run.'],")
replace('src/game/management/progression.ts', "  const lines = [\n    `KEEP:", "  const shell = run.floors['D-100'].nodes.find((node) => node.id === 'core-shell')!;\n  const lines = [\n    `CORE SHELL: ${coreReserveRemaining(shell)}/4 still in the rock this Run. Other depths have their own finite reserves.`,\n    `KEEP:")

# Focused regressions for the new safeguards.
replace('tests/balance.test.ts', '  canExtendD030, currentFloor,', '  canExtendD030, currentFloor,') if False else None
replace('tests/balance.test.ts', 'import { canExtendD030, currentFloor,', 'import { coreProtocolBlockReason, purchaseCoreProtocol, canExtendD030, currentFloor,')
p=Path('tests/balance.test.ts'); s=p.read_text(); s += """
describe('first-find and deep-protocol safeguards', () => {
  it('does not reissue first Research because cargo is undelivered or Data was spent', () => {
    const state = createGameState(400);
    const floor = state.run.floors['D-060']; const node = floor.nodes[0]!;
    node.treasureChance = 0;
    expect(rollMiningLoot(state, floor, node, sink).some((item) => item.category === 'RESEARCH')).toBe(true);
    state.run.discovery.d060NodeBreaks = 100; state.run.data = 0;
    expect(rollMiningLoot(state, floor, node, sink).some((item) => item.category === 'RESEARCH')).toBe(false);
    const restored = restoreGameState(serializeGameState(state))!;
    const again = restored.run.floors['D-060']; again.nodes[0]!.treasureChance = 0;
    expect(rollMiningLoot(restored, again, again.nodes[0]!, sink).some((item) => item.category === 'RESEARCH')).toBe(false);
  });
  it('requires a real deep expedition for deep permanent shortcuts without revoking owned ones', () => {
    const state = createGameState(401); state.meta.core = 100; state.selection = { type: 'core-console' };
    expect(coreProtocolBlockReason(state, 'BORE_MEMORY')).toContain('D-400');
    expect(purchaseCoreProtocol(state, 'BORE_MEMORY')).toBe(false);
    state.meta.bestDepth = 'D-400'; expect(purchaseCoreProtocol(state, 'BORE_MEMORY')).toBe(true);
    state.meta.bestDepth = 'D-001';
    expect(restoreGameState(serializeGameState(state))!.meta.protocols).toContain('BORE_MEMORY');
  });
});
"""; p.write_text(s)

# Emit reports only on explicit request; regular tests leave docs unchanged.
replace('tests/balanceSimulation.test.ts', "import { describe, expect, it } from 'vitest';", "import { afterAll, describe, expect, it } from 'vitest';\nimport { createHash } from 'node:crypto';\nimport { readFileSync, writeFileSync, mkdirSync } from 'node:fs';\nimport { dirname } from 'node:path';")
replace('tests/balanceSimulation.test.ts', "describe('reproducible balance probes", """const report: Record<string, unknown> = {
  method: 'Deterministic scripted physical delivery, not human play time or an optimality proof.',
  fixedStepSeconds: 0.1, incomeHorizonSeconds: 360, incomeSeeds: seeds,
  configSha256: createHash('sha256').update(readFileSync(new URL('../src/game/config.ts', import.meta.url))).digest('hex'),
  miningSha256: createHash('sha256').update(readFileSync(new URL('../src/game/mining.ts', import.meta.url))).digest('hex'),
  modifiersSha256: createHash('sha256').update(readFileSync(new URL('../src/game/modifiers.ts', import.meta.url))).digest('hex'),
};
afterAll(() => {
  const output = process.env.BALANCE_REPORT_PATH;
  if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\\n'); }
});

describe('reproducible balance probes""")
replace('tests/balanceSimulation.test.ts', "    console.log('BALANCE_INCOME '", "    report.income = rows;\n    console.log('BALANCE_INCOME '")
replace('tests/balanceSimulation.test.ts', "    console.log('BALANCE_AUTOMATION '", "    report.automation = rows;\n    console.log('BALANCE_AUTOMATION '")
replace('tests/balanceSimulation.test.ts', "    console.log('BALANCE_FIRST_CORE '", "    report.firstCore = results;\n    report.firstCoreSummary = [false, true].map((exploreEarly) => {\n      const values = results.filter((row) => row.exploreEarly === exploreEarly && row.coreDelivered !== null).map((row) => row.coreDelivered!);\n      return { exploreEarly, completed: values.length, p50Seconds: percentile(values, 0.5), p90Seconds: percentile(values, 0.9), maxSeconds: Math.max(...values) };\n    });\n    console.log('BALANCE_FIRST_CORE '")
p=Path('tests/fixtures/balanceScenario.ts'); s=p.read_text(); s=re.sub(r"\nexport const ordinaryValue[^\n]*",'',s); s=s.replace('import { LOOT, D030_EXTENSION_COST', 'import { D030_EXTENSION_COST'); p.write_text(s)
p=Path('package.json'); package=json.loads(p.read_text()); package['scripts']['balance:report']='node scripts/balance-report.mjs'; p.write_text(json.dumps(package,indent=2)+'\n')

# Replace contradictory timing and mechanics examples with the current balance contract.
p=Path('docs/game-design-requirements.md'); s=p.read_text()
s=s.replace('# LOOP SHAFT 再実装 作業依頼要件書', '# LOOP SHAFT 再実装 作業依頼要件書\n\n## 現行バランス（2026-09-22）\n\n[採掘・発見・物流のバランス仕様](./balance-design.md)を併せて適用します。通常鉱脈は再生する安定生産、濃集部とCoreは周回内の有限報酬です。地点別抽選、購入順の選択、重量・重要度・待ち時間による発送を実装します。旧UI改修節の数値据え置き指定は、その段階に限る制約です。\n\n[再現可能な計測結果](./balance-results.json)は自動操作の試走であり、人間の所要時間・面白さの検証結果ではありません。')
s=s.replace('- 0〜60分：初回 D-100 到達と最初の Reboot', '- 0〜60分：初回 D-100 到達と最初の Reboot（人間の仮目標45〜60分）')
s=s.replace('鉱脈HPが10%以下なら採掘ダメージ3倍。', '攻撃後の残HPが最大HPの15%以下、かつ今回ダメージの75%以下なら、その端数を掘り切る。実際の必要打数を減らす。')
s=s.replace('空荷時の移動速度 +40%。', '空荷時のプレイヤー移動速度 +65%。')
s=s.replace('満載で発送した場合、次のエレベーター速度 +50%。', '85%以上を積んで発送すると、その往復の移動速度が65%上がる。BALANCED/BULKはこの積載率を目標にし、待ち上限も維持する。')
s=s.replace('同じ深度でも、周回ごとに配置・種類を一部ランダム化します。', '基礎鉱脈の配置と役割は安定させ、濃集部の内容をRun/Floor Seedで決めます。濃集部には消滅期限を設けません。地形全体の再生成・掘り進みによる経路生成は今回の改修には含めません。')
s=s.replace('通常鉱石量 -30%。高価値品率 ×4。', '通常鉱石量×0.85、特殊ドロップ率×1.25、VALUABLEカテゴリの抽選重み×3.2。')
s=s.replace('全キャラ移動速度 -30%。鉱石価値 ×2。', 'プレイヤー・採掘員・運搬員の移動速度×0.8、地上査定額×1.35。')
s=s.replace('エレベーター容量 -50%。発送速度 ×3。', 'エレベーター容量×0.65、移動速度×1.9。')
s=s.replace('化石率 ×5。金属鉱石率低下。', '化石カテゴリの抽選重み×3.1、通常鉱石の査定額×0.62。')
s=s.replace('鉱脈が時間で少し再生する。', '通常鉱脈の再生速度×2.2、通常鉱石量×1.2。有限の濃集部・Coreは補充しない。')
s=s.replace('岩HP -50%。Anomalyアイテム出現率上昇。', '採掘ダメージ×1.6、通常鉱石量×0.75、特殊ドロップ率×1.1、Anomaly抽選重み×2.5、研究抽選重み×1.15。')
a=s.index('# 30. 3時間の進行設計'); b=s.index('# 31. 数値設計の原則',a)
s=s[:a]+'''# 30. 3時間の進行設計

初周45〜60分を人間の仮目標として一本化します。これは達成済みの主観的プレイ時間ではありません。

| 時間の目安 | 体験 |
| --- | --- |
| 0〜5分 | 完全手動で納品し、初装備と遠方の最初の化石を知る |
| 5〜15分 | D-030の探索を先にするか、運搬・発送を整えるか選ぶ |
| 15〜35分 | Anomaly、発見、D-060の研究で次の目的が変わる |
| 35〜60分 | 有限Coreを地上に届け、追加採掘か初Rebootを選ぶ |
| 60〜110分 | 2周目の序盤短縮、複数作業員、D-180の装備発見 |
| 110〜170分 | 周回と装備を選び、D-250の物流ラインを作る |
| 170分〜 | D-400の遠隔採掘と深層の有限報酬を目指す |

全ての地点を順番に回らせること、毎回同じ装備順を強制すること、長い資金待ちでプレイ時間を稼ぐことを目的にしません。自動化で余裕ができ、新しい発見へ行きたくなることを重視します。

比較は地上到着済みのScrap/Data/Core、初発見・初自動化・初Core納品までの中央値と遅いケース、歩行・入力負担で行います。`npm run balance:report` の決定論的試走を数値の回帰に使い、人間が感じる納得感・退屈さ・3時間の密度は別途プレイ確認します。

---

'''+s[b:]; p.write_text(s)
p=Path('README.md'); s=p.read_text(); marker='## Checks\n'; assert marker in s
s=s.replace(marker, '''## Balance

Renewable ore supports stable work. Visible, finite seams add fossils and special finds without lowering ordinary yield for staying at a site. D-030 can open before full automation; Boots and Pack do not require earlier shop purchases. Auto Dispatch offers BALANCED / BULK / PRIORITY policies with a maximum cargo wait. Core reserves are finite per site and Run.

The current rules and save migration are in [balance-design.md](docs/balance-design.md). `npm run test:balance` checks physical rewards, shipping and comparative routes; `npm run balance:report` explicitly regenerates [the scripted measurements](docs/balance-results.json). These are not human play-time or game-feel results.

'''+marker); p.write_text(s)
# Generate the audit data using the code being committed, not estimates copied into a document.
subprocess.run(['npm','ci'],check=True)
completed=subprocess.run(['npm','run','balance:report'])
print('Balance report exit status:', completed.returncode)
