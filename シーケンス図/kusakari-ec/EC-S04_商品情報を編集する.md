# EC-S04 商品情報を編集する

- ユースケース記述: [EC-S04_商品情報を編集する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S04_商品情報を編集する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）。植物モデルの組み立てで呼ぶ kusakari-canvas は main（c19d497）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 「商品管理」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant CApi as Kusakari Canvas API

    Note over User,CApi: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)
    Note over Page,Api: PUT の前には毎回 GET /api/auth/csrf を送る。図では省略

    Note over User,CApi: 基本フロー 1〜2 「商品管理」画面を開く
    User->>Page: 出店者画面のメニュー「商品管理」をクリック (EC-C03)
    par 商品の一覧
        Page->>Api: GET /api/seller/products?storeId={id}
        Api->>Db: 会員の所属を確かめ、店舗の削除されていない商品、<br/>在庫、店舗、組織を読む
        Db-->>Api: 行
        Api-->>Page: 200 商品の配列 (stock、publicationStatus)
    and 運営からの警告・停止
        Page->>Api: GET /api/seller/products/moderation?storeId={id}
        Api->>Db: 警告の履歴と、公開停止中の商品を読む
        Db-->>Api: 行
        Api-->>Page: 200 警告・停止の配列
    end
    Page-->>User: 商品一覧と公開状態、「運営からの警告・停止」欄、<br/>「警告中」「運営により公開停止中」のバッジ、行ごとの「編集」

    Note over User,CApi: 基本フロー 3〜4 編集フォームを開く
    User->>Page: 編集対象の商品の行の「編集」をクリック
    Page->>Api: GET /api/categories
    Api->>Db: 削除されていないカテゴリを読む
    Db-->>Api: 行
    Api-->>Page: 200 カテゴリ名の配列
    Page-->>User: 「変更前の在庫数：N」と、商品情報を入れた編集フォーム<br/>(「商品情報」「画像」「庭オブジェクト」のタブ)

    Note over User,CApi: 基本フロー 5 入力欄で商品情報を変更する
    User->>Page: 商品名、カテゴリー、商品説明、税込価格（円）、<br/>選択店舗の在庫などを変更する
    Note right of Page: 「画像」の追加、「庭オブジェクト」の 3D プレビューと<br/>「AIで生成」は EC-S03 と同じ通信をする。図では省略
    opt 「戻る」をクリックした (関連情報 編集の中止)
        User->>Page: 「戻る」をクリック
        Page-->>User: 商品一覧に戻る。保存しない。通信しない
    end

    Note over User,CApi: 基本フロー 6〜7 「変更を保存」をクリックし、入力を検証する
    User->>Page: 「変更を保存」をクリック
    Page->>Page: すべてのタブの入力を検査する (通信しない)
    alt 7a 入力が不正 (画面の検査)
        Page-->>User: 入力エラーと、直す入力欄のタブ。<br/>7a-2 基本フロー 5 へ戻る
    else 画面の検査を通る
        Note over User,CApi: 基本フロー 8 商品情報を保存する
        Page->>Api: PUT /api/products/{id}<br/>商品情報、storeId、stock、expectedStock (変更前の在庫数)、<br/>plantModelProfile
        Api->>Api: 入力を検査 (@Valid)
        alt 7a @Valid の違反
            Api-->>Page: 400 INVALID_INPUT
        else 検査を通る
            Api->>Db: カテゴリを共有ロック (FOR SHARE)、商品の行をロック (FOR UPDATE) で読み、<br/>会員と店舗での立場を読み、在庫の行をロック (FOR UPDATE) で読む
            Db-->>Api: 行
            Note over Api,Db: 上から順に確かめ、当たったところで止まる
            alt 7a カテゴリが無いか削除済み
                Api-->>Page: 400 INVALID_CATEGORY
            else 商品が無い (記述にない)
                Api-->>Page: 404 PRODUCT_NOT_FOUND
            else 8c ロールなし、運営が停止した店舗
                Api-->>Page: 404 PRODUCT_NOT_FOUND
            else 8a 削除した商品
                Api-->>Page: 409 PRODUCT_ARCHIVED
            else 8b 在庫数が expectedStock と違う
                Api-->>Page: 409 STOCK_CHANGED
            else 確かめを通る
                opt 植物の特徴が変わった、構成が無いか古い
                    Api->>CApi: POST /api/model-assemblies/resolve
                    CApi-->>Api: 200 3D の構成 (parts)
                end
                alt Canvas に問い合わせられない、構成が空 (記述にない)
                    Api-->>Page: 503 MODEL_SERVICE_UNAVAILABLE<br/>か 502 INVALID_MODEL_RESPONSE
                else 基本フロー 8 保存できる
                    Api->>Db: products、product_images、inventory を UPDATE、<br/>material_products を保存し、商品を読み直す
                    Db-->>Api: 行
                    Note over Api,Db: 確かめから保存までが 1 つのトランザクション
                    Api-->>Page: 200 更新後の商品
                end
            end
        end
        alt 失敗の応答 (7a、8a、8b、8c、記述にない 404・502・503)
            Page->>Api: GET /api/seller/products?storeId={id}
            Api-->>Page: 200 最新の商品の配列
            Page-->>User: 画面の上にエラーの文。編集フォームは開いたままで、入力は残る。<br/>8b は「変更前の在庫数」が最新の値になる (8b-2 基本フロー 5 へ戻る)
        else 200
            Note over User,CApi: 基本フロー 9 「商品管理」画面に更新結果を表示する
            par 出店者の一覧
                Page->>Api: GET /api/seller/products?storeId={id}
                Api-->>Page: 200 最新の商品の配列
            and 購入者向けの商品
                Page->>Api: GET /api/cart、GET /api/products
                Api-->>Page: 403 BUYER_REQUIRED、200 商品の配列
            end
            Page-->>User: 「商品を保存しました。」と、更新後の商品一覧
        end
    end
