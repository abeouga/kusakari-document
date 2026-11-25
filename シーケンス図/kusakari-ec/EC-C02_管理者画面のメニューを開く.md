# EC-C02 管理者画面のメニューを開く

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>(KusakariHeader.jsx)
        participant App as EC の画面<br/>(App.jsx)
        participant Nav as URL の切り替え<br/>(navigation.js)
        participant Work as 運営者画面<br/>(Workspace.jsx)
        participant Side as 運営者画面のサイドバー<br/>(WorkspaceSidebar.jsx)
        participant Members as 会員管理画面<br/>(OperatorPages.jsx)
        participant UseAuth as ログイン状態の確認<br/>(useAuth.js)
        participant AuthJs as ログイン状態の読み込み<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>(AuthController.java)
        participant AuthSvc as ログイン中の会員<br/>(AuthService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 8 (URL を直接開いたときも同じ) に適用<br/>*a 通信に失敗した場合: 8 に適用

    User->>Head: 共通ヘッダーの「管理者画面」をクリック<br/>(運営者のときだけ出る)
    Head->>App: 移動先の URL を渡す
    App->>Nav: URL を切り替える処理を呼ぶ (navigate)
    Nav-->>App: 「会員管理」の URL を返す
    App->>Work: 運営者画面を表示
    Work->>UseAuth: ログイン状態を取得する処理を呼ぶ (useAuth)
    UseAuth->>AuthJs: 同左
    AuthJs->>AuthCtrl: バックエンドのAPIを叩く<br/>GET /api/auth/me
    AuthCtrl->>AuthSvc: ログイン状態を作る処理を呼ぶ (session)
    AuthSvc->>Db: ログイン中の会員と所属を読む
    AuthSvc-->>AuthCtrl: ログイン状態を返す
    AuthCtrl-->>AuthJs: ログイン状態 (アカウントの種類は運営者) を返す
    AuthJs-->>UseAuth: ログイン状態を返す
    UseAuth-->>Work: ログイン状態を返す
    Work->>Work: 運営者なので、運営者メニューにする
    Work->>Side: 運営者メニューを渡す
    Side-->>User: 「運営者メニュー」と「メニューを閉じる」、「商品一覧へ戻る」、<br/>「会員管理」「商品管理」「カテゴリ管理」「出店審査」<br/>「店舗管理」「組織管理」「全注文管理」を表示
    Work->>Members: 会員管理画面を表示
    Members-->>User: 会員の一覧を表示 (流れは EC-A01 の図と同じ)

    opt 「会員管理」以外のメニューを開くとき
        User->>Side: サイドバーの対象のメニュー (「商品管理」など) をクリック
        Note over User,Side: その画面に切り替える。ログイン状態は読み直さない。
    end
    opt サイドバーを折りたたむとき
        User->>Side: 「メニューを閉じる」をクリック
        Note over User,Side: アイコンだけのサイドバーになり、ボタンは「メニューを開く」になる。
    end
```

![EC-C02 シーケンス図](<images/EC-C02_管理者画面のメニューを開く-1.png>)
