# EC-A07 商品カテゴリを追加する

- ユースケース記述: [EC-A07_商品カテゴリを追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A07_商品カテゴリを追加する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as カテゴリ管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)

    Note over User,Db: 基本フロー 1〜2 画面を開いて一覧を表示する
    User->>Page: 管理者画面のサイドバーで<br/>「カテゴリ管理」をクリック (EC-C02)
    Page->>Api: GET /api/categories
    Api->>Db: 削除されていないカテゴリを読む
    Db-->>Api: categories の行
    Api-->>Page: 200 カテゴリ名の配列 (文字コード順)
    Page-->>User: 「カテゴリ名」入力欄、「保存」「編集を取消」<br/>カテゴリの一覧

    Note over User,Db: 基本フロー 3〜4 カテゴリ名を入力して「保存」をクリックする
    User->>Page: 「カテゴリ名」に入力し「保存」をクリック
    Note right of Page: 4a 未入力ならブラウザーが<br/>必須入力のメッセージを出し、送信しない
    Note over Page,Api: 書き込みの前に GET /api/auth/csrf を送る。図では省略
    Page->>Api: PUT /api/operator/categories<br/>previous は空文字、name は入力値

    Note over User,Db: 基本フロー 5 カテゴリ名を検証する
    Api->>Api: 入力を検査 (空白だけでないか、30 文字以内か)
    alt 5a カテゴリ名が空白だけ
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Api->>Api: 運営者か確かめ、前後の空白を取り除く
        Api->>Db: 同じ名前の行をロックして読む
        Db-->>Api: 行 または なし
        alt 5b 同じ名前のカテゴリがある (削除されていない行)
            Api-->>Page: 409 CATEGORY_EXISTS
            Page->>Api: GET /api/categories
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「同じカテゴリがあります。」、最新の一覧<br/>入力欄はそのまま
        else 基本フロー 6 追加できる
            Api->>Db: カテゴリを追加<br/>(削除済みの同じ名前の行なら deleted_at を空に戻す)
            Db-->>Api: OK
            Api-->>Page: 200 saved=true
            Page->>Api: GET /api/categories
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「保存しました。」、空の入力欄、最新の一覧
        end
    end
```

## 詳細図 1 基本フロー 1〜2

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

    Note over User,Db: 基本フロー 2 入力欄、ボタン、カテゴリの一覧を表示する
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
    Page-->>User: 「カテゴリ名」入力欄 (maxLength 30)、<br/>「保存」「編集を取消」、カテゴリの一覧
```

