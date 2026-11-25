# EC-A03 出店申請を審査する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 出店審査画面<br/>ReviewPage<br/>(OperatorPages.jsx)
        participant Row as 申請の行<br/>ApplicationRow<br/>(OperatorPages.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 出店申請の処理<br/>StoreApplicationService<br/>(StoreApplicationService.java)
        participant AppRepo as 出店申請の読み書き<br/>StoreApplicationRepository<br/>(StoreApplicationRepository.java)
        participant MemRepo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
        participant OrgRepo as 組織の読み書き<br/>OrganizationRepository<br/>(OrganizationRepository.java)
        participant Notices as サイト内通知<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、24、一覧の取り直しの 42 に適用<br/>*a 通信に失敗した場合: 4、22、24、一覧の取り直しの 42 に適用

    User->>Work: 運営者メニューの「出店審査」をクリック
    Work->>Page: URL を /operator/applications に変え、<br/>ReviewPage を表示
    Page->>Hook: 出店申請の一覧を取りに行くよう頼む (useResource)
    Hook->>Ctrl: 画面を開いたときに自動で一覧の通信を始める (reload → request)<br/>GET /api/operator/applications
    Ctrl->>Svc: 運営者向けの申請の一覧を作るよう頼む (all → list(true))<br/>運営者かを確かめ (requireAdmin)、全申請を新しい順に読む<br/>(findAllByOrderByCreatedAtDesc、SELECT organization_applications)
    Svc-->>Ctrl: 申請のリスト (提出書類のデータは入れず、ファイル名だけ)
    Ctrl-->>Hook: 200 申請の配列
    Hook-->>Page: 申請の一覧
    Page->>Page: 「表示する申請」は最初「審査中」なので、審査中の申請だけ残し、<br/>申請日の古い順に並べる (scope、filter、reviewOrder)
    Page-->>User: 申請ごとの行 (ApplicationRow)。会社名、「申請者：名前 / 申請日：日付」、<br/>メール / 所在地 / 電話番号、「審査中」、「提出書類を確認」、<br/>「却下理由」欄、「承認」「却下」
    opt 3b 審査済みの申請も確認する
        User->>Page: 3b-1「表示する申請」で「すべて」を選ぶ
        Note over User,Page: 結果: 通信せず、審査中を古い順に先に、審査済みを新しい順に後に並べる (setScope('ALL')、reviewOrder)。<br/>画面: 3b-2 審査済みの行は状態と却下理由を出し、「却下理由」欄と「承認」「却下」を出さない。3b-3 基本フロー 4 へ。
    end

    User->>Row: 審査する申請の「提出書類を確認」をクリック
    Row->>Ctrl: GET /api/account/store-applications/{申請 ID}/document<br/>(a 要素のリンク。api.js を通らず、ブラウザーが Cookie を付けて送る)
    Ctrl->>Svc: 提出書類を読むよう頼む (file → document)<br/>申請を読み (findById)、運営者なら申請者本人でなくても読める (current、isAdmin)
    Svc-->>Ctrl: 提出書類 (ファイル名、種類、データ)
    Ctrl-->>Row: 200 提出書類 (Content-Disposition は attachment)
    Row-->>User: ブラウザーが提出書類のファイルを端末に保存する

    User->>Row: 「承認」をクリック、または<br/>「却下理由」を入力して「却下」をクリック
    Row->>Hook: 審査の結果を送り、成功の文を渡す (decide → run)<br/>承認なら「承認しました。申請者に審査結果を通知しました。」、<br/>却下なら「却下しました。申請者に却下理由を通知しました。」
    Hook->>Http: 審査の結果を送る通信を始める<br/>(write → request、本文は { approved, reason })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/operator/applications/{申請 ID}<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 審査の結果を保存するよう頼む (decide)。全体が 1 つのトランザクション<br/>運営者かを確かめる (requireAdmin)
    Svc->>AppRepo: 申請をロックして読む (lock、SELECT ... FOR UPDATE organization_applications)
    AppRepo-->>Svc: 申請 (なければなし)
    break 7a 申請が審査中ではない (他の運営者が処理した、申請者が取り下げたなど)
        Svc--xErrs: 409 APPLICATION_CHANGED の例外を投げる (ApiException)
        Note over Errs,Page: 結果: 409 を返し、状態を変えない。<br/>画面: 7a-1 一覧を取り直して「この申請は審査済みです。」(7a-2 基本フロー 2 へ戻る)
    end
    Svc->>MemRepo: 申請者の会員をロックして読む (lockMember、SELECT ... FOR UPDATE members)
    MemRepo-->>Svc: 申請者
    alt 承認
        Svc->>Svc: 申請者を出店者 (オーナー) のアカウントに切り替える (becomeOwner)
        Svc->>OrgRepo: 申請の会社名で組織を作る (OrganizationEntity、saveAndFlush)<br/>先に切り替えを送る (flush、UPDATE members)。INSERT organizations
        OrgRepo-->>Svc: 組織
        Svc->>Svc: 申請を承認にして組織を結びつけ、却下理由を空にする (approve)
    else 却下
        Svc->>Svc: 申請を却下にして、前後の空白を除いた却下理由を入れる (reject)
    end
    Svc->>Notices: 申請者にサイト内通知を送るよう頼む (send)。notifications に保存する<br/>題名は「出店申請が承認されました」か「出店申請が却下されました」、本文は「会社名 / 却下理由欄の文字」
    Svc->>Db: 書き換えた申請を保存してコミットする<br/>(save は呼ばない。UPDATE organization_applications ほか)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 審査した申請
    Ctrl-->>Http: 200 申請
    Http-->>Hook: 審査した申請
    Hook->>Ctrl: 一覧を取り直す (reload)<br/>GET /api/operator/applications。流れは 4〜8 と同じ
    Ctrl-->>Hook: 最新の申請の一覧
    Hook-->>Row: 成功を返す (run が true、成功の文を設定)
    Page-->>User: 「承認しました。申請者に審査結果を通知しました。」または<br/>「却下しました。申請者に却下理由を通知しました。」と最新の一覧<br/>(審査した申請は「審査中」の一覧から消える)
```

![EC-A03 シーケンス図](<images/EC-A03_出店申請を審査する-1.png>)