```

## 詳細図 1 基本フロー 1〜2

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as ProductManager.jsx
        participant Cat as useSellerCatalog.js
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as SellerProduct<br/>Controller
        participant Svc as SellerProduct<br/>Service
        participant ModSvc as ProductModeration<br/>Service
        participant Auth as AuthService
        participant CatSvc as CatalogService
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a、*b を適用。ログイン中の要求は<br/>SessionValidityFilter が会員を確かめる。図では省略

    Note over User,Db: 基本フロー 1 メニュー「商品管理」を開く
    User->>Mgr: サイドバーの「商品管理」をクリック (EC-C03)
    Note right of User: Workspace.jsx が path /seller/products で<br/>ProductManager (embedded) を表示する。<br/>ロールのない店舗の ORG_ADMIN には、ProductManager の<br/>代わりに人事の画面だけを使える旨を出す (通信しない)

    Note over User,Db: 基本フロー 2 商品一覧と、運営からの警告・停止を表示する
    par 商品の一覧
        Mgr->>Cat: useSellerCatalog(shop)
        Cat->>Http: useEffect が api.sellerProducts(storeId)
        Http->>Ctrl: GET /api/seller/products?storeId={id}
        Ctrl->>Svc: list(storeId)
        Note over Svc,Db: @Transactional(readOnly = true)。読むだけでロックしない
        Svc->>Auth: requireStoreViewer(storeId)
        Note right of Auth: current() と canManageView() で<br/>所属店舗か確かめる (中は図では省略)
        Auth-->>Svc: 戻る (見られなければ 403 FORBIDDEN)
        Svc->>CatSvc: storeProducts(storeId)
        CatSvc->>Repo: requireStore() の StoreRepository.existsById(storeId)
        Repo->>Db: SELECT stores
        Db-->>Repo: 有無
        Repo-->>CatSvc: true (なければ 404 STORE_NOT_FOUND)
        CatSvc->>Repo: ProductRepository.findNotDeletedAtStore(storeId)
        Repo->>Db: SELECT products、product_images<br/>(在庫が DELETED の商品を除く)
        Db-->>Repo: 行
        Repo-->>CatSvc: ProductEntity のリスト
        CatSvc->>Repo: listings() の InventoryRepository.findAllById()、<br/>StoreRepository.findAllById()、OrganizationRepository.findAllById()
        Repo->>Db: SELECT inventory、stores、organizations
        Db-->>Repo: 行
        Repo-->>CatSvc: Entity のリスト
        CatSvc->>CatSvc: mapper.toView() で ProductView にする
        CatSvc-->>Svc: ProductView のリスト (非公開の商品も含む)
        Svc-->>Ctrl: mapper.toSellerView() で modelComposition を外したリスト
        Ctrl-->>Http: 200 ProductView の配列
        Http-->>Cat: result
        Cat->>Cat: setProducts(result)、setLoadedStore(storeId)
        Note right of Cat: 失敗は catch で setError(reason.message)。<br/>ProductManager が上部に出す
    and 運営からの警告・停止
        Mgr->>Hook: useResource('/seller/products/moderation?storeId={id}')
        Hook->>Http: useEffect の reload() が request(path)
        Http->>Ctrl: GET /api/seller/products/moderation?storeId={id}
        Ctrl->>ModSvc: moderation() が noticesAt(storeId)
        Note over ModSvc,Db: @Transactional(readOnly = true)
        ModSvc->>Auth: requireStoreViewer(storeId)
        Auth-->>ModSvc: 戻る (見られなければ 403 FORBIDDEN)
        ModSvc->>Repo: ProductModerationEventRepository.findAtStore(storeId, WARNING_TYPES)、<br/>ProductRepository.findSuspendedIdsAtStore(storeId)
        Repo->>Db: SELECT product_moderation_events、products
        Db-->>Repo: 行
        Repo-->>ModSvc: 警告と警告解除の履歴、公開停止中の商品 ID
        ModSvc->>ModSvc: ModerationHistory.activeWarnings() で今出ている警告を求める
        ModSvc->>Repo: ProductRepository.findImageReferences(ids)
        Note right of Repo: 警告中か停止中の商品が無ければ呼ばず、空の配列を返す
        Repo->>Db: SELECT products、inventory (商品名と削除の有無)
        Db-->>Repo: 行
        Repo-->>ModSvc: ProductImageReference のリスト
        ModSvc-->>Ctrl: 削除されていない商品の ProductNotice のリスト
        Ctrl-->>Http: 200 ProductNotice の配列
        Http-->>Hook: data
    end
    Mgr-->>User: SellerProductList が商品一覧 (公開状態、在庫) と行ごとの「編集」、<br/>「運営からの警告・停止」欄に商品名と理由、<br/>行に「警告中」「運営により公開停止中」のバッジを表示
```

