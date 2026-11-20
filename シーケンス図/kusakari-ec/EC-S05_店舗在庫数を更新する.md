# EC-S05 店舗在庫数を更新する

- ユースケース記述: [EC-S05_店舗在庫数を更新する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S05_店舗在庫数を更新する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 「商品管理」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインなら画面はログインの案内を出し、API は 401 LOGIN_REQUIRED を返す)

    Note over User,Db: 基本フロー 1〜2 商品と在庫数の一覧を表示する
    User->>Page: 出店者メニューの「商品管理」をクリック
    par 商品の一覧
        Page->>Api: GET /api/seller/products?storeId=…
        Api->>Db: 会員の所属を確かめ、店舗の削除されていない商品、<br/>在庫、店舗、組織を読む
        Db-->>Api: 行
        Api-->>Page: 200 商品の配列 (stock、publicationStatus)
    and 運営からの警告・停止
        Page->>Api: GET /api/seller/products/moderation?storeId=…
        Api->>Db: 警告の履歴と、公開停止中の商品を読む
        Db-->>Api: 行
        Api-->>Page: 200 警告・停止の配列
    end
    Page-->>User: 商品ごとの在庫数。0 なら「在庫切れ」。<br/>行ごとの「在庫を編集」

    Note over User,Db: 基本フロー 3〜7 在庫数を入力して検証する (通信しない)
    User->>Page: 対象商品の行の「在庫を編集」をクリック
    Page-->>User: 「(商品名)：変更前の在庫数 N」と「在庫数」の入力欄
    User->>Page: 新しい在庫数を入力し、「在庫を保存」をクリック
    alt 7a 空、整数でない、0〜10000 の範囲外
        Page-->>User: 「在庫は0〜10000の整数で入力してください。」<br/>在庫数は変えない。7a-2 基本フロー 5 へ戻る
    else 入力が正しい
        Note over User,Db: 基本フロー 8 在庫数を保存する
        Note right of Page: 先に GET /api/auth/csrf で<br/>CSRF トークンを取る
        Page->>Api: PUT /api/seller/products/{id}/stock<br/>storeId、expectedStock (変更前の在庫数)、stock
        Api->>Db: 会員と、店舗でのロールを読む
        Db-->>Api: 行
        alt 8b ロールがない
            Api-->>Page: 403 FORBIDDEN
        else ロールがある
            Api->>Db: 店舗と商品の店舗を確かめ、<br/>在庫の行をロックして読む
            Db-->>Api: inventory の行
            alt 商品が選択店舗にない、または削除済み (記述にない)
                Api-->>Page: 404 PRODUCT_NOT_FOUND・STORE_NOT_FOUND<br/>または 409 PRODUCT_ARCHIVED
            else 8a 在庫数が expectedStock と違う
                Api-->>Page: 409 STOCK_CHANGED
            else 在庫数が expectedStock と同じ
                Api->>Db: inventory.quantity を stock に更新し、<br/>商品を読み直す
                Db-->>Api: 完了
                Note over Api,Db: ロックから更新までが 1 つのトランザクション
                Api-->>Page: 200 更新後の商品
            end
        end
        alt 失敗の応答 (8a、8b、記述にない 404・409)
            Page->>Api: GET /api/seller/products?storeId=…
            Api-->>Page: 200 最新の商品の配列
            Page-->>User: エラーの文 (8a は「在庫数が変更されています（現在の在庫数：N）。…」、<br/>8b は「この操作の権限がありません。」) と最新の一覧。<br/>「変更前の在庫数」を最新の値にし、入力した値は残す
        else 200
            Page->>Api: GET /api/seller/products?storeId=…
            Api-->>Page: 200 最新の商品の配列
            Note right of Page: 購入者向けの商品も取り直す<br/>(GET /api/cart、GET /api/products)
            Page-->>User: 入力欄を閉じ、「在庫数を保存しました。」と<br/>更新後の在庫数の一覧
        end
    end
