# EC-B07 商品をカートに追加する

- ユースケース記述: [EC-B07_商品をカートに追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B07_商品をカートに追加する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

「カートに追加」と商品一覧の「＋」は、どちらも `useShop` の `add()` を呼びます。`add()` は画面が持っているカートの数量に追加する数量を足し、その合計を `PUT /api/cart/items/{productId}` で送ります。サーバーは送られた数量で明細を上書きします。カートは画面を開いたときに読み込み済みです。読み込みの流れは [EC-B08 カートを確認する](<EC-B08_カートを確認する.md>) の詳細図 1 にあります。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「トップ」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 事前条件 画面を開いたときの GET /api/cart でカートを読み込み済み（EC-B08）。<br/>店舗側・出店申請用のアカウントには「購入数量」「カートに追加」「＋」を出さない
    Note over User,Db: 基本フロー 1〜3 数量を入力して「カートに追加」をクリックする
    alt 「植物について」ダイアログから追加する
        User->>Page: 「購入数量」欄に数量を入力
        Page->>Page: 数量と在庫を検証
        Note right of Page: 2a 1 未満、整数でない、在庫数か 99 を超える、<br/>在庫が 0 のときは「カートに追加」を押せない。<br/>通信しない
        Page-->>User: 「カートに追加」を押せる
        User->>Page: 「カートに追加」をクリック
    else 1a 商品一覧から追加する
        User->>Page: 商品カードの「＋」をクリック
        Note right of Page: 1a-2 数量は 1 点
    end
    alt 1b 未ログイン
        Page-->>User: 「ログイン」画面へ移動<br/>（カートの API は呼ばない）
        Note right of User: 1b-2〜1b-3 ログイン（EC-B01）のあと<br/>元の URL を読み込み直す。基本フロー 1 へ
    else ログイン中
        Page->>Page: 送る数量 = カートにある数量 + 追加する数量
        Note over Page,Api: PUT の前に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
        Note over User,Db: 基本フロー 4〜5 商品・数量・在庫を検証して保存する
        Page->>Api: PUT /api/cart/items/{productId}<br/>quantity と revision
        Api->>Api: 送る数量が 0〜99 かを検査
        alt 4a 送る数量が 99 を超える
            Api-->>Page: 400 INVALID_INPUT
        else 数量の検査を通る
            Api->>Api: ログイン中の購入者と、その会員のカートを確かめる
            Api->>Db: カートを FOR UPDATE で読み、<br/>明細・商品・在庫・店舗・組織を読む
            Db-->>Api: 行
            alt 4a 購入できない、在庫不足、種類数の上限、カートが古い
                Api-->>Page: 409 PRODUCT_ARCHIVED / OUT_OF_STOCK / CART_CHANGED<br/>400 CART_LIMIT、404 PRODUCT_NOT_FOUND
                Note over Api,Db: ロールバック。カートは変わらない
            else 追加できる
                Api->>Db: 明細を追加するか数量を書き換え、<br/>カートの revision を 1 増やす（コミット）
                Db-->>Api: 件数
                Api-->>Page: 200 CartView（明細、合計、revision）
                Page-->>User: 「カートを更新しました。」
            end
        end
        opt 4a のとき（どちらの 4a も同じ処理）
            Page->>Api: GET /api/cart<br/>（続けて GET /api/products、GET /api/orders）
            Api-->>Page: 200 最新のカート
            Page-->>User: エラーメッセージ（追加しない）
            Note right of User: 4a-2 基本フロー 1 へ戻る
        end
    end
    Note over User,Db: 共通代替フロー *a、*b を適用（図では省略）
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Card as ProductCard.jsx
        participant Detail as ProductDetail.jsx
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

    Note over User,Db: 事前条件 画面を開いたとき refresh() が GET /api/cart で shop.cart を読み込み済み（EC-B08）。<br/>401 なら signedOut が true。403 BUYER_REQUIRED なら buyerBlocked が true で、App.jsx と Catalog.jsx は canBuy を false にして購入の部品を出さない
    Note over User,Db: 基本フロー 1〜3 数量を入力して「カートに追加」をクリックする
    alt 「植物について」ダイアログから追加する
        User->>Detail: 「購入数量」欄に数量を入力
        Detail->>Detail: onChange で setQuantity(Number(value))
        Detail->>Detail: maxQuantity = min(99, product.stock) と比べ、<br/>「カートに追加」の disabled を決める
        Note right of Detail: 2a 整数でない、1 未満、maxQuantity 超、<br/>product.stock が 0、busy なら disabled。通信しない
        Detail-->>User: 「カートに追加」を押せる
        User->>Detail: 「カートに追加」をクリック
        Detail->>Shop: onAdd(quantity) から App.jsx が<br/>shop.add(detail.id, quantity)
    else 1a 商品一覧から追加する
        User->>Card: 商品カードの「＋」をクリック
        Card->>Shop: onAdd() から CatalogProducts.jsx が<br/>shop.add(product.id)（quantity は既定の 1）
    end
    alt 1b 未ログイン（signedOut が true）
        Shop->>Shop: auth.js の login() が navigate() で<br/>/account/login?returnTo=… へ移る
        Shop-->>Detail: 戻る（カートの API は呼ばない）
        Note right of Shop: App.jsx が LoginPage を表示する。<br/>1b-2〜1b-3 ログイン（EC-B01）のあと<br/>returnTo の URL を読み込み直す。基本フロー 1 へ
    else ログイン中
        Shop->>Shop: cart.items から今の数量を探し、<br/>setQuantity(id, 今の数量 + quantity)
        Shop->>Shop: run(action, true)
        Shop->>Http: api.setItem(id, quantity, cart.revision)
        Note over Http,Ctrl: authFetch() が先に GET /api/auth/csrf で CSRF トークンを取る（図では省略）
        Note over User,Db: 基本フロー 4〜5 商品・数量・在庫を検証して保存する
        Http->>Ctrl: PUT /api/cart/items/{productId}<br/>quantity と revision
        Ctrl->>Ctrl: @Valid が ItemRequest を検査<br/>@Min(0) @Max(99)
        alt 4a 送る数量が 99 を超える
            Ctrl--xErrs: MethodArgumentNotValidException
            Errs-->>Http: invalid() が 400 INVALID_INPUT
            Http--xShop: throw ApiError(400)
        else 検査を通る
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
            Svc->>Repo: CartItemRepository.findById(itemId)
            Repo-->>Svc: 今の明細 または 空
            Svc->>Catalog: listing(productId)
            Catalog->>Repo: ProductRepository.findByIdIn()、<br/>InventoryRepository / StoreRepository /<br/>OrganizationRepository.findAllById()
            Repo->>Db: SELECT（products、inventory、stores、organizations）
            Db-->>Repo: 行
            Repo-->>Catalog: Entity
            Catalog-->>Svc: Listing（product と unavailableReason）
            Svc->>Svc: purchasable() と product.stock() を検査
            Svc->>Repo: CartItemRepository.findAllForCart(id)
            Repo-->>Svc: カートの明細
            Svc->>Svc: 新しい商品なら 50 種類の上限を検査
            Note right of Repo: findById() と findAllForCart() の<br/>cart_items の SELECT は図では省略
            alt 4a 購入できない、在庫不足、種類数の上限、カートが古い
                Svc--xErrs: throw ApiException
                Note right of Svc: 検査の順に 409 CART_CHANGED、<br/>404 PRODUCT_NOT_FOUND（listing）、<br/>409 PRODUCT_ARCHIVED、409 OUT_OF_STOCK、<br/>400 CART_LIMIT
                Note over Svc,Db: 例外でロールバック。カートは変わらない
                Errs-->>Http: business() が status と message
                Http--xShop: throw ApiError
            else 追加できる
                Svc->>Repo: CartItemRepository.save(item)<br/>新しい明細か、数量を書き換えた明細
                Repo-->>Svc: CartItemEntity
                Svc->>Svc: cart.incrementRevision()
                Svc->>Svc: view(cart)
                Note right of Svc: findAllForCart()、listingsByIds()、<br/>DeliveryService.pickupDetails() で<br/>CartView を作る（図では省略）
                Note over Svc,Db: updateItem() の終わりにコミット。cart_items の INSERT か UPDATE と、carts の revision の UPDATE が確定する
                Svc-->>Ctrl: CartView
                Ctrl-->>Http: 200 CartView
                Http-->>Shop: cart
                Shop->>Shop: setCart(cart)、<br/>setNotice('カートを更新しました。')
                Shop-->>Detail: shop.notice
                Detail-->>User: ダイアログに「カートを更新しました。」
                Note right of User: 1a のときは App.jsx のトーストに<br/>「カートを更新しました。」と「カートを見る」
            end
        end
        opt 4a のとき（run() の catch）
            Shop->>Shop: setError(message)
            Shop->>Http: refreshOnFailure なので refresh() の api.cart()
            Http->>Ctrl: GET /api/cart
            Note over Ctrl,Db: サーバーの中は EC-B08 と同じ。<br/>続けて GET /api/products、GET /api/orders（図では省略）
            Ctrl-->>Http: 200 CartView
            Http-->>Shop: 最新のカート
            Shop-->>Detail: shop.error
            Detail-->>User: エラーメッセージ（追加しない）
            Note right of User: 1a のときは Catalog.jsx が<br/>shop.error と「再読み込み」を出す。<br/>4a-2 基本フロー 1 へ戻る
        end
    end
    Note over User,Db: 共通代替フロー *a、*b を適用（図では省略）
```

## ユースケース記述との差

- 4a のメッセージが記述と違います。記述の「追加すると商品数量の上限99点を超えます。」「カートの商品種類の上限50種類を超えます。」「販売終了または商品が見つかりません。」は、`CartService.addShoppingItems()`（[EC-B25](<../../アーカイブ/ユースケース/kusakari-ec/EC-B25_買い物リストから商品をカートに追加する.md>) の経路）の文言です。この経路（`CartService.updateItem()`）では次のとおりです。
  - 合計が 99 点を超える: `ItemRequest` の `@Max(99)` に違反し、`ApiErrors.invalid()` が 400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」を返します。
  - 50 種類を超える: 400 `CART_LIMIT`「カートは50種類までです。」
  - 購入できない商品: 409 `PRODUCT_ARCHIVED`「この商品は販売を終了しています。カートから削除してください。」
  - 商品が見つからない: 404 `PRODUCT_NOT_FOUND`「商品が見つかりません。」
  - 在庫不足の「受取店舗の在庫が不足しています。」（409 `OUT_OF_STOCK`）だけは記述と同じです。
- 2a の検証は、ダイアログに入力した数量だけを `min(99, product.stock)` と比べます。カートにすでにある数量は足しません。足した合計が在庫数か 99 点を超えることは、サーバーの 4a で初めて分かります。
- 記述にない処理です。既にある商品への「加算」は、ブラウザーの `useShop.add()` が画面のカートの数量に足して行います。サーバーは送られた数量で明細を上書きします。画面のカートが古いと、サーバーは `revision` の違いで 409 `CART_CHANGED`「別の操作でカートが更新されました。最新の内容を確認してください。」を返します。記述の 4a にはこの場合がありません。
- 記述にない処理です。4a のあと、`run()` は `refreshOnFailure` が true なので、`refresh()` で `GET /api/cart`、`GET /api/products`、`GET /api/orders` を送って画面のデータを取り直します。
- 1b は記述では商品一覧の「＋」だけです。コードでは、未ログインでも「植物について」ダイアログに「購入数量」と「カートに追加」が出ます（`canBuy` は店舗側・出店申請用のアカウントのときだけ false）。押すと同じく `login()` で「ログイン」画面へ移ります。
- 1b-2 のログインが終わると、戻り先のページを読み込み直します（パスワードのログインでは `AuthPanel.jsx` の `complete()` が `window.location.replace()` を呼びます）。「植物について」ダイアログを開いているかは URL に持たないので、ダイアログは閉じた状態に戻ります。基本フロー 1 へ戻るには、ダイアログを開き直します。
- 事前条件は「トップ」画面、1a-1 は「メイン」画面と、同じ画面を違う名前で書いています。コードではどちらも `App.jsx` が `/` で表示する画面の `Catalog` です。

## 確かめられなかったこと

- 1b-2 のログイン後の戻り先は、サーバーの `POST /api/auth/login` が返す `returnTo` です。サーバーが `returnTo` をどう検査するかは EC-B01 の範囲として追っていません。

## 参照したコード

- [frontend/src/components/ProductDetail.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductDetail.jsx): 「購入数量」の `setQuantity()`、`maxQuantity`、「カートに追加」の `disabled` と `onAdd(quantity)`、`notice` と `error` の表示
- [frontend/src/components/ProductCard.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductCard.jsx): 「＋」ボタンの `onAdd` と `disabled`
- [frontend/src/components/CatalogProducts.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CatalogProducts.jsx): `onAdd(product.id)`
- [frontend/src/components/Catalog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Catalog.jsx): `onAdd={shop.add}`、`disabled` と `canBuy`、`shop.error` と「再読み込み」
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `canBuy`、`ProductDetail` の `onAdd`、トースト（「カートを見る」）
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `add()`、`setQuantity()`、`run()`、`refresh()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.setItem()`、`api.cart()`、`request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`（CSRF トークン）、`login()`、`buyerOnlyMessage`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `complete()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem()`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem()`、`checkRevision()`、`requireLockedCart()`、`view()`、`addShoppingItems()`（文言の比較）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing()`、`listingsByIds()`、`Listing.purchasable()`、`unavailableReason()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findByIdIn()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `invalid()`、`business()`
