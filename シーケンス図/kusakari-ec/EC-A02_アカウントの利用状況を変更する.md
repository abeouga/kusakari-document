# EC-A02 アカウントの利用状況を変更する

- ユースケース記述: [EC-A02_アカウントの利用状況を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A02_アカウントの利用状況を変更する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーは最重要の 6a（対象が運営者か退会済み）だけを描き、ほかの代替フローは図の下に並べています。6a のときの画面の後処理（`readResponse` が `ApiError` を投げる → 409 なので `reload` で一覧を取り直す → `run` が false → `setTarget(null)` でダイアログを閉じる → エラーの文を出す）は、Note に文で書いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 運営者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Page as 会員管理画面<br/>MembersPage<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 会員管理API<br/>MemberController<br/>(MemberController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 会員の処理<br/>MemberService<br/>(MemberService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Pend as オーナーの譲渡の申し出<br/>PendingOwnerSuccession<br/>(PendingOwnerSuccession.java)
        participant Repo as 会員の読み書き<br/>AuthMemberRepository<br/>(AuthMemberRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、20、一覧の取り直しの 37 に適用<br/>*a 通信に失敗した場合: 4、18、20、一覧の取り直しの 37 に適用

    User->>Work: 運営者メニューの「会員管理」をクリック
    Work->>Page: アカウント管理者画面を表示
    Page->>Hook: 会員の一覧を取りに行くよう頼む (useResource)
    Hook->>Ctrl: 画面の表示時に自動でアカウント一覧の取得を開始<br/>GET /api/operator/members (reload → request)
    Ctrl-->>Hook: 200 会員の配列<br/>流れは EC-A01 の図と同じ
    Hook-->>Page: 会員の一覧
    Page-->>User: 会員の一覧と利用状態 (「利用中」「利用停止」「退会済み」)、<br/>利用中なら「利用を停止」、そうでなければ「利用を再開」

    User->>Page: 対象の会員の「利用を停止」<br/>または「利用を再開」をクリック
    Page->>Dlg: 確認ダイアログを表示
    Dlg-->>User: 「利用状況変更の確認」、対象：氏名（メールアドレス）、変更の説明、<br/>「利用停止を確定」か「利用再開を確定」、「取消」

    alt 5a 確定を取り消した
        User->>Dlg: 「取消」をクリック<br/>(Esc キー、「閉じる」、ダイアログの外側のクリックも同じ)
        Dlg-->>User: ダイアログを閉じる
        Note over User,Dlg: 結果: 通信せず、利用状態は変わらない。<br/>画面: 会員の一覧に戻る。
    else 確定した
        User->>Dlg: 「利用停止を確定」または「利用再開を確定」をクリック
        Dlg->>Page: 確定したことを伝える
        Page->>Hook: 変更を実行し、成功の文を渡す (run)<br>停止なら「利用を停止しました。」、再開なら「利用を再開しました。」を表示
        Hook->>Http: アカウントの有効状態を切り替える
        Http->>AuthJs: 書き込みの前に CSRF トークンを取得
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
        AuthJs->>Ctrl: PUT /api/operator/members/{id}/enabled<br/>(CSRF トークンのヘッダー付き)
        Ctrl->>Svc: 会員の利用状態を変えるよう頼む (enable)<br/>enable 全体が 1 つのトランザクション
        Svc->>Auth: ログイン中の人が運営者かを確かめる (requireAdmin)
        Auth-->>Svc: 認証成功
        opt 停止するとき (記述なし)
            Svc->>Pend: 対象の会員が属する組織を<br>ロックする処理を呼ぶ (lockOrganizationOf)
            Note over Svc,Db: 結果: オーナーか担当者として属する組織の行を SELECT ... FOR UPDATE でロックする (組織 → 会員の順)。<br/>購入者などは組織がないのでロックしない。
        end
        Svc->>Repo: 対象の会員を読む (findById、SELECT members)
        Repo-->>Svc: 会員 (なければなし)
        Svc->>Db: 会員の行をロックして読み直す<br/>(lockMember、SELECT ... FOR UPDATE members)
        Db-->>Svc: ロックした会員の行
        break 6a 対象が運営者アカウントか退会済み (isAdmin、withdrawnAt)
            Svc--xErrs: 409 MEMBER_FIXED の例外を投げる (ApiException)
            Note over Errs,Page: 結果: 409 を返し、利用状態は変えない。<br/>画面: 6a-1 一覧を取り直し、ダイアログを閉じて「管理者または退会済み会員の状態は変更できません。」
        end
        Svc->>Svc: 会員の利用状態を書き換える (changeEnabled)
        opt 停止で、組織をロックした (記述なし)
            Svc->>Pend: 停止する会員が譲渡の申し出の当事者なら無効にするよう頼む<br/>(invalidateFor は譲渡先、invalidateForOwner は申し出たオーナー本人かを見る)
            Note over Svc,Db: 結果: 当事者なら承認待ちを空にし、履歴と、オーナーと譲渡先への通知 2 件を保存する<br/>(共通の invalidate と OwnerSuccessionNotices)。当事者でなければ何もしない。
        end
        Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE members ほか)
        Db-->>Svc: 完了
        Svc-->>Ctrl: 終わった
        Ctrl-->>Http: 200 変更後の値 ({ enabled })
        Http-->>Hook: 変更後の値
        Hook->>Ctrl: 一覧を取り直す (reload)<br/>GET /api/operator/members。流れは 4〜5 と同じ
        Ctrl-->>Hook: 最新の会員の一覧
        Hook-->>Page: 成功を返す (run が true、成功の文を設定)
        Page-->>User: ダイアログを閉じ (setTarget(null))、「利用を停止しました。」<br/>または「利用を再開しました。」と更新後の利用状態
    end
```

![EC-A02 シーケンス図](<images/EC-A02_アカウントの利用状況を変更する-1.png>)

図に描いていない代替フロー：（記述なし）の分岐（会員がいない）

## 共通代替フローを直接書いた図

上の図の確定の通信（CSRF トークンの取得と `PUT /api/operator/members/{id}/enabled`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて一覧を取る通信の \*a・\*b は、[EC-A01](<EC-A01_会員を検索・確認する.md>) の「共通代替フローを直接書いた図」と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as 会員管理画面<br/>MembersPage<br/>(OperatorPages.jsx)
        participant Dlg as 確認ダイアログ<br/>ConfirmDialog<br/>(ConfirmDialog.jsx)
        participant Status as エラーの表示<br/>ResourceStatus<br/>(ResourceView.jsx)
        participant Hook as 一覧の取得と変更<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 会員管理API<br/>MemberController<br/>(MemberController.java)
        participant Svc as 会員の処理<br/>MemberService<br/>(MemberService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>Dlg: 「利用停止を確定」または「利用再開を確定」をクリック
    Dlg->>Page: 確定したことを伝える (onConfirm → change)
    Page->>Hook: 変更を実行し、成功の文を渡す (run)
    Hook->>Http: 利用状態を書き換える通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (authFetch)
    alt *a CSRF トークンを取れない (届かない、または 200 以外)
        AuthJs-xAuthCtrl: GET /api/auth/csrf
        AuthJs--xHttp: エラーを投げる
        Http->>Http: 通信の失敗にまとめる<br/>(send の catch → ApiError(networkErrorMessage, 0))
        Http--xHook: エラーを投げる
        Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
        Hook-->>Page: 失敗を返す (run が false)
        Page->>Dlg: ダイアログを閉じる (setTarget(null))
        Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else CSRF トークンを取れた
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン
        alt *a PUT が届かない、または応答が JSON でない (変わったかは分からない)
            AuthJs-xFilter: PUT /api/operator/members/{id}/enabled
            Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
            Http--xHook: エラーを投げる
            Hook->>Status: エラーの文を出す (run の catch → setError)<br/>0 なので一覧は取り直さない
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setTarget(null))
            Status-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
        else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
            AuthJs->>Filter: PUT /api/operator/members/{id}/enabled
            Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
            Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
            Http--xHook: エラーを投げる (ApiError(sessionExpiredMessage, 401))
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setTarget(null))
            Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
            User->>Notice: 「ログインする」をクリック
            Notice->>AuthJs: ログイン画面へ移る (login)
            AuthJs-->>User: /account/login?returnTo=/operator/members のログイン画面<br/>(ログインの後は *b-2 で会員管理画面に戻る。利用状態は変わっていない)
        else *a ID トークンの更新で Cognito に届かない
            AuthJs->>Filter: PUT /api/operator/members/{id}/enabled
            Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
            Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
            Http--xHook: エラーを投げる (ApiError 503)
            Hook->>Status: エラーの文を出す (run の catch → setError)
            Hook-->>Page: 失敗を返す (run が false)
            Page->>Dlg: ダイアログを閉じる (setTarget(null))
            Status-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
        else 要求が Controller まで届いた
            AuthJs->>Filter: PUT /api/operator/members/{id}/enabled
            Filter->>Ctrl: 要求を通す (chain.doFilter)
            Ctrl->>Svc: 会員の利用状態を変えるよう頼む (enable)
            Svc->>Db: 運営者かを確かめ、組織と会員をロックして読み、<br/>書き換えてコミットする (上の図の 22〜32)
            alt *a MySQL との通信に失敗
                Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
                Svc--xCtrl: 例外
                Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
                Http--xHook: エラーを投げる (ApiError 503)
                Hook->>Status: エラーの文を出す (run の catch → setError)
                Hook-->>Page: 失敗を返す (run が false)
                Page->>Dlg: ダイアログを閉じる (setTarget(null))
                Status-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
            else 書き換えた
                Db-->>Svc: 完了
                Svc-->>Ctrl: 終わった
                Ctrl-->>Http: 200 変更後の値
                Http-->>Hook: 変更後の値
                Hook-->>Page: 一覧を取り直して成功を返す (reload、run が true)
                Page-->>User: 「利用を停止しました。」または<br/>「利用を再開しました。」と更新後の利用状態
            end
        end
    end
    opt *a-3 やり直す
        alt 一覧を取り直す
            User->>Status: 「再取得」をクリック
            Status->>Hook: 一覧を取り直す (reload)。変更の通信は送り直さない
        else 変更をやり直す
            User->>Page: もう一度「利用を停止」か「利用を再開」をクリック<br/>(基本フロー 3 へ戻る)
        end
    end
```

![EC-A02 共通代替フローを直接書いた図](<images/EC-A02_アカウントの利用状況を変更する-2.png>)

## ユースケース記述との差

- 関連情報「対象者への通知は送らない」: 停止する会員が、オーナーの譲渡の承認待ちの当事者（譲渡先か、申し出たオーナー本人）なら、同じトランザクションで申し出を無効にします。`organization_member_events` に記録し、オーナーと譲渡先の両方へ「オーナーの譲渡の申し出が無効になりました」の通知を保存します（`PendingOwnerSuccession`、`OwnerSuccessionNotices`）。このときは停止した本人あてにも通知が残ります。記述にない処理です。
- 基本フロー 6: 停止するときは、会員の行より先に、会員が属する組織の行をロックします（「組織 → 会員」の順）。記述にない処理です。
- 対象の会員が見つからないときは 404 `MEMBER_NOT_FOUND`「会員が見つかりません。」を返し、画面は一覧を取り直します。記述にない分岐です。
- 6a: 画面は、運営者と退会済みの会員にもボタンを出し、確認ダイアログも開きます（ボタンを無効にしない）。止めるのは確定の後のサーバーの 409 です。
- 5a: 記述は「取消」ボタンだけです。コードでは Esc キー、ダイアログの「閉じる」ボタン、ダイアログの外側のクリックでも、`onCancel` を呼んで同じように閉じます（`Dialog.jsx`、`ConfirmDialog.jsx`）。通信中（`busy`）は閉じません。
- 確定の後は、成功しても失敗しても `setTarget(null)` でダイアログを閉じます。共通代替フローで失敗したときも、ダイアログは閉じて一覧の上にエラーの文が出ます。\*a-3 の「再取得」は一覧を取り直すだけで、変更の通信は送り直しません。やり直すには、もう一度ボタンから確定します。
- CSRF トークンを取れないとき、`authFetch` は「操作の確認情報を取得できません。画面を再読み込みしてください。」のエラーを投げますが、`api.js` の `send()` がすべての例外を「サーバーに接続できません。…」に置き換えるので、この文は画面に出ません。
- 関連情報「利用停止中のアカウントはログインできない」: ログイン中の会員を停止すると、その会員の次の要求で `SessionValidityFilter` が `AuthService.current()` の 403 `ACCOUNT_DISABLED`「このアカウントは利用できません。」を返し、セッションを無効にします。ログイン中のセッションも止まることは記述にありません。
- 運営者でない会員がこの画面を開くと、`Workspace.jsx` が「この画面を利用する権限がありません。」を出します。API も `requireAdmin()` で 403 `FORBIDDEN` を返します。事前条件が運営者のログインなので、図には書いていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（未ログインと ADMIN の確認、path と画面の対応）
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/OperatorPages.jsx): `MembersPage`（`setTarget`、`change`、ダイアログの文言）
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ConfirmDialog.jsx): `ConfirmDialog`（`onConfirm`、`onCancel`、`busy`）
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Dialog.jsx): `Dialog`（Esc キー、外側のクリック、「閉じる」）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`（エラーの文と「再取得」）
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/controller/MemberController.java): `list`、`enabled`、`EnabledRequest`
- [backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/member/service/MemberService.java): `list`、`enable`、`lockMember`
- [backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/PendingOwnerSuccession.java): `lockOrganizationOf`、`lock`、`invalidateFor`、`invalidateForOwner`、`invalidate`
- [backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/store/service/OwnerSuccessionNotices.java): `invalidated`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`、`current`（`ACCOUNT_DISABLED`）
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMember.java): `changeEnabled`、`isAdmin`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `findById`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、停止した会員のセッションの無効化）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`
