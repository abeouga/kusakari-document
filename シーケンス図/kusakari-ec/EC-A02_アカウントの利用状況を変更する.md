# EC-A02 アカウントの利用状況を変更する

- ユースケース記述: [EC-A02_アカウントの利用状況を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A02_アカウントの利用状況を変更する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 会員管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインならログインの画面を表示する)

    Note over User,Db: 基本フロー 1〜2 画面を開いて会員の一覧と利用状態を表示する
    User->>Page: 運営者メニューの「会員管理」をクリック
    Page->>Api: GET /api/operator/members
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 会員をすべて読み、オーナーと担当者は<br/>操作できる店舗も読む
    Db-->>Api: 会員・組織・店舗の行
    Api-->>Page: 200 会員の配列
    Page-->>User: 会員の一覧と利用状態、<br/>「利用を停止」か「利用を再開」のどちらか

    Note over User,Db: 基本フロー 3〜4 ボタンを押して確認ダイアログを開く (通信しない)
    User->>Page: 「利用を停止」または「利用を再開」をクリック
    Page-->>User: 「利用状況変更の確認」ダイアログ<br/>対象の氏名とメールアドレス、変更内容

    alt 5a 確定を取り消した
        User->>Page: 「取消」をクリック
        Page-->>User: ダイアログを閉じた一覧<br/>(通信せず、利用状態は変わらない)
    else 確定した
        Note over User,Db: 基本フロー 5〜6 確定して利用状態を更新する
        User->>Page: 「利用停止を確定」または<br/>「利用再開を確定」をクリック
        Page->>Api: PUT /api/operator/members/{id}/enabled
        Note right of Page: PUT の前に GET /api/auth/csrf で<br/>CSRF トークンを取る (図では省略)
        Note right of Api: 更新の処理全体が<br/>1 つのトランザクション
        Api->>Api: ログイン中の会員が運営者かを検査
        opt 停止するとき
            Api->>Db: 対象の会員が属する組織の行をロック<br/>(SELECT ... FOR UPDATE)
            Db-->>Api: 組織の行、または組織なし
        end
        Api->>Db: 対象の会員の行をロック<br/>(SELECT ... FOR UPDATE)
        Db-->>Api: 会員の行、または行なし
        alt 会員がいない (記述なし)
            Api-->>Page: 404 MEMBER_NOT_FOUND
            Page->>Api: GET /api/operator/members
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「会員が見つかりません。」と最新の一覧
        else 6a 対象が運営者アカウントか退会済み
            Api-->>Page: 409 MEMBER_FIXED
            Page->>Api: GET /api/operator/members
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「管理者または退会済み会員の状態は<br/>変更できません。」と最新の一覧
            Note right of User: 6a-2 ユースケースを終了する
        else 変更できる
            Api->>Api: 会員の enabled を変える
            opt 停止で、対象が組織に属する (記述なし)
                Api->>Api: オーナーの譲渡の承認待ちの当事者なら、<br/>申し出を無効にし、履歴と<br/>オーナー・譲渡先あての通知を作る
            end
            Api->>Db: コミット (UPDATE members ほか)
            Db-->>Api: 完了
            Api-->>Page: 200 enabled
            Page->>Api: GET /api/operator/members
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「利用を停止しました。」または<br/>「利用を再開しました。」と更新後の利用状態
        end
    end
```

## 詳細図 1 基本フロー 1〜2

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as MembersPage<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as MemberController
        participant Svc as MemberService
        participant Auth as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。Workspace は未ログインなら AuthPanel を出し、<br/>API は未ログインの要求に 401 LOGIN_REQUIRED を返す (AuthConfiguration)

    Note over User,Db: 基本フロー 1〜2 画面を開いて会員の一覧と利用状態を表示する
    User->>Work: 運営者メニューの「会員管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/members') を呼ぶ。<br/>ADMIN でなければ「この画面を利用する<br/>権限がありません。」を出す
    Work->>Page: path が /operator/members なので<br/>MembersPage を表示
    Page->>Hook: useResource('/operator/members')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/operator/members')
    Http->>Ctrl: GET /api/operator/members
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: ADMIN でなければ ApiException(403, FORBIDDEN)。<br/>画面が ADMIN 以外にこの画面を出さないので、<br/>図では枝を省略
    Auth-->>Svc: 戻る
    Svc->>Repo: findAll()
    Repo->>Db: SELECT members
    Db-->>Repo: 全会員の行
    Repo-->>Svc: AuthMember のリスト
    loop 会員ごと
        Svc->>Auth: storeIdsOf(m)
        Note right of Auth: オーナーと担当者だけ店舗を読む。<br/>読む Repository は図では省略
        Auth-->>Svc: 店舗 ID のリスト
    end
    Svc-->>Ctrl: Member のリスト
    Ctrl-->>Http: 200 Member の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Note right of Page: withdrawnAt があれば「退会済み」、<br/>enabled が真なら「利用中」、偽なら「利用停止」。<br/>ボタンは enabled が真なら「利用を停止」、<br/>偽なら「利用を再開」だけを出す
    Page-->>User: 会員の一覧、利用状態、ボタン
```

