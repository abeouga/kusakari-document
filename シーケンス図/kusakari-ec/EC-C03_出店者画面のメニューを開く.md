# EC-C03 出店者画面のメニューを開く

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>(KusakariHeader.jsx)
        participant App as EC の画面<br/>(App.jsx)
        participant Nav as URL の切り替え<br/>(navigation.js)
        participant Shop as 店舗とカートの状態<br/>(useShop.js)
        participant Work as 出店者画面<br/>(Workspace.jsx)
        participant Side as 出店者画面のサイドバー<br/>(WorkspaceSidebar.jsx)
        participant PM as 商品管理画面<br/>(ProductManager.jsx)
        participant Sel as 店舗の選択欄<br/>(SellerStoreSelect.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>(AuthController.java)
        participant StCtrl as 店舗API<br/>(StoreController.java)
    end

    Note over User,StCtrl: 共通代替フロー<br/>*b 未ログインの場合: 6、16 (URL を直接開いたときも同じ) に適用<br/>*a 通信に失敗した場合: 6、16 に適用

    User->>App: EC の「メイン」画面を開く
    App->>Shop: 店舗とカートの状態を用意する処理を呼ぶ (useShop)
    Shop->>AuthCtrl: ログイン状態を取得する (useAuth)<br/>GET /api/auth/me
    AuthCtrl-->>Shop: ログイン状態 (アカウントの種類、組織での立場) を返す
    Shop->>Shop: 店舗側のアカウントか運営者かを確かめる
    Shop->>StCtrl: 扱える店舗の一覧を取得する<br/>GET /api/seller/stores
    StCtrl-->>Shop: 店舗のリスト (未完了の注文の件数、運営の警告、立場) を返す
    Shop-->>App: 扱える店舗と、選んでいる店舗を返す
    App->>Head: 共通ヘッダーに「出店者」を出す
    Head-->>User: 共通ヘッダーに「出店者」を表示

    User->>Head: 共通ヘッダーの「出店者」をクリック
    Head->>App: 移動先の URL を渡す
    App->>Nav: URL を切り替える処理を呼ぶ (navigate)
    Nav-->>App: 「商品管理」の URL を返す
    App->>Work: 出店者画面を表示
    Work->>AuthCtrl: ログイン状態を取得する (useAuth)<br/>GET /api/auth/me (流れは 3〜4 と同じ)
    AuthCtrl-->>Work: ログイン状態を返す
    Work->>Shop: 読み込み済みの店舗と、選んでいる店舗を取得する
    Shop-->>Work: 6〜7 で読んだ店舗と、選んでいる店舗を返す
    Work->>Work: 組織と店舗での立場から、<br/>「アカウント」「招待キー」「履歴」のメニューを出すかを決める
    Work->>Side: 出店者メニューを渡す
    Side-->>User: 「出店者メニュー」と「メニューを閉じる」、「商品一覧へ戻る」、<br/>「商品管理」「店舗受け取り」「注文実績」「店舗一覧」「店舗プロフィール」「出店者通知」<br/>(立場によっては「アカウント」「招待キー」「履歴」も) を表示
    Work->>PM: 商品管理画面を表示
    PM->>Sel: 店舗の選択欄を表示
    Sel-->>User: 見出し「商品管理」と「管理する店舗」の選択欄を表示
    PM-->>User: 「商品管理」画面を表示 (商品の取得は EC-S03 の図と同じ流れ)

    User->>Side: サイドバーの対象のメニューをクリック
    Side->>Work: その画面に切り替える<br/>(ログイン状態と店舗は読み直さない)
    opt 店舗ごとの画面で、店舗が 2 つ以上あるとき
        Work->>Sel: 画面の上に「管理する店舗」の選択欄を表示
    end
    Work-->>User: そのメニューの見出しと画面を表示
    opt 3a 管理する店舗を選ぶとき
        User->>Sel: 「管理する店舗」で店舗を選ぶ
        Note over User,Sel: 選んだ店舗を保持し、その店舗の内容で画面を表示し直す。
    end
    opt サイドバーを折りたたむとき
        User->>Side: 「メニューを閉じる」をクリック
        Note over User,Side: アイコンだけのサイドバーになり、ボタンは「メニューを開く」になる。
    end
```

![EC-C03 シーケンス図](<images/EC-C03_出店者画面のメニューを開く-1.png>)
