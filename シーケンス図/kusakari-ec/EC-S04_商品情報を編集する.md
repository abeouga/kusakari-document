# EC-S04 商品情報を編集する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Mgr as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant List as 商品一覧<br/>SellerProductList<br/>(SellerProductList.jsx)
        participant Form as 編集フォーム<br/>ProductForm<br/>(ProductForm.jsx)
        participant Picker as カテゴリーの選択<br/>CategoryPicker<br/>(CategoryPicker.jsx)
        participant Cat as 出店者の商品一覧と保存<br/>useSellerCatalog<br/>(useSellerCatalog.js)
        participant Shop as 購入者向けの商品<br/>useShop<br/>(useShop.js)
        participant Hook as 警告とカテゴリーの取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant SPC as 出店者の商品API<br/>SellerProductController<br/>(SellerProductController.java)
        participant CatCtrl as カテゴリーAPI<br/>CategoryController<br/>(CategoryController.java)
        participant EdCtrl as 商品の登録・編集API<br/>ProductEditorController<br/>(ProductEditorController.java)
        participant CartCtrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant CatalogCtrl as 購入者向けの商品API<br/>CatalogController<br/>(CatalogController.java)
        participant SPSvc as 出店者の商品の処理<br/>SellerProductService<br/>(SellerProductService.java)
        participant ModSvc as 商品への運営の警告<br/>ProductModerationService<br/>(ProductModerationService.java)
        participant EdSvc as 商品の登録・編集の処理<br/>ProductEditorService<br/>(ProductEditorService.java)
        participant CatgSvc as カテゴリーの処理<br/>CategoryService<br/>(CategoryService.java)
        participant CatalogSvc as 商品の読み込み<br/>CatalogService<br/>(CatalogService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant CModel as Canvas への問い合わせ<br/>CanvasModelClient<br/>(CanvasModelClient.java)
        participant ProdRepo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
        participant InvRepo as 在庫の読み書き<br/>InventoryRepository<br/>(InventoryRepository.java)
    end
    box rgba(27,127,92,0.12) Canvas API FastAPI
        participant CApi as 植物の組み立てAPI<br/>resolve_model<br/>(main.py)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、9、18、32、一覧の取り直しの 45、購入者向けの商品の 48・50 に適用<br/>*a 通信に失敗した場合: 4、9、18、30、32、一覧の取り直しの 45、購入者向けの商品の 48・50 に適用

    User->>Work: 出店者メニューの「商品管理」をクリック
    Work->>Mgr: URL を /seller/products に変え、<br/>ProductManager を表示 (embedded)
    par 商品の一覧
        Mgr->>Cat: 選んでいる店舗の商品を取りに行くよう頼む (useSellerCatalog)
        Cat->>SPC: 画面を開いたときに自動で一覧の通信を始める<br/>(useEffect → api.sellerProducts → request)<br/>GET /api/seller/products?storeId={id}
        SPC->>SPSvc: 出店者の商品一覧を作るよう頼む (list)。読むだけのトランザクション<br/>その店舗の商品を見られるかを確かめ (requireStoreViewer。ロールのない担当者も見られる)、<br/>商品を追加した人の名前を読む (ProductRepository.findCreatorNamesAtStore、SELECT products JOIN members)
        SPSvc->>CatalogSvc: 店舗の削除されていない商品を集めるよう頼む (storeProducts)<br/>店舗を確かめ (requireStore)、商品・画像を読み (findNotDeletedAtStore。在庫が DELETED の商品を除き、非公開の商品は含む)、<br/>在庫・店舗・組織を読む (listings、SELECT products、product_images、inventory、stores、organizations)
        SPC-->>Cat: 200 3D の構成を外し、追加した人の名前を付けた商品の配列<br/>(toSellerView。stock、publicationStatus、createdByName ほか。setProducts)
    and 運営からの警告・停止
        Mgr->>Hook: 店舗の商品への警告・停止を取りに行くよう頼む (useResource)
        Hook->>SPC: 画面を開いたときに自動で通信を始める (reload → request)<br/>GET /api/seller/products/moderation?storeId={id}
        SPC->>ModSvc: 店舗の商品への警告・停止を集めるよう頼む (moderation → noticesAt)。読むだけのトランザクション<br/>見られるかを確かめ (requireStoreViewer)、警告と解除の履歴 (findAtStore、product_moderation_events)、<br/>公開停止中の商品 (findSuspendedIdsAtStore)、警告中か停止中の商品名と削除の有無 (findImageReferences) を読む
        SPC-->>Hook: 200 削除されていない商品の警告・停止の配列
    end
    Mgr-->>User: 「運営からの警告・停止」欄 (商品名、「運営により公開停止中」、<br/>「警告中」「運営からの警告：理由」)、商品一覧 (公開状態、在庫、<br/>「追加した人：…」、「警告中」「運営により公開停止中」のバッジ、行ごとの「編集」)

    User->>List: 編集対象の商品の行の「編集」をクリック
    List->>Mgr: 選んだ商品を編集するよう伝える (setSelected([]) → onEdit → edit)
    Mgr->>Form: フォームを開いたときの在庫数を覚え、<br/>編集フォームを表示 (setExpectedStock(product.stock)、setEditing → ProductForm)
    Form->>Picker: 商品の値を入れた入力欄とカテゴリーの選択を表示<br/>(createDraft(product)、ProductInfoFields → CategoryPicker)
    Picker->>Hook: カテゴリーの一覧を取りに行くよう頼む (useResource)
    Hook->>CatCtrl: 自動で通信を始める (reload → request)<br/>GET /api/categories
    CatCtrl->>CatgSvc: カテゴリー名の一覧を作るよう頼む (list)<br/>削除されていないカテゴリーを読む (CategoryRepository.findByDeletedAtIsNull、SELECT categories)
    CatCtrl-->>Picker: 200 名前順のカテゴリー名の配列
    Mgr-->>User: 商品一覧を隠し、「戻る」、「変更前の在庫数：N」、<br/>「商品情報」「画像」「庭オブジェクト」のタブ、商品番号と<br/>「商品番号は変更できません。」、入力欄、「変更を保存」

    User->>Form: 編集フォームの入力欄で商品情報を変更する<br/>(「商品名」「商品説明」「税込価格（円）」「選択店舗の在庫」、<br/>「カテゴリーを選ぶ」など。タブで「画像」「庭オブジェクト」も開ける)
    Form->>Form: 入力を下書きに入れる (ProductInfoFields の change → set)<br/>画像の追加、3D プレビュー、「AIで生成」は EC-S03 の図と同じ通信をする
    opt 編集を中止する (関連情報)
        User->>Mgr: 「戻る」をクリック
        Note over User,Mgr: 結果: 保存せず、通信しない (resetEditor)。<br/>画面: 編集フォームを閉じて商品一覧に戻る。
    end

    User->>Form: 「変更を保存」をクリック
    Form->>Form: すべてのタブの入力を確かめる (save → validate(null)。<br/>firstInvalid、商品名・説明、画像、plant.currentProfile)
    Form->>Cat: 入力をまとめ、フォームを開いたときの在庫数を付けて保存を頼む<br/>(onSave → productInput → ProductManager の save → catalog.save、expectedStock)
    Cat->>Http: 商品を書き換える通信を送る<br/>(write → api.updateProduct → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>EdCtrl: PUT /api/products/{id}<br/>(storeId、sku、stock、expectedStock、heightCm、plantModelProfile ほか)
    EdCtrl->>EdCtrl: 入力を検査する (@Valid の ProductRequest)
    EdCtrl->>EdSvc: 商品を書き換えるよう頼む (update)<br/>update 全体が 1 つのトランザクション。例外が出るとすべて取り消す
    EdSvc->>CatgSvc: カテゴリーが登録済みかを確かめる (require)<br/>カテゴリーを共有ロックで読む (CategoryRepository.share、SELECT ... FOR SHARE categories)
    EdSvc->>ProdRepo: 商品の行をロックして読む (findLocked、SELECT ... FOR UPDATE products)
    EdSvc->>Auth: 商品の店舗を扱えるか (STAFF 以上か) を確かめる<br/>(requireProductStore → requireStoreRole。会員、店舗、組織、担当とロールを読む)
    EdSvc->>InvRepo: 店舗と商品番号が変わっていないかを確かめ (画面はそのまま送るので通る)、<br/>在庫の行をロックして読む (lock、SELECT ... FOR UPDATE inventory)
    EdSvc->>EdSvc: 入力を商品に書き込む (mapper.updateEntity)。<br/>植物の構成を作り直すかを決める (resolveModel)
    opt 植物の特徴が前と違う、構成がない、構成の version が 4 未満
        CModel->>CApi: 植物の 3D の構成を作るよう頼む (EdSvc の resolve から)<br/>POST /api/model-assemblies/resolve<br/>(受けた要求の KUSAKARI_SESSION Cookie と X-CSRF-TOKEN を付ける)
        Note over EdSvc,CApi: 結果: 構成 (parts) を modelComposition に入れる。Canvas に問い合わせられないか構成が空 (記述なし) なら、<br/>503 MODEL_SERVICE_UNAVAILABLE か 502 INVALID_MODEL_RESPONSE を返して保存しない (画面の上部に「植物モデルを確定できません。…」など)
    end
    EdSvc->>Db: 商品・商品画像・在庫数を書き換える (saveProduct → entityManager.flush、<br/>InventoryRepository の setQuantity → save。UPDATE products、product_images、inventory)。<br/>構成があれば素材コードと商品の対応を保存する (linkMaterial → MaterialProductRepository.save、material_products)
    EdSvc->>CatalogSvc: 更新後の商品を読むよう頼む (product → listingsByIds)
    EdCtrl-->>Http: update が終わるとコミットし、200 更新後の商品
    Http-->>Cat: 更新後の商品
    par 出店者の一覧
        Cat->>SPC: 出店者の一覧を取り直す (refresh → api.sellerProducts)<br/>GET /api/seller/products?storeId={id}。流れは 4〜7 と同じ
        SPC-->>Cat: 200 最新の商品の配列 (setProducts)
    and 購入者向けの商品
        Cat->>Shop: 購入者向けの商品も取り直すよう頼む (shop.refreshProducts → refresh)
        Shop->>CartCtrl: カートを読む (api.cart)<br/>GET /api/cart
        CartCtrl-->>Shop: 403「店舗・出店申請用のアカウントでは購入できません。…」<br/>(CartSessionResolver.resolve → requireBuyer、BUYER_REQUIRED)
        Shop->>CatalogCtrl: 購入を断られたので、購入者向けの商品だけを読む (api.products)<br/>GET /api/products
        CatalogCtrl-->>Shop: 200 購入者に見える商品の配列 (setProducts)
    end
    Cat-->>Form: 成功を返す (shop.setNotice('商品を保存しました。')、saved が true)。<br/>ProductManager の save が true を返し、編集フォームを閉じる (onDone → resetEditor)
    Mgr-->>User: 「商品を保存しました。」と、更新後の商品一覧
```

![EC-S04 シーケンス図](<images/EC-S04_商品情報を編集する-1.png>)
