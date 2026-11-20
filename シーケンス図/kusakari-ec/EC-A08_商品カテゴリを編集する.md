# EC-A08 商品カテゴリを編集する

- ユースケース記述: [EC-A08_商品カテゴリを編集する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A08_商品カテゴリを編集する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as カテゴリ管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)

    Note over User,Db: 基本フロー 1〜2 画面を開いて一覧と入力欄を表示する
    User->>Page: 管理者画面のサイドバーで<br/>「カテゴリ管理」をクリック (EC-C02)
    Page->>Api: GET /api/categories
    Api->>Db: 削除されていないカテゴリを読む
    Db-->>Api: categories の行
    Api-->>Page: 200 カテゴリ名の配列 (文字コード順)
    Page-->>User: 「カテゴリ名」入力欄とカテゴリの一覧

    Note over User,Db: 基本フロー 3〜4 編集するカテゴリを選ぶ (通信しない)
    User->>Page: 対象カテゴリの「編集」をクリック
    Page-->>User: 「カテゴリ名」入力欄に今のカテゴリ名

    Note over User,Db: 基本フロー 5〜6 カテゴリ名を編集して「保存」をクリックする
    User->>Page: カテゴリ名を編集し「保存」をクリック
    Note right of Page: 7a のうち空欄はブラウザーが止める。<br/>31 文字目は入力欄に入らない。通信しない
    Note over Page,Api: 書き込みの前に GET /api/auth/csrf を送る。図では省略
    Page->>Api: PUT /api/operator/categories<br/>previous は元の名前、name は入力値

    Note over User,Db: 基本フロー 7 カテゴリ名を検証する
    Api->>Api: 入力を検査 (空白だけでないか、30 文字以内か)
    alt 7a 空白だけ、または 30 文字を超える
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Api->>Api: 運営者か確かめ、前後の空白を取り除く
        Note right of Api: 元の名前と同じなら何も変えずに<br/>200 saved=true を返す。図では省略
        Api->>Db: 新しい名前の行をロックして読む
        Db-->>Api: 行 または なし
        alt 7a 同じ名前のカテゴリがある (削除されていない行)
            Api-->>Page: 409 CATEGORY_EXISTS
            Page->>Api: GET /api/categories
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「同じカテゴリがあります。」、最新の一覧<br/>入力欄はそのまま
        else 新しい名前は使われていない
            Api->>Db: 元の名前の行をロックして読む
            Db-->>Api: 行 または なし
            alt 編集中のカテゴリがない (ほかの人が削除した)
                Api-->>Page: 404 CATEGORY_NOT_FOUND
                Page->>Api: GET /api/categories
                Api-->>Page: 200 最新の一覧
                Page-->>User: 「カテゴリが見つかりません。」、最新の一覧
            else 基本フロー 8 変更できる
                Api->>Db: 新しい名前の行を追加<br/>(削除済みの同じ名前の行なら deleted_at を空に戻す)
                Db-->>Api: OK
                Api->>Db: 元の名前を持つ商品のカテゴリ名を<br/>新しい名前に変える
                Db-->>Api: 更新した件数
                Api->>Db: 元の名前の行を削除
                Db-->>Api: OK
                Api-->>Page: 200 saved=true
                Page->>Api: GET /api/categories
                Api-->>Page: 200 最新の一覧
                Page-->>User: 「保存しました。」、空の入力欄、最新の一覧
            end
        end
    end
```

## 詳細図 1 基本フロー 1〜4

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Menu as PageLink<br/>Common.jsx
        participant Nav as navigation.js
        participant App as App.jsx
        participant Work as Workspace.jsx
        participant Page as CategoriesPage<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Category<br/>Controller
        participant Svc as CategoryService
        participant Repo as Category<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a、*b を適用。どの要求も、ログイン中なら<br/>SessionValidityFilter が会員を確かめる。図では省略

    Note over User,Db: 基本フロー 1 管理者画面のメニュー「カテゴリ管理」を開く
    Note right of User: 共通ヘッダーの「管理者画面」から<br/>サイドバーを出すまでは EC-C02。図では省略
    User->>Menu: サイドバーの「カテゴリ管理」をクリック<br/>(WorkspaceSidebar.jsx の MenuLink)
    Menu->>Nav: follow() が navigate('/operator/categories')
    Nav->>App: pushState と popstate。<br/>usePath() が path を更新する
    App->>Work: Workspace に path を渡す
    Work->>Work: session.accountType が ADMIN か確かめる
    Note right of Work: ADMIN でなければ「この画面を利用する<br/>権限がありません。」を出す。図では省略
    Work->>Page: path が /operator/categories なので<br/>CategoriesPage を表示

    Note over User,Db: 基本フロー 2 カテゴリの一覧と入力欄を表示する
    Page->>Hook: useResource('/categories')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/categories')
    Http->>Ctrl: GET /api/categories
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Repo: findByDeletedAtIsNull()
    Repo->>Db: SELECT ... WHERE deleted_at IS NULL
    Db-->>Repo: 行
    Repo-->>Svc: CategoryEntity のリスト
    Svc->>Svc: getName() を sorted() で並べる
    Svc-->>Ctrl: カテゴリ名のリスト
    Ctrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page-->>User: 「カテゴリ名」入力欄、カテゴリごとの<br/>「編集」「削除」と一覧

    Note over User,Db: 基本フロー 3〜4 編集するカテゴリを選ぶ (通信しない)
    User->>Page: 対象カテゴリの「編集」をクリック
    Page->>Page: onClick が setEditing(name)
    Page->>Page: form の key が editing に変わるので作り直し、<br/>Input の defaultValue が name になる
    Page-->>User: 「カテゴリ名」入力欄に今のカテゴリ名
```

