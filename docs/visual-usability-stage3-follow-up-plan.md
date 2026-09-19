# グラフィック・操作性改善 Stage 3 追加対応計画

## 状態

2026-09-20実装・検証完了。Stage 3確認で得た次のフィードバックを対象とした。

- プレイヤーが正しく透過されていない。
- 歩行アニメーションの差分が少なく、図形版より動きが弱く見える。
- NPCと積み荷が画像描画へ移行されていない。

本対応でも480×270の論理解像度、GameStateからRendererへの一方向、Simulation・経済・乱数・保存形式、Stage 1・2の操作契約を維持する。

## 現行実装に基づく原因

### プレイヤーの透過

`scripts/process-d001-assets.mjs`は人物基準画像から装備領域を矩形maskで切り出し、その矩形をalphaとして使っている。alpha値自体は0または255だが、人物シルエット外にも不透明pixelが残り得る。現行検査は寸法とalpha値の種類だけを検査し、不透明領域の位置やレイヤー間の整合を検査していない。

### アニメーション差分

現行後処理は`walk`、`carry-walk`、`collect`、`load`などの必要フレーム数を満たすため、同一姿勢を複製してatlasを構築している。`semanticRenderState`のframeは進んでいるが、画像側の姿勢差がない。

### NPCとCargo

Porterは`src/render/entities.ts`、Crewは`src/render/phase5Renderer.ts`、Engineerと後半物流表示は`src/render/gameRenderer.ts`で図形描画されている。地面Loot、所持Cargo、Elevator Cargo、Floor Cargoも色付き矩形であり、当初のStage 3では図形維持、Stage 4以降への持ち越しとしていた。今回のフィードバックを優先し、D-001に存在するNPCとCargoをStage 3追加対応へ含める。

## 素材と生成仕様

### プレイヤー

40×40のframe cell、足元anchor `(20, 38)`、見える人物本体約18×30px、右向き素材のCanvas反転を維持する。既存の5 atlas名と寸法は原則維持する。

| clip | frame数 | 必要な姿勢差 |
| --- | ---: | --- |
| `idle` | 2 | 呼吸と重心を1px以内で変化させ、足元は固定する。 |
| `walk` | 4 | 接地、沈み込み、すれ違い、反対足接地を固有姿勢にする。 |
| `mine-ready` | 2 | 構えと工具の予備動作を分ける。 |
| `mine-swing` | 8 | 振り上げ、加速、frame 3のhit、反動、復帰を分ける。 |
| `collect` | 4 | しゃがみ、把持、持ち上げ、収納を分ける。 |
| `carry-walk` | 4 | 歩行4姿勢と荷重を受けた上体を表す。 |
| `carry-idle` | 2 | 荷物保持中の重心を変化させる。 |
| `load` | 4 | 荷物を下ろし、手を戻すまでを分ける。 |

全30フレームを固有画像として生成し、body、helmet、tool、pack、bootsをピクセル単位の所有maskで分離する。矩形をそのままalphaへ使わない。各装備のalphaは基準compositeの人物シルエット内に限定し、`pack後面 → body → boots → tool → helmet → 手前Cargo`の合成順を固定する。

### NPC

| ファイル | cell / atlas | clip |
| --- | --- | --- |
| `npc-porter-atlas.png` | 40×40 / 320×320 | idle、walk、collect、carry-walk、carry-idle、load |
| `npc-crew-miner-atlas.png` | 40×40 / 1280×320 | idle、walk、mine-ready、mine-swing。COMMON、RARE、EPIC、ANCIENTの4 bank |
| `npc-crew-porter-atlas.png` | 40×40 / 320×320 | idle、walk、collect、carry-walk、carry-idle、load |
| `npc-engineer-atlas.png` | 40×40 / 160×160 | idle、walk、work、complete |

足元anchorは原則`(20, 38)`とする。青緑はPorterと自動化の識別部位に限定する。プレイヤーの基準人物を比率、接地点、装備位置の参照に使い、同じD-001共通パレットへ量子化する。

### Cargo

`cargo-items-atlas.png`を追加する。cellは12×10、anchorは`(6, 10)`とする。

