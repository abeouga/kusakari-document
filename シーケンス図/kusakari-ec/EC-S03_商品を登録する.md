# EC-S03 商品を登録する

- ユースケース記述: [EC-S03_商品を登録する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S03_商品を登録する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）。3D プレビューと植物モデルの組み立てで使う kusakari-canvas は main（c19d497）

## 概要図 1 基本フロー 1〜14

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 商品管理・商品登録画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant CWeb as Kusakari Canvas<br/>3D プレビュー画面

    Note over User,CWeb: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)
    Note over Page,Api: POST の前には毎回 GET /api/auth/csrf を送る。図では省略

    Note over User,CWeb: 基本フロー 1〜2 「商品管理」画面を開く
    User->>Page: 出店者画面のメニュー「商品管理」をクリック (EC-C03)
    Page->>Api: GET /api/seller/products?storeId={id}<br/>GET /api/seller/products/moderation?storeId={id}
    Api->>Db: 店舗の商品と在庫、警告・公開停止を読む
    Db-->>Api: 行
    Api-->>Page: 200 商品の一覧、200 警告・停止の一覧
    Page-->>User: 「商品管理」画面 (商品一覧、「新しい商品」)

    Note over User,CWeb: 基本フロー 3〜4 「商品登録」画面を開く
    User->>Page: 「新しい商品」をクリック
    Page->>Api: GET /api/categories
    Api->>Db: 削除されていないカテゴリを読む
    Db-->>Api: 行
    Api-->>Page: 200 カテゴリ名の配列
    Page-->>User: 「商品登録」画面と「商品情報」の入力フォーム

    Note over User,CWeb: 基本フロー 5〜10 商品情報を入力して「次へ」をクリックする
    User->>Page: 商品名、商品説明、税込価格、在庫数、カテゴリ、<br/>樹齢目安、鉢径、生産者名を入力し「次へ」をクリック
    Page->>Page: 入力を検査する (通信しない)
    alt 10a 入力が不正 (必須項目が空、在庫数が 1 未満など)
        Page-->>User: 入力エラーと、直す入力欄
    else 基本フロー 10 検査を通る
        Page-->>User: 「画像」の設定
    end

    Note over User,CWeb: 基本フロー 11〜12 商品画像を追加する
    User->>Page: 「画像を追加」から商品画像のファイルを選ぶ
    alt 12a 合わせて 6 枚以上、PNG・JPEG・WebP 以外、5MB を超える
        Page-->>User: 入力エラー。画像を追加しない。通信しない
    else 画面の検査を通る
        loop 選んだファイルごと
            Page->>Api: POST /api/product-images (multipart)
            Api->>Api: 中身の形式と大きさを検査
            alt 12a 中身が PNG・JPEG・WebP でない、宣言と違う
                Api-->>Page: 400 INVALID_IMAGE
                Page-->>User: 「画像は5MB以下のPNG・JPEG・WebPで<br/>選択してください。」 残りのファイルは送らない
            else 基本フロー 12 保存できる
                Api->>Db: 画像を保存 (INSERT product_media)
                Db-->>Api: OK
                Api-->>Page: 200 imageUrl
            end
        end
        Page->>Api: GET /api/product-images/{id} (サムネイルの img)
        Api->>Db: 画像を読む (product_media)
        Db-->>Api: 行
        Api-->>Page: 200 画像
        Page-->>User: 商品画像のサムネイル
    end

    Note over User,CWeb: 基本フロー 13〜14 「次へ」で画像を確かめる
    User->>Page: 「次へ」をクリック
    alt 14a 商品画像が 1 枚もない
        Page-->>User: 「商品画像を1枚以上追加してください。」 通信しない
    else 基本フロー 14
        Page->>CWeb: iframe で GET /model-preview?profile=...
        Note right of CWeb: Canvas の画面が Canvas API で部品を組み立てる。<br/>Canvas 側の処理は図では省略
        CWeb-->>Page: 3D プレビュー
        Page-->>User: 「庭オブジェクト」の設定と 3D プレビュー
    end
