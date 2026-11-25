# EC-B20 パスワードを再設定する

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

    Note over User,Cog: 共通代替フロー<br/>*a 通信に失敗した場合: 6、14、20、22、ログインした後のコールバックの 26 に適用

    User->>Header: 「メイン」画面の共通ヘッダーの「ログイン」をクリック
    Header->>App: ログインのボタンが押されたことを伝える<br/>(onPanel('login') → openHeaderPanel)
    App->>Login: 今の画面の URL を returnTo に入れて、URL を /account/login?returnTo=… に変え、<br/>LoginPage を表示 (login → loginPath → navigate)。ページは読み込み直さない
    Login->>Panel: ログインの入力欄を表示 (AuthPanel)
    Panel->>AuthJs: 画面を開いたときに自動で<br/>ログイン状態を読む (useAuth → readSession)<br/>LoginPage の useAuth も同じ通信を送る
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: ログイン状態をまとめるよう頼む (me → session)<br/>認証情報が無いので current が 401 を投げ、session が受け止める
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
    Urls-->>AuthCtrl: 戻り先 (EC と Canvas のオリジン以外、/account/login、/api/auth/ は<br/>EC の「/」に換える)。セッションの AUTH_RETURN_TO に保存する (login)
    AuthCtrl-->>Browser: 302 /api/auth/authorize/cognito
    Browser->>Sec: GET /api/auth/authorize/cognito
    Sec-->>Browser: 認可要求 (PKCE、state、nonce) を作ってセッションに保存し<br/>(DefaultOAuth2AuthorizationRequestResolver、withPkce)、<br/>302 KUSAKARI_COGNITO_DOMAIN の /oauth2/authorize
    Browser->>Cog: GET /oauth2/authorize
    Cog-->>User: 認証サービスの画面 (Managed Login のサインインの画面)
    User->>Cog: 認証サービスの画面でパスワードの再設定へ進み、<br/>メールアドレス、届いた確認コード、新しいパスワードと確認用を入力して送る<br/>(基本フロー 5〜15、代替フロー 8a・9a・10a・15a。Cognito の画面の中)
    Cog-->>User: 認証サービスの画面の表示 (基本フロー 16。<br/>完了の表示か、ログインの画面かは確かめていない)

    opt ユースケースの後 利用者が Cognito の画面でログインした (記述なし)
        Browser->>Sec: Cognito の 302 で戻る GET /api/auth/callback/cognito (code と state)
        Note over Browser,Cog: 結果: 認可コードをトークンに換え、会員を確かめてセッションを作り (oauth2Login、successHandler)、AUTH_RETURN_TO の戻り先へ 302。<br/>画面: 戻り先の画面 (ログイン状態)。失敗したときは /account/login?auth=failed で「認証が完了しませんでした。もう一度ログインしてください。」
    end
```

![EC-B20 シーケンス図](<images/EC-B20_パスワードを再設定する-1.png>)
