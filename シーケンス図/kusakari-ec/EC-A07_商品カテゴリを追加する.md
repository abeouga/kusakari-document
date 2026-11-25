# EC-A07 商品カテゴリを追加する

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

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、18、一覧の取り直しの 29 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、5、16、18、一覧の取り直しの 29 に適用

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
    Page->>Hook: 保存を実行するよう頼む (save → run)
    Hook->>Http: カテゴリを保存する通信を送る<br/>(write → request、本文は { previous: 空文字, name: 入力値 })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/operator/categories<br/>(CSRF トークンのヘッダー付き)
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
