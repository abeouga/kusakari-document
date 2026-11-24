# EC-B17 出店の申請をする

- ユースケース記述: [EC-B17_出店の申請をする](<../../アーカイブ/ユースケース/kusakari-ec/EC-B17_出店の申請をする.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
図は、EC-C01 でマイページを開いた後から始まります。マイページを開いたときに `Workspace` がサイドバー用に `GET /api/account/store-applications` で申請を読み、申請がまだないので、リンクは「出店申請」になっています。再申請（前回の申請が却下か取り下げ済み）のときはリンクが「出店申請状況」のままなので、EC-B18 の「再申請する」から同じ出店申請画面を開きます（図の 2 から同じ流れ）。
入力の手順と確認（基本フロー 3〜9）は画面の中だけで、通信しません。共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、エラーで終わるもの（4a・4b・11a）と記述にない分岐（項目の 400 `INVALID_INPUT`、出店申請用アカウントでない 403、書類の 400 `INVALID_DOCUMENT`）は、分かれる所だけを描き、結果と画面は Note に文で書いています。画面の中だけで終わる 5a・10a と、再申請のときの前の申請の書き換え（opt）も、頼む矢印 1 本と Note にしています。サーバーがエラーを返したときの画面の後処理（`readResponse` が `ApiError` を投げる → `submit` の `catch` で、400 なら手順 1 に戻し、エラーの文を出す）は、どれも同じです。

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 出店申請画面<br/>ApplicationPage<br/>(StoreApplication.jsx)
        participant Wiz as 申請の入力と送信<br/>ApplicationWizard<br/>(ApplicationWizard.jsx)
        participant Hook as 申請の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request・send<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 出店申請の処理<br/>StoreApplicationService<br/>(StoreApplicationService.java)
        participant Repo as 出店申請の読み書き<br/>StoreApplicationRepository<br/>(StoreApplicationRepository.java)
        participant Ntf as 通知の保存<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、24、サイドバーの取り直しの 43 に適用<br/>*a 通信に失敗した場合: 4、22、24、サイドバーの取り直しの 43 に適用

    User->>Work: マイページのサイドバー「出店をご検討の方」の<br/>「出店申請」をクリック
    Work->>Page: URL を /seller/application に変え、<br/>ApplicationPage を表示
    Page->>Hook: 自分の出店申請を取りに行くよう頼む (useResource)
    Hook->>Ctrl: 画面を開いたときに自動で申請の一覧の通信を始める (reload → request)<br/>GET /api/account/store-applications
    Ctrl->>Svc: 自分の申請の一覧を作るよう頼む (list)。読み取り専用のトランザクション<br/>ログイン中の会員を読み (current)、その会員の申請を新しい順に読む<br/>(findByMemberIdOrderByCreatedAtDesc、SELECT organization_applications)
    Svc-->>Ctrl: 今の申請と前回の申請のリスト (view。申請がなければ 0 件)
    Ctrl-->>Hook: 200 申請の配列
    Hook-->>Page: 申請の配列
    Page->>Wiz: 先頭を最新の申請とし、却下か取り下げ済みなら前回の申請として、<br/>入力の手順を表示 (latest、canReapply、ApplicationWizard の previous)
    alt 申請がない (previous は null)
        Wiz-->>User: 手順「事業者情報」「担当者・連絡先」「事業確認書類」「入力内容の確認」、<br/>「ステップ 1 / 4：事業者情報」と「会社・事業者名」「所在地」の入力欄
    else 再申請 (EC-B18 の「再申請する」から開いた。最新の申請が却下か取り下げ済み)
        Wiz-->>User: 同じ手順と入力欄に前回の内容を入れ、「前回の申請内容を入力しています。<br/>事業確認書類はもう一度選択してください。」
    end

    loop 手順ごと (事業者情報 → 担当者・連絡先 → 事業確認書類)
        opt 5a 前の手順に戻る (担当者・連絡先、事業確認書類の手順)
            User->>Wiz: 5a-1「戻る」をクリック
            Note over User,Wiz: 結果: 入力欄は隠すだけなので、入力はそのまま (go(step - 1))。<br/>画面: 5a-2 前の手順の入力欄。
        end
        User->>Wiz: その手順の項目を入力し、「次へ」<br/>(事業確認書類では「確認画面へ」) をクリック
        break 4a 必須項目が空 (next → stepError。文字の項目は前後の空白を除いて調べる)
            Wiz-->>User: 4a-1「未入力の項目があります：(不足項目)」。次の手順へ進まない<br/>(通信しない)。4a-2 入力を直し、同じボタンをクリック (13 へ戻る)
        end
        break 4b 形式が不正 (連絡先メール、電話番号、書類の大きさ)
            Wiz-->>User: 4b-1「連絡先メールの形式が正しくありません。」<br/>「電話番号は数字・＋・括弧・ハイフンで入力してください。」<br/>「事業確認書類は5MB以内のファイルを選択してください。」のどれか。<br/>4b-2 入力を直し、同じボタンをクリック (13 へ戻る)
        end
        alt 事業者情報か担当者・連絡先の手順
            Wiz-->>User: 次の手順の入力欄 (go(step + 1))
        else 事業確認書類の手順
            Wiz-->>User: 入力した値 (前後の空白を除く) と書類のファイル名を覚え (setDraft)、<br/>「入力内容の確認」、「この内容で出店を申請します。…」、<br/>入力した内容 (Summary)、「…を修正」の 3 つのボタンと「申請する」
        end
    end
    opt 10a 入力内容を修正する
        User->>Wiz: 10a-1「事業者情報を修正」「担当者・連絡先を修正」<br/>「事業確認書類を修正」のどれかをクリック
        Note over User,Wiz: 結果: 10a-2 その手順の入力欄に戻る (go(index))。入力と選んだ書類はそのまま。<br/>画面: 10a-3 入力を直し、「確認画面へ」まで進める (基本フロー 9 へ戻る)。
    end

    User->>Wiz: 入力内容を確かめ、「申請する」をクリック
    Wiz->>Http: 送る本文を作り、申請を送るよう頼む (submit → send)<br/>application に入力の JSON、document に書類。ボタンは「申請しています…」
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: POST /api/account/store-applications<br/>(multipart/form-data、CSRF トークンのヘッダー付き)
    Ctrl->>Ctrl: application の項目を確かめる (submit の @Valid、Input)<br/>必須、文字数、メールの形式、電話番号の文字
    break 項目が条件に合わない (記述なし)
        Ctrl--xErrs: 例外を投げる (MethodArgumentNotValidException)
        Note over Errs,Wiz: 結果: 400 INVALID_INPUT「入力内容・文字数・数値の範囲を確認してください。」を返す。<br/>画面: 手順 1 の入力欄 (setStep(0)) とその文。
    end
    Ctrl->>Svc: 申請を保存するよう頼む (submit)。全体が 1 つのトランザクション<br/>ログイン中の会員を読み (current)、会員の行をロックして読み直す<br/>(lockMember、SELECT ... FOR UPDATE members)
    break 出店申請用アカウントでない (記述なし)
        Svc--xErrs: 403 APPLICANT_REQUIRED の例外を投げる (ApiException)
        Note over Errs,Wiz: 結果: 403 を返し、申請は保存しない。<br/>画面: 「入力内容の確認」のまま「出店の申請は、企業様向けの登録で作ったアカウントで行ってください。」
    end
    Svc->>Repo: 自分の申請をすべてロックして読む (lockAllForMember、<br/>SELECT ... FOR UPDATE organization_applications)。今の申請が先頭
    break 11a 今の申請が審査中 (SUBMITTED)
        Svc--xErrs: 409 APPLICATION_EXISTS の例外を投げる (ApiException)
        Note over Errs,Wiz: 結果: 409 を返し、申請は保存しない。<br/>画面: 11a-1「入力内容の確認」のまま「審査中の申請があります。」(11a-2 ユースケースを終了する)
    end
    break 書類が空か、PDF・PNG・JPEG でない (記述なし)
        Svc--xErrs: 400 INVALID_DOCUMENT の例外を投げる (ApiException)
        Note over Errs,Wiz: 結果: 400 を返す。空なら「確認書類は5MB以内で指定してください。」、<br/>先頭のバイトが PDF・PNG・JPEG でなければ「PDF・PNG・JPEGを指定してください。」<br/>画面: 手順 1 の入力欄 (setStep(0)) とその文。
    end
    Svc->>Svc: 新しい申請を作る (new StoreApplicationEntity)<br/>審査中 (SUBMITTED)、今の申請 (is_latest が真)
    opt 再申請 (今の申請がある)
        Svc->>Repo: 前々回の申請を消し、今の申請を前回の申請にする<br/>(delete、becomePrevious、flush)
        Note over Svc,Db: 結果: DELETE organization_applications (前々回の申請)、<br/>UPDATE organization_applications (今の申請の is_latest を偽にする)。
    end
    Svc->>Repo: 新しい申請を保存する (save)
    Svc->>Ntf: 12 サイト内通知「出店申請を受け付けました」を<br/>保存するよう頼む (send、本文は会社・事業者名)
    Svc->>Db: 申請と通知を保存してコミットする<br/>(INSERT organization_applications、notifications)
    Db-->>Svc: 完了
    Svc-->>Ctrl: 保存した申請 (view)
    Ctrl-->>Http: 200 保存した申請
    Http-->>Wiz: 保存した申請 (readResponse)
    Wiz->>Page: 申請が終わったことを伝える (onDone)。受付の表示に切り替え (setDone(true))、<br/>申請が変わったことを知らせる (applicationsChanged のイベント)
    Page-->>User: 11「出店申請を受け付けました」「審査結果は通知でお知らせします。」、<br/>「出店申請状況を確認する」リンク
    Work->>Ctrl: applicationsChanged を受けて、サイドバー用の申請を取り直す (リスナー → reload)<br/>GET /api/account/store-applications。中身は 5〜6 と同じ
    Ctrl-->>Work: 200 申請の配列 (今の申請が 1 件以上)
    Work-->>User: サイドバーのリンクが「出店申請状況」になる
```

![EC-B17 シーケンス図](<images/EC-B17_出店の申請をする-1.png>)

## 共通代替フローを直接書いた図

上の図の通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて申請を取る通信（上の図の 4）と、申請を送る通信（上の図の 22、24）に分けています。入力の手順と確認は通信しないので、共通代替フローは起こりません。申請を送った後にサイドバー用に取り直す通信（上の図の 43）は、\*a では画面にエラーを出さず、サイドバーのリンクが「出店申請」のまま残るだけです。\*b では「画面を開いて申請を取るとき」の \*b と同じ期限切れのお知らせが出ます。どちらも申請の受付の表示は変わらないので、図から省いています。

### 画面を開いて申請を取るとき

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態の確認<br/>useAuth<br/>(useAuth.js)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as 出店申請画面<br/>ApplicationPage<br/>(StoreApplication.jsx)
        participant Wiz as 申請の入力と送信<br/>ApplicationWizard<br/>(ApplicationWizard.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 申請の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログイン状態の読み込み<br/>readSession・passwordLogin<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Ctrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant Svc as 出店申請の処理<br/>StoreApplicationService<br/>(StoreApplicationService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みを含む)
        User->>Work: /seller/application の URL を開く
        Work->>UseAuth: ログイン状態を読むよう頼む (useAuth)
        UseAuth->>AuthJs: 作られたときに自動で読む (refreshSession → readSession)
        alt *a 届かない
            AuthJs-xFilter: GET /api/auth/me
            AuthJs--xUseAuth: エラーを投げる (fetch の TypeError)
            UseAuth-->>Work: エラーの文 (setError)
            Work-->>User: *a-1 ブラウザーが作った文だけを出す。「再取得」はなく、<br/>*a-3 のやり直しはブラウザーの再読み込み
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: GET /api/auth/me
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>AuthJs: 503 AUTH_UNAVAILABLE (セッションは残す)
            AuthJs--xUseAuth: 200 以外なので「ログイン状態を確認できません。」<br/>のエラーを投げる (readSession)
            UseAuth-->>Work: エラーの文 (setError)
            Work-->>User: *a-1「ログイン状態を確認できません。」だけを出す
        else *b ログインしていない
            AuthJs->>Filter: GET /api/auth/me
            Filter->>AuthCtrl: 要求を通す (chain.doFilter)
            AuthCtrl-->>AuthJs: 200 authenticated=false (me → session)
            AuthJs-->>UseAuth: ログインしていない状態
            UseAuth-->>Work: ログインしていない状態
            Work->>Panel: 画面の代わりにログインの入力欄を出す (AuthPanel)
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: ログインするよう頼む<br/>(submit → passwordLogin、returnTo は今の URL)
            AuthJs->>PwCtrl: POST /api/auth/login (前に GET /api/auth/csrf)<br/>Cognito で確かめ、セッションを作る (中身は 00 の *b-2)
            PwCtrl-->>AuthJs: 200 returnTo
            AuthJs-->>Panel: returnTo
            Panel-->>User: *b-2 returnTo の /seller/application を読み込み直す<br/>(complete → window.location.replace)。この図の 1 からやり直す
        else ログインしている
            AuthJs->>Filter: GET /api/auth/me
            Filter->>AuthCtrl: 要求を通す (chain.doFilter)
            AuthCtrl-->>AuthJs: 200 authenticated=true、<br/>accountType は SHOP_OWNER_APPLICANT
            AuthJs-->>UseAuth: ログイン中の会員
            UseAuth-->>Work: ログイン中の会員
            Work->>Page: ApplicationPage を表示
        end
    else メニューから開いた
        User->>Work: サイドバーの「出店申請」をクリック
        Work->>Page: URL を変え、ApplicationPage を表示<br/>(ログイン状態は読み直さない)
    end

    Page->>Hook: 自分の出店申請を取りに行くよう頼む (useResource)
    Hook->>Http: 申請の一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/account/store-applications
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。接続を確認して<br/>再試行してください。」と「再取得」。入力の手順は出さない
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/account/store-applications
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/seller/application のログイン画面<br/>(ログインの後は *b-2 で出店申請画面を読み込み直す)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/account/store-applications
        Filter-xCog: ID トークンを更新する (InitiateAuth REFRESH_TOKEN_AUTH)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (setError)
        Status-->>User: *a-1「認証を確認できません。時間をおいて<br/>再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/account/store-applications
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 自分の申請の一覧を作るよう頼む (list)
        Svc->>Db: ログイン中の会員と申請を読む (上の図の 5)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。時間をおいて<br/>再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 申請の行
            Svc-->>Ctrl: 申請のリスト
            Ctrl-->>Http: 200 申請の配列
            Http-->>Hook: 申請の配列
            Hook-->>Page: 申請の配列
            Page->>Wiz: 入力の手順を表示 (ApplicationWizard)
            Wiz-->>User: 「ステップ 1 / 4：事業者情報」の入力欄 (上の図の 10、11)
        end
    end
    opt *a-3 一覧を取り直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 申請を取り直す (reload)。この図の 36 からやり直す
    end
```

![EC-B17 共通代替フローを直接書いた図（画面を開いて申請を取るとき）](<images/EC-B17_出店の申請をする-2.png>)

### 申請を送るとき

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Wiz as 申請の入力と送信<br/>ApplicationWizard<br/>(ApplicationWizard.jsx)
        participant Http as 通信<br/>send・readResponse<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant Svc as 出店申請の処理<br/>StoreApplicationService<br/>(StoreApplicationService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Wiz: 「入力内容の確認」で「申請する」をクリック
    Wiz->>Http: 申請を送るよう頼む (submit → send)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xWiz: エラーを投げる
        Wiz-->>User: *a-1「サーバーに接続できません。接続を確認して<br/>再試行してください。」。*a-2「入力内容の確認」のまま、入力と書類は残る
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a POST が届かない、または応答が JSON でない (保存されたかは分からない)
            AuthJs-xFilter: POST /api/account/store-applications
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xWiz: エラーを投げる
            Wiz-->>User: *a-1「サーバーに接続できません。接続を確認して<br/>再試行してください。」。*a-2「入力内容の確認」のまま、入力と書類は残る
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: POST /api/account/store-applications
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xWiz: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Wiz-->>User: 「入力内容の確認」のまま、<br/>「ログインの有効期限が切れました。もう一度ログインしてください。」
            Notice-->>User: *b-1 同じ文と「ログインすると、この画面に戻ります。」<br/>「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/seller/application のログイン画面<br/>(*b-2 で戻ると入力の手順は最初から。入力は残らない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: POST /api/account/store-applications
            Filter-xCog: ID トークンを更新する (InitiateAuth REFRESH_TOKEN_AUTH)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xWiz: エラーを投げる (ApiError 503)
            Wiz-->>User: *a-1「認証を確認できません。時間をおいて再試行してください。」<br/>*a-2「入力内容の確認」のまま、入力と書類は残る
        else 要求が Controller まで届いた
            AuthJs->>Filter: POST /api/account/store-applications
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 申請を保存するよう頼む (submit)
            Svc->>Db: 会員と申請をロックして読み、申請と通知を保存して<br/>コミットする (上の図の 27〜37)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xWiz: エラーを投げる (ApiError 503)
                Wiz-->>User: *a-1「保存処理を完了できませんでした。時間をおいて再試行してください。」<br/>*a-2「入力内容の確認」のまま、入力と書類は残る
            else 保存した
                Db-->>Svc: 完了
                Svc-->>Ctrl: 保存した申請
                Ctrl-->>Http: 200 保存した申請
                Http-->>Wiz: 保存した申請
                Wiz-->>User: 「出店申請を受け付けました」(上の図の 38〜42)
            end
        end
    end
    opt *a-3 やり直す
        User->>Wiz: 残った入力のまま、もう一度「申請する」をクリック<br/>(この図の 1 へ戻る)
    end
```

![EC-B17 共通代替フローを直接書いた図（申請を送るとき）](<images/EC-B17_出店の申請をする-3.png>)

## ユースケース記述との差

- 関連情報は共通代替フロー \*b だけを挙げていますが、画面を開くときと申請を送るときの通信には \*a も起こります。申請を送る通信が失敗したときは、エラーの文を入力の手順の上（`ApplicationWizard` の `error`）に出し、「入力内容の確認」と入力・選んだ書類を残します。「再取得」のボタンはなく、やり直すには同じ「申請する」をもう一度押します。
- \*b で「ログインする」を選ぶと、`returnTo` の出店申請画面を読み込み直すので、入力の手順は最初（再申請なら前回の申請の内容）からになります。入力の途中だった内容は戻りません。
- 4b: 画面は書類の種類を調べません。ファイルの選択欄の `accept` で PDF・PNG・JPEG に絞るだけです。サーバーがファイルの先頭のバイトで調べ、合わなければ 400 `INVALID_DOCUMENT`「PDF・PNG・JPEGを指定してください。」を返します。記述の 4b にこの文はありません。
- 0 バイトのファイルは画面の確かめを通り、サーバーで 400 `INVALID_DOCUMENT`「確認書類は5MB以内で指定してください。」になります。空のファイルに 5MB の文が出ます。
- サーバーが 400 を返したときは、どの項目の誤りでも手順 1（事業者情報）に戻ります（`submit()` の `setStep(0)`）。書類の誤りでも、手順 3（事業確認書類）ではなく手順 1 が出ます。
- サーバーも項目を `@Valid` の `Input` で確かめ、合わなければ 400 `INVALID_INPUT` を返します。メールの形式は画面（`@` の前後に空白以外の文字があるか）とサーバー（`@Email`）で決まりが違うので、画面を通ってサーバーで止まることがあります。記述にない分岐です。
- 403 `APPLICANT_REQUIRED` は記述にありません。画面は出店申請用アカウントにだけ入力の手順を出すので、画面を開いた後に会員の種別が変わった場合に限られます。関連情報の「出店申請は、企業様向けに登録したアカウントで行います。…」は、画面（`notApplicant()`）が `accountType` を見て出す文で、このときは申請を読みに行きません。事前条件で外したので図には書いていません。
- 11a-2「ユースケースを終了する」: 画面は「入力内容の確認」のまま、ボタンも押せる状態で残ります。もう一度「申請する」を押しても、同じ 409 になります。
- 基本フロー 12 の通知は、申請と同じトランザクションで、応答を返す前に保存します。画面に「出店申請を受け付けました」が出る（基本フロー 11）より先に、通知は保存されています。
- 申請を送った後、サイドバーのリンクを「出店申請状況」に変えるために、`Workspace` が申請の一覧をもう一度取ります（`applicationsChanged` のイベント）。記述では EC-B18 の関連情報に、リンクの表示だけが書かれています。
- 再申請では、前々回の申請を消し、今の申請を前回の申請にしてから、新しい申請を保存します。記述では EC-B18 の関連情報に書かれています。
- 最新の申請が審査中か承認のときに出店申請画面を開くと、`useApplicationRoute()` が「出店申請状況」画面（`/seller/application/status`）に置き換えます。オーナー・担当者のアカウントなら「商品管理」画面（`/seller/products`）に置き換えます。事前条件で外したので図には書いていません。
- 5a: 手順 1 には「戻る」ボタンがありません（`step > 0` のときだけ出す）。

## 確かめられなかったこと

- 画面の確かめを通らずに 5MB を超えるファイルが届いた場合の応答です。`application.properties` の `spring.servlet.multipart.max-file-size=5MB` で Spring が先に止め、`ApiErrors.imageTooLarge()` が 413 `IMAGE_TOO_LARGE`「画像は1枚5MB以下にしてください。」を返すと読めますが、動かして確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`（サイドバーの `applicationLink`、`applicationsChanged` のリスナー、未ログインの `AuthPanel`、`ApplicationPage` の表示）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/StoreApplication.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/StoreApplication.jsx): `ApplicationPage`、`useApplicationRoute`、`notApplicant`、`canReapply`、`applicationsChanged`
- [frontend/src/workspace/ApplicationWizard.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ApplicationWizard.jsx): `ApplicationWizard`（`next`、`go`、`submit`、`setDraft`）、`stepError`、`Summary`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`readSession`、`passwordLogin`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`（`refreshSession`）
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`（`submit`、`complete`）
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `mine`、`submit`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `Input`、`submit`、`list`、`view`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java): `findByMemberIdOrderByCreatedAtDesc`、`lockAllForMember`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java): `becomePrevious`、`status` と `latest` の初期値
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `lockMember`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current`、`session`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503 のときはセッションを残す、`/api/auth/me` は 401 でも通す）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`database`、`imageTooLarge`
- [backend/src/main/resources/application.properties](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/resources/application.properties): `spring.servlet.multipart.max-file-size`
