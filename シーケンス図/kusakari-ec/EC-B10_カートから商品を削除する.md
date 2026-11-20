# EC-B10 カートから商品を削除する

- ユースケース記述: [EC-B10_カートから商品を削除する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B10_カートから商品を削除する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

削除のための API はありません。ごみ箱アイコンは `useShop` の `setQuantity()` に数量 0 を渡し、EC-B07・EC-B09 と同じ `PUT /api/cart/items/{productId}`（`CartService.updateItem()`）を送ります。サーバーは数量が 0 のとき、購入できるか・在庫・種類数の検査をせずに明細を削除します。削除の前に確認のダイアログは出ません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「ショッピングカート」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 削除ボタンをクリックする
    User->>Page: 対象商品のごみ箱アイコンをクリック
    Page->>Page: 送る数量を 0 にする
    Note over Page,Api: PUT の前に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
    Note over User,Db: 基本フロー 2 削除内容を反映する
    Page->>Api: PUT /api/cart/items/{productId}<br/>quantity 0 と revision
    Api->>Api: ログイン中の購入者かを確かめる
    Api->>Db: カートを FOR UPDATE で読む
    Db-->>Api: 行
    alt 2a 削除に失敗（別の操作でカートが更新されていた）
        Api-->>Page: 409 CART_CHANGED
        Note over Api,Db: ロールバック。明細は残る
    else 削除できる
        Api->>Db: 明細・商品・在庫・店舗・組織を読む
        Db-->>Api: 行
        Api->>Db: 明細を削除し、カートの revision を 1 増やす（コミット）
        Db-->>Api: 件数
        Api-->>Page: 200 CartView（残りの明細、合計、revision）
        Note over User,Db: 基本フロー 3 更新後のカートを表示する
        alt 商品が残っている
            Page-->>User: 更新後の明細と「ご請求内容」、<br/>「カートから削除しました。」
        else 最後の商品を削除した
            Page-->>User: 「まだ商品が入っていません。」、「商品を探す」、<br/>「庭に設置したものから追加」<br/>（「カートから削除しました。」は出ない）
        end
    end
    opt 2a のとき
        Page->>Api: GET /api/cart<br/>（続けて GET /api/products、GET /api/orders）
        Api-->>Page: 200 最新のカート
        Page-->>User: エラーメッセージと最新のカート
        Note right of User: 2a-2 ユースケースを終了する
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

    Note over User,Db: 基本フロー 1 削除ボタンをクリックする
    Note right of Cart: ごみ箱アイコンは busy のときだけ disabled
    User->>Cart: ごみ箱アイコン（「(商品名)を削除」）をクリック
    Cart->>Shop: setQuantity(line.product.id, 0)
    Shop->>Shop: run(action, true)
    Shop->>Http: api.setItem(id, 0, cart.revision)
    Note over Http,Ctrl: authFetch() が先に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
    Note over User,Db: 基本フロー 2 削除内容を反映する
    Http->>Ctrl: PUT /api/cart/items/{productId}<br/>quantity 0 と revision
    Ctrl->>Ctrl: @Valid が ItemRequest を検査<br/>（0 は @Min(0) を満たす）
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
    alt 2a cart.getRevision() が送った revision と違う
        Svc--xErrs: throw ApiException(409, CART_CHANGED)
        Note over Svc,Db: 例外でロールバック。明細は残る
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
        Catalog-->>Svc: Listing
        Note right of Svc: quantity が 0 なので、purchasable()、<br/>在庫、50 種類の上限の検査は通る。<br/>購入できない明細や在庫不足の明細も削除できる
        Svc->>Repo: CartItemRepository.findAllForCart(id)
        Repo-->>Svc: カートの明細
        Svc->>Repo: existing.ifPresent(items::delete)<br/>CartItemRepository.delete(明細)
        Repo-->>Svc: 戻る
        Svc->>Svc: cart.incrementRevision()
        Svc->>Svc: view(cart)
        Note right of Svc: findAllForCart()、listingsByIds()、<br/>DeliveryService.pickupDetails() で<br/>CartView を作る（図では省略）
        Note over Svc,Db: updateItem() の終わりにコミット。cart_items の DELETE と carts の revision の UPDATE が確定する
        Svc-->>Ctrl: CartView
        Ctrl-->>Http: 200 CartView
        Http-->>Shop: cart
        Shop->>Shop: setCart(cart)、<br/>quantity が 0 なので setNotice('カートから削除しました。')
        Shop-->>Cart: shop.cart と shop.notice
        Note over User,Db: 基本フロー 3 更新後のカートを表示する
        alt cart.items が残っている
            Cart-->>User: 更新後の明細と「ご請求内容」、<br/>success-text に「カートから削除しました。」
        else cart.items.length が 0
            Cart-->>User: 空のカートの表示（「まだ商品が入っていません。」、<br/>「商品を探す」、AddFromGardenCard）
            Note right of Cart: 空のカートの表示は shop.notice を<br/>描かないので「カートから削除しました。」は出ない
        end
    end
    opt 2a のとき（run() の catch）
        Shop->>Shop: setError(message)
        Shop->>Http: refreshOnFailure なので refresh() の api.cart()
        Http->>Ctrl: GET /api/cart
        Note over Ctrl,Db: サーバーの中は EC-B08 と同じ。<br/>続けて GET /api/products、GET /api/orders（図では省略）
        Ctrl-->>Http: 200 CartView
        Http-->>Shop: 最新のカート
        Shop->>Shop: setCart(最新のカート)
        Shop-->>Cart: shop.error と shop.cart
        Cart-->>User: エラーメッセージと最新のカート
        Note right of User: 2a-2 ユースケースを終了する
    end
    Note over User,Db: 共通代替フロー *a、*b を適用（図では省略）
```

## ユースケース記述との差

- 基本フロー 3 の「カートから削除しました。」は、最後の 1 件を削除してカートが空になったときには出ません。`useShop` は `setNotice('カートから削除しました。')` を呼びますが、`Cart.jsx` の空のカートの表示は `shop.notice` を描きません。
- 記述にない処理です。削除は数量 0 の `PUT /api/cart/items/{productId}` です。数量が 0 のときサーバーは購入できるかと在庫を検査しないので、一時的に購入できない明細（EC-B08 の 2c）や在庫不足の明細（EC-B08 の 2d）も削除できます。
- 2a の「削除エラー」は、サーバーが返したメッセージです。たとえば `revision` が違うと「別の操作でカートが更新されました。最新の内容を確認してください。」（409 `CART_CHANGED`）、DB の失敗では `ApiErrors.database()` の「保存処理を完了できませんでした。時間をおいて再試行してください。」（503 `DATABASE_UNAVAILABLE`）です。

## 参照したコード

- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Cart.jsx): ごみ箱アイコンの `onClick` と `disabled`、空のカートの表示、`shop.notice` の表示
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `setQuantity()`、`run()`（`refreshOnFailure`）、`refresh()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.setItem()`、`api.cart()`、`request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`（CSRF トークン）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem()`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem()`（`quantity` が 0 の分岐）、`checkRevision()`、`requireLockedCart()`、`view()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`database()`