## 詳細図 2 基本フロー 3〜7

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant List as SellerProductList.jsx
        participant Mgr as ProductManager.jsx
        participant Form as ProductForm.jsx
        participant Picker as CategoryPicker.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CatCtrl as Category<br/>Controller
    end

    Note over User,CatCtrl: 基本フロー 3 「編集」をクリックする
    User->>List: 編集対象の商品の行の「編集」をクリック
    List->>List: setSelected([])
    List->>Mgr: onEdit(p) で edit(product)
    Mgr->>Mgr: setStocking(null)、setExpectedStock(product.stock)、<br/>setEditing(product)

    Note over User,CatCtrl: 基本フロー 4 編集フォームと「変更前の在庫数」を表示する
    Mgr->>Form: ProductForm (product は editing、storeId は catalog.storeId、<br/>onSave は save、onDone は resetEditor)
    Form->>Form: createDraft(product)、usePlantSuggestion(product, true, category)、<br/>step は INFO
    Form->>Picker: ProductInfoFields が CategoryPicker を表示
    Picker->>Hook: useResource('/categories')
    Hook->>Http: useEffect の reload() が request('/categories')
    Http->>CatCtrl: GET /api/categories
    Note over CatCtrl: CategoryService.list() が削除されていないカテゴリを読む。<br/>EC-A07 の詳細図 1 と同じ。図では省略
    CatCtrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: data
    Hook-->>Picker: categories.data
    Note right of Form: 隠れている「画像」のタブのサムネイルも、img の src で<br/>GET /api/product-images/{id} を読む。図では省略
    Mgr-->>User: 一覧を隠し、「戻る」、「変更前の在庫数：N」、<br/>「商品情報」「画像」「庭オブジェクト」のタブ、<br/>商品番号 (「商品番号は変更できません。」)、入力欄、「変更を保存」

    Note over User,CatCtrl: 基本フロー 5 入力欄で商品情報を変更する (通信しない)
    User->>Form: 「商品名」「商品説明」「税込価格（円）」<br/>「選択店舗の在庫」などを変更する
    Form->>Form: ProductInfoFields の change() が set(name, value)
    User->>Picker: 「カテゴリーを選ぶ」から一覧のカテゴリを選ぶ
    Picker->>Form: choose(name) が onChange(name)。set('category', name)
    Note right of Form: WizardSteps のタブで move(index) し、「画像」「庭オブジェクト」を開ける。<br/>画像の追加は EC-S03 の詳細図 2、3D プレビューは詳細図 3、<br/>「AIで生成」は詳細図 4 と同じ。図では省略
    opt 「戻る」をクリックした (関連情報 編集の中止)
        User->>Mgr: 「戻る」をクリック
        Mgr->>Mgr: resetEditor() が setEditing(null)、setStocking(null)
        Mgr-->>User: 商品一覧。保存しない。通信しない
    end

    Note over User,CatCtrl: 基本フロー 6〜7 「変更を保存」をクリックし、画面で入力を検証する
    User->>Form: 「変更を保存」をクリック
    Form->>Form: onSubmit の save(event)、validate(null)
    Note right of Form: firstInvalid() で全タブの input の required、min、max を、<br/>続けて商品名と説明、画像、plant.currentProfile() を確かめる
    alt 7a 入力が不正
        Form->>Form: fail() が setError() と reveal() (その入力欄のタブを開く)
        Form-->>User: 「在庫は0以上にしてください。」「商品名・説明を入力してください。」<br/>「商品画像を1枚以上追加してください。」<br/>「植物の高さは10〜1500cmの整数にしてください。」など。<br/>通信しない。7a-2 基本フロー 5 へ戻る
    else 画面の検査を通る
        Form->>Mgr: onSave(product.id, productInput(values, storeId,<br/>plant.currentProfile())) で save(id, input)
        Note right of Mgr: 基本フロー 8 は詳細図 3
    end
