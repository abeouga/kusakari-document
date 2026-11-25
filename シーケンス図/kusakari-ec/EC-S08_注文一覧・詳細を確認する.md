# EC-S08 注文一覧・詳細を確認する

- ユースケース記述: [EC-S08_注文一覧・詳細を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S08_注文一覧・詳細を確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは図に描かず、図の下に並べています。1a（管理する店舗を選ぶ）は、`opt` の中の矢印 1 本と Note にしています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 店舗受け取り画面<br/>OrderPage<br/>(PickupOrders.jsx)
        participant Card as 注文のカード<br/>PickupCard<br/>(PickupOrders.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文の処理API<br/>OrderWorkflowController<br/>(OrderWorkflowController.java)
        participant Svc as 注文の処理<br/>OrderWorkflowService<br/>(OrderWorkflowService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant OrderRepo as 注文の読み書き<br/>OrderRepository<br/>(OrderRepository.java)
        participant ItemRepo as 注文明細の読み込み<br/>OrderItemRepository<br/>(OrderItemRepository.java)
        participant Mapper as 注文の応答の組み立て<br/>OrderResponseMapper<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、6 に適用<br/>*a 通信に失敗した場合: 6 に適用

    User->>Work: 出店者メニューの「店舗受け取り」をクリック
    Work->>Page: URL を /seller/orders に変え、<br/>選択中の店舗の ID を渡して OrderPage を表示
    opt 1a 複数の店舗を扱う
        User->>Work: 1a-1 画面上部の「管理する店舗」の選択欄 (SellerStoreSelect) で、確認する店舗を選ぶ
        Note over User,Page: 結果: 選んだ店舗を覚え (setSellerStoreId)、その店舗の ID を渡す。OrderPage は作り直さず、絞り込みと検索欄はそのまま。<br/>画面: 選んだ店舗の注文を取り直して表示する (この後の流れ)
    end
    Page->>Hook: 店舗の注文を取りに行くよう頼む (useResource)<br/>店舗の ID が変わるたびに取り直す
    Hook->>Http: 自動で一覧の通信を始める (reload → request)
    Http->>Ctrl: GET /api/seller/orders?storeId={店舗ID}
    Ctrl->>Svc: 店舗の注文の一覧を作るよう頼む (sellerOrders)<br/>読むだけのトランザクション
    Svc->>Auth: ログイン中の人がこの店舗で STAFF 以上の<br/>ロールを持つかを確かめる (requireSeller → requireStoreRole)
    Svc->>OrderRepo: 店舗の注文を新しい順に読む<br/>(findByStoreIdOrderByCreatedAtDesc、SELECT orders)
    loop 注文ごと (storeView)
        Svc->>ItemRepo: 注文の明細を読む (findAllForOrder、SELECT order_items)
        Svc->>Mapper: 店舗向けの注文の形にするよう頼む (toStoreView)<br/>商品の画像、支払い、返金、店舗、キャンセルした会員を読む<br/>(findImageReferences、findById、findByOrderId。products、payments、refunds、stores、members)
        Mapper-->>Svc: 注文 (明細、受取連絡先、お支払い方法、支払いと返金の状態、<br/>キャンセルした人が運営なら OPERATOR、販売手数料)
    end
    Ctrl-->>Hook: 200 注文の配列
    Hook-->>Page: 注文の一覧
    Page->>Page: 絞り込みは「すべて」、検索欄は空で、キャンセル申請中、<br/>準備待ち、受け取り待ち、そのほかの順に並べる (priority)
    Page-->>User: 絞り込みのボタン (「準備待ち」「受け取り待ち」「キャンセル申請」<br/>「引き渡し完了」「キャンセル」「すべて」と件数) と<br/>「注文番号・受取人で検索」欄
    loop 表示する注文ごと
        Page->>Card: 注文を渡して表示 (PickupCard)
        Card-->>User: 注文番号、注文日時、注文状態、「キャンセル申請中」、合計、<br/>お支払い方法と支払い・返金の状態 (PaymentState)。<br/>注文受付・受取準備完了は明細と受取連絡先も出し、<br/>引き渡し完了・キャンセルは「商品名 × 数量」と「詳細」にたたむ
        opt 6a 運営がキャンセルした注文 (cancelledBy が OPERATOR)
            Card-->>User: 6a-1「運営がキャンセルしました：(理由)」
        end
        opt 6b 返金に失敗した注文 (refundStatus が FAILED)
            Card-->>User: 6b-1「返金に失敗しました。Stripe の管理画面で<br/>返金の状態を確認し、購入者に連絡してください。」
        end
    end

    User->>Page: 絞り込みのボタンのどれかをクリックするか、<br/>「注文番号・受取人で検索」欄に注文番号か受取人名を入力
    Page->>Page: 選んだ状態か入力を覚え (setFilter、setQuery)、その状態の注文のうち、<br/>注文番号と受取人名に入力 (前後の空白を除き小文字にする) を<br/>含む注文だけ残して、priority で並べる (入力欄が空ならその状態の全部)
    Page-->>User: 条件に合う注文だけのカード (流れは 17〜20 と同じ)
    User->>Card: 引き渡し完了・キャンセルの注文の「詳細」をクリック
    Card-->>User: ブラウザーがたたんでいた欄を開き (details 要素)、明細 (商品名、SKU、<br/>数量、金額)、受取人、電話番号、連絡先メール、受け取りの進み具合を見せる。<br/>一覧の取得で読み込み済みなので通信しない
```

![EC-S08 シーケンス図](<images/EC-S08_注文一覧・詳細を確認する-1.png>)

図に描いていない代替フロー：2a（注文がない、条件に合う注文がない）、（記述なし）の分岐

## 共通代替フローを直接書いた図

上の図の、画面を開いて注文の一覧を取る通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。絞り込み、検索、「詳細」は画面の中だけで通信しないので、共通代替フローは起こりません。この図は、同じ画面を使う [EC-S09](<EC-S09_注文を受取準備完了にする.md>)・[EC-S10](<EC-S10_注文を引き渡し完了にする.md>)・[EC-S13](<EC-S13_注文キャンセル申請を処理する.md>) の、画面を開くときの共通代替フローも兼ねます。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態の読み込み<br/>useAuth<br/>(useAuth.js)
        participant Panel as ログイン欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Page as 店舗受け取り画面<br/>OrderPage<br/>(PickupOrders.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>readSession・passwordLogin<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 注文の処理API<br/>OrderWorkflowController<br/>(OrderWorkflowController.java)
        participant Svc as 注文の処理<br/>OrderWorkflowService<br/>(OrderWorkflowService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みも同じ)
        User->>Work: /seller/orders を開く
        Work->>UseAuth: ログイン状態を読むよう頼む (useAuth → refreshSession)
        UseAuth->>AuthJs: ログイン状態を読む (readSession)
        alt *a ログイン状態を読めない
            AuthJs-xAuthCtrl: GET /api/auth/me
            AuthJs--xUseAuth: エラーを投げる (届かなければブラウザーの文、<br/>200 以外なら「ログイン状態を確認できません。」)
            UseAuth-->>Work: エラーの文 (setError)
            Work-->>User: *a-1 そのエラーの文だけ。「再取得」はなく、<br/>*a-3 はブラウザーの再読み込み
        else *b ログインしていない
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=false
            AuthJs-->>UseAuth: ログインしていない
            UseAuth-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログイン欄を表示 (AuthPanel)
            Panel-->>User: *b-1「メールアドレス」「パスワード」「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: ログインを頼む (submit → passwordLogin)<br/>returnTo は今の URL
            AuthJs->>PwCtrl: GET /api/auth/csrf のあと POST /api/auth/login
            PwCtrl->>Cog: メールアドレスとパスワードを確かめる<br/>(InitiateAuth USER_PASSWORD_AUTH)
            Cog-->>PwCtrl: ID トークン、refresh トークン
            PwCtrl-->>AuthJs: 200 returnTo
            AuthJs-->>Panel: 戻り先の URL
            Panel-->>User: *b-2 /seller/orders を読み込み直す (complete)。<br/>この図の 1 からやり直す
        else ログインしている
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=true
            AuthJs-->>UseAuth: ログイン中の会員
            UseAuth-->>Work: ログイン中の会員
            Work->>Page: OrderPage を表示
        end
    else メニューから開いた
        User->>Work: 出店者メニューの「店舗受け取り」をクリック
        Work->>Page: URL を /seller/orders に変え、OrderPage を表示。<br/>ログイン状態は読み直さない
    end

    Page->>Hook: 店舗の注文を取りに行くよう頼む (useResource)
    Hook->>Http: 自動で一覧の通信を始める (reload → request)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/seller/orders?storeId={店舗ID}
        Http--xHook: エラーを投げる (ApiError(networkErrorMessage, 0))
        Hook->>Status: エラーの文を出す (reload の catch → setError)
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b 使っている間にログインが切れた (サーバーのセッションがない、refresh トークンが失効)
        Http->>Filter: GET /api/seller/orders?storeId={店舗ID}
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる (wasSignedIn が真なので kusakari-session-expired)
        Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Hook->>Status: エラーの文を出す (setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/seller/orders のログイン画面<br/>(*b-2 ログインの後は店舗受け取り画面を開き直す)
    else *a ID トークンの更新で Cognito に届かない
        Http->>Filter: GET /api/seller/orders?storeId={店舗ID}
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xHook: エラーを投げる (ApiError 503)
        Hook->>Status: エラーの文を出す (setError)
        Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        Http->>Filter: GET /api/seller/orders?storeId={店舗ID}
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 店舗の注文の一覧を作るよう頼む (sellerOrders)
        Svc->>Db: ロールを確かめ、注文と明細などを読む (上の図の 8〜12)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (setError)
            Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 注文の一覧
            Ctrl-->>Http: 200 注文の配列
            Http-->>Hook: 注文の一覧
            Hook-->>Page: 注文の一覧
            Page-->>User: 絞り込みのボタン、検索欄、注文のカード
        end
    end
    opt *a-3 やり直す
        User->>Status: 「再取得」をクリック
        Status->>Hook: 一覧を取り直す (reload)。流れはこの図の 30 からと同じ
    end
```

![EC-S08 共通代替フローを直接書いた図](<images/EC-S08_注文一覧・詳細を確認する-2.png>)

## ユースケース記述との差

- 6a・6b: 記述は「詳細」をクリックしたあと（基本フロー 6）の代替フローにしています。コードでは、「運営がキャンセルしました：(理由)」と「返金に失敗しました。…」はカードの `details` 要素の外にあり、一覧を表示した時点（基本フロー 2）から出ています。
- 6a: `cancelledBy` が `OPERATOR` になるのは、注文をキャンセルした会員（`cancelled_by_member_id`）が運営（`isAdmin()`）のときです。店舗の閉鎖・組織の停止のまとめてキャンセル（`OpenOrders.cancelAll()`）のほか、運営のアカウントが出店者の画面からキャンセル申請を承認した注文（`decideCancellation()`）も同じ表示になります。
- 基本フロー 5〜6: 「詳細」は HTML の `details` 要素で、明細と受取連絡先は一覧の取得のときに読み込み済みです。開くときに通信はしません。注文 1 件を返す `GET /api/seller/orders/{id}` はありますが、この画面からは呼びません。
- 関連情報「ロールのない担当者は注文を見られない」: 所属店舗でロールのない担当者（`memberRole` が `NONE`）は、`requireSeller()` の 403 で「この操作の権限がありません。」と「再取得」が出ます。ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が人事の画面だけを使える旨を出し、通信しません。運営が停止した店舗と、存在しない店舗でも 403 になります。
- 基本フロー 3: 絞り込みのボタンの件数は、検索欄の入力にかかわらず、取得したすべての注文で数えます。支払い待ち（`PENDING_PAYMENT`）の注文は「すべて」でだけ出ます。検索は注文番号と受取人名を空白でつないだ文字列に入力が含まれるかで決め、大文字と小文字を区別しません。
- 1a: 店舗を選び直しても、`OrderPage` は作り直さないので、絞り込みのボタンと検索欄の状態は残ります。
- 一覧の取得の失敗（403 と共通代替フロー）は、`ResourceStatus` がエラーの文と「再取得」を出します。取得に失敗したときは「該当する注文はありません。」は出ません（`resource.data` が空のまま）。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`storePaths`、`rolePaths`、`personnelOnly`、未ログインのときの `AuthPanel`、`/seller/orders` と `OrderPage` の対応
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SellerStoreSelect.jsx): 「管理する店舗」の選択欄
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `sellerStoreId`、`setSellerStoreId`
- [frontend/src/workspace/PickupOrders.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/PickupOrders.jsx): `OrderPage`、`filters`、`priority`、`PickupCard`、`Progress`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`、`PaymentState`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/payment.js): `paymentLabel`、`paymentStatusLabels`、`refundStatusLabels`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`passwordLogin`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`、`refreshSession`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `submit`、`complete`、`returnTo`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/OrderWorkflowController.java): `seller`、`sellerOrder`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/service/OrderWorkflowService.java): `sellerOrders`、`storeView`、`decideCancellation`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `toStoreView`、`toView`、`figures`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderItemRepository.java): `findAllForOrder`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/persistence/entity/OrderEntity.java): `cancelByOperator`、`decideCancellation`
- [backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/OpenOrders.java): `cancelAll`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller`、`requireStoreRole`、`denied`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ログインと ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