```

## 概要図 2 基本フロー 15〜20

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 商品管理・商品登録画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL
    participant CWeb as Kusakari Canvas<br/>3D プレビュー画面
    participant CApi as Kusakari Canvas API
    participant AI as OpenAI API

    Note over User,AI: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)
    Note over Page,Api: POST の前には毎回 GET /api/auth/csrf を送る。図では省略

    Note over User,AI: 基本フロー 15 植物の特徴を入力する
    alt 15a 「AIで生成」をクリックした
        User->>Page: 「AIで生成」をクリック
        alt 商品名が空、高さが 10〜1500 の整数でない (記述にない)
            Page-->>User: 「AIで生成する前に商品名を入力してください。」など。<br/>通信しない
        else 画面の検査を通る
            Page->>Api: GET /api/product-images/{id} (1 枚目の画像)
            Api->>Db: 画像を読む (product_media)
            Db-->>Api: 行
            Api-->>Page: 200 画像
            Page->>Api: POST /api/products/plant-model-suggestions<br/>商品名、カテゴリ、説明、高さ、画像の data URL
            Api->>AI: POST /v1/responses (商品情報と画像)
            AI-->>Api: 推定した特徴 (JSON)
            Api->>CApi: POST /api/model-assemblies/resolve<br/>(組み立てられるか。最大 4 回)
            CApi-->>Api: 200 構成 か 4xx
            Note over Api,AI: AI の結果が使えないときは、Canvas に問い合わせずに止まる
            alt 推定・組み立てができない、AI を使えない (記述にない)
                Api-->>Page: 400、422、429、502、503、504 と message
                Page-->>User: message を表示。入力欄はそのまま
            else 15a-1 推定できた
                Api-->>Page: 200 特徴、推定した項目、注意点
                Page->>CWeb: iframe で GET /model-preview?profile=...
                CWeb-->>Page: 3D プレビュー
                Page-->>User: 特徴を入力欄に反映、注意点、<br/>「AI設定を元に戻す」
            end
        end
        Note right of User: 15a-2 基本フロー 16 へ
    else 基本フロー 15 手で入力する
        User->>Page: 「植物の高さ」などの特徴を入力する
        Page->>CWeb: 入力が 400ms 止まったら<br/>iframe で GET /model-preview?profile=...
        CWeb-->>Page: 3D プレビュー
        Page-->>User: 更新した 3D プレビュー
    end

    Note over User,AI: 基本フロー 16〜17 「次へ」で庭オブジェクトを確かめる
    User->>Page: 「次へ」をクリック
    alt 17a 庭オブジェクトの入力が不正 (高さが空、10〜1500cm の整数でないなど)
        Page-->>User: 入力エラーと、直す入力欄。通信しない
    else 基本フロー 17
        Page->>CWeb: iframe で GET /model-preview?profile=...
        CWeb-->>Page: 3D モデル
        Page-->>User: 「確認」に入力内容、商品画像、3D モデル
    end

    Note over User,AI: 基本フロー 18〜19 「出品する」をクリックし、商品を登録する
    User->>Page: 「出品する」をクリック
    Page->>Page: すべての手順の入力を検査する (通信しない)
    Page->>Api: POST /api/products<br/>商品情報、在庫数、storeId、plantModelProfile (sku は空)
    Api->>Api: 入力を検査 (@Valid)
    alt 19a 入力が不正 (@Valid の違反)
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 「入力内容・文字数・数値の範囲を確認してください。」<br/>「確認」のまま
    else 検査を通る
        Api->>Db: 会員と、店舗での立場を読む
        Db-->>Api: 行
        alt 19b 権限がない (STAFF、ロールなし)
            Api-->>Page: 403 FORBIDDEN
            Page-->>User: 「この操作の権限がありません。」
        else オーナーか MANAGER
            Api->>Db: カテゴリを共有ロックで読む (SELECT ... FOR SHARE)
            Db-->>Api: 行 または 空
            alt 19a カテゴリが登録されていない
                Api-->>Page: 400 INVALID_CATEGORY
                Page-->>User: 「登録済みのカテゴリを選択してください。」
            else 登録済みのカテゴリ
                Api->>Db: 商品番号を作り、店舗の中で重ならないか読む
                Db-->>Api: 無い
                opt 植物の商品 (plantModelProfile がある)
                    Api->>CApi: POST /api/model-assemblies/resolve
                    CApi-->>Api: 200 3D の構成 (parts)
                end
                alt Canvas に問い合わせられない、構成が空 (記述にない)
                    Api-->>Page: 503 MODEL_SERVICE_UNAVAILABLE<br/>か 502 INVALID_MODEL_RESPONSE
                    Page-->>User: 「植物モデルを確定できません。…」など
                else 基本フロー 19 登録できる
                    Api->>Db: 商品と商品画像、在庫 (公開中)、<br/>素材コードの対応を INSERT
                    Api->>Db: 登録した商品を読む
                    Db-->>Api: 行
                    Api-->>Page: 200 登録した商品 (sku を含む)
                    Note over User,AI: 基本フロー 20 「商品管理」画面に結果を表示する
                    Page->>Api: GET /api/cart、GET /api/products (取り直し)
                    Api-->>Page: 403 BUYER_REQUIRED、200 商品の一覧
                    Page->>Api: GET /api/seller/products?storeId={id}<br/>GET /api/seller/products/moderation?storeId={id}
                    Api-->>Page: 200 最新の一覧
                    Page-->>User: 「商品を保存しました。商品番号は KS-… です。」<br/>と、登録した商品を含む商品一覧
                end
            end
        end
    end
```

