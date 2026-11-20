# EC-B13 注文履歴を確認する

- ユースケース記述: [EC-B13_注文履歴を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B13_注文履歴を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 注文履歴画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜3 注文履歴を開いて一覧を表示する
    User->>Page: 共通ヘッダーの「注文履歴」をクリック
    Note right of Page: 共通代替フロー *b を適用<br/>(未ログインならログインの案内を表示する)
    opt 店舗側・出店申請用のアカウント (関連情報)
        Page-->>User: 「店舗・出店申請用のアカウントでは購入できません。<br/>購入は購入者のアカウントでご利用ください。」
        Note right of Page: 一覧を表示しないので、以降の通信はない
    end
    Page->>Api: GET /api/orders
    Api->>Db: ログイン中の会員の行をロックし、カートを得る
    Db-->>Api: 行
    Api->>Db: 会員の注文を新しい順に読む (非表示にした注文を除く)
    Db-->>Api: 行
    loop 注文ごと
        Api->>Db: 明細、商品画像、決済、返金、店舗、<br/>キャンセルした会員を読む
        Db-->>Api: 行
    end
    Api-->>Page: 200 注文の配列
    alt 2a 注文が 0 件
        Page-->>User: 「注文はありません。」
    else 注文がある
        Page-->>User: 注文ごとの注文日時、注文状態、商品画像、商品名、<br/>受取店舗、個数、注文番号、合計金額<br/>(「キャンセル申請中」「返金済み」も出す)
    end

    Note over User,Db: 基本フロー 4〜5 注文状態で絞り込む (通信しない)
    User->>Page: 絞り込みボタン (「すべて」「注文受付」など) をクリック
    Page-->>User: 選んだ注文状態の注文だけの一覧
    opt 絞り込んだ結果が 0 件 (記述にない)
        Page-->>User: 「注文はありません。」
    end

    Note over User,Db: 基本フロー 6〜7 注文の詳細を開く (通信しない)
    User->>Page: 一覧の注文をクリック
    Page-->>User: 注文した商品、合計、お支払い方法と支払い・返金の状態、<br/>「受け取り」欄、キャンセル申請の状態と店舗からの回答
    opt 7a 受取店舗が閉鎖中で、注文受付か受取準備完了の注文
        Page-->>User: 「この店舗は閉鎖予定です。お早めにお受け取りください。」
    end
    opt 7b 運営が注文をキャンセルした
        Page-->>User: 「この注文は出店者からキャンセルされました<br/>（運営から：(理由)）」
    end
    Note over User,Db: 基本フロー 8 購入者が表示内容を確認する
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Orders as BuyerOrders.jsx
        participant Res as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as OrderController
        participant Session as CartSession<br/>Resolver
        participant Svc as OrderService
        participant Mapper as OrderResponse<br/>Mapper
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜3 注文履歴を開いて一覧を表示する
    User->>Work: 共通ヘッダーの「注文履歴」をクリック
    Note right of User: KusakariHeader の follow() → App.jsx の<br/>navigateFromHeader() → navigate('/purchases')。<br/>App.jsx が Workspace を表示する
    Note right of Work: 共通代替フロー *b を適用<br/>(session.authenticated が false なら AuthPanel を表示)
    opt isShopAccount(session) が true (SHOP_OWNER、SHOP_STAFF、SHOP_OWNER_APPLICANT)
        Work-->>User: buyerOnlyMessage「店舗・出店申請用のアカウントでは<br/>購入できません。購入は購入者のアカウントでご利用ください。」
        Note right of Work: BuyerOrders を表示しないので通信しない
    end
    Work->>Orders: BuyerOrders を表示
    Orders->>Res: useResource('/orders')
    Note right of Res: useEffect が setData(null) の後、<br/>reload() を自動で実行する
    Res->>Http: request('/orders')
    Http->>Ctrl: GET /api/orders
    Ctrl->>Session: resolve(request, response)
    Note right of Session: AuthService.requireBuyer() で購入者か確かめ<br/>(401 LOGIN_REQUIRED、403 BUYER_REQUIRED)、<br/>MemberCartService.resolve() が会員の行を<br/>SELECT ... FOR UPDATE してカートの ID を返す。図では省略
    Session-->>Ctrl: cartId
    Ctrl->>Svc: list(cartId)
    Note over Svc,Db: クラスの @Transactional で list() の終わりまで
    Note right of Svc: 会員 ID は AuthService.current() から取る
    Svc->>Repo: OrderRepository.findByBuyerMemberIdAnd<br/>DeletedAtIsNullOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT (orders) deleted_at が null、新しい順
    Db-->>Repo: 行
    Repo-->>Svc: OrderEntity のリスト
    loop 注文ごとに view(order)
        Svc->>Repo: OrderItemRepository.findAllForOrder(id)
        Repo->>Db: SELECT (order_items)
        Db-->>Repo: 行
        Repo-->>Svc: OrderItemEntity のリスト
        Svc->>Mapper: toView(order, items)
        Mapper->>Repo: ProductRepository.findImageReferences()、<br/>PaymentRepository.findById()、RefundRepository.findByOrderId()、<br/>StoreRepository.findById()、AuthMemberRepository.findById()
        Repo->>Db: SELECT (products、payments、refunds、stores、members)
        Db-->>Repo: 行
        Repo-->>Mapper: 商品画像、決済の状態、返金の状態、<br/>店舗が閉鎖中か、キャンセルした会員
        Mapper->>Mapper: paymentStatus、refundStatus、storeClosing、<br/>cancelledBy (運営なら OPERATOR、それ以外は STORE) を入れる
        Mapper-->>Svc: OrderView (購入者向けなので sales は null)
    end
    Svc-->>Ctrl: OrderView のリスト
    Ctrl-->>Http: 200 OrderView の配列
    Http-->>Res: data
    Res->>Res: setData(value)、setError('')
    Res-->>Orders: resource.data
    Note right of Orders: 取得に失敗すると ResourceStatus が<br/>エラーと「再取得」を出す (共通代替フロー *a)
    Orders->>Orders: filter は '' なので、shown は全件
    alt 2a resource.data があり shown が 0 件
        Orders-->>User: 「注文はありません。」
    else shown がある
        Orders-->>User: OrderCard ごとに注文日時、orderLabels の注文状態、<br/>Thumbnail (4 枚まで)、商品名 (ほか N 点)、<br/>受取店舗、個数、注文番号、合計
        Note right of Orders: cancellationStatus が PENDING なら「キャンセル申請中」、<br/>refundStatus が SUCCEEDED なら「返金済み」も出す
    end

    Note over User,Db: 基本フロー 4〜5 注文状態で絞り込む (通信しない)
    User->>Orders: 絞り込みボタン (「すべて」「注文受付」「受取準備完了」<br/>「引き渡し完了」「キャンセル」) をクリック
    Orders->>Orders: setFilter(key)、orders.filter() で<br/>status が key の注文だけを shown にする
    Orders-->>User: 選んだ注文状態の注文だけの一覧
    opt shown が 0 件 (記述にない)
        Orders-->>User: 「注文はありません。」
    end

    Note over User,Db: 基本フロー 6〜7 注文の詳細を開く (通信しない)
    User->>Orders: 一覧の注文 (order-card-head) をクリック
    Orders->>Orders: onToggle() で setOpenId(order.id)
    Orders-->>User: OrderBody 商品名、SKU、単価 × 個数、金額、合計、<br/>PaymentState (お支払い方法、支払いと返金の状態)、<br/>PickupDetails (受取店舗、所在地 / 営業時間、<br/>準備完了日時、引き渡し完了日時)、<br/>「キャンセル申請（承認/却下）：理由 / 店舗からの回答：…」
    opt 7a order.storeClosing が true で status が ACCEPTED か READY
        Orders-->>User: 「この店舗は閉鎖予定です。お早めにお受け取りください。」
    end
    opt 7b order.cancelledBy が OPERATOR
        Orders-->>User: 「この注文は出店者からキャンセルされました<br/>（運営から：cancellationResponse）」
    end
    Note right of Orders: 「受取連絡先を編集」(PUT /api/orders/{id})、<br/>「購入履歴を非表示にする」(DELETE /api/orders/{id})、<br/>「注文のキャンセルを申請」(EC-B14) は図では省略
    Note over User,Db: 基本フロー 8 購入者が表示内容を確認する
```

## ユースケース記述との差

- 基本フロー 7 の「商品番号」は、画面では「SKU」という見出しの後に値を出します（`BuyerOrders.jsx` の `OrderBody` の `SKU {line.sku}`）。「商品番号」という文言は出ません。
- 「注文はありません。」は、注文が 0 件のとき（2a）だけでなく、絞り込んだ結果が 0 件のときにも出ます。条件は `resource.data && shown.length === 0` です。
- 7b の判定は、注文をキャンセルした会員が運営（`isAdmin()`）かどうかです（`OrderResponseMapper` の `cancelledBy`）。店舗の閉鎖・組織の停止によるまとめてキャンセルのほか、運営のアカウントが出店者の画面からキャンセル申請を承認した場合も、7b の文が出ます。このとき「キャンセル申請（承認）：理由」の行も一緒に出ます。
- 注文の詳細は、一覧の取得（`GET /api/orders`）で受け取ったデータを開くだけで、詳細を取り直す通信はありません。
- コードにあって記述にない処理です。
  - アプリを開いたときに `useShop.js` の `refresh()` も `GET /api/orders` を呼び、`shop.orders` に入れます。注文履歴画面はこれを使わず、`BuyerOrders` の `useResource('/orders')` で取り直します。
  - 運営のアカウント（`ADMIN`）も、自分の注文履歴を見られます（`AuthService.requireBuyer()`）。
  - 絞り込みボタンに「支払い待ち」はありません。支払い待ちの注文は「すべて」でだけ出ます。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `follow()`、「注文履歴」のリンク
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader()`、`Workspace` の表示
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `/purchases` の分岐、`AuthPanel`、`isShopAccount()` と `buyerOnlyMessage`
- [frontend/src/workspace/BuyerOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/BuyerOrders.jsx): `BuyerOrders`、`filters`、`OrderCard`、`OrderBody`、`Thumbnail`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`、`PaymentState`、`PickupDetails`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/payment.js): `paymentStatusLabels`、`refundStatusLabels`、`paymentLabel()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `isShopAccount()`、`buyerOnlyMessage`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `refresh()`（`api.orders()`）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java): `list()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java): `list()`、`view()`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `toView()`（`paymentStatus`、`refundStatus`、`storeClosing`、`cancelledBy`）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java): `findAllForOrder()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java): `isClosing()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `decideCancellation()`、`cancelByOperator()`（`cancelledByMemberId` と `cancellationResponse`）
