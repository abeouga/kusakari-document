# EC-B05 販売店舗の情報を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant StoreLink as 「販売店舗の紹介を見る」<br/>(Common.jsx)
        participant App as EC の画面の切り替え<br/>(App.jsx)
        participant Work as マイページのサイドバー<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態の取得<br/>(useAuth.js)
        participant AuthJs as ログインの通信<br/>(auth.js)
        participant Profile as 店舗紹介画面<br/>(PartnerForms.jsx)
        participant Res as 店舗の情報の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>(AuthController.java)
        participant Ctrl as 店舗API<br/>(StoreController.java)
        participant Svc as 店舗の処理<br/>(StoreService.java)
        participant Mod as 運営者の警告<br/>(StoreModerationService.java)
        participant StoreRepo as 店舗の読み書き<br/>(StoreRepository.java)
        participant OrgRepo as 組織の読み書き<br/>(OrganizationRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*a 通信に失敗した場合: 7、15 (「再取得」で送り直したときも) に適用

    User->>StoreLink: 「植物について」ダイアログの「販売店舗の紹介を見る」をクリック
    StoreLink->>App: 店舗のページへ移る
    App->>Work: 店舗紹介のページを表示し、「植物について」ダイアログを閉じる
    Work->>UseAuth: ログイン状態を取得する処理を呼ぶ (useAuth)
    Work-->>User: 「ログイン状態を確認しています。」を表示
    UseAuth->>AuthJs: 同左 (readSession)
    AuthJs->>AuthCtrl: バックエンドのAPIを叩く<br/>GET /api/auth/me
    AuthCtrl-->>AuthJs: ログイン状態を返す (未ログインでもよい)
    AuthJs-->>Work: ログイン状態を返す
    Work->>Work: 店舗のページなので、未ログインでもログイン欄を出さない
    Work->>Profile: 店舗紹介画面を読み取り専用で表示
    Profile->>Res: 店舗の情報を取得する処理を呼ぶ
    Res->>Http: 同左
    Profile-->>User: 「読み込んでいます。」を表示
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/stores/{店舗 ID} (ログインしていなくてもよい)
    Ctrl->>Svc: 店舗の公開ページの情報を取得するトランザクションを開始 (get)
    Svc->>StoreRepo: 店舗を読む
    StoreRepo-->>Svc: 店舗を返す
    Svc->>OrgRepo: 会社名を出すために組織を読む
    OrgRepo-->>Svc: 組織を返す
    Svc->>Svc: 購入者に見せる店舗か (公開中で、店舗も組織も止まっていない) と、<br/>店舗側の立場 (運営者、組織のオーナー、店舗の担当者) で見られるかを確かめる
    opt 店舗側の立場で見られる (記述なし)
        Svc->>Mod: 運営者から出ている警告を読む (warnings)
        Note over Svc,Mod: 警告は店舗側の人にだけ返し、購入者と未ログインには返さない。
    end
    Svc-->>Ctrl: 店舗の情報を返す
    Ctrl-->>Http: 店舗の情報を返す
    Http-->>Res: 店舗の情報を返す
    Res-->>Profile: 店舗の情報を返す
    Profile-->>User: 店舗名、「所在地 / 営業時間」、店舗紹介と、<br/>「閉店予定」「営業中」「受付休止」のどれかを表示
```

![EC-B05 シーケンス図](<images/EC-B05_販売店舗の情報を確認する-1.png>)
