# EC-B10 カートから商品を削除する

- ユースケース記述: [EC-B10_カートから商品を削除する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B10_カートから商品を削除する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フロー 2a はエラーで終わるので、分かれる所だけを描き、結果と画面は Note に文で書いています。エラーのときの画面の後処理（`readResponse` が `ApiError` を投げる → `run` の catch でエラーの文を覚える → `refreshOnFailure` なので最新のカートを取り直す（`GET /api/cart` などの流れは EC-B08 の図と同じ）→ エラーの文と最新のカートを出す）は、共通代替フローの失敗でも同じです。取り直しの `GET /api/cart` にも共通代替フロー \*a・\*b が起こります。

削除のための API はありません。ごみ箱アイコンは `useShop` の `setQuantity()` に数量 0 を渡し、[EC-B07](<EC-B07_商品をカートに追加する.md>)・[EC-B09](<EC-B09_カートの数量を変更する.md>) と同じ `PUT /api/cart/items/{productId}`（`CartService.updateItem()`）を送ります。サーバーは数量が 0 のとき、購入できるか・在庫・種類数の検査を通して明細を削除します。削除の前に確認のダイアログは出ません。

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

    User->>Cart: 対象商品のごみ箱アイコン (「(商品名)を削除」) をクリック<br/>(通信中は押せない)
    Cart->>Shop: 数量を 0 に書き換えるよう頼む (setQuantity(line.product.id, 0))
    Shop->>Http: 明細の数量を 0 に書き換える通信を送る<br/>(run → api.setItem → request、本文は { quantity: 0, revision })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/cart/items/{productId}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: 本文を検査する (@Valid、ItemRequest)。0 は @Min(0) を満たす
    Ctrl->>Resolver: 会員のカートを特定するよう頼む (resolve)<br/>中身は EC-B08 の図と同じ流れ
    Resolver-->>Ctrl: カートの ID
    Ctrl->>Svc: 明細の数量を書き換えるよう頼む (updateItem)<br/>updateItem 全体が 1 つのトランザクション
    Svc->>CartRepo: カートの行をロックして読む (findLocked、SELECT ... FOR UPDATE carts)
    CartRepo-->>Svc: カート
    Svc->>Svc: 送られた revision と今の revision を比べる (checkRevision)
    break 2a 別の操作でカートが更新されていた (revision が違う)
        Svc--xErrs: 409 CART_CHANGED の例外を投げる (ApiException)
        Note over Errs,Cart: 結果: 409「別の操作でカートが更新されました。最新の内容を確認してください。」を返し (business)、明細は残る。<br/>画面: 2a-1 その文と、取り直した最新のカート。2a-2 ユースケースを終了する。
    end
    Svc->>ItemRepo: その商品の明細を読む (findById、SELECT cart_items)
    ItemRepo-->>Svc: 今の明細
    Svc->>Catalog: 商品と、今買えるかを調べるよう頼む (listing)<br/>商品・在庫・店舗・組織を読む (findByIdIn、findAllById、<br/>SELECT products、inventory、stores、organizations)
    Catalog-->>Svc: 商品と買えない理由 (Listing)
    Svc->>Svc: 数量が 0 なので、購入できるか・在庫の検査は通る<br/>(購入できない明細や在庫不足の明細も削除できる)
    Svc->>ItemRepo: カートの全明細を読む (findAllForCart、SELECT cart_items)。<br/>数量が 0 なので 50 種類の上限の検査も通る
    ItemRepo-->>Svc: 明細のリスト
    Svc->>ItemRepo: 明細を削除する (existing.ifPresent(items::delete)、DELETE cart_items)
    Svc->>Svc: カートの revision を 1 増やし (incrementRevision)、残りの明細の金額、合計、<br/>点数、注文に進めるかを計算する (view。中身は EC-B08 の図と同じ流れ)
    Svc-->>Ctrl: 残りのカートの内容 (CartView)。updateItem の終わりにコミット
    Ctrl-->>Http: 200 残りのカートの内容
    Http-->>Shop: 残りのカートの内容
    Shop->>Shop: カートを置き換え、数量が 0 なので削除の文を覚える<br/>(setCart、setNotice('カートから削除しました。'))
    Shop-->>Cart: 新しいカートと削除の文 (shop.cart、shop.notice)
    alt 商品が残っている
        Cart-->>User: 3 更新後の明細と「ご請求内容」(商品小計、うち消費税、合計)、<br/>「カートから削除しました。」
    else 最後の商品を削除した (cart.items.length が 0)
        Cart-->>User: 3「まだ商品が入っていません。」「商品を探す」<br/>「庭に設置したものから追加」(「カートから削除しました。」は出ない)
    end
```

![EC-B10 シーケンス図](<images/EC-B10_カートから商品を削除する-1.png>)

## 共通代替フローを直接書いた図

上の図の削除の通信（CSRF トークンの取得と `PUT /api/cart/items/{productId}`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。どの失敗でも `run()` は最新のカートを取り直します（`refreshOnFailure`）。その `GET /api/cart` の \*a・\*b は [EC-B08](<EC-B08_カートを確認する.md>) の「共通代替フローを直接書いた図」と同じなので、ここでは結果だけを書いています。

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

    User->>Cart: 対象商品のごみ箱アイコンをクリック
    Cart->>Shop: 数量を 0 に書き換えるよう頼む (setQuantity(line.product.id, 0))
    Shop->>Http: 明細の数量を 0 に書き換える通信を送る (run → api.setItem → request)
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
        alt *a PUT が届かない、または応答が JSON でない (削除されたかは分からない)
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
            AuthJs-->>User: /account/login?returnTo=/cart のログイン画面<br/>(*b-2 ログインの後はショッピングカート画面を読み込み直す。明細は削除されていない)
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
            Svc->>Db: カートをロックして読み、明細を削除してコミットする<br/>(上の図の 12〜25)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xShop: エラーを投げる (ApiError 503)
                Shop->>Shop: エラーの文を覚え、最新のカートを取り直す (run の catch → setError、refresh)
                Shop-->>Cart: エラーの文 (shop.error)
                Cart-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」
            else 削除した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 残りのカートの内容
                Ctrl-->>Http: 200 残りのカートの内容
                Http-->>Shop: 残りのカートの内容
                Shop-->>Cart: 新しいカートと削除の文
                Cart-->>User: 更新後のカートと「カートから削除しました。」
            end
        end
    end
    opt *a-3 やり直す (*a-2 明細の表示は残る。再取得のボタンはない)
        User->>Cart: もう一度ごみ箱アイコンをクリック (この図の 1 へ戻る)
    end
```

![EC-B10 共通代替フローを直接書いた図](<images/EC-B10_カートから商品を削除する-2.png>)

## ユースケース記述との差

- 基本フロー 3 の「カートから削除しました。」は、最後の 1 件を削除してカートが空になったときには出ません。`useShop` は `setNotice('カートから削除しました。')` を呼びますが、`Cart.jsx` の空のカートの表示は `shop.notice` を描きません。
- 記述にない処理です。削除は数量 0 の `PUT /api/cart/items/{productId}` です。数量が 0 のときサーバーは購入できるかと在庫を検査しないので、一時的に購入できない明細（EC-B08 の 2c）や在庫不足の明細（EC-B08 の 2d）も削除できます。
- 2a の「削除エラー」は、サーバーが返した文です。画面から起こるのは、`revision` が違うときの「別の操作でカートが更新されました。最新の内容を確認してください。」（409 `CART_CHANGED`）と、共通代替フロー \*a の DB の失敗の「保存処理を完了できませんでした。時間をおいて再試行してください。」（503 `DATABASE_UNAVAILABLE`）です。どちらも、エラーの文を出して最新のカートを取り直します。
- `CatalogService.listing()` は商品の行がないと 404 `PRODUCT_NOT_FOUND` を返しますが、商品の行は消さない（論理削除だけ）ので、カートの明細の削除では起こりません。図に書いていません。
- 共通代替フロー \*a で `PUT` の応答だけが届かなかった場合、サーバーでは削除が確定していることがあります。取り直しにも失敗して古いカートのままもう一度押すと、古い `revision` を送るので 409 `CART_CHANGED` になり、最新のカートを取り直します。
- \*b でログインが切れたときは、取り直しの `GET /api/cart` も 401 になり、`useShop` がカートを忘れるので、ショッピングカート画面の明細が消えてエラーの文と「商品を探す」だけになります。

## 参照したコード

- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Cart.jsx): ごみ箱アイコンの `onClick` と `disabled`、空のカートの表示、`shop.notice` と `shop.error` の表示、カートを読めないときの表示
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `setQuantity`、`run`（`refreshOnFailure`）、`refresh`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `api.setItem`、`api.cart`、`request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `updateItem`
- [backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/dto/CommerceDtos.java): `ItemRequest`、`CartView`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `updateItem`（`quantity` が 0 の分岐）、`checkRevision`、`requireLockedCart`、`view`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart`、`findById`・`delete`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listing`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