## 詳細図 1 基本フロー 1〜10

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Mgr as ProductManager.jsx
        participant Cat as useSellerCatalog.js
        participant Hook as useResource.js
        participant Http as api.js
        participant NewPage as ProductCreatePage.jsx
        participant Form as ProductForm.jsx
        participant Picker as CategoryPicker.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant SPC as SellerProduct<br/>Controller
        participant CatCtrl as Category<br/>Controller
    end

    Note over User,CatCtrl: 共通代替フロー *a、*b を適用。ログイン中の要求は<br/>SessionValidityFilter が会員を確かめる。図では省略

    Note over User,CatCtrl: 基本フロー 1 メニュー「商品管理」を開く
    User->>Work: サイドバーの「商品管理」をクリック (EC-C03)
    Note right of User: PageLink の follow() が navigate('/seller/products') を呼び、<br/>App.jsx の usePath() が path を変える。図では省略
    Work->>Mgr: path が /seller/products なので<br/>ProductManager (embedded) を表示

    Note over User,CatCtrl: 基本フロー 2 「商品管理」画面を表示する
    Mgr->>Cat: useSellerCatalog(shop)
    Cat->>Http: useEffect が api.sellerProducts(storeId)
    Http->>SPC: GET /api/seller/products?storeId={id}
    Mgr->>Hook: useResource('/seller/products/moderation?storeId={storeId}')
    Hook->>Http: useEffect の reload() が request()
    Http->>SPC: GET /api/seller/products/moderation?storeId={id}
    Note over SPC: Service から先は EC-S04 の詳細図 1 と同じ。図では省略
    SPC-->>Http: 200 商品の一覧
    Http-->>Cat: setProducts()
    SPC-->>Http: 200 警告・停止の一覧
    Http-->>Hook: data
    Mgr-->>User: 「商品管理」、「管理する店舗」、「新しい商品」、商品一覧

    Note over User,CatCtrl: 基本フロー 3〜4 「新しい商品」から「商品登録」画面を開く
    User->>Mgr: 「新しい商品」をクリック
    Mgr->>Mgr: shop.setError('')、shop.setNotice('')
    Mgr->>Work: navigate('/seller/products/new')<br/>(usePath() が path を変える)
    Work->>NewPage: path が /seller/products/new なので<br/>ProductCreatePage を表示
    NewPage->>Form: ProductForm (product は null、storeSelector は<br/>StorePicker、onSave は shop.saveProduct)
    Form->>Form: createDraft(emptyProduct)、step は INFO
    Form->>Picker: ProductInfoFields が CategoryPicker を表示
    Picker->>Hook: useResource('/categories')
    Hook->>Http: useEffect の reload() が request('/categories')
    Http->>CatCtrl: GET /api/categories
    Note over CatCtrl: CategoryService.list() が削除されていないカテゴリを読む。<br/>EC-A07 の詳細図 1 と同じ。図では省略
    CatCtrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: data
    Hook-->>Picker: categories.data
    Form-->>User: 「商品登録」、「1 / 4」、「商品情報」の入力フォーム<br/>(商品名、カテゴリー、商品説明、税込価格（円）、<br/>選択店舗の在庫、在庫を登録する店舗)

    Note over User,CatCtrl: 基本フロー 5〜8 商品情報を入力する (通信しない)
    User->>Form: 「商品名」「商品説明」「税込価格（円）」<br/>「選択店舗の在庫」に入力する
    Form->>Form: ProductInfoFields の change() が set(name, value)
    User->>Picker: 「選ぶ」をクリックし、一覧からカテゴリを選ぶ
    Picker->>Form: choose(name) が onChange(name)。set('category', name)
    User->>Form: 「サイズ」を開き「樹齢目安（年）」「鉢径（cm）」、<br/>「詳しい情報」を開き「生産者名」を入力する
    Form->>Form: RangeField と input の onChange が set()
    Note right of Form: 「在庫を登録する店舗」の「選ぶ」で、StorePicker から<br/>店舗を変えられる。初めは「商品管理」で選んだ店舗

    Note over User,CatCtrl: 基本フロー 9〜10 「次へ」で商品情報を検証する
    User->>Form: 「次へ」をクリック
    Form->>Form: next() が validate(INFO)
    Note right of Form: firstInvalid() で input の required、min、max を、<br/>続けて商品名と説明が空白だけでないかを確かめる
    alt 10a 入力が不正 (必須項目が空、在庫数が 1 未満、価格が範囲外など)
        Form->>Form: fail() が setError() と reveal()
        Form-->>User: 「在庫は1以上にしてください。」「商品名・説明を<br/>入力してください。」など。直す入力欄にフォーカス
    else 基本フロー 10 検査を通る
        Form->>Form: move(IMAGES)
        Form-->>User: 「2 / 4」、「画像」の設定 (詳細図 2)
    end
```

## 詳細図 2 基本フロー 11〜14

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as ProductForm.jsx
        participant Images as ProductImages.jsx
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductMedia<br/>Controller
        participant Errs as ApiErrors
        participant Auth as AuthService
        participant Svc as ProductMedia<br/>Service
        participant Repo as ProductMedia<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 11〜12 商品画像を追加する
    User->>Images: 「画像を追加」からファイルを選ぶ<br/>(1 枚目のときの文言は「商品の写真を選択」)
    Images->>Images: input の onChange で upload(event)
    alt 12a 合わせて 6 枚以上になる
        Images-->>User: 「画像は最大5枚です。不要な画像を<br/>削除してから追加してください。」 通信しない
    else 12a PNG・JPEG・WebP 以外か、0 バイトか、5MB を超える
        Images-->>User: 「1枚5MB以下のPNG・JPEG・WebPを<br/>選択してください。」 通信しない
    else 画面の検査を通る
        Images->>Form: onBusy(true)。フォームを操作できなくする
        loop 選んだファイルごと (失敗したらそこで止める)
            Images->>Http: api.uploadProductImage(file)
            Note right of Http: FormData で送る。authFetch() が先に<br/>GET /api/auth/csrf を送る。図では省略
            Http->>Ctrl: POST /api/product-images (multipart の file)
            Note right of Ctrl: 5MB を超えるファイルの 413 IMAGE_TOO_LARGE<br/>(imageTooLarge()) は、画面が先に止めるので届かない
            Ctrl->>Auth: requireSellerRole()
            Auth-->>Ctrl: 戻る (店舗側のアカウントか運営)
            Ctrl->>Svc: upload(file)
            Note over Svc,Db: upload() は @Transactional
            Svc->>Svc: detect(bytes) で先頭のバイトから形式を判定し、<br/>file.getContentType() と比べる
            alt 12a 空、5MB 超、形式が判定できない、宣言と違う
                Svc--xErrs: invalid() の throw ApiException(400, INVALID_IMAGE)
                Errs-->>Http: business() が 400 と message
                Http--xImages: readResponse() が throw ApiError(400)
                Images-->>User: 「画像は5MB以下のPNG・JPEG・WebPで<br/>選択してください。」 それまでの画像は残る
            else 基本フロー 12 保存できる
                Svc->>Repo: save(row) (id は UUID)
                Repo->>Db: INSERT product_media
                Db-->>Repo: OK
                Repo-->>Svc: ProductMediaEntity
                Svc-->>Ctrl: /api/product-images/{id} の文字列
                Ctrl-->>Http: 200 imageUrl
                Http-->>Images: saved.imageUrl
                Images->>Form: change() が onChange(main, extra)。<br/>set('imageUrl')、set('images')
            end
        end
        Images->>Form: onBusy(false)
        Images->>Ctrl: サムネイルの img の src で<br/>GET /api/product-images/{id}
        Ctrl->>Svc: get(id)
        Svc->>Repo: findById(id)
        Repo->>Db: SELECT product_media
        Db-->>Repo: 行
        Repo-->>Svc: ProductMediaEntity
        Svc-->>Ctrl: Image (contentType と bytes)
        Ctrl-->>Images: 200 画像 (X-Content-Type-Options nosniff)
        Images-->>User: 商品画像のサムネイル。1 枚目が「メイン画像」
    end

    Note over User,Db: 基本フロー 13〜14 「次へ」で画像を確かめる
    User->>Form: 「次へ」をクリック
    Form->>Form: next() が validate(IMAGES)
    alt 14a draft.imageUrl が空 (画像が 1 枚もない)
        Form->>Form: fail() が setError() と reveal(ファイルの input)
        Form-->>User: 「商品画像を1枚以上追加してください。」 通信しない
    else 基本フロー 14
        Form->>Form: move(GARDEN)
        Form-->>User: 「3 / 4」、「庭オブジェクト」の設定 (詳細図 3)
    end
```

