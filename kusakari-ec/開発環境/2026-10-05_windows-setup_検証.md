# Windows 一括セットアップの検証結果（2026-10-05）

元の場所：kusakari-ec/docs/windows-setup.md の「検証結果（2026-10-05）」の節（コミット a9cbd69 時点）

- Windows PowerShell 5.1からsetup.batを実行し、実MySQL 8.4の開発/E2E DB認証、Flyway、商品データ、実API起動を確認しました。
- Node/JavaがPATHにない状態で、Node LTS・Temurin JDK 21の取得・チェックサム検証・実行に成功しました。.NET 10 SDKも自動取得し、SysOverRayをビルドしました。
- 既存MySQLのrootパスワードが`password`と異なる場合だけ非表示入力し、アプリ資格情報は自動設定する動作、設定ファイルのユーザー専用ACL、一時資格情報ファイルの削除を確認しました。
- 当時の既存環境に保存されていたMySQL実行ファイルとZIPを再利用し、保存済みmanaged設定で`instance.json`が無い場合の専用DB初期化・ユーザー・スキーマ作成を確認しました。
- 別ポート・別データディレクトリの一時環境で、他PCを想定した`setup.bat -SkipInstall`のDB初期化、Flyway、実API起動を確認しました。
- 保存済み資格情報でsetup.batを再実行し、開発DB全テーブルのチェックサムと接続設定が不変であることを確認しました。
- 専用MySQLの初回作成、別サーバーのポート占有時の拒否、停止後の復帰とデータ保持を確認しました。
- 未知スキーマではユーザー作成・設定保存前に拒否し、既存テーブルの内容を保持しました。誤パスワードでは1045を表示し、秘密値を表示しませんでした。
- start.batでAPI/Web・Web経由API、SysOverRayの可視ウィンドウ・最前面属性・操作ボタンを確認しました。
- JavaScript型確認・lint・Web/Javaビルド・変更ファイルの整形確認に成功しました。実MySQLのChromium E2E全7件が成功し、注文再読み込み後の画面と実API JSONを保存しました。

別PC実機での検証、およびVisual C++ランタイムの新規導入/UAC操作は未実施です。
