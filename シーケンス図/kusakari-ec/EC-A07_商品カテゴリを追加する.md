# EC-A07 商品カテゴリを追加する

- ユースケース記述: [EC-A07_商品カテゴリを追加する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A07_商品カテゴリを追加する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、エラーで終わるもの（4a・5a・5b）は分かれる所だけを描き、結果と画面は Note に文で書いています。エラーのときの画面の後処理（`readResponse` が `ApiError` を投げる → 409 なら `reload` で一覧を取り直す → `run` が false → エラーの文を出す）は、どれも同じです。

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
        participant Repo as カテゴリの読み書き<br/>CategoryRepository<br/>(CategoryRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、19、一覧の取り直しの 31 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、5、17、19、一覧の取り直しの 31 に適用

    User->>Work: 運営者メニューの「カテゴリ管理」をクリック
    Work->>Page: URL を /operator/categories に変え、<br/>CategoriesPage を表示
    Page->>Hook: カテゴリの一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/categories
    Ctrl->>Svc: カテゴリの一覧を作るよう頼む (list)<br/>削除されていないカテゴリを読み (findByDeletedAtIsNull、<br/>SELECT categories WHERE deleted_at IS NULL)、名前を文字コードの順に並べる (sorted)
    Svc-->>Ctrl: カテゴリ名のリスト
    Ctrl-->>Http: 200 カテゴリ名の配列
    Http-->>Hook: カテゴリ名の一覧
    Hook-->>Page: カテゴリ名の一覧
    Page-->>User: 「カテゴリ名」入力欄 (30 文字まで)、「保存」「編集を取消」、<br/>カテゴリごとの「編集」「削除」と一覧

    User->>Page: 「カテゴリ名」に入力し、「保存」をクリック
    break 4a カテゴリ名が未入力
        Page-->>User: 4a-1 ブラウザーが必須入力のメッセージを出し、送信しない<br/>(入力欄の required。基本フロー 3 へ戻る)
    end
    Page->>Hook: 保存を実行するよう頼む (save → run)
    Hook->>Http: カテゴリを保存する通信を送る<br/>(write → request、本文は { previous: 空文字, name: 入力値 })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/operator/categories<br/>(CSRF トークンのヘッダー付き)
    break 5a カテゴリ名が空白だけ
        Ctrl--xErrs: 入力の検査で止める (@Valid の @NotBlank、<br/>MethodArgumentNotValidException)
        Note over Errs,Page: 結果: 400 INVALID_INPUT を返し、保存しない。一覧は取り直さない。<br/>画面: 5a-1「入力内容・文字数・数値の範囲を確認してください。」入力欄はそのまま (基本フロー 3 へ戻る)
    end
    Ctrl->>Svc: カテゴリを保存するよう頼む (save)。save 全体が 1 つのトランザクション<br/>運営者かを確かめ (AuthService.requireAdmin)、前後の空白を取り除く (trim)
    Svc->>Repo: 同じ名前の行をロックして読む (lock、SELECT ... FOR UPDATE categories)
    Repo-->>Svc: カテゴリ (なければなし)
    break 5b 同じ名前のカテゴリがある (削除されていない行、isAvailable)
        Svc--xErrs: 409 CATEGORY_EXISTS の例外を投げる (ApiException)
        Note over Errs,Page: 結果: 409 を返し、追加しない。<br/>画面: 5b-1 一覧を取り直して「同じカテゴリがあります。」入力欄はそのまま (基本フロー 3 へ戻る)
    end
    Svc->>Svc: 新しいカテゴリを作る。削除済みの同じ名前の行が<br/>あればそれを使い、削除の印を消す (new CategoryEntity、setDeletedAt(null))
    Svc->>Repo: カテゴリを保存する (saveAndFlush)<br/>INSERT categories (削除済みの行を使うときは UPDATE)
    Repo-->>Svc: 保存したカテゴリ
    Svc-->>Ctrl: 終わった (コミット)。previous が空文字なので<br/>商品のカテゴリ名は書き換えない
    Ctrl-->>Http: 200 { saved: true }
    Http-->>Hook: 保存の結果
    Hook->>Http: 一覧を取り直す (reload)<br/>流れは 5〜9 と同じ
    Http-->>Hook: 最新のカテゴリ名の一覧
    Hook-->>Page: 成功を返す (run が true、「保存しました。」を設定)
    Page->>Page: 入力欄を空にする (setEditing('')、form.reset)
    Page-->>User: 「保存しました。」、空の入力欄、<br/>追加したカテゴリを含む一覧
```

![EC-A07 シーケンス図](<images/EC-A07_商品カテゴリを追加する-1.png>)

## 共通代替フローを直接書いた図

上の図の通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開くときと「保存」をクリックしたときの 2 つに分けています。EC-A08・EC-A09 の画面を開くときの図は、この 1 つ目の図と同じです。

### 画面を開くとき

ログイン状態の確認（`GET /api/auth/me`）は、URL を直接開いたとき（再読み込みを含む）だけ行います。メニューのクリックでは読み直しません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Panel as ログイン欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as カテゴリ管理画面<br/>CategoriesPage<br/>(OperatorPages.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログイン状態の読み込み<br/>readSession<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Ctrl as カテゴリAPI<br/>CategoryController<br/>(CategoryController.java)
        participant Svc as カテゴリの処理<br/>CategoryService<br/>(CategoryService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みも同じ)
        User->>Work: ブラウザーで /operator/categories を開く
        Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
        alt *a GET /api/auth/me が届かない
            AuthJs-xFilter: GET /api/auth/me
            AuthJs--xWork: エラーを投げる (fetch の TypeError)
            Work-->>User: *a-1 ブラウザーが作ったエラーの文だけ<br/>(「再取得」はない。やり直しはブラウザーの再読み込み)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: GET /api/auth/me
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>AuthJs: 503 AUTH_UNAVAILABLE (セッションは残す)
            AuthJs--xWork: エラーを投げる (「ログイン状態を確認できません。」)
            Work-->>User: *a-1「ログイン状態を確認できません。」だけ<br/>(やり直しはブラウザーの再読み込み)
        else *b ログインしていない (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: GET /api/auth/me
            Filter->>AuthCtrl: 要求を通す (失効のときはセッションを無効にしてから)
            AuthCtrl-->>AuthJs: 200 authenticated=false (me)
            AuthJs-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログイン欄を表示
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>PwCtrl: ログインする (submit → passwordLogin、returnTo は今の URL)<br/>POST /api/auth/login。中身は EC-B01
            PwCtrl-->>Panel: 200 戻り先の URL (returnTo)
            Panel->>Work: *b-2 /operator/categories を読み込み直す<br/>(complete → location.replace)。この図の 2 からやり直す
        else ログインしている
            AuthJs->>Filter: GET /api/auth/me
            Filter->>AuthCtrl: 要求を通す
            AuthCtrl-->>AuthJs: 200 authenticated=true、accountType=ADMIN
            AuthJs-->>Work: ログイン中の運営者
            Work->>Page: CategoriesPage を表示
        end
    else メニューから開いた
        User->>Work: 運営者メニューの「カテゴリ管理」をクリック
        Work->>Page: URL を /operator/categories に変え、CategoriesPage を表示<br/>(ログイン状態は読み直さない)
    end

    Page->>Hook: カテゴリの一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/categories
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b refresh トークンが失効
        Http->>Filter: GET /api/categories
        Filter-->>Http: 401 LOGIN_REQUIRED (セッションを無効にする)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」<br/>(「ログインする」なら *b-2 でこの画面に戻る)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/categories
        Filter-xCog: ID トークンを更新する (InitiateAuth REFRESH_TOKEN_AUTH)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/categories
        Filter->>Ctrl: 要求を通す (chain.doFilter)。この GET はログインなしでも<br/>呼べるので、サーバーのセッションがなくても 401 にならない
        Ctrl->>Svc: カテゴリの一覧を作るよう頼む (list)
        Svc->>Db: 削除されていないカテゴリを読む (上の図の 6)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (reload の catch → setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: カテゴリの行
            Svc-->>Ctrl: カテゴリ名のリスト
            Ctrl-->>Http: 200 カテゴリ名の配列
            Http-->>Hook: カテゴリ名の一覧
            Hook-->>Page: カテゴリ名の一覧
            Page-->>User: 「カテゴリ名」入力欄、「保存」「編集を取消」、カテゴリの一覧
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 一覧を取り直す (reload)。流れはこの図の 2 つ目の alt と同じ
    end
```

![EC-A07 共通代替フローを直接書いた図](<images/EC-A07_商品カテゴリを追加する-2.png>)

### 「保存」をクリックしたとき

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

    User->>Page: 「カテゴリ名」に入力し、「保存」をクリック
    Page->>Hook: 保存を実行するよう頼む (save → run)
    Hook->>Http: カテゴリを保存する通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」<br/>*a-2 入力欄はそのまま (form.reset を呼ばない)
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (保存されたかは分からない)
            AuthJs-xFilter: PUT /api/operator/categories
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」<br/>*a-2 入力欄はそのまま
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/operator/categories
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)。入力欄はそのまま
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            alt ログインする
                User->>Notice: 「ログインする」をクリック
                Notice->>AuthJs: ログイン画面へ移る (login)
                AuthJs-->>User: /account/login?returnTo=/operator/categories のログイン画面<br/>(ログインの後は *b-2 でカテゴリ管理画面に戻る。<br/>カテゴリは追加されておらず、入力していた名前も残らない)
            else 閉じる
                User->>Notice: 「閉じる」をクリック
                Notice-->>User: お知らせを閉じる (setExpired(false))。<br/>入力欄はそのまま、ログインはしていない
            end
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/operator/categories
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」<br/>*a-2 入力欄はそのまま
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/operator/categories
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: カテゴリを保存するよう頼む (save)
            Svc->>Db: 運営者かを確かめ、同じ名前の行をロックして読み、<br/>追加してコミットする (上の図の 21〜28)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」<br/>*a-2 入力欄はそのまま
            else 追加した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 終わった
                Ctrl-->>Http: 200 { saved: true }
                Http-->>Hook: 保存の結果
                Hook-->>Page: 一覧を取り直して成功を返す (reload、run が true)
                Page-->>User: 「保存しました。」、空の入力欄、<br/>追加したカテゴリを含む一覧
            end
        end
    end
    opt *a-3 やり直す
        alt 保存をやり直す
            User->>Page: 残った入力のまま「保存」をもう一度クリック<br/>(基本フロー 4 へ戻る)
        else 一覧を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 一覧を取り直す (reload)。保存の通信は送り直さない
        end
    end
```

![EC-A07 共通代替フローを直接書いた図](<images/EC-A07_商品カテゴリを追加する-3.png>)

## ユースケース記述との差

- 関連情報は「共通代替フロー \*b を適用する」だけですが、一覧の取得と保存の通信には \*a も起こります。図には両方を書いています。
- 一覧の取得（`GET /api/categories`）は、ログインしていなくても呼べる API です（`AuthConfiguration.java` の `permitAll`）。そのため、サーバーのセッションがないときもこの GET は 200 で一覧を返し、\*b にはなりません。\*b になるのは、セッションが残っていて refresh トークンが失効しているとき（`SessionValidityFilter` の 401）だけです。保存の `PUT /api/operator/categories` は、どちらのときも 401 `LOGIN_REQUIRED` になります。
- 基本フロー 2 の「名前順」は、`CategoryService.list()` が `String` を `sorted()` で並べた順です。文字コードの順なので、読みの五十音順にはなりません。
- 5a の空白だけの入力は、`CategoryController.Input` の `@NotBlank` で止まり、`ApiErrors.invalid()` の「入力内容・文字数・数値の範囲を確認してください。」になります。記述どおりです。`CategoryService.save()` にある「カテゴリ名を入力してください。」（400 `INVALID_CATEGORY`）は、この経路では届きません。
- `@NotBlank` の検査と `trim()` は、どちらも `String.trim()` と同じ決まりで空白を判定します。`String.trim()` は全角の空白（U+3000）を取り除かないため、コードから読むと、全角の空白だけのカテゴリ名は 5a にならずに保存されます。前後の全角の空白も取り除かれません。関連情報の「前後の空白を取り除いて保存する」は半角の空白などだけに当てはまります。
- 30 文字を超える入力は、入力欄の `maxLength` で打てません。API を直接呼んだときだけ `@Size(max = 30)` で 400 `INVALID_INPUT` になります。記述の関連情報どおりです。
- 記述にない処理として、削除済みの同じ名前の行（`deleted_at` が入った行）があると、新しい行を作らずにその行の `deleted_at` を空に戻します（EC-A09 で、削除済みの商品だけが使っていたカテゴリは行を残すため）。
- 5b のあと、画面は一覧を取り直します（`useResource` の `run` は 404 と 409 のときに `reload` します）。記述にない処理です。
- 保存の通信が失敗したとき（\*a、\*b）は、`save()` が `form.reset()` を呼ばないので、入力欄はそのまま残ります（\*a-2）。「再取得」は一覧を取り直すだけで、保存の通信は送り直しません。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、一覧を取りに行きません。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 確かめられなかったこと

- 2 人の運営者が同じ名前を同時に追加したときの動きは、動かして確かめていません。まだ無い行への `lock`（`SELECT ... FOR UPDATE`）で待つのか、主キーの重複で `DataIntegrityViolationException` になり `ApiErrors.conflict()` の 409 `DATA_CHANGED` になるのかは、コードだけでは決められません。
- `categories` の表は照合順序を指定していません（`V1__schema.sql`）。MySQL 8 の既定の照合順序なら大文字と小文字を区別しないので、「Herb」があるときに「herb」を追加すると 5b の 409 になると読めますが、動かして確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインのときの `AuthPanel`、ADMIN の確認、`CategoriesPage` の表示）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `CategoriesPage`（`save`、`editing`）
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`）、`values`、`ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`passwordLogin`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`（`submit`、`complete`、`returnTo`）
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/CategoryController.java): `Input`、`list`、`save`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CategoryService.java): `list`、`save`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/CategoryRepository.java): `findByDeletedAtIsNull`、`lock`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/CategoryEntity.java): `isAvailable`、`deletedAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authorizeHttpRequests`（`/api/categories` の `permitAll`）、`authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`conflict`、`database`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/resources/db/migration/V1__schema.sql): `categories`
