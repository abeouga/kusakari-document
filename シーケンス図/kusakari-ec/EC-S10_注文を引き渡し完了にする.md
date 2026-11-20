# EC-S10 注文を引き渡し完了にする

- ユースケース記述: [EC-S10_注文を引き渡し完了にする](<../../アーカイブ/ユースケース/kusakari-ec/EC-S10_注文を引き渡し完了にする.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 店舗受け取り画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて注文一覧を表示する
    User->>Page: 出店者メニュー「店舗受け取り」を開く (EC-C03)
    Page->>Api: GET /api/seller/orders?storeId=…
    Api->>Api: 店舗で STAFF 以上のロールがあるかを検査
    Api->>Db: 選択中の店舗の注文を新しい順に検索<br/>明細、支払い・返金の状態も読む
    Db-->>Api: 行
    Api-->>Page: 200 注文の配列
    Page-->>User: 注文一覧。受け取り待ちの注文に「来店した購入者に<br/>注文番号と受取人名を確認して引き渡します。」<br/>と「引き渡し完了にする」

    Note over User,Db: 基本フロー 3〜5 確認ダイアログ (通信しない)
    User->>Page: 「引き渡し完了にする」をクリック
    Page-->>User: 「引き渡し完了の確認」ダイアログ<br/>(注文番号、受取人)
    alt 5a 「取消」をクリック
        User->>Page: 「取消」をクリック
        Page-->>User: ダイアログを閉じる。注文状態は変えない
    else 「引き渡し完了を確定」をクリック
        User->>Page: 「引き渡し完了を確定」をクリック
        Note over User,Db: 基本フロー 6〜7 状態を更新して購入者に知らせる
        Page->>Api: PUT /api/seller/orders/{id}/status<br/>(expectedStatus は READY、status は COMPLETED)
        Note right of Api: 更新と通知は<br/>1 つのトランザクション
        Api->>Api: 入力を検査
        Api->>Db: 注文の行をロックして読む
        Db-->>Api: 注文の行
        Api->>Api: 店舗の担当かを検査
        alt 6a 状態が「受取準備完了」でなくなっていた
            Api-->>Page: 409 ORDER_CHANGED
            Page->>Api: GET /api/seller/orders?storeId=…
            Api-->>Page: 200 最新の注文
            Page-->>User: ダイアログを閉じ、「注文状態が変わりました。<br/>最新の状態を確認してください。」と最新の一覧
        else 更新できる
            Api->>Db: 注文状態を COMPLETED にし、引き渡し完了の日時を保存
            Api->>Db: 購入者への通知「商品をお渡ししました」<br/>(注文番号 / 店舗名) を保存
            Note over Api,Db: ここでコミットする
            Api->>Api: コミットの後、別のトランザクションで<br/>閉鎖中の店舗・受付停止中の組織を確かめ、<br/>未完了の注文がなければ閉鎖済み・停止にする
            Api-->>Page: 200 更新後の注文
            Page->>Api: GET /api/seller/orders?storeId=…
            Api-->>Page: 200 最新の注文
            Page-->>User: ダイアログを閉じ、「引き渡し完了にしました。」<br/>注文状態は「引き渡し完了」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as PickupOrders.jsx<br/>OrderPage・PickupCard
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
        participant Close as Closure<br/>Settlement
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて注文一覧を表示する
    User->>Page: 出店者メニュー「店舗受け取り」をクリック (EC-C03)
    Note right of User: Workspace.jsx が /seller/orders で<br/>OrderPage(storeId) を表示する。storeId は<br/>useShop の選択中の店舗 (図では省略)
    Page->>Hook: useResource('/seller/orders?storeId=…')
    Note right of Hook: useEffect が reload()<br/>を自動で実行する
    Hook->>Http: request('/seller/orders?storeId=…')
    Http->>Ctrl: GET /api/seller/orders?storeId=…
    Note right of Ctrl: どの API でも、先に SessionValidityFilter が<br/>ログインを確かめる (図では省略)
    Ctrl->>Svc: sellerOrders(storeId)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireSeller(storeId)
    Auth-->>Svc: 戻る (オーナー、MANAGER、STAFF、運営)
    Svc->>Repo: findByStoreIdOrderByCreatedAtDesc(storeId)
    Repo->>Db: SELECT orders
    Db-->>Repo: 行
    Repo-->>Svc: OrderEntity のリスト
    Svc->>Svc: storeView(order) で OrderView にする
    Note right of Svc: 明細、商品画像、支払い・返金の状態、<br/>販売手数料を読む (図では省略)
    Svc-->>Ctrl: OrderView のリスト
    Ctrl-->>Http: 200 OrderView の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Page: filters と検索語で絞り、<br/>priority() で並べ替える
    Page-->>User: 注文ごとの PickupCard。READY の注文に<br/>actions.READY の hint と button

    Note over User,Db: 基本フロー 3〜5 確認ダイアログ (通信しない)
    User->>Page: 「引き渡し完了にする」をクリック
    Page->>Page: onClick で setConfirming('READY')
    Page-->>User: ConfirmDialog「引き渡し完了の確認」<br/>注文番号、受取人、説明文
    alt 5a 「取消」をクリック
        User->>Page: 「取消」をクリック (Esc、× も同じ)
        Page->>Page: onCancel で setConfirming('')
        Page-->>User: ダイアログを閉じる。通信しない
    else 「引き渡し完了を確定」をクリック
        User->>Page: 「引き渡し完了を確定」をクリック
        Note over User,Db: 基本フロー 6〜7 状態を更新して購入者に知らせる
        Page->>Hook: onConfirm で run(action, dialog.done)
        Hook->>Http: write('/seller/orders/{id}/status', 'PUT',<br/>{ expectedStatus: 'READY', status: 'COMPLETED' })
        Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
        Http->>Ctrl: PUT /api/seller/orders/{id}/status
        Ctrl->>Ctrl: @Valid が StatusRequest を検査<br/>(status は READY か COMPLETED)
        Ctrl->>Svc: changeStatus(id, 'READY', 'COMPLETED')
        Note over Svc,Db: クラスの @Transactional で、ここからメソッドの終わりまでが 1 つのトランザクション
        Svc->>Repo: lockOrder(id)
        Repo->>Db: SELECT ... FOR UPDATE (orders)
        Db-->>Repo: 行
        Repo-->>Svc: Optional の OrderEntity
        Svc->>Auth: requireStore(order) の中で<br/>requireSeller(storeId)
        Auth-->>Svc: 戻る
        Svc->>Svc: status が expectedStatus と同じか、<br/>READY から COMPLETED か、<br/>cancellationStatus が PENDING でないか
        alt 6a 状態が変わっていた
            Svc--xErrs: conflict() が throw<br/>ApiException(409, ORDER_CHANGED)
            Note over Svc,Db: 例外でロールバック。何も保存しない
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので<br/>一覧を取り直す
            Note over Http,Db: 取得は基本フロー 2 と同じ流れ (図では省略)
            Http-->>Hook: 最新の注文
            Hook-->>Page: run() が false を返す。<br/>resource.error と最新の data
            Page->>Page: setConfirming('') で<br/>ダイアログを閉じる
            Page-->>User: 「注文状態が変わりました。最新の状態を<br/>確認してください。」と最新の一覧
        else 更新できる
            Svc->>Svc: order.completePickup()<br/>status を COMPLETED、pickedUpAt を今の日時に
            Svc->>Close: afterOrderChanged(storeId)
            Close->>Close: AfterCommit.run() で<br/>コミットの後の settleStore(storeId) を登録
            Close-->>Svc: 戻る (void)
            Svc->>Ntf: send(buyerMemberId, ORDER,<br/>'商品をお渡ししました', 注文番号 / 店舗名)
            Ntf->>Ntf: NotificationRepository の<br/>save(new NotificationEntity(...))
            Ntf-->>Svc: 戻る (void)
            Svc->>Svc: storeView(order)
            Svc-->>Ctrl: OrderView
            Note over Svc,Db: メソッドの終わりでコミットする。completePickup() の変更 (UPDATE orders) と<br/>通知 (INSERT notifications) は、コミットまでに DB に書かれる
            Close->>Close: コミットの後 (応答を返す前) に<br/>settleStore(storeId)
            Note over Close,Db: 別のトランザクション (REQUIRES_NEW) で StoreClosureService.settle() と<br/>OrganizationSuspensionService.settle() を呼ぶ。閉鎖中の店舗・受付停止中の組織で<br/>未完了の注文がなければ、閉鎖済み・停止にして通知する。失敗はログに残すだけで応答は変えない (中は図では省略)
            Ctrl-->>Http: 200 OrderView
            Http-->>Hook: data
            Hook->>Http: reload() 一覧を取り直す
            Note over Http,Db: 取得は基本フロー 2 と同じ流れ (図では省略)
            Http-->>Hook: 最新の注文
            Hook-->>Page: run() が true を返す。<br/>data と notice を更新
            Page->>Page: setConfirming('') で<br/>ダイアログを閉じる
            Page-->>User: 「引き渡し完了にしました。」<br/>注文状態は「引き渡し完了」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## ユースケース記述との差

- 基本フロー 4 の確認ダイアログには、注文番号と受取人のほかに「購入者が商品を受け取ったことを確認しましたか。注文状態を「引き渡し完了」に更新します。」も出ます。
- 基本フロー 7 のあと、引き渡し完了の注文のカードは閉じた形になり、注文明細と受取連絡先は「詳細」を開くと見えます（`PickupCard` の `closed`）。進み具合の欄に引き渡し完了の日時が出ます。
- 5a の「取消」のほか、Esc キー、ダイアログの「×」、ダイアログの外のクリックでも、通信せずにダイアログを閉じます。
- 6a のあと、ダイアログは成功のときと同じく閉じます（`onConfirm` が `run()` の結果によらず `setConfirming('')` を呼ぶ）。
- 関連情報の「閉鎖中の店舗・受付停止中の組織は、未完了の注文がなくなると閉鎖済み・停止になる」は、注文のトランザクションのコミットの後に、別のトランザクションで行います（`ClosureSettlement.afterOrderChanged()`）。このとき、記述にない次のことも行います。ここで失敗しても応答は 200 のままで、定期処理（`settleAll()`、既定は 1 分ごと）がもう一度確かめます。
  - 店舗を閉鎖済みにしたら、店舗あてに「店舗の閉鎖が完了しました」を通知し、店舗の担当の割り当てを外します（`StoreClosureService.settle()`）。
  - 組織を停止にしたら、オーナーに「組織が停止されました」を通知し、履歴を残します（`OrganizationSuspensionService.settle()`）。
- サーバーは次の応答も返しますが、記述にはありません。画面の操作ではふつう起きないため、図では枝にしていません。
  - 404 `ORDER_NOT_FOUND`「注文が見つかりません。」: 注文がないとき。ほかの店舗の注文や、運営が停止した店舗の注文も 404 になります。画面は 404 のときも一覧を取り直します。
  - 400 `INVALID_INPUT`: `status` が `READY`・`COMPLETED` 以外のとき。
- 権限の検査（`requireSeller()`）は、記述のアクター（オーナー、MANAGER、STAFF）のほかに運営のアカウントも通します。運営の「全注文管理」の画面はボタンを出しません。

## 参照したコード

- [frontend/src/workspace/PickupOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/PickupOrders.jsx): `OrderPage`、`PickupCard`、`actions.READY`、`Progress`、`setConfirming()`、`onConfirm`
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ConfirmDialog.jsx): 「取消」と確定のボタン
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): Esc、×、外のクリックで `onClose`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `/seller/orders` で `OrderPage` を表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`、`run()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `seller()`、`status()`、`StatusRequest`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `sellerOrders()`、`changeStatus()`、`requireStore()`、`conflict()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc()`、`lockOrder()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `completePickup()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send()`
- [backend/src/main/java/jp/kusakari/ec/store/service/ClosureSettlement.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/ClosureSettlement.java): `afterOrderChanged()`、`settleStore()`、`settleAll()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java): `run()`（コミットの後に動かす）
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreClosureService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreClosureService.java): `settle()`
- [backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java): `settle()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