## 詳細図 2 基本フロー 3〜6

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
        participant Repo as Category<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 3〜4 カテゴリ名を入力して「保存」をクリックする
    User->>Page: 「カテゴリ名」に入力し「保存」をクリック
    Note right of Page: 4a 未入力なら input の required で<br/>ブラウザーが送信を止める。save() は呼ばれない
    Page->>Page: onSubmit の save(e)
    Page->>Hook: run(action)
    Hook->>Http: action() の write('/operator/categories',<br/>'PUT', previous は空文字、name は入力値)
    Note right of Http: send() の authFetch() (auth.js) が先に<br/>GET /api/auth/csrf を送る。図では省略
    Http->>Ctrl: PUT /api/operator/categories

    Note over User,Db: 基本フロー 5 カテゴリ名を検証する
    Ctrl->>Ctrl: @Valid で Input を検査<br/>(@NotBlank、@Size(max = 30))
    alt 5a カテゴリ名が空白だけ (@NotBlank 違反)
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT
        Http--xHook: readResponse() が throw ApiError(400)
        Hook-->>Page: run() が false。error を設定する
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Ctrl->>Svc: save(previous, name)
        Note over Svc,Db: クラスの @Transactional で save() 全体が 1 つのトランザクション
        Svc->>Auth: requireAdmin()
        Note right of Auth: current() で会員を読み、ADMIN でなければ<br/>ApiException(403, FORBIDDEN)。図では省略
        Auth-->>Svc: 戻る
        Svc->>Svc: input.trim()
        Note right of Svc: name.isEmpty() の 400 INVALID_CATEGORY は、<br/>@NotBlank が先に止めるので届かない
        Svc->>Repo: lock(name)
        Repo->>Db: SELECT ... FOR UPDATE<br/>(@Lock PESSIMISTIC_WRITE)
        Db-->>Repo: 行 または 空
        Repo-->>Svc: Optional の CategoryEntity
        alt 5b 同じ名前のカテゴリがある (isAvailable() が true)
            Svc--xErrs: throw ApiException(409, CATEGORY_EXISTS)
            Errs-->>Http: business() が 409 と message
            Http--xHook: throw ApiError(409)
            Hook->>Http: 409 なので reload() が<br/>request('/categories')
            Http->>Ctrl: GET /api/categories
            Note over Ctrl,Db: 一覧の取得は詳細図 1 と同じ。図では省略
            Ctrl-->>Http: 200 最新の一覧
            Http-->>Hook: data
            Hook-->>Page: run() が false。data と error を更新する
            Page-->>User: 「同じカテゴリがあります。」、最新の一覧<br/>入力欄はそのまま
        else 基本フロー 6 追加できる
            Svc->>Svc: existing.orElseGet() で<br/>new CategoryEntity(name) か削除済みの行。<br/>setDeletedAt(null)
            Svc->>Repo: saveAndFlush(target)
            Repo->>Db: INSERT (削除済みの行なら UPDATE)
            Db-->>Repo: OK
            Repo-->>Svc: CategoryEntity
            Note right of Svc: previous が空文字なので、<br/>商品のカテゴリ名の変更はしない
            Svc-->>Ctrl: 戻る (コミット)
            Ctrl-->>Http: 200 saved=true
            Http-->>Hook: data
            Hook->>Http: reload() が request('/categories')
            Http->>Ctrl: GET /api/categories
            Note over Ctrl,Db: 一覧の取得は詳細図 1 と同じ。図では省略
            Ctrl-->>Http: 200 最新の一覧
            Http-->>Hook: data
            Hook-->>Page: run() が true。data と notice「保存しました。」
            Page->>Page: setEditing('')、form.reset()
            Page-->>User: 「保存しました。」、空の入力欄、最新の一覧
        end
    end
```

## ユースケース記述との差

- 基本フロー 2 の「名前順」は、`CategoryService.list()` が `String` を `sorted()` で並べた順です。文字コードの順なので、読みの五十音順にはなりません。
- 5a の空白だけの入力は、`CategoryController.Input` の `@NotBlank` で止まり、`ApiErrors.invalid()` の「入力内容・文字数・数値の範囲を確認してください。」になります。記述どおりです。`CategoryService.save()` にある「カテゴリ名を入力してください。」（400 `INVALID_CATEGORY`）は、この経路では届きません。
- `@NotBlank` の検査と `input.trim()` は、どちらも `String.trim()` で空白を判定します。`String.trim()` は全角の空白（U+3000）を取り除かないため、コードから読むと、全角の空白だけのカテゴリ名は 5a にならずに保存されます。前後の全角の空白も取り除かれません。関連情報の「前後の空白を取り除いて保存する」は半角の空白だけに当てはまります。
- 記述にない処理として、削除済みの同じ名前の行（`deleted_at` が入った行）があると、新しい行を作らずにその行の `deleted_at` を空に戻します（EC-A09 で、削除済みの商品だけが使っていたカテゴリは行を残すため）。
- 記述にない処理として、保存の前に `GET /api/auth/csrf` で CSRF トークンを取ります。運営者でない会員の要求は `AuthService.requireAdmin()` が 403 `FORBIDDEN` にします。画面は `Workspace.jsx` が運営者以外にこの画面を出しません。

## 確かめられなかったこと

- 2 人の運営者が同じ名前を同時に追加したときの動きは、動かして確かめていません。まだ無い行への `lock(name)`（`SELECT ... FOR UPDATE`）で待つのか、主キーの重複で `DataIntegrityViolationException` になり `ApiErrors.conflict()` の 409 `DATA_CHANGED` になるのかは、コードだけでは決められません。

## 参照したコード

- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink` の `follow()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `App`（`Workspace` に `path` を渡す）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage` の `save()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`）、`values()`、`ResourceStatus`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource` の `reload()`、`run()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `Input`、`list()`、`save()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list()`、`save()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull()`、`lock()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable()`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin()`、`current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`conflict()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `categories`
