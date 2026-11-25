# EC-B04 商品詳細を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Card as 商品カード<br/>(ProductCard.jsx)
        participant List as 商品カードとページ<br/>(CatalogProducts.jsx)
        participant App as EC の画面の切り替え<br/>(App.jsx)
        participant Detail as 「植物について」の中身<br/>(ProductDetail.jsx)
        participant Dlg as ダイアログの枠<br/>(Dialog.jsx)
    end

    User->>Card: 商品一覧で、商品の画像か商品名をクリック
    Card->>List: 商品を開く処理を呼ぶ (onOpen)
    List->>App: 選んだ商品の ID を渡す (onDetail)
    App->>App: 前のお知らせとエラーを消し、選んだ商品の ID を保持する
    App->>App: 4 で保持した ID の商品を、取得済みの商品から探す<br/>サーバーには問い合わせない
    App->>Detail: 選んだ商品の「植物について」を表示
    Detail->>Detail: 画像の一覧と、購入数量の上限 (在庫数と 99 の小さい方) を決める
    Detail->>Dlg: 「植物について」のダイアログを開く
    Dlg->>Dlg: 後ろの画面のスクロールを止める
    alt 購入できるアカウントか、未ログイン
        Dlg-->>User: 商品名、画像、「出店者・生産者」、「販売店舗の紹介を見る」、学名・科名、<br/>高さ・鉢径、店頭在庫、説明、価格（税込）、「購入数量」、「カートに追加」、<br/>「Canvasでイメージする」を表示
    else 店舗側か出店申請用のアカウント
        Dlg-->>User: 同じ商品情報と、「カートに追加」の代わりに「店舗・出店申請用のアカウントでは<br/>購入できません。購入は購入者のアカウントでご利用ください。」を表示
    end

    User->>Dlg: 商品情報を確認する
    opt 画像が 2 枚以上ある (記述なし)
        User->>Detail: 「商品画像n」のボタンをクリック
        Note over User,Detail: 通信せず、選んだ画像を大きく表示する。
    end
```

![EC-B04 シーケンス図](<images/EC-B04_商品詳細を確認する-1.png>)
