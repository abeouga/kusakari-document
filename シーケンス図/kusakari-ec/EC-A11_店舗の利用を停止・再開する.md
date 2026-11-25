# EC-A11 店舗の利用を停止・再開する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 店舗管理画面<br/>OperatorStoresPage<br/>(OperatorStores.jsx)
        participant Mod as 警告・停止の操作<br/>ModerationControls<br/>(Moderation.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Ev as 警告・停止の履歴<br/>ModerationEvents<br/>(Moderation.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant SCtrl as 店舗API<br/>StoreController<br/>(StoreController.java)
        participant Ctrl as 店舗の警告・停止API<br/>StoreModerationController<br/>(StoreModerationController.java)
        participant Svc as 店舗の警告・停止の処理<br/>StoreModerationService<br/>(StoreModerationService.java)
        participant Hist as 履歴の読み方<br/>ModerationHistory<br/>(ModerationHistory.java)
        participant Notices as 出店者への通知<br/>NotificationService<br/>(NotificationService.java)
        participant Repo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、24、45、一覧の取り直しの 38 に適用<br/>*a 通信に失敗した場合: 5、22、24、45、一覧の取り直しの 38 に適用

    User->>Work: 運営者メニューの「店舗管理」をクリック
    Work->>Page: URL を /operator/sellers に変え、<br/>OperatorStoresPage を表示
    Page->>Hook: 店舗の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>SCtrl: GET /api/operator/stores
    SCtrl-->>Http: 200 店舗の配列<br/>(作り方は EC-A05 の図と同じ流れ)
    Http-->>Hook: 店舗の一覧
    Hook-->>Page: 店舗の一覧
    Page->>Mod: 閉鎖済みでない店舗ごとに、警告と停止の操作を表示<br/>(ModerationControls。停止中かは enabled の逆)
    Mod-->>User: 「警告する」(警告中なら「もう一度警告する」と「警告を解除」、<br/>「警告中」と「運営からの警告：理由」)、「警告・停止の履歴」、<br/>停止中なら「利用を再開」、停止中でなければデンジャーエリアの「利用を停止」

    alt 基本フロー 利用を停止する
        User->>Mod: 対象店舗のデンジャーエリアの「利用を停止」をクリック
        Mod->>Dlg: 理由を空にして確認ダイアログを表示<br/>(open('suspend') → ConfirmDialog)
        Dlg-->>User: 「利用停止の確認」、「対象：店舗名」、「この店舗の利用を停止します。<br/>商品は購入者向けの画面に表示されなくなり、出店者は商品・在庫・注文を<br/>操作できなくなります。確定済みの注文はキャンセルされません。」、<br/>「理由（必須・出店者に通知します）」欄、「利用停止を確定」、「取消」
    else 3a 停止せずに警告する
        User->>Mod: 3a-1「警告する」(警告中なら「もう一度警告する」) をクリック
        Note over User,Dlg: 結果: 理由を空にして確認ダイアログを表示 (open('warn'))。<br/>画面: 3a-2「警告の確認」、「出店者に理由を通知します。公開・利用の状態は変わりません。」、「理由（必須・出店者に通知します）」欄、「警告する」、「取消」
    else 3b 警告を解除する
        User->>Mod: 3b-1「警告を解除」(警告中だけに出る) をクリック
        Note over User,Dlg: 結果: 理由を空にして確認ダイアログを表示 (open('clear'))。<br/>画面: 3b-2「警告の解除の確認」、「警告を解除し、出店者に通知します。」、「理由（任意・出店者に通知します）」欄、「警告を解除する」、「取消」
    else 3c 利用を再開する
        User->>Mod: 3c-1「利用を再開」(停止中だけに出る) をクリック
        Note over User,Dlg: 結果: 理由を空にして確認ダイアログを表示 (open('resume'))。<br/>画面: 3c-2「利用再開の確認」、「利用停止を解除し、再び利用できるようにします。」、「理由（任意・出店者に通知します）」欄、「利用再開を確定」、「取消」
    end
    User->>Dlg: 理由を入力し (onChange → setReason。500 文字まで。3b・3c は任意)、<br/>「利用停止を確定」をクリック<br/>(3a-3「警告する」、3b-3「警告を解除する」、3c-3「利用再開を確定」)
    Dlg->>Mod: 確定したことを伝える (onConfirm → confirm)
    Mod->>Hook: 操作を実行し、成功の文を渡す (run)<br/>「停止しました。出店者に通知しました。」<br/>(3a「警告しました。…」、3b「警告を解除しました。…」、3c「再開しました。…」)
    Hook->>Http: 操作の通信を始める (write → request)<br/>本文は停止 { enabled: false, reason }、3c { enabled: true, reason }、<br/>3a { warned: true, reason }、3b { warned: false, reason }
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/operator/stores/{店舗 ID}/enabled (停止・3c)<br/>PUT /api/operator/stores/{店舗 ID}/warning (3a・3b)<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 停止・再開は (enabled → enable)、警告・解除は (warning → warn) 頼む<br/>全体が 1 つのトランザクション。運営者かを確かめる (AuthService.requireAdmin)
    Svc->>Repo: 店舗をロックして読む (lock、SELECT ... FOR UPDATE stores)
    Repo-->>Svc: 店舗
    Svc->>Hist: 理由の前後の空白を除くよう頼む (reasonFor)<br/>(必須の理由が空なら 400 REASON_REQUIRED。画面の 5a が先に止める)
    opt 3b 警告の解除
        Svc->>Db: 今の警告を求めるため、店舗の履歴を読む (currentWarning)
        Note over Svc,Db: 結果: 履歴を新しい順に読み (findByStoreIdOrderByIdDesc)、<br/>今の警告を求める (ModerationHistory.activeWarning)。
    end
    alt 記録する (停止は停止していないとき、再開は停止中のとき、<br/>警告はいつも (警告中でも毎回)、警告の解除は警告中のとき)
        Svc->>Db: 停止・再開は店舗の停止の印を変え (changeSuspended)、<br/>履歴に SUSPEND・WARN・CLEAR_WARNING・RESUME のどれかを足す<br/>(record → StoreModerationEventRepository.save、store_moderation_events)
        Svc->>Notices: 店舗の出店者に知らせるよう頼む (toStore)<br/>題名「店舗の利用が停止されました」(3a「店舗に運営から警告がありました」、<br/>3b「店舗への運営の警告が解除されました」、3c「店舗の利用停止が解除されました」)、<br/>本文「店舗名 / 理由」(noticeBody)。組織のオーナーと、店舗でロールのある<br/>担当者のうち、利用中の会員ごとに通知を保存する (notifications)
    else すでにその状態
        Svc->>Svc: 何もしない。履歴も通知も足さない
    end
    Svc->>Db: 変更を送ってから、店舗の履歴を新しい順に読む<br/>(state → flush、findByStoreIdOrderByIdDesc)
    Db-->>Svc: 履歴
    Svc-->>Ctrl: 今の警告を求め (ModerationHistory.activeWarning)、<br/>停止中かと今の警告 (State) を返す。ここでコミット
    Ctrl-->>Http: 200 { suspended, warning }
    Http-->>Hook: 変更後の値 (画面では使わない)
    Hook->>Http: 一覧を取り直す (reload)。流れは 5〜7 と同じ
    Http-->>Hook: 最新の店舗の一覧
    Hook-->>Mod: 成功を返す (run が true、成功の文を設定)
    Mod-->>User: 履歴の欄を作り直す印を進め、ダイアログを閉じ (setVersion、setPending(null))、<br/>「停止しました。出店者に通知しました。」、状態は「運営により停止中」<br/>(stateOf。閉鎖中の店舗は閉鎖中のまま)、デンジャーエリアの代わりに「利用を再開」<br/>(3a-5「警告中」と「運営からの警告：理由」と日時、3b-5「警告中」のバッジが消える、<br/>3c-5 更新後の状態とデンジャーエリアの「利用を停止」)

    alt 3d 履歴を確認する
        User->>Mod: 3d-1 対象店舗の「警告・停止の履歴」を開く
        Mod->>Ev: 開いたことを覚え、履歴を表示する<br/>(details の onToggle → setHistoryOpen(true) → ModerationEvents)
        Ev->>Hook: 履歴を取りに行くよう頼む (useResource)。<br/>取るのは開いたときが初めて (取得中は「読み込み中です。」)
        Hook->>Ctrl: GET /api/operator/stores/{店舗 ID}/moderation-events<br/>(reload → request)
        Ctrl->>Svc: 店舗の履歴を読むよう頼む (events)。全体が読むだけのトランザクション<br/>運営者かを確かめ (AuthService.requireAdmin)、店舗があるかを確かめ<br/>(StoreRepository.existsById)、履歴を新しい順に読む<br/>(StoreModerationEventRepository.findByStoreIdOrderByIdDesc)、<br/>操作した運営者の会員を読んで表示の形にする (ModerationHistory.views、AuthMemberRepository.findAllById)
        Svc-->>Ctrl: 履歴のリスト (type、reason、actorName は表示名か、<br/>空ならメールアドレス、createdAt)
        Ctrl-->>Hook: 200 履歴の配列
        Hook-->>Ev: 履歴
        Ev-->>User: 3d-2 新しい順に 1 行ずつ「日時 警告／警告の解除／停止／再開<br/>（運営者名）：理由」(理由が空なら「：理由」を出さない。<br/>履歴がなければ「履歴はありません。」)
    end
```

![EC-A11 シーケンス図](<images/EC-A11_店舗の利用を停止・再開する-1.png>)
