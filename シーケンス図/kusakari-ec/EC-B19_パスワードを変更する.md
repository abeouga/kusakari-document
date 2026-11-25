# EC-B19 パスワードを変更する

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as 画面の切り替え<br/>(App.jsx)
        participant Work as アカウント画面のサイドバー<br/>(Workspace.jsx)
        participant Acct as アカウント画面<br/>(AccountPage.jsx)
        participant Form as パスワード変更の入力欄<br/>(AccountSecurity.jsx)
        participant Hook as 取得と書き込み<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
        participant AuthJs as 認証の通信<br/>(auth.js)
        participant Login as ログイン画面<br/>(LoginPage.jsx)
        participant Flash as 完了のお知らせ<br/>(SessionNotice.jsx)
        participant Panel as ログインのカード<br/>(AuthPanel.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>(AuthController.java)
        participant PwCtrl as パスワードAPI<br/>(PasswordLoginController.java)
        participant Errs as エラーの応答<br/>(ApiErrors.java)
        participant Auth as ログイン中の会員<br/>(AuthService.java)
        participant CogP as Cognito との通信<br/>(CognitoPasswordLogin.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認) と 10 に適用<br/>*a 通信に失敗した場合: 10、29 に適用

    User->>Work: アカウント画面のサイドバー「アカウント設定」の<br/>「パスワード変更」をクリック
    Work->>Acct: アカウント画面の「パスワード変更」を表示
    Acct->>Form: パスワード変更の入力欄を表示
    Form-->>User: 「現在のパスワード」「新しいパスワード（8文字以上）」「確認用パスワード」、<br/>「変更後はログアウトします。…」、「パスワードを変更」を表示
    Acct->>Hook: ログイン状態を取得する処理を呼ぶ
    Hook->>AuthCtrl: 同左<br/>GET /api/auth/me
    AuthCtrl-->>Hook: ログイン状態を返す (この画面では使わない)

    User->>Form: 3 つの欄に入力し、「パスワードを変更」をクリック
    Form->>Http: パスワードを変える処理を呼ぶ (write)
    Http->>PwCtrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/account/password
    PwCtrl->>Auth: ログイン中の会員を取得 (current)
    Auth-->>PwCtrl: 会員を返す
    PwCtrl->>CogP: パスワードを変える処理を呼ぶ (changePassword)
    CogP->>Cog: 現在のパスワードでログインし直して確かめる (InitiateAuth)
    break 8a 現在のパスワードが正しくない場合
        CogP--xErrs: 400 CURRENT_PASSWORD_INVALID の例外を投げる
        Note over Errs,Form: 「現在のパスワードが正しくありません。」を表示し、入力は残す。
    end
    Cog-->>CogP: ID トークンとアクセストークンを返す
    CogP->>CogP: ID トークンが、ログイン中の会員のものかを確かめる
    CogP->>Cog: パスワードを変える (ChangePassword)
    Cog-->>CogP: 変えたことを返す
    CogP-->>PwCtrl: 変えたことを返す
    PwCtrl->>PwCtrl: セッションを無効にし、ログイン状態を消す
    PwCtrl-->>Http: 変えたことを返す
    Http-->>Form: 変えたことを返す
    Form->>App: ログイン画面を読み込み直す
    App->>Login: ログイン画面を表示
    Login->>Flash: 完了のお知らせを読む (flashNotice)
    Login->>Panel: ログインのカードを表示
    Panel->>AuthJs: ログイン状態を読む処理を呼ぶ (readSession)
    AuthJs->>AuthCtrl: バックエンドのAPIを叩く<br/>GET /api/auth/me
    AuthCtrl-->>AuthJs: 未ログインであることを返す
    Panel-->>User: 「パスワードを変更しました。新しいパスワードでログインしてください。」と、<br/>メールアドレス、パスワードの欄と「ログイン」を表示
```

![EC-B19 シーケンス図](<images/EC-B19_パスワードを変更する-1.png>)
