# EC-B09 カートの数量を変更する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as カートの表示<br/>Cart<br/>(Cart.jsx)
        participant Shop as 買い物の状態<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Resolver as カートの特定<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant Svc as カートの処理<br/>CartService<br/>(CartService.java)
        participant Catalog as 商品の販売状態<br/>CatalogService<br/>(CatalogService.java)
        participant CartRepo as カートの読み書き<br/>CartRepository<br/>(CartRepository.java)
        participant ItemRepo as 明細の読み書き<br/>CartItemRepository<br/>(CartItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 7 に適用<br/>*a 通信に失敗した場合: 5、7 に適用

    User->>Cart: 対象商品の「＋」(「(商品名)を1個増やす」) か<br/>「−」(「(商品名)を1個減らす」) をクリック<br/>(「＋」は数量が 99 か在庫数以上、「−」は 1 以下、通信中は押せない)
    Cart->>Shop: 1 つ増やした数量か 1 つ減らした数量に書き換えるよう頼む<br/>(setQuantity(line.product.id, line.quantity ± 1))
    Shop->>Http: 明細の数量を書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する (@Valid、ItemRequest の quantity は 0〜99)。<br/>ボタンの制限で 1〜99 に収まるので通る
    Ctrl->>Resolver: 会員のカートを特定するよう頼む (resolve)<br/>中身は EC-B08 の図と同じ流れ
    Resolver-->>Ctrl: カートの ID
    Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)<br/>updateItem 全体が 1 つのトランザクション
    Svc->>CartRepo: カートの行をロックして読む (findLocked、SELECT ... FOR UPDATE carts)
    CartRepo-->>Svc: カート
    Svc->>Svc: 送られた revision と今の revision を比べる (checkRevision)
    Svc->>ItemRepo: その商品の明細を読む (findById、SELECT cart_items)
    ItemRepo-->>Svc: 今の明細
    Svc->>Catalog: 商品と、今買えるかを調べるよう頼む (listing)<br/>商品・在庫・店舗・組織を読む (findByIdIn、findAllById、<br/>SELECT products、inventory、stores、organizations)
    Catalog-->>Svc: 商品と買えない理由 (Listing)
    break 2a 送る数量が受取店舗の在庫数を超える
        Svc--xErrs: 409 OUT_OF_STOCK の例外を投げる (ApiException)
        Note over Errs,Cart: 結果: 409「受取店舗の在庫が不足しています。」を返し (business)、数量は変えない。<br/>画面: 2a-1 その文と、取り直した最新のカート。2a-2 基本フロー 1 へ戻る。
    end
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)。<br/>既にある商品なので 50 種類の上限には当たらない
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細の数量を送られた数量で上書きして保存する (save、UPDATE cart_items)
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、明細ごとの金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: カートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 カートの内容
    Http-->>Shop: カートの内容
    Shop->>Shop: カートを置き換え、成功の文を覚える<br/>(setCart、setNotice('カートを更新しました。'))
    Shop-->>Cart: 新しいカートと成功の文 (shop.cart、shop.notice)
    Cart-->>User: 3 新しい数量と金額 (lineTotalYen)、「ご請求内容」の<br/>商品小計・うち消費税・合計、「カートを更新しました。」
```

![EC-B09 シーケンス図](<images/EC-B09_カートの数量を変更する-1.png>)
