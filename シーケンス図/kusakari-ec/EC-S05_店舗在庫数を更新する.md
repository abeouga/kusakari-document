# EC-S05 店舗在庫数を更新する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Mgr as 商品管理画面<br/>(ProductManager.jsx)
        participant List as 商品の一覧<br/>(SellerProductList.jsx)
        participant Editor as 在庫数の入力欄<br/>(StockEditor.jsx)
        participant Cat as 商品の取得と変更<br/>(useSellerCatalog.js)
        participant Hook as 警告・停止の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 出店者の商品API<br/>(SellerProductController.java)
        participant Svc as 出店者の商品の処理<br/>(SellerProductService.java)
        participant Auth as ログイン中の会員<br/>(AuthService.java)
        participant CatSvc as 商品の読み込み<br/>(CatalogService.java)
        participant Inv as 在庫の読み書き<br/>(InventoryRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、3、5、17、一覧の取り直しの 27 に適用<br/>*a 通信に失敗した場合: 3、5、17、一覧の取り直しの 27、購入者向けの商品の 29 に適用

    User->>Work: 出店者メニューの「商品管理」をクリック
    Work->>Mgr: 商品管理画面を表示
    par 商品の一覧
        Cat->>Ctrl: 選択中の店舗の商品の一覧を取得する<br/>GET /api/seller/products?storeId={店舗ID}
        Ctrl-->>Cat: 在庫数と公開状態を含む商品のリストを返す
    and 運営からの警告・停止
        Hook->>Ctrl: 運営からの警告・停止を取得する<br/>GET /api/seller/products/moderation?storeId={店舗ID}
        Ctrl-->>Hook: 警告・停止のリストを返す
    end
    Mgr->>List: 商品の一覧と警告・停止を渡して表示
    List-->>User: 商品ごとの在庫数、0 なら「在庫切れ」、<br/>行ごとの「在庫を編集」を表示

    User->>List: 対象商品の行の「在庫を編集」をクリック
    List->>Mgr: 在庫を変える商品を渡す (onStock)
    Mgr->>Editor: 今の在庫数を変更前の在庫数として保持し、在庫数の入力欄を表示
    Editor-->>User: 11 で保持した変更前の在庫数 (「(商品名)：変更前の在庫数 N」)、「在庫数」の入力欄、<br/>「在庫を保存」、「取消」を表示
    User->>Editor: 「在庫数」に新しい在庫数を入力し、<br/>「在庫を保存」をクリック
    Editor->>Editor: 入力値が 0〜10000 の整数かを確かめる
    Editor->>Cat: 店舗 ID、11 で保持した変更前の在庫数、新しい在庫数を渡して<br/>在庫数を保存する処理を呼ぶ (saveStock)
    Cat->>Http: 在庫数を書き換える処理を呼ぶ
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/seller/products/{id}/stock
    Ctrl->>Svc: 在庫数を書き換えるトランザクションを開始 (updateStock)
    Svc->>Auth: ログイン中の人がこの店舗の担当者で、<br/>商品がこの店舗のものかを確かめる
    Svc->>Inv: 在庫の行をロックして読む (lock)
    break 8a 今の在庫数が変更前の在庫数と違う場合 (注文の引き当て、キャンセルの戻しなど)
        Svc--xCtrl: 409 STOCK_CHANGED の例外を投げる
        Note over Ctrl,Mgr: 409 を返し、在庫数は変えない。画面には今の在庫数を出す。
    end
    Svc->>Svc: 在庫の数量を新しい在庫数に書き換える (setQuantity)
    Svc->>CatSvc: 書き換えた後の商品と、商品を追加した人の名前を読む
    Svc->>Db: 書き換えた在庫の行を保存する
    Ctrl-->>Http: 更新後の商品を返す
    Http-->>Cat: 更新後の商品
    par 出店者の一覧
        Cat->>Ctrl: 一覧を取り直す<br/>流れは 3〜4 と同じ
        Ctrl-->>Cat: 最新の商品のリストを返す
    and 購入者向けの商品
        Cat->>Http: カートと購入者向けの商品を取り直す (refreshProducts)<br/>GET /api/cart、GET /api/products
        Http-->>Cat: 購入者向けの商品
    end
    Cat-->>Editor: 保存の成功を返す
    Editor->>Mgr: 在庫数の入力欄を閉じる
    Mgr-->>User: 「在庫数を保存しました。」と<br/>更新後の在庫数の一覧を表示
```

![EC-S05 シーケンス図](<images/EC-S05_店舗在庫数を更新する-1.png>)
