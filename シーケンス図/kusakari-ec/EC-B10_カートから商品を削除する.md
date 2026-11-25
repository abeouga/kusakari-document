# EC-B10 カートから商品を削除する

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
        participant Resolver as カートの特定<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant Svc as カートの処理<br/>CartService<br/>(CartService.java)
        participant Catalog as 商品の販売状態<br/>CatalogService<br/>(CatalogService.java)
        participant CartRepo as カートの読み書き<br/>CartRepository<br/>(CartRepository.java)
        participant ItemRepo as 明細の読み書き<br/>CartItemRepository<br/>(CartItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 7 に適用<br/>*a 通信に失敗した場合: 5、7 に適用

    User->>Cart: 対象商品のごみ箱アイコン (「(商品名)を削除」) をクリック<br/>(通信中は押せない)
    Cart->>Shop: 数量を 0 に書き換えるよう頼む (setQuantity(line.product.id, 0))
    Shop->>Http: 明細の数量を 0 に書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity: 0, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する (@Valid、ItemRequest)。0 は @Min(0) を満たす
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
    Svc->>Svc: 数量が 0 なので、購入できるか・在庫の検査は通る<br/>(購入できない明細や在庫不足の明細も削除できる)
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)。<br/>数量が 0 なので 50 種類の上限の検査も通る
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細を削除する (existing.ifPresent(items::delete)、DELETE cart_items)
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、残りの明細の金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: 残りのカートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 残りのカートの内容
    Http-->>Shop: 残りのカートの内容
    Shop->>Shop: カートを置き換え、数量が 0 なので削除の文を覚える<br/>(setCart、setNotice('カートから削除しました。'))
    Shop-->>Cart: 新しいカートと削除の文 (shop.cart、shop.notice)
    alt 商品が残っている
        Cart-->>User: 3 更新後の明細と「ご請求内容」(商品小計、うち消費税、合計)、<br/>「カートから削除しました。」
    else 最後の商品を削除した (cart.items.length が 0)
        Cart-->>User: 3「まだ商品が入っていません。」「商品を探す」<br/>「庭に設置したものから追加」(「カートから削除しました。」は出ない)
    end
```

![EC-B10 シーケンス図](<images/EC-B10_カートから商品を削除する-1.png>)
