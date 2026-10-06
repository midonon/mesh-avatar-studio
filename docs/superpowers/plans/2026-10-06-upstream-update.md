# 公式アップデート取り込み計画

残タスク一覧（次の行動・期限・所要時間）: なし。公式差分の統合、依存追加、関連テストと全体検証を完了。検証結果と未解消事項は `docs/upstream-update.ja.md` に記録。

> **For agentic workers:** Execute the approved scope directly. No new approval gate is implied.

**Goal:** 公式 `0d1ecf040f3111f2b0451f9257f763872e212f0c` の変更を取り込み、既存の配信機能と未コミットの決定論的母音判別を維持する。

**Architecture:** 共通の元コミット `286e583` と現在のファイル、取得した公式ファイルを三者比較する。公式カメラ画面 `live.html` と表示画面 `stream.html` を追加し、既存 `/stream` と `/stream/overlay` は保持する。AIキャラアプリはユーザーの訂正により対象外。

**Tech Stack:** React、TypeScript、Vite、MediaPipe Tasks Vision 0.10.21、Vitest、Playwright、Python/uv。

## 1. 公式変更の統合

- `src/live/`、`src/server/live-relay.ts`、`src/server/mediapipe-assets.ts`、`vendor/mediapipe/` と公式追加テストを取り込む。
- エディター、エンジン、ローカルプロジェクト処理、README、公式スクリーンショットを共通ベースから統合する。
- `vite.config.ts` では既存の streamControlPlugin を保持し、公式プラグインと三つのHTMLビルド入口を追加する。
- `src/main.tsx` の既存ルーティング、`tools/overlay.py` の座標修正、`src/stream/` の母音判別実装を保持する。
- ユーザー画像、`projects/`、`samples/`、`reference/` は取り込み対象にしない。

## 2. 依存・案内の更新

- npmで `@mediapipe/tasks-vision@0.10.21` を追加し、lockfileを整合させる。無関係な一括更新は行わない。
- `docs/streaming.ja.md` に公式カメラ画面と既存母音判別画面の入口と用途を記載する。
- Nodeの利用可能バージョンを確認し、要求された22.17以上が使える場合は検証に使う。

## 3. 検証

- `npm run lint`、`npm test`、`npm run build`、`npm run e2e` を実行する。
- `uv run --with numpy --with pillow --with opencv-python-headless tools/test_build_layers.py` と `uv run tools/test_agent_tools.py` を実行する。
- 公式カメラ・配信テストと既存母音判別のテストで、互いの入口と処理が壊れていないことを確認する。
- ローカルアバターを公式カメラ画面で読み込み、ブラウザー画像を視認する。実カメラ・実マイク・OBS録画が未実施ならそのまま報告する。
- 失敗は根拠を調べ、今回の統合起因と環境・既存問題を分けて報告する。数値変形回帰は0pxを維持する。

## 作業記録

- 検証済み: 公開ソースを指定コミットで取得し、元コミットからの変更一覧を生成した。AIキャラアプリとその依存は作成・導入していない。
- 検証済み: lint・build・Python回帰・数値変形0px、公式配信E2E9件、統合E2E1件、既存マイク・母音判別E2E。全体単体は94件成功・4件EPERM失敗。全体E2Eの未解消事項は報告書に記録。
- 未確認: 実カメラ・実マイク・OBS録画。コミットとpushは今回行っていない。
