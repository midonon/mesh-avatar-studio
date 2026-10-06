# 自動瞬き・呼吸・体の揺れの実装計画

残タスク一覧（次の行動・期限・所要時間）: 必須実装・確認は完了。実機カメラとOBS録画での好みの調整は利用時、約5～10分。

実装結果と検証済み・未確認事項は [確認記録](../../natural-motion-verification.ja.md) に記載した。

> **For agentic workers:** Execute the approved scope directly. No additional approval gate is implied.

**Goal:** 公式の配信画面に自動瞬き・正面視線・呼吸と体の揺れの調整を追加する。

**Architecture:** Claude Code Opusが英語で策定し、実コードのAPI照合後に修正した `docs/natural-motion-spec.en.md` を用いる。既存追跡と口パクの処理後に、現在フレームの対象パラメーターだけを上書きする。生成とOBS連携の責任を操作画面に集約する。

**Tech Stack:** 既存TypeScript/React/WebGL、Vitest、Playwright。依存追加なし。

## 1. 優先順位と設定

- `src/engine/parameter-overrides.ts`: 有効なパラメーターだけへの置換・加算・重み・範囲制限。
- `src/engine/index.ts`、`src/engine/createMeshAvatar.js`: 既存処理後・描画と最終値取得の前に独立した上書き段階を追加。空の上書きは完全な無操作。
- `src/live/natural-settings.ts`: 既定値、入力検証、プロジェクトごとの数値保存。
- `tests/natural-motion.test.ts`: 追跡の顔・口・眉を変えないこと、加算の基準が現フレームであること、範囲・不正入力、保存失敗を確認。

## 2. 自然な動作と画面

- `src/live/natural-motion.ts`: 注入可能な時間・乱数、瞬きの閉じ切り、呼吸と揺れ、モード移行と強さの平滑な変更。
- `src/live/NaturalMotionControls.tsx` と設定hook: 独立した目・視線選択、頻度、呼吸と揺れの強さ、既定への復帰。日本語・英語・中国語対応。
- `src/live/LiveApp.tsx`: 現在の追跡呼び出しを保持し、自動動作を組み込む。カメラ停止時も操作画面から最終姿勢を送る。

## 3. 検証と記録

- 関連単体テストと `npm run lint`、`npm run build`。数値変形回帰0pxを確認する。
- `e2e/natural-motion.spec.ts`: カメラ許可なしで動くこと、目と視線の独立、設定保存・保存失敗、OBS連携、背景タブの更新。
- 変更が関係する公式配信・母音判別E2Eも確認する。全体テストの前回の根拠は同一コード領域について再利用し、今回の変更・新規失敗を優先する。
- ユーザーアバターの画像は `projects/` 内で取得・視認する。実カメラとOBS録画が未実施なら明記する。

## 委譲・調査の根拠

- 公開公式資料: VTube Studio、Warudo、VSeeFace、Live2D Cubism。
- 英語入力: `docs/research/natural-motion-research.en.md`、`docs/research/natural-motion-opus-brief.en.md`。
- Claude Code 2.1.290、実行結果のモデルID `claude-opus-5-5`、初回153,052ms・修正版129,727ms、各1ターン、エラーなし。
- `setParameters` が全体置換であることを主担当が確認し、Opusへ訂正を依頼した。修正版は独立した置換・加算段階でこの問題を解消した。
- 画像・秘密情報・ローカルの識別パス・ソース全文はOpusへ送っていない。ツール無効の仕様策定のみを委譲した。
