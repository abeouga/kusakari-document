# EC-C03 出店者画面のメニューを開く

- ユースケース記述: [EC-C03_出店者画面のメニューを開く](<../../アーカイブ/ユースケース/kusakari-ec/EC-C03_出店者画面のメニューを開く.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
出店者が扱える店舗の一覧（`GET /api/seller/stores`）は、「出店者」をクリックする前、EC の画面を開いたときに `useShop` が読み込みます。「出店者」をクリックしても画面は読み込み直さず、`Workspace` がログイン状態だけを `GET /api/auth/me` で読み直します。代替フロー 3a〜3c は、読み込み済みの店舗の一覧と、店舗ごとの立場（`memberRole`）で画面が決めます。共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは描かず、図の下に並べています。3a（管理する店舗を選ぶ）とサイドバーの折りたたみは、操作の矢印 1 本と Note にまとめています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Nav as URL の切り替え<br/>navigate・usePath<br/>(navigation.js)
        participant Shop as 店舗とカートの状態<br/>useShop<br/>(useShop.js)
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Side as サイドバー<br/>WorkspaceSidebar<br/>(WorkspaceSidebar.jsx)
        participant PM as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant Sel as 店舗の選択欄<br/>SellerStoreSelect<br/>(SellerStoreSelect.jsx)
        participant UseAuth as ログイン状態の確認<br/>useAuth<br/>(useAuth.js)
        participant AuthJs as ログイン状態の読み込み<br/>readSession<br/>(auth.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant StCtrl as 店舗API<br/>StoreController<br/>(StoreController.java)
        participant StSvc as 店舗の処理<br/>StoreService<br/>(StoreService.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 14、36 (URL を直接開いたときも同じ) に適用<br/>*a 通信に失敗した場合: 14、36 に適用

    User->>App: EC の「メイン」画面を開く
    App->>Shop: 店舗とカートの状態を用意する (useShop)
    Shop->>UseAuth: ログイン状態を読むよう頼む (useAuth)<br/>App も共通ヘッダー用に同じく呼ぶ
    UseAuth->>AuthJs: 作られたときに自動で読む (refreshSession → readSession)
    AuthJs->>AuthCtrl: GET /api/auth/me (App 用と useShop 用の 2 回)
    AuthCtrl->>AuthSvc: ログイン状態を作るよう頼む (me → session)
    AuthSvc->>Db: ログイン中の会員と所属を読む<br/>(current、organizationIdOf、organizationRoleOf、storeIdsOf、SELECT members ほか)
    AuthSvc-->>AuthCtrl: ログイン状態
    AuthCtrl-->>AuthJs: 200 ログイン状態 (accountType、organizationRole)
    AuthJs-->>UseAuth: ログイン状態
    UseAuth-->>Shop: ログイン状態
    Shop->>Shop: 店舗側のアカウントか運営者かを決める<br/>(canSell。SHOP_OWNER、SHOP_STAFF、ADMIN)
    Shop->>Http: 扱える店舗の一覧を取りに行く<br/>(reloadSellerStores → request)
    Http->>StCtrl: GET /api/seller/stores
    StCtrl->>StSvc: 扱える店舗の一覧を作るよう頼む (mine)<br/>読み取り専用のトランザクション
    StSvc->>AuthSvc: 店舗側のアカウントか運営者かを確かめ (requireSellerRole)、<br/>ログイン中の会員を読む (current)
    alt 運営者 (isAdmin)
        StSvc->>Db: 全店舗を読む (findAllByOrderByIdAsc、SELECT stores)
        StSvc->>StSvc: 未完了の注文の件数と運営の警告を付ける (managedList)<br/>店舗ごとの立場は付けない
    else オーナー、担当者
        StSvc->>AuthSvc: 店舗の候補を調べる (candidateStoreIdsOf)<br/>オーナーと ORG_ADMIN は組織の全店舗、ほかの担当者は所属の店舗<br/>(SELECT organizations、organization_members、stores、store_members)
        StSvc->>Db: 店舗を読む (findAllById、SELECT stores)
        StSvc->>AuthSvc: 店舗ごとの立場を調べる (memberRoleAt。担当者は store_members を読む)<br/>OWNER、MANAGER、STAFF、NONE (所属でロールなし)、担当でなければ null
        StSvc->>StSvc: 未完了の注文の件数と運営の警告、立場を付ける<br/>(withOpenOrders、withWarning、withRole)
    end
    StSvc-->>StCtrl: 店舗のリスト
    StCtrl-->>Http: 200 店舗の配列 (memberRole つき)
    Http-->>Shop: 店舗の配列 (setOwnStores)
    Shop-->>App: 扱える店舗と選んでいる店舗<br/>(localStorage の kusakari.sellerStoreId の店舗、なければ先頭)
    App->>Head: 「出店者」を出すよう渡す (showSeller は canSell)
    Head-->>User: 共通ヘッダーに「出店者」

    User->>Head: 1 共通ヘッダーの「出店者」をクリック
    Head->>App: クリックした URL を渡す (follow → onNavigate)
    App->>Nav: URL を /seller に変える (navigateFromHeader → navigate)
    Nav-->>App: /seller を /seller/products に置き換えた path<br/>(usePath → currentPath。履歴は増やさない)
    App->>Work: path が / と /cart 以外なので Workspace を表示<br/>(「メイン」画面から移ったので新しく作る)
    Work->>UseAuth: ログイン状態を読むよう頼む (useAuth)
    UseAuth->>AuthJs: 作られたときに自動で読む (refreshSession → readSession)
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 ログイン状態 (中身は 6〜9 と同じ)
    AuthJs-->>UseAuth: ログイン状態
    UseAuth-->>Work: ログイン状態 (accountType、organizationRole)
    Work->>Shop: 読み込み済みの店舗と選んでいる店舗を使う<br/>(sellerStores、sellerStoreId、sellerStoresLoading)
    Shop-->>Work: 13〜25 で読んだ店舗と、選んでいる店舗
    Work->>Work: 人事のメニューを出すかを決める (personnel)<br/>オーナー、ORG_ADMIN、いずれかの店舗の MANAGER
    Work->>Side: 出店者メニューを渡す (sellerMenu、personnel なら personnelMenu、<br/>オーナーと ORG_ADMIN なら historyItem)
    Side-->>User: 「出店者メニュー」と「メニューを閉じる」、「商品一覧へ戻る」、<br/>「商品管理」「店舗受け取り」「注文実績」「店舗一覧」「店舗プロフィール」「出店者通知」<br/>(personnel なら「アカウント」「招待キー」、オーナーと ORG_ADMIN なら「履歴」も)
    Work->>PM: 商品管理を表示 (ProductManager、embedded)
    PM->>Sel: 店舗の選択欄を出す (SellerStoreSelect。店舗が 1 つでも出す)
    Sel-->>User: 見出し「商品管理」と「管理する店舗」の選択欄
    PM-->>User: 「商品管理」画面 (商品の取得と中身は EC-S03 など)

    User->>Side: 3 サイドバーの対象のメニューをクリック
    Side->>Work: URL を対象の path に変え、Workspace を描き直す<br/>(MenuLink の PageLink → navigate)。ログイン状態と店舗は読み直さない
    opt 3a-1 店舗ごとの画面 (storePaths) で、店舗が 2 つ以上
        Work->>Sel: 画面の上に選択欄を出す (SellerStoreSelect)
        Note over User,Sel: 画面: 「管理する店舗」の選択欄
    end
    Work-->>User: そのメニューの見出しと画面 (内容は呼び出し元のユースケース)
    opt 3a 管理する店舗を選ぶ
        User->>Sel: 3a-2「管理する店舗」で店舗を選ぶ
        Note over User,Sel: 結果: 選んだ店舗を useShop が覚え、localStorage の kusakari.sellerStoreId に保存する (setSellerStoreId)。<br/>画面: 3a-3 選んだ店舗の内容で画面を描き直す (内容の取得は呼び出し元のユースケース)
    end
    opt サイドバーを折りたたむ
        User->>Side: 「メニューを閉じる」をクリック
        Note over User,Side: 結果: Workspace に折りたたむよう伝える (onToggle → setSidebarClosed)。<br/>画面: アイコンだけのサイドバー。ボタンは「メニューを開く」になる
    end
```

![EC-C03 シーケンス図](<images/EC-C03_出店者画面のメニューを開く-1.png>)

図に描いていない代替フロー：3b（管理できる店舗がない）、3c（担当のロールがない）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の `GET /api/seller/stores`（上の図の 14）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。「出店者」をクリックした後の `GET /api/auth/me`（上の図の 36）の \*a・\*b は、[EC-C02](<EC-C02_管理者画面のメニューを開く.md>) の「共通代替フローを直接書いた図」と同じなので省いています（`/operator/members` を `/seller/products` に読み替え）。サイドバーのメニューのクリック、店舗の選択、折りたたみは通信しないので、共通代替フローは起こりません。

`GET /api/seller/stores` が失敗しても、画面は通信のエラーを出さず、店舗の一覧を空として扱います。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Shop as 店舗とカートの状態<br/>useShop<br/>(useShop.js)
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch・login<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant StCtrl as 店舗API<br/>StoreController<br/>(StoreController.java)
        participant StSvc as 店舗の処理<br/>StoreService<br/>(StoreService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>App: EC の「メイン」画面を開く
    App->>Shop: ログイン状態を読み、店舗側のアカウントか運営者かを決める<br/>(useShop。上の図の 2〜12)
    Shop->>Http: 扱える店舗の一覧を取りに行く (reloadSellerStores → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/seller/stores
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xShop: エラーを投げる
        Shop->>Shop: 店舗の一覧を空にする (catch → setOwnStores([]))<br/>*a-1 のエラーの文は出さない
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/seller/stores
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xShop: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Shop->>Shop: 店舗の一覧を空にする (catch → setOwnStores([]))
        Notice-->>User: *b-1「ログインの有効期限が切れました。もう一度ログインしてください。」<br/>「ログインすると、この画面に戻ります。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=今の URL のログイン画面<br/>(*b-2 で元の画面を読み込み直し、店舗も読み直す)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/seller/stores
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xShop: エラーを投げる (ApiError 503)
        Shop->>Shop: 店舗の一覧を空にする (catch → setOwnStores([]))<br/>*a-1 のエラーの文は出さない
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/seller/stores
        Filter->>StCtrl: 要求を通す (chain.doFilter)
        StCtrl->>StSvc: 扱える店舗の一覧を作るよう頼む (mine)
        StSvc->>Db: 会員、店舗の候補、店舗、立場を読む (上の図の 16〜22)
        alt *a MySQL との通信に失敗
            Db--xStSvc: 失敗 (DataAccessException)
            StSvc--xStCtrl: 例外
            StCtrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xShop: エラーを投げる (ApiError 503)
            Shop->>Shop: 店舗の一覧を空にする (catch → setOwnStores([]))<br/>*a-1 のエラーの文は出さない
        else 読めた
            Db-->>StSvc: 行
            StSvc-->>StCtrl: 店舗のリスト
            StCtrl-->>Http: 200 店舗の配列
            Http-->>Shop: 店舗の配列 (setOwnStores)
        end
    end
    Shop-->>App: 扱える店舗 (空のこともある)
    App->>Head: 「出店者」を出すよう渡す (showSeller は canSell)
    Head-->>User: 共通ヘッダーに「出店者」
    User->>Head: 「出店者」をクリック
    Head->>App: クリックした URL を渡す (follow → onNavigate)
    App->>Work: URL を /seller/products に変え、Workspace を表示<br/>(上の図の 30〜39)
    alt 店舗の一覧が空になった担当者 (ORG_ADMIN を除く)
        Work-->>User: 「どの店舗にも所属していないため、この画面は使えません。<br/>自分あての通知だけを見られます。」とメニューは「出店者通知」だけ
    else 店舗の一覧が空になったオーナー、ORG_ADMIN、運営者
        Work-->>User: 「商品管理」と「管理できる店舗がありません。」(3b と同じ表示)
    else 店舗を読めた
        Work-->>User: 「商品管理」画面 (上の図の 40〜48)
    end
```

![EC-C03 共通代替フローを直接書いた図](<images/EC-C03_出店者画面のメニューを開く-2.png>)

## ユースケース記述との差

- 関連情報は共通代替フロー \*b だけを挙げていますが、`GET /api/seller/stores` と `GET /api/auth/me` には \*a も起こります。`GET /api/seller/stores` が失敗すると、画面は店舗の一覧を空として扱い、通信のエラーを出しません（`reloadSellerStores` の `catch`）。オーナー・ORG_ADMIN・運営者には 3b と同じ「管理できる店舗がありません。」が、ほかの担当者には「どの店舗にも所属していないため、この画面は使えません。…」が出ます。「再取得」はなく、やり直すにはブラウザーで再読み込みします。
- 基本フロー 2: オーナーと ORG_ADMIN には、「アカウント」「招待キー」のほかに「履歴」（`/seller/member-events`）も出します。記述にありません。
- 基本フロー 2: 運営者（ADMIN）も出店者画面を開けます（`canSell`）。運営者には全店舗が出て、店舗ごとの立場を付けないので、人事のメニュー（「アカウント」「招待キー」）は出ません。記述のアクターは出店者だけです。
- 3a: 「商品管理」では、店舗が 1 つでも「管理する店舗」の選択欄を出します（`ProductManager` の `SellerStoreSelect`）。ほかの画面は店舗が 2 つ以上のときだけです。選択欄を出す画面には「履歴」も含みます。
- 3b: 「管理できる店舗がまだありません。」と「店舗一覧を開く」を出すのは、「店舗受け取り」「店舗プロフィール」「招待キー」「履歴」です。「商品管理」は選択欄の位置に「管理できる店舗がありません。」を出します。「注文実績」は `SalesPage` が `GET /api/seller/sales/stores` で読める店舗を決めます。
- 3b: 記述は「担当の店舗がない担当者」にも「管理できる店舗がまだありません。」を出すとしています。コードでは、どの店舗にも所属していない担当者（ORG_ADMIN を除く）は、メニューが「出店者通知」だけになり、「どの店舗にも所属していないため、この画面は使えません。自分あての通知だけを見られます。」を出します。
- 3c: 「注文実績」は、3c の表示より先に `SalesPage` を出す分岐があるので、ロールのない店舗を選んでも 3c の文は出ません。3c の文は「商品登録」（`/seller/products/new`）でも出ます。3c になるのは立場が null の店舗（ORG_ADMIN の、担当していない店舗）だけで、所属していてロールのない担当者（`NONE`）は 3c になりません。
- 3a-2: 選んだ店舗は `localStorage` に保存します。保存できないブラウザーでは、再読み込みまでの間だけ覚えます。
- サイドバーの先頭に「商品一覧へ戻る」があります。記述にありません。
- 出店者・運営者のアカウントでない人が出店者画面の URL を開いたときの「この画面を利用する権限がありません。」は、画面（`Workspace`）が `canSell` で決めます。事前条件で外したので、図には書いていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/packages/site-header/KusakariHeader.jsx): `KusakariHeader`、`follow`（「出店者」は `showSeller` のときだけ）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `navigateFromHeader`、`showSeller`、`Workspace` の表示
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `canSell`、`readSession`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`（`refreshSession`）
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `reloadSellerStores`、`setSellerStoreId`、`savedStoreChoice`、`sellerStores`、`sellerStoreId`、`sellerStoresLoading`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`、`currentPath`（`/seller` の置き換え）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`personnelMenu`、`historyItem`、`noticeItem`、`storePaths`、`rolePaths`、`unassigned`、`personnelOnly`、`personnel`、`setSidebarClosed`
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ProductManager.jsx): `ProductManager`、`ManagerFrame`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SellerStoreSelect.jsx): `SellerStoreSelect`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/SalesReport.jsx): `SalesPage`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/controller/StoreController.java): `mine`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/StoreService.java): `mine`、`managedList`、`withOpenOrders`、`withWarning`、`withRole`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session`、`requireSellerRole`、`current`、`candidateStoreIdsOf`、`memberRoleAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503 のときはセッションを残す）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`
