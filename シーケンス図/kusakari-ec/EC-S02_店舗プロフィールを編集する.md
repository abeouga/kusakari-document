# EC-S02 店舗プロフィールを編集する

- ユースケース記述: [EC-S02_店舗プロフィールを編集する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S02_店舗プロフィールを編集する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 店舗プロフィール画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a、*b を適用 (00_全ユースケース共通の代替フロー を参照)

    Note over User,Db: 基本フロー 1 「店舗プロフィール」画面を開く
    alt 1b 「店舗一覧」から開く
        User->>Page: 「店舗一覧」画面で対象店舗の<br/>「店舗情報を編集」をクリック
        Note right of Page: その店舗を管理する店舗にして<br/>/seller/profile へ移る。通信しない
    else メニューから開く
        User->>Page: 出店者画面のメニュー<br/>「店舗プロフィール」をクリック (EC-C03)
    end

    Note over User,Db: 基本フロー 2 現在のプロフィールを表示する
    Page->>Api: GET /api/stores/{id}
    Api->>Db: 店舗の行を読む (stores)
    Api->>Db: 会員と、店舗を扱える立場かを読む
    Api->>Db: 会社名を読む (organizations)
    Api->>Db: 今出ている警告を読む (store_moderation_events)
    Db-->>Api: 行
    Api-->>Page: 200 店舗プロフィール<br/>(revision、company、warning を含む)
    Page-->>User: 会社名、6 つの入力欄、「店舗情報を保存」<br/>警告があれば「警告中」と理由

    opt 1a 複数の店舗を扱う (店舗が 2 つ以上なら上部に選択欄が出る)
        User->>Page: 「管理する店舗」の選択欄で店舗を選ぶ
        Page->>Api: GET /api/stores/{選んだ店舗の id}
        Api->>Db: 基本フロー 2 と同じく読む
        Db-->>Api: 行
        Api-->>Page: 200 店舗プロフィール
        Page-->>User: 選んだ店舗のプロフィール
    end

    Note over User,Db: 基本フロー 3〜4 入力欄を編集して「店舗情報を保存」をクリックする
    User->>Page: 入力欄を編集し「店舗情報を保存」をクリック
    Note right of Page: 5a のうち、店舗名・所在地・営業時間が空なら<br/>ブラウザーが送信を止める。文字数の上限を<br/>超えては入力できない。どちらも通信しない
    Note over Page,Api: 書き込みの前に GET /api/auth/csrf を送る。図では省略
    Page->>Api: PUT /api/seller/stores/{id}<br/>6 項目と、表示したときの revision

    Note over User,Db: 基本フロー 5 入力内容を検証する
    Api->>Api: 入力を検査 (@NotBlank、@Size、@Email)
    alt 5a 入力が不正 (空白だけ、メールの形が違う、文字数の超過)
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Api->>Db: 会員と、店舗での立場を読む
        Db-->>Api: 行
        alt 6b 権限がない (STAFF、ロールなし、運営が停止した店舗、<br/>閉鎖済みで担当から外れた MANAGER)
            Api-->>Page: 403 FORBIDDEN
            Page-->>User: 「この操作の権限がありません。」
        else オーナーか MANAGER
            Api->>Db: 店舗の行を読む (stores)
            Db-->>Api: 行
            alt 6c 閉鎖済み (closed_at がある)
                Api-->>Page: 409 STORE_CLOSED
                Page->>Api: GET /api/stores/{id}
                Api-->>Page: 200 最新のプロフィール
                Page-->>User: 「この店舗は閉鎖済みです。」
            else 6a 表示した後にほかの人が更新した (revision が違う)
                Api-->>Page: 409 STORE_CHANGED
                Page->>Api: GET /api/stores/{id}
                Api-->>Page: 200 最新のプロフィール
                Page-->>User: 「店舗情報が更新されています。」<br/>最新のプロフィールを入力欄に表示
            else revision が同じ
                opt 店舗名を変えた
                    Api->>Db: 同じ組織に同じ店舗名があるか読む
                    Db-->>Api: あり か なし
                end
                alt 同じ組織に同じ店舗名がある (記述にない)
                    Api-->>Page: 409 STORE_NAME_EXISTS
                    Page->>Api: GET /api/stores/{id}
                    Api-->>Page: 200 最新のプロフィール
                    Page-->>User: 「同じ名前の店舗がすでにあります。」<br/>入力欄はそのまま
                else 基本フロー 6 保存できる
                    Api->>Db: 店舗の行を更新し、revision を 1 増やす<br/>(UPDATE stores ... WHERE revision = 読んだ値)
                    Api->>Db: 会社名を読む (organizations)
                    Db-->>Api: OK
                    Api-->>Page: 200 保存後のプロフィール
                    Page->>Api: GET /api/stores/{id}
                    Api-->>Page: 200 最新のプロフィール
                    Page-->>User: 「保存しました。」、保存した内容の入力欄
                end
            end
        end
    end
```

## 詳細図 1 基本フロー 1（代替フロー 1a、1b）

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Menu as PageLink<br/>Common.jsx
        participant Stores as SellerStoresPage<br/>SellerStores.jsx
        participant Select as SellerStoreSelect.jsx
        participant Shop as useShop.js
        participant Nav as navigation.js
        participant App as App.jsx
        participant Work as Workspace.jsx
        participant Page as ProfilePage<br/>PartnerForms.jsx
    end

    Note over User,Page: 共通代替フロー *a、*b を適用。図では省略
    Note over Shop,App: 管理できる店舗の一覧 shop.sellerStores は、useShop() の<br/>reloadSellerStores() が GET /api/seller/stores で取得済み。図では省略

    Note over User,Page: 基本フロー 1 「店舗プロフィール」画面を開く
    alt 1b 「店舗一覧」から開く
        User->>Stores: 対象店舗の「店舗情報を編集」をクリック
        Note right of Stores: 閉鎖済み (closedAt あり) の店舗には<br/>このボタンを出さない
        Stores->>Shop: edit(store) が setSellerStoreId(store.id)
        Shop->>Shop: chosenSellerStoreId を更新し、<br/>localStorage に保存
        Stores->>Nav: navigate('/seller/profile')
    else メニューから開く
        User->>Menu: サイドバーの「店舗プロフィール」をクリック<br/>(WorkspaceSidebar.jsx の MenuLink)
        Menu->>Nav: follow() が navigate('/seller/profile')
    end
    Nav->>App: pushState と popstate。<br/>usePath() が path を更新する
    App->>Work: Workspace に shop と path を渡す
    Work->>Work: canSell(session) と、選んだ店舗の<br/>memberRole を確かめる
    Note right of Work: 店舗の読み込み中、管理できる店舗が無いとき、<br/>ロールのない ORG_ADMIN の店舗では、<br/>案内の文を出す。図では省略
    Work->>Page: path が /seller/profile なので<br/>ProfilePage key={storeId} を表示
    Note over Page: 基本フロー 2 の通信は詳細図 2

    opt 1a 複数の店舗を扱う (shop.sellerStores が 2 つ以上)
        Work-->>User: 画面上部に「管理する店舗」の選択欄
        User->>Select: 選択欄で店舗を選ぶ
        Select->>Shop: onChange が setSellerStoreId(id)
        Shop-->>App: sellerStoreId が変わり、App が再描画する
        App->>Work: 新しい shop を渡す
        Work->>Page: key={storeId} が変わるので<br/>ProfilePage を作り直す
        Note over Page: 新しい storeId で基本フロー 2 へ (詳細図 2)
    end
```

## 詳細図 2 基本フロー 2

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as ProfilePage<br/>PartnerForms.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Store<br/>Controller
        participant Svc as StoreService
        participant Auth as AuthService
        participant Mod as StoreModeration<br/>Service
        participant Repo as Store<br/>Repository
        participant Org as Organization<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: どの要求も、ログイン中なら SessionValidityFilter が会員を確かめる。図では省略

    Note over User,Db: 基本フロー 2 現在のプロフィールを表示する
    Page->>Hook: useResource('/stores/' + storeId)
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/stores/{storeId}')
    Http->>Ctrl: GET /api/stores/{id}
    Ctrl->>Svc: get(id)
    Note over Svc,Db: @Transactional(readOnly = true)
    Svc->>Repo: require(id) の findById(id)
    Repo->>Db: SELECT stores
    Db-->>Repo: 行
    Repo-->>Svc: StoreEntity
    Svc->>Auth: canViewAsStaff(store)
    Note right of Auth: current() で会員を読み、canManageView() で<br/>オーナーの組織か、店舗の担当 (store_members)<br/>かを読む。図では省略
    Auth-->>Svc: true
    Svc->>Svc: publiclyVisible(store)
    Note right of Svc: 運営が停止した店舗は canManageView() が false で、<br/>公開もされていないので 404 STORE_NOT_FOUND。図では省略
    Svc->>Org: view(store) の findById(organizationId)
    Org->>Db: SELECT organizations
    Db-->>Org: 行
    Org-->>Svc: OrganizationEntity (会社名)
    Svc->>Mod: warnings(List.of(id))
    Mod->>Db: findByStoreIdInAndEventTypeInOrderByIdDesc()<br/>SELECT store_moderation_events
    Db-->>Mod: 行
    Mod-->>Svc: 店舗ごとの今の警告
    Svc->>Svc: withWarning(view(store), warning)
    Svc-->>Ctrl: Profile
    Ctrl-->>Http: 200 Profile (revision、company、name、contact、<br/>email、address、hours、story、warning)
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page-->>User: WarningBadge (警告があれば「警告中」と<br/>「運営からの警告：理由」)、「会社名：…」、<br/>6 つの入力欄、「店舗情報を保存」
```

## 詳細図 3 基本フロー 3〜6

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as ProfilePage<br/>PartnerForms.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Store<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreService
        participant Auth as AuthService
        participant Repo as Store<br/>Repository
        participant Org as Organization<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 3〜4 入力欄を編集して「店舗情報を保存」をクリックする
    User->>Page: 入力欄を編集し「店舗情報を保存」をクリック
    Note right of Page: 5a のうち空の必須項目は、Input の required で<br/>ブラウザーが送信を止める。文字数は maxLength で<br/>超えて入力できない。save() は呼ばれない
    Page->>Page: onSubmit の save(event)。<br/>values(form) で 6 項目を集める
    Page->>Hook: run(action)
    Hook->>Http: write('/seller/stores/{storeId}', 'PUT',<br/>6 項目と resource.data.revision)
    Note right of Http: send() の authFetch() (auth.js) が先に<br/>GET /api/auth/csrf を送る。図では省略
    Http->>Ctrl: PUT /api/seller/stores/{id}

    Note over User,Db: 基本フロー 5 入力内容を検証する
    Ctrl->>Ctrl: @Valid で StoreService.Input を検査<br/>(@NotBlank、@NotNull、@Size、@Email)
    alt 5a 入力が不正 (空白だけ、メールの形が違うなど)
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT
        Http--xHook: readResponse() が throw ApiError(400)
        Hook-->>Page: run() が false。error を設定する
        Page-->>User: 「入力内容・文字数・数値の範囲を<br/>確認してください。」 入力欄はそのまま
    else 検査を通る
        Ctrl->>Svc: save(id, in)
        Note over Svc,Db: クラスの @Transactional で save() 全体が 1 つのトランザクション
        Svc->>Auth: requireManager(id)
        Note right of Auth: requireStoreRole(id, true) が current() で会員を読み、<br/>オーナーの組織か、店舗の MANAGER かを確かめる
        alt 6b 権限がない (STAFF、ロールなし、運営が停止した店舗、<br/>閉鎖済みで担当から外れた MANAGER)
            Auth--xErrs: denied() が throw ApiException(403, FORBIDDEN)
            Errs-->>Http: business() が 403 と message
            Http--xHook: throw ApiError(403)
            Hook-->>Page: run() が false。error を設定する
            Page-->>User: 「この操作の権限がありません。」
        else オーナーか MANAGER
            Auth-->>Svc: 戻る
            Svc->>Repo: require(id) の findById(id)
            Repo->>Db: SELECT stores
            Db-->>Repo: 行
            Repo-->>Svc: StoreEntity
            alt 6c 閉鎖済み (closedAt がある)
                Svc--xErrs: requireNotClosed() が<br/>throw ApiException(409, STORE_CLOSED)
                Errs-->>Http: business() が 409 と message
                Http--xHook: throw ApiError(409)
                Hook->>Http: 409 なので reload()
                Note over Http,Db: GET /api/stores/{id} の流れは詳細図 2 と同じ。図では省略
                Http-->>Hook: 最新のプロフィール
                Hook-->>Page: run() が false。data と error を更新する
                Page-->>User: 「この店舗は閉鎖済みです。」
            else 6a s.getRevision() が in.revision() と違う
                Svc--xErrs: throw ApiException(409, STORE_CHANGED)
                Errs-->>Http: business() が 409 と message
                Http--xHook: throw ApiError(409)
                Hook->>Http: 409 なので reload()
                Note over Http,Db: GET /api/stores/{id} の流れは詳細図 2 と同じ。図では省略
                Http-->>Hook: 最新のプロフィール
                Hook-->>Page: run() が false。data と error を更新する
                Page->>Page: revision が変わったので<br/>form key={p.revision} を作り直す
                Page-->>User: 「店舗情報が更新されています。」<br/>最新のプロフィールを入力欄に表示
            else revision が同じ
                Svc->>Svc: in.name().trim()
                opt 店舗名を変えた
                    Svc->>Repo: existsByOrganizationIdAndName(organizationId, name)
                    Repo->>Db: SELECT stores
                    Db-->>Repo: 行 または 空
                    Repo-->>Svc: true か false
                end
                alt 同じ組織に同じ店舗名がある (記述にない)
                    Svc--xErrs: throw ApiException(409, STORE_NAME_EXISTS)
                    Errs-->>Http: business() が 409 と message
                    Http--xHook: throw ApiError(409)
                    Hook->>Http: 409 なので reload()
                    Http-->>Hook: 最新のプロフィール (revision は同じ)
                    Hook-->>Page: run() が false。data と error を更新する
                    Page-->>User: 「同じ名前の店舗がすでにあります。」<br/>form を作り直さないので入力欄はそのまま
                else 基本フロー 6 保存できる
                    Svc->>Svc: s.updateProfile(name, contact, email,<br/>address, hours, story) (StoreEntity)
                    Svc->>Repo: flush()
                    Repo->>Db: UPDATE stores ... WHERE id = ? AND revision = ?<br/>(@Version で revision を 1 増やす)
                    Note right of Db: 読んでから UPDATE までにほかの更新が入ると、<br/>OptimisticLockingFailureException を<br/>ApiErrors.conflict() が 409 DATA_CHANGED にする。図では省略
                    Db-->>Repo: 1 行
                    Repo-->>Svc: 戻る
                    Svc->>Org: view(s) の findById(organizationId)
                    Org->>Db: SELECT organizations
                    Db-->>Org: 行
                    Org-->>Svc: 会社名
                    Svc-->>Ctrl: Profile (コミット)
                    Ctrl-->>Http: 200 Profile
                    Http-->>Hook: data
                    Hook->>Http: reload() が request('/stores/{storeId}')
                    Note over Http,Db: GET /api/stores/{id} の流れは詳細図 2 と同じ。図では省略
                    Http-->>Hook: 最新のプロフィール
                    Hook-->>Page: run() が true。data と notice「保存しました。」
                    Page->>Page: revision が増えたので<br/>form key={p.revision} を作り直す
                    Page-->>User: 「保存しました。」、保存した内容の入力欄
                end
            end
        end
    end
```

## ユースケース記述との差

- 5a のうち、店舗名・所在地・営業時間が空のときは、`ResourceView.jsx` の `Input` の `required` でブラウザーが送信を止めます。表示されるのはブラウザーの標準のメッセージで、通信しません。文字数の上限は `maxLength` で、超えて入力できません。サーバーまで届く 5a は、空白だけの入力や、問い合わせメールの形の違い（`@Email`）です。問い合わせメールの入力欄は `type="text"` なので、形を確かめるのはサーバーだけです。画面には `ApiErrors.invalid()` の「入力内容・文字数・数値の範囲を確認してください。」が出ます。
- 6b の STAFF とロールなしの担当者にも、`Workspace.jsx` は「店舗プロフィール」画面と「店舗情報を保存」ボタンを出します。保存したときに、`AuthService.requireManager()` が 403 `FORBIDDEN` で止めます。
- 6c の「この店舗は閉鎖済みです。」（409 `STORE_CLOSED`）が出るのは、オーナー（と運営）だけです。閉鎖済みになると、`StoreClosureService.settle()` が `storeMembers.deleteAllAtStore()` で店舗の担当を外します。そのため MANAGER の保存は、`requireManager()` で 403 `FORBIDDEN`「この操作の権限がありません。」になります。
- 6a の後の再確認は、エラーの文と、取り直した最新のプロフィールを入力欄に出すことで行います。ほかの確認の操作はありません。
- 記述にない処理として、店舗名を変えたときに同じ組織に同じ名前の店舗があると、409 `STORE_NAME_EXISTS`「同じ名前の店舗がすでにあります。」で保存しません。このとき `revision` は変わらないので、`<form key={p.revision}>` が作り直されず、入力欄は出店者の入力のままです。
- 記述にない処理として、`revision` を確かめてから `UPDATE` するまでにほかの更新が入ると、`StoreEntity` の `@Version` の確認で `OptimisticLockingFailureException` になり、`ApiErrors.conflict()` が 409 `DATA_CHANGED`「データが競合しました。最新の内容を確認してください。」を返します。
- 記述にない処理として、運営が停止した店舗は、`GET /api/stores/{id}` が 404 `STORE_NOT_FOUND`「店舗が見つかりません。」になり、入力欄を出しません。保存も `requireStoreRole()` が 403 にします。事前条件には閉鎖済みだけが書かれています。
- 1a の選択欄は、管理できる店舗が 2 つ以上のときだけ、「店舗プロフィール」画面の上部に出ます。選んだ店舗は `useShop.js` が `localStorage` に残すので、次に開いたときも同じ店舗を表示します。

## 確かめられなかったこと

- `revision` の確認と `UPDATE` のあいだの競合で 409 `DATA_CHANGED` になることは、コードから読んだだけで、動かして確かめていません。
- 5a でブラウザーが出すメッセージの文は、ブラウザーごとに違うので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink` の `follow()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `useShop()` と `usePath()` の結果を `Workspace` に渡す
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`storePaths`、`rolePaths`、`Workspace`（`ProfilePage` と `SellerStoreSelect` の表示）
- [frontend/src/workspace/SellerStores.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/SellerStores.jsx): `SellerStoresPage` の `edit()`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerStoreSelect.jsx): `SellerStoreSelect` の `onChange`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `setSellerStoreId()`、`reloadSellerStores()`、`sellerStoreId`
- [frontend/src/workspace/PartnerForms.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/PartnerForms.jsx): `ProfilePage` の `save()`、`<form key={p.revision}>`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `Input`（`required`、`maxLength`）、`values()`、`ResourceStatus`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Moderation.jsx): `WarningBadge`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource` の `reload()`、`run()`、`write()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `get()`、`save()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `Input`、`get()`、`save()`、`requireNotClosed()`、`view()`、`withWarning()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java): `warnings()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreClosureService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreClosureService.java): `settle()`（閉鎖済みにして担当を外す）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`、`canViewAsStaff()`、`canManageView()`、`requireManager()`、`requireStoreRole()`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `existsByOrganizationIdAndName()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java): `updateProfile()`、`@Version revision`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`conflict()`
- [backend/src/main/resources/db/migration/V1__schema.sql](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/db/migration/V1__schema.sql): `stores`（`uk_stores_org_name`、`revision`）
