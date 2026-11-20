# EC-A01 会員を検索・確認する

- ユースケース記述: [EC-A01_会員を検索・確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A01_会員を検索・確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 会員管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインならログインの画面を表示する)

    Note over User,Db: 基本フロー 1〜2 画面を開いて会員の一覧を表示する
    User->>Page: 運営者メニューの「会員管理」をクリック
    Page->>Api: GET /api/operator/members
    Api->>Api: ログイン中の会員が運営者かを検査
    Api->>Db: 会員をすべて読む
    Db-->>Api: members の行
    Api->>Db: オーナーと担当者の会員ごとに、<br/>操作できる店舗を読む
    Db-->>Api: 組織・店舗・担当の行
    Api-->>Page: 200 会員の配列
    alt 2a 会員が 1 人もいない
        Page-->>User: 「対象の会員はありません。」
    else 会員がいる
        Page-->>User: 「名前・メール検索」欄と会員の一覧<br/>氏名、メールアドレス、アカウントの種類、利用状態
    end

    Note over User,Db: 基本フロー 3〜4 検索する (取得済みの一覧を画面で絞り込み、通信しない)
    User->>Page: 「名前・メール検索」欄に<br/>氏名かメールアドレスの一部を入力
    Page->>Page: 氏名とメールアドレスに<br/>入力した文字を含む会員だけ残す
    alt 3a 入力欄が空になった
        Page-->>User: 全会員の一覧
    else 該当する会員がいる
        Page-->>User: 部分一致した会員だけの一覧
    else 4a 該当する会員がいない
        Page-->>User: 「検索条件に一致する会員はありません。」
        Note right of User: 4a-2 検索条件を変えて<br/>基本フロー 3 へ戻る
    end
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as MembersPage<br/>OperatorPages.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as MemberController
        participant Svc as MemberService
        participant Auth as AuthService
        participant Repo as AuthMember<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。Workspace は未ログインなら AuthPanel を出し、<br/>API は未ログインの要求に 401 LOGIN_REQUIRED を返す (AuthConfiguration)

    Note over User,Db: 基本フロー 1〜2 画面を開いて会員の一覧を表示する
    User->>Work: 運営者メニューの「会員管理」をクリック
    Note right of Work: WorkspaceSidebar.jsx の PageLink が<br/>navigate('/operator/members') を呼ぶ。<br/>session.accountType が ADMIN でなければ<br/>「この画面を利用する権限がありません。」を出す
    Work->>Page: path が /operator/members なので<br/>MembersPage を表示
    Page->>Hook: useResource('/operator/members')
    Note right of Hook: useEffect が reload() を自動で実行する。<br/>取得中は ResourceStatus が「読み込んでいます。」を出す
    Hook->>Http: request('/operator/members')
    Http->>Ctrl: GET /api/operator/members
    Ctrl->>Svc: list()
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: requireAdmin()
    Note right of Auth: current() でログイン中の会員を読み、<br/>ADMIN でなければ ApiException(403, FORBIDDEN)。<br/>画面が ADMIN 以外にこの画面を出さないので、<br/>図では枝を省略
    Auth-->>Svc: 戻る
    Svc->>Repo: findAll()
    Repo->>Db: SELECT members
    Db-->>Repo: 全会員の行
    Repo-->>Svc: AuthMember のリスト
    loop 会員ごと
        Svc->>Auth: storeIdsOf(m)
        Note right of Auth: オーナーは組織の全店舗、担当者はロールのある<br/>店舗を読む。読む Repository は図では省略
        Auth-->>Svc: 店舗 ID のリスト
    end
    Svc-->>Ctrl: Member のリスト<br/>(id、name、email、accountType、storeIds、enabled、withdrawnAt)
    Ctrl-->>Http: 200 Member の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Note right of Page: 取得に失敗すると ResourceStatus が<br/>message と「再取得」ボタンを出す (共通代替フロー *a)
    Page->>Page: all.filter で絞り込む<br/>(query は空なので全員が残る)
    alt 2a all が空
        Page-->>User: 「対象の会員はありません。」
    else 会員がいる
        Note right of Page: withdrawnAt があれば「退会済み」、<br/>enabled が真なら「利用中」、偽なら「利用停止」
        Page-->>User: 検索欄と会員の一覧<br/>name、email、accountType、利用状態
    end

    Note over User,Db: 基本フロー 3〜4 検索する (サーバーには問い合わせない)
    User->>Page: 「名前・メール検索」欄に入力
    Page->>Page: onChange で setQuery(入力値)
    Page->>Page: all.filter で、name と email を空白でつないだ<br/>文字列が query を含む会員だけ残す (includes)
    alt 3a 入力欄が空になった
        Page-->>User: 全会員の一覧 (空文字はすべてに含まれる)
    else 該当する会員がいる
        Page-->>User: 部分一致した会員だけの一覧
    else 4a 該当する会員がいない
        Page-->>User: 「検索条件に一致する会員はありません。」
        Note right of User: 4a-2 検索条件を変えて<br/>基本フロー 3 へ戻る
    end
```

## ユースケース記述との差

- 2a: 一覧は `members.findAll()` で運営者自身も含む全会員を返します。運営者がログインしている間は一覧が空にならないため、2a の「対象の会員はありません。」は通常の操作では出ません。
- 基本フロー 4: 絞り込みは JavaScript の `includes` です。大文字と小文字を区別し、入力の前後の空白も取り除きません。記述にはこの決まりが書かれていません。
- 基本フロー 2: サーバーは会員ごとに `AuthService.storeIdsOf()` を呼び、操作できる店舗の ID（`storeIds`）を応答に入れます。会員管理画面はこの値を使いません。記述にない処理です。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/WorkspaceSidebar.jsx): `WorkspaceSidebar`、`MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate`、`usePath`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `MembersPage`（`query`、`all.filter`、空の一覧の文言）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `list`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `list`、`Member`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`、`storeIdsOf`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findAll`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 LOGIN_REQUIRED）