```

## 詳細図 3 基本フロー 8

```mermaid
sequenceDiagram
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as ProductManager.jsx
        participant Cat as useSellerCatalog.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductEditor<br/>Controller
        participant Errs as ApiErrors
        participant Svc as ProductEditor<br/>Service
        participant Auth as AuthService
        participant CatgSvc as CategoryService
        participant CModel as CanvasModel<br/>Client
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant CApi as Kusakari Canvas API
    end

    Note over Svc,Db: CatalogService、各 Repository と EntityManager はライフラインを省き、<br/>MySQL への矢印に呼ぶメソッドを書く

    Note over Mgr,CApi: 基本フロー 8 商品情報を保存する
    Mgr->>Cat: save(id, input) が catalog.save(id, {...input, expectedStock})
    Cat->>Cat: write(id, action, '商品を保存しました。')。<br/>shop.setError('')、shop.setNotice('')、setError('')
    Cat->>Http: api.updateProduct(id, input)
    Note right of Http: request() の send() の authFetch() が<br/>先に GET /api/auth/csrf を送る。図では省略
    Http->>Ctrl: PUT /api/products/{id}<br/>(storeId、sku、stock、expectedStock、heightCm、plantModelProfile ほか)
    Ctrl->>Ctrl: @Valid で ProductRequest を検査
    alt 7a @Valid の違反 (画面の検査が先に止めるので、画面からはふつう届かない)
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT
    else 検査を通る
        Ctrl->>Svc: update(id, input)
        Note over Svc,CApi: クラスの @Transactional で update() 全体が 1 つのトランザクション。<br/>例外が出るとロールバックし、何も変えない
        Svc->>CatgSvc: require(category)
        CatgSvc->>Db: CategoryRepository.share(name)<br/>SELECT ... FOR SHARE (@Lock PESSIMISTIC_READ)
        Db-->>CatgSvc: 行 または 空
        CatgSvc-->>Svc: 戻る (無いか削除済みなら下の 7a)
        Svc->>Db: ProductRepository.findLocked(id)<br/>SELECT ... FOR UPDATE (@Lock PESSIMISTIC_WRITE)
        Db-->>Svc: products の行 または 空
        Svc->>Auth: requireProductStore(product.getStoreId(), false)
        Note right of Auth: requireStoreRole() が current() と店舗・組織・担当を読む<br/>(図では省略)。STAFF 以上なら通る
        Auth-->>Svc: 戻る (通らなければ下の 8c)
        Svc->>Svc: storeId と sku が変わっていないか確かめる
        Note right of Svc: 400 STORE_IMMUTABLE、409 SKU_IMMUTABLE は、画面が商品の<br/>店舗と商品番号をそのまま送るので届かない
        Svc->>Db: InventoryRepository.lock(id)<br/>SELECT ... FOR UPDATE (@Lock PESSIMISTIC_WRITE)
        Db-->>Svc: inventory の行 または 空
        Note over Svc,Db: 上から順に確かめ、最初に当たったところで throw する。後の呼び出しはしない
        alt 7a カテゴリが無いか削除済み
            CatgSvc--xErrs: throw ApiException(400, INVALID_CATEGORY)
            Errs-->>Http: business() が 400 と「登録済みのカテゴリを選択してください。」
        else 商品が無い (記述にない)
            Svc--xErrs: throw ApiException(404, PRODUCT_NOT_FOUND)
            Errs-->>Http: business() が 404 と「商品が見つかりません。」
        else 8c ロールなし、運営が停止した店舗、ほかの組織の店舗
            Auth--xErrs: requireStoreRole() の 403 を<br/>throw ApiException(404, PRODUCT_NOT_FOUND) に変える
            Errs-->>Http: business() が 404 と「商品が見つかりません。」
        else 8a 在庫の行が無いか publicationStatus が DELETED
            Svc--xErrs: throw ApiException(409, PRODUCT_ARCHIVED)
            Errs-->>Http: business() が 409 と「削除済みの商品は編集できません。」
        else 8b 在庫数が expectedStock と違う
            Svc--xErrs: SellerProductService.stockChanged(在庫数) の<br/>ApiException(409, STOCK_CHANGED) を throw
            Errs-->>Http: business() が 409 と「在庫数が変更されています<br/>（現在の在庫数：N）。最新の在庫数を確認して、<br/>もう一度保存してください。」
        else 確かめを通る
            Svc->>Svc: mapper.updateEntity(input, product)
            Svc->>Svc: resolveModel(product, input, previousProfile, profileProvided)
            Note right of Svc: plantModelProfile が null なら modelComposition を null にする。<br/>高さが違うと 400 PLANT_HEIGHT_MISMATCH (画面からは届かない)
            opt 特徴が前と違う、構成が無い、構成の version が 4 未満
                Svc->>CModel: resolve(profile)
                CModel->>CApi: POST /api/model-assemblies/resolve
                CApi-->>CModel: 200 構成 (parts)
                CModel-->>Svc: JsonNode を modelComposition に入れる
            end
            alt Canvas に問い合わせられない、構成が空 (記述にない)
                CModel--xErrs: throw ApiException(503, MODEL_SERVICE_UNAVAILABLE)<br/>か (502, INVALID_MODEL_RESPONSE)
                Errs-->>Http: business() が 503 か 502 と message
            else 基本フロー 8 保存できる
                Svc->>Db: saveProduct(product, false) の entityManager.flush()<br/>UPDATE products、product_images
                Db-->>Svc: OK
                Svc->>Db: stock.setQuantity(input.getStock())、inventory.save(stock)<br/>UPDATE inventory
                Db-->>Svc: OK
                Svc->>Db: linkMaterial() の materials.save()。modelComposition が<br/>あるときだけ material_products (product.{id}) を保存
                Db-->>Svc: OK
                Svc->>Db: catalog.product(id) が商品、在庫、店舗、組織を読む
                Db-->>Svc: 行
                Svc-->>Ctrl: ProductView。コミット
                Ctrl-->>Http: 200 ProductView
            end
        end
    end
    Note over Http: 応答を受けた後は詳細図 4
