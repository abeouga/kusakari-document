# EC-C03 出店者画面のメニューを開く

- ユースケース記述: [EC-C03_出店者画面のメニューを開く](<../../アーカイブ/ユースケース/kusakari-ec/EC-C03_出店者画面のメニューを開く.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

出店者が扱える店舗の一覧（`GET /api/seller/stores`）は、「出店者」をクリックする前、EC の画面を開いたときに `useShop` が読み込みます。「出店者」をクリックしても画面は読み込み直さず、`navigation.js` の `currentPath()` が `/seller` を `/seller/products` に置き換えるので、最初に「商品管理」画面が出ます。代替フロー 3a〜3c は、読み込み済みの店舗の一覧と、店舗ごとのロール（`memberRole`）で画面が決めます。詳細図は、EC の画面を開いたときの読み込み（詳細図 1）と、メニューと画面の表示（詳細図 2）に分けました。`GET /api/auth/me` のサーバーの処理は [EC-C01 の詳細図 1](<EC-C01_アカウントのメニューを開く.md>) と同じなので、この図では省略します。

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 共通ヘッダーと<br/>出店者画面 React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: EC の画面を開いたとき（「出店者」のクリックより前）
    Page->>Api: GET /api/auth/me
    Api->>Db: 会員と所属を読む
    Db-->>Api: 行
    Api-->>Page: 200 ログイン状態（accountType、organizationRole）
    opt オーナー、担当者、運営者
        Page->>Api: GET /api/seller/stores
        alt 取得できた
            Api->>Db: 会員を読み、店舗側のアカウントか運営者かを確かめる
            Db-->>Api: 行
            alt 運営者
                Api->>Db: 全店舗を読む
                Db-->>Api: 行
            else オーナー、担当者
                Api->>Db: 組織か所属の店舗と、店舗ごとのロールを読む
                Db-->>Api: 行
            end
            Api-->>Page: 200 店舗の一覧（店舗ごとの memberRole）
        else 取得できない
            Api-->>Page: エラー、通信の失敗
            Page->>Page: 店舗の一覧を空にする（エラーは出さない）
        end
    end
    Page-->>User: 共通ヘッダーに「出店者」

    Note over User,Db: 基本フロー 1 「出店者」をクリックする
    User->>Page: 共通ヘッダーの「出店者」をクリック
    Page->>Page: URL を /seller に変え、<br/>/seller/products に置き換える（読み込み直さない）

    Note over User,Db: 基本フロー 2 メニューと「商品管理」を出す
    Page->>Api: GET /api/auth/me
    Api-->>Page: 200 ログイン状態
    Note right of Page: 共通代替フロー *b を適用<br/>（未ログインならログインのフォームを出す）
    alt 出店者・運営者のアカウントでない（URL を直接開いた）
        Page-->>User: 「この画面を利用する権限がありません。」
    else 店舗に所属していない担当者
        Page-->>User: メニューは「出店者通知」だけ。「どの店舗にも所属していないため、<br/>この画面は使えません。自分あての通知だけを見られます。」
    else 出店者、運営者
        Page-->>User: 出店者メニュー（商品管理、店舗受け取り、注文実績、<br/>店舗一覧、店舗プロフィール、出店者通知）。<br/>オーナー、ORG_ADMIN、いずれかの店舗の MANAGER には<br/>アカウント、招待キー、オーナーと ORG_ADMIN には履歴
        alt 3c 選んだ店舗で担当のロールがない（ORG_ADMIN）
            Page-->>User: 「(店舗名)では担当のロールがないため、<br/>人事（アカウント・招待キー）の画面だけを使えます。」
        else ロールがある、または店舗がない
            alt 3b 管理できる店舗がない
                Page-->>User: 「商品管理」と「管理できる店舗がありません。」
            else 店舗がある
                Note right of Page: 商品の一覧の取得（GET /api/seller/products）は<br/>EC-S03 など。図では省略
                Page-->>User: 「管理する店舗」の選択欄と「商品管理」画面
            end
        end
    end

    Note over User,Db: 基本フロー 3 サイドバーのメニューを選ぶ
    User->>Page: サイドバーのメニューをクリック
    Page->>Page: URL を変えて画面を切り替える（読み込み直さない）
    alt 3c ロールのない店舗で、商品管理・商品登録・店舗受け取り・店舗プロフィール
        Page-->>User: 「(店舗名)では担当のロールがないため、…」
        Note right of User: 3c-2 ユースケースを終了する
    else 3b 店舗受け取り・店舗プロフィール・招待キー・履歴で、店舗がない
        Page-->>User: 「管理できる店舗がまだありません。」と「店舗一覧を開く」
        Note right of User: 3b-2 ユースケースを終了する
    else 開ける
        opt 3a-1 店舗ごとの画面で、店舗が 2 つ以上
            Page-->>User: 画面の上に「管理する店舗」の選択欄
        end
        Page-->>User: 対象の画面（内容は呼び出し元のユースケース）
    end
    opt 3a-2 管理する店舗を選ぶ
        User->>Page: 「管理する店舗」で店舗を選ぶ
        Page->>Page: 選んだ店舗をブラウザーに保存する（通信なし）
        Page-->>User: 3a-3 選んだ店舗の内容で画面を描き直す<br/>（内容の取得は呼び出し元のユースケース）
    end
    opt サイドバーを折りたたむ
        User->>Page: 「メニューを閉じる」をクリック
        Page-->>User: アイコンだけのサイドバー（通信なし）
    end
```

## 詳細図 1 EC の画面を開いたときの読み込み

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as App.jsx
        participant Head as KusakariHeader.jsx
        participant Shop as useShop.js
        participant UA as useAuth.js
        participant AuthJs as auth.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant Ctrl as StoreController
        participant Svc as StoreService
        participant Auth as AuthService
    end
    participant Db as MySQL

    Note over User,Db: EC の画面を開いたとき（「出店者」のクリックより前）
    App->>Shop: useShop()
    App->>UA: useAuth()（共通ヘッダー用）
    Shop->>UA: useAuth()（店舗の読み込み用）
    UA->>AuthJs: それぞれの useEffect が readSession()
    AuthJs->>AuthCtrl: GET /api/auth/me（2 回）
    Note right of AuthCtrl: サーバーの処理は EC-C01 の詳細図 1 と同じ。<br/>図では省略
    AuthCtrl-->>AuthJs: 200 SessionView
    AuthJs-->>UA: session
    UA-->>Shop: session
    UA-->>App: session
    Shop->>Shop: sellerAccount は canSell(session)<br/>（SHOP_OWNER、SHOP_STAFF、ADMIN）
    opt オーナー、担当者、運営者
        Shop->>Shop: useEffect が reloadSellerStores()
        Shop->>Http: request('/seller/stores')
        Http->>Ctrl: GET /api/seller/stores
        alt 取得できた
            Ctrl->>Svc: mine()
            Note right of Svc: 読み取り専用のトランザクション
            Svc->>Auth: requireSellerRole() と current()
            Auth->>Db: SELECT members ほか
            Db-->>Auth: 行
            Auth-->>Svc: AuthMember
            alt 運営者（isAdmin）
                Svc->>Db: stores.findAllByOrderByIdAsc() が SELECT stores
                Db-->>Svc: 行
                Note right of Svc: managedList() は memberRole を付けない
            else オーナー、担当者
                Svc->>Auth: candidateStoreIdsOf(member)
                Auth->>Db: SELECT organizations、organization_members、<br/>stores、store_members
                Db-->>Auth: 行
                Auth-->>Svc: 店舗 ID のリスト（ORG_ADMIN は組織の全店舗、<br/>ほかの担当者はロールの無い所属も含む）
                Svc->>Db: stores.findAllById() が SELECT stores
                Db-->>Svc: 行
                Svc->>Auth: memberRoleAt(member, store)（店舗ごと）
                Auth-->>Svc: OWNER、MANAGER、STAFF、NONE か null
            end
            Note right of Svc: 運営の警告と未完了の注文の件数も読む。<br/>図では省略
            Svc-->>Ctrl: Profile のリスト
            Ctrl-->>Http: 200 店舗の配列（memberRole つき）
            Http-->>Shop: setOwnStores(stores)
        else 取得できない（通信の失敗、5xx など）
            Http--xShop: throw ApiError
            Shop->>Shop: catch で setOwnStores([])
        end
    end
    Shop-->>App: sellerStores、sellerStoreId<br/>（localStorage の kusakari.sellerStoreId の店舗、無ければ先頭）
    App->>Head: showSeller は canSell(session)
    Head-->>User: 共通ヘッダーに「出店者」
```

## 詳細図 2 基本フロー 1〜3 メニューと画面を出す

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as KusakariHeader.jsx
        participant App as App.jsx
        participant Nav as navigation.js
        participant Work as Workspace.jsx
        participant Side as WorkspaceSidebar.jsx
        participant Shop as useShop.js
        participant PM as ProductManager.jsx
        participant Sel as SellerStoreSelect.jsx
        participant UA as useAuth.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
    end

    Note over User,AuthCtrl: 基本フロー 1 「出店者」をクリックする
    User->>Head: 「出店者」をクリック
    Head->>App: follow() が onNavigate(href)
    App->>Nav: navigateFromHeader() が navigate('/seller')
    Nav->>Nav: history.pushState() と popstate。<br/>currentPath() が /seller を /seller/products に置き換える
    Nav-->>App: usePath() が '/seller/products' を返す
    App->>Work: path が / と /cart 以外なので Workspace を描く

    Note over User,AuthCtrl: 基本フロー 2 メニューと「商品管理」を出す
    Work->>UA: useAuth()
    UA->>AuthJs: useEffect が readSession()
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 SessionView
    AuthJs-->>UA: session
    UA-->>Work: session（accountType、organizationRole）
    Note right of Work: 共通代替フロー *b を適用<br/>（未ログインなら AuthPanel のログインのフォーム）
    Work->>Shop: sellerStores、sellerStoreId、sellerStoresLoading
    Shop-->>Work: 詳細図 1 で読んだ店舗と、選んでいる店舗
    alt 出店者・運営者のアカウントでない（canSell が false）
        Work-->>User: 「この画面を利用する権限がありません。」
    else 店舗に所属していない担当者（unassigned）
        Work->>Side: groups は「出店者通知」（noticeItem）だけ
        Side-->>User: 「出店者メニュー」と「出店者通知」
        Work-->>User: 「どの店舗にも所属していないため、この画面は使えません。<br/>自分あての通知だけを見られます。」
    else 出店者、運営者
        Work->>Work: personnel はオーナー、ORG_ADMIN、<br/>いずれかの店舗の MANAGER か
        Work->>Side: groups を「出店者メニュー」にする。sellerMenu、<br/>personnel なら personnelMenu、オーナーと ORG_ADMIN なら historyItem
        Side-->>User: 「出店者メニュー」と折りたたみボタン、<br/>「商品一覧へ戻る」とメニュー
        alt 3c 選んだ店舗で担当のロールがない（personnelOnly）
            Work-->>User: 「(店舗名)では担当のロールがないため、<br/>人事（アカウント・招待キー）の画面だけを使えます。」
        else ロールがある、または店舗がない
            Work->>PM: ProductManager（embedded）
            PM->>Sel: SellerStoreSelect（店舗が 1 つでも出す）
            alt 3b 管理できる店舗がない（sellerStoreId が 0）
                Sel-->>User: 「管理できる店舗がありません。」
            else 店舗がある
                Sel-->>User: 「管理する店舗」の選択欄
                Note right of PM: useSellerCatalog() が GET /api/seller/products?storeId=… を<br/>送る。商品管理の中身は EC-S03 など。図では省略
                PM-->>User: 「商品管理」画面
            end
        end
    end

    Note over User,AuthCtrl: 基本フロー 3 サイドバーのメニューを選ぶ
    User->>Side: サイドバーのメニューをクリック
    Side->>Nav: MenuLink の PageLink（Common.jsx）の follow() が navigate(href)
    Nav-->>App: usePath() が新しい path を返す
    App->>Work: Workspace を描き直す
    alt 3c ロールのない店舗で、rolePaths（商品管理、商品登録、<br/>店舗受け取り、店舗プロフィール）
        Work-->>User: 「(店舗名)では担当のロールがないため、…」
        Note right of User: 3c-2 ユースケースを終了する
    else 3b storePaths（店舗受け取り、店舗プロフィール、招待キー、履歴）で、店舗がない
        Work-->>User: 「管理できる店舗がまだありません。」と「店舗一覧を開く」
        Note right of User: 3b-2 ユースケースを終了する
    else 開ける
        opt 3a-1 storePaths の画面で、店舗が 2 つ以上
            Work->>Sel: 画面の上に SellerStoreSelect を描く
            Sel-->>User: 「管理する店舗」の選択欄
        end
        Work-->>User: path に合う画面（内容は呼び出し元のユースケース）
    end
    opt 3a-2 管理する店舗を選ぶ
        User->>Sel: 「管理する店舗」で店舗を選ぶ
        Sel->>Shop: setSellerStoreId(id)
        Shop->>Shop: localStorage に kusakari.sellerStoreId を保存する
        Shop-->>Work: sellerStoreId が変わる
        Work-->>User: 3a-3 選んだ店舗の内容で画面を描き直す<br/>（内容の取得は呼び出し元のユースケース）
    end
    opt サイドバーを折りたたむ
        User->>Side: 「メニューを閉じる」をクリック
        Side->>Work: onToggle()
        Work->>Work: setSidebarClosed(true)
        Work-->>User: アイコンだけのサイドバー
    end
```

## ユースケース記述との差

- 基本フロー 2：オーナーと ORG_ADMIN には、「アカウント」「招待キー」のほかに「履歴」（`/seller/member-events`）も表示します。記述にありません。
- 3a：「商品管理」では、店舗が 1 つでも「管理する店舗」の選択欄を出します（`ProductManager` の `SellerStoreSelect`）。ほかの画面は店舗が 2 つ以上のときだけです。選択欄を出す画面には「履歴」も含みます。
- 3b：「管理できる店舗がまだありません。」と「店舗一覧を開く」を出すのは、「店舗受け取り」「店舗プロフィール」「招待キー」「履歴」です。「商品管理」は選択欄の位置に「管理できる店舗がありません。」を出します。「注文実績」は `SalesPage` が `GET /api/seller/sales/stores` で読める店舗を決めます。
- 3b：記述は「担当の店舗がない担当者」にも「管理できる店舗がまだありません。」を出すとしています。コードでは、どの店舗にも所属していない担当者（ORG_ADMIN を除く）は、メニューが「出店者通知」だけになり、「どの店舗にも所属していないため、この画面は使えません。自分あての通知だけを見られます。」を出します。
- 3c：「注文実績」は、3c の表示より先に `SalesPage` を出す分岐があるので、ロールの無い店舗を選んでも 3c の文言は出ません。3c の文言は「商品登録」（`/seller/products/new`）でも出ます。
- `GET /api/seller/stores` に失敗すると、画面は店舗の一覧を空として扱い、通信エラーを出しません（`reloadSellerStores` の `catch`）。3b と同じ表示になり、共通代替フロー *a の「通信エラーを表示する」と違います。
- サイドバーの先頭に「商品一覧へ戻る」があります。記述にありません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `KusakariHeader`、`follow`（「出店者」は `showSeller` のときだけ）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader`、`showSeller`、`Workspace`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `canSell`、`readSession`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `useAuth`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `reloadSellerStores`、`setSellerStoreId`、`savedStoreChoice`、`sellerStores`、`sellerStoreId`、`sellerStoresLoading`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`、`usePath`、`currentPath`（`/seller` の置き換え）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`personnelMenu`、`historyItem`、`storePaths`、`rolePaths`、`unassigned`、`personnelOnly`、`personnel`
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductManager.jsx): `ProductManager`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerStoreSelect.jsx): `SellerStoreSelect`
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/SalesReport.jsx): `SalesPage`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `mine`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `mine`、`managedList`、`withOpenOrders`、`withRole`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSellerRole`、`current`、`candidateStoreIdsOf`、`memberRoleAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
