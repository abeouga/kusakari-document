# 商品特徴から事前制作GLB部品を構成する：検証の方法

元の場所：kusakari-canvas/docs/modular-plant-models.md の「Verification」（コミット 7e57723 時点）

## Verification

ECのAPIをビルドした後、Canvasで `npm run test:shopping` を実行する。両リポジトリは同じ親フォルダに置く。専用MySQLのEC `kusakari_e2e` / Canvas `kusakari_canvas_e2e` を使い、販売者の入力・6構成のプレビュー・商品保存・商品一覧と庭の買い物リストからのドラッグ・自動保存・再読込・商品編集後の旧構成保持・幅変更・EC側の選択購入を確認する。画面と実API JSONは `artifacts/e2e/plant-model/` に保存する。
