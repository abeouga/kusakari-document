# EC-A05 店舗情報を確認する

- ユースケース記述: [EC-A05_店舗情報を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A05_店舗情報を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 店舗管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインならログインの画面を表示する)

    Note over User,Db: 基本フロー 1〜2 画面を開いて店舗の一覧を表示する
    User->>Page: 運営者メニューの「店舗管理」をクリック
    Page->>Api: GET /api/operator/stores
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 店舗をすべて ID 順に読む
    Db-->>Api: stores の行
    Api->>Db: 店舗の警告と警告解除の履歴を読む
    Db-->>Api: store_moderation_events の行
    Api->>Db: 店舗ごとに、組織の名前と<br/>未完了の注文の件数を読む
    Db-->>Api: organizations の行と件数
    Api-->>Page: 200 店舗の配列
    alt 2a 店舗が 1 件もない
        Page-->>User: 「対象の店舗はありません。」
    else 店舗がある
        Page-->>User: 店舗名、会社名 / 所在地、状態、「注文実績を見る」<br/>警告中なら「警告中」のバッジと理由
    end

    Note over User,Db: 基本フロー 3〜4 検索する (取得済みの一覧を画面で絞り込み、通信しない)
    User->>Page: 「店舗名・会社名・所在地で検索」欄に入力
    Page->>Page: 店舗名・会社名・所在地に<br/>入力した文字を含む店舗だけ残す
    alt 4a 該当する店舗がない
        Page-->>User: 「検索条件に一致する店舗はありません。」
        Note right of User: 4a-2 基本フロー 3 へ戻る
    else 該当する店舗がある
        Page-->>User: 部分一致した店舗だけの一覧
    end

    Note over User,Db: 基本フロー 5 店舗の情報を確かめる (通信しない)

    Note over User,Db: 代替フロー 5a 店舗の注文実績を確認する
    User->>Page: 対象店舗の「注文実績を見る」をクリック
    Page->>Api: GET /api/operator/stores/{storeId}/sales
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 店舗と、その店舗の注文を新しい順に読む
    Db-->>Api: stores と orders の行
    Api->>Api: 注文ごとの手数料・差引額と合計を計算
    Api-->>Page: 200 店舗名、閉鎖日時、注文の行、合計
    Page-->>User: 「店舗の注文実績」画面<br/>件数、注文金額・販売手数料・差引額の合計、注文ごとの一覧
    Note right of User: 閉鎖済みの店舗なら「閉鎖済み」と、<br/>読み取り専用であることも出す
    User->>Page: 「店舗管理へ戻る」をクリック
    Page->>Api: GET /api/operator/stores
    Note over Api,Db: 読む内容は基本フロー 2 と同じ
    Api-->>Page: 200 店舗の配列
    Page-->>User: 「店舗管理」画面 (5a-3 基本フロー 2 へ戻る)
