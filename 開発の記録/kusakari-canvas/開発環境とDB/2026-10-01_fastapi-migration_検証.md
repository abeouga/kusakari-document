# FastAPI移行：検証の記録

元の場所：kusakari-canvas/docs/fastapi-migration.md の「旧実装の検証履歴（2026-10-01）」（コミット 7e57723 時点）

## 旧実装の検証履歴（2026-10-01）

- Python/JavaScript lint、TypeScript型チェック、Python compile、フロントエンド本番ビルド成功。
- 開発DBのFlyway V1/V2をバックアップ後にAlembic 0002へ採用。assets 4行、gardens 2行、placed_objects 6行、Flyway履歴2行の移行前後SHA256が一致。既存庭2件の写真・配置・DOUBLE座標を実APIの応答と照合し、一致を確認。`artifacts/fastapi/development-data-preservation.json`。
- 独立した実MySQL 8.0.45でAPI検証成功。同時更新200/409、保存途中の整合性違反による全rollback、owner分離、PNG/JPEG往復、各入力拒否、削除cascadeを確認。新規DB、Flyway V1/V2の移行と再起動、構造不一致・失敗履歴の変更前拒否も成功。`artifacts/fastapi/backend-verification.json`。
- 隔離MySQLおよび既存サービスの専用`greenly_e2e` DBの双方でChromium全9件成功。写真・四隅・6点輪郭・配置・保存復元・3D切替を含む。成果物は`artifacts/e2e`とPlaywright HTMLレポート。これは旧Greenly実装の記録で、現行設定の検証結果ではありません。
- root start.ps1によるAPI/Web起動、Web経由APIのFastAPI識別、停止後8080/5173の待受0件を確認。`artifacts/fastapi/launcher-verification.json`。
- 旧Javaソース・Maven関連・既存の未コミット変更はリポジトリ外へ退避。開発DBのSQLバックアップはユーザー領域のKusakari Canvas backupsに保存。Python/MySQLの資格情報はローカル環境設定だけで管理。

Webビルドのチャンクサイズ警告およびThree.jsのClock非推奨警告は残る。全E2Eは成功している。公開運用向け認証は今回の移行範囲に含まれない。