## 詳細図 3 基本フロー 14〜17

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as ProductForm.jsx
        participant Garden as ProductGardenStep.jsx
        participant Fields as PlantModelFields.jsx
        participant Plant as usePlantSuggestion.js
        participant Prev as usePlantPreview.js
        participant Preview as PlantPreview.jsx
        participant Review as ProductReview.jsx
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant CWeb as Kusakari Canvas<br/>3D プレビュー画面
    end

    Note over User,CWeb: 基本フロー 14 の続き 「庭オブジェクト」を表示する
    Form->>Garden: step が GARDEN になり、active が true
    Note right of Garden: 「鉢・庭材」のカテゴリは植物ではないので、<br/>「商品の高さ」だけを出し、3D は作らない
    Garden->>Prev: usePlantPreview(plant, fields, active)
    Prev->>Prev: useEffect が 400ms 待ち、firstInvalid() で入力を<br/>確かめ、modelPreviewUrl(profile) を作る
    Note right of Prev: 高さが空なら、profile の既定の高さで仮表示する
    Prev-->>Preview: pending の URL
    Preview->>CWeb: iframe の src で GET /model-preview?profile=...
    Note right of CWeb: Canvas の PlantPreviewPage が<br/>POST /api/model-assemblies/resolve で組み立てる。<br/>Canvas 側の処理は図では省略
    CWeb-->>Preview: onLoad
    Preview->>Prev: loaded(url)。700ms 後に shown を入れ替える
    Preview-->>User: 3D プレビュー、「AIで生成」、特徴の入力欄

    Note over User,CWeb: 基本フロー 15 植物の特徴を入力する (15a は詳細図 4)
    User->>Fields: 「植物の高さ」などの特徴を入力する
    Fields->>Plant: setHeight(value)、changeProfile(...)
    Plant-->>Prev: profile と height が変わる
    Prev->>Prev: 400ms 入力が止まったら新しい URL を作る
    Prev-->>Preview: pending の URL
    Preview->>CWeb: iframe で GET /model-preview?profile=...
    CWeb-->>Preview: onLoad
    Preview-->>User: 更新した 3D プレビュー

    Note over User,CWeb: 基本フロー 16〜17 「次へ」で庭オブジェクトを検証する
    User->>Form: 「次へ」をクリック
    Form->>Form: next() が validate(GARDEN)。<br/>firstInvalid() で model から始まる入力を確かめる
    opt 入力欄の検査を通った
        Form->>Plant: currentProfile()
        Plant-->>Form: 高さを入れた profile か throw Error
    end
    alt 17a 入力が不正 (高さが空、10〜1500cm の整数でないなど)
        Form->>Form: fail() が setError() と reveal()
        Form-->>User: 「植物の高さを入力してください。」<br/>「植物の高さは10〜1500cmの整数にしてください。」など。<br/>通信しない
    else 基本フロー 17 検査を通る
        Form->>Form: move(REVIEW)
        Form->>Review: ProductReview を表示
        Review->>CWeb: iframe で GET /model-preview?profile=...
        CWeb-->>Review: 3D モデル
        Note right of Review: 商品画像の img も GET /api/product-images/{id}<br/>で読む。図では省略
        Review-->>User: 「4 / 4」、「確認」に商品名、価格、登録店舗、在庫、<br/>カテゴリー、商品説明、画像、3D モデル、「出品する」
    end
