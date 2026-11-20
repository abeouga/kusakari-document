# EC-B17 出店の申請をする

- ユースケース記述: [EC-B17_出店の申請をする](<../../アーカイブ/ユースケース/kusakari-ec/EC-B17_出店の申請をする.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 事業者
    participant Page as 出店申請画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 事前条件 EC-C01 でサイドバーを出すときに GET /api/account/store-applications で<br/>申請を取得済み。申請がないので、リンクは「出店申請」
    Note over User,Db: 基本フロー 1〜2 画面を開いて最初の手順を表示する
    User->>Page: アカウントのメニュー「出店申請」を開く (EC-C01)
    Page->>Api: GET /api/account/store-applications
    Api->>Db: 自分の出店申請を新しい順に検索
    Db-->>Api: 申請の行 (今の申請と前回の申請)
    Api-->>Page: 200 申請の配列
    alt 最新の申請が審査中か承認 (事前条件を満たさない)
        Page-->>User: 「出店申請状況」画面へ移る (EC-B18)
    else 申請がない、または最新の申請が却下か取り下げ済み
        Page-->>User: 手順 4 つと「ステップ 1 / 4：事業者情報」の入力欄<br/>再申請は前回の内容と「前回の申請内容を入力しています。…」
    end

    Note over User,Db: 基本フロー 3〜9 入力して確認する (画面の中だけで、通信しない)
    loop 手順 1〜3 (基本フロー 3〜8)
        User->>Page: その手順の項目を入力し、「次へ」か「確認画面へ」をクリック
        Page->>Page: その手順の項目だけを検証する
        alt 4a 必須項目が不足
            Page-->>User: 「未入力の項目があります：(不足項目)」
        else 4b 入力形式が不正
            Page-->>User: 「連絡先メールの形式が正しくありません。」など
        else 検証を通る
            Page-->>User: 次の手順の入力欄、最後は「入力内容の確認」
        end
    end
    Note right of Page: 5a「戻る」と 10a「…を修正」は<br/>入力を残したまま、その手順を表示する
    User->>Page: 入力情報を確認する

    Note over User,Db: 基本フロー 10 申請を送る
    User->>Page: 「申請する」をクリック
    Page->>Api: POST /api/account/store-applications<br/>(multipart、申請の JSON と事業確認書類)
    alt 入力が Input の条件に合わない (ユースケース未記載)
        Api-->>Page: 400 INVALID_INPUT
        Page-->>User: 手順 1 に戻り「入力内容・文字数・<br/>数値の範囲を確認してください。」
    else 入力が条件に合う
        Note right of Api: ここから保存までが<br/>1 つのトランザクション
        Api->>Db: 会員の行をロックして読む
        Db-->>Api: 会員の行
        alt 出店申請用アカウントでない (ユースケース未記載)
            Api-->>Page: 403 APPLICANT_REQUIRED
            Page-->>User: 「出店の申請は、企業様向けの登録で<br/>作ったアカウントで行ってください。」
        else 出店申請用アカウント
            Api->>Db: 自分の申請の行をロックして読む
            Db-->>Api: 申請の行
            alt 11a 審査中の申請がある
                Api-->>Page: 409 APPLICATION_EXISTS
                Page-->>User: 「入力内容の確認」のまま<br/>「審査中の申請があります。」
            else 書類が空か、PDF・PNG・JPEG でない (ユースケース未記載)
                Api-->>Page: 400 INVALID_DOCUMENT
                Page-->>User: 手順 1 に戻り「確認書類は5MB以内で指定してください。」<br/>か「PDF・PNG・JPEGを指定してください。」
            else 保存できる
                Note over User,Db: 基本フロー 11〜12 申請を保存し、受付の通知を送る
                opt 再申請 (今の申請がある)
                    Api->>Db: 前々回の申請を消し、今の申請を前回の申請にする
                end
                Api->>Db: 申請を審査中として保存する
                Api->>Db: 通知「出店申請を受け付けました」を保存する
                Api-->>Page: 200 申請
                Page-->>User: 「出店申請を受け付けました」「審査結果は通知でお知らせします。」<br/>「出店申請状況を確認する」リンク
                Page->>Api: GET /api/account/store-applications (サイドバー)
                Api-->>Page: 200 申請の配列
                Page-->>User: サイドバーのリンクが「出店申請状況」になる
            end
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用
```

## 詳細図 1 基本フロー 1〜9

```mermaid
sequenceDiagram
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as ApplicationPage<br/>StoreApplication.jsx
        participant Wiz as ApplicationWizard.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Repo as StoreApplication<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 事前条件 EC-C01 で Workspace の useResource('/account/store-applications') が申請を取得済み。<br/>applications.data が空なので、サイドバーのリンクは「出店申請」
    Note over User,Db: 基本フロー 1〜2 画面を開いて最初の手順を表示する
    User->>Work: サイドバーの「出店申請」をクリック
    Work->>Page: path が /seller/application なので<br/>ApplicationPage(accountType) を表示
    Page->>Hook: useResource('/account/store-applications')
    Note right of Page: SHOP_OWNER_APPLICANT 以外は path が null で<br/>通信せず、notApplicant() の文を出す
    Note right of Hook: useEffect が reload()<br/>を自動で実行する
    Hook->>Http: request('/account/store-applications')
    Http->>Ctrl: GET /api/account/store-applications
    Ctrl->>Svc: list(false)
    Note right of Svc: @Transactional(readOnly = true)
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Repo: findByMemberIdOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT organization_applications
    Db-->>Repo: 行 (今の申請と前回の申請)
    Repo-->>Svc: StoreApplicationEntity のリスト
    Svc-->>Ctrl: Application のリスト
    Ctrl-->>Http: 200 Application の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Page: latest = list[0] ?? null<br/>useApplicationRoute(accountType, latest, 'form')
    alt latest があり、REJECTED・WITHDRAWN 以外 (事前条件を満たさない)
        Page->>Page: replacePath('/seller/application/status')
        Page-->>User: 「出店申請状況」画面 (EC-B18)
    else latest がない、または REJECTED か WITHDRAWN
        Page->>Wiz: ApplicationWizard(previous, onDone)<br/>previous は再申請のときの latest
        Wiz-->>User: 手順 4 つ、「ステップ 1 / 4：事業者情報」<br/>previous があれば前回の内容と「前回の申請内容を入力しています。…」
    end

    Note over User,Db: 基本フロー 3〜9 入力して確認する (state を変えるだけで、通信しない)
    loop step 0〜2 (基本フロー 3〜8)
        User->>Wiz: その手順の項目を入力し、「次へ」(step 2 は「確認画面へ」) をクリック
        Wiz->>Wiz: next(event) が stepError(step, data) を呼ぶ
        alt 4a その手順の必須項目が空
            Wiz->>Wiz: setError(message)
            Wiz-->>User: 「未入力の項目があります：(不足項目)」
        else 4b 形式が不正 (step 1 のメールと電話番号、step 2 の 5MB)
            Wiz->>Wiz: setError(message)
            Wiz-->>User: 「連絡先メールの形式が正しくありません。」<br/>「電話番号は数字・＋・括弧・ハイフンで入力してください。」<br/>「事業確認書類は5MB以内のファイルを選択してください。」のどれか
        else 検証を通る
            Wiz->>Wiz: go(step + 1)<br/>step 2 では setDraft(input, documentName) と go(reviewStep)
            Wiz-->>User: 次の手順の入力欄、最後は「入力内容の確認」と Summary
        end
    end
    Note right of Wiz: 5a「戻る」は go(step - 1)、10a「…を修正」は go(index)。<br/>入力欄は hidden のまま残るので、書類も含めて内容が残る
    User->>Wiz: 入力情報を確認する (基本フロー 9)
    Note over User,Db: 再申請は EC-B18 の「再申請する」から ApplicationPage を開く
```

## 詳細図 2 基本フロー 10〜12

```mermaid
sequenceDiagram
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Wiz as ApplicationWizard.jsx
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Errs as ApiErrors
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Mem as AuthMember<br/>Repository
        participant Repo as StoreApplication<br/>Repository
        participant Ntf as Notification<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 10 申請を送る
    User->>Wiz: 「申請する」をクリック
    Wiz->>Wiz: submit()<br/>FormData に application (JSON の Blob) と document を入れる
    Wiz->>Http: send('/api/account/store-applications',<br/>{ method: 'POST', body })
    Note right of Http: authFetch() が先に<br/>GET /api/auth/csrf を送る (図では省略)
    Http->>Ctrl: POST /api/account/store-applications<br/>(multipart/form-data)
    Ctrl->>Ctrl: @Valid が application の Input を検査
    alt Input の条件に合わない (ユースケース未記載)
        Ctrl--xErrs: MethodArgumentNotValidException
        Errs-->>Http: invalid() が 400 INVALID_INPUT を返す
        Http--xWiz: readResponse() が throw ApiError(400)
        Wiz->>Wiz: status が 400 なので setStep(0) と setError(message)
        Wiz-->>User: 手順 1 に戻り「入力内容・文字数・<br/>数値の範囲を確認してください。」
    else 条件に合う
        Ctrl->>Svc: submit(in, file)
        Note over Svc,Db: クラスの @Transactional で 1 つのトランザクション
        Svc->>Auth: current()
        Auth-->>Svc: AuthMember
        Svc->>Mem: lockMember(memberId)
        Mem->>Db: SELECT ... FOR UPDATE (members)
        Db-->>Mem: 行
        Mem-->>Svc: AuthMember
        alt accountType が SHOP_OWNER_APPLICANT でない (ユースケース未記載)
            Svc--xErrs: throw ApiException(403, APPLICANT_REQUIRED)
            Errs-->>Http: business() が 403 と message を返す
            Http--xWiz: readResponse() が throw ApiError(403)
            Wiz-->>User: 「出店の申請は、企業様向けの登録で<br/>作ったアカウントで行ってください。」
        else 出店申請用アカウント
            Svc->>Repo: lockAllForMember(memberId)
            Repo->>Db: SELECT ... FOR UPDATE (organization_applications)
            Db-->>Repo: 行
            Repo-->>Svc: is_latest が真の申請が先頭のリスト
            alt 11a 今の申請が SUBMITTED
                Svc--xErrs: throw ApiException(409, APPLICATION_EXISTS)
                Errs-->>Http: business() が 409 と message を返す
                Http--xWiz: readResponse() が throw ApiError(409)
                Wiz-->>User: 「入力内容の確認」のまま<br/>「審査中の申請があります。」
            else file が空、または先頭のバイトが PDF・PNG・JPEG でない (ユースケース未記載)
                Svc--xErrs: throw ApiException(400, INVALID_DOCUMENT)
                Errs-->>Http: business() が 400 と message を返す
                Http--xWiz: readResponse() が throw ApiError(400)
                Wiz->>Wiz: setStep(0) と setError(message)
                Wiz-->>User: 手順 1 に戻り「確認書類は5MB以内で指定してください。」<br/>か「PDF・PNG・JPEGを指定してください。」
            else 保存できる
                Note over User,Db: 基本フロー 11〜12 申請を保存し、受付の通知を送る
                Svc->>Svc: new StoreApplicationEntity(...)<br/>status は SUBMITTED、is_latest は真
                opt 再申請 (latest がある)
                    Svc->>Repo: 前々回の申請があれば delete()、flush()
                    Repo->>Db: DELETE organization_applications
                    Svc->>Svc: latest.becomePrevious()
                    Svc->>Repo: flush()
                    Repo->>Db: UPDATE organization_applications<br/>(is_latest を偽にする)
                end
                Svc->>Repo: save(a)
                Repo->>Db: INSERT organization_applications
                Svc->>Ntf: send(memberId, GENERAL,<br/>「出店申請を受け付けました」, company)
                Ntf->>Db: INSERT notifications
                Ntf-->>Svc: 戻る (void)
                Svc-->>Ctrl: Application
                Ctrl-->>Http: 200 Application
                Http-->>Wiz: data
                Wiz->>Wiz: onDone() を呼ぶ (続きは詳細図 3)
            end
        end
    end
    Note over User,Db: 共通代替フロー *a・*b を適用 (*b は 401 LOGIN_REQUIRED)
```

## 詳細図 3 基本フロー 11 の画面の表示

```mermaid
sequenceDiagram
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as ApplicationPage<br/>StoreApplication.jsx
        participant Wiz as ApplicationWizard.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as StoreApplication<br/>Controller
        participant Svc as StoreApplication<br/>Service
        participant Auth as AuthService
        participant Repo as StoreApplication<br/>Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 11 受付を表示し、サイドバーの申請を取り直す
    Wiz->>Page: onDone()
    Page->>Page: setDone(true)
    Page->>Work: window.dispatchEvent(new Event(applicationsChanged))
    Page-->>User: 「出店申請を受け付けました」「審査結果は通知でお知らせします。」<br/>PageLink「出店申請状況を確認する」
    Work->>Hook: applicationsChanged のリスナーが reloadApplications() を呼ぶ
    Hook->>Http: request('/account/store-applications')
    Http->>Ctrl: GET /api/account/store-applications
    Ctrl->>Svc: list(false)
    Svc->>Auth: current()
    Auth-->>Svc: AuthMember
    Svc->>Repo: findByMemberIdOrderByCreatedAtDesc(memberId)
    Repo->>Db: SELECT organization_applications
    Db-->>Repo: 行
    Repo-->>Svc: StoreApplicationEntity のリスト
    Svc-->>Ctrl: Application のリスト
    Ctrl-->>Http: 200 Application の配列 (1 件以上)
    Http-->>Hook: data
    Hook-->>Work: applications.data
    Work-->>User: サイドバー「出店をご検討の方」のリンクが「出店申請状況」になる
```

## ユースケース記述との差

- 4b の入力形式の検査に、書類の種類の検査がありません。画面はファイル選択の `accept` で PDF・PNG・JPEG を絞るだけで、`stepError()` では種類を調べません。サーバーがファイルの先頭のバイトで調べ、合わなければ 400「PDF・PNG・JPEGを指定してください。」を返します。記述の 4b にこの文はありません。
- 0 バイトのファイルは画面の検査を通り、サーバーで 400「確認書類は5MB以内で指定してください。」になります。空のファイルに 5MB の文が出ます。
- サーバーが 400 を返したときは、どの項目の誤りでも手順 1（事業者情報）に戻ります（`ApplicationWizard` の `submit()` の `setStep(0)`）。書類の誤りでも、手順 3（事業確認書類）ではなく手順 1 が出ます。
- 基本フロー 12 の通知は、申請の保存と同じトランザクションの中で、応答を返す前に保存します。画面に「出店申請を受け付けました」が出る（基本フロー 11）より先に、通知が保存されています。
- 403 `APPLICANT_REQUIRED` は記述にありません。画面は出店申請用アカウントにだけ入力欄を出すので、画面を開いたあとに会員の種別が変わった場合に限られます。ほかのアカウントで画面を開いたときの文（関連情報）は画面の `notApplicant()` の文で、サーバーの 403 の文とは違います。
- 申請を送ったあと、サイドバーのリンクを「出店申請状況」に変えるために、申請の一覧をもう一度取得します（`applicationsChanged` のイベント）。記述では EC-B18 の関連情報に、リンクの表示だけが書かれています。
- 画面を開いたとき、最新の申請が審査中か承認なら「出店申請状況」画面へ移り、店舗側のアカウント（オーナー・担当者）なら「商品管理」画面へ移ります（`useApplicationRoute()`）。EC-B18 の関連情報には「出店申請状況」画面の URL の場合だけが書かれています。

## 確かめられなかったこと

- 画面の検査を通らずに 5MB を超えるファイルが届いた場合の応答です。`application.properties` の `spring.servlet.multipart.max-file-size=5MB` で Spring が先に止め、`ApiErrors.imageTooLarge()` が 413 `IMAGE_TOO_LARGE`「画像は1枚5MB以下にしてください。」を返すと読めますが、動かして確かめていません。`StoreApplicationService.submit()` の `file.getSize() > 5 * 1024 * 1024` の検査まで届くことがあるかも確かめていません。

## 参照したコード

- [frontend/src/workspace/StoreApplication.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/StoreApplication.jsx): `ApplicationPage`、`useApplicationRoute()`、`notApplicant()`、`canReapply()`、`applicationsChanged`
- [frontend/src/workspace/ApplicationWizard.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ApplicationWizard.jsx): `ApplicationWizard`、`next()`、`stepError()`、`go()`、`submit()`、`Summary`
- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): サイドバーの `applicationLink`、`applicationsChanged` のリスナー、`ApplicationPage` の表示
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource()`、`reload()`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request()`、`send()`、`readResponse()`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch()`
- [backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/controller/StoreApplicationController.java): `mine()`、`submit()`
- [backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/service/StoreApplicationService.java): `Input`、`submit()`、`list()`
- [backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/repository/StoreApplicationRepository.java): `findByMemberIdOrderByCreatedAtDesc()`、`lockAllForMember()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/store/persistence/entity/StoreApplicationEntity.java): `becomePrevious()`、`status` と `latest` の初期値
- [backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthMemberRepository.java): `lockMember()`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `send()`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `current()`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business()`、`invalid()`、`imageTooLarge()`
- [backend/src/main/resources/application.properties](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/resources/application.properties): `spring.servlet.multipart.max-file-size`
