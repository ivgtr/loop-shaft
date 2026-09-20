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

## 縄・Elevator・縦坑接続・つるはし追加対応（2026-09-20計画、未実装）

基準コミットは`01c7717`。実画面確認で得た次のフィードバックを対象とする。

- 縄が単色の直線であり、他の画像素材と質感が合っていない。
- Elevatorの開閉画像が木製縦坑と画風・密度・材質の面で合っていない。
- 地上設備と縦坑上端の接続が不自然である。
- 開始時から縦坑が地下へ貫通して見え、`EXTEND D-030`による掘削結果が背景へ反映されない。
- Playerのつるはし周辺だけ色相と材質表現が不自然である。

480×270の論理解像度、GameStateからRendererへの一方向、Simulation・イベント・乱数・経済・保存形式、既存の座標・anchor・hit領域、Stage 1・2の操作契約、対象別fallbackを維持する。D-030以深の設備画像化やStage 4以降へは広げない。

### 現行原因

- 縄は`environment.ts`で`fillRect`する2px幅の単色線で、画像素材ではない。
- Elevator生成元は装飾密度の高い金属主体の意匠である。後処理も7画像を等幅分割して56x44へ一律trim・縮小しており、開閉状態の共通外枠を保証していない。
- 地上設備は生成元の実占有範囲`1512x353`全体を82x34へ縮小している。中央の巻上機、坑口、縦坑との接続部が潰れている。
- D-001背景は`run.depth.unlocked`を参照せず、D-030解放前後で同じ縦坑下端を表示する。
- Playerのtool layerは採掘行の矩形範囲から抽出され、手・腕・身体pixelも含む。基本bankへcharacter用のほぼ全色が混入し、強化bankはhandle・金属head・混入した身体pixelをまとめて着色している。

### Rope tile

`elevator-rope-tile.png`を4x8px程度の継ぎ目のないruntime tileとして追加する。暗い外周、麻色の芯、交互の1pxハイライトで撚りを表し、D-001共通palette内へremapする。

- 地上巻上機の接続点からElevator屋根まで整数座標で反復する。
- 最後のtileはsource cropして屋根位置で切り、ケージ内部へ貫通させない。
- tile位相は地上側へ固定し、Elevatorのvisual位置から表示長だけを純粋導出する。
- 時間だけで動く縄animationは追加しない。
- 読み込み失敗時は現在の単色線へ個別fallbackする。

既存の地上設備・環境生成元にある縄またはchainから固定cropして作り、Rope単体の画像生成は行わない。

### Elevator再生成

既存Elevator生成元は画風基準として再利用せず、`reference-environment.png`と`generated-background-shaft-back.png`を主基準、`reference-equipment.png`を機能構成の副基準として再生成する。

同一sheet・同一外枠で次の7 layerを用意する。

1. 通常幅の後面。
2. 狭幅の後面。
3. 通常幅の開扉前枠。
4. 狭幅の開扉前枠。
5. 通常幅の閉扉overlay。
6. 狭幅の閉扉overlay。
7. 固定制御盤。

開扉時は暗い内部と低い前縁を持ち、Cargo・人物を後面と前枠の間へ描く。閉扉は同じ外枠へ二枚扉だけを重ねる。通常幅、`EMPTY_SHAFT`の狭幅、開閉の全状態でanchorと外形上端・下端を共有する。

固定プロンプトは次の意味を維持する。

```text
Original LOOP SHAFT D-001 elevator layer sheet. Orthographic 56x44 logical-pixel cage, simple timber and oxidized-iron construction matching the reinforced mine shaft, chunky one-pixel shapes, restrained contrast, charcoal mesh, one small amber status lamp. Matching normal and narrow variants. Separate rear cage, open foreground frame, and closed two-panel door overlays with identical outer proportions and anchor. Transparent background. No text, ornate Victorian decoration, polished brass, gradients, glow, perspective, characters, cargo, or baked rope.
```

生成後は共通外枠を後処理で固定し、開閉時にケージ全体が別画像へ切り替わって見えない条件を設ける。

### 地上と縦坑上端の接続

`generated-background-surface-station.png`全体の縮小をやめ、中央の巻上機、坑口、受け梁だけを固定cropした`shaft-surface-junction.png`を作る。

- 配置範囲は原則`x=199..280, y=0..37`とする。
- 開口を縦坑と同じ`x=216..264`へ一致させる。
- 左右支柱、地表を横切る梁、巻上輪、縄の開始点、縦坑内部の暗部を残す。
- 既存生成元の再cropを優先し、実背景上で不足する場合だけ接続部を再生成する。

