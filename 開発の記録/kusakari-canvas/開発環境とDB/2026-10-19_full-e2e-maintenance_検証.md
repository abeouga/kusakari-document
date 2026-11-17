# 全E2Eの実行環境と現行UIへの更新：検証の記録

元の場所：kusakari-canvas/docs/full-e2e-maintenance.md の「検証記録」「標準E2E起動設定の修正（2026-10-20）」（コミット 7e57723 時点）

## 検証記録

- 初回診断: 87件を検出。8件失敗時点で停止し、6件成功、13件スキップ、60件未実行。`first-failures/`と`first-failures-report/`に保存。
- 画像関連の追加診断: 商品fixtureの旧DTO項目、旧導線、フォーカス枠の画素差を確認。修正後の全件実行で再検証する。
- 全件診断で、草花の`plant_modular`がcoverageの植物判定から漏れ、非植物の緑として描画される実不具合を確認した。旧tree/shrubだけの判定が原因。実商品の草モデルと家具を同時撮影するE2Eで赤・緑の画素と投影範囲を検証する。
- `image-studio.md`の承認済み仕様では植物別の遮蔽解析は廃止済み。旧`raster`期待値は、`projected_box`・可視状態未推定・投影範囲への実植物画素の包含検証に置き換える。
- 参考写真のアップロードは画像デコード完了の表示を待ってから生成する。自動保存の確認用GETは切断されたアイドル接続だけ1回再試行し、HTTPエラーや保存内容の検査を省略しない。
- 全件診断: **69件成功・16件失敗・有料専用2件スキップ（22.0分）**。`full-diagnostic-results.json`、`full-diagnostic-report/`、`full-diagnostic-failures/`に保存。
- 写真右下の輪郭入力が、無効なAI生成ボタンに遮られて頂点を失う不具合も再現した。輪郭描画中だけメニューを隠し、写真端の4点の保存・再読み込みを再検証する。
- 出品E2Eは現在の3段階フォーム、商品画像アップロード、モデル詳細、密度スライダー、確認・出品に更新。商品API入力からレスポンス専用の`publicationStatus`を除外する。通常編集の離脱は保存完了を確認し、未保存確認は未確定の写真輪郭で検証する。
- 失敗ケースの修正後再実行: **16件成功・失敗0件（5.3分）**。`repair-results.json`と`repair-report/`に保存。
- 最終全件実行で、商品画像のPython検証が前回の成果物と同名ファイルを新規作成して失敗した。画像検証そのものではなく証跡保存の衝突であり、庭IDごとの`pipeline-<gardenId>/`へ分離した。以前の証跡を削除せず、繰り返し実行できることを対象再実行で確認する。
- 最終全件実行: **84件成功・成果物保存先の衝突1件失敗・有料専用2件スキップ（22.3分）**。`final-full-results.json`、`final-full-report/`、`final-full-test-results/`と`final-run.log`に保存。
- 保存先修正後、同じ対象を`--repeat-each=2`で実行し、**2回とも成功（1.6分）**。`final-repeat-results.json`、`report/`と`final-repeat-run.log`に保存。通常85件はすべて成功を確認済みだが、全件実行1回だけの成功ではなく、対象再実行を含む結果である。ケース別の対応表は`verification-summary.json`。
- checkJs（全フロント）、変更E2Eと全体設定のTypeScript検査、lint、フロントビルド、Python APIのlint/compile、EC Javaビルドが成功。既存の大きなフロント配信ファイルの警告は残る。公開API・DBスキーマ・依存・ロックファイルに変更なし。
- 成功時の再読み込み画面と実API JSONを保存。追跡済み成果物70ファイルは今回の内容を`generated-evidence/`にコピーしてから元に戻した。既存未追跡成果物を保持し、ECソース・既存データ・開発プロセスは変更していない。
- 有料OpenAI生成とDB障害注入の2件は既存の明示実行条件によりスキップし、品質評価・有料経路の成功は主張しない。通常検証のOpenAI呼び出しは0回。

## 標準E2E起動設定の修正（2026-10-20）

- 標準の `npm run test:e2e` はEC接続先を割り当ててもCanvasだけを起動していた。商品fixtureを利用するテストの接続先と起動サービスが一致していなかった。
- `scripts/e2e.mjs` は設定指定がない場合に `e2e/configs/playwright.full.config.ts` を選択する。ファイル指定・grepによる部分実行も同じ4サービスを使用する。明示された `--config` / `--config=...` / `-c` / `-c=...` は優先し、従来の専用設定を上書きしない。
- READMEにECリポジトリ・専用DBの前提、部分実行、成果物の保存先を追記した。Canvas単独設定と一時MySQL検証の対象範囲も明示した。
- `node --check scripts/e2e.mjs`、対象ファイルのESLint、`git diff --check` が成功。標準 `--list` で87件を検出し、`--config=...` と `-c` による対象1件の一覧取得も成功した。
- 設定指定なしの `npm run test:e2e -- e2e/editor-toolbar.spec.ts --output artifacts/e2e/startup-config-20261020/test-results --reporter=line,json` が **1件成功（1.1分）**。実API・専用MySQL・Chromiumで実商品の配置・保存・再読み込みとECへの遷移要求を検証した。JSONレポートは `PLAYWRIGHT_JSON_OUTPUT_FILE` により同ディレクトリの `results.json` へ保存した。再読み込み画像・API JSONも同ディレクトリへ複写した。
- 全E2Eは再実行していない。アプリ実装・依存・DBスキーマは変更していない。
