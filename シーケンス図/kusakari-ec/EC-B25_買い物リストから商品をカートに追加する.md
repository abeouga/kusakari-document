# EC-B25 買い物リストから商品をカートに追加する

- ユースケース記述: [EC-B25_買い物リストから商品をカートに追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B25_買い物リストから商品をカートに追加する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

ダイアログを開いて買い物リストを表示するまでは [EC-B24 の図](<EC-B24_買い物リストを確認する(EC).md>) にあります。カートへの追加は `POST /api/cart/shopping-lists/{gardenId}/items` の 1 回です。画面は数量を送らず、行の key と商品 ID と 3 つの版（庭、買い物リスト、カート）だけを送ります。必要数はサーバーが Canvas から取り直します。詳細図は、ブラウザー（詳細図 1）とサーバー（詳細図 2）に分けました。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 庭に設置したものから追加<br/>ダイアログ React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant CApi as Canvas API<br/>FastAPI

    Note over User,CApi: 基本フロー 1〜2 チェックを付ける（通信なし）
    User->>Page: 商品のチェックボックスにチェックを付ける
    alt 2a 1 つも選んでいない
        Page-->>User: 「カートに追加」（押せない）
    else 選んだ
        Page-->>User: 「(必要数の合計)点をカートに追加」（押せる）
    end
    opt 「すべて選択」
        User->>Page: 「すべて選択」をクリック
        Page-->>User: 選べる商品だけにチェックを付ける
    end

    Note over User,CApi: 基本フロー 3〜5 送って、検証して、カートに追加する
    User->>Page: 「n点をカートに追加」をクリック
    Note right of Page: 共通代替フロー *b を適用
    Page->>Api: GET /api/auth/csrf
    Api-->>Page: 200 CSRF トークン
    Page->>Api: POST /api/cart/shopping-lists/{gardenId}/items<br/>（庭の版、買い物リストの版、カートの版、key と商品 ID）
    alt 入力が不正
        Api-->>Page: 400 INVALID_INPUT
    else 入力を通る
        Note over Api,Db: ここからの処理は 1 つのトランザクション。<br/>Canvas への通信は、カートのロックを取る前に終える
        Api->>CApi: GET /api/gardens/{id}/shopping-list
        alt 庭が見つからない、Canvas に接続できない
            CApi--xApi: 404、接続できない、エラー
            Api-->>Page: 404 GARDEN_NOT_FOUND、503 SHOPPING_LIST_UNAVAILABLE
        else 取得できた
            CApi-->>Api: 200 配置の行と庭の版
            Api->>Db: カートの行を FOR UPDATE で読み、<br/>EC で追加した商品と版を読む
            Db-->>Api: 行
            alt 4b 庭の版が違う
                Api-->>Page: 409 GARDEN_CHANGED
            else 4b 買い物リストの版が違う
                Api-->>Page: 409 SHOPPING_LIST_CHANGED
            else 版が合う
                Api->>Db: 最新の行の候補の商品、在庫を読む
                Db-->>Api: 行
                alt 選択が行と合わない
                    Api-->>Page: 400 INVALID_SELECTION
                else 選択が合う
                    alt 4b カートの版が違う
                        Api-->>Page: 409 CART_CHANGED
                    else 版が合う
                        Api->>Db: カートの明細、商品、在庫を読む
                        Db-->>Api: 行
                        loop 選んだ商品ごと
                            alt 4a 追加できない
                                Api->>Api: 見送る（販売終了、上限99点、<br/>在庫不足、上限50種類）
                            else 追加できる
                                Api->>Db: 明細を追加するか、数量を足す
                                Db-->>Api: 件数
                            end
                        end
                        opt 1 つ以上追加した
                            Api->>Db: カートの版を 1 増やす
                            Db-->>Api: 件数
                        end
                        Api-->>Page: 200 最新のカート、追加した商品、見送った商品
                    end
                end
            end
        end
    end

    Note over User,CApi: 基本フロー 6 結果を表示する
    alt 追加できた（4a の見送りを含む）
        Page-->>User: ダイアログを閉じ、「(庭の名前)からn種類を追加しました。」<br/>と追加した商品のあるカート
        opt 4a 見送った商品がある
            Page-->>User: 「n種類は追加できませんでした。」と<br/>「(商品名)：(理由)」、「庭から選び直す」
            alt 4a-3 「庭から選び直す」
                User->>Page: 「庭から選び直す」をクリック
                Page-->>User: 同じ庭を選んだダイアログ<br/>（EC-B24 の基本フロー 5）
            else 4a-4 「結果を閉じる」
                User->>Page: 「結果を閉じる」をクリック
                Page-->>User: 結果の表示を消す（通信なし）
            end
        end
    else 4b 409 が返った
        Page->>Api: GET /api/cart ほか
        Api-->>Page: 200 最新のカート
        Page->>Api: GET /api/shopping-lists/{gardenId}
        Api-->>Page: 200 最新の買い物リスト
        Page-->>User: 「庭の配置が変更されました。…」などと最新の買い物リスト。<br/>庭か買い物リストの版が変わっていたら選択を外す
        Note right of User: 4b-3 基本フロー 1 へ戻る
    else 400、404、503 が返った
        Page->>Api: GET /api/shopping-lists/{gardenId}
        Api-->>Page: 200 最新の買い物リスト
        Page-->>User: エラーのメッセージと最新の買い物リスト
    else 5a 通信に失敗した
        Page->>Api: GET /api/shopping-lists/{gardenId}
        Api-->>Page: 200 最新の買い物リスト（接続できなければ失敗）
        Page-->>User: 「サーバーに接続できません。接続を確認して<br/>再試行してください。」。選択は残す
        Note right of User: 5a-3 もう一度クリックすると基本フロー 4 へ戻る
    end
```

## 詳細図 1 基本フロー 1〜3、6 ブラウザー

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Dlg as GardenItemsDialog.jsx
        participant Shop as useShop.js
        participant Data as useShoppingData.js
        participant Http as api.js
        participant AuthJs as auth.js
        participant Nav as navigation.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant Ctrl as ShoppingController<br/>（詳細図 2）
        participant CartCtrl as CartController
    end

    Note over User,CartCtrl: 基本フロー 1〜2 チェックを付ける（通信なし）
    User->>Dlg: 商品のチェックボックスにチェックを付ける
    Dlg->>Dlg: setSelection() で key と product.id を覚える
    Dlg->>Dlg: picked の line.quantity を合計する
    alt 2a 1 つも選んでいない（picked.length が 0）
        Dlg-->>User: 「カートに追加」（disabled）
    else 選んだ
        Dlg-->>User: 「(quantity)点をカートに追加」
    end
    opt 「すべて選択」
        User->>Dlg: 「すべて選択」をクリック
        Dlg->>Dlg: selectAll() で selectable の行だけを選ぶ
    end

    Note over User,CartCtrl: 基本フロー 3 「n点をカートに追加」をクリック
    User->>Dlg: 「n点をカートに追加」をクリック
    Dlg->>Dlg: add()
    Dlg->>Shop: transferShoppingList(gardenId, gardenRevision,<br/>listRevision, cartRevision, items)
    Shop->>Shop: run(action) が busy にし、error と notice を消す
    Shop->>Http: api.transferShoppingList(gardenId, input)
    Http->>AuthJs: send() が authFetch(url, init)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 headerName と token
    AuthJs->>Ctrl: POST /api/cart/shopping-lists/{gardenId}/items<br/>（X-CSRF-TOKEN を付ける）
    Note right of Ctrl: 基本フロー 4〜5 は詳細図 2
    Note right of Http: 401 のときは readResponse() が sessionExpiredEvent を出し、<br/>SessionNotice がログインを案内する（共通代替フロー *b）

    Note over User,CartCtrl: 基本フロー 6 と失敗のあと
    alt 追加できた（4a の見送りを含む）
        Ctrl-->>AuthJs: 200 TransferResult（cart、added、skipped）
        AuthJs-->>Http: Response
        Http-->>Shop: readResponse() が result を返す
        Shop->>Shop: setCart(result.cart) と setShoppingTransfer(result)
        Shop-->>Dlg: result
        Dlg->>Dlg: onAdded() が close()。ダイアログを閉じ、<br/>requested.clear() で URL から garden を外す
        Dlg-->>User: ShoppingTransferNotice が「(庭の名前)からn種類を<br/>追加しました。」。カートに追加した商品
        opt 4a 見送った商品がある（skipped）
            Dlg-->>User: 「n種類は追加できませんでした。」と<br/>「(商品名)：(理由)」、「庭から選び直す」
            alt 4a-3 「庭から選び直す」
                User->>Dlg: 「庭から選び直す」をクリック
                Dlg->>Nav: navigate('/cart?garden={gardenId}')
                Nav-->>Dlg: popstate で useRequestedGarden() が庭を読む
                Note right of Dlg: ダイアログを開き直し、最新の在庫で<br/>表示する（EC-B24 の基本フロー 5）
            else 4a-4 「結果を閉じる」
                User->>Dlg: 「結果を閉じる」をクリック
                Dlg->>Shop: setShoppingTransfer(null)
                Shop-->>Dlg: 結果の表示を消す
            end
        end
    else 4b 409 GARDEN_CHANGED、SHOPPING_LIST_CHANGED、CART_CHANGED
        Ctrl-->>AuthJs: 409 と message
        AuthJs-->>Http: Response
        Http--xShop: readResponse() が throw ApiError(409)
        Shop->>Shop: setError(message)
        Shop->>Http: 409 なので refresh() が api.cart()
        Http->>CartCtrl: GET /api/cart
        CartCtrl-->>Http: 200 Cart
        Http-->>Shop: 最新のカート
        Note right of Shop: refresh() は GET /api/products と<br/>GET /api/orders も送る。図では省略
        Shop-->>Dlg: null（run() が false）
        Dlg->>Dlg: setFailed(true)
        Dlg->>Data: data.reload()
        Data->>Http: api.shoppingList(gardenId)
        Http->>Ctrl: GET /api/shopping-lists/{gardenId}
        Ctrl-->>Http: 200 Detail
        Http-->>Data: detail
        Data-->>Dlg: data.detail
        Dlg->>Dlg: revision か listRevision が変わっていたら<br/>setSelection({}) で選択を外す
        Dlg-->>User: shop.error（「庭の配置が変更されました。…」など）と<br/>最新の買い物リスト
        Note right of User: 4b-3 基本フロー 1 へ戻る
    else 400 INVALID_INPUT、INVALID_SELECTION、404 GARDEN_NOT_FOUND、503 SHOPPING_LIST_UNAVAILABLE
        Ctrl-->>AuthJs: 400、404、503 と message
        AuthJs-->>Http: Response
        Http--xShop: throw ApiError
        Shop->>Shop: setError(message)
        Shop-->>Dlg: null
        Dlg->>Dlg: setFailed(true)
        Dlg->>Data: data.reload()
        Data->>Http: api.shoppingList(gardenId)
        Http->>Ctrl: GET /api/shopping-lists/{gardenId}
        Ctrl-->>Http: 200 Detail
        Http-->>Data: detail
        Data-->>Dlg: data.detail
        Dlg-->>User: shop.error と最新の買い物リスト（選択は残す）
    else 5a 通信に失敗した
        AuthJs--xHttp: fetch が失敗
        Http--xShop: send() が throw ApiError(networkErrorMessage, 0)
        Shop->>Shop: setError(message)
        Shop-->>Dlg: null
        Dlg->>Dlg: setFailed(true)
        Dlg->>Data: data.reload()
        Data->>Http: api.shoppingList(gardenId)
        Http-->>Data: detail（接続できなければ throw ApiError(0) で data.error）
        Dlg-->>User: 「サーバーに接続できません。接続を確認して<br/>再試行してください。」。選択は残す
        Note right of User: 5a-3 もう一度クリックすると基本フロー 4 へ戻る
    end
    Note right of Dlg: shop.error が空のとき（ほかの操作の実行中で<br/>run() が何もしなかったときなど）は<br/>「選択した商品はカートに追加されていません。」を出す
```

## 詳細図 2 基本フロー 4〜5 サーバー

```mermaid
sequenceDiagram
    box rgba(47,111,219,0.10) ブラウザー React
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Shopping<br/>Controller
        participant Errs as ApiErrors
        participant Svc as ShoppingService
        participant Client as CanvasShopping<br/>Client
        participant Saved as SavedShopping<br/>Items
        participant Carts as CartService
        participant CartRepo as CartRepository
        participant Items as CartItem<br/>Repository
        participant Cat as CatalogService
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant CApi as Canvas API<br/>FastAPI
    end
    participant Db as MySQL

    Note over AuthJs,Db: 基本フロー 4 入力と版を検証する
    AuthJs->>Ctrl: POST /api/cart/shopping-lists/{gardenId}/items
    Note right of Ctrl: CSRF の検査と、未ログインの 401 は Spring Security が行う。<br/>図では省略（共通代替フロー *b）
    Ctrl->>Ctrl: @Valid が TransferRequest を検査
    alt 入力が不正（items が空か 201 件以上、key が空など）
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>AuthJs: invalid() が 400 INVALID_INPUT を返す
    else 検査を通る
        Ctrl->>Ctrl: sessions.resolve() が cartId を求める
        Note right of Ctrl: CartSessionResolver が requireBuyer() と<br/>MemberCartService.resolve() を呼ぶ。<br/>店舗側・出店申請用は 403 BUYER_REQUIRED。図では省略
        Ctrl->>Svc: transfer(gardenId, cartId, input)
        Note over Svc,Db: transfer() 全体が 1 つのトランザクション（READ_COMMITTED）。<br/>CartService と SavedShoppingItems の読み取りも同じトランザクションに入る。<br/>例外のときはロールバックする
        Svc->>Client: detail(gardenId)
        Client->>CApi: GET /api/gardens/{id}/shopping-list
        alt 庭が見つからない、Canvas に接続できない
            CApi--xClient: 404、接続できない、時間切れ、5xx
            Client--xErrs: throw ApiException(404 GARDEN_NOT_FOUND<br/>か 503 SHOPPING_LIST_UNAVAILABLE)
            Errs-->>AuthJs: business() が 404 か 503 を返す
        else 取得できた
            CApi-->>Client: 200 SourceList（revision と行）
            Client-->>Svc: source
            Note right of Svc: Canvas への通信は、<br/>カートのロックを取る前に終える
            Svc->>Saved: lockAndRead(cartId, gardenId)
            Saved->>CartRepo: lock() が findLocked(cartId)
            CartRepo->>Db: SELECT carts … FOR UPDATE
            Db-->>CartRepo: 行
            CartRepo-->>Saved: CartEntity
            Saved->>Db: read() が SELECT garden_shopping_lists と<br/>garden_shopping_items、products
            Db-->>Saved: 行
            Saved-->>Svc: Snapshot（revision、EC で追加した商品）
            alt 4b 庭の版が違う（source.revision と gardenRevision）
                Svc--xErrs: throw ApiException(409, GARDEN_CHANGED)
                Errs-->>AuthJs: 409「庭の配置が変更されました。<br/>最新の買い物リストから選び直してください。」
            else 4b 買い物リストの版が違う（snapshot.revision と listRevision）
                Svc--xErrs: throw ApiException(409, SHOPPING_LIST_CHANGED)
                Errs-->>AuthJs: 409「買い物リストが更新されました。<br/>最新の内容から選び直してください。」
            else 版が合う
                Svc->>Svc: supplement() と resolve() で<br/>最新の行と候補の商品を作る
                Note right of Svc: resolve() の DB の読み取りは<br/>EC-B24 の詳細図 3 と同じ。図では省略
                Svc->>Svc: 選んだ key と productId を行と照らし、<br/>同じ商品の必要数を合計して additions を作る
                alt 選択が行と合わない（同じ key、無い key、候補に無い商品）
                    Svc--xErrs: throw ApiException(400, INVALID_SELECTION)
                    Errs-->>AuthJs: business() が 400 を返す
                else 選択が合う
                    Svc->>Carts: addShoppingItems(cartId, cartRevision,<br/>gardenId, gardenName, additions)
                    Carts->>CartRepo: requireLockedCart() が findLocked(id)
                    CartRepo->>Db: SELECT carts … FOR UPDATE（取得済みのロック）
                    Db-->>CartRepo: 行
                    CartRepo-->>Carts: CartEntity
                    alt 4b カートの版が違う（checkRevision()）
                        Carts--xErrs: throw ApiException(409, CART_CHANGED)
                        Errs-->>AuthJs: 409「別の操作でカートが更新されました。<br/>最新の内容を確認してください。」
                    else 版が合う
                        Carts->>Items: findAllForCart(id)
                        Items->>Db: SELECT cart_items
                        Db-->>Items: 行
                        Items-->>Carts: カートの明細
                        Carts->>Cat: listingsById() が listingsByIds(productIds)
                        Cat->>Db: SELECT products、inventory、stores、organizations
                        Db-->>Cat: 行
                        Cat-->>Carts: Listing（商品、在庫、買えない理由）
                        Note over AuthJs,Db: 基本フロー 5 カートに追加する
                        loop additions ごと
                            alt 4a 追加できない
                                Carts->>Carts: skipped に入れる。PRODUCT_ARCHIVED、<br/>QUANTITY_LIMIT、OUT_OF_STOCK、CART_LIMIT の順に見る
                            else 追加できる
                                Carts->>Items: save(item)（カートの数量＋必要数）
                                Items-->>Carts: CartItemEntity
                                Carts->>Carts: added に入れる
                            end
                        end
                        opt added が 1 つ以上
                            Carts->>Carts: cart.incrementRevision()
                        end
                        Note right of Carts: cart_items の INSERT・UPDATE と carts の revision の<br/>UPDATE は、JPA が flush するときに MySQL へ送る
                        Carts->>Carts: view(cart) で最新のカートを作る<br/>（明細と商品を読み直す。図では省略）
                        Carts-->>Svc: TransferResult（cart、added、skipped）
                        Svc-->>Ctrl: TransferResult
                        Note over Svc,Db: コミットしてカートのロックを外す
                        Ctrl-->>AuthJs: 200 TransferResult
                    end
                end
            end
        end
    end
```

## ユースケース記述との差

- コードにあって記述にない分岐が 3 つあります。入力の検査で止まる 400 `INVALID_INPUT`、選んだ key と商品 ID が最新の行と合わない 400 `INVALID_SELECTION`、カートへの追加の途中で Canvas から庭を取り直せない 404 `GARDEN_NOT_FOUND` と 503 `SHOPPING_LIST_UNAVAILABLE` です。画面はどれもエラーのメッセージを出し、選択を残したまま買い物リストを取り直します。
- 4b-2：409 のうち `CART_CHANGED` では、画面はカートを取り直しますが、庭と買い物リストの版は変わらないので選択は残ります。記述の「庭プロジェクトか買い物リストが変わっていた場合は、選択を解除する」と同じ動きです。
- 4a：すべての商品を見送ったときも 200 で、ダイアログを閉じて「(庭の名前)から0種類を追加しました。」を出します。このときカートの版は上がりません。
- 「結果を閉じる」は、見送りが無いときも出ます（`ShoppingTransferNotice`）。

## 確かめられなかったこと

- `CartService.addShoppingItems()` の `items.save(item)` と `cart.incrementRevision()` の変更を MySQL へ送る時点（`view(cart)` の中の `findAllForCart()` の前の自動の flush か、コミットのときか）は、実行して確かめていません。図では flush のときとだけ書きました。

## 参照したコード

- [frontend/src/components/GardenItemsDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/GardenItemsDialog.jsx): `GardenItems` の `add`、`selectAll`、選択を外す `useEffect`、`ShoppingTransferNotice`、`AddFromGardenCard` の `close`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `transferShoppingList`、`run`、`refresh`、`setShoppingTransfer`
- [frontend/src/components/useShoppingData.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/useShoppingData.js): `reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.transferShoppingList`、`request`、`send`、`readResponse`、`networkErrorMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java): `transfer`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingDtos.java): `TransferRequest`、`Selection` の検査
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java): `transfer`、`invalidSelection`
- [backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java): `lockAndRead`、`lock`、`read`
- [backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java): `detail`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `addShoppingItems`、`requireLockedCart`、`checkRevision`、`view`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked`（`PESSIMISTIC_WRITE`）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listingsByIds`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`
