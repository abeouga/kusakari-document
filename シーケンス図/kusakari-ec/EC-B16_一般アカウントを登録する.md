# EC-B16 一般アカウントを登録する

- ユースケース記述: [EC-B16_一般アカウントを登録する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B16_一般アカウントを登録する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

新規登録は、ログイン画面（`/account/login`）のカードの中で入力欄を切り替えて行います。EC API が Amazon Cognito の `SignUp`、`ConfirmSignUp`、`ResendConfirmationCode` を呼び、確認コードが通ったら EC-B01 と同じ `POST /api/auth/login` でログインします。会員（`members` の行）を作る時点は、アカウントの種類で違います。

| 登録の方法 | 会員を作る時点 | `account_type` |
| --- | --- | --- |
| 通常の登録 | 確認コードのあとのログイン（`provision()`） | `USER` |
| 企業様向けの登録（6a） | 確認コードの送信（`registerApplicant()`） | `SHOP_OWNER_APPLICANT` |
| 招待キーでの登録（3a） | 確認コードの送信（`StoreInvitationService.register()`） | `SHOP_STAFF` |

## 概要図

### 概要図 1 基本フロー 1〜9、代替フロー 3a・6a・8a・8b

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as ログイン画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant Idp as Amazon Cognito

    Note over User,Idp: 基本フロー 1〜2 ログイン画面を開く (EC-B01 の基本フロー 1〜2 と同じ)
    User->>Page: 共通ヘッダーの「ログイン」をクリック
    Page->>Api: GET /api/auth/me
    Api-->>Page: 200 authenticated=false
    Page-->>User: ログイン画面<br/>「新規登録」「招待キーで登録（店舗の担当者）」がある

    Note over User,Idp: 基本フロー 3〜4 と代替フロー 3a-1〜3a-2 登録の入力欄を表示する (通信しない)
    alt 3a 招待キーで登録する
        User->>Page: 「招待キーで登録（店舗の担当者）」をクリック<br/>または登録用の URL (invite 付き) を開く
        Page-->>User: 見出し「招待キーで登録」、入力欄と「招待キー」欄<br/>(URL を開いたときはキーを入れた状態)
    else 新規登録
        User->>Page: 「新規登録」をクリック
        Page-->>User: 見出し「新規登録」、「メールアドレス」<br/>「パスワード（8文字以上）」「パスワード（確認）」<br/>企業様向けのチェックボックス
    end

    Note over User,Idp: 基本フロー 5〜9 と代替フロー 6a・8a 確認コードを送る (招待キーなし)
    User->>Page: メールアドレス、パスワード、確認用を入力
    opt 6a 企業様向けの登録をする
        User->>Page: 「企業様向け：出店を申請するアカウントとして登録する」にチェック
    end
    User->>Page: 「確認コードを送信」をクリック
    alt 8a 未入力、メールアドレスの形式違い、8 文字未満
        Page-->>User: ブラウザーが入力を求める (通信しない)
    else ブラウザーの検査を通る
        Page->>Api: GET /api/auth/csrf
        Api-->>Page: 200 CSRF の確認情報
        Page->>Api: POST /api/auth/signup<br/>email、password、confirmPassword、business
        alt 8a 形式の違反、または確認用と一致しない
            Api-->>Page: 400 INVALID_INPUT または PASSWORD_MISMATCH
            Page-->>User: 「パスワードと確認用パスワードが一致しません。」など
        else 検査を通る
            Api->>Idp: SignUp (ユーザー名はメールアドレス)
            alt 8a Cognito が受け付けない
                Idp-->>Api: UsernameExistsException、<br/>InvalidPasswordException など
                Api-->>Page: 409 EMAIL_IN_USE、400 PASSWORD_REJECTED など
                Page-->>User: 「このメールアドレスは既に登録されています。<br/>ログインしてください。」など
            else 登録できた
                Idp-->>Api: UserSub (未確認のユーザー)
                Note right of Idp: 基本フロー 9<br/>Cognito が確認コードのメールを送る
                opt 6a 企業様向けの登録
                    Api->>Db: 出店申請用 (SHOP_OWNER_APPLICANT) の会員を追加
                    Db-->>Api: 完了
                end
                Api-->>Page: 200 codeSent=true
                Page-->>User: 「確認コード」の入力欄
            end
        end
    end

    Note over User,Idp: 代替フロー 3a-3・8b 招待キーで確認コードを送る
    User->>Page: 入力し、招待キーを入れて「確認コードを送信」をクリック
    Note over Page,Api: ブラウザーの検査、GET /api/auth/csrf、入力の検査は基本フロー 7〜8 と同じ
    Page->>Api: POST /api/auth/signup (invitationKey 付き)
    Note over Api,Db: ここから 1 つのトランザクション
    Api->>Db: 招待キーの行をロックして読む (SELECT ... FOR UPDATE)。<br/>使用回数、店舗、組織を読む
    Db-->>Api: 行
    alt 8b 招待キーが使えない
        Api-->>Page: 400 INVITATION_INVALID (Cognito には登録しない)
        Page-->>User: 「招待キーが無効です。期限切れ・取り消し済み・<br/>使用済みのキーは使えません。…」
    else 使える
        Api->>Idp: SignUp
        alt 8a Cognito が受け付けない
            Idp-->>Api: UsernameExistsException など
            Api-->>Page: 409 EMAIL_IN_USE など (DB はロールバック)
            Page-->>User: 「このメールアドレスは既に登録されています。<br/>ログインしてください。」など
        else 登録できた
            Idp-->>Api: UserSub (確認コードのメールを送る)
            Api->>Db: 担当者 (SHOP_STAFF) の会員、組織への所属、<br/>店舗の担当 (ロールなし)、招待キーの使用記録を追加
            Db-->>Api: 完了 (コミット)
            Api-->>Page: 200 codeSent=true
            Page-->>User: 「確認コード」の入力欄
        end
    end
```

### 概要図 2 基本フロー 10〜12、代替フロー 11a

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as ログイン画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant Idp as Amazon Cognito

    Note over User,Idp: 基本フロー 10〜11 と代替フロー 11a 確認コードを照合する
    User->>Page: 確認コードを入力し「確認して登録を完了」をクリック
    Note over Page,Api: POST の前には毎回 GET /api/auth/csrf を送る
    Page->>Api: POST /api/auth/signup/confirm<br/>email、code
    Api->>Idp: ConfirmSignUp
    alt 11a 確認コードが無効、または有効期限切れ
        Idp-->>Api: CodeMismatchException<br/>または ExpiredCodeException
        Api-->>Page: 400 CODE_MISMATCH または CODE_EXPIRED
        Page-->>User: 「確認コードが正しくありません。」<br/>または「確認コードの有効期限が切れています。<br/>コードを再送してください。」
        opt 11a-2 確認コードを再送する
            User->>Page: 「確認コードを再送する」をクリック
            Page->>Api: POST /api/auth/signup/resend
            Api->>Idp: ResendConfirmationCode
            Idp-->>Api: 受け付けた (確認コードのメールを送る)
            Api-->>Page: 200 codeSent=true
            Page-->>User: 「確認コードを再送しました。」
        end
    else 確認できた
        Idp-->>Api: 確認済みにした
        Api-->>Page: 200 confirmed=true
    end

    Note over User,Idp: 基本フロー 12 ログイン状態にして元の画面を表示する (確認できたときだけ)
    alt 画面のメモリにパスワードが無い
        Page-->>User: ログインの入力欄に戻す
    else パスワードがある
        Page->>Api: POST /api/auth/login<br/>email、password、returnTo
        Api->>Idp: InitiateAuth (USER_PASSWORD_AUTH)
        alt *a ログインできない
            Idp--xApi: 接続できない、または想定外のエラー
            Api-->>Page: 503 AUTH_UNAVAILABLE など
            Page-->>User: エラーの文言 (確認コードの入力欄のまま)
        else 照合できた
            Idp-->>Api: ID トークン、更新トークン
            Api->>Db: 会員を issuer と subject で検索
            Db-->>Api: 会員の行 または なし
            alt 企業様向け・招待キーで作った会員がいる
                Api->>Db: メール確認日時を入れる (UPDATE)
                Db-->>Api: 完了
            else 購入者 (会員がまだない)
                Api->>Db: 購入者 (USER) の会員を追加 (INSERT)
                Db-->>Api: 完了
            end
            Api->>Db: 会員を読み、利用できるかを確かめる
            Db-->>Api: 会員の行
            Api-->>Page: 200 returnTo
            Page->>Page: returnTo の画面を読み込み直す
            Page->>Api: GET /api/auth/me
            Api->>Db: 会員を検索
            Db-->>Api: 会員の行
            Api-->>Page: 200 authenticated=true
            Page-->>User: 元の画面 (ログイン状態)
        end
    end
```

## 詳細図

### 詳細図 1 基本フロー 1〜4、代替フロー 3a-1〜3a-2 登録の入力欄を表示する

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx
        participant App as App.jsx
        participant Auth as auth.js
        participant Login as LoginPage.jsx
        participant Panel as AuthPanel.jsx
        participant Form as SignupForm.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant AuthSvc as AuthService
    end

    Note over User,AuthSvc: 基本フロー 1〜2 ログイン画面を開く (EC-B01 の詳細図 1 と同じ)
    User->>Header: 「ログイン」をクリック
    Header->>App: onPanel('login')
    App->>Auth: openHeaderPanel('login') が login() を呼ぶ
    Auth-->>App: navigate() で /account/login?returnTo=… に切り替える
    App->>Login: LoginPage を表示
    Login->>Panel: AuthPanel を表示 (mode は login)
    Panel->>Auth: useAuth() の readSession()
    Auth->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: session()
    AuthSvc-->>AuthCtrl: SessionView (authenticated=false)
    AuthCtrl-->>Auth: 200 authenticated=false
    Auth-->>Panel: session
    Panel-->>User: ログイン画面

    Note over User,AuthSvc: 基本フロー 3〜4 と代替フロー 3a-1〜3a-2 登録の入力欄を表示する
    alt 3a 招待キーで登録する
        User->>Panel: 「招待キーで登録（店舗の担当者）」をクリック
        Note right of Panel: 登録用の URL /account/login?invite=キー を開いたときは、<br/>LoginPage と AuthPanel が invitationInUrl() で<br/>最初から mode を invite にする
        Panel->>Panel: switchMode('invite')
        Panel->>Login: onModeChange('invite')<br/>見出しを「招待キーで登録」にする
        Panel->>Form: SignupForm (step は signup、<br/>invitation は URL のキーか空文字)
        Form-->>User: 「メールアドレス」「パスワード（8文字以上）」<br/>「パスワード（確認）」「招待キー」
    else 新規登録
        User->>Panel: 「新規登録」をクリック
        Panel->>Panel: switchMode('signup')
        Panel->>Login: onModeChange('signup')<br/>見出しを「新規登録」にする
        Panel->>Form: SignupForm (step は signup、invitation は null)
        Form-->>User: 「メールアドレス」「パスワード（8文字以上）」<br/>「パスワード（確認）」<br/>「企業様向け：出店を申請するアカウントとして登録する」
    end
    Note over User,AuthSvc: 切り替えは画面の中だけで行い、通信しない。<br/>ログイン中に登録用の URL を開くと、AuthPanel が<br/>「招待キーは新規登録のときだけ使えます。…」を表示する
```

### 詳細図 2 基本フロー 5〜9、代替フロー 6a・8a（招待キーなし）

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as SignupForm.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant SignupCtrl as SignupController
        participant Errs as ApiErrors
        participant CogS as CognitoSignup
        participant AuthSvc as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 基本フロー 5〜7 と代替フロー 6a 入力して「確認コードを送信」をクリックする
    User->>Form: メールアドレス、パスワード、確認用のパスワードを入力
    opt 6a 企業様向けの登録をする
        User->>Form: 「企業様向け：出店を申請するアカウントとして登録する」にチェック
    end
    User->>Form: 「確認コードを送信」をクリック
    alt 8a 未入力、メールアドレスの形式違い、8 文字未満
        Form-->>User: ブラウザーが required、type=email、<br/>minLength=8 で入力を求める。<br/>register() は呼ばれず、通信しない
    else ブラウザーの検査を通る
        Form->>Form: register(event) から run()<br/>ボタンは「登録中…」
        Form->>Auth: signUp(email, password,<br/>confirmPassword, business, null)
        Auth->>Auth: postAuth() が authFetch() を呼ぶ
        Auth->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>Auth: 200 headerName と token
        Note over User,Idp: 基本フロー 8 入力形式とメールアドレスの重複を確かめる
        Auth->>SignupCtrl: POST /api/auth/signup<br/>CSRF のヘッダー付き
        SignupCtrl->>SignupCtrl: @Valid が SignupRequest を検査し、<br/>password と confirmPassword を比べる
        alt 8a 形式の違反、または確認用と一致しない
            SignupCtrl--xErrs: MethodArgumentNotValidException<br/>または ApiException(400, PASSWORD_MISMATCH)
            Errs-->>Auth: invalid() が 400 INVALID_INPUT、<br/>または business() が 400 PASSWORD_MISMATCH
            Auth--xForm: throw AuthError
            Form-->>User: 「パスワードと確認用パスワードが一致しません。」<br/>または「入力内容・文字数・数値の範囲を確認してください。」
        else 検査を通る
            SignupCtrl->>CogS: signUp(email, password)
            CogS->>Idp: call() が POST /<br/>SignUp (Username と email にメールアドレス)
            alt 8a Cognito が受け付けない
                Idp-->>CogS: UsernameExistsException、<br/>InvalidPasswordException など
                CogS--xErrs: translate() が ApiException<br/>(409 EMAIL_IN_USE、400 PASSWORD_REJECTED など)
                Note right of Errs: Cognito に接続できないときは<br/>503 AUTH_UNAVAILABLE (共通代替フロー *a)
                Errs-->>Auth: business() が status と message を返す
                Auth--xForm: throw AuthError
                Form-->>User: 「このメールアドレスは既に登録されています。<br/>ログインしてください。」など
            else 登録できた
                Idp-->>CogS: UserSub (未確認のユーザー)
                Note right of Idp: 基本フロー 9<br/>Cognito が確認コードのメールを送る
                CogS-->>SignupCtrl: subject
                opt 6a business が true
                    SignupCtrl->>AuthSvc: registerApplicant(issuer, subject, email)
                    Note right of AuthSvc: @Transactional
                    AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
                    Repo->>Db: SELECT members
                    Db-->>Repo: 行 または 空
                    Repo-->>AuthSvc: Optional の AuthMember
                    AuthSvc->>Repo: 無ければ saveAndFlush<br/>(SHOP_OWNER_APPLICANT の AuthMember)
                    Repo->>Db: INSERT members
                    Db-->>Repo: 完了
                    Repo-->>AuthSvc: AuthMember
                    AuthSvc-->>SignupCtrl: 戻る
                end
                Note right of SignupCtrl: 購入者はここで会員を作らない。<br/>初めてのログイン (基本フロー 12) で作る
                SignupCtrl-->>Auth: 200 codeSent=true
                Auth-->>Form: 戻る
                Form->>Form: setEmail と setPassword (メモリだけ)<br/>onStep('confirm') で AuthPanel が mode を confirm に
                Form-->>User: 「確認コード」の入力欄と<br/>「確認して登録を完了」「確認コードを再送する」
            end
        end
    end
```

### 詳細図 3 代替フロー 3a-3・8b 招待キーで確認コードを送る

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as SignupForm.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SignupCtrl as SignupController
        participant Errs as ApiErrors
        participant InvSvc as StoreInvitation<br/>Service
        participant CogS as CognitoSignup
        participant InvRepo as StoreInvitationRepository<br/>StoreInvitationUseRepository
        participant StoreRepo as StoreRepository<br/>OrganizationRepository
        participant MemRepo as AuthMemberRepository<br/>OrganizationMemberRepository<br/>StoreMemberRepository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 代替フロー 3a-3 招待キーを入れて「確認コードを送信」をクリックする
    User->>Form: メールアドレス、パスワード、確認用、招待キーを入力し<br/>「確認コードを送信」をクリック
    Note right of Form: ブラウザーの検査は詳細図 2 と同じ。<br/>招待キーは pattern (43 文字) でも検査する
    Form->>Form: register(event) から run()
    Form->>Auth: signUp(email, password,<br/>confirmPassword, false, key)
    Note right of Auth: 先に GET /api/auth/csrf を送る (詳細図 2 と同じ)
    Auth->>SignupCtrl: POST /api/auth/signup<br/>invitationKey 付き
    Note right of SignupCtrl: @Valid と PASSWORD_MISMATCH の検査は詳細図 2 と同じ。<br/>招待キーと business の両方があれば 400 INVALID_SIGNUP<br/>(画面は両方を送らない)
    SignupCtrl->>InvSvc: register(key, issuer, email, signUp)
    Note over InvSvc,Db: @Transactional (クラス全体)。Cognito の呼び出しもこのトランザクションの中
    InvSvc->>InvRepo: lockByKeyHash(hash(key))
    InvRepo->>Db: SELECT store_invitations ... FOR UPDATE
    Db-->>InvRepo: 行 または 空
    InvRepo-->>InvSvc: Optional の StoreInvitationEntity
    InvSvc->>InvRepo: countForInvitation(id)
    InvRepo->>Db: SELECT count store_invitation_uses
    Db-->>InvRepo: 件数
    InvRepo-->>InvSvc: 件数
    InvSvc->>StoreRepo: stores.findById() と organizations.findById()
    StoreRepo->>Db: SELECT stores、organizations
    Db-->>StoreRepo: 行
    StoreRepo-->>InvSvc: StoreEntity と OrganizationEntity
    alt 8b キーが無い、取り消し済み、期限切れ、使用済み、店舗の閉鎖・停止、組織の停止
        InvSvc--xErrs: invalid() の ApiException(400,<br/>INVITATION_INVALID)
        Note right of Errs: ロールバック。Cognito には登録しない
        Errs-->>Auth: business() が 400 と message を返す
        Auth--xForm: throw AuthError
        Form-->>User: 「招待キーが無効です。期限切れ・取り消し済み・<br/>使用済みのキーは使えません。…」
    else キーが使える
        InvSvc->>CogS: signUp.get() が signUp(email, password)
        CogS->>Idp: call() が POST /<br/>SignUp
        alt 8a Cognito が受け付けない
            Idp-->>CogS: UsernameExistsException など
            CogS--xErrs: translate() が ApiException<br/>(409 EMAIL_IN_USE など)
            Note right of Errs: ロールバックし、キーの行のロックを外す
            Errs-->>Auth: business() が status と message を返す
            Auth--xForm: throw AuthError
            Form-->>User: 「このメールアドレスは既に登録されています。<br/>ログインしてください。」など
        else 登録できた
            Idp-->>CogS: UserSub (確認コードのメールを送る)
            CogS-->>InvSvc: subject
            InvSvc->>MemRepo: members.findByIssuerAndSubject()<br/>(あれば invalid())
            MemRepo->>Db: SELECT members
            Db-->>MemRepo: 空
            MemRepo-->>InvSvc: Optional の AuthMember (空)
            InvSvc->>MemRepo: members.saveAndFlush(SHOP_STAFF の AuthMember)
            MemRepo->>Db: INSERT members
            Db-->>MemRepo: 完了
            MemRepo-->>InvSvc: AuthMember
            InvSvc->>MemRepo: organizationMembers.saveAndFlush(組織への所属)
            MemRepo->>Db: INSERT organization_members
            Db-->>MemRepo: 完了
            MemRepo-->>InvSvc: 戻る
            InvSvc->>MemRepo: storeMembers.save(店舗の担当、ロールなし)
            MemRepo-->>InvSvc: 戻る (まだ DB へ送らない)
            InvSvc->>InvRepo: uses.save(使用記録) と uses.flush()
            InvRepo->>Db: flush で INSERT store_members、store_invitation_uses
            Db-->>InvRepo: 完了
            InvRepo-->>InvSvc: 戻る
            InvSvc-->>SignupCtrl: 戻る (コミット)
            SignupCtrl-->>Auth: 200 codeSent=true
            Auth-->>Form: 戻る
            Form->>Form: setEmail と setPassword<br/>onStep('confirm')
            Form-->>User: 「確認コード」の入力欄
        end
    end
```

### 詳細図 4 基本フロー 10〜11、代替フロー 11a 確認コードを照合する

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as SignupForm.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SignupCtrl as SignupController
        participant Errs as ApiErrors
        participant CogS as CognitoSignup
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 基本フロー 10〜11 確認コードを入力して「確認して登録を完了」をクリックする
    User->>Form: メールに届いた確認コードを入力し<br/>「確認して登録を完了」をクリック
    Note right of Form: 6桁の数字でなければ pattern で<br/>ブラウザーが止める。通信しない
    Form->>Form: confirm(event) から run()<br/>ボタンは「確認中…」
    Form->>Auth: confirmSignUp(email, code)
    Note right of Auth: 先に GET /api/auth/csrf を送る (詳細図 2 と同じ)
    Auth->>SignupCtrl: POST /api/auth/signup/confirm
    SignupCtrl->>CogS: confirm(email.trim(), code.trim())
    CogS->>Idp: call() が POST /<br/>ConfirmSignUp
    alt 11a 確認コードが無効、または有効期限切れ
        Idp-->>CogS: CodeMismatchException<br/>または ExpiredCodeException
        CogS--xErrs: translate() が ApiException(400,<br/>CODE_MISMATCH または CODE_EXPIRED)
        Errs-->>Auth: business() が 400 と message を返す
        Auth--xForm: throw AuthError
        Form-->>User: 「確認コードが正しくありません。」<br/>または「確認コードの有効期限が切れています。<br/>コードを再送してください。」
        opt 11a-2 確認コードを再送する
            User->>Form: 「確認コードを再送する」をクリック
            Form->>Form: run()
            Form->>Auth: resendSignUpCode(email)
            Note right of Auth: 先に GET /api/auth/csrf を送る
            Auth->>SignupCtrl: POST /api/auth/signup/resend
            SignupCtrl->>CogS: resend(email.trim())
            CogS->>Idp: call() が POST /<br/>ResendConfirmationCode
            Idp-->>CogS: 受け付けた (確認コードのメールを送る)
            CogS-->>SignupCtrl: 戻る
            SignupCtrl-->>Auth: 200 codeSent=true
            Auth-->>Form: 戻る
            Form-->>User: 「確認コードを再送しました。」
            Note right of Form: 再送の失敗 (429 AUTH_RATE_LIMITED、<br/>409 ALREADY_CONFIRMED など) は<br/>エラーの文言を出す (図では省略)
        end
        Note right of Form: 11a-3 確認コードの入力欄のまま。<br/>基本フロー 10 へ戻る
    else 確認できた
        Idp-->>CogS: 成功
        CogS-->>SignupCtrl: 戻る
        SignupCtrl-->>Auth: 200 confirmed=true
        Auth-->>Form: 戻る
        Note right of Form: 基本フロー 12 へ (詳細図 5)
    end
```

### 詳細図 5 基本フロー 12 ログイン状態にして元の画面を表示する

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as App.jsx
        participant Form as SignupForm.jsx
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

    Note over User,Idp: 基本フロー 12 アカウントを登録し、ログイン状態にして元の画面を表示する
    Form->>Form: confirm() の続き。password がメモリにあるか
    alt password が無い
        Form->>Form: onStep('login')<br/>AuthPanel がログインの入力欄に戻す
        Form-->>User: ログインの入力欄
    else password がある
        Form->>Auth: passwordLogin(email, password, returnTo)
        Note right of Auth: 先に GET /api/auth/csrf を送る
        Auth->>LoginCtrl: POST /api/auth/login
        LoginCtrl->>CogP: authenticate(email.trim(), password)
        CogP->>Idp: initiateAuth() が POST /<br/>InitiateAuth (USER_PASSWORD_AUTH)
        alt *a ログインできない
            Idp--xCogP: 接続できない、または想定外のエラー
            CogP--xErrs: throw ApiException<br/>(503 AUTH_UNAVAILABLE など)
            Errs-->>Auth: business() が status と message を返す
            Auth--xForm: throw AuthError
            Form-->>User: エラーの文言 (確認コードの入力欄のまま)
        else 照合できた
            Idp-->>CogP: AuthenticationResult
            CogP-->>LoginCtrl: Login(user, refreshToken)
            LoginCtrl->>AuthSvc: provision(user)
            Note right of AuthSvc: @Transactional
            AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
            Repo->>Db: SELECT members
            Db-->>Repo: 行 または 空
            Repo-->>AuthSvc: Optional の AuthMember
            alt 企業様向け・招待キーで作った会員がいる
                AuthSvc->>AuthSvc: markEmailVerified()<br/>コミットのときに UPDATE members
            else 購入者 (会員がまだない)
                AuthSvc->>Repo: saveAndFlush(購入者 USER の AuthMember)
                Repo->>Db: INSERT members
                Db-->>Repo: 完了
                Repo-->>AuthSvc: AuthMember
            end
            AuthSvc-->>LoginCtrl: 戻る
            LoginCtrl->>AuthSvc: current()
            AuthSvc->>Repo: findByIssuerAndSubject(issuer, subject)
            Repo->>Db: SELECT members
            Db-->>Repo: 行
            Repo-->>AuthSvc: AuthMember
            AuthSvc-->>LoginCtrl: AuthMember (利用できる)
            LoginCtrl->>LoginCtrl: changeSessionId()、更新トークンの保存、<br/>saveContext()、safeReturn(returnTo)
            LoginCtrl-->>Auth: 200 returnTo
            Auth-->>Form: returnTo
            Form->>Form: onSignedIn(target)<br/>AuthPanel の complete() が window.location.replace(target)
            Form->>App: 元の画面を読み込み直す
            App->>Auth: useAuth() の readSession()
            Auth->>AuthCtrl: GET /api/auth/me
            AuthCtrl->>AuthSvc: session()
            AuthSvc->>Repo: current() の findByIssuerAndSubject()
            Repo->>Db: SELECT members
            Db-->>Repo: 行
            Repo-->>AuthSvc: AuthMember
            AuthSvc-->>AuthCtrl: SessionView (authenticated=true)
            AuthCtrl-->>Auth: 200 authenticated=true
            Auth-->>App: session
            App-->>User: 元の画面。KusakariHeader に「アカウント」
        end
    end
```

## ユースケース記述との差

- 8・8a: 「8文字以上」の検査は、まずブラウザーが入力欄の `minLength={8}` で止め、通信しません。サーバーの `SignupRequest` の `@Size(min = 8)` を通らない値は、400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」になります。記述の「パスワードが条件を満たしていません。8文字以上で入力してください。」は、Cognito が `InvalidPasswordException` を返したときの文言です。EC の `infra/cognito/kusakari-ec-terraform/main.tf` のパスワードポリシーは 8 文字以上だけなので、画面から操作する限り、この文言はふつう出ません。
- 8: メールアドレスの重複は EC の DB ではなく、Cognito の `SignUp`（`UsernameExistsException`）で確かめます。
- 8a: 記述にない応答があります。Cognito が新規登録を受け付けないとき 503 `AUTH_UNAVAILABLE`「現在、新規登録を受け付けていません。」、確認コードのメールを送れないとき 503 `CODE_DELIVERY_FAILED`「確認コードを送信できませんでした。メールアドレスを確認してください。」、試行が多いとき 429 `AUTH_RATE_LIMITED` です。
- 9: 確認コードのメールは、EC のコードではなく Cognito が送ります。
- 12: 購入者の会員（`members` の行）は、登録のときではなく、確認コードのあとのログイン（`POST /api/auth/login` の `provision()`）で作ります。企業様向けと招待キーの会員は、基本フロー 8〜9 の `POST /api/auth/signup` で作り、確認のあとのログインでメール確認日時を入れます。
- 3a-3: 招待キーで登録すると、`members` のほかに `organization_members`（組織への所属）、`store_members`（店舗の担当、ロールなし）、`store_invitation_uses`（キーの使用記録）を、Cognito への登録と同じトランザクションで作ります。キーの行は `SELECT ... FOR UPDATE` でロックし、使用回数の上限を超えないようにしています。
- 11a: 記述にない応答があります。409 `ALREADY_CONFIRMED`「このアカウントは確認済みです。ログインしてください。」と、429 `AUTH_RATE_LIMITED`「試行回数が多すぎます。時間をおいて再試行してください。」です。
- 12: 確認のあとのログインに失敗すると（503 `AUTH_UNAVAILABLE` など）、確認コードの入力欄のままエラーを出します。アカウントはもう確認済みなので、もう一度「確認して登録を完了」を押すと 409 `ALREADY_CONFIRMED` になります。「ログインに戻る」からログインし直す必要があります。記述にない枝です。
- Cognito への登録のあとで DB への保存に失敗すると（503 `DATABASE_UNAVAILABLE` など）、Cognito に未確認のユーザーだけが残ります（`StoreInvitationService.register()` のコメントにも書かれています）。同じメールアドレスで登録し直すと 409 `EMAIL_IN_USE` になります。そのままログインして確認コードを入れると、`provision()` が購入者（`USER`）として会員を作り、企業様向けや招待キーの種類にはなりません。記述にない失敗の扱いです。
- 共通代替フロー *a: ブラウザーから EC API に届かないときは、`postAuth()` が例外を言い換えないため、ブラウザーが出す `TypeError` の文言がそのまま表示されます（EC-B01 と同じ）。

## 確かめられなかったこと

- 確認コードのメールの送信、文面、コードの有効期限、再送の回数の上限は、Cognito の機能と User Pool の設定で決まり、コードでは確かめられません。EC の `infra/cognito/kusakari-ec-terraform/main.tf` では `auto_verified_attributes = ["email"]` ですが、実際の User Pool は kusakari-terraform で管理しており、その設定とパスワードポリシーは確かめていません。
- 6a・8a の画面でブラウザーが出す入力の文言は、ブラウザーと言語の設定で変わります。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `panelAction()`、「ログイン」ボタン
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `openHeaderPanel()`、`/account/login` で `LoginPage` を返す条件
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `login()`、`readSession()`、`authFetch()`、`postAuth()`、`signUp()`、`confirmSignUp()`、`resendSignUpCode()`、`passwordLogin()`
- [frontend/src/components/LoginPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/LoginPage.jsx): `headings`、`invitationInUrl()` での初期の mode
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `invitationInUrl()`、`switchMode()`、`complete()`、`SignupForm` に渡す値、ログイン中の招待キーの文言
- [frontend/src/components/SignupForm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SignupForm.jsx): `register()`、`confirm()`、`run()`、`invitationPattern`、入力欄の `required`・`minLength`・`pattern`、「確認コードを再送する」
- [frontend/src/workspace/StoreInvitations.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/StoreInvitations.jsx): 登録用 URL（`/account/login?invite=`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`
- [backend/src/main/java/jp/kusakari/ec/auth/SignupController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SignupController.java): `signUp()`、`confirm()`、`resend()`、`SignupRequest`、`ConfirmRequest`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoSignup.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoSignup.java): `signUp()`、`confirm()`、`resend()`、`call()`、`translate()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreInvitationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreInvitationService.java): `register()`、`invalid()`、`hash()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreInvitationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreInvitationEntity.java): `usable()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreInvitationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreInvitationRepository.java): `lockByKeyHash()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreInvitationUseRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreInvitationUseRepository.java): `countForInvitation()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findById()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findById()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationMemberRepository.java): `saveAndFlush()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java): `save()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `registerApplicant()`、`provision()`、`current()`、`session()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findByIssuerAndSubject()`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `login()`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `authenticate()`、`initiateAuth()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`database()`
- [infra/cognito/kusakari-ec-terraform/main.tf](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/infra/cognito/kusakari-ec-terraform/main.tf): `password_policy`、`auto_verified_attributes`
- [docs/decisions/2026-11-09-signup-in-login-card.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/decisions/2026-11-09-signup-in-login-card.md): ログインのカードの中で登録する決定
