# グラフィック・操作性改善 Stage 3 第2次追加対応計画

## 状態

2026-09-20実装・検証完了。基準コミットは`a2094e4`。

2026-09-20のStage 3追加対応確認で得た次のフィードバックを対象とする。

- プレイヤーの歩行が足を滑らせているように見える。
- プレイヤーの待機が、同じ人物の動きではなく異なる絵の切り替えに見える。
- Elevatorが補強された縦坑ではなく地中を直接移動して見える。
- Cargoの種類と存在が画面上で分かりにくい。
- 坑道の木製補強が失われ、対象が地中の上へ置かれているように見える。
- Player、NPC、Cargo、操作対象が背景へ埋もれている。

480×270の論理解像度、GameStateからRendererへの一方向、Simulation・イベント・乱数・経済・保存形式、Stage 1・2の操作契約、既存の座標・anchor・hit領域を維持する。

## 現行実装に基づく原因

### 歩行

`semanticRenderState`はwalkとcarry-walkを100ms固定で進める。一方、Playerは42px/sまたは66px/sで連続移動するため、足の接地と世界座標の移動量が同期しない。現在の4姿勢も、接地中の足をcell内で後方へ送る構成になっておらず、足が地面を滑って見える。

### 待機

idleの2 frameは外形と頭身が異なり、後処理では2枚目全体へ1pxのoffsetも加えている。足、頭、Packまで同時に切り替わるため、呼吸や重心移動ではなく別の絵へ切り替わって見える。

### 縦坑と坑道補強

生成元には木製の縦坑、梁、縦柱、筋交い、灯りが存在する。しかし`placeTrimmed`はalphaノイズを含む生成画像全体をtrim対象とし、縦坑は約1539×920のbboxを49×196へ、左右坑道構造は約1598×895のbboxを436×38へ強制変形している。その結果、縦坑は細い線、坑道補強は横梁だけに縮退している。

坑道奥面も暗い不透明な空洞として岩盤を覆っておらず、細かい岩盤模様がPlayerやNPCの背後まで続いている。

### Cargo

`cargo-items-atlas.png`は12×10 cellだが、不透明bboxは多くが1～4pxに縮小されている。生成元の余白とalphaノイズを除去する前にcell全体を縮小しているため、原本にある石、インゴット、化石、装置、箱の外形がruntimeへ残っていない。

### 明度階層

背景、構造物、人物、Cargoを同じ30色へ一律remapしている。生成仕様で定めた「背景、構造、対象、character、cargoの順に視覚優先度を上げる」という色の役割分担が、後処理に反映されていない。

## 実装方針

### Player walk

40×40 cell、anchor `(20, 38)`、4 frameを維持し、次の歩行周期へ作り直す。

| frame | 姿勢 | 接地条件 |
| ---: | --- | --- |
| 0 | 前足の踵接地 | 前足をy=37へ置く |
| 1 | 沈み込み | frame 0と同じ足を接地したまま後方へ送る |
| 2 | 両足のすれ違い | 支持脚を体の真下へ置く |
| 3 | 反対足の接地 | 反対足をy=37へ置く |

接地している足はPlayer本体の前進量に合わせてcell内で後方へ移し、世界座標上の足位置をほぼ固定する。上下動は0～1pxに留め、頭身、顔、Helmet、Packの形状を歩行中も維持する。

walkとcarry-walkのframeはRenderer時刻ではなく、既存の`worldX`と`facing`から純粋導出する。

```text
phase = positiveModulo(floor(facing * worldX / strideStep), 4)
```

`strideStep`は3～4論理pxを候補に実寸画面で決定する。移動速度が変化しても、距離に比例して足が進む。表示frameはGameStateや保存形式へ追加しない。

### Player idle

独立生成した2枚の切り替えをやめ、frame 0を基準にframe 1を局所変形する。

- 足、Boots、接地点、顔、Helmet外形、装備接続位置を固定する。
- 胸、肩、腕、Pack上端だけを0～1px変える。
- silhouetteの大半と不変部のpixelを共有する。
- frame 0を長く、frame 1を短く表示し、等間隔の点滅にしない。
- idle状態の間だけ再生する。

生成AIへ待機2枚を別々に描かせず、単一の基準姿勢と再現可能なpixel処理から2枚目を作る。

