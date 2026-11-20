# EC-A03 出店申請を審査する

- ユースケース記述: [EC-A03_出店申請を審査する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A03_出店申請を審査する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 出店審査画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインならログインの画面を表示する)

    Note over User,Db: 基本フロー 1〜3 画面を開いて出店申請の一覧を表示する
    User->>Page: 運営者メニューの「出店審査」をクリック
    Page->>Api: GET /api/operator/applications
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 出店申請をすべて新しい順に読む
    Db-->>Api: organization_applications の行
    Api-->>Page: 200 申請の配列
    Page->>Page: 「表示する申請」は「審査中」なので、<br/>審査中の申請だけを申請日の古い順に並べる
    alt 3a 審査中の申請がない
        Page-->>User: 「審査待ちの出店申請はありません。」
    else 審査中の申請がある
        Page-->>User: 申請ごとに会社名、申請者、申請日、連絡先、<br/>出店審査状態、「提出書類を確認」、<br/>「却下理由」欄、「承認」「却下」
    end
    opt 3b 審査済みの申請も確認する
        User->>Page: 「表示する申請」で「すべて」を選ぶ
        Page-->>User: 審査中を古い順に、審査済みを新しい順に表示<br/>(審査済みには却下理由欄とボタンを出さない。通信しない)
    end

    Note over User,Db: 基本フロー 4〜5 提出書類をダウンロードする
    User->>Page: 「提出書類を確認」をクリック
    Page->>Api: GET /api/account/store-applications/{id}/document<br/>(a 要素のリンク。ブラウザーが直接送る)
    Api->>Db: 申請を読む
    Db-->>Api: 申請の行 (提出書類のデータを含む)、または行なし
    alt 申請がない (記述なし)
        Api-->>Page: 404 APPLICATION_NOT_FOUND
        Page-->>User: React の画面は応答を扱わない
    else 申請がある
        Api->>Api: ログイン中の会員が運営者か申請者本人かを検査
        Api-->>Page: 200 提出書類 (Content-Disposition は attachment)
        Page-->>User: ブラウザーが提出書類のファイルを<br/>端末にダウンロードする
    end

    Note over User,Db: 基本フロー 6〜9 承認か却下を選び、結果を保存して知らせる
    User->>Page: 「承認」をクリック、または<br/>「却下理由」を入力して「却下」をクリック
    alt 6a 却下で、却下理由が空
        Page-->>User: 「却下する場合は却下理由を入力してください。」<br/>(通信しない。基本フロー 6 へ戻る)
    else 送る
        Page->>Api: PUT /api/operator/applications/{id}<br/>(approved と reason)
        Note right of Page: PUT の前に GET /api/auth/csrf で<br/>CSRF トークンを取る (図では省略)
        Note right of Api: 審査の処理全体が<br/>1 つのトランザクション
        Api->>Api: 入力と、運営者かを検査
        Api->>Db: 申請の行をロック (SELECT ... FOR UPDATE)
        Db-->>Api: 申請の行、または行なし
        alt 申請がない (記述なし)
            Api-->>Page: 404 APPLICATION_NOT_FOUND
            Page->>Api: GET /api/operator/applications
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「申請が見つかりません。」と最新の一覧
        else 7a 申請が審査中ではない
            Api-->>Page: 409 APPLICATION_CHANGED
            Page->>Api: GET /api/operator/applications
            Api-->>Page: 200 最新の一覧
            Page-->>User: 「この申請は審査済みです。」と最新の一覧<br/>(7a-2 基本フロー 2 へ戻る)
        else 審査中
            Api->>Db: 申請者の会員の行をロック (SELECT ... FOR UPDATE)
            Db-->>Api: 会員の行
            alt 7c 承認で、申請者が利用停止中か退会済み、<br/>または出店申請用アカウントではない
                Api-->>Page: 409 MEMBER_CHANGED
                Page->>Api: GET /api/operator/applications
                Api-->>Page: 200 最新の一覧
                Page-->>User: 「申請者の利用状態が変わりました。」<br/>(申請は審査中のまま。基本フロー 6 へ戻る)
            else 7b 承認で、アカウントの切り替えか組織の作成で DB がエラーを返す
                Api->>Db: UPDATE members (出店者のオーナーへ)、<br/>INSERT organizations
                Db--xApi: エラー
                Note right of Api: トランザクションを巻き戻し、<br/>申請・会員・組織は処理前のまま
                Api-->>Page: 409 DATA_CHANGED<br/>または 503 DATABASE_UNAVAILABLE
                opt 409 のとき
                    Page->>Api: GET /api/operator/applications
                    Api-->>Page: 200 最新の一覧
                end
                Page-->>User: エラーメッセージ (7b-2 基本フロー 3 へ戻る)
            else 承認できる、または却下
                alt 承認
                    Api->>Db: UPDATE members (出店者のオーナーへ)、<br/>INSERT organizations (申請の会社名で)
                    Db-->>Api: 組織の id
                    Api->>Api: 申請を APPROVED にする
                else 却下
                    Api->>Api: 申請を REJECTED にし、却下理由を入れる
                end
                Api->>Api: 申請者あてのサイト内通知を作る
                Api->>Db: コミット (UPDATE organization_applications、<br/>INSERT notifications)
                Db-->>Api: 完了
                Api-->>Page: 200 申請
                Page->>Api: GET /api/operator/applications
                Api-->>Page: 200 最新の一覧
                Page-->>User: 「承認しました。申請者に審査結果を通知しました。」<br/>または「却下しました。申請者に却下理由を通知しました。」<br/>と最新の一覧
            end
        end
    end
