# EC-S08 注文一覧・詳細を確認する

- ユースケース記述: [EC-S08_注文一覧・詳細を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S08_注文一覧・詳細を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 「店舗受け取り」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインなら画面はログインの案内を出し、API は 401 LOGIN_REQUIRED を返す)

    Note over User,Db: 基本フロー 1〜2 注文一覧を表示する
    User->>Page: 出店者メニューの「店舗受け取り」をクリック
    Note right of Page: 1a 店舗が 2 つ以上なら、画面上部の<br/>「管理する店舗」で選ぶ。選び直すと<br/>storeId が変わり、同じ GET をやり直す
    Page->>Api: GET /api/seller/orders?storeId=…
    Api->>Db: 会員と、店舗でのロールを読む
    Db-->>Api: 行
    alt ロールがない (関連情報「ロールのない担当者は注文を見られない」)
        Api-->>Page: 403 FORBIDDEN
        Page-->>User: 「この操作の権限がありません。」と「再取得」
    else ロールがある
        Api->>Db: 店舗の注文を新しい順に読む
        Db-->>Api: orders の行
        loop 注文ごと
            Api->>Db: 明細、商品の画像、支払い、返金、店舗、<br/>キャンセルした会員を読む
            Db-->>Api: 行
        end
        Api-->>Page: 200 注文の配列 (明細、受取連絡先、支払方法、<br/>paymentStatus、refundStatus、cancelledBy)
        Page->>Page: キャンセル申請中、準備待ち、受け取り待ち、<br/>そのほかの順に並べる
        Page-->>User: 注文状態の絞り込みボタン (件数つき) と検索欄
        alt 2a 注文がない
            Page-->>User: 「該当する注文はありません。」
        else 注文がある
            loop 表示する注文ごと
                Page-->>User: 注文番号、注文状態、合計、注文明細、受取連絡先、<br/>お支払い方法と支払い・返金の状態、キャンセル申請状態
                Note right of Page: 引き渡し完了・キャンセルの注文は、<br/>明細と受取連絡先を「詳細」の中にたたむ
                opt 6a 運営がキャンセルした注文 (cancelledBy が OPERATOR)
                    Page-->>User: 「運営がキャンセルしました：(理由)」
                end
                opt 6b 返金に失敗した注文 (refundStatus が FAILED)
                    Page-->>User: 「返金に失敗しました。Stripe の管理画面で<br/>返金の状態を確認し、購入者に連絡してください。」
                end
            end
        end
    end

    Note over User,Db: 基本フロー 3〜4 絞り込む (取得済みの注文を使い、通信しない)
    alt 絞り込みボタン
        User->>Page: 「準備待ち」「受け取り待ち」「キャンセル申請」<br/>「引き渡し完了」「キャンセル」「すべて」のどれかをクリック
    else 検索欄
        User->>Page: 「注文番号・受取人で検索」に注文番号か受取人名を入力
    end
    Page->>Page: 注文状態と、注文番号・受取人名で絞る
    alt 2a 条件に合う注文がない
        Page-->>User: 「該当する注文はありません。」
    else 条件に合う注文がある
        Page-->>User: 条件に合う注文だけ
    end

    Note over User,Db: 基本フロー 5〜7 引き渡し完了・キャンセルの注文の詳細を見る (通信しない)
    User->>Page: 対象注文の「詳細」をクリック
    Page-->>User: たたんでいた注文明細、受取連絡先、受け取りの進み具合
    Note over User,Page: 基本フロー 7 出店者が内容を確認する。6a・6b の表示は、<br/>「詳細」を開く前からカードに出ている