### 縦坑

既存の`generated-background-shaft-back.png`を再利用し、中央の縦坑だけを固定cropする。汎用的な`trim → 強制変形`は使わない。

`background-shaft-back.png`の`x=216..264`、`y=38..233`へ次を配置する。

- 岩盤を隠す暗い不透明な縦坑内部。
- 左右の木製支柱。
- 金属継手、横桟、レール、控えめな坑内灯。

描画順は`岩盤 → 縦坑後面・補強 → rope・深度灯 → Elevator後面 → Cargo → Elevator前面・扉`とする。Elevatorの座標、速度、状態遷移は変更しない。

### 左右坑道

既存の`generated-background-tunnel-structure.png`と`generated-background-tunnel-back.png`を左右別々に固定cropする。

- 左坑道は`x=22..215`、右坑道は`x=265..457`へ配置する。
- 高さは原則`y=180..227`へ収める。
- 暗い不透明な坑道奥面で岩盤模様を遮蔽する。
- 上梁、縦柱、筋交い、金属継手、レールを個別に認識できる縮尺で残す。
- 左右を含む巨大bboxを一括で436×38へ変形しない。

### Cargo

12×10 cell、anchor `(6, 10)`、12 visual classは維持する。cell拡大ではなく、現在失われている占有率を先に修正する。

- classごとの固定cropを生成仕様へ記録する。
- alphaノイズを除去して対象componentを選んだ後にtrimする。
- 不透明bboxを最低7×6px、目標8～10×7～8pxにする。
- 接地点をy=9へ揃える。
- 暗い1px外周と、種類を示す明部を残す。

形状は次の役割を維持する。

- `rock`: 不規則な石積み。
- `metal`: 横長のインゴット。
- `copper`、`gold`: 色だけでなく塊の輪郭を変える。
- `gem`: 尖った結晶。
- `fossil`: 渦巻き。
- `relic`: 円形機構。
- `research`: 縦長カートリッジ。
- `anomaly`: 黒い割れ目。
- `core`: 中央に明部を持つ核。
- `equipment-crate`: 留め具付き箱。
- `industrial-crate`: 横長の補強箱。

同じatlasを地面、所持中、Elevator内、Floor Cargoで共用し、論理位置とCargo容量は変えない。

### 背景と対象の分離

D-001共通パレットは維持し、同じパレット内で用途別の使用色を制限する。

- 岩盤は低明度色へ限定し、細部のコントラストを下げる。
- 坑道内部は岩盤より暗い低ディテール面にする。
- 木・金属構造は中明度とする。
- Player、NPC、鉱脈は中高明度と暗い輪郭を使う。
- Cargoと状態灯だけに局所的な最高明度を使う。

人物ごとの発光haloは追加しない。背景の情報量を下げ、暗い坑道面、1px keyline、全frame共通の小さい接地影で対象を分離する。接地影は人物atlasへ焼き込まず、人物より先に整数座標で描画する。

## 変更責務

- `art/d001/generation-spec.json`
  - walkの接地足とstride、idle不変領域、背景crop、用途別palette、Cargo bbox条件を追加する。
- `scripts/process-d001-assets.mjs`
  - 背景の汎用`placeTrimmed`を対象別cropへ置換する。
  - 暗い坑道面、左右補強、縦坑を別処理にする。
  - idle局所差分、Cargo component抽出、用途別palette remapを実装する。
- `src/render/semanticRenderState.ts`
  - Playerのwalkとcarry-walkを座標位相へ変更する。
  - idleを非対称周期へ変更する。
- `src/render/d001ImageRenderer.ts`
  - 背景の意味順を明示し、接地影を人物とCargoより先に描く。
- `public/assets/d001/runtime/`
  - Player 5 atlas、Cargo atlas、背景の坑道・縦坑・構造層を更新する。
- `tests/semanticRenderState.test.ts`
  - 座標位相とidle周期の代表条件を確認する。
- `tests/assets.test.ts`
  - anchor、背景構造、Cargo占有率の重要な不変条件を確認する。
- `docs/assets/stage3/`
  - walk、idle、Elevator中間位置、Cargo、通常色・grayscaleの比較を更新する。
- 既存のStage 3正本と追加対応計画へ、実装後の結果を反映する。

