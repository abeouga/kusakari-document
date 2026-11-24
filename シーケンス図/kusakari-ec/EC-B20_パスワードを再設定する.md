# EC-B20 パスワードを再設定する

- ユースケース記述: [EC-B20_パスワードを再設定する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B20_パスワードを再設定する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
パスワードの再設定は、Amazon Cognito の Managed Login の画面で行います。EC のコードが受け持つのは、「ログイン」画面のリンクから Cognito の認可の画面（`/oauth2/authorize`）へ送り出すところまでと、Cognito の画面でログインした後に戻ってくるところです。メールアドレスの入力、確認コードの送信と照合、新しいパスワードの保存（基本フロー 5〜16、代替フロー 8a・9a・10a・15a）は Cognito の中の処理で、EC のコードには呼び出しがありません。図ではその部分を、利用者と Cognito の間の 2 本の矢印（29・30）だけにしています。この 2 本はコードではなく、ユースケース記述と Cognito の画面に合わせて書いたものです。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Login as ログイン画面<br/>LoginPage<br/>(LoginPage.jsx)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログインの通信<br/>login・readSession<br/>(auth.js)
        participant Browser as ブラウザー<br/>ページの移動<br/>(AuthPanel.jsx の a 要素)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Sec as 認証画面との連携<br/>oauth2Login<br/>(AuthConfiguration.java)
        participant Urls as 戻り先の確認<br/>AuthUrls<br/>(AuthUrls.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito<br/>Managed Login
    end

    Note over User,Cog: 共通代替フロー<br/>*a 通信に失敗した場合: 8、17、24、27、32、33 に適用

    User->>Header: 「メイン」画面の共通ヘッダーの「ログイン」をクリック
    Header->>App: ログインのボタンが押されたことを伝える<br/>(onPanel('login') → openHeaderPanel)
    App->>AuthJs: ログイン画面へ移るよう頼む (login)
    AuthJs->>App: 今の画面の URL を returnTo に入れて、URL を<br/>/account/login?returnTo=… に変える (loginPath → navigate、navigation.js)。<br/>ページは読み込み直さない
    App->>Login: path が /account/login なので LoginPage を表示
    Login->>Panel: ログインの入力欄を表示 (AuthPanel)
    Panel->>AuthJs: 画面を開いたときに自動で<br/>ログイン状態を読む (useAuth → readSession)<br/>LoginPage の useAuth も同じ通信を送る
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: ログイン状態をまとめるよう頼む (me → session)
    AuthSvc->>AuthSvc: ログイン中の会員を確かめる (current)。<br/>認証情報が無いので 401 を投げ、session が受け止める
    AuthSvc-->>AuthCtrl: 未ログイン (SessionView、authenticated=false)
    AuthCtrl-->>AuthJs: 200 mode=cognito、authenticated=false
    AuthJs-->>Panel: ログイン状態
    Panel-->>User: 「ログイン」画面。メールアドレスとパスワードの欄、「ログイン」、<br/>「パスワードを忘れた方・追加の本人確認」のリンク

    User->>Panel: 「パスワードを忘れた方・追加の本人確認」をクリック
    Panel->>Browser: a 要素のリンクでページごと移る<br/>(href は /api/auth/login?managed=true&returnTo=…)
    Browser->>AuthCtrl: GET /api/auth/login?managed=true&returnTo=…
    AuthCtrl->>AuthSvc: Cognito を使う設定かを確かめる (enabled)
    AuthSvc-->>AuthCtrl: 使う (mode が cognito)
    AuthCtrl->>Urls: 戻り先を確かめる (safeReturn)
    Urls-->>AuthCtrl: 戻り先 (EC と Canvas のオリジン以外、<br/>/account/login、/api/auth/ は EC の「/」に換える)
    AuthCtrl->>AuthCtrl: 戻り先をセッションの AUTH_RETURN_TO に保存 (login)
    AuthCtrl-->>Browser: 302 /api/auth/authorize/cognito
    Browser->>Sec: GET /api/auth/authorize/cognito
    Sec->>Sec: 認可要求 (PKCE、state、nonce) を作り、セッションに保存<br/>(DefaultOAuth2AuthorizationRequestResolver、withPkce)
    Sec-->>Browser: 302 KUSAKARI_COGNITO_DOMAIN の /oauth2/authorize
    Browser->>Cog: GET /oauth2/authorize
    Cog-->>User: 認証サービスの画面 (Managed Login のサインインの画面)
    User->>Cog: 認証サービスの画面でパスワードの再設定へ進み、<br/>メールアドレス、届いた確認コード、新しいパスワードと確認用を入力して送る<br/>(基本フロー 5〜15、代替フロー 8a・9a・10a・15a。Cognito の画面の中)
    Cog-->>User: 認証サービスの画面の表示 (基本フロー 16。<br/>完了の表示か、ログインの画面かは確かめていない)

    opt ユースケースの後 利用者が Cognito の画面でログインした
        Cog-->>Browser: 302 /api/auth/callback/cognito (code と state)
        Browser->>Sec: GET /api/auth/callback/cognito
        Sec->>Cog: 認可コードをトークンに換え、会員を確かめてセッションを作る<br/>(oauth2Login、successHandler。流れは EC-B01 の図の 35 と、その後の Note と同じ)
        Sec-->>Browser: 302 AUTH_RETURN_TO の戻り先、<br/>または /account/login?auth=failed
        Browser-->>User: 戻り先の画面 (ログイン状態)、または<br/>「認証が完了しませんでした。もう一度ログインしてください。」
    end
```

## 共通代替フローを直接書いた図

上の図の、ログイン画面を開いたときの `GET /api/auth/me` と、リンクをクリックした後のページの移動に、この画面で起こる共通代替フロー（\*a）を書き込んだ図です。ログインの前のユースケースなので、\*b（未ログインの場合）は適用しません。Cognito の画面の中（上の図の 29・30）で通信に失敗したときの表示は Cognito の画面によるもので、EC のコードでは確かめられないので描いていません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログインの通信<br/>login・readSession<br/>(auth.js)
        participant Browser as ブラウザー<br/>ページの移動<br/>(AuthPanel.jsx の a 要素)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Sec as 認証画面との連携<br/>oauth2Login<br/>(AuthConfiguration.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito<br/>Managed Login
    end

    User->>Panel: 共通ヘッダーの「ログイン」をクリック<br/>(上の図の 1〜6 でログイン画面を表示)
    Panel->>AuthJs: ログイン状態を読む (useAuth → readSession)
    alt *a GET /api/auth/me が届かない
        AuthJs-xAuthCtrl: GET /api/auth/me
        AuthJs--xPanel: fetch の例外 (TypeError) をそのまま投げる (useAuth の error)
        Panel-->>User: *a-1 ブラウザーが作る例外の文だけを表示<br/>(リンクも「再取得」も出ない)
    else *a 200 以外の応答 (403 を除く)
        AuthJs->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>AuthJs: 200 以外の応答
        AuthJs--xPanel: エラーを投げる (readSession)
        Panel-->>User: *a-1「ログイン状態を確認できません。」だけを表示
    else 読めた
        AuthJs->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>AuthJs: 200 mode=cognito、authenticated=false
        AuthJs-->>Panel: ログイン状態
        Panel-->>User: 「パスワードを忘れた方・追加の本人確認」のリンク
        User->>Panel: リンクをクリック
        Panel->>Browser: ページごと移る (a 要素の href)
        alt *a GET /api/auth/login か GET /api/auth/authorize/cognito が届かない
            Browser-xAuthCtrl: GET /api/auth/login?managed=true&returnTo=…<br/>(またはその後の GET /api/auth/authorize/cognito)
            Browser-->>User: *a-1 ブラウザーのエラーの画面
        else *a Cognito の /oauth2/authorize が届かない
            Browser->>AuthCtrl: GET /api/auth/login?managed=true&returnTo=…
            AuthCtrl-->>Browser: 302 /api/auth/authorize/cognito
            Browser->>Sec: GET /api/auth/authorize/cognito
            Sec-->>Browser: 302 Cognito の /oauth2/authorize
            Browser-xCog: GET /oauth2/authorize
            Browser-->>User: *a-1 ブラウザーのエラーの画面
        else 届いた
            Browser->>AuthCtrl: GET /api/auth/login?managed=true&returnTo=…
            AuthCtrl-->>Browser: 302 /api/auth/authorize/cognito
            Browser->>Sec: GET /api/auth/authorize/cognito
            Sec-->>Browser: 302 Cognito の /oauth2/authorize
            Browser->>Cog: GET /oauth2/authorize
            Cog-->>User: 認証サービスの画面 (上の図の 28 以降)
        end
    end
    opt *a-3 やり直す
        User->>Browser: ブラウザーで再読み込みするか、戻ってもう一度リンクをクリック<br/>(画面にやり直しのボタンは無い。基本フロー 2 か 3 へ戻る)
    end
```

## ユースケース記述との差

- 5〜16: 再設定の画面と処理はすべて Cognito の Managed Login にあり、EC のコードには呼び出しがありません。図はこの部分を、利用者と Cognito の間の 2 本の矢印だけにしています。代替フロー 8a・9a・10a・15a も Cognito の画面の中で、EC のコードには分岐がないので `alt` にしていません。
- 3〜4: リンクの先は Cognito の認可の画面（`/oauth2/authorize`）で、再設定の画面へ直接は移りません。このリンクは EC-B01 の代替フロー 7d（追加の本人確認）と同じものです。記述の 5 のとおり、利用者が Cognito の画面で再設定へ進みます。
- コードにあって記述にない入口が 2 つあります。どちらも同じ Managed Login へ移ります。
  - `/account/reset` の画面の「Cognitoでパスワードを再設定」リンク（`returnTo` は `/account`）。未ログインでも開けますが、サイドバーには出ません（`Workspace.jsx` の `accountSettings` が外しています）。
  - `GET /api/auth/reset`。`/api/auth/login?managed=true` へ転送します（`returnTo` が無いので、戻り先は EC の「/」）。この URL を開く画面はありません。
- コードにあって記述にない続きがあります。再設定のあと Cognito の画面でログインすると、`/api/auth/callback/cognito` に戻り、EC のセッションを作って、ヘッダーの「ログイン」を押した画面（`AUTH_RETURN_TO`）へ戻ります。失敗すると `/account/login?auth=failed` で「認証が完了しませんでした。もう一度ログインしてください。」と出ます。記述は 16 で終わります。流れは [EC-B01 ログインする](<EC-B01_ログインする.md>) の図の代替フロー 7d-4 と同じです。
- Cognito を使わない設定（`kusakari.auth.mode` が `demo`、隔離した試験だけ）では、ログイン画面は「Cognitoが未設定のため、ログイン・新規登録は利用できません。」だけを出し、リンクがありません。`GET /api/auth/login` も 503 を返します。通常の起動では Cognito が必須なので、図には書いていません。
- 共通代替フロー \*a: ログイン画面を開いたときの `GET /api/auth/me` は `api.js` を通らないので、00 の \*a-1 の共通の文にならず、`readSession()` の文かブラウザーが作る文だけが出ます。リンクをクリックした後はページごと移るので、届かないときはブラウザーのエラーの画面になります。どちらも、やり直しは再読み込みか、戻ってもう一度クリックすることです。

## 確かめられなかったこと

- 基本フロー 5〜16 の画面の動きと文言は、Cognito の Managed Login と User Pool の設定で決まり、EC のコードでは確かめられません。EC の `docs/functional-requirements.md` も、パスワードリセットを「認証画面へ誘導・メール受信を含む成功系未検証」としています。
- EC の `infra/cognito/kusakari-ec-terraform/main.tf` には、メールでの回復（`account_recovery_setting` の `verified_email`）、存在しない利用者のエラーを隠す設定（`prevent_user_existence_errors = "ENABLED"`）、8 文字以上で文字の種類を問わないパスワードの条件、`managed_login_version = 2` が書かれています。ただし実際の User Pool は kusakari-terraform で管理しており、その設定は確かめていません。9a（登録されていないメールアドレスでも同じ確認コードの入力画面を出す）と 15a（パスワードの条件）が記述どおりになるかは、この設定によります。
- 10a の確認コードの有効期限と文言は、Cognito の仕様によります。確かめていません。
- 16 のあと、Cognito がログインの画面と完了メッセージを出すのか、そのままログインして EC へ戻すのかは、確かめていません。
- コールバックで Spring Security が Cognito の `/oauth2/userInfo` を呼ぶかどうかは、Spring Security の中の処理で、確かめていません（`AuthConfiguration` は `userInfoUri` を設定しています）。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/packages/site-header/KusakariHeader.jsx): 未ログインのときの「ログイン」ボタン（`panelAction`）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `openHeaderPanel`、`/account/login` で `LoginPage` を返す条件
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `login`、`loginPath`、`readSession`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/LoginPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/LoginPage.jsx): `LoginPage`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `returnTo`、「パスワードを忘れた方・追加の本人確認」のリンク、`mode` が `demo` のときの表示、`auth=failed` の表示
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/AccountPage.jsx): `/account/reset` の「Cognitoでパスワードを再設定」
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `accountSettings`、未ログインでも開ける `/account/reset`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`login`（`managed=true`）、`reset`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `enabled`、`session`、`current`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java): `safeReturn`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `cognitoClients`（`authorizationUri`、`redirectUri`、`userInfoUri`）、`cognitoSecurity`（`withPkce`、`successHandler`、`failureHandler`）
- [infra/cognito/kusakari-ec-terraform/main.tf](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/infra/cognito/kusakari-ec-terraform/main.tf): `password_policy`、`account_recovery_setting`、`prevent_user_existence_errors`、`managed_login_version`
- [docs/cognito-auth.md](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/docs/cognito-auth.md): パスワードの再設定に Managed Login を使う決定（PKCE、state、nonce）
- [docs/functional-requirements.md](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/docs/functional-requirements.md): パスワードリセットの検証の状況