### EXTEND前後の縦坑下端

49x47pxを2frame持つ`shaft-bottom-junction-atlas.png`を追加する。

- `sealed`: D-030未解放時。岩盤、太い横梁、木製蓋でElevator床下を閉じ、レールと暗部をそこで終端する。
- `open`: D-030解放後。暗い縦穴、左右支柱、レールを画面下へ連続させ、D-001床との切断面に坑口枠と崩した岩盤を置く。

表示状態は`run.depth.unlocked.includes('D-030')`から純粋導出する。`EXTEND D-030`成功時の既存`DEPTH_UNLOCKED`と同じstate更新を利用し、新しい保存fieldやイベントは追加しない。背景床より後、縄・Elevator・人物より前に描画する。

### つるはしの材質と色

既存Player姿勢を維持し、再生成ではなくlayer所有とpalette remapを修正する。

- mine-ready 2frame、mine-swing 8frameごとの固定tool maskを生成仕様へ記録する。
- 手・前腕・身体pixelをbody layerへ戻し、tool layerを木製handleと金属headだけに限定する。
- handleは低彩度の構造用brown、headはneutralな暗色・中間色・明色metalへremapする。
- Helmet・lamp用amberを金属headへ使用しない。
- Tool Level 2は金属headだけを明るくし、handle、手、腕はLevel 1と共有する。

### 描画順

```text
岩盤
→ 坑道・縦坑後面
→ 地上接続
→ 坑底sealed/open junction
→ 木製構造・床
→ Rope tile
→ Elevator後面
→ Elevator内Cargo・人物
→ Elevator前枠・閉扉
→ 選択表示・案内
```

### 変更責務

- `art/d001/generation-spec.json`: Rope、Elevator 7 layer、上下接続、EXTEND状態、tool mask・palette条件。
- `art/d001/sources/`: 再生成したElevator sheet。その他は既存生成元の再cropを優先する。
- `scripts/process-d001-assets.mjs`: 固定cell抽出、Rope tile、上下junction、つるはしmaterial分離。
- `src/render/assets/d001Manifest.ts`: Rope、地上接続、坑底atlasを独立fallback単位で追加する。
- `src/render/environment.ts`、`src/render/d001ImageRenderer.ts`: Rope反復、上下接続、Elevator新layerの描画。
- `src/render/semanticRenderState.ts`: door、normal/narrow、sealed/openの純粋導出。
- `public/assets/d001/runtime/`: 新規3素材と再生成Elevator、更新したPlayer tool atlas。
- `tests/assets.test.ts`、`tests/semanticRenderState.test.ts`、既存代表E2E、`docs/assets/stage3/second-follow-up/`: 限定検査と比較証拠。

### 検証規模の制約

本追加対応は視覚的不具合の修正であり、性能改善やテスト基盤の拡張を目的にしない。

- FPS、描画時間、メモリ量、bundle sizeへ新しい数値目標を設けない。
- profiling、benchmark、長時間負荷試験を完了条件にしない。
- 全pixelのgolden snapshotや全GameState組み合わせの画像比較を追加しない。
- Ropeの反復は短いtileの整数描画に限定し、明白な問題がない限り描画最適化を追加しない。
- unit testは状態の純粋導出、tile seam、layer外形、alpha・palette、tool所有pixelの代表条件に限定する。
- E2Eは既存のEXTEND、SEND、採掘、保存復元と、代表的なD-001状態に限定する。
- 既に同じ条件で成功した全件検証は、新しい変更や失敗がない限り繰り返さない。

### 自動検査

- Rope tileの上下端が反復可能で、表示終端がElevator屋根を越えない。
- Elevatorの開閉で外枠、anchor、占有幅が変化しない。
- 通常幅・狭幅の双方で人物とCargoが内部に収まる。
- D-030未解放は`sealed`、`EXTEND`直後は`open`となる。
- 地上接続の開口、Rope、縦坑中心が同じx座標にある。
- tool layerへ手・腕・Helmet色が混入しない。
- Tool Level 1・2でhandleと手が共有され、金属headだけが変化する。
- alpha 0/255、整数座標、共通palette、対象別fallbackを維持する。

### 目視確認