```

## 詳細図 1 基本フロー 1〜5

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as OperatorStoresPage<br/>OperatorStores.jsx
        participant Mod as ModerationControls<br/>Moderation.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreController
        participant Svc as StoreService
        participant Auth as AuthService
        participant Mods as StoreModeration<br/>Service
        participant Open as OpenOrders
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。Workspace は未ログインなら AuthPanel を出し、<br/>API は未ログインの要求に 401 LOGIN_REQUIRED を返す (AuthConfiguration)
    Note over Svc,Db: Repository (Spring Data JPA のインターフェース) はライフラインにせず、<br/>Service から MySQL への矢印に Repository のメソッド名を書く

    Note over User,Db: 基本フロー 1〜2 画面を開いて店舗の一覧を表示する
    User->>Work: 運営者メニューの「店舗管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/sellers') を呼ぶ。<br/>session.accountType が ADMIN でなければ<br/>「この画面を利用する権限がありません。」を出す
    Work->>Page: path が /operator/sellers なので<br/>OperatorStoresPage を表示
    Page->>Hook: useResource('/operator/stores')
    Note right of Hook: useEffect が reload() を自動で実行する。<br/>取得中は ResourceStatus が「読み込んでいます。」を出す
    Hook->>Http: request('/operator/stores')
    Http->>Ctrl: GET /api/operator/stores
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: ADMIN でなければ ApiException(403, FORBIDDEN)。<br/>画面が ADMIN 以外にこの画面を出さないので、<br/>図では枝を省略
    Auth-->>Svc: 戻る
    Svc->>Db: StoreRepository.findAllByOrderByIdAsc()
    Db-->>Svc: 全店舗の StoreEntity (ID 順)
    Svc->>Mods: managedList() が warnings(店舗 ID の一覧)
    Mods->>Db: StoreModerationEventRepository<br/>findByStoreIdInAndEventTypeInOrderByIdDesc()<br/>(WARN と CLEAR_WARNING)
    Db-->>Mods: 履歴の行 (新しい順)
    Mods->>Mods: ModerationHistory.activeWarnings()<br/>店舗ごとに最新の行が WARN なら警告中
    Mods-->>Svc: 店舗 ID と Warning (理由、日時) の Map
    loop 店舗ごと
        Svc->>Svc: withOpenOrders(s) が view(s) を呼ぶ
        Svc->>Db: view() が OrganizationRepository.findById()
        Db-->>Svc: 組織 (名前を company にする)
        Svc->>Open: count(List.of(店舗 ID))
        Open->>Db: OrderRepository.countByStatus()<br/>PENDING_PAYMENT、ACCEPTED、READY
        Db-->>Open: 件数
        Open-->>Svc: openOrderCount
    end
    Svc-->>Ctrl: Profile のリスト<br/>(enabled、published、closingStartedAt、<br/>closingStartedBy、closedAt、openOrderCount、warning)
    Ctrl-->>Http: 200 Profile の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Note right of Page: 取得に失敗すると ResourceStatus が<br/>message と「再取得」ボタンを出す (共通代替フロー *a)
    Page->>Page: all.filter で絞り込む<br/>(query は空なので全店舗が残る)
    alt 2a all が空
        Page-->>User: 「対象の店舗はありません。」
    else 店舗がある
        loop 店舗ごと
            Page->>Page: stateOf(store) (SellerStores.jsx)<br/>閉鎖済み → 閉鎖中 (運営が開始 / オーナーが開始・未完了の注文 N件)<br/>→ 運営により停止中 → 公開中 / 非公開 の順に決める
            Page->>Mod: closedAt が空の店舗だけ ModerationControls を表示
            Mod-->>User: WarningBadge 「警告中」「運営からの警告：理由」と日時、<br/>警告・停止の操作 (EC-A11)
        end
        Note right of Page: 閉鎖・閉鎖の取り消し・まとめてキャンセルの<br/>ボタンも出す。図では省略
        Page-->>User: 店舗名、会社名 / 所在地、状態、<br/>「注文実績を見る」リンク
    end

    Note over User,Db: 基本フロー 3〜4 検索する (サーバーには問い合わせない)
    User->>Page: 「店舗名・会社名・所在地で検索」欄に入力
    Page->>Page: onChange で setQuery(入力値)
    Page->>Page: all.filter で、name、company、address を<br/>空白でつないだ文字列が query を含む店舗だけ残す (includes)
    alt 4a 該当する店舗がない
        Page-->>User: 「検索条件に一致する店舗はありません。」
        Note right of User: 4a-2 基本フロー 3 へ戻る
    else 該当する店舗がある
        Page-->>User: 部分一致した店舗だけの一覧
    end

    Note over User,Db: 基本フロー 5 店舗の情報を確かめる (通信しない)。5a は詳細図 2
```

