# EC-S02 店舗プロフィールを編集する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Stores as 店舗一覧画面<br/>(SellerStores.jsx)
        participant Select as 店舗の選択欄<br/>(SellerStoreSelect.jsx)
        participant Shop as 選んでいる店舗<br/>(useShop.js)
        participant Page as 店舗プロフィール画面<br/>(PartnerForms.jsx)
        participant Hook as プロフィールの取得と保存<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 店舗API<br/>(StoreController.java)
        participant Svc as 店舗の処理<br/>(StoreService.java)
        participant Auth as ログイン中の会員<br/>(AuthService.java)
        participant Mod as 店舗への運営の警告<br/>(StoreModerationService.java)
        participant Repo as 店舗の読み書き<br/>(StoreRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 5 (URL を直接開いたときのログインの確認)、8、21、プロフィールの取り直しの 32 に適用<br/>*a 通信に失敗した場合: 8、21、プロフィールの取り直しの 32 に適用

    alt 1b 「店舗一覧」から開くとき
        User->>Stores: 「店舗一覧」画面で対象の店舗の「店舗情報を編集」をクリック
        Stores->>Shop: その店舗を、選んでいる店舗にする (setSellerStoreId)
        Stores->>Work: 店舗プロフィール画面へ移る
    else メニューから開くとき
        User->>Work: 出店者メニューの「店舗プロフィール」をクリック
    end
    Work->>Page: 選んでいる店舗の店舗プロフィール画面を表示

    Page->>Hook: 店舗のプロフィールを取得する処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/stores/{id}
    Ctrl->>Svc: 店舗のプロフィールを取得するトランザクションを開始 (get)
    Svc->>Repo: 店舗と会社名を読み、ログイン中の人が<br/>この店舗の担当として見られるかを確かめる (canViewAsStaff)
    Svc->>Mod: 店舗に今出ている運営の警告を取得する (activeWarnings)
    Svc-->>Ctrl: 警告を付けたプロフィールを返す
    Ctrl-->>Http: プロフィールを返す
    Http-->>Hook: プロフィールを返す
    Hook-->>Page: プロフィールを返す
    Page-->>User: 警告があれば「警告中」と「運営からの警告：理由」、「会社名：…」、<br/>店舗名・担当者・問い合わせメール・所在地・営業時間・店舗紹介の入力欄、<br/>「店舗情報を保存」を表示

    opt 1a 管理できる店舗が 2 つ以上あるとき
        User->>Select: 「管理する店舗」の選択欄で、編集する店舗を選ぶ
        Note over User,Page: 選んだ店舗のプロフィール画面を作り直す。流れは 6〜16 と同じ。
    end

    User->>Page: 入力欄を編集し、「店舗情報を保存」をクリック
    Page->>Hook: 入力した 6 項目と、表示したときの版で保存する処理を呼ぶ (save)
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/seller/stores/{id}
    Ctrl->>Ctrl: 入力を検査する
    Ctrl->>Svc: 店舗のプロフィールを保存するトランザクションを開始 (save)
    Svc->>Auth: オーナーか、その店舗を管理できる担当者かを確かめ、<br/>店舗を読む (requireManager)
    opt 店舗名を変えたとき
        Svc->>Repo: 同じ組織に同じ名前の店舗があるかを読む (existsByOrganizationIdAndName)
    end
    Svc->>Svc: 入力を店舗に書き込む (updateProfile)
    Svc->>Repo: 書き込んだ店舗を保存する (flush)
    Repo->>Db: 版が変わっていなければ店舗の行を書き換え、版を 1 増やす
    Svc-->>Ctrl: 会社名を付けた保存後のプロフィールを返す
    Ctrl-->>Http: 保存後のプロフィールを返す
    Http-->>Hook: 保存後のプロフィールを返す
    Hook->>Ctrl: 最新のプロフィールを取り直す<br/>流れは 8〜14 と同じ
    Ctrl-->>Hook: 最新のプロフィールを返す
    Hook-->>Page: 成功を返す
    Page-->>User: 「保存しました。」と、保存した内容の入力欄を表示
```

![EC-S02 シーケンス図](<images/EC-S02_店舗プロフィールを編集する-1.png>)
