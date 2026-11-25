# EC-S11 イベント通知を確認する

- ユースケース記述: [EC-S11_イベント通知を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S11_イベント通知を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは図に描かず、図の下に並べています。期限が過ぎた譲渡の申し出の無効化（記述なし）と担当者の所属店舗の読み込みは、`opt` の中の矢印 1 本と Note にしています。基本フロー 4 の「既読にする」は、必要に応じて行う操作ですが、新しい書き込みがあるので `opt` にせず矢印で描いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 出店者通知画面<br/>Notices<br/>(Notices.jsx)
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
        participant SM as 店舗の所属の読み書き<br/>StoreMemberRepository<br/>(StoreMemberRepository.java)
        participant Repo as 通知の読み書き<br/>NotificationRepository<br/>(NotificationRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、22、24、一覧の取り直しの 32 に適用<br/>*a 通信に失敗した場合: 4、22、24、一覧の取り直しの 32 に適用

    User->>Work: 1 出店者メニューの「出店者通知」をクリック (EC-C03)
    Work->>Page: URL を /seller/notifications に変え、Notices を表示<br/>(path の末尾が /notifications)
    Page->>Hook: 通知を取りに行くよう頼む (useResource('/notifications'))
    Hook->>Ctrl: 画面を開いたときに自動で通信を始める (reload → request)<br/>GET /api/notifications
    Ctrl->>Svc: 自分あての通知を集めるよう頼む (list)。クラスの @Transactional で<br/>1 つのトランザクション。ログイン中の会員を調べる (AuthService の current)
    Svc->>Pend: 期限が過ぎたオーナーの譲渡の申し出を無効にするよう頼む (expireIfDueFor)<br/>自分がオーナーか譲渡先で、期限が過ぎた申し出のある組織を探す<br/>(OrganizationRepository.findIdsWithExpiredOwnerSuccession、SELECT organizations)
    opt 期限が過ぎた申し出がある (記述なし)
        Pend->>Db: 組織ごとに申し出を無効にする (expireIfDue → lock、invalidate)
        Note over Pend,Db: 結果: 組織の行をロックして確かめ直し (SELECT ... FOR UPDATE organizations)、承認待ちを空にして、<br/>履歴と「オーナーの譲渡の申し出が無効になりました」の通知を保存する
    end
    Svc->>Svc: 見られる通知の条件を作る (visibility)
    opt 担当者 (SHOP_STAFF) のとき
        Svc->>SM: 自分が所属する店舗を読む (findAllForMember、SELECT store_members)
        Note over Svc,SM: 結果: 所属する店舗 (ロールのない店舗を含む) あての通知も見られる条件にする。<br/>画面: 変わらない
    end
    Svc->>Repo: 自分あての通知を新しい順に読む<br/>(findByMemberIdOrderByCreatedAtDesc、SELECT notifications)
    Svc->>Svc: 見られる通知だけを残す (filter(visible))。<br/>担当者は、本人あての通知と、所属する店舗あての通知だけ
    Svc->>Org: 自分あての期限内の譲渡の申し出があるかを調べる<br/>(existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter、SELECT organizations)
    Svc->>Svc: あれば、いちばん新しい申し出の通知を<br/>承認・断りのできる通知にする (answerableRequest)
    Ctrl-->>Hook: 200 通知の配列 (id、種類、タイトル、本文、日時、既読の日時、answerable)
    Hook-->>Page: 通知
    Page-->>User: 2 通知ごとのタイトル、本文、日時。既読なら「既読」、未読なら「既読にする」。<br/>譲渡の申し出の通知には「重要」(承認できるなら「承認する」「断る」も。<br/>その操作は図では省略)
    User->>Page: 3 通知の内容を確かめる (通信しない)

    User->>Page: 4 (必要に応じて) 未読の通知の「既読にする」をクリック
    Page->>Hook: 既読にする通信を実行するよう頼む<br/>(run。成功の文は既定の「保存しました。」)
    Hook->>Http: 既読にする通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PUT /api/notifications/{id}/read (CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 通知を既読にするよう頼む (read)。1 つのトランザクション<br/>ログイン中の会員を調べる (AuthService の current)
    Svc->>Repo: 通知を読む (findById、SELECT notifications)
    Svc->>Svc: 本人あてで、今も見られる通知かを確かめる (filter、visibility)。<br/>担当者なら所属する店舗を読む (流れは 9 と同じ)
    Svc->>Svc: 既読の日時を入れる (markRead。既読なら変えない)
    Svc->>Db: 変更を保存してコミットする<br/>(save は呼ばない。UPDATE notifications)
    Ctrl-->>Http: 200 { read: true }
    Http-->>Hook: 既読にした
    Hook->>Ctrl: 通知を取り直す (reload)<br/>GET /api/notifications。流れは 4〜14 と同じ
    Ctrl-->>Hook: 最新の通知
    Hook-->>Page: 成功を返す (run が true、「保存しました。」を設定)
    Page-->>User: 5「保存しました。」と、その通知の「既読」
```

![EC-S11 シーケンス図](<images/EC-S11_イベント通知を確認する-1.png>)

図に描いていない代替フロー：2a（通知がない）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の「既読にする」の通信（CSRF トークンの取得と `PUT /api/notifications/{id}/read`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて通知を取る `GET /api/notifications` の \*a・\*b は、[EC-S07](<EC-S07_注文実績を確認する.md>) の「共通代替フローを直接書いた図」と同じ流れ（`useResource` と `ResourceStatus` のエラーの文と「再取得」）なので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 出店者通知画面<br/>Notices<br/>(Notices.jsx)
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
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので通知は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」。<br/>*a-2 通知の表示はそのまま (「既読にする」も残る)
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (既読になったかは分からない)
            AuthJs-xFilter: PUT /api/notifications/{id}/read
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので通知は取り直さない
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
            AuthJs-->>User: /account/login?returnTo=/seller/notifications のログイン画面<br/>(*b-2 ログインの後は出店者通知画面に戻る。既読にはなっていない)
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
            Svc->>Db: 通知を読み、既読の日時を入れてコミットする (上の図の 25〜29)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
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
                Http-->>Hook: 既読にした
                Hook-->>Page: 通知を取り直して成功を返す (reload、run が true)
                Page-->>User: 「保存しました。」と、その通知の「既読」
            end
        end
    end
    opt *a-3 やり直す
        alt 通知を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 通知を取り直す (reload)。既読にする通信は送り直さない
        else 既読にし直す
            User->>Page: もう一度「既読にする」をクリック (基本フロー 4 へ戻る)
        end
    end
```

![EC-S11 共通代替フローを直接書いた図](<images/EC-S11_イベント通知を確認する-2.png>)

## ユースケース記述との差

- 記述の見出しは「通知一覧を確認する」、ファイル名は「イベント通知を確認する」、画面のメニューと見出しは「出店者通知」です。画面（`Notices`）は購入者の「通知一覧」（`/notifications`）と共用で、どちらも `GET /api/notifications` で自分あての通知を読みます。
- 基本フロー 2 の「担当する店舗に関する通知」は、コードでは次のとおりです（`NotificationService.visibility()`）。
  - オーナーは、自分あての通知をすべて見ます。
  - 担当者（`SHOP_STAFF`）は、本人あて（`PERSONAL`）の通知と、今所属している店舗あて（`STORE`）の通知を見ます。所属にはロールのない店舗も含みます。店舗から外れると、その店舗あての通知は前に見えていたものも見えなくなります。店舗を持たない古い店舗あての通知は、どこかの店舗に所属している間だけ見えます。
- 基本フロー 2 の通知の取得では、通知を読む前に、自分がオーナーか譲渡先の組織に期限切れのオーナーの譲渡の申し出がないかを調べ、あれば無効にして、履歴と「オーナーの譲渡の申し出が無効になりました」の通知を保存します（`PendingOwnerSuccession.expireIfDueFor()`）。GET の中で書き込みが起きます。
- オーナーの譲渡の申し出の通知には「重要」の印が付き、譲渡先が今承認できる申し出なら「承認する」「断る」ボタンも出ます（`POST /api/seller/owner-succession/approval`・`refusal`）。承認・断りのできない申し出の通知には「この申し出は終わったため、承認も断りもできません。」が出ます。どれも記述にありません。
- 基本フロー 5 で「既読にする」を押すと、その通知に「既読」が出るほか、一覧の上に「保存しました。」も出ます。`Notices.jsx` が `run()` にメッセージを渡さず、`useResource.js` の既定のメッセージが使われるためです。
- 2a で、記述の「通知なしの状態」は、画面では「通知はありません。」です。
- 404 `NOTICE_NOT_FOUND`「通知が見つかりません。」は記述にありません。担当者が一覧を開いたあとで店舗から外されると、その店舗あての通知を既読にできず 404 になります。画面は 404 のとき一覧を取り直します。
- 既読にする通信が失敗したとき、「再取得」は一覧を取り直すだけで、既読にする通信は送り直しません。やり直すには、もう一度「既読にする」を押します。
- 関連情報の通知の一覧のほかに、次の通知も届きます。「店舗の担当から外れました」（本人あて）、オーナーの譲渡の申し出・承認・取り消し・断り・無効の通知。
- 関連情報の「通知は、組織のオーナーと、その店舗でロールを割り振られた担当者それぞれに届く」は、店舗あての通知（`NotificationService.toStore()`）の説明です。組織の受付停止・停止・再開の通知（`OrganizationSuspensionService.notifyOwner()`）は、オーナーだけに届きます。
- 店舗側のアカウントでも運営でもない会員が `/seller/notifications` を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出します。事前条件が出店者のログインなので、図には書いていません。どの店舗にも所属していない担当者には、出店者メニューに「出店者通知」だけが出ます。

## 参照したコード

- [frontend/src/workspace/Notices.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Notices.jsx): `Notices`、「通知はありません。」、「既読」と「既読にする」、`IMPORTANT_CATEGORIES`、`answerable` のボタン
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `noticeItem` の「出店者通知」、`path.endsWith('/notifications')` で `Notices` を表示、`unassigned`、未ログインの `AuthPanel`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`run`（既定のメッセージ「保存しました。」、404 と 409 のときの `reload`）、`reload`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java): `list`、`read`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `list`、`answerableRequest`、`read`、`visibility`、`toStore`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java): `findByMemberIdOrderByCreatedAtDesc`（`findById` は JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java): `PERSONAL`・`STORE`、通知の種類、`markRead`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `expireIfDueFor`、`expireIfDue`、`lock`、`invalidate`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findIdsWithExpiredOwnerSuccession`、`existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java): `findAllForMember`
- [backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java): オーナーの譲渡の通知の文面
- [backend/src/main/java/jp/kusakari/ec/store/service/StaffAccountService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StaffAccountService.java): 「店舗の担当から外れました」
- [backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java): `notifyOwner`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
