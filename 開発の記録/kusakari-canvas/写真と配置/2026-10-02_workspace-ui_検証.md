# 庭エディタの画面構成：検証の記録

元の場所：kusakari-canvas/docs/workspace-ui.md の「検証」（コミット 7e57723 時点）

## 検証

実FastAPIと専用MySQLを使用するChromium E2Eを利用する。

- 既存A〜R：作成、配置、ドラッグ、回転、拡縮、複製、削除、通信失敗と再試行、競合、GLB再読込、写真輪郭、カメラ校正、寸法、辺計測、保存・復元。
- S：カタログと編集パネルの独立開閉、1280×800の作業面、配置終了のEsc、未適用寸法の取消、Tabの循環、Deleteの背面伝播防止、未保存確認とフォーカス復帰、削除確認の取消。
- R：1024×768で辺の計測表示が写真領域内に収まること、マウス・Enter・Spaceでの選択と閉じる操作・Escでのフォーカス復帰、計測とカメラ設定の取消で庭JSONが変わらないこと。

再読み込み後の画面とAPI JSONは `artifacts/e2e/workspace-reloaded.png` / `.json`、辺とカメラ設定は `workspace-edge-1024.png` / `workspace-camera-dialog.png`、削除確認は `workspace-delete-dialog.png`。途中で検出したフォーカス不具合のtraceは `workspace-first-failures/` と `workspace-focus-failure/` に保持する。

2026-10-02の最終実行：`npm run precheck`、`npm run build:web` は成功、`npm run test:e2e` は20件すべて成功（1.8分）。旧写真の互換性失敗時のtraceは `workspace-legacy-failure/` に保存した。開発用APIとWebを再起動し、8080/5173のHTTP 200とChromeでの表示も確認済み。実写真の撮影精度については、このUI検証の対象外。
