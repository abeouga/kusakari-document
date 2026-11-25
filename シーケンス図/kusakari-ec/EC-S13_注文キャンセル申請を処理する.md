# EC-S13 注文キャンセル申請を処理する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as 店舗受け取り画面<br/>(PickupOrders.jsx)
        participant Card as 注文のカードと回答欄<br/>(PickupOrders.jsx)
        participant Hook as 一覧の取得と変更<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文の処理API<br/>(OrderWorkflowController.java)
        participant Svc as 注文の処理<br/>(OrderWorkflowService.java)
        participant OrderRepo as 注文の読み書き<br/>(OrderRepository.java)
        participant Stock as 在庫の戻し<br/>(StockReturn.java)
        participant Refund as 返金の依頼<br/>(RefundService.java)
        participant Close as 閉鎖・停止の確認<br/>(ClosureSettlement.java)
        participant Ntf as 通知の保存<br/>(NotificationService.java)
        participant Mapper as 注文の応答の組み立て<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe<br/>外部の決済サービス
    end

    Note over User,Stripe: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、3、10、一覧の取り直しの 26 に適用<br/>*a 通信に失敗した場合: 3、10、一覧の取り直しの 26 に適用

    User->>Work: 出店者メニューの「店舗受け取り」をクリック
    Work->>Page: 選択中の店舗の店舗受け取り画面を表示
    Hook->>Ctrl: 選択中の店舗の注文の一覧を取得する<br/>GET /api/seller/orders?storeId={店舗ID}
    Ctrl-->>Hook: 注文のリストを返す
    Page->>Card: キャンセル申請中の注文を先にして並べ、<br/>注文ごとにカードを表示
    Card-->>User: 「キャンセル申請中」、明細と合計、「キャンセル申請があります：(キャンセル理由)」、<br/>「キャンセル回答」の入力欄、「キャンセルを承認」「キャンセルを却下」を表示
    User->>Card: 必要なら「キャンセル回答」に回答を入力し、<br/>「キャンセルを承認」か「キャンセルを却下」をクリック
    Card->>Hook: 承認か却下と回答を渡して、申請に回答する処理を呼ぶ (decide)
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/seller/orders/{id}/cancellation
    Ctrl->>Svc: キャンセル申請に回答するトランザクションを開始 (decideCancellation)
    Svc->>OrderRepo: 注文の行をロックして読み、ログイン中の人が<br/>この店舗のオーナーか店長かを確かめる (lockOrder)
    break 6b 申請がすでに処理されている場合
        Svc--xCtrl: 409 ORDER_CHANGED の例外を投げる
        Note over Ctrl,Card: 409 を返し、何も変えない。画面は一覧を取り直し、<br/>「注文状態が変わりました。最新の状態を確認してください。」を出す。
    end
    alt 承認
        Svc->>Stock: 引き当てた在庫を戻す処理を呼ぶ (restock)<br/>在庫の行をロックし、在庫の数量に注文の数量を足す
        Svc->>Svc: 申請を承認にし、注文状態をキャンセルにして、<br/>回答した人と回答を記録する
        opt カードで支払い済みのとき
            Svc->>Refund: 返金を依頼する処理を呼ぶ (refundCancelledOrder)
            Note over Svc,Refund: 返金の行を保存し、保存の後に Stripe を呼ぶ処理を登録する。
        end
        Svc->>Close: 保存の後に、閉鎖中の店舗と<br/>受付停止中の組織を確かめる処理を登録する (afterOrderChanged)
    else 却下
        Svc->>Svc: 申請を却下にし、回答した人と回答を記録する<br/>注文状態は変えない
    end
    Svc->>Ntf: 購入者あての通知を保存する (send)<br/>承認は「注文をキャンセルしました」、却下は「キャンセル申請の結果」
    Svc->>Mapper: 店舗向けの注文の形にする (toStoreView)<br/>流れは EC-S08 の図と同じ
    Svc->>Db: 注文、在庫、返金の行を保存する
    opt 承認で、返金の行を保存したとき
        Refund->>Stripe: 注文の金額の返金を作る (createRefund)
        Note over Refund,Stripe: 届けば Stripe の返金の ID を記録し、<br/>届かなければ返金の行を「返金の失敗」にする。
    end
    opt 承認で、閉鎖中の店舗か受付停止中の組織に未完了の注文が残っていないとき (関連情報)
        Close->>Db: 店舗を閉鎖済みに、組織を停止にする (settleStore)
        Note over Close,Db: 失敗してもログに残すだけで、出店者への応答は変えない。
    end
    Ctrl-->>Http: 更新後の注文を返す
    Http-->>Hook: 更新後の注文
    Hook->>Ctrl: 一覧を取り直す<br/>流れは 3〜4 と同じ
    Ctrl-->>Hook: 最新の注文の一覧を返す
    Hook-->>Card: 成功を返す
    Card-->>User: 「保存しました。」と処理結果の一覧を表示<br/>承認なら注文状態が「キャンセル」と返金の状態、却下なら注文状態はそのまま
```

![EC-S13 シーケンス図](<images/EC-S13_注文キャンセル申請を処理する-1.png>)
