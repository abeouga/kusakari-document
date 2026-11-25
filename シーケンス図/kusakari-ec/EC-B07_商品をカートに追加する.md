# EC-B07 商品をカートに追加する

- ユースケース記述: [EC-B07_商品をカートに追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B07_商品をカートに追加する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーは最重要の 4a（受取店舗の在庫数を超える）だけを描き、ほかの代替フローは図の下に並べています。4a のときの画面の後処理（`readResponse` が `ApiError` を投げる → `run` の catch でエラーの文を覚える → `refreshOnFailure` なので最新のカートを取り直す（`GET /api/cart` などの流れは EC-B08 の図と同じ）→ ダイアログか商品一覧の上にエラーの文を出す）は、図に描いていないほかの 4a でも同じです。取り直しの `GET /api/cart` にも共通代替フロー \*a・\*b が起こります。

「カートに追加」と商品一覧の「＋」は、どちらも `useShop` の `add()` を呼びます。`add()` は、画面が持っているカートの数量に追加する数量を足し、その合計を `PUT /api/cart/items/{productId}` で送ります。サーバーは送られた数量で明細を上書きします。カートは画面を開いたときに読み込み済みです（[EC-B08](<EC-B08_カートを確認する.md>) の図と同じ流れ）。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as アプリの枠<br/>App<br/>(App.jsx)
        participant Detail as 「植物について」ダイアログ<br/>ProductDetail<br/>(ProductDetail.jsx)
        participant Card as 商品カード<br/>ProductCard<br/>(ProductCard.jsx)
        participant Shop as 買い物の状態<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Resolver as カートの特定<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant Svc as カートの処理<br/>CartService<br/>(CartService.java)
        participant Catalog as 商品の販売状態<br/>CatalogService<br/>(CatalogService.java)
        participant CartRepo as カートの読み書き<br/>CartRepository<br/>(CartRepository.java)
        participant ItemRepo as 明細の読み書き<br/>CartItemRepository<br/>(CartItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 12 に適用<br/>*a 通信に失敗した場合: 10、12 に適用

    alt 1a 商品一覧から追加する
        User->>Card: 1a-1 商品カードの「＋」(「(商品名)をカートに追加」) をクリック
        Card->>Shop: 1a-2 商品を 1 点追加するよう頼む (onAdd → CatalogProducts.jsx の onAdd(product.id)<br/>→ Catalog.jsx の shop.add(product.id)、quantity は既定の 1)。基本フロー 4 へ
    else 「植物について」ダイアログから追加する
        User->>Detail: 「購入数量」欄に数量を入力
        Detail-->>User: 数量を覚え (setQuantity)、「カートに追加」を押せるようにする<br/>(maxQuantity は在庫数と 99 の小さいほう。2a 整数でない、1 未満、<br/>maxQuantity を超える、在庫が 0 なら押せない。通信しない。2a-2 基本フロー 1 へ戻る)
        User->>Detail: 「カートに追加」をクリック
        Detail->>Shop: 商品をカートに追加するよう頼む<br/>(onAdd(quantity) → App.jsx の shop.add(detail.id, quantity))
    end
    Shop->>Shop: 送る数量を決める (cart.items から今の数量を探し、<br/>今の数量 + 追加する数量で setQuantity)
    Shop->>Http: 明細の数量を書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する<br/>(@Valid、ItemRequest の quantity は 0〜99、revision は 0 以上)
    Ctrl->>Resolver: 会員のカートを特定するよう頼む (resolve)<br/>中身は EC-B08 の図と同じ流れ
    Resolver-->>Ctrl: カートの ID
    Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)<br/>updateItem 全体が 1 つのトランザクション
    Svc->>CartRepo: カートの行をロックして読む (findLocked、SELECT ... FOR UPDATE carts)
    CartRepo-->>Svc: カート
    Svc->>Svc: 送られた revision と今の revision を比べる (checkRevision)
    Svc->>ItemRepo: その商品の明細を読む (findById、SELECT cart_items)
    ItemRepo-->>Svc: 明細 (なければなし)
    Svc->>Catalog: 商品と、今買えるかを調べるよう頼む (listing)<br/>商品・在庫・店舗・組織を読む (findByIdIn、findAllById、<br/>SELECT products、inventory、stores、organizations)
    Catalog-->>Svc: 商品と買えない理由 (Listing)
    break 4a 送る数量が受取店舗の在庫数を超える
        Svc--xErrs: 409 OUT_OF_STOCK の例外を投げる (ApiException)
        Note over Errs,Detail: 結果: 409「受取店舗の在庫が不足しています。」を返す (business)。<br/>画面: 4a-1 最新のカートを取り直し、その文を出す (追加しない)。4a-2 基本フロー 1 へ戻る。
    end
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細を保存する (save、INSERT か UPDATE cart_items)<br/>カートになければ明細を作り、あれば数量を送られた数量で上書きする
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、明細ごとの金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: カートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 カートの内容
    Http-->>Shop: カートの内容
    Shop->>Shop: カートを置き換え、成功の文を覚える<br/>(setCart、setNotice('カートを更新しました。'))
    alt ダイアログから追加した
        Shop-->>Detail: 成功の文 (shop.notice)
        Detail-->>User: 5 ダイアログに「カートを更新しました。」
    else 1a 商品一覧から追加した
        Shop-->>App: 成功の文 (shop.notice)
        App-->>User: 5 トーストに「カートを更新しました。」と「カートを見る」
    end
```

![EC-B07 シーケンス図](<images/EC-B07_商品をカートに追加する-1.png>)

図に描いていない代替フロー：1b（未ログイン）、4a（数量が 99 を超える、販売を終了した、カートが 50 種類）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の追加の通信（CSRF トークンの取得と `PUT /api/cart/items/{productId}`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。どの失敗でも `run()` は最新のカートを取り直します（`refreshOnFailure`）。その `GET /api/cart` の \*a・\*b は [EC-B08](<EC-B08_カートを確認する.md>) の「共通代替フローを直接書いた図」と同じなので、ここでは結果だけを書いています。画面にエラーの文を出す所は、「植物について」ダイアログから追加したときは `ProductDetail`、商品一覧の「＋」から追加したときは `Catalog` です。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Detail as 「植物について」ダイアログ<br/>ProductDetail<br/>(ProductDetail.jsx)
        participant List as 商品一覧<br/>Catalog<br/>(Catalog.jsx)
        participant Shop as 買い物の状態<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant Svc as カートの処理<br/>CartService<br/>(CartService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Detail: 「カートに追加」をクリック (または商品一覧の「＋」)
    Detail->>Shop: 商品をカートに追加するよう頼む (onAdd → shop.add)
    Shop->>Http: 明細の数量を書き換える通信を送る (run → api.setItem → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xShop: エラーを投げる
        Shop->>Shop: エラーの文を覚え、最新のカートを取り直す<br/>(run の catch → setError、refresh)。取り直しも失敗したら今のカートのまま
        Shop-->>Detail: エラーの文 (shop.error)
        Detail-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (追加されたかは分からない)
            AuthJs-xFilter: PUT /api/cart/items/{productId}
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xShop: エラーを投げる
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す<br/>(run の catch → setError、refresh)。取り直しも失敗したら今のカートのまま
            Shop-->>Detail: エラーの文 (shop.error)
            Detail-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xShop: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)。<br/>GET /api/cart も 401 なので未ログインとして覚える (setSignedOut(true)、setCart(null))
            Shop-->>Detail: エラーの文 (shop.error)
            Detail-->>User: 「ログインの有効期限が切れました。もう一度ログインしてください。」
            Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
            alt ログインする
                User->>Notice: 「ログインする」をクリック
                Notice->>AuthJs: ログイン画面へ移る (login)
                AuthJs-->>User: /account/login?returnTo=今の URL のログイン画面<br/>(*b-2 ログインの後は元の画面を読み込み直す。カートは変わっていない)
            else 閉じる
                User->>Notice: 「閉じる」をクリック
                Notice-->>User: お知らせを消す (setExpired(false))。<br/>もう一度追加すると、signedOut が真なので記述の 1b と同じくログイン画面へ移る
            end
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xShop: エラーを投げる (ApiError 503)
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)
            Shop-->>Detail: エラーの文 (shop.error)
            Detail-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)
            Svc->>Db: カートをロックして読み、商品と在庫を確かめ、<br/>明細を保存してコミットする (上の図の 17〜29)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xShop: エラーを投げる (ApiError 503)
                Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)
                Shop-->>Detail: エラーの文 (shop.error)
                Detail-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」
            else 保存した
                Db-->>Svc: 完了
                Svc-->>Ctrl: カートの内容
                Ctrl-->>Http: 200 カートの内容
                Http-->>Shop: カートの内容
                Shop-->>Detail: 新しいカートと成功の文
                Detail-->>User: 「カートを更新しました。」
            end
        end
    end
    opt *a-3 やり直す (*a-2 ダイアログは開いたまま、「購入数量」欄の値も残る)
        alt ダイアログから追加していた
            User->>Detail: もう一度「カートに追加」をクリック (この図の 1 へ戻る)
        else 1a 商品一覧から追加していた
            User->>List: エラーの文の横の「再読み込み」をクリック
            List->>Shop: カートと商品を読み直す (shop.initialize)。<br/>そのあと、もう一度「＋」をクリック
        end
    end
```

![EC-B07 共通代替フローを直接書いた図](<images/EC-B07_商品をカートに追加する-2.png>)

## ユースケース記述との差

- 4a のメッセージが記述と違います。記述の「追加すると商品数量の上限99点を超えます。」「カートの商品種類の上限50種類を超えます。」「販売終了または商品が見つかりません。」は、`CartService.addShoppingItems()`（[EC-B25](<../../アーカイブ/ユースケース/kusakari-ec/EC-B25_買い物リストから商品をカートに追加する.md>) の経路）の文言です。この経路（`CartService.updateItem()`）では次のとおりです。
  - 合計が 99 点を超える: `ItemRequest` の `@Max(99)` に違反し、`ApiErrors.invalid()` が 400 `INVALID_INPUT`「入力内容・文字数・数値の範囲を確認してください。」を返します。
  - 50 種類を超える: 400 `CART_LIMIT`「カートは50種類までです。」
  - 購入できない商品: 409 `PRODUCT_ARCHIVED`「この商品は販売を終了しています。カートから削除してください。」
  - 在庫不足の「受取店舗の在庫が不足しています。」（409 `OUT_OF_STOCK`）だけは記述と同じです。
- 記述の 4a の「商品が見つかりません」に当たる 404 `PRODUCT_NOT_FOUND`（`CatalogService.listing()`）は図に書いていません。商品はコードの中で行を消さない（論理削除だけ）ので、画面に出した商品で 404 になることはありません。
- 2a の検証は、ダイアログに入力した数量だけを `min(99, product.stock)` と比べます。カートにすでにある数量は足しません。足した合計が在庫数か 99 点を超えることは、サーバーの 4a で初めて分かります。
- 記述にない処理です。既にある商品への「加算」は、ブラウザーの `useShop.add()` が画面のカートの数量に足して行います。サーバーは送られた数量で明細を上書きします。画面のカートが古いと、サーバーは `revision` の違いで 409 `CART_CHANGED`「別の操作でカートが更新されました。最新の内容を確認してください。」を返します。記述の 4a にはこの場合がありません。
- サーバーの検査の順番は、`revision`（409 `CART_CHANGED`）、購入できるか（409 `PRODUCT_ARCHIVED`）、在庫（409 `OUT_OF_STOCK`）、種類数（400 `CART_LIMIT`）です。99 点の上限（400 `INVALID_INPUT`）は、それより前に Controller の入力の検査で見ます。
- 記述にない処理です。4a でも共通代替フローでも、`run()` は `refreshOnFailure` が true なので、`refresh()` で `GET /api/cart`、`GET /api/products`、`GET /api/orders` を送って画面のデータを取り直します。
- 共通代替フロー \*a で `PUT` の応答だけが届かなかった場合、サーバーでは追加が確定していることがあります。取り直しに成功すれば画面のカートに出ます。取り直しにも失敗して古いカートのままもう一度追加すると、古い `revision` を送るので 409 `CART_CHANGED` になり、二重には加算されません。
- \*b でログインが切れたときは、取り直しの `GET /api/cart` も 401 になり、`useShop` は未ログイン（`signedOut`）に変わってカートを忘れます。お知らせの「閉じる」を選んでも、次の追加は 1b と同じくログイン画面へ移ります。
- 1b は記述では商品一覧の「＋」だけです。コードでは、未ログインでも「植物について」ダイアログに「購入数量」と「カートに追加」が出ます（`canBuy` は店舗側・出店申請用のアカウントのときだけ false）。押すと同じく `login()` で「ログイン」画面へ移ります。
- 1b-2 のログインが終わると、戻り先のページを読み込み直します（パスワードのログインでは `AuthPanel.jsx` の `complete()` が `window.location.replace()` を呼びます）。「植物について」ダイアログを開いているかは URL に持たないので、ダイアログは閉じた状態に戻ります。基本フロー 1 へ戻るには、ダイアログを開き直します。
- 記述にない処理です。カートをまだ読み込めていない（`shop.cart` が null で未ログインでもない）ときに「カートに追加」を押すと、通信せずに「商品と店舗を読み込んでいます。しばらくしてから再試行してください。」を出します。商品一覧の「＋」は、このとき押せません（`Catalog.jsx` の `disabled`）。
- 店舗側・出店申請用のアカウントには「購入数量」「カートに追加」「＋」を出しません（`canBuy` が false）。事前条件が購入者のログインなので、図には書いていません。
- 事前条件は「トップ」画面、1a-1 は「メイン」画面と、同じ画面を違う名前で書いています。コードではどちらも `App.jsx` が `/` で表示する画面の `Catalog` です。

## 参照したコード

- [frontend/src/components/ProductDetail.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ProductDetail.jsx): 「購入数量」の `setQuantity`、`maxQuantity`、「カートに追加」の `disabled` と `onAdd(quantity)`、`notice` と `error` の表示
- [frontend/src/components/ProductCard.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ProductCard.jsx): 「＋」ボタンの `onAdd` と `disabled`
- [frontend/src/components/CatalogProducts.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/CatalogProducts.jsx): `onAdd(product.id)`
- [frontend/src/components/Catalog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Catalog.jsx): `onAdd={shop.add}`、`disabled` と `canBuy`、`shop.error` と「再読み込み」
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `canBuy`、`ProductDetail` の `onAdd`、トースト（「カートを見る」）、`LoginPage` の表示
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `add`、`setQuantity`、`run`（`refreshOnFailure`）、`refresh`、`signedOut`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `api.setItem`、`api.cart`、`request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`login`、`wasSignedIn`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `complete`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem`、`checkRevision`、`requireLockedCart`、`view`、`addShoppingItems`（文言の比較）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart`、`findById`・`save`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing`、`listingsByIds`、`Listing.purchasable`、`unavailableReason`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `invalid`、`business`、`database`
