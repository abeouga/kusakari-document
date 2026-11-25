# EC-C01 アカウントのメニューを開く

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の枠<br/>App<br/>(App.jsx)
        participant Work as アカウント・店舗の画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Side as サイドバー<br/>WorkspaceSidebar<br/>(WorkspaceSidebar.jsx)
        participant Acc as 「アカウント情報」画面<br/>AccountPage<br/>(AccountPage.jsx)
        participant Panel as アカウントの表示<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant UseAuth as ログイン状態の取得<br/>useAuth<br/>(useAuth.js)
        participant AuthJs as ログインの通信<br/>readSession<br/>(auth.js)
        participant Res as 一覧などの取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant AppCtrl as 出店申請API<br/>StoreApplicationController<br/>(StoreApplicationController.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 7、17、30 に適用<br/>*a 通信に失敗した場合: 7、17、30 に適用

    User->>Header: 共通ヘッダーの「アカウント」をクリック<br/>(ログインしているときだけ出る)
    Header->>App: 移動先の URL を渡す (follow → onNavigate → navigateFromHeader)
    App->>Work: URL を /account に変え (navigate)、パスが / でも /cart でもないので<br/>Workspace を表示する (usePath)
    alt 「メイン」画面やカート画面から開いた (Workspace が新しく作られる)
        Work->>UseAuth: ログイン状態を読むよう頼む (useAuth)
        Work-->>User: 読み終わるまで「ログイン状態を確認しています。」
        UseAuth->>AuthJs: 画面を開いたときに自動で読む<br/>(useEffect → refreshSession → readSession)
        AuthJs->>Filter: GET /api/auth/me
        Filter->>AuthSvc: ログイン中の会員が使えるかを確かめる (current)<br/>会員を読み (findByIssuerAndSubject、SELECT members)、<br/>担当者なら組織の所属も読む (findForMember、SELECT organization_members)
        Filter->>AuthCtrl: 要求を通す (chain.doFilter)
        AuthCtrl->>AuthSvc: ログイン状態を作るよう頼む (session)<br/>会員、組織、組織の所属、店舗、店舗の担当を読む<br/>(current、organizationIdOf、organizationRoleOf、storeIdsOf)
        AuthSvc-->>AuthCtrl: ログイン状態 (SessionView。id、email、name、accountType、<br/>organizationId、organizationRole、storeIds)
        AuthCtrl-->>AuthJs: 200 ログイン状態 (authenticated が true)
        AuthJs-->>UseAuth: ログイン状態 (ログインを確かめたことを覚える。signedIn)
        UseAuth-->>Work: ログイン状態 (setSession)
    else アカウント・出店者などの画面から開いた (Workspace はそのまま)
        Work->>Work: 前に読んだログイン状態をそのまま使う (読み直さない)
    end

    Work->>Work: 出店申請用のアカウントかを確かめる<br/>(applicant は accountType が SHOP_OWNER_APPLICANT か)
    opt 出店申請用のアカウント
        Work->>AppCtrl: 自分の出店申請を取りに行く<br/>(useResource('/account/store-applications') → reload → request)<br/>GET /api/account/store-applications
        Note over Work,Db: 結果: ログイン中の会員の申請を新しい順に読み (list(false)、findByMemberIdOrderByCreatedAtDesc、SELECT organization_applications)、200 申請の配列を返す。<br/>画面: 申請があればメニューを「出店申請状況」、なければ「出店申請」にする (applications.data)
    end
    Work->>Work: サイドバーのメニューを作る。「マイページ」(buyerMenu)、「アカウント設定」(accountSettings)、<br/>出店申請用は「出店をご検討の方」(申請があれば「出店申請状況」、なければ「出店申請」)
    Work->>Side: 今のパスとメニューを渡す (WorkspaceSidebar path groups)
    Side-->>User: 「商品一覧へ戻る」、「マイページ」(「アカウント情報」「注文履歴」「通知一覧」)、<br/>「アカウント設定」(「受取連絡先」「パスワード変更」「退会」)、出店申請用は「出店をご検討の方」。<br/>「アカウント情報」を今の画面として示す
    Work->>Acc: 見出しを「アカウント情報」にし、「アカウント情報」画面を表示する<br/>(AccountPage tab='アカウント情報'、key はパス)
    Acc->>Res: ログイン状態も取りに行くよう頼む (useResource('/auth/me'))
    Res->>Http: 自動で通信を始める (useEffect → reload → request)
    Http->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>Http: 200 ログイン状態 (流れは 8〜12 と同じ)
    Http-->>Res: ログイン状態 (この画面では使わない)
    Acc->>Panel: アカウントの表示を出す (AuthPanel)
    Panel->>UseAuth: ログイン状態を読むよう頼む (useAuth)
    UseAuth->>AuthJs: 自動で読む (useEffect → refreshSession → readSession)
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl-->>AuthJs: 200 ログイン状態 (流れは 8〜12 と同じ)
    AuthJs-->>UseAuth: ログイン状態
    UseAuth-->>Panel: ログイン状態 (読み終わるまでは「ログイン状態を確認しています。」)
    Panel-->>User: 名前 (なければメールアドレス)、アカウントの種類 (accountLabels。<br/>「管理者」「出店者（オーナー）」「出店者（スタッフ）」「出店申請用アカウント」、ほかは「利用者」)、「ログアウト」

    opt 3 指定のメニューが「アカウント情報」以外
        User->>Side: サイドバーの対象のメニューをクリック<br/>(「通知一覧」「パスワード変更」「退会」「出店申請」「出店申請状況」など)
        Note over User,Side: 結果: URL をメニューの URL に変え (MenuLink の PageLink → follow → navigate)、Workspace に新しいパスを渡す (usePath)。作り直さず、ログイン状態は読み直さない。<br/>画面: パスに合う画面 (Notices、BuyerOrders、AccountPage の別の tab など。中身は呼び出し元のユースケースの次のステップ)
    end
```

![EC-C01 シーケンス図](<images/EC-C01_アカウントのメニューを開く-1.png>)