```

## 詳細図 1 基本フロー 1〜2

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as ProductManager<br/>ProductManager.jsx
        participant List as SellerProductList<br/>SellerProductList.jsx
        participant Cat as useSellerCatalog.js
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as SellerProduct<br/>Controller
        participant Svc as SellerProduct<br/>Service
        participant Auth as AuthService
        participant CatSvc as CatalogService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。未ログインなら Workspace.jsx が AuthPanel を出す
    Note over User,Db: 基本フロー 1〜2 商品と在庫数の一覧を表示する
    User->>Mgr: 出店者メニューの「商品管理」をクリック<br/>(Workspace.jsx が /seller/products で ProductManager を表示)
    Note right of Mgr: ロールのない店舗の ORG_ADMIN には、<br/>Workspace.jsx が ProductManager の代わりに<br/>人事の画面だけを使える旨を出す (通信しない)
    par 商品の一覧
        Mgr->>Cat: useSellerCatalog(shop)
        Note right of Cat: useEffect が storeId<br/>(shop.sellerStoreId) で自動で取得する
        Cat->>Http: api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Ctrl->>Svc: list(storeId)
        Note over Svc,Db: @Transactional(readOnly = true)。読むだけでロックしない
        Svc->>Auth: requireStoreViewer(storeId)
        Note right of Auth: current() と canManageView() で<br/>所属店舗か確かめる (中は図では省略)
        Auth-->>Svc: 戻る (見られなければ 403)
        Svc->>CatSvc: storeProducts(storeId)
        CatSvc->>Repo: StoreRepository.existsById(storeId)<br/>(requireStore)
        Repo->>Db: SELECT stores
        Db-->>Repo: 有無
        Repo-->>CatSvc: true (なければ 404 STORE_NOT_FOUND)
        CatSvc->>Repo: ProductRepository.findNotDeletedAtStore(storeId)
        Repo->>Db: SELECT products (在庫が DELETED でない商品)
        Db-->>Repo: 行
        Repo-->>CatSvc: ProductEntity のリスト
        CatSvc->>Repo: listings() の中で InventoryRepository.findAllById()、<br/>StoreRepository.findAllById()、OrganizationRepository.findAllById()
        Repo->>Db: SELECT inventory、stores、organizations
        Db-->>Repo: 行
        Repo-->>CatSvc: Entity のリスト
        CatSvc-->>Svc: ProductView のリスト (stock、publicationStatus)
        Svc-->>Ctrl: mapper.toSellerView() で変換したリスト
        Ctrl-->>Http: 200 ProductView の配列
        Http-->>Cat: result
        Cat->>Cat: setProducts(result)、setLoadedStore(storeId)
        Note right of Cat: 失敗は catch で setError(reason.message)。<br/>ProductManager が上部に出す
    and 運営からの警告・停止
        Mgr->>Hook: useResource('/seller/products/moderation?storeId=…')
        Note right of Hook: useEffect が reload() を自動で実行する
        Hook->>Http: request(path)
        Http->>Ctrl: GET /api/seller/products/moderation?storeId=…
        Note over Ctrl,Db: moderation() から ProductModerationService.noticesAt() へ。中は図では省略
        Ctrl-->>Http: 200 ProductNotice の配列
        Http-->>Hook: data
    end
    Cat-->>Mgr: catalog.products
    Hook-->>Mgr: moderation.data
    Mgr->>List: SellerProductList (products、notices、onStock は setStocking)
    List-->>User: 商品ごとの在庫数 (p.stock)。0 なら「在庫切れ」。<br/>行ごとの「在庫を編集」
```

## 詳細図 2 基本フロー 3〜7

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant List as SellerProductList<br/>SellerProductList.jsx
        participant Mgr as ProductManager<br/>ProductManager.jsx
        participant Editor as StockEditor<br/>StockEditor.jsx
    end

    Note over User,Editor: 基本フロー 3〜4 入力欄を開く (通信しない)
    User->>List: 対象商品の行の「在庫を編集」をクリック
    List->>List: setSelected([])
    List->>Mgr: onStock(p) (ProductManager の setStocking)
    Mgr->>Editor: stocking があり editing がないので<br/>StockEditor を表示 (onSave は catalog.saveStock)
    Editor->>Editor: useState で expected と stock を product.stock にする
    Editor-->>User: 「(商品名)：変更前の在庫数 N」、「在庫数」の入力欄、<br/>「在庫を保存」、「取消」

    Note over User,Editor: 基本フロー 5〜7 入力して検証する (通信しない)
    User->>Editor: 「在庫数」に新しい在庫数を入力
    Editor->>Editor: onChange で setStock(入力値)
    User->>Editor: 「在庫を保存」をクリック
    Editor->>Editor: save() が Number(stock) を検査
    alt 7a 空、整数でない、0〜10000 の範囲外
        Editor->>Editor: setError('在庫は0〜10000の整数で入力してください。')
        Editor-->>User: 「在庫は0〜10000の整数で入力してください。」<br/>在庫数は変えない。7a-2 基本フロー 5 へ戻る
    else 入力が正しい
        Editor->>Editor: setError('')
        Note right of Editor: 詳細図 3 の onSave() へ進む
    end
    Note over User,Editor: 「取消」は onDone() で ProductManager の setStocking(null) を呼び、入力欄を閉じるだけ (通信しない)
