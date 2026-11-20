# EC-A09 商品カテゴリを削除する

- ユースケース記述: [EC-A09_商品カテゴリを削除する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A09_商品カテゴリを削除する.md>)
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
    Page-->>User: カテゴリの一覧 (カテゴリごとに「編集」「削除」)

    Note over User,Db: 基本フロー 3〜4 「削除」をクリックし、確認のダイアログを表示する (通信しない)
    User->>Page: 削除するカテゴリの「削除」をクリック
    Page-->>User: 「カテゴリ削除の確認」ダイアログ<br/>「削除を確定」「取消」

    Note over User,Db: 基本フロー 5 「削除を確定」をクリックする
    alt 5a 削除を取り消す
        User->>Page: 「取消」をクリック
        Page-->>User: ダイアログを閉じた一覧 (通信しない)
    else 削除を確定する
        User->>Page: 「削除を確定」をクリック
        Note over Page,Api: 書き込みの前に GET /api/auth/csrf を送る。図では省略
        Page->>Api: DELETE /api/operator/categories/{name}

        Note over User,Db: 基本フロー 6 カテゴリを削除する
        Api->>Api: 運営者か確かめる
        Api->>Db: カテゴリの行をロックして読む
        Db-->>Api: 行 または なし
        alt カテゴリがない (ほかの人が削除した)
            Api-->>Page: 404 CATEGORY_NOT_FOUND
            Page->>Api: GET /api/categories
            Api-->>Page: 200 最新の一覧
            Page-->>User: ダイアログを閉じ、<br/>「カテゴリが見つかりません。」、最新の一覧
        else カテゴリがある
            Api->>Db: 削除されていない商品が<br/>このカテゴリを使っているか調べる
            Db-->>Api: 結果
            alt 6a 商品で使用中
                Api-->>Page: 409 CATEGORY_IN_USE
                Page->>Api: GET /api/categories
                Api-->>Page: 200 最新の一覧
                Page-->>User: ダイアログを閉じ、「商品で使用中のカテゴリは削除できません。<br/>先に該当商品を別のカテゴリへ移してください。」、最新の一覧
            else 削除できる
                Api->>Db: 削除済みの商品が<br/>このカテゴリを持っているか調べる
                Db-->>Api: 結果
                alt 削除済みの商品だけが持っている
                    Api->>Db: 行を残し、deleted_at に今の時刻を入れる
                    Db-->>Api: OK
                else どの商品も持っていない
                    Api->>Db: カテゴリの行を削除
                    Db-->>Api: OK
                end
                Api-->>Page: 200 deleted=true
                Page->>Api: GET /api/categories
                Api-->>Page: 200 最新の一覧
                Page-->>User: ダイアログを閉じ、<br/>「カテゴリを削除しました。」、対象を除いた一覧
            end
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

    Note over User,Db: 基本フロー 2 カテゴリの一覧を表示する
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
    Page-->>User: カテゴリの一覧<br/>(カテゴリごとに「編集」「削除」)
