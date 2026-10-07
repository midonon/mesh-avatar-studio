# 手動表情と漫画的な目の実装計画

> **For agentic workers:** Execute the approved scope directly. No additional approval gate is implied.

**Goal:** 配信操作画面で通常・笑顔・半目・ウインク・驚き・ぐるぐる目・バッテン目を選択し、OBSにも同じ表情を表示する。

**Architecture:** 既存の追跡・発話処理後に1つのproviderで自然な動きと手動表情を合成する。特殊な目はプロジェクト内の任意スプライトで元の目を覆い、同じ頭・体の変形を受ける。

**Tech Stack:** TypeScript、React、既存WebGL、Python/OpenCV/Pillow、Vitest、Playwright。依存追加なし。

残タスク一覧（次の行動・期限・所要時間）: 新しいホットキーを用いた実機配信での利用確認。ユーザーの利用時に数分程度。

2026-10-06に以下をローカル実装し、関連検証・目素材の視認を完了した。実行根拠と既存失敗は `docs/manual-expressions.ja.md` に記録した。

## 1. 合成と入力

- `src/engine/parameter-overrides.ts` と `createMeshAvatar.js`：静的map互換のproviderを加える。現在フレームの凍結baseline、例外時の素通し、再入禁止を検証する。
- `src/live/natural-motion.ts`：既存updateを保ち、sampleでblinkOpenとautoEyeWeightを返す。
- `src/live/expressions.ts`：7種の所有パラメーター、180msフェード、neutralへの復帰、最新選択優先を実装する。口・頭を所有せず、体の加算を一度だけ適用する。
- `src/live/expression-hotkeys.ts` と `ExpressionControls.tsx`：フォーカス時のDigit1〜7、変更・解除・初期化、IME・repeat・入力欄抑止、プロジェクト別保存を実装する。
- `LiveApp.tsx`：providerをアバターに一度登録する。自動表情を生むランダムclipは無効にする。
- `tests/manual-expressions.test.ts`：wink、halfの瞬き、neutral復帰、途中変更、bodyドリフト、ショートカット競合、保存破損を確認する。

## 2. 特殊な目

- `src/variants.json` を共通定義にし、Pythonとエディター・サーバーの許可名を揃える。
- `src/engine/special-eyes.ts` と `sprites.js`：両目の存在・復号・矩形・不透明な被覆を確認し、利用可否を公開する。通常時の描画を変えない。
- ぐるぐるを下、バッテンを上に描き、alphaを補正して途中の下地漏れを防ぐ。全被覆時は元の目と瞬きspriteを隠す。
- `src/live/tracking.ts` と `protocol.ts`：0〜1の2種selectorを許可し、古い送信元の欠落値を0とする。
- `projects/midonon-sd/variants/` に肌色パッチ付きの目素材をローカル作成し、既存build-spritesで構築する。元画像・samples・referenceは変更しない。

## 3. 検証と利用手順

- 新規unitが未実装を検出することを先に確認する。その後 `npm run lint`、`npm test`、`npm run build`、関連Playwrightを実行する。
- `e2e/manual-expressions.spec.ts`：provider、入力欄抑止、切替、非対応素材、OBS転送、特殊目中の瞬き・口パクを確認する。
- 目のアップと頭の傾き・口パク・切替中点の画像を `projects/midonon-sd/review/` に保存して目視確認する。
- 変形回帰0pxとPythonの既存チェックを確認する。無関係な既存失敗は修正範囲を広げず区別して報告する。
- `docs/manual-expressions.ja.md` にショートカット、素材条件、検証結果、未確認の実機入力を記録する。

## 完了条件

操作画面で7種を選択でき、ぐるぐる目とバッテン目では元の虹彩が見えず、口パク・頭・体の動きとOBS転送が継続する。生成素材と確認画像はignored projects内だけに置く。
