# EC-B05 販売店舗の情報を確認する

- ユースケース記述: [EC-B05_販売店舗の情報を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B05_販売店舗の情報を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

「店舗紹介」画面（パス `/store/{店舗 ID}`）は、ログインしていなくても開ける `Workspace` の画面です。`Workspace` はログイン状態を `GET /api/auth/me` で確かめてから、店舗の情報を `GET /api/stores/{id}` で取得します。詳細図は「基本フロー 1 画面の切り替え」と「基本フロー 2 店舗の情報の取得と表示」に分けています。ログインは不要なので、共通代替フロー *b は当てはまりません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「店舗紹介」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 基本フロー 1 「販売店舗の紹介を見る」をクリックする
    User->>Page: 「植物について」ダイアログの<br/>「販売店舗の紹介を見る」をクリック
    Page->>Page: URL を /store/{店舗 ID} に切り替え<br/>「ログイン状態を確認しています。」
    Page->>Api: GET /api/auth/me
    Note right of Api: ログイン中なら会員・組織・<br/>担当店舗を読む。図では省略
    Api-->>Page: 200 ログイン状態<br/>(未ログインなら authenticated が false)

    Note over User,Db: 基本フロー 2 店舗の情報を表示する
    Page-->>User: 「読み込んでいます。」
    Page->>Api: GET /api/stores/{id}
    Api->>Db: 店舗を ID で検索
    Db-->>Api: 店舗の行 または なし
    alt 2a 店舗の行がない
        Api-->>Page: 404 STORE_NOT_FOUND
        Page-->>User: 「店舗が見つかりません。」と「再取得」ボタン
    else 店舗の行がある
        Api->>Api: ログイン中の店舗側の立場 (オーナー・担当者・運営者) で<br/>扱える店舗かを確かめる (読む行は図では省略)
        opt 公開中で、運営者の利用停止も閉鎖済みもない
            Api->>Db: 組織を検索
            Db-->>Api: 組織の行 (停止されていないか)
        end
        alt 2a 購入者に見せない店舗で、店舗側の立場でもない
            Api-->>Page: 404 STORE_NOT_FOUND
            Page-->>User: 「店舗が見つかりません。」と「再取得」ボタン
        else 購入者・未ログインに見せる店舗
            Api-->>Page: 200 店舗の情報
            Page-->>User: 店舗名、所在地 / 営業時間、店舗紹介、<br/>「閉店予定」か「営業中」
        else 店舗側の立場で扱える店舗
            Api->>Db: 運営者の警告を検索
            Db-->>Api: 警告の行
            Api-->>Page: 200 店舗の情報と警告
            Page-->>User: 同じ表示。運営者が利用停止した店舗は「受付休止」
        end
    end
    Note right of User: 2a-2 ユースケースを終了する。<br/>「再取得」は同じ GET を送り直す
    Note over User,Db: 共通代替フロー *a を適用 (「再取得」で取得をやり直す)
```

## 詳細図 1 基本フロー 1 画面の切り替え

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant PLink as PageLink<br/>Common.jsx
        participant Nav as navigation.js
        participant App as App.jsx
        participant Work as Workspace.jsx
        participant Auth as useAuth.js
        participant AuthJs as auth.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as Auth<br/>Controller
        participant AuthSvc as AuthService
    end

    Note over User,AuthSvc: 基本フロー 1 「販売店舗の紹介を見る」をクリックする
    User->>PLink: 「植物について」ダイアログの<br/>「販売店舗の紹介を見る」をクリック
    Note right of PLink: ProductDetail.jsx が href に<br/>/store/{product.sellerStoreId} を渡す
    PLink->>PLink: follow(event) が preventDefault()
    PLink->>Nav: navigate(href)
    Nav->>Nav: history.pushState() と popstate の発行<br/>window.scrollTo(0, 0)
    Nav-->>App: usePath() が setPath(currentPath())
    App->>App: path が / でも /cart でもないので<br/>workspace が true
    App->>Work: Workspace shop=shop path=path header=header を表示
    Note right of App: 「植物について」ダイアログは描かれなくなり<br/>Dialog.jsx のクリーンアップが close() する
    Work->>Auth: useAuth()
    Note right of Auth: useEffect が refreshSession() を<br/>自動で実行する
    Work-->>User: session が null の間は<br/>「ログイン状態を確認しています。」
    Auth->>AuthJs: readSession()
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: session()
    Note right of AuthSvc: current() が 401 なら未ログインの SessionView を返す。<br/>ログイン中は members などを読む。図では省略
    AuthSvc-->>AuthCtrl: SessionView
    AuthCtrl-->>AuthJs: 200 SessionView
    AuthJs-->>Auth: session
    Auth-->>Work: setSession(value)
    Work->>Work: publicStore が true なので<br/>未ログインでも AuthPanel を出さない
    Work->>Work: ProfilePage storeId=path の 2 番目 readOnly を<br/>content にし、見出しを「店舗紹介」にする
    Note over Work,AuthSvc: 続きは詳細図 2
    Note over User,AuthSvc: 共通代替フロー *a。readSession() が失敗すると useAuth() が setError() を実行し<br/>Workspace.jsx はメッセージだけを出す (再実行のボタンはない)
```

## 詳細図 2 基本フロー 2 店舗の情報の取得と表示

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Profile as ProfilePage<br/>PartnerForms.jsx
        participant Res as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as Store<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreService
        participant AuthSvc as AuthService
        participant Mod as StoreModeration<br/>Service
        participant StoreRepo as Store<br/>Repository
        participant OrgRepo as Organization<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 2 店舗の情報を取得して表示する
    Profile->>Res: useResource(/stores/{storeId})
    Note right of Res: useEffect が setData(null) の後<br/>reload() を自動で実行する
    Profile-->>User: ResourceStatus が「読み込んでいます。」
    Res->>Http: request(/stores/{storeId})
    Http->>Ctrl: GET /api/stores/{id}
    Ctrl->>Svc: get(id)
    Note over Svc,Db: get() の @Transactional(readOnly = true) の範囲。ロックはしない
    Svc->>StoreRepo: require(id) が findById(id)
    StoreRepo->>Db: SELECT stores
    Db-->>StoreRepo: 行 または 空
    StoreRepo-->>Svc: Optional の StoreEntity
    alt 2a 店舗の行がない
        Svc--xErrs: throw ApiException(404, STORE_NOT_FOUND)
        Errs-->>Http: business() が 404 と message を返す
        Http--xRes: readResponse() が throw ApiError(404)
        Res->>Res: catch で setError('店舗が見つかりません。')
        Res-->>Profile: resource.error
        Profile-->>User: 「店舗が見つかりません。」と「再取得」ボタン
    else 店舗の行がある
        Svc->>AuthSvc: canViewAsStaff(store)
        Note right of AuthSvc: ログイン中なら current() と canManageView() が<br/>members などを読む。図では省略。<br/>未ログインは current() の 401 を受け止めて false。<br/>運営者が利用停止した店舗は運営者だけが true
        AuthSvc-->>Svc: staff (true か false)
        Svc->>Svc: publiclyVisible(store) が<br/>published、suspended、closedAt を見る
        opt 公開中で、運営者の利用停止も閉鎖済みもない
            Svc->>OrgRepo: findById(organizationId)
            OrgRepo->>Db: SELECT organizations
            Db-->>OrgRepo: 行
            OrgRepo-->>Svc: 組織が停止 (suspended) でないか
        end
        alt 2a 購入者に見せない店舗で、staff も false
            Svc--xErrs: throw ApiException(404, STORE_NOT_FOUND)
            Errs-->>Http: business() が 404 と message を返す
            Http--xRes: readResponse() が throw ApiError(404)
            Res->>Res: catch で setError('店舗が見つかりません。')
            Res-->>Profile: resource.error
            Profile-->>User: 「店舗が見つかりません。」と「再取得」ボタン
        else 購入者・未ログインに見せる店舗 (staff が false)
            Svc->>OrgRepo: view(store) が findById(organizationId) で会社名を読む
            OrgRepo-->>Svc: OrganizationEntity
            Svc-->>Ctrl: Profile (warning は null)
            Ctrl-->>Http: 200 Profile
            Http-->>Res: data
            Res-->>Profile: resource.data
            Profile-->>User: 店舗名、所在地 / 営業時間、店舗紹介、<br/>closingStartedAt があれば「閉店予定」、なければ「営業中」
        else 店舗側の立場で扱える店舗 (staff が true)
            Svc->>OrgRepo: view(store) が findById(organizationId) で会社名を読む
            OrgRepo-->>Svc: OrganizationEntity
            Svc->>Mod: warnings(List.of(id))
            Mod->>Db: findByStoreIdInAndEventTypeInOrderByIdDesc()<br/>SELECT store_moderation_events
            Db-->>Mod: 行
            Mod-->>Svc: 警告の Map
            Svc-->>Ctrl: Profile (warning つき)
            Ctrl-->>Http: 200 Profile
            Http-->>Res: data
            Res-->>Profile: resource.data
            Profile-->>User: 同じ表示。enabled が false なら「受付休止」
        end
    end
    Note right of OrgRepo: view() の findById() は、publiclyVisible() で<br/>同じ組織を読んでいれば、同じトランザクションの<br/>中ではもう一度 SELECT しない
    Note right of User: 2a-2 ユースケースを終了する。<br/>「再取得」は resource.reload() で同じ GET を送る
    Note over User,Db: 共通代替フロー *a を適用。reload() の catch が setError(message) を実行し<br/>ResourceStatus がメッセージと「再取得」を出す
```

## ユースケース記述との差

- 関連情報は「出店者（オーナー・担当者）と運営者は、自分が扱える店舗を状態にかかわらず表示できる」としています。コードの `AuthService.canManageView()` は、運営者が利用停止した店舗では、運営者以外に `false` を返します。そのため、利用停止中の店舗は、オーナーと担当者にも 404「店舗が見つかりません。」になります。
- 営業状態の表示は「営業中」「閉店予定」のほかに「受付休止」があります（`enabled` が `false`、つまり運営者が利用停止した店舗）。購入者・未ログインには利用停止中の店舗が 404 になるので、「受付休止」を見るのは運営者だけです。
- 閉鎖済みの店舗を店舗側の立場で開くと、`closingStartedAt` が残っているので「閉店予定」と表示します。「閉鎖済み」の表示はありません。
- 記述の 2a は非公開・利用停止中・閉鎖済みの店舗を挙げています。コードは、店舗の組織が停止（`organizations.suspended` が true）のときも 404 にします。組織が受付停止中（停止の前の段階）の店舗は購入者にも表示し、「営業中」と出ます。
- 記述にない処理です。画面を開くたびに `Workspace` が `GET /api/auth/me` を送り、応答が来るまで「ログイン状態を確認しています。」を出します。この通信が失敗すると、`Workspace` はメッセージだけを出し、再実行のボタンはありません。共通代替フロー *a の *a-2（再実行を可能にする）と違います。
- 記述にない処理です。購入者・未ログインへの応答（`StoreService.Profile`）にも、担当者（`contact`）と問い合わせメール（`email`）が入っています。画面には出しません。
- 記述にない入口です。「店舗を探す」のダイアログ（`Stores.jsx`）の「店舗の紹介を見る」も、同じ `/store/{店舗 ID}` を開きます。
- 記述にない処理です。認証を省略する隔離テストの設定（`kusakari.auth.mode` が `demo`）では、`canViewAsStaff()` が常に `true` を返すので、どの店舗も表示されます。

## 確かめられなかったこと

- `view()` の中の `organizations.findById()` が、`publiclyVisible()` で読んだ組織を JPA の永続化コンテキストから返し、SQL を出さないことは、SQL のログでは確かめていません。
- 「店舗紹介」画面からブラウザーの「戻る」で「トップ」画面へ戻ると、`App.jsx` の `detailId` が残っているので「植物について」ダイアログがまた開くとコードからは読めます。画面では確かめていません。

## 参照したコード

- [frontend/src/components/ProductDetail.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductDetail.jsx): 「販売店舗の紹介を見る」の `PageLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`、`follow()`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `workspace` の判定、`Workspace` の表示、`detailId`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `publicStore`、`ProfilePage` の表示、見出し「店舗紹介」
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useAuth.js): `refreshSession()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `readSession()`
- [frontend/src/workspace/PartnerForms.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/PartnerForms.jsx): `ProfilePage` の `readOnly` の表示、営業状態の文言
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（「再取得」「読み込んでいます。」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`readResponse()`
- [frontend/src/components/Stores.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Stores.jsx): 「店舗の紹介を見る」の `PageLink`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session()`、`current()`、`canViewAsStaff()`、`canManageView()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `/api/auth/me` と `GET /api/stores/*` の `permitAll()`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `get()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `get()`、`require()`、`publiclyVisible()`、`view()`、`notFound()`、`Profile`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java): `warnings()`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findById()`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findById()`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java): `startClosing()`、`completeClosing()`（閉鎖済みでも `closingStartedAt` は残る）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`
