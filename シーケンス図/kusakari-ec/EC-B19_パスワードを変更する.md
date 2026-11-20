# EC-B19 パスワードを変更する

- ユースケース記述: [EC-B19_パスワードを変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B19_パスワードを変更する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

パスワードの変更は、EC API が Amazon Cognito を 2 回呼んで行います。1 回目の `InitiateAuth`（`USER_PASSWORD_AUTH`）で現在のパスワードを確かめ、2 回目の `ChangePassword` で新しいパスワードに変えます。ブラウザーは Cognito と直接通信しません。変更できたら EC API がセッションを無効にし、画面は `/account/login?notice=password-changed` を読み込み直します。

## 概要図

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 「パスワード変更」画面
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Api as EC API
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 基本フロー 1〜2 「パスワード変更」画面を開く
    User->>Page: サイドバーの「パスワード変更」をクリック（EC-C01）
    Page-->>User: 「現在のパスワード」「新しいパスワード（8文字以上）」<br/>「確認用パスワード」の欄と「パスワードを変更」ボタン
    Page->>Api: GET /api/auth/me（この画面では結果を使わない）
    Api->>Db: 会員を読む
    Db-->>Api: 会員の行
    Api-->>Page: 200 ログイン状態
    Note over User,Cog: 共通代替フロー *b を適用（未ログインなら、その場にログインの入力欄を出す）

    Note over User,Cog: 基本フロー 3〜7 入力し、画面で確かめる（通信しない）
    User->>Page: 3 つの欄に入力し、「パスワードを変更」をクリック
    alt 7a 新しいパスワードが 8 文字未満
        Page-->>User: 「新しいパスワードは8文字以上で入力してください。」<br/>入力は残る。基本フロー 3 へ戻る
    else 7a 確認用パスワードと一致しない
        Page-->>User: 「新しいパスワードと確認用パスワードが一致しません。」<br/>入力は残る。基本フロー 3 へ戻る
    else 検査を通る
        Note over Page: 基本フロー 8 へ進む
    end

    Note over User,Cog: 基本フロー 8〜9 現在のパスワードを確かめて変更する
    Page->>Api: GET /api/auth/csrf
    Api-->>Page: 200 headerName と token
    Page->>Api: PUT /api/account/password<br/>currentPassword、newPassword、confirmPassword
    Note over Page,Api: 共通代替フロー *a・*b を適用
    Note over User,Cog: 以下、エラーの枝に当たったらそこで終わる。当たらなければ次へ進む
    alt 記述にない 現在のパスワードが空、または新しいパスワードが空白だけ
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 「入力内容・文字数・数値の範囲を確認してください。」
    end
    Api->>Db: 会員を読む
    Db-->>Api: 会員の行（メールアドレス、subject）
    Api->>Cog: InitiateAuth USER_PASSWORD_AUTH<br/>メールアドレスと現在のパスワード
    alt 8a 現在のパスワードが正しくない
        Cog-->>Api: NotAuthorizedException
        Api-->>Page: 400 CURRENT_PASSWORD_INVALID
        Page-->>User: 「現在のパスワードが正しくありません。」<br/>入力は残る。基本フロー 3 へ戻る
    else 記述にない 試行が多すぎる、追加の確認が要る、Cognito に届かない
        Cog-->>Api: TooManyRequestsException、ChallengeName など
        Api-->>Page: 429 AUTH_RATE_LIMITED、409 AUTH_CHALLENGE_REQUIRED、<br/>503 AUTH_UNAVAILABLE など
        Page-->>User: 応答の message
    else 現在のパスワードが正しい
        Cog-->>Api: ID トークンとアクセストークン
    end
    alt 記述にない ID トークンの subject がログイン中の会員と違う
        Api-->>Page: 403 FORBIDDEN
        Page-->>User: 「本人確認に失敗しました。」
    end
    Api->>Cog: ChangePassword<br/>アクセストークン、現在と新しいパスワード
    alt 記述にない Cognito が新しいパスワードを受け付けない
        Cog-->>Api: エラーの応答
        Api-->>Page: 400 PASSWORD_REJECTED
        Page-->>User: 「パスワードを変更できません。パスワードの条件<br/>または試行間隔を確認してください。」
    else 記述にない Cognito に届かない
        Cog--xApi: 応答が無い
        Api-->>Page: 503 AUTH_UNAVAILABLE
        Page-->>User: 「認証サービスに接続できません。」
    else 変更できた
        Cog-->>Api: 200
        Api->>Api: セッションを無効にする（ログアウト状態）
        Api-->>Page: 200 changed=true
    end

    Note over User,Cog: 基本フロー 10 「ログイン」画面を読み込み直す
    Page->>Page: /account/login?notice=password-changed を読み込む
    Page->>Api: GET /api/auth/me
    Note right of Page: 読み込み直しで、ほかの取得（商品、カートなど）も走る（図では省略）
    Api-->>Page: 200 authenticated=false
    Page-->>User: 「ログイン」画面と「パスワードを変更しました。<br/>新しいパスワードでログインしてください。」
```

## 詳細図

### 詳細図 1 基本フロー 1〜7 画面を開いて入力を確かめる

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Acct as AccountPage.jsx
        participant Form as PasswordForm<br/>AccountSecurity.jsx
        participant Hook as useResource.js
        participant Http as api.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtl as AuthController
        participant AuthSvc as AuthService
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 「パスワード変更」画面を開く
    User->>Work: サイドバーの「パスワード変更」をクリック（EC-C01）
    Note right of Work: WorkspaceSidebar の PageLink が navigate() し、<br/>App.jsx の usePath() が新しい path を渡す<br/>（Common.jsx・navigation.js・App.jsx は図では省略）
    Work->>Work: session.authenticated を確かめ、<br/>accountActions から tab を決める
    Note right of Work: 共通代替フロー *b を適用。未ログインなら<br/>その場に AuthPanel のログインの入力欄を出す
    Work->>Acct: AccountPage（key は path、tab は「パスワード変更」）
    Acct->>Hook: useResource('/auth/me')
    Acct->>Form: PasswordForm を表示
    Form-->>User: 「現在のパスワード」「新しいパスワード（8文字以上）」<br/>「確認用パスワード」の欄と「パスワードを変更」
    Note right of Hook: 描画の後、useEffect が reload() を自動で実行する。<br/>このタブでは結果を使わない
    Hook->>Http: request('/auth/me')
    Http->>AuthJs: send() が authFetch() を呼ぶ<br/>GET なので CSRF の確認情報は取らない
    AuthJs->>AuthCtl: GET /api/auth/me
    AuthCtl->>AuthSvc: me() が session()
    AuthSvc->>Db: current() などが SELECT members ほか
    Db-->>AuthSvc: 行
    AuthSvc-->>AuthCtl: SessionView
    AuthCtl-->>AuthJs: 200 ログイン状態
    AuthJs-->>Http: Response
    Http-->>Hook: data（setData するが画面は使わない）

    Note over User,Db: 基本フロー 3〜7 入力し、ボタンを押して画面で確かめる
    User->>Form: 3 つの欄に入力する（入力のたびの通信はない）
    User->>Form: 「パスワードを変更」をクリック
    Form->>Form: onSubmit の submit(event)<br/>FormData から input を作る
    Note right of Form: form は noValidate なので、<br/>ブラウザーの required の検査は働かない
    alt 7a 新しいパスワードが 8 文字未満
        Form->>Form: setError('新しいパスワードは8文字以上で…')
        Form-->>User: 「新しいパスワードは8文字以上で入力してください。」<br/>入力は残る。基本フロー 3 へ戻る
    else 7a 確認用パスワードと一致しない
        Form->>Form: setError('新しいパスワードと確認用…')
        Form-->>User: 「新しいパスワードと確認用パスワードが一致しません。」<br/>入力は残る。基本フロー 3 へ戻る
    else 検査を通る
        Note over Form: 基本フロー 8 へ（詳細図 2）
    end
```

### 詳細図 2 基本フロー 8〜9 現在のパスワードを確かめて変更する

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as PasswordForm<br/>AccountSecurity.jsx
        participant Hook as useResource.js
        participant Http as api.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtl as AuthController
        participant Ctrl as PasswordLogin<br/>Controller
        participant Errs as ApiErrors
        participant AuthSvc as AuthService
        participant CogSvc as CognitoPassword<br/>Login
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 基本フロー 8〜9 現在のパスワードを確かめて変更する
    Form->>Form: setBusy(true) と setError('')<br/>ボタンは「変更しています…」
    Form->>Hook: write('/account/password', 'PUT', input)
    Hook->>Http: request('/account/password', 'PUT', JSON)
    Http->>AuthJs: send() が authFetch(url, init) を呼ぶ
    AuthJs->>AuthCtl: GET /api/auth/csrf
    AuthCtl-->>AuthJs: csrf() が 200 headerName と token
    AuthJs->>Ctrl: PUT /api/account/password<br/>CSRF のヘッダー付き
    Note over AuthJs,Ctrl: 共通代替フロー *a・*b を適用。SessionValidityFilter が<br/>ログイン状態を確かめる（図では省略）
    Ctrl->>Ctrl: @Valid が PasswordRequest を検査
    Note over User,Cog: 以下、エラーの枝に当たったらそこで終わる。当たらなければ次へ進む
    alt 記述にない 現在のパスワードが空、または新しいパスワードが空白だけ
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>AuthJs: invalid() が 400 INVALID_INPUT
        AuthJs-->>Http: Response
        Http--xForm: readResponse() が throw ApiError(400)<br/>write() はそのまま投げ返す
        Form->>Form: catch で setError(message) と setBusy(false)
        Form-->>User: 「入力内容・文字数・数値の範囲を確認してください。」
    end
    Ctrl->>AuthSvc: members.current()
    AuthSvc->>Db: SELECT members（issuer、subject）
    Db-->>AuthSvc: 会員の行
    AuthSvc-->>Ctrl: AuthMember
    Note right of Ctrl: newPassword と confirmPassword が違えば<br/>400 PASSWORD_MISMATCH。画面の 7a が<br/>先に止めるので、画面からは届かない
    Ctrl->>CogSvc: changePassword(email, subject, 現在, 新しい)
    CogSvc->>CogSvc: authenticateTokens(email, previous)
    CogSvc->>Cog: initiateAuth() が POST /<br/>InitiateAuth USER_PASSWORD_AUTH
    Note over Errs,Form: 以下の枝の、ブラウザーでの戻りは INVALID_INPUT の枝と同じ。<br/>PasswordForm は応答の message を setError() で出し、入力は残る
    alt 8a 現在のパスワードが正しくない
        Cog-->>CogSvc: NotAuthorizedException
        CogSvc->>CogSvc: initiateAuth() が ApiException(401, INVALID_CREDENTIALS)<br/>changePassword() の catch が言い換える
        CogSvc--xErrs: throw ApiException(400, CURRENT_PASSWORD_INVALID)
        Errs-->>AuthJs: business() が 400 と message
        Form-->>User: 「現在のパスワードが正しくありません。」<br/>基本フロー 3 へ戻る
    else 記述にない 試行が多すぎる、追加の確認が要る、Cognito に届かない
        Cog-->>CogSvc: TooManyRequestsException、ChallengeName など
        CogSvc--xErrs: throw ApiException（429 AUTH_RATE_LIMITED、<br/>409 AUTH_CHALLENGE_REQUIRED、503 AUTH_UNAVAILABLE など）
        Errs-->>AuthJs: business() が status と message
        Form-->>User: 応答の message
    else 現在のパスワードが正しい
        Cog-->>CogSvc: AuthenticationResult（IdToken、AccessToken）
        CogSvc->>CogSvc: toUser() が ID トークンを検証する<br/>（JWKS の取得は図では省略）
    end
    alt 記述にない subject がログイン中の会員と違う
        CogSvc--xErrs: throw ApiException(403, FORBIDDEN)
        Errs-->>AuthJs: business() が 403 と message
        Form-->>User: 「本人確認に失敗しました。」
    end
    CogSvc->>Cog: POST / ChangePassword<br/>AccessToken、PreviousPassword、ProposedPassword
    alt 記述にない Cognito が新しいパスワードを受け付けない
        Cog-->>CogSvc: エラーの応答（RestClientResponseException）
        CogSvc--xErrs: throw ApiException(400, PASSWORD_REJECTED)
        Errs-->>AuthJs: business() が 400 と message
        Form-->>User: 「パスワードを変更できません。パスワードの条件<br/>または試行間隔を確認してください。」
    else 記述にない Cognito に届かない
        Cog--xCogSvc: 応答が無い（RestClientException）
        CogSvc--xErrs: throw ApiException(503, AUTH_UNAVAILABLE)
        Errs-->>AuthJs: business() が 503 と message
        Form-->>User: 「認証サービスに接続できません。」
    else 変更できた
        Cog-->>CogSvc: 200
        CogSvc-->>Ctrl: 戻る（void）
        Ctrl->>Ctrl: request.getSession().invalidate()<br/>SecurityContextHolder.clearContext()
        Ctrl-->>AuthJs: 200 changed=true
        AuthJs-->>Http: Response
        Http-->>Hook: data
        Hook-->>Form: data
        Form->>Form: window.location.assign<br/>('/account/login?notice=password-changed')
        Note over Form: 基本フロー 10 へ（詳細図 3）
    end
```

### 詳細図 3 基本フロー 10 「ログイン」画面と完了メッセージを表示する

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as PasswordForm<br/>AccountSecurity.jsx
        participant App as App.jsx
        participant Notice as SessionNotice.jsx
        participant Login as LoginPage.jsx
        participant Panel as AuthPanel.jsx
        participant UseAuth as useAuth.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtl as AuthController
        participant AuthSvc as AuthService
    end

    Note over User,AuthSvc: 基本フロー 10 「ログイン」画面と完了メッセージを表示する
    Form->>App: window.location.assign で<br/>/account/login?notice=password-changed を読み込み直す
    Note over Notice: モジュールを読み込んだときに flashNotice を 1 回だけ作る。<br/>URL の notice を読み、history.replaceState で URL から外す
    Note right of App: 読み込み直しで App.jsx の useShop() と useAuth() も<br/>通信する（図では省略）
    App->>Login: path が /account/login なので LoginPage を返す
    Login->>Notice: flashNotice を読む（import）
    Notice-->>Login: 「パスワードを変更しました。…」
    Login->>Panel: AuthPanel を表示
    Panel->>UseAuth: useAuth()
    Note right of UseAuth: useEffect が readSession() を自動で実行する。<br/>LoginPage の useAuth() も同じ GET を送る
    UseAuth->>AuthJs: readSession()
    AuthJs->>AuthCtl: GET /api/auth/me
    AuthCtl->>AuthSvc: me() が session()
    AuthSvc->>AuthSvc: current() が 401 を投げ、session() が受け止める<br/>（セッションは無効にしたので DB は読まない）
    AuthSvc-->>AuthCtl: SessionView（authenticated=false）
    AuthCtl-->>AuthJs: 200 authenticated=false
    AuthJs-->>UseAuth: session
    UseAuth-->>Panel: session
    Panel-->>User: メールアドレス・パスワードの欄と「ログイン」
    Login-->>User: 「ログイン」の見出しと「パスワードを変更しました。<br/>新しいパスワードでログインしてください。」
```

## ユースケース記述との差

- 7: 検証は、サーバーへ送る前にブラウザーの `PasswordForm` の `submit()` が行います。8 文字未満を先に確かめ、次に一致を確かめます。サーバーも `PasswordRequest` の `@Size(min = 8)` と 400 `PASSWORD_MISMATCH` の確かめを持ちますが、画面から送る値はブラウザーで止まるため、これらには届きません。
- 記述にない入力の誤りがあります。`form` は `noValidate` で、`submit()` は「現在のパスワード」を確かめません。「現在のパスワード」が空のとき、または新しいパスワードが空白だけのときは、サーバーの `@NotBlank` が 400 `INVALID_INPUT` を返し、「入力内容・文字数・数値の範囲を確認してください。」と出ます。
- 8: 「現在のパスワードが正しいか確認する」は、Cognito の `InitiateAuth`（`USER_PASSWORD_AUTH`）でログインし直して確かめます。記述にない応答として、試行が多すぎるとき 429 `AUTH_RATE_LIMITED`「試行回数が多すぎます。時間をおいて再試行してください。」、追加の確認が要るとき 409 `AUTH_CHALLENGE_REQUIRED`、Cognito に届かないとき 503 `AUTH_UNAVAILABLE` があります。得た ID トークンの `subject` がログイン中の会員と違うときは 403 `FORBIDDEN`「本人確認に失敗しました。」です。
- 9: 記述にない応答として、Cognito の `ChangePassword` が新しいパスワードを受け付けないとき 400 `PASSWORD_REJECTED`「パスワードを変更できません。パスワードの条件または試行間隔を確認してください。」、Cognito に届かないとき 503 `AUTH_UNAVAILABLE`「認証サービスに接続できません。」があります。画面は 8 文字以上だけを確かめるので、Cognito のパスワードの条件に合わない値はここで止まります。
- 共通代替フロー *b: ID トークンを更新できないとき（更新トークンの失効など）は、最初の `GET /api/auth/csrf` が `SessionValidityFilter` で 401 になり、セッションも無効になります。`auth.js` の `authFetch()` が例外を投げ、`api.js` の `send()` が status 0 の通信エラーに言い換えるため、画面には「サーバーに接続できません。接続を確認して再試行してください。」が出て、`SessionNotice` のログインの案内は出ません。もう一度押すと `PUT` が 401 になり、*b の案内が出ます。サーバーのセッションそのものが無いとき（EC の再起動など）は、1 回目から `PUT` が 401 になり、*b の案内が出ます。
- コードにあって記述にない処理として、画面を開いたときに `AccountPage` の `useResource('/auth/me')` が `GET /api/auth/me` を送ります。「パスワード変更」の画面はこの結果を使いません。

## 確かめられなかったこと

- Cognito が `ChangePassword` を拒む条件（パスワードの長さ・文字の種類の決まり、試行の間隔）と、`ChallengeName` を返す条件は、User Pool の設定で決まります。EC の `infra/cognito/kusakari-ec-terraform/main.tf` のパスワードの条件は 8 文字以上で文字の種類を問いませんが、実際の User Pool は kusakari-terraform で管理しており、その設定は確かめていません。
- パスワードを変えたあと、ほかのブラウザーで続いている EC のセッションと、その更新トークンを Cognito がどう扱うかは、EC のコードでは確かめられません。EC のコードが無効にするのは、変更を送ったブラウザーのセッションだけです。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `Workspace`（未ログインのときの `AuthPanel`、`accountActions` で `AccountPage` を選ぶところ）、`accountSettings`
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountPage.jsx): `accountActions`、`AccountPage`、`useResource('/auth/me')`
- [frontend/src/workspace/AccountSecurity.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountSecurity.jsx): `PasswordForm`、`submit()`、`messageOf()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`、`networkErrorMessage`、`sessionExpiredEvent`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`、`readSession()`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `/account/login` で `LoginPage` を返す条件
- [frontend/src/components/LoginPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/LoginPage.jsx): `LoginPage`（`flashNotice` の表示）
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `AuthPanel`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SessionNotice.jsx): `flashNotice`、`flashMessages`、`SessionNotice`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `changePassword()`、`PasswordRequest`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `changePassword()`、`authenticateTokens()`、`initiateAuth()`、`toUser()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`、`session()`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal()`、`renewIdToken()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`
- [infra/cognito/kusakari-ec-terraform/main.tf](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/infra/cognito/kusakari-ec-terraform/main.tf): `password_policy`
- [docs/decisions/2026-10-28-buyer-account-use-cases.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/decisions/2026-10-28-buyer-account-use-cases.md): EC-B19 の決定（`confirmPassword`、400 `CURRENT_PASSWORD_INVALID`）
