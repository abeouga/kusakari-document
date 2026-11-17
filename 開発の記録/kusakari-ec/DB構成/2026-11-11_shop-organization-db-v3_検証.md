# 店舗側アカウントの作り直しで使う DB の構成（v3）を決める（issue #126、#104）（検証）

元の場所：kusakari-ec/docs/decisions/2026-11-11-shop-organization-db-v3.md（コミット a9cbd69 時点）

### 確かめたこと（2026-11-11）

使い捨ての MySQL 8.0.46 を、開発用（3306）とは別のポート（33999）に一時的なデータフォルダーで立てて確かめた。開発用・E2E 用の DB には接続していない。試験の後、この MySQL は停止した。

- `schema.sql` で21テーブルを作成できた
- 97件を試し、すべて期待どおりだった（拒否されるべき操作52件がすべて拒否され、通るべき操作45件がすべて通った）。拒否は、どの制約で拒否されたかを結果に残して、別の理由で失敗していないことを確かめた
- 一覧は [../database-v3-check/cases.txt](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/database-v3-check/cases.txt)、結果は [../database-v3-check/result.txt](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/database-v3-check/result.txt)

### 確かめていないこと

- アプリケーション（Spring Boot）からの動作。確かめたのは SQL だけ
- Flyway のマイグレーションとしての適用
- 同時実行（同じ在庫の同時購入、同じ招待キーの同時使用）。在庫と招待キーの行をロックしてから更新し、#110・#111 の E2E で確かめる
- Canvas の DB の変更
