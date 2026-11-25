# EC-B16 一般アカウントを登録する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Login as ログイン画面<br/>LoginPage<br/>(LoginPage.jsx)
        participant Panel as ログインのカード<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Form as 登録の入力欄<br/>SignupForm<br/>(SignupForm.jsx)
        participant AuthJs as 認証の通信<br/>readSession・postAuth<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant SignupCtrl as 新規登録API<br/>SignupController<br/>(SignupController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Inv as 招待キーの処理<br/>StoreInvitationService<br/>(StoreInvitationService.java)
        participant CogS as Cognito への登録<br/>CognitoSignup<br/>(CognitoSignup.java)
        participant LoginCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant CogP as Cognito でのログイン<br/>CognitoPasswordLogin<br/>(CognitoPasswordLogin.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 共通代替フロー<br/>*a 通信に失敗した場合: 8、19、21、40、48、63 に適用<br/>*b 未ログインの場合: ログインの前なので適用しない

    alt 基本フロー 1 共通ヘッダーから開く
        User->>Header: 「メイン」画面の共通ヘッダーの「ログイン」をクリック
        Header->>App: ログインを開くよう伝える (onPanel('login') → openHeaderPanel)
        App->>Login: URL を /account/login?returnTo=元の URL に変え、<br/>LoginPage を表示 (login → navigate)
    else 3a-1 登録用の URL を開く
        User->>App: 店舗から受け取った登録用の URL<br/>(/account/login?invite=招待キー) を開く
        App->>Login: path が /account/login なので LoginPage を表示<br/>(invitationInUrl があるので、見出しは「招待キーで登録」)
    end
    Login->>Panel: ログインのカードを表示 (AuthPanel)
    Panel->>AuthJs: ログイン状態を読む (useAuth → readSession)<br/>LoginPage の useAuth も同じ GET を送る
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 authenticated=false<br/>(session が current の 401 を受け止める)
    Panel-->>User: 2「ログイン」画面 (メールアドレス、パスワード、「ログイン」、<br/>「新規登録」「招待キーで登録（店舗の担当者）」)。<br/>登録用の URL から開いたときは、すぐに招待キーの登録の入力欄を出す

    alt 3a 招待キーで登録する
        User->>Panel: 3a-1「招待キーで登録（店舗の担当者）」をクリック<br/>(登録用の URL から開いたときは押さない)
        Panel->>Form: 3a-2 登録の入力欄を表示 (switchMode('invite') → onModeChange、SignupForm)。<br/>見出しは「招待キーで登録」。「招待キー」の欄 (URL を開いたときはキーが入っている)
    else 新規登録
        User->>Panel: 3「新規登録」をクリック
        Panel->>Form: 4 登録の入力欄を表示 (switchMode('signup') → onModeChange、SignupForm)。<br/>見出しは「新規登録」。「企業様向け：出店を申請するアカウントとして登録する」
    end
    Form-->>User: 「メールアドレス」「パスワード（8文字以上）」「パスワード（確認）」、<br/>「企業様向け：…」か「招待キー」、「確認コードを送信」

    User->>Form: 5・6 メールアドレス、パスワード、確認用のパスワードを入力<br/>(3a-3 なら招待キーも。6a-1 企業様向けならチェックを付ける)
    User->>Form: 7「確認コードを送信」をクリック
    Form->>AuthJs: 登録を頼む (register → run → signUp)<br/>ボタンは「登録中…」
    AuthJs->>AuthCtrl: 書き込みの前に CSRF トークンを取る<br/>(postAuth → authFetch、GET /api/auth/csrf)
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>SignupCtrl: POST /api/auth/signup<br/>(email、password、confirmPassword、business、invitationKey)
    alt 招待キーなし
        SignupCtrl->>CogS: Cognito に登録するよう頼む (signUp)
    else 3a-3 招待キーがある
        SignupCtrl->>Inv: 招待キーで登録するよう頼む (register)<br/>register 全体が 1 つのトランザクション
        Inv->>Db: 招待キーの行をロックして読み、使用回数・店舗・組織を読む<br/>(lockByKeyHash、countForInvitation、findById。SELECT ... FOR UPDATE store_invitations ほか)
        break 8b 招待キーが使えない (キーが無い、取り消し済み、期限切れ、使用済み、<br/>店舗の閉鎖・停止、組織の停止)
            Inv--xErrs: 400 INVITATION_INVALID の例外を投げる (invalid)
            Note over Errs,Form: 結果: 400 を返し、Cognito には登録しない。<br/>画面: 8b-1「招待キーが無効です。期限切れ・取り消し済み・使用済みのキーは使えません。…」。入力は残る (8b-2 代替フロー 3a-3 へ)。
        end
        Inv->>CogS: Cognito に登録するよう頼む (signUp.get → signUp)
    end
    CogS->>Cog: 8 SignUp (Username と email にメールアドレス)
    break 8a Cognito が受け付けない (UsernameExistsException、InvalidPasswordException など)
        CogS--xErrs: 409 EMAIL_IN_USE、400 PASSWORD_REJECTED などの<br/>例外を投げる (call → translate)
        Note over Errs,Form: 結果: 409 か 400 を返し、登録しない (招待キーがあるときはトランザクションを取り消してキーのロックを外す)。<br/>画面: 8a-1「このメールアドレスは既に登録されています。ログインしてください。」か「パスワードが条件を満たしていません。…」など。入力は残る (8a-2 基本フロー 5 へ)。
    end
    Cog-->>CogS: 未確認のユーザーの UserSub。<br/>9 Cognito が確認コードのメールを送る
    alt 招待キーなし
        CogS-->>SignupCtrl: subject
        opt 6a-2 企業様向けの登録 (business が真)
            SignupCtrl->>Auth: 出店申請用アカウントを作るよう頼む (registerApplicant)
            Note over SignupCtrl,Db: 結果: 同じ利用者の会員がいなければ (findByIssuerAndSubject、SELECT members)、<br/>出店申請用 (SHOP_OWNER_APPLICANT) の会員を保存してコミットする (saveAndFlush、INSERT members)。
        end
    else 3a-3 招待キーがある
        CogS-->>Inv: subject
        Inv->>Db: 店舗の担当者 (SHOP_STAFF) の会員、組織への所属、店舗の担当 (ロールなし)、<br/>キーの使用記録を保存してコミットする (saveAndFlush、save、flush。<br/>members、organization_members、store_members、store_invitation_uses)
    end
    SignupCtrl-->>AuthJs: 200 { codeSent: true }
    AuthJs-->>Form: 送った
    Form->>Panel: メールアドレスとパスワードを覚え (setEmail、setPassword)、<br/>確認の段階に切り替える (onStep('confirm') → switchMode)。<br/>LoginPage の見出しは「メールアドレスの確認」(onModeChange)
    Form-->>User: 9「{メールアドレス} に送信した6桁の確認コードを入力してください。」、<br/>「確認コード」「確認して登録を完了」「確認コードを再送する」「ログインに戻る」

    User->>Form: 10・11 メールに届いた確認コードを入力し、<br/>「確認して登録を完了」をクリック
    Form->>AuthJs: 確認コードを送るよう頼む (confirm → run → confirmSignUp)<br/>ボタンは「確認中…」
    AuthJs->>SignupCtrl: POST /api/auth/signup/confirm (email、code)<br/>(先に CSRF トークンを取る。GET /api/auth/csrf)
    SignupCtrl->>CogS: 確認コードを照合するよう頼む (confirm)
    CogS->>Cog: 12 ConfirmSignUp
    Cog-->>CogS: 確認済みにした
    CogS-->>SignupCtrl: 終わった
    SignupCtrl-->>AuthJs: 200 { confirmed: true }
    AuthJs-->>Form: 確認できた
    Form->>AuthJs: 12 覚えていたパスワードでログインするよう頼む (passwordLogin)
    AuthJs->>LoginCtrl: POST /api/auth/login (email、password、returnTo)<br/>(先に CSRF トークンを取る。GET /api/auth/csrf)
    LoginCtrl->>CogP: メールアドレスとパスワードで認証するよう頼む (authenticate)<br/>Cognito の InitiateAuth USER_PASSWORD_AUTH。中身は EC-B01 の図と同じ流れ
    CogP-->>LoginCtrl: ID トークンを検証した利用者と refresh トークン (toUser)
    LoginCtrl->>Auth: 会員を用意するよう頼む (provision)
    Auth->>Repo: 会員を読む (findByIssuerAndSubject、SELECT members)
    Repo-->>Auth: 会員 (なければなし)
    alt 6a・3a で作った会員がいる
        Auth->>Db: メールの確認日時を入れてコミットする<br/>(markEmailVerified。save は呼ばない。UPDATE members)
    else 通常の登録 (会員がまだない)
        Auth->>Repo: 購入者 (USER) の会員を保存する (saveAndFlush、INSERT members)
    end
    LoginCtrl->>Auth: 会員が使えるかを確かめる (current、findByIssuerAndSubject、SELECT members)
    Auth-->>LoginCtrl: 会員
    LoginCtrl->>LoginCtrl: セッション ID を変え、refresh トークン、CSRF トークン、<br/>認証情報をセッションに保存する<br/>(changeSessionId、CognitoRefreshSession.store、saveContext)
    LoginCtrl-->>AuthJs: 200 { returnTo } (safeReturn)
    AuthJs-->>Form: 戻る先 (kusakari-auth-changed を発火)
    Form->>Panel: 戻る先を渡す (onSignedIn → complete)
    Panel->>App: 戻る先の URL を読み込み直す (window.location.replace)<br/>共通ヘッダーから来たなら元の画面、登録用の URL からなら「メイン」画面
    App->>AuthCtrl: ログイン状態を読む (useAuth → readSession)<br/>GET /api/auth/me。session が current で会員を読む
    AuthCtrl-->>App: 200 authenticated=true
    App-->>User: 12 元の画面 (共通ヘッダーに「アカウント」)
```

![EC-B16 シーケンス図](<images/EC-B16_一般アカウントを登録する-1.png>)