## 詳細図 2 基本フロー 3〜6

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as MembersPage<br/>OperatorPages.jsx
        participant Dlg as ConfirmDialog.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as MemberController
        participant Errs as ApiErrors
        participant Svc as MemberService
        participant Auth as AuthService
        participant Pend as PendingOwner<br/>Succession
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 3〜4 ボタンを押して確認ダイアログを開く (通信しない)
    User->>Page: 「利用を停止」または「利用を再開」をクリック
    Note right of Page: 運営者と退会済みの会員にもボタンを出す。<br/>6a はサーバーが止める
    Page->>Page: setTarget(m)
    Page->>Dlg: ConfirmDialog を表示<br/>(title は「利用状況変更の確認」)
    Dlg-->>User: 対象の name と email、変更内容、<br/>「利用停止を確定」か「利用再開を確定」、「取消」

    alt 5a 確定を取り消した
        User->>Dlg: 「取消」をクリック
        Note right of Dlg: Dialog.jsx の Esc キー、「閉じる」ボタン、<br/>ダイアログの外側のクリックも onCancel を呼ぶ
        Dlg->>Page: onCancel()
        Page->>Page: setTarget(null)
        Page-->>User: ダイアログを閉じた一覧 (通信しない)
    else 確定した
        Note over User,Db: 基本フロー 5〜6 確定して利用状態を更新する
        User->>Dlg: 「利用停止を確定」または「利用再開を確定」をクリック
        Dlg->>Page: onConfirm() が change() を呼ぶ
        Page->>Hook: run(action, message)
        Note right of Page: message は target.enabled が真なら<br/>「利用を停止しました。」、偽なら<br/>「利用を再開しました。」
        Hook->>Http: write('/operator/members/{id}/enabled',<br/>'PUT', { enabled: !target.enabled })
        Note right of Http: auth.js の authFetch() が PUT の前に<br/>GET /api/auth/csrf で CSRF トークンを取る<br/>(図では省略)
        Http->>Ctrl: PUT /api/operator/members/{id}/enabled
        Ctrl->>Svc: enable(id, enabled)
        Note over Svc,Db: enable() 全体が 1 つのトランザクション (クラスの @Transactional)
        Svc->>Auth: requireAdmin()
        Auth-->>Svc: 戻る
        opt 停止するとき (enabled が偽)
            Svc->>Pend: lockOrganizationOf(id)
            Note right of Pend: 会員がオーナーか担当者として属する組織を探す。<br/>読む Repository は図では省略
            Pend->>Db: 組織があれば SELECT ... FOR UPDATE organizations<br/>(entityManager.refresh)
            Db-->>Pend: ロックした組織の行
            Pend-->>Svc: Optional の OrganizationEntity
        end
        Note right of Svc: ロックは「組織 → 会員」の順にする
        Svc->>Repo: lockMember(id) の中で findById(id)
        Repo->>Db: SELECT members
        Db-->>Repo: 行 または 空
        Repo-->>Svc: Optional の AuthMember
        opt 会員がいる
            Svc->>Db: SELECT ... FOR UPDATE members<br/>(entityManager.refresh で読み直す)
            Db-->>Svc: ロックした会員の行
        end
        alt 会員がいない (記述なし)
            Svc--xErrs: throw ApiException(404, MEMBER_NOT_FOUND)
            Errs-->>Http: business() が 404 と message を返す
            Http--xHook: readResponse() が throw ApiError(404)
            Hook->>Http: reload() 404 なので一覧を取り直す
            Http-->>Hook: 最新の一覧
            Hook-->>Page: run() が false を返す。resource.error
            Page->>Page: setTarget(null)
            Page-->>User: 「会員が見つかりません。」と最新の一覧
        else 6a isAdmin() が真か withdrawnAt がある
            Svc--xErrs: throw ApiException(409, MEMBER_FIXED)
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので一覧を取り直す
            Http-->>Hook: 最新の一覧
            Hook-->>Page: run() が false を返す。resource.error
            Page->>Page: setTarget(null)
            Page-->>User: 「管理者または退会済み会員の状態は<br/>変更できません。」と最新の一覧
        else 変更できる
            Svc->>Svc: m.changeEnabled(enabled)
            opt 停止で、組織をロックした
                Svc->>Pend: invalidateFor(locked, id, SUCCESSOR_DISABLED)
                Pend-->>Svc: 戻る
                Svc->>Pend: invalidateForOwner(locked, id, OWNER_DISABLED)
                Pend-->>Svc: 戻る
                Note right of Pend: 承認待ちの譲渡先か、申し出たオーナー本人なら、<br/>invalidate() が承認待ちを空にし、<br/>organization_member_events に記録し、<br/>OwnerSuccessionNotices でオーナーと譲渡先へ<br/>通知を作る。当事者でなければ何もしない
            end
            Note over Svc,Db: save は呼ばない。enable() を抜けるとコミットし、<br/>変更した Entity を保存する
            Svc->>Db: コミット (UPDATE members ほか)
            Db-->>Svc: 完了
            Svc-->>Ctrl: 戻る (void)
            Ctrl-->>Http: 200 { enabled }
            Http-->>Hook: data
            Hook->>Http: reload() が request('/operator/members')
            Note over Http,Db: 一覧の取得は詳細図 1 と同じ流れ (図では省略)
            Http-->>Hook: 最新の一覧
            Hook-->>Page: run() が true を返す。data と notice を更新
            Page->>Page: setTarget(null)
            Page-->>User: 「利用を停止しました。」または<br/>「利用を再開しました。」と更新後の利用状態
        end
    end
