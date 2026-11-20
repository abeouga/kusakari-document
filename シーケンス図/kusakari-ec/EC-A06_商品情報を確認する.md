# EC-A06 商品情報を確認する

- ユースケース記述: [EC-A06_商品情報を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A06_商品情報を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 商品管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインならログインの画面を表示する)

    Note over User,Db: 基本フロー 1〜2 画面を開いて商品の一覧を表示する
    User->>Page: 運営者メニューの「商品管理」をクリック
    Page->>Api: GET /api/operator/products
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 店舗、在庫、商品の警告と警告解除の履歴、<br/>商品をすべて読む
    Db-->>Api: stores、inventory、product_moderation_events、<br/>products の行
    Api->>Api: 商品ごとに店舗名、削除済みか、<br/>公開停止中か、今の警告をまとめる
    Api-->>Page: 200 商品の配列
    alt 2a 商品が 1 件もない
        Page-->>User: 「対象の商品はありません。」
    else 商品がある
        Page-->>User: 商品名、店舗名、公開状態<br/>(公開可能 / 公開停止中 / 販売終了)<br/>警告中なら「警告中」のバッジと理由
    end

    Note over User,Db: 基本フロー 3 対象商品の状態を確かめる (通信しない)

    Note over User,Db: 基本フロー 4〜5 「警告・停止の履歴」を開く
    User->>Page: 対象商品の「警告・停止の履歴」を開く
    Page->>Api: GET /api/operator/products/{id}/moderation-events
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 商品の有無と、その商品の履歴を新しい順に読む
    Db-->>Api: product_moderation_events の行
    Api->>Db: 操作した運営者の会員を読む
    Db-->>Api: members の行
    Api-->>Page: 200 履歴の配列 (新しい順)
    alt 5a 履歴がない
        Page-->>User: 「履歴はありません。」
    else 履歴がある
        Page-->>User: 日時、操作 (警告 / 警告の解除 / 停止 / 再開)、<br/>操作した運営者、理由
    end
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as ReviewPage<br/>ProductModerationRow<br/>OperatorPages.jsx
        participant Mod as ModerationControls<br/>ModerationEvents<br/>Moderation.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductModeration<br/>Controller
        participant Svc as ProductModeration<br/>Service
        participant Auth as AuthService
        participant Hist as Moderation<br/>History
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。Workspace は未ログインなら AuthPanel を出し、<br/>API は未ログインの要求に 401 LOGIN_REQUIRED を返す (AuthConfiguration)
    Note over Svc,Db: Repository (Spring Data JPA のインターフェース) はライフラインにせず、<br/>Service から MySQL への矢印に Repository のメソッド名を書く

    Note over User,Db: 基本フロー 1〜2 画面を開いて商品の一覧を表示する
    User->>Work: 運営者メニューの「商品管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/products') を呼ぶ。<br/>session.accountType が ADMIN でなければ<br/>「この画面を利用する権限がありません。」を出す
    Work->>Page: path が /operator/products なので<br/>ReviewPage (products は true) を表示
    Page->>Hook: useResource('/operator/products')
    Note right of Hook: useEffect が reload() を自動で実行する。<br/>取得中は ResourceStatus が「読み込んでいます。」を出す
    Hook->>Http: request('/operator/products')
    Http->>Ctrl: GET /api/operator/products
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: ADMIN でなければ ApiException(403, FORBIDDEN)。<br/>画面が ADMIN 以外にこの画面を出さないので、<br/>図では枝を省略
    Auth-->>Svc: 戻る
    Svc->>Db: StoreRepository.findAll()
    Db-->>Svc: 全店舗 (店舗 ID と店舗名の Map にする)
    Svc->>Db: InventoryRepository.findAll()
    Db-->>Svc: 全在庫 (商品 ID と publicationStatus の Map にする)
    Svc->>Db: ProductModerationEventRepository<br/>findByEventTypeInOrderByIdDesc(WARN、CLEAR_WARNING)
    Db-->>Svc: 警告と警告解除の行 (新しい順)
    Svc->>Hist: activeWarnings(行, getProductId)
    Hist-->>Svc: 最新の行が WARN の商品と、その Warning (理由、日時)
    Svc->>Db: ProductRepository.findAll()<br/>(@EntityGraph で product_images も読む)
    Db-->>Svc: 全商品の ProductEntity
    Svc->>Svc: 商品ごとに Product を作る<br/>active は在庫が DELETED でないか、suspended は products の列
    Svc-->>Ctrl: Product のリスト<br/>(id、name、storeId、storeName、active、suspended、warning)
    Ctrl-->>Http: 200 Product の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Note right of Page: 取得に失敗すると ResourceStatus が<br/>message と「再取得」ボタンを出す (共通代替フロー *a)
    alt 2a 商品が 1 件もない (shown.length が 0)
        Page-->>User: 「対象の商品はありません。」
    else 商品がある
        loop 商品ごと (ProductModerationRow)
            Page->>Page: suspended なら「公開停止中」、<br/>そうでなく active なら「公開可能」、それ以外は「販売終了」
            Page->>Mod: ModerationControls を表示 (suspended、warning)
            Mod-->>User: WarningBadge 「警告中」「運営からの警告：理由」と日時、<br/>「警告・停止の履歴」、警告・停止の操作 (EC-A10)
        end
        Page-->>User: 商品名、「店舗：店舗名」、公開状態
    end

    Note over User,Db: 基本フロー 3 対象商品の状態を確かめる (通信しない)

    Note over User,Db: 基本フロー 4〜5 「警告・停止の履歴」を開く
    User->>Mod: 対象商品の「警告・停止の履歴」(details) を開く
    Mod->>Mod: onToggle で setHistoryOpen(true)<br/>ModerationEvents を表示
    Mod->>Hook: useResource('/operator/products/{id}/moderation-events')
    Note right of Hook: 開いたときに初めて取得する。<br/>取得中は「読み込み中です。」を出す
    Hook->>Http: request('/operator/products/{id}/moderation-events')
    Http->>Ctrl: GET /api/operator/products/{id}/moderation-events
    Ctrl->>Svc: events(id)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Auth-->>Svc: 戻る
    Svc->>Db: ProductRepository.existsById(id)
    Db-->>Svc: true
    Note right of Svc: false なら ApiException(404, PRODUCT_NOT_FOUND)。<br/>一覧にある商品から開くので図では枝を省略
    Svc->>Db: ProductModerationEventRepository<br/>findByProductIdOrderByIdDesc(id)
    Db-->>Svc: その商品の履歴 (新しい順)
    Svc->>Hist: views(履歴)
    Hist->>Db: AuthMemberRepository.findAllById(操作した運営者の ID)
    Db-->>Hist: AuthMember のリスト
    Hist-->>Svc: EventView のリスト<br/>(type、reason、actorName は表示名、なければメールアドレス、createdAt)
    Svc-->>Ctrl: EventView のリスト
    Ctrl-->>Http: 200 EventView の配列
    Http-->>Hook: data
    Hook-->>Mod: resource.data
    Note right of Mod: 取得に失敗すると resource.error の文だけを出す
    alt 5a 履歴がない (events.length が 0)
        Mod-->>User: 「履歴はありません。」
    else 履歴がある
        Mod-->>User: 1 行ずつ「日時 警告 / 警告の解除 / 停止 / 再開<br/>(運営者名)：理由」
    end