manifest、GameState、Simulation、入力、保存形式、対象ID、座標、論理hit領域は変更しない。

## 検証方針

### 自動検査

今回の不具合を直接検出する次の条件に限定する。

- walkの各frameが指定した接地条件を持つ。
- 同じ歩行位置ではRenderer時刻だけを変えてもframeが変わらない。
- stride分の移動で4 frameが一巡する。
- 左右移動で同じ歩行順序になる。
- idleの足、Boots、接地点が2 frameで一致する。
- idleのbbox差が1px以内で、silhouetteの大半を共有する。
- 左右坑道の所定位置に縦柱と上梁が存在する。
- 縦坑に暗部、左右支柱、横桟が存在する。
- Cargo全cellの不透明bboxが7×6px以上で、空cellや同一silhouetteがない。
- runtime PNGの寸法、共通パレット、alpha 0/255を維持する。

### 過度な性能目標・テストを設けない

本対応は視覚上の問題を直す追加対応であり、性能改善やテスト基盤の拡張を目的にしない。

- FPS、描画時間、メモリ量、bundle sizeへ新しい数値目標を設けない。
- ベンチマーク、長時間負荷試験、全pixelのgolden snapshot、全GameState組み合わせの画像比較を追加しない。
- 既存の480×270 Canvasと少数の追加描画で明白な性能問題が発生していない限り、profilingや最適化を完了条件にしない。
- unit testは純粋導出と、今回壊れた素材条件の代表例に限定する。
- E2Eは既存の初回配送・操作経路と、代表的なD-001状態を確認する範囲に限定する。
- 同じ条件で成功した検証は、新しい変更や失敗がない限り繰り返さない。

### 目視確認

基準コミット`5a7ebfa`と同条件で次を比較する。

- Playerが同じ距離を左右へ歩く連続frame。
- 接地足の世界座標を確認できるwalk strip。
- idleの実寸、拡大、difference画像。
- 新規開始画面。
- Elevatorが縦坑中間を通過する画面。
- Porter、Crew、Engineerを含む進行後D-001。
- Cargo 12種の実寸一覧。
- 地面、所持中、Elevator内、Floor Cargo。
- 通常色とgrayscale。

## 実装順序

1. `5a7ebfa`のwalk、idle、Elevator中間位置、Cargo実寸を変更前証拠として固定する。
2. 背景とCargoのcrop、alpha、縮小処理を修正する。
3. 暗い坑道面、木製補強、縦坑を実背景へ統合する。
4. Player idleを単一基準姿勢から再構築する。
5. walk 4姿勢と座標同期を実装する。
6. 用途別paletteと接地影で背景と対象を分離する。
7. 限定した自動検査、typecheck、build、既存unit・E2E、比較画像を確認する。
8. 今回の範囲で見つかった問題を修正し、既存正本へ結果を反映する。

## 完了条件

- Playerの歩行で接地足が世界座標上を滑って見えない。
- idleが同じ人物の呼吸・重心変化として見え、別の絵の点滅に見えない。
- Elevatorが木と金属で補強された縦坑内を移動して見える。
- 左右坑道に上梁、縦柱、筋交い、レールが存在し、人物が地中へ直接乗って見えない。
- Cargo 12種が実寸と実背景上で識別できる。
- 通常色とgrayscaleの双方でPlayer、NPC、Cargo、操作対象が背景から判別できる。
- Stage 1・2の対象、hit領域、案内、入力経路を維持する。
- Simulation、イベント、乱数、経済、保存形式を変更しない。
- 今回の視覚修正に直接必要な検証が成功し、過度な性能目標や網羅テストを完了条件にしていない。

## 実装結果（2026-09-20）

