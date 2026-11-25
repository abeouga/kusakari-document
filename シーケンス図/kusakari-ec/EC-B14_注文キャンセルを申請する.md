# EC-B14 注文キャンセルを申請する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Orders as 注文履歴画面<br/>BuyerOrders<br/>(BuyerOrders.jsx)
        participant Form as キャンセル申請欄<br/>CancelOrderForm<br/>(CancelOrderForm.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 注文の手続きAPI<br/>OrderWorkflowController<br/>(OrderWorkflowController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 注文の手続きの処理<br/>OrderWorkflowService<br/>(OrderWorkflowService.java)
        participant Repo as 注文の読み書き<br/>OrderRepository<br/>(OrderRepository.java)
        participant Ntf as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 17、一覧の取り直しの 31 (8a の取り直しも同じ) に適用<br/>*a 通信に失敗した場合: 15、17、一覧の取り直しの 31 (8a の取り直しも同じ) に適用

    User->>Orders: 注文履歴の一覧から対象の注文をクリックし、<br/>詳細を開く (事前条件。EC-B13 の基本フロー 6)
    Orders->>Form: 注文の詳細の中に、キャンセル申請欄を表示<br/>(OrderBody → CancelOrderForm)
    Form-->>User: 閉じた「注文のキャンセルを申請」
    User->>Form: 「注文のキャンセルを申請」をクリック
    Form-->>User: 申請欄を開く (details)。「店舗が申請を確認し、承認されるとキャンセルが<br/>確定して在庫が戻ります。却下される場合もあります。」、「キャンセル理由」の 4 つ、<br/>「詳細（任意）」、「申請後は取り消せないことを確認しました」、押せない「キャンセルを申請」
    User->>Form: 「キャンセル理由」からいずれかを選ぶ
    Form->>Form: 選んだ理由を覚える (setReason)<br/>4a-1「その他」なら見出しを「詳細（必須）」にし、入力を必須にする
    User->>Form: 必要なら「詳細」を入力する (setDetail。4a-2「その他」なら必須)
    User->>Form: 「申請後は取り消せないことを確認しました」にチェック
    Form->>Form: チェックを覚える (setAgreed)。理由とチェックがそろうと<br/>「キャンセルを申請」を押せる (6a 欠けていれば押せないまま)
    User->>Form: 「キャンセルを申請」をクリック
    Form->>Hook: 申請の通信を実行し、成功の文を渡す (submit → run)<br/>「キャンセル申請を送信しました。」
    Hook->>Http: 申請の通信を送る (write → request、<br/>本文は { reason: 「理由」か「理由：詳細」 })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: POST /api/orders/{id}/cancellation<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 入力を検査し (@Valid CancellationRequest、空でなく 500 文字まで)、<br/>キャンセルを申請するよう頼む (requestCancellation)。全体が 1 つのトランザクション<br/>購入者か運営かを確かめる (AuthService の requireBuyer)
    Svc->>Repo: 注文をロックして読む (lockOrder、SELECT ... FOR UPDATE orders)
    Repo-->>Svc: 注文
    Svc->>Svc: 注文の購入者が自分かを確かめ (requireBuyer(order))、<br/>注文状態と申請の状態を確かめる<br/>(status が ACCEPTED で、cancellationStatus が PENDING でない)
    break 8a 注文状態が変わっていた (受取準備完了になった、ほかの画面で申請したなど)
        Svc--xErrs: 409 ORDER_CHANGED の例外を投げる (conflict)
        Note over Errs,Orders: 結果: 409 を返し、申請しない。<br/>画面: 8a-1 一覧を取り直して「注文状態が変わりました。最新の状態を確認してください。」と「再取得」(8a-2 終了)。
    end
    Svc->>Svc: 申請を記録する (order.requestCancellation)<br/>申請中 (PENDING)、前後の空白を除いた理由、申請の日時、回答は空
    Svc->>Ntf: 出店者に申請を知らせるよう頼む (toStore)<br/>種類 CANCEL_REQUEST、「キャンセル申請が届きました」、本文は注文番号
    Ntf->>Db: 店舗、組織のオーナー、その店舗にロールのある担当者を読み、<br/>利用中の会員ごとに出店者通知を保存する (findById、findAssignedAtStore、<br/>findAllById、isEnabled で絞り、forStore → save、notifications)
    Svc->>Db: 応答用に明細、商品画像、決済、返金、店舗を読み<br/>(view → findAllForOrder、OrderResponseMapper の toView)、<br/>書き換えた行を保存してコミットする (UPDATE orders、INSERT notifications)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 申請した注文
    Ctrl-->>Http: 200 注文 (cancellationStatus は PENDING)
    Http-->>Hook: 申請した注文
    Hook->>Http: 注文の一覧を取り直す (reload)<br/>GET /api/orders。流れは EC-B13 の図と同じ
    Http-->>Hook: 最新の注文の一覧
    Hook-->>Form: 成功を返す (run が true、「キャンセル申請を送信しました。」を設定)
    Form-->>User: 「キャンセル申請を送信しました。」、注文の見出しに「キャンセル申請中」、<br/>申請欄の代わりに「キャンセルを申請中です。店舗の回答は通知一覧でもお知らせします。」
```

![EC-B14 シーケンス図](<images/EC-B14_注文キャンセルを申請する-1.png>)