```

## 詳細図 4 基本フロー 9 と、失敗の応答の後

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as ProductForm.jsx
        participant Mgr as ProductManager.jsx
        participant Cat as useSellerCatalog.js
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SPC as SellerProduct<br/>Controller
        participant CartCtrl as Cart<br/>Controller
        participant CatalogCtrl as Catalog<br/>Controller
    end

    alt 失敗の応答 (7a、8a、8b、8c、記述にない 404・502・503)
        Http--xCat: readResponse() が throw ApiError(status, message)
        Cat->>Cat: catch で setError(reason.message)
        Cat->>Http: refresh() の api.sellerProducts(storeId)
        Http->>SPC: GET /api/seller/products?storeId={id}
        Note over SPC: Service から先は詳細図 1 と同じ。図では省略
        SPC-->>Http: 200 最新の ProductView の配列
        Http-->>Cat: setProducts(result)
        Cat-->>Mgr: saved は false、latest は同じ ID の商品<br/>(削除した商品は一覧に無いので null)
        Mgr->>Mgr: latest があれば setExpectedStock(latest.stock)
        Mgr-->>Form: false (onDone() を呼ばない)
        Mgr-->>User: 上部に catalog.error のエラーの文。編集フォームは開いたまま、<br/>入力は残る。8b は「変更前の在庫数：N」が最新の値になる<br/>(8b-2 基本フロー 5 へ戻る)
    else 200
        Http-->>Cat: ProductView
        Note over User,CatalogCtrl: 基本フロー 9 「商品管理」画面に更新結果を表示する
        par 出店者の一覧
            Cat->>Http: refresh() の api.sellerProducts(storeId)
            Http->>SPC: GET /api/seller/products?storeId={id}
            Note over SPC: Service から先は詳細図 1 と同じ。図では省略
            SPC-->>Http: 200 最新の ProductView の配列
            Http-->>Cat: setProducts(result)
        and 購入者向けの商品
            Cat->>Shop: shop.refreshProducts() (useShop.js の refresh())
            Shop->>Http: api.cart()
            Http->>CartCtrl: GET /api/cart
            CartCtrl--xHttp: CartSessionResolver.resolve() の requireBuyer() が<br/>403 BUYER_REQUIRED (ApiErrors が JSON にする)
            Http--xShop: throw ApiError(403)
            Shop->>Http: refused なので api.products()
            Http->>CatalogCtrl: GET /api/products
            CatalogCtrl-->>Http: 200 購入者に見える商品の配列
            Http-->>Shop: setProducts()
        end
        Cat->>Cat: shop.setNotice('商品を保存しました。')
        Cat-->>Mgr: saved は true
        Mgr-->>Form: true
        Form->>Mgr: onDone() で resetEditor()。setEditing(null)、setStocking(null)
        Mgr-->>User: shop.notice「商品を保存しました。」と、更新後の商品一覧
    end
```

