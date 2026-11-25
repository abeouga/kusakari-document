# EC-A06 商品情報を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 商品管理画面<br/>ReviewPage<br/>(OperatorPages.jsx)
        participant Row as 商品の行<br/>ProductModerationRow<br/>(OperatorPages.jsx)
        participant Mod as 警告・停止の操作<br/>ModerationControls<br/>(Moderation.jsx)
        participant Ev as 警告・停止の履歴<br/>ModerationEvents<br/>(Moderation.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 商品の警告・停止API<br/>ProductModerationController<br/>(ProductModerationController.java)
        participant Svc as 商品の警告・停止の処理<br/>ProductModerationService<br/>(ProductModerationService.java)
        participant Hist as 履歴の読み方<br/>ModerationHistory<br/>(ModerationHistory.java)
        participant Repo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、27 に適用<br/>*a 通信に失敗した場合: 5、27 に適用

    User->>Work: 運営者メニューの「商品管理」をクリック
    Work->>Page: URL を /operator/products に変え、<br/>ReviewPage を商品の一覧として表示 (products)
    Page->>Hook: 商品の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/operator/products
    Ctrl->>Svc: 商品の一覧を作るよう頼む (list)。list 全体が読むだけのトランザクション<br/>ログイン中の人が運営者かを確かめる (AuthService.requireAdmin)
    Svc->>Db: 全店舗 (StoreRepository.findAll) と全在庫 (InventoryRepository.findAll)、<br/>商品の警告と警告の解除の履歴を新しい順に読む<br/>(ProductModerationEventRepository.findByEventTypeInOrderByIdDesc)
    Db-->>Svc: 店舗の行 (店舗 ID と店舗名の対応にする)、<br/>在庫の行 (商品 ID と公開の状態の対応にする)、履歴の行
    Svc->>Hist: 商品ごとに、警告と警告の解除のうち最新の行が<br/>警告なら警告中とするよう頼む (activeWarnings)
    Hist-->>Svc: 警告中の商品と、その警告 (理由、日時)
    Svc->>Repo: 商品を追加した人の表示名 (findAllCreatorNames、SELECT products JOIN members) と、<br/>全商品を画像ごと読む (findAll、SELECT products、product_images)
    Repo-->>Svc: 商品 ID と表示名 (追加した人がない商品は入らない)、<br/>全商品のリスト (削除済みも含む)
    Svc->>Svc: 商品ごとにまとめる。在庫が DELETED でなければ active<br/>(在庫の行がなければ削除済みと同じ)、停止は商品の suspended の列
    Svc-->>Ctrl: 商品のリスト (id、name、storeId、storeName、<br/>active、suspended、warning、createdByName)
    Ctrl-->>Http: 200 商品の配列
    Http-->>Hook: 商品の一覧
    Hook-->>Page: 商品の一覧
    loop 商品ごと (サーバーが返した順のまま)
        Page->>Row: 商品の行を表示 (ProductModerationRow)
        Row->>Row: 公開状態を決める。停止なら「公開停止中」、<br/>そうでなく active なら「公開可能」、それ以外は「販売終了」
        Row->>Mod: 警告と警告・停止の操作を表示 (ModerationControls)
        Mod-->>User: 警告中なら「警告中」、「運営からの警告：理由」と日時 (WarningBadge)、<br/>「警告・停止の履歴」、警告・停止の操作 (EC-A10)
        Row-->>User: 商品名、「店舗：店舗名」、<br/>「追加した人：表示名」(なければ「初期データ」)、公開状態
    end

    User->>Mod: 対象商品の「警告・停止の履歴」を開く
    Mod->>Ev: 開いたことを覚え、履歴を表示する<br/>(details の onToggle → setHistoryOpen(true) → ModerationEvents)
    Ev->>Hook: 履歴を取りに行くよう頼む (useResource)。<br/>取るのは開いたときが初めて (取得中は「読み込み中です。」)
    Hook->>Http: 履歴の通信を始める (reload → request)
    Http->>Ctrl: GET /api/operator/products/{商品 ID}/moderation-events
    Ctrl->>Svc: 商品の履歴を読むよう頼む (events)。全体が読むだけのトランザクション<br/>運営者かを確かめ (AuthService.requireAdmin)、<br/>商品があるかを確かめる (ProductRepository.existsById、SELECT products)
    Svc->>Db: その商品の履歴を新しい順に読む<br/>(ProductModerationEventRepository.findByProductIdOrderByIdDesc)
    Db-->>Svc: 警告・警告の解除・停止・再開の行
    Svc->>Hist: 履歴を表示の形にするよう頼む (views)<br/>操作した運営者の会員を読む (AuthMemberRepository.findAllById)
    Hist-->>Svc: 履歴 (type、reason、actorName は表示名か、<br/>空ならメールアドレス、createdAt)
    Svc-->>Ctrl: 履歴のリスト
    Ctrl-->>Http: 200 履歴の配列
    Http-->>Hook: 履歴
    Hook-->>Ev: 履歴
    Ev-->>User: 新しい順に 1 行ずつ「日時 警告／警告の解除／停止／再開<br/>（運営者名）：理由」(理由が空なら「：理由」を出さない)
```

![EC-A06 シーケンス図](<images/EC-A06_商品情報を確認する-1.png>)