```

## 詳細図 1 基本フロー 1〜3

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as ReviewPage<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Repo as StoreApplication<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。Workspace は未ログインなら AuthPanel を出し、<br/>API は未ログインの要求に 401 LOGIN_REQUIRED を返す (AuthConfiguration)

    Note over User,Db: 基本フロー 1〜3 画面を開いて出店申請の一覧を表示する
    User->>Work: 運営者メニューの「出店審査」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/applications') を呼ぶ。<br/>ADMIN でなければ「この画面を利用する<br/>権限がありません。」を出す
    Work->>Page: path が /operator/applications なので<br/>ReviewPage を表示 (products は false)
    Page->>Hook: useResource('/operator/applications')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/operator/applications')
    Http->>Ctrl: GET /api/operator/applications
    Ctrl->>Svc: all() が list(true)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: ADMIN でなければ ApiException(403, FORBIDDEN)。<br/>画面が ADMIN 以外にこの画面を出さないので、<br/>図では枝を省略
    Auth-->>Svc: 戻る
    Svc->>Repo: findAllByOrderByCreatedAtDesc()
    Repo->>Db: SELECT organization_applications<br/>ORDER BY created_at DESC
    Db-->>Repo: 全申請の行
    Repo-->>Svc: StoreApplicationEntity のリスト
    Svc-->>Ctrl: view() で作った Application のリスト<br/>(提出書類のデータは入れない)
    Ctrl-->>Http: 200 Application の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Page: scope の初期値は SUBMITTED。<br/>status が SUBMITTED の申請だけ残し、<br/>reviewOrder で createdAt の古い順に並べる
    alt 3a 残った申請がない
        Page-->>User: 「審査待ちの出店申請はありません。」
    else 審査中の申請がある
        Note right of Page: ApplicationRow ごとに表示する。<br/>状態は applicationLabels で SUBMITTED を「審査中」、<br/>APPROVED を「承認」、REJECTED を「却下」、<br/>WITHDRAWN を「取り下げ済み」にする
        Page-->>User: company、contact、申請日、email・address・phone、<br/>状態と reason、「提出書類を確認」、<br/>「却下理由」欄、「承認」「却下」
    end
    opt 3b 「表示する申請」で「すべて」を選ぶ
        User->>Page: 「表示する申請」で「すべて」を選ぶ
        Page->>Page: setScope('ALL')。reviewOrder で<br/>審査中を古い順、審査済みを新しい順に並べる
        Page-->>User: 審査済みの申請には「却下理由」欄と<br/>「承認」「却下」を出さない (通信しない)
    end
```

