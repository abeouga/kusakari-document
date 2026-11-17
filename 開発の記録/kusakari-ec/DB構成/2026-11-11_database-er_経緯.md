# EC のデータベース構成（ER 図）（経緯）

元の場所：kusakari-ec/docs/database-er.md（コミット a9cbd69 時点）

2026-11-11 決定、2026-11-12 更新。店舗側アカウントの作り直し（#103）で作る、新しい DB の構成です。決定の経緯は次の2つにあります。

- [decisions/2026-11-11-shop-organization-db-v3.md](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/decisions/2026-11-11-shop-organization-db-v3.md)：構成（v3）の採用
- [decisions/2026-11-12-db-v3-payments-closure-roles.md](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/decisions/2026-11-12-db-v3-payments-closure-roles.md)：決済と返金、手数料、店舗の閉鎖、組織のロール、招待キー、警告の履歴の追加
- [decisions/2026-11-13-moderation-warnings.md](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/decisions/2026-11-13-moderation-warnings.md)：運営の警告と、商品・店舗の停止の履歴（`product_moderation_events`・`store_moderation_events`）の使い方。マイグレーションは足していない
- [decisions/2026-11-13-store-closure-organization-suspension.md](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/decisions/2026-11-13-store-closure-organization-suspension.md)：店舗の閉鎖と組織の停止の実装。組織の停止の履歴（`organization_moderation_events`、V3）の追加と、連絡先の削除をアプリの定期処理にしたこと

この文書の前提は次のとおりです。

- この構成は、統合ブランチ `feature/shop-organization` で作るものです。main の DB（Flyway の V1〜V15）とは違います
- マイグレーションはまだありません。#107 で、[database-v3-check/schema.sql](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/database-v3-check/schema.sql) のテーブル定義から作ります
- 既存のデータは移行しません。DB は初期化スクリプト（#106）で作り直します
- 列の型・長さ・初期値・制約名は、`schema.sql` を正とします。この図と `schema.sql` が食い違ったら、`schema.sql` に合わせて図を直します
- 決済は Stripe のテストモードだけを使います。実際のお金は動かしません

## 6. 今のテーブル（V1〜V15）との対応

名前が変わるもの、なくなるもの、足されるものの一覧です。ここにないテーブルと列は、今の名前のままです。

### テーブル

| 今 | 新しい構成 | 理由 |
| --- | --- | --- |
| `auth_members` | `members` | 互換性が不要になり、名前を残す理由がなくなったため |
| `store_applications` | `organization_applications` | 申請の対象が店舗ではなく組織になったため |
| `cart_details`、`member_addresses`、`order_details` | なくす | 店舗受け取りだけにするため。受取連絡先と支払方法は `orders` に入れる |
| なし | `organizations`、`organization_members`、`store_members` | 組織・所属・店舗の担当 |
| なし | `store_invitations`、`store_invitation_uses` | 招待キーと、キーを使った人の記録（#105） |
| なし | `payments`、`stripe_events`、`refunds` | Stripe（テストモード）の決済・通知・返金（#131〜#133） |
| なし | `product_moderation_events`、`store_moderation_events` | 運営による警告・停止の履歴（#16） |
| なし | `organization_moderation_events` | 運営による組織の受付停止・停止・再開の履歴（#109、V3） |

### 列