```

## 詳細図 1 基本フロー 1〜2

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as OrderPage<br/>PickupOrders.jsx
        participant Card as PickupCard<br/>PickupOrders.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as OrderWorkflow<br/>Controller
        participant Errs as ApiErrors
        participant Svc as OrderWorkflow<br/>Service
        participant Auth as AuthService
        participant Mapper as OrderResponse<br/>Mapper
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。未ログインなら Workspace.jsx が AuthPanel を出す
    Note over User,Db: 基本フロー 1〜2 注文一覧を表示する
    User->>Page: 出店者メニューの「店舗受け取り」をクリック<br/>(Workspace.jsx が /seller/orders で OrderPage を storeId 付きで表示)
    Note right of Page: ロールのない店舗の ORG_ADMIN には、<br/>Workspace.jsx が OrderPage の代わりに<br/>人事の画面だけを使える旨を出す (通信しない)
    Page->>Hook: useResource('/seller/orders?storeId=…')
    Note right of Hook: useEffect が reload() を自動で実行する。<br/>1a で storeId が変わると path が変わり、<br/>もう一度 reload() する
    Hook->>Http: request(path)
    Http->>Ctrl: GET /api/seller/orders?storeId=…
    Ctrl->>Svc: sellerOrders(storeId)
    Note over Svc,Db: @Transactional(readOnly = true)。読むだけでロックしない
    Svc->>Auth: requireSeller(storeId)
    Note right of Auth: requireStoreRole(storeId, false)。<br/>current() と店舗・組織・担当を読む (図では省略)
    alt ロールがない (運営が停止した店舗、店舗がないときも同じ)
        Auth--xErrs: denied() が throw ApiException(403, FORBIDDEN)
        Errs-->>Http: business() が 403 と「この操作の権限がありません。」
        Http--xHook: readResponse() が throw ApiError(403)
        Hook-->>Page: resource.error
        Page-->>User: ResourceStatus がエラーの文と「再取得」を出す
    else ロールがある
        Auth-->>Svc: 戻る
        Svc->>Repo: OrderRepository.findByStoreIdOrderByCreatedAtDesc(storeId)
        Repo->>Db: SELECT orders (新しい順)
        Db-->>Repo: 行
        Repo-->>Svc: OrderEntity のリスト
        loop 注文ごとに storeView(order)
            Svc->>Repo: OrderItemRepository.findAllForOrder(id)
            Repo->>Db: SELECT order_items
            Db-->>Repo: 行
            Repo-->>Svc: OrderItemEntity のリスト
            Svc->>Mapper: toStoreView(order, items)
            Mapper->>Repo: ProductRepository.findImageReferences()、<br/>PaymentRepository.findById()、RefundRepository.findByOrderId()、<br/>StoreRepository.findById()、AuthMemberRepository.findById()
            Repo->>Db: SELECT products、payments、refunds、stores、members
            Db-->>Repo: 行
            Repo-->>Mapper: Entity
            Mapper-->>Svc: OrderView (details、paymentStatus、refundStatus、<br/>cancelledBy は運営の会員なら OPERATOR、sales)
        end
        Svc-->>Ctrl: OrderView のリスト
        Ctrl-->>Http: 200 JSON
        Http-->>Hook: data
        Hook-->>Page: resource.data
        Page->>Page: filter は空文字 (すべて)、query は空。<br/>shown を priority() で並べる (キャンセル申請中、<br/>準備待ち、受け取り待ち、そのほか)
        Page-->>User: 絞り込みボタン (filters ごとの件数) と<br/>「注文番号・受取人で検索」欄
        alt 2a 注文がない
            Page-->>User: 「該当する注文はありません。」
        else 注文がある
            loop shown の注文ごと
                Page->>Card: PickupCard (order、resource)
                Card-->>User: 注文番号、注文日時、注文状態、キャンセル申請中、合計、<br/>PaymentState (お支払い方法、支払いと返金の状態)
                Note right of Card: ACCEPTED・READY は明細と受取人を出す。<br/>COMPLETED・CANCELLED は details 要素に<br/>たたみ、summary に商品名 × 数量と「詳細」。<br/>EC-S09・S10・S13 のボタンは図では省略
                opt 6a order.cancelledBy が OPERATOR
                    Card-->>User: 「運営がキャンセルしました：(cancellationResponse)」
                end
                opt 6b order.refundStatus が FAILED
                    Card-->>User: 「返金に失敗しました。Stripe の管理画面で<br/>返金の状態を確認し、購入者に連絡してください。」
                end
            end
        end
    end
```

