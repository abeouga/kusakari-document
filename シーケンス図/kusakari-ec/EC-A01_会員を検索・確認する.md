# EC-A01 会員を検索・確認する

- ユースケース記述: [EC-A01_会員を検索・確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A01_会員を検索・確認する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

`ref` の行は、そこで共通代替フローが起こりうることを示します。中身は 00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    participant Page as 会員管理画面<br/>(MembersPage)
    participant Ctrl as 会員管理CTRL<br/>(MemberController)
    participant Svc as 会員管理サービス<br/>(MemberService)
    participant Mem as 会員テーブル<br/>(members)
    participant Store as 組織・店舗テーブル<br/>(organizations ほか)

    Note over User,Store: 会員一覧の表示
    User->>Page: /operator/members へ
    Note over User,Store: ref 共通代替フロー *b 未ログインの場合
    Page->>Ctrl: GET /api/operator/members
    Ctrl->>Svc: list()
    Svc->>Svc: 運営者か確認 (requireAdmin)
    Svc->>Mem: 会員を全件取得
    Mem-->>Svc: 会員の一覧
    loop 会員ごと (読むのはオーナーと担当者だけ)
        Svc->>Store: 操作できる店舗を取得
        Store-->>Svc: 店舗 ID
    end
    Svc-->>Ctrl: 会員の一覧
    Ctrl-->>Page: JSON (会員の配列)
    Note over User,Store: ref 共通代替フロー *a 通信に失敗した場合、*b 未ログインの場合 (ログインの期限切れ)
    Page-->>User: 検索欄と会員の一覧を表示

    Note over User,Store: 会員の検索 (通信しない)
    User->>Page: 「名前・メール検索」に入力
    Page->>Page: 氏名とメールの部分一致で絞り込み
    alt 該当する会員がいる (空欄なら全員)
        Page-->>User: 該当する会員の一覧
    else 4a 該当する会員がいない
        Page-->>User: 「検索条件に一致する会員はありません。」
    end
```

## 共通代替フローを直接書いた図

上の図の `ref` の行に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。会員の検索は通信しないので、共通代替フローは起こりません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    participant Page as 会員管理画面<br/>(MembersPage)
    participant Notice as 期限切れのお知らせ<br/>(SessionNotice)
    participant Login as ログイン欄<br/>(AuthPanel)
    participant AuthCtrl as 認証CTRL<br/>(AuthController ほか)
    participant Ctrl as 会員管理CTRL<br/>(MemberController)
    participant Svc as 会員管理サービス<br/>(MemberService)
    participant Mem as 会員テーブル<br/>(members)
    participant Store as 組織・店舗テーブル<br/>(organizations ほか)
    participant Cog as Amazon Cognito

    Note over User,Cog: ログインの確認
    User->>Page: /operator/members へ
    Page->>AuthCtrl: GET /api/auth/me
    alt *b ログインしていない
        AuthCtrl-->>Page: authenticated=false
        Page->>Login: 画面の代わりにログイン欄を表示
        Login-->>User: *b-1 メールアドレスとパスワードの入力欄
        User->>Login: 入力して「ログイン」
        Login->>AuthCtrl: POST /api/auth/login
        AuthCtrl->>Cog: InitiateAuth (USER_PASSWORD_AUTH)
        Cog-->>AuthCtrl: ID トークン
        AuthCtrl->>Mem: 会員を取得 (初めてなら追加)
        Mem-->>AuthCtrl: 会員
        AuthCtrl-->>Login: 戻り先 (returnTo)
        Login->>Page: *b-2 /operator/members を読み込み直す
        Page->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>Page: authenticated=true
    else ログイン済み
        AuthCtrl-->>Page: authenticated=true
    end

    Note over User,Cog: 会員一覧の表示
    Page->>Ctrl: GET /api/operator/members
    alt *a ブラウザーから届かない、または応答が JSON でない
        Page-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (セッションがない、refresh トークンが失効)
        Ctrl-->>Page: 401 LOGIN_REQUIRED
        Page->>Notice: 期限切れを知らせる
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        Note over User,Cog: 「ログインする」を押すとログイン画面へ移り、ログインの後 *b-2 で /operator/members に戻る
    else *a ID トークンの更新で Cognito に届かない
        Ctrl-xCog: ID トークンの更新
        Ctrl-->>Page: 503 AUTH_UNAVAILABLE
        Page-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が届いた
        Ctrl->>Svc: list()
        Svc->>Svc: 運営者か確認 (requireAdmin)
        Svc->>Mem: 会員を全件取得
        alt *a MySQL との通信に失敗
            Mem--xSvc: 失敗
            Svc-->>Ctrl: DataAccessException
            Ctrl-->>Page: 503 DATABASE_UNAVAILABLE
            Page-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Mem-->>Svc: 会員の一覧
            loop 会員ごと (読むのはオーナーと担当者だけ)
                Svc->>Store: 操作できる店舗を取得
                Store-->>Svc: 店舗 ID
            end
            Svc-->>Ctrl: 会員の一覧
            Ctrl-->>Page: JSON (会員の配列)
            Page-->>User: 検索欄と会員の一覧を表示
        end
    end
    opt *a-3 「再取得」を押した
        User->>Page: 「再取得」
        Page->>Ctrl: GET /api/operator/members (同じ要求をもう一度)
    end

    Note over User,Cog: 会員の検索 (通信しない)
    User->>Page: 「名前・メール検索」に入力
    Page->>Page: 氏名とメールの部分一致で絞り込み
    alt 該当する会員がいる (空欄なら全員)
        Page-->>User: 該当する会員の一覧
    else 4a 該当する会員がいない
        Page-->>User: 「検索条件に一致する会員はありません。」
    end
```

## ユースケース記述との差

- 2a（会員が 1 人もいない）は図に書いていません。一覧は `members.findAll()` で、ログイン中の運営者本人も含む全会員を返します。運営者がログインしている間は一覧が空にならないので、2a は起こりません。コードには `all.length === 0` のときの「対象の会員はありません。」の表示が残っています。
- 3a（入力欄が空になった）は、分岐ではなく基本フロー 4 の中に書いています。空の入力に別の処理はなく、`includes('')` がすべての会員で真になるので、同じ絞り込みで全員が残ります。
- 基本フロー 4: 絞り込みは JavaScript の `includes` です。大文字と小文字を区別し、入力の前後の空白も取り除きません。記述にはこの決まりが書かれていません。
- 基本フロー 2: サーバーは会員ごとに `AuthService.storeIdsOf()` を呼び、操作できる店舗の ID（`storeIds`）を応答に入れます。会員管理画面はこの値を使いません。記述にない処理です。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出し、一覧を取りに行きません。API も `requireAdmin()` で 403 を返します。事前条件が運営者のログインなので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `Workspace`（未ログインのときの `AuthPanel`、運営者の確認、path と画面の対応）
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `MembersPage`（`query`、`all.filter`、一覧が空のときの文言）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `networkErrorMessage`、`sessionExpiredMessage`、`readResponse`、`send`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`passwordLogin`、`wasSignedIn`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): ログイン欄
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `list`、`Member`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`storeIdsOf`、`session`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `GET /api/auth/me`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): ID トークンの更新、401 `LOGIN_REQUIRED`
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): 503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `database`（503 `DATABASE_UNAVAILABLE`）
