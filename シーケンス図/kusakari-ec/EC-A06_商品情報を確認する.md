# EC-A06 商品情報を確認する

- ユースケース記述: [EC-A06_商品情報を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A06_商品情報を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの分岐は描かず、一覧が空のときの表示（2a・5a）は図の下に並べています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 商品管理画面<br/>ReviewPage<br/>(OperatorPages.jsx)
        participant Row as 商品の行<br/>ProductModerationRow<br/>(OperatorPages.jsx)
        participant Mod as 警告・停止の操作<br/>ModerationControls<br/>(Moderation.jsx)
        participant Ev as 警告・停止の履歴<br/>ModerationEvents<br/>(Moderation.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 商品の警告・停止API<br/>ProductModerationController<br/>(ProductModerationController.java)
        participant Svc as 商品の警告・停止の処理<br/>ProductModerationService<br/>(ProductModerationService.java)
        participant Hist as 履歴の読み方<br/>ModerationHistory<br/>(ModerationHistory.java)
        participant Repo as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、27 に適用<br/>*a 通信に失敗した場合: 5、27 に適用

    User->>Work: 運営者メニューの「商品管理」をクリック
    Work->>Page: URL を /operator/products に変え、<br/>ReviewPage を商品の一覧として表示 (products)
    Page->>Hook: 商品の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/operator/products
    Ctrl->>Svc: 商品の一覧を作るよう頼む (list)。list 全体が読むだけのトランザクション<br/>ログイン中の人が運営者かを確かめる (AuthService.requireAdmin)
    Svc->>Db: 全店舗 (StoreRepository.findAll) と全在庫 (InventoryRepository.findAll)、<br/>商品の警告と警告の解除の履歴を新しい順に読む<br/>(ProductModerationEventRepository.findByEventTypeInOrderByIdDesc)
    Db-->>Svc: 店舗の行 (店舗 ID と店舗名の対応にする)、<br/>在庫の行 (商品 ID と公開の状態の対応にする)、履歴の行
    Svc->>Hist: 商品ごとに、警告と警告の解除のうち最新の行が<br/>警告なら警告中とするよう頼む (activeWarnings)
    Hist-->>Svc: 警告中の商品と、その警告 (理由、日時)
    Svc->>Repo: 商品を追加した人の表示名 (findAllCreatorNames、SELECT products JOIN members) と、<br/>全商品を画像ごと読む (findAll、SELECT products、product_images)
    Repo-->>Svc: 商品 ID と表示名 (追加した人がない商品は入らない)、<br/>全商品のリスト (削除済みも含む)
    Svc->>Svc: 商品ごとにまとめる。在庫が DELETED でなければ active<br/>(在庫の行がなければ削除済みと同じ)、停止は商品の suspended の列
    Svc-->>Ctrl: 商品のリスト (id、name、storeId、storeName、<br/>active、suspended、warning、createdByName)
    Ctrl-->>Http: 200 商品の配列
    Http-->>Hook: 商品の一覧
    Hook-->>Page: 商品の一覧
    loop 商品ごと (サーバーが返した順のまま)
        Page->>Row: 商品の行を表示 (ProductModerationRow)
        Row->>Row: 公開状態を決める。停止なら「公開停止中」、<br/>そうでなく active なら「公開可能」、それ以外は「販売終了」
        Row->>Mod: 警告と警告・停止の操作を表示 (ModerationControls)
        Mod-->>User: 警告中なら「警告中」、「運営からの警告：理由」と日時 (WarningBadge)、<br/>「警告・停止の履歴」、警告・停止の操作 (EC-A10)
        Row-->>User: 商品名、「店舗：店舗名」、<br/>「追加した人：表示名」(なければ「初期データ」)、公開状態
    end

    User->>Mod: 対象商品の「警告・停止の履歴」を開く
    Mod->>Ev: 開いたことを覚え、履歴を表示する<br/>(details の onToggle → setHistoryOpen(true) → ModerationEvents)
    Ev->>Hook: 履歴を取りに行くよう頼む (useResource)。<br/>取るのは開いたときが初めて (取得中は「読み込み中です。」)
    Hook->>Http: 履歴の通信を始める (reload → request)
    Http->>Ctrl: GET /api/operator/products/{商品 ID}/moderation-events
    Ctrl->>Svc: 商品の履歴を読むよう頼む (events)。全体が読むだけのトランザクション<br/>運営者かを確かめ (AuthService.requireAdmin)、<br/>商品があるかを確かめる (ProductRepository.existsById、SELECT products)
    Svc->>Db: その商品の履歴を新しい順に読む<br/>(ProductModerationEventRepository.findByProductIdOrderByIdDesc)
    Db-->>Svc: 警告・警告の解除・停止・再開の行
    Svc->>Hist: 履歴を表示の形にするよう頼む (views)<br/>操作した運営者の会員を読む (AuthMemberRepository.findAllById)
    Hist-->>Svc: 履歴 (type、reason、actorName は表示名か、<br/>空ならメールアドレス、createdAt)
    Svc-->>Ctrl: 履歴のリスト
    Ctrl-->>Http: 200 履歴の配列
    Http-->>Hook: 履歴
    Hook-->>Ev: 履歴
    Ev-->>User: 新しい順に 1 行ずつ「日時 警告／警告の解除／停止／再開<br/>（運営者名）：理由」(理由が空なら「：理由」を出さない)
```

![EC-A06 シーケンス図](<images/EC-A06_商品情報を確認する-1.png>)

図に描いていない代替フロー：2a（商品がない）、5a（履歴がない）

## 共通代替フローを直接書いた図

上の図の「警告・停止の履歴」を開いたときの通信（`GET /api/operator/products/{商品 ID}/moderation-events`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。履歴の欄はエラーの文だけを出し、「再取得」を出さないので、一覧と違う形になります。画面を開いて商品の一覧を取る通信（`GET /api/operator/products`）の \*a・\*b は、[EC-A05](<EC-A05_店舗情報を確認する.md>) の「共通代替フローを直接書いた図」と同じ流れ（URL を直接開いたときのログインの確認、`ResourceStatus` のエラーの文と「再取得」）なので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mod as 警告・停止の操作<br/>ModerationControls<br/>(Moderation.jsx)
        participant Ev as 警告・停止の履歴<br/>ModerationEvents<br/>(Moderation.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログインの通信<br/>login<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 商品の警告・停止API<br/>ProductModerationController<br/>(ProductModerationController.java)
        participant Svc as 商品の警告・停止の処理<br/>ProductModerationService<br/>(ProductModerationService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Mod: 対象商品の「警告・停止の履歴」を開く
    Mod->>Ev: 履歴を表示する (setHistoryOpen(true) → ModerationEvents)
    Ev->>Hook: 履歴を取りに行くよう頼む (useResource)
    Hook->>Http: 履歴の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/operator/products/{商品 ID}/moderation-events
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook-->>Ev: エラーの文 (reload の catch → setError)
        Ev-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」だけ (「再取得」はない)
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/operator/products/{商品 ID}/moderation-events
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook-->>Ev: エラーの文 (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」<br/>(履歴の欄にも同じ文が出る)
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/operator/products のログイン画面<br/>(ログインの後は *b-2 で商品管理画面を読み込み直す。履歴の欄は閉じた状態)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/operator/products/{商品 ID}/moderation-events
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook-->>Ev: エラーの文 (reload の catch → setError)
        Ev-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」だけ
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/operator/products/{商品 ID}/moderation-events
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 商品の履歴を読むよう頼む (events)
        Svc->>Db: 運営者かを確かめ、商品の有無、履歴、<br/>操作した運営者を読む (上の図の 28〜32)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook-->>Ev: エラーの文 (reload の catch → setError)
            Ev-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」だけ
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 履歴のリスト
            Ctrl-->>Http: 200 履歴の配列
            Http-->>Hook: 履歴
            Hook-->>Ev: 履歴
            Ev-->>User: 履歴 (上の図の 37 のとおり)
        end
    end
    opt *a-3 やり直す
        User->>Mod: 「警告・停止の履歴」を閉じて、もう一度開く
        Mod->>Ev: 閉じると ModerationEvents を消し (setHistoryOpen(false))、<br/>開くと作り直して 3 から取り直す
    end
```

![EC-A06 共通代替フローを直接書いた図](<images/EC-A06_商品情報を確認する-2.png>)

## ユースケース記述との差

- 基本フロー 2: 一覧の行には、記述にない「追加した人：表示名」も出ます。商品を追加した会員の表示名で、追加した人がない商品（初期データ）は「初期データ」と出ます（`ProductRepository.findAllCreatorNames()`、`ProductModerationRow`）。
- 基本フロー 2: 一覧は、出店者が削除した商品（「販売終了」）も含む全商品です。在庫の行がない商品も「販売終了」になります。並べ替えはしておらず、`ProductRepository.findAll()` の順のままです。
- 基本フロー 2: 各行には、警告・停止の操作（EC-A10）のボタンも出ます。
- 2a: 削除済みの商品も一覧に入るので、「対象の商品はありません。」が出るのは、商品の行が 1 件もないときだけです。
- 基本フロー 5: 「操作した運営者」は会員の表示名です。表示名が空なら、メールアドレスを出します（`ModerationHistory.nameOf()`）。記述にはこの決まりが書かれていません。
- 共通代替フロー \*a: 履歴の取得に失敗したとき、`ModerationEvents` はエラーの文だけを出し、「再取得」ボタンを出しません。「警告・停止の履歴」を閉じて開き直すと、`ModerationEvents` を作り直して取り直します。\*a-3 の「再実行を可能にする」とは、やり直し方が違います。
- 共通代替フロー \*a: MySQL との通信に失敗したときの文は、読むだけの通信でも「保存処理を完了できませんでした。時間をおいて再試行してください。」です（`ApiErrors.database()` の文が 1 つだけのため）。
- 履歴の API は、商品がないときに 404 `PRODUCT_NOT_FOUND` を返します。一覧にある商品から開くので、図には書いていません。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、一覧を取りに行きません。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 確かめられなかったこと

- 商品の一覧の並び順です。`ProductModerationService.list()` は `ProductRepository.findAll()` の順のまま返し、ORDER BY も並べ替えもありません。実際に MySQL が返す順は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと運営者の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `ReviewPage`（`products`、空の一覧の文言）、`ProductModerationRow`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Moderation.jsx): `ModerationControls`（`historyOpen`）、`WarningBadge`、`ModerationEvents`、`eventLabels`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java): `list`、`events`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `list`、`events`、`Product`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `activeWarnings`、`views`、`nameOf`
- [backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java): `Warning`、`EventView`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findAll`（`@EntityGraph`）、`findAllCreatorNames`、`existsById`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java): `findByEventTypeInOrderByIdDesc`、`findByProductIdOrderByIdDesc`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findAllById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `refresh`、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`（503 `DATABASE_UNAVAILABLE`）