visual classは`rock`、`metal`、`copper`、`gold`、`gem`、`fossil`、`relic`、`research`、`anomaly`、`core`、`equipment-crate`、`industrial-crate`の12種とする。`LootKind`、`LootCategory`、`equipmentSeed`から純粋に導出し、次の配置で共通利用する。

- 採掘後の地面Loot。
- プレイヤー、Porter、Crewの所持Cargo。
- Central Elevatorの後面と前面の間。
- Floor Cargo platform。
- D-001で表示されるCargo容量表現。

Rail Cart、Cargo Hub、Freight Cage、BoreなどD-001外の設備本体は画像化しない。Cargo atlasは後続Stageでも再利用できる構成にする。

## semantic render state

表示専用frameをGameStateや保存形式へ追加しない。既存の`semanticRenderState`を次まで拡張する。

- `PorterState`からclip、frame、facing、anchor、carriedを導出する。
- `CrewRole`、`CrewMemberState`、`SwingState`からrole、clip、frame、facing、anchor、carriedを導出する。
- `EngineerState`とjob進捗からclip、frame、anchorを導出する。
- `LootKind`とcategoryからCargo visual classを導出する。

採掘hitはプレイヤーとCrew Minerの双方で既存`Swing.hitAt`とframe 3を一致させる。回収・積載は既存timerへ同期し、待機と歩行だけRenderer時刻で循環する。

## Rendererとfallback

- manifestへNPC4素材とCargo素材を追加する。
- loaderの`loading / ready / error`、URL単位cache、一度だけのエラー記録を再利用する。
- Player、Porter、Crew Miner、Crew Porter、Engineer、Cargoを別々のfallback単位にする。
- NPC画像が利用できない場合は該当NPCだけ既存図形で描く。
- Cargo画像が利用できない場合は既存の色付き矩形で描く。
- Elevator Cargoは後面画像の後、前面・扉画像の前に描く。
- 画像版本体と図形版本体を通常時に二重描画しない。
- InteractionTarget、論理hit領域、hover、selection、案内overlayの順序を変えない。

## 後処理と検査

既存の固定マスタープロンプト、4基準画像、D-001共通パレットを維持する。人物とNPCの追加基準画像は既存人物をcontinuity referenceとして生成し、途中で画風を変えない。

後処理へ次の検査を追加する。

- alpha値が0または255だけである。
- 各cell外周に意図しない不透明pixelがない。
- 装備レイヤーのalphaが基準人物シルエット外へ出ていない。
- 全レイヤー合成が基準compositeと一致する。
- clip内の隣接フレームが同一画像ではない。
- walkとcarry-walkで脚と腕に必要なpixel差分がある。
- 足元anchor、頭身、装備接続位置が許容範囲内である。
- mine-swing frame 3の工具先端がhit姿勢にある。

透過は暗色背景だけで判断せず、白、黒、市松模様、D-001実背景への合成画像で確認する。

## 変更対象

- `art/d001/generation-spec.json`: 追加素材、全frame、mask、Cargo対応表。
- `art/d001/sources/`: プレイヤー固有frame、NPC、Cargoの基準・生成元。
- `scripts/process-d001-assets.mjs`: pixel mask、追加atlas、差分・alpha・anchor検査。
- `public/assets/d001/runtime/`: 修正版プレイヤー、NPC、Cargo素材。
- `src/render/assets/d001Manifest.ts`: asset keyとfallback group。
- `src/render/semanticRenderState.ts`: NPCとCargoの意味状態。
- `src/render/d001ImageRenderer.ts`: NPC、Cargo、合成順。
- `src/render/entities.ts`: Player、Porter、地面Loot、Elevator Cargoの切替。
- `src/render/phase5Renderer.ts`: CrewとFloor Cargoの切替。
- `src/render/gameRenderer.ts`: EngineerとD-001 Cargo表示の切替。
- `tests/semanticRenderState.test.ts`: NPC、Cargo、hit frame。
- `tests/assets.test.ts`: manifest、atlas、alpha、frame差分。
- `tests/e2e/game.spec.ts`: NPC・Cargo表示と部分fallback。
- `docs/assets/stage3/`: 透過、連続frame、進行後D-001の比較画像。
- `docs/visual-usability-improvement-plan.md`: 完了後の実績と持ち越し更新。

## 実装順序

