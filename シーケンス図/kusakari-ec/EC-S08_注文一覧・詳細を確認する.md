# EC-S08 注文一覧・詳細を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as 店舗受け取り画面<br/>(PickupOrders.jsx)
        participant Card as 注文のカード<br/>(PickupOrders.jsx)
        participant Hook as 一覧の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文の処理API<br/>(OrderWorkflowController.java)
        participant Svc as 注文の処理<br/>(OrderWorkflowService.java)
        participant Auth as ログイン中の会員<br/>(AuthService.java)
        participant OrderRepo as 注文の読み書き<br/>(OrderRepository.java)
        participant ItemRepo as 注文明細の読み込み<br/>(OrderItemRepository.java)
        participant Mapper as 注文の応答の組み立て<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、6 に適用<br/>*a 通信に失敗した場合: 6 に適用

    User->>Work: 出店者メニューの「店舗受け取り」をクリック
    Work->>Page: 選択中の店舗の店舗受け取り画面を表示
    opt 1a 複数の店舗を扱う場合
        User->>Work: 画面上部の「管理する店舗」で、確認する店舗を選ぶ
        Note over User,Page: 選んだ店舗の注文を取り直して表示する。絞り込みと検索欄はそのまま。
    end
    Page->>Hook: 店舗の注文の一覧を取得する処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/seller/orders?storeId={店舗ID}
    Ctrl->>Svc: 店舗の注文の一覧を取得するトランザクションを開始 (sellerOrders)
    Svc->>Auth: ログイン中の人がこの店舗の担当者かを確かめる
    Svc->>OrderRepo: 店舗の注文を新しい順に読む
    loop 注文ごと
        Svc->>ItemRepo: 注文の明細を読む
        Svc->>Mapper: 店舗向けの注文の形にする (toStoreView)<br/>商品の画像、支払い、返金、キャンセルした人を読む
        Mapper-->>Svc: 明細、受取連絡先、お支払い方法、支払いと返金の状態、<br/>販売手数料を含む注文を返す
    end
    Ctrl-->>Hook: 注文のリストを返す
    Hook-->>Page: 注文の一覧
    Page->>Page: キャンセル申請中、準備待ち、受け取り待ち、<br/>そのほかの順に並べる
    Page-->>User: 「準備待ち」「受け取り待ち」「キャンセル申請」「引き渡し完了」「キャンセル」「すべて」<br/>の絞り込みのボタンと件数、「注文番号・受取人で検索」欄を表示
    loop 表示する注文ごと
        Page->>Card: 注文のカードを表示
        Card-->>User: 注文番号、注文日時、注文状態、合計、お支払い方法と支払い・返金の状態を表示<br/>引き渡し完了とキャンセルの明細と受取連絡先は「詳細」にたたむ
        opt 6a 運営がキャンセルした注文の場合
            Card-->>User: 「運営がキャンセルしました：(理由)」を表示
        end
        opt 6b 返金に失敗した注文の場合
            Card-->>User: 「返金に失敗しました。Stripe の管理画面で<br/>返金の状態を確認し、購入者に連絡してください。」を表示
        end
    end

    User->>Page: 絞り込みのボタンをクリックするか、<br/>「注文番号・受取人で検索」欄に注文番号か受取人名を入力
    Page->>Page: 選んだ状態で、注文番号か受取人名に<br/>入力を含む注文だけを残して並べる
    Page-->>User: 条件に合う注文のカードを表示<br/>流れは 17〜20 と同じ
    User->>Card: 引き渡し完了かキャンセルの注文の「詳細」をクリック
    Card-->>User: 明細 (商品名、SKU、数量、金額)、受取人、電話番号、<br/>連絡先メール、受け取りの進み具合を表示 (通信はしない)
```

![EC-S08 シーケンス図](<images/EC-S08_注文一覧・詳細を確認する-1.png>)
