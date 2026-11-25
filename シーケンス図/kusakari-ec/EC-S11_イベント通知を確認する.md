# EC-S11 イベント通知を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面のサイドバー<br/>(Workspace.jsx)
        participant Page as 出店者通知画面<br/>(Notices.jsx)
        participant Hook as 一覧の取得と変更<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 通知API<br/>(NotificationController.java)
        participant Svc as 通知の処理<br/>(NotificationService.java)
        participant Pend as オーナーの譲渡申請<br/>(PendingOwnerSuccession.java)
        participant Org as 組織の読み書き<br/>(OrganizationRepository.java)
        participant SM as 店舗の所属の読み書き<br/>(StoreMemberRepository.java)
        participant Repo as 通知の読み書き<br/>(NotificationRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、19、一覧の取り直しの 26 に適用<br/>*a 通信に失敗した場合: 4、19、一覧の取り直しの 26 に適用

    User->>Work: 出店者メニューの「出店者通知」をクリック
    Work->>Page: 出店者通知画面を表示
    Page->>Hook: 通知の一覧を取得する処理を呼ぶ
    Hook->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/notifications
    Ctrl->>Svc: 自分あての通知を取得するトランザクションを開始 (list)
    Svc->>Pend: 期限が過ぎた譲渡申請を無効にする処理を呼ぶ (expireIfDueFor)<br/>自分がオーナーか譲渡先の、期限が過ぎた申請を探す
    opt 期限が過ぎた譲渡申請があるとき (記述なし)
        Pend->>Db: 組織の行をロックして確かめ直し、申請を無効にする
        Note over Pend,Db: 承認待ちを空にし、履歴と<br/>「オーナーの譲渡の申し出が無効になりました」の通知を保存する。
    end
    Svc->>SM: 見られる通知の条件を作る (visibility)<br/>店舗の担当者なら、自分が所属する店舗も読む
    Svc->>Repo: 自分あての通知を新しい順に読み、見られる通知だけを残す
    Svc->>Org: 自分あての期限内の譲渡申請があるかを調べる
    Svc->>Svc: あれば、いちばん新しい譲渡申請の通知を<br/>承認・断りのできる通知にする
    Ctrl-->>Hook: 通知のリストを返す
    Hook-->>Page: 通知
    Page-->>User: 通知ごとのタイトル、本文、日時と、「既読」か「既読にする」を表示<br/>譲渡申請の通知には「重要」(承認できるなら「承認する」「断る」も)
    User->>Page: 通知の内容を確かめる

    User->>Page: 未読の通知の「既読にする」をクリック
    Page->>Hook: 通知を既読にする処理を呼ぶ (run)
    Hook->>Http: 同左
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>PUT /api/notifications/{id}/read
    Ctrl->>Svc: 通知を既読にするトランザクションを開始 (read)
    Svc->>Repo: 通知を読み、本人あてで今も見られる通知かを確かめる<br/>見られる通知の条件の作り方は 8 と同じ
    Svc->>Svc: 既読の日時を入れる (markRead)
    Svc->>Db: 既読にした通知の行を保存する
    Ctrl-->>Http: 既読にしたことを返す
    Http-->>Hook: 既読にしたこと
    Hook->>Ctrl: 通知を取り直す<br/>流れは 4〜12 と同じ
    Ctrl-->>Hook: 最新の通知のリストを返す
    Hook-->>Page: 成功を返す
    Page-->>User: 「保存しました。」と、その通知の「既読」を表示
```

![EC-S11 シーケンス図](<images/EC-S11_イベント通知を確認する-1.png>)