```

## 詳細図 3 基本フロー 8

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as ProductManager<br/>ProductManager.jsx
        participant Editor as StockEditor<br/>StockEditor.jsx
        participant Cat as useSellerCatalog.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as SellerProduct<br/>Controller
        participant Errs as ApiErrors
        participant Svc as SellerProduct<br/>Service
        participant Auth as AuthService
        participant CatSvc as CatalogService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 8 在庫数を保存する (詳細図 2 の検査を通ったあと)
    Editor->>Cat: onSave(product.id, expected, quantity)<br/>= saveStock(id, expectedStock, stock)
    Cat->>Cat: write(id, action, '在庫数を保存しました。')<br/>shop.setError('')、shop.setNotice('')、setError('')
    Cat->>Http: request('/seller/products/{id}/stock', 'PUT',<br/>storeId、expectedStock、stock の JSON)
    Note right of Http: send() の authFetch() (auth.js) が<br/>先に GET /api/auth/csrf でトークンを取る
    Http->>Ctrl: PUT /api/seller/products/{id}/stock
    Note right of Ctrl: @Valid StockUpdateRequest。違反は ApiErrors.invalid() の<br/>400 INVALID_INPUT。画面の 7a の検査が先に止める
    Ctrl->>Svc: updateStock(id, request)
    Note over Svc,Db: @Transactional (クラスに付く) ここからメソッドの終わりまでが 1 つのトランザクション
    Svc->>Auth: requireSeller(storeId)
    Note right of Auth: requireStoreRole(storeId, false)。<br/>current() と店舗・組織・担当を読む (図では省略)
    alt 8b ロールがない (運営が停止した店舗、店舗がないときも同じ)
        Auth--xErrs: denied() が throw ApiException(403, FORBIDDEN)
        Errs-->>Http: business() が 403 と「この操作の権限がありません。」
    else ロールがある
        Auth-->>Svc: 戻る
        Svc->>CatSvc: requireStore(storeId)
        CatSvc->>Repo: StoreRepository.existsById(storeId)
        Repo->>Db: SELECT stores
        Db-->>Repo: 有無
        Repo-->>CatSvc: 結果
        CatSvc-->>Svc: 戻る
        Svc->>Repo: requireAtStore() の中で<br/>ProductRepository.findStoreReferences([id])
        Repo->>Db: SELECT products の id、store_id
        Db-->>Repo: 行
        Repo-->>Svc: ProductStoreReference
        Svc->>Repo: InventoryRepository.lock(id)
        Repo->>Db: SELECT ... FROM inventory ... FOR UPDATE
        Db-->>Repo: 行
        Repo-->>Svc: InventoryEntity
        alt 商品が選択店舗にない、または削除済み (記述にない)
            Svc--xErrs: throw ApiException(404 PRODUCT_NOT_FOUND・STORE_NOT_FOUND<br/>または 409 PRODUCT_ARCHIVED)
            Note over Svc,Db: STORE_NOT_FOUND と requireAtStore() の PRODUCT_NOT_FOUND は<br/>ロックの前に throw する。例外でロールバックし、何も変えない
            Errs-->>Http: business() が status と message を返す
        else 8a row.getQuantity() が expectedStock と違う
            Svc--xErrs: stockChanged(現在の在庫数) が<br/>ApiException(409, STOCK_CHANGED) を作って throw
            Note over Svc,Db: 例外でロールバック。在庫数は変わらない
            Errs-->>Http: business() が 409 と「在庫数が変更されています<br/>（現在の在庫数：N）。最新の在庫数を確認して、<br/>もう一度保存してください。」
        else 同じ
            Svc->>Svc: row.setQuantity(stock)
            Svc->>CatSvc: product(id)
            CatSvc->>Repo: ProductRepository.findByIdIn([id]) と listings() の読み込み
            Repo->>Db: SELECT products、inventory、stores、organizations
            Db-->>Repo: 行
            Repo-->>CatSvc: Entity
            CatSvc-->>Svc: ProductView
            Note over Svc,Db: save() は呼ばない。変えた InventoryEntity は<br/>コミットまでに UPDATE inventory として送られる
            Svc-->>Ctrl: mapper.toSellerView() で変換した ProductView
            Ctrl-->>Http: 200 ProductView
        end
    end
    alt 失敗の応答 (8a、8b、記述にない 404・409)
        Http--xCat: readResponse() が throw ApiError(status, message)
        Cat->>Cat: catch で setError(reason.message)
        Cat->>Http: refresh() の api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Ctrl-->>Http: 200 最新の ProductView の配列 (中は詳細図 1 と同じ)
        Http-->>Cat: latest
        Cat-->>Editor: saved は false、latest は同じ ID の商品
        Editor->>Editor: setExpected(latest.stock)
        Mgr-->>User: catalog.error のエラーの文と最新の一覧。StockEditor は開いたまま、<br/>「変更前の在庫数」は最新の値、入力した値は残る<br/>(8a-2 基本フロー 5 へ戻る、8b-2 終了)
    else 200
        Http-->>Cat: ProductView
        Cat->>Http: refresh() の api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Ctrl-->>Http: 200 最新の ProductView の配列
        Http-->>Cat: result
        Note right of Cat: Promise.all で shop.refreshProducts() (useShop.js) も呼ぶ。<br/>GET /api/cart と GET /api/products で購入者向けの商品を<br/>取り直す。出店者の GET /api/cart は 403 BUYER_REQUIRED に<br/>なり、GET /api/products の結果を使う (図では省略)
        Cat->>Cat: shop.setNotice('在庫数を保存しました。')
        Cat-->>Editor: saved は true
        Editor->>Mgr: onDone() で setStocking(null)
        Mgr-->>User: 入力欄を閉じ、「在庫数を保存しました。」と<br/>更新後の在庫数の一覧
    end
```

