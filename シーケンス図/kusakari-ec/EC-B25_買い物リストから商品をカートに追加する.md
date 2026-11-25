# EC-B25 買い物リストから商品をカートに追加する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Dlg as 庭に設置したものから追加<br/>(GardenItemsDialog.jsx)
        participant Shop as カートの状態<br/>(useShop.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 庭の買い物リストAPI<br/>(ShoppingController.java)
        participant Svc as 買い物リストの処理<br/>(ShoppingService.java)
        participant Client as Canvas との通信<br/>(CanvasShoppingClient.java)
        participant Saved as EC で追加した商品<br/>(SavedShoppingItems.java)
        participant Carts as カートの処理<br/>(CartService.java)
        participant Items as カートの明細の読み書き<br/>(CartItemRepository.java)
        participant Cat as 商品と在庫<br/>(CatalogService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 8 に適用<br/>*a 通信に失敗した場合: 8 に適用

    User->>Dlg: カートに追加したい商品にチェックを付ける
    Dlg->>Dlg: 選んだ行を保持し、必要数を合計する
    Dlg-->>User: 「(必要数の合計)点をカートに追加」を押せる状態で表示
    opt 「すべて選択」をクリックしたとき
        User->>Dlg: 「すべて選択」をクリック
        Note over User,Dlg: 選べる行だけにチェックを付ける。カートにある行と、選べない行は選ばない。
    end

    User->>Dlg: 「n点をカートに追加」をクリック
    Dlg->>Shop: 2 で保持した行の商品をカートに追加する処理を呼ぶ (transferShoppingList)<br/>数量は送らず、庭・買い物リスト・カートの版を付ける
    Shop->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>POST /api/cart/shopping-lists/{gardenId}/items
    Ctrl->>Ctrl: 入力を検査し、購入者かを確かめて会員のカートを決める
    Ctrl->>Svc: 選んだ商品をカートに移すトランザクションを開始 (transfer)
    Svc->>Client: Canvas から最新の配置の行を取得する (detail)<br/>GET /api/gardens/{id}/shopping-list、流れは EC-B24 の図と同じ
    Client-->>Svc: 配置の行と庭の版を返す
    Svc->>Saved: カートをロックし、EC で追加した商品を読む (lockAndRead)
    Svc->>Svc: 最新の行と候補の商品を作り、選んだ行と照らして<br/>同じ商品の必要数を合計し、追加する商品を決める
    Svc->>Carts: 必要数をカートに足す処理を呼ぶ (addShoppingItems)
    Carts->>Cat: カートの明細と、追加する商品の在庫と買えない理由を読む
    loop 追加する商品ごと
        alt 4a 追加できないとき
            Carts->>Carts: その商品を見送る<br/>(販売終了、上限 99 点、在庫不足、上限 50 種類の順に確かめる)
        else 追加できるとき
            Carts->>Items: カートの数量に必要数を足して保存する
        end
    end
    opt 1 つ以上追加したとき
        Carts->>Carts: カートの版を 1 上げる
    end
    Carts->>Db: 最新のカートを作るため、明細と商品を読み直す
    Carts-->>Svc: 最新のカート、追加した商品、見送った商品を返す
    Svc-->>Ctrl: 結果を返し、カートのロックを外す
    Ctrl-->>Http: 最新のカート、庭の名前、追加した商品、見送った商品を返す
    Http-->>Shop: 結果を返す
    Shop->>Shop: カートと結果を保持する
    Shop-->>Dlg: 成功を返す
    Dlg-->>User: ダイアログを閉じ、カートの上に 25 で保持した結果の「(庭の名前)からn種類を追加しました。」と、<br/>追加した商品のあるカートを表示
    opt 4a 見送った商品があるとき
        Dlg-->>User: 25 で保持した結果の「n種類は追加できませんでした。」と<br/>「(商品名)：(理由)」、「庭から選び直す」を表示
        Note over User,Dlg: 「庭から選び直す」を押すと、同じ庭を選んだダイアログを最新の在庫で開き直す。
    end
```

![EC-B25 シーケンス図](<images/EC-B25_買い物リストから商品をカートに追加する-1.png>)
