# Cognito認証：2026-10-20 時点の設計

元の場所：kusakari-ec/docs/cognito-auth.md（コミット a9cbd69 時点）

他PCへの導入は[認証セットアップ手順](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/cognito-setup.md)、公開接続設定は`config/cognito.development.json`、インフラ定義は`infra/cognito`を参照してください。以下は設計と過去の検証記録です。

## Context

従来のログイン/登録はメモリ内モックで、カートはCookie、庭は固定所有者でした。
CognitoとSpring Securityで本人確認し、ECとCanvasを同一利用者として扱います。初期実装ではAWSリソースを作成していませんでしたが、後続の明示依頼により東京に実User Poolを作成し、成功系を検証しました。

## Decision

- 通常起動はcognito profileを使用し、認証を必須とします。画面モックによるログイン・登録を認証成功として扱いません。
- 通常ログインはECの`/account/login`でメール/パスワードを入力し、CSRF保護された`POST /api/auth/login`からCognitoの`USER_PASSWORD_AUTH`を呼びます。ID tokenの署名/issuer/audience/token_use/期限/必須claimを検証して既存のSpring Securityセッションを発行し、セッションIDとCSRFを更新します。パスワードは保存せず、OAuthトークンはブラウザーへ返しません。
- 新規登録は`/account/login`の同じカード内で行います（Issue #87、[決定記録](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/decisions/2026-11-09-signup-in-login-card.md)）。CSRF保護された`POST /api/auth/signup`・`/signup/confirm`・`/signup/resend`がCognitoの`SignUp`・`ConfirmSignUp`・`ResendConfirmationCode`を呼び、確認後は通常ログインと同じ`POST /api/auth/login`でセッションを発行します。
- 再設定、追加の本人確認は従来のCognito Managed Loginを維持します。`GET /api/auth/login?managed=true`から認証コード+S256 PKCE、state、nonceを使い、Spring Securityが検証します。追加確認を通常のログイン成功として扱いません。
- ブラウザーにはHttpOnly・SameSite=Lax・Path=/の`KUSAKARI_SESSION`だけを渡します。公開用HTTPS設定ではSecure属性を付けます。OAuthトークンをlocalStorage等に保存しません。
- セッションはECプロセス内に保持し、アイドル30日で終了します。ID tokenの期限切れはCognitoのrefresh tokenで自動更新し、refresh tokenは30日で失効します。詳細は[認証の更新トークン方式](https://github.com/abeouga/kusakari-ec/blob/a9cbd69/docs/auth-token-renewal.md)を参照してください。再起動すると再ログインが必要です。複数ECタスクへの拡張・永続セッションは今回の対象外です。
- `GET /api/auth/me`はmode/authenticated/id/email/name/role/storeIdsを返します。`GET /api/auth/csrf`で得た確認情報を更新系要求のヘッダーへ付け、`POST /api/auth/logout`でローカルセッションとCognitoのブラウザーセッションを終了します。
- Canvasは受信Cookieを、設定済みECオリジンの`/api/auth/me`へ照会します。更新系は同じCSRFヘッダーを`POST /api/auth/verify`へ渡し、ECで検証します。認証確認に失敗した場合は401/403/503を返し、固定所有者へ戻しません。
- ECからCanvasへの庭照会・モデル解決も同じセッション/CSRFを転送します。認証用HTTPクライアントはリダイレクトしません。クライアントから受け取ったownerIdやユーザーヘッダーは採用しません。
- Flyway V8の`auth_members`を利用者と権限の正本にします。Cognitoのissuer+subで紐付け、通常登録はUSER固定です。メールや画面の役割選択では昇格させません。
- カートには会員IDを追加し、注文は従来のカート参照を維持します。庭の既存owner_id列にはEC会員IDを使用します。既存のデモカート・注文・庭は自動移管しません。
- 商品/店舗の閲覧以外は原則ログイン必須です。SELLERの担当店舗と商品作成者を照合し、共通の既存商品の全体編集・削除はADMINに限定します。権限はDBを都度確認し、enabled=falseで次のAPIから拒否します。
- 公開カタログの読取専用POSTである商品画像参照と資材見積は未ログインでも利用可能です。データを更新しないこの2経路だけをCSRF対象から除外し、Canvasからの商品照会を維持します。
- 管理画面の審査・会員管理等は既存の画面モックのままです。Cognitoユーザーを作成・削除する管理機能や出店申請の実処理は追加しません。

## Alternatives

ブラウザー側でJWTを管理する方式は採用しません。既存Cookie/API構成を維持し、ECを認証窓口にします。
Canvas専用User Poolや別ログインは追加しません。Terraformは隣接する`kusakari-terraform`にまとめ、共通Cognitoを1回だけ定義します。

## Consequences

Canvasの認証済みデータ操作にはECへの疎通が必要です。障害時には保存を拒否します。既存のprivate-preview境界は維持し、認証追加だけで一般公開の準備完了とは扱いません。
ローカルでは両画面のホスト名を127.0.0.1に統一します。CognitoのreturnToは設定済みEC/Canvasオリジンだけを許可します。
Canvasの未ログイン時はECの`/account/login?returnTo=...`へ自動転送し、成功後は元のCanvas画面へ戻します。Canvas内にログインフォーム/ログインボタンは置きません。編集中のAPIが401を返した場合も同じEC画面へ転送します。403/503を未ログイン扱いにはしません。
設定値とテストアカウント作成は`kusakari-terraform/README.md`を参照してください。東京の実User Poolとテスト2利用者を登録し、Git対象外`.env`に実設定を反映済みです。