```

## 詳細図 4 代替フロー 15a

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Plant as usePlantSuggestion.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Media as ProductMedia<br/>Controller
        participant Ctrl as PlantSuggestion<br/>Controller
        participant Auth as AuthService
        participant Svc as PlantSuggestion<br/>Service
        participant AiCli as PlantSuggestion<br/>Client
        participant Fitter as PlantSuggestion<br/>Fitter
        participant CModel as CanvasModel<br/>Client
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant OpenAI as OpenAI API
        participant CApi as Kusakari Canvas API
    end

    Note over User,CApi: 代替フロー 15a 「AIで生成」で特徴を推定する
    User->>Plant: 「AIで生成」をクリック<br/>(PlantPreview.jsx の onClick が suggest(draft))
    Plant->>Plant: 商品名が空でないか、高さが空か<br/>10〜1500 の整数かを確かめる
    alt 商品名が空、高さが不正 (記述にない)
        Plant-->>User: 「AIで生成する前に商品名を入力してください。」<br/>など (PlantPreview.jsx が表示)。通信しない
    else 確かめを通る
        Plant->>Media: photo(imageUrl) の fetch()<br/>GET /api/product-images/{id}
        Note right of Media: get() が ProductMediaService で<br/>product_media を読む。図では省略
        Media-->>Plant: 200 画像
        Plant->>Plant: dataUrl(blob) で data URL にする
        Plant->>Http: api.suggestPlantModel(input)
        Note right of Http: authFetch() が先に GET /api/auth/csrf を送る。図では省略
        Http->>Ctrl: POST /api/products/plant-model-suggestions<br/>name、latinName、category、description、<br/>heightCm、currentProfile、imageDataUrl
        Ctrl->>Ctrl: @Valid で PlantSuggestionRequest を検査
        Ctrl->>Auth: requireSellerRole()
        Auth-->>Ctrl: 戻る (店舗側のアカウントか運営)
        Ctrl->>Svc: suggest(input)
        Note right of Svc: @Transactional は無く、DB を使わない
        Svc->>Svc: image(input) で画像を検査し、<br/>slots.tryAcquire() で同時に 2 件までにする
        Svc->>AiCli: infer(INSTRUCTIONS, 商品情報の JSON, image)
        AiCli->>OpenAI: POST /v1/responses<br/>(json_schema の構造化出力、store は false)
        OpenAI-->>AiCli: status と output_text
        AiCli-->>Svc: profile と warnings の JSON
        Svc->>Svc: PlantModelProfile にし、高さと seed を入れ直し、<br/>Validator と小数の桁で検査する
        Svc->>Fitter: fit(profile)
        loop 組み立てられるまで (最大 4 回。2 回目からは葉・花・幹を小さくする)
            Fitter->>CModel: checkSuggestion(profile)
            CModel->>CApi: POST /api/model-assemblies/resolve
            CApi-->>CModel: 200 parts か 4xx INCOMPATIBLE_PLANT_DIMENSIONS
            CModel-->>Fitter: 戻る か ApiException(422, AI_MODEL_DIMENSIONS)
        end
        Fitter-->>Svc: 寸法を調整したか (true か false)
        Note over Ctrl,CApi: 上のどの段階でも ApiException が出ると、その時点で止まる
        alt 推定・組み立てができない、AI を使えない (記述にない)
            Svc--xHttp: ApiErrors が JSON にする (400 AI_INVALID_IMAGE、<br/>422 AI_PLANT_UNIDENTIFIED、AI_REFUSED、AI_MODEL_DIMENSIONS、<br/>429 AI_BUSY、AI_RATE_LIMITED、502 AI_INVALID_PROFILE ほか、<br/>503 AI_NOT_CONFIGURED、MODEL_SERVICE_UNAVAILABLE、504 AI_TIMEOUT)
            Http--xPlant: readResponse() が throw ApiError
            Plant-->>User: message を表示 (PlantPreview.jsx)。<br/>入力欄と 3D プレビューはそのまま
        else 15a-1 推定できた
            Svc-->>Ctrl: PlantSuggestionView (profile、estimated、warnings)
            Ctrl-->>Http: 200
            Http-->>Plant: result
            Plant->>Plant: setUndo(前の値)、setProfile(result.profile)、<br/>setTouched(true)、setHeightValue()、setWarnings()
            Plant-->>User: 特徴を入力欄に反映。「AIの推定を反映しました」の<br/>注意点と「AI設定を元に戻す」(PlantPreview.jsx が表示)
            Note right of User: 3D プレビューの更新は詳細図 3 と同じ。<br/>15a-2 基本フロー 16 へ
        end
    end
```

