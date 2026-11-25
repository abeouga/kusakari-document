# EC-A10 商品の公開を停止・再開する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as 商品管理画面<br/>(OperatorPages.jsx)
        participant Mod as 警告・停止の操作<br/>(Moderation.jsx)
        participant Dlg as 確認ダイアログ<br/>(ConfirmDialog.jsx)
        participant Hook as 一覧の取得と変更<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 商品の警告・停止API<br/>(ProductModerationController.java)
        participant Svc as 商品の警告・停止の処理<br/>(ProductModerationService.java)
        participant ProdRepo as 商品の読み書き<br/>(ProductRepository.java)
        participant EvRepo as 警告・停止の履歴の読み書き<br/>(ProductModerationEventRepository.java)
        participant Notices as 通知<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、20、一覧の取り直しの 33 に適用<br/>*a 通信に失敗した場合: 2 (URL を直接開いたときのログインの確認)、4、20、一覧の取り直しの 33 に適用

    User->>Work: 運営者メニューの「商品管理」をクリック
    Work->>Page: 商品管理画面を表示
    Page->>Hook: 商品の一覧を取得する処理を呼ぶ
    Hook->>Ctrl: 同左<br/>GET /api/operator/products (流れは EC-A06 の図と同じ)
    Ctrl-->>Hook: 商品のリストを返す
    Hook-->>Page: 商品のリスト
    Page->>Mod: 商品ごとに警告・停止の操作を表示
    Mod-->>User: 商品名、店舗、公開状態、「警告する」、<br/>停止中なら「公開停止を解除」、そうでなければ「公開を停止」を表示

    alt 基本フロー 公開を停止する
        User->>Mod: デンジャーエリアの「公開を停止」をクリック
        Mod->>Dlg: 確認ダイアログを表示
        Dlg-->>User: 「公開停止の確認」、商品名、<br/>「理由（必須・出店者に通知します）」欄を表示
    else 3a 停止せずに警告する
        User->>Mod: 「警告する」をクリック
        Note over User,Dlg: 「警告の確認」のダイアログを表示する。理由は必須。
    else 3b 警告を解除する
        User->>Mod: 「警告を解除」をクリック
        Note over User,Dlg: 「警告の解除の確認」のダイアログを表示する。理由は任意。
    else 3c 公開停止を解除する
        User->>Mod: 「公開停止を解除」をクリック
        Note over User,Dlg: 「公開停止の解除の確認」のダイアログを表示する。理由は任意。
    end
    User->>Dlg: 理由を入力
    User->>Dlg: 「公開停止を確定」をクリック<br/>(3a「警告する」、3b「警告を解除する」、3c「公開停止の解除を確定」)
    Dlg->>Mod: 16 の操作を反映
    Mod->>Hook: 停止・警告の操作をする処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>停止・解除は PUT /api/operator/products/{id}/moderation、<br/>警告・解除は PUT /api/operator/products/{id}/warning
    Ctrl->>Svc: 停止・解除 (suspend) か警告・解除 (warn) のトランザクションを開始
    Svc->>ProdRepo: 商品の行をロックして読む (findLocked)
    ProdRepo-->>Svc: 商品を返す
    opt 3b 警告を解除するとき
        Svc->>EvRepo: 今の警告を求めるため、商品の履歴を取得
        Note over Svc,Db: 履歴を新しい順に読み、今の警告を求める。
    end
    alt 状態が変わるとき
        Svc->>EvRepo: 停止・解除なら商品の公開停止の印を書き換え、<br/>操作の履歴を保存する (record)
        Svc->>Notices: 店舗のオーナーと担当者に通知を保存する処理を呼ぶ (toStore)
    else すでにその状態のとき
        Svc->>Svc: 何も変えない。履歴も通知も足さない
    end
    Svc->>EvRepo: 変更を保存し、商品の履歴を新しい順に取得
    EvRepo-->>Svc: 履歴を返す
    Svc-->>Ctrl: 停止中かと今の警告を返す
    Ctrl-->>Http: 停止中かと今の警告を返す
    Http-->>Hook: 操作の結果
    Hook->>Ctrl: 一覧を取り直す<br/>流れは 4〜5 と同じ
    Ctrl-->>Hook: 最新の商品のリストを返す
    Hook-->>Mod: 成功を返す
    Mod-->>User: ダイアログを閉じ、「停止しました。出店者に通知しました。」と<br/>更新後の公開状態を表示
```

![EC-A10 シーケンス図](<images/EC-A10_商品の公開を停止・再開する-1.png>)