- 初期D-001の閉じた坑底と`EXTEND D-030`直後の開いた坑底。
- Elevator上端・中間・下端の開扉／閉扉、通常幅／狭幅、空荷／Cargo搭載／人物搭乗。
- Ropeの短・中・長状態と地上巻上機・Elevator屋根への接続。
- mine-readyとmine-swing全8frame、Tool Level 1・2。
- 通常色とgrayscale。

### 実装順序と完了条件

1. `01c7717`の地上接続、坑底、Elevator開閉、Rope長、つるはしframeを変更前証拠として固定する。
2. 地上接続と坑底2状態を既存生成元の固定cropから作る。
3. Rope tileと反復描画を追加する。
4. 固定プロンプトと基準画像でElevatorを再生成し、7 layerへ後処理する。
5. つるはしのtool maskと用途別remapを修正する。
6. 限定したunit、typecheck、build、代表E2E、通常色・grayscale目視を行う。
7. 実装結果を本正本へ追記する。

完了条件は、Ropeが継ぎ目のない素材として縦坑とElevatorへ接続すること、Elevatorの開閉両状態が木製縦坑の画風へ一致すること、地上接続が一体に見えること、EXTEND前後で坑底が閉鎖状態から地下へ連続する開口へ変化すること、つるはしの手・handle・金属headが材質ごとに正しい色となること、既存の操作・Simulation・保存形式を維持することである。

## 実装結果（2026-09-20）

- `01c7717`時点の変更前証拠は既存の`docs/assets/stage3/second-follow-up/before/new-game.png`を再確認した。`git show 01c7717:docs/assets/stage3/second-follow-up/before/new-game.png`と現ファイルのSHA-256は`3ccc40058d56fd336d6f1ca4c4546ccc22d53a0d641580be5c642bad36d2e737`で一致する。
- Ropeは`generated-background-surface-station.png`の固定cropから4x8 tileを作り、上端位相を固定して`y=36`から`round(semantic.elevator.y)-16`まで整数反復する。端数tileは屋根位置で切り、asset failure時は従来の単色線へ戻る。
- 地上接続は同じ生成元の中央cropから`shaft-surface-junction.png`を作り、縦坑開口`x=216..264`と中心`x=240`へ固定した。坑底は同じ縦坑生成元のopen cropと地上設備のseal cropを合成した49x47のsealed/open atlasとし、`run.depth.unlocked.includes('D-030')`だけから状態を導出する。`background-floor.png`の該当範囲は透明化してjunctionを後面へ置いた。
- Elevatorは固定プロンプトと`reference-environment.png`、`generated-background-shaft-back.png`、`reference-equipment.png`を基準に再生成した`generated-central-elevator.png`（SHA-256 `c1e8237890ef47d37fda46fe99fbfb3f7bc806ad091b26879b34643ab26578ca`）を7固定cropへ後処理した。normal/narrowの外枠、床、anchorを共有し、rear→Cargo・人物→front/closed overlayの順で描画する。Crew・Engineerの後にfrontを重ね、travel中だけtravel overlayの前に閉扉を描く。
- つるはしはsource再生成を行わず、mine-ready 2frame・mine-swing 8frameのcell-local maskを生成仕様へ記録した。handleとheadを分離して用途別paletteへremapし、forbidden amber/skin colorsをtool layerから除外した。Level 2はhead paletteだけを変更し、handle・手・前腕はLevel 1と共有する。player compositeの再構成検査は透明RGBを正規化した上で行う。
- ManifestへRope、surface junction、shaft-bottom atlasを独立fallback単位として追加した。既存のPlayer、NPC、Cargo、操作対象、GameState、Simulation、保存形式、hit領域は変更していない。

### 変更ファイルと素材

- 生成仕様・後処理: `art/d001/generation-spec.json`, `scripts/process-d001-assets.mjs`
- 再生成source: `art/d001/sources/generated-central-elevator.png`
- runtime素材: `public/assets/d001/runtime/elevator-rope-tile.png`, `shaft-surface-junction.png`, `shaft-bottom-junction-atlas.png`、Elevator、Player tool、Player composite依存のCrew Miner atlas、background floor
- 描画・状態: `src/render/assets/d001Manifest.ts`, `src/render/d001ImageRenderer.ts`, `src/render/environment.ts`, `src/render/entities.ts`, `src/render/canvasRenderer.ts`, `src/render/gameRenderer.ts`, `src/render/semanticRenderState.ts`
- 限定検査: `tests/assets.test.ts`, `tests/semanticRenderState.test.ts`, `tests/e2e/game.spec.ts`

### 検証結果

