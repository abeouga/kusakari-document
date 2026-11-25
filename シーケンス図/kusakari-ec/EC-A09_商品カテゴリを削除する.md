# EC-A09 商品カテゴリを削除する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as カテゴリ管理画面<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>(ConfirmDialog.jsx)
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

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、15、一覧の取り直しの 31 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、4、15、一覧の取り直しの 31 に適用

    User->>Work: 運営者メニューの「カテゴリ管理」をクリック
    Work->>Page: カテゴリ管理画面を表示
    Page->>Hook: カテゴリの一覧を取得する処理を呼ぶ
    Hook->>Ctrl: 同左<br/>GET /api/categories (流れは EC-A07 の図と同じ)
    Ctrl-->>Hook: カテゴリ名のリストを返す
    Hook-->>Page: カテゴリ名のリスト
    Page-->>User: カテゴリの一覧と、カテゴリごとの「編集」「削除」を表示

    User->>Page: 削除するカテゴリの「削除」をクリック
    Page->>Dlg: 確認ダイアログを表示
    Dlg-->>User: 「カテゴリ「(名前)」を削除します。」、<br/>「削除を確定」、「取消」を表示
    User->>Dlg: 「削除を確定」をクリック
    Dlg->>Page: 11 の操作を反映
    Page->>Hook: カテゴリを削除する処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>DELETE /api/operator/categories/{name}
    Ctrl->>Svc: カテゴリを削除するトランザクションを開始 (delete)
    Svc->>CatRepo: カテゴリの行をロックして読む (lock)
    CatRepo-->>Svc: カテゴリ (なければなし)
    Svc->>ProdRepo: 削除されていない商品がこのカテゴリを使っているかを確認 (isCategoryInUse)
    ProdRepo-->>Svc: 使っているかを返す
    break 6a 商品で使用中の場合
        Svc--xErrs: 409 CATEGORY_IN_USE の例外を投げる
        Note over Errs,Page: 409 を返し、カテゴリは削除しない。画面は「商品で使用中のカテゴリは<br/>削除できません。先に該当商品を別のカテゴリへ移してください。」を表示する。
    end
    Svc->>ProdRepo: 削除済みの商品がこのカテゴリを持っているかを確認 (existsByCategory)
    ProdRepo-->>Svc: 持っているかを返す
    alt 削除済みの商品だけが持っている
        Svc->>Svc: 行を残し、削除した日時を入れる
    else どの商品も持っていない
        Svc->>CatRepo: カテゴリの行を消す (delete)
    end
    Svc->>Db: 変更を保存する
    Db-->>Svc: 保存の完了
    Svc-->>Ctrl: 削除の結果を返す
    Ctrl-->>Http: 削除の結果を返す
    Http-->>Hook: 削除の結果
    Hook->>Ctrl: 一覧を取り直す<br/>流れは 4〜5 と同じ
    Ctrl-->>Hook: 最新のカテゴリ名のリストを返す
    Hook-->>Page: 成功を返す
    Page-->>User: ダイアログを閉じ、「カテゴリを削除しました。」と<br/>対象を除いた一覧を表示
```

![EC-A09 シーケンス図](<images/EC-A09_商品カテゴリを削除する-1.png>)
