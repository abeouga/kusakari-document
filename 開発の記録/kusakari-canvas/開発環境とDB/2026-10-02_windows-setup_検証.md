# Windowsの一括セットアップ：検証の記録

元の場所：kusakari-canvas/docs/windows-setup.md の「検証結果（2026-10-02）」「追加検証（2026-10-08）」「パス変更対応の確認（2026-10-08）」（コミット 7e57723 時点）

## 検証結果（2026-10-02）

- 実際の既存MySQL 8.0.46に、DBと専用ユーザーを初回作成。root認証は非表示入力し、保存しなかった。
- Node/uv/Pythonと接続設定のないユーザー領域、依存関係のない日本語・空白入りソースコピーで、
  Node 24.21.0、uv 0.12.21、Python 3.12.14とロック済み依存関係を取得できた。
- 公式MySQL 8.4.11のZIPについてSHA-256とOracle署名を確認し、専用保存先でDB・専用ユーザーを作成できた。
- .NETがPATHにない環境で.NET本体とWindows Desktop 10.0.12を導入し、両ランタイムの存在確認が成功。
- setup.batを2回再実行し、管理者再入力なし・資格情報不変・dev/E2Eの業務テーブル不変を確認。
  E2E専用DBには保存データを入れて検証し、自分で作った検証レコードだけを削除した。
- start.batを直接実行し、API、Web、Web経由APIの200応答とFastAPI識別、停止処理を確認。
- 専用MySQLのポート競合時の拒否、停止後のstart.batによる同一保存先からの復帰、
  未知スキーマでアカウント/.envを書き換える前の拒否、dev/e2eの相互DBアクセス拒否を確認。
- 誤った接続資格情報でMySQL 1045の表示と秘密情報の非出力を確認。
- 型チェック・JS/Python lint・Python compile・Webビルド成功。既存MySQLでChromium全10件成功。
  専用MySQLでも庭作成・GLB配置・保存・再読み込みのシナリオを実行。
- 要約はartifacts/fastapi/setup-existing-verification.jsonとsetup-managed-verification.json。
  再読み込み後の画面・実API JSONはartifacts/e2e。詳細ログ・テスト用MySQLはGit外に保持。

別PCの実機そのものは未検証。Visual C++ランタイムの新規導入とUAC承認は、このPCに既存ランタイムがあるため未実行。
クリーンなユーザー領域を使う検証では、通常のMySQLサービスを停止せずmanagedモードを明示して専用MySQLを使用した。
WebビルドのチャンクサイズとThree.js Clockの既存警告は残る。

## 追加検証（2026-10-08）

- 現在のWindows環境とMySQL 8.0.46で`verify_windows_setup.py`を実行し、既存DBへの再セットアップ、資格情報・データ保持、dev/e2e分離、API/Web/プロキシの応答を確認。
- BAT起動でAPI/Webの指定ポートを占有した状態でも別ポートへ移り、占有プロセスを終了しないことを確認。
- APIとWebに同じポートを指定した場合の分離、および標準候補ポートをすべて占有した場合のOS一時ポート利用を確認。
- MySQLプロトコルの応答と、TCP待受のみの非MySQLサービスを区別する判定を確認。
- 結果は`artifacts/fastapi/setup-existing-port-verification.json`。今回のログは`artifacts/fastapi/windows-setup-*.log`。
- 保存済みmanaged MySQLのポート再配置は、現在のユーザー領域にmanagedインスタンスがないため、この実行ではエンドツーエンド未確認です。別MySQLが保存ポートで応答するケースも未確認です。検証ハーネスには、managedインスタンスのポートを別プロセスが占有した際に同じデータディレクトリで再起動する確認を追加しました。

別PC、Visual C++ランタイムの新規導入、UAC承認は今回も実機検証していません。Windows 10/11 x64の記載は対象範囲であり、あらゆる環境での動作保証を意味しません。

## パス変更対応の確認（2026-10-08）

- 変更したPowerShell 8ファイルの構文解析、Pythonのcompileall、`scripts/api.mjs`の構文確認は成功。
- プロジェクトを別パスへ移した状態での一括setup、ショートカット起動、実MySQL接続は今回あらためて実行していない。
  したがって、別パス対応は実装済みですが、この変更後の移動シナリオをE2Eで再確認した結果ではありません。