- `npm run assets:d001`: 成功。全runtime PNGの寸法、alpha 0/255、共通palette、Player layer再構成を後処理内で確認。
- `npm test -- --run`: 8 files / 91 tests passed。
- `npm run typecheck`: 成功。
- `npm run build`: 成功。
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:4174 npm run test:e2e -- --project=chromium`: 8 tests passed。初回MINE/SEND、移動・採掘・save reload、hover/touch、対象別fallback、`EXTEND D-030`成功後の坑底状態更新を含む。
- asset unitではRope上下半分の一致、surface/bottomの寸法・中心、Elevator 7 cellの外形、通常/強化tool bankの差分範囲、forbidden色不在を検査した。semantic unitではsealed/openをD-030 unlock結果から検査した。

### 比較画像と目視確認

- 通常色・grayscaleの初期D-001とD-030解放後中間Elevator: `docs/assets/stage3/second-follow-up/after/stage3-second-follow-up-new-game.png`, `stage3-second-follow-up-new-game-grayscale.png`, `stage3-second-follow-up-progressed.png`, `stage3-second-follow-up-progressed-grayscale.png`
- 閉扉normal/narrow、中間位置、Cargo搭載: `stage3-second-follow-up-elevator-closed-normal*.png`, `stage3-second-follow-up-elevator-closed-narrow*.png`
- 目視では地上巻上設備・縦坑・Ropeが同じ中心軸へ連続し、初期sealed底とD-030解放後open底、Elevatorの上端・中間・下端、開扉・閉扉、normal/narrow、通常色/grayscaleを確認した。Ropeに時間依存animationはなく、Cargo・人物はfront/closed overlayの後ろへ収まる。

### 残るリスクと持ち越し

- Elevator sourceの固定cropは現在の生成sheetへ記録済みで、同sourceを差し替える場合はcropとSHA-256の同時更新が必要である。
- 目視・E2Eは代表状態に限定しており、全GameState組み合わせのgolden画像比較は行っていない。D-030以深の背景設備化、性能目標、Stage 4以降の変更は今回の範囲外として持ち越さない。

## Stage 3 第3次追加対応（2026-09-20、実装済み）

`8593f25`実装後の実画面確認で得た次のフィードバックを対象とする。

- 歩行が「左足が前→真横→右足が前」の周期として読めず、真横姿勢の上下動も不足している。
- Canvas内の文字が潰れ、hoverラベル、案内、施設名、状態表示を読めない。
- 坑道、縦坑、Elevatorの木材・金属表現が平坦で、素材感が弱い。
- 採掘姿勢の足が不自然で、頭付近に用途を判別できない黒い物体が現れる。

480×270の論理解像度、GameStateからRendererへの一方向、Simulation・イベント・乱数・経済・保存形式、Player・NPC・Elevator・Cargoのworld座標とanchor、Stage 1・2の操作契約、対象別fallbackを維持する。D-001以外の全面的な素材更新やStage 4以降へは広げない。

### 現行原因

#### 歩行

`semanticRenderState.ts`はPlayerの`worldX`と`facing`から4pxごとに4frameを純粋導出しており、時間依存の足送りは発生していない。一方、`process-d001-assets.mjs`の`rebuildWalkFrame`は元frameの足元5pxだけを4px移動している。頭、胴体、左右脚の前後関係を再構成していないため、4frameが「左右の接地とすれ違い」ではなく、似た全歩幅姿勢の切り替えに見える。

#### Canvas文字

Canvasは480×270のbacking storeへ`4px`から`8px`のブラウザ依存`monospace`を`fillText`している。極小文字がアンチエイリアス付きで描画された後、CSSでCanvas全体が拡大されるため、細い字画と文字間が潰れる。`image-rendering: pixelated`はCanvas要素の拡大方法だけを変え、`fillText`内部の字画を整数pixelへ変換しない。

Canvas文字は`environment.ts`、`interactionOverlay.ts`、`initialGuideOverlay.ts`、`entities.ts`、`phase5Renderer.ts`、`gameRenderer.ts`、`canvasRenderer.ts`へ分散している。DOMのHUDとContextPanelはCSS文字であり、同じ原因ではない。

#### 構造素材

高解像度の生成元をruntimeと異なる縦横比へ`point`で強制縮小し、その後に限定paletteへremapしている。

- 坑道構造は約`740x243`を`194x48`へ縮小する。
- 通常幅Elevatorは約`330x643`を`42x43`へ縮小する。
- 狭幅Elevatorは約`206x645`を`32x43`へ縮小する。

生成元にある細い木目、面の陰影、金属端面、継手が1pxノイズまたは均一な矩形へ縮退している。特にElevatorは縦方向の圧縮率が大きく、既存sourceの再cropだけでは素材感を回復できない。

#### 足と頭部の黒い物体

Playerのtool maskは採掘frame別になったが、HelmetとBootsは全frame共通の矩形maskである。

- Helmetは各cellの`y=0..15`にある全opaque pixelを所有する。
- Bootsは各cellの`y=33..39`にある全opaque pixelを所有する。

mine-swingではつるはしが頭上と足元を横切るため、tool pixelの一部がHelmetまたはBootsへ混入し、元の暗色で再合成される。実際にmine-swingのHelmet layerはframeごとにbboxが`6x1`から`27x9`まで変動し、Boots layerは幅34pxから38pxへ広がるframeがある。足だけ、Helmetだけの所有範囲として成立していない。

### Bitmap font

`src/render/pixelText.ts`へ、整数pixelだけで描くコード定義のbitmap fontを追加する。

- 標準表示は5x7 glyph、計器と短い補助表示は3x5 glyphとする。
- 英大文字、数字、空白、主要ASCII記号、`·`、`→`を収録する。
- Canvas内の小文字は大文字へ正規化し、未定義glyphは`?`を表示する。
- `measurePixelText`とleft・center・right alignmentを共通化する。
- glyph、文字間、背景box、配置座標を整数にする。
- font画像や外部font、依存packageは追加しない。

既存の`fillText`と`measureText`はCanvas描画から除き、次を共通helperへ移す。

- hoverラベルと初回案内。
- 施設名、深度番号、`SEND`、Cargo数、Lift表示。
- Elevator移動画面、発見banner、獲得通知。
- D-001以深でCanvasへ描く設備名と状態表示。

文字列、意味、表示条件、label anchor、hoverとselectionの優先順位は変更しない。DOMのHUD、ContextPanel、buttonは現状を維持する。

### Player walk

40x40 cell、anchor `(20,38)`、4frame、`worldX`と`facing`からの純粋導出を維持し、姿勢を次に固定する。

| frame | 姿勢 | 上下位置 |
| ---: | --- | --- |
| 0 | 左足が前、右足が後ろ | 通常 |
| 1 | 両脚が真横ですれ違う | 頭と胴体を1px上げる |
| 2 | 右足が前、左足が後ろ | 通常 |
| 3 | 両脚が真横ですれ違う | 頭と胴体を1px上げる |

frame 1と3は脚と腕の前後関係を反転し、同一画像の重複にはしない。全frameで接地点`y=37`を維持し、頭頂の上下差は1pxに限定する。`walk`と`carry-walk`は同じ脚周期を共有し、carry時のCargo位置と腕の接続を維持する。

現行の`generated-player-animation.png`には接地姿勢と真横姿勢へ再構成できるpixelがあるため、Player全体は再生成しない。40x40の論理pixel上でframeを決定的に再構成する。移動速度、world座標、保存状態、Renderer時刻に依存する新しいanimationは追加しない。

### Player layer所有と採掘姿勢

`generation-spec.json`へHelmet、Boots、Toolのframe別所有範囲を記録し、全frame共通矩形maskを置き換える。

- Helmetは帽体とlampだけを所有する。
- Bootsは左右の靴だけを所有する。
- 手、前腕、脚、身体はBodyが所有する。
- つるはしのhandleとmetal headはToolが所有する。
- 各所有maskを元composite alphaと交差させ、mask内の背景や別部品を取得しない。
- Tool Level 1・2はhandleと手を共有し、headだけを変更する既存条件を維持する。

mine-ready 2frameとmine-swing 8frameでは、靴の上端と脚を連続させ、片足または両足を`y=37`へ接地させる。Boots layerへ横長の帯やtool片を残さず、crouch時も前脚と後脚を判別できるsilhouetteにする。

つるはしheadは各採掘frameでneutral metalの中間色またはhighlightを最低1px残し、handleとの接続を読めるようにする。Helmetより前へ不自然な黒い孤立componentを残さない。既存の`SWING.hitAt`、frame数、採掘判定、Tool Levelの性能は変更しない。

### D-001 structural material pass

画像フィードバックに写る次の構造物へ限定して素材表現を更新する。

- 坑道の梁、柱、筋交い、継手。
- 縦坑の木製支柱、金属継手、rail。
- Elevatorの外枠、床、扉、操作盤。
- 地上接続と坑底junctionの接続面。

岩盤、鉱脈、Cargo、Workshop、D-030以深の背景は本追加対応で作り直さない。

最初に坑道1区画`194x48`とElevator 1cell`56x44`をruntime実寸のprototypeとして作る。通常色とgrayscaleの双方で次を満たした場合だけ、同じ規則を全状態へ展開する。

- 木材は暗い外周、基調色、長手方向の木目、節または欠けを持つ。
- 金属は暗い面、端面highlight、継手、rivetsを持つ。
- 床とrailは木材と異なる直線的な反射を持つ。
- 同じ柱や梁を完全複製せず、固定した2から3 patternを使う。
- 1pxのランダムノイズだけで素材感を表現しない。
- grayscaleでも木と金属を輪郭と明度差で識別できる。

既存生成元は構図、色、接続位置の基準として再利用する。Elevatorはsourceとruntimeの縦横比が大きく異なるため、現行の固定プロンプト、`reference-environment.png`、`generated-background-shaft-back.png`、`reference-equipment.png`を用い、runtime cellの比率へ合う簡潔な大面構成で再生成する。坑道と縦坑は実寸prototypeで既存sourceの再処理を先に試し、木材と金属を判別できない場合だけ対象部分を再生成する。

背景全体、world座標、anchor、占有幅、地上接続軸、坑底sealed/open、Rope、Elevatorのnormal/narrow・open/closed状態、Cargo・人物を内部へ収めるlayer順は維持する。

### 変更責務

- `art/d001/generation-spec.json`: walk姿勢、Helmet・Boots・Tool所有、material rule、prototypeと再生成条件。
- `art/d001/sources/generated-player-animation.png`: 原則再利用し、Player全体の再生成は行わない。
- `art/d001/sources/`: 必要性をprototypeで確認した構造sourceだけを更新する。
- `scripts/process-d001-assets.mjs`: walk再構成、frame別装備mask、採掘姿勢、runtime実寸material処理。
- `src/render/pixelText.ts`: bitmap glyph、幅計算、alignment、整数描画。
- `src/render/environment.ts`, `src/render/interactionOverlay.ts`, `src/render/initialGuideOverlay.ts`, `src/render/entities.ts`, `src/render/phase5Renderer.ts`, `src/render/gameRenderer.ts`, `src/render/canvasRenderer.ts`: Canvas文字を共通bitmap fontへ移行する。
- `public/assets/d001/runtime/`: Player 5 layer、坑道構造、縦坑、Elevator、必要な上下junctionを更新する。
- `tests/assets.test.ts`, `tests/semanticRenderState.test.ts`, bitmap fontの限定unit、既存代表E2E: 今回の不具合を直接検出する条件だけを追加する。
- `docs/assets/stage3/second-follow-up/`: 変更前後の代表画像を追加する。
- 本文書: 実装結果、検証結果、残るリスクを追記する。新しい計画書は作らない。

### 検証規模と性能目標の制約

本追加対応は視覚的不具合の修正であり、性能改善、描画基盤の刷新、テスト基盤の拡張を目的にしない。過度な性能ゴールや網羅的なテストを完了条件にしない。

- FPS、frame time、描画時間、メモリ量、bundle sizeへ新しい数値目標を設けない。
- profiling、benchmark、長時間負荷試験、端末別性能測定を追加しない。
- bitmap fontやmaterial描画に明白な問題がない限り、cache、atlas再編、offscreen Canvasなどの最適化を追加しない。
- 全pixelのgolden snapshot、全glyph画像snapshot、全GameState組み合わせの画像比較を追加しない。
- 全文字列、全viewport、全装備組み合わせのE2E網羅を求めない。
- unit testは純粋なframe導出、glyph幅、layer所有、asset寸法・palette・alphaの代表条件に限定する。
- E2Eは既存操作経路と、今回の不具合が見える代表的なD-001状態に限定する。
- 素材感の品質を脆いpixel数閾値だけで代替せず、runtime実寸とgrayscaleの目視を正本とする。
- 同じ条件で成功済みの検証は、新しい変更、失敗、疑問がない限り繰り返さない。

### 自動検査

- walkが`左足前→真横→右足前→真横`の順となる。
- 真横姿勢だけ頭頂が1px上がり、全frameの接地点は`y=37`となる。
- 左右移動で同じ周期を反転表示し、Renderer時刻だけではframeが変化しない。
- Helmet layerへtool-head pixel、Boots layerへtool pixelと横長の非足componentが混入しない。
- mine-readyとmine-swing全frameでhandleとheadが視覚的に接続する。
- Tool Level間でhandleと手を共有し、headだけが変化する。
- bitmap fontの必須glyph、整数幅計算、left・center・right alignment、画面端clampが成立する。
- 更新素材の寸法、anchor、alpha 0/255、D-001 palette、対象別fallbackを維持する。
- Elevator全状態の外枠、床、anchor、占有幅、内部収容範囲が変化しない。

### 目視確認

- walkとcarry-walkの4frame strip、左右方向、実寸と拡大表示。
- mine-ready、mine-swing全frame、Tool Level 1・2。
- 初期案内、hoverラベル、`SEND`、施設名、深度表示、移動画面、発見banner、獲得通知。
- 480px相当、2倍相当、非整数倍率の代表viewport。
- 初期D-001と進行後D-001の坑道、縦坑、地上接続、坑底。
- Elevator上端・中間・下端、open/closed、normal/narrow、空荷、Cargo、人物搭乗。
- 通常色とgrayscale。

### 実装順序と完了条件

1. `8593f25`と今回のフィードバック画像を変更前証拠として固定する。
2. Bitmap fontを導入し、Canvas文字を共通描画へ移行する。
3. Helmet、Boots、Toolのframe別所有maskを実装する。
4. mine-ready・mine-swingの足とつるはしの可読性を修正する。
5. walk・carry-walkの4姿勢を再構成する。
6. 坑道1区画とElevator 1cellのmaterial prototypeをruntime実寸で確認する。
7. 合格したmaterial ruleを対象構造と全Elevator状態へ展開する。
8. 限定unit、typecheck、build、代表E2E、通常色・grayscale目視を行う。
9. 今回の範囲で見つかった問題を修正し、本正本へ実装結果を追記する。

完了条件は、歩行が左右の接地と真横姿勢を持つ一貫した周期として読めること、Canvas内の代表文字を非整数倍率でも読めること、木材と金属を通常色・grayscaleの双方で区別できること、採掘姿勢の足が身体へ自然につながり頭上に用途不明の孤立物がないこと、既存の操作・Simulation・保存形式・座標・anchor・fallbackを維持することである。

### 実装結果（2026-09-20）

- `8593f25`を機能実装直前、`e99cf50`を現行基準として変更前証拠を固定した。主な変更前画像のSHA-256は、walk `53d877b8d9cec4c50ae8700e93579bea73b71e29a98058670d445ad826119ccd`、carry-walk `8a6b0d3b34409c78ad8a80209a1d67341d6fdfb77504a043b47165142ccd0253`、mine-swing `e52d26f7b5c863477ddcb709ae4c4018fab7f76b5632c629d28df3ad98a7c00d`、初期画面 `37f3cbb707fc740eef1131e205625c4530d15c25a1f9d1fbe1e40246fc443105`、Elevator閉扉normal `6977e505b72e9aec5cc0e539da454b6fc151d80c66efd107e4cbeaa661fba3d6`である。
- `src/render/pixelText.ts`に依存packageなしの5x7標準glyphと3x5 compact glyphを追加した。英大文字・数字・主要記号・`·`・`→`・未知glyphの`?`を定義し、`measurePixelText`、left/center/right、top/bottom baseline、整数pixel描画を共通化した。Canvasの`fillText`・`measureText`はrender系から除去し、文字列、条件、anchor、boxのclampは維持した。DOMのHUD、ContextPanel、button、`src/style.css`は変更していない。
- Playerは`art/d001/sources/generated-player-animation.png`を再利用し、`scripts/process-d001-assets.mjs`の決定的な後処理だけで姿勢を再構成した。`semanticRenderState.ts`の`worldX`・`facing`由来の4frame位相は変更していない。walkの最終頭頂は`8/7/8/7`、carry-walkは`13/12/13/12`、全frameの接地点は`y=37`で、frame 0/2を通常、frame 1/3を上体1px上げた真横姿勢に揃えた。anchor `(20,38)`、左右反転、carryのCargo位置、時刻非依存を維持した。
- Helmet、Boots、Body、Toolのframe別所有maskを`generation-spec.json`へ固定した。Helmetはmine-readyの上方孤立成分とtool漏れを除去し、Bootsは`y=33..37`の接触帯だけを所有する。mine-ready 2frameとmine-swing 8frameのhandle/headは固定bridgeで接続し、Level 2はhandle・手・前腕をLevel 1と共有してhead paletteだけを変更した。Player sourceの再生成は行っていない。
- 構造素材は`art/d001/sources/`の既存cropを再利用し、`194x48`の坑道1区画、`56x44`のElevator 1cellをprototypeとして、runtime実寸の固定material passを適用した。木材は暗い外周・基調色・長手grain・固定knots、金属は面・端面highlight・継手・rivets、rail/floorは別の直線highlightとした。坑道、縦坑、床、Elevator全normal/narrow・open/closed層へ展開し、既存の地上接続・坑底junction・Rope・sealed/open・Cargo/人物の描画順と収容範囲は維持した。prototypeは通常色とgrayscaleで合格し、Elevatorや岩盤・鉱脈・Cargo・Workshop・D-030以深のsource再生成は行っていない。

### 変更ファイルと比較資料

- コード: `src/render/pixelText.ts`、`src/render/{environment,initialGuideOverlay,interactionOverlay,phase5Renderer,gameRenderer,canvasRenderer,entities}.ts`。
- 生成仕様・後処理・検査: `art/d001/generation-spec.json`、`scripts/process-d001-assets.mjs`、`tests/assets.test.ts`、`tests/pixelText.test.ts`。
- runtime: `public/assets/d001/runtime/`のbackground-floor、background-shaft-back、background-tunnel-structure、central-elevator-atlas、Player 5 layer、npc-crew-miner atlasを更新した。`art/d001/palette.json`と既存source画像は維持した。
- 比較資料: [walk比較](../assets/stage3/second-follow-up/player-walk-comparison.png)、[初期画面比較](../assets/stage3/second-follow-up/new-game-comparison.png)、[初期画面grayscale比較](../assets/stage3/second-follow-up/new-game-grayscale-comparison.png)、[mine-swing比較](../assets/stage3/follow-up/player-mine-swing-third-follow-up-comparison.png)。代表after画像は`docs/assets/stage3/second-follow-up/after/player-walk-frames.png`、`player-carry-walk-frames.png`、`stage3-second-follow-up-new-game.png`、`stage3-second-follow-up-elevator-closed-normal.png`と各grayscale、mine-swingは`docs/assets/stage3/follow-up/after/player-mine-swing-frames.png`へ更新した。

### 検証結果

- `npm run assets:d001`: 成功。runtime寸法、alpha 0/255、D-001 palette、layer再合成条件を後処理内で確認した。
- `npm test -- --run`: 9 files / 93 tests passed。bitmap fontのglyph幅・未知glyph・alignment、walk/carry-walkのframe順・top差1px・接地、採掘Toolの接続、Helmet孤立成分、Boots接触帯、Tool Level差分、asset条件を検査した。
- `npm run typecheck`: 成功。
- `npm run build`: 成功。
- Playwrightは既存の`tests/e2e/game.spec.ts` 8件を、4173番の外部Next.jsアプリを避けた一時4174番Vite serverへ向けて実行し、8件すべて成功した。操作経路、click/tap、再click、Space、`MINE`、`SEND`、D-030、fallback、後段Boreを確認した。
- 目視はwalk/carry-walk/mine-ready/mine-swingの実寸・拡大、Tool Level 1/2、初期案内・hover label・施設名・深度・初期Elevator、normal/narrowのElevator atlas、通常色/grayscale、480×270・2倍相当・`777x437`の非整数倍率で行った。Canvas文字は整数字画として読め、木材と金属はgrayscaleでも輪郭と明度差を保ち、mine-swingの頭上孤立物とBootsの横長混入は確認されなかった。

### 残るリスクと範囲外

- bitmap fontは現行Canvas文字列に必要なglyphを収録し、未知文字は`?`へfallbackする。今後新しい文字種をCanvasへ追加する場合はglyph追加が必要である。
- material passは固定2～3 patternのruntime実寸処理であり、全sourceの再生成ではない。今回の代表状態では合格したが、全pixel golden snapshotや全viewport・全装備組み合わせの画像検査は追加していない。
- 標準Playwright設定の4173番は外部FGO Labが占有していたため、そのポートでの直接実行は行わず、同じテストを4174番で実行した。外部サーバーは停止・変更していない。
- Simulation、イベント、乱数、経済、保存形式、world座標、anchor、Stage 1/2の対象・hit領域・操作、対象別fallback、DOM HUD、D-002以降、Stage 4以降、性能目標・profiling・依存関係は範囲外として維持した。コミットは作成していない。
