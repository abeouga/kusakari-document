# EC-B25 買い物リストから商品をカートに追加する

- ユースケース記述: [EC-B25_買い物リストから商品をカートに追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B25_買い物リストから商品をカートに追加する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）。Canvas API は kusakari-canvas の main（7e9a8dd、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
ダイアログを開いて買い物リストを表示するまでは [EC-B24 の図](<EC-B24_買い物リストを確認する(EC).md>) にあります。カートへの追加は `POST /api/cart/shopping-lists/{gardenId}/items` の 1 回です。画面は数量を送らず、行の key と商品 ID と 3 つの版（庭、買い物リスト、カート）だけを送ります。必要数はサーバーが Canvas から取り直します。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは描かず、図の下に並べています。4a の見送りは表示の分かれ道として描き、見送ったときの表示と「すべて選択」は Note にまとめています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Dlg as 庭に設置したものから追加<br/>GardenItems・AddFromGardenCard・ShoppingTransferNotice<br/>(GardenItemsDialog.jsx)
        participant Shop as カートの状態<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 庭の買い物リストAPI<br/>ShoppingController<br/>(ShoppingController.java)
        participant Svc as 買い物リストの処理<br/>ShoppingService<br/>(ShoppingService.java)
        participant Client as Canvas との通信<br/>CanvasShoppingClient<br/>(CanvasShoppingClient.java)
        participant Saved as EC で追加した商品<br/>SavedShoppingItems<br/>(SavedShoppingItems.java)
        participant Carts as カートの処理<br/>CartService<br/>(CartService.java)
        participant CartRepo as カートの読み書き<br/>CartRepository<br/>(CartRepository.java)
        participant Items as カートの明細の読み書き<br/>CartItemRepository<br/>(CartItemRepository.java)
        participant Cat as 商品と在庫<br/>CatalogService<br/>(CatalogService.java)
    end
    participant Db as MySQL
    box rgba(27,127,92,0.12) Canvas API FastAPI
        participant CApi as 庭と買い物リストのAPI<br/>create_app<br/>(main.py)
    end

    Note over User,CApi: 共通代替フロー<br/>*b 未ログインの場合: 9、11 に適用<br/>*a 通信に失敗した場合 (記述の 5a): 9、11 に適用

    User->>Dlg: 1 カートに追加したい商品のチェックボックスにチェックを付ける
    Dlg->>Dlg: 選んだ行の key と商品 ID を覚え、必要数を合計する<br/>(setSelection、picked、quantity)
    Dlg-->>User: 2「(必要数の合計)点をカートに追加」(押せる)
    opt 「すべて選択」
        User->>Dlg: 「すべて選択」をクリック
        Note over User,Dlg: 画面: 選べる行だけにチェックを付ける (selectAll。カートにある行と、選べない理由がある行は選ばない)
    end

    User->>Dlg: 3「n点をカートに追加」をクリック
    Dlg->>Shop: 3 つの版と、選んだ key と商品 ID を渡して、<br/>カートへの追加を頼む (add → transferShoppingList)。数量は送らない
    Shop->>Http: 処理中にしてエラーとお知らせを消し (run)、<br/>追加の通信を送る (api.transferShoppingList → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: POST /api/cart/shopping-lists/{gardenId}/items<br/>(CSRF トークンのヘッダー付き。本文は gardenRevision、<br/>listRevision、cartRevision、items の key と productId)
    Ctrl->>Ctrl: 本文を検査する (@Valid TransferRequest。items は 1〜200 件、<br/>key と productId は空でない、版は 0 以上)
    Ctrl->>Ctrl: 購入者かを確かめ、会員のカートを決める<br/>(CartSessionResolver.resolve → requireBuyer、MemberCartService.resolve)
    Ctrl->>Svc: 選んだ商品をカートに移すよう頼む (transfer)。<br/>transfer 全体が 1 つのトランザクション (READ_COMMITTED)
    Svc->>Client: Canvas から最新の配置の行を取るよう頼む (detail)。<br/>カートのロックを取る前に終える
    Client->>CApi: GET /api/gardens/{id}/shopping-list
    CApi-->>Client: 200 配置の行と庭の版 (持ち主の確かめと読み方は EC-B24 の図と同じ流れ)
    Client-->>Svc: 配置の行と庭の版
    Svc->>Saved: カートをロックし、EC で追加した商品を読むよう頼む (lockAndRead)
    Saved->>CartRepo: カートの行をロックして読む<br/>(lock → findLocked、SELECT carts … FOR UPDATE)
    Saved->>Db: EC で追加した商品を読む (read)<br/>SELECT garden_shopping_lists と garden_shopping_items、products
    Saved-->>Svc: 買い物リストの版と EC で追加した商品
    Svc->>Svc: 最新の行と候補の商品を作る (supplement、resolve。<br/>素材と商品の対応と商品・在庫の読み方は EC-B24 の図と同じ流れ)
    Svc->>Svc: 選んだ key と商品 ID を最新の行と照らし、<br/>同じ商品の必要数を合計して、追加する商品を作る (additions)
    Svc->>Carts: 必要数でカートに足すよう頼む (addShoppingItems)
    Carts->>CartRepo: カートの行をロックして読む (requireLockedCart → findLocked)<br/>SELECT carts … FOR UPDATE (同じトランザクションでロック済み)
    Carts->>Items: カートの明細を読む (findAllForCart、SELECT cart_items)
    Carts->>Cat: 4 追加する商品と在庫を読む (listingsById → listingsByIds)<br/>SELECT products、inventory、stores、organizations
    Cat-->>Carts: 商品、在庫、買えない理由 (Listing)
    loop 追加する商品ごと
        alt 4a 追加できない
            Carts->>Carts: 4a-1 見送る (skipped)。販売終了 (PRODUCT_ARCHIVED)、<br/>上限 99 点 (QUANTITY_LIMIT)、在庫不足 (OUT_OF_STOCK)、<br/>上限 50 種類 (CART_LIMIT) の順に見る
        else 追加できる
            Carts->>Items: 5 カートの数量に必要数を足して保存する (save)
        end
    end
    opt 1 つ以上追加した
        Carts->>Carts: カートの版を 1 上げる (incrementRevision)
        Note over Carts,Items: 結果: carts の revision を 1 上げる (UPDATE carts は JPA がコミットのときに送る)
    end
    Carts->>Db: 最新のカートを作るため、明細と商品を読み直す<br/>(view → findAllForCart、listingsByIds)。明細とカートの版の変更<br/>(cart_items の INSERT・UPDATE、carts の UPDATE) は JPA が送る
    Carts-->>Svc: 最新のカート、追加した商品、見送った商品 (TransferResult)
    Svc-->>Ctrl: 同じ結果。コミットしてカートのロックを外す
    Ctrl-->>Http: 200 最新のカート、庭の名前、追加した商品、見送った商品
    Http-->>Shop: 結果
    Shop->>Shop: カートと結果を覚える (setCart、setShoppingTransfer)
    Shop-->>Dlg: 結果 (run が true)
    Dlg-->>User: 6 ダイアログを閉じ、URL から garden を外す (onAdded → close)。<br/>カートの上に「(庭の名前)からn種類を追加しました。」と、<br/>追加した商品のあるカート (ShoppingTransferNotice)
    opt 4a 見送った商品がある (skipped)
        Dlg-->>User: 4a-2「n種類は追加できませんでした。」と<br/>「(商品名)：(理由)」、「庭から選び直す」
        Note over User,Dlg: 結果: 4a-3「庭から選び直す」なら URL を /cart?garden={gardenId} に変え (navigate)、同じ庭を選んだダイアログを最新の在庫で開き直す (useRequestedGarden。EC-B24 の基本フロー 5)。<br/>画面: 4a-4「結果を閉じる」なら結果の表示を消す (setShoppingTransfer(null))
    end
```

![EC-B25 シーケンス図](<images/EC-B25_買い物リストから商品をカートに追加する-1.png>)

図に描いていない代替フロー：2a（1 つも選んでいない）、4b（庭・買い物リスト・カートの版が違う）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の追加の通信（CSRF トークンの取得と `POST /api/cart/shopping-lists/{gardenId}/items`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。記述の 5a（通信に失敗した場合）は、この図の \*a に当たります。失敗のあとの `GET /api/shopping-lists/{gardenId}` の取り直しの \*a・\*b は [EC-B24](<EC-B24_買い物リストを確認する(EC).md>) の「共通代替フローを直接書いた図」と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Dlg as 庭に設置したものから追加<br/>GardenItems<br/>(GardenItemsDialog.jsx)
        participant Shop as カートの状態<br/>useShop<br/>(useShop.js)
        participant Data as 買い物リストの取得<br/>useShoppingData<br/>(useShoppingData.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 庭の買い物リストAPI<br/>ShoppingController<br/>(ShoppingController.java)
        participant Svc as 買い物リストの処理<br/>ShoppingService<br/>(ShoppingService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Dlg: 「n点をカートに追加」をクリック
    Dlg->>Shop: カートへの追加を頼む (add → transferShoppingList → run)
    Shop->>Http: 追加の通信を送る (api.transferShoppingList → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xShop: エラーを投げる
        Shop->>Shop: エラーの文を覚える (run の catch → setError)。<br/>0 なのでカートは取り直さない
        Shop-->>Dlg: 失敗 (run が false)
        Dlg->>Data: 失敗の文を出し (setFailed(true))、<br/>買い物リストを取り直す (data.reload)
        Dlg-->>User: 5a-1 *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」。5a-2 チェックは残す
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a POST が届かない、または応答が JSON でない (追加されたかは分からない)
            AuthJs-xFilter: POST /api/cart/shopping-lists/{gardenId}/items
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xShop: エラーを投げる
            Shop->>Shop: エラーの文を覚える (run の catch → setError)。<br/>0 なのでカートは取り直さない
            Shop-->>Dlg: 失敗 (run が false)
            Dlg->>Data: 失敗の文を出し (setFailed(true))、<br/>5a-2 買い物リストを取り直す (data.reload)
            Dlg-->>User: 5a-1 *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」。5a-2 チェックは残す
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: POST /api/cart/shopping-lists/{gardenId}/items
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xShop: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Shop->>Shop: エラーの文を覚える (run の catch → setError)
            Shop-->>Dlg: 失敗 (run が false)
            Dlg->>Data: 失敗の文を出し (setFailed(true))、<br/>買い物リストを取り直す (data.reload。これも 401 になる)
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=今の URL のログイン画面<br/>(*b-2 ログインの後は今の URL を読み込み直す。<br/>チェックは消え、カートは変わっていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: POST /api/cart/shopping-lists/{gardenId}/items
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xShop: エラーを投げる (ApiError 503)
            Shop->>Shop: エラーの文を覚える (run の catch → setError)
            Shop-->>Dlg: 失敗 (run が false)
            Dlg->>Data: 失敗の文を出し (setFailed(true))、<br/>買い物リストを取り直す (data.reload)
            Dlg-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」。チェックは残す
        else 要求が Controller まで届いた
            AuthJs->>Filter: POST /api/cart/shopping-lists/{gardenId}/items
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 選んだ商品をカートに移すよう頼む (transfer)
            Svc->>Db: カートをロックして読み、明細を足してコミットする<br/>(上の図の 19〜35)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xShop: エラーを投げる (ApiError 503)
                Shop->>Shop: エラーの文を覚える (run の catch → setError)
                Shop-->>Dlg: 失敗 (run が false)
                Dlg->>Data: 失敗の文を出し (setFailed(true))、<br/>買い物リストを取り直す (data.reload)
                Dlg-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」。チェックは残す
            else 追加した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 最新のカート、追加した商品、見送った商品
                Ctrl-->>Http: 200 結果
                Http-->>Shop: 結果
                Shop-->>Dlg: 結果 (run が true)
                Dlg-->>User: ダイアログを閉じ、「(庭の名前)からn種類を追加しました。」<br/>(以降は上の図の 40〜)
            end
        end
    end
    opt 5a-3 *a-3 やり直す
        User->>Dlg: 残ったチェックのまま、もう一度「n点をカートに追加」をクリック<br/>(5a-4 基本フロー 4 へ戻る。上の図の 5〜)
    end
```

![EC-B25 共通代替フローを直接書いた図](<images/EC-B25_買い物リストから商品をカートに追加する-2.png>)

## ユースケース記述との差

- コードにあって記述にない分岐が 3 つあります。入力の検査で止まる 400 `INVALID_INPUT`、選んだ key と商品 ID が最新の行と合わない 400 `INVALID_SELECTION`、カートへの追加の途中で Canvas から庭を取り直せない 404 `GARDEN_NOT_FOUND` と 503 `SHOPPING_LIST_UNAVAILABLE` です。画面はどれもエラーの文を出し、チェックを残したまま買い物リストを取り直します。404 のときは取り直しも 404 になり、「庭が見つかりません。」が出ます。
- 4b-2: 409 のうち `CART_CHANGED` では、画面はカートを取り直しますが、庭と買い物リストの版は変わらないのでチェックは残ります。記述の「庭プロジェクトか買い物リストが変わっていた場合は、選択を解除する」と同じ動きです。
- 4a: すべての商品を見送ったときも 200 で、ダイアログを閉じて「(庭の名前)から0種類を追加しました。」を出します。このときカートの版は上がりません。
- 4a: 見送りの判定は「販売終了（`PRODUCT_ARCHIVED`）→ 上限 99 点 → 在庫不足 → 上限 50 種類」の順です。在庫の判定は「カートの数量＋必要数」が在庫を超えるかです。
- 5a-1: 「選択した商品はカートに追加されていません。」が出るのは、`useShop` の `run()` がほかの操作の実行中で何もしなかったとき（エラーの文が空のとき）だけです。通信の失敗では、`api.js` の「サーバーに接続できません。接続を確認して再試行してください。」が出ます。
- 5a: 応答が届かなかったときは、サーバーで追加が済んだかが分かりません。済んでいた場合、やり直すとカートの版が変わっているので 409 `CART_CHANGED` になり、画面がカートを取り直します。同じ商品が二重に足されることはありません。
- 5a: CSRF トークンを取れないとき、`authFetch` は「操作の確認情報を取得できません。画面を再読み込みしてください。」のエラーを投げますが、`api.js` の `send()` がすべての例外を「サーバーに接続できません。…」に置き換えるので、この文は画面に出ません。
- 「結果を閉じる」は、見送りが無いときも出ます（`ShoppingTransferNotice`）。
- 関連情報の「受取店舗は商品が属する店舗」: 在庫は商品の店舗のもので判定します（`CatalogService.listingsByIds`）。

## 確かめられなかったこと

- `CartService.addShoppingItems()` の `items.save(item)` と `cart.incrementRevision()` の変更を MySQL へ送る時点（`view(cart)` の中の `findAllForCart()` の前の自動の flush か、コミットのときか）は、実行して確かめていません。図では「JPA が送る」とだけ書きました。

## 参照したコード

kusakari-ec

- [frontend/src/components/GardenItemsDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/GardenItemsDialog.jsx): `GardenItems` の `add`、`selectAll`、選択を外す `useEffect`、失敗の文、`ShoppingTransferNotice`、`AddFromGardenCard` の `close`、`useRequestedGarden`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `transferShoppingList`、`run`、`refresh`、`setShoppingTransfer`
- [frontend/src/components/useShoppingData.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/useShoppingData.js): `reload`、`load`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `api.transferShoppingList`、`api.cart`、`api.shoppingList`、`request`、`send`、`readResponse`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java): `transfer`、`detail`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingDtos.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingDtos.java): `TransferRequest`、`Selection` の検査
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java): `transfer`、`supplement`、`resolve`、`invalidSelection`
- [backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java): `lockAndRead`、`lock`、`read`
- [backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java): `detail`、`unavailable`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/CartService.java): `addShoppingItems`、`requireLockedCart`、`checkRevision`、`listingsById`、`view`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartRepository.java): `findLocked`（`PESSIMISTIC_WRITE`）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/CartItemRepository.java): `findAllForCart`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listingsByIds`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）、CSRF の検査
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`database`

kusakari-canvas

- [backend/kusakari_canvas_api/main.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/main.py): `create_app` の `shopping_list`
- [backend/kusakari_canvas_api/shopping.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/shopping.py): `detail`
