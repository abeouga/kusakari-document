# EC-B01 ログインする

- ユースケース記述: [EC-B01_ログインする](<../../アーカイブ/ユースケース/kusakari-ec/EC-B01_ログインする.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

ログインは EC の画面（`/account/login`）でメールアドレスとパスワードを受け取り、EC API が Amazon Cognito の `InitiateAuth` を呼びます。ブラウザーは Cognito と直接通信しません（代替フロー 7d の認証画面だけは例外です）。ブラウザーに渡すのは `KUSAKARI_SESSION` の Cookie だけで、トークンはサーバーの HTTP セッションに置きます。

## 概要図

### 概要図 1 基本フロー 1〜8

```mermaid
sequenceDiagram
    actor User as 利用者
    participant Page as ログイン画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant Idp as Amazon Cognito

    Note over User,Idp: 基本フロー 1〜2 ログイン画面を開く
    User->>Page: 共通ヘッダーの「ログイン」をクリック
    Page->>Page: /account/login?returnTo=元の画面 に切り替える<br/>(ページは読み込み直さない)
    Page->>Api: GET /api/auth/me
    alt 確認できた
        Api->>Api: セッションが無いので未ログインとして返す<br/>(DB は読まない)
        Api-->>Page: 200 authenticated=false
        Page-->>User: 「メールアドレス」「パスワード」「ログイン」<br/>「新規登録」などの入口
    else *a 確認できない
        Api--xPage: 200 以外の応答、または通信の失敗
        Page-->>User: 「ログイン状態を確認できません。」など
    end

    Note over User,Idp: 基本フロー 3〜6 入力して「ログイン」をクリックする
    User->>Page: メールアドレスとパスワードを入力し<br/>「ログイン」をクリック
    alt 6a 未入力の欄がある
        Page-->>User: ブラウザーが未入力の欄に入力を求める<br/>(通信しない)
    else 入力されている
        Page->>Api: GET /api/auth/csrf
        Api-->>Page: 200 CSRF の確認情報
        Note over User,Idp: 基本フロー 7 メールアドレスとパスワードを照合する
        Page->>Api: POST /api/auth/login<br/>email、password、returnTo
        Api->>Idp: InitiateAuth (USER_PASSWORD_AUTH)
        alt 7a 一致するアカウントがない
            Idp-->>Api: NotAuthorizedException<br/>または UserNotFoundException
            Api-->>Page: 401 INVALID_CREDENTIALS
            Page-->>User: 「メールアドレスまたはパスワードが<br/>正しくありません。」
        else 7c メールアドレスの確認が済んでいない
            Idp-->>Api: UserNotConfirmedException
            Api-->>Page: 409 EMAIL_NOT_CONFIRMED
            Page-->>User: 確認コードの入力欄 (概要図 2 の 7c へ)
        else 7d 追加の本人確認やパスワードの変更が必要
            Idp-->>Api: ChallengeName のある応答<br/>または PasswordResetRequiredException
            Api-->>Page: 409 AUTH_CHALLENGE_REQUIRED
            Page-->>User: 「追加の本人確認またはパスワード変更が必要です。<br/>認証画面で手続きを完了してください。」など<br/>(概要図 2 の 7d へ)
        else 7e 短時間にログインを繰り返し失敗した
            Idp-->>Api: TooManyRequestsException
            Api-->>Page: 429 AUTH_RATE_LIMITED
            Page-->>User: 「試行回数が多すぎます。<br/>時間をおいて再試行してください。」
        else *a Cognito に接続できない
            Idp--xApi: 接続できない、または想定外のエラー
            Api-->>Page: 503 AUTH_UNAVAILABLE
            Page-->>User: 「認証サービスに接続できません。<br/>時間をおいて再試行してください。」など
        else 照合できた
            Idp-->>Api: ID トークン、アクセストークン、更新トークン
            Api->>Api: ID トークンの署名、issuer、audience を確かめる
            Api->>Db: 会員を issuer と subject で検索
            Db-->>Api: 会員の行 または なし
            alt 会員がいる
                Api->>Db: メール確認日時が空なら入れる (UPDATE)
                Db-->>Api: 完了
            else 初めてのログイン
                Api->>Db: 購入者 (USER) の会員を追加 (INSERT)
                Db-->>Api: 完了
            end
            Api->>Db: 会員を読み、利用できるかを確かめる
            Db-->>Api: 会員の行
            alt 7b 利用停止中または退会済み
                Api->>Api: 認証情報を消し、セッションを無効にする
                Api-->>Page: 403 ACCOUNT_DISABLED
                Page-->>User: 「このアカウントは利用できません。」
            else 利用できる
                Api->>Api: セッション ID を変え、更新トークンを<br/>セッションに保存し、CSRF の確認情報を作り直す
                Api-->>Page: 200 returnTo (確かめた戻り先)
                Note over User,Idp: 基本フロー 8 ログイン状態にして元の画面を表示する
                Page->>Page: returnTo の画面を読み込み直す
                Page->>Api: GET /api/auth/me
                Api->>Db: 会員を検索
                Db-->>Api: 会員の行
                Api-->>Page: 200 authenticated=true
                Page-->>User: 元の画面またはトップ画面<br/>共通ヘッダーに「アカウント」
            end
        end
    end
```

### 概要図 2 代替フロー 7c・7d

```mermaid
sequenceDiagram
    actor User as 利用者
    participant Page as ログイン画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant Idp as Amazon Cognito

    Note over User,Idp: 代替フロー 7c 確認コードを入力して登録を完了する
    Page-->>User: 見出し「メールアドレスの確認」と「確認コード」の入力欄
    User->>Page: 確認コードを入力し「確認して登録を完了」をクリック
    Note over Page,Api: POST の前に GET /api/auth/csrf を送る (概要図 1 と同じ)
    Page->>Api: POST /api/auth/signup/confirm<br/>email、code
    Api->>Idp: ConfirmSignUp
    alt 確認コードが正しくない、または期限切れ (EC-B16 の 11a と同じ)
        Idp-->>Api: CodeMismatchException<br/>または ExpiredCodeException
        Api-->>Page: 400 CODE_MISMATCH または CODE_EXPIRED
        Page-->>User: 「確認コードが正しくありません。」など
    else 確認できた
        Idp-->>Api: 確認済みにした
        Api-->>Page: 200 confirmed=true
        Page->>Api: POST /api/auth/login<br/>画面のメモリにあるパスワードで
        Note over Api,Idp: 概要図 1 の基本フロー 7 の「照合できた」と同じ
        Api-->>Page: 200 returnTo
        Page-->>User: 元の画面 (基本フロー 8 と同じ)
    end

    Note over User,Idp: 代替フロー 7d 認証画面で手続きを完了する
    User->>Page: 「パスワードを忘れた方・追加の本人確認」をクリック
    Page->>Api: GET /api/auth/login<br/>managed=true と returnTo 付き (ページ遷移)
    Api->>Api: 戻り先をセッションに保存 (AUTH_RETURN_TO)
    Api-->>Page: 302 /api/auth/authorize/cognito
    Page->>Api: GET /api/auth/authorize/cognito
    Api-->>Page: 302 Cognito の /oauth2/authorize<br/>(PKCE、state、nonce 付き)
    Page->>Idp: GET /oauth2/authorize
    Idp-->>User: Cognito の認証画面 (Managed Login)
    User->>Idp: 追加の本人確認やパスワードの再設定を完了する
    Idp-->>Page: 302 /api/auth/callback/cognito (認可コード付き)
    Page->>Api: GET /api/auth/callback/cognito
    Api->>Idp: POST /oauth2/token (認可コードを交換する)
    alt 交換や検証に失敗した
        Idp-->>Api: エラー、または検証できないトークン
        Api-->>Page: 302 /account/login?auth=failed
        Page-->>User: 「認証が完了しませんでした。<br/>もう一度ログインしてください。」
    else トークンを受け取れた
        Idp-->>Api: ID トークン、更新トークン
        Api->>Db: 会員を検索・追加し、利用できるかを確かめる<br/>(基本フロー 7 と同じ)
        Db-->>Api: 会員の行
        alt 7b などで続けられない
            Api->>Api: セッションを無効にする
            Api-->>Page: 302 /account/login?auth=failed
            Page-->>User: 「認証が完了しませんでした。<br/>もう一度ログインしてください。」
        else 続けられる
            Api->>Api: 更新トークンをセッションに保存
            Api-->>Page: 302 保存した戻り先
            Page-->>User: 元の画面 (基本フロー 8 と同じ)
        end
    end
```

## 詳細図

### 詳細図 1 基本フロー 1〜2 ログイン画面を開く

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx
        participant App as App.jsx
        participant Auth as auth.js
        participant Login as LoginPage.jsx
        participant Panel as AuthPanel.jsx
        participant Hook as useAuth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant AuthSvc as AuthService
    end

    Note over User,AuthSvc: 基本フロー 1〜2 ログイン画面を開く
    User->>Header: 「ログイン」ボタンをクリック
    Header->>App: panelAction() のボタンが onPanel('login')
    App->>Auth: openHeaderPanel('login') が login() を呼ぶ
    Auth->>Auth: loginPath() が returnTo に<br/>今の画面の URL を入れる
    Auth-->>App: navigation.js の navigate() が pushState と popstate。<br/>usePath() が path を /account/login にする
    App->>Login: path が /account/login なので LoginPage を表示
    Login->>Panel: AuthPanel を表示 (mode は login)
    Panel->>Hook: useAuth()
    Note right of Hook: useEffect が readSession() を自動で呼ぶ。<br/>LoginPage の useAuth() も同じ要求を送る
    Hook->>Auth: readSession()
    Auth->>AuthCtrl: GET /api/auth/me
    alt 確認できた
        Note right of AuthCtrl: 未ログインなので<br/>SessionValidityFilter は何もしない
        AuthCtrl->>AuthSvc: session()
        AuthSvc->>AuthSvc: current() が 401 LOGIN_REQUIRED を投げ<br/>session() の catch が受ける
        AuthSvc-->>AuthCtrl: SessionView (authenticated=false)
        AuthCtrl-->>Auth: 200 mode=cognito、authenticated=false
        Auth-->>Hook: AuthSession
        Hook-->>Panel: session
        Note right of Panel: mode が demo (隔離した試験の設定) なら<br/>「Cognitoが未設定のため…」を出す (図では省略)
        Panel-->>User: 「メールアドレス」「パスワード」「ログイン」<br/>「パスワードを忘れた方・追加の本人確認」<br/>「新規登録」「招待キーで登録（店舗の担当者）」
    else *a 確認できない
        AuthCtrl--xAuth: 200 以外の応答、または通信の失敗
        Auth--xHook: throw Error「ログイン状態を確認できません。」
        Hook-->>Panel: error
        Panel-->>User: 「ログイン状態を確認できません。」など
    end
```

### 詳細図 2 基本フロー 3〜8、代替フロー 6a・7a・7b・7e

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as App.jsx
        participant Panel as AuthPanel.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant LoginCtrl as PasswordLogin<br/>Controller
        participant Errs as ApiErrors
        participant CogP as CognitoPassword<br/>Login
        participant AuthSvc as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 基本フロー 3〜6 入力して「ログイン」をクリックする
    User->>Panel: メールアドレスとパスワードを入力し<br/>「ログイン」をクリック
    alt 6a 未入力の欄がある
        Panel-->>User: ブラウザーが required の欄に入力を求める。<br/>submit() は呼ばれず、通信しない
    else 入力されている
        Panel->>Panel: submit(event)<br/>setSubmitting(true)
        Panel->>Auth: passwordLogin(email, password, returnTo)
        Auth->>Auth: postAuth() が authFetch() を呼ぶ
        Auth->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>Auth: 200 headerName と token
        Note over User,Idp: 基本フロー 7 メールアドレスとパスワードを照合する
        Auth->>LoginCtrl: POST /api/auth/login<br/>CSRF のヘッダー付き
        Note right of LoginCtrl: @Valid が LoginRequest を検査する。<br/>違反は ApiErrors.invalid() が<br/>400 INVALID_INPUT にする (図では省略)
        LoginCtrl->>CogP: authenticate(email.trim(), password)
        CogP->>Idp: initiateAuth() が POST /<br/>InitiateAuth (USER_PASSWORD_AUTH)
        alt 7a 一致するアカウントがない
            Idp-->>CogP: NotAuthorizedException<br/>または UserNotFoundException
            CogP--xErrs: throw ApiException(401,<br/>INVALID_CREDENTIALS)
            Errs-->>Auth: business() が 401 と message を返す
            Auth--xPanel: postAuth() が throw AuthError
            Panel-->>User: 「メールアドレスまたはパスワードが<br/>正しくありません。」
        else 7c メールアドレスの確認が済んでいない
            Idp-->>CogP: UserNotConfirmedException
            CogP--xErrs: throw ApiException(409,<br/>EMAIL_NOT_CONFIRMED)
            Errs-->>Auth: business() が 409 と code を返す
            Auth--xPanel: throw AuthError (code は EMAIL_NOT_CONFIRMED)
            Panel-->>User: 確認コードの入力欄 (詳細図 3)
        else 7d 追加の本人確認やパスワードの変更が必要
            Idp-->>CogP: ChallengeName のある応答<br/>または PasswordResetRequiredException
            CogP--xErrs: throw ApiException(409,<br/>AUTH_CHALLENGE_REQUIRED)
            Errs-->>Auth: business() が 409 と message を返す
            Auth--xPanel: throw AuthError
            Panel-->>User: 「追加の本人確認またはパスワード変更が必要です。<br/>認証画面で手続きを完了してください。」<br/>または「認証画面でメール確認または<br/>パスワード再設定を完了してください。」(詳細図 4)
        else 7e 短時間にログインを繰り返し失敗した
            Idp-->>CogP: TooManyRequestsException
            CogP--xErrs: throw ApiException(429,<br/>AUTH_RATE_LIMITED)
            Errs-->>Auth: business() が 429 と message を返す
            Auth--xPanel: throw AuthError
            Panel-->>User: 「試行回数が多すぎます。<br/>時間をおいて再試行してください。」
        else *a Cognito に接続できない
            Idp--xCogP: 接続できない、または想定外のエラー
            CogP--xErrs: throw ApiException(503,<br/>AUTH_UNAVAILABLE)
            Errs-->>Auth: business() が 503 と message を返す
            Auth--xPanel: throw AuthError
            Panel-->>User: 「認証サービスに接続できません。<br/>時間をおいて再試行してください。」など
        else 照合できた
            Idp-->>CogP: AuthenticationResult<br/>IdToken、AccessToken、RefreshToken
            CogP->>CogP: toUser(IdToken)<br/>署名、issuer、audience、token_use、期限を検証
            CogP-->>LoginCtrl: Login(user, refreshToken)
            LoginCtrl->>AuthSvc: provision(user)
            Note right of AuthSvc: @Transactional。<br/>email_verified が true でなければ<br/>403 EMAIL_UNVERIFIED
            AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
            Repo->>Db: SELECT members
            Db-->>Repo: 行 または 空
            Repo-->>AuthSvc: Optional の AuthMember
            alt 会員がいる
                AuthSvc->>AuthSvc: markEmailVerified()<br/>空なら確認日時を入れる
                Note right of AuthSvc: コミットのときに UPDATE members
            else 初めてのログイン
                AuthSvc->>Repo: saveAndFlush(購入者 USER の AuthMember)
                Repo->>Db: INSERT members
                Db-->>Repo: 完了
                Repo-->>AuthSvc: AuthMember
            end
            AuthSvc-->>LoginCtrl: 戻る
            LoginCtrl->>LoginCtrl: SecurityContext に<br/>OAuth2AuthenticationToken を入れる
            LoginCtrl->>AuthSvc: current()
            AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
            Repo->>Db: SELECT members
            Db-->>Repo: 行
            Repo-->>AuthSvc: AuthMember
            Note right of AuthSvc: 担当者 (SHOP_STAFF) は organization_members も読み、<br/>除名されていれば 403 ACCOUNT_EXPELLED
            alt 7b 利用停止中または退会済み (enabled が false)
                AuthSvc--xLoginCtrl: throw ApiException(403,<br/>ACCOUNT_DISABLED)
                LoginCtrl->>LoginCtrl: catch で clearContext() と<br/>セッションの invalidate()
                LoginCtrl--xErrs: throw error
                Errs-->>Auth: business() が 403 と message を返す
                Auth--xPanel: throw AuthError
                Panel-->>User: 「このアカウントは利用できません。」
            else 利用できる
                AuthSvc-->>LoginCtrl: AuthMember
                LoginCtrl->>LoginCtrl: changeSessionId()、<br/>CognitoRefreshSession.store()、<br/>CSRF のトークンを消す、saveContext()
                LoginCtrl->>LoginCtrl: AuthUrls の safeReturn(returnTo)
                LoginCtrl-->>Auth: 200 returnTo
                Note over User,Idp: 基本フロー 8 ログイン状態にして元の画面を表示する
                Auth->>Auth: dispatchEvent(kusakari-auth-changed)
                Note right of Auth: 表示中の useAuth() が GET /api/auth/me を<br/>送り直すが、すぐに画面を移る (図では省略)
                Auth-->>Panel: returnTo
                Panel->>Panel: complete(target)<br/>window.location.replace(target)
                Panel->>App: 元の画面を読み込み直す
                App->>Auth: useAuth() の readSession()
                Auth->>AuthCtrl: GET /api/auth/me
                Note right of AuthCtrl: SessionValidityFilter が<br/>current() で会員を確かめる
                AuthCtrl->>AuthSvc: session()
                AuthSvc->>Repo: current() の findByIssuerAndSubject()
                Repo->>Db: SELECT members
                Db-->>Repo: 行
                Repo-->>AuthSvc: AuthMember
                AuthSvc-->>AuthCtrl: SessionView (authenticated=true)
                AuthCtrl-->>Auth: 200 authenticated=true、email、accountType
                Auth-->>App: session
                App-->>User: 元の画面。KusakariHeader に「アカウント」
            end
        end
    end
```

### 詳細図 3 代替フロー 7c 確認コードを入力して登録を完了する

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Panel as AuthPanel.jsx
        participant Form as SignupForm.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SignupCtrl as SignupController
        participant Errs as ApiErrors
        participant CogS as CognitoSignup
        participant LoginCtrl as PasswordLogin<br/>Controller
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 代替フロー 7c-1 確認コードの入力欄を表示する
    Panel->>Panel: submit() の catch で code が EMAIL_NOT_CONFIRMED。<br/>setPending(email, password) と switchMode('confirm')
    Panel->>Form: SignupForm (step は confirm、<br/>initialEmail と initialPassword を渡す)
    Form-->>User: 「(メールアドレス) に送信した6桁の確認コードを入力してください。」<br/>「確認コード」「確認して登録を完了」「確認コードを再送する」
    Note right of Form: ここでは確認コードを送り直さない。<br/>届いていなければ「確認コードを再送する」<br/>(EC-B16 の 11a-2 と同じ処理)

    Note over User,Idp: 代替フロー 7c-2〜7c-3 確認コードを照合する
    User->>Form: 確認コードを入力し「確認して登録を完了」をクリック
    Note right of Form: 6桁の数字でなければ pattern で<br/>ブラウザーが止める。通信しない
    Form->>Form: confirm(event) から run()
    Form->>Auth: confirmSignUp(email, code)
    Note right of Auth: postAuth() の authFetch() が<br/>先に GET /api/auth/csrf を送る
    Auth->>SignupCtrl: POST /api/auth/signup/confirm
    SignupCtrl->>CogS: confirm(email.trim(), code.trim())
    CogS->>Idp: call() が POST /<br/>ConfirmSignUp
    alt 確認コードが正しくない、または期限切れ (EC-B16 の 11a と同じ)
        Idp-->>CogS: CodeMismatchException<br/>または ExpiredCodeException
        CogS--xErrs: translate() が ApiException(400,<br/>CODE_MISMATCH または CODE_EXPIRED)
        Errs-->>Auth: business() が 400 と message を返す
        Auth--xForm: throw AuthError
        Form-->>User: 「確認コードが正しくありません。」など
    else 確認できた
        Idp-->>CogS: 成功
        CogS-->>SignupCtrl: 戻る
        SignupCtrl-->>Auth: 200 confirmed=true
        Auth-->>Form: 戻る
        Form->>Auth: passwordLogin(email, password, returnTo)
        Auth->>LoginCtrl: POST /api/auth/login
        Note over LoginCtrl,Idp: 詳細図 2 の「照合できた」と同じ
        LoginCtrl-->>Auth: 200 returnTo
        Auth-->>Form: returnTo
        Form->>Panel: onSignedIn(target) で complete(target)
        Panel-->>User: 元の画面を読み込み直す (基本フロー 8 と同じ)
    end
```

### 詳細図 4 代替フロー 7d 認証画面で手続きを完了する

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Panel as AuthPanel.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant Urls as AuthUrls
        participant Sec as Spring Security<br/>AuthConfiguration.java
        participant AuthSvc as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 代替フロー 7d-1〜7d-3 認証画面を開く
    Note right of Panel: 7d-1 の文言は<br/>詳細図 2 の 7d の枝で表示する
    User->>Panel: 「パスワードを忘れた方・追加の本人確認」をクリック
    Note right of Panel: 通常のリンク (a 要素)。<br/>ここからはページ遷移になる
    Panel->>AuthCtrl: GET /api/auth/login<br/>managed=true と returnTo 付き
    AuthCtrl->>Urls: safeReturn(returnTo)
    Urls-->>AuthCtrl: 確かめた戻り先
    AuthCtrl->>AuthCtrl: セッションの AUTH_RETURN_TO に保存
    AuthCtrl-->>Panel: 302 /api/auth/authorize/cognito
    Panel->>Sec: GET /api/auth/authorize/cognito
    Sec->>Sec: DefaultOAuth2AuthorizationRequestResolver が<br/>PKCE、state、nonce を付ける
    Sec-->>Panel: 302 Cognito の /oauth2/authorize
    Panel->>Idp: GET /oauth2/authorize
    Idp-->>User: Cognito の認証画面 (Managed Login)

    Note over User,Idp: 代替フロー 7d-4 手続きを完了して戻る
    User->>Idp: 追加の本人確認やパスワードの再設定を完了する
    Idp-->>Panel: 302 /api/auth/callback/cognito (認可コード付き)
    Panel->>Sec: GET /api/auth/callback/cognito
    Sec->>Idp: POST /oauth2/token
    Note right of Sec: oauth2Login() の標準の処理。<br/>ID トークンの検証などは図では省略
    alt 交換や検証に失敗した
        Idp-->>Sec: エラー、または検証できないトークン
        Sec->>Sec: failureHandler がセッションを無効にする
        Sec-->>Panel: 302 /account/login?auth=failed
        Panel-->>User: 「認証が完了しませんでした。<br/>もう一度ログインしてください。」
    else トークンを受け取れた
        Idp-->>Sec: ID トークン、更新トークン
        Sec->>AuthSvc: successHandler が provision(user)
        Note right of AuthSvc: 会員の検索と追加は<br/>詳細図 2 と同じ (図では省略)
        AuthSvc-->>Sec: 戻る
        Sec->>AuthSvc: current()
        AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
        Repo->>Db: SELECT members
        Db-->>Repo: 会員の行
        Repo-->>AuthSvc: AuthMember
        alt 7b などで続けられない
            AuthSvc--xSec: throw ApiException<br/>(403 ACCOUNT_DISABLED など)
            Sec->>Sec: catch でセッションを無効にし<br/>clearContext()
            Sec-->>Panel: 302 /account/login?auth=failed
            Panel-->>User: 「認証が完了しませんでした。<br/>もう一度ログインしてください。」
        else 続けられる
            AuthSvc-->>Sec: AuthMember
            Sec->>Sec: CognitoRefreshSession.store() で<br/>更新トークンをセッションに保存
            Sec->>Urls: safeReturn(AUTH_RETURN_TO)
            Urls-->>Sec: 戻り先
            Sec-->>Panel: 302 戻り先
            Panel-->>User: 元の画面 (基本フロー 8 と同じ)
        end
    end
```

## ユースケース記述との差

- 6a: 未入力の検査は React のコードではなく、入力欄の `required` でブラウザーが行います。文言はブラウザーが出すもので、記述の「入力を求める表示」に当たります。サーバーでも `LoginRequest` の `@NotBlank` が検査し、違反すると 400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」になります。
- 7b: 記述にない応答が 2 つあります。組織から除名された担当者（`SHOP_STAFF`）は 403 `ACCOUNT_EXPELLED`「このアカウントは無効化されています。組織の管理者にお問い合わせください。」です。Cognito の ID トークンでメールアドレスが確認済みでないときは、`provision()` が 403 `EMAIL_UNVERIFIED`「メール確認が必要です。」にします。
- 7b-2・7e-2: 記述は「ユースケースを終了する」ですが、画面はエラーの文言を出し、ログインの入力欄をそのまま残します。続けて入力し直せます。
- 7c: ログインの時点では確認コードを送り直しません。新規登録のときに届いたコードを入力します。コードが届いていない、または期限切れのときは「確認コードを再送する」（EC-B16 の 11a-2 と同じ処理）を使います。記述の 7c にはこの手順がありません。また、409 の文言「メールアドレスの確認が完了していません。確認コードを入力してください。」は画面に出ず、見出しが「メールアドレスの確認」に変わります。
- 7c-3: 確認コードの照合に失敗したとき（`CODE_MISMATCH`、`CODE_EXPIRED` など）の扱いは、記述の 7c にありません。コードでは EC-B16 の 11a と同じ文言を出します。
- 7d-4: 認証画面での手続きやトークンの交換に失敗したとき、`/account/login?auth=failed` に戻り「認証が完了しませんでした。もう一度ログインしてください。」と表示します。記述にない枝です。
- 共通代替フロー *a: EC API が Cognito に接続できないときは 503 `AUTH_UNAVAILABLE` になります。ブラウザーから EC API に届かないときは、`postAuth()` が例外を言い換えないため、ブラウザーが出す `TypeError` の文言がそのまま表示されます（ログアウトの `logout()` だけは日本語の文言に言い換えています）。

## 確かめられなかったこと

- Cognito が `ChallengeName` を返す条件（多要素認証、仮パスワードの変更など）と、`TooManyRequestsException` になる回数や時間は、Cognito の User Pool の設定と Cognito の仕様で決まります。このリポジトリのコードでは確かめられません。
- 存在しないメールアドレスのとき Cognito が返す例外は、User Pool の `prevent_user_existence_errors` で変わります。EC の `infra/cognito/kusakari-ec-terraform/main.tf` では `ENABLED`（`NotAuthorizedException` を返す）ですが、実際の User Pool は kusakari-terraform で管理しており、その設定は確かめていません。どちらの例外でも 401 `INVALID_CREDENTIALS` になります。
- 代替フロー 7d の認証画面（Managed Login）の中の手順は Cognito の画面で、コードでは確かめられません。
- `oauth2Login()` が `/oauth2/token` の後に行う処理（ID トークンの検証、`/oauth2/userInfo` を呼ぶかどうか、セッション ID の変更）は Spring Security の中の処理です。この図では Spring Security のソースまでは確かめていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `panelAction()`、「ログイン」ボタン、「アカウント」リンク
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `openHeaderPanel()`、`/account/login` で `LoginPage` を返す条件、`useAuth()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `login()`、`loginPath()`、`readSession()`、`authFetch()`、`postAuth()`、`passwordLogin()`、`confirmSignUp()`、`AuthError`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth()`、`kusakari-auth-changed` の受け取り
- [frontend/src/components/LoginPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/LoginPage.jsx): `LoginPage`、見出しの切り替え（`headings`）
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `submit()`、`complete()`、`switchMode()`、`auth=failed` の表示、「パスワードを忘れた方・追加の本人確認」のリンク
- [frontend/src/components/SignupForm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SignupForm.jsx): `confirm()`、`run()`、確認コードの入力欄
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`、`login()`（`managed=true`）
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `login()`、`LoginRequest`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `authenticate()`、`initiateAuth()`、`toUser()`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoRefreshSession.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoRefreshSession.java): `store()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `provision()`、`current()`、`session()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java): `markEmailVerified()`、`withdraw()`、`enabled`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findByIssuerAndSubject()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java): `safeReturn()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `cognitoClients()`、`cognitoSecurity()` の `oauth2Login()`、`successHandler`、`failureHandler`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal()`
- [backend/src/main/java/jp/kusakari/ec/auth/SignupController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SignupController.java): `confirm()`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoSignup.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoSignup.java): `confirm()`、`call()`、`translate()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`
- [infra/cognito/kusakari-ec-terraform/main.tf](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/infra/cognito/kusakari-ec-terraform/main.tf): `explicit_auth_flows`、`prevent_user_existence_errors`
- [docs/cognito-auth.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/cognito-auth.md): ログインと Managed Login の決定
