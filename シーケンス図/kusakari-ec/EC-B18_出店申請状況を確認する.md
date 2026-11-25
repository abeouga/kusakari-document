# EC-B18 出店申請状況を確認する

- ユースケース記述: [EC-B18_出店申請状況を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B18_出店申請状況を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
図は、EC-C01 でマイページを開いた後から始まります。マイページを開いたときに `Workspace` がサイドバー用に `GET /api/account/store-applications` で申請を読み、申請があるので、リンクは「出店申請状況」になっています。共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは図に描かず、図の下に並べています。EC-B17 の出店申請画面へ進む「再申請する」（3a-2・3b-2）は、クリックの矢印 1 本と Note にしています。そこでしか起きない取り下げの通信（4a）だけを矢印で描いています。

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

図に描いていない代替フロー：4b（取り下げる前に審査が終わっていた）

## 共通代替フローを直接書いた図

上の図の取り下げの通信（CSRF トークンの取得と `PUT /api/account/store-applications/{id}/withdrawal`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて申請を取る通信（上の図の 4）と「再申請する」の後の通信（上の図の 13 の後）の \*a・\*b は、[EC-B17](<EC-B17_出店の申請をする.md>) の「画面を開いて申請を取るとき」の図と同じなので省いています（`ApplicationPage` を `ApplicationStatusPage` に読み替え、失敗したときは審査状況の代わりにエラーの文と「再取得」だけが出ます）。

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 出店申請状況画面<br/>ApplicationStatusPage<br/>(StoreApplication.jsx)
        participant Status as エラーと完了の表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 申請の取得と取り下げ<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
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

    User->>Page: 審査中の申請の「申請を取り下げる」をクリック
    Page->>Hook: 取り下げを実行し、成功の文を渡す (run)
    Hook->>Http: 取り下げの通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので申請は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Status-->>User: *a-1「サーバーに接続できません。接続を確認して<br/>再試行してください。」と「再取得」。*a-2「審査状況：審査中」と<br/>「申請を取り下げる」はそのまま残る
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (取り下げたかは分からない)
            AuthJs-xFilter: PUT /api/account/store-applications/{id}/withdrawal
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので申請は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「サーバーに接続できません。接続を確認して<br/>再試行してください。」と「再取得」。*a-2 表示中の審査状況はそのまま
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/account/store-applications/{id}/withdrawal
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook->>Status: エラーの文を出す (setError)
            Hook-->>Page: 失敗を返す (run が false)
            Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/seller/application/status のログイン画面<br/>(*b-2 で出店申請状況画面を読み込み直す。申請は取り下げていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/account/store-applications/{id}/withdrawal
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「認証を確認できません。時間をおいて<br/>再試行してください。」と「再取得」
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/account/store-applications/{id}/withdrawal
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 申請を取り下げるよう頼む (withdraw)
            Svc->>Db: 申請をロックして読み、取り下げ済みにして<br/>コミットする (上の図の 21〜24)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Status-->>User: *a-1「保存処理を完了できませんでした。時間をおいて<br/>再試行してください。」と「再取得」
            else 取り下げた
                Db-->>Svc: 完了
                Svc-->>Ctrl: 取り下げた申請
                Ctrl-->>Http: 200 取り下げた申請
                Http-->>Hook: 取り下げた申請
                Hook-->>Page: 申請を取り直して成功を返す (reload、run が true)
                Page-->>User: 「申請を取り下げました。」と「審査状況：取り下げ済み」(上の図の 28〜31)
            end
        end
    end
    opt *a-3 やり直す
        alt 申請を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 申請を取り直す (reload)。取り下げの通信は送り直さない
        else 取り下げをやり直す
            User->>Page: もう一度「申請を取り下げる」をクリック (この図の 1 へ戻る)
        end
    end
```

![EC-B18 共通代替フローを直接書いた図](<images/EC-B18_出店申請状況を確認する-2.png>)

## ユースケース記述との差

- 関連情報は共通代替フロー \*b だけを挙げていますが、画面を開くときと取り下げのときの通信には \*a も起こります。取り下げの通信が届かなかったときは、取り下げたかどうかが分からないまま、表示中の審査状況が残ります。「再取得」は申請を取り直すだけで、取り下げの通信は送り直しません。
- 「申請日」「申請内容」「提出書類を確認」は、審査中だけでなく、却下・取り下げ済み・承認のときも表示します（`ApplicationStatusPage` で状態の条件の外にあるため）。記述の 3a・3b には「申請日」と「提出書類を確認」がなく、3c には審査状況とメッセージしかありません。
- 「提出書類を確認」はリンク（`a` 要素）で、押すとブラウザーが `GET /api/account/store-applications/{id}/document` を開き、書類をダウンロードします（`Content-Disposition: attachment`）。基本フローに押す操作がないので、図には書いていません。
- 3c の後は画面を再読み込みするまで、アカウントの種類は出店申請用のままです（`useAuth` のログイン状態を読み直さないため）。再読み込みすると、オーナーのアカウントとして `useApplicationRoute()` が「商品管理」画面（`/seller/products`）に置き換え、サイドバーの「出店をご検討の方」も出なくなります。
- 申請を取り下げても、通知は送りません。サイドバーの申請の一覧も取り直しません（リンクは「出店申請状況」のままで、関連情報のとおりです）。
- 4b の 409 は、申請が「今の申請」でない場合（`isLatest()` が偽）にも返します。記述は審査が終わった場合だけを書いています。4b-1 の文の横には「再取得」ボタンも出ます。
- 404 `APPLICATION_NOT_FOUND`「申請が見つかりません。」は記述にありません。申請がないか本人の申請でないときに返しますが、画面は自分の最新の申請の ID を送るので、画面の操作では起こりません。図には書いていません。
- 関連情報の「『出店申請状況』画面の URL に直接アクセスした場合」: 未ログインなら、URL を変えずに、その場でログインの入力欄（`AuthPanel`）を出します（`Workspace.jsx`）。申請がない出店申請用アカウントなら、`useApplicationRoute()` が履歴を増やさずに「出店申請」画面（`/seller/application`）に置き換えます。事前条件（出店申請をしている）で外したので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`（サイドバーの `applicationLink`、`ApplicationStatusPage` と `ApplicationPage` の表示、未ログインの `AuthPanel`）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/StoreApplication.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/StoreApplication.jsx): `ApplicationStatusPage`、`ApplicationPage`、`useApplicationRoute`、`canReapply`、`statusLabels`
- [frontend/src/workspace/ApplicationWizard.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ApplicationWizard.jsx): `Summary`、`ApplicationWizard` の `previous`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」、完了の文）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `mine`、`withdraw`、`file`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `list`、`withdraw`、`document`、`missing`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java): `findByMemberIdOrderByCreatedAtDesc`、`lock`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java): `withdraw`、`isLatest`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503 のときはセッションを残す）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
