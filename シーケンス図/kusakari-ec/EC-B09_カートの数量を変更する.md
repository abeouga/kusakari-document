# EC-B09 カートの数量を変更する

- ユースケース記述: [EC-B09_カートの数量を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B09_カートの数量を変更する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

「＋」と「−」は、どちらも `useShop` の `setQuantity()` に 1 つ増やした数量か 1 つ減らした数量を渡します。サーバーは EC-B07 と同じ `PUT /api/cart/items/{productId}`（`CartService.updateItem()`）で、送られた数量で明細を上書きします。サーバーは数量と在庫より先に `revision` を比べるので、図では 3a の枝が 2a の枝より先に出ます。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「ショッピングカート」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「＋」か「−」をクリックする
    Note right of Page: 数量が 99 か在庫数に達すると「＋」、<br/>1 のときは「−」を押せない。通信しない
    User->>Page: 対象商品の「＋」または「−」をクリック
    Page->>Page: 送る数量 = 今の数量 + 1 または − 1
    Note over Page,Api: PUT の前に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
    Note over User,Db: 基本フロー 2〜3 数量と在庫を検証して保存する
    Page->>Api: PUT /api/cart/items/{productId}<br/>quantity と revision
    Api->>Api: 数量が 0〜99 か、ログイン中の購入者かを確かめる
    Api->>Db: カートを FOR UPDATE で読む
    Db-->>Api: 行
    alt 3a 別の操作でカートが更新されていた（revision が違う）
        Api-->>Page: 409 CART_CHANGED
    else revision が同じ
        Api->>Db: 明細・商品・在庫・店舗・組織を読む
        Db-->>Api: 行
        alt 2a 購入できない商品か在庫不足
            Api-->>Page: 409 PRODUCT_ARCHIVED / OUT_OF_STOCK
            Note over Api,Db: ロールバック。数量は変わらない
        else 変更できる
            Api->>Db: 明細の数量を書き換え、<br/>カートの revision を 1 増やす（コミット）
            Db-->>Api: 件数
            Api-->>Page: 200 CartView（明細、金額、合計、revision）
            Page-->>User: 新しい数量と金額、「ご請求内容」、<br/>「カートを更新しました。」
        end
    end
    opt 3a・2a のとき（どちらも同じ処理）
        Page->>Api: GET /api/cart<br/>（続けて GET /api/products、GET /api/orders）
        Api-->>Page: 200 最新のカート
        Page-->>User: エラーメッセージと最新のカート
        Note right of User: 2a-2・3a-2 基本フロー 1 へ戻る
    end
    Note over User,Db: 共通代替フロー *a、*b を適用（図では省略）
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as CartController
        participant Errs as ApiErrors
        participant Session as CartSession<br/>Resolver
        participant Svc as CartService
        participant Catalog as CatalogService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「＋」か「−」をクリックする
    Note right of Cart: 「＋」は quantity が 99 以上か product.stock 以上、<br/>「−」は quantity が 1 以下、または busy のとき<br/>disabled。通信しない
    User->>Cart: 対象商品の「＋」または「−」をクリック
    Cart->>Shop: setQuantity(line.product.id, line.quantity + 1)<br/>または setQuantity(line.product.id, line.quantity - 1)
    Shop->>Shop: run(action, true)
    Shop->>Http: api.setItem(id, quantity, cart.revision)
    Note over Http,Ctrl: authFetch() が先に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
    Note over User,Db: 基本フロー 2〜3 数量と在庫を検証して保存する
    Http->>Ctrl: PUT /api/cart/items/{productId}<br/>quantity と revision
    Ctrl->>Ctrl: @Valid が ItemRequest を検査<br/>@Min(0) @Max(99)
    Note right of Ctrl: ボタンの制限で 1〜99 に収まる。<br/>違反なら ApiErrors.invalid() が<br/>400 INVALID_INPUT（図では省略）
    Ctrl->>Session: resolve(request, response)
    Note right of Session: AuthService.requireBuyer() と<br/>MemberCartService.resolve() で<br/>会員のカート ID を求める（図では省略）
    Session-->>Ctrl: cartId
    Ctrl->>Svc: updateItem(cartId, productId, input)
    Note over Svc,Db: @Transactional(READ_COMMITTED) updateItem() 全体が 1 つのトランザクション
    Svc->>Repo: CartRepository.findLocked(id)
    Repo->>Db: SELECT ... FOR UPDATE（carts）
    Db-->>Repo: 行
    Repo-->>Svc: CartEntity
    Svc->>Svc: checkRevision(cart, revision)
    alt 3a cart.getRevision() が送った revision と違う
        Svc--xErrs: throw ApiException(409, CART_CHANGED)
        Errs-->>Http: business() が 409 と message
        Http--xShop: throw ApiError(409)
    else revision が同じ
        Svc->>Repo: CartItemRepository.findById(itemId)
        Repo-->>Svc: 今の明細
        Svc->>Catalog: listing(productId)
        Catalog->>Repo: ProductRepository.findByIdIn()、<br/>InventoryRepository / StoreRepository /<br/>OrganizationRepository.findAllById()
        Repo->>Db: SELECT（products、inventory、stores、organizations）
        Db-->>Repo: 行
        Repo-->>Catalog: Entity
        Catalog-->>Svc: Listing（product と unavailableReason）
        Svc->>Svc: purchasable() と product.stock() を検査
        alt 2a 購入できない商品か在庫不足
            Svc--xErrs: throw ApiException(409)
            Note right of Svc: quantity が 1 以上で purchasable() が false なら<br/>PRODUCT_ARCHIVED、quantity が stock を<br/>超えるなら OUT_OF_STOCK
            Note over Svc,Db: 例外でロールバック。数量は変わらない
            Errs-->>Http: business() が 409 と message
            Http--xShop: throw ApiError(409)
        else 変更できる
            Svc->>Repo: CartItemRepository.findAllForCart(id)
            Repo-->>Svc: カートの明細
            Note right of Svc: 既にある商品なので<br/>50 種類の上限には当たらない
            Svc->>Repo: CartItemRepository.save(item)<br/>数量を書き換えた明細
            Repo-->>Svc: CartItemEntity
            Svc->>Svc: cart.incrementRevision()
            Svc->>Svc: view(cart)
            Note right of Svc: findAllForCart()、listingsByIds()、<br/>DeliveryService.pickupDetails() で<br/>CartView を作る（図では省略）
            Note over Svc,Db: updateItem() の終わりにコミット。cart_items の UPDATE と carts の revision の UPDATE が確定する
            Svc-->>Ctrl: CartView
            Ctrl-->>Http: 200 CartView
            Http-->>Shop: cart
            Shop->>Shop: setCart(cart)、<br/>setNotice('カートを更新しました。')
            Shop-->>Cart: shop.cart と shop.notice
            Cart-->>User: 新しい数量と lineTotalYen、「ご請求内容」の<br/>subtotalYen と totalYen、「カートを更新しました。」
        end
    end
    opt 3a・2a のとき（run() の catch）
        Shop->>Shop: setError(message)
        Shop->>Http: refreshOnFailure なので refresh() の api.cart()
        Http->>Ctrl: GET /api/cart
        Note over Ctrl,Db: サーバーの中は EC-B08 と同じ。<br/>続けて GET /api/products、GET /api/orders（図では省略）
        Ctrl-->>Http: 200 CartView
        Http-->>Shop: 最新のカート
        Shop->>Shop: setCart(最新のカート)
        Shop-->>Cart: shop.error と shop.cart
        Cart-->>User: エラーメッセージと最新のカート
        Note right of User: 2a-2・3a-2 基本フロー 1 へ戻る
    end
    Note over User,Db: 共通代替フロー *a、*b を適用（図では省略）
```

## ユースケース記述との差

- 2a-1 は「変更前の内容を維持する」ですが、コードはどの失敗でも `refresh()` で最新のカートを取り直して表示します。数量は保存されていないので、ほかの操作がなければ表示は変更前と同じです。
- 記述にない処理です。一時的に購入できない明細（EC-B08 の 2c）でも「＋」「−」は押せます（`disabled` は数量と在庫と `busy` だけで決まる）。押すとサーバーは 409 `PRODUCT_ARCHIVED`「この商品は販売を終了しています。カートから削除してください。」を返します。理由が一時的なもの（非表示、公開停止、閉鎖中など）でも「販売を終了しています」と出ます。
- 記述にない処理です。在庫不足の明細（EC-B08 の 2d、数量が在庫数より多い）では「＋」は押せず、「−」で 1 つ減らしても在庫数を超えている間は 409 `OUT_OF_STOCK`「受取店舗の在庫が不足しています。」になります。数量が在庫数より 2 つ以上多いと「−」では減らせず、削除（EC-B10）だけができます。
- サーバーの検査の順番は記述と逆です。記述は 2（数量と在庫の検証）のあとに 3（保存）ですが、サーバーは最初に `checkRevision()` で `revision` を比べ（3a の 409 `CART_CHANGED`）、そのあとで商品と在庫を検査します（2a）。
- 3a の「保存に失敗した場合」には、`ApiErrors` が返す DB の失敗（503 `DATABASE_UNAVAILABLE`、409 `DATA_CHANGED`）も入ります。画面の動き（エラーを出して `refresh()`）は同じです。
- 記述にない処理です。「うち消費税」はサーバーから受け取らず、画面が `Math.floor(totalYen × 10 / 110)` で計算します。

## 参照したコード

- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Cart.jsx): 「＋」「−」ボタンの `disabled` と `onClick`、「ご請求内容」、`shop.notice` と `shop.error` の表示
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `setQuantity()`、`run()`（`refreshOnFailure`）、`refresh()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.setItem()`、`api.cart()`、`request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`（CSRF トークン）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem()`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem()`、`checkRevision()`、`requireLockedCart()`、`view()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing()`、`Listing.purchasable()`、`unavailableReason()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`conflict()`、`database()`
