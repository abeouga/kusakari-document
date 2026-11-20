# EC-B21 アカウントを退会する

- ユースケース記述: [EC-B21_アカウントを退会する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B21_アカウントを退会する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

退会できるかどうかは、「アカウントを削除する」を押したときに EC API の `MemberService.withdraw()` が 1 つのトランザクションの中で決めます。店舗・組織・会員の行を順にロックしてから、未完了の注文と出品中の商品を確かめ、当たれば 409 で断ります。退会しても会員の行は消さず、`members.enabled` を偽にして `withdrawn_at` を入れます。Amazon Cognito のユーザーも消しません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 「退会」画面
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Api as EC API
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 「退会」画面を開く
    User->>Page: サイドバーの「退会」をクリック（EC-C01）
    Page-->>User: 「退会の前にご確認ください」と注意事項、同意のチェックボックス、<br/>「戻る」、押せない「アカウントを削除する」
    Page->>Api: GET /api/auth/me（この画面では結果を使わない）
    Api->>Db: 会員を読む
    Db-->>Api: 会員の行
    Api-->>Page: 200 ログイン状態
    Note over User,Db: 未ログインで URL を開いたときは、その場にログインの入力欄を出す（共通代替フロー *b）

    Note over User,Db: 基本フロー 3〜4 同意する（通信しない）
    alt 3a 退会をやめる
        User->>Page: 「戻る」をクリック、または別の画面へ移る
        Page-->>User: 前の画面（直接開いたときは「メイン」画面）<br/>3a-3 ユースケースを終了する
    else 同意する
        User->>Page: 同意のチェックボックスにチェックを付ける
        Page-->>User: 「アカウントを削除する」を押せる
        opt 4a チェックを外した
            User->>Page: チェックを外す
            Page-->>User: 「アカウントを削除する」を押せない<br/>基本フロー 3 へ戻る
        end
    end

    Note over User,Db: 基本フロー 5〜6 削除を押し、ログイン状態を確かめる
    User->>Page: 「アカウントを削除する」をクリック
    Page->>Api: GET /api/auth/csrf
    Note over Api: ログイン状態を確かめる。ID トークンの期限切れは<br/>Cognito の更新トークンで更新する（図では省略）
    alt 9a 通信に失敗した、または確認情報を取れない
        Api-->>Page: 応答が無い、または 401・403・503
        Page-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else 確認情報を取れた
        Api-->>Page: 200 headerName と token
    end
    Page->>Api: DELETE /api/account（CSRF のヘッダー付き）
    Note over Page,Api: 記述にない 403（利用停止・除名、確認情報の不一致）は<br/>応答の message をそのまま出す（図では省略）
    alt 6a セッションが切れている
        Api-->>Page: 401 LOGIN_REQUIRED
        Page-->>User: 「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>と「ログインする」（ヘッダーにも同じ案内）
        User->>Page: 「ログインする」をクリック
        Page-->>User: 「ログイン」画面（戻り先は「退会」画面）
        Note over User,Page: 6a-4 ログインする（EC-B01）
        Page-->>User: 同意のチェックを外した「退会」画面<br/>6a-5 基本フロー 3 へ戻る
    else 9a 通信に失敗した
        Api--xPage: 応答が無い、または JSON でない応答
        Page-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else ログインしている
        Api->>Db: 会員を読む（利用停止・除名でないか）
        Db-->>Api: 会員の行
    end

    Note over User,Db: 基本フロー 7〜8 退会できるかを確かめる
    Note over Api,Db: ここから基本フロー 9 のコミットまでが 1 つのトランザクション。<br/>当たった枝で 409 を返して終わり、当たらなければ次へ進む
    opt オーナー（SHOP_OWNER）
        Api->>Db: 組織の店舗の行を ID の順にロック（SELECT … FOR UPDATE）
    end
    Api->>Db: 組織の行をロック（オーナーか担当者のとき）
    Api->>Db: 会員の行をロックして読み直す
    Db-->>Api: 会員の行
    alt 関連情報 運営者アカウント
        Api-->>Page: 409 ADMIN_REQUIRED
        Page-->>User: 「管理者はこの画面から退会できません。」
    end
    alt 記述にない ロックを待つ間にオーナーになった
        Api-->>Page: 409 WITHDRAWAL_ACCOUNT_CHANGED
        Page-->>User: 「退会の手続きの間にアカウントの種類が変わりました。<br/>画面を読み込み直してから、もう一度お試しください。」
    end
    Api->>Db: 自分が買った未完了の注文を読む
    Db-->>Api: 注文番号と状態
    alt 7a 未完了の注文がある
        Api-->>Page: 409 WITHDRAWAL_OPEN_ORDERS と orders
        Page-->>User: 「受け渡しが完了していない注文があるため退会できません。」<br/>注文番号と状態、「注文履歴を確認する」
    end
    opt オーナーで、組織に店舗がある
        Api->>Db: 組織の店舗の出品中の商品を数える
        Db-->>Api: 件数
        alt 8a 出品中の商品がある
            Api-->>Page: 409 WITHDRAWAL_LISTED_PRODUCTS
            Page-->>User: 「出品中の商品があるため退会できません。…」<br/>「商品一覧を確認する」
        end
        Api->>Db: 組織の店舗が受けた未完了の注文を数える
        Db-->>Api: 件数
        alt 8b 受けた未完了の注文、または未処理のキャンセル申請がある
            Api-->>Page: 409 WITHDRAWAL_STORE_ORDERS
            Page-->>User: 「引き渡しが完了していない注文、または処理していない<br/>キャンセル申請があるため退会できません。」<br/>「注文一覧・キャンセル申請を確認する」
        end
    end

    Note over User,Db: 基本フロー 9〜10 退会状態にし、「メイン」画面へ移る
    Api->>Api: 会員を退会状態にする（enabled=false、withdrawn_at）
    opt 組織に属する（オーナーか担当者）
        Api->>Api: 承認待ちのオーナーの譲渡を確かめる
        opt 記述にない 承認待ちのオーナーの譲渡の当事者
            Api->>Api: 譲渡の申し出を無効にし、履歴と通知を作る
        end
    end
    Api->>Db: コミット（UPDATE members ほか）
    alt 9a DB の失敗など 5xx
        Db--xApi: 失敗
        Api-->>Page: 503 など
        Page-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else 退会できた
        Db-->>Api: 完了
        Api->>Api: セッションを無効にする（ログアウト状態）
        Api-->>Page: 200 withdrawn=true
        Page->>Page: /?notice=withdrawn を読み込み直す
        Note right of Page: 読み込み直しで、ほかの取得（商品、ログイン状態など）も走る（図では省略）
        Page-->>User: 「メイン」画面と「退会が完了しました。<br/>ご利用ありがとうございました。」
    end
```

## 詳細図

### 詳細図 1 基本フロー 1〜4 画面を開いて同意する

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Acct as AccountPage.jsx
        participant Form as WithdrawalForm<br/>AccountSecurity.jsx
        participant Nav as navigation.js
        participant Hook as useResource.js
        participant Http as api.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtl as AuthController
        participant AuthSvc as AuthService
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 「退会」画面を開く
    User->>Work: サイドバーの「退会」をクリック（EC-C01）
    Note right of Work: WorkspaceSidebar の PageLink が navigate() し、<br/>App.jsx の usePath() が新しい path を渡す<br/>（Common.jsx・App.jsx は図では省略）
    Work->>Work: session.authenticated を確かめ、<br/>accountActions から tab を決める
    Note right of Work: 未ログインで URL を開いたときは、その場に<br/>AuthPanel のログインの入力欄を出す（*b）
    Work->>Acct: AccountPage（key は path、tab は「退会」）
    Acct->>Hook: useResource('/auth/me')
    Acct->>Form: WithdrawalForm を表示
    Form-->>User: 「退会の前にご確認ください」と注意事項、<br/>「注意事項を確認し、退会することに同意します」、<br/>「戻る」、押せない「アカウントを削除する」
    Note right of Form: agreed は false から始まる。削除ボタンは<br/>agreed が偽か busy の間は押せない
    Note right of Hook: 描画の後、useEffect が reload() を自動で実行する。<br/>このタブでは結果を使わない
    Hook->>Http: request('/auth/me')
    Http->>AuthJs: send() が authFetch() を呼ぶ<br/>GET なので CSRF の確認情報は取らない
    AuthJs->>AuthCtl: GET /api/auth/me
    AuthCtl->>AuthSvc: me() が session()
    AuthSvc->>Db: current() などが SELECT members ほか
    Db-->>AuthSvc: 行
    AuthSvc-->>AuthCtl: SessionView
    AuthCtl-->>AuthJs: 200 ログイン状態
    AuthJs-->>Http: Response
    Http-->>Hook: data（画面では使わない）

    Note over User,Db: 基本フロー 3〜4 同意する（通信しない）
    alt 3a 退会をやめる
        User->>Form: 「戻る」をクリック
        Form->>Nav: goBack()
        Note right of Nav: Kusakari の中から来たときは window.history.back()、<br/>直接開いたときは navigate('/')
        Nav-->>User: 前の画面、または「メイン」画面
        Note right of User: サイドバーなどで別の画面へ移っても同じ。<br/>退会の通信はしない。3a-3 ユースケースを終了する
    else 同意する
        User->>Form: 同意のチェックボックスにチェックを付ける
        Form->>Form: onChange が setAgreed(true)
        Form-->>User: 「アカウントを削除する」を押せる
        opt 4a チェックを外した
            User->>Form: チェックを外す
            Form->>Form: setAgreed(false)
            Form-->>User: 「アカウントを削除する」を押せない。基本フロー 3 へ戻る
        end
    end
```

### 詳細図 2 基本フロー 5〜6 削除を押し、ログイン状態を確かめる

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as WithdrawalForm<br/>AccountSecurity.jsx
        participant Hook as useResource.js
        participant Http as api.js
        participant AuthJs as auth.js
        participant Notice as SessionNotice.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as SessionValidity<br/>Filter
        participant Sec as AuthConfiguration<br/>Spring Security
        participant AuthCtl as AuthController
        participant Ctrl as MemberController
        participant AuthSvc as AuthService
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 5〜6 削除を押し、ログイン状態を確かめる
    User->>Form: 「アカウントを削除する」をクリック
    Form->>Form: withdraw()<br/>setBusy(true) と setRefusal(null)
    Form->>Hook: write('/account', 'DELETE')
    Hook->>Http: request('/account', 'DELETE')
    Http->>AuthJs: send() が authFetch(url, init) を呼ぶ
    AuthJs->>Filter: GET /api/auth/csrf
    Note right of Filter: ログイン情報があれば、ID トークンの期限切れを<br/>CognitoPasswordLogin.refresh() で更新し（図では省略）、<br/>AuthService.current() で会員を読む
    alt 9a 通信に失敗した、または確認情報を取れない
        Filter-->>AuthJs: 401・403・503（更新できない、利用停止・除名など）<br/>401・403 ではセッションも無効にする
        Note right of AuthJs: 応答が届かないときは fetch が reject する
        AuthJs--xHttp: !response.ok なので throw Error('操作の確認情報を…')
        Http--xForm: send() の catch が throw ApiError(networkErrorMessage, 0)
        Form->>Form: status が 0 なので setRefusal(失敗の文言)、setBusy(false)
        Form-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else 確認情報を取れた
        Filter->>AuthSvc: current()（ログイン情報があるとき）
        AuthSvc->>Db: SELECT members ほか
        Db-->>AuthSvc: 会員の行
        AuthSvc-->>Filter: AuthMember
        Filter->>AuthCtl: chain.doFilter()
        AuthCtl-->>AuthJs: csrf() が 200 headerName と token
    end
    AuthJs->>Filter: DELETE /api/account（CSRF のヘッダー付き）
    Note right of Filter: 記述にない 403（利用停止・除名、確認情報の不一致）は<br/>応答の message をそのまま出す（図では省略）
    alt 6a セッションが切れている（ログイン情報が無い）
        Filter->>Sec: 確かめを飛ばして chain.doFilter()
        Sec-->>AuthJs: 認可で拒まれ、authenticationEntryPoint が<br/>401 LOGIN_REQUIRED を書く
        AuthJs-->>Http: Response
        Http->>Notice: readResponse() が dispatchEvent(sessionExpiredEvent)
        Notice-->>User: ヘッダーに「ログインの有効期限が切れました。…」と<br/>「ログインする」「閉じる」
        Http--xForm: throw ApiError(sessionExpiredMessage, 401)
        Form->>Form: setRefusal(login は true)、setBusy(false)
        Form-->>User: 「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>と「ログインする」
        User->>Form: 「ログインする」をクリック
        Form->>AuthJs: login()
        AuthJs-->>User: navigate() で「ログイン」画面<br/>returnTo は「退会」画面の URL
        Note over User,AuthJs: 6a-3〜6a-4 ログインする（EC-B01）。成功すると AuthPanel の<br/>complete() が window.location.replace(returnTo) で読み込み直す
        Form-->>User: 同意のチェックを外した「退会」画面（agreed は false から）<br/>6a-5 基本フロー 3 へ戻る
    else 9a 通信に失敗した
        Filter--xAuthJs: 応答が届かない、または JSON でない応答
        AuthJs--xHttp: fetch の reject（JSON でない応答は Response のまま）
        Http--xForm: send() の catch か readResponse() が<br/>throw ApiError(networkErrorMessage, 0)
        Form-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else ログインしている
        Filter->>AuthSvc: current()
        AuthSvc->>Db: SELECT members ほか
        Db-->>AuthSvc: 会員の行
        AuthSvc-->>Filter: AuthMember
        Filter->>Ctrl: chain.doFilter() で withdraw(request) へ（詳細図 3）
    end
```

### 詳細図 3 基本フロー 6〜8 退会できるかを確かめる

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as WithdrawalForm<br/>AccountSecurity.jsx
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as MemberController
        participant Errs as ApiErrors
        participant Svc as MemberService
        participant AuthSvc as AuthService
        participant StoreRepo as StoreRepository
        participant Pending as PendingOwner<br/>Succession
        participant MemberRepo as AuthMember<br/>Repository
        participant Guard as WithdrawalGuard
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 6〜8 退会できるかを確かめる
    Ctrl->>Svc: withdraw()
    Note over Svc,Db: MemberService はクラスに @Transactional がある。<br/>withdraw() 全体が 1 つのトランザクションで、例外のときは巻き戻す
    Svc->>AuthSvc: current()
    AuthSvc->>Db: SELECT members（issuer、subject）
    Db-->>AuthSvc: 会員の行
    AuthSvc-->>Svc: AuthMember（ロックせずに読んだ種別）
    opt オーナー（SHOP_OWNER）として読めた
        Svc->>AuthSvc: storeIdsOf(current)
        AuthSvc->>Db: SELECT organizations、stores（ID の順）
        Db-->>AuthSvc: 行
        AuthSvc-->>Svc: 組織の店舗 ID のリスト
        loop 店舗ごと（ID の順）
            Svc->>StoreRepo: lock(id)
            StoreRepo->>Db: SELECT … FOR UPDATE（stores）
            Db-->>StoreRepo: 行
            StoreRepo-->>Svc: StoreEntity
        end
    end
    Svc->>Pending: lockOrganizationOf(id)
    Pending->>Db: SELECT organizations か organization_members で組織を探し、<br/>SELECT … FOR UPDATE（organizations）
    Db-->>Pending: 行 または 空
    Pending-->>Svc: Optional の OrganizationEntity（購入者・運営は空）
    Note right of Pending: OrganizationRepository・OrganizationMemberRepository と<br/>entityManager.refresh() は図ではまとめる
    Svc->>Svc: lockMember(id)
    Svc->>MemberRepo: findById(id)
    MemberRepo-->>Svc: AuthMember（current() で読み込み済みの行）
    Svc->>Db: entityManager.refresh(m, PESSIMISTIC_WRITE)<br/>SELECT … FOR UPDATE（members）
    Db-->>Svc: 今の値の会員の行
    Note over Svc,Db: 当たった枝で 409 を返して終わり、当たらなければ次へ進む。<br/>ロック待ちの失敗などの 5xx は、画面では詳細図 4 の 9a と同じ表示
    alt 関連情報 運営者アカウント
        Svc--xErrs: throw ApiException(409, ADMIN_REQUIRED)
        Errs-->>Http: business() が 409 と code、message
        Http--xForm: readResponse() が throw ApiError(409)
        Form->>Form: setRefusal(message、code、orders)、setBusy(false)
        Form-->>User: 「管理者はこの画面から退会できません。」
    end
    alt 記述にない ロックを待つ間に担当者からオーナーになった
        Svc--xErrs: throw ApiException(409, WITHDRAWAL_ACCOUNT_CHANGED)
        Errs-->>Http: business() が 409 と code、message
        Note over Http,Form: ブラウザーでの戻りは運営者アカウントの枝と同じ
        Form-->>User: 「退会の手続きの間にアカウントの種類が変わりました。…」
    end
    Svc->>Guard: openPurchases(id)
    Guard->>Db: SELECT orders（buyer_member_id が自分、status が<br/>ACCEPTED・READY か cancellation_status が PENDING）
    Db-->>Guard: 行
    Guard-->>Svc: BlockingOrder（id、status）のリスト
    alt 7a 未完了の注文がある
        Svc--xCtrl: throw WithdrawalBlockedException<br/>(409, WITHDRAWAL_OPEN_ORDERS, orders)
        Ctrl-->>Http: withdrawalBlocked() が 409 と code、message、orders
        Http--xForm: readResponse() が throw ApiError(409)（body に orders）
        Form->>Form: setRefusal(message、code、body.orders)、setBusy(false)
        Form-->>User: 「受け渡しが完了していない注文があるため退会できません。」<br/>注文番号と状態（注文受付・受取準備完了）、「注文履歴を確認する」
    end
    opt オーナーで、組織に店舗がある
        Svc->>Guard: hasListedProducts(storeIds)
        Guard->>Db: SELECT count（inventory と products、<br/>publication_status が PUBLISHED）
        Db-->>Guard: 件数
        Guard-->>Svc: true か false
        alt 8a 出品中の商品がある
            Svc--xCtrl: throw WithdrawalBlockedException<br/>(409, WITHDRAWAL_LISTED_PRODUCTS)
            Ctrl-->>Http: withdrawalBlocked() が 409 と code、message
            Note over Http,Form: ブラウザーでの戻りは 7a と同じ。出すリンクは code で決まる
            Form-->>User: 「出品中の商品があるため退会できません。すべての商品を<br/>販売停止にしてから再度お試しください。」と「商品一覧を確認する」
        end
        Svc->>Guard: hasOpenStoreOrders(storeIds)
        Guard->>Db: SELECT count（orders、store_id が組織の店舗、<br/>status が ACCEPTED・READY か cancellation_status が PENDING）
        Db-->>Guard: 件数
        Guard-->>Svc: true か false
        alt 8b 受けた未完了の注文、または未処理のキャンセル申請がある
            Svc--xCtrl: throw WithdrawalBlockedException<br/>(409, WITHDRAWAL_STORE_ORDERS)
            Ctrl-->>Http: withdrawalBlocked() が 409 と code、message
            Note over Http,Form: ブラウザーでの戻りは 7a と同じ
            Form-->>User: 「引き渡しが完了していない注文、または処理していない<br/>キャンセル申請があるため退会できません。」と<br/>「注文一覧・キャンセル申請を確認する」
        end
    end
    Note over Svc: 基本フロー 9 へ（詳細図 4）
```

### 詳細図 4 基本フロー 9〜10 退会状態にし、「メイン」画面へ移る

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Form as WithdrawalForm<br/>AccountSecurity.jsx
        participant Hook as useResource.js
        participant Http as api.js
        participant App as App.jsx
        participant Notice as SessionNotice.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as MemberController
        participant Errs as ApiErrors
        participant Svc as MemberService
        participant Pending as PendingOwner<br/>Succession
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 9〜10 退会状態にし、「メイン」画面へ移る
    Svc->>Svc: m.withdraw()<br/>enabled=false、withdrawnAt=今
    opt 組織に属する（オーナーか担当者）
        Svc->>Pending: invalidateFor(locked, id, SUCCESSOR_WITHDRAWN)
        Svc->>Pending: invalidateForOwner(locked, id, OWNER_WITHDRAWN)
        opt 記述にない 承認待ちのオーナーの譲渡の当事者
            Pending->>Pending: invalidate() が clearOwnerSuccession()
            Pending->>Db: events.save() が INSERT organization_member_events
            Pending->>Db: OwnerSuccessionNotices.invalidated() が<br/>INSERT notifications（オーナーと譲渡先）
        end
        Pending-->>Svc: 戻る
    end
    Note over Svc,Db: save は呼ばない。withdraw() から戻るときのコミットで、<br/>変更した会員と組織の行を UPDATE で保存する
    Svc->>Db: コミット（UPDATE members ほか）
    alt 9a DB の失敗など 5xx
        Db--xSvc: 失敗
        Svc--xErrs: DataAccessException など
        Errs-->>Http: database() が 503 DATABASE_UNAVAILABLE
        Http--xForm: readResponse() が throw ApiError(503)
        Form->>Form: status が 500 以上なので setRefusal(失敗の文言)、setBusy(false)
        Form-->>User: 「退会処理に失敗しました。時間をおいて再度お試しください。」<br/>基本フロー 5 へ戻る
    else 退会できた
        Db-->>Svc: 完了
        Svc-->>Ctrl: 戻る（void）
        Ctrl->>Ctrl: request.getSession().invalidate()<br/>SecurityContextHolder.clearContext()
        Ctrl-->>Http: 200 withdrawn=true
        Http-->>Hook: data
        Hook-->>Form: data
        Form->>App: window.location.assign('/?notice=withdrawn')
        Note over Notice: モジュールを読み込んだときに flashNotice を 1 回だけ作り、<br/>URL の notice を history.replaceState で外す
        App->>Notice: flashNotice を読む（import）
        Notice-->>App: 「退会が完了しました。ご利用ありがとうございました。」
        Note right of App: useState(flashNotice) で flash に入れる。読み込み直しの<br/>useShop() と useAuth() の通信は図では省略
        App-->>User: 「メイン」画面と「退会が完了しました。<br/>ご利用ありがとうございました。」「閉じる」
    end
```

## ユースケース記述との差

- 7・8b の「未完了の注文」: `WithdrawalGuard` は、`status` が `ACCEPTED`（注文受付）・`READY`（受取準備完了）の注文と、キャンセル申請が未処理（`cancellation_status` が `PENDING`）の注文だけを数えます。カード払いの支払い待ち（`PENDING_PAYMENT`）の注文は「引き渡し完了」「キャンセル済み」のどちらでもありませんが、退会を止めません。店舗の閉鎖と組織の停止で使う `OpenOrders.BLOCKING` は `PENDING_PAYMENT` も止めるので、判定がそろっていません。
- 運営者アカウント: 関連情報に「この画面から退会できない」とありますが、代替フローの番号がありません。コードでは、運営者にもサイドバーに「退会」が出て、押すと 409 `ADMIN_REQUIRED`「管理者はこの画面から退会できません。」と出ます。
- 記述にない枝: ロックを待つ間に、オーナーの譲渡の承認で担当者からオーナーになったときは、409 `WITHDRAWAL_ACCOUNT_CHANGED`「退会の手続きの間にアカウントの種類が変わりました。画面を読み込み直してから、もう一度お試しください。」で断ります。
- 記述にない処理: 退会する人が、承認待ちのオーナーの譲渡の譲渡先か、申し出たオーナー本人のときは、同じトランザクションで申し出を無効にします。`organization_member_events` に記録し、オーナーと譲渡先に通知（`notifications`）を作ります。
- 6a: 案内が出るのは、主にサーバーのセッションそのものが無いとき（EC の再起動など）です。このとき `GET /api/auth/csrf` は新しいセッションで通り、`DELETE` が 401 になります。ID トークンを更新できないとき（更新トークンの失効など）は、先に `GET /api/auth/csrf` が `SessionValidityFilter` で 401 になり、`auth.js` の `authFetch()` の例外を `api.js` の `send()` が status 0 に言い換えるので、画面は 9a の「退会処理に失敗しました。時間をおいて再度お試しください。」を出します。このときセッションも無効になるので、もう一度押すと 6a の案内が出ます。利用停止・除名で `GET /api/auth/csrf` が 403 になったときも、同じく 9a の文言です。
- 6a-1: 「ログインの有効期限が切れました。もう一度ログインしてください。」と「ログインする」は、`WithdrawalRefusal` とヘッダーの `SessionNotice` の 2 か所に出ます。
- 関連情報「URLに直接アクセスした場合は、ログイン画面へ誘導する」: `/account/login` へは移らず、`Workspace` がその場に `AuthPanel` のログインの入力欄を出します。ログインすると同じ URL を読み込み直します。
- 3a-2: 「元の画面を表示する」は、Kusakari の中から来たときだけです。URL を直接開いたときは、`goBack()` が `navigate('/')` で「メイン」画面を出します。
- 事後条件「利用できなくなる」: Cognito のユーザーは消さないので、Cognito での認証は通ります。そのあと `AuthService.current()` が `enabled` の偽の会員を 403 `ACCOUNT_DISABLED`「このアカウントは利用できません。」で止めます。

## 確かめられなかったこと

- コミットでの失敗が `DataAccessException` にならないとき（`TransactionSystemException` など）の応答の形は、動かして確かめていません。`ApiErrors.database()` を通らない可能性があります。画面は 5xx ならどれも 9a の文言を出します。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `Workspace`（未ログインのときの `AuthPanel`、`accountSettings`、`accountActions` で `AccountPage` を選ぶところ）
- [frontend/src/workspace/AccountPage.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountPage.jsx): `accountActions`、`AccountPage`、`useResource('/auth/me')`
- [frontend/src/workspace/AccountSecurity.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/AccountSecurity.jsx): `WithdrawalForm`、`withdraw()`、`WithdrawalRefusal`、`openOrderLabels`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `goBack()`、`navigate()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`、`networkErrorMessage`、`sessionExpiredMessage`、`sessionExpiredEvent`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`、`login()`、`loginPath()`、`wasSignedIn()`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SessionNotice.jsx): `SessionNotice`、`flashNotice`、`flashMessages`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/AuthPanel.jsx): `complete()`、`returnTo`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `flash`（`useState(flashNotice)`）の表示
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `withdraw()`、`withdrawalBlocked()`、`WithdrawalBlockedView`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `withdraw()`、`lockMember()`
- [backend/src/main/java/jp/kusakari/ec/member/service/WithdrawalGuard.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/service/WithdrawalGuard.java): `OPEN_STATUSES`、`openPurchases()`、`hasListedProducts()`、`hasOpenStoreOrders()`
- [backend/src/main/java/jp/kusakari/ec/member/service/WithdrawalBlockedException.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/service/WithdrawalBlockedException.java): `BlockingOrder`、`orders()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`、`session()`、`storeIdsOf()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java): `withdraw()`、`isAdmin()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findById()`（`JpaRepository`）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `lock()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `lockOrganizationOf()`、`lock()`、`invalidateFor()`、`invalidateForOwner()`、`invalidate()`
- [backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java): `invalidated()`、`send()`
- [backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java): `BLOCKING`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal()`、`renewIdToken()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `cognitoSecurity()`（`addFilterBefore`、`authenticationEntryPoint`、`accessDeniedHandler`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`、`csrf()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`database()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `ck_orders_status`、`ck_orders_cancellation_status`、`ck_inventory_status`
- [docs/decisions/2026-10-28-buyer-account-use-cases.md](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/docs/decisions/2026-10-28-buyer-account-use-cases.md): EC-B21 の決定（判定は削除ボタンを押したとき、データは残す）
