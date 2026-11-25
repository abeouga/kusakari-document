# EC-A08 商品カテゴリを編集する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as カテゴリ管理画面<br/>(OperatorPages.jsx)
        participant Hook as 一覧の取得と変更<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as カテゴリAPI<br/>(CategoryController.java)
        participant Errs as エラーの応答<br/>(ApiErrors.java)
        participant Svc as カテゴリの処理<br/>(CategoryService.java)
        participant CatRepo as カテゴリの読み書き<br/>(CategoryRepository.java)
        participant ProdRepo as 商品の読み書き<br/>(ProductRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、14、一覧の取り直しの 31 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、4、14、一覧の取り直しの 31 に適用

    User->>Work: 運営者メニューの「カテゴリ管理」をクリック
    Work->>Page: カテゴリ管理画面を表示
    Page->>Hook: カテゴリの一覧を取得する処理を呼ぶ
    Hook->>Ctrl: 同左<br>GET /api/categories (流れは EC-A07 と同じ)
    Ctrl-->>Hook: カテゴリ名のリストを返す
    Hook-->>Page: カテゴリ名のリスト
    Page-->>User: カテゴリ一覧、入力欄、「保存」「編集」「削除」ボタンを表示

    User->>Page: カテゴリの「編集」をクリック
    Page->>Page: 編集するカテゴリ名を伝える
    Page-->>User: 「カテゴリ名」入力欄に今のカテゴリ名を表示
    User->>Page: カテゴリ名を編集し、「保存」をクリック
    Page->>Hook: カテゴリ名を変える処理を呼ぶ (save)
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/operator/categories
    Ctrl->>Svc: カテゴリ名を変えるトランザクションを開始 (save)
    Svc->>CatRepo: 新しい名前のカテゴリの行をロックして読む (lock)
    CatRepo-->>Svc: カテゴリ (なければなし)
    break 7a 同じ名前のカテゴリがある場合
        Svc--xErrs: 409 CATEGORY_EXISTS の例外を投げる
        Note over Errs,Page: 409 を返し、カテゴリ名は変えない。<br/>画面は「同じカテゴリがあります。」を表示する。
    end
    Svc->>CatRepo: 元の名前のカテゴリの行をロックして読む (lock)
    CatRepo-->>Svc: カテゴリ (なければなし)
    Svc->>Svc: 新しい名前のカテゴリを作る<br/>削除済みの同じ名前の行があれば、それを使い直す
    Svc->>CatRepo: 新しい名前のカテゴリを保存する (saveAndFlush)
    CatRepo-->>Svc: 保存したカテゴリ
    Svc->>ProdRepo: 元の名前の商品のカテゴリ名を、新しい名前に書き換える (renameCategory)
    ProdRepo-->>Svc: 書き換えの完了
    Svc->>CatRepo: 元の名前のカテゴリを消す (deleteById)
    CatRepo-->>Svc: 削除の完了
    Svc-->>Ctrl: 保存の結果を返す
    Ctrl-->>Http: 保存の結果を返す
    Http-->>Hook: 保存の結果
    Hook->>Ctrl: 一覧を取り直す<br/>流れは 4〜5 と同じ
    Ctrl-->>Hook: 最新のカテゴリ名のリストを返す
    Hook-->>Page: 成功を返す
    Page->>Page: 編集をやめ、入力欄を空にする
    Page-->>User: 「保存しました。」と、新しい名前になった一覧を表示
```

![EC-A08 シーケンス図](<images/EC-A08_商品カテゴリを編集する-1.png>)
