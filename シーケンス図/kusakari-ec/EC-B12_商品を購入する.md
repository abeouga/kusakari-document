# EC-B12 商品を購入する

### 図 1 店舗でお支払い

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant Cart as カート画面<br/>Cart<br/>(Cart.jsx)
        participant Confirm as 確認画面の中身<br/>CheckoutConfirm<br/>(CheckoutConfirm.jsx)
        participant Pay as カードを選べるか<br/>useCardAvailable<br/>(payment.js)
        participant Shop as カートと購入の操作<br/>useShop<br/>(useShop.js)
        participant AuthJs as ログイン状態と通信の準備<br/>readSession・authFetch<br/>(auth.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant CartCtrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant PayCtrl as 決済API<br/>PaymentController<br/>(PaymentController.java)
        participant OrderCtrl as 注文API<br/>OrderController<br/>(OrderController.java)
        participant Session as 購入者のカート<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant CartSvc as カートの処理<br/>CartService<br/>(CartService.java)
        participant Checkout as お会計の処理<br/>CheckoutService<br/>(CheckoutService.java)
        participant PaySvc as カード決済の処理<br/>PaymentService<br/>(PaymentService.java)
        participant Ntf as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 4 (アプリを開いたときのカートの取得)、25・38 (ログイン状態の確認)、27、40、47、取り直しの 69 に適用<br/>*a 通信に失敗した場合: 4、25、27、38、40、45、47、取り直しの 69 に適用

    User->>App: Kusakari のトップなど、共通ヘッダーのある画面を開く
    App->>Shop: カートと商品を読み込むよう頼む<br/>(useShop → initialize → run → refresh)
    Shop->>Http: カートを読む (api.cart → request)
    Http->>CartCtrl: GET /api/cart
    CartCtrl->>Session: 購入者のカートを調べるよう頼む (resolve)<br/>requireBuyer と MemberCartService の resolve。中身は EC-B13 の図と同じ
    Session-->>CartCtrl: カートの ID
    CartCtrl->>CartSvc: カートを開くよう頼む (read)<br/>read 全体が 1 つのトランザクション
    CartSvc->>Db: カートをロックして読み (findLocked、SELECT ... FOR UPDATE carts)、明細を読み<br/>(findAllForCart)、商品、在庫、店舗と組織の状態を読む (CatalogService の listingsByIds)
    Db-->>CartSvc: カートと明細の行、商品ごとの値段、在庫、買えるか
    CartSvc->>CartSvc: 店舗の閉鎖・停止、組織の停止、商品の削除で買えなくなった明細を外し<br/>(REMOVED_REASONS。外したら incrementRevision)、行ごとの金額と購入できるか、<br/>合計、注文に進めるか (canCheckout) を計算する (view)
    CartSvc-->>CartCtrl: カート (revision、行ごとの受取店舗、金額、available、<br/>unavailableReason、合計、canCheckout、受取連絡先、removedItems)
    CartCtrl-->>Http: 200 カート
    Http-->>Shop: カート (setCart)
    Shop->>Http: 商品、注文、店舗を順に読む (api.products、api.orders、<br/>api.stores(35.6812, 139.7671))。GET /api/products、GET /api/orders、GET /api/stores
    Http-->>Shop: 商品、注文、営業中の店舗 (setProducts、setOrders、setStores)

    User->>Header: 共通ヘッダーの「カート」をクリック
    Header->>App: 移る先の URL を渡す (follow → onNavigate の navigateFromHeader)
    App->>Cart: URL を /cart に変え (navigate)、CartPage の中に Cart を表示<br/>(カートは読み直さない)
    Cart->>Pay: カードを選べるかを調べるよう頼む (useCardAvailable)
    opt 画面にテスト用の公開鍵 (pk_test_) がある (stripePublishableKey)
        Pay->>PayCtrl: カード決済の設定を読む (request)<br/>GET /api/payments/config
        Note over Pay,PayCtrl: 結果: 200 cardAvailable (サーバーに Stripe の鍵がそろっているか。StripeGateway の enabled)。<br/>画面: 鍵がない、取得に失敗したときは false で、カードの選択肢を出さない。
    end
    Pay-->>Cart: カードを選べるか
    Cart-->>User: 「ショッピングカート (N)」、商品ごとの受取店舗、数量、金額、<br/>「ご請求内容」、「注文内容を確認する」

    User->>Cart: 「注文内容を確認する」をクリック
    Cart->>Shop: 確認画面の前にカートを取り直すよう頼む<br/>(beginCheckout → run → checkoutCart)
    Shop->>AuthCtrl: ログイン状態を読む (auth.js の readSession)<br/>GET /api/auth/me
    AuthCtrl-->>Shop: 200 ログイン中 (session。ログインしていなければ login でログイン画面へ)
    Shop->>CartCtrl: カートを読む (api.cart → request)<br/>GET /api/cart。中身は 5〜11 と同じ
    CartCtrl-->>Shop: 200 最新のカート (setCart)
    Shop-->>Cart: 取り直せた (beginCheckout が true)
    Cart->>Confirm: 確認画面に切り替え (setConfirming(true))、CheckoutConfirm を表示<br/>支払方法の初めの値は「店舗でお支払い」(PAY_AT_STORE)
    Confirm-->>User: 「受け取り店舗とご注文商品（N点）」、受取店舗ごとの店舗名、<br/>所在地、営業時間 (shop.stores から) と商品、「受け取る方」、「お支払い方法」<br/>(カードを選べなければ「店舗でお支払い」だけ)
    Cart-->>User: 見出し「お支払い・受け取りの確認」、「ご請求内容」、<br/>「お支払い方法 店舗でお支払い」、「注文を確定する」、「カートに戻る」
    break 4a 最新のカートで在庫不足になっていた
        Cart-->>User: 4a-1 その商品に「在庫不足（現在 N 点）」
        Note over User,Cart: 結果: canCheckout が false なので「注文を確定する」を押せない。<br/>画面: 4a-2「カートに戻る」で通信せずにカートの画面に戻り (setConfirming(false))、4a-3 代替フロー 2a へ。
    end

    User->>Confirm: 「お支払い方法」で「店舗でお支払い」を選ぶ
    Confirm->>Cart: 選んだ支払方法を伝える (onPayment → setPayment)。通信しない
    User->>Cart: 「注文を確定する」をクリック
    Cart->>Shop: 注文するよう頼む (checkout('PAY_AT_STORE'))<br/>run が二重の実行を止めて busy にし、ボタンは「保存中…」
    Shop->>AuthCtrl: ログイン状態を読む (checkoutCart → readSession)<br/>GET /api/auth/me
    AuthCtrl-->>Shop: 200 ログイン中
    Shop->>CartCtrl: カートを読む (api.cart → request)<br/>GET /api/cart。中身は 5〜11 と同じ
    CartCtrl-->>Shop: 200 最新のカート (setCart)
    Shop->>Shop: 注文の要求を作る (checkoutRequest)<br/>requestId (crypto.randomUUID)、最新のカートの revision と合計 (expectedTotalYen)、支払方法。<br/>同じ支払方法の前の要求が残っていれば、作り直さずにそのまま送る
    Shop->>Http: 注文の要求を送る (api.checkout → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>OrderCtrl: POST /api/orders<br/>(requestId、revision、expectedTotalYen、paymentMethod は PAY_AT_STORE)
    OrderCtrl->>Checkout: 入力を検査し (@Valid CheckoutRequest)、購入者のカートを調べて<br/>(CartSessionResolver の resolve。5〜6 と同じ)、注文を保存するよう頼む (placeOrder)<br/>placeOrder 全体が 1 つのトランザクション (READ_COMMITTED)
    Checkout->>Db: カートをロックして読み (findLocked、SELECT ... FOR UPDATE carts)、<br/>同じ requestId の注文を探す (findByCartIdAndRequestIdOrderByStoreIdAsc)
    Db-->>Checkout: カートの行、注文の行 (なければなし)
    Checkout->>Checkout: 同じ requestId の注文があれば、それを返して終える (二重注文の防止。<br/>revision、合計、支払方法が違えば 409 REQUEST_REUSED)
    Checkout->>Db: 明細と商品ごとの店舗を読み (findAllForCart、findStoreReferences)、<br/>店舗を ID の順にロックして組織を共有ロックで読み (StoreRepository の lock、requireOpen → lockShared)、<br/>運営による商品の停止を共有ロックで読み (requireNotSuspended → lockSharedSuspension)、<br/>在庫を商品 ID の順にロックして読む (InventoryRepository の lockAll)
    Db-->>Checkout: 明細、店舗、組織、商品の停止の有無、在庫の行
    Checkout->>CartSvc: ロックした在庫でカートを計算し直すよう頼む (view)
    CartSvc-->>Checkout: canCheckout と合計
    Checkout->>Db: 受取連絡先を読む (DeliveryService の pickupDetails)
    Db-->>Checkout: お名前、電話番号、連絡先
    loop 受取店舗ごと (店舗 ID の順、placeStoreOrder)
        Checkout->>Db: 注文を保存する (OrderRepository の save)。注文受付 (ACCEPTED)、<br/>手数料の率と額、受取店舗の所在地と営業時間、受取連絡先 (assignPickup、changeRecipient)
        Checkout->>Ntf: 購入者に知らせるよう頼む (send)。「ご注文を受け付けました」、<br/>本文は「注文番号 / 店舗名」。通知を保存する (notifications)
        Checkout->>Ntf: 出店者に知らせるよう頼む (toStore)。「新しい注文が届きました」、本文は注文番号<br/>組織のオーナーと、店舗にロールのある担当者のうち利用中の会員ごとに保存する (notifications)
        loop その店舗の明細ごと
            Checkout->>Db: 在庫を確かめて減らし (setQuantity。足りなければ 409 OUT_OF_STOCK<br/>「在庫が変更されました。もう一度確認してください。」)、注文の明細を保存する (OrderItemRepository の save)
        end
    end
    Checkout->>Db: カートの明細を消し (deleteAll)、カートの revision を進めて<br/>(incrementRevision)、コミットする
    Db-->>Checkout: 完了
    Checkout-->>OrderCtrl: 受取店舗ごとの注文 (payment はなし)
    OrderCtrl->>PaySvc: 支払いを始めるよう頼む (start)
    PaySvc-->>OrderCtrl: payment がないので、そのまま返す
    OrderCtrl-->>Http: 200 注文の配列 (payment は null)
    Http-->>Shop: 保存した注文
    Shop->>Http: 注文の要求を捨て (checkoutRequest を null)、保存した注文を覚え (setLastOrders)、<br/>カートと商品と注文を取り直す (refresh)。流れは 3〜15 と同じ
    Http-->>Shop: 空のカート、商品、注文
    Shop-->>Cart: 保存した注文 (shop.lastOrders)
    Cart-->>User: 「注文を保存しました」。注文が複数なら「受取店舗ごとにN件の注文に分けて保存しました。」<br/>注文ごとの注文日時、注文番号、受取店舗、所在地、受取連絡先、お支払い方法、<br/>「受け取り時に店頭でお支払いください。」、商品、合計。「お買い物を続ける」
```

![EC-B12 図 1 店舗でお支払い](<images/EC-B12_商品を購入する-1.png>)

### 図 2 クレジットカード

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as カート画面<br/>Cart<br/>(Cart.jsx)
        participant Confirm as 確認画面の中身<br/>CheckoutConfirm<br/>(CheckoutConfirm.jsx)
        participant Card as カードでのお支払い<br/>CardPaymentStep・CardForm<br/>(CardPayment.jsx)
        participant StripeJs as Stripe の入力欄<br/>Elements・PaymentElement<br/>(@stripe/react-stripe-js)
        participant Shop as カートと購入の操作<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant OrderCtrl as 注文API<br/>OrderController<br/>(OrderController.java)
        participant WfCtrl as 注文の手続きAPI<br/>OrderWorkflowController<br/>(OrderWorkflowController.java)
        participant Checkout as お会計の処理<br/>CheckoutService<br/>(CheckoutService.java)
        participant PaySvc as カード決済の処理<br/>PaymentService<br/>(PaymentService.java)
        participant Gateway as Stripe との通信<br/>StripeGateway<br/>(StripeGateway.java)
        participant WfSvc as 注文の手続きの処理<br/>OrderWorkflowService<br/>(OrderWorkflowService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe
    end

    Note over User,Stripe: 共通代替フロー<br/>*b 未ログインの場合: 6 (ログイン状態の確認とカートの取得)、7、取り直しの 29・50、状態の確認の 44 に適用<br/>*a 通信に失敗した場合: 6 (ログイン状態の確認、カートの取得、CSRF トークンの取得)、7、取り直しの 29・50、状態の確認の 44 (失敗は画面に出さない) に適用

    User->>Confirm: 5a-1「お支払い方法」で「クレジットカード」を選ぶ<br/>(カードを選べるときだけ出る)
    Confirm->>Cart: 選んだ支払方法を伝える (onPayment → setPayment('CARD'))
    Cart-->>User: 5a-2 ボタンを「注文してカードで支払う」にする (checkoutLabel)。通信しない
    User->>Cart: 5a-3「注文してカードで支払う」をクリック
    Cart->>Shop: 注文するよう頼む (checkout('CARD'))
    Shop->>Http: ログイン状態とカートを取り直し、注文の要求を作って送る<br/>(checkoutCart → api.checkout)。流れは図 1 の 38〜47 と同じ
    Http->>OrderCtrl: POST /api/orders (paymentMethod は CARD)
    OrderCtrl->>Checkout: 入力を検査し、購入者のカートを調べて、<br/>注文を保存するよう頼む (@Valid、resolve → placeOrder)
    Checkout->>Db: カートをロックして読み、同じ requestId の注文を探す<br/>(findLocked、findByCartIdAndRequestIdOrderByStoreIdAsc。図 1 の 49〜51)
    Db-->>Checkout: カートの行、保存済みの注文 (なければなし)
    Checkout->>Gateway: カード決済を使えるかを確かめる (enabled)
    Gateway-->>Checkout: テスト用の秘密鍵 (sk_test_ か rk_test_) と<br/>Webhook の署名の鍵 (whsec_) がそろっているか
    Checkout->>Db: 7a〜7e を確かめ、店舗、組織、商品、在庫をロックする<br/>(図 1 の 52〜55)
    Db-->>Checkout: ロックした行
    Checkout->>Db: 5a-4 決済を保存する (PaymentRepository の saveAndFlush)<br/>状態は PENDING、金額は全部の注文の合計
    loop 受取店舗ごと (店舗 ID の順、placeStoreOrder)
        Checkout->>Db: 注文を支払い待ち (awaitPayment、PENDING_PAYMENT) で保存し、<br/>在庫を減らして明細を保存する。通知はまだ送らない
    end
    Checkout->>Db: カートの明細を消し、revision を進めて、コミットする
    Db-->>Checkout: 完了
    Checkout-->>OrderCtrl: 支払い待ちの注文と決済 (clientSecret はまだない)
    OrderCtrl->>PaySvc: 支払いを始めるよう頼む (start)<br/>トランザクションの外。Stripe を呼ぶ間は DB のロックを持たない
    PaySvc->>Gateway: 決済を読み (findById。PENDING)、PaymentIntent を作るよう頼む (createIntent)<br/>PaymentIntent の ID が保存済みなら作らずに読む (retrieveIntent)
    Gateway->>Stripe: PaymentIntent を作る (paymentIntents の create)<br/>金額は合計、円、metadata.payment_id、Idempotency-Key は requestId
    Stripe-->>Gateway: PaymentIntent の ID と client_secret
    Gateway-->>PaySvc: PaymentIntent
    PaySvc->>Db: 別のトランザクションで決済をロックし、PaymentIntent の ID を記録する<br/>(separate、lock、attachIntent)
    PaySvc-->>OrderCtrl: 支払い待ちの注文と決済 (clientSecret、amountYen)
    OrderCtrl-->>Http: 200 注文の配列と payment
    Http-->>Shop: 支払い待ちの注文と決済
    Shop->>Http: 注文の要求を捨て、支払い待ちを覚え (checkoutRequest を null、setPendingPayment)、<br/>カートと商品と注文を取り直す (refresh。図 1 の 3〜15)
    Http-->>Shop: 空のカート、商品、注文
    Shop-->>Cart: 支払い待ち (shop.pendingPayment)
    Cart->>Card: 「カードでのお支払い」を表示 (CardPaymentStep)
    Card->>StripeJs: Stripe.js を読み込み (loadStripe。1 回だけ)、<br/>client_secret で入力欄を作る (Elements、PaymentElement、locale は ja)
    StripeJs->>Stripe: Stripe.js と入力欄を読み込む
    Stripe-->>StripeJs: 入力欄
    Card-->>User: 5a-5「カードでのお支払い」、カード情報の入力欄、お支払い金額<br/>(受取店舗ごとの注文 N 件の合計)、「(金額)を支払う」
    User->>StripeJs: カード情報を入力する
    User->>Card: 5a-6「(金額)を支払う」をクリック
    Card->>StripeJs: 支払い中にして (pay → setPhase('paying'))、支払うよう頼む<br/>(confirmPayment、redirect は if_required)。ボタンは「支払い中…」
    StripeJs->>Stripe: 5a-7 カード情報を送って支払う (このサイトのサーバーを通らない)
    Stripe-->>StripeJs: 結果
    StripeJs-->>Card: 結果 (result)
    Card-->>User: 「支払いを確認しています」(setPhase('confirming'))<br/>5c カードが断られた (card_error) ときは、Stripe のエラーの文も出す
    loop 1.5 秒ごと (pollIntervalMs)、90 秒まで (pollLimitMs)
        Card->>WfCtrl: 注文ごとに状態を読む (poll → request、Promise.all)<br/>GET /api/orders/{id}
        WfCtrl->>WfSvc: 購入者の注文を読むよう頼む (buyerOrder)。読み取りだけのトランザクション<br/>購入者かを確かめ (requireBuyer)、注文、明細、決済、返金、店舗を読む<br/>(findById。ほかの会員の注文なら 404 ORDER_NOT_FOUND)
        WfSvc-->>WfCtrl: 注文 (view)
        WfCtrl-->>Card: 200 注文 (status、paymentStatus)。通信に失敗したら、次の回でやり直す
    end
    break 5c 支払いが失敗し、注文が取り消された (図 3 の 5c-1 の後)
        Card-->>User: 5c-2「お支払いができなかったため、注文を取り消しました。<br/>商品の在庫は元に戻しています。」と「商品を探す」
        Note over Cart,Card: 結果: 注文は取り消され、在庫は戻っている (setPhase('cancelled'))。<br/>画面: Stripe のエラーの文も出し、5c-3 ユースケースを終了する。
    end
    Card->>Shop: 5a-9 すべての注文が注文受付になったら (図 3 の 5a-8 の後)、<br/>受け付けた注文を渡す (onAccepted → acceptCardOrders)
    Shop->>Http: 支払い待ちを消し (setPendingPayment(null))、保存した注文を覚えて<br/>(setLastOrders)、カートと商品と注文を取り直す (refresh。図 1 の 3〜15)
    Http-->>Shop: 空のカート、商品、注文
    Cart-->>User: 「注文を保存しました」(基本フロー 9 と同じ表示)。カードの注文には<br/>「カードでのお支払いを確認しました（テストモードのため実際の請求はありません）。」
```

![EC-B12 図 2 クレジットカード](<images/EC-B12_商品を購入する-2.png>)

### 図 3 Stripe からの通知と時間切れ

```mermaid
sequenceDiagram
    autonumber
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant PayCtrl as 決済API<br/>PaymentController<br/>(PaymentController.java)
        participant Gateway as Stripe との通信<br/>StripeGateway<br/>(StripeGateway.java)
        participant Webhook as Stripe の通知の処理<br/>StripeWebhookService<br/>(StripeWebhookService.java)
        participant PaySvc as カード決済の処理<br/>PaymentService<br/>(PaymentService.java)
        participant Stock as 在庫を戻す<br/>StockReturn<br/>(StockReturn.java)
        participant Ntf as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
        participant Job as 時間切れの定期処理<br/>PaymentExpiryJob<br/>(PaymentExpiryJob.java)
    end
    participant Db as MySQL

    Stripe->>PayCtrl: POST /api/payments/stripe/webhook (Stripe-Signature のヘッダー付き)<br/>会員の認証と CSRF の対象外 (AuthConfiguration)
    PayCtrl->>Gateway: 本文を 512 KB まで読み (readNBytes)、署名を確かめるよう頼む (signatureValid)
    Gateway-->>PayCtrl: 署名が正しいか
    PayCtrl->>Webhook: 通知を処理するよう頼む (handle)<br/>handle 全体が 1 つのトランザクション。失敗したら記録ごと取り消し、Stripe の再送で処理し直す
    Webhook->>Db: 通知の ID を記録する (INSERT IGNORE INTO stripe_events)
    Db-->>Webhook: 記録した行の数 (0 なら処理済みの通知なので、何もせず false を返す)
    alt 5a-8 支払いが成功した (payment_intent.succeeded)
        Webhook->>PaySvc: 支払いの成功を反映するよう頼む (succeeded)
        PaySvc->>Db: 決済をロックして読み (lockByIntent。まだ PaymentIntent の ID がなければ<br/>metadata.payment_id で lock)、ID を記録して成功にし (attachIntent、succeed)、<br/>決済の注文を注文 ID の順にロックして読む (lockByPayment)
        Db-->>PaySvc: 決済と注文の行
        loop 注文ごと (決済が支払い待ちだったとき)
            PaySvc->>PaySvc: 注文受付にする (acceptPayment。PENDING_PAYMENT → ACCEPTED)
            PaySvc->>Ntf: 購入者に「ご注文を受け付けました」(send)、出店者に「新しい注文が届きました」<br/>(toStore) を知らせるよう頼む。店舗の会員ごとにも通知を保存する (notifications)
        end
        opt 時間切れや失敗で取り消した後に成功が届いた (記述なし)
            PaySvc->>PaySvc: 全額を返金するよう頼む (RefundService の refundCancelledOrder)
            Note over PaySvc,Db: 結果: 注文を取り消したまま全額を返金し、購入者に「お支払いを返金します」を知らせる。
        end
    else 5c-1 支払いが失敗した (payment_intent.payment_failed)
        Webhook->>PaySvc: 支払いの失敗を反映するよう頼む (failed)
        PaySvc->>Db: 決済をロックして読む (lockFor。上と同じ)
        PaySvc->>PaySvc: 支払い待ちの注文を取り消して在庫を戻す (cancelUnpaid、状態は FAILED)。<br/>中身は下の 5e の 23〜27 と同じ。通知の本文は「お支払いができなかったため、注文を取り消しました。」
    end
    Webhook->>Db: コミットする
    opt 5c-1 で PaymentIntent の ID があるとき (コミットの後、AfterCommit)
        PaySvc->>Gateway: PaymentIntent を取り消すよう頼む (cancelIntent)
        Note over Stripe,Gateway: 結果: Stripe の PaymentIntent を取り消す (paymentIntents の cancel)。失敗はログに残すだけ。
    end
    Webhook-->>PayCtrl: 処理した (true)
    PayCtrl-->>Stripe: 200 received、processed

    loop 5e 1 分ごと (@Scheduled、起動の 10 秒後から)
        Job->>Db: 作ってから 30 分を過ぎた支払い待ちの決済を探す (findPendingBefore)
        Db-->>Job: 決済の ID のリスト
        loop 決済ごと (失敗してもログに残して次へ進む)
            Job->>PaySvc: 時間切れにするよう頼む (expire)<br/>expire 全体が 1 つのトランザクション
            PaySvc->>Db: 決済をロックして読み (lock)、まだ支払い待ちなら期限切れにし<br/>(cancelUnpaid → close(EXPIRED)。支払い待ちでなければ何もしない)、<br/>決済の注文をロックして読む (lockByPayment)
            PaySvc->>Stock: 在庫を戻すよう頼む (restock)
            Stock->>Db: 明細を読み、在庫を商品 ID の順にロックして、数量を足す<br/>(findAllForOrder、lockAll、setQuantity)
            PaySvc->>PaySvc: 注文を取り消す (cancelUnpaid。CANCELLED)
            PaySvc->>Ntf: 5e-1 購入者に「ご注文を取り消しました」を知らせるよう頼む (send)<br/>本文は「お支払いの期限が過ぎたため、注文を取り消しました。」。通知を保存する (notifications)
            PaySvc->>Db: コミットし、PaymentIntent の ID があればコミットの後に取り消す<br/>(AfterCommit → cancelIntent。失敗はログに残すだけ)
            PaySvc-->>Job: 終わった
        end
    end
```

![EC-B12 図 3 Stripe からの通知と時間切れ](<images/EC-B12_商品を購入する-3.png>)
