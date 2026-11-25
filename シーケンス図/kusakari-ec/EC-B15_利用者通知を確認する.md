# EC-B15 利用者通知を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 通知一覧画面<br/>Notices<br/>(Notices.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 通知API<br/>NotificationController<br/>(NotificationController.java)
        participant Svc as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
        participant Pend as オーナーの譲渡の申し出<br/>PendingOwnerSuccession<br/>(PendingOwnerSuccession.java)
        participant Org as 組織の読み書き<br/>OrganizationRepository<br/>(OrganizationRepository.java)
        participant Repo as 通知の読み書き<br/>NotificationRepository<br/>(NotificationRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、25、一覧の取り直しの 36 に適用<br/>*a 通信に失敗した場合: 5、23、25、一覧の取り直しの 36 に適用

    User->>Work: マイページのメニューの「通知一覧」をクリック (EC-C01)
    Work->>Page: URL を /notifications に変え、<br/>Notices を表示
    Page->>Hook: 通知の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/notifications
    Ctrl->>Svc: 自分あての通知の一覧を作るよう頼む (list)。list 全体が 1 つのトランザクション<br/>ログイン中の会員を調べる (AuthService の current)
    Svc->>Pend: 期限切れのオーナーの譲渡の申し出を無効にするよう頼む (expireIfDueFor)<br/>自分がオーナーか譲渡先で、申し出の期限が過ぎた組織を探す<br/>(OrganizationRepository の findIdsWithExpiredOwnerSuccession、SELECT organizations)
    Pend-->>Svc: 終わった (購入者は該当する組織が 0 件なので何もしない)
    Svc->>Svc: 見られる通知の条件を決める (visibility)<br/>担当者 (SHOP_STAFF) 以外は自分あての通知がすべて見える
    Svc->>Repo: 自分あての通知を新しい順に読む<br/>(findByMemberIdOrderByCreatedAtDesc、SELECT notifications)
    Repo-->>Svc: 通知のリスト
    Svc->>Org: 自分あての期限内の譲渡の申し出があるかを調べる (answerableRequest →<br/>existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter、SELECT organizations)
    Org-->>Svc: ない (購入者あての申し出はない)
    Svc-->>Ctrl: 通知の一覧 (id、category、title、body、createdAt、<br/>readAt、answerable はすべて false)
    Ctrl-->>Http: 200 通知の配列
    Http-->>Hook: 通知の一覧
    Hook-->>Page: 通知の一覧
    Page-->>User: 通知ごとのタイトル、本文、日時 (toLocaleString('ja-JP'))、<br/>既読なら「既読」、未読なら「既読にする」

    User->>Page: 必要に応じて、未読の通知の「既読にする」をクリック
    Page->>Hook: 既読にする通信を実行するよう頼む (run)<br/>成功の文を渡さないので、既定の「保存しました。」になる
    Hook->>Http: 既読にする通信を送る<br/>(write → request、本文なし)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/notifications/{id}/read<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 通知を既読にするよう頼む (read)。read 全体が 1 つのトランザクション<br/>ログイン中の会員を調べる (AuthService の current)
    Svc->>Repo: 通知を読む (findById、SELECT notifications)
    Repo-->>Svc: 通知 (なければなし)
    Svc->>Svc: 自分あてで、見られる通知だけを残す<br/>(filter、visibility)
    Svc->>Svc: 既読の日時を入れる (markRead)<br/>readAt が空のときだけ今の日時
    Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE notifications)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 終わった
    Ctrl-->>Http: 200 { read: true }
    Http-->>Hook: 既読にした結果
    Hook->>Http: 一覧を取り直す (reload)<br/>GET /api/notifications。流れは 5〜17 と同じ
    Http-->>Hook: 最新の通知の一覧
    Hook-->>Page: 成功を返す (run が true、「保存しました。」を設定)
    Page-->>User: 「保存しました。」と、その通知に「既読」
```

![EC-B15 シーケンス図](<images/EC-B15_利用者通知を確認する-1.png>)