- Playerの`walk`と`carry-walk`は、Renderer時刻ではなく未丸めの`worldX`、`facing`、4pxのstrideからframeを純粋導出するよう変更した。右へ4px、左へ4pxで同じ順序に進み、Boots、`LONG_STRIDE`、`HEAVY_WORLD`などの速度差でも距離と足運びの関係を維持する。4姿勢はframe 0→1、2→3で支持Bootをcell内の後方へ4px送り、世界座標上の接地点を固定した。
- `idle`と`carry-idle`は各frame 0を基準に再構築した。全体offsetを廃止し、Helmet・顔、Boots・接地点、Pack接続部を共有したまま胸・肩・腕だけを1px局所変形する。表示周期はframe 0を1200ms、frame 1を400msとした。
- 縦坑、左右坑道奥面、左右坑道構造は生成元の固定component cropへ切り替えた。runtime上で縦坑を`49x196+216+38`、坑道奥面を左右合計`436x45+22+183`、木製補強を`436x48+22+180`へ配置し、暗い不透明面、支柱、横桟、梁、筋交い、灯りを復元した。
- Elevatorは後面と前面・扉の描画を分離し、`縦坑 → rope・深度灯 → Elevator後面 → 人物・Cargo → Elevator前面・扉`の順にした。座標、anchor、速度、状態遷移、操作対象は変更していない。
- Cargoは生成元12 classの固定cropと最大connected component選択へ変更した。全cellが7x6以上、底辺y=9、固有silhouetteとなり、実測bboxは7～10x7～8になった。地面、所持中、Elevator内、Floor Cargoで同じatlasと既存anchorを使い、重なる配置は奥から手前へ描く。
- D-001共通32色は変更せず、坑道内部、岩盤、構造、操作対象、character、Cargoの用途別subsetでremapした。Player、NPC、Cargoへ1px keylineを追加し、地面に接する人物とCargoだけへ暗い接地影を先行描画した。青緑はPorterと自動化に限定した。
- 既存の全生成元を再利用し、画像生成は行っていない。固定仕様と後処理から全21 runtime PNGを再出力し、連続2回の後処理でhash一致を確認した。
- `tests/semanticRenderState.test.ts`へ距離位相、左右、時刻非依存、Boots、carry-walk、非対称idle周期を追加した。`tests/assets.test.ts`へ接地足、idle固定領域、縦坑・坑道構造、Cargo bbox・接地・silhouette、既存alpha・palette・寸法検査を追加した。
- `npm run assets:d001`、typecheck、production build、Vitest 84件に成功した。Playwrightは初回手動配送、Player・鉱脈の部分fallback、NPC・Cargo各groupの独立fallbackの代表3件に成功した。
- 比較画像は`docs/assets/stage3/second-follow-up/`へ保存した。`a2094e4`の新規画面、進行画面、walk、idle、Cargoを変更前証拠とし、変更後のwalk、carry-walk、idle、Cargo、新規開始、Elevator中間位置を通常色とgrayscaleで確認した。
- Simulation、イベント、乱数、経済、保存形式、Stage 1の対象ID・hit領域・重なり、Stage 2の案内・ContextPanel・click/tap・Space・`MINE`・`SEND`は変更していない。

## 接地位置の再修正（2026-09-20追記）

実装後の実画面確認で、採掘ポイントとキャラクターが坑道床から浮いて見える位置ずれを確認した。背景は正しく、背景床を動かすのではなく対象側の描画位置を下げる。

- 木製坑道構造の床上端はruntime上の`y=223`である。Player、Porter、Crew、EngineerのGameState座標は変更せず、D-001用semantic render anchorだけを従来の`y=210`から`y=223`へ13px下げる。影と所持Cargoも同じrender anchorへ追従させる。
- 採掘nodeはGameState上の`y=210`、target ID、hit領域を維持する。3 atlasの各frameをcomponent抽出・縮小後に再trimして48x40 cellの下端`y=39`へ揃え、D-001描画時だけcell下端を背景床上端`y=223`へ合わせる。
- `background-floor.png`を含む背景runtime素材、背景crop、背景描画位置は変更しない。先行して検討した床の固定crop化は採用しない。
- 修正対象はcharacter semantic anchor、node描画offset、node後処理、3 node runtime atlas、直接条件を検査するunit test、比較画像に限定する。Simulation、保存形式、移動量、採掘距離、target ID、入力経路は変更しない。

追加完了条件は、全node frameの不透明下端がcell内`y=39`となること、Playerと3 nodeの最下部が実背景上で`y=222`、坑道床の直上へ接地して見えること、背景runtime素材が再修正前から変わらないことである。

### 再修正結果

