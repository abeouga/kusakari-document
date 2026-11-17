# 庭編集画面の初期表示：検証の記録

元の場所：kusakari-canvas/docs/default-photo-view.md の「検証方法」「実行結果（2026-10-20）」（コミット 7e57723 時点）

## 検証方法

- `npm run check:js`、`npm run lint`、`npm run lint:api`、`npm run compile:api`、`npm run build:web`。
- 隣接ECで `npm run check`（checkJs、lint、Webビルド、Javaビルド）。
- `npm run test:e2e -- e2e/editor-default-view.spec.ts e2e/photo-empty-layout.spec.ts e2e/thumbnail-budget.spec.ts`。
- 3D操作・自動保存の対象E2Eを実行後、`npm run test:e2e` で通常の全E2Eを実行します。
  有料外部AIの実行フラグは無効にします。
- 既存ランナーは127.0.0.1の空きポートにCanvas/ECのWebと実APIを起動します。
  Canvasは専用MySQL `kusakari_canvas_e2e`、ECは `kusakari_e2e` を使用します。
  開発用Web/APIや開発DBは変更せず、正常系APIモックや代替DBを使用しません。
- 新規テストはUUID付きの専用庭を作り、保存した写真・寸法・配置・revisionを実APIで確認します。
  タブ切り替えだけでは庭PUTが発生しないこと、保存応答後も手動選択を維持すること、
  再読み込み後に写真表示へ戻ること、既存サムネイルが維持されることを検証します。
- 再読み込み後のスクリーンショットと実API JSONをPlaywright成果物に保存します。
  失敗時はtrace・HTMLレポート・ログを残し、生成成果物はGitへ追加しません。

## 実行結果（2026-10-20）

- CanvasのcheckJs、lint、API lint/compile、Webビルドは成功しました。
  最終のE2E修正後にもlintを実行しています。
- ECの `npm run check` は成功しました。Javaの結果はビルド成功であり、
  Mavenのユニットテスト実行を意味しません。ECのソースは変更していません。
- 最初の対象3件は写真アップロードとサムネイルが成功し、新規テストの一覧ボタンのセレクターが失敗しました。
  ボタンに修正後、新規テストは成功しています。
- 3D操作・保存の対象19件は18件成功、1件失敗でした。
  写真付きの庭まで3Dへ切り替えていた証拠保存ヘルパーを修正し、該当1件の再実行は成功しました。
- 通常の全97件は **92件成功・3件失敗・2件スキップ**（29.6分）でした。
  スキップは明示的な有料外部AI実行を要求する2件です。
- 失敗3件を再検証し、**3件すべて成功**（1.4分）しました。
  - 写真削除後の履歴ギャラリー、写真なし長方形庭の描画確認：
    3Dを明示的に選択するようテストを修正しました。
  - 写真の6点輪郭テスト：実APIへのPUT中の `ECONNRESET` でした。
    テスト・APIは変更せずに再実行し、成功しました。接続リセットの原因は未特定です。
- 最終変更後の全97件一括再実行は行っていません。全体実行と失敗箇所の再検証を合わせた結果です。
- Viteのチャンクサイズ、Three.jsの非推奨API、FlywayとMySQLバージョンの警告は残っています。

### 証拠の保存先（Git対象外）

- `artifacts/e2e/default-photo-initial-run/`：初回対象テスト、失敗trace、写真アップロードとサムネイルの成功証拠。
- `artifacts/e2e/default-photo-targeted-run/`：対象19件、新規初期表示テストの再読み込み画像と実API JSON。
- `artifacts/e2e/default-photo-autosave-retry/`：写真編集・削除の自動保存再検証。
- `artifacts/e2e/default-photo-full-run/`：全97件の `results.json`、HTMLレポート、trace、初期表示の画像と実API JSON。
- `artifacts/e2e/default-photo-full.log`：全97件のWeb/API起動・テスト実行ログ。
- `artifacts/e2e/default-photo-final-retry/`：失敗3件の再検証結果と成功証拠。
- `artifacts/e2e/default-photo-retry.log`：失敗3件の再検証ログ。

サンドボックス内では既存uvを参照できなかったため、API lint/compileとE2Eは許可を受けて
既存のユーザー領域ランタイムで実行しました。依存・ロックファイル、API契約、DBスキーマは変更していません。
