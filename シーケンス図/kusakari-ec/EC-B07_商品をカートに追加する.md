# EC-B07 商品をカートに追加する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as アプリの枠<br/>App<br/>(App.jsx)
        participant Detail as 「植物について」ダイアログ<br/>ProductDetail<br/>(ProductDetail.jsx)
        participant Card as 商品カード<br/>ProductCard<br/>(ProductCard.jsx)
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

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 12 に適用<br/>*a 通信に失敗した場合: 10、12 に適用

    alt 1a 商品一覧から追加する
        User->>Card: 1a-1 商品カードの「＋」(「(商品名)をカートに追加」) をクリック
        Card->>Shop: 1a-2 商品を 1 点追加するよう頼む (onAdd → CatalogProducts.jsx の onAdd(product.id)<br/>→ Catalog.jsx の shop.add(product.id)、quantity は既定の 1)。基本フロー 4 へ
    else 「植物について」ダイアログから追加する
        User->>Detail: 「購入数量」欄に数量を入力
        Detail-->>User: 数量を覚え (setQuantity)、「カートに追加」を押せるようにする<br/>(maxQuantity は在庫数と 99 の小さいほう。2a 整数でない、1 未満、<br/>maxQuantity を超える、在庫が 0 なら押せない。通信しない。2a-2 基本フロー 1 へ戻る)
        User->>Detail: 「カートに追加」をクリック
        Detail->>Shop: 商品をカートに追加するよう頼む<br/>(onAdd(quantity) → App.jsx の shop.add(detail.id, quantity))
    end
    Shop->>Shop: 送る数量を決める (cart.items から今の数量を探し、<br/>今の数量 + 追加する数量で setQuantity)
    Shop->>Http: 明細の数量を書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する<br/>(@Valid、ItemRequest の quantity は 0〜99、revision は 0 以上)
    Ctrl->>Resolver: 会員のカートを特定するよう頼む (resolve)<br/>中身は EC-B08 の図と同じ流れ
    Resolver-->>Ctrl: カートの ID
    Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)<br/>updateItem 全体が 1 つのトランザクション
    Svc->>CartRepo: カートの行をロックして読む (findLocked、SELECT ... FOR UPDATE carts)
    CartRepo-->>Svc: カート
    Svc->>Svc: 送られた revision と今の revision を比べる (checkRevision)
    Svc->>ItemRepo: その商品の明細を読む (findById、SELECT cart_items)
    ItemRepo-->>Svc: 明細 (なければなし)
    Svc->>Catalog: 商品と、今買えるかを調べるよう頼む (listing)<br/>商品・在庫・店舗・組織を読む (findByIdIn、findAllById、<br/>SELECT products、inventory、stores、organizations)
    Catalog-->>Svc: 商品と買えない理由 (Listing)
    break 4a 送る数量が受取店舗の在庫数を超える
        Svc--xErrs: 409 OUT_OF_STOCK の例外を投げる (ApiException)
        Note over Errs,Detail: 結果: 409「受取店舗の在庫が不足しています。」を返す (business)。<br/>画面: 4a-1 最新のカートを取り直し、その文を出す (追加しない)。4a-2 基本フロー 1 へ戻る。
    end
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細を保存する (save、INSERT か UPDATE cart_items)<br/>カートになければ明細を作り、あれば数量を送られた数量で上書きする
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、明細ごとの金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: カートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 カートの内容
    Http-->>Shop: カートの内容
    Shop->>Shop: カートを置き換え、成功の文を覚える<br/>(setCart、setNotice('カートを更新しました。'))
    alt ダイアログから追加した
        Shop-->>Detail: 成功の文 (shop.notice)
        Detail-->>User: 5 ダイアログに「カートを更新しました。」
    else 1a 商品一覧から追加した
        Shop-->>App: 成功の文 (shop.notice)
        App-->>User: 5 トーストに「カートを更新しました。」と「カートを見る」
    end
```

![EC-B07 シーケンス図](<images/EC-B07_商品をカートに追加する-1.png>)