1. 現行の問題が見える透過背景、歩行連続frame、進行後D-001を比較基準として固定する。
2. 生成仕様へ全30プレイヤーフレーム、NPC、Cargo、pixel mask条件を追加する。
3. プレイヤーを再生成し、透過・固有frame・接地点検査を通す。
4. NPCとCargoを生成し、共通パレットで後処理する。
5. semantic render stateとmanifestを拡張する。
6. Player、Porter、Crew、Engineer、Cargoを対象単位fallback付きで接続する。
7. Stage 1・2、Elevator、Floor Cargo、進行後設備との合成を調整する。
8. 自動テスト、比較画像、実プレイ経路、目視確認を実施する。
9. 結果を既存の正本へ反映する。

## 実装結果（2026-09-20）

- 固定マスタープロンプトと既存4基準画像を継続利用し、Player 30姿勢、Porter、Crew Miner、Crew Porter、Engineer、Cargoの生成元を`art/d001/sources/`へ追加した。生成元のhash、全21 runtime素材、NPC clip、Cargo 12 classと全`LootKind`対応は`art/d001/generation-spec.json`へ固定した。
- Playerは30 frameを別姿勢から構築した。alphaを二値化した人物silhouetteからconnected componentを選別し、その内側をpixel単位でbody、helmet、tool、pack、bootsへ一意所有させた。合成順を`pack → body → boots → tool → helmet → Cargo`へ修正し、矩形mask由来の不透明背景を除去した。
- NPCは40×40 cell、原則anchor `(20, 38)`で接続した。Crew MinerはPlayerと同じ比率・30姿勢を基礎に、装備rarity用4 bankを持つ。NPCのAI、座標、速度、状態遷移は変えず、`semanticRenderState`が既存state、timer、Swing、job進捗からclipとframeを導出する。
- Cargoは12×10 cellの12 class atlasとし、全`LootKind`を網羅する対応表と`equipmentSeed`優先規則を追加した。地面、Player・Porter・Crew所持中、Elevator内部、Floor Cargo、D-001の容量表示で共用する。Elevator内部は後面の後、前面・扉の前へ描画する。
- Player、Porter、Crew Miner、Crew Porter、Engineer、Cargoを独立fallback groupにした。各groupが`loading`または`error`の間だけ該当する既存図形を描き、他groupと操作経路は維持する。
- 後処理はD-001共通パレット、nearest-neighbor、alpha 0/255、metadata除去を固定し、連続2回の実行で全runtime PNGのhash一致を確認した。寸法、alpha、パレット、cell外周、30 frameの重複、clip内の最小差分、所有レイヤー再合成一致を自動検査する。
- 比較資料は`docs/assets/stage3/follow-up/`へ保存した。白・黒・市松背景、walk、mine-swing、Cargo、Porter配送状態、Crew・Engineer作業状態、grayscaleで透過、姿勢差、接地点、装備接続、実背景との合成を確認した。
- `npm run assets:d001`、typecheck、production build、Vitest 79件、Playwright 7件に成功した。初回手動配送、Porter、Crew採掘・配送、Engineerの既存遷移はsimulation testと代表画面で確認し、NPC・Cargo素材を個別に失敗させたE2Eでもclick、`MINE`、対象とCargoが消えないことを確認した。
- Simulation、イベント、乱数、経済、保存形式、Stage 1の対象・hit領域・重なり、Stage 2の案内と入力経路は変更していない。Rail Cart、Cargo Hub、Freight Cage、Bore本体とD-002以降はStage 4以降へ残す。

## 完了条件

- プレイヤーの周囲と装備レイヤーに不透明な矩形、黒縁、背景色の混入がない。
- `walk`と`carry-walk`の4フレームが明確に異なり、図形版以上に歩行を判別できる。
- hit frame、足元、体格、装備位置が全frameで安定している。
- D-001のPlayer、Porter、Crew、Engineer、Cargoが同じ画像表現へ統合されている。
- 地面、所持中、Elevator内、Floor Cargoの積み荷が内容別に識別できる。
- 素材単位の失敗時は該当対象だけ図形fallbackする。
- 初回手動配送、Porter配送、Crew採掘・配送、Engineer作業を実経路で完了できる。
- Stage 1・2の対象ID、hit領域、hover、selection、案内、入力経路が維持されている。
- Simulation、イベント、乱数、経済、保存形式を変更していない。
