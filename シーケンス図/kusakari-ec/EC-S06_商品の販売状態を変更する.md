# EC-S06 商品の販売状態を変更する

- ユースケース記述: [EC-S06_商品の販売状態を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S06_商品の販売状態を変更する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 「商品管理」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインなら画面はログインの案内を出し、API は 401 LOGIN_REQUIRED を返す)

    Note over User,Db: 基本フロー 1〜2 商品の一覧と「公開状態」のボタンを表示する
    User->>Page: 出店者メニューの「商品管理」をクリック
    par 商品の一覧
        Page->>Api: GET /api/seller/products?storeId=…
        Api->>Db: 会員の所属を確かめ、店舗の削除されていない商品、<br/>在庫、店舗、組織を読む
        Db-->>Api: 行
        Api-->>Page: 200 商品の配列 (publicationStatus)
    and 運営からの警告・停止
        Page->>Api: GET /api/seller/products/moderation?storeId=…
        Api->>Db: 警告の履歴と、公開停止中の商品を読む
        Db-->>Api: 行
        Api-->>Page: 200 警告・停止の配列
    end
    Page-->>User: 25 件ずつの商品一覧と、行ごとの<br/>「公開状態」のボタン (「公開中」か「非表示」)

    Note over User,Db: 基本フロー 3 変更を選ぶ (通信しない)
    alt 基本フロー 3 1 件の「公開状態」のボタン
        User->>Page: 対象商品の行の「公開状態」のボタンをクリック
        Note right of Page: 確認ダイアログは出さない。公開中なら<br/>HIDDEN、非表示なら PUBLISHED を送る
    else 3a 複数の商品をまとめて変更する
        User->>Page: チェックボックス (または「現在ページの商品をすべて選択」) を選び、<br/>「選択商品を非表示」か「選択商品を再公開」をクリック
        Page-->>User: 「非表示の確認」か「再公開の確認」<br/>対象店舗、件数、商品名、変更の内容
        User->>Page: 「非表示を確定」か「再公開を確定」をクリック
    else 3b 商品を削除する
        User->>Page: 行の「削除」(複数なら選んで「選択商品を削除」) をクリック
        Page-->>User: 「削除の確認」 対象店舗、件数、商品名、<br/>「この店舗の管理一覧からも削除します。復元はできません。…」
        User->>Page: 「削除を確定」をクリック
    end
    Note over User,Page: 3c 確認ダイアログの「取消」(閉じるボタン、Esc も) は、<br/>ダイアログを閉じるだけで通信しない。3c-2 で終わる

    Note over User,Db: 基本フロー 4〜5 変更を保存して表示する
    Note right of Page: 先に GET /api/auth/csrf で<br/>CSRF トークンを取る
    Page->>Api: PATCH /api/seller/products/status<br/>storeId、productIds、status (HIDDEN・PUBLISHED・DELETED)
    Api->>Db: 会員と、店舗でのロールを読む
    Db-->>Api: 行
    alt 4b 権限がない (削除は STAFF・ロールなし、公開状態の変更はロールなし)
        Api-->>Page: 403 FORBIDDEN
    else 権限がある
        Api->>Db: 店舗と商品の店舗を確かめ、<br/>在庫の行を商品 ID の順にロックして読む
        Db-->>Api: inventory の行
        alt 4a 保存できない
            Api-->>Page: 404 STORE_NOT_FOUND・PRODUCT_NOT_FOUND、<br/>400 DUPLICATE_PRODUCT、409 PRODUCT_ARCHIVED
        else 保存できる
            Api->>Db: 選んだ商品の inventory.publication_status を status に更新<br/>(DELETED は行を残す論理削除)
            Db-->>Api: 完了
            Note over Api,Db: ロックから更新までが 1 つのトランザクション
            Api-->>Page: 200 updated=true
        end
    end
    alt 失敗の応答 (4a、4b)
        Page->>Api: GET /api/seller/products?storeId=…
        Api-->>Page: 200 最新の商品の配列
        Page-->>User: エラーの文 (4b は「この操作の権限がありません。」) と<br/>最新の販売状態。確認ダイアログから確定したときは、<br/>ダイアログが開いたまま
    else 200
        Page->>Api: GET /api/seller/products?storeId=…
        Api-->>Page: 200 最新の商品の配列
        Note right of Page: 購入者向けの商品も取り直す<br/>(GET /api/cart、GET /api/products)
        Page-->>User: 「N件の商品を非表示に変更しました。」(再公開・削除も同じ形) と<br/>最新の一覧。ダイアログと選択を閉じる。<br/>3b-4 削除した商品は一覧から消える
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
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。未ログインなら Workspace.jsx が AuthPanel を出す
    Note over User,Db: 基本フロー 1〜2 商品の一覧と「公開状態」のボタンを表示する
    User->>Mgr: 出店者メニューの「商品管理」をクリック<br/>(Workspace.jsx が /seller/products で ProductManager を表示)
    Note right of Mgr: ロールのない店舗の ORG_ADMIN には、<br/>Workspace.jsx が ProductManager の代わりに<br/>人事の画面だけを使える旨を出す (通信しない)
    par 商品の一覧
        Mgr->>Cat: useSellerCatalog(shop)
        Note right of Cat: useEffect が storeId<br/>(shop.sellerStoreId) で自動で取得する
        Cat->>Http: api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Note over Ctrl,Db: list() から先は EC-S05 の詳細図 1 と同じ。図では省略
        Ctrl-->>Http: 200 ProductView の配列
        Http-->>Cat: result
        Cat->>Cat: setProducts(result)
    and 運営からの警告・停止
        Mgr->>Hook: useResource('/seller/products/moderation?storeId=…')
        Note right of Hook: useEffect が reload() を自動で実行する
        Hook->>Http: request(path)
        Http->>Ctrl: GET /api/seller/products/moderation?storeId=…
        Note over Ctrl,Db: moderation() から ProductModerationService.noticesAt() へ。図では省略
        Ctrl-->>Http: 200 ProductNotice の配列
        Http-->>Hook: data
    end
    Cat-->>Mgr: catalog.products
    Hook-->>Mgr: moderation.data
    Mgr->>List: SellerProductList (products、storeName、notices、<br/>onStatus は catalog.changeStatus)
    List->>List: 検索、カテゴリ、公開状態、並び順で絞って並べ、<br/>25 件ずつのページに分ける
    List-->>User: 商品一覧、行ごとの「公開状態」のボタン、「編集」、「削除」、<br/>「選択商品を非表示」「選択商品を再公開」「選択商品を削除」
    Note right of List: 検索、絞り込み、並び替え、<br/>「条件をリセット」、ページ送りは<br/>画面の中だけで、通信しない
