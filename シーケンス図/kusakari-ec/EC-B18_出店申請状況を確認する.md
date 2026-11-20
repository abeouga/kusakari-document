# EC-B18 出店申請状況を確認する

- ユースケース記述: [EC-B18_出店申請状況を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B18_出店申請状況を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 事業者
    participant Page as 出店申請状況画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 事前条件 EC-C01 でサイドバーを出すときに GET /api/account/store-applications で<br/>申請を取得済み。申請があるので、リンクは「出店申請状況」
    Note over User,Db: 基本フロー 1〜3 画面を開いて審査状況を表示する
    User->>Page: アカウントのメニュー「出店申請状況」を開く (EC-C01)
    Page->>Api: GET /api/account/store-applications
    Api->>Db: 自分の出店申請を新しい順に検索
    Db-->>Api: 申請の行 (今の申請と前回の申請)
    Api-->>Page: 200 申請の配列
    alt 申請がない (事前条件を満たさない)
        Page-->>User: 「出店申請」画面へ移る (EC-B17)
    else 3 最新の申請が審査中
        Page-->>User: 「審査状況：審査中」、申請日、申請内容、「提出書類を確認」、<br/>「審査結果は通知でお知らせします。」、「申請を取り下げる」
    else 3a 却下
        Page-->>User: 「審査状況：却下」、申請日、「却下理由」、申請内容、<br/>「提出書類を確認」、「再申請する」
    else 3b 取り下げ済み
        Page-->>User: 「審査状況：取り下げ済み」、申請日、申請内容、<br/>「提出書類を確認」、「再申請する」
    else 3c 承認
        Page-->>User: 「審査状況：承認」、申請日、申請内容、「提出書類を確認」、<br/>「承認されました。ページを再読み込みすると、…」
        Note right of User: 3c-2 ユースケースを終了する
    end
    Note over User,Db: 基本フロー 4 審査状況と申請内容を確認する
    User->>Page: 審査状況と申請内容を確認する
    Note right of Page: 「提出書類を確認」はリンクで、押すと<br/>GET /api/account/store-applications/{id}/document<br/>でファイルを受け取る (基本フローにないので図では省略)

    opt 3a-2・3b-2 却下か取り下げ済みで「再申請する」をクリック
        User->>Page: 「再申請する」をクリック
        Page->>Api: GET /api/account/store-applications
        Api-->>Page: 200 申請の配列
        Page-->>User: 前回の内容が入った「出店申請」画面<br/>(3a-3、3a-4 EC-B17 の基本フロー 2 へ)
    end

    opt 4a 審査中の申請を取り下げる
        User->>Page: 「申請を取り下げる」をクリック
        Page->>Api: PUT /api/account/store-applications/{id}/withdrawal
        Note right of Api: 取り下げの処理全体が<br/>1 つのトランザクション
        Api->>Db: 申請の行をロックして読む
        Db-->>Api: 申請の行
        alt 4b 取り下げる前に審査が終わっていた
            Api-->>Page: 409 APPLICATION_CHANGED
            Page->>Api: GET /api/account/store-applications
            Api-->>Page: 200 最新の申請
            Page-->>User: 「この申請は取り下げできません。」と最新の審査状況<br/>(4b-2 基本フロー 2 へ)
        else 取り下げられる
            Api->>Db: 申請を取り下げ済みにする
            Api-->>Page: 200 申請
            Page->>Api: GET /api/account/store-applications
            Api-->>Page: 200 最新の申請
            Page-->>User: 「申請を取り下げました。」、「審査状況：取り下げ済み」、<br/>「再申請する」(4a-3 代替フロー 3b へ)
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as ApplicationStatusPage<br/>StoreApplication.jsx
        participant App as ApplicationPage<br/>StoreApplication.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Repo as StoreApplication<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 事前条件 EC-C01 で Workspace の useResource('/account/store-applications') が申請を取得済み。<br/>applications.data が空でないので、サイドバーのリンクは「出店申請状況」
    Note over User,Db: 基本フロー 1〜3 画面を開いて審査状況を表示する
    User->>Work: サイドバーの「出店申請状況」をクリック (EC-C01)
    Work->>Page: path が /seller/application/status なので<br/>ApplicationStatusPage(accountType) を表示
    Note right of Page: SHOP_OWNER_APPLICANT 以外は path が null で通信しない。<br/>useApplicationRoute() が SHOP_OWNER・SHOP_STAFF を<br/>/seller/products へ移す
    Page->>Hook: useResource('/account/store-applications')
    Note right of Hook: useEffect が reload()<br/>を自動で実行する
    Hook->>Http: request('/account/store-applications')
    Http->>Ctrl: GET /api/account/store-applications
    Ctrl->>Svc: list(false)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Repo: findByMemberIdOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT organization_applications
    Db-->>Repo: 行 (今の申請と前回の申請)
    Repo-->>Svc: StoreApplicationEntity のリスト
    Svc-->>Ctrl: Application のリスト
    Ctrl-->>Http: 200 Application の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Page: latest = list[0] ?? null<br/>useApplicationRoute(accountType, latest, 'status')
    alt latest が null (事前条件を満たさない)
        Page->>Page: replacePath('/seller/application')
        Page-->>User: 「出店申請」画面 (EC-B17)
    else 3 latest.status が SUBMITTED
        Page-->>User: 「審査状況：審査中」、申請日、Summary、「提出書類を確認」、<br/>「審査結果は通知でお知らせします。」、「申請を取り下げる」
    else 3a REJECTED
        Page-->>User: 「審査状況：却下」、申請日、「却下理由：」と latest.reason、<br/>Summary、「提出書類を確認」、「再申請する」
    else 3b WITHDRAWN
        Page-->>User: 「審査状況：取り下げ済み」、申請日、Summary、<br/>「提出書類を確認」、「再申請する」
    else 3c APPROVED
        Page-->>User: 「審査状況：承認」、申請日、Summary、「提出書類を確認」、<br/>「承認されました。ページを再読み込みすると、…」
    end
    Note over User,Db: 基本フロー 4 審査状況と申請内容を確認する
    User->>Page: 審査状況と申請内容を確認する
    Note right of Page: 「提出書類を確認」は a 要素で、ブラウザーが<br/>GET /api/account/store-applications/{id}/document<br/>を開く (基本フローにないので図では省略)

    opt 3a-2・3b-2 canReapply(latest) で「再申請する」をクリック
        User->>Page: 「再申請する」をクリック
        Page->>Work: navigate('/seller/application')
        Work->>App: ApplicationPage(accountType) を表示
        App->>Hook: useResource('/account/store-applications')
        Hook->>Http: request('/account/store-applications')
        Http->>Ctrl: GET /api/account/store-applications
        Note over Ctrl,Db: 取得は基本フロー 2 と同じ流れ (図では省略)
        Ctrl-->>Http: 200 Application の配列
        Http-->>Hook: data
        Hook-->>App: resource.data
        App-->>User: ApplicationWizard(previous) が前回の内容の入った入力欄と<br/>「前回の申請内容を入力しています。…」を表示 (EC-B17 の基本フロー 2 へ)
    end

    opt 4a latest.status が SUBMITTED で「申請を取り下げる」をクリック
        User->>Page: 「申請を取り下げる」をクリック
        Page->>Hook: run(action, '申請を取り下げました。')
        Hook->>Http: write('/account/store-applications/{id}/withdrawal', 'PUT')
        Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
        Http->>Ctrl: PUT /api/account/store-applications/{id}/withdrawal
        Ctrl->>Svc: withdraw(id)
        Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
        Svc->>Repo: lock(id)
        Repo->>Db: SELECT ... FOR UPDATE (organization_applications)
        Db-->>Repo: 行
        Repo-->>Svc: Optional の StoreApplicationEntity
        Svc->>Auth: current()
        Auth-->>Svc: AuthMember
        Note right of Svc: 申請がないか、本人の申請でなければ<br/>404 APPLICATION_NOT_FOUND (図では省略)
        alt 4b isLatest() が偽か、status が SUBMITTED でない
            Svc--xErrs: throw ApiException(409, APPLICATION_CHANGED)
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので<br/>request('/account/store-applications') で取り直す
            Http-->>Hook: 最新の申請
            Hook-->>Page: run() が false を返す。resource.error
            Page-->>User: ResourceStatus が「この申請は取り下げできません。」、<br/>最新の審査状況 (基本フロー 2 へ)
        else 取り下げられる
            Svc->>Svc: a.withdraw() で status を WITHDRAWN にする
            Svc->>Db: コミット時に UPDATE organization_applications
            Svc-->>Ctrl: Application
            Ctrl-->>Http: 200 Application
            Http-->>Hook: data
            Hook->>Http: reload()<br/>request('/account/store-applications')
            Note over Http,Db: 取得は基本フロー 2 と同じ流れ (図では省略)
            Http-->>Hook: 最新の申請 (WITHDRAWN)
            Hook-->>Page: run() が true を返す。data と notice を更新
            Page-->>User: 「申請を取り下げました。」、「審査状況：取り下げ済み」、<br/>「再申請する」(代替フロー 3b へ)
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## ユースケース記述との差

- 「申請日」「申請内容」「提出書類を確認」は、審査中だけでなく、却下・取り下げ済み・承認のときも表示します（`ApplicationStatusPage` で状態の条件の外にあるため）。記述の 3a・3b には「申請日」と「提出書類を確認」がなく、3c には審査状況とメッセージしかありません。
- 申請を取り下げても、通知は送りません。サイドバーの申請の一覧も取り直しません（リンクは「出店申請状況」のままです）。
- 4b の 409 は、申請が「今の申請」でない場合（`isLatest()` が偽）にも返します。記述は審査が終わった場合だけを書いています。
- 404 `APPLICATION_NOT_FOUND`「申請が見つかりません。」は記述にありません。画面は自分の最新の申請の ID を送るので、画面の操作ではふつう起きません。
- 関連情報の「未ログインならログイン画面へ」は、URL を変えずに、その場でログインの欄（`AuthPanel`）を表示します（`Workspace.jsx`）。

## 参照したコード

- [frontend/src/workspace/StoreApplication.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/StoreApplication.jsx): `ApplicationStatusPage`、`ApplicationPage`、`useApplicationRoute()`、`canReapply()`、`statusLabels`
- [frontend/src/workspace/ApplicationWizard.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ApplicationWizard.jsx): `Summary`、`ApplicationWizard` の `previous`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): サイドバーの `applicationLink`、`ApplicationStatusPage` の表示、未ログインの `AuthPanel`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`run()`、`reload()`、`write()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `mine()`、`withdraw()`、`file()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `list()`、`withdraw()`、`document()`、`missing()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java): `findByMemberIdOrderByCreatedAtDesc()`、`lock()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java): `withdraw()`、`isLatest()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