## 詳細図 5 基本フロー 18〜19

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as ProductForm.jsx
        participant Shop as useShop.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductEditor<br/>Controller
        participant Errs as ApiErrors
        participant Svc as ProductEditor<br/>Service
        participant Auth as AuthService
        participant CatSvc as CategoryService
        participant CModel as CanvasModel<br/>Client
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant CApi as Kusakari Canvas API
    end

    Note over Svc,Db: ProductSkuGenerator、CatalogService、各 Repository と EntityManager は<br/>ライフラインを省き、MySQL への矢印に呼ぶメソッドを書く

    Note over User,CApi: 基本フロー 18 「出品する」をクリックする
    User->>Form: 「確認」で「出品する」をクリック
    Form->>Form: onSubmit の save(event)、validate(null)
    Note right of Form: すべての手順の入力を確かめ直す。不正があれば<br/>その手順を開いて止まる (10a、14a、17a と同じ)。通信しない
    Form->>Shop: onSave('', productInput(values, storeId, currentProfile()))<br/>(ProductCreatePage が渡した saveProduct)
    Shop->>Shop: run(action)。busy にし、error と notice を消す
    Shop->>Http: api.createProduct(input)
    Note right of Http: authFetch() が先に GET /api/auth/csrf を送る。図では省略
    Http->>Ctrl: POST /api/products<br/>(sku は空、storeId、stock、heightCm、plantModelProfile ほか)

    Note over User,CApi: 基本フロー 19 入力内容を検証し、商品番号を採番して登録する
    Ctrl->>Ctrl: @Valid で ProductRequest を検査
    alt 19a @Valid の違反 (文字数、価格・在庫の範囲、画像の URL の形など)
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT
        Http--xShop: throw ApiError(400)
        Shop-->>Form: setError(message)。run() が false
        Form-->>User: ProductCreatePage が「入力内容・文字数・数値の範囲を<br/>確認してください。」を表示。「確認」のまま
    else 検査を通る
        Ctrl->>Svc: create(input)
        Note over Svc,CApi: クラスの @Transactional で create() 全体が 1 つのトランザクション。<br/>Canvas への問い合わせもこの中で行う
        Svc->>Auth: requireManager(storeId)
        alt 19b 権限がない (STAFF、ロールなし、運営が停止した店舗)
            Auth--xErrs: denied() が throw ApiException(403, FORBIDDEN)
            Errs-->>Http: business() が 403 と message
            Http--xShop: throw ApiError(403)
            Shop-->>Form: setError(message)。run() が false
            Form-->>User: 「この操作の権限がありません。」 商品を登録しない
        else オーナーか MANAGER
            Auth-->>Svc: 戻る
            Svc->>Db: catalog.requireStore() の existsById(storeId)
            Db-->>Svc: あり
            Svc->>CatSvc: require(category)
            CatSvc->>Db: CategoryRepository.share(name)<br/>SELECT ... FOR SHARE (@Lock PESSIMISTIC_READ)
            Db-->>CatSvc: 行 または 空
            alt 19a カテゴリが無いか削除済み
                CatSvc--xErrs: throw ApiException(400, INVALID_CATEGORY)
                Errs-->>Http: business() が 400 と message
                Http--xShop: throw ApiError(400)
                Shop-->>Form: setError(message)。run() が false
                Form-->>User: 「登録済みのカテゴリを選択してください。」
            else 登録済みのカテゴリ
                CatSvc-->>Svc: 戻る
                Svc->>Svc: stock が 1 以上か確かめ、mapper.toEntity(input)、<br/>setId(UUID)
                Note right of Svc: 在庫が 1 未満の 400 STOCK_REQUIRED は、<br/>画面の min が先に止めるので届かない
                Svc->>Svc: sku が空なので skus.next(storeId)<br/>(ProductSkuGenerator。KS-年月日-6 文字)
                Svc->>Db: existsByStoreIdAndSku(storeId, sku)
                Db-->>Svc: false (重なれば最大 5 回作り直し、<br/>だめなら 503 SKU_UNAVAILABLE)
                Svc->>Svc: resolveModel(product, input, null, true)
                opt plantModelProfile がある (植物の商品)
                    Note right of Svc: heightCm と profile の高さが違えば<br/>400 PLANT_HEIGHT_MISMATCH。画面からは届かない
                    Svc->>CModel: resolve(profile)
                    CModel->>CApi: POST /api/model-assemblies/resolve<br/>(受けた要求の KUSAKARI_SESSION Cookie と<br/>X-CSRF-TOKEN を付ける)
                    CApi-->>CModel: 200 構成 (parts)
                    CModel-->>Svc: JsonNode を modelComposition に入れる
                end
                alt Canvas に問い合わせられない、構成が空 (記述にない)
                    CModel--xErrs: throw ApiException(503, MODEL_SERVICE_UNAVAILABLE)<br/>か (502, INVALID_MODEL_RESPONSE)
                    Errs-->>Http: business() が 503 か 502 と message
                    Http--xShop: throw ApiError
                    Shop-->>Form: setError(message)。run() が false
                    Form-->>User: 「植物モデルを確定できません。Canvasの起動を<br/>確認して再試行してください。」など
                else 基本フロー 19 登録できる
                    Svc->>Db: saveProduct() の persist(product) と flush()<br/>INSERT products、product_images
                    Note right of Db: 同時の登録で uk_products_store_sku に当たると、<br/>DataIntegrityViolationException を 409 SKU_EXISTS にする。<br/>図では省略
                    Db-->>Svc: OK
                    Svc->>Db: inventory.save(new InventoryEntity(id, stock))<br/>INSERT inventory (publication_status は PUBLISHED)
                    Db-->>Svc: OK
                    opt modelComposition がある
                        Svc->>Db: linkMaterial() の materials.save()<br/>INSERT material_products (product.{id})
                        Db-->>Svc: OK
                    end
                    Svc->>Db: catalog.product(id) が商品、在庫、店舗の状態を読む
                    Db-->>Svc: 行
                    Svc-->>Ctrl: ProductView (sku を含む)。コミット
                    Ctrl-->>Http: 200 ProductView
                    Http-->>Shop: created
                    Note over Shop: 基本フロー 20 は詳細図 6
                end
            end
        end
    end
