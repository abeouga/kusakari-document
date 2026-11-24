# EC-A01 会員を検索・確認する

- ユースケース記述: [EC-A01_会員を検索・確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A01_会員を検索・確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名」の順に書いています。
`ref` の行は、そこで共通代替フローが起こりうることを示します。中身は 00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>Workspace.jsx
        participant Page as 会員管理画面<br/>MembersPage<br/>OperatorPages.jsx
        participant Hook as 一覧の取得<br/>useResource<br/>useResource.js
        participant Http as 通信<br/>request<br/>api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 会員管理API<br/>MemberController<br/>MemberController.java
        participant Svc as 会員の処理<br/>MemberService<br/>MemberService.java
        participant Auth as ログイン中の会員<br/>AuthService<br/>AuthService.java
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>AuthMemberRepository.java
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて会員の一覧を表示する
    User->>Work: 運営者メニューの「会員管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/members') でパスを変える
    Note over User,Db: ref 共通代替フロー *b 未ログインの場合 (ログインしていなければ画面の代わりにログイン欄)
    Work->>Page: パスが /operator/members なので<br/>MembersPage を表示
    Page->>Hook: useResource('/operator/members')
    Note right of Hook: useEffect が reload() を自動で実行する。<br/>取得中は「読み込んでいます。」
    Hook->>Http: request('/operator/members')
    Http->>Ctrl: GET /api/operator/members
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: ADMIN でなければ 403 FORBIDDEN。<br/>運営者以外には画面を出さないので省略
    Auth-->>Svc: 戻る
    Svc->>Repo: findAll()
    Repo->>Db: SELECT members
    Db-->>Repo: 全会員の行
    Repo-->>Svc: AuthMember のリスト
    loop 会員ごと
        Svc->>Auth: storeIdsOf(m)
        Note right of Auth: オーナーは組織の全店舗、担当者はロールのある<br/>店舗を読む。読む Repository は省略
        Auth-->>Svc: 店舗 ID のリスト
    end
    Svc-->>Ctrl: Member のリスト<br/>(id、name、email、accountType、storeIds、enabled、withdrawnAt)
    Ctrl-->>Http: 200 Member の配列
    Note over User,Db: ref 共通代替フロー *a 通信に失敗した場合、*b 未ログインの場合 (ログインの期限切れ)
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Page: all.filter で絞り込む<br/>(query は空なので全員が残る)
    Note right of Page: withdrawnAt があれば「退会済み」、<br/>enabled が真なら「利用中」、偽なら「利用停止」
    Page-->>User: 「名前・メール検索」欄と会員の一覧<br/>name、email、accountType、利用状態

    Note over User,Db: 基本フロー 3〜4 検索する (サーバーには問い合わせない)
    User->>Page: 「名前・メール検索」欄に入力
    Page->>Page: onChange で setQuery(入力値)
    Page->>Page: all.filter で、name と email を空白でつないだ<br/>文字列が query を含む会員だけ残す (includes)
    alt 該当する会員がいる (入力欄が空なら全員)
        Page-->>User: 部分一致した会員だけの一覧
    else 4a 該当する会員がいない
        Page-->>User: 「検索条件に一致する会員はありません。」
        Note right of User: 4a-2 検索条件を変えて<br/>基本フロー 3 へ戻る
    end
```

## 共通代替フローを直接書いた図

上の図の `ref` の行に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。会員の一覧を取る通信だけが対象で、検索は通信しないので共通代替フローは起こりません。検索の部分は上の図と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>Workspace.jsx
        participant Login as ログイン欄<br/>AuthPanel<br/>AuthPanel.jsx
        participant Page as 会員管理画面<br/>MembersPage<br/>OperatorPages.jsx
        participant Status as エラーの表示<br/>ResourceStatus<br/>ResourceView.jsx
        participant Hook as 一覧の取得<br/>useResource<br/>useResource.js
        participant Http as 通信<br/>request<br/>api.js
        participant AuthJs as ログインの通信<br/>readSession ほか<br/>auth.js
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>SessionNotice.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>SessionValidityFilter.java
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>AuthController.java
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>PasswordLoginController.java
        participant Ctrl as 会員管理API<br/>MemberController<br/>MemberController.java
        participant Svc as 会員の処理<br/>MemberService<br/>MemberService.java
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    Note over User,Cog: 基本フロー 1 「会員管理」を開く
    User->>Work: 運営者メニューの「会員管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/members') でパスを変える
    Work->>AuthJs: useAuth() の readSession()
    AuthJs->>AuthCtrl: GET /api/auth/me
    alt *b ログインしていない
        AuthCtrl-->>AuthJs: 200 authenticated=false
        AuthJs-->>Work: session
        Work->>Login: 画面の代わりに AuthPanel を表示
        Login-->>User: *b-1 メールアドレス、パスワード、「ログイン」
        User->>Login: 入力して「ログイン」をクリック
        Login->>AuthJs: passwordLogin(email, password, returnTo)
        AuthJs->>PwCtrl: GET /api/auth/csrf の後、POST /api/auth/login
        PwCtrl->>Cog: InitiateAuth USER_PASSWORD_AUTH<br/>(CognitoPasswordLogin.java)
        Cog-->>PwCtrl: ID トークン、refresh トークン
        PwCtrl->>Db: 会員を読む (初めてのログインなら追加)
        Db-->>PwCtrl: members の行
        PwCtrl-->>AuthJs: 200 returnTo
        AuthJs-->>Login: returnTo
        Login->>Work: *b-2 window.location.replace(returnTo) で<br/>/operator/members を読み込み直す
        Note over User,Cog: 読み込み直した後の GET /api/auth/me は authenticated=true になり、下の「ログイン済み」と同じ流れに戻る
    else ログイン済み
        AuthCtrl-->>AuthJs: 200 authenticated=true
        AuthJs-->>Work: session
    end

    Note over User,Cog: 基本フロー 1〜2 会員の一覧を取る
    Work->>Page: パスが /operator/members なので<br/>MembersPage を表示
    Page->>Hook: useResource('/operator/members')
    Hook->>Http: reload() が request('/operator/members')
    alt *a ブラウザーから届かない、または応答が JSON でない
        Http-xFilter: GET /api/operator/members
        Http->>Http: send() か readResponse() が<br/>ApiError(networkErrorMessage, 0)
        Http--xHook: throw ApiError
        Hook->>Status: reload() の catch が setError(message)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/operator/members
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: wasSignedIn() が真なので<br/>kusakari-session-expired を発火
        Http--xHook: throw ApiError(sessionExpiredMessage, 401)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        Note over User,Cog: 「ログインする」で /account/login?returnTo=/operator/members へ移り、ログインの後 *b-2 で会員管理画面に戻る
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/operator/members
        Filter-xCog: InitiateAuth REFRESH_TOKEN_AUTH<br/>(CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: throw ApiError(message, 503)
        Hook->>Status: setError(message)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/operator/members
        Filter->>Ctrl: chain.doFilter()
        Ctrl->>Svc: list()
        Svc->>Db: requireAdmin() の後、findAll() で SELECT members
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: ApiErrors.java の database() が<br/>503 DATABASE_UNAVAILABLE
            Http--xHook: throw ApiError(message, 503)
            Hook->>Status: setError(message)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 全会員の行 (会員ごとの店舗も読む)
            Svc-->>Ctrl: Member のリスト
            Ctrl-->>Http: 200 Member の配列
            Http-->>Hook: data
            Hook-->>Page: resource.data
            Page-->>User: 「名前・メール検索」欄と会員の一覧
        end
    end
    opt *a-3 「再取得」をクリックした
        User->>Status: 「再取得」をクリック
        Status->>Hook: resource.reload()
        Hook->>Http: request('/operator/members') (同じ GET をもう一度)
    end
```

## ユースケース記述との差

- 2a（会員が 1 人もいない）は図に書いていません。一覧は `members.findAll()` で、ログイン中の運営者本人も含む全会員を返します。運営者がログインしている間は一覧が空にならないので、2a は起こりません。コードには `all.length === 0` のときの「対象の会員はありません。」の表示が残っています。
- 3a（入力欄が空になった）は、分岐ではなく基本フロー 4 の中に書いています。空の入力に別の処理はなく、`includes('')` がすべての会員で真になるので、同じ絞り込みで全員が残ります。
- 基本フロー 4: 絞り込みは JavaScript の `includes` です。大文字と小文字を区別し、入力の前後の空白も取り除きません。記述にはこの決まりが書かれていません。
- 基本フロー 2: サーバーは会員ごとに `AuthService.storeIdsOf()` を呼び、操作できる店舗の ID（`storeIds`）を応答に入れます。会員管理画面はこの値を使いません。記述にない処理です。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、一覧を取りに行きません。API も `requireAdmin()` で 403 を返します。事前条件が運営者のログインなので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインのときの `AuthPanel`、運営者の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `MembersPage`（`query`、`all.filter`、一覧が空のときの文言）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `networkErrorMessage`、`sessionExpiredMessage`、`request`、`send`、`readResponse`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`passwordLogin`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): ログイン欄
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `list`、`Member`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `GET /api/auth/me`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ログインと ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): ID トークンの更新、401 `LOGIN_REQUIRED`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（セッションが無いときの 401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`（503 `DATABASE_UNAVAILABLE`）
