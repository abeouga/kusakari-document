# EC-C02 管理者画面のメニューを開く

- ユースケース記述: [EC-C02_管理者画面のメニューを開く](<../../アーカイブ/ユースケース/kusakari-ec/EC-C02_管理者画面のメニューを開く.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
EC の画面は 1 つの React アプリで、「管理者画面」をクリックしても読み込み直しません。「メイン」画面から移ると `Workspace` が新しく作られるので、その `useAuth` がログイン状態を `GET /api/auth/me` で読み直します。共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、画面の中だけで終わるもの（3 の「会員管理」以外のメニュー、サイドバーの折りたたみ）は、クリックの矢印 1 本だけを描き、結果と画面は Note に文で書いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Nav as URL の切り替え<br/>navigate・usePath<br/>(navigation.js)
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Side as サイドバー<br/>WorkspaceSidebar<br/>(WorkspaceSidebar.jsx)
        participant Members as 会員管理画面<br/>MembersPage<br/>(OperatorPages.jsx)
        participant UseAuth as ログイン状態の確認<br/>useAuth<br/>(useAuth.js)
        participant AuthJs as ログイン状態の読み込み<br/>readSession<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant AuthSvc as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 8 (URL を直接開いたときも同じ) に適用<br/>*a 通信に失敗した場合: 8 に適用

    User->>Head: 共通ヘッダーの「管理者画面」をクリック<br/>(運営者のときだけ出る。showAdmin)
    Head->>App: クリックした URL を渡す (follow → onNavigate)
    App->>Nav: URL を /operator に変える (navigateFromHeader → navigate)
    Nav-->>App: /operator を /operator/members に置き換えた path<br/>(usePath → currentPath。履歴は増やさない)
    App->>Work: path が / と /cart 以外なので Workspace を表示<br/>(「メイン」画面から移ったので新しく作る)
    Work->>UseAuth: ログイン状態を読むよう頼む (useAuth)
    UseAuth->>AuthJs: 作られたときに自動で読む (refreshSession → readSession)
    AuthJs->>AuthCtrl: GET /api/auth/me
    AuthCtrl->>AuthSvc: ログイン状態を作るよう頼む (me → session)
    AuthSvc->>Db: ログイン中の会員と所属を読む<br/>(current、organizationIdOf、organizationRoleOf、storeIdsOf、SELECT members ほか)
    AuthSvc-->>AuthCtrl: ログイン状態
    AuthCtrl-->>AuthJs: 200 ログイン状態 (authenticated=true、accountType は ADMIN)
    AuthJs-->>UseAuth: ログイン状態
    UseAuth-->>Work: ログイン状態
    Work->>Work: path が /operator で始まり、accountType が ADMIN なので<br/>運営者メニューにする (operatorMenu、折りたためる)
    Work->>Side: 運営者メニューを渡す (WorkspaceSidebar)
    Side-->>User: 「運営者メニュー」と「メニューを閉じる」、「商品一覧へ戻る」、<br/>「会員管理」「商品管理」「カテゴリ管理」「出店審査」<br/>「店舗管理」「組織管理」「全注文管理」
    Work->>Members: 見出し「会員管理」の下に MembersPage を表示
    Members-->>User: 「会員管理」画面<br/>(会員の一覧の取得 GET /api/operator/members と表示は EC-A01)

    opt 3 指定のメニューが「会員管理」以外
        User->>Side: サイドバーの対象のメニュー (「商品管理」など) をクリック
        Note over User,Side: 結果: URL を対象の path に変え、Workspace を描き直す (MenuLink の PageLink → navigate)。ログイン状態は読み直さない。<br/>画面: そのメニューの見出しと画面 (ReviewPage、CategoriesPage、OrderPage など。内容は呼び出し元のユースケース)
    end
    opt サイドバーを折りたたむ
        User->>Side: 「メニューを閉じる」をクリック
        Note over User,Side: 結果: Workspace に折りたたむよう伝える (onToggle → setSidebarClosed)。<br/>画面: アイコンだけのサイドバー。ボタンは「メニューを開く」になる
    end
```

![EC-C02 シーケンス図](<images/EC-C02_管理者画面のメニューを開く-1.png>)

## 共通代替フローを直接書いた図

上の図の `GET /api/auth/me`（上の図の 8）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。URL（`/operator` や `/operator/members`）を直接開いたときも、`Workspace` が作られて同じ流れになります。サイドバーのメニューのクリックと折りたたみは通信しないので、共通代替フローは起こりません。会員の一覧の通信（`GET /api/operator/members`）の \*a・\*b は EC-A01 で扱うので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Head as 共通ヘッダー<br/>KusakariHeader<br/>(KusakariHeader.jsx)
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態の確認<br/>useAuth<br/>(useAuth.js)
        participant Panel as ログインの入力欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant AuthJs as ログイン状態の読み込み<br/>readSession・passwordLogin<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
    end
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt 共通ヘッダーから開いた
        User->>Head: 共通ヘッダーの「管理者画面」をクリック
        Head->>App: URL を /operator/members に変える (上の図の 2〜4)
    else URL を直接開いた (再読み込みを含む)
        User->>App: /operator か /operator/members の URL を開く
    end
    App->>Work: Workspace を表示
    Work->>UseAuth: ログイン状態を読むよう頼む (useAuth)
    Work-->>User: 読み終わるまで「ログイン状態を確認しています。」
    UseAuth->>AuthJs: 作られたときに自動で読む (refreshSession → readSession)
    alt *a 届かない
        AuthJs-xFilter: GET /api/auth/me
        AuthJs--xUseAuth: エラーを投げる (fetch の TypeError)
        UseAuth-->>Work: エラーの文 (setError)
        Work-->>User: *a-1 ブラウザーが作った文だけを出す (メニューも出さない)。<br/>「再取得」はなく、*a-3 のやり直しはブラウザーの再読み込み
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: GET /api/auth/me
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>AuthJs: 503 AUTH_UNAVAILABLE (セッションは残す)
        AuthJs--xUseAuth: 200 以外なので「ログイン状態を確認できません。」<br/>のエラーを投げる (readSession)
        UseAuth-->>Work: エラーの文 (setError)
        Work-->>User: *a-1「ログイン状態を確認できません。」だけを出す
    else *b ログインしていない (サーバーのセッションがない、refresh トークンが失効)
        AuthJs->>Filter: GET /api/auth/me
        Filter->>AuthCtrl: 要求を通す (/api/auth/me は 401 のときも chain.doFilter)
        AuthCtrl-->>AuthJs: 200 authenticated=false (me → session)
        AuthJs-->>UseAuth: ログインしていない状態
        UseAuth-->>Work: ログインしていない状態
        Work->>Panel: 画面の代わりにログインの入力欄を出す (AuthPanel)
        Panel-->>User: *b-1 メールアドレス、パスワード、「ログイン」
        User->>Panel: 入力して「ログイン」をクリック
        Panel->>AuthJs: ログインするよう頼む<br/>(submit → passwordLogin、returnTo は今の URL)
        AuthJs->>PwCtrl: POST /api/auth/login (前に GET /api/auth/csrf)<br/>Cognito で確かめ、セッションを作る (中身は 00 の *b-2)
        PwCtrl-->>AuthJs: 200 returnTo
        AuthJs-->>Panel: returnTo
        Panel-->>User: *b-2 returnTo の /operator/members を読み込み直す<br/>(complete → window.location.replace)。この図の 3 (URL を直接開いた) からやり直す
    else ログインしている
        AuthJs->>Filter: GET /api/auth/me
        Filter->>AuthCtrl: 要求を通す (chain.doFilter)
        AuthCtrl-->>AuthJs: 200 authenticated=true、accountType は ADMIN
        AuthJs-->>UseAuth: ログイン中の会員
        UseAuth-->>Work: ログイン中の会員
        Work-->>User: 運営者メニューと「会員管理」画面 (上の図の 15〜19)
    end
```

![EC-C02 共通代替フローを直接書いた図](<images/EC-C02_管理者画面のメニューを開く-2.png>)

## ユースケース記述との差

- 関連情報は共通代替フロー \*b だけを挙げていますが、`GET /api/auth/me` には \*a も起こります。このときは `api.js` を通らないので、\*a-1 の共通の文（「サーバーに接続できません。…」）にはならず、ブラウザーが作った文か「ログイン状態を確認できません。」だけが出ます。「再取得」のボタンはなく、やり直すにはブラウザーで再読み込みします。
- サイドバーの先頭に「商品一覧へ戻る」があります。記述にありません。
- 基本フロー 2: `navigation.js` の `currentPath()` が `/operator` を `/operator/members` に置き換えるので、最初に「会員管理」画面が出ます。履歴は増やさないので、ブラウザーの「戻る」で `/operator` には戻りません。
- 運営者以外が運営者画面の URL を開いたときの「この画面を利用する権限がありません。」は、画面（`Workspace`）が `accountType` で決めます。このとき運営者用の API は送りません。事前条件が運営者のログインなので、図には書いていません。
- 「管理者画面」を、マイページなど `Workspace` の画面から押したときは、`Workspace` が作り直されないので、`GET /api/auth/me` を送りません。記述の事前条件（「メイン」画面など）に合わせて、図は「メイン」画面から押したときを書いています。
- 停止・除名されたアカウントで `GET /api/auth/me` が 403 になったときは、`readSession()` がその文（「このアカウントは利用できません。」など）を投げ、`Workspace` がその文だけを出します。共通代替フローではないので、図には書いていません。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/packages/site-header/KusakariHeader.jsx): `KusakariHeader`、`follow`（「管理者画面」は `showAdmin` のときだけ）
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `navigateFromHeader`、`showAdmin` の判定、`Workspace` の表示
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`usePath`、`currentPath`（`/operator` の置き換え）
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`（`operatorMenu`、権限の判定、未ログインの `AuthPanel`、`error` の表示、`setSidebarClosed`、`title`）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`、`onToggle`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `MembersPage`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`（`refreshSession`）
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`passwordLogin`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `AuthPanel`（`submit`、`complete`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `session`、`current`、`organizationIdOf`、`organizationRoleOf`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、`/api/auth/me` は 401 でも通す、503 のときはセッションを残す）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