## 詳細図 2 基本フロー 3〜7

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as OrderPage<br/>PickupOrders.jsx
        participant Card as PickupCard<br/>PickupOrders.jsx
    end

    Note over User,Card: 基本フロー 3〜4 絞り込む (取得済みの resource.data を使い、通信しない)
    alt 絞り込みボタン
        User->>Page: 「準備待ち」「受け取り待ち」「キャンセル申請」<br/>「引き渡し完了」「キャンセル」「すべて」のどれかをクリック
        Page->>Page: setFilter(key)
    else 検索欄
        User->>Page: 「注文番号・受取人で検索」に入力
        Page->>Page: onChange で setQuery(入力値)
    end
    Page->>Page: filters の条件 (match) と、注文番号と受取人名に<br/>入力 (小文字) が含まれるかで絞り、priority() で並べる
    alt 2a 条件に合う注文がない
        Page-->>User: 「該当する注文はありません。」
    else 条件に合う注文がある
        Page->>Card: shown の注文ごとに PickupCard
        Card-->>User: 条件に合う注文だけのカード
    end

    Note over User,Card: 基本フロー 5〜7 引き渡し完了・キャンセルの注文の詳細を見る (通信しない)
    User->>Card: 対象注文の summary の「詳細」をクリック
    Card-->>User: ブラウザーが details 要素を開き、注文明細 (商品名、SKU、数量、金額)、<br/>受取人、電話番号、連絡先メール、受け取りの進み具合を見せる
    Note over User,Card: 基本フロー 7 出店者が確認する。この画面は GET /api/seller/orders/{id} を呼ばない。<br/>6a・6b の表示は詳細図 1 のとおり、「詳細」を開く前からカードに出ている
```

## ユースケース記述との差

- 6a・6b: 記述は「詳細」をクリックしたあと（基本フロー 6）の代替フローにしています。コードでは、「運営がキャンセルしました：(理由)」と「返金に失敗しました。…」はカードの `details` 要素の外にあり、一覧を表示した時点（基本フロー 2）から出ています。
- 6a: `cancelledBy` が `OPERATOR` になるのは、注文をキャンセルした会員（`cancelled_by_member_id`）が運営（`isAdmin()`）のときです。店舗の閉鎖・組織の停止のまとめてキャンセル（`OpenOrders.cancelAll()`）のほか、運営のアカウントが出店者の画面からキャンセル申請を承認した注文（`decideCancellation()`）も同じ表示になります。
- 基本フロー 5〜6: 「詳細」は HTML の `details` 要素で、明細と受取連絡先は一覧の取得のときに読み込み済みです。開くときに通信はしません。注文 1 件を返す `GET /api/seller/orders/{id}` はありますが、この画面からは呼びません。
- 関連情報「ロールのない担当者は注文を見られない」: 所属店舗でロールのない担当者（`memberRole` が `NONE`）は、`requireSeller()` の 403 で「この操作の権限がありません。」と「再取得」が出ます。ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が人事の画面だけを使える旨を出し、通信しません。運営が停止した店舗と、存在しない店舗でも 403 になります。
- 基本フロー 3: 絞り込みボタンの件数は、検索欄の入力にかかわらず、取得したすべての注文で数えます。支払い待ち（`PENDING_PAYMENT`）の注文は「すべて」でだけ出ます。
- 1a: 店舗を選び直しても、`OrderPage` は作り直さないので、絞り込みボタンと検索欄の状態は残ります。

## 確かめられなかったこと

- 運営のアカウントが出店者の画面からキャンセル申請を承認した注文に「運営がキャンセルしました」が出ることは、コードから読んだもので、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`storePaths`、`rolePaths`、`personnelOnly`、`/seller/orders` と `OrderPage` の対応
- [frontend/src/workspace/PickupOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/PickupOrders.jsx): `OrderPage`、`filters`、`priority`、`PickupCard`、`Progress`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`、`PaymentState`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/payment.js): `paymentMethods`、`paymentLabel`、`paymentStatusLabels`、`refundStatusLabels`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`readResponse`、`ApiError`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `seller`、`sellerOrder`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `sellerOrders`、`storeView`、`decideCancellation`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `toStoreView`、`toView`、`figures`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java): `findAllForOrder`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `cancelByOperator`、`decideCancellation`
- [backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java): `cancelAll`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller`、`requireStoreRole`、`denied`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`