## ユースケース記述との差

- 8c: 記述では「この操作の権限がありません。」と表示します。コードでは、`ProductEditorService.update()` が `AuthService.requireProductStore(storeId, false)` で確かめ、403 を 404 `PRODUCT_NOT_FOUND`「商品が見つかりません。」に変えて返します。ほかの店舗の商品があるかを知らせないためです。運営が停止した店舗と、ほかの組織の店舗でも同じ 404 になります。
- 8c の「ロールなし」に届くのは、所属店舗でロールが割り当てられていない担当者（`memberRole` が `NONE`）です。この担当者は `requireStoreViewer()` を通るので、商品一覧と「編集」が表示され、「変更を保存」の後に 404 になります。ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が「商品管理」画面の代わりに「(店舗名)では担当のロールがないため、人事（アカウント・招待キー）の画面だけを使えます。」を出し、通信しません。
- 8a: 削除した商品は `inventory.publication_status` が `DELETED` で、409 `PRODUCT_ARCHIVED`「削除済みの商品は編集できません。」になります。記述の 8a-2「ユースケースを終了する」と違い、編集フォームは開いたままです。出店者は「戻る」で一覧に戻ります。取り直した一覧には削除した商品が無いので、「変更前の在庫数」は変わりません。
- 8b: 「フォームを開いた後に在庫数が変わっていた」かどうかは、画面が送る `expectedStock`（フォームを開いたときの在庫数）と、ロックして読んだ `inventory.quantity` を比べて決めます。409 `STOCK_CHANGED` の後、画面は一覧を取り直し、「変更前の在庫数」を最新の値に変えます。入力した在庫数は残ります。
- 7a: 検査は画面（`ProductForm.validate()`）とサーバーの両方にあります。サーバーの `@Valid` の違反（400 `INVALID_INPUT`）は、画面の検査が先に止めるので、画面からはふつう届きません。フォームを開いた後に運営がカテゴリを削除していると、サーバーで 400 `INVALID_CATEGORY`「登録済みのカテゴリを選択してください。」になります。画面で止まったときのエラーはフォームの下に、サーバーからのエラーは画面の上に出ます。
- 記述にない失敗の応答があります。商品の行が無いと 404 `PRODUCT_NOT_FOUND` です。植物の特徴を変えたときに Kusakari Canvas API に接続できないと 503 `MODEL_SERVICE_UNAVAILABLE`、構成が空だと 502 `INVALID_MODEL_RESPONSE` で、保存しません。
- 記述にない処理として、植物の商品は、特徴が前と違うとき、構成（`model_composition`）が無いとき、構成の `version` が 4 より小さいときに、保存のトランザクションの中で Canvas API の `POST /api/model-assemblies/resolve` を呼び、構成を取り直します。この問い合わせは、カテゴリの共有ロックと、商品と在庫の行のロックを持ったまま行います。
- 基本フロー 4: 編集フォームは「商品管理」画面の中に開き、商品一覧を隠します。商品登録と違い、「商品情報」「画像」「庭オブジェクト」はタブで、どのタブからでも「変更を保存」を押せます。商品番号は表示だけで、「商品番号は変更できません。」と出ます。編集では「選択店舗の在庫」を 0 にできます（登録では 1 以上）。
- 基本フロー 9: 保存に成功すると「商品を保存しました。」を出し、編集フォームを閉じます。記述にない処理として、出店者の一覧（`GET /api/seller/products`）のほかに、`shop.refreshProducts()` が購入者向けの商品（`GET /api/cart`、`GET /api/products`）も取り直します。店舗側のアカウントでは `GET /api/cart` が 403 `BUYER_REQUIRED` になり、`GET /api/products` の結果だけを使います。運営からの警告・停止（`GET /api/seller/products/moderation`）は取り直しません。
- 関連情報の「商品を編集しても、警告も公開停止も解除されない」は、`ProductEntity.suspended` に setter が無く、`ProductRequest` にも対応するフィールドが無いことで満たします。警告は `product_moderation_events` にあり、編集では変えません。