## 詳細図 2 基本フロー 4〜5

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Row as ApplicationRow<br/>OperatorPages.jsx
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Repo as StoreApplication<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 4〜5 提出書類をダウンロードする
    User->>Row: 「提出書類を確認」をクリック
    Note right of Row: href が /api/account/store-applications/{id}/document の<br/>a 要素。PageLink と api.js を通らず、<br/>ブラウザーがセッションの Cookie を付けて直接送る
    Row->>Ctrl: GET /api/account/store-applications/{id}/document
    Ctrl->>Svc: file() が document(id)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Repo: findById(id)
    Repo->>Db: SELECT organization_applications
    Db-->>Repo: 行 または 空
    Repo-->>Svc: Optional の StoreApplicationEntity
    alt 申請がない (記述なし)
        Svc--xErrs: throw ApiException(404, APPLICATION_NOT_FOUND)
        Errs-->>Row: business() が 404 と message を返す
        Row-->>User: React の画面は応答を扱わない
    else 申請がある
        Svc->>Auth: current()
        Auth-->>Svc: ログイン中の AuthMember
        Note right of Svc: isAdmin() が真なので通る。<br/>運営者でも申請者本人でもなければ 404
        Svc-->>Ctrl: Document(name, type, data)
        Ctrl-->>Row: 200 提出書類のバイト列<br/>Content-Disposition は attachment、<br/>X-Content-Type-Options は nosniff、<br/>Cache-Control は no-store
        Row-->>User: ブラウザーが提出書類のファイルを<br/>端末にダウンロードする
    end
