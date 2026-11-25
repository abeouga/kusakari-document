# EC-B21 アカウントを退会する

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Flash as 完了のお知らせ<br/>flashNotice<br/>(SessionNotice.jsx)
        participant Work as アカウントの画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Acct as アカウント画面<br/>AccountPage<br/>(AccountPage.jsx)
        participant Form as 退会の画面<br/>WithdrawalForm<br/>(AccountSecurity.jsx)
        participant Hook as 取得と書き込み<br/>useResource・write<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 会員API<br/>MemberController<br/>(MemberController.java)
        participant Svc as 会員の処理<br/>MemberService<br/>(MemberService.java)
        participant StoreRepo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
        participant Pend as オーナーの譲渡の申し出<br/>PendingOwnerSuccession<br/>(PendingOwnerSuccession.java)
        participant Guard as 退会できるかの確認<br/>WithdrawalGuard<br/>(WithdrawalGuard.java)
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合 (6a): 2 (URL を直接開いたときのログインの確認) と 16 に適用<br/>*a 通信に失敗した場合 (9a): 14 と 16 に適用

    User->>Work: アカウント画面のサイドバー「アカウント設定」の<br/>「退会」をクリック (EC-C01)
    Work->>Acct: URL を /account/delete に変え、AccountPage を表示<br/>(PageLink → navigate、tab は「退会」)
    Acct->>Form: 退会の画面を表示 (WithdrawalForm、同意は外れた状態)
    Form-->>User: 「退会の前にご確認ください」と注意事項 4 つ、<br/>「注意事項を確認し、退会することに同意します」、<br/>「戻る」と押せない「アカウントを削除する」
    Acct->>Hook: ログイン状態を取りに行くよう頼む (useResource('/auth/me'))
    Hook->>AuthCtrl: 画面を開いたときに自動で通信を始める (reload → request)<br/>GET /api/auth/me。ログイン状態を作る (session)
    AuthCtrl-->>Hook: 200 ログイン状態 (SessionView。この画面では使わない)

    User->>Form: 3 「注意事項を確認し、退会することに同意します」にチェックを付ける
    Form-->>User: 4 「アカウントを削除する」を押せるようにする (setAgreed(true))
    opt 4a チェックを外した
        User->>Form: 4a チェックを外す
        Note over User,Form: 結果: 4a-1「アカウントを削除する」を押せなくする (setAgreed(false))。<br/>画面: 4a-2 もう一度チェックを付ける (基本フロー 3 へ戻る)。
    end
    User->>Form: 5 「アカウントを削除する」をクリック
    Form->>Http: 退会の通信を送る (withdraw → write → request)<br/>ボタンは「退会処理中…」、チェックと「戻る」も押せない
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: DELETE /api/account (CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 退会するよう頼む (withdraw)。全体が 1 つのトランザクション<br/>6 ログイン中の会員を読む (AuthService の current、SELECT members)。<br/>種類はロックせずに読んだもの
    opt オーナー (SHOP_OWNER) のとき
        Svc->>StoreRepo: 組織の店舗を ID の小さい順にロックする (AuthService の storeIdsOf、lock)
        Note over Svc,Db: 結果: 店舗ごとに SELECT ... FOR UPDATE stores。<br/>注文の確定と同じ順にロックし、確かめる間に新しい注文が入らないようにする。
    end
    Svc->>Pend: 会員がオーナーか担当者として属する組織を探し、<br/>あればロックして読み直す (lockOrganizationOf、SELECT ... FOR UPDATE organizations)
    Pend-->>Svc: 組織 (購入者などは組織なし)
    Svc->>Repo: 会員を読み、行をロックして読み直す<br/>(findById、lockMember、SELECT ... FOR UPDATE members)
    Svc->>Guard: 7 自分の未完了の注文を読む (openPurchases)<br/>SELECT orders。status が ACCEPTED か READY、またはキャンセル申請が PENDING。<br/>注文履歴で非表示にした注文も含む
    Guard-->>Svc: 注文番号と状態の一覧 (なければ空)
    Svc->>Guard: 8 オーナーで組織に店舗があるときだけ、出品中の商品があるかを確かめる<br/>(hasListedProducts、SELECT count inventory・products、publicationStatus が PUBLISHED)
    Svc->>Guard: 8 同じく、店舗の未完了の注文か、未処理のキャンセル申請があるかを確かめる<br/>(hasOpenStoreOrders、SELECT count orders。status が ACCEPTED か READY、<br/>またはキャンセル申請が PENDING)
    break 7a・8a・8b 退会できない (未完了の注文、出品中の商品、店舗の未完了の注文かキャンセル申請がある)
        Svc--xCtrl: 409 WITHDRAWAL_OPEN_ORDERS・WITHDRAWAL_LISTED_PRODUCTS・<br/>WITHDRAWAL_STORE_ORDERS のどれかの例外を投げる (WithdrawalBlockedException)
        Note over Ctrl,Form: 結果: 最初に見つかったもので 409 を返し (7a は注文の一覧も)、アカウントを削除しない。<br/>画面: 断りの文と、7a「注文履歴を確認する」、8a「商品一覧を確認する」、8b「注文一覧・キャンセル申請を確認する」。終了
    end
    Svc->>Svc: 9 会員を退会状態にする<br/>(AuthMember の withdraw。enabled を偽、withdrawnAt に今の時刻)
    opt 組織をロックした (記述なし)
        Svc->>Pend: 承認待ちの譲渡の当事者なら、申し出を<br/>無効にするよう頼む (invalidateFor、invalidateForOwner)
        Note over Svc,Db: 結果: 承認待ちの譲渡先か、申し出たオーナー本人なら、承認待ちを空にして履歴を保存し (clearOwnerSuccession、organization_member_events)、<br/>オーナーと譲渡先に「オーナーの譲渡の申し出が無効になりました」の通知を 2 件保存する (OwnerSuccessionNotices の invalidated)。
    end
    Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE members ほか)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 終わった
    Ctrl->>Ctrl: 9 セッションを無効にし、認証情報を消す<br/>(getSession().invalidate、SecurityContextHolder.clearContext)
    Ctrl-->>Http: 200 { withdrawn: true }
    Http-->>Form: 退会した
    Form->>App: 10 「メイン」画面 /?notice=withdrawn を<br/>読み込み直す (window.location.assign)
    App->>Flash: 完了のお知らせを読む (useState(flashNotice))<br/>読み込んだときに URL の notice を読み、URL から外してある
    App-->>User: ログインしていない「メイン」画面と、「退会が完了しました。<br/>ご利用ありがとうございました。」「閉じる」
```

![EC-B21 シーケンス図](<images/EC-B21_アカウントを退会する-1.png>)
