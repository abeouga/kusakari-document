# EC-S11 イベント通知を確認する

- ユースケース記述: [EC-S11_イベント通知を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S11_イベント通知を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 出店者通知画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて通知を表示する
    User->>Page: 出店者メニュー「出店者通知」を開く (EC-C03)
    Page->>Api: GET /api/notifications
    Note right of Api: 一覧の処理全体が<br/>1 つのトランザクション
    Api->>Db: 自分がオーナーか譲渡先の組織で、期限が過ぎた<br/>オーナーの譲渡の申し出を探す
    Db-->>Api: 組織の ID
    opt 期限が過ぎた申し出がある
        Api->>Db: 組織の行をロックし、申し出を無効にして、<br/>履歴と「譲渡の結果」の通知を保存
    end
    opt 担当者 (SHOP_STAFF) のとき
        Api->>Db: 自分が所属する店舗を検索
        Db-->>Api: 所属する店舗
    end
    Api->>Db: 自分あての通知を新しい順に検索
    Db-->>Api: 通知の行
    Api->>Api: 担当者は、本人あてと、所属する店舗あての通知だけ残す
    Api->>Db: 自分あての期限内の譲渡の申し出があるか調べる
    Db-->>Api: ある または ない
    Api-->>Page: 200 通知の配列
    alt 2a 通知がない
        Page-->>User: 「通知はありません。」
        Note right of User: 2a-2 ユースケースを終了する
    else 通知がある
        Page-->>User: 通知ごとのタイトル、本文、日時<br/>既読は「既読」、未読は「既読にする」ボタン
        Note over User,Db: 基本フロー 3〜5 確認して、必要なら既読にする
        User->>Page: 通知を確認し、未読の通知の「既読にする」をクリック
        Page->>Api: PUT /api/notifications/{id}/read
        Note right of Api: 既読の処理全体が<br/>1 つのトランザクション
        Api->>Db: 通知を読む
        Db-->>Api: 通知の行 または 空
        opt 担当者 (SHOP_STAFF) のとき
            Api->>Db: 自分が所属する店舗を検索
            Db-->>Api: 所属する店舗
        end
        alt 自分の通知でない、または見えなくなっていた (ユースケース未記載)
            Api-->>Page: 404 NOTICE_NOT_FOUND
            Page->>Api: GET /api/notifications
            Api-->>Page: 200 最新の通知
            Page-->>User: 「通知が見つかりません。」と最新の通知
        else 既読にできる
            Api->>Db: 既読の日時を保存
            Api-->>Page: 200 read=true
            Page->>Api: GET /api/notifications
            Api-->>Page: 200 最新の通知
            Page-->>User: 「保存しました。」、その通知に「既読」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図 1 基本フロー 1〜3 通知を表示する

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as Notices.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Notification<br/>Controller
        participant Svc as Notification<br/>Service
        participant Auth as AuthService
        participant Pend as PendingOwner<br/>Succession
        participant Org as Organization<br/>Repository
        participant SM as StoreMember<br/>Repository
        participant Repo as Notification<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて通知を表示する
    User->>Page: 出店者メニュー「出店者通知」をクリック (EC-C03)
    Note right of User: Workspace.jsx が path の末尾<br/>/notifications を見て Notices を表示する<br/>(Workspace のライフラインは図では省略)
    Page->>Hook: useResource('/notifications')
    Note right of Hook: useEffect が reload()<br/>を自動で実行する
    Hook->>Http: request('/notifications')
    Http->>Ctrl: GET /api/notifications
    Note right of Ctrl: どの API でも、先に SessionValidityFilter が<br/>ログインを確かめる (図では省略)
    Ctrl->>Svc: list()
    Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Pend: expireIfDueFor(memberId)
    Pend->>Org: findIdsWithExpiredOwnerSuccession(memberId, now)
    Org->>Db: SELECT organizations
    Db-->>Org: 行
    Org-->>Pend: 組織 ID のリスト
    opt 期限が過ぎた申し出がある
        Pend->>Pend: 組織ごとに expireIfDue(organizationId)
        Note right of Pend: 組織の行をロックし (FOR UPDATE)、invalidate() で<br/>承認待ちを空に戻し、履歴と「譲渡の結果」の<br/>通知を保存する (中の呼び出しは図では省略)
    end
    Pend-->>Svc: 戻る (void)
    Svc->>Svc: visibility(member)
    opt member が SHOP_STAFF
        Svc->>SM: findAllForMember(memberId)
        SM->>Db: SELECT store_members
        Db-->>SM: 行
        SM-->>Svc: 所属 (ロールなしを含む) のリスト
    end
    Svc->>Repo: findByMemberIdOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT notifications
    Db-->>Repo: 行
    Repo-->>Svc: NotificationEntity のリスト
    Svc->>Svc: filter(visible)<br/>SHOP_STAFF は PERSONAL と、所属する店舗の<br/>STORE の通知だけ残す
    Svc->>Org: existsByPendingOwnerMemberId<br/>AndPendingOwnerExpiresAtAfter(memberId, now)
    Org->>Db: SELECT organizations
    Db-->>Org: 行 または 空
    Org-->>Svc: true または false
    Svc->>Svc: answerableRequest()<br/>true なら、いちばん新しい申し出の通知の ID
    Svc-->>Ctrl: Notice のリスト
    Ctrl-->>Http: 200 Notice の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    alt 2a resource.data が空の配列
        Page-->>User: 「通知はありません。」
    else 通知がある
        Page-->>User: 通知ごとに title、body、createdAt<br/>readAt があれば「既読」、なければ「既読にする」ボタン
        Note right of Page: OWNER_SUCCESSION_REQUEST の通知には「重要」を付け、<br/>answerable なら「承認する」「断る」も出す<br/>(オーナーの譲渡の操作は図では省略)
        Note over User,Db: 基本フロー 3 通知の内容を確かめる (通信しない)
        User->>Page: 通知の内容を確かめる
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## 詳細図 2 基本フロー 4〜5 既読にする

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as Notices.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Notification<br/>Controller
        participant Errs as ApiErrors
        participant Svc as Notification<br/>Service
        participant Auth as AuthService
        participant Repo as Notification<br/>Repository
        participant SM as StoreMember<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 4〜5 既読にする
    User->>Page: 未読の通知の「既読にする」をクリック
    Page->>Hook: onClick で run(action)
    Hook->>Http: write('/notifications/{id}/read', 'PUT')
    Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
    Http->>Ctrl: PUT /api/notifications/{id}/read
    Ctrl->>Svc: read(id)
    Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Repo: findById(id)
    Repo->>Db: SELECT notifications
    Db-->>Repo: 行 または 空
    Repo-->>Svc: Optional の NotificationEntity
    Svc->>Svc: filter で本人あてか確かめる
    Svc->>Svc: visibility(member)
    opt member が SHOP_STAFF
        Svc->>SM: findAllForMember(memberId)
        SM->>Db: SELECT store_members
        Db-->>SM: 行
        SM-->>Svc: 所属のリスト
    end
    alt 自分の通知でない、または見えなくなっていた (ユースケース未記載)
        Svc--xErrs: orElseThrow() が throw<br/>ApiException(404, NOTICE_NOT_FOUND)
        Errs-->>Http: business() が 404 と message を返す
        Http--xHook: readResponse() が throw ApiError(404)
        Hook->>Http: reload() 404 なので<br/>request('/notifications') で取り直す
        Note over Http,Db: 取得は詳細図 1 と同じ流れ (図では省略)
        Http-->>Hook: 最新の通知
        Hook-->>Page: run() が false を返す。resource.error
        Page-->>User: ResourceStatus が「通知が見つかりません。」、最新の通知
    else 見つかった
        Svc->>Svc: n.markRead()<br/>readAt が空なら今の日時を入れる
        Svc-->>Ctrl: 戻る (void)
        Note over Svc,Db: メソッドの終わりでコミットする。markRead() の変更 (UPDATE notifications) はここで DB に書かれる
        Ctrl-->>Http: 200 read=true
        Http-->>Hook: data
        Hook->>Http: reload()<br/>request('/notifications')
        Note over Http,Db: 取得は詳細図 1 と同じ流れ (図では省略)
        Http-->>Hook: 最新の通知
        Hook-->>Page: run() が true を返す。<br/>data と notice (既定の「保存しました。」) を更新
        Page-->>User: 「保存しました。」、その通知に「既読」
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## ユースケース記述との差

- 記述の見出しは「通知一覧を確認する」、ファイル名は「イベント通知を確認する」、画面のメニューと見出しは「出店者通知」です。画面（`Notices`）は購入者の「通知一覧」（`/notifications`）と共用で、どちらも `GET /api/notifications` で自分あての通知を読みます。
- 基本フロー 2 の「担当する店舗に関する通知」は、コードでは次のとおりです（`NotificationService.visibility()`）。
  - オーナーは、自分あての通知をすべて見ます。
  - 担当者（`SHOP_STAFF`）は、本人あて（`PERSONAL`）の通知と、今所属している店舗あて（`STORE`）の通知を見ます。所属にはロールのない店舗も含みます。店舗から外れると、その店舗あての通知は前に見えていたものも見えなくなります。
- 基本フロー 2 の通知の取得では、通知を読む前に、自分がオーナーか譲渡先の組織に期限切れのオーナーの譲渡の申し出がないかを調べ、あれば無効にして、履歴と「オーナーの譲渡の申し出が無効になりました」の通知を保存します（`PendingOwnerSuccession.expireIfDueFor()`）。GET の中で書き込みが起きます。
- オーナーの譲渡の申し出の通知には「重要」の印が付き、譲渡先が今承認できる申し出なら「承認する」「断る」ボタンも出ます（`POST /api/seller/owner-succession/approval`・`refusal`）。記述にはありません。
- 基本フロー 5 で「既読にする」を押すと、その通知に「既読」が出るほか、一覧の上に「保存しました。」も出ます。`Notices.jsx` が `run()` にメッセージを渡さず、`useResource.js` の既定のメッセージが使われるためです。
- 2a で、記述の「通知なしの状態」は、画面では「通知はありません。」です。
- 404 `NOTICE_NOT_FOUND`「通知が見つかりません。」は記述にありません。担当者が一覧を開いたあとで店舗から外されると、その店舗あての通知を既読にできず 404 になります。画面は 404 のとき一覧を取り直します。
- 関連情報の通知の一覧のほかに、次の通知も届きます。「店舗の担当から外れました」（本人あて）、オーナーの譲渡の申し出・承認・取り消し・断り・無効の通知。
- 関連情報の「通知は、組織のオーナーと、その店舗でロールを割り振られた担当者それぞれに届く」は、店舗あての通知（`NotificationService.toStore()`）の説明です。組織の受付停止・停止・再開の通知（`OrganizationSuspensionService.notifyOwner()`）は、オーナーだけに届きます。

## 参照したコード

- [frontend/src/workspace/Notices.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Notices.jsx): `Notices`、「通知はありません。」、「既読」と「既読にする」、`IMPORTANT_CATEGORIES`、`answerable` のボタン
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `noticeItem` の「出店者通知」、`path.endsWith('/notifications')` で `Notices` を表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`run()`（既定のメッセージ「保存しました。」）、`reload()`、`write()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java): `list()`、`read()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `list()`、`answerableRequest()`、`read()`、`visibility()`、`toStore()`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java): `findByMemberIdOrderByCreatedAtDesc()`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java): `PERSONAL`・`STORE`、通知の種類、`markRead()`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `expireIfDueFor()`、`expireIfDue()`、`invalidate()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findIdsWithExpiredOwnerSuccession()`、`existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreMemberRepository.java): `findAllForMember()`
- [backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java): オーナーの譲渡の通知の文面
- [backend/src/main/java/jp/kusakari/ec/store/service/StaffAccountService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StaffAccountService.java): 「店舗の担当から外れました」
- [backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OrganizationSuspensionService.java): `notifyOwner()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
