# EC-B19 パスワードを変更する

- ユースケース記述: [EC-B19_パスワードを変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B19_パスワードを変更する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
EC API が Amazon Cognito を 2 回呼び（現在のパスワードでのログインと、パスワードの変更）、ブラウザーは Cognito と直接通信しません。共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーは最重要の 8a（現在のパスワードが正しくない）だけを描き、ほかの代替フローは図の下に並べています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Work as アカウントの画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Acct as アカウント画面<br/>AccountPage<br/>(AccountPage.jsx)
        participant Form as パスワード変更の入力欄<br/>PasswordForm<br/>(AccountSecurity.jsx)
        participant Hook as 取得と書き込み<br/>useResource・write<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 認証の通信<br/>authFetch・readSession<br/>(auth.js)
        participant Login as ログイン画面<br/>LoginPage<br/>(LoginPage.jsx)
        participant Flash as 完了のお知らせ<br/>flashNotice<br/>(SessionNotice.jsx)
        participant Panel as ログインのカード<br/>AuthPanel<br/>(AuthPanel.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as パスワードAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant CogP as Cognito との通信<br/>CognitoPasswordLogin<br/>(CognitoPasswordLogin.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認) と 12 に適用<br/>*a 通信に失敗した場合: 11、12、32 に適用

    User->>Work: アカウント画面のサイドバー「アカウント設定」の<br/>「パスワード変更」をクリック (EC-C01)
    Work->>Acct: URL を /account/password に変え、AccountPage を表示<br/>(PageLink → navigate、tab は「パスワード変更」)
    Acct->>Form: パスワード変更の入力欄を表示 (PasswordForm)
    Form-->>User: 「現在のパスワード」「新しいパスワード（8文字以上）」「確認用パスワード」、<br/>「変更後はログアウトします。新しいパスワードでログインしてください。」、<br/>「パスワードを変更」
    Acct->>Hook: ログイン状態を取りに行くよう頼む (useResource('/auth/me'))
    Hook->>AuthCtrl: 画面を開いたときに自動で通信を始める (reload → request)<br/>GET /api/auth/me。ログイン状態を作る (session)
    AuthCtrl-->>Hook: 200 ログイン状態 (SessionView。この画面では使わない)

    User->>Form: 3 つの欄に入力し (基本フロー 3〜5)、<br/>「パスワードを変更」をクリック
    Form->>Http: パスワードを変える通信を送る (write → request)<br/>ボタンは「変更しています…」
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>PwCtrl: PUT /api/account/password<br/>(currentPassword、newPassword、confirmPassword、CSRF トークンのヘッダー付き)
    PwCtrl->>Auth: ログイン中の会員を読む<br/>(current → findByIssuerAndSubject、SELECT members)
    Auth-->>PwCtrl: 会員 (メールアドレスと subject)
    PwCtrl->>CogP: パスワードを変えるよう頼む (changePassword)<br/>新しいパスワードと確認用が違えば 400 PASSWORD_MISMATCH だが、<br/>画面の 7a が先に止めるので届かない
    CogP->>Cog: 8 現在のパスワードでログインし直して確かめる<br/>(authenticateTokens → initiateAuth、InitiateAuth USER_PASSWORD_AUTH)
    break 8a 現在のパスワードが正しくない
        CogP--xErrs: 400 CURRENT_PASSWORD_INVALID の例外を投げる<br/>(NotAuthorizedException → INVALID_CREDENTIALS を言い換える)
        Note over Errs,Form: 結果: 400「現在のパスワードが正しくありません。」を返す。<br/>画面: 8a-1 その文 (setError)。入力は残る。8a-2 基本フロー 3 へ戻る
    end
    Cog-->>CogP: ID トークンとアクセストークン
    CogP->>CogP: ID トークンを検証し、subject がログイン中の会員と<br/>同じかを確かめる (toUser)
    CogP->>Cog: 9 パスワードを変える (ChangePassword、<br/>AccessToken・PreviousPassword・ProposedPassword)
    Cog-->>CogP: 200
    CogP-->>PwCtrl: 終わった
    PwCtrl->>PwCtrl: 9 セッションを無効にし、認証情報を消す<br/>(getSession().invalidate、SecurityContextHolder.clearContext)
    PwCtrl-->>Http: 200 { changed: true }
    Http-->>Form: 変えた
    Form->>App: 10 /account/login?notice=password-changed を<br/>読み込み直す (window.location.assign)
    App->>Login: path が /account/login なので LoginPage を表示
    Login->>Flash: 完了のお知らせを読む (flashNotice)<br/>読み込んだときに URL の notice を読み、URL から外してある
    Login->>Panel: ログインのカードを表示 (AuthPanel)
    Panel->>AuthJs: ログイン状態を読む (useAuth → readSession)<br/>LoginPage の useAuth も同じ GET を送る
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 authenticated=false<br/>(セッションが無いので current の 401 を session が受け止める)
    Panel-->>User: 「ログイン」画面と「パスワードを変更しました。新しいパスワードで<br/>ログインしてください。」、メールアドレス・パスワードの欄と「ログイン」
```

![EC-B19 シーケンス図](<images/EC-B19_パスワードを変更する-1.png>)

図に描いていない代替フロー：7a（不一致または短すぎる）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の変更の通信（CSRF トークンの取得と `PUT /api/account/password`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。URL を直接開いたときのログインの確認（\*b）は、[EC-A01](<EC-A01_会員を検索・確認する.md>) の図と同じく `Workspace` がその場に `AuthPanel` のログインの入力欄を出すので省いています。画面を開いたときの `GET /api/auth/me`（上の図の 6）は、失敗しても画面に何も出ないので書いていません（「ユースケース記述との差」を見てください）。

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as パスワード変更の入力欄<br/>PasswordForm<br/>(AccountSecurity.jsx)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 認証の通信<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant PwCtrl as パスワードAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant CogP as Cognito との通信<br/>CognitoPasswordLogin<br/>(CognitoPasswordLogin.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Form: 3 つの欄に入力し、「パスワードを変更」をクリック<br/>(7a の検査を通った)
    Form->>Http: パスワードを変える通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない (届かない、200 以外、<br/>ID トークンを更新できないときの 401)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xForm: エラーを投げる
        Form-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」(setError)。*a-2 入力は残る
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (変わったかは分からない)
            AuthJs-xFilter: PUT /api/account/password
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xForm: エラーを投げる
            Form-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」(setError)。*a-2 入力は残る
        else *b サーバーのセッションがない (期限の 30 日を過ぎた、EC を再起動したなど)
            AuthJs->>Filter: PUT /api/account/password
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(認証が無いので AuthConfiguration.java の authenticationEntryPoint が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xForm: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Form-->>User: 入力欄の上に「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」(setError)
            Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=…/account/password のログイン画面<br/>(*b-2 ログインの後はパスワード変更の画面に戻る。入力は残らない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/account/password
            Filter-xCog: ID トークンを更新する<br/>(renewIdToken → refresh、InitiateAuth REFRESH_TOKEN_AUTH)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xForm: エラーを投げる (readResponse → ApiError 503)
            Form-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」(setError)。*a-2 入力は残る
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/account/password
            Filter->>PwCtrl: 要求を通す (chain.doFilter)
            PwCtrl->>Db: ログイン中の会員を読む<br/>(AuthService の current、上の図の 14〜15)
            alt *a MySQL との通信に失敗
                Db--xPwCtrl: 失敗 (DataAccessException)
                PwCtrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xForm: エラーを投げる (readResponse → ApiError 503)
                Form-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」(setError)。*a-2 入力は残る
            else 読めた
                Db-->>PwCtrl: 会員
                PwCtrl->>CogP: パスワードを変えるよう頼む (changePassword)
                alt *a 現在のパスワードの確認で Cognito に届かない
                    CogP-xCog: InitiateAuth USER_PASSWORD_AUTH
                    CogP-->>Http: 503 AUTH_UNAVAILABLE (initiateAuth の RestClientException、<br/>ApiErrors.java の business)
                    Http--xForm: エラーを投げる (readResponse → ApiError 503)
                    Form-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」(setError)。*a-2 入力は残る
                else *a パスワードの変更で Cognito に届かない
                    CogP->>Cog: InitiateAuth USER_PASSWORD_AUTH
                    Cog-->>CogP: ID トークンとアクセストークン
                    CogP-xCog: ChangePassword
                    CogP-->>Http: 503 AUTH_UNAVAILABLE (changePassword の RestClientException、<br/>ApiErrors.java の business)
                    Http--xForm: エラーを投げる (readResponse → ApiError 503)
                    Form-->>User: *a-1「認証サービスに接続できません。」(setError)。*a-2 入力は残る
                else 変えた
                    CogP->>Cog: InitiateAuth と ChangePassword (上の図の 17〜23)
                    Cog-->>CogP: 200
                    CogP-->>PwCtrl: 終わった
                    PwCtrl-->>Http: 200 { changed: true }。セッションは無効にした
                    Http-->>Form: 変えた
                    Form-->>User: 「ログイン」画面と「パスワードを変更しました。…」<br/>(上の図の 27〜34)
                end
            end
        end
    end
    opt *a-3 やり直す
        User->>Form: 残った入力のまま、もう一度「パスワードを変更」をクリック<br/>(基本フロー 6 へ戻る)
    end
```

![EC-B19 共通代替フローを直接書いた図](<images/EC-B19_パスワードを変更する-2.png>)

## ユースケース記述との差

- 7: 検証は、サーバーへ送る前にブラウザーの `PasswordForm` の `submit()` が行います。8 文字未満を先に確かめ、次に一致を確かめます。サーバーも `PasswordRequest` の `@Size(min = 8)` と 400 `PASSWORD_MISMATCH` の確かめを持ちますが、画面から送る値はブラウザーで止まるため、これらには届きません。
- 記述にない入力の誤りがあります。`form` は `noValidate` で、`submit()` は「現在のパスワード」を確かめません。「現在のパスワード」が空のとき、または新しいパスワードが空白だけのときは、サーバーの `@NotBlank` が 400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」を返します。
- 8: 「現在のパスワードが正しいか確認する」は、Cognito の `InitiateAuth`（`USER_PASSWORD_AUTH`）でログインし直して確かめます。記述にない応答として、試行が多すぎるとき 429 `AUTH_RATE_LIMITED`、追加の確認が要るとき 409 `AUTH_CHALLENGE_REQUIRED` があります。得た ID トークンの `subject` がログイン中の会員と違うときは 403 `FORBIDDEN`「本人確認に失敗しました。」です。
- 9: Cognito の `ChangePassword` が新しいパスワードを受け付けないときは 400 `PASSWORD_REJECTED`「パスワードを変更できません。パスワードの条件または試行間隔を確認してください。」です。記述にない枝です。画面は 8 文字以上だけを確かめるので、Cognito のパスワードの条件に合わない値はここで止まります。
- 9: 「ログアウト状態にする」は、EC API が変更を送ったブラウザーのセッションを `invalidate()` することです。Cognito の `GlobalSignOut` などは呼びません。
- 共通代替フロー \*a: Cognito に届かないときの文は、呼ぶ所で違います。ID トークンの更新と現在のパスワードの確認では「認証を確認できません。時間をおいて再試行してください。」、パスワードの変更（`ChangePassword`）では「認証サービスに接続できません。」です。`ChangePassword` が読み取りの時間切れになったときは、Cognito でパスワードが変わったかは分かりません。
- 共通代替フロー \*b: ID トークンの期限が切れていて、更新もできないとき（refresh トークンの失効など）は、`PUT` より先の `GET /api/auth/csrf` が `SessionValidityFilter` で 401 になり、セッションも無効になります。`auth.js` の `authFetch()` が例外を投げ、`api.js` の `send()` が status 0 の通信の失敗に言い換えるので、画面には \*a の「サーバーに接続できません。…」が出て、`SessionNotice` のお知らせは出ません。もう一度押すと、`GET /api/auth/csrf` は新しいセッションで通り、`PUT` が 401 になって \*b のお知らせが出ます。図の \*b はこの 2 回目と、サーバーのセッションそのものが無いときです。
- 共通代替フロー \*b: 期限切れのときは、`PasswordForm` の入力欄の上と、ヘッダーの `SessionNotice` の 2 か所に「ログインの有効期限が切れました。もう一度ログインしてください。」が出ます。「ログインする」で `/account/login` へ移るので、入力は残りません。
- コードにあって記述にない処理として、画面を開いたときに `AccountPage` の `useResource('/auth/me')` が `GET /api/auth/me` を送ります。「パスワード変更」の画面はこの結果を使わず、`ResourceStatus` も出さないので、この通信が失敗しても画面には何も出ません。
- 利用停止・除名された会員が押したときは、`GET /api/auth/csrf` が `SessionValidityFilter` で 403 になり、画面には「サーバーに接続できません。…」が出ます。事前条件がログイン状態なので、図には書いていません。

## 確かめられなかったこと

- Cognito が `ChangePassword` を拒む条件（パスワードの長さ・文字の種類の決まり、試行の間隔）と、`ChallengeName` を返す条件は、User Pool の設定で決まります。実際の User Pool は kusakari-terraform で管理しており、その設定は確かめていません。
- パスワードを変えたあと、ほかのブラウザーで続いている EC のセッションと、その refresh トークンを Cognito がどう扱うかは、EC のコードでは確かめられません。EC のコードが無効にするのは、変更を送ったブラウザーのセッションだけです。
- MySQL にまったく接続できないときは、`PasswordLoginController` より先に `SessionValidityFilter` の `members.current()` が DB を読みます。そこでの例外は `@RestControllerAdvice` の外で起きるため、`ApiErrors.database()` の 503 にならない可能性があります（00 の「確かめられなかったこと」と同じ）。図の MySQL の枝は、`ApiErrors.database()` を通ったときの形です。
- GitHub と Obsidian での図の見た目は確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`（未ログインのときの `AuthPanel`、`accountSettings`、`accountActions` で `AccountPage` を選ぶところ）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/AccountPage.jsx): `accountActions`、`AccountPage`（`useResource('/auth/me')`）
- [frontend/src/workspace/AccountSecurity.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/AccountSecurity.jsx): `PasswordForm`、`submit`、`messageOf`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`write`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`、`sessionExpiredEvent`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`readSession`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `/account/login` で `LoginPage` を返すところ
- [frontend/src/components/LoginPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/LoginPage.jsx): `LoginPage`（`flashNotice` の表示）
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): `SessionNotice`、`flashMessages`、`flashNotice`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `changePassword`、`PasswordRequest`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `changePassword`、`authenticateTokens`、`initiateAuth`、`toUser`、`refresh`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current`、`session`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findByIssuerAndSubject`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authorizeHttpRequests`（`/api/auth/csrf` は誰でも）、`authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`database`
