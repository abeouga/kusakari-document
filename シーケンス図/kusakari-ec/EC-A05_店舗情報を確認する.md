# EC-A05 店舗情報を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面のサイドバー<br>(Workspace.jsx)
        participant Page as 店舗管理画面<br/>(OperatorStores.jsx)
        participant Mod as 警告・停止の操作<br/>(Moderation.jsx)
        participant Sales as 店舗の注文実績<br/>(SalesReport.jsx)
        participant Hook as 一覧の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 店舗API<br/>(StoreController.java)
        participant SCtrl as 注文実績API<br/>(SalesReportController.java)
        participant Svc as 店舗の処理<br/>(StoreService.java)
        participant SSvc as 注文実績の処理<br/>(SalesReportService.java)
        participant Mods as 店舗の警告・停止<br/>(StoreModerationService.java)
        participant Repo as 店舗の読み書き<br/>(StoreRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2・26 (URL を直接開いたときのログインの確認)、5、29、41 に適用<br/>*a 通信に失敗した場合: 5、29、41 に適用

    User->>Work: 運営者メニューの「店舗管理」をクリック
    Work->>Page: 店舗管理画面を表示する　
    Page->>Hook: 店舗の一覧を取りに行く処理を呼ぶ
    Hook->>Http: 同左
    Http->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/operator/stores
    Ctrl->>Svc: 店舗の一覧を取得するトランザクションを開始 (list)
    Svc->>Repo: 全店舗を ID の順に取得
    Repo-->>Svc: 閉鎖済みも含む全店舗を返す
    Svc->>Mods: 店舗ごとに、警告中かを確認
    Mods-->>Svc: 警告中の店舗と、その警告 (理由、日時) を返す
    loop 店舗ごと
        Svc->>Db: 会社名と、未完了の注文の件数を取得
        Db-->>Svc: 会社名と未完了の注文の件数を返す
    end
    Svc-->>Ctrl: 店舗のリストを返す
    Ctrl-->>Http: 店舗のリストを返す
    Http-->>Hook: 店舗のリストを返す
    Hook-->>Page: 店舗のリストを返す
    Page->>Page: 検索欄の文字を含む店舗だけを残す (最初は空なので全店舗)
    Page->>Page: 店舗ごとに「公開中」、「非公開」、「運営により停止中」、<br/>「閉鎖中」、「閉鎖済み」のどれかにする
    opt 閉鎖済みでない店舗
        Page->>Mod: 警告と警告・停止の操作を表示
        Note over Page,Mod: 警告中なら「警告中」と「運営からの警告：理由」と日時を表示する。
    end
    Page-->>User: 「店舗名・会社名・所在地で検索」欄と、<br/>店舗名、会社名、所在地、状態、「注文実績を見る」を表示

    User->>Page: 「店舗名・会社名・所在地で検索」欄に入力
    Page->>Page: 店舗名・会社名・所在地に入力を含む店舗だけを残す
    Page-->>User: 絞り込んだ店舗の一覧を表示

    alt 5a 店舗の注文実績を確認する
        User->>Page: 対象店舗の「注文実績を見る」をクリック
        Page->>Work: 店舗の注文実績画面に移る
        Work->>Sales: 店舗の注文実績画面を表示
        Sales->>Hook: 注文実績を取得する処理を呼ぶ
        Hook->>Http: 同左
        Http->>SCtrl: バックエンドのAPIを叩く<br/>GET /api/operator/stores/{店舗 ID}/sales
        SCtrl->>SSvc: 店舗の注文実績を取得するトランザクションを開始 (operatorReport)
        SSvc->>Db: 店舗の注文を新しい順に取得
        Db-->>SSvc: 注文を返す
        SSvc->>SSvc: 注文ごとの販売手数料と差引額、件数と合計を出す
        SSvc-->>SCtrl: 注文実績を返す
        SCtrl-->>Http: 注文実績を返す
        Http-->>Hook: 注文実績を返す
        Hook-->>Sales: 注文実績を返す
        Sales-->>User: 状態ごとの注文の件数、注文金額・販売手数料・差引額の合計、<br/>注文ごとの一覧を表示
        User->>Work: 「店舗管理へ戻る」をクリック
        Work->>Page: 店舗管理画面を表示
        Page->>Hook: 店舗の一覧を取り直す<br/>流れは 4〜16 と同じ
        Hook-->>Page: 店舗のリストを返す
        Page-->>User: 店舗の一覧を表示
    end
```

![EC-A05 シーケンス図](<images/EC-A05_店舗情報を確認する-1.png>)