## 詳細図 2 代替フロー 5a 店舗の注文実績を確認する

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as OperatorStoresPage<br/>OperatorStores.jsx
        participant Work as Workspace.jsx
        participant Sales as SalesReport<br/>SalesReport.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SCtrl as SalesReport<br/>Controller
        participant SSvc as SalesReport<br/>Service
        participant Auth as AuthService
        participant Ctrl as StoreController
    end
    participant Db as MySQL

    Note over User,Db: 代替フロー 5a-1〜5a-2 店舗の注文実績を開く
    User->>Page: 対象店舗の「注文実績を見る」をクリック
    Page->>Work: PageLink の follow() が<br/>navigate('/operator/stores/{storeId}/sales')
    Note right of Work: navigate() は pushState のあと popstate を出し、<br/>App の usePath() が path を変えて Workspace を描き直す
    Work->>Work: path が operatorSales の形に一致<br/>見出しは「店舗の注文実績」
    Work->>Sales: 「店舗管理へ戻る」リンクと<br/>SalesReport(storeId, operator) を表示
    Sales->>Hook: useResource('/operator/stores/{storeId}/sales')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/operator/stores/{storeId}/sales')
    Http->>SCtrl: GET /api/operator/stores/{storeId}/sales
    SCtrl->>SSvc: operatorReport(storeId)
    Note right of SSvc: @Transactional(readOnly = true)
    SSvc->>Auth: requireAdmin()
    Auth-->>SSvc: 戻る
    SSvc->>Db: StoreRepository.findById(storeId)
    Db-->>SSvc: StoreEntity
    Note right of SSvc: 店舗がなければ ApiException(404, STORE_NOT_FOUND)。<br/>一覧のリンクから開くので図では枝を省略
    SSvc->>Db: build() が OrderRepository<br/>findByStoreIdOrderByCreatedAtDesc()
    Db-->>SSvc: 店舗の注文 (新しい順)
    SSvc->>SSvc: row() で注文ごとの行を作る<br/>手数料率・販売手数料・差引額は OrderResponseMapper.figures()
    SSvc->>SSvc: SalesTotals を数える<br/>注文数と金額の合計は、キャンセルと支払い待ちを除く
    SSvc-->>SCtrl: SalesReport (storeId、storeName、closedAt、orders、totals)
    SCtrl-->>Http: 200 SalesReport
    Http-->>Hook: data
    Hook-->>Sales: resource.data
    Note right of Sales: closedAt があれば「閉鎖済み」と<br/>「(日時)に閉鎖した店舗です。注文実績は<br/>読み取り専用で、期限なく確認できます。」を出す
    Sales-->>User: 店舗名、注文数・支払い待ち・キャンセル・キャンセル申請中の件数、<br/>注文金額・販売手数料・差引額、注文ごとの一覧<br/>(注文番号、注文日時、状態、支払方法、注文金額、手数料率、販売手数料、差引額)

    Note over User,Db: 代替フロー 5a-3 店舗管理へ戻る
    User->>Work: 「店舗管理へ戻る」をクリック
    Work->>Page: PageLink の follow() が navigate('/operator/sellers')<br/>OperatorStoresPage を新しく表示 (検索欄は空)
    Page->>Hook: useResource('/operator/stores')
    Hook->>Http: request('/operator/stores')
    Http->>Ctrl: GET /api/operator/stores
    Note over Ctrl,Db: StoreService.list() の流れは詳細図 1 と同じ
    Ctrl-->>Http: 200 Profile の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page-->>User: 店舗の一覧 (基本フロー 2 へ戻る)
```

## ユースケース記述との差

- 基本フロー 2: API は閉鎖済みの店舗にも `warning` を返します。ところが画面は、`closedAt` がある店舗に `ModerationControls` を出しません。`WarningBadge` は `ModerationControls` の中にあるので、閉鎖済みの店舗は警告中でも「警告中」のバッジと理由が出ません。記述は「警告中の店舗には『警告中』のバッジと警告の理由を表示する」としています。
- 基本フロー 4: 絞り込みは JavaScript の `includes` です。店舗名・会社名・所在地を空白でつないだ 1 つの文字列を探すので、大文字と小文字を区別し、入力の前後の空白も取り除きません。記述にはこの決まりが書かれていません。
- 5a-2: 注文が 1 件もない店舗では、一覧の代わりに「この店舗の注文はまだありません。」を出します。また「注文数」と金額の合計は、キャンセルと支払い待ちの注文を除いて数えます（`SalesReportService.build()`、`OrderResponseMapper.figures()` の `counted`）。どちらも記述にはありません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`operatorSales`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応、「店舗管理へ戻る」）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/workspace/OperatorStores.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorStores.jsx): `OperatorStoresPage`（`query`、`all.filter`、空の一覧の文言、「注文実績を見る」）
- [frontend/src/workspace/SellerStores.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/SellerStores.jsx): `stateOf`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Moderation.jsx): `ModerationControls`、`WarningBadge`
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/SalesReport.jsx): `SalesReport`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `list`、`managedList`、`withOpenOrders`、`view`、`Profile`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java): `warnings`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `activeWarnings`、`WARNING_TYPES`
- [backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java): `count`、`BLOCKING`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAllByOrderByIdAsc`
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/StoreModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/StoreModerationEventRepository.java): `findByStoreIdInAndEventTypeInOrderByIdDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `countByStatus`、`findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java): `operator`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java): `operatorReport`、`build`、`row`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `figures`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 LOGIN_REQUIRED）
