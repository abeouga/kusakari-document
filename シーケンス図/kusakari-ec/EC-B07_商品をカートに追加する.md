# EC-B07 商品をカートに追加する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as EC の画面の切り替え<br/>(App.jsx)
        participant Detail as 「植物について」ダイアログ<br/>(ProductDetail.jsx)
        participant Card as 商品カード<br/>(ProductCard.jsx)
        participant Shop as 商品とカートの状態<br/>(useShop.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as カートAPI<br/>(CartController.java)
        participant Errs as エラーの応答<br/>(ApiErrors.java)
        participant Resolver as カートの特定<br/>(CartSessionResolver.java)
        participant Svc as カートの処理<br/>(CartService.java)
        participant Catalog as 商品の販売状態<br/>(CatalogService.java)
        participant ItemRepo as 明細の読み書き<br/>(CartItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 9 に適用<br/>*a 通信に失敗した場合: 9 に適用

    alt 1a 商品一覧から追加する
        User->>Card: 商品カードの「＋」をクリック
        Card->>Shop: 商品を 1 点カートに追加する処理を呼ぶ (add)
    else 「植物について」ダイアログから追加する
        User->>Detail: 「購入数量」欄に数量を入力
        Detail-->>User: 数量が 1 以上で、在庫数と 99 以下なら「カートに追加」を押せるようにする
        User->>Detail: 「カートに追加」をクリック
        Detail->>Shop: 入力した数量をカートに追加する処理を呼ぶ (add)
    end
    Shop->>Shop: 今の数量に追加する数量を足して、送る数量を決める
    Shop->>Http: 明細の数量を書き換える処理を呼ぶ (setItem)
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/cart/items/{商品 ID}
    Ctrl->>Ctrl: 数量が 0〜99 かを確かめる
    Ctrl->>Resolver: 会員のカートを特定する処理を呼ぶ (resolve)<br/>流れは EC-B08 の図と同じ
    Resolver-->>Ctrl: カートの ID を返す
    Ctrl->>Svc: 明細の数量を書き換えるトランザクションを開始 (updateItem)
    Svc->>Svc: カートの行をロックして読み、画面のカートが古くないか (checkRevision) を確かめ、<br/>その商品の明細を読む
    Svc->>Catalog: 商品が今買えるかを調べる処理を呼ぶ (listing)
    Catalog-->>Svc: 商品と買えない理由を返す
    break 4a 送る数量が受取店舗の在庫数を超える場合
        Svc--xErrs: 409 OUT_OF_STOCK の例外を投げる
        Note over Errs,Detail: 409「受取店舗の在庫が不足しています。」を返し、カートに追加しない。
    end
    Svc->>ItemRepo: 明細を保存する<br/>カートになければ作り、あれば数量を書き換える
    Svc->>Svc: カートの全明細を読み直し、revision を 1 増やして金額と合計を計算する<br/>流れは EC-B08 の図と同じ
    Svc-->>Ctrl: カートの内容を返す
    Ctrl-->>Http: カートの内容を返す
    Http-->>Shop: カートの内容を返す
    Shop->>Shop: カートを置き換え、「カートを更新しました。」を保持する
    alt ダイアログから追加した
        Shop-->>Detail: 成功の文を返す
        Detail-->>User: ダイアログに 23 で保持した「カートを更新しました。」を表示
    else 1a 商品一覧から追加した
        Shop-->>App: 成功の文を返す
        App-->>User: トーストに 23 で保持した「カートを更新しました。」と「カートを見る」を表示
    end
```

![EC-B07 シーケンス図](<images/EC-B07_商品をカートに追加する-1.png>)
