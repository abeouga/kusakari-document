# EC-A02 アカウントの利用状況を変更する

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 会員管理画面<br/>MembersPage<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 会員管理API<br/>MemberController<br/>(MemberController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 会員の処理<br/>MemberService<br/>(MemberService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Pend as オーナーの譲渡の申し出<br/>PendingOwnerSuccession<br/>(PendingOwnerSuccession.java)
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、18、一覧の取り直しの 35 に適用<br/>*a 通信に失敗した場合: 4、16、18、一覧の取り直しの 35 に適用

    User->>Work: 運営者メニューの「会員管理」をクリック
    Work->>Page: アカウント管理者画面を表示
    Page->>Hook: 会員の一覧を取りに行くよう頼む (useResource)
    Hook->>Ctrl: 画面の表示時に自動でアカウント一覧の取得を開始<br/>GET /api/operator/members (reload → request)
    Ctrl-->>Hook: 200 会員の配列<br/>流れは EC-A01 の図と同じ
    Hook-->>Page: 会員の一覧
    Page-->>User: 会員の一覧と利用状態 (「利用中」「利用停止」「退会済み」)、<br/>利用中なら「利用を停止」、そうでなければ「利用を再開」

    User->>Page: 対象の会員の「利用を停止」<br/>または「利用を再開」をクリック
    Page->>Dlg: 確認ダイアログを表示
    Dlg-->>User: 「利用状況変更の確認」、対象：氏名（メールアドレス）、変更の説明、<br/>「利用停止を確定」か「利用再開を確定」、「取消」

    User->>Dlg: 「利用停止を確定」または「利用再開を確定」をクリック
    Dlg->>Page: 確定したことを伝える
    Page->>Hook: 変更を実行し、成功の文を渡す (run)<br>停止なら「利用を停止しました。」、再開なら「利用を再開しました。」を表示
    Hook->>Http: アカウントの有効状態を切り替える
    Http->>AuthJs: 書き込みの前に CSRF トークンを取得
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/operator/members/{id}/enabled<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 会員の利用状態を変えるよう頼む (enable)<br/>enable 全体が 1 つのトランザクション
    Svc->>Auth: ログイン中の人が運営者かを確かめる (requireAdmin)
    Auth-->>Svc: 認証成功
    opt 停止するとき (記述なし)
        Svc->>Pend: 対象の会員が属する組織を<br>ロックする処理を呼ぶ (lockOrganizationOf)
        Note over Svc,Db: 結果: オーナーか担当者として属する組織の行を SELECT ... FOR UPDATE でロックする (組織 → 会員の順)。<br/>購入者などは組織がないのでロックしない。
    end
    Svc->>Repo: 対象の会員を読む (findById、SELECT members)
    Repo-->>Svc: 会員 (なければなし)
    Svc->>Db: 会員の行をロックして読み直す<br/>(lockMember、SELECT ... FOR UPDATE members)
    Db-->>Svc: ロックした会員の行
    break 6a 対象が運営者アカウントか退会済み (isAdmin、withdrawnAt)
        Svc--xErrs: 409 MEMBER_FIXED の例外を投げる (ApiException)
        Note over Errs,Page: 結果: 409 を返し、利用状態は変えない。<br/>画面: 6a-1 一覧を取り直し、ダイアログを閉じて「管理者または退会済み会員の状態は変更できません。」
    end
    Svc->>Svc: 会員の利用状態を書き換える (changeEnabled)
    opt 停止で、組織をロックした (記述なし)
        Svc->>Pend: 停止する会員が譲渡の申し出の当事者なら無効にするよう頼む<br/>(invalidateFor は譲渡先、invalidateForOwner は申し出たオーナー本人かを見る)
        Note over Svc,Db: 結果: 当事者なら承認待ちを空にし、履歴と、オーナーと譲渡先への通知 2 件を保存する<br/>(共通の invalidate と OwnerSuccessionNotices)。当事者でなければ何もしない。
    end
    Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE members ほか)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 終わった
    Ctrl-->>Http: 200 変更後の値 ({ enabled })
    Http-->>Hook: 変更後の値
    Hook->>Ctrl: 一覧を取り直す (reload)<br/>GET /api/operator/members。流れは 4〜5 と同じ
    Ctrl-->>Hook: 最新の会員の一覧
    Hook-->>Page: 成功を返す (run が true、成功の文を設定)
    Page-->>User: ダイアログを閉じ (setTarget(null))、「利用を停止しました。」<br/>または「利用を再開しました。」と更新後の利用状態
```

![EC-A02 シーケンス図](<images/EC-A02_アカウントの利用状況を変更する-1.png>)
