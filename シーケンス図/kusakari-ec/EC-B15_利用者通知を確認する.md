# EC-B15 利用者通知を確認する

- ユースケース記述: [EC-B15_利用者通知を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B15_利用者通知を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 通知一覧画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて通知を表示する
    User->>Page: アカウントのメニュー「通知一覧」を開く (EC-C01)
    Page->>Api: GET /api/notifications
    Note right of Api: 一覧の処理全体が<br/>1 つのトランザクション
    Api->>Db: 自分が関わる、期限切れの<br/>オーナーの譲渡の申し出を探す
    Db-->>Api: 組織 (購入者は 0 件)
    Api->>Db: 自分あての通知を新しい順に検索
    Db-->>Api: 通知の行
    Api->>Db: 自分あての期限内の譲渡の申し出があるか調べる
    Db-->>Api: なし (購入者)
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
        alt 自分の通知が見つからない (ユースケース未記載)
            Api-->>Page: 404 NOTICE_NOT_FOUND
            Page->>Api: GET /api/notifications
            Api-->>Page: 200 最新の通知
            Page-->>User: 「通知が見つかりません。」と最新の通知
        else 既読にできる
            Api->>Db: 既読の日時を保存する
            Api-->>Page: 200 read=true
            Page->>Api: GET /api/notifications
            Api-->>Page: 200 最新の通知
            Page-->>User: 「保存しました。」、その通知に「既読」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
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
        participant Pend as PendingOwner<br/>Succession
        participant Org as Organization<br/>Repository
        participant Repo as Notification<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 1〜2 画面を開いて通知を表示する
    User->>Page: アカウントのメニュー「通知一覧」をクリック (EC-C01)
    Note right of User: Workspace.jsx が path の末尾<br/>/notifications を見て Notices を表示する<br/>(Workspace のライフラインは図では省略)
    Page->>Hook: useResource('/notifications')
    Note right of Hook: useEffect が reload()<br/>を自動で実行する
    Hook->>Http: request('/notifications')
    Http->>Ctrl: GET /api/notifications
    Ctrl->>Svc: list()
    Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Pend: expireIfDueFor(memberId)
    Pend->>Org: findIdsWithExpiredOwnerSuccession(memberId, now)
    Org->>Db: SELECT organizations
    Db-->>Org: 行
    Org-->>Pend: 組織 ID のリスト (購入者は空)
    Note right of Pend: 空なので何もしない。<br/>申し出を無効にする処理は図では省略
    Pend-->>Svc: 戻る (void)
    Svc->>Svc: visibility(member)<br/>SHOP_STAFF 以外はすべて見える
    Svc->>Repo: findByMemberIdOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT notifications
    Db-->>Repo: 行
    Repo-->>Svc: NotificationEntity のリスト
    Svc->>Org: existsByPendingOwnerMemberId<br/>AndPendingOwnerExpiresAtAfter(memberId, now)
    Org->>Db: SELECT organizations
    Db-->>Org: 行 または 空
    Org-->>Svc: false (購入者あての申し出はない)
    Svc-->>Ctrl: Notice のリスト (answerable はすべて false)
    Ctrl-->>Http: 200 Notice の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    alt 2a resource.data が空の配列
        Page-->>User: 「通知はありません。」
    else 通知がある
        Page-->>User: 通知ごとに title、body、createdAt<br/>readAt があれば「既読」、なければ「既読にする」ボタン
        Note over User,Db: 基本フロー 3〜5 確認して、必要なら既読にする
        User->>Page: 未読の通知の「既読にする」をクリック
        Page->>Hook: run(action)
        Hook->>Http: write('/notifications/{id}/read', 'PUT')
        Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
        Http->>Ctrl: PUT /api/notifications/{id}/read
        Ctrl->>Svc: read(id)
        Note over Svc,Db: read() もクラスの @Transactional で 1 つのトランザクション
        Svc->>Auth: current()
        Auth-->>Svc: AuthMember
        Svc->>Repo: findById(id)
        Repo->>Db: SELECT notifications
        Db-->>Repo: 行 または 空
        Repo-->>Svc: Optional の NotificationEntity
        Svc->>Svc: 本人あてか、visibility(member) で<br/>見えるかで絞る
        alt 見つからない (ユースケース未記載)
            Svc--xErrs: throw ApiException(404,<br/>NOTICE_NOT_FOUND)
            Errs-->>Http: business() が 404 と message を返す
            Http--xHook: readResponse() が throw ApiError(404)
            Hook->>Http: reload() 404 なので<br/>request('/notifications') で取り直す
            Http-->>Hook: 最新の通知
            Hook-->>Page: run() が false を返す。resource.error
            Page-->>User: ResourceStatus が「通知が見つかりません。」、最新の通知
        else 見つかった
            Svc->>Svc: n.markRead()<br/>readAt が空なら今の日時を入れる
            Svc->>Db: コミット時に UPDATE notifications
            Svc-->>Ctrl: 戻る (void)
            Ctrl-->>Http: 200 read=true
            Http-->>Hook: data
            Hook->>Http: reload()<br/>request('/notifications')
            Note over Http,Db: 取得は基本フロー 2 と同じ流れ (図では省略)
            Http-->>Hook: 最新の通知
            Hook-->>Page: run() が true を返す。<br/>data と notice (既定の「保存しました。」) を更新
            Page-->>User: 「保存しました。」、その通知に「既読」
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## ユースケース記述との差

- 基本フロー 5 で「既読にする」を押すと、その通知に「既読」が出るほか、一覧の上に「保存しました。」も出ます。`Notices.jsx` が `run()` にメッセージを渡しておらず、`useResource.js` の `run()` の既定のメッセージが使われるためです。記述には「保存しました。」がありません。
- 基本フロー 2 の通知の取得では、通知を読む前に、自分がオーナーか譲渡先の組織に期限切れのオーナーの譲渡の申し出がないかを調べ、あれば無効にします（`PendingOwnerSuccession.expireIfDueFor()`）。購入者は組織に属さないので、何も変わりません。
- 「通知一覧」の画面（`Notices`）は出店者通知（`/seller/notifications`）と共用です。オーナーの譲渡の申し出の通知には「重要」の印と「承認する」「断る」ボタンが出ますが、購入者には届かない種類の通知なので、記述にはありません。
- 404 `NOTICE_NOT_FOUND`「通知が見つかりません。」は記述にありません。画面は自分の一覧にある通知の ID を送り、購入者は自分あての通知がすべて見えるので（`visibility()`）、購入者の画面の操作ではふつう起きません。通知を消す処理はコードに見つかりませんでした。

## 参照したコード

- [frontend/src/workspace/Notices.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Notices.jsx): `Notices`、「通知はありません。」、「既読」と「既読にする」の表示
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `buyerMenu` の「通知一覧」、`path.endsWith('/notifications')` で `Notices` を表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`run()`（既定のメッセージ「保存しました。」）、`reload()`、`write()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/controller/NotificationController.java): `list()`、`read()`
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `list()`、`answerableRequest()`、`read()`、`visibility()`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/persistence/repository/NotificationRepository.java): `findByMemberIdOrderByCreatedAtDesc()`
- [backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/persistence/entity/NotificationEntity.java): `markRead()`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `expireIfDueFor()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findIdsWithExpiredOwnerSuccession()`、`existsByPendingOwnerMemberIdAndPendingOwnerExpiresAtAfter()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