```

## 詳細図 3 基本フロー 6〜9

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Row as ReviewPage・ApplicationRow<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreApplication<br/>Service
        participant AppRepo as StoreApplication<br/>Repository
        participant MemRepo as AuthMember<br/>Repository
        participant OrgRepo as Organization<br/>Repository
        participant Notice as Notification<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 6 承認か却下を選ぶ
    User->>Row: 「承認」をクリック、または<br/>「却下理由」を入力して「却下」をクリック
    Row->>Row: decide(approved)
    alt 6a 却下で reason.trim() が空
        Row->>Row: setMissing(true)
        Row-->>User: 「却下する場合は却下理由を入力してください。」<br/>(通信しない。基本フロー 6 へ戻る)
    else 送る
        Row->>Hook: run(action, message)
        Note right of Row: message は承認なら「承認しました。申請者に<br/>審査結果を通知しました。」、却下なら<br/>「却下しました。申請者に却下理由を通知しました。」
        Hook->>Http: write('/operator/applications/{id}',<br/>'PUT', { approved, reason })
        Note right of Http: auth.js の authFetch() が PUT の前に<br/>GET /api/auth/csrf で CSRF トークンを取る<br/>(図では省略)
        Http->>Ctrl: PUT /api/operator/applications/{id}
        Note right of Ctrl: @Valid が Decision を検査する。reason が null か<br/>500 文字を超えると invalid() が 400 INVALID_INPUT。<br/>画面の maxLength が 500 なので図では枝を省略
        Ctrl->>Svc: decide(id, approved, reason)
        Note over Svc,Db: 基本フロー 7 decide() 全体が 1 つのトランザクション (クラスの @Transactional)。<br/>最初に auth.requireAdmin() で運営者かを確かめる (AuthService は図では省略)
        Svc->>AppRepo: lock(id)
        AppRepo->>Db: SELECT ... FOR UPDATE organization_applications
        Db-->>AppRepo: 行 または 空
        AppRepo-->>Svc: Optional の StoreApplicationEntity
        alt 申請がない (記述なし)
            Svc--xErrs: throw ApiException(404, APPLICATION_NOT_FOUND)
            Errs-->>Http: business() が 404 と message を返す
            Http--xHook: readResponse() が throw ApiError(404)
            Hook->>Http: reload() 404 なので一覧を取り直す
            Http-->>Hook: 最新の一覧
            Hook-->>Row: run() が false を返す。resource.error
            Row-->>User: 「申請が見つかりません。」と最新の一覧
        else 7a status が SUBMITTED ではない
            Svc--xErrs: throw ApiException(409, APPLICATION_CHANGED)
            Errs-->>Http: business() が 409 と message を返す
            Http--xHook: readResponse() が throw ApiError(409)
            Hook->>Http: reload() 409 なので一覧を取り直す
            Http-->>Hook: 最新の一覧
            Hook-->>Row: run() が false を返す。resource.error
            Row-->>User: 「この申請は審査済みです。」と最新の一覧
        else 審査中
            Svc->>MemRepo: lockMember(a.getMemberId())
            MemRepo->>Db: SELECT ... FOR UPDATE members
            Db-->>MemRepo: 申請者の行
            MemRepo-->>Svc: AuthMember
            alt 7c 承認で、isEnabled() が偽か、<br/>accountType が SHOP_OWNER_APPLICANT ではない
                Svc--xErrs: throw ApiException(409, MEMBER_CHANGED)
                Errs-->>Http: business() が 409 と message を返す
                Http--xHook: readResponse() が throw ApiError(409)
                Hook->>Http: reload() 409 なので一覧を取り直す
                Http-->>Hook: 最新の一覧
                Hook-->>Row: run() が false を返す。resource.error
                Row-->>User: 「申請者の利用状態が変わりました。」<br/>(申請は審査中のまま)
            else 7b 承認で、flush() か saveAndFlush() で DB がエラーを返す
                Svc->>Svc: m.becomeOwner()
                Svc->>MemRepo: flush()
                MemRepo->>Db: UPDATE members (account_type を SHOP_OWNER に)
                Db-->>MemRepo: 結果
                MemRepo-->>Svc: 戻る
                Svc->>OrgRepo: saveAndFlush(new OrganizationEntity(company, memberId))
                OrgRepo->>Db: INSERT organizations
                Db--xOrgRepo: エラー
                OrgRepo--xErrs: DataIntegrityViolationException<br/>または DataAccessException
                Note over Svc,Db: flush() の UPDATE members で失敗したときも同じく例外になる。<br/>@Transactional が巻き戻し、申請・会員・組織は処理前のまま
                Errs-->>Http: conflict() が 409 DATA_CHANGED、<br/>または database() が 503 DATABASE_UNAVAILABLE
                Http--xHook: readResponse() が throw ApiError(409 か 503)
                opt 409 のとき
                    Hook->>Http: reload() で一覧を取り直す
                    Http-->>Hook: 最新の一覧
                end
                Hook-->>Row: run() が false を返す。resource.error
                Row-->>User: 「データが競合しました。最新の内容を確認してください。」<br/>または「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」
            else 承認できる、または却下
                alt 承認
                    Svc->>Svc: m.becomeOwner()
                    Svc->>MemRepo: flush()
                    MemRepo->>Db: UPDATE members (account_type を SHOP_OWNER に)
                    Db-->>MemRepo: 結果
                    MemRepo-->>Svc: 戻る
                    Svc->>OrgRepo: saveAndFlush(new OrganizationEntity(company, memberId))
                    OrgRepo->>Db: INSERT organizations
                    Db-->>OrgRepo: 組織の id
                    OrgRepo-->>Svc: OrganizationEntity
                    Svc->>Svc: a.approve(organization.getId())
                else 却下
                    Note right of Svc: reason.isBlank() なら 400 REASON_REQUIRED。<br/>画面の 6a が先に止めるので届かない
                    Svc->>Svc: a.reject(reason)
                end
                Note over Svc,Db: 基本フロー 8 申請者へサイト内通知を送る
                Svc->>Notice: send(memberId, GENERAL, タイトル, 本文)
                Note right of Notice: タイトルは「出店申請が承認されました」か<br/>「出店申請が却下されました」。<br/>本文は会社名と「 / 」と reason をつないだ文字列。<br/>NotificationRepository は図では省略
                Notice->>Db: 通知を保存 (INSERT notifications)
                Db-->>Notice: 結果
                Notice-->>Svc: 戻る
                Svc->>Db: decide() を抜けるとコミット<br/>(UPDATE organization_applications ほか)
                Db-->>Svc: 完了
                Svc-->>Ctrl: view(a) の Application
                Ctrl-->>Http: 200 Application
                Note over User,Db: 基本フロー 9 結果を表示し、一覧を取り直す
                Http-->>Hook: data
                Hook->>Http: reload() が request('/operator/applications')
                Note over Http,Db: 一覧の取得は詳細図 1 と同じ流れ (図では省略)
                Http-->>Hook: 最新の一覧
                Hook-->>Row: run() が true を返す。data と notice を更新
                Row-->>User: 「承認しました。申請者に審査結果を通知しました。」<br/>または「却下しました。申請者に却下理由を通知しました。」<br/>と最新の一覧
            end
        end
    end
```

