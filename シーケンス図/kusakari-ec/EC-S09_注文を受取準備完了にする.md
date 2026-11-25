# EC-S09 注文を受取準備完了にする

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as 店舗受け取り画面<br/>(PickupOrders.jsx)
        participant Card as 注文のカードと確認ダイアログ<br/>(PickupOrders.jsx、ConfirmDialog.jsx)
        participant Hook as 一覧の取得と変更<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文の処理API<br/>(OrderWorkflowController.java)
        participant Svc as 注文の処理<br/>(OrderWorkflowService.java)
        participant OrderRepo as 注文の読み書き<br/>(OrderRepository.java)
        participant Ntf as 通知の保存<br/>(NotificationService.java)
        participant Mapper as 注文の応答の組み立て<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、3、12、一覧の取り直しの 22 に適用<br/>*a 通信に失敗した場合: 3、12、一覧の取り直しの 22 に適用

    User->>Work: 出店者メニューの「店舗受け取り」をクリック
    Work->>Page: 選択中の店舗の店舗受け取り画面を表示
    Hook->>Ctrl: 選択中の店舗の注文の一覧を取得する<br/>GET /api/seller/orders?storeId={店舗ID}
    Ctrl-->>Hook: 注文のリストを返す
    Page->>Card: 注文を並べ、注文ごとにカードを表示
    Card-->>User: キャンセル申請のない注文受付の注文に、「商品を揃えたら、<br/>受取準備完了にして購入者へ通知します。」と「受取準備完了にする」を表示
    User->>Card: 対象の注文の「受取準備完了にする」をクリック
    Card-->>User: 「受取準備完了の確認」のダイアログに、注文番号、受取人、<br/>「受取準備完了を確定」、「取消」を表示
    User->>Card: 「受取準備完了を確定」をクリック
    Card->>Hook: 注文状態を受取準備完了に変える処理を呼ぶ (run)
    Hook->>Http: 今の状態「注文受付」と、変更後の状態「受取準備完了」を送る
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/seller/orders/{id}/status
    Ctrl->>Svc: 注文状態を変えるトランザクションを開始 (changeStatus)
    Svc->>OrderRepo: 注文の行をロックして読み、ログイン中の人が<br/>この店舗の担当者かを確かめる (lockOrder)
    break 6a 注文状態が「注文受付」でなくなっているか、キャンセル申請中になっている場合
        Svc--xCtrl: 409 ORDER_CHANGED の例外を投げる
        Note over Ctrl,Card: 409 を返し、何も変えない。画面は一覧を取り直し、<br/>「注文状態が変わりました。最新の状態を確認してください。」を出す。
    end
    Svc->>Svc: 注文状態を受取準備完了にし、<br/>準備完了の日時を記録する (markReady)
    Svc->>Ntf: 購入者あての「受取準備が完了しました」の通知を保存する (send)
    Svc->>Mapper: 店舗向けの注文の形にする (toStoreView)<br/>流れは EC-S08 の図と同じ
    Svc->>Db: 書き換えた注文の行を保存する
    Ctrl-->>Http: 更新後の注文を返す
    Http-->>Hook: 更新後の注文
    Hook->>Ctrl: 一覧を取り直す<br/>流れは 3〜4 と同じ
    Ctrl-->>Hook: 最新の注文の一覧を返す
    Hook-->>Card: 成功を返す
    Card-->>User: ダイアログを閉じ、「受取準備完了にし、購入者に通知しました。」と、<br/>注文状態が「受取準備完了」になった最新の一覧を表示
```

![EC-S09 シーケンス図](<images/EC-S09_注文を受取準備完了にする-1.png>)
