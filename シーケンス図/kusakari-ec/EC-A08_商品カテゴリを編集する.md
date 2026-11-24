# EC-A08 商品カテゴリを編集する

- ユースケース記述: [EC-A08_商品カテゴリを編集する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A08_商品カテゴリを編集する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as カテゴリ管理画面<br/>CategoriesPage<br/>(OperatorPages.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as カテゴリAPI<br/>CategoryController<br/>(CategoryController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as カテゴリの処理<br/>CategoryService<br/>(CategoryService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant CatRepo as カテゴリの読み書き<br/>CategoryRepository<br/>(CategoryRepository.java)
        participant ProdRepo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、22、一覧の取り直しの 35・46・57・77 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、5、20、22、一覧の取り直しの 35・46・57・77 に適用

    User->>Work: 運営者メニューの「カテゴリ管理」をクリック
    Work->>Page: URL を /operator/categories に変え、<br/>CategoriesPage を表示
    Page->>Hook: カテゴリの一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/categories
    Ctrl->>Svc: カテゴリの一覧を作るよう頼む (list)<br/>中身は EC-A07 の図の 7〜11 と同じ
    Svc-->>Ctrl: カテゴリ名のリスト (文字コードの順)
    Ctrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: カテゴリ名の一覧
    Hook-->>Page: カテゴリ名の一覧
    Page-->>User: 「カテゴリ名」入力欄、「保存」「編集を取消」、<br/>カテゴリごとの「編集」「削除」と一覧

    User->>Page: 対象のカテゴリの「編集」をクリック
    Page->>Page: 編集中のカテゴリ名を覚え、入力欄を作り直す<br/>(setEditing(name)。form の key が変わり、Input の defaultValue が name になる)
    Page-->>User: 「カテゴリ名」入力欄に今のカテゴリ名
    User->>Page: カテゴリ名を編集し、「保存」をクリック
    alt 7a 入力欄が空
        Page-->>User: ブラウザーが必須入力のメッセージを出し、送信しない<br/>(入力欄の required。基本フロー 5 へ戻る)
    else 入力がある (31 文字目は入力欄の maxLength で打てない)
        Page->>Hook: 保存を実行するよう頼む (save → run)
        Hook->>Http: カテゴリ名を変える通信を送る<br/>(write → request、本文は { previous: 元の名前, name: 入力値 })
        Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
        AuthJs->>Ctrl: PUT /api/operator/categories<br/>(CSRF トークンのヘッダー付き)
        alt 7a 空白だけ、または 30 文字を超える
            Ctrl--xErrs: 入力の検査で止める (@Valid の @NotBlank・@Size(max = 30)、<br/>MethodArgumentNotValidException)
            Errs-->>Http: 400 INVALID_INPUT「入力内容・文字数・数値の範囲を<br/>確認してください。」(invalid)
            Http--xHook: エラーを投げる (readResponse → ApiError)
            Hook-->>Page: 失敗を返す (run が false、エラーの文を設定)。<br/>400 なので一覧は取り直さない
            Page-->>User: 7a-1「入力内容・文字数・数値の範囲を確認してください。」<br/>入力欄はそのまま (7a-2 基本フロー 5 へ戻る)
        else 検査を通った
            Ctrl->>Svc: カテゴリ名を変えるよう頼む (save)<br/>save 全体が 1 つのトランザクション
            Svc->>Auth: ログイン中の人が運営者かを確かめる (requireAdmin)
            Auth-->>Svc: 運営者である
            Svc->>Svc: 前後の空白を取り除く (trim)
            alt 前後の空白を除くと元の名前と同じ (記述なし)
                Svc-->>Ctrl: 何も変えずに終わる (name.equals(previous))
                Ctrl-->>Http: 200 { saved: true }
                Http-->>Hook: 保存の結果
                Hook->>Http: 一覧を取り直す (reload)<br/>流れは 5〜8 と同じ
                Http-->>Hook: 変わっていない一覧
                Hook-->>Page: 成功を返す (run が true、「保存しました。」を設定)
                Page-->>User: 編集をやめ (setEditing('')、form.reset)、<br/>「保存しました。」と変わっていない一覧
            else 名前が変わる
                Svc->>CatRepo: 新しい名前の行をロックして読む (lock)
                CatRepo->>Db: SELECT ... FOR UPDATE categories
                Db-->>CatRepo: 新しい名前の行 (なければなし)
                CatRepo-->>Svc: カテゴリ (なければなし)
                alt 7a 同じ名前のカテゴリがある (削除されていない行、isAvailable)
                    Svc--xErrs: 409 CATEGORY_EXISTS の例外を投げる (ApiException)
                    Errs-->>Http: 409「同じカテゴリがあります。」(business)
                    Http--xHook: エラーを投げる (readResponse → ApiError)
                    Hook->>Http: 409 なので一覧を取り直す (reload)<br/>流れは 5〜8 と同じ
                    Http-->>Hook: 最新のカテゴリ名の一覧
                    Hook-->>Page: 失敗を返す (run が false、エラーの文を設定)
                    Page-->>User: 7a-1「同じカテゴリがあります。」と最新の一覧<br/>入力欄はそのまま (7a-2 基本フロー 5 へ戻る)
                else 新しい名前は使われていない
                    Svc->>CatRepo: 元の名前の行をロックして読む (lock)
                    CatRepo->>Db: SELECT ... FOR UPDATE categories
                    Db-->>CatRepo: 元の名前の行 (なければなし)
                    CatRepo-->>Svc: カテゴリ (なければなし)
                    alt 編集中のカテゴリがない (ほかの運営者が削除した。記述なし)
                        Svc--xErrs: 404 CATEGORY_NOT_FOUND の例外を投げる (notFound)
                        Errs-->>Http: 404「カテゴリが見つかりません。」(business)
                        Http--xHook: エラーを投げる (readResponse → ApiError)
                        Hook->>Http: 404 なので一覧を取り直す (reload)<br/>流れは 5〜8 と同じ
                        Http-->>Hook: 最新のカテゴリ名の一覧
                        Hook-->>Page: 失敗を返す (run が false、エラーの文を設定)
                        Page-->>User: 「カテゴリが見つかりません。」と最新の一覧<br/>(入力欄はそのまま)
                    else 変更できる
                        Svc->>Svc: 新しい名前のカテゴリを作る。削除済みの同じ名前の行が<br/>あればそれを使い、削除の印を消す (new CategoryEntity、setDeletedAt(null))
                        Svc->>CatRepo: 新しい名前の行を保存する (saveAndFlush)
                        CatRepo->>Db: INSERT categories<br/>(削除済みの行を使うときは UPDATE)
                        Db-->>CatRepo: 完了
                        CatRepo-->>Svc: 保存したカテゴリ
                        Svc->>ProdRepo: 元の名前を持つ商品のカテゴリ名を<br/>新しい名前に変える (renameCategory)
                        ProdRepo->>Db: UPDATE products SET category_name<br/>(削除済みの商品も含む)
                        Db-->>ProdRepo: 完了
                        ProdRepo-->>Svc: 終わった
                        Svc->>CatRepo: 元の名前の行を消す (deleteById)
                        CatRepo->>Db: DELETE categories (コミットのときに送る)
                        Db-->>CatRepo: 完了
                        CatRepo-->>Svc: 終わった
                        Svc-->>Ctrl: 終わった (コミット)
                        Ctrl-->>Http: 200 { saved: true }
                        Http-->>Hook: 保存の結果
                        Hook->>Http: 一覧を取り直す (reload)<br/>流れは 5〜8 と同じ
                        Http-->>Hook: 最新のカテゴリ名の一覧
                        Hook-->>Page: 成功を返す (run が true、「保存しました。」を設定)
                        Page->>Page: 編集をやめ、入力欄を空にする (setEditing('')、form.reset)
                        Page-->>User: 「保存しました。」、空の入力欄、<br/>新しい名前になった一覧
                    end
                end
            end
        end
    end
```

## 共通代替フローを直接書いた図

上の図の「保存」の通信（CSRF トークンの取得と `PUT /api/operator/categories`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて一覧を取る通信の \*a・\*b は、[EC-A07](<EC-A07_商品カテゴリを追加する.md>) の「共通代替フローを直接書いた図」の「画面を開くとき」と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as カテゴリ管理画面<br/>CategoriesPage<br/>(OperatorPages.jsx)
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

    User->>Page: カテゴリ名を編集し、「保存」をクリック
    Page->>Hook: 保存を実行するよう頼む (save → run)
    Hook->>Http: カテゴリ名を変える通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」<br/>*a-2 編集中の入力欄はそのまま (setEditing('') を呼ばない)
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (変わったかは分からない)
            AuthJs-xFilter: PUT /api/operator/categories
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」<br/>*a-2 編集中の入力欄はそのまま
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/operator/categories
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)。編集中の入力欄はそのまま
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            alt ログインする
                User->>Notice: 「ログインする」をクリック
                Notice->>AuthJs: ログイン画面へ移る (login)
                AuthJs-->>User: /account/login?returnTo=/operator/categories のログイン画面<br/>(ログインの後は *b-2 でカテゴリ管理画面に戻る。<br/>名前は変わっておらず、編集中の状態も残らない)
            else 閉じる
                User->>Notice: 「閉じる」をクリック
                Notice-->>User: お知らせを閉じる (setExpired(false))。<br/>編集中の入力欄はそのまま、ログインはしていない
            end
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/operator/categories
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」<br/>*a-2 編集中の入力欄はそのまま
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/operator/categories
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: カテゴリ名を変えるよう頼む (save)
            Svc->>Db: 運営者かを確かめ、新しい名前と元の名前の行をロックして読み、<br/>行の追加・商品の書き換え・元の行の削除をしてコミットする (上の図の 28〜74)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」<br/>*a-2 編集中の入力欄はそのまま
            else 変更した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 終わった
                Ctrl-->>Http: 200 { saved: true }
                Http-->>Hook: 保存の結果
                Hook-->>Page: 一覧を取り直して成功を返す (reload、run が true)
                Page-->>User: 「保存しました。」、空の入力欄、<br/>新しい名前になった一覧
            end
        end
    end
    opt *a-3 やり直す
        alt 保存をやり直す
            User->>Page: 残った入力のまま「保存」をもう一度クリック<br/>(基本フロー 6 へ戻る)
        else 一覧を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 一覧を取り直す (reload)。保存の通信は送り直さない
        end
    end
```

## ユースケース記述との差

- 関連情報は「共通代替フロー \*b を適用する」だけですが、一覧の取得と保存の通信には \*a も起こります。図には両方を書いています。
- 一覧の取得（`GET /api/categories`）はログインしていなくても呼べる API なので、サーバーのセッションがないときも 200 で一覧を返します。\*b になるのは refresh トークンが失効しているときだけです（EC-A07 と同じ）。
- 7a の「空白のみの場合は『カテゴリ名を入力してください。』」は、コードと違います。空白だけの入力は `CategoryController.Input` の `@NotBlank` で止まり、`ApiErrors.invalid()` の「入力内容・文字数・数値の範囲を確認してください。」（400 `INVALID_INPUT`）を表示します。`CategoryService.save()` の「カテゴリ名を入力してください。」には届きません。
- 7a のうち空欄は、入力欄の `required` でブラウザーが止め、通信しません。30 文字を超える入力は、入力欄の `maxLength` で打てません。API を直接呼んだときだけ `@Size(max = 30)` で 400 `INVALID_INPUT` になります。
- `@NotBlank` の検査と `trim()` は、どちらも `String.trim()` と同じ決まりで空白を判定します。コードから読むと、全角の空白（U+3000）だけの名前は 7a にならずに保存され、前後の全角の空白も取り除かれません。
- 記述にない処理として、次の 3 つがあります。
  - 前後の空白を取り除いた名前が元の名前と同じなら、何も変えずに 200 を返し、「保存しました。」を表示します。
  - 編集中にほかの運営者がそのカテゴリを削除していると、404 `CATEGORY_NOT_FOUND`「カテゴリが見つかりません。」を表示し、一覧を取り直します。入力欄は編集中のまま残ります。
  - 新しい名前が削除済みのカテゴリ（`deleted_at` が入った行）と同じなら、その行を元に戻して使います。
- カテゴリ名は `categories` の主キーなので、名前の変更は「新しい名前の行を追加 → `products.category_name` を書き換え → 元の行を削除」の 3 つの SQL で行います。書き換えは削除済みの商品も含め、元の名前を持つすべての商品が対象です。関連情報の「そのカテゴリの商品にも新しいカテゴリ名が表示される」はこの書き換えによるものです。
- 基本フロー 8 には、保存のあとに入力欄を空にして編集をやめること（`setEditing('')`、`form.reset()`）が書かれていません。
- 画面には「編集を取消」ボタンがあり、押すと編集をやめて入力欄を空にします（`setEditing('')`、通信しない）。この操作は代替フローにありません。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出します。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 確かめられなかったこと

- 2 人の運営者が同時に編集したときの動きは、動かして確かめていません。`save()` は新しい名前、元の名前の順に `lock()` で行をロックします。2 つの編集が互いの名前を入れ替えるような場合に、待ちやデッドロックになるか、`ApiErrors.conflict()` の 409 `DATA_CHANGED` になるかは、コードだけでは決められません。
- `categories` の表は照合順序を指定していません（`V1__schema.sql`）。MySQL 8 の既定の照合順序なら大文字と小文字を区別しないので、「herb」を「Herb」に変えるような、大文字と小文字だけの変更は、新しい名前の `lock()` が元の行を見つけて 409「同じカテゴリがあります。」になると読めます。動かして確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage`（`save`、`editing`、「編集」「編集を取消」の `onClick`）
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`、`defaultValue`）、`values`、`ResourceStatus`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `Input`、`list`、`save`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list`、`save`、`notFound`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull`、`lock`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `renameCategory`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authorizeHttpRequests`（`/api/categories` の `permitAll`）、`authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`conflict`、`database`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/resources/db/migration/V1__schema.sql): `categories`、`products` の `fk_products_category`