```

## 詳細図 6 基本フロー 20

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as ProductForm.jsx
        participant Shop as useShop.js
        participant Http as api.js
        participant Work as Workspace.jsx
        participant Mgr as ProductManager.jsx
        participant Cat as useSellerCatalog.js
        participant Hook as useResource.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CartCtrl as Cart<br/>Controller
        participant CatalogCtrl as Catalog<br/>Controller
        participant SPC as SellerProduct<br/>Controller
    end

    Note over User,SPC: 基本フロー 20 「商品管理」画面に登録結果と商品番号を表示する
    Http-->>Shop: created (詳細図 5 の続き)
    Shop->>Http: refresh() の api.cart()
    Http->>CartCtrl: GET /api/cart
    CartCtrl--xHttp: CartSessionResolver.resolve() の requireBuyer() が<br/>403 BUYER_REQUIRED (店舗側のアカウント。ApiErrors が JSON にする)
    Http--xShop: throw ApiError(403)
    Shop->>Http: refused なので api.products()
    Http->>CatalogCtrl: GET /api/products
    CatalogCtrl-->>Http: 200 購入者に見える商品の一覧
    Http-->>Shop: setProducts()
    Shop->>Shop: setNotice('商品を保存しました。商品番号は {sku} です。')
    Shop-->>Form: run() が true
    Form->>Work: onDone() が navigate('/seller/products')<br/>(App.jsx の usePath() が path を変える)
    Work->>Mgr: ProductManager (embedded) を表示
    Mgr->>Cat: useSellerCatalog(shop)
    Cat->>Http: useEffect が api.sellerProducts(storeId)
    Http->>SPC: GET /api/seller/products?storeId={id}
    Mgr->>Hook: useResource('/seller/products/moderation?storeId={storeId}')
    Hook->>Http: useEffect の reload() が request()
    Http->>SPC: GET /api/seller/products/moderation?storeId={id}
    Note over SPC: Service から先は EC-S04 の詳細図 1 と同じ。図では省略
    SPC-->>Http: 200 登録した商品を含む一覧
    Http-->>Cat: setProducts()
    SPC-->>Http: 200 警告・停止の一覧
    Http-->>Hook: data
    Mgr-->>User: shop.notice「商品を保存しました。商品番号は KS-… です。」<br/>と、登録した商品を含む商品一覧
```

## ユースケース記述との差

- 画面の文言は、記述の「カテゴリ」が「カテゴリー」、「在庫数」が「選択店舗の在庫」、「税込価格」が「税込価格（円）」です。基本フロー 11 のボタンは、画像が 1 枚も無いときは「商品の写真を選択」で、1 枚以上あると「画像を追加」になります。
- 関連情報には「「商品管理」画面の上部で選んだ店舗に商品を登録する」とあります。コードでは、「商品登録」画面の「商品情報」に「在庫を登録する店舗」（`StorePicker`）があり、ここで店舗を選び直せます。初めは「商品管理」で選んだ店舗で、選び直すと `shop.setSellerStoreId()` で「商品管理」の店舗も変わります。
- 10a、14a、17a は、すべて画面（`ProductForm.jsx` の `validate()`）だけで止まり、通信しません。サーバーにも同じ検査（400 `STOCK_REQUIRED`、400 `PLANT_HEIGHT_MISMATCH`）がありますが、画面が先に止めるので、画面からは届きません。
- 12a の枚数・形式・大きさは、まず画面（`ProductImages.upload()`）が確かめ、通信しません。サーバーは `ProductMediaService.upload()` で、先頭のバイトから形式を判定し、ファイルの `Content-Type` と違えば 400 `INVALID_IMAGE` にします。複数のファイルを選ぶと 1 枚ずつ送り、失敗するとそこで止めます。それまでに保存した画像は残ります。5MB を超えるファイルの 413 `IMAGE_TOO_LARGE` は、画面が先に止めるので届きません。
- 記述にない処理として、画像はファイルを選んだ時点で `product_media` に保存されます。商品を登録しなかったときにその画像を消す処理は、コードに見つかりません。
- 記述にない処理として、「庭オブジェクト」と「確認」では、iframe で Kusakari Canvas の 3D プレビュー画面（`/model-preview`）を開きます。「鉢・庭材」のカテゴリでは 3D を作らず、「商品の高さ」だけを入力します。
- 15a には、失敗したときの代替フローが記述にありません。コードでは、商品名が空だと通信せずに「AIで生成する前に商品名を入力してください。」を出します。サーバーからは 400、422、429、502、503、504 のエラーが返ることがあり、画面は message を出して入力を保ちます。推定の後で「AI設定を元に戻す」を押すと、推定の前の値に戻せます。
- 15a-1 の「1枚目の商品画像と商品情報から推定」は、ブラウザーが `GET /api/product-images/{id}` で 1 枚目の画像を読み、data URL にして送る形です。EC API は OpenAI の `POST /v1/responses` で推定した後、Canvas API の `POST /api/model-assemblies/resolve` で組み立てられるかを確かめます。組み立てられなければ、葉・花・幹の大きさを最大 3 回小さくして確かめ直します。
- 19 の商品番号は、`ProductSkuGenerator.next()` が `KS-年月日-6 文字` の形で作り、店舗の中で重ならないものを最大 5 回まで作り直します。作れなければ 503 `SKU_UNAVAILABLE` です。同時の登録で一意制約（`uk_products_store_sku`）に当たると 409 `SKU_EXISTS` になります。
- 記述にない処理として、植物の商品は、登録のトランザクションの中で Canvas API に構成を問い合わせ、`model_composition` に保存します。Canvas に接続できないと 503 `MODEL_SERVICE_UNAVAILABLE` で登録しません。この問い合わせは、カテゴリの共有ロック（`SELECT ... FOR SHARE`）を持ったまま行います。
- 19a でサーバーから届くのは、`@Valid` の違反（400 `INVALID_INPUT`）と、カテゴリが無いか削除済みのとき（400 `INVALID_CATEGORY`「登録済みのカテゴリを選択してください。」）です。新しい商品のカテゴリの初めの値は「庭木」（`productDraft.js` の `emptyProduct`）です。エラーは「確認」の上に出て、出店者は「前の手順へ」で戻ります。
- 19b の STAFF とロールなしの担当者も、「新しい商品」から「商品登録」画面を開け、画像の保存と「AIで生成」まで使えます。どちらも `AuthService.requireSellerRole()` で店舗側のアカウントかだけを確かめるためです。止まるのは「出品する」の後です。
- 事後条件の「公開中」は、`InventoryEntity` の `publicationStatus` の初めの値 `PUBLISHED` で `inventory` に INSERT することで満たします。`inventory.publication_status` の列の既定値は `HIDDEN` です。
- 記述にない処理として、登録の後に `useShop.js` の `refresh()` が `GET /api/cart` と `GET /api/products` を送ります。店舗側のアカウントでは `GET /api/cart` が 403 `BUYER_REQUIRED` になり、購入者向けの商品一覧だけを取り直します。

