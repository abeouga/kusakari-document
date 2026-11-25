# EC-B15 利用者通知を確認する

- ユースケース記述: [EC-B15_利用者通知を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B15_利用者通知を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの分岐は描かず、代替フローは図の下に並べています。

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

図に描いていない代替フロー：2a（通知がない）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて一覧を取る通信と、「既読にする」の通信の 2 つに分けています。

### 画面を開いて通知の一覧を取る

`useAuth()` が `GET /api/auth/me` でログイン状態を読むのは、通知一覧の URL を直接開いたとき（再読み込みを含む）だけです。マイページのメニューから開いたときは、`Workspace` がすでに表示されているので読み直しません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as 通知一覧画面<br/>Notices<br/>(Notices.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログイン状態と通信の準備<br/>readSession・authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 通知API<br/>NotificationController<br/>(NotificationController.java)
        participant Svc as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt 通知一覧の URL を直接開いた (再読み込みを含む)
        User->>Work: /notifications の URL を開く
        Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
        alt *a ログイン状態を読めない
            AuthJs-xAuthCtrl: GET /api/auth/me<br/>(届かない、または 200 と 403 以外。Cognito に届かない 503 を含む)
            AuthJs--xWork: エラーを投げる (届かないときはブラウザーの文、<br/>それ以外は「ログイン状態を確認できません。」)
            Work-->>User: *a-1 エラーの文だけを表示<br/>(「再取得」はない。やり直しはブラウザーの再読み込み)
        else *b ログインしていない (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=false (session)
            AuthJs-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログインの入力欄を表示
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: ログインするよう頼む (submit → passwordLogin)<br/>returnTo は今の URL
            AuthJs->>AuthCtrl: GET /api/auth/csrf (postAuth → authFetch)
            AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
            AuthJs->>PwCtrl: POST /api/auth/login
            PwCtrl->>Cog: メールアドレスとパスワードを確かめる<br/>(CognitoPasswordLogin の authenticate、InitiateAuth USER_PASSWORD_AUTH)
            Cog-->>PwCtrl: ID トークン、refresh トークン
            PwCtrl-->>AuthJs: 200 returnTo (セッションに認証情報を保存)
            AuthJs-->>Panel: returnTo
            Panel-->>User: *b-2 /notifications を読み込み直す (complete → window.location.replace)。<br/>この図の最初から、ログイン済みとしてやり直す
        else ログイン済み
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=true
            AuthJs-->>Work: ログイン中の会員
            Work->>Page: Notices を表示
        end
    else マイページのメニューの「通知一覧」をクリック
        User->>Work: 「通知一覧」をクリック
        Work->>Page: URL を /notifications に変え、Notices を表示<br/>(ログイン状態は読み直さない)
    end

    Page->>Hook: 通知の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/notifications
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/notifications
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/notifications のログイン画面<br/>(ログインの後は *b-2 で通知一覧に戻る)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/notifications
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/notifications
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 自分あての通知の一覧を作るよう頼む (list)
        Svc->>Db: 期限切れの譲渡の申し出を調べ、通知を読む<br/>(上の図の 7〜13)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (reload の catch → setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 通知の行
            Svc-->>Ctrl: 通知の一覧
            Ctrl-->>Http: 200 通知の配列
            Http-->>Hook: 通知の一覧
            Hook-->>Page: 通知の一覧
            Page-->>User: 通知の一覧 (なければ「通知はありません。」)
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 一覧を取り直す (reload)。流れはこの図の 28 から同じ
    end
```

![EC-B15 共通代替フローを直接書いた図 画面を開いて通知の一覧を取る](<images/EC-B15_利用者通知を確認する-2.png>)

### 「既読にする」

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 通知一覧画面<br/>Notices<br/>(Notices.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 通知API<br/>NotificationController<br/>(NotificationController.java)
        participant Svc as 通知の処理<br/>NotificationService<br/>(NotificationService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Page: 未読の通知の「既読にする」をクリック
    Page->>Hook: 既読にする通信を実行するよう頼む (run)
    Hook->>Http: 既読にする通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf<br/>(ID トークンの更新に失敗した 401 と 503 もここに入る)
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (既読になったかは分からない)
            AuthJs-xFilter: PUT /api/notifications/{id}/read
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/notifications/{id}/read
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/notifications のログイン画面<br/>(ログインの後は *b-2 で通知一覧に戻る。既読にはなっていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/notifications/{id}/read
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/notifications/{id}/read
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 通知を既読にするよう頼む (read)
            Svc->>Db: 通知を読み、既読の日時を入れてコミットする<br/>(上の図の 27〜32)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。変更は取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
            else 既読にした
                Db-->>Svc: 完了
                Svc-->>Ctrl: 終わった
                Ctrl-->>Http: 200 { read: true }
                Http-->>Hook: 既読にした結果
                Hook-->>Page: 一覧を取り直して成功を返す (reload、run が true)
                Page-->>User: 「保存しました。」と、その通知に「既読」
            end
        end
    end
    opt *a-3 やり直す
        alt 一覧を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 一覧を取り直す (reload)。既読の通信は送り直さない
        else 既読をやり直す
            User->>Page: もう一度「既読にする」をクリック (基本フロー 4 へ戻る)
        end
    end
```

![EC-B15 共通代替フローを直接書いた図「既読にする」](<images/EC-B15_利用者通知を確認する-3.png>)

## ユースケース記述との差

- 基本フロー 5 で「既読にする」を押すと、その通知に「既読」が出るほか、一覧の上に「保存しました。」も出ます。`Notices.jsx` が `run()` に成功の文を渡さないので、`useResource.js` の `run()` の既定の文が出ます。記述には「保存しました。」がありません。
- 基本フロー 2 の通知の取得では、通知を読む前に、自分がオーナーか譲渡先の組織に、期限が過ぎたオーナーの譲渡の申し出がないかを調べ、あれば無効にします（`PendingOwnerSuccession.expireIfDueFor()`）。購入者は組織に属さないので、何も変わりません。記述にない処理です。
- 「通知一覧」の画面（`Notices`）は、出店者通知（`/seller/notifications`）と共用です。オーナーの譲渡の申し出の通知には「重要」の印と「承認する」「断る」ボタンが出ますが、購入者には届かない種類の通知なので、図には描いていません。
- 404 `NOTICE_NOT_FOUND`「通知が見つかりません。」は記述にない分岐です。画面は自分の一覧にある通知の ID を送り、購入者は自分あての通知がすべて見えるので（`visibility()`）、購入者の画面の操作ではふつう起きません。通知を消す処理はコードに見つかりませんでした。
- 既読の通知に「既読にする」は出ませんが、同じ通知を 2 回既読にしても、`markRead()` は最初の日時を変えません。
- 「既読にする」の前の `GET /api/auth/csrf` も `SessionValidityFilter` を通ります。ID トークンの期限が切れていて refresh トークンも失効していると、この要求が 401 になり、`authFetch()` が例外を投げます。`send()` がこれを「サーバーに接続できません。…」に置き換えるので、\*b の期限切れのお知らせ（`SessionNotice`）は出ず、\*a-1 の文が出ます。サーバーのセッションそのものが無いときは、`/api/auth/csrf` は 200 を返し、次の `PUT` が 401 になるので、\*b のお知らせが出ます。
- 通知一覧の URL を直接開いたときにログイン状態を読めないと（\*a）、`Workspace.jsx` はエラーの文だけを出し、「再取得」のボタンはありません。届かないときの文はブラウザーが作る文（`fetch()` の例外）で、\*a-1 の共通の文にはなりません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `buyerMenu` の「通知一覧」、`Workspace`（`error` の表示、未ログインの `AuthPanel`、`path.endsWith('/notifications')` で `Notices` を表示）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [frontend/src/workspace/Notices.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Notices.jsx): `Notices`（「通知はありません。」、「既読」と「既読にする」、`IMPORTANT_CATEGORIES`、承認・断りのボタン）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`（既定の文「保存しました。」）、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`、`postAuth`、`passwordLogin`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`、`submit`、`complete`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java): `list`、`read`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `list`、`answerableRequest`、`read`、`visibility`、`Notice`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java): `findByMemberIdOrderByCreatedAtDesc`、`findById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java): `markRead`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `expireIfDueFor`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findIdsWithExpiredOwnerSuccession`、`existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current`、`session`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`（ID トークンの更新、401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `authenticate`、`refresh`、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（セッションが無いときの 401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