```

## 詳細図 2 基本フロー 3〜6

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as CategoriesPage<br/>OperatorPages.jsx
        participant Dlg as ConfirmDialog.jsx
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

    Note over User,Db: 基本フロー 3〜4 「削除」をクリックし、確認のダイアログを表示する (通信しない)
    User->>Page: 削除するカテゴリの「削除」をクリック
    Page->>Page: onClick が setDeleting(name)
    Page->>Dlg: deleting があるので ConfirmDialog を表示<br/>(title「カテゴリ削除の確認」、confirmLabel「削除を確定」)
    Dlg-->>User: 「カテゴリ「(名前)」を削除します。」<br/>「削除を確定」「取消」

    Note over User,Db: 基本フロー 5 「削除を確定」をクリックする
    alt 5a 削除を取り消す
        User->>Dlg: 「取消」をクリック
        Note right of Dlg: Esc、「閉じる」(×)、ダイアログの外の<br/>クリックも onClose() から onCancel() を呼ぶ
        Dlg->>Page: onCancel()
        Page->>Page: setDeleting('') でダイアログを閉じる
        Page-->>User: 一覧 (通信しない)
    else 削除を確定する
        User->>Dlg: 「削除を確定」をクリック
        Dlg->>Page: onConfirm() が remove()
        Page->>Hook: run(action, 'カテゴリを削除しました。')
        Note right of Hook: 実行中は busy が true になり、<br/>ダイアログのボタンを押せない
        Hook->>Http: action() の write('/operator/categories/'<br/>+ encodeURIComponent(deleting), 'DELETE')
        Note right of Http: send() の authFetch() (auth.js) が先に<br/>GET /api/auth/csrf を送る。図では省略
        Http->>Ctrl: DELETE /api/operator/categories/{name}

        Note over User,Db: 基本フロー 6 カテゴリを削除する
        Ctrl->>Svc: delete(name)
        Note over Svc,Db: クラスの @Transactional で delete() 全体が 1 つのトランザクション
        Svc->>Auth: requireAdmin()
        Note right of Auth: ADMIN でなければ<br/>ApiException(403, FORBIDDEN)。図では省略
        Auth-->>Svc: 戻る
        Svc->>CatRepo: lock(name)
        CatRepo->>Db: SELECT ... FOR UPDATE<br/>(@Lock PESSIMISTIC_WRITE)
        Db-->>CatRepo: 行 または 空
        CatRepo-->>Svc: Optional の CategoryEntity
        alt カテゴリがない (空、または isAvailable() が false)
            Svc--xErrs: orElseThrow(notFound) の<br/>ApiException(404, CATEGORY_NOT_FOUND)
            Errs-->>Http: business() が 404 と message
            Http--xHook: readResponse() が throw ApiError(404)
            Hook->>Http: 404 なので reload() が<br/>request('/categories')
            Http->>Ctrl: GET /api/categories
            Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
            Http-->>Hook: data
            Hook-->>Page: run() が false。data と error を更新する
            Page->>Page: remove() が setDeleting('')
            Page-->>User: ダイアログを閉じ、<br/>「カテゴリが見つかりません。」、最新の一覧
        else カテゴリがある
            Svc->>ProdRepo: isCategoryInUse(name)
            ProdRepo->>Db: SELECT count(products)<br/>(inventory の publication_status が<br/>DELETED の商品を除く)
            Db-->>ProdRepo: 件数
            ProdRepo-->>Svc: true または false
            alt 6a 商品で使用中 (true)
                Svc--xErrs: throw ApiException(409, CATEGORY_IN_USE)
                Errs-->>Http: business() が 409 と message
                Http--xHook: throw ApiError(409)
                Hook->>Http: 409 なので reload() が<br/>request('/categories')
                Http->>Ctrl: GET /api/categories
                Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
                Http-->>Hook: data
                Hook-->>Page: run() が false。data と error を更新する
                Page->>Page: remove() が setDeleting('')
                Page-->>User: ダイアログを閉じ、「商品で使用中のカテゴリは削除できません。<br/>先に該当商品を別のカテゴリへ移してください。」、最新の一覧
            else 削除できる (false)
                Svc->>ProdRepo: existsByCategory(name)
                ProdRepo->>Db: SELECT (category_name が同じ商品)
                Db-->>ProdRepo: 有無
                ProdRepo-->>Svc: true または false
                alt 削除済みの商品だけが持っている (true)
                    Svc->>Svc: category.setDeletedAt(Instant.now())
                    Note right of Svc: save() は呼ばない。コミットのときに<br/>変更を見つけて UPDATE を送る
                else どの商品も持っていない (false)
                    Svc->>CatRepo: delete(category)
                    CatRepo->>Db: DELETE (コミットのときに送る)
                    Db-->>CatRepo: OK
                    CatRepo-->>Svc: 戻る
                end
                Svc-->>Ctrl: 戻る (コミット)
                Ctrl-->>Http: 200 deleted=true
                Http-->>Hook: data
                Hook->>Http: reload() が request('/categories')
                Http->>Ctrl: GET /api/categories
                Ctrl-->>Http: 200 最新の一覧 (Service から先は図では省略)
                Http-->>Hook: data
                Hook-->>Page: run() が true。data と<br/>notice「カテゴリを削除しました。」
                Page->>Page: remove() が setDeleting('')
                Page-->>User: ダイアログを閉じ、<br/>「カテゴリを削除しました。」、対象を除いた一覧
            end
        end
    end
```

## ユースケース記述との差

- 5a の取り消しは「取消」ボタンのほかに、Esc キー、ダイアログの「閉じる」（×）ボタン、ダイアログの外のクリックでもできます（`Dialog.jsx` の `onClose`）。どれも通信しません。
- 6a の「商品が紐づいている」は、`ProductRepository.isCategoryInUse()` で判定します。在庫の行（`inventory`）の `publication_status` が `DELETED` でない商品が 1 つでもあれば使用中です。販売中（`PUBLISHED`）だけでなく非表示（`HIDDEN`）の商品も含みます。ダイアログの文「販売中・非表示の商品が登録されているカテゴリは削除できません。」と合っています。
- 6a のあと、画面は一覧を取り直し、ダイアログを閉じて、エラーの文と「再取得」ボタンを一覧の上に出します。記述の「一覧を再表示する」はこの取り直しです。
- 記述にない処理として、次の 2 つがあります。
  - 削除済みの商品だけがこのカテゴリを持っているときは、行を消さずに `deleted_at` に今の時刻を入れます。`products.category_name` は `categories(name)` への外部キー（`fk_products_category`）なので、参照が残る行は消せないためです。この行は一覧と商品登録の選択肢に出ません。同じ名前を EC-A07 で追加すると、この行が元に戻ります。
  - ダイアログを開いている間にほかの運営者がそのカテゴリを削除していると、404 `CATEGORY_NOT_FOUND`「カテゴリが見つかりません。」を表示し、一覧を取り直します。
- 記述にない処理として、削除の前に `GET /api/auth/csrf` で CSRF トークンを取ります。運営者でない会員の要求は `AuthService.requireAdmin()` が 403 `FORBIDDEN` にします。

## 確かめられなかったこと

- カテゴリ名に `/` や `%` などがあるときの削除は、動かして確かめていません。画面は名前を `encodeURIComponent()` でパスに入れるので、`/` は `%2F`、`%` は `%25` になります。Spring Security の既定の `StrictHttpFirewall` は、パスの中のこれらを拒否します。EC-A07 では名前を本文で送るので、こうした名前のカテゴリは追加できても、削除できない可能性があります。このときの応答と画面の表示も確かめていません。

## 参照したコード

- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink` の `follow()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `App`（`Workspace` に `path` を渡す）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage` の `remove()`、`deleting`、`ConfirmDialog` に渡す値
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ConfirmDialog.jsx): `ConfirmDialog`（「取消」、`onConfirm`、`onCancel`）
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): `Dialog` の `onCancel`、`onClick`、「閉じる」ボタン
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource` の `reload()`、`run()`、`write()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `list()`、`delete()`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list()`、`delete()`、`notFound()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull()`、`lock()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `isCategoryInUse()`、`existsByCategory()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable()`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `categories`、`products` の `fk_products_category`、`inventory` の `publication_status`