## 詳細図 2 基本フロー 5〜8

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as CategoriesPage<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Category<br/>Controller
        participant Errs as ApiErrors
        participant Svc as CategoryService
        participant Auth as AuthService
        participant CatRepo as Category<br/>Repository
        participant ProdRepo as Product<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 5〜6 カテゴリ名を編集して「保存」をクリックする
    User->>Page: カテゴリ名を編集し「保存」をクリック
    Note right of Page: 空欄は input の required で、31 文字目は<br/>maxLength で、ブラウザーが止める。通信しない
    Page->>Page: onSubmit の save(e)
    Page->>Hook: run(action)
    Hook->>Http: action() の write('/operator/categories',<br/>'PUT', previous は editing、name は入力値)
    Note right of Http: send() の authFetch() (auth.js) が先に<br/>GET /api/auth/csrf を送る。図では省略
    Http->>Ctrl: PUT /api/operator/categories

    Note over User,Db: 基本フロー 7 カテゴリ名を検証する
    Ctrl->>Ctrl: @Valid で Input を検査<br/>(@NotBlank、@Size(max = 30))
    alt 7a 空白だけ、または 30 文字を超える
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT
        Http--xHook: readResponse() が throw ApiError(400)
        Hook-->>Page: run() が false。error を設定する
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Ctrl->>Svc: save(previous, name)
        Note over Svc,Db: クラスの @Transactional で save() 全体が 1 つのトランザクション
        Svc->>Auth: requireAdmin()
        Note right of Auth: ADMIN でなければ<br/>ApiException(403, FORBIDDEN)。図では省略
        Auth-->>Svc: 戻る
        Svc->>Svc: input.trim()
        Note right of Svc: name.equals(previous) なら何もせずに戻り、<br/>200 saved=true になる。図では省略
        Svc->>CatRepo: lock(name)
        CatRepo->>Db: SELECT ... FOR UPDATE<br/>(@Lock PESSIMISTIC_WRITE)
        Db-->>CatRepo: 行 または 空
        CatRepo-->>Svc: Optional の CategoryEntity
        alt 7a 同じ名前のカテゴリがある (isAvailable() が true)
            Svc--xErrs: throw ApiException(409, CATEGORY_EXISTS)
            Errs-->>Http: business() が 409 と message
            Http--xHook: throw ApiError(409)
            Hook->>Http: 409 なので reload() が<br/>request('/categories')
            Http->>Ctrl: GET /api/categories
            Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
            Http-->>Hook: data
            Hook-->>Page: run() が false。data と error を更新する
            Page-->>User: 「同じカテゴリがあります。」、最新の一覧<br/>入力欄はそのまま
        else 新しい名前は使われていない
            Svc->>CatRepo: lock(previous)
            CatRepo->>Db: SELECT ... FOR UPDATE
            Db-->>CatRepo: 行 または 空
            CatRepo-->>Svc: Optional の CategoryEntity
            alt 編集中のカテゴリがない (空、または isAvailable() が false)
                Svc--xErrs: throw notFound() の ApiException(404, CATEGORY_NOT_FOUND)
                Errs-->>Http: business() が 404 と message
                Http--xHook: throw ApiError(404)
                Hook->>Http: 404 なので reload() が<br/>request('/categories')
                Http->>Ctrl: GET /api/categories
                Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
                Http-->>Hook: data
                Hook-->>Page: run() が false。data と error を更新する
                Page-->>User: 「カテゴリが見つかりません。」、最新の一覧
            else 基本フロー 8 変更できる
                Svc->>Svc: existing.orElseGet() で<br/>new CategoryEntity(name) か削除済みの行。<br/>setDeletedAt(null)
                Svc->>CatRepo: saveAndFlush(target)
                CatRepo->>Db: INSERT (削除済みの行なら UPDATE)
                Db-->>CatRepo: OK
                CatRepo-->>Svc: CategoryEntity
                Svc->>ProdRepo: renameCategory(previous, name)
                ProdRepo->>Db: UPDATE products SET category_name<br/>(@Modifying の JPQL)
                Db-->>ProdRepo: 更新した件数
                ProdRepo-->>Svc: 戻る
                Svc->>CatRepo: deleteById(previous)
                CatRepo->>Db: DELETE (コミットのときに送る)
                Db-->>CatRepo: OK
                CatRepo-->>Svc: 戻る
                Svc-->>Ctrl: 戻る (コミット)
                Ctrl-->>Http: 200 saved=true
                Http-->>Hook: data
                Hook->>Http: reload() が request('/categories')
                Http->>Ctrl: GET /api/categories
                Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
                Http-->>Hook: data
                Hook-->>Page: run() が true。data と notice「保存しました。」
                Page->>Page: setEditing('')、form.reset()
                Page-->>User: 「保存しました。」、空の入力欄、最新の一覧
            end
        end
    end
