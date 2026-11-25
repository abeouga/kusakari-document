# EC-B13 注文履歴を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>(App.jsx)
        participant Work as マイページのサイドバー<br/>(Workspace.jsx)
        participant Orders as 注文履歴画面<br/>(BuyerOrders.jsx)
        participant Hook as 一覧の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>(AuthController.java)
        participant Ctrl as 注文API<br/>(OrderController.java)
        participant Session as 購入者のカート<br/>(CartSessionResolver.java)
        participant Svc as 注文の処理<br/>(OrderService.java)
        participant Mapper as 注文の応答の組み立て<br/>(OrderResponseMapper.java)
        participant Repo as 注文の読み書き<br/>(OrderRepository.java)
        participant Items as 注文の明細の読み書き<br/>(OrderItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 4 (マイページを新しく表示したときのログインの確認) と 8 に適用<br/>*a 通信に失敗した場合: 4 と 8 に適用

    User->>Header: 共通ヘッダーの「注文履歴」をクリック
    Header->>App: 移る先の URL を渡す (navigateFromHeader)
    App->>Work: マイページを表示
    opt トップなどマイページの外の画面から開いたとき
        Work->>AuthCtrl: ログイン状態を読む処理を呼ぶ (readSession)<br/>GET /api/auth/me
        Note over Work,AuthCtrl: ログイン中なら続ける。マイページの中から開いたときは読み直さない。
    end
    Work->>Orders: 注文履歴画面を表示
    Orders->>Hook: 注文の一覧を取得する処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/orders
    Ctrl->>Session: 購入者かを確かめ、カートを用意する処理を呼ぶ (resolve)
    Session-->>Ctrl: カートの ID を返す (一覧では使わない)
    Ctrl->>Svc: 注文の一覧を取得するトランザクションを開始 (list)
    Svc->>Repo: 自分の注文のうち、非表示にしていないものを新しい順に取得
    Repo-->>Svc: 注文のリストを返す
    loop 注文ごとに繰り返す
        Svc->>Items: 注文の明細を取得 (findAllForOrder)
        Items-->>Svc: 明細のリストを返す
        Svc->>Mapper: 購入者向けの注文の情報をまとめる処理を呼ぶ (toView)
        Mapper->>Db: 商品画像、決済と返金の状態、店舗、キャンセルした人を取得
        Db-->>Mapper: 商品画像、決済と返金の状態、店舗を返す
        Mapper-->>Svc: 注文の情報を返す
    end
    Svc-->>Ctrl: 注文の一覧を返す
    Ctrl-->>Http: 注文の一覧を返す
    Http-->>Hook: 注文の一覧を返す
    Hook-->>Orders: 注文の一覧を返す
    Orders->>Orders: 選んだ注文状態で絞り込む<br/>初めは「すべて」なので全件
    Orders-->>User: 注文日時、注文状態、商品画像、商品名、受取店舗、個数、注文番号、合計金額、<br/>申請中なら「キャンセル申請中」、返金が済んだら「返金済み」を表示
    opt 注文状態で絞り込むとき
        User->>Orders: 「すべて」「注文受付」「受取準備完了」「引き渡し完了」「キャンセル」のどれかをクリック
        Note over User,Orders: 通信せず、選んだ注文状態の注文だけを表示する。
    end
    User->>Orders: 一覧から注文をクリック
    Orders-->>User: 一覧で受け取ったデータで、商品名、単価 × 個数、合計、支払いと返金の状態、<br/>「受け取り」欄、キャンセル申請の結果を表示
    opt 7a 受取店舗が閉鎖予定で、まだ受け取っていない注文のとき
        Orders-->>User: 「受け取り」欄に「この店舗は閉鎖予定です。<br/>お早めにお受け取りください。」を表示
    end
    opt 7b 運営がキャンセルした注文のとき
        Orders-->>User: 「この注文は出店者からキャンセルされました<br/>（運営から：(理由)）」を表示
    end
```

![EC-B13 シーケンス図](<images/EC-B13_注文履歴を確認する-1.png>)