## ユースケース記述との差

- 8a: 「在庫数の表示後に在庫が変わっていた」かどうかは、画面が送る `expectedStock`（入力欄を開いたときの在庫数）と、ロックして読んだ `inventory.quantity` を比べて決めます。違うと 409 `STOCK_CHANGED` になり、メッセージに現在の在庫数が入ります。画面は一覧を取り直し、`StockEditor` の「変更前の在庫数」を最新の値に変えます。入力した値は残ります。記述の 8a-1 と同じ動きです。
- 8b: 403 になるのはロールがないときだけではありません。`requireStoreRole()` は、運営が停止した店舗と、存在しない店舗でも 403 `FORBIDDEN` を返します。403 のあとも `StockEditor` は開いたままで、記述の 8b-2「ユースケースを終了する」のように画面が閉じることはありません。
- 8b: 「ロールなし」の 403 に届くのは、所属店舗でロールが割り当てられていない担当者（`memberRole` が `NONE`）です。この担当者は `requireStoreViewer()` を通るので、一覧と「在庫を編集」が表示されます。ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が「商品管理」画面の代わりに「(店舗名)では担当のロールがないため、人事（アカウント・招待キー）の画面だけを使えます。」を出し、通信しません。
- 記述にない失敗の応答があります。商品が選択店舗の商品でないと 404 `PRODUCT_NOT_FOUND`「選択店舗の商品が見つかりません。」、削除済みの商品だと 409 `PRODUCT_ARCHIVED`「削除済みの商品の在庫は変更できません。」です。`requireStore()` の 404 `STORE_NOT_FOUND` は、店舗がないと `requireSeller()` が先に 403 にするので、運営のアカウントのときだけ起きます。画面の動きは 8a と同じで、エラーの文を出して一覧を取り直します。
- 7a: 検査は画面（`StockEditor.save()`）とサーバー（`StockUpdateRequest` の `@Min(0)`・`@Max(10000)`、違反は 400 `INVALID_INPUT`）の両方にあります。画面の検査が先に止めるので、画面からサーバーの検査には届きません。
- 基本フロー 8: 保存に成功すると、更新後の在庫数に加えて「在庫数を保存しました。」を出し、入力欄を閉じます。記述にはメッセージと入力欄を閉じることが書かれていません。
- 基本フロー 8: 成功のあと、出店者の一覧（`GET /api/seller/products`）のほかに、`shop.refreshProducts()` が購入者向けの商品（`GET /api/cart`、`GET /api/products`）も取り直します。記述にない処理です。
- 記述にない操作として、`StockEditor` の「取消」があります。入力欄を閉じるだけで、通信しません。

## 確かめられなかったこと

- `InventoryRepository.lock()` が `SELECT … FOR UPDATE` になることは、`@Lock(PESSIMISTIC_WRITE)` から読んだものです。`row.setQuantity()` の変更が `UPDATE inventory` として送られる時点（`catalog.product(id)` の読み込みの前か、コミットのときか）は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`personnelOnly`、`/seller/products` と `ProductManager` の対応
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductManager.jsx): `ProductManager`（`stocking`、`setStocking`、`moderation`）
- [frontend/src/components/SellerProductList.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerProductList.jsx): 「在庫切れ」「在庫を編集」の表示、`onStock`
- [frontend/src/components/StockEditor.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/StockEditor.jsx): `StockEditor`、`save`、`setExpected`
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/useSellerCatalog.js): `useEffect`（一覧の取得）、`refresh`、`write`、`saveStock`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `refresh`（`refreshProducts`）、`sellerStoreId`、`setNotice`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`api.sellerProducts`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`/api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list`、`moderation`、`updateStock`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/StockUpdateRequest.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/dto/StockUpdateRequest.java): `StockUpdateRequest`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java): `list`、`updateStock`、`requireAtStore`、`notAtStore`、`stockChanged`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `storeProducts`、`product`、`listing`、`listings`、`requireStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `noticesAt`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lock`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findNotDeletedAtStore`、`findStoreReferences`、`findByIdIn`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireStoreViewer`、`canManageView`、`requireSeller`、`requireStoreRole`、`denied`、`requireBuyer`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`