## 確かめられなかったこと

- 隠れている「画像」のタブのサムネイル（`ProductImages.jsx` の `img`）を、フォームを開いた時点でブラウザーが読むかは、実行して確かめていません。
- `inventory.save(stock)` と `stock.setQuantity()` の変更が `UPDATE inventory` として送られる時点（`catalog.product(id)` の読み込みの前か、コミットのときか）は、実行して確かめていません。
- `linkMaterial()` の `materials.save()` は、主キー（`MaterialProductId`）を持つ Entity なので、Spring Data JPA の `merge()` になり、行が無いときだけ `INSERT` すると読みました。実行して確かめていません。
- `@Lock(PESSIMISTIC_READ)` と `@Lock(PESSIMISTIC_WRITE)` が MySQL で `FOR SHARE` と `FOR UPDATE` になることは、注釈から読んだものです。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`personnelOnly`、`/seller/products` と `ProductManager` の対応
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductManager.jsx): `edit()`、`save()`、`resetEditor()`、`expectedStock`、「変更前の在庫数」、「戻る」、`moderation`
- [frontend/src/components/SellerProductList.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerProductList.jsx): 「編集」、`onEdit`、「警告中」「運営により公開停止中」のバッジ
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/useSellerCatalog.js): `useEffect`（一覧の取得）、`refresh()`、`write()`、`save()`
- [frontend/src/components/ProductForm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductForm.jsx): `save()`、`validate()`、`fail()`、`reveal()`、`move()`、「変更を保存」
- [frontend/src/components/WizardSteps.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/WizardSteps.jsx): 編集のときのタブ
- [frontend/src/components/ProductInfoFields.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductInfoFields.jsx): 商品番号の表示、`min={p.id ? 0 : 1}`、`change()`
- [frontend/src/components/CategoryPicker.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CategoryPicker.jsx): `useResource('/categories')`、`choose()`
- [frontend/src/components/ProductImages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductImages.jsx): サムネイルの `img`
- [frontend/src/components/usePlantSuggestion.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/usePlantSuggestion.js): `currentProfile()`、`configured`
- [frontend/src/components/usePlantPreview.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/usePlantPreview.js): `active` のときだけ 3D プレビューを読む
- [frontend/src/productDraft.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/productDraft.js): `createDraft()`、`productInput()`
- [frontend/src/formValidity.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/formValidity.js): `firstInvalid()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload()`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `refresh()`（`refreshProducts`）、`setNotice()`、`memberRole`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`、`ApiError`、`api.sellerProducts()`、`api.updateProduct()`、`api.cart()`、`api.products()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`（`/api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list()`、`moderation()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java): `list()`、`stockChanged()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `noticesAt()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `storeProducts()`、`requireStore()`、`listings()`、`product()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `list()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `require()`、`list()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductEditorController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductEditorController.java): `update()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductEditorService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductEditorService.java): `update()`、`resolveModel()`、`linkMaterial()`、`saveProduct()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CanvasModelClient.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CanvasModelClient.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/catalog/mapper/ProductMapper.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/mapper/ProductMapper.java): `updateEntity()`、`toView()`、`toSellerView()`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductRequest.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductRequest.java): `expectedStock`、`setPlantModelProfile()`、検査の注釈
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findLocked()`、`findNotDeletedAtStore()`、`findSuspendedIdsAtStore()`、`findImageReferences()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lock()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `share()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/ProductEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/ProductEntity.java): `suspended`（setter なし）、`images`
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java): `findAtStore()`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `activeWarnings()`、`WARNING_TYPES`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireStoreViewer()`、`requireProductStore()`、`requireStoreRole()`、`memberRoleAt()`、`viewableStoreIdsOf()`、`requireBuyer()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java): `products()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `products`、`inventory`、`product_images`、`material_products`
- [backend/kusakari_canvas_api/main.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/main.py): kusakari-canvas の `/api/model-assemblies/resolve`
