# EC-B01 ログインする

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Login as ログイン画面<br/>LoginPage<br/>(LoginPage.jsx)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログインの通信<br/>readSession・postAuth<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant LoginCtrl as パスワードログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant CogP as Cognito でのログイン<br/>CognitoPasswordLogin<br/>(CognitoPasswordLogin.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 共通代替フロー<br/>*a 通信に失敗した場合: 6、15、17、34 に適用<br/>*b 未ログインの場合: ログインの前なので適用しない

    User->>Header: 共通ヘッダーの「ログイン」をクリック
    Header->>App: ログインのボタンが押されたことを伝える<br/>(onPanel('login') → openHeaderPanel)
    App->>Login: URL を /account/login?returnTo=今の画面 に変え、<br/>LoginPage を表示 (login → loginPath → navigate)
    Login->>Panel: ログインの入力欄を表示 (AuthPanel、mode は login)
    Panel->>AuthJs: 画面を開いたときに自動で<br/>ログイン状態を読むよう頼む (useAuth → readSession)
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: ログイン状態をまとめるよう頼む (me → session)
    AuthSvc-->>AuthCtrl: 未ログイン (current が 401 を投げ、session が受け止める)
    AuthCtrl-->>AuthJs: 200 mode=cognito、authenticated=false
    AuthJs-->>Panel: ログイン状態
    Panel-->>User: 「ログイン」画面。「メールアドレス」「パスワード」「ログイン」、<br/>「パスワードを忘れた方・追加の本人確認」「新規登録」<br/>「招待キーで登録（店舗の担当者）」

    User->>Panel: 「メールアドレス」と「パスワード」を入力し、<br/>「ログイン」をクリック
    Panel->>Panel: 送信中にして入力欄を押せなくする<br/>(submit → setSubmitting(true))。ボタンは「ログイン中…」
    Panel->>AuthJs: メールアドレスとパスワードで<br/>ログインするよう頼む (passwordLogin)
    AuthJs->>AuthCtrl: 書き込みの前に CSRF トークンを取る<br/>GET /api/auth/csrf (postAuth → authFetch)
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>LoginCtrl: POST /api/auth/login<br/>(email、password、returnTo、CSRF トークンのヘッダー付き)
    LoginCtrl->>CogP: メールアドレスとパスワードの照合を頼む (authenticate)
    CogP->>Cog: 照合する (initiateAuth、InitiateAuth USER_PASSWORD_AUTH)
    break 7a 一致するアカウントがない
        CogP--xErrs: 401 INVALID_CREDENTIALS の例外を投げる<br/>(NotAuthorizedException か UserNotFoundException を受けて)
        Note over Errs,Panel: 結果: 401 を返し、ログインしない。<br/>画面: 7a-1「メールアドレスまたはパスワードが正しくありません。」入力はそのまま (7a-2 基本フロー 3 へ)
    end
    Cog-->>CogP: ID トークン、アクセストークン、refresh トークン
    CogP-->>LoginCtrl: 会員の情報と refresh トークン (Login)<br/>ID トークンの署名、issuer、audience、期限は toUser で確かめた
    LoginCtrl->>AuthSvc: 会員を用意するよう頼む (provision)<br/>provision 全体が 1 つのトランザクション
    AuthSvc->>Repo: issuer と subject で会員を探す<br/>(findByIssuerAndSubject、SELECT members)
    Repo-->>AuthSvc: 会員 (なければなし)
    opt 初めてのログイン
        AuthSvc->>Repo: 購入者 (USER) の会員を追加する (saveAndFlush)
        Note over AuthSvc,Db: 結果: INSERT members。会員がいるときは、メール確認日時が空なら入れる (markEmailVerified)。
    end
    LoginCtrl->>AuthSvc: 会員が使えるかを確かめる (current、SELECT members)
    break 7b 利用停止中か退会済み (enabled が偽)
        AuthSvc--xLoginCtrl: 403 ACCOUNT_DISABLED の例外を投げる (ApiException)
        Note over LoginCtrl,Panel: 結果: 認証情報を消してセッションを無効にし (clearContext、invalidate)、403 を返す。<br/>画面: 7b-1「このアカウントは利用できません。」とログインの入力欄 (入力はそのまま)
    end
    AuthSvc-->>LoginCtrl: 会員
    LoginCtrl->>LoginCtrl: セッション ID を変え、refresh トークンと認証情報をセッションに保存し、<br/>戻り先を確かめる (changeSessionId、CognitoRefreshSession.store、saveContext、AuthUrls.safeReturn)
    LoginCtrl-->>AuthJs: 200 returnTo
    AuthJs-->>Panel: 戻り先 (ログイン状態が変わったことを kusakari-auth-changed で知らせる)
    Panel->>App: 「移動しています」を出し、戻り先の画面を<br/>読み込み直す (complete → window.location.replace)
    App->>AuthCtrl: GET /api/auth/me (useAuth → readSession)<br/>SessionValidityFilter が会員を確かめ、session が組織と店舗も読む
    AuthCtrl-->>App: 200 authenticated=true、email、name、accountType など
    App-->>User: 元の画面 (戻り先がなければトップ)、<br/>共通ヘッダーに「アカウント」
```

![EC-B01 シーケンス図](<images/EC-B01_ログインする-1.png>)
