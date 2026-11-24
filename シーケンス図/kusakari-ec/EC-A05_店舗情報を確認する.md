# EC-A05 店舗情報を確認する

- ユースケース記述: [EC-A05_店舗情報を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A05_店舗情報を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、一覧の表示だけで終わるもの（2a・4a）は分かれる所だけを描き、閉鎖済みでない店舗だけに出す警告・停止の操作（opt）は、表示を頼む矢印と Note に寄せています。5a は、そこでしか起きない注文実績の通信（`GET /api/operator/stores/{店舗 ID}/sales`）があるので、矢印で描いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 店舗管理画面<br/>OperatorStoresPage<br/>(OperatorStores.jsx)
        participant Mod as 警告・停止の操作<br/>ModerationControls<br/>(Moderation.jsx)
        participant Sales as 店舗の注文実績<br/>SalesReport<br/>(SalesReport.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 店舗API<br/>StoreController<br/>(StoreController.java)
        participant SCtrl as 注文実績API<br/>SalesReportController<br/>(SalesReportController.java)
        participant Svc as 店舗の処理<br/>StoreService<br/>(StoreService.java)
        participant SSvc as 注文実績の処理<br/>SalesReportService<br/>(SalesReportService.java)
        participant Mods as 店舗の警告・停止<br/>StoreModerationService<br/>(StoreModerationService.java)
        participant Repo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2・28 (URL を直接開いたときのログインの確認)、5、31、43 に適用<br/>*a 通信に失敗した場合: 5、31、43 に適用

    User->>Work: 運営者メニューの「店舗管理」をクリック
    Work->>Page: URL を /operator/sellers に変え、<br/>OperatorStoresPage を表示
    Page->>Hook: 店舗の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/operator/stores
    Ctrl->>Svc: 店舗の一覧を作るよう頼む (list)。list 全体が読むだけのトランザクション<br/>ログイン中の人が運営者かを確かめる (AuthService.requireAdmin)
    Svc->>Repo: 全店舗を ID の順に読む (findAllByOrderByIdAsc、SELECT stores)
    Repo-->>Svc: 全店舗 (閉鎖済みも含む)
    Svc->>Mods: 警告中の店舗を調べるよう頼む (managedList → warnings)<br/>警告と警告の解除の履歴を新しい順に読み<br/>(findByStoreIdInAndEventTypeInOrderByIdDesc、SELECT store_moderation_events)、<br/>店舗ごとに最新の行が警告なら警告中とする (ModerationHistory.activeWarnings)
    Mods-->>Svc: 警告中の店舗と、その警告 (理由、日時)
    loop 店舗ごと
        Svc->>Db: 店舗の組織の名前を読み (view → OrganizationRepository.findById)、<br/>支払い待ち・注文受付・受取準備完了の注文を数える<br/>(withOpenOrders → OpenOrders.count → OrderRepository.countByStatus)
        Db-->>Svc: 組織の名前 (会社名にする。なければ空) と未完了の注文の件数
    end
    Svc-->>Ctrl: 店舗のリスト (name、company、address、enabled、published、<br/>closingStartedAt、closingStartedBy、closedAt、openOrderCount、warning ほか)
    Ctrl-->>Http: 200 店舗の配列
    Http-->>Hook: 店舗の一覧
    Hook-->>Page: 店舗の一覧
    Page->>Page: 検索欄の文字を含む店舗だけ残す<br/>(all.filter。検索欄が空なので全店舗が残る)
    break 2a 店舗が 1 件もない
        Page-->>User: 2a-1「対象の店舗はありません。」
    end
    Page->>Page: 店舗ごとに状態を決める (stateOf、SellerStores.jsx)<br/>閉鎖済みなら「閉鎖済み」、閉鎖中なら「閉鎖中（運営が開始・未完了の注文 N件）」<br/>か「閉鎖中（オーナーが開始・未完了の注文 N件）」、停止中なら「運営により停止中」、<br/>それ以外は公開していれば「公開中」、していなければ「非公開」
    opt 閉鎖済みでない店舗 (closedAt が空)
        Page->>Mod: 警告と警告・停止の操作を表示するよう頼む (ModerationControls)
        Note over Page,Mod: 画面: 警告中なら「警告中」、「運営からの警告：理由」と日時 (WarningBadge)、<br/>警告・停止の操作 (EC-A11)。
    end
    Page-->>User: 「店舗名・会社名・所在地で検索」欄と店舗の一覧<br/>店舗名、会社名 / 所在地、状態、「注文実績を見る」<br/>(閉鎖中・閉鎖済みでない店舗には閉鎖の操作も出す)

    User->>Page: 「店舗名・会社名・所在地で検索」欄に入力
    Page->>Page: 入力値を覚え (onChange → setQuery)、店舗名・会社名・所在地を空白でつないだ<br/>文字列が入力を含む店舗だけ残す (all.filter、includes。入力欄が空なら全店舗)
    break 4a 該当する店舗がない
        Page-->>User: 4a-1「検索条件に一致する店舗はありません。」<br/>4a-2 検索条件を変えて入力する (基本フロー 3 へ戻る)
    end
    Page-->>User: 部分一致した店舗だけの一覧

    alt 5a 店舗の注文実績を確認する
        User->>Page: 5a-1 対象店舗の「注文実績を見る」をクリック
        Page->>Work: URL を /operator/stores/{店舗 ID}/sales に変える<br/>(PageLink → navigate)
        Work->>Sales: 見出し「店舗の注文実績」、「店舗管理へ戻る」と<br/>注文実績を表示 (operatorSales → SalesReport)
        Sales->>Hook: 注文実績を取りに行くよう頼む (useResource)
        Hook->>Http: 自動で注文実績の通信を始める (reload → request)
        Http->>SCtrl: GET /api/operator/stores/{店舗 ID}/sales
        SCtrl->>SSvc: 運営向けの注文実績を作るよう頼む (operatorReport)。全体が読むだけのトランザクション<br/>運営者かを確かめ (AuthService.requireAdmin)、店舗を読む (StoreRepository.findById、SELECT stores)
        SSvc->>Db: 店舗の注文を新しい順に読む<br/>(build → OrderRepository.findByStoreIdOrderByCreatedAtDesc)
        Db-->>SSvc: 注文の行
        SSvc->>SSvc: 注文ごとに手数料率・販売手数料・差引額を出し (row → OrderResponseMapper.figures)、<br/>件数と合計を数える (SalesTotals。キャンセルと支払い待ちは合計に入れない)
        SSvc-->>SCtrl: 注文実績 (storeName、closedAt、orders、totals)
        SCtrl-->>Http: 200 注文実績
        Http-->>Hook: 注文実績
        Hook-->>Sales: 注文実績
        Sales-->>User: 5a-2 店舗名 (閉鎖済みなら「閉鎖済み」と「(日時)に閉鎖した店舗です。<br/>注文実績は読み取り専用で、期限なく確認できます。」)、<br/>「注文数：N件 / 支払い待ち：N件 / キャンセル：N件 / キャンセル申請中：N件」、<br/>注文金額・販売手数料・差引額の合計、注文ごとの一覧 (注文番号、注文日時、<br/>状態、支払方法、注文金額、手数料率、販売手数料、差引額)<br/>(注文がなければ「この店舗の注文はまだありません。」)
        User->>Work: 5a-3「店舗管理へ戻る」をクリック
        Work->>Page: URL を /operator/sellers に変え、<br/>OperatorStoresPage を新しく表示 (検索欄は空)
        Page->>Hook: 店舗の一覧を取り直すよう頼む (useResource)。<br/>流れは 4〜16 と同じ
        Hook-->>Page: 店舗の一覧
        Page-->>User: 店舗の一覧 (基本フロー 2 へ戻る)
    end
```

![EC-A05 シーケンス図](<images/EC-A05_店舗情報を確認する-1.png>)

## 共通代替フローを直接書いた図

上の図の、画面を開いて店舗の一覧を取る通信（`GET /api/operator/stores`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。注文実績の画面の `GET /api/operator/stores/{店舗 ID}/sales` と、「店舗管理へ戻る」の後の一覧の取り直しも、同じ `useResource.js` と `ResourceStatus` を通るので、同じ流れになります（URL を直接開いたときのログインの確認も同じです）。その 2 つは省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態<br/>useAuth<br/>(useAuth.js)
        participant Panel as ログイン欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as 店舗管理画面<br/>OperatorStoresPage<br/>(OperatorStores.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログインの通信<br/>readSession・passwordLogin・login<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 店舗API<br/>StoreController<br/>(StoreController.java)
        participant Svc as 店舗の処理<br/>StoreService<br/>(StoreService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みを含む)
        User->>Work: 店舗管理画面の URL (/operator/sellers) を開く
        Work->>UseAuth: ログインの状態を読むよう頼む (useAuth)
        UseAuth->>AuthJs: ページを開いたときに一度だけ<br/>ログインの状態を読む (refreshSession → readSession)
        alt *a ログインの状態を読めない (届かない、または 200 以外)
            AuthJs-xAuthCtrl: GET /api/auth/me
            AuthJs--xUseAuth: エラーを投げる (届かないときはブラウザーの文、<br/>200 以外は「ログイン状態を確認できません。」)
            UseAuth-->>Work: エラーの文 (error)
            Work-->>User: *a-1 エラーの文だけを表示。「再取得」はなく、<br/>やり直すにはブラウザーで再読み込みする
        else *b ログインしていない
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 ログインしていない (authenticated が false)
            AuthJs-->>UseAuth: ログインの状態
            UseAuth-->>Work: ログインの状態
            Work->>Panel: 画面の代わりにログインの入力欄を表示 (AuthPanel)
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: 今の URL を戻り先にしてログインを頼む<br/>(submit → passwordLogin)
            AuthJs->>PwCtrl: POST /api/auth/login<br/>(先に GET /api/auth/csrf で CSRF トークンを取る)
            PwCtrl->>Cog: パスワードで認証する (authenticate、<br/>InitiateAuth USER_PASSWORD_AUTH、CognitoPasswordLogin.java)
            Cog-->>PwCtrl: ID トークンと refresh トークン
            PwCtrl-->>AuthJs: 200 戻り先 (returnTo)。セッションに認証情報を保存
            AuthJs-->>Panel: 戻り先
            Panel-->>User: *b-2 /operator/sellers を読み込み直す<br/>(complete → window.location.replace)。<br/>1 からやり直し、ログイン済みとして進む
        else ログインしている
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 ログインしている (accountType が ADMIN)
            AuthJs-->>UseAuth: ログインの状態
            UseAuth-->>Work: ログインの状態
        end
    else メニューから開いた (ログインの状態は読み直さない)
        User->>Work: 運営者メニューの「店舗管理」をクリック
    end
    Work->>Page: OperatorStoresPage を表示
    Page->>Hook: 店舗の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/operator/stores (send → authFetch → fetch)
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/operator/stores
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」<br/>(画面にも同じ文と「再取得」が出る)
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/operator/sellers のログイン画面<br/>(ログインの後は *b-2 で店舗管理画面を読み込み直す)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/operator/stores
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/operator/stores
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 店舗の一覧を作るよう頼む (list)
        Svc->>Db: 運営者かを確かめ、店舗・警告の履歴・組織・<br/>未完了の注文の件数を読む (上の図の 6〜12)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (reload の catch → setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 店舗のリスト
            Ctrl-->>Http: 200 店舗の配列
            Http-->>Hook: 店舗の一覧
            Hook-->>Page: 店舗の一覧
            Page-->>User: 店舗の一覧 (上の図の 17〜21 のとおり)
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 一覧を取り直す (reload)。<br/>*a-2 検索欄の入力はそのまま残る
    end
```

![EC-A05 共通代替フローを直接書いた図](<images/EC-A05_店舗情報を確認する-2.png>)

## ユースケース記述との差

- 基本フロー 2: API は閉鎖済みの店舗にも警告（`warning`）を返します。ところが画面は、`closedAt` がある店舗に `ModerationControls` を出しません。「警告中」のバッジ（`WarningBadge`）は `ModerationControls` の中にあるので、閉鎖済みの店舗は警告中でもバッジと理由が出ません。記述は「警告中の店舗には『警告中』のバッジと警告の理由を表示する」としています。
- 基本フロー 2: 一覧には、警告・停止の操作（EC-A11）と、閉鎖・閉鎖の取り消し・未完了の注文のまとめてキャンセルのボタンも出ます。記述は関連情報で触れているだけです。
- 基本フロー 4: 絞り込みは JavaScript の `includes` です。店舗名・会社名・所在地を空白でつないだ 1 つの文字列を探すので、大文字と小文字を区別し、入力の前後の空白も取り除きません。空白をはさんだ入力（「店舗名 会社名」など）が、2 つの項目にまたがって当たることもあります。記述にはこの決まりが書かれていません。
- 5a-2: 注文が 1 件もない店舗では、一覧の代わりに「この店舗の注文はまだありません。」を出します。「注文数」と金額の合計は、キャンセルと支払い待ちの注文を除いて数えます（`SalesReportService.build()`、`OrderResponseMapper.figures()` の `counted`）。手数料の決まりの説明の文も出ます。どれも記述にはありません。
- 5a-3: 「店舗管理へ戻る」で `OperatorStoresPage` を作り直すので、店舗の一覧を取り直し、検索欄は空に戻ります。記述は「基本フロー 2 へ戻る」だけです。
- 共通代替フロー \*a: MySQL との通信に失敗したときの文は、読むだけの通信でも「保存処理を完了できませんでした。時間をおいて再試行してください。」です（`ApiErrors.database()` の文が 1 つだけのため）。
- 注文実績の API は、店舗が見つからないときに 404 `STORE_NOT_FOUND`「店舗が見つかりません。」を返します。一覧のリンクから開くので、図には書いていません。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、一覧を取りに行きません。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインのときの `AuthPanel`、運営者の確認、`operatorSales`、path と画面の対応、「店舗管理へ戻る」）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [frontend/src/workspace/OperatorStores.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorStores.jsx): `OperatorStoresPage`（`query`、`all.filter`、空の一覧の文言、「注文実績を見る」、閉鎖済みでない店舗だけの `ModerationControls`）
- [frontend/src/workspace/SellerStores.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/SellerStores.jsx): `stateOf`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Moderation.jsx): `ModerationControls`、`WarningBadge`
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/SalesReport.jsx): `SalesReport`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`authFetch`、`passwordLogin`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`（`refreshSession`）
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`（`submit`、`complete`、`returnTo`）
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `list`、`managedList`、`withOpenOrders`、`view`、`Profile`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StoreModerationService.java): `warnings`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `activeWarnings`、`WARNING_TYPES`
- [backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java): `count`、`BLOCKING`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAllByOrderByIdAsc`、`findById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/StoreModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/StoreModerationEventRepository.java): `findByStoreIdInAndEventTypeInOrderByIdDesc`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/OrganizationRepository.java): `findById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `countByStatus`、`findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java): `operator`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java): `operatorReport`、`build`、`row`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `figures`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `GET /api/auth/me`、`GET /api/auth/csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `authenticate`、`refresh`、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`（ID トークンの更新、401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（セッションが無いときの 401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`（503 `DATABASE_UNAVAILABLE`）
