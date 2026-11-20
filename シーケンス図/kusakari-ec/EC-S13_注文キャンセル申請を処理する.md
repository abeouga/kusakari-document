# EC-S13 注文キャンセル申請を処理する

- ユースケース記述: [EC-S13_注文キャンセル申請を処理する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S13_注文キャンセル申請を処理する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 店舗受け取り画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe
    end

    Note over User,Stripe: 基本フロー 1〜2 画面を開いて注文一覧を表示する
    User->>Page: 出店者メニュー「店舗受け取り」を開く (EC-C03)
    Page->>Api: GET /api/seller/orders?storeId=…
    Api->>Api: 店舗で STAFF 以上のロールがあるかを検査
    Api->>Db: 選択中の店舗の注文を新しい順に検索<br/>明細、支払い・返金の状態も読む
    Db-->>Api: 行
    Api-->>Page: 200 注文の配列
    alt 2a キャンセル申請中の注文がない
        Page-->>User: キャンセル申請の表示と回答欄を出さない
        Note right of User: 2a-2 ユースケースを終了する
    else キャンセル申請中の注文がある
        Page-->>User: 一覧の先頭に「キャンセル申請中」、「キャンセル申請があります：(理由)」、<br/>「キャンセル回答」欄、「キャンセルを承認」「キャンセルを却下」
        Note over User,Stripe: 基本フロー 3〜5 内容を確かめて回答する (通信しない)
        User->>Page: 注文内容、合計、キャンセル理由を確かめる
        User->>Page: 却下するなら「キャンセル回答」に理由を入力
        User->>Page: 「キャンセルを承認」または「キャンセルを却下」をクリック
        Note over User,Stripe: 基本フロー 6〜8 結果を保存して購入者に知らせる
        Page->>Api: PUT /api/seller/orders/{id}/cancellation<br/>(approved、reason)
        Note right of Api: 検査から通知の保存までが<br/>1 つのトランザクション
        Api->>Db: 注文の行をロックして読む
        Db-->>Api: 注文の行
        Api->>Api: 店舗の担当か、オーナーか MANAGER かを検査
        alt 6d オーナーでも MANAGER でもない (STAFF)
            Api-->>Page: 403 FORBIDDEN
            Page-->>User: 「この操作の権限がありません。」
        else オーナーか MANAGER
            alt 6b 申請がすでに処理されている
                Api-->>Page: 409 ORDER_CHANGED
                Page->>Api: GET /api/seller/orders?storeId=…
                Api-->>Page: 200 最新の注文
                Page-->>User: 「注文状態が変わりました。最新の状態を<br/>確認してください。」と最新の一覧
            else 6a 却下で「キャンセル回答」が空
                Api-->>Page: 400 REASON_REQUIRED
                Page-->>User: 「却下理由を入力してください。」<br/>入力はそのまま (基本フロー 4 へ)
            else 検査を通る
                opt 承認
                    Api->>Db: 在庫の行をロックし、注文の数量を戻す
                    Db-->>Api: 在庫の行
                end
                Api->>Api: 申請状態を承認か却下にし、回答を記録する<br/>承認なら注文状態をキャンセルにする
                opt 承認
                    Api->>Db: カードで支払う注文なら、返金の行と決済の行を読む
                    Db-->>Api: 行
                    opt カードで支払い済みで、まだ返金していない
                        Api->>Db: 返金の行 (返金の処理中) を作る
                    end
                    Api->>Api: コミットの後に店舗・組織を確かめるよう登録
                end
                Api->>Db: 購入者への通知を保存<br/>(承認は「注文をキャンセルしました」、却下は「キャンセル申請の結果」)
                alt 6c 更新に失敗した
                    Api-->>Page: 503 DATABASE_UNAVAILABLE
                    Page-->>User: 「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」<br/>何も変わらない。入力はそのまま (基本フロー 4 へ)
                else 保存できた
                    Note over Api,Db: ここでコミットする
                    opt 返金の行を作った
                        Api->>Stripe: 注文の金額の返金を依頼
                        Note right of Api: Stripe の鍵がそろっていないときは<br/>呼ばずに「失敗した」へ進む
                        alt 依頼できた
                            Stripe-->>Api: Refund の ID
                            Api->>Db: 別のトランザクションで、<br/>返金の行に Refund の ID を記録
                        else 失敗した
                            Stripe--xApi: エラー
                            Api->>Db: 別のトランザクションで、<br/>返金の行を返金の失敗にする
                        end
                    end
                    opt 承認
                        Api->>Api: 別のトランザクションで、閉鎖中の店舗・受付停止中の<br/>組織を確かめ、未完了の注文がなければ閉鎖済み・停止にする
                    end
                    Api-->>Page: 200 更新後の注文
                    Page->>Api: GET /api/seller/orders?storeId=…
                    Api-->>Page: 200 最新の注文
                    Page-->>User: 「保存しました。」と処理結果<br/>「キャンセル申請（承認）：理由 / 回答：…」など、返金の状態
                end
            end
        end
    end
    Note over User,Stripe: 共通代替フロー *a・*b を適用
```

## 詳細図 1 基本フロー 1〜2 注文一覧を表示する

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
        participant Svc as OrderWorkflow<br/>Service
        participant Auth as AuthService
        participant Repo as Order<br/>Repository
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
    Page->>Page: priority() で cancellationStatus が<br/>PENDING の注文を先頭にする
    alt 2a PENDING の注文がない
        Page-->>User: CancellationDecision を出さない
        Note right of User: 2a-2 ユースケースを終了する
    else PENDING の注文がある
        Page-->>User: PickupCard に「キャンセル申請中」の印と CancellationDecision<br/>「キャンセル申請があります：(理由)」、「キャンセル回答」欄、<br/>「キャンセルを承認」「キャンセルを却下」
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## 詳細図 2 基本フロー 3〜8 回答を送り、結果を表示する

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as PickupOrders.jsx<br/>PickupCard・CancellationDecision
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as OrderWorkflow<br/>Controller
        participant Errs as ApiErrors
        participant Svc as OrderWorkflow<br/>Service
        participant Auth as AuthService
        participant Repo as Order<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 3〜5 内容を確かめて回答する (通信しない)
    User->>Page: 注文内容、合計、キャンセル理由を確かめる
    User->>Page: 却下するなら「キャンセル回答」に理由を入力
    Note right of Page: 「キャンセル回答」は Input の required={false}、<br/>maxLength 500。空でもブラウザーは止めない
    User->>Page: 「キャンセルを承認」または「キャンセルを却下」をクリック
    Note over User,Db: 基本フロー 6〜8 結果を保存して購入者に知らせる
    Page->>Page: onSubmit で decide(event)<br/>submitter の value が approve なら approved は true
    Page->>Hook: run(action)
    Hook->>Http: write('/seller/orders/{id}/cancellation', 'PUT',<br/>{ approved, reason })
    Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
    Http->>Ctrl: PUT /api/seller/orders/{id}/cancellation
    Ctrl->>Ctrl: @Valid が DecisionRequest を検査<br/>(reason は @NotNull、@Size(max = 500))
    Ctrl->>Svc: decideCancellation(id, approved, reason)
    Note over Svc,Db: クラスの @Transactional で、ここからメソッドの終わりまでが 1 つのトランザクション
    Svc->>Repo: lockOrder(id)
    Repo->>Db: SELECT ... FOR UPDATE (orders)
    Db-->>Repo: 行
    Repo-->>Svc: Optional の OrderEntity
    Svc->>Auth: requireStore(order) の中で<br/>requireSeller(storeId)
    Auth-->>Svc: 戻る
    Svc->>Auth: requireManager(storeId)
    alt 6d オーナーでも MANAGER でもない (STAFF)
        Auth--xErrs: denied() が throw<br/>ApiException(403, FORBIDDEN)
        Errs-->>Http: business() が 403 と message を返す
        Http--xHook: readResponse() が throw ApiError(403)
        Hook-->>Page: run() が false を返す。resource.error
        Page-->>User: 「この操作の権限がありません。」
    else オーナーか MANAGER
        Auth-->>Svc: 戻る
        Svc->>Svc: status が ACCEPTED か、<br/>cancellationStatus が PENDING か
        alt 6b 申請がすでに処理されている
            Svc--xErrs: conflict() が throw<br/>ApiException(409, ORDER_CHANGED)
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので<br/>一覧を取り直す
            Note over Http,Db: 取得は詳細図 1 と同じ流れ (図では省略)
            Http-->>Hook: 最新の注文
            Hook-->>Page: run() が false を返す。<br/>resource.error と最新の data
            Page-->>User: 「注文状態が変わりました。最新の状態を<br/>確認してください。」と最新の一覧
        else 6a 却下で reason.isBlank()
            Svc--xErrs: throw ApiException(400,<br/>REASON_REQUIRED)
            Errs-->>Http: business() が 400 と message を返す
            Http--xHook: readResponse() が throw ApiError(400)
            Hook-->>Page: run() が false を返す。resource.error
            Page-->>User: 「却下理由を入力してください。」
            Note right of User: 6a-2 入力欄はそのまま。基本フロー 4 へ
        else 検査を通る
            Note over Svc,Db: 在庫・申請の結果・返金の行・通知の保存は詳細図 3
            alt 6c 更新に失敗した (DataAccessException)
                Svc--xErrs: 例外。トランザクションはロールバックし、<br/>在庫・申請・注文は元のまま
                Errs-->>Http: database() が 503<br/>DATABASE_UNAVAILABLE を返す
                Http--xHook: readResponse() が throw ApiError(503)
                Hook-->>Page: run() が false を返す。resource.error
                Page-->>User: 「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」
                Note right of User: 6c-2 入力欄はそのまま。基本フロー 4 へ
            else 保存できた
                Svc-->>Ctrl: OrderView
                Note over Svc,Db: メソッドの終わりでコミットし、コミットの後の処理 (詳細図 4) が終わってから戻る
                Ctrl-->>Http: 200 OrderView
                Http-->>Hook: data
                Hook->>Http: reload() 一覧を取り直す
                Note over Http,Db: 取得は詳細図 1 と同じ流れ (図では省略)
                Http-->>Hook: 最新の注文
                Hook-->>Page: run() が true を返す。<br/>data と notice (既定の「保存しました。」)
                Page-->>User: 「保存しました。」と処理結果<br/>「キャンセル申請（承認）：理由 / 回答：…」など
            end
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## 詳細図 3 基本フロー 6〜7 トランザクションの中で保存する

```mermaid
sequenceDiagram
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Svc as OrderWorkflow<br/>Service
        participant Auth as AuthService
        participant Stock as StockReturn
        participant Items as OrderItem<br/>Repository
        participant Inv as Inventory<br/>Repository
        participant Refund as RefundService
        participant Pay as Payment<br/>Repository
        participant Refs as Refund<br/>Repository
        participant Close as Closure<br/>Settlement
        participant Ntf as Notification<br/>Service
    end
    participant Db as MySQL

    Note over Svc,Db: 詳細図 2 の「検査を通る」の続き。ここまでと同じトランザクションの中
    Note over Svc,Db: 基本フロー 6 在庫を戻し、申請の結果を記録する
    opt approved が true
        Svc->>Stock: restock(List.of(id))
        Note right of Stock: @Transactional(MANDATORY)<br/>呼ぶ側のトランザクションで動く
        Stock->>Items: findAllForOrder(id)
        Items->>Db: SELECT order_items
        Db-->>Items: 行
        Items-->>Stock: OrderItemEntity のリスト
        Stock->>Inv: lockAll(productIds)
        Inv->>Db: SELECT ... FOR UPDATE<br/>(inventory、商品 ID の順)
        Db-->>Inv: 行
        Inv-->>Stock: InventoryEntity のリスト
        Stock->>Stock: 明細ごとに setQuantity(在庫 + 数量)
        Note right of Stock: 在庫の行がなければ<br/>ApiException(409, STOCK_NOT_FOUND)
        Stock-->>Svc: 戻る (void)
    end
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Svc: order.decideCancellation(approved, reason, memberId)<br/>承認は status を CANCELLED にし、cancelledByMemberId を記録<br/>cancellationStatus は APPROVED か REJECTED、回答と日時を記録
    opt approved が true
        Svc->>Auth: current()
        Auth-->>Svc: AuthMember
        Svc->>Refund: refundCancelledOrder(order, memberId)
        Note right of Refund: @Transactional(MANDATORY)。paymentId が null<br/>(店舗でお支払い) ならすぐ戻る。返金の行が<br/>すでにあれば、決済を読まずに戻る
        Refund->>Refs: findByOrderId(orderId)
        Refs->>Db: SELECT refunds
        Db-->>Refs: 行 または 空
        Refs-->>Refund: Optional の RefundEntity
        Refund->>Pay: findById(paymentId)
        Pay->>Db: SELECT payments
        Db-->>Pay: 行
        Pay-->>Refund: PaymentEntity
        opt カードで支払い済みで、まだ返金していない (SUCCEEDED で PaymentIntent の ID がある)
            Refund->>Refs: save(new RefundEntity(...))<br/>金額は注文の合計、状態は REQUESTED
            Refs-->>Refund: RefundEntity
            Refund->>Refund: AfterCommit.run() で<br/>コミットの後の send() を登録
        end
        Refund-->>Svc: 戻る (void)
        Svc->>Close: afterOrderChanged(storeId)
        Close->>Close: AfterCommit.run() で<br/>コミットの後の settleStore(storeId) を登録
        Close-->>Svc: 戻る (void)
    end
    Note over Svc,Db: 基本フロー 7 購入者に知らせる
    Svc->>Ntf: send(buyerMemberId, ORDER, 承認は「注文をキャンセルしました」<br/>却下は「キャンセル申請の結果」, 注文番号と回答)
    Ntf->>Ntf: NotificationRepository の<br/>save(new NotificationEntity(...))
    Ntf-->>Svc: 戻る (void)
    Svc->>Svc: storeView(order) で OrderView にする (図では省略)
    Note over Svc,Db: メソッドの終わりでコミットする。在庫と注文の変更 (UPDATE inventory、orders) と、<br/>返金の行と通知 (INSERT refunds、notifications) は、コミットまでに DB に書かれる
```

## 詳細図 4 基本フロー 6 コミットの後に返金を依頼し、店舗を確かめる

```mermaid
sequenceDiagram
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Refund as RefundService
        participant Refs as Refund<br/>Repository
        participant Gw as StripeGateway
        participant Close as Closure<br/>Settlement
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe API
    end

    Note over Refund,Stripe: 基本フロー 6 コミットの後。AfterCommit で登録した処理は、応答を返す前に同じリクエストの中で動く。<br/>終わると詳細図 2 の「200 OrderView」に進む
    opt 返金の行を作った
        Refund->>Refund: afterCommit() から<br/>send(refundId, intentId, orderId, amount)
        Refund->>Gw: createRefund(intentId, amount, orderId, refundId)
        Gw->>Stripe: refunds().create(params)<br/>Idempotency-Key は refund-注文番号
        Note right of Gw: テスト用の秘密鍵と Webhook の署名の鍵が<br/>そろっていないときは呼ばずに stripe() が<br/>ApiException(409, CARD_PAYMENT_UNAVAILABLE)<br/>を throw し、「失敗した」と同じ扱いになる
        alt 依頼できた
            Stripe-->>Gw: Refund
            Gw-->>Refund: Refund の ID
            Refund->>Refs: 別のトランザクション (REQUIRES_NEW) で<br/>lock(refundId)
            Refs->>Db: SELECT ... FOR UPDATE (refunds)
            Db-->>Refs: 行
            Refs-->>Refund: RefundEntity
            Refund->>Refund: attachStripeRefund(Refund の ID)<br/>コミットで UPDATE refunds
        else 失敗した
            Stripe--xGw: StripeException
            Gw--xRefund: unavailable() が throw<br/>ApiException(502, PAYMENT_PROVIDER_ERROR)
            Refund->>Refs: catch して、別のトランザクションで<br/>lock(refundId)
            Refs->>Db: SELECT ... FOR UPDATE (refunds)
            Db-->>Refs: 行
            Refs-->>Refund: RefundEntity
            Refund->>Refund: Refund の ID がなければ<br/>changeStatus(FAILED)、コミットで UPDATE refunds
        end
    end
    opt approved が true
        Close->>Close: afterCommit() から settleStore(storeId)
        Note right of Close: 別のトランザクション (REQUIRES_NEW) で<br/>StoreClosureService.settle() と<br/>OrganizationSuspensionService.settle() を呼ぶ。<br/>閉鎖中の店舗・受付停止中の組織で未完了の<br/>注文がなければ、閉鎖済み・停止にして通知する。<br/>失敗はログに残すだけ (中は図では省略)
    end
    Note over Refund,Stripe: 返金の結果 (返金済み、返金の失敗) は、あとで Stripe の Webhook (POST /api/payments/stripe/webhook) が<br/>RefundService.apply() で返金の行に反映する (図では省略)
```

## ユースケース記述との差

- 6a の「却下理由を入力してください。」は、ブラウザーではなくサーバーが返します（400 `REASON_REQUIRED`）。「キャンセル回答」の入力欄は `required={false}` なので、ブラウザーは空欄の送信を止めません。サーバーは、注文をロックし、権限（6d）と申請の状態（6b）を確かめたあとで検査します。空白だけの回答も空とみなします（`isBlank()`）。
- 6c の更新の失敗は、コードでは例外によるロールバックです。DB の例外（`DataAccessException`）は 503 `DATABASE_UNAVAILABLE`「保存処理を完了できませんでした。時間をおいて再試行してください。」になり、画面は一覧を取り直しません。次の場合は 409 になり、画面は一覧を取り直します。
  - 在庫の行がない: `STOCK_NOT_FOUND`「在庫情報が見つかりません。」（`StockReturn.restock()`）
  - 楽観ロック・一意制約の違反: `DATA_CHANGED`「データが競合しました。最新の内容を確認してください。」（`ApiErrors.conflict()`）
- 6d について、画面は STAFF にも「キャンセル回答」の欄と「キャンセルを承認」「キャンセルを却下」ボタンを出します（`PickupCard` は `operator` でなければ `CancellationDecision` を出す）。押すとサーバーが 403 を返し、「この操作の権限がありません。」が出ます。
- 基本フロー 6 の返金の依頼は、注文のトランザクションのコミットの後、応答を返す前に、同じリクエストの中で Stripe を呼びます（`AfterCommit`）。Stripe の呼び出しが失敗したとき（`StripeException`）、または Stripe の鍵（テスト用の秘密鍵と Webhook の署名の鍵）がそろっていないときは、返金の行を `FAILED` にし、承認そのものは 200 で終わります。そのあとの一覧には「返金の失敗」と「返金に失敗しました。Stripe の管理画面で返金の状態を確認し、購入者に連絡してください。」が出ます（EC-S08 6b と同じ表示）。
- 基本フロー 7 の通知の本文は「注文番号 回答」です。店舗名は入りません。回答が空の承認では、本文は注文番号だけです。
- 「キャンセル回答」は、却下のときだけでなく承認のときも注文に保存し（`cancellationResponse`）、一覧に「キャンセル申請（承認）：理由 / 回答：…」として出ます。
- 承認のとき、閉鎖中の店舗・受付停止中の組織の確認（`ClosureSettlement.afterOrderChanged()`）もコミットの後に別のトランザクションで行います。閉鎖済み・停止にしたときは「店舗の閉鎖が完了しました」「組織が停止されました」を通知し、店舗の担当の割り当てを外します。ここで失敗しても応答は変わらず、定期処理（`settleAll()`）がもう一度確かめます。
- サーバーは次の応答も返しますが、記述にはありません。画面の操作ではふつう起きないため、図では枝にしていません。
  - 404 `ORDER_NOT_FOUND`「注文が見つかりません。」: 注文がないとき。ほかの店舗の注文や、運営が停止した店舗の注文も 404 になります。画面は 404 のときも一覧を取り直します。
  - 400 `INVALID_INPUT`: `reason` がないか 500 文字を超えるとき。画面の入力欄は `maxLength` 500 です。
- 権限の検査（`requireManager()`）は、記述のアクター（オーナー、MANAGER）のほかに運営のアカウントも通します。運営の「全注文管理」の画面は回答の欄を出しません。

## 参照したコード

- [frontend/src/workspace/PickupOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/PickupOrders.jsx): `OrderPage`、`PickupCard`、`CancellationDecision`、`decide()`、`priority()`、`cancelPending()`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OrderPages.jsx): `cancellationLabels`、`PaymentState`（返金の状態の表示）
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`）、`values()`、`ResourceStatus`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `/seller/orders` で `OrderPage` を表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`、`run()`（404・409 で取り直す、既定のメッセージ「保存しました。」）、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/payment.js): `refundStatusLabels`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `seller()`、`decide()`、`DecisionRequest`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `sellerOrders()`、`decideCancellation()`、`requireStore()`、`conflict()`、`storeView()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc()`、`lockOrder()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `decideCancellation()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/StockReturn.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/StockReturn.java): `restock()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java): `findAllForOrder()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lockAll()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/payment/service/RefundService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/RefundService.java): `refundCancelledOrder()`、`send()`、`apply()`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/RefundRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/RefundRepository.java): `findByOrderId()`、`lock()`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/PaymentRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/PaymentRepository.java): `findById()`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/entity/RefundEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/persistence/entity/RefundEntity.java): `REQUESTED`・`SUCCEEDED`・`FAILED`、`attachStripeRefund()`、`changeStatus()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/StripeGateway.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/StripeGateway.java): `createRefund()`、`stripe()`、`unavailable()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java): `run()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/StripeWebhookService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/StripeWebhookService.java): 返金のイベントを `RefundService.apply()` に渡す
- [backend/src/main/java/jp/kusakari/ec/store/service/ClosureSettlement.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/ClosureSettlement.java): `afterOrderChanged()`、`settleStore()`、`settleAll()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller()`、`requireManager()`、`requireStoreRole()`、`denied()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`conflict()`、`database()`
