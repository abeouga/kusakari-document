# EC-B02 ログアウトする

- ユースケース記述: [EC-B02_ログアウトする](<../../アーカイブ/ユースケース/kusakari-ec/EC-B02_ログアウトする.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
ログアウトは 2 段階です。EC API が自分の HTTP セッションを無効にして、Cognito のログアウト用の URL（`logoutUrl`）を返します。ブラウザーはその URL へ移り、Cognito が EC の「/」へ戻します。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
アカウント情報画面を開くと `GET /api/auth/me` を最大 3 回送りますが、同じ流れなので 2 回目と 3 回目は 13 の文にまとめています。

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

## 共通代替フローを直接書いた図

上の図の、アカウント情報画面を開いたときの `Workspace` の `GET /api/auth/me` と、「ログアウト」をクリックした後の `GET /api/auth/csrf`・`POST /api/auth/logout`・Cognito の `/logout` に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。`AccountPage` と `AuthPanel` が送る `GET /api/auth/me` は、`Workspace` の通信が通った直後に送るもので、失敗したときの表示は `Workspace` と同じ形（エラーの文だけ）なので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Panel as アカウント情報とログアウト<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログインの通信<br/>readSession・logout<br/>(auth.js)
        participant Browser as ブラウザー<br/>ページの移動<br/>(auth.js の window.location.assign)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Sec as ログアウトの設定<br/>cognitoSecurity の logout<br/>(AuthConfiguration.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Work: 共通ヘッダーの「アカウント」をクリック<br/>(上の図の 1〜3 で Workspace を表示)
    Work->>AuthJs: ログイン状態を読む (useAuth → readSession)
    alt *a GET /api/auth/me が届かない
        AuthJs-xFilter: GET /api/auth/me
        AuthJs--xWork: fetch の例外 (TypeError) をそのまま投げる
        Work-->>User: *a-1 ブラウザーが作る例外の文だけを表示 (useAuth の error)。<br/>「再取得」は無い
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: GET /api/auth/me
        Filter-xCog: ID トークンを更新する<br/>(renewIdToken → refresh、InitiateAuth REFRESH_TOKEN_AUTH)
        Filter-->>AuthJs: 503 AUTH_UNAVAILABLE (セッションは残す)
        AuthJs--xWork: エラーを投げる (readSession)
        Work-->>User: *a-1「ログイン状態を確認できません。」だけを表示
    else *b サーバーのセッションが無い、または refresh トークンが失効
        AuthJs->>Filter: GET /api/auth/me
        Filter->>Filter: refresh トークンの失効なら、セッションを無効にする (invalidate)。<br/>/api/auth/me なので 401 にせず、要求を通す
        Filter->>AuthCtrl: 要求を通す (chain.doFilter)
        AuthCtrl-->>AuthJs: 200 authenticated=false (session)
        AuthJs-->>Work: ログイン状態
        Work->>Panel: 画面の代わりにログインの入力欄を表示 (AuthPanel)
        Panel-->>User: *b-1「メールアドレス」「パスワード」「ログイン」
        User->>Panel: *b-2 入力して「ログイン」をクリック<br/>(EC-B01 の図の 12〜51。returnTo は今の URL の /account)
        Panel->>Browser: /account を読み込み直す (complete → window.location.replace)
        Browser-->>User: 「アカウント情報」画面 (基本フロー 2 へ戻る)
    else 読めた
        AuthJs->>Filter: GET /api/auth/me
        Filter->>AuthCtrl: 要求を通す (chain.doFilter)
        AuthCtrl-->>AuthJs: 200 authenticated=true
        AuthJs-->>Work: ログイン状態
        Work->>Panel: アカウント情報画面を表示 (上の図の 12〜14)
        Panel-->>User: 「アカウント情報」画面と「ログアウト」
        User->>Panel: 「ログアウト」をクリック
        Panel->>AuthJs: ログアウトするよう頼む (logout)。ボタンは「ログアウト中…」
        alt *a GET /api/auth/csrf が届かない
            AuthJs-xFilter: GET /api/auth/csrf (authFetch)
            AuthJs--xPanel: 決まった文に置き換えて投げる (logout の catch、TypeError)
            Panel-->>User: *a-1「通信できないためログアウトできませんでした。<br/>接続を確認してもう一度お試しください。」<br/>*a-2「ログアウト」はまた押せる (setFailure、setLoggingOut(false))
        else *a・*b GET /api/auth/csrf が 200 以外<br/>(Cognito に届かない 503、refresh トークンが失効した 401)
            AuthJs->>Filter: GET /api/auth/csrf (authFetch)
            Filter-->>AuthJs: 503 AUTH_UNAVAILABLE か 401 LOGIN_REQUIRED<br/>(401 のときはサーバーのセッションを無効にする)
            AuthJs--xPanel: エラーを投げる (authFetch。logout はそのまま投げ直す)
            Panel-->>User: *a-1・*b-1「操作の確認情報を取得できません。<br/>画面を再読み込みしてください。」。「ログアウト」はまた押せる
        else CSRF トークンを取れた
            AuthJs->>Filter: GET /api/auth/csrf (authFetch)
            Filter->>AuthCtrl: 要求を通す (chain.doFilter)
            AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
            alt *a POST /api/auth/logout が届かない
                AuthJs-xSec: POST /api/auth/logout
                AuthJs--xPanel: 決まった文に置き換えて投げる (logout の catch、TypeError)
                Panel-->>User: *a-1「通信できないためログアウトできませんでした。<br/>接続を確認してもう一度お試しください。」。「ログアウト」はまた押せる
            else *a 200 以外の応答 (CSRF トークンが無効など)
                AuthJs->>Sec: POST /api/auth/logout
                Sec-->>AuthJs: 403 FORBIDDEN (accessDeniedHandler)
                AuthJs--xPanel: エラーを投げる (応答の文は使わない)
                Panel-->>User: *a-1「ログアウトできませんでした。」。「ログアウト」はまた押せる
            else ログアウトできた
                AuthJs->>Sec: POST /api/auth/logout
                Sec->>Sec: セッションを無効にし、Cookie を消す
                Sec-->>AuthJs: 200 logoutUrl
                AuthJs->>Browser: ページごと移る (window.location.assign)
                alt *a Cognito に届かない
                    Browser-xCog: GET /logout?client_id=…&logout_uri=…
                    Browser-->>User: *a-1 ブラウザーのエラーの画面<br/>(EC のセッションはもう無い)
                else 届いた
                    Browser->>Cog: GET /logout?client_id=…&logout_uri=…
                    Cog-->>Browser: 302 EC の「/」
                    Browser-->>User: 「メイン」画面、共通ヘッダーに「ログイン」<br/>(上の図の 24〜27)
                end
            end
        end
    end
    opt *a-3 やり直す
        alt ログアウトの通信で失敗していた
            User->>Panel: もう一度「ログアウト」をクリック (基本フロー 3 へ戻る)
        else 画面を開いたときか、CSRF トークンの取得で失敗していた
            User->>Browser: ブラウザーで再読み込みする<br/>(画面にやり直しのボタンは無い。基本フロー 2 へ戻る)
        end
    end
```

## ユースケース記述との差

- 基本フロー 4: 記述の「ログアウト処理」は、コードでは 2 つです。EC API の `POST /api/auth/logout` が HTTP セッションを無効にして Cookie を消し、そのあとブラウザーが Cognito の `/logout` へ移って Cognito のセッションを終えます。Cognito の refresh トークンは取り消しません（EC の `docs/auth-token-renewal.md`）。
- 基本フロー 5: 戻る先は、どの画面からログアウトしても `AuthUrls.logout()` の `logout_uri`（EC の「/」）です。
- 基本フロー 1〜2: アカウント情報画面を開くと `GET /api/auth/me` を最大 3 回送ります（`Workspace` の `useAuth()`、`AccountPage` の `useResource`（`/auth/me`）、`AuthPanel` の `useAuth()`）。`Workspace` の分は、トップなど `Workspace` 以外の画面から来たときだけです。`AccountPage` の `useResource`（`/auth/me`） の結果は、「アカウント情報」の画面では使いません。
- 基本フロー 2: 記述の EC-C01 の関連情報は「メールアドレスとアカウントの種類」ですが、画面は名前を先に出し、名前が無いときだけメールアドレスを出します。購入者（`USER`）の種類は「利用者」です。
- 代替フロー: 記述は空ですが、通信に失敗したときと 200 以外の応答のとき、画面はエラーの文を出して「ログアウト」をもう一度押せるようにします（共通代替フロー \*a）。ログアウトの通信は `api.js` を通らないので、00 の \*a-1 の共通の文（「サーバーに接続できません。…」）ではなく、`logout()` が決めた文が出ます。
- 共通代替フロー \*b: 使っている間にログインが切れても、`SessionNotice` のお知らせは出ません。アカウント情報画面を開いたときの `GET /api/auth/me` は 401 にならず、`Workspace` がログインの入力欄を出します。「ログアウト」の後の `GET /api/auth/csrf` が 401 になったときは、「操作の確認情報を取得できません。画面を再読み込みしてください。」が出ます。このときサーバーのセッションは無効になっているので、再読み込みするとログインの入力欄が出ます。Cognito の `/logout` へは移らないので、Cognito のセッションは残ります。
- `POST /api/auth/logout` は `SessionValidityFilter` の対象外です。サーバーのセッションが無くても、直前の `GET /api/auth/csrf` が新しいセッションと CSRF トークンを作るので、ログアウトは 200 になります。
- 関連情報: 庭シミュレーション画面から移るときに保存を待つ処理は Canvas 側にあります（Canvas の `EditorPage.jsx` の `requestNavigation` が `flush` で保存してから `window.location.assign` で移ります）。この図は EC の処理だけを書いています。

## 確かめられなかったこと

- Cognito の `/logout` が Cognito のセッションを終えて `logout_uri` へ戻す動きは Cognito の処理で、コードでは確かめられません。`logout_uri` が User Pool のアプリクライアントの Logout URL と一致している必要があります（EC の `docs/cognito-setup.md`）。
- `LogoutFilter` がセッションを無効にする細かい手順（`SecurityContextLogoutHandler` などの標準の処理）と、`CsrfFilter` が `LogoutFilter` より先に CSRF トークンを確かめる順番は、Spring Security の中の処理で、Spring Security のソースまでは確かめていません。
- `SessionValidityFilter` の `current()` が MySQL に届かなかったときの応答は確かめていません。`DataAccessException` はこのフィルターの `catch`（`ApiException` だけ）を通らないので、`ApiErrors.database()` の 503 にならない可能性があります。画面はどちらにしても「ログイン状態を確認できません。」か「操作の確認情報を取得できません。…」になるはずですが、動かしていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/packages/site-header/KusakariHeader.jsx): 「アカウント」リンク、`follow`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `navigateFromHeader`、`Workspace` を返す条件、`useAuth`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`、`buyerMenu`、`accountSettings`、未ログインのときの `AuthPanel`、`/account` で `AccountPage` を返す条件
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/AccountPage.jsx): `AccountPage`、`useResource` の `/auth/me`、「アカウント情報」の画面
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `accountLabels`、「ログアウト」ボタンの `onClick`、`complete`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`authFetch`、`logout`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `cognitoSecurity` の `logout`（`logoutUrl`、`deleteCookies`、`logoutSuccessHandler`）、`accessDeniedHandler`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java): `logout`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（`/api/auth/logout` は対象外、`/api/auth/me` の 401 は通す）、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `refresh`（ID トークンの更新、503 `AUTH_UNAVAILABLE`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session`、`current`、`organizationIdOf`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findByIssuerAndSubject`
- [backend/src/main/resources/application-cognito.properties](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/resources/application-cognito.properties): セッションの Cookie 名 `KUSAKARI_SESSION`
- [docs/auth-token-renewal.md](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/docs/auth-token-renewal.md): ログアウトで refresh トークンを取り消さないこと
- [docs/cognito-setup.md](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/docs/cognito-setup.md): Cognito に登録する Logout URL
- Canvas の [frontend/src/pages/EditorPage.jsx](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/frontend/src/pages/EditorPage.jsx)（kusakari-canvas の main、7e9a8dd、2026-11-24 時点）: `requestNavigation`（関連情報の確認だけ）
