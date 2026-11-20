# EC-B12 商品を購入する

- ユースケース記述: [EC-B12_商品を購入する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B12_商品を購入する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

支払方法で流れが大きく分かれるので、図を分けています。

- 概要図 1、詳細図 1〜3: 基本フロー（店舗でお支払い）と、代替フロー 2a、4a、7a〜7e、7g
- 概要図 2、詳細図 4〜6: 代替フロー 5a〜5f、7f（クレジットカード）

## 概要図

### 概要図 1 基本フロー 1〜9（店舗でお支払い）

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as カート画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: アプリを開いたとき (操作の前に自動で実行)
    Page->>Api: GET /api/cart
    Api->>Db: 会員とカートをロックし、<br/>明細、商品、在庫、店舗を読む
    Db-->>Api: 行
    Api-->>Page: 200 カート (行ごとの受取店舗、金額、<br/>購入できるか、revision、合計)
    Page->>Api: GET /api/products、GET /api/orders、<br/>GET /api/stores (latitude、longitude)
    Api-->>Page: 200 商品、注文、営業中の店舗
    Note right of Page: 共通代替フロー *b を適用 (未ログインならログイン画面へ)

    Note over User,Db: 基本フロー 1〜2 カートを表示する
    User->>Page: 共通ヘッダーの「カート」をクリック
    opt 画面に Stripe のテスト用の公開鍵がある
        Page->>Api: GET /api/payments/config
        Api-->>Page: 200 cardAvailable
    end
    Page-->>User: 「ショッピングカート」画面<br/>受取店舗、数量、金額、「ご請求内容」
    Note over User,Page: 2a 購入できない行は「現在は購入できません」、<br/>在庫不足の行は「在庫不足（現在 N 点）」を出し、<br/>「注文内容を確認する」を押せない。通信しない

    Note over User,Db: 基本フロー 3〜4 確認画面を表示する
    User->>Page: 「注文内容を確認する」をクリック
    Page->>Api: GET /api/auth/me
    Api-->>Page: 200 ログイン状態
    Page->>Api: GET /api/cart
    Api-->>Page: 200 最新のカート
    Page-->>User: 「お支払い・受け取りの確認」画面<br/>受取店舗ごとの店舗名、所在地、営業時間と商品、<br/>「受け取る方」、「店舗でお支払い」を選んだ状態
    Note over User,Page: 4a 最新のカートで在庫不足の行は「在庫不足（現在 N 点）」、<br/>「注文を確定する」を押せない。<br/>「カートに戻る」は画面を戻すだけで通信しない

    Note over User,Db: 基本フロー 5〜6 支払方法を選んで確定する
    User->>Page: 「お支払い方法」で「店舗でお支払い」を選ぶ
    Page-->>User: 選んだ支払方法 (通信しない)
    User->>Page: 「注文を確定する」をクリック
    Page->>Api: GET /api/auth/me
    Api-->>Page: 200 ログイン状態
    Page->>Api: GET /api/cart
    Api-->>Page: 200 最新のカート (revision、totalYen)
    Page->>Api: GET /api/auth/csrf
    Api-->>Page: 200 CSRF トークン
    Page->>Api: POST /api/orders<br/>requestId、revision、expectedTotalYen、PAY_AT_STORE

    Note over User,Db: 基本フロー 7 カート、在庫、合計を確かめて在庫を引き当てる
    Note over Api,Db: ここから注文の保存の終わりまでが 1 つのトランザクション
    Api->>Db: カートをロックし、同じ requestId の注文を探す
    Db-->>Api: 行
    Note right of Api: 保存済みなら、その注文を返して終わる (二重注文の防止)
    Api->>Db: 店舗、組織、商品、在庫の順にロックして読む
    Db-->>Api: 行
    alt 7a〜7e カート、価格、在庫、店舗の受付、商品の公開が変わっていた
        Api-->>Page: 409 CART_CHANGED / PRICE_CHANGED /<br/>OUT_OF_STOCK / STORE_DISABLED
        Note over Api,Db: ロールバック。注文も在庫の減算も残らない
        Page->>Api: GET /api/cart、GET /api/products、GET /api/orders
        Api-->>Page: 200 最新のカートほか
        Page-->>User: エラーメッセージと、最新のカートの確認画面
    else 7g 保存に失敗した
        Db--xApi: DB のエラー
        Api-->>Page: 503 DATABASE_UNAVAILABLE
        Page-->>User: 「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」<br/>カートを取り直さず、もう一度押せる
    else 確定できる
        Note over User,Db: 基本フロー 7〜8 受取店舗ごとに注文を保存し、通知する
        loop 受取店舗ごと (店舗 ID の順)
            Api->>Db: 注文 (注文受付 ACCEPTED、手数料の率と額) を追加
            Api->>Db: 購入者に「ご注文を受け付けました」、<br/>店舗の会員に「新しい注文が届きました」の通知を追加
            Api->>Db: 在庫を減らし、注文の明細を追加
        end
        Api->>Db: カートの明細を消し、revision を進める
        Db-->>Api: コミット
        Api-->>Page: 200 orders (受取店舗ごとの注文)、payment は null
        Note over User,Db: 基本フロー 9 完了画面を表示する
        Page->>Api: GET /api/cart、GET /api/products、GET /api/orders
        Api-->>Page: 200 空のカートほか
        Page-->>User: 「注文を保存しました」画面<br/>注文ごとの注文番号、受取店舗、お支払い方法、商品、合計<br/>「受け取り時に店頭でお支払いください。」
    end
```

### 概要図 2 代替フロー 5a〜5f、7f（クレジットカード）

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as カート画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe
    end

    Note over User,Stripe: 代替フロー 5a-1〜5a-3 クレジットカードを選んで確定する
    User->>Page: 「お支払い方法」で「クレジットカード」を選ぶ
    Page-->>User: ボタンの表示を「注文してカードで支払う」に変える (通信しない)
    User->>Page: 「注文してカードで支払う」をクリック
    Page->>Api: GET /api/auth/me、GET /api/cart、GET /api/auth/csrf
    Api-->>Page: 200 ログイン状態、最新のカート、CSRF トークン
    Page->>Api: POST /api/orders<br/>requestId、revision、expectedTotalYen、CARD
    Api->>Db: カートをロックし、同じ requestId の注文を探す
    Db-->>Api: 行
    alt 7f カード決済が使えない (サーバーに Stripe の鍵がそろっていない)
        Api-->>Page: 409 CARD_PAYMENT_UNAVAILABLE
        Page->>Api: GET /api/cart、GET /api/products、GET /api/orders
        Api-->>Page: 200 最新のカートほか
        Page-->>User: 「カード決済は現在使えません。店頭払いを選んでください。」
    else 確定できる
        Note over User,Stripe: 代替フロー 5a-4 支払い待ちの注文を保存する (7a〜7e、7g は概要図 1 と同じ)
        Api->>Db: 店舗、組織、商品、在庫の順にロックして確かめる
        Api->>Db: 決済 (PENDING、全注文の合計) を追加
        loop 受取店舗ごと
            Api->>Db: 注文 (支払い待ち PENDING_PAYMENT) を追加し、<br/>在庫を減らし、明細を追加
        end
        Api->>Db: カートの明細を消し、revision を進める
        Db-->>Api: コミット (通知はまだ送らない)
        Api->>Stripe: PaymentIntent を作る<br/>金額は全注文の合計、Idempotency-Key は requestId
        alt 5f Stripe との通信に失敗した
            Stripe-->>Api: エラー
            Api-->>Page: 502 PAYMENT_PROVIDER_ERROR
            Page-->>User: 「カード決済の処理に失敗しました。<br/>時間をおいてもう一度お試しください。」
            Note over User,Stripe: 注文は支払い待ちのまま。もう一度押すと同じ requestId を送り、<br/>保存済みの注文で PaymentIntent を作り直す (5a-5 へ)。押さなければ 30 分後に 5e
        else 作れた
            Stripe-->>Api: PaymentIntent の ID と client_secret
            Api->>Db: 決済に PaymentIntent の ID を記録 (別のトランザクション)
            Db-->>Api: コミット
            Api-->>Page: 200 orders (支払い待ち)、payment (clientSecret、amountYen)
            Page->>Api: GET /api/cart、GET /api/products、GET /api/orders
            Api-->>Page: 200 空のカートほか
        end
    end

    Note over User,Stripe: 代替フロー 5a-5〜5a-7 カード情報を Stripe へ送る
    Page->>Stripe: Stripe.js を読み込み、client_secret で入力欄を作る
    Stripe-->>Page: カード情報の入力欄
    Page-->>User: 「カードでのお支払い」画面<br/>お支払い金額 (受取店舗ごとの注文 N 件の合計)、<br/>カード情報の入力欄、「(金額)を支払う」
    User->>Page: カード情報を入力し、「(金額)を支払う」をクリック
    Page->>Stripe: confirmPayment<br/>カード情報はこのサイトのサーバーを通らない
    alt 5b 入力に不備がある (validation_error)
        Stripe-->>Page: error
        Page-->>User: Stripe のエラーメッセージ。入力欄に戻る (5a-6 へ)
    else その他のエラー (記述にない)
        Stripe-->>Page: error
        Page-->>User: Stripe のエラーメッセージ。もう一度押せる
    else 5c カードが断られた (card_error)
        Stripe-->>Page: error
        Page-->>User: Stripe のエラーメッセージと「支払いを確認しています」
    else 支払いを受け付けた
        Stripe-->>Page: error なし
        Page-->>User: 「支払いを確認しています」
    end

    Note over User,Stripe: 代替フロー 5a-8、5c-1 Stripe からの通知 (画面の確認と並行して届く)
    Stripe->>Api: POST /api/payments/stripe/webhook
    Api->>Api: 署名を確かめる
    Api->>Db: 通知の ID を記録 (同じ通知の 2 回目は何もしない)
    Db-->>Api: 記録できた行の数
    alt 5a-8 payment_intent.succeeded
        Api->>Db: 決済と注文をロックし、決済を SUCCEEDED、<br/>注文を注文受付 ACCEPTED にする
        Api->>Db: 購入者と店舗の会員への通知を追加 (基本フロー 8)
        Db-->>Api: コミット
    else 5c-1 payment_intent.payment_failed
        Api->>Db: 決済と注文をロックし、決済を FAILED、<br/>注文を CANCELLED にし、在庫を戻す
        Api->>Db: 購入者に「ご注文を取り消しました」の通知を追加
        Db-->>Api: コミット
        Api->>Stripe: コミットの後に PaymentIntent を取り消す
        Stripe-->>Api: 結果 (失敗はログに残すだけ)
    end
    Api-->>Stripe: 200 received、processed

    Note over User,Stripe: 代替フロー 5a-9、5c-2、5d 画面が注文の状態を確かめる
    loop 1.5 秒ごと、最大 90 秒、注文ごとに
        Page->>Api: GET /api/orders/{id}
        Api->>Db: 注文、明細、決済、返金、店舗を読む
        Db-->>Api: 行
        Api-->>Page: 200 注文 (status)
    end
    alt 5a-9 すべての注文が ACCEPTED
        Page->>Api: GET /api/cart、GET /api/products、GET /api/orders
        Api-->>Page: 200 空のカートほか
        Page-->>User: 「注文を保存しました」画面 (基本フロー 9)<br/>「カードでのお支払いを確認しました<br/>（テストモードのため実際の請求はありません）。」
    else 5c-2 CANCELLED の注文がある
        Page-->>User: 「お支払いができなかったため、注文を取り消しました。<br/>商品の在庫は元に戻しています。」と「商品を探す」
    else 5d 90 秒たっても決まらない
        Page-->>User: 「お支払いの確認に時間がかかっています。<br/>注文の状態は購入履歴で確認できます。」と「購入履歴を開く」
    end

    Note over User,Stripe: 代替フロー 5e 支払い待ちのまま 30 分が過ぎた (画面の操作とは別に動く)
    loop 1 分ごと
        Api->>Db: 作ってから 30 分を過ぎた支払い待ちの決済を探す
        Db-->>Api: 決済の ID
        loop 決済ごと (1 件ずつ別のトランザクション)
            Api->>Db: 決済を EXPIRED、注文を CANCELLED にし、在庫を戻す
            Api->>Db: 購入者に「ご注文を取り消しました」の通知を追加
            Db-->>Api: コミット
            Api->>Stripe: PaymentIntent を取り消す
            Stripe-->>Api: 結果 (失敗はログに残すだけ)
        end
    end
```

## 詳細図

### 詳細図 1 アプリを開いたとき、基本フロー 1〜2

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Pay as payment.js
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CartCtrl as CartController
        participant PayCtrl as Payment<br/>Controller
        participant Session as CartSession<br/>Resolver
        participant CartSvc as CartService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: アプリを開いたとき App.jsx が useShop() を呼ぶ
    Shop->>Shop: useEffect が initialize() を実行し、<br/>run() の中で refresh() を呼ぶ
    Shop->>Http: api.cart()
    Http->>CartCtrl: GET /api/cart
    CartCtrl->>Session: resolve(request, response)
    Note right of Session: AuthService.requireBuyer() で購入者か確かめ<br/>(401 LOGIN_REQUIRED、403 BUYER_REQUIRED)、<br/>MemberCartService.resolve() が会員の行を<br/>SELECT ... FOR UPDATE してカートの ID を返す。図では省略
    Session-->>CartCtrl: cartId
    CartCtrl->>CartSvc: read(cartId)
    Note over CartSvc,Db: @Transactional(READ_COMMITTED) read() の終わりまで
    CartSvc->>Repo: CartRepository.findLocked(id)
    Repo->>Db: SELECT ... FOR UPDATE (carts)
    Db-->>Repo: 行
    Repo-->>CartSvc: CartEntity
    CartSvc->>Repo: CartItemRepository.findAllForCart(id)
    Repo->>Db: SELECT (cart_items)
    Db-->>Repo: 行
    Repo-->>CartSvc: CartItemEntity のリスト
    Note right of CartSvc: CatalogService.listingsByIds() で商品、在庫、<br/>店舗と組織の状態を読む。閉鎖済み、停止、削除で<br/>買えなくなった明細は外し、revision を進め、<br/>removedItems で返す。図では省略
    CartSvc->>CartSvc: view(cart) 行ごとの金額と available、<br/>合計、canCheckout を計算
    CartSvc-->>CartCtrl: CartView
    CartCtrl-->>Http: 200 CartView
    Http-->>Shop: cart
    Shop->>Shop: setCart(cart)
    Shop->>Http: api.products()、api.orders()、<br/>api.stores(35.6812, 139.7671)
    Note right of Http: GET /api/products、GET /api/orders、<br/>GET /api/stores (latitude、longitude)。<br/>サーバー側は図では省略
    Http-->>Shop: products、orders、stores
    Shop->>Shop: setProducts()、setOrders()、setStores()
    Note right of Shop: api.cart() が 401 なら signedOut、<br/>403 BUYER_REQUIRED なら refusedBuyer にして<br/>商品だけを読む。図では省略

    Note over User,Db: 基本フロー 1〜2 カートを表示する
    User->>Cart: 共通ヘッダーの「カート」をクリック
    Note right of User: KusakariHeader の follow() → App.jsx の<br/>navigateFromHeader() → navigate('/cart')。<br/>App.jsx が CartPage.jsx を、CartPage が Cart を表示する。<br/>未ログインなら redirectToLogin() (共通代替フロー *b)
    Cart->>Pay: useCardAvailable()
    opt stripePublishableKey が pk_test_ で始まる
        Pay->>Http: request('/payments/config')
        Http->>PayCtrl: GET /api/payments/config
        Note right of PayCtrl: config() が StripeGateway.enabled() を返す。<br/>テスト用の秘密鍵と Webhook の署名の鍵が<br/>そろっていれば true
        PayCtrl-->>Http: 200 cardAvailable
        Http-->>Pay: config
    end
    Pay-->>Cart: available (鍵がないか取得に失敗したら false)
    Cart-->>User: 「ショッピングカート (N)」画面<br/>shop.cart の受取店舗、数量、金額、「ご請求内容」
    Note right of Cart: 2a line.unavailableReason があれば「現在は購入できません」、<br/>available が false なら「在庫不足（現在 N 点）」。<br/>cart.canCheckout が false なら<br/>「注文内容を確認する」が disabled
```

### 詳細図 2 基本フロー 3〜4

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Confirm as Checkout<br/>Confirm.jsx
        participant Shop as useShop.js
        participant AuthJs as auth.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as AuthController
        participant CartCtrl as CartController
    end

    Note over User,CartCtrl: 基本フロー 3〜4 確認画面を表示する
    User->>Cart: 「注文内容を確認する」をクリック
    Cart->>Shop: beginCheckout()
    Shop->>Shop: run() が busy にし、error と notice を消す
    Shop->>Shop: checkoutCart()
    Shop->>AuthJs: readSession()
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 SessionView (auth.session())
    AuthJs-->>Shop: session
    Note right of Shop: authenticated が false なら login() で<br/>ログイン画面へ (共通代替フロー *b)。図では省略
    Shop->>Http: api.cart()
    Http->>CartCtrl: GET /api/cart
    Note right of CartCtrl: サーバー側は詳細図 1 と同じ流れ
    CartCtrl-->>Http: 200 最新の CartView
    Http-->>Shop: current
    Shop->>Shop: setCart(current)
    Shop-->>Cart: true
    Note right of Cart: 取得に失敗すると run() の catch が setError() し、<br/>false を返す。カート画面のまま (共通代替フロー *a)
    Cart->>Cart: setConfirming(true)
    Cart->>Confirm: CheckoutConfirm を表示<br/>payment は初めの値 PAY_AT_STORE
    Confirm-->>User: 「受け取り店舗とご注文商品（N点）」<br/>受取店舗ごとの店舗名、所在地、営業時間と商品、<br/>「受け取る方」、「お支払い方法」
    Cart-->>User: 見出し「お支払い・受け取りの確認」、<br/>「ご請求内容」、「注文を確定する」、「カートに戻る」
    Note right of Confirm: 所在地と営業時間は shop.stores (GET /api/stores) から、<br/>受け取る方は cart.details から出す。<br/>cardAvailable が false ならカードの選択肢を出さない
    Note right of Cart: 4a !line.available の行に「在庫不足（現在 N 点）」。<br/>cart.canCheckout が false なので「注文を確定する」が disabled。<br/>「カートに戻る」は setConfirming(false) だけで通信しない
```

### 詳細図 3 基本フロー 5〜9、代替フロー 7a〜7e、7g

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant OrderCtrl as OrderController
        participant Errs as ApiErrors
        participant Session as CartSession<br/>Resolver
        participant Checkout as CheckoutService
        participant CartSvc as CartService
        participant Notice as Notification<br/>Service
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 5〜6 支払方法を選んで確定する
    User->>Cart: 「店舗でお支払い」を選ぶ
    Cart->>Cart: CheckoutConfirm の onChange が<br/>setPayment('PAY_AT_STORE') (通信しない)
    User->>Cart: 「注文を確定する」をクリック
    Cart->>Shop: checkout(payment)
    Shop->>Shop: run() operation.current で二重の実行を止め、busy にする
    Shop->>Shop: checkoutCart() GET /api/auth/me と<br/>GET /api/cart (詳細図 2 と同じ)
    Shop->>Shop: checkoutRequest.current を作る<br/>requestId (crypto.randomUUID())、<br/>revision、expectedTotalYen、paymentMethod
    Note right of Shop: 前回と同じ支払方法の checkoutRequest.current が<br/>残っていれば、作り直さずにそのまま送る (再試行)
    Shop->>Http: api.checkout(checkoutRequest.current)
    Note right of Http: send() の authFetch() が先に GET /api/auth/csrf で<br/>トークンを取る (AuthController.csrf())。図では省略
    Http->>OrderCtrl: POST /api/orders
    Note right of OrderCtrl: @Valid が CheckoutRequest を検査する<br/>(違反は 400 INVALID_INPUT)
    OrderCtrl->>Session: resolve(request, response)
    Session-->>OrderCtrl: cartId (詳細図 1 と同じ)
    OrderCtrl->>Checkout: placeOrder(cartId, input)

    Note over User,Db: 基本フロー 7 カート、在庫、合計を確かめて在庫を引き当てる
    Note over Checkout,Db: @Transactional(READ_COMMITTED) placeOrder() の終わりまでが 1 つのトランザクション
    Checkout->>Repo: CartRepository.findLocked(cartId)
    Repo->>Db: SELECT ... FOR UPDATE (carts)
    Db-->>Repo: 行
    Repo-->>Checkout: CartEntity
    Checkout->>Repo: OrderRepository.findByCartIdAnd<br/>RequestIdOrderByStoreIdAsc()
    Repo-->>Checkout: 同じ requestId の注文
    Note right of Checkout: あれば、その注文を返して終わる (二重注文の防止)。<br/>revision、合計、支払方法が違えば 409 REQUEST_REUSED
    Checkout->>Checkout: cart.getRevision() と request.revision() を比べる<br/>(7a 409 CART_CHANGED)
    Checkout->>Repo: CartItemRepository.findAllForCart()、<br/>ProductRepository.findStoreReferences()
    Repo-->>Checkout: 明細、商品ごとの店舗 ID
    Checkout->>Repo: StoreRepository.lock(storeId) を店舗 ID の順に
    Repo->>Db: SELECT ... FOR UPDATE (stores)
    Db-->>Repo: 行
    Repo-->>Checkout: StoreEntity
    Checkout->>Checkout: requireOpen(lockedStores)
    Checkout->>Repo: OrganizationRepository.lockShared(ids)
    Repo->>Db: SELECT ... FOR SHARE (organizations)
    Db-->>Repo: 行
    Repo-->>Checkout: OrganizationEntity
    Note right of Checkout: 7d isOpen() か acceptsOrders() が false の店舗が<br/>1 つでもあれば 409 STORE_DISABLED
    Checkout->>Checkout: requireNotSuspended(productIds)
    Checkout->>Repo: ProductRepository.lockSharedSuspension(ids)
    Repo->>Db: SELECT id, suspended ... FOR SHARE (products)
    Db-->>Repo: 行
    Repo-->>Checkout: id と suspended
    Note right of Checkout: 7e 運営が停止した商品があれば 409 OUT_OF_STOCK<br/>「購入できない商品があります。…」
    Checkout->>Repo: InventoryRepository.lockAll(productIds)
    Repo->>Db: SELECT ... FOR UPDATE (inventory) 商品 ID の順
    Db-->>Repo: 行
    Repo-->>Checkout: InventoryEntity
    Checkout->>CartSvc: view(cart)
    CartSvc-->>Checkout: CartView (canCheckout、totalYen)
    Checkout->>Checkout: canCheckout (7c 409 OUT_OF_STOCK) と<br/>totalYen (7b 409 PRICE_CHANGED) を確かめる
    alt 7a〜7e 確定できない
        Checkout--xErrs: throw ApiException(409, CART_CHANGED など)
        Note over Checkout,Db: 例外でロールバック。注文も在庫の減算も残らない
        Errs-->>Http: business() が 409 と message を返す
        Http--xShop: readResponse() が throw ApiError(409)
        Shop->>Shop: run() の catch で setError(message)、<br/>checkoutRequest.current を null にする
        Shop->>Http: refresh() GET /api/cart、<br/>GET /api/products、GET /api/orders
        Http-->>Shop: 最新のカートほか
        Shop-->>Cart: shop.error と shop.cart
        Cart-->>User: エラーメッセージと最新のカートの確認画面<br/>(canCheckout が false なら「注文を確定する」が disabled)
    else 7g DB のエラー
        Repo--xErrs: DataAccessException
        Errs-->>Http: database() が 503 DATABASE_UNAVAILABLE を返す
        Http--xShop: readResponse() が throw ApiError(503)
        Shop->>Shop: run() の catch で setError(message)、<br/>checkoutRequest.current は残す
        Shop-->>Cart: shop.error (カートは取り直さない)
        Cart-->>User: 「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」<br/>busy が戻り、もう一度押せる
    else 確定できる
        Note over User,Db: 基本フロー 7〜8 受取店舗ごとに注文を保存し、通知する
        Note right of Checkout: DeliveryService.pickupDetails() で受取連絡先を読み、<br/>全部の注文に写す。図では省略
        loop linesByStore の店舗ごとに placeStoreOrder()
            Checkout->>Checkout: new OrderEntity (状態 ACCEPTED、手数料の率と額)、<br/>assignPickup()、changeRecipient()
            Checkout->>Repo: OrderRepository.save(order)
            Repo-->>Checkout: OrderEntity
            Checkout->>Notice: send(購入者, ORDER, 「ご注文を受け付けました」)
            Notice-->>Checkout: NotificationRepository.save() のあと戻る
            Checkout->>Notice: toStore(storeId, ORDER, 「新しい注文が届きました」)
            Notice-->>Checkout: 組織のオーナーと店舗の担当者ごとに保存して戻る
            loop 店舗の明細ごと
                Checkout->>Checkout: 在庫を確かめ (足りなければ 409 OUT_OF_STOCK)、<br/>stock.setQuantity(在庫 - 数量)
                Checkout->>Repo: OrderItemRepository.save()
                Repo-->>Checkout: OrderItemEntity
            end
        end
        Checkout->>Repo: CartItemRepository.deleteAll(items)
        Repo-->>Checkout: 戻る
        Checkout->>Checkout: cart.incrementRevision()
        Checkout-->>OrderCtrl: CheckoutResult (orders、payment は null)
        Note over Checkout,Db: placeOrder() が戻るときにコミットする (orders、notifications、<br/>order_items の INSERT、inventory と carts の UPDATE、cart_items の DELETE)
        Note right of OrderCtrl: PaymentService.start(result) は payment が null なので<br/>そのまま返す。図では省略
        OrderCtrl-->>Http: 200 CheckoutResult
        Http-->>Shop: result
        Note over User,Db: 基本フロー 9 完了画面を表示する
        Shop->>Shop: checkoutRequest.current を null にし、<br/>setLastOrders(result.orders)
        Shop->>Http: refresh() GET /api/cart、<br/>GET /api/products、GET /api/orders
        Http-->>Shop: 空のカートほか
        Shop-->>Cart: shop.lastOrders
        Cart-->>User: 「注文を保存しました」画面 (OrderSummary)<br/>注文番号、受取店舗、お支払い方法、商品、合計、<br/>「受け取り時に店頭でお支払いください。」
    end
```

### 詳細図 4 代替フロー 5a-1〜5a-4、5f、7f（カードの注文と PaymentIntent）

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant OrderCtrl as OrderController
        participant Errs as ApiErrors
        participant Checkout as CheckoutService
        participant PaySvc as PaymentService
        participant Gateway as StripeGateway
        participant Repo as 各 Repository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe API
    end

    Note over User,Stripe: 代替フロー 5a-1〜5a-3 クレジットカードを選んで確定する
    User->>Cart: 「クレジットカード」を選ぶ
    Cart->>Cart: setPayment('CARD')
    Cart-->>User: checkoutLabel を「注文してカードで支払う」にする
    User->>Cart: 「注文してカードで支払う」をクリック
    Cart->>Shop: checkout('CARD')
    Shop->>Shop: checkoutCart() GET /api/auth/me と GET /api/cart、<br/>checkoutRequest.current を作る (詳細図 3 と同じ)
    Shop->>Http: api.checkout(checkoutRequest.current)
    Note right of Http: authFetch() の GET /api/auth/csrf は図では省略
    Http->>OrderCtrl: POST /api/orders
    Note right of OrderCtrl: @Valid と CartSessionResolver.resolve() は<br/>詳細図 3 と同じ。図では省略
    OrderCtrl->>Checkout: placeOrder(cartId, input)
    Checkout->>Repo: CartRepository.findLocked()、<br/>OrderRepository.findByCartIdAndRequestIdOrderByStoreIdAsc()
    Repo-->>Checkout: CartEntity、同じ requestId の注文
    Checkout->>Gateway: enabled()
    Gateway-->>Checkout: 秘密鍵 (sk_test_ か rk_test_) と whsec_ がそろっているか
    alt 7f カード決済が使えない
        Checkout--xErrs: throw ApiException(409, CARD_PAYMENT_UNAVAILABLE)
        Errs-->>Http: business() が 409 と message を返す
        Http--xShop: throw ApiError(409)
        Shop->>Shop: setError(message)、checkoutRequest.current を null にする
        Shop->>Http: refresh() GET /api/cart、<br/>GET /api/products、GET /api/orders
        Http-->>Shop: 最新のカートほか
        Shop-->>Cart: shop.error
        Cart-->>User: 「カード決済は現在使えません。<br/>店頭払いを選んでください。」
    else 確定できる
        Note over User,Stripe: 代替フロー 5a-4 支払い待ちの注文を保存する
        Note over Checkout,Db: ロックと確認 (7a〜7e、7g) は詳細図 3 と同じ。図では省略
        Checkout->>Repo: PaymentRepository.saveAndFlush(new PaymentEntity)<br/>状態 PENDING、金額は全注文の合計
        Repo->>Db: INSERT (payments)
        Db-->>Repo: OK
        Repo-->>Checkout: PaymentEntity
        loop 店舗ごとに placeStoreOrder()
            Checkout->>Checkout: order.awaitPayment(paymentId)<br/>状態 PENDING_PAYMENT
            Checkout->>Repo: OrderRepository.save(order)
            Repo-->>Checkout: OrderEntity
            Note right of Checkout: 通知はここでは送らない (支払いの成功で送る)。<br/>在庫の減算と OrderItemRepository.save() は詳細図 3 と同じ
        end
        Checkout->>Repo: CartItemRepository.deleteAll(items)
        Repo-->>Checkout: 戻る
        Checkout->>Checkout: cart.incrementRevision()
        Checkout-->>OrderCtrl: CheckoutResult (orders、payment の clientSecret は null)
        Note over Checkout,Db: placeOrder() が戻るときにコミットする
        OrderCtrl->>PaySvc: start(result)
        Note over PaySvc,Stripe: start() はトランザクションの外。Stripe を呼ぶ間は DB のロックを持たない
        PaySvc->>Repo: PaymentRepository.findById(id)
        Repo-->>PaySvc: PaymentEntity (PENDING)
        Note right of PaySvc: PaymentIntent の ID が保存済みなら<br/>createIntent() の代わりに retrieveIntent() を呼ぶ
        PaySvc->>Gateway: createIntent(paymentId, requestId, amountYen)
        Gateway->>Stripe: paymentIntents().create(params)<br/>Idempotency-Key は requestId、metadata.payment_id
        alt 5f Stripe との通信に失敗した
            Stripe--xGateway: StripeException
            Gateway--xErrs: throw ApiException(502, PAYMENT_PROVIDER_ERROR)
            Errs-->>Http: business() が 502 と message を返す
            Http--xShop: throw ApiError(502)
            Shop->>Shop: setError(message)、checkoutRequest.current は残す
            Shop-->>Cart: shop.error (カートは取り直さない)
            Cart-->>User: 「カード決済の処理に失敗しました。<br/>時間をおいてもう一度お試しください。」
            Note over User,Stripe: 注文は支払い待ちのまま。もう一度押すと同じ checkoutRequest を送り、placeOrder() が保存済みの注文と決済を返し、<br/>start() が同じ Idempotency-Key で PaymentIntent を作り直す (5a-5 へ)。押さなければ 5e (詳細図 6)
        else 作れた
            Stripe-->>Gateway: PaymentIntent (id、client_secret)
            Gateway-->>PaySvc: Intent
            PaySvc->>Repo: separate (REQUIRES_NEW) の中で<br/>PaymentRepository.lock(id) と attachIntent(intentId)
            Repo->>Db: SELECT ... FOR UPDATE、UPDATE (payments)
            Db-->>Repo: コミット
            Repo-->>PaySvc: 戻る
            PaySvc-->>OrderCtrl: CheckoutResult (payment に clientSecret)
            OrderCtrl-->>Http: 200 CheckoutResult
            Http-->>Shop: result
            Shop->>Shop: checkoutRequest.current を null にし、<br/>setPendingPayment(orders、payment)
            Shop->>Http: refresh() GET /api/cart、<br/>GET /api/products、GET /api/orders
            Http-->>Shop: 空のカートほか
            Shop-->>Cart: shop.pendingPayment
            Cart-->>User: CardPaymentStep (CardPayment.jsx) を表示 (詳細図 5)
        end
    end
```

### 詳細図 5 代替フロー 5a-5〜5a-7、5a-9、5b、5c-2、5d（画面での支払いと結果の確認）

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as Cart.jsx
        participant Card as CardPayment.jsx
        participant StripeJs as Stripe.js<br/>Payment Element
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant WfCtrl as OrderWorkflow<br/>Controller
        participant WfSvc as OrderWorkflow<br/>Service
        participant Repo as 各 Repository
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe API
    end

    Note over User,Stripe: 代替フロー 5a-5 「カードでのお支払い」画面を表示する
    Cart->>Card: CardPaymentStep (pending、onAccepted は acceptCardOrders)
    Card->>StripeJs: stripe() が loadStripe(stripePublishableKey) を 1 回だけ呼ぶ
    StripeJs->>Stripe: Stripe.js を読み込む
    Stripe-->>StripeJs: Stripe.js
    StripeJs-->>Card: Stripe
    Card->>StripeJs: Elements (clientSecret、locale ja) と PaymentElement
    StripeJs-->>User: カード情報の入力欄
    Card-->>User: 「カードでのお支払い」、お支払い金額<br/>(受取店舗ごとの注文 N 件の合計)、「(金額)を支払う」

    Note over User,Stripe: 代替フロー 5a-6〜5a-7 カード情報を入力して支払う
    User->>StripeJs: カード情報を入力する
    User->>Card: 「(金額)を支払う」をクリック
    Card->>Card: pay(event) が setPhase('paying')
    Card->>StripeJs: stripeApi.confirmPayment(elements、redirect は if_required)
    StripeJs->>Stripe: カード情報を送って支払う<br/>(このサイトのサーバーを通らない)
    Stripe-->>StripeJs: 結果
    StripeJs-->>Card: result
    alt 5b result.error.type が validation_error
        Card->>Card: setError(message)、setPhase('input')
        Card-->>User: Stripe のエラーメッセージ。入力し直せる (5a-6 へ)
    else その他の result.error (記述にない)
        Card->>Card: setError(message)、setPhase('input')
        Card-->>User: Stripe のエラーメッセージ。もう一度押せる
    else 5c result.error.type が card_error
        Card->>Card: setError(message)、setPhase('confirming')
        Card-->>User: Stripe のエラーメッセージと「支払いを確認しています」
    else result.error がない
        Card->>Card: setPhase('confirming')
        Card-->>User: 「支払いを確認しています」
    end

    Note over User,Stripe: 代替フロー 5a-9、5c-2、5d 注文の状態を確かめる (Stripe からの通知の処理は詳細図 6)
    Card->>Card: phase が confirming になると useEffect が poll() を始める
    loop pollIntervalMs (1.5 秒) ごと、pollLimitMs (90 秒) まで
        Card->>Http: 注文ごとに request('/orders/{id}') を Promise.all で送る
        Http->>WfCtrl: GET /api/orders/{id}
        WfCtrl->>WfSvc: buyerOrder(id)
        Note over WfSvc,Db: @Transactional(readOnly = true)。AuthService.requireBuyer() で<br/>購入者を確かめ、ほかの会員の注文なら 404 ORDER_NOT_FOUND
        WfSvc->>Repo: OrderRepository.findById(id)
        Repo->>Db: SELECT (orders)
        Db-->>Repo: 行
        Repo-->>WfSvc: OrderEntity
        Note right of WfSvc: view() が OrderResponseMapper.toView() で<br/>明細、決済、返金、店舗を読む。図では省略
        WfSvc-->>WfCtrl: OrderView
        WfCtrl-->>Http: 200 OrderView (status、paymentStatus)
        Http-->>Card: orders
        Note right of Card: 通信に失敗したら、次の回でやり直す
    end
    alt 5a-9 すべての注文の status が ACCEPTED
        Card->>Shop: onAccepted(orders) で acceptCardOrders()
        Shop->>Shop: setPendingPayment(null)、setLastOrders(accepted)
        Shop->>Http: refresh() GET /api/cart、<br/>GET /api/products、GET /api/orders
        Http-->>Shop: 最新のカートほか
        Shop-->>Cart: shop.lastOrders
        Cart-->>User: 「注文を保存しました」画面 (基本フロー 9)<br/>「カードでのお支払いを確認しました<br/>（テストモードのため実際の請求はありません）。」
    else 5c-2 CANCELLED の注文がある
        Card->>Card: setPhase('cancelled')
        Card-->>User: 「お支払いができなかったため、注文を取り消しました。<br/>商品の在庫は元に戻しています。」と「商品を探す」
    else 5d 90 秒を過ぎた
        Card->>Card: setPhase('slow')
        Card-->>User: 「お支払いの確認に時間がかかっています。<br/>注文の状態は購入履歴で確認できます。」と「購入履歴を開く」
    end
```

### 詳細図 6 代替フロー 5a-8、5c-1、5e（Stripe からの通知と時間切れ）

```mermaid
sequenceDiagram
    box rgba(180,120,20,0.12) 外部サービス
        participant Stripe as Stripe API
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant PayCtrl as Payment<br/>Controller
        participant Gateway as StripeGateway
        participant Webhook as StripeWebhook<br/>Service
        participant PaySvc as PaymentService
        participant Stock as StockReturn
        participant Notice as Notification<br/>Service
        participant Job as PaymentExpiryJob
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over Stripe,Db: 代替フロー 5a-8、5c-1 Stripe からの通知を受ける
    Stripe->>PayCtrl: POST /api/payments/stripe/webhook (Stripe-Signature)
    Note right of PayCtrl: 会員の認証と CSRF の対象外 (AuthConfiguration)。<br/>本文は 512 KB まで読む
    PayCtrl->>Gateway: signatureValid(payload, header)
    Gateway-->>PayCtrl: 署名が正しいか (時刻のずれは 5 分まで)
    Note right of PayCtrl: 署名が正しくない、JSON でない、想定外の通知なら<br/>400 INVALID_WEBHOOK で何もしない。図では省略
    PayCtrl->>Webhook: handle(event)
    Note over Webhook,Db: @Transactional handle() の終わりまで。失敗したら記録ごと取り消し、Stripe の再送で処理し直す
    Webhook->>Db: jdbc.update(INSERT IGNORE INTO stripe_events)
    Db-->>Webhook: 1 行 (0 行なら処理済みの通知なので false を返す)
    alt 5a-8 payment_intent.succeeded
        Webhook->>PaySvc: succeeded(object)
        PaySvc->>Repo: PaymentRepository.lockByIntent(intentId)、<br/>無ければ lock(metadata.payment_id)
        Repo->>Db: SELECT ... FOR UPDATE (payments)
        Db-->>Repo: 行
        Repo-->>PaySvc: PaymentEntity
        PaySvc->>PaySvc: attachIntent()、payment.succeed() (SUCCEEDED)
        PaySvc->>Repo: OrderRepository.lockByPayment(paymentId)
        Repo->>Db: SELECT ... FOR UPDATE (orders) 注文 ID の順
        Db-->>Repo: 行
        Repo-->>PaySvc: OrderEntity のリスト
        loop 注文ごと
            PaySvc->>PaySvc: order.acceptPayment()<br/>PENDING_PAYMENT から ACCEPTED へ
            PaySvc->>Notice: send(購入者, ORDER, 「ご注文を受け付けました」)
            Notice-->>PaySvc: 保存して戻る
            PaySvc->>Notice: toStore(storeId, ORDER, 「新しい注文が届きました」)
            Notice-->>PaySvc: 店舗の会員ごとに保存して戻る
        end
        Note right of PaySvc: 時間切れなどで取り消した後に成功が届いたときは、<br/>注文を取り消したまま RefundService.refundCancelledOrder() で<br/>全額を返金し、「お支払いを返金します」を通知する。図では省略
        PaySvc-->>Webhook: 戻る
    else 5c-1 payment_intent.payment_failed
        Webhook->>PaySvc: failed(object)
        PaySvc->>Repo: lockByIntent() か lock() (上と同じ)
        Repo-->>PaySvc: PaymentEntity
        PaySvc->>PaySvc: cancelUnpaid(payment, FAILED)
        Note right of PaySvc: cancelUnpaid() の中は下の 5e と同じ。<br/>通知の本文は「お支払いができなかったため、<br/>注文を取り消しました。」
        PaySvc-->>Webhook: 戻る
    end
    Note right of Webhook: refund.created などの返金の通知は EC-S13 の範囲。<br/>そのほかの通知は記録するだけ。図では省略
    Webhook-->>PayCtrl: true
    PayCtrl-->>Stripe: 200 received、processed

    Note over Stripe,Db: 代替フロー 5e 支払い待ちのまま 30 分が過ぎた
    loop @Scheduled で 1 分ごと (起動の 10 秒後から)
        Job->>Repo: PaymentRepository.findPendingBefore(今 - 30 分)
        Repo->>Db: SELECT (payments) PENDING で古いもの
        Db-->>Repo: 行
        Repo-->>Job: 決済の ID のリスト
        loop 決済ごと (失敗しても次へ進む)
            Job->>PaySvc: expire(paymentId)
            Note over PaySvc,Db: @Transactional expire() の終わりまで
            PaySvc->>Repo: PaymentRepository.lock(paymentId)
            Repo-->>PaySvc: PaymentEntity
            PaySvc->>PaySvc: cancelUnpaid(payment, EXPIRED)<br/>支払い待ちでなければ何もしない。payment.close(EXPIRED)
            PaySvc->>Repo: OrderRepository.lockByPayment(paymentId)
            Repo-->>PaySvc: OrderEntity のリスト
            PaySvc->>Stock: restock(orderIds)
            Stock->>Repo: OrderItemRepository.findAllForOrder()、<br/>InventoryRepository.lockAll() 商品 ID の順
            Repo-->>Stock: 明細、在庫
            Stock->>Stock: stock.setQuantity(在庫 + 数量)
            Stock-->>PaySvc: 戻る
            PaySvc->>PaySvc: order.cancelUnpaid() (CANCELLED)
            PaySvc->>Notice: send(購入者, ORDER, 「ご注文を取り消しました」)<br/>本文は「お支払いの期限が過ぎたため、…」
            Notice-->>PaySvc: 保存して戻る
            Note right of PaySvc: PaymentIntent の ID があれば AfterCommit.run() で、<br/>コミットの後に cancelIntent() を呼ぶように登録する
            PaySvc->>Gateway: コミットの後に cancelIntent(intentId)
            Gateway->>Stripe: paymentIntents().cancel(intentId)
            Stripe-->>Gateway: 結果 (失敗はログに残すだけ)
            Gateway-->>PaySvc: 戻る
            PaySvc-->>Job: 戻る
        end
    end
```

## ユースケース記述との差

- 7a と 7b は、確認画面を開いた後の変更では起きません。`useShop.js` の `checkout()` は、送る直前に `GET /api/cart` でカートを取り直し、その `revision` と `totalYen` で注文の要求を作ります。そのため、確認画面を開いた後に別の画面でカートや価格が変わっても、最新の内容と価格で注文が保存されます（表示中のカートは送る直前に最新に置き換わります）。409 `CART_CHANGED` と 409 `PRICE_CHANGED` になるのは、取り直しから `POST /api/orders` までの間に変わったときと、503 や通信の失敗の後の再試行で前の注文の要求をそのまま送ったときです。
- 7c の文は 2 種類あります。カート全体の確認（`canCheckout`）で止まると「在庫が変更されました。数量を変更してください。」、店舗ごとの保存の中の在庫の確認で止まると「在庫が変更されました。もう一度確認してください。」です。記述は前者だけです。
- 7e のエラーコードは 7c と同じ `OUT_OF_STOCK` です。文は記述と同じ「購入できない商品があります。カートを確認してください。」です。
- 7d-3 で購入者が商品を削除する前に、取り直しの `GET /api/cart`（`CartService.read()`）が、閉鎖済み・停止中の店舗と停止中の組織の明細をカートから外し、「（商品名）は購入できなくなったためカートから外しました。」を出します。購入者が削除する必要があるのは、閉鎖中・非公開・組織の受付停止のように一時的な理由の明細です。
- 事後条件の「失敗時は…カートの内容が維持されている」は、カードの支払いの失敗（5c）と時間切れ（5e）には当てはまりません。カードの注文は 5a-4 でカートを空にし、取り消しで戻すのは在庫だけです。
- 5c で注文を取り消したとき、画面には記述の文のほかに、Stripe のエラーメッセージも出ます。
- 5e の取り消しは 1 分ごとの定期処理（`PaymentExpiryJob`）で行うので、30 分を過ぎてから最大で約 1 分遅れます。30 分は `kusakari.ec.payment-timeout-minutes` の既定値です。
- コードにあって記述にない処理です。
  - Stripe の `confirmPayment()` が `validation_error` と `card_error` 以外のエラーを返すと、メッセージを出して入力欄に戻り、もう一度押せます。
  - 取り消した注文に後から支払いの成功が届くと、注文を取り消したまま全額を返金し、購入者に「お支払いを返金します」を通知します（`PaymentService.succeeded()`）。
  - サーバーは次の応答も返します。409 `REQUEST_REUSED`（同じ `requestId` で内容が違う）、409 `EMPTY_CART`（カートが空）、404 `CART_NOT_FOUND`、400 `INVALID_INPUT`（`CheckoutRequest` の検査）、409 `DATA_CHANGED`（`ApiErrors.conflict()`）。409 のときは画面がカートを取り直します。
  - 運営のアカウント（`ADMIN`）も購入できます（`AuthService.requireBuyer()`）。
- 基本フロー 4 の受取店舗の所在地と営業時間は、カートではなく、アプリを開いたときの `GET /api/stores` の結果（`shop.stores`）から出しています。

## 確かめられなかったこと

- Stripe.js（`loadStripe()`、Payment Element、`confirmPayment()`）の中の通信は、Kusakari のコードの外です。図の「Stripe.js を読み込む」「カード情報を送って支払う」は、`CardPayment.jsx` のコメントと ADR（`docs/decisions/2026-11-13-stripe-card-payment.md`）の記述をもとにしています。`validation_error` のときに Stripe へ通信するかは確かめていません。
- カードが断られたときに Stripe が `payment_intent.payment_failed` の通知を送ることは、Stripe の仕様です。コードで確かめたのは、その通知を受けたときの処理だけです。
- Stripe の通知が EC API に届くかは動かす環境しだいで、コードでは確かめられません。ADR の「他の PC での用意」は、開発中は Stripe CLI の `stripe listen` で通知を転送する手順を書いています。通知が届かなければ、支払っても注文受付にならず、画面は 5d になり、30 分後に 5e で取り消されます。

## 参照したコード

- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `useShop()`、`navigateFromHeader()`、`/cart` の `redirectToLogin()` と `CartPage` の表示
- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `follow()`、「カート」のリンク
- [frontend/src/components/CartPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CartPage.jsx): `CartPage`
- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Cart.jsx): `Cart`（`confirming`、`payment`、`checkoutLabel`、ボタンの `disabled`）、`OrderSummary`
- [frontend/src/components/CheckoutConfirm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CheckoutConfirm.jsx): `CheckoutConfirm`、`pickupGroups()`
- [frontend/src/components/CardPayment.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CardPayment.jsx): `CardPaymentStep`、`CardForm`、`pay()`、`poll()`、`pollIntervalMs`、`pollLimitMs`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/payment.js): `paymentMethods`、`stripePublishableKey`、`useCardAvailable()`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `refresh()`、`run()`、`initialize()`、`checkoutCart()`、`beginCheckout()`、`checkout()`、`acceptCardOrders()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession()`、`authFetch()`、`login()`、`redirectToLogin()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`、`api.cart()`、`api.checkout()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java): `checkout()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `buyer()`（`GET /api/orders/{id}`）
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `buyerOrder()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer()`、`current()`、`session()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `read()`、`view()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listingsByIds()`、`storeReason()`、`REMOVED_REASONS`、`stores()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CheckoutService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/CheckoutService.java): `placeOrder()`、`requireOpen()`、`requireNotSuspended()`、`placeStoreOrder()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/DeliveryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/DeliveryService.java): `pickupDetails()`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/StockReturn.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/StockReturn.java): `restock()`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `CheckoutRequest`、`CheckoutResult`、`CardPayment`、`CartView`、`CartLine`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `awaitPayment()`、`acceptPayment()`、`cancelUnpaid()`、`assignPickup()`、`changeRecipient()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send()`、`toStore()`
- [backend/src/main/java/jp/kusakari/ec/payment/controller/PaymentController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/controller/PaymentController.java): `config()`、`webhook()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/PaymentService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/PaymentService.java): `start()`、`succeeded()`、`failed()`、`expire()`、`cancelUnpaid()`、`lockFor()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/StripeGateway.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/StripeGateway.java): `enabled()`、`createIntent()`、`retrieveIntent()`、`cancelIntent()`、`signatureValid()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/StripeWebhookService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/StripeWebhookService.java): `handle()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/PaymentExpiryJob.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/PaymentExpiryJob.java): `expireUnpaid()`
- [backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/service/AfterCommit.java): `run()`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/entity/PaymentEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/persistence/entity/PaymentEntity.java): `succeed()`、`close()`、`attachIntent()`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/PaymentRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/PaymentRepository.java): `lock()`、`lockByIntent()`、`findPendingBefore()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked()`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByCartIdAndRequestIdOrderByStoreIdAsc()`、`lockByPayment()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `lock()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `lockShared()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findStoreReferences()`、`lockSharedSuspension()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lockAll()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`database()`、`conflict()`、`invalid()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): Webhook の CSRF の除外と認証なしの許可
- [docs/decisions/2026-11-13-stripe-card-payment.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/decisions/2026-11-13-stripe-card-payment.md): カード決済の決定（Stripe の呼び出しの時点、Webhook、時間切れ）