```

## 詳細図 2 基本フロー 3

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant List as SellerProductList<br/>SellerProductList.jsx
        participant Cat as useSellerCatalog.js
    end

    Note over User,Cat: 基本フロー 3 変更を選ぶ (通信しない)
    alt 基本フロー 3 1 件の「公開状態」のボタン
        User->>List: 行の「公開状態」のボタンをクリック<br/>(aria-label は「公開中：非表示にする」か「非表示：再公開する」)
        List->>Cat: onStatus([p.id], HIDDEN なら 'PUBLISHED'、ほかは 'HIDDEN')<br/>= changeStatus(ids, status)
    else 3a まとめて変更する
        User->>List: 行のチェックボックス、または<br/>「現在ページの商品をすべて選択」
        List->>List: setSelected(ids) (表示中のページの商品だけ)
        User->>List: 「選択商品を非表示」か「選択商品を再公開」
        List->>List: confirm(selected, 'HIDDEN' か 'PUBLISHED') で setPending
        List-->>User: Dialog「商品状態変更の確認」の「非表示の確認」か「再公開の確認」<br/>対象店舗：店舗名 / N件、商品名、変更の内容
        User->>List: 「非表示を確定」か「再公開を確定」
        List->>Cat: apply() の中で onStatus(pending.ids, pending.status)
    else 3b 削除する
        User->>List: 行の「削除」、または選んで「選択商品を削除」
        List->>List: confirm(ids, 'DELETED') で setPending
        List-->>User: 「削除の確認」 対象店舗、件数、商品名、<br/>「この店舗の管理一覧からも削除します。復元はできません。<br/>注文履歴と他店舗の販売には影響しません。」
        User->>List: 「削除を確定」
        List->>Cat: apply() の中で onStatus(pending.ids, 'DELETED')
    end
    Note over User,Cat: 3c 確認ダイアログの「取消」、閉じるボタン、Esc は setPending(null) だけで、<br/>選択は残り、通信しない (3c-2 で終わる)。確定したときは詳細図 3 の changeStatus() へ進む
```

