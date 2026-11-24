# EC-S07 注文実績を確認する

- ユースケース記述: [EC-S07_注文実績を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S07_注文実績を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Sel as 管理する店舗の選択欄<br/>SellerStoreSelect<br/>(SellerStoreSelect.jsx)
        participant Page as 注文実績画面<br/>SalesPage・SalesReport<br/>(SalesReport.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文実績API<br/>SalesReportController<br/>(SalesReportController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 注文実績の処理<br/>SalesReportService<br/>(SalesReportService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Policy as 店舗での立場とできること<br/>StoreCapabilityPolicy<br/>(StoreCapabilityPolicy.java)
        participant StoreRepo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
        participant OrderRepo as 注文の読み書き<br/>OrderRepository<br/>(OrderRepository.java)
        participant Mapper as 注文の応答の組み立て<br/>OrderResponseMapper<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、9、34 に適用<br/>*a 通信に失敗した場合: 9、34 に適用

    User->>Work: 出店者メニューの「注文実績」をクリック (EC-C03)
    Work->>Page: URL を /seller/sales に変え、管理する店舗が分かってから<br/>SalesPage を表示 (sellerStoresLoading が false。<br/>key と storeId は選択中の店舗 shop.sellerStoreId)
    opt 1a 複数の店舗を扱う
        Work->>Sel: 見出しの下に店舗の選択欄を出す (店舗が 2 つ以上のとき)
        User->>Sel: 1a-1 画面上部の「管理する店舗」で、確認する店舗を選ぶ (EC-C03)
        Sel->>Work: 選択中の店舗を変える (setSellerStoreId)
        Work->>Page: SalesPage を作り直す (key が変わる)。1a-2 基本フロー 2 へ
    end
    Page->>Hook: 見られる店舗を取りに行くよう頼む<br/>(useResource('/seller/sales/stores'))
    Hook->>Http: 画面を開いたときに自動で通信を始める (reload → request)
    Http->>Ctrl: GET /api/seller/sales/stores
    Ctrl->>Svc: 注文実績を見られる店舗を集めるよう頼む (viewableStores)。<br/>読むだけのトランザクション
    Svc->>Auth: ログイン中の人が店舗側のアカウントか運営かを確かめる<br/>(requireSellerRole)
    Auth-->>Svc: 確かめた
    Svc->>Auth: ログイン中の会員と、候補の店舗を調べる<br/>(current、candidateStoreIdsOf)
    Auth-->>Svc: 会員と候補の店舗 ID (ORG_ADMIN は組織の全店舗、<br/>オーナーは組織の全店舗、担当者は所属する店舗)
    Svc->>StoreRepo: 候補の店舗を読む (findAllById。運営は findAllByOrderByIdAsc)
    StoreRepo->>Db: SELECT stores
    Db-->>StoreRepo: 店舗の行
    StoreRepo-->>Svc: 店舗
    loop 店舗ごと
        Svc->>Policy: その店舗の注文実績を見られるかを確かめる (canViewSales)
        Policy->>Auth: その店舗での立場を調べる (positionsAt →<br/>memberRoleAt、organizationRoleOf、organizationIdOf)
        Auth-->>Policy: 立場 (OWNER、ORG_ADMIN、MANAGER、STAFF、ADMIN)
        Policy-->>Svc: 閉鎖済みならオーナー・ORG_ADMIN・運営、<br/>そうでなければオーナー・MANAGER・STAFF・運営<br/>(運営が停止した店舗は運営だけ) なら見られる
    end
    Svc-->>Ctrl: 見られる店舗 (id、name、closedAt)
    Ctrl-->>Http: 200 店舗の配列
    Http-->>Hook: 見られる店舗
    Hook-->>Page: 見られる店舗
    Page->>Page: 選択中の店舗 (chosen)、ほかの閉鎖済みの店舗 (closed)、<br/>表示する店舗 (target = 選んだ店舗か chosen) を決める
    opt 閉鎖済みのほかの店舗がある
        Page-->>User: 「表示する店舗」の選択欄 (選択中の店舗か「店舗を選んでください」と、<br/>「閉鎖した店舗」の「店舗名（閉鎖済み）」)
        opt 2a 閉鎖した店舗の注文実績を確認する (オーナー・ORG_ADMIN)
            User->>Page: 2a-1「表示する店舗」の「閉鎖した店舗」から店舗を選ぶ
            Page->>Page: その店舗を表示する店舗にする (setPicked)
        end
    end
    alt 2b 表示する店舗がない (選択中の店舗が配列になく、閉鎖した店舗も選んでいない)
        Page-->>User: 2b-1「選択中の店舗の注文実績を見る権限がありません。」<br/>(閉鎖した店舗があれば「閉鎖した店舗は上の欄から選べます。」も)。<br/>通信しない。2b-2 ユースケースを終了する
    else 表示する店舗がある
        Page->>Hook: 2 その店舗の注文実績を取りに行くよう頼む<br/>(SalesReport → useResource('/seller/stores/{storeId}/sales'))
        Hook->>Http: 画面を開いたときに自動で通信を始める (reload → request)
        Http->>Ctrl: GET /api/seller/stores/{storeId}/sales
        Ctrl->>Svc: 店舗の注文実績を作るよう頼む (report)。読むだけのトランザクション
        Svc->>StoreRepo: 店舗を読む (findById)
        StoreRepo->>Db: SELECT stores
        Db-->>StoreRepo: 店舗の行 (なければなし)
        StoreRepo-->>Svc: 店舗 (なければなし)
        alt 店舗がない (記述なし)
            Svc--xErrs: 404 STORE_NOT_FOUND の例外を投げる (notFound)
            Errs-->>Http: 404「店舗が見つかりません。」(business)
            Http--xHook: エラーを投げる (readResponse → ApiError)
            Hook-->>Page: エラーの文
            Page-->>User: 「店舗が見つかりません。」と「再取得」(ResourceStatus)
        else 店舗がある
            Svc->>Auth: ログイン中の会員を調べる (current)
            Auth-->>Svc: 会員
            Svc->>Policy: その店舗の注文実績を見られるかを確かめる (canViewSales)。<br/>判定は 19〜22 と同じ
            Policy-->>Svc: 見られるか
            alt 見られない (記述なし)
                Svc--xErrs: 403 FORBIDDEN の例外を投げる (ApiException)
                Errs-->>Http: 403「この店舗の注文実績を見る権限がありません。」(business)
                Http--xHook: エラーを投げる (readResponse → ApiError)
                Hook-->>Page: エラーの文
                Page-->>User: 「この店舗の注文実績を見る権限がありません。」と「再取得」<br/>(ResourceStatus)
            else 見られる
                Svc->>OrderRepo: 店舗の注文を新しい順に読む<br/>(build → findByStoreIdOrderByCreatedAtDesc)
                OrderRepo->>Db: SELECT orders (新しい順)
                Db-->>OrderRepo: 注文の行
                OrderRepo-->>Svc: 注文
                loop 注文ごと (row)
                    Svc->>Mapper: 手数料と差引額を求めるよう頼む (figures)
                    Mapper-->>Svc: 注文のときの手数料率、販売手数料、差引額、合計に入れるか<br/>(キャンセルは手数料と差引額を 0 にする。<br/>キャンセルと支払い待ちは合計に入れない)
                end
                Svc->>Svc: 件数と合計を作る (SalesTotals。注文数と金額の合計は、<br/>キャンセルでも支払い待ちでもない注文だけ)
                Svc-->>Ctrl: 注文実績 (店舗名、closedAt、注文の一覧、件数と合計)
                Ctrl-->>Http: 200 注文実績
                Http-->>Hook: 注文実績
                Hook-->>Page: 注文実績
                Page-->>User: 3 店舗名、「注文数：N件 / 支払い待ち：N件 / キャンセル：N件 /<br/>キャンセル申請中：N件」、「注文金額」「販売手数料」「差引額」と、<br/>販売手数料の計算方法の説明
                opt 2a-2 閉鎖済みの店舗 (closedAt がある)
                    Page-->>User: 店舗名の横の「閉鎖済み」と、「(日時)に閉鎖した店舗です。<br/>注文実績は読み取り専用で、期限なく確認できます。」
                end
                alt 3a 注文がない
                    Page-->>User: 3a-1 件数と合計は 0、「この店舗の注文はまだありません。」。<br/>3a-2 ユースケースを終了する
                else 注文がある
                    Page-->>User: 注文ごとの一覧 (注文番号、注文日時、状態、支払方法、注文金額、<br/>手数料率、販売手数料、差引額。キャンセルは「手数料なし」と「—」)
                    User->>Page: 4 注文実績を確認する (読み取りだけで、注文を変える操作はない)
                end
            end
        end
    end
```

## 共通代替フローを直接書いた図

上の図の、画面を開くときのログインの確認と、見られる店舗の `GET /api/seller/sales/stores` に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。注文実績の `GET /api/seller/stores/{storeId}/sales` の \*a・\*b も同じ流れで、`SalesReport` の `ResourceStatus` にエラーの文と「再取得」が出ます。この画面は読み取りだけなので、CSRF トークンの取得や書き込みの失敗はありません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as 注文実績画面<br/>SalesPage<br/>(SalesReport.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログインと通信の準備<br/>readSession・authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 注文実績API<br/>SalesReportController<br/>(SalesReportController.java)
        participant Svc as 注文実績の処理<br/>SalesReportService<br/>(SalesReportService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みを含む)
        User->>Work: /seller/sales を開く
        Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
        alt *a ログイン状態を読めない (届かない、または 200 と 403 以外)
            AuthJs-xAuthCtrl: GET /api/auth/me
            AuthJs--xWork: エラーを投げる (届かないときはブラウザーの文、<br/>200 以外は「ログイン状態を確認できません。」)
            Work-->>User: その文だけを表示する (「再取得」は無い)
        else *b ログインしていない
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=false
            AuthJs-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログインの入力欄を出す (AuthPanel)
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: *b-2 ログインする (流れは 00 の図と EC-B01)。<br/>今の URL を読み込み直し、1 からやり直す
        else ログインしている
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=true
            AuthJs-->>Work: ログイン中の会員
            Work->>Page: 管理する店舗が分かってから SalesPage を表示
        end
    else 出店者メニューから開いた
        User->>Work: 出店者メニューの「注文実績」をクリック
        Work->>Page: URL を /seller/sales に変え、SalesPage を表示<br/>(ログイン状態は読み直さない)
    end

    Page->>Hook: 見られる店舗を取りに行くよう頼む (useResource)
    Hook->>Http: 画面を開いたときに自動で通信を始める (reload → request)
    Http->>AuthJs: 要求を送るよう頼む (send → authFetch。GET なので CSRF トークンは取らない)
    alt *a 届かない、または応答が JSON でない
        AuthJs-xFilter: GET /api/seller/sales/stores
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        AuthJs->>Filter: GET /api/seller/sales/stores
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/seller/sales のログイン画面<br/>(*b-2 ログインの後は注文実績画面に戻る)
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: GET /api/seller/sales/stores
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        AuthJs->>Filter: GET /api/seller/sales/stores
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 見られる店舗を集めるよう頼む (viewableStores)
        Svc->>Db: 会員、組織、担当、店舗を読む (上の図の 11〜22)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (reload の catch → setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 見られる店舗
            Ctrl-->>Http: 200 店舗の配列
            Http-->>Hook: 見られる店舗
            Hook-->>Page: 見られる店舗 (以降は上の図の 27〜)
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 見られる店舗を取り直す (reload)。流れは 19〜 と同じ
    end
```

## ユースケース記述との差

- 2b: 見る権限があるかどうかは、画面が `GET /api/seller/sales/stores` の配列に選択中の店舗があるかで決めます。配列になければ、注文実績の API を呼ばずに「選択中の店舗の注文実績を見る権限がありません。」を出します。記述の 2b と同じ文言です。
- 記述にない失敗の応答があります。`GET /api/seller/stores/{storeId}/sales` は、店舗がないと 404 `STORE_NOT_FOUND`「店舗が見つかりません。」、見る権限がないと 403 `FORBIDDEN`「この店舗の注文実績を見る権限がありません。」を返します。画面は 2b で先に止めるので、届くのは店舗の一覧を取ったあとに権限や店舗が変わったときです。画面は `ResourceStatus` でエラーの文と「再取得」を出します。
- 2a: 「表示する店舗」の選択欄は、選択中の店舗のほかに閉鎖済みの店舗が 1 つ以上あるときだけ出ます。選択中の店舗そのものが閉鎖済みで見られる店舗なら、「表示する店舗」で選ばなくても、そのまま 2a-2 の表示になります。
- 2b・関連情報: `/seller/sales` は、ロールのない店舗の ORG_ADMIN にも「注文実績」画面を出し、見られるかどうかを API の配列で決めます（`Workspace.jsx` で `personnelOnly` より前に `SalesPage` を選ぶ）。営業中・閉鎖中の店舗では ORG_ADMIN の立場だけでは見られないので、店舗のロールがなければ 2b になります。
- 関連情報: 運営が停止した営業中の店舗は、オーナー・MANAGER・STAFF も見られず、運営だけが見られます（`StoreCapabilityPolicy.canViewSales` の `isSuspended`）。閉鎖済みの店舗は停止していても対応表のとおりです。記述にない決まりです。
- 基本フロー 3: 「注文数」はキャンセルと支払い待ちを除いた件数です（`SalesTotals` の `orderCount` は合計に入れる注文の件数）。「キャンセル申請中」はキャンセルでない注文のうち、キャンセル申請が `PENDING` の件数です。記述は件数の名前だけを書いています。
- 1a: 店舗を選び直すと、`Workspace.jsx` が `SalesPage` を `key` で作り直すので、見られる店舗（`GET /api/seller/sales/stores`）から取り直します。「表示する店舗」で選んでいた閉鎖済みの店舗の選択（`picked`）は消えます。
- 店舗側のアカウントでも運営でもない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、通信しません。API も `requireSellerRole()` で 403 を返します。事前条件が出店者のログインなので、図には書いていません。

## 確かめられなかったこと

- 注文実績の API の 403・404 が画面から起きる条件（店舗の一覧を取ってから注文実績を取るまでの間に、権限や店舗が変わったとき）は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`storePaths`、`/seller/sales` と `SalesPage` の対応、`SellerStoreSelect` の表示、未ログインの `AuthPanel`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SellerStoreSelect.jsx): `SellerStoreSelect`（`setSellerStoreId`）
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/SalesReport.jsx): `SalesPage`（`chosen`、`closed`、`target`、`setPicked`）、`SalesReport`、`rateLabel`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/payment.js): `paymentLabel`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `sellerStoreId`、`sellerStoresLoading`、`setSellerStoreId`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `canSell`、`readSession`、`authFetch`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): ログイン欄
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java): `stores`、`seller`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java): `viewableStores`、`report`、`build`、`row`、`notFound`
- [backend/src/main/java/jp/kusakari/ec/auth/StoreCapabilityPolicy.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/StoreCapabilityPolicy.java): `TABLE`、`canViewSales`、`can`、`positionsAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSellerRole`、`current`、`candidateStoreIdsOf`、`viewableStoreIdsOf`、`memberRoleAt`、`organizationRoleOf`、`organizationIdOf`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/StoreRepository.java): `findAllByOrderByIdAsc`（`findById`、`findAllById` は JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `figures`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `GET /api/auth/me`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
