# EC-B08 カートを確認する

- ユースケース記述: [EC-B08_カートを確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B08_カートを確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

カートのデータは、アプリを開いたときに `useShop` が `GET /api/cart` で読み込みます。共通ヘッダーの「カート」をクリックしても通信せず、読み込み済みのカートを「ショッピングカート」画面に表示します。購入できなくなった明細を外す処理（2b）は、この `GET /api/cart` の中でサーバーが行います。そのため詳細図は、アプリを開いたときの読み込み（詳細図 1）と、画面の表示（詳細図 2）に分けました。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as EC の画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: アプリを開いたとき（「カート」のクリックより前に自動で実行する。/cart を直接開いたときも同じ）
    Page->>Api: GET /api/cart
    Note over Page,Api: 未ログインなら 401 LOGIN_REQUIRED（共通代替フロー *b。図では省略）
    Api->>Api: 購入者のアカウントかを確かめる
    alt 関連情報 店舗側・出店申請用のアカウント
        Api-->>Page: 403 BUYER_REQUIRED
        Note over Page,Api: 続けて GET /api/products（図では省略）
    else 購入者か運営
        Api->>Db: 会員を FOR UPDATE で読み、<br/>会員のカートを探す（なければ作る）
        Db-->>Api: カート
        Api->>Db: カートを FOR UPDATE で読み、<br/>明細・商品・在庫・店舗・組織を読む
        Db-->>Api: 行
        opt 2b 戻らない理由で購入できなくなった明細がある
            Api->>Db: その明細を削除し、<br/>カートの revision を 1 増やす
            Db-->>Api: 件数
        end
        Api->>Api: 明細ごとの金額と購入できるか、<br/>合計、canCheckout を計算
        Api-->>Page: 200 CartView<br/>（明細、合計、canCheckout、removedItems）
        Note over Page,Api: 続けて GET /api/products、GET /api/orders（図では省略）
    end
    Note over Page,Api: 最後に GET /api/stores で基準地点の近くの店舗を読む（図では省略）

    Note over User,Db: 基本フロー 1〜2 「カート」から「ショッピングカート」画面を開く
    User->>Page: 共通ヘッダーの「カート」をクリック
    Page->>Page: URL を /cart に変えて画面を切り替える（通信しない）
    Note over User,Page: 共通代替フロー *b を適用。<br/>GET /api/auth/me の結果が未ログインなら「ログイン」画面へ移る
    alt 関連情報 店舗側・出店申請用のアカウント
        Page-->>User: 「店舗・出店申請用のアカウントでは購入できません。<br/>購入は購入者のアカウントでご利用ください。」と「商品を探す」
    else 2a カートが空
        Page-->>User: 「まだ商品が入っていません。」、「商品を探す」、<br/>「庭に設置したものから追加」
        Note right of User: 2a-2 ユースケースを終了する
    else 商品がある
        loop 明細ごと
            opt 2c 一時的に購入できない
                Page-->>User: 「現在は購入できません」
            end
            opt 2d 在庫が足りない
                Page-->>User: 「在庫不足（現在 N 点）」
            end
        end
        Page-->>User: 明細（画像、名前、価格、受取店舗、数量、金額）、<br/>「庭に設置したものから追加」、<br/>「ご請求内容」（商品小計、うち消費税、合計）
    end
    opt 2b 外した明細がある
        Page-->>User: 「(商品名)は購入できなくなったため<br/>カートから外しました。」と「閉じる」
    end

    Note over User,Db: 基本フロー 3 表示内容を確認する
    opt 2b-2 「閉じる」をクリックする
        User->>Page: 「閉じる」をクリック
        Page-->>User: 表示を消す（通信しない）
    end
```

## 詳細図 1 アプリを開いたときの読み込み

```mermaid
sequenceDiagram
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as App.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as CartController
        participant Errs as ApiErrors
        participant Session as CartSession<br/>Resolver
        participant Auth as AuthService
        participant Member as MemberCart<br/>Service
        participant Svc as CartService
        participant Catalog as CatalogService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over App,Db: アプリを開いたとき（「カート」のクリックより前に自動で実行する。/cart を直接開いたときも同じ）
    App->>Shop: useShop()
    Shop->>Shop: useEffect が initialize() を実行し、<br/>run() の中で refresh()
    Shop->>Http: api.cart()
    Http->>Ctrl: GET /api/cart
    Note over Http,Ctrl: 未ログインなら AuthConfiguration の authenticationEntryPoint が Controller の前で<br/>401 LOGIN_REQUIRED を返し、refresh() が setSignedOut(true) にする（共通代替フロー *b。図では省略）
    Ctrl->>Session: resolve(request, response)
    Session->>Auth: requireBuyer()
    Auth->>Auth: current() でログイン中の会員を読み、<br/>accountType を確かめる
    alt 関連情報 店舗側・出店申請用のアカウント
        Auth--xErrs: throw ApiException(403, BUYER_REQUIRED)
        Errs-->>Http: business() が 403 と message
        Http--xShop: throw ApiError(403)
        Shop->>Shop: refresh() の catch で<br/>setRefusedBuyer(true)、setCart(null)
        Note over Shop,Http: 続けて api.products() で GET /api/products（図では省略）
    else 購入者（USER）か運営（ADMIN）
        Auth-->>Session: AuthMember
        Session->>Member: resolve(memberId)
        Note over Member,Db: @Transactional resolve() は、このあとの CartService.read() とは別のトランザクション
        Member->>Repo: AuthMemberRepository.lockMember(memberId)
        Repo->>Db: SELECT ... FOR UPDATE（members）
        Db-->>Repo: 行
        Repo-->>Member: AuthMember
        Member->>Repo: CartRepository.findByMemberId(memberId)
        Repo->>Db: SELECT（carts）
        Db-->>Repo: 行 または なし
        Repo-->>Member: Optional の CartEntity
        opt 会員のカートがまだない
            Member->>Repo: CartRepository.saveAndFlush(cart)
            Repo->>Db: INSERT（carts）
            Db-->>Repo: 件数
            Repo-->>Member: CartEntity
        end
        Member-->>Session: cartId
        Session-->>Ctrl: cartId
        Ctrl->>Svc: read(cartId)
        Note over Svc,Db: @Transactional(READ_COMMITTED) read() 全体が 1 つのトランザクション
        Svc->>Repo: CartRepository.findLocked(id)
        Repo->>Db: SELECT ... FOR UPDATE（carts）
        Db-->>Repo: 行
        Repo-->>Svc: CartEntity
        Svc->>Repo: CartItemRepository.findAllForCart(id)
        Repo->>Db: SELECT（cart_items）
        Db-->>Repo: 行
        Repo-->>Svc: CartItemEntity のリスト
        Svc->>Catalog: listingsByIds(productIds)
        Catalog->>Repo: ProductRepository.findByIdIn()、<br/>InventoryRepository / StoreRepository /<br/>OrganizationRepository.findAllById()
        Repo->>Db: SELECT（products、inventory、stores、organizations）
        Db-->>Repo: 行
        Repo-->>Catalog: Entity
        Catalog->>Catalog: unavailableReason() で買えない理由を決める
        Catalog-->>Svc: Listing のリスト
        loop 明細ごと
            opt 2b 理由が REMOVED_REASONS のどれか
                Note right of Svc: DELETED、STORE_CLOSED、<br/>STORE_SUSPENDED、<br/>ORGANIZATION_SUSPENDED
                Svc->>Svc: removed に RemovedLine を足す
                Svc->>Repo: CartItemRepository.delete(item)
                Repo-->>Svc: 戻る
            end
        end
        alt 2b 外した明細がある
            Svc->>Repo: CartItemRepository.flush()
            Repo->>Db: DELETE（cart_items）
            Db-->>Repo: 件数
            Repo-->>Svc: 戻る
            Svc->>Svc: cart.incrementRevision()
            Svc->>Svc: view(cart, removed)
        else 外した明細がない
            Svc->>Svc: view(cart)
        end
        Note right of Svc: view() は findAllForCart() と listingsByIds() を<br/>もう一度呼び、明細ごとの lineTotalYen と available、<br/>totalYen、itemCount、canCheckout を計算し、<br/>DeliveryService.pickupDetails() で<br/>受取連絡先を付ける（図では省略）
        Note over Svc,Db: read() の終わりにコミット。外したときは carts の revision の UPDATE も確定する
        Svc-->>Ctrl: CartView
        Ctrl-->>Http: 200 CartView
        Http-->>Shop: cart
        Shop->>Shop: setSignedOut(false)、setRefusedBuyer(false)、<br/>setCart(cart)
        opt 2b removedItems がある
            Shop->>Shop: setRemovedLines(removedItems)
        end
        Note over Shop,Http: 続けて api.products() と api.orders() で GET /api/products、GET /api/orders（図では省略）
    end
    Note over Shop,Http: 最後に initialize() が api.stores() で GET /api/stores を送る（図では省略）
```

## 詳細図 2 基本フロー 1〜3 画面の表示

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx
        participant App as App.jsx
        participant Page as CartPage.jsx
        participant Cart as Cart.jsx
        participant Shop as useShop.js
    end

    Note over User,Shop: 基本フロー 1〜2 「カート」から「ショッピングカート」画面を開く
    User->>Header: 共通ヘッダーの「カート」をクリック
    Header->>App: follow() が onNavigate(href)
    App->>App: navigateFromHeader(url) が navigate('/cart')
    Note right of App: history.pushState で URL だけを変え、<br/>usePath() が path を更新する。通信しない
    Note over User,Shop: 共通代替フロー *b を適用。useAuth() の GET /api/auth/me が未ログインなら、<br/>cartLoginRequired の useEffect が redirectToLogin() で「ログイン」画面へ移る
    App->>Page: path が /cart なので CartPage を表示
    alt 関連情報 店舗側・出店申請用のアカウント（shop.buyerBlocked）
        Page-->>User: buyerOnlyMessage と「商品を探す」
    else 購入者
        Page->>Cart: Cart を表示
        Note right of Cart: shop.cart は詳細図 1 で<br/>読み込み済み
        alt 2a cart.items.length が 0
            Cart-->>User: 「まだ商品が入っていません。」、「商品を探す」、<br/>AddFromGardenCard の「庭に設置したものから追加」
            Note right of User: 2a-2 ユースケースを終了する
        else 商品がある
            loop 明細ごと（cart.items.map）
                opt 2c line.unavailableReason がある
                    Cart-->>User: 「現在は購入できません」
                end
                opt 2d line.available が false で unavailableReason がない
                    Cart-->>User: 「在庫不足（現在 line.product.stock 点）」
                end
            end
            Cart->>Cart: うち消費税 = Math.floor(totalYen × 10 / 110)
            Cart-->>User: 「ショッピングカート (itemCount)」、明細、<br/>「庭に設置したものから追加」、「ご請求内容」
            Note right of Cart: cart.canCheckout が false なら<br/>「注文内容を確認する」は disabled（EC-B12）
        end
        opt 2b shop.removedLines がある
            Cart-->>User: RemovedNotice が「(name)は購入できなくなったため<br/>カートから外しました。」と「閉じる」
        end
    end

    Note over User,Shop: 基本フロー 3 表示内容を確認する
    opt 2b-2 「閉じる」をクリックする
        User->>Cart: 「閉じる」をクリック
        Cart->>Shop: setRemovedLines([])
        Shop-->>Cart: shop.removedLines が空
        Cart-->>User: 表示を消す（通信しない）
    end
```

## ユースケース記述との差

- 記述では、基本フロー 2 で画面を表示するときにカートを読み、2b で明細を外すように読めます。コードでは「カート」のクリックでは通信しません。カートはアプリを開いたとき（`useShop` の `initialize()`）と、ほかの操作のあとの `refresh()` で読み込み済みです。2b の「外す」処理も、そのときの `GET /api/cart` の中でサーバーが行います。読み込んだあとに店舗が閉鎖されたなどの変化は、次に `GET /api/cart` を送るまで画面に出ません。
- 記述にない処理です。2b で明細を外すと、サーバーはカートの `revision` を 1 増やします。ほかの画面で開いていた古いカートの操作は、409 `CART_CHANGED` で断られます。`GET` ですが DB を書き換えます。
- 共通代替フロー *a の「再実行を可能にする」について、カートを読み込めなかったとき（`shop.cart` が null で `shop.error` がある）の「ショッピングカート」画面には、エラーメッセージと「商品を探す」だけが出ます。再実行のボタンはありません。「商品を探す」で戻る「トップ」画面の一覧には「再読み込み」（`shop.initialize`）があります。
- 記述にない表示です。各明細に「この商品を庭に配置」（Canvas へのリンク）が出ます。見出しは「ショッピングカート (商品の点数)」です。
- 記述にない処理です。「うち消費税」はサーバーから受け取らず、画面が `Math.floor(totalYen × 10 / 110)` で計算します。商品小計（`subtotalYen`）と合計（`totalYen`）はサーバーが計算し、送料がないので同じ値です。
- 2b、2c、2d の条件は、記述とコードが一致しています。2b はサーバーの `CatalogService.REMOVED_REASONS`（`DELETED`、`STORE_CLOSED`、`STORE_SUSPENDED`、`ORGANIZATION_SUSPENDED`）、2c はそれ以外の `unavailableReason`（`STORE_CLOSING`、`STORE_UNPUBLISHED`、`ORGANIZATION_NOT_ACCEPTING`、`PRODUCT_SUSPENDED`、`HIDDEN`）、2d は `unavailableReason` が null で在庫が数量より少ない明細です。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): 「カート」のリンク、`follow()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `useShop()` の呼び出し、`navigateFromHeader()`、`cartLoginRequired` と `redirectToLogin()`、`CartPage` の表示、`canBuy`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `readSession()` の呼び出し
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession()`（`GET /api/auth/me`）、`redirectToLogin()`、`isShopAccount()`、`buyerOnlyMessage`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `initialize()`、`refresh()`、`run()`、`buyerBlocked`、`removedLines` と `setRemovedLines()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.cart()`、`api.products()`、`api.orders()`、`api.stores()`、`readResponse()`
- [frontend/src/components/CartPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CartPage.jsx): `shop.buyerBlocked` の分岐、「商品を探す」
- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Cart.jsx): 空のカート、明細の表示（「現在は購入できません」「在庫不足」）、「ご請求内容」、`RemovedNotice`
- [frontend/src/components/GardenItemsDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/GardenItemsDialog.jsx): `AddFromGardenCard`（開くまでは通信しない）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `lockMember()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `read()`、`view()`、`requireLockedCart()`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `CartView`、`CartLine`、`RemovedLine`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findByMemberId()`、`findLocked()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/DeliveryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/DeliveryService.java): `pickupDetails()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listingsByIds()`、`REMOVED_REASONS`、`unavailableReason()`、`storeReason()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findByIdIn()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
