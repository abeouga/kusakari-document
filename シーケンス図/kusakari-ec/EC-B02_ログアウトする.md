# EC-B02 ログアウトする

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Acct as アカウント情報画面<br/>AccountPage<br/>(AccountPage.jsx)
        participant Panel as アカウント情報とログアウト<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログインの通信<br/>readSession・logout<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Sec as ログアウトの設定<br/>cognitoSecurity の logout<br/>(AuthConfiguration.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 共通代替フロー<br/>*b 未ログインの場合: 5 (アカウント情報画面を開いたときのログインの確認) と 18 に適用<br/>*a 通信に失敗した場合: 5、18、20、23、25 に適用

    User->>Header: 共通ヘッダーの「アカウント」をクリック (EC-C01)
    Header->>App: リンク先を伝える (follow → onNavigate)
    App->>Work: URL を /account に変え (navigateFromHeader → navigate)、<br/>Workspace を表示
    Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)<br/>トップなど Workspace 以外の画面から来たときに送る
    AuthJs->>AuthCtrl: GET /api/auth/me<br/>SessionValidityFilter が会員を確かめる (ID トークンの期限が切れていれば先に更新する)
    AuthCtrl->>AuthSvc: ログイン状態をまとめるよう頼む (me → session)
    AuthSvc->>Db: 会員を読み、種類に応じて組織と店舗も読む<br/>(current、organizationIdOf、storeIdsOf)
    Db-->>AuthSvc: 会員、組織、店舗の行
    AuthSvc-->>AuthCtrl: ログイン中 (SessionView、authenticated=true)
    AuthCtrl-->>AuthJs: 200 authenticated=true、email、name、accountType など
    AuthJs-->>Work: ログイン状態
    Work->>Acct: サイドバーの「マイページ」「アカウント設定」と、<br/>アカウント情報画面を表示 (AccountPage、tab は「アカウント情報」)
    Acct->>Panel: アカウント情報とログアウトのボタンを表示 (AuthPanel)<br/>AccountPage の useResource と AuthPanel の useAuth も GET /api/auth/me を送る (流れは 5〜10 と同じ)
    Panel-->>User: 「アカウント情報」画面。名前 (なければメールアドレス)、<br/>アカウントの種類 (「管理者」「出店者（オーナー）」など。購入者は「利用者」)、<br/>「ログアウト」

    User->>Panel: 「ログアウト」をクリック
    Panel->>Panel: エラーの文を消し、ボタンを「ログアウト中…」にして<br/>押せなくする (setFailure('')、setLoggingOut(true))
    Panel->>AuthJs: ログアウトするよう頼む (logout)
    AuthJs->>AuthCtrl: 書き込みの前に CSRF トークンを取る<br/>GET /api/auth/csrf (authFetch。SessionValidityFilter の確認は 5 と同じ)
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Sec: POST /api/auth/logout (CSRF トークンのヘッダー付き)
    Sec->>Sec: CSRF トークンを確かめ、HTTP セッションを無効にし、<br/>KUSAKARI_SESSION の Cookie を消す (logoutUrl、deleteCookies)
    Sec-->>AuthJs: 200 logoutUrl (logoutSuccessHandler → AuthUrls.logout が<br/>Cognito の /logout?client_id=…&logout_uri=EC の「/」を作る)
    AuthJs->>Cog: Cognito のログアウト用の URL へページごと移る<br/>GET /logout?client_id=…&logout_uri=… (window.location.assign)
    Cog-->>App: 302 EC の「/」(logout_uri)。トップを最初から表示する
    App->>AuthCtrl: GET /api/auth/me (useAuth → readSession)
    AuthCtrl-->>App: 200 authenticated=false<br/>(認証情報が無いので、session が未ログインと返す)
    App-->>User: 「メイン」画面 (トップ)、共通ヘッダーに「ログイン」
```

![EC-B02 シーケンス図](<images/EC-B02_ログアウトする-1.png>)
