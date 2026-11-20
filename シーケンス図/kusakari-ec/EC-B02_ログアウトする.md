# EC-B02 ログアウトする

- ユースケース記述: [EC-B02_ログアウトする](<../../アーカイブ/ユースケース/kusakari-ec/EC-B02_ログアウトする.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

ログアウトは 2 段階です。EC API が自分の HTTP セッションを無効にし、Cognito のログアウト用 URL（`logoutUrl`）を返します。ブラウザーはその URL へ移り、Cognito が EC の「/」へ戻します。

## 概要図

```mermaid
sequenceDiagram
    actor User as 利用者
    participant Page as アカウント情報画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant Idp as Amazon Cognito

    Note over User,Idp: 基本フロー 1〜2 アカウント情報画面を開く (EC-C01)
    User->>Page: 共通ヘッダーの「アカウント」をクリック
    Page->>Page: /account に切り替える<br/>(ページは読み込み直さない)
    Page->>Api: GET /api/auth/me (Workspace)
    Api->>Db: 会員を検索
    Db-->>Api: 会員の行
    Api-->>Page: 200 authenticated=true
    Page->>Api: GET /api/auth/me<br/>(AccountPage と AuthPanel が 1 回ずつ)
    Api->>Db: 会員を検索
    Db-->>Api: 会員の行
    Api-->>Page: 200 email、accountType など
    Page-->>User: 「アカウント情報」画面<br/>メールアドレス、アカウントの種類、「ログアウト」
    Note over User,Idp: 未ログインならログインの入力欄を出す (共通代替フロー *b を適用)

    Note over User,Idp: 基本フロー 3〜4 「ログアウト」をクリックし、ログアウト処理をする
    User->>Page: 「ログアウト」をクリック
    Page->>Page: ボタンを「ログアウト中…」にする
    Page->>Api: GET /api/auth/csrf
    Note right of Api: ログイン中なので<br/>会員を DB で確かめる
    Api-->>Page: 200 CSRF の確認情報
    Page->>Api: POST /api/auth/logout
    alt *a 通信に失敗した、または 200 以外の応答
        Api--xPage: 403 FORBIDDEN (CSRF が無効) など、<br/>または応答なし
        Page-->>User: 「ログアウトできませんでした。」<br/>または「通信できないためログアウトできませんでした。<br/>接続を確認してもう一度お試しください。」<br/>「ログアウト」をもう一度押せる
    else ログアウトできた
        Api->>Api: HTTP セッションを無効にし、<br/>KUSAKARI_SESSION の Cookie を消す
        Api-->>Page: 200 logoutUrl
        Note over User,Idp: 基本フロー 5 「メイン」画面を表示する
        Page->>Idp: GET /logout<br/>client_id と logout_uri 付き (ページ遷移)
        Idp-->>Page: 302 logout_uri (EC の「/」)
        Page->>Api: GET /api/auth/me
        Api->>Api: セッションが無いので未ログインとして返す<br/>(DB は読まない)
        Api-->>Page: 200 authenticated=false
        Page-->>User: 「メイン」画面<br/>共通ヘッダーに「ログイン」
    end
```

## 詳細図

### 詳細図 1 基本フロー 1〜2 アカウント情報画面を開く

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx
        participant App as App.jsx
        participant Work as Workspace.jsx
        participant Acct as AccountPage.jsx
        participant Res as useResource.js
        participant Panel as AuthPanel.jsx
        participant Auth as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant AuthSvc as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 アカウント情報画面を開く (EC-C01)
    User->>Header: 「アカウント」リンクをクリック
    Header->>App: follow() が onNavigate(href)
    App->>App: navigateFromHeader(url) が<br/>navigation.js の navigate('/account') を呼ぶ
    App->>Work: path が /account なので Workspace を表示
    Work->>Auth: useAuth() の readSession()
    Note right of Work: トップなど Workspace 以外の画面から<br/>開いたときに送る。応答まで<br/>「ログイン状態を確認しています。」
    Auth->>AuthCtrl: GET /api/auth/me
    Note over AuthCtrl,Db: サーバーの処理は下の AuthPanel の要求と同じ
    AuthCtrl-->>Auth: 200 AuthSession
    Auth-->>Work: session
    Note right of Work: authenticated が false なら AuthPanel の<br/>ログインの入力欄を出す (共通代替フロー *b)
    Work->>Acct: AccountPage (tab はアカウント情報)
    Acct->>Res: useResource('/auth/me')
    Res->>AuthCtrl: api.js の request() が GET /api/auth/me
    AuthCtrl-->>Res: 200 AuthSession
    Note right of Res: この結果はアカウント情報のタブでは使わない
    Acct->>Panel: AuthPanel を表示
    Panel->>Auth: useAuth() の readSession()
    Auth->>AuthCtrl: GET /api/auth/me
    Note right of AuthCtrl: SessionValidityFilter が先に current() で会員を確かめる。<br/>ID トークンの期限が切れていれば Cognito で更新する (図では省略)
    AuthCtrl->>AuthSvc: session()
    AuthSvc->>Repo: current() の findByIssuerAndSubject(issuer, subject)
    Repo->>Db: SELECT members
    Db-->>Repo: 会員の行
    Repo-->>AuthSvc: AuthMember
    Note right of AuthSvc: 種類に応じて組織と店舗も読む<br/>(organizationIdOf() など。図では省略)
    AuthSvc-->>AuthCtrl: SessionView (authenticated=true)
    AuthCtrl-->>Auth: 200 email、name、accountType など
    Auth-->>Panel: session
    Panel-->>User: name または email、アカウントの種類<br/>(accountLabels)、「ログアウト」ボタン
```

### 詳細図 2 基本フロー 3〜5 ログアウトして「メイン」画面を表示する

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
        participant Sec as Spring Security<br/>AuthConfiguration.java
        participant Urls as AuthUrls
        participant AuthSvc as AuthService
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Idp as Amazon Cognito
    end

    Note over User,Idp: 基本フロー 3〜4 「ログアウト」をクリックし、ログアウト処理をする
    User->>Panel: 「ログアウト」をクリック
    Panel->>Panel: onClick で setFailure('') と setLoggingOut(true)<br/>ボタンは「ログアウト中…」
    Panel->>Auth: logout()
    Auth->>Auth: authFetch('/api/auth/logout', POST)
    Auth->>AuthCtrl: GET /api/auth/csrf
    Note right of AuthCtrl: SessionValidityFilter が current() で<br/>会員を確かめる (図では省略)
    AuthCtrl-->>Auth: 200 headerName と token
    Auth->>Sec: POST /api/auth/logout<br/>CSRF のヘッダー付き
    alt *a 通信に失敗した、または 200 以外の応答
        Sec--xAuth: CSRF が無効なら accessDeniedHandler が<br/>403 FORBIDDEN、または応答なし
        Auth--xPanel: throw Error「ログアウトできませんでした。」
        Note right of Auth: fetch が TypeError なら「通信できないため<br/>ログアウトできませんでした。…」。<br/>CSRF の取得に失敗したら<br/>「操作の確認情報を取得できません。…」
        Panel->>Panel: catch で setFailure(message) と<br/>setLoggingOut(false)
        Panel-->>User: エラーの文言。「ログアウト」をもう一度押せる
    else ログアウトできた
        Sec->>Sec: logout() の設定どおり LogoutFilter が<br/>HTTP セッションを無効にし、KUSAKARI_SESSION を消す
        Sec->>Urls: logoutSuccessHandler が logout()
        Urls-->>Sec: Cognito の /logout の URL<br/>(client_id と logout_uri は EC の「/」)
        Sec-->>Auth: 200 logoutUrl
        Note over User,Idp: 基本フロー 5 「メイン」画面を表示する
        Auth->>Auth: window.location.assign(logoutUrl)
        Auth->>Idp: GET /logout (ページ遷移)
        Note right of Idp: Cognito のセッションを終え、<br/>logout_uri へ戻す (Cognito の処理)
        Idp-->>App: 302 logout_uri。ブラウザーが EC の「/」を開き直す
        App->>Auth: useAuth() の readSession()
        Auth->>AuthCtrl: GET /api/auth/me
        AuthCtrl->>AuthSvc: session()
        AuthSvc->>AuthSvc: current() が 401 LOGIN_REQUIRED を投げ<br/>session() の catch が受ける
        AuthSvc-->>AuthCtrl: SessionView (authenticated=false)
        AuthCtrl-->>Auth: 200 authenticated=false
        Auth-->>App: session
        App-->>User: 「メイン」画面。KusakariHeader に「ログイン」
    end
```

## ユースケース記述との差

- 基本フロー 4: 記述の「ログアウト処理」は、コードでは 2 つです。EC API の `POST /api/auth/logout` が HTTP セッションを無効にして Cookie を消し、そのあとブラウザーが Cognito の `/logout` へ移って Cognito のセッションを終えます。Cognito の更新トークンは取り消しません（EC の `docs/auth-token-renewal.md` に書かれています）。
- 基本フロー 5: 戻る先は、どの画面からログアウトしても `AuthUrls.logout()` の `logout_uri`（EC の「/」）です。
- 基本フロー 1〜2: アカウント情報画面を開くと `GET /api/auth/me` を最大 3 回送ります（`Workspace` の `useAuth()`、`AccountPage` の `useResource('/auth/me')`、`AuthPanel` の `useAuth()`）。`AccountPage` の `useResource('/auth/me')` の結果は、「アカウント情報」のタブでは表示に使いません。
- 代替フロー: 記述は空ですが、通信に失敗したときと 200 以外の応答のとき、画面はエラーの文言を出して「ログアウト」をもう一度押せるようにします（共通代替フロー *a に当たります）。
- 関連情報: 庭シミュレーション画面から移るときに保存を待つ処理は Canvas 側にあります（Canvas の `EditorPage.jsx` の `requestNavigation()` が `flush()` で保存してから `window.location.assign()` で移ります）。この図は EC の処理だけを書いています。

## 確かめられなかったこと

- Cognito の `/logout` が Cognito のセッションを終えて `logout_uri` へ戻す動きは Cognito の処理で、コードでは確かめられません。`logout_uri` が User Pool のアプリクライアントの Logout URL と一致している必要があります（EC の `docs/cognito-setup.md` に登録する値があります）。
- `LogoutFilter` がセッションを無効にする細かい手順（`SecurityContextLogoutHandler` などの標準の処理）は Spring Security の中の処理で、この図では Spring Security のソースまでは確かめていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): 「アカウント」リンク、`follow()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader()`、`Workspace` を返す条件、`useAuth()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `Workspace`、`buyerMenu`、未ログインのときの `AuthPanel`、`/account` で `AccountPage` を返す条件
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountPage.jsx): `AccountPage`、`useResource('/auth/me')`、「アカウント情報」のタブ
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `accountLabels`、「ログアウト」ボタンの `onClick`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession()`、`authFetch()`、`logout()`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `cognitoSecurity()` の `logout()`（`logoutUrl`、`deleteCookies`、`logoutSuccessHandler`）、`accessDeniedHandler`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthUrls.java): `logout()`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal()`（`/api/auth/logout` は対象外）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findByIssuerAndSubject()`
- [backend/src/main/resources/application-cognito.properties](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/application-cognito.properties): セッションの Cookie 名 `KUSAKARI_SESSION`
- [docs/auth-token-renewal.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/auth-token-renewal.md): ログアウトで更新トークンを取り消さないこと
- [docs/cognito-setup.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/cognito-setup.md): Cognito に登録する Logout URL
- Canvas の [frontend/src/pages/EditorPage.jsx](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/pages/EditorPage.jsx): `requestNavigation()`（関連情報の確認だけ）
