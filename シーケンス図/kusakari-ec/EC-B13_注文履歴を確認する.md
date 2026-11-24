# EC-B13 注文履歴を確認する

- ユースケース記述: [EC-B13_注文履歴を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B13_注文履歴を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as 画面の切り替え<br/>App<br/>(App.jsx)
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant AuthJs as ログイン状態<br/>readSession<br/>(auth.js)
        participant Orders as 注文履歴画面<br/>BuyerOrders<br/>(BuyerOrders.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 注文API<br/>OrderController<br/>(OrderController.java)
        participant Session as 購入者のカート<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Carts as 会員のカート<br/>MemberCartService<br/>(MemberCartService.java)
        participant Svc as 注文の処理<br/>OrderService<br/>(OrderService.java)
        participant Mapper as 注文の応答の組み立て<br/>OrderResponseMapper<br/>(OrderResponseMapper.java)
        participant Repo as 注文の読み書き<br/>OrderRepository<br/>(OrderRepository.java)
        participant Items as 注文の明細の読み書き<br/>OrderItemRepository<br/>(OrderItemRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 5 (Workspace を開いたときのログインの確認) と 12 に適用<br/>*a 通信に失敗した場合: 5 と 12 に適用

    User->>Header: 共通ヘッダーの「注文履歴」をクリック
    Header->>App: 移る先の URL を渡す<br/>(follow → onNavigate の navigateFromHeader)
    App->>Work: URL を /purchases に変え (navigate)、<br/>Workspace を表示
    opt トップなど Workspace の外の画面から開いたとき
        Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
        AuthJs->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>AuthJs: 200 ログイン状態 (authenticated、accountType)
        AuthJs-->>Work: ログイン中の会員
    end
    alt 店舗側・出店申請用のアカウント (isShopAccount)
        Work-->>User: 「店舗・出店申請用のアカウントでは購入できません。<br/>購入は購入者のアカウントでご利用ください。」(buyerOnlyMessage)。<br/>注文を取りに行かない
    else 購入者か運営のアカウント
        Work->>Orders: BuyerOrders を表示
        Orders->>Hook: 注文の一覧を取りに行くよう頼む (useResource)
        Hook->>Http: 画面を開いたときに自動で<br/>一覧の通信を始める (reload → request)
        Http->>Ctrl: GET /api/orders
        Ctrl->>Session: 購入者のカートを調べるよう頼む (resolve)
        Session->>Auth: ログイン中の人が購入者か運営かを確かめる (requireBuyer)
        Auth-->>Session: 購入者である
        Session->>Carts: 会員のカートを調べるよう頼む (resolve)<br/>resolve 全体が 1 つのトランザクション
        Carts->>Db: 会員の行をロックし (lockMember、SELECT ... FOR UPDATE members)、<br/>カートを読む (findByMemberId。なければ作る)
        Db-->>Carts: カートの行
        Carts-->>Session: カートの ID
        Session-->>Ctrl: カートの ID (一覧では使わない)
        Ctrl->>Svc: 注文の一覧を作るよう頼む (list)<br/>list 全体が 1 つのトランザクション
        Svc->>Auth: ログイン中の会員を調べる (current)
        Auth-->>Svc: ログイン中の会員
        Svc->>Repo: 自分の注文のうち、非表示にしていないものを<br/>新しい順に読む (findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc)
        Repo->>Db: SELECT orders
        Db-->>Repo: 注文の行
        Repo-->>Svc: 注文のリスト
        loop 注文ごと (view)
            Svc->>Items: 注文の明細を読む (findAllForOrder)
            Items->>Db: SELECT order_items
            Db-->>Items: 明細の行
            Items-->>Svc: 明細のリスト
            Svc->>Mapper: 購入者向けの応答を組み立てるよう頼む (toView)
            Mapper->>Db: 商品画像、決済の状態、返金の状態、店舗、<br/>キャンセルした会員を読む (findImageReferences、<br/>PaymentRepository・StoreRepository・AuthMemberRepository の findById、<br/>RefundRepository の findByOrderId)
            Db-->>Mapper: 行
            Mapper-->>Svc: 注文 (paymentStatus、refundStatus、storeClosing、<br/>運営がキャンセルしたら cancelledBy が OPERATOR。sales は返さない)
        end
        Svc-->>Ctrl: 注文の一覧
        Ctrl-->>Http: 200 注文の配列
        Http-->>Hook: 注文の一覧
        Hook-->>Orders: 注文の一覧
        Orders->>Orders: 選んだ注文状態で絞り込む (shown、filter)<br/>初めは「すべて」なので全件
        alt 2a 注文が 0 件
            Orders-->>User: 「注文はありません。」(2a-2 ユースケースを終了する)
        else 注文がある
            Orders-->>User: 注文ごとの注文日時、注文状態 (orderLabels)、商品画像 (4 枚まで)、<br/>商品名 (「ほか N 点」)、受取店舗、個数、注文番号、合計金額。<br/>申請中なら「キャンセル申請中」、返金が済んだら「返金済み」
            opt 基本フロー 4〜5 注文状態で絞り込む
                User->>Orders: 絞り込みボタン (「すべて」「注文受付」「受取準備完了」<br/>「引き渡し完了」「キャンセル」) をクリック
                Orders->>Orders: 選んだ注文状態の注文だけを残す (setFilter、filter)。通信しない
                Orders-->>User: 選んだ注文状態の注文だけの一覧<br/>(0 件なら「注文はありません。」)
            end
            User->>Orders: 一覧から注文をクリック
            Orders->>Orders: その注文を開く (onToggle → setOpenId)。<br/>受け取り済みの一覧のデータを使い、通信しない
            Orders-->>User: 商品名、「SKU」、単価 × 個数、金額、合計、<br/>お支払い方法と支払い・返金の状態 (PaymentState)、<br/>「受け取り」欄 (受取店舗、所在地 / 営業時間、準備完了日時、引き渡し完了日時)、<br/>「キャンセル申請（承認/却下）：理由 / 店舗からの回答：…」
            opt 7a 受取店舗が閉鎖中で、注文受付か受取準備完了の注文 (storeClosing)
                Orders-->>User: 「受け取り」欄に「この店舗は閉鎖予定です。<br/>お早めにお受け取りください。」
            end
            opt 7b 運営がキャンセルした注文 (cancelledBy が OPERATOR)
                Orders-->>User: 「この注文は出店者からキャンセルされました<br/>（運営から：(理由)）」
            end
        end
    end
```

## 共通代替フローを直接書いた図

上の図の通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。`useAuth()` が `GET /api/auth/me` でログイン状態を読むのは、`Workspace` を新しく表示したとき（トップなど `Workspace` の外の画面からヘッダーの「注文履歴」を押した、`/purchases` の URL を直接開いた、再読み込みした）だけです。マイページなど `Workspace` の画面からヘッダーの「注文履歴」を押したときは読み直しません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページの枠<br/>Workspace<br/>(Workspace.jsx)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Orders as 注文履歴画面<br/>BuyerOrders<br/>(BuyerOrders.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログイン状態と通信の準備<br/>readSession・authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 注文API<br/>OrderController<br/>(OrderController.java)
        participant Svc as 注文の処理<br/>OrderService<br/>(OrderService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt Workspace を新しく表示した (トップから「注文履歴」、URL を直接開いた、再読み込み)
        User->>Work: 「注文履歴」をクリック、または /purchases の URL を開く
        Work->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
        alt *a ログイン状態を読めない
            AuthJs-xAuthCtrl: GET /api/auth/me<br/>(届かない、または 200 と 403 以外。Cognito に届かない 503 を含む)
            AuthJs--xWork: エラーを投げる (届かないときはブラウザーの文、<br/>それ以外は「ログイン状態を確認できません。」)
            Work-->>User: *a-1 エラーの文だけを表示<br/>(「再取得」はない。やり直しはブラウザーの再読み込み)
        else *b ログインしていない (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=false (session)
            AuthJs-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログインの入力欄を表示
            Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: ログインするよう頼む (submit → passwordLogin)<br/>returnTo は今の URL
            AuthJs->>AuthCtrl: GET /api/auth/csrf (postAuth → authFetch)
            AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
            AuthJs->>PwCtrl: POST /api/auth/login
            PwCtrl->>Cog: メールアドレスとパスワードを確かめる<br/>(CognitoPasswordLogin の authenticate、InitiateAuth USER_PASSWORD_AUTH)
            Cog-->>PwCtrl: ID トークン、refresh トークン
            PwCtrl-->>AuthJs: 200 returnTo (セッションに認証情報を保存)
            AuthJs-->>Panel: returnTo
            Panel-->>User: *b-2 /purchases を読み込み直す (complete → window.location.replace)。<br/>この図の最初から、ログイン済みとしてやり直す
        else ログイン済み
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=true
            AuthJs-->>Work: ログイン中の会員
            Work->>Orders: BuyerOrders を表示
        end
    else マイページなど Workspace の画面からヘッダーの「注文履歴」をクリック
        User->>Work: 共通ヘッダーの「注文履歴」をクリック
        Work->>Orders: URL を /purchases に変え、BuyerOrders を表示<br/>(ログイン状態は読み直さない)
    end

    Orders->>Hook: 注文の一覧を取りに行くよう頼む (useResource)
    Hook->>Http: 一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/orders
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/orders
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/purchases のログイン画面<br/>(ログインの後は *b-2 で注文履歴に戻る)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/orders
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/orders
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 購入者を確かめ、カートを調べてから、<br/>注文の一覧を作るよう頼む (resolve → list)
        Svc->>Db: 注文、明細、画像、決済、返金、店舗、会員を読む<br/>(上の図の 13〜35)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (reload の catch → setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 注文の一覧
            Ctrl-->>Http: 200 注文の配列
            Http-->>Hook: 注文の一覧
            Hook-->>Orders: 注文の一覧
            Orders-->>User: 注文の一覧 (なければ「注文はありません。」)
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 一覧を取り直す (reload)。流れはこの図の 28 から同じ
    end
```

## ユースケース記述との差

- 基本フロー 7 の「商品番号」は、画面では「SKU」の後に値を出します（`BuyerOrders.jsx` の `OrderBody` の `SKU {line.sku}`）。「商品番号」という文言は出ません。
- 「注文はありません。」は、注文が 0 件のとき（2a）だけでなく、絞り込んだ結果が 0 件のときにも出ます。条件は `resource.data && shown.length === 0` です。
- 絞り込みボタンに「支払い待ち」はありません。支払い待ちの注文は「すべて」でだけ出ます。
- 7b の判定は、注文をキャンセルした会員が運営（`isAdmin()`）かどうかです（`OrderResponseMapper` の `cancelledBy`）。店舗の閉鎖・組織の停止によるまとめてキャンセルのほか、運営のアカウントが出店者の画面からキャンセル申請を承認した場合も、7b の文が出ます。このとき「キャンセル申請（承認）：理由」の行も一緒に出ます。
- 注文の詳細は、一覧の取得（`GET /api/orders`）で受け取ったデータを開くだけで、詳細を取り直す通信はありません。
- 「準備完了日時」「引き渡し完了日時」は、まだなら「未完了」と出ます（`PickupDetails`）。
- `GET /api/orders` は、注文を読む前に `CartSessionResolver.resolve()` を通ります。会員の行をロックし、カートが無ければ作ります（`MemberCartService.resolve()`）。返したカートの ID は一覧では使いません。記述にない処理です。
- 共通ヘッダーの「注文履歴」をトップなど `Workspace` の外の画面から押すと、`Workspace` を新しく表示するので、`GET /api/auth/me` でログイン状態を読み直します。マイページなど `Workspace` の画面から押したときは読み直しません。
- コードにあって記述にない処理です。
  - アプリを開いたときに `useShop.js` の `refresh()` も `GET /api/orders` を呼び、`shop.orders` に入れます。注文履歴の画面はこれを使わず、`BuyerOrders` の `useResource('/orders')` で取り直します。
  - 運営のアカウント（`ADMIN`）も、自分の注文履歴を見られます（`AuthService.requireBuyer()`）。
  - 注文の詳細には「受取連絡先を編集」（`PUT /api/orders/{id}`）、「購入履歴を非表示にする」（`DELETE /api/orders/{id}`）、「注文のキャンセルを申請」（[EC-B14](<EC-B14_注文キャンセルを申請する.md>)）もあります。関連情報に書かれた操作なので、この図には描いていません。
- 店舗側・出店申請用のアカウントで開いたときの文（`buyerOnlyMessage`）は、事前条件の外ですが、関連情報に書かれているので図に入れています。API を直接呼ぶと 403 `BUYER_REQUIRED` になります（`AuthService.requireBuyer()`）。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/packages/site-header/KusakariHeader.jsx): `follow`、「注文履歴」のリンク
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `navigateFromHeader`、`Workspace` の表示
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `/purchases` の分岐、`error` の表示、未ログインの `AuthPanel`、`isShopAccount` と `buyerOnlyMessage`
- [frontend/src/workspace/BuyerOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/BuyerOrders.jsx): `BuyerOrders`、`filters`、`OrderCard`、`OrderBody`、`Thumbnail`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`、`PaymentState`、`PickupDetails`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/payment.js): `paymentStatusLabels`、`refundStatusLabels`、`paymentLabel`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`isShopAccount`、`buyerOnlyMessage`、`wasSignedIn`、`login`、`postAuth`、`passwordLogin`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`、`submit`、`complete`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `refresh`（`api.orders()`）
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `lockMember`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer`、`current`、`session`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderService.java): `list`、`view`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `toView`（`paymentStatus`、`refundStatus`、`storeClosing`、`cancelledBy`）
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByBuyerMemberIdAndDeletedAtIsNullOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java): `findAllForOrder`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findImageReferences`
- [backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/RefundRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/payment/persistence/repository/RefundRepository.java): `findByOrderId`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/StoreEntity.java): `isClosing`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): `authenticate`、`refresh`、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`