- D-001 characterのsemantic render anchorへ`D001_VISUAL_GROUND_OFFSET = 13`を適用し、Player、Porter、Crew、Engineer、接地影、所持Cargoを背景床上端`y=223`へ揃えた。画像fallbackも同じoffsetで描画する。
- 3 node atlasは従来の輪郭と大きさを維持したまま、量子化後の各48x40 cellを再trimして不透明下端を`y=39`へ統一した。Rendererで13px下げ、全frameの最下部を`y=222`へ揃えた。
- nodeのtarget IDとhit circleは従来座標のまま維持し、選択ブラケット、label、guide用の表示位置だけを13px下げて対象画像へ追従させた。
- `background-floor.png`は従来処理へ戻し、実占有範囲`480x16+0+254`を維持した。その他の背景生成・配置にも変更を加えていない。
- asset・semantic限定テスト18件、全unit 86件、typecheck、production build、初回手動配送・React UIからの移動／採掘・個別画像fallbackの代表E2E 3件に成功した。
- `docs/assets/stage3/second-follow-up/grounding-correction-comparison.png`とgrayscale版で、修正前後の新規ゲームを比較した。通常色・grayscaleともPlayer、3 node、選択ブラケットが木製床の直上へ接地し、背景位置が変わっていないことを確認した。

## 地上オブジェクトの接地統一（2026-09-20追記）

人物と採掘nodeの再修正後も、Cargo、Elevator、Workshop、Floor Cargo台は旧接地位置に残っていた。背景やGameState座標を動かさず、runtime素材の実占有bboxを基準にD-001の視覚位置を次のように統一する。

- 地上Cargoは保存済み`item.y`を変更せず、D-001描画時のanchorだけを`y=223`へ置く。接地影、rarity表示、画像fallbackも同じanchorを使う。所持Cargoはcharacter anchor、Elevator内CargoはElevator visual center、Floor Cargoは台のoffsetへ従う。
- Workshop基本frameのcell内不透明下端は`y=26`であるため、destinationを`y=196`とし、最下部を`y=222`へ置く。差分overlayもcell内`y=26`を超えないよう後処理で揃える。fallbackは実描画下端から9px下げ、選択表示も追従させるがhit rectは維持する。
- Elevator atlasの底部はcenterから23px下まで占有する。最下位置のvisual centerを`190`から`200`へ補正し、上端center`52`は維持する。移動中は`10 * (1 - position)`で補間し、Simulation上のposition、速度、状態遷移は変えない。Cargo、前後面、扉、状態灯、選択表示は同じvisual centerを使い、hit rectは従来の論理位置を維持する。
- Floor Cargo台は脚の下端`y=214`を`y=222`へ合わせるためD-001だけ8px下げ、台上のCargo、影、数量表示も一体で移動する。

追加完了条件は、地上Cargo・Workshop・Floor Cargo台の最下部が`y=222`、Elevator最下位置の底部が`y=223`となること、Elevator上端位置が変わらないこと、選択表示とfallbackが通常画像へ追従すること、背景runtime素材とGameState・保存形式が変わらないことである。

### 地上オブジェクト再修正結果

- 地上CargoはD-001 visual anchor `y=223`へ統一した。保存された`item.y`、収集経路、Porter経路は変更せず、画像、影、rarity表示、fallbackだけを同じ接地点へ揃えた。
- Workshopは基本frameと6 overlayの不透明下端をcell内`y=26`へ統一し、destination `y=196`で最下部を`y=222`へ置いた。画像fallbackと選択表示も追従し、既存hit rectは維持した。
- Elevatorは上端center `y=52`を維持し、下端centerを`y=200`へ補正した。中間位置は両端から線形導出し、前後面、扉、状態灯、内部Cargo、fallback、選択表示が同じvisual centerを使う。既存hit rectとSimulation上の`position`は変更していない。
- Floor Cargo台とそのCargo、影、数量表示をD-001だけ8px下げ、台脚の最下部を`y=222`へ揃えた。
- 限定asset・semantic検査19件、全unit 88件、typecheck、production build、初回手動配送・移動／採掘・対象別fallbackを含む代表E2E 4件に成功した。
- `docs/assets/stage3/second-follow-up/object-grounding-comparison.png`で新規画面のWorkshopとElevator底部、`after/object-grounding-progressed.png`で地上Cargo、Elevator中間位置・内部Cargo、Floor Cargoを確認した。各画像のgrayscale版でも対象を判別できる。