```

## ユースケース記述との差

- 基本フロー 5: 履歴の取得に失敗したとき、`ModerationEvents` はエラーの文だけを出し、「再取得」ボタンを出しません。「警告・停止の履歴」を閉じて開き直すと、`ModerationEvents` を作り直して取り直します。共通代替フロー *a の「再実行を可能にする」とは、再実行の方法が違います。
- 基本フロー 5: 「操作した運営者」は、会員の表示名です。表示名が空なら、メールアドレスを出します（`ModerationHistory.nameOf()`）。記述にはこの決まりが書かれていません。

## 確かめられなかったこと

- 商品の一覧の並び順です。`ProductModerationService.list()` は `ProductRepository.findAll()` の順のまま返し、ORDER BY も並べ替えもありません。実際に MySQL が返す順は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `ReviewPage`、`ProductModerationRow`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Moderation.jsx): `ModerationControls`、`WarningBadge`、`ModerationEvents`、`eventLabels`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java): `list`、`events`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `list`、`events`、`Product`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `activeWarnings`、`views`、`nameOf`
- [backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java): `Warning`、`EventView`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findAll`（`@EntityGraph`）、`existsById`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java): `findByEventTypeInOrderByIdDesc`、`findByProductIdOrderByIdDesc`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findAllById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 LOGIN_REQUIRED）