| テーブル | 今 | 新しい構成 |
| --- | --- | --- |
| `members` | `role`（`USER` / `SELLER` / `ADMIN`） | `account_type`（5種類） |
| `members` | `store_id` | なくす（店舗とのつながりは `organizations`・`store_members` で持つ） |
| `members` | なし | `email_verified_at`、`created_at` |
| `organization_applications` | `member_id`、`company`、`contact`、`email`、`phone`、`address`、`reason` | `applicant_member_id`、`organization_name`、`contact_name`、`contact_email`、`contact_phone`、`company_address`、`rejection_reason` |
| `organization_applications` | `plan` | なくす（料金プランは作らない。#125） |
| `organization_applications` | 審査中の状態の名前は `PENDING` | `SUBMITTED` |
| `organization_applications` | 再申請のたびに行が増える | 1人につき「今の申請」と「前回の申請」の2行まで（`is_latest`）。再申請で新しい行を作り、前々回の行は消す |
| `organization_applications` | なし | `organization_id`、`submitted_at`。状態に `DRAFT`・`WITHDRAWN` を足す。書類の3列と却下の理由は、空にできる（下書きには書類がないため） |
| `stores` | `hours`、`contact`、`email`、`story` | `business_hours`、`contact_name`、`contact_email`、`introduction` |
| `stores` | `company` | なくす（事業者名は `organizations.name` だけに持つ） |
| `stores` | `enabled` | `published`（オーナー）と `suspended`（運営）に分ける |
| `stores` | 緯度経度は必須 | 空にできる（位置なし） |
| `stores` | なし | `organization_id`、`created_at`、閉鎖の3列（`closing_started_at`、`closing_started_by`、`closed_at`） |
| `products` | `category` | `category_name` |
| `products` | `owner_member_id`、`active` | なくす。持ち主は `store_id`、公開状態は `inventory.publication_status` と `products.suspended` |
| `products` | `sku` が全体で一意 | `(store_id, sku)` で一意 |
| `products` | なし | `store_id`（必須） |
| `inventory` | 主キー `(store_id, product_id)` | 主キー `product_id`。`store_id` はなくす |
| `inventory` | `publication_status` の初期値 `PUBLISHED` | 初期値 `HIDDEN` |
| `carts` | `store_id` | なくす |
| `carts` | `member_id` は空にできる | 必須（未ログインではカートを使えない。#10） |
| `cart_items` | `store_id` | なくす（受取店舗は商品の店舗） |
| `orders` | `pickup_address`、`pickup_hours` | `store_address`、`store_business_hours` |
| `orders` | `subtotal_yen`、`shipping_fee_yen` | なくす（送料がないため、金額は `total_yen` だけ） |
| `orders` | `buyer_member_id`、`store_id` は空にできる | 必須 |
| `orders` | 状態は `ACCEPTED` / `READY` / `COMPLETED` / `CANCELLED` | 支払い待ちの `PENDING_PAYMENT`（仮）を足す。DB が知らない状態を拒否する |
| `orders` | なし | `payment_method`、`recipient_name`、`recipient_phone`、`contact_email`（`order_details` から移す） |
| `orders` | なし | `payment_id`（決済）、`commission_rate_bp`・`commission_yen`（手数料。名前は仮）、`cancelled_by_member_id`（キャンセルした人） |

文字列の長さは、今より短くしていません（同じか、長くしています）。
## 8. 仮の形で入れているもの・入れていないもの

決まったら、この図と `schema.sql` を直します。

| 項目 | 今の形 | 決める場所 |
| --- | --- | --- |
| 決済と返金のテーブル名・状態の名前、返金のルール | #131 の採用候補（Stripe、カードだけ、注文時に請求を確定、お会計1回で決済1つ、注文時に在庫を確保）に合わせた仮の形 | #131 |
| 1つの注文の中の一部の商品だけの返金 | できない形（注文1件につき返金1行） | #131 |
| 支払われなかった注文を取り消すまでの時間 | 列は持たない（決済の作成日時から求める） | #131 |
| 手数料の2つの列の正式な名前 | `commission_rate_bp`、`commission_yen` | #130 |
| キャンセルされた注文の手数料 | 保存した額は残し、表示のときに0として扱う | #130 |
| 組織の受付停止の列の名前と形 | `suspension_started_at`（日時）と `suspended` | #104 |
| 組織のロールの名前 | `ORG_ADMIN` | #105 |
| 出店規約に同意した記録 | 入れていない | #15 |
| 同じ品種の商品をジャンルでまとめて表示するか | 入れていない | issue はまだない |
| `material_products` を残すか | 残している | #119 |
| 発送（自宅配送）の列 | 入れていない（「発送は行わない」という決定案が出ている） | #120 |
