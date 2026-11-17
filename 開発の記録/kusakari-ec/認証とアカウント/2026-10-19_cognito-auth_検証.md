# Cognito認証：過去の検証記録

元の場所：kusakari-ec/docs/cognito-auth.md（コミット a9cbd69 時点）

> 2026-10-20: 通常起動の認証省略を撤去。以下の過去のデモ検証記録は現在の通常起動条件を示しません。業務試験は実Cognitoを使用します。


## 検証

`npx playwright test --config e2e/configs/playwright.custom-login.config.js`はGit対象外のEC `.env`とTerraform `.env.test-accounts`を読み、実Cognito・専用MySQL・EC/Canvas・Chromiumで成功系を確認します。資格情報を記録しないようtrace/HARは無効です。誤パスワード、CSRF欠落、ログイン前後のセッションID更新、ECからCanvasへの復帰、再読込、実庭保存、ログアウト後の編集中401、外部returnTo拒否、モバイル表示を検証します。
メールはTerraformの登録スクリプトと実User Poolで`test.user@example.com`/`test.seller@example.com`を確認済みです。既存パスワードはCognitoから取得できず、ローカル設定との比較と実認証で確認します。

`npx playwright test --config e2e/configs/playwright.auth.config.js`は実EC/FastAPI/専用MySQL/Chromiumを使用します。
未ログイン拒否・偽造セッション拒否・CSRF欠落・認証URLのPKCE/state/nonce・不正コールバック・再読み込み後の画面を確認します。
登録先には接続しないため、認証成功を模倣するAPIや仮のJWTは使用しません。
実Cognitoが作成された後、指定のテスト2利用者によるログイン・ログアウト、他人のカート/注文/庭/写真/履歴/買い物リスト拒否、担当外店舗拒否、本人商品編集、権限変更と無効化を追加確認します。
これらの成功をローカルの拒否系テストで代替しません。

## 2026-10-19の確認結果

- Terraformのfmt/validate、ECのJavaコンパイルと実行可能JAR作成、両フロントのビルド、ECの型確認/lint、Canvasのlint/コンパイルが成功しました。起動中JARの名前変更が拒否されたためJavaのパッケージ作成は検証用コピーで行い、成功したJARを元のtargetへ反映しました。通常アプリは再起動していません。
- `artifacts/auth/report.json`: 最終3件成功。実API/MySQL/Chromiumで未認証・偽造Cookie・CSRF・読取専用カタログ・認証URL・不正callback・EC/Canvas再読込を確認しました。APIモックと仮のログイン成功は使っていません。
- 購入/Canvas回帰は初回6件中4件成功。重複名に曖昧一致するテスト対象を商品IDで特定し、長いカタログの全ページ撮影を可視範囲へ変更した後、失敗2件と未設定認証1件を再実行して3件成功しました。機能の期待値は変更していません。初回は`artifacts/e2e/cart-ux-results.json`、再実行は`artifacts/e2e/shopping-regression-results.json`です。
- 認証用の専用MySQLでFlyway V8を適用しました。通常開発DBの移行、実Cognito、AWS配備、テストアカウント登録は実施していません。
- CLIプロファイル`kusakari-dev`は作成してSTS認証を確認しました。既定プロファイルは維持し、現在のCognito一覧取得には組織SCPによる明示的拒否があることを確認しています。

## 2026-10-19 AWSへの作成依頼後の確認

後続の依頼でCognito作成が許可されたため、`kusakari-dev`で4件追加のTerraform planを保存し、applyしました。
最初の`cognito-idp:CreateUserPool`がSCP `p-4ynty6tp`の明示的拒否となり、作成には失敗しました。
適用後のTerraform管理リソースは0件で、User Poolとテスト2アカウントは存在しません。実ログイン検証は未実施です。
組織ポリシーの内容確認も権限不足でした。詳細とAWSリクエストIDは`kusakari-terraform/README.md`へ記録しました。

## 2026-10-19 SCP解除後の実認証検証

- 明示承認に基づき高度な機能を有効化し、管理アカウントの一時CLI認証で東京のCognitoだけを許可しました。User Poolは`ap-northeast-1_HvkWp5qwE`、クライアントは`1pmnu6u8nh1g4o63e7t0tjlu5m`です。
- 通常開発DBをバックアップし、Flyway V8を適用しました。既存の商品の件数46、カート件数87を事前確認し、既存データは削除していません。
- `test.user@example.com`をUSER、`test.seller@example.com`をSELLER/店舗1としてCognitoとEC DBに登録しました。パスワードは利用者が指定した開発用の値を使用し、記録・成果物には含めません。
- Chromeの実Cognito Managed Loginから両者のログインが成功しました。ECの実APIが異なる会員ID、USER/SELLER、担当店舗1を返します。利用者の再読み込み後の認証維持も確認しました。
- USERから出店者APIはFORBIDDEN、SELLERから店舗1は商品31件取得、店舗2はFORBIDDENでした。CanvasでUSERの庭を作成・保存・再読み込みし、SELLERの同じ庭へのアクセスは404、庭一覧は空でした。
- ログアウト後にECはauthenticated=false、Canvasの庭取得は401でした。既存の拒否系テストと区別して、実AWS成功系の証跡を保存しました。
- ログアウトボタンに処理中表示と二重押下防止を追加しました。ECのtypecheck/lint/フロントbuild/Java packageは成功しました。
- 全APIの認可監査、実決済、本番公開、費用閾値到達時の自動制限発動は今回の実認証検証と区別します。費用制御は利用者が「通知と自動制限」を採用し、年10 USD予算・8 USDでの書込制限を設定済みです。年3,000円の絶対上限ではありません。

## 2026-10-20 EC専用ログインページの確認

- Terraformは既存クライアント1件だけを更新しました。作成・削除は0件、適用後のplanは差分なしでした。既存アカウントのメール/パスワード/権限は変更していません。
- 実Cognito・専用MySQL・Chromiumの`e2e/configs/playwright.custom-login.config.js`は2件成功しました。EC独自フォーム、誤パスワード、ログインCSRF、セッションID更新、Canvas復帰、画面からの庭作成、再読込、実庭JSON、ログアウト後の401転送、外部returnTo拒否を確認しました。`artifacts/custom-login/report.json`、`garden.json`、再読込後の画面を証跡とし、trace/HARは作成していません。
- `e2e/configs/playwright.auth.config.js`は5件成功しました。公開カタログ、個人データ拒否、偽造Cookie/CSRF、従来のPKCEと不正callback拒否、ECログインのレスポンシブ表示、Canvas一覧/庭の直接URL/モデルプレビューからECへの自動転送を確認しました。
- 通常の5186/5173環境でも、USERとSELLER/店舗1で独自ログインAPI・共有セッション・Canvas庭一覧・ログアウトの実応答を確認しました。EC APIは更新後の実行可能JARで再起動しています。
- ECのtypecheck/lint/フロントbuild、Javaのclean package、Canvasのlint/フロントbuild/API lint/APIコンパイルは成功しました。Canvasの既存`e2e/tsconfig.json`による全体型確認は、既存テストのNodeNext import拡張子と宣言不足等で失敗しており、成功として扱いません。
- Windowsの設定読込でCognito profile/issuer/client/domainを受け付けるようにしました。今回の起動確認はAPI/HTTPと実認証で、SysOverRay全操作の再検証とは区別します。