```

## ユースケース記述との差

- 7a の「空白のみの場合は『カテゴリ名を入力してください。』」は、コードと違います。空白だけの入力は `CategoryController.Input` の `@NotBlank` で止まり、`ApiErrors.invalid()` の「入力内容・文字数・数値の範囲を確認してください。」（400 `INVALID_INPUT`）を表示します。`CategoryService.save()` の「カテゴリ名を入力してください。」には届きません。
- 7a のうち空欄は、入力欄の `required` でブラウザーが止め、通信しません。30 文字を超える入力は、入力欄の `maxLength` で打てません。API を直接呼んだときだけ `@Size(max = 30)` で 400 `INVALID_INPUT` になります。
- `@NotBlank` の検査と `input.trim()` は、どちらも `String.trim()` で空白を判定します。コードから読むと、全角の空白（U+3000）だけの名前は 7a にならずに保存され、前後の全角の空白も取り除かれません。
- 記述にない処理として、次の 3 つがあります。
  - 前後の空白を取り除いた名前が元の名前と同じなら、何も変えずに 200 を返し、「保存しました。」を表示します。
  - 編集中にほかの運営者がそのカテゴリを削除していると、404 `CATEGORY_NOT_FOUND`「カテゴリが見つかりません。」を表示し、一覧を取り直します。
  - 新しい名前が削除済みのカテゴリ（`deleted_at` が入った行）と同じなら、その行を元に戻して使います。
- カテゴリ名は `categories` の主キーなので、名前の変更は「新しい名前の行を追加 → `products.category_name` を書き換え → 元の行を削除」の 3 つの SQL で行います。書き換えは削除済みの商品も含め、元の名前を持つすべての商品が対象です。関連情報の「そのカテゴリの商品にも新しいカテゴリ名が表示される」はこの書き換えによるものです。
- 基本フロー 8 には、保存のあとに入力欄を空にして編集をやめること（`setEditing('')`、`form.reset()`）が書かれていません。
- 画面には「編集を取消」ボタンがあり、押すと編集をやめて入力欄を空にします（`setEditing('')`、通信しない）。この操作は代替フローにありません。
- 記述にない処理として、保存の前に `GET /api/auth/csrf` で CSRF トークンを取ります。運営者でない会員の要求は `AuthService.requireAdmin()` が 403 `FORBIDDEN` にします。

## 確かめられなかったこと

- 2 人の運営者が同時に編集したときの動きは、動かして確かめていません。`save()` は新しい名前、元の名前の順に `lock()` で行をロックします。2 つの編集が互いの名前を入れ替えるような場合に、待ちやデッドロックになるか、`ApiErrors.conflict()` の 409 `DATA_CHANGED` になるかは、コードだけでは決められません。

## 参照したコード

- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink` の `follow()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `App`（`Workspace` に `path` を渡す）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage` の `save()`、`editing`、「編集」「編集を取消」の `onClick`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`、`defaultValue`）、`values()`、`ResourceStatus`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource` の `reload()`、`run()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `Input`、`list()`、`save()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list()`、`save()`、`notFound()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull()`、`lock()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `renameCategory()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable()`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`conflict()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `categories`、`products` の `fk_products_category`
