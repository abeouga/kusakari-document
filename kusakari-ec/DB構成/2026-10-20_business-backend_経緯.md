# EC / Canvas 業務バックエンド：経緯

元の場所：kusakari-ec/docs/business-backend.md（コミット a9cbd69 時点）

## Context

2026-10-20。既存の商品・在庫・カート・注文保存と、サンプルの受注・審査画面が分断されていた。ECのCognitoカスタムログインとCanvasのモデル・庭保存を維持し、同じ商品・会員・注文へ接続する。

## 移行と管理コマンド

ECのV9で会員・店舗・注文を拡張し、住所・カテゴリ・出店申請・通知を追加する。店舗IDは既存値・型・外部キーを保持してAUTO_INCREMENT化する。この属性変更の間だけ同一接続のFKチェックを一時停止して復元する。V10で商品カテゴリへ外部キーを追加し、並行した登録・削除でも不整合を許さない。起動時seedや在庫補充は追加しない。

事前バックアップ: `%LOCALAPPDATA%/Kusakari/backups/backend-implementation-20261020-113844/`。両DBのSQLダンプ（画像バイナリを含む）と変更前ソース・静的画像を保存済み。

管理コマンドはCanvasのPython仮想環境から `scripts/manage_accounts.py` を実行する。`--env-file`、`--database`、`--admin` が必須で、Git対象外の `--password-file` を付けると、Cognitoにアカウントがないときに作成する。運営（`ADMIN`）の会員を準備するだけで、商品・店舗は変更しない。AWS操作時は既存の `AWS_PROFILE=kusakari-dev` を明示する。招待メールは[AdminCreateUserのSUPPRESS](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminCreateUser.html)で抑止する。

業務コードにテストメールを埋め込まない。

2026-10-20の移行結果（当時の記録）: 有効31件を既存出店者・店舗1へ紐付け、在庫合計605と商品ID/SKU/画像URL/モデルハッシュ/価格を一致照合した。

### 2026-11-12 DBの作り直し後

DBを27テーブルの構成に作り直した（[ER図](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/database-er.md)、[記録](2026-11-12_db-v3-application_経緯.md)）。上の「注文と権限」「API」「移行と管理コマンド」のうち、次は新しい形に置き換わっている。

- 会員の権限は `USER`/`SELLER`/`ADMIN` ではなく、会員の種別と店舗ごとのロールで決まる（[会員の種別とロールの値](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/member-roles.md)）。
- 出店申請の承認は、店舗ではなく組織を作る。店舗はオーナーが作成・公開する。
- 商品は1つの店舗に属し、カートは受取店舗を持たない。注文は商品の店舗ごとに1件できる。
- マイグレーションは V1（テーブル）と V2（サンプルデータ）に作り直した。V9・V10 などの記述は当時の記録である。
- 出店承認を取り消すスクリプト（`scripts/revert_store_approval.py`）と、その検証（`e2e/business-store-revert.spec.js`）は削除した。開発用DBを最初の状態に戻すときは `DB-reset.bat`（[手順](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/database-reset.md)）を使う。
