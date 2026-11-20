# EC-C02 管理者画面のメニューを開く

- ユースケース記述: [EC-C02_管理者画面のメニューを開く](<../../アーカイブ/ユースケース/kusakari-ec/EC-C02_管理者画面のメニューを開く.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

共通ヘッダーの「管理者画面」は `/operator` を開きます。`navigation.js` の `currentPath()` が、履歴を増やさずに `/operator` を `/operator/members` に置き換えるので、最初に「会員管理」画面が出ます。画面は読み込み直さず、`Workspace` が運営者かどうかを確かめてメニューを出します。`GET /api/auth/me` のサーバーの処理は [EC-C01 の詳細図 1](<EC-C01_アカウントのメニューを開く.md>) と同じなので、この図では省略します。

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 共通ヘッダーと<br/>運営者画面 React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「管理者画面」をクリックする
    User->>Page: 共通ヘッダーの「管理者画面」をクリック
    Note right of Page: 「管理者画面」は運営者アカウントの<br/>ときだけ共通ヘッダーに出る
    Page->>Page: URL を /operator に変え、<br/>/operator/members に置き換える（読み込み直さない）

    Note over User,Db: 基本フロー 2 権限を確かめ、メニューと「会員管理」を出す
    Page->>Api: GET /api/auth/me
    Api->>Db: 会員と所属を読む
    Db-->>Api: 行
    Api-->>Page: 200 ログイン状態（accountType）
    Note right of Page: 共通代替フロー *b を適用<br/>（未ログインならログインのフォームを出す）
    alt 運営者アカウントでない（URL を直接開いた）
        Page-->>User: 「この画面を利用する権限がありません。」
    else 運営者アカウント
        Page-->>User: 「運営者メニュー」と折りたたみボタン、<br/>会員管理、商品管理、カテゴリ管理、出店審査、<br/>店舗管理、組織管理、全注文管理
        Note right of Page: 会員の一覧の取得（GET /api/operator/members）は<br/>EC-A01。図では省略
        Page-->>User: 見出し「会員管理」と「会員管理」画面
    end

    Note over User,Db: 基本フロー 3 指定のメニューを開く
    opt 指定のメニューが「会員管理」以外
        User->>Page: サイドバーのメニューをクリック
        Page->>Page: URL を変えて画面を切り替える（読み込み直さない）
        Page-->>User: 対象の画面（内容は呼び出し元のユースケース）
    end
    opt サイドバーを折りたたむ
        User->>Page: 「メニューを閉じる」をクリック
        Page-->>User: アイコンだけのサイドバー（通信なし）
    end
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as KusakariHeader.jsx
        participant App as App.jsx
        participant Nav as navigation.js
        participant Work as Workspace.jsx
        participant Side as WorkspaceSidebar.jsx
        participant Members as MembersPage<br/>OperatorPages.jsx
        participant UA as useAuth.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as AuthController
    end

    Note over User,Ctrl: 基本フロー 1 「管理者画面」をクリックする
    User->>Head: 「管理者画面」をクリック
    Note right of Head: showAdmin のときだけ描く。App.jsx が<br/>useAuth() の session の accountType が<br/>ADMIN かで渡す
    Head->>App: follow() が onNavigate(href)
    App->>Nav: navigateFromHeader() が navigate('/operator')
    Nav->>Nav: history.pushState() と popstate
    Nav->>Nav: currentPath() が /operator を<br/>/operator/members に置き換える（replaceState）
    Nav-->>App: usePath() が '/operator/members' を返す
    App->>Work: path が / と /cart 以外なので Workspace を描く

    Note over User,Ctrl: 基本フロー 2 権限を確かめ、メニューと「会員管理」を出す
    Work->>UA: useAuth()
    UA->>AuthJs: useEffect が readSession()
    AuthJs->>Ctrl: GET /api/auth/me
    Note right of Ctrl: サーバーの処理は EC-C01 の詳細図 1 と同じ。<br/>図では省略
    Ctrl-->>AuthJs: 200 SessionView
    AuthJs-->>UA: session
    UA-->>Work: session
    Note right of Work: 共通代替フロー *b を適用<br/>（未ログインなら AuthPanel のログインのフォーム）
    alt 運営者アカウントでない（accountType が ADMIN 以外）
        Work-->>User: 「この画面を利用する権限がありません。」
    else 運営者アカウント
        Work->>Work: groups を「運営者メニュー」（operatorMenu）にする。<br/>collapsible は true
        Work->>Side: WorkspaceSidebar(path, groups, collapsible, collapsed)
        Side-->>User: 「運営者メニュー」と折りたたみボタン、「商品一覧へ戻る」、<br/>会員管理、商品管理、カテゴリ管理、出店審査、<br/>店舗管理、組織管理、全注文管理
        Work-->>User: 見出し「会員管理」（menu から求めた title）
        Work->>Members: path が /operator/members なので MembersPage を描く
        Note right of Members: useResource('/operator/members') が<br/>GET /api/operator/members を送る。<br/>流れは EC-A01。図では省略
        Members-->>User: 「会員管理」画面（検索欄と会員の一覧）
    end

    Note over User,Ctrl: 基本フロー 3 指定のメニューを開く
    opt 指定のメニューが「会員管理」以外
        User->>Side: サイドバーのメニューをクリック
        Side->>Nav: MenuLink の PageLink（Common.jsx）の follow() が<br/>navigate(href)
        Nav-->>App: usePath() が新しい path を返す
        App->>Work: Workspace を描き直す
        Work-->>User: path に合う画面<br/>（ReviewPage、CategoriesPage、OrderPage など）
    end
    opt サイドバーを折りたたむ
        User->>Side: 「メニューを閉じる」をクリック
        Side->>Work: onToggle()
        Work->>Work: setSidebarClosed(true)
        Work-->>User: アイコンだけのサイドバー
    end
```

## ユースケース記述との差

- サイドバーの先頭に「商品一覧へ戻る」があります。記述にありません。
- 運営者以外が運営者画面の URL を開いたときの「この画面を利用する権限がありません。」は、画面（`Workspace`）が `accountType` で判断します。このときサーバーには運営者用の API を送りません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `KusakariHeader`、`follow`（「管理者画面」は `showAdmin` のときだけ）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader`、`showAdmin` の判定、`Workspace`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`、`usePath`、`currentPath`（`/operator` の置き換え）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `Workspace`（`operatorMenu`、権限の判定、`setSidebarClosed`）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`、`onToggle`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `MembersPage`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