## 詳細図 3 基本フロー 4〜5

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as ProductManager<br/>ProductManager.jsx
        participant List as SellerProductList<br/>SellerProductList.jsx
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

    Note over User,Db: 基本フロー 4〜5 変更を保存して表示する
    List->>Cat: changeStatus(ids, status)
    Cat->>Cat: write(ids[0], action, 「N件の商品を(削除、非表示に変更、再公開)しました。」)<br/>shop.setError('')、shop.setNotice('')、setError('')
    Cat->>Http: api.setProductStatus(storeId, ids, status)
    Note right of Http: send() の authFetch() (auth.js) が<br/>先に GET /api/auth/csrf でトークンを取る
    Http->>Ctrl: PATCH /api/seller/products/status<br/>storeId、productIds、status
    Note right of Ctrl: @Valid ProductStatusRequest (productIds は 1〜25 件、<br/>status は PUBLISHED・HIDDEN・DELETED)。違反は<br/>ApiErrors.invalid() の 400 INVALID_INPUT
    Ctrl->>Svc: update(request)
    Note over Svc,Db: @Transactional (クラスに付く) ここからメソッドの終わりまでが 1 つのトランザクション
    Svc->>Auth: DELETED なら requireManager(storeId)、<br/>ほかは requireSeller(storeId)
    Note right of Auth: requireStoreRole()。current() と<br/>店舗・組織・担当を読む (図では省略)
    alt 4b 権限がない (削除は STAFF・ロールなし、公開状態の変更はロールなし)
        Auth--xErrs: denied() が throw ApiException(403, FORBIDDEN)
        Errs-->>Http: business() が 403 と「この操作の権限がありません。」
    else 権限がある
        Auth-->>Svc: 戻る
        Svc->>CatSvc: requireStore(storeId)
        CatSvc->>Repo: StoreRepository.existsById(storeId)
        Repo->>Db: SELECT stores
        Db-->>Repo: 有無
        Repo-->>CatSvc: 結果
        CatSvc-->>Svc: 戻る
        Svc->>Svc: productIds に重複がないか確かめる
        Svc->>Repo: requireAtStore() の中で<br/>ProductRepository.findStoreReferences(productIds)
        Repo->>Db: SELECT products の id、store_id
        Db-->>Repo: 行
        Repo-->>Svc: ProductStoreReference のリスト
        Svc->>Repo: InventoryRepository.lockAll(productIds)
        Repo->>Db: SELECT ... FROM inventory ... ORDER BY product_id FOR UPDATE
        Db-->>Repo: 行
        Repo-->>Svc: InventoryEntity のリスト
        alt 4a 保存できない
            Svc--xErrs: throw ApiException (右の Note のどれか)
            Note right of Svc: 404 STORE_NOT_FOUND (requireStore)<br/>400 DUPLICATE_PRODUCT (ID の重複)<br/>404 PRODUCT_NOT_FOUND (ほかの店舗の商品、行の数の違い)<br/>409 PRODUCT_ARCHIVED (削除済みの商品を公開・非表示に)
            Note over Svc,Db: 409 と行の数の違いの 404 のほかは、ロックの前に throw する。<br/>例外でロールバックし、どの商品も変わらない
            Errs-->>Http: business() が status と message を返す
        else 保存できる
            Svc->>Svc: rows.forEach で setPublicationStatus(status)
            Note over Svc,Db: save() は呼ばない。コミットで UPDATE inventory が送られる
            Svc-->>Ctrl: 戻る
            Ctrl-->>Http: 200 updated=true
        end
    end
    alt 失敗の応答 (4a、4b)
        Http--xCat: readResponse() が throw ApiError(status, message)
        Cat->>Cat: catch で setError(reason.message)
        Cat->>Http: refresh() の api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Ctrl-->>Http: 200 最新の ProductView の配列 (中は EC-S05 の詳細図 1 と同じ)
        Http-->>Cat: 最新の商品
        Cat-->>List: false
        Note right of List: apply() は成功のときだけ setPending(null)<br/>するので、確認ダイアログは開いたまま
        Mgr-->>User: catalog.error のエラーの文と最新の販売状態 (4a-2 基本フロー 3 へ戻る、4b-2 終了)
    else 200
        Http-->>Cat: updated=true
        Cat->>Http: refresh() の api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId=…
        Ctrl-->>Http: 200 最新の ProductView の配列
        Http-->>Cat: result
        Note right of Cat: Promise.all で shop.refreshProducts() (useShop.js) も呼ぶ。<br/>GET /api/cart と GET /api/products で購入者向けの商品を<br/>取り直す。出店者の GET /api/cart は 403 BUYER_REQUIRED に<br/>なり、GET /api/products の結果を使う (図では省略)
        Cat->>Cat: shop.setNotice(message)
        Cat-->>List: true
        List->>List: setPending(null)、setSelected([])
        Mgr-->>User: shop.notice の「N件の商品を非表示に変更しました。」などと最新の一覧。<br/>3b-4 削除した商品は findNotDeletedAtStore() で除かれ、一覧から消える
    end
