# EC-B03 商品を検索する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の枠<br/>App<br/>(App.jsx)
        participant Shop as 商品とカートの状態<br/>useShop<br/>(useShop.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant Catalog as 「メイン」画面の商品一覧<br/>Catalog<br/>(Catalog.jsx)
        participant List as 商品カードとページ<br/>CatalogProducts<br/>(CatalogProducts.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Sec as ログインの確認<br/>AuthConfiguration<br/>(AuthConfiguration.java)
        participant CartCtrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant OrderCtrl as 注文API<br/>OrderController<br/>(OrderController.java)
        participant CatCtrl as 商品・店舗の一覧API<br/>CatalogController<br/>(CatalogController.java)
        participant Svc as 商品の一覧の処理<br/>CatalogService<br/>(CatalogService.java)
        participant ProdRepo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
        participant InvRepo as 在庫の読み書き<br/>InventoryRepository<br/>(InventoryRepository.java)
        participant StoreRepo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
        participant OrgRepo as 組織の読み書き<br/>OrganizationRepository<br/>(OrganizationRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*a 通信に失敗した場合: 6、13、28、31 に適用

    User->>App: ブラウザーで EC のページを開く<br/>(事前条件。URL を直接開いた、再読み込み)
    App->>Shop: 商品とカートの状態を用意するよう頼む (useShop)。画面を開いたときに<br/>自動で読み込みを始める (useEffect → initialize → run → refresh)
    App->>Catalog: パスが / なら商品一覧を表示する (Catalog)
    Catalog-->>User: 取得中は「植物を読み込んでいます…」
    Shop->>Http: カートを読む (api.cart → request)
    Http->>Sec: GET /api/cart
    alt ログインしていない
        Sec-->>Http: 401 LOGIN_REQUIRED「ログインしてください。」<br/>(authenticationEntryPoint)
        Http--xShop: エラーを投げる (readResponse → ApiError 401)。<br/>未ログインとして扱う (setSignedOut(true)、setCart(null))
    else ログインしている
        Sec->>CartCtrl: 要求を通す。購入者か運営者かを確かめ、カートを読む<br/>(resolve → AuthService.requireBuyer、CartService.read)
        CartCtrl-->>Http: 200 カート<br/>(店舗側か出店申請用のアカウントなら 403 BUYER_REQUIRED)
        Http-->>Shop: カート (setCart)。403 なら購入できない会員として扱う<br/>(setRefusedBuyer(true)、setCart(null))
    end
    Shop->>Http: 購入できる商品を読む (api.products → request)
    Http->>CatCtrl: GET /api/products (ログインしていなくてもよい)
    CatCtrl->>Svc: 全店舗の商品の一覧を作るよう頼む (products(null))<br/>読み取り専用のトランザクション
    Svc->>ProdRepo: 削除されていない商品を読む (findAllNotDeleted、SELECT products)<br/>在庫の公開状態が DELETED の商品を除く
    ProdRepo-->>Svc: 商品のリスト
    Svc->>InvRepo: 商品の在庫を読む (findAllById、SELECT inventory)
    InvRepo-->>Svc: 在庫のリスト
    Svc->>StoreRepo: 商品の店舗を読む (storeStates → findAllById、SELECT stores)
    StoreRepo-->>Svc: 店舗のリスト
    Svc->>OrgRepo: 店舗の組織を読む (findAllById、SELECT organizations)
    OrgRepo-->>Svc: 組織のリスト
    Svc->>Svc: 店舗・組織の側と商品ごとに買えない理由を決め、応答の形にする<br/>(storeReason、unavailableReason、ProductMapper.toView。商品の画像もここで読む)<br/>閉鎖済み、利用停止、組織の停止、閉鎖中、非公開、組織の受付停止中
    Svc->>Svc: おすすめの順に並べ (displayOrder。olive、lavender、rosemary、monstera を先に、<br/>残りは商品 ID の順)、買える商品だけを残す (filter(Listing::purchasable))<br/>在庫が 0 の商品は残す
    Svc-->>CatCtrl: 商品のリスト
    CatCtrl-->>Http: 200 商品の配列
    Http-->>Shop: 商品の一覧
    opt カートを読めた (購入者か運営者)
        Shop->>OrderCtrl: 注文の一覧を読む (api.orders → request)<br/>GET /api/orders
        Note over Shop,OrderCtrl: 結果: 200 注文の配列を受け取り、覚える (list、setOrders)。<br/>画面: 商品の検索には使わない。
    end
    Shop->>Shop: 商品の一覧を覚える (setProducts)
    Shop->>Http: 店舗の一覧を読む (api.stores → request)
    Http->>CatCtrl: GET /api/stores?latitude=35.6812&longitude=139.7671
    CatCtrl-->>Http: 200 店舗の配列 (stores)
    Http-->>Shop: 店舗の一覧 (setStores)
    Shop-->>Catalog: 商品の一覧 (shop.products)

    User->>Header: 共通ヘッダーの「商品を探す」をクリック
    Header->>App: 移動先の URL を渡す (follow → onNavigate → navigateFromHeader)
    App->>Catalog: URL を /#35;plants に変え (navigate)、パスが / なので「メイン」画面を表示し、<br/>商品一覧 (id plants) までスクロールする (scrollIntoView)
    Catalog->>List: 取得済みの商品から、カテゴリーのボタンと「出店者・ナーセリー」の<br/>選択肢を作り、条件に合う商品を渡す (開いた直後は「すべて」「おすすめ順」なので全件)
    List-->>User: 1 ページ 12 件の商品カード、「n–m件 / 全N件」、ページの切り替え

    loop 条件を変えるたび (基本フロー 3〜5)
        User->>Catalog: 「名前・品番・生産者で検索」欄に入力する (setSearch)、<br/>カテゴリーのボタン、「日照条件」「用途・植栽場所」「手入れレベル」「出店者・ナーセリー」、<br/>「価格上限（円）」、「在庫ありのみ」を変える (setCategory、setSunlight、setUseCase、<br/>setCareLevel、setNursery、setMaxPrice、setInStockOnly)、<br/>または並び順の一覧から「価格が安い順」などを選ぶ (setSort)
        Catalog->>Catalog: 取得済みの商品を、すべての条件で絞り込み (for と continue)、並び順のとおりに並べる (sort)<br/>検索語は前後の空白を除いて小文字にし、name、latinName、sku、<br/>description、nurseryName、useCase をつないだ文字列に含まれるか (includes)<br/>「おすすめ順」はサーバーの順のまま
        Catalog->>List: 条件が変わったので作り直し、1 ページ目に戻す (key=paginationKey)
        List-->>User: 6 条件に合う商品の一覧 (1 ページ目) と件数<br/>(6a 1 件も無ければ「条件に合う植物が見つかりません。」と「条件をリセット」)
    end
```

![EC-B03 シーケンス図](<images/EC-B03_商品を検索する-1.png>)
