# EC連携：経緯

元の場所：kusakari-canvas/docs/ec-integration.md の「2026-10-13: Canvas内の商品候補・カート（旧仕様）」「検証用スクリプトの EC v3 への追従」（コミット 7e57723 時点）

2026-10-11: ECのファビコン画像（kusakari_ico.png）をタブとヘッダーに使用します。ECとCanvasのロゴ画像を統一します。768px以下では庭一覧・編集画面を縦に並べます。

## 2026-10-13: Canvas内の商品候補・カート（旧仕様）

以下は変更履歴です。2026-10-16に庭別の買い物リストへ置換済みで、Canvasからのカート更新は現在提供しません。

Context: 庭を編集中に候補商品を選び、同じECカートを操作できるようにする。

Decision: Canvasは `VITE_KUSAKARI_EC_URL` の `/api/cart`、`/api/materials/quote`、`/api/cart/items/{productId}` にcredentials=includeで接続する。受取店舗はECカートのstoreIdを使用する。素材の種類・個数・店舗を候補クエリのキーにし、座標・回転・倍率の変更では再取得しない。未対応素材や99個超過は素材ごとに表示する。追加は現数量への加算、更新は指定数量、削除は0としてrevision付きで送る。更新競合・通信失敗では最新カートを取得し、操作を自動再送しない。

共通ヘッダーと右サイドバーは同じTanStack Queryキャッシュを参照する。タブ切替・ウィンドウへの復帰でECカートを再取得する。庭の配置変更からカートを自動更新しない。商品価格・在庫・カートはECの正本を使用し、Canvas DBには保存しない。

ECの許可Originは `KUSAKARI_EC_CANVAS_ORIGIN`（通常http://127.0.0.1:5173、統合E2Eでは15173）で設定する。EC ViteはAPIのCORS処理をバックエンドへ委ねる。ローカルでは同一ホスト127.0.0.1・異なるポートでHttpOnly/SameSite=Strict/path=/apiの既存Cookieを共有する。localhostと127.0.0.1を混在させない。公開環境では既定の同一サイト構成に合わせてOrigin・Cookieを構成する。

Alternatives: Canvas専用カートの作成やCookieをJavaScriptでコピーする方法は採用しない。

Consequences（現在）: EC停止時は認証を確認できず保存できません。編集中の内容を保持し、サイドバーで再試行できる。注文手続きとヘッダーの「ECでカートを確認」は未保存確認を経由してEC /cartへ移動する。

### 検証用スクリプトの EC v3 への追従

EC v3 で `carts.store_id`・`cart_details`・`inventory.store_id`・`products.active` がなくなり、カートは会員ごとの1つになった。

- 直したもの：`backend/verification/deployment_preservation.py`（カートの増加の確認から `store_id` と `cart_details` を外した。`digest_database` は他のスクリプトから使われている）、`verify_database_tls.py`・`verify_linux_containers.py`（商品一覧を店舗1の指定なしで取る。店舗1が無い DB でも動く）。
- **EC v3 では使えないものは削除した**（2026-11-14、ユーザー判断）：2026-10 時点の特定のデータに対する1回限りの作業の記録で、package.json・E2E から呼ばれておらず、EC の開発用 DB を読むため試験用 DB でも使えなかった。`retire_product_catalog.py`（`products.active`・`carts.store_id`・`cart_details` と2026-10 時点の45商品が前提）、`retire_legacy_oak.py`、`verify_catalog_archive.py`、`ai_product_test_data.py`。他のスクリプトが使っていた `load`・`save` は `backend/verification/evidence_files.py` に移した。過去の作業の内容は Git の履歴に残る。
