# EC-A09 商品カテゴリを削除する

- ユースケース記述: [EC-A09_商品カテゴリを削除する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A09_商品カテゴリを削除する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、画面の中だけで終わるもの（5a）、エラーで終わるもの（6a）と記述にない分岐（カテゴリがない）は、分かれる所だけを描き、結果と画面は Note に文で書いています。エラーのときの画面の後処理（`readResponse` が `ApiError` を投げる → 404・409 なら `reload` で一覧を取り直す → `run` が false → ダイアログを閉じてエラーの文を出す）は、どれも同じです。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as カテゴリ管理画面<br/>CategoriesPage<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as カテゴリAPI<br/>CategoryController<br/>(CategoryController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as カテゴリの処理<br/>CategoryService<br/>(CategoryService.java)
        participant CatRepo as カテゴリの読み書き<br/>CategoryRepository<br/>(CategoryRepository.java)
        participant ProdRepo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、23、一覧の取り直しの 39 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、5、21、23、一覧の取り直しの 39 に適用

    User->>Work: 運営者メニューの「カテゴリ管理」をクリック
    Work->>Page: URL を /operator/categories に変え、<br/>CategoriesPage を表示
    Page->>Hook: カテゴリの一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/categories
    Ctrl->>Svc: カテゴリの一覧を作るよう頼む (list)<br/>中身は EC-A07 の図と同じ流れ
    Svc-->>Ctrl: カテゴリ名のリスト (文字コードの順)
    Ctrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: カテゴリ名の一覧
    Hook-->>Page: カテゴリ名の一覧
    Page-->>User: カテゴリの一覧 (カテゴリごとに「編集」「削除」)

    User->>Page: 削除するカテゴリの「削除」をクリック
    Page->>Dlg: 対象のカテゴリを覚えて、<br/>確認ダイアログを表示 (setDeleting(name) → ConfirmDialog)
    Dlg-->>User: 「カテゴリ削除の確認」、「カテゴリ「(名前)」を削除します。」、<br/>販売中・非表示の商品があると削除できないこと、「削除を確定」「取消」
    break 5a 削除を取り消した
        User->>Dlg: 5a-1「取消」をクリック<br/>(Esc キー、「閉じる」、ダイアログの外側のクリックも同じ)
        Note over Page,Dlg: 結果: 取り消したことを伝え (onCancel)、ダイアログを閉じる (setDeleting(''))。通信しない。<br/>画面: 5a-2 一覧は変わらない (5a-3 終了)。
    end
    User->>Dlg: 「削除を確定」をクリック
    Dlg->>Page: 確定したことを伝える (onConfirm → remove)
    Page->>Hook: 削除を実行し、成功の文を渡す (run)<br/>「カテゴリを削除しました。」
    Hook->>Http: カテゴリを削除する通信を送る (write → request、<br/>名前は encodeURIComponent でパスに入れる)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: DELETE /api/operator/categories/{name}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: カテゴリを削除するよう頼む (delete)。delete 全体が 1 つのトランザクション<br/>運営者かを確かめる (AuthService.requireAdmin)
    Svc->>CatRepo: カテゴリの行をロックして読む (lock、SELECT ... FOR UPDATE categories)
    CatRepo-->>Svc: カテゴリ (なければなし)
    break カテゴリがない (ほかの運営者が削除した。記述なし)
        Note over Svc,Page: 結果: 404 CATEGORY_NOT_FOUND を返し (notFound)、何も変えない。<br/>画面: ダイアログを閉じ、一覧を取り直して「カテゴリが見つかりません。」
    end
    Svc->>ProdRepo: 削除されていない商品がこのカテゴリを使っているかを調べる (isCategoryInUse)<br/>SELECT count products (在庫の publication_status が DELETED の商品は数えない)
    ProdRepo-->>Svc: 使っているか
    break 6a 商品で使用中
        Svc--xErrs: 409 CATEGORY_IN_USE の例外を投げる (ApiException)
        Note over Errs,Page: 結果: 409 を返し、削除しない。<br/>画面: 6a-1 ダイアログを閉じ、一覧を取り直して「商品で使用中のカテゴリは削除できません。<br/>先に該当商品を別のカテゴリへ移してください。」(6a-2 終了)
    end
    Svc->>ProdRepo: 削除済みの商品がこのカテゴリを持っているかを調べる (existsByCategory)<br/>SELECT products (category_name が同じ商品)
    ProdRepo-->>Svc: あるか
    alt 削除済みの商品だけが持っている (記述なし)
        Svc->>Svc: 行を残し、削除した時刻を入れる (setDeletedAt(Instant.now()))
    else どの商品も持っていない
        Svc->>CatRepo: カテゴリの行を消す (delete)
    end
    Svc->>Db: 変更を送ってコミットする<br/>(save は呼ばない。UPDATE か DELETE categories)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 終わった
    Ctrl-->>Http: 200 { deleted: true }
    Http-->>Hook: 削除の結果
    Hook->>Http: 一覧を取り直す (reload)<br/>流れは 5〜9 と同じ
    Http-->>Hook: 最新のカテゴリ名の一覧
    Hook-->>Page: 成功を返す (run が true、「カテゴリを削除しました。」を設定)
    Page-->>User: ダイアログを閉じ (setDeleting(''))、<br/>「カテゴリを削除しました。」と対象を除いた一覧
```

![EC-A09 シーケンス図](<images/EC-A09_商品カテゴリを削除する-1.png>)

## 共通代替フローを直接書いた図

上の図の削除の通信（CSRF トークンの取得と `DELETE /api/operator/categories/{name}`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて一覧を取る通信の \*a・\*b は、[EC-A07](<EC-A07_商品カテゴリを追加する.md>) の「共通代替フローを直接書いた図」の「画面を開くとき」と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as カテゴリ管理画面<br/>CategoriesPage<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as カテゴリAPI<br/>CategoryController<br/>(CategoryController.java)
        participant Svc as カテゴリの処理<br/>CategoryService<br/>(CategoryService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Dlg: 「削除を確定」をクリック
    Dlg->>Page: 確定したことを伝える (onConfirm → remove)
    Page->>Hook: 削除を実行し、成功の文を渡す (run)
    Hook->>Http: カテゴリを削除する通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Page->>Dlg: ダイアログを閉じる (setDeleting(''))
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a DELETE が届かない、または応答が JSON でない (削除されたかは分からない)
            AuthJs-xFilter: DELETE /api/operator/categories/{name}
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setDeleting(''))
            Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: DELETE /api/operator/categories/{name}
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setDeleting(''))
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/operator/categories のログイン画面<br/>(ログインの後は *b-2 でカテゴリ管理画面に戻る。カテゴリは削除されていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: DELETE /api/operator/categories/{name}
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setDeleting(''))
            Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
        else 要求が Controller まで届いた
            AuthJs->>Filter: DELETE /api/operator/categories/{name}
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: カテゴリを削除するよう頼む (delete)
            Svc->>Db: 運営者かを確かめ、カテゴリの行をロックして読み、<br/>商品の使用を調べて削除し、コミットする (上の図の 24〜35)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Page->>Dlg: ダイアログを閉じる (setDeleting(''))
                Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
            else 削除した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 終わった
                Ctrl-->>Http: 200 { deleted: true }
                Http-->>Hook: 削除の結果
                Hook-->>Page: 一覧を取り直して成功を返す (reload、run が true)
                Page-->>User: ダイアログを閉じ (setDeleting(''))、<br/>「カテゴリを削除しました。」と対象を除いた一覧
            end
        end
    end
    opt *a-3 やり直す
        alt 一覧を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 一覧を取り直す (reload)。削除の通信は送り直さない
        else 削除をやり直す
            User->>Page: もう一度「削除」をクリック (基本フロー 3 へ戻る)
        end
    end
```

![EC-A09 共通代替フローを直接書いた図](<images/EC-A09_商品カテゴリを削除する-2.png>)

## ユースケース記述との差

- 関連情報は「共通代替フロー \*b を適用する」だけですが、一覧の取得と削除の通信には \*a も起こります。図には両方を書いています。
- 一覧の取得（`GET /api/categories`）はログインしていなくても呼べる API なので、サーバーのセッションがないときも 200 で一覧を返します。\*b になるのは refresh トークンが失効しているときだけです（EC-A07 と同じ）。
- 5a の取り消しは「取消」ボタンのほかに、Esc キー、ダイアログの「閉じる」（×）ボタン、ダイアログの外のクリックでもできます（`Dialog.jsx` の `onClose` から `onCancel`）。どれも通信しません。通信中（`busy`）は閉じません。
- 6a の「商品が紐づいている」は、`ProductRepository.isCategoryInUse()` で判定します。在庫の行（`inventory`）の `publication_status` が `DELETED` の商品は数えないので、販売中（`PUBLISHED`）と非表示（`HIDDEN`）の商品が 1 つでもあれば使用中です。ダイアログの文「販売中・非表示の商品が登録されているカテゴリは削除できません。」と合っています。関連情報の「出店者が削除した商品は、カテゴリの削除を妨げない」もこの判定によるものです。
- 6a のあと、画面は一覧を取り直し、ダイアログを閉じて、エラーの文と「再取得」ボタンを一覧の上に出します。記述の「一覧を再表示する」はこの取り直しです。
- `remove()` は結果にかかわらず `setDeleting('')` でダイアログを閉じます。共通代替フローで失敗したときも、ダイアログは閉じて一覧の上にエラーの文が出ます。\*a-3 の「再取得」は一覧を取り直すだけで、削除の通信は送り直しません。やり直すには、もう一度「削除」から確定します。
- 記述にない処理として、次の 2 つがあります。
  - 削除済みの商品だけがこのカテゴリを持っているときは、行を消さずに `deleted_at` に今の時刻を入れます。`products.category_name` は `categories(name)` への外部キー（`fk_products_category`）なので、参照が残る行は消せないためです。この行は一覧と商品登録の選択肢に出ません。同じ名前を EC-A07 で追加すると、この行が元に戻ります。
  - ダイアログを開いている間にほかの運営者がそのカテゴリを削除していると、404 `CATEGORY_NOT_FOUND`「カテゴリが見つかりません。」を表示し、一覧を取り直します。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出します。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 確かめられなかったこと

- カテゴリ名に `/` や `%` などがあるときの削除は、動かして確かめていません。画面は名前を `encodeURIComponent()` でパスに入れるので、`/` は `%2F`、`%` は `%25` になります。Spring Security の既定の `StrictHttpFirewall` は、パスの中のこれらを拒否します。EC-A07 では名前を本文で送るので、こうした名前のカテゴリは追加できても、削除できない可能性があります。このときの応答と画面の表示も確かめていません。
- `save` を呼ばずにコミットのときに UPDATE や DELETE を送る時点は、JPA の動きから読んだもので、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage`（`remove`、`deleting`、`ConfirmDialog` に渡す文言）
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ConfirmDialog.jsx): `ConfirmDialog`（「取消」、`onConfirm`、`onCancel`、`busy`）
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Dialog.jsx): `Dialog`（Esc キー、外側のクリック、「閉じる」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `list`、`delete`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list`、`delete`、`notFound`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull`、`lock`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `isCategoryInUse`、`existsByCategory`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authorizeHttpRequests`（`/api/categories` の `permitAll`）、`authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/resources/db/migration/V1__schema.sql): `categories`、`products` の `fk_products_category`、`inventory` の `publication_status`
