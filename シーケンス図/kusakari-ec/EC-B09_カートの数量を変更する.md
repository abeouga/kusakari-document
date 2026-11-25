# EC-B09 カートの数量を変更する

- ユースケース記述: [EC-B09_カートの数量を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B09_カートの数量を変更する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーは最重要の 2a（受取店舗の在庫数を超える）だけを描き、ほかの代替フローは図の下に並べています。エラーのときの画面の後処理（`readResponse` が `ApiError` を投げる → `run` の catch でエラーの文を覚える → `refreshOnFailure` なので最新のカートを取り直す（`GET /api/cart` などの流れは EC-B08 の図と同じ）→ エラーの文と最新のカートを出す）は、図に描いていないほかのエラーでも同じです。取り直しの `GET /api/cart` にも共通代替フロー \*a・\*b が起こります。

「＋」と「−」は、どちらも `useShop` の `setQuantity()` に、1 つ増やした数量か 1 つ減らした数量を渡します。サーバーは [EC-B07](<EC-B07_商品をカートに追加する.md>) と同じ `PUT /api/cart/items/{productId}`（`CartService.updateItem()`）で、送られた数量で明細を上書きします。サーバーは数量と在庫より先に `revision` を比べます（3a）。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as カートの表示<br/>Cart<br/>(Cart.jsx)
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

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 7 に適用<br/>*a 通信に失敗した場合: 5、7 に適用

    User->>Cart: 対象商品の「＋」(「(商品名)を1個増やす」) か<br/>「−」(「(商品名)を1個減らす」) をクリック<br/>(「＋」は数量が 99 か在庫数以上、「−」は 1 以下、通信中は押せない)
    Cart->>Shop: 1 つ増やした数量か 1 つ減らした数量に書き換えるよう頼む<br/>(setQuantity(line.product.id, line.quantity ± 1))
    Shop->>Http: 明細の数量を書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する (@Valid、ItemRequest の quantity は 0〜99)。<br/>ボタンの制限で 1〜99 に収まるので通る
    Ctrl->>Resolver: 会員のカートを特定するよう頼む (resolve)<br/>中身は EC-B08 の図と同じ流れ
    Resolver-->>Ctrl: カートの ID
    Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)<br/>updateItem 全体が 1 つのトランザクション
    Svc->>CartRepo: カートの行をロックして読む (findLocked、SELECT ... FOR UPDATE carts)
    CartRepo-->>Svc: カート
    Svc->>Svc: 送られた revision と今の revision を比べる (checkRevision)
    Svc->>ItemRepo: その商品の明細を読む (findById、SELECT cart_items)
    ItemRepo-->>Svc: 今の明細
    Svc->>Catalog: 商品と、今買えるかを調べるよう頼む (listing)<br/>商品・在庫・店舗・組織を読む (findByIdIn、findAllById、<br/>SELECT products、inventory、stores、organizations)
    Catalog-->>Svc: 商品と買えない理由 (Listing)
    break 2a 送る数量が受取店舗の在庫数を超える
        Svc--xErrs: 409 OUT_OF_STOCK の例外を投げる (ApiException)
        Note over Errs,Cart: 結果: 409「受取店舗の在庫が不足しています。」を返し (business)、数量は変えない。<br/>画面: 2a-1 その文と、取り直した最新のカート。2a-2 基本フロー 1 へ戻る。
    end
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)。<br/>既にある商品なので 50 種類の上限には当たらない
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細の数量を送られた数量で上書きして保存する (save、UPDATE cart_items)
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、明細ごとの金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: カートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 カートの内容
    Http-->>Shop: カートの内容
    Shop->>Shop: カートを置き換え、成功の文を覚える<br/>(setCart、setNotice('カートを更新しました。'))
    Shop-->>Cart: 新しいカートと成功の文 (shop.cart、shop.notice)
    Cart-->>User: 3 新しい数量と金額 (lineTotalYen)、「ご請求内容」の<br/>商品小計・うち消費税・合計、「カートを更新しました。」