```

## ユースケース記述との差

- 関連情報「対象者への通知は送らない」: 停止する会員が、オーナーの譲渡の承認待ちの当事者（譲渡先か、申し出たオーナー本人）なら、同じトランザクションで申し出を無効にします。`organization_member_events` に記録し、オーナーと譲渡先の両方へ「オーナーの譲渡の申し出が無効になりました」の通知を保存します（`PendingOwnerSuccession`、`OwnerSuccessionNotices`）。このときは停止した本人あてにも通知が残ります。記述にない処理です。
- 基本フロー 6: 停止するときは、会員の行より先に、会員が属する組織の行をロックします（「組織 → 会員」の順）。記述にない処理です。
- 対象の会員が見つからないときは 404 `MEMBER_NOT_FOUND`「会員が見つかりません。」を返し、画面は一覧を取り直します。記述にない分岐です。
- 5a: 記述は「取消」ボタンだけです。コードでは Esc キー、ダイアログの「閉じる」ボタン、ダイアログの外側のクリックでも、`onCancel` を呼んで同じように閉じます（`Dialog.jsx`、`ConfirmDialog.jsx`）。
- 関連情報「利用停止中のアカウントはログインできない」: ログイン中の会員を停止すると、その会員の次の要求で `SessionValidityFilter` が `AuthService.current()` の 403 `ACCOUNT_DISABLED` を返し、セッションを無効にします。ログイン中のセッションも止まることは記述にありません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `MembersPage`（`setTarget`、`change`、ダイアログの文言）
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ConfirmDialog.jsx): `ConfirmDialog`（`onConfirm`、`onCancel`）
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): `Dialog`（`onCancel`、外側のクリック、「閉じる」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `list`、`enabled`、`EnabledRequest`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `list`、`enable`、`lockMember`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `lockOrganizationOf`、`lock`、`invalidateFor`、`invalidateForOwner`、`invalidate`
- [backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java): `invalidated`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java): `changeEnabled`、`isAdmin`、`withdraw`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findAll`、`findById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`
