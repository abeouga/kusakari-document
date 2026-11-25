# EC-B18 出店申請状況を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 出店申請状況画面<br/>ApplicationStatusPage<br/>(StoreApplication.jsx)
        participant Form as 出店申請画面<br/>ApplicationPage<br/>(StoreApplication.jsx)
        participant Status as エラーと完了の表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 申請の取得と取り下げ<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant Svc as 出店申請の処理<br/>StoreApplicationService<br/>(StoreApplicationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、「再申請する」の後の申請の取得の 13、20、取り直しの 28 に適用<br/>*a 通信に失敗した場合: 4、「再申請する」の後の申請の取得の 13、18、20、取り直しの 28 に適用

    User->>Work: マイページのサイドバー「出店をご検討の方」の<br/>「出店申請状況」をクリック
    Work->>Page: URL を /seller/application/status に変え、<br/>ApplicationStatusPage を表示
    Page->>Hook: 自分の出店申請を取りに行くよう頼む (useResource)
    Hook->>Ctrl: 画面を開いたときに自動で申請の一覧の通信を始める (reload → request)<br/>GET /api/account/store-applications
    Ctrl->>Svc: 自分の申請の一覧を作るよう頼む (list)。読み取り専用のトランザクション<br/>ログイン中の会員を読み (current)、その会員の申請を新しい順に読む<br/>(findByMemberIdOrderByCreatedAtDesc、SELECT organization_applications)
    Svc-->>Ctrl: 今の申請と前回の申請のリスト (view)
    Ctrl-->>Hook: 200 申請の配列
    Hook-->>Page: 申請の配列。先頭を最新の申請にする (latest = list[0])
    alt 3 最新の申請が審査中 (SUBMITTED)
        Page-->>User: 「審査状況：審査中」、「申請日：」、「申請内容」(Summary、閲覧のみ)、<br/>「提出書類を確認」、「審査結果は通知でお知らせします。」、「申請を取り下げる」
    else 3a 却下 (REJECTED)
        Page-->>User: 3a-1「審査状況：却下」、「申請日：」、「却下理由：」と運営者が入力した理由、<br/>「申請内容」、「提出書類を確認」、「再申請する」
    else 3b 取り下げ済み (WITHDRAWN)
        Page-->>User: 3b-1「審査状況：取り下げ済み」、「申請日：」、「申請内容」、<br/>「提出書類を確認」、「再申請する」
    else 3c 承認 (APPROVED)
        Page-->>User: 3c-1「審査状況：承認」、「申請日：」、「申請内容」、「提出書類を確認」、<br/>「承認されました。ページを再読み込みすると、出店者メニューから<br/>店舗を作成できます。」(3c-2 ユースケースを終了する)
    end

    opt 3a-2・3b-2 再申請する (却下か取り下げ済み、canReapply)
        User->>Page: 「再申請する」をクリック
        Note over Page,Hook: 結果: URL を /seller/application に変えて ApplicationPage を表示し (navigate)、申請を取り直す (流れは 3〜7 と同じ)。<br/>画面: 3a-3 前回の内容が入った「ステップ 1 / 4：事業者情報」と「前回の申請内容を入力しています。…」(3a-4 EC-B17 の基本フロー 2 へ進む)
    end

    alt 4a 審査中の申請を取り下げる
        User->>Page: 4a-1「申請を取り下げる」をクリック
        Page->>Hook: 取り下げを実行し、成功の文「申請を取り下げました。」を渡す (run)<br/>終わるまでボタンは押せない (busy)
        Hook->>Http: 取り下げの通信を送る (write → request)
        Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
        AuthJs->>Ctrl: PUT /api/account/store-applications/{id}/withdrawal<br/>(CSRF トークンのヘッダー付き)
        Ctrl->>Svc: 申請を取り下げるよう頼む (withdraw)。全体が 1 つのトランザクション<br/>申請の行をロックして読み (lock、SELECT ... FOR UPDATE organization_applications)、<br/>ログイン中の会員の申請かを確かめる (current)
        Svc->>Svc: 申請を取り下げ済みにする (withdraw、WITHDRAWN)
        Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE organization_applications)
        Db-->>Svc: 完了
        Svc-->>Ctrl: 取り下げた申請 (view)
        Ctrl-->>Http: 200 取り下げた申請
        Http-->>Hook: 取り下げた申請
        Hook->>Ctrl: 申請を取り直す (reload)<br/>GET /api/account/store-applications。流れは 4〜7 と同じ
        Ctrl-->>Hook: 最新の申請の配列 (取り下げ済み)
        Hook->>Status: 成功の文を出し (setNotice)、成功を返す (run が true)
        Status-->>User: 4a-2「申請を取り下げました。」と、その下に「審査状況：取り下げ済み」、<br/>「再申請する」(4a-3 代替フロー 3b へ進む)
    end
```

![EC-B18 シーケンス図](<images/EC-B18_出店申請状況を確認する-1.png>)
