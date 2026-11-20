# EC-C01 アカウントのメニューを開く

- ユースケース記述: [EC-C01_アカウントのメニューを開く](<../../アーカイブ/ユースケース/kusakari-ec/EC-C01_アカウントのメニューを開く.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

EC の画面は 1 つの React アプリです。共通ヘッダーの「アカウント」をクリックしても画面は読み込み直さず、URL を `/account` に変えて `Workspace` に切り替えます。`useAuth()` を使うコンポーネントは、作られるたびに `GET /api/auth/me` を送ります。メイン画面から移ったときは `Workspace` と `AuthPanel` が新しく作られるので、この 2 か所が送ります。詳細図は、画面の切り替えとログイン状態の確認（詳細図 1）と、メニューと「アカウント情報」の表示（詳細図 2）に分けました。

## 概要図

```mermaid
sequenceDiagram
    actor User as 利用者
    participant Page as 共通ヘッダーと<br/>アカウントの画面 React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「アカウント」をクリックする
    User->>Page: 共通ヘッダーの「アカウント」をクリック
    Note right of Page: 「アカウント」はログインしているときだけ<br/>共通ヘッダーに出る
    Page->>Page: URL を /account に変えて画面を切り替える<br/>（読み込み直さない）

    Note over User,Db: 基本フロー 2 ログイン状態を確かめる
    Page->>Api: GET /api/auth/me
    alt 未ログイン
        Api-->>Page: 200 authenticated false
        Page-->>User: ログインのフォーム（共通代替フロー *b）
    else ログインしている
        Api->>Db: 会員を読む
        Db-->>Api: 行
        alt 利用できないアカウント（停止、除名）
            Api-->>Page: 403 ACCOUNT_DISABLED、ACCOUNT_EXPELLED
            Page-->>User: 「このアカウントは利用できません。」など
        else 利用できる
            Api->>Db: 組織・店舗の所属を読む
            Db-->>Api: 行
            Api-->>Page: 200 ログイン状態（名前、メール、アカウントの種類）
        end
    end

    Note over User,Db: 基本フロー 2 サイドバーと「アカウント情報」を出す
    opt 出店申請用アカウント
        Page->>Api: GET /api/account/store-applications
        Api->>Db: 自分の出店申請を読む
        Db-->>Api: 行
        Api-->>Page: 200 申請の一覧
    end
    Page-->>User: サイドバー「マイページ」（アカウント情報、注文履歴、通知一覧）、<br/>「アカウント設定」（受取連絡先、パスワード変更、退会）、<br/>出店申請用は「出店をご検討の方」（「出店申請」か「出店申請状況」）
    Page->>Api: GET /api/auth/me（「アカウント情報」の表示用）
    Api->>Db: 会員と所属を読む
    Db-->>Api: 行
    Api-->>Page: 200 ログイン状態
    Page-->>User: 「アカウント情報」画面<br/>（名前かメール、アカウントの種類、「ログアウト」）

    Note over User,Db: 基本フロー 3 指定のメニューを開く
    opt 指定のメニューが「アカウント情報」以外
        User->>Page: サイドバーのメニューをクリック
        Page->>Page: URL を変えて画面を切り替える（読み込み直さない）
        Page-->>User: 対象の画面（内容は呼び出し元のユースケース）
    end
```

## 詳細図 1 基本フロー 1〜2 画面を切り替え、ログイン状態を確かめる

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as KusakariHeader.jsx
        participant App as App.jsx
        participant Nav as navigation.js
        participant Work as Workspace.jsx
        participant UA as useAuth.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as SessionValidity<br/>Filter
        participant Ctrl as AuthController
        participant Svc as AuthService
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「アカウント」をクリックする
    User->>Head: 「アカウント」をクリック
    Note right of Head: authenticated のときだけ「アカウント」を描く。<br/>App.jsx が useAuth() の session から渡す
    Head->>App: follow() が onNavigate(href)
    App->>Nav: navigateFromHeader() が navigate('/account')
    Nav->>Nav: history.pushState() と popstate
    Nav-->>App: usePath() が path を '/account' にする
    App->>Work: path が / と /cart 以外なので Workspace を描く

    Note over User,Db: 基本フロー 2 ログイン状態を確かめる
    Work->>UA: useAuth()
    UA->>AuthJs: useEffect が readSession()
    AuthJs->>Filter: GET /api/auth/me
    alt 未ログイン（OidcUser が無い）
        Filter->>Ctrl: chain.doFilter()
        Ctrl->>Svc: session()
        Svc->>Svc: current() が投げる 401 を受け、<br/>authenticated false の SessionView を作る
        Svc-->>Ctrl: SessionView
        Ctrl-->>AuthJs: 200 SessionView
        AuthJs-->>UA: session
        UA-->>Work: session
        Work-->>User: ログインのフォーム（AuthPanel）<br/>共通代替フロー *b
    else ログインしている
        Note right of Filter: ID トークンの期限が切れていれば、<br/>Amazon Cognito で更新する。図では省略
        Filter->>Svc: current()
        Svc->>Db: SELECT members（issuer と subject）、organization_members
        Db-->>Svc: 行
        alt 利用できないアカウント（停止、除名）
            Svc--xFilter: throw ApiException(403, ACCOUNT_DISABLED<br/>か ACCOUNT_EXPELLED)
            Filter-->>AuthJs: セッションを消し、403 と message の JSON を返す
            AuthJs--xUA: throw Error(message)
            UA-->>Work: error
            Work-->>User: 「このアカウントは利用できません。」など
        else 利用できる
            Svc-->>Filter: AuthMember
            Filter->>Ctrl: chain.doFilter()
            Ctrl->>Svc: session()
            Svc->>Db: current()、organizationIdOf()、organizationRoleOf()、<br/>storeIdsOf() が SELECT members、organizations、<br/>organization_members、stores、store_members
            Db-->>Svc: 行
            Svc-->>Ctrl: SessionView（id、email、name、accountType、<br/>organizationId、organizationRole、storeIds）
            Ctrl-->>AuthJs: 200 SessionView
            AuthJs-->>UA: session（signedIn を true にする）
            UA-->>Work: session
            Note right of Work: 続きは詳細図 2
        end
    end
```

## 詳細図 2 基本フロー 2〜3 サイドバーと「アカウント情報」を出す

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Side as WorkspaceSidebar.jsx
        participant Acc as AccountPage.jsx
        participant Panel as AuthPanel.jsx
        participant UA as useAuth.js
        participant Res as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Svc as StoreApplication<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 2 サイドバーのメニューを決める
    Work->>Work: applicant は accountType が<br/>SHOP_OWNER_APPLICANT か
    Work->>Res: useResource(applicant ? '/account/store-applications' : null)
    opt 出店申請用アカウント
        Res->>Http: useEffect が reload()、request('/account/store-applications')
        Http->>Ctrl: GET /api/account/store-applications
        Ctrl->>Svc: list(false)
        Note right of Svc: 読み取り専用のトランザクション。<br/>auth.current() で会員を確かめる（図では省略）
        Svc->>Db: findByMemberIdOrderByCreatedAtDesc() が<br/>SELECT organization_applications
        Db-->>Svc: 行
        Svc-->>Ctrl: Application のリスト
        Ctrl-->>Http: 200 申請の配列
        Http-->>Res: data
        Res-->>Work: applications.data
        Note right of Work: 取得に失敗したときは data が無いので<br/>「出店申請」を出す
    end
    Work->>Work: groups を作る。マイページ（buyerMenu）、<br/>アカウント設定（accountSettings）、<br/>出店申請用は「出店をご検討の方」
    Note right of Work: 申請が無ければ「出店申請」、<br/>あれば「出店申請状況」（EC-B18）
    Work->>Side: WorkspaceSidebar(path, groups)
    Side-->>User: 「商品一覧へ戻る」とメニュー<br/>（「アカウント情報」を今の画面として示す）

    Note over User,Db: 基本フロー 2 「アカウント情報」画面を出す
    Work->>Acc: AccountPage（tab は 'アカウント情報'）
    Note right of Acc: 先頭の useResource('/auth/me') も GET /api/auth/me を<br/>送るが、この画面では結果を使わない。図では省略
    Acc->>Panel: AuthPanel を描く
    Panel->>UA: useAuth()
    Note right of UA: readSession() が GET /api/auth/me を送る。<br/>流れは詳細図 1 と同じ。図では省略
    UA-->>Panel: session
    Panel-->>User: session.name か session.email、<br/>accountLabels のアカウントの種類、「ログアウト」

    Note over User,Db: 基本フロー 3 指定のメニューを開く
    opt 指定のメニューが「アカウント情報」以外
        User->>Side: サイドバーのメニューをクリック
        Side->>Work: MenuLink の PageLink（Common.jsx）の follow() が<br/>navigate(href)。usePath() で path が変わる
        Work-->>User: path に合う画面<br/>（Notices、BuyerOrders、AccountPage の別の tab など）
    end
```

## ユースケース記述との差

- 関連情報では「アカウント情報」画面にメールアドレスを表示するとしています。コードは `session.name || session.email`（名前、無ければメールアドレス）を表示します。
- アカウントの種類の表示は、出店者（オーナー）、出店者（スタッフ）、出店申請用アカウント、管理者の 4 つです（`accountLabels`）。購入者（`USER`）は「利用者」と表示します。
- サイドバーの先頭に「商品一覧へ戻る」があります。記述にありません。
- `AccountPage` は「アカウント情報」のときも `useResource('/auth/me')` で `GET /api/auth/me` を送りますが、結果を使いません。記述にない通信です。
- 停止・除名されたアカウントは、`GET /api/auth/me` が 403 になり、画面にそのメッセージを出します。記述にない分岐です。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `KusakariHeader`、`follow`（「アカウント」は `authenticated` のときだけ）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader`、`workspace` の判定と `Workspace`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`、`usePath`、`currentPath`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `Workspace`（`buyerMenu`、`accountSettings`、`applicationLink`、未ログインの `AuthPanel`）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountPage.jsx): `AccountPage`、`accountActions`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `AuthPanel`、`accountLabels`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`
- [frontend/src/workspace/StoreApplication.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/StoreApplication.jsx): `applicationPaths`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session`、`current`、`organizationIdOf`、`organizationRoleOf`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `mine`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `list`