```

## ユースケース記述との差

- 4a: 確認ダイアログ（3a・3b）から確定して失敗したとき、`apply()` は成功のときだけ `setPending(null)` を呼ぶので、ダイアログは開いたままです。エラーの文はダイアログの中ではなく、`ProductManager` の上部に出ます。記述の 4a-2「基本フロー 3 へ戻る」とは、ダイアログが残る点が違います。
- 4a: 記述は「保存に失敗した場合」とだけ書いています。サーバーが返す失敗は、店舗がない 404 `STORE_NOT_FOUND`（店舗がないと権限の確認が先に 403 にするので、運営のアカウントのときだけ）、ID の重複の 400 `DUPLICATE_PRODUCT`、選択店舗の商品でない 404 `PRODUCT_NOT_FOUND`「選択店舗の商品が見つかりません。」、削除済みの商品を公開・非表示にする 409 `PRODUCT_ARCHIVED`「削除済みの商品は再公開・非表示に変更できません。」です。どれも画面の動き（エラーの文を出して一覧を取り直す）は同じです。
- 4b: 権限の確かめ方は記述のとおりで、削除は `requireManager()`（オーナーか MANAGER）、公開状態の変更は `requireSeller()`（STAFF 以上）です。ただし画面は、STAFF にも「削除」「選択商品を削除」を出します。押すとサーバーが 403 を返します。また、運営が停止した店舗と、存在しない店舗でも 403 になります。
- 4b: ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が「商品管理」画面の代わりに人事の画面だけを使える旨を出し、通信しません。403 に届く「ロールなし」は、所属店舗でロールのない担当者（`memberRole` が `NONE`）です。
- 3b-4: 削除は `inventory.publication_status` を `DELETED` にする論理削除で、商品と在庫の行は残ります。一覧は `findNotDeletedAtStore()` が `DELETED` の商品を除くので、画面から消えます。
- 基本フロー 5・3b-5: 成功すると、`N件の商品を非表示に変更しました。`、`N件の商品を再公開しました。`、`N件の商品を削除しました。` のどれかを出します。記述にはメッセージが書かれていません。
- 基本フロー 4: 成功のあと、出店者の一覧（`GET /api/seller/products`）のほかに、`shop.refreshProducts()` が購入者向けの商品（`GET /api/cart`、`GET /api/products`）も取り直します。記述にない処理です。
- 3c: 「取消」のほか、ダイアログの閉じるボタンと Esc も同じく `setPending(null)` だけです。選んでいたチェックボックスは残ります。

## 確かめられなかったこと

- 確認ダイアログは `showModal()` で開くので、失敗のときに `ProductManager` の上部に出るエラーの文が、ダイアログの後ろで読めるかどうかは、画面で確かめていません。
- `InventoryRepository.lockAll()` が `SELECT … FOR UPDATE` になることは、`@Lock(PESSIMISTIC_WRITE)` から読んだものです。`UPDATE inventory` を送る時点は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`personnelOnly`、`/seller/products` と `ProductManager` の対応
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductManager.jsx): `ProductManager`（`catalog.error`、`shop.notice` の表示、`onStatus`）
- [frontend/src/components/SellerProductList.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerProductList.jsx): `SellerProductList`、`statusLabels`、`confirm`、`apply`、`setPending`、`setSelected`
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): `Dialog`（`showModal`、`onCancel`）
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/useSellerCatalog.js): `useEffect`（一覧の取得）、`refresh`、`write`、`changeStatus`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `refresh`（`refreshProducts`）、`setNotice`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`readResponse`、`api.sellerProducts`、`api.setProductStatus`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`/api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list`、`moderation`、`update`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductStatusRequest.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductStatusRequest.java): `ProductStatusRequest`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java): `update`、`requireAtStore`、`notAtStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `requireStore`、`storeProducts`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lockAll`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findStoreReferences`、`findNotDeletedAtStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java): `PUBLISHED`、`HIDDEN`、`DELETED`、`publicationStatus`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller`、`requireManager`、`requireStoreRole`、`denied`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`
