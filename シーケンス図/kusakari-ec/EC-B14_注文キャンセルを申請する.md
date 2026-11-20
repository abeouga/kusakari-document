# EC-B14 注文キャンセルを申請する

- ユースケース記述: [EC-B14_注文キャンセルを申請する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B14_注文キャンセルを申請する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 注文履歴画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 事前条件 画面を開いたときに GET /api/orders で注文を取得済み (EC-B13)
    Note over User,Db: 基本フロー 1〜2 申請欄を開く
    alt 1a 注文状態が「注文受付」以外、または申請中
        Page-->>User: 「注文のキャンセルを申請」を出さない<br/>受取準備完了などは「受取準備完了後はキャンセルを申請できません。…」<br/>申請中は「キャンセルを申請中です。…」
        Note right of User: 1a-2 ユースケースを終了する
    else 注文受付で、申請していない
        User->>Page: 「注文のキャンセルを申請」をクリック
        Page-->>User: 説明、「キャンセル理由」4 つ、「詳細（任意）」、<br/>チェックボックス、押せない「キャンセルを申請」
    end

    Note over User,Db: 基本フロー 3〜7 入力する (画面の中だけで、通信しない)
    User->>Page: 理由を選び、必要なら詳細を入力し、チェックを付ける
    Page-->>User: 理由とチェックがそろうと「キャンセルを申請」を押せる (6、6a)
    Note right of Page: 3a 申請欄を閉じても通信しない<br/>4a 「その他」なら「詳細（必須）」になる
    User->>Page: 「キャンセルを申請」をクリック
    alt 4a-2 「その他」で詳細が空
        Page-->>User: ブラウザーが入力を求める。送信しない
    else 送信できる
        Note over User,Db: 基本フロー 8〜10 申請を記録して出店者に知らせる
        Page->>Api: POST /api/orders/{id}/cancellation
        Note right of Api: 申請の処理全体が<br/>1 つのトランザクション
        Api->>Api: 入力と、購入者のアカウントかを検査
        Api->>Db: 注文の行をロックして読む
        Db-->>Api: 注文の行
        alt 8a 注文状態が変わっていた
            Api-->>Page: 409 ORDER_CHANGED
            Page->>Api: GET /api/orders
            Api-->>Page: 200 最新の注文
            Page-->>User: 「注文状態が変わりました。最新の状態を<br/>確認してください。」と最新の注文
        else 申請できる
            Api->>Db: キャンセル申請状態を申請中にする
            Api->>Db: 店舗のオーナーと担当者を探し、<br/>それぞれに出店者通知を保存する
            Api-->>Page: 200 注文
            Page->>Api: GET /api/orders
            Api-->>Page: 200 最新の注文
            Page-->>User: 「キャンセル申請を送信しました。」<br/>対象注文に「キャンセル申請中」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Orders as BuyerOrders.jsx
        participant Form as CancelOrderForm.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as OrderWorkflow<br/>Controller
        participant Errs as ApiErrors
        participant Svc as OrderWorkflow<br/>Service
        participant Auth as AuthService
        participant Repo as Order<br/>Repository
        participant Ntf as Notification<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: 事前条件 BuyerOrders の useResource('/orders') が GET /api/orders で注文を取得済み (EC-B13)
    Note over User,Db: 基本フロー 1〜2 申請欄を開く
    Orders->>Form: OrderBody が CancelOrderForm(order, resource) を表示
    alt 1a order.status が ACCEPTED 以外、または cancellationStatus が PENDING
        Form-->>User: CANCELLED・COMPLETED・DEMO_CONFIRMED は何も出さない<br/>ほかの ACCEPTED 以外は「受取準備完了後は…」<br/>PENDING は「キャンセルを申請中です。…」
    else ACCEPTED で、申請していない
        Form-->>User: details 要素の summary「注文のキャンセルを申請」
        User->>Form: 「注文のキャンセルを申請」をクリック
        Form-->>User: details が開き、理由の radio 4 つ、textarea、<br/>checkbox、disabled の「キャンセルを申請」
    end

    Note over User,Db: 基本フロー 3〜7 入力する (state を変えるだけで、通信しない)
    User->>Form: 「キャンセル理由」を選ぶ
    Form->>Form: setReason(item)
    Note right of Form: 4a reason が「その他」なら<br/>見出しを「詳細（必須）」にし<br/>textarea を required にする
    User->>Form: 必要なら「詳細」を入力する
    Form->>Form: setDetail(value)
    User->>Form: 「申請後は取り消せないことを確認しました」にチェック
    Form->>Form: setAgreed(true)
    Note right of Form: 6・6a ボタンは resource.busy、<br/>!reason、!agreed のどれかで disabled<br/>3a summary を押すと details が閉じるだけ
    User->>Form: 「キャンセルを申請」をクリック
    alt 4a-2 「その他」で詳細が空 (required 違反)
        Form-->>User: ブラウザーの検証が止める。onSubmit は呼ばれない
    else 送信できる
        Note over User,Db: 基本フロー 8〜10 申請を記録して出店者に知らせる
        Form->>Form: submit(event)<br/>message は「理由」か「理由：詳細」
        Form->>Hook: run(action, 'キャンセル申請を送信しました。')
        Hook->>Http: write('/orders/{id}/cancellation',<br/>'POST', { reason: message })
        Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
        Http->>Ctrl: POST /api/orders/{id}/cancellation
        Ctrl->>Ctrl: @Valid が CancellationRequest を検査<br/>(@NotBlank、@Size(max = 500))
        Ctrl->>Svc: requestCancellation(id, reason)
        Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
        Svc->>Auth: requireBuyer()
        Auth-->>Svc: AuthMember (USER か ADMIN)
        Svc->>Repo: lockOrder(id)
        Repo->>Db: SELECT ... FOR UPDATE (orders)
        Db-->>Repo: 行
        Repo-->>Svc: Optional の OrderEntity
        Svc->>Auth: requireBuyer(order) の中で<br/>auth.requireBuyer() をもう一度呼ぶ
        Auth-->>Svc: AuthMember
        Note right of Svc: 会員 ID が注文の購入者と違えば<br/>404 ORDER_NOT_FOUND (図では省略)
        Svc->>Svc: status と cancellationStatus を確かめる
        alt 8a status が ACCEPTED 以外、または cancellationStatus が PENDING
            Svc--xErrs: conflict() が throw<br/>ApiException(409, ORDER_CHANGED)
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので<br/>request('/orders') で取り直す
            Http-->>Hook: 最新の注文
            Hook-->>Form: run() が false を返す。resource.error
            Form-->>User: ResourceStatus が「注文状態が変わりました。<br/>最新の状態を確認してください。」、最新の注文
        else 申請できる
            Svc->>Svc: order.requestCancellation(reason)<br/>PENDING、理由、日時を入れる
            Svc->>Ntf: toStore(storeId, CANCEL_REQUEST,<br/>「キャンセル申請が届きました」, id)
            Ntf->>Db: SELECT stores、organizations、<br/>store_members、members
            Db-->>Ntf: 店舗のオーナーと、ロールのある担当者
            Ntf->>Db: 有効な会員ごとに INSERT notifications
            Ntf-->>Svc: 戻る (void)
            Note right of Svc: 応答用に OrderItemRepository の<br/>findAllForOrder() と OrderResponseMapper で<br/>OrderView を作る (図では省略)
            Svc->>Db: コミット時に UPDATE orders
            Svc-->>Ctrl: OrderView
            Ctrl-->>Http: 200 OrderView
            Http-->>Hook: data
            Hook->>Http: reload()<br/>request('/orders')
            Note over Http,Db: 取得は事前条件と同じ流れ (図では省略)
            Http-->>Hook: 最新の注文
            Hook-->>Form: run() が true を返す。data と notice を更新
            Form-->>User: 「キャンセル申請を送信しました。」<br/>カードの見出しに「キャンセル申請中」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## ユースケース記述との差

- 1a の文「受取準備完了後はキャンセルを申請できません。受取店舗へお問い合わせください。」は、`CancelOrderForm` で `ACCEPTED`・`CANCELLED`・`COMPLETED`・`DEMO_CONFIRMED` 以外のすべての状態に出ます。注文履歴の API（`OrderService.list()`）は支払い待ち（`PENDING_PAYMENT`）の注文も返すので、支払い待ちの注文にも「受取準備完了後は…」が出ます。記述は受取準備完了の場合だけを書いています。
- 基本フロー 10 のあと、対象注文のカードの見出しに「キャンセル申請中」が出るほか、申請欄のあった場所に「キャンセルを申請中です。店舗の回答は通知一覧でもお知らせします。」が出ます（`cancellationStatus` が `PENDING` になるため）。記述には後者がありません。
- 基本フロー 9 の出店者への通知は、申請の記録と同じトランザクションの中で保存します。宛先は、店舗の組織のオーナーと、その店舗でロールが割り振られた担当者のうち、利用中の会員です（`NotificationService.toStore()`）。
- サーバーは次の応答も返しますが、記述にはありません。画面の操作では起きにくいため、図では枝にしていません。
  - 400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」: 理由が空か 500 文字を超えるとき。画面は理由を選ばないとボタンを押せず、詳細の `maxLength` で合計を 500 文字以内にしています。
  - 403 `BUYER_REQUIRED`: 店舗側と出店申請用のアカウントのとき。画面はこれらのアカウントに注文履歴を出しません（`Workspace.jsx` の `isShopAccount()`）。
  - 404 `ORDER_NOT_FOUND`「注文が見つかりません。」: 注文がないか、ほかの購入者の注文のとき。

## 参照したコード

- [frontend/src/workspace/CancelOrderForm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/CancelOrderForm.jsx): `CancelOrderForm`、`submit()`、状態ごとの表示とボタンの `disabled`
- [frontend/src/workspace/BuyerOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/BuyerOrders.jsx): `BuyerOrders`、`OrderCard`、`OrderBody`、「キャンセル申請中」の表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`run()`、`reload()`、`write()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`（GET 以外の前に `/api/auth/csrf` を読む）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `request()`、`CancellationRequest`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `requestCancellation()`、`requireBuyer()`、`conflict()`、`missing()`、`view()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `lockOrder()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `requestCancellation()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `toStore()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java): `list()`（取り直しの GET /api/orders）