## 確かめられなかったこと

- iframe の中の Kusakari Canvas の画面（`PlantPreviewPage`）の処理は、Canvas API を呼ぶところまでしか読んでいません。iframe の中でのログインの扱いは追っていません。
- OpenAI の応答は、`PlantSuggestionClient` が送る要求と、読み取る項目（`status`、`output`、`output_text`、`refusal`）だけを見ました。実際の応答は確かめていません。
- 同時の登録で 409 `SKU_EXISTS` になることは、コードから読んだだけで、動かして確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`ProductManager` と `ProductCreatePage` の表示
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductManager.jsx): `ProductManager`（「新しい商品」、`shop.notice` の表示）
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/useSellerCatalog.js): `useEffect` の `api.sellerProducts()`
- [frontend/src/workspace/ProductCreatePage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ProductCreatePage.jsx): `ProductCreatePage`（`StorePicker`、`onSave={shop.saveProduct}`、`onDone`）
- [frontend/src/components/ProductForm.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductForm.jsx): `validate()`、`next()`、`move()`、`fail()`、`save()`
- [frontend/src/components/ProductInfoFields.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductInfoFields.jsx): 入力欄（`min={p.id ? 0 : 1}` など）、`change()`
- [frontend/src/components/CategoryPicker.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CategoryPicker.jsx): `useResource('/categories')`、`choose()`
- [frontend/src/components/StorePicker.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/StorePicker.jsx): 「在庫を登録する店舗」
- [frontend/src/formValidity.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/formValidity.js): `firstInvalid()`
- [frontend/src/productDraft.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/productDraft.js): `emptyProduct`、`createDraft()`、`productInput()`
- [frontend/src/components/ProductImages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductImages.jsx): `upload()`、`change()`
- [frontend/src/components/ProductGardenStep.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductGardenStep.jsx): `ProductGardenStep`
- [frontend/src/components/PlantModelFields.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/PlantModelFields.jsx): 「植物の高さ」（`modelHeight`）ほかの入力欄
- [frontend/src/components/usePlantSuggestion.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/usePlantSuggestion.js): `suggest()`、`photo()`、`dataUrl()`、`currentProfile()`、`restore()`
- [frontend/src/components/usePlantPreview.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/usePlantPreview.js): `usePlantPreview`（`PREVIEW_DELAY_MS`、`loaded()`）
- [frontend/src/components/PlantPreview.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/PlantPreview.jsx): iframe、「AIで生成」、「AI設定を元に戻す」
- [frontend/src/plantModel.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/plantModel.js): `modelPreviewUrl()`、`isPlantCategory()`
- [frontend/src/components/ProductReview.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductReview.jsx): `ProductReview`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `saveProduct()`、`run()`、`refresh()`、`setSellerStoreId()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource` の `reload()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `uploadProductImage()`、`suggestPlantModel()`、`createProduct()`、`sellerProducts()`、`cart()`、`products()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list()`、`moderation()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `list()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductMediaController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductMediaController.java): `upload()`、`get()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductMediaService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductMediaService.java): `upload()`、`get()`、`detect()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/PlantSuggestionController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/PlantSuggestionController.java): `suggest()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionService.java): `suggest()`、`image()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionClient.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionClient.java): `infer()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionFitter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/PlantSuggestionFitter.java): `fit()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CanvasModelClient.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CanvasModelClient.java): `resolve()`、`checkSuggestion()`
- [backend/src/main/java/jp/kusakari/ec/common/CanvasClientConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/CanvasClientConfiguration.java): `canvasClient()`（Cookie と CSRF の見出しを引き継ぐ）
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductEditorController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductEditorController.java): `create()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductEditorService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductEditorService.java): `create()`、`resolveModel()`、`linkMaterial()`、`saveProduct()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductSkuGenerator.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductSkuGenerator.java): `next()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `require()`、`list()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `share()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `requireStore()`、`product()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `existsByStoreIdAndSku()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java): `publicationStatus = PUBLISHED`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductRequest.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductRequest.java): 検査の注釈
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireManager()`、`requireSellerRole()`、`requireBuyer()`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CatalogController.java): `products()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`imageTooLarge()`、`conflict()`
- [backend/src/main/resources/application.properties](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/application.properties): `spring.servlet.multipart.max-file-size`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `products`（`uk_products_store_sku`）、`inventory`、`product_images`、`product_media`、`material_products`
- [backend/src/main/resources/db/migration/V2__sample_data.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V2__sample_data.sql): `categories` の初めの行
- [frontend/src/pages/App.jsx](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/pages/App.jsx): kusakari-canvas の `/model-preview` の表示
- [frontend/src/pages/PlantPreviewPage.jsx](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/pages/PlantPreviewPage.jsx): kusakari-canvas の `PlantPreviewPage`（`POST /api/model-assemblies/resolve`）
- [backend/kusakari_canvas_api/main.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/main.py): kusakari-canvas の `/api/model-assemblies/resolve`