```

![EC-B09 シーケンス図](<images/EC-B09_カートの数量を変更する-1.png>)

図に描いていない代替フロー：2a（購入できない明細）、3a（別の操作でカートが更新されていた）

## 共通代替フローを直接書いた図

上の図の変更の通信（CSRF トークンの取得と `PUT /api/cart/items/{productId}`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。どの失敗でも `run()` は最新のカートを取り直します（`refreshOnFailure`）。その `GET /api/cart` の \*a・\*b は [EC-B08](<EC-B08_カートを確認する.md>) の「共通代替フローを直接書いた図」と同じなので、ここでは結果だけを書いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Cart as カートの表示<br/>Cart<br/>(Cart.jsx)
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

    User->>Cart: 対象商品の「＋」か「−」をクリック
    Cart->>Shop: 数量を書き換えるよう頼む (setQuantity)
    Shop->>Http: 明細の数量を書き換える通信を送る (run → api.setItem → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xShop: エラーを投げる
        Shop->>Shop: エラーの文を覚え、最新のカートを取り直す<br/>(run の catch → setError、refresh)。取り直しも失敗したら今のカートのまま
        Shop-->>Cart: エラーの文 (shop.error)
        Cart-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (変わったかは分からない)
            AuthJs-xFilter: PUT /api/cart/items/{productId}
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xShop: エラーを投げる
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す<br/>(run の catch → setError、refresh)。取り直しも失敗したら今のカートのまま
            Shop-->>Cart: エラーの文 (shop.error)
            Cart-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xShop: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)。<br/>GET /api/cart も 401 なので未ログインとして覚える (setSignedOut(true)、setCart(null))
            Shop-->>Cart: エラーの文と空のカート (shop.error、shop.cart は null)
            Cart-->>User: 「ショッピングカート」、「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」と「商品を探す」(明細は消える)
            Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/cart のログイン画面<br/>(*b-2 ログインの後はショッピングカート画面を読み込み直す。数量は変わっていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xShop: エラーを投げる (ApiError 503)
            Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)
            Shop-->>Cart: エラーの文 (shop.error)
            Cart-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/cart/items/{productId}
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)
            Svc->>Db: カートをロックして読み、商品と在庫を確かめ、<br/>明細を保存してコミットする (上の図の 12〜24)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xShop: エラーを投げる (ApiError 503)
                Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)
                Shop-->>Cart: エラーの文 (shop.error)
                Cart-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」
            else 保存した
                Db-->>Svc: 完了
                Svc-->>Ctrl: カートの内容
                Ctrl-->>Http: 200 カートの内容
                Http-->>Shop: カートの内容
                Shop-->>Cart: 新しいカートと成功の文
                Cart-->>User: 新しい数量と金額、「カートを更新しました。」
            end
        end
    end
    opt *a-3 やり直す (*a-2 明細と数量の表示は残る。再取得のボタンはない)
        User->>Cart: もう一度「＋」か「−」をクリック (この図の 1 へ戻る)
    end
```

![EC-B09 共通代替フローを直接書いた図](<images/EC-B09_カートの数量を変更する-2.png>)

## ユースケース記述との差

- 2a-1 は「変更前の内容を維持する」ですが、コードはどの失敗でも `refresh()` で最新のカートを取り直して表示します。数量は保存されていないので、ほかの操作がなければ表示は変更前と同じです。
- 記述にない処理です。一時的に購入できない明細（EC-B08 の 2c）でも「＋」「−」は押せます（`disabled` は数量と在庫と `busy` だけで決まる）。押すとサーバーは 409 `PRODUCT_ARCHIVED`「この商品は販売を終了しています。カートから削除してください。」を返します。理由が一時的なもの（非表示、公開停止、閉鎖中など）でも「販売を終了しています」と出ます。
- 記述にない処理です。在庫不足の明細（EC-B08 の 2d、数量が在庫数より多い）では「＋」は押せず、「−」で 1 つ減らしても在庫数を超えている間は 409 `OUT_OF_STOCK`「受取店舗の在庫が不足しています。」になります。数量が在庫数より 2 つ以上多いと「−」では減らせず、削除（EC-B10）だけができます。
- 2a の「数量が無効」は、画面のボタンの制限（1〜99 と在庫数）で起こらないので、図に書いていません。サーバーの入力の検査（`ItemRequest` の `@Min(0)`・`@Max(99)`、違反なら 400 `INVALID_INPUT`）はあります。
- サーバーの検査の順番は記述と逆です。記述は 2（数量と在庫の検証）のあとに 3（保存）ですが、サーバーは最初に `checkRevision()` で `revision` を比べ（3a の 409 `CART_CHANGED`）、そのあとで商品と在庫を検査します（2a）。
- 3a の「保存に失敗した場合」には、共通代替フロー \*a の DB の失敗（503 `DATABASE_UNAVAILABLE`）も入ります。画面の動き（エラーの文を出して `refresh()`）は同じです。`ApiErrors.conflict()` の 409 `DATA_CHANGED` も同じ扱いになりますが、カートの行をロックしてから書くので、起こる場面は確かめていません。
- 共通代替フロー \*a で `PUT` の応答だけが届かなかった場合、サーバーでは変更が確定していることがあります。取り直しにも失敗して古いカートのままもう一度押すと、古い `revision` を送るので 409 `CART_CHANGED` になり、最新のカートを取り直します。
- \*b でログインが切れたときは、取り直しの `GET /api/cart` も 401 になり、`useShop` がカートを忘れるので、ショッピングカート画面の明細が消えてエラーの文と「商品を探す」だけになります。
- 記述にない処理です。「うち消費税」はサーバーから受け取らず、画面が `Math.floor(totalYen × 10 / 110)` で計算します。

## 参照したコード

- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Cart.jsx): 「＋」「−」ボタンの `disabled` と `onClick`、「ご請求内容」、`shop.notice` と `shop.error` の表示、カートを読めないときの表示
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `setQuantity`、`run`（`refreshOnFailure`）、`refresh`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `api.setItem`、`api.cart`、`request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem`、`checkRevision`、`requireLockedCart`、`view`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart`、`findById`・`save`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing`、`Listing.purchasable`、`unavailableReason`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`conflict`、`database`
