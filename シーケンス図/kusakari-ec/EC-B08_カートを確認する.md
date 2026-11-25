# EC-B08 カートを確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>(KusakariHeader.jsx)
        participant App as EC の画面の切り替え<br/>(App.jsx)
        participant Page as ショッピングカート画面<br/>(CartPage.jsx)
        participant Cart as カートの表示<br/>(Cart.jsx)
        participant Shop as 商品とカートの状態<br/>(useShop.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as カートAPI<br/>(CartController.java)
        participant Resolver as カートの特定<br/>(CartSessionResolver.java)
        participant Auth as ログイン中の会員<br/>(AuthService.java)
        participant MemberCart as 会員のカート<br/>(MemberCartService.java)
        participant Svc as カートの処理<br/>(CartService.java)
        participant Catalog as 商品の販売状態<br/>(CatalogService.java)
        participant CartRepo as カートの読み書き<br/>(CartRepository.java)
        participant ItemRepo as 明細の読み書き<br/>(CartItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (ログイン状態の確認)、5、30 に適用<br/>*a 通信に失敗した場合: 2、5 に適用

    User->>App: EC の画面 (トップなど) を開く
    App->>App: ログイン状態を取得<br/>GET /api/auth/me
    App->>Shop: 商品とカートを読み込む処理を呼ぶ (useShop)
    Shop->>Http: カートを取得する処理を呼ぶ (api.cart)
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/cart
    Ctrl->>Resolver: 会員のカートを特定する処理を呼ぶ (resolve)
    Resolver->>Auth: ログイン中の人が購入できるアカウントかを確かめる (requireBuyer)
    Auth-->>Resolver: ログイン中の会員 (購入者か運営者) を返す
    Resolver->>MemberCart: 会員のカートを特定するトランザクションを開始 (resolve)<br/>会員の行をロックして読む
    MemberCart->>CartRepo: 会員のカートを探す
    CartRepo-->>MemberCart: カートを返す (なければなし)
    opt 会員のカートがまだない (記述なし)
        MemberCart->>CartRepo: 新しいカートを保存する
    end
    MemberCart-->>Resolver: カートの ID を返す
    Resolver-->>Ctrl: カートの ID を返す
    Ctrl->>Svc: カートを読むトランザクションを開始 (read)
    Svc->>CartRepo: カートの行をロックして読む
    CartRepo-->>Svc: カートを返す
    Svc->>ItemRepo: カートの明細を読む
    ItemRepo-->>Svc: 明細のリストを返す
    Svc->>Catalog: 明細の商品が今買えるかを調べる処理を呼ぶ (listingsByIds)
    Catalog-->>Svc: 商品ごとの販売状態と買えない理由を返す
    opt 2b 商品の削除や店舗の閉鎖・停止で買えなくなった明細がある
        Svc->>ItemRepo: 買えなくなった明細をカートから外す
        Note over Svc,ItemRepo: 外した明細を保持し、カートの revision を 1 増やす。
    end
    Svc->>Svc: 明細ごとの金額と買えるか、合計、点数、注文に進めるかを計算し、<br/>受取連絡先を付ける (view)
    Svc-->>Ctrl: カートの内容を返す
    Ctrl-->>Http: カートの内容 (明細、合計、点数、注文に進めるか、外した明細) を返す
    Http-->>Shop: カートの内容を返す
    Shop->>Shop: カートと外した明細を保持し、<br/>続けて商品・注文履歴・近くの店舗を取得する

    User->>Header: 共通ヘッダーの「カート」をクリック
    Header->>App: カートの画面へ移る (通信しない)
    App->>Page: ログイン中なので、ショッピングカート画面を表示
    Page->>Cart: 27 で保持したカートを表示
    Cart->>Cart: 明細ごとの注意書き (「現在は購入できません」か<br/>「在庫不足（現在 N 点）」) と、うち消費税を決める
    Cart-->>User: 「ショッピングカート (点数)」、明細ごとの商品・受取店舗・数量・金額と注意書き、<br/>「ご請求内容」(商品小計、うち消費税、合計)、「注文内容を確認する」を表示<br/>外した明細があれば「(商品名)は購入できなくなったためカートから外しました。」と「閉じる」
    opt 2b 外した明細がある
        User->>Cart: お知らせの「閉じる」をクリック
        Note over User,Cart: 通信せず、お知らせを消す。
    end
```

![EC-B08 シーケンス図](<images/EC-B08_カートを確認する-1.png>)
