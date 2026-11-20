# EC-B03 商品を検索する

- ユースケース記述: [EC-B03_商品を検索する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B03_商品を検索する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

商品の取得は、EC の画面を開いたとき（`App` が表示されたとき）に 1 回だけ行います。検索・絞り込み・並べ替えは、取得済みの商品をブラウザーの中で絞り込むだけで、サーバーには問い合わせません。そのため、図は「事前条件 画面を開いたときの取得」と「基本フロー 1〜6 検索と絞り込み」に分けています。ログインは不要なので、共通代替フロー *b は当てはまりません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「メイン」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 事前条件 EC の画面を開いたとき、商品をまとめて取得する
    Page->>Api: GET /api/cart
    alt ログイン中の購入者か運営者
        Api-->>Page: 200 カート
    else 未ログイン
        Api-->>Page: 401 LOGIN_REQUIRED
    else 店舗側・出店申請中のアカウント
        Api-->>Page: 403 BUYER_REQUIRED
    end
    Note over Page,Api: どの応答でも続けて商品を取得する。カートの中身の処理は図では省略
    Page->>Api: GET /api/products
    Api->>Db: 削除されていない商品と画像を検索
    Db-->>Api: 商品の行
    Api->>Db: 在庫、店舗、組織を ID で検索
    Db-->>Api: 在庫・店舗・組織の行
    Api->>Api: 購入可能な商品だけに絞り<br/>おすすめの順に並べる
    Api-->>Page: 200 商品の配列
    Note over Page,Api: ほかに GET /api/auth/me、GET /api/orders (カートが 200 のときだけ)、<br/>GET /api/stores?latitude=35.6812&longitude=139.7671 を送る。<br/>商品の検索には使わないので図では省略
    Note over User,Db: 共通代替フロー *a を適用 (「再読み込み」で取得をやり直す)

    Note over User,Db: 基本フロー 1〜2 「商品を探す」で商品一覧を表示する
    User->>Page: 共通ヘッダーの「商品を探す」をクリック
    Page->>Page: URL を / に切り替え<br/>商品一覧 (id plants) へスクロール
    Page-->>User: 商品一覧 (1 ページ 12 件)<br/>開いた直後の条件は「すべて」「おすすめ順」

    Note over User,Db: 基本フロー 3〜6 条件で絞り込む (サーバーには問い合わせず、取得済みの商品を画面で絞り込む)
    User->>Page: 検索欄、カテゴリーのボタン、絞り込み条件、<br/>価格上限、「在庫ありのみ」、並び順を変える
    Page->>Page: 取得済みの商品を条件で絞り込み<br/>並び順のとおりに並べる
    alt 条件に合う商品がある
        Page-->>User: 条件に合う商品の一覧 (1 ページ目)
    else 6a 該当商品がない
        Page-->>User: 「条件に合う植物が見つかりません。」と<br/>「条件をリセット」ボタン
        User->>Page: 「条件をリセット」をクリック
        Page->>Page: 検索語、カテゴリー、絞り込み条件、<br/>「在庫ありのみ」を初期値に戻す
        Page-->>User: 条件を戻した商品一覧
        Note right of User: 6a-2 基本フロー 3 へ戻る
    end
```

## 詳細図 1 事前条件 画面を開いたときの取得

```mermaid
sequenceDiagram
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as App.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CartCtrl as Cart<br/>Controller
        participant Ctrl as Catalog<br/>Controller
        participant Svc as CatalogService
        participant ProdRepo as Product<br/>Repository
        participant InvRepo as Inventory<br/>Repository
        participant StoreRepo as Store<br/>Repository
        participant OrgRepo as Organization<br/>Repository
    end
    participant Db as MySQL

    Note over App,Db: 事前条件 EC の画面を開いたとき (App のマウント時) に商品を取得する
    App->>Shop: useShop()
    Note right of Shop: useEffect が initialize() を<br/>自動で実行する
    Shop->>Shop: initialize() が run(action) の中で<br/>refresh() を呼ぶ
    Note right of Shop: 取得中で cart が null の間は<br/>Catalog.jsx が「植物を読み込んでいます…」を出す
    Shop->>Http: api.cart()
    Http->>CartCtrl: GET /api/cart
    Note right of CartCtrl: 未ログインは Spring Security が手前で止め<br/>AuthConfiguration の authenticationEntryPoint が 401 を返す。<br/>店舗側・申請中は CartSessionResolver.resolve() の<br/>AuthService.requireBuyer() が ApiException を投げ<br/>ApiErrors.business() が 403 にする。<br/>カートの読み込みは図では省略
    alt ログイン中の購入者か運営者
        CartCtrl-->>Http: 200 CartView
        Http-->>Shop: nextCart
        Shop->>Shop: setSignedOut(false)、setCart(nextCart)
    else 未ログイン
        CartCtrl-->>Http: 401 LOGIN_REQUIRED
        Http--xShop: readResponse() が throw ApiError(401)
        Shop->>Shop: catch で setSignedOut(true)、setCart(null)
    else 店舗側・出店申請中のアカウント
        CartCtrl-->>Http: 403 BUYER_REQUIRED
        Http--xShop: readResponse() が throw ApiError(403)
        Shop->>Shop: catch で setRefusedBuyer(true)、setCart(null)
    end
    Shop->>Http: api.products()
    Http->>Ctrl: GET /api/products
    Note right of Ctrl: ログイン中は SessionValidityFilter が<br/>セッションを確かめる。図では省略
    Ctrl->>Svc: products(null)
    Note over Svc,Db: クラスの @Transactional(readOnly = true) の範囲。ロックはしない
    Svc->>ProdRepo: findAllNotDeleted()
    ProdRepo->>Db: SELECT products と product_images<br/>(inventory が DELETED の商品を除く)
    Db-->>ProdRepo: 行
    ProdRepo-->>Svc: ProductEntity のリスト
    Svc->>Svc: listings(selected)
    Svc->>InvRepo: findAllById(商品 ID)
    InvRepo->>Db: SELECT inventory
    Db-->>InvRepo: 行
    InvRepo-->>Svc: InventoryEntity のリスト
    Svc->>StoreRepo: findAllById(店舗 ID)
    StoreRepo->>Db: SELECT stores
    Db-->>StoreRepo: 行
    StoreRepo-->>Svc: StoreEntity のリスト
    Svc->>OrgRepo: findAllById(組織 ID)
    OrgRepo->>Db: SELECT organizations
    Db-->>OrgRepo: 行
    OrgRepo-->>Svc: OrganizationEntity のリスト
    Svc->>Svc: storeStates() の中で storeReason() が<br/>店舗と組織の側の買えない理由を決める
    Svc->>Svc: displayOrder() と商品 ID の順に並べる
    Svc->>Svc: 商品ごとに unavailableReason() で<br/>買えない理由を決める
    Note right of Svc: ProductMapper.toView() で<br/>ProductView にする。図では省略
    Svc->>Svc: products() が filter(Listing::purchasable)
    Svc-->>Ctrl: ProductView のリスト
    Ctrl-->>Http: 200 ProductView の配列
    Http-->>Shop: products
    Shop->>Shop: setProducts(products)
    Note over Shop,Db: ほかに useAuth() の GET /api/auth/me (App.jsx と useShop.js で 1 回ずつ)、<br/>api.orders() の GET /api/orders (カートが 200 のときだけ)、<br/>api.stores() の GET /api/stores?latitude=35.6812&longitude=139.7671 を送る。<br/>商品の検索には使わないので図では省略
    Note over App,Db: 共通代替フロー *a を適用。run() の catch が setError(message) を実行し<br/>Catalog.jsx がメッセージと「再読み込み」を出す。「再読み込み」は initialize() をやり直す。<br/>DB に届かないときは ApiErrors.database() が 503 DATABASE_UNAVAILABLE を返す
```

## 詳細図 2 基本フロー 1〜6 検索と絞り込み

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx<br/>site-header
        participant App as App.jsx
        participant Nav as navigation.js
        participant Catalog as Catalog.jsx
        participant List as CatalogProducts.jsx
    end

    Note over User,List: 基本フロー 1〜2 「商品を探す」で商品一覧を表示する
    User->>Header: 「商品を探す」をクリック
    Header->>Header: follow(event) が preventDefault()
    Header->>App: onNavigate(href) で<br/>navigateFromHeader(url) を呼ぶ
    App->>Nav: navigate(target.pathname + target.search + target.hash)
    Nav->>Nav: history.pushState() と popstate の発行<br/>window.scrollTo(0, 0)
    Nav-->>App: usePath() が setPath(currentPath())
    App->>App: ハッシュが plants なら<br/>getElementById('plants') を scrollIntoView()
    App->>Catalog: path が / なので<br/>Catalog shop=shop onDetail=openDetail を表示
    Catalog->>Catalog: shop.products から<br/>カテゴリーのボタンと出店者・ナーセリーの選択肢を作る
    Catalog->>List: CatalogProducts products=絞り込んだ商品
    List->>List: PAGE_SIZE 12 件ずつに分ける
    List-->>User: 商品カード、件数、ページ切り替え
    Note right of List: 商品カードの img が商品画像を読み込む。図では省略

    Note over User,List: 基本フロー 3〜6 条件で絞り込む。サーバーには問い合わせない
    User->>Catalog: 「名前・品番・生産者で検索」欄に入力
    Catalog->>Catalog: setSearch(event.target.value)
    User->>Catalog: カテゴリーのボタン、「日照条件」「用途・植栽場所」<br/>「手入れレベル」「出店者・ナーセリー」、<br/>「価格上限（円）」、「在庫ありのみ」を変える
    Catalog->>Catalog: setCategory、setSunlight、setUseCase、<br/>setCareLevel、setNursery、setMaxPrice、setInStockOnly
    User->>Catalog: 並び順の一覧から「価格が安い順」などを選ぶ
    Catalog->>Catalog: setSort(event.target.value)
    Catalog->>Catalog: shop.products を for で回し<br/>条件に合わない商品を continue で除く
    Note right of Catalog: 検索語は trim() と toLowerCase() の後<br/>name、latinName、sku、description、<br/>nurseryName、useCase をつないだ文字列に部分一致
    Catalog->>Catalog: sort が recommended 以外なら products.sort()
    Catalog->>List: key=paginationKey で作り直す (1 ページ目に戻る)
    alt 条件に合う商品がある
        List-->>User: 条件に合う商品の一覧
    else 6a 該当商品がない
        Catalog-->>User: 「条件に合う植物が見つかりません。」と<br/>「条件をリセット」ボタン
        User->>Catalog: 「条件をリセット」をクリック
        Catalog->>Catalog: reset() が検索語、カテゴリー、<br/>絞り込み条件、在庫ありのみを初期値に戻す
        Catalog->>List: key=paginationKey で作り直す
        List-->>User: 条件を戻した商品一覧
        Note right of User: 6a-2 基本フロー 3 へ戻る
    end
```

## ユースケース記述との差

- 検索語の対象が記述より広いです。記述は商品名・商品番号・生産者名ですが、コードは `name`、`latinName`（学名）、`sku`、`description`（説明文）、`nurseryName`、`useCase`（用途）をつないだ文字列に部分一致するかで探します。
- 「絞り込みを解除」と「条件をリセット」は、どちらも同じ `reset()` を呼びます。`reset()` は「絞り込み条件」だけでなく、検索語とカテゴリーと「在庫ありのみ」も初期値に戻します。並び順は戻しません。
- 記述にない処理です。商品の取得は画面を開いたときの `GET /api/products` 1 回だけで、条件を変えるたびにサーバーへ問い合わせることはありません。
- 記述にない処理です。「おすすめ順」は並べ替えをせず、サーバーの順のままです。サーバーは `CatalogService.displayOrder()` で `olive`、`lavender`、`rosemary`、`monstera` を先にし、残りを商品 ID の順に並べます。
- 記述にない処理です。カテゴリーのボタンと「出店者・ナーセリー」の選択肢は、`GET /api/categories` ではなく、取得した商品のカテゴリー名と生産者名から作ります。
- 記述にない処理です。一覧は 1 ページ 12 件で、条件や並び順を変えると 1 ページ目に戻ります（`CatalogProducts` を `key` で作り直すため）。
- 購入可能な商品の条件は、記述の関連情報とコードの `storeReason()`・`unavailableReason()` が一致しています。在庫の公開状態が `DELETED` の商品は、SQL の時点で除いています。

## 確かめられなかったこと

- 「マイページ」などの画面（`/account` など）から「商品を探す」を押したときに、商品一覧までスクロールするかは、画面では確かめていません。`navigateFromHeader()` は `navigate()` の直後に `getElementById('plants')` を呼びますが、この時点で「メイン」画面が描かれているかは、React の描画の順番によります。
- `GET /api/cart` が成功して `GET /api/products` が失敗したときは、`cart` が入っていて `products` が空のままなので、通信エラーと一緒に「条件に合う植物が見つかりません。」も出るとコードからは読めます。画面では確かめていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): 「商品を探す」のリンク、`follow()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `navigateFromHeader()`、`useShop()` の呼び出し、`Catalog` の表示
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`、`currentPath()`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `initialize()`、`refresh()`、`run()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `api.cart()`、`api.products()`、`request()`、`readResponse()`
- [frontend/src/components/Catalog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Catalog.jsx): 絞り込みの `for`、並べ替え、`reset()`、`paginationKey`、「条件に合う植物が見つかりません。」
- [frontend/src/components/CatalogProducts.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CatalogProducts.jsx): `PAGE_SIZE`、ページの切り替え
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `GET /api/products` の `permitAll()`、`authenticationEntryPoint`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java): `products()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `products()`、`listings()`、`storeStates()`、`storeReason()`、`unavailableReason()`、`displayOrder()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findAllNotDeleted()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `findAllById()`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAllById()`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findAllById()`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`database()`