## ユースケース記述との差

- 基本フロー 8: 通知の本文は、承認でも却下でも「会社名 / 却下理由欄の文字」です。承認でも「却下理由」欄に文字があればそのまま本文に入り、空なら「会社名 / 」になります。記述は「却下の場合は却下理由も通知に含める」だけです。また、通知には入力どおりの `reason` を入れ、申請の `rejection_reason` には前後の空白を除いた値を保存します。
- 6a: 画面の検査（`reason.trim()` が空）のほかに、サーバーにも `reason.isBlank()` の検査（400 `REASON_REQUIRED`「却下理由が必要です。」）があります。画面が先に止めるので、画面の操作では届きません。
- 7c: コードは、利用停止中・退会済み（`isEnabled()` が偽）のほか、申請者の種別が `SHOP_OWNER_APPLICANT` でなくなった場合も 409 `MEMBER_CHANGED` にします。また、却下では申請者の状態を確かめないため、利用停止中・退会済みの申請者の申請も却下でき、通知も保存します。
- 7b: コードに失敗を見分ける専用の処理はありません。DB の例外を `ApiErrors` が 409 `DATA_CHANGED`「データが競合しました。最新の内容を確認してください。」か、503 `DATABASE_UNAVAILABLE`「保存処理を完了できませんでした。時間をおいて再試行してください。」にします。記述の「エラーメッセージ」はこのどちらかです。409 のときは一覧を取り直し、503 のときは取り直しません。
- 審査の PUT と提出書類の GET は、申請が見つからないときに 404 `APPLICATION_NOT_FOUND`「申請が見つかりません。」を返します。記述にない分岐です。
- 3b: 「すべて」を選んで申請が 1 件もないときは「出店申請はありません。」を表示します。記述にない表示です。
- 基本フロー 4〜5: 「提出書類を確認」は api.js を通らない a 要素のリンクです。ダウンロードに失敗しても、出店審査画面にはメッセージを出しません。記述にはダウンロードの失敗が書かれていません。

## 確かめられなかったこと

- 7b の失敗を起こす具体的な条件（どの制約やどの障害で起きるか）は、コードから特定できませんでした。動かしても確かめていません。
- 提出書類の GET が 404 などで失敗したときに、ブラウザーが何を表示するかは確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `ReviewPage`、`reviewOrder`、`applicationLabels`、`ApplicationRow`、`decide`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `all`、`decide`、`Decision`、`file`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `list`、`decide`、`document`、`view`、`missing`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java): `approve`、`reject`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java): `findAllByOrderByCreatedAtDesc`、`lock`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `lockMember`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java): `becomeOwner`、`isEnabled`、`withdraw`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `saveAndFlush`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/OrganizationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/OrganizationEntity.java): コンストラクター（会社名とオーナー）
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`conflict`、`database`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `members`、`organizations`、`organization_applications`、`notifications`
