# EC-A10 商品の公開を停止・再開する

- ユースケース記述: [EC-A10_商品の公開を停止・再開する](<../../アーカイブ/ユースケース/kusakari-ec/EC-A10_商品の公開を停止・再開する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 運営者
    participant Page as 商品管理画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *a・*b を適用。失敗の応答や通信の失敗では、<br/>画面上部にエラーと「再取得」を出し、確認ダイアログを閉じる

    Note over User,Db: 基本フロー 1〜2 商品の一覧と操作のボタンを表示する (EC-A06)
    User->>Page: 運営者メニューの「商品管理」をクリック
    Page->>Api: GET /api/operator/products
    Api->>Db: 店舗、在庫、警告の履歴、商品を読む
    Db-->>Api: 行
    Api-->>Page: 200 商品の配列
    Page-->>User: 商品ごとの公開状態、「警告する」、<br/>公開停止中でなければデンジャーエリアの「公開を停止」

    Note over User,Db: 基本フロー 3〜5 確認ダイアログを開き、理由を入力する (通信しない)
    User->>Page: デンジャーエリアの「公開を停止」をクリック
    Page-->>User: 「公開停止の確認」ダイアログ<br/>商品名、停止したときの影響、「理由（必須・出店者に通知します）」
    User->>Page: 理由を入力する

    Note over User,Db: 基本フロー 6〜9 公開停止を確定する
    alt 6a 「取消」をクリックした
        User->>Page: 「取消」をクリック
        Page-->>User: ダイアログを閉じる。公開状態は変えない (通信しない)
    else 「公開停止を確定」をクリックした
        User->>Page: 「公開停止を確定」をクリック
        alt 5a 理由が空
            Page-->>User: 「理由を入力してください。」<br/>ダイアログは開いたまま (通信しない)
        else 理由がある
            Page->>Api: PUT /api/operator/products/{id}/moderation<br/>suspended=true, reason
            Api->>Db: 商品の行をロックして読む
            Db-->>Api: products の行
            alt すでに公開停止中
                Note right of Api: 何もしない。履歴も通知も足さない
            else 公開停止していない
                Api->>Db: products.suspended を true にし、<br/>履歴 SUSPEND と出店者への通知を追加
                Db-->>Api: 完了
            end
            Api-->>Page: 200 suspended=true, warning
            Page->>Api: GET /api/operator/products
            Api-->>Page: 200 最新の商品の配列
            Page-->>User: 「停止しました。出店者に通知しました。」<br/>「公開停止中」と「公開停止を解除」
        end
    end

    Note over User,Db: 代替フロー 3a〜3c (どのダイアログも「取消」は 6a、必須の理由が空なら 5a と同じ)
    alt 3a 停止せずに警告する
        User->>Page: 「警告する」(警告中なら「もう一度警告する」)、<br/>理由を入力して「警告する」
        Page->>Api: PUT /api/operator/products/{id}/warning<br/>warned=true, reason
        Api->>Db: 商品の行をロックし、<br/>履歴 WARN と出店者への通知を追加
        Db-->>Api: 完了
        Api-->>Page: 200 suspended, warning
        Page->>Api: GET /api/operator/products
        Api-->>Page: 200 最新の商品の配列
        Page-->>User: 「警告しました。出店者に通知しました。」<br/>「警告中」のバッジと理由
    else 3b 警告を解除する
        User->>Page: 「警告を解除」、必要なら理由を入力して「警告を解除する」
        Page->>Api: PUT /api/operator/products/{id}/warning<br/>warned=false, reason
        Api->>Db: 商品の行をロックし、今の警告を履歴から求める
        Db-->>Api: product_moderation_events の行
        alt 警告していない
            Note right of Api: 何もしない。履歴も通知も足さない
        else 警告中
            Api->>Db: 履歴 CLEAR_WARNING と出店者への通知を追加
            Db-->>Api: 完了
        end
        Api-->>Page: 200 suspended, warning
        Page->>Api: GET /api/operator/products
        Api-->>Page: 200 最新の商品の配列
        Page-->>User: 「警告を解除しました。出店者に通知しました。」<br/>「警告中」のバッジが消える
    else 3c 公開停止を解除する
        User->>Page: 「公開停止を解除」、必要なら理由を入力して<br/>「公開停止の解除を確定」
        Page->>Api: PUT /api/operator/products/{id}/moderation<br/>suspended=false, reason
        Api->>Db: 商品の行をロックして読む
        Db-->>Api: products の行
        alt 公開停止していない
            Note right of Api: 何もしない。履歴も通知も足さない
        else 公開停止中
            Api->>Db: products.suspended を false にし、<br/>履歴 RESUME と出店者への通知を追加
            Db-->>Api: 完了
        end
        Api-->>Page: 200 suspended=false, warning
        Page->>Api: GET /api/operator/products
        Api-->>Page: 200 最新の商品の配列
        Page-->>User: 「再開しました。出店者に通知しました。」<br/>「公開可能」(削除済みの商品は「販売終了」)と<br/>デンジャーエリアの「公開を停止」
    end
```

## 詳細図 1 基本フロー 1〜9

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Page as ReviewPage<br/>ProductModerationRow<br/>OperatorPages.jsx
        participant Mod as ModerationControls<br/>Moderation.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductModeration<br/>Controller
        participant Svc as ProductModeration<br/>Service
        participant Auth as AuthService
        participant Hist as Moderation<br/>History
        participant Notice as Notification<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインの扱いは EC-A06 の詳細図と同じ)
    Note over Svc,Db: Repository はライフラインにせず、Service から MySQL への矢印にメソッド名を書く

    Note over User,Db: 基本フロー 1〜2 商品の一覧と操作のボタンを表示する
    User->>Page: 運営者メニューの「商品管理」をクリック<br/>(Workspace.jsx が ReviewPage を表示)
    Page->>Hook: useResource('/operator/products')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/operator/products')
    Http->>Ctrl: GET /api/operator/products
    Note over Ctrl,Db: list() の流れは EC-A06 の詳細図と同じ。図では省略
    Ctrl-->>Http: 200 Product の配列
    Http-->>Hook: data
    Hook-->>Page: resource.data
    Page->>Mod: 商品ごとに ModerationControls を表示<br/>(suspended、warning)
    Mod-->>User: 「警告する」、「警告・停止の履歴」、<br/>suspended でなければデンジャーエリアの「公開を停止」

    Note over User,Db: 基本フロー 3〜5 確認ダイアログを開き、理由を入力する (通信しない)
    User->>Mod: デンジャーエリアの「公開を停止」をクリック
    Mod->>Mod: open('suspend')<br/>setReason('')、setMissing(false)、setPending('suspend')
    Mod-->>User: ConfirmDialog「公開停止の確認」<br/>対象：商品名、suspendText、「理由（必須・出店者に通知します）」
    User->>Mod: 理由を入力する (onChange で setReason。maxLength は 500)

    Note over User,Db: 基本フロー 6〜9 公開停止を確定する
    alt 6a 「取消」をクリックした
        User->>Mod: 「取消」をクリック (ConfirmDialog の onCancel)
        Mod->>Mod: setPending(null)
        Mod-->>User: ダイアログを閉じる。通信しない
    else 「公開停止を確定」をクリックした
        User->>Mod: 「公開停止を確定」をクリック (onConfirm)
        Mod->>Mod: confirm()
        alt 5a reason.trim() が空
            Mod->>Mod: setMissing(true)
            Mod-->>User: 「理由を入力してください。」<br/>ダイアログは開いたまま。通信しない
        else 理由がある
            Mod->>Hook: run(send, '停止しました。出店者に通知しました。')
            Hook->>Http: send() が write() を呼び<br/>request('/operator/products/{id}/moderation',<br/>'PUT', suspended=true と reason)
            Note right of Http: authFetch() が PUT の前に<br/>GET /api/auth/csrf でトークンを取る。図では省略
            Http->>Ctrl: PUT /api/operator/products/{id}/moderation
            Ctrl->>Ctrl: @Valid が Input を検査 (reason は 500 文字まで)
            Ctrl->>Svc: suspend(id, true, reason)
            Note over Svc,Db: クラスの @Transactional で、suspend() 全体が 1 つのトランザクション
            Svc->>Auth: requireAdmin()
            Auth-->>Svc: 戻る (ADMIN でなければ 403 FORBIDDEN)
            Svc->>Db: lock() が ProductRepository.findLocked(id)<br/>@Lock(PESSIMISTIC_WRITE) で SELECT … FOR UPDATE
            Db-->>Svc: ProductEntity (なければ 404 PRODUCT_NOT_FOUND)
            Svc->>Hist: reasonFor(SUSPEND, reason)
            Hist-->>Svc: 前後の空白を除いた理由
            Note right of Hist: 空なら ApiException(400, REASON_REQUIRED)。<br/>画面の 5a が先に止めるので、画面からは届かない
            alt すでに公開停止中 (isSuspended() が true)
                Note right of Svc: 何もしない。履歴も通知も足さない
            else 公開停止していない
                Svc->>Svc: product.moderate(true)
                Svc->>Db: record() が ProductModerationEventRepository.save()<br/>product_moderation_events に SUSPEND を INSERT
                Db-->>Svc: 保存した行
                Svc->>Notice: toStore(店舗 ID, MODERATION,<br/>「商品の公開を停止しました」, 商品名 / 理由)
                Note over Notice,Db: 組織のオーナーと、店舗でロールのある担当者のうち<br/>有効な会員ごとに notifications へ INSERT。中は図では省略
                Notice-->>Svc: 戻る
            end
            Svc->>Db: state() が events.flush()<br/>まだ送っていない変更 (products.suspended など) を送る
            Db-->>Svc: 完了
            Svc->>Db: currentWarning() が findByProductIdOrderByIdDesc(id)
            Db-->>Svc: 履歴 (新しい順)
            Svc->>Hist: activeWarning(履歴)
            Hist-->>Svc: 今の Warning (なければ null)
            Svc-->>Ctrl: State(suspended, warning)
            Note over Svc,Db: suspend() を抜けるときにコミット
            Ctrl-->>Http: 200 suspended=true, warning
            Http-->>Hook: data (画面では使わない)
            Hook->>Http: reload() が request('/operator/products')
            Http->>Ctrl: GET /api/operator/products
            Note over Ctrl,Db: 一覧の取得は基本フロー 2 と同じ
            Ctrl-->>Http: 200 最新の Product の配列
            Http-->>Hook: data
            Hook-->>Mod: run() が true を返す (data と notice を更新済み)
            Mod->>Mod: setVersion(v + 1)、setPending(null)
            Note right of Mod: 履歴を開いていれば、version が変わるので<br/>ModerationEvents が履歴を取り直す
            Page-->>User: ResourceStatus に「停止しました。出店者に通知しました。」<br/>状態は「公開停止中」
            Mod-->>User: ダイアログを閉じ、「公開停止を解除」を出す。<br/>デンジャーエリアは消える
        end
    end
    Note over User,Db: *a 通信の失敗やエラーの応答では、api.js が ApiError を投げ、run() の catch が<br/>404・409 なら一覧を取り直して resource.error を出す。confirm() はダイアログを閉じる
```

## 詳細図 2 代替フロー 3a〜3c

```mermaid
sequenceDiagram
    actor User as 運営者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mod as ModerationControls<br/>Moderation.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as ProductModeration<br/>Controller
        participant Svc as ProductModeration<br/>Service
        participant Hist as Moderation<br/>History
        participant Notice as Notification<br/>Service
    end
    participant Db as MySQL

    Note over User,Db: どの操作も、ダイアログの「取消」は 6a、必須の理由が空なら 5a と同じ (通信しない)。<br/>サーバーでは詳細図 1 と同じく requireAdmin()、findLocked(id) の SELECT … FOR UPDATE、<br/>reasonFor()、state() を 1 つのトランザクションで通る。図では省略
    alt 3a 停止せずに警告する
        User->>Mod: 「警告する」(warning があれば「もう一度警告する」) をクリック
        Mod-->>User: open('warn')。ConfirmDialog「警告の確認」<br/>対象：商品名、公開・利用の状態は変わらないこと、<br/>「理由（必須・出店者に通知します）」
        User->>Mod: 理由を入力して「警告する」をクリック
        Mod->>Hook: confirm() が run(send, '警告しました。出店者に通知しました。')
        Hook->>Http: write() が request('/operator/products/{id}/warning',<br/>'PUT', warned=true と reason)
        Http->>Ctrl: PUT /api/operator/products/{id}/warning
        Ctrl->>Svc: warning() が warn(id, true, reason)
        Note right of Svc: warned が true なので、警告中でも毎回記録する
        Svc->>Db: record() が save()<br/>product_moderation_events に WARN を INSERT
        Db-->>Svc: 保存した行
        Svc->>Notice: toStore(店舗 ID, MODERATION,<br/>「商品に運営から警告がありました」, 商品名 / 理由)
        Notice-->>Svc: 戻る
        Svc-->>Ctrl: State(suspended, warning)
        Ctrl-->>Http: 200 suspended, warning
        Http-->>Hook: data
        Hook->>Http: reload() が request('/operator/products')
        Http->>Ctrl: GET /api/operator/products
        Ctrl-->>Http: 200 最新の Product の配列
        Http-->>Hook: data
        Hook-->>Mod: run() が true を返す
        Mod-->>User: 「警告しました。出店者に通知しました。」<br/>WarningBadge「警告中」と「運営からの警告：理由」
    else 3b 警告を解除する
        User->>Mod: 「警告を解除」(warning があるときだけ出る) をクリック
        Mod-->>User: open('clear')。ConfirmDialog「警告の解除の確認」<br/>対象：商品名、「理由（任意・出店者に通知します）」
        User->>Mod: 必要なら理由を入力して「警告を解除する」をクリック
        Mod->>Hook: confirm() が run(send, '警告を解除しました。出店者に通知しました。')
        Hook->>Http: write() が request('/operator/products/{id}/warning',<br/>'PUT', warned=false と reason)
        Http->>Ctrl: PUT /api/operator/products/{id}/warning
        Ctrl->>Svc: warning() が warn(id, false, reason)
        Svc->>Db: currentWarning() が findByProductIdOrderByIdDesc(id)
        Db-->>Svc: 履歴 (新しい順)
        Svc->>Hist: activeWarning(履歴)
        Hist-->>Svc: 今の Warning (なければ null)
        alt 警告していない (null)
            Note right of Svc: 何もしない。履歴も通知も足さない
        else 警告中
            Svc->>Db: record() が save()<br/>product_moderation_events に CLEAR_WARNING を INSERT
            Db-->>Svc: 保存した行
            Svc->>Notice: toStore(店舗 ID, MODERATION,<br/>「商品への運営の警告が解除されました」, 商品名 または 商品名 / 理由)
            Notice-->>Svc: 戻る
        end
        Svc-->>Ctrl: State(suspended, warning)
        Ctrl-->>Http: 200 suspended, warning=null
        Http-->>Hook: data
        Hook->>Http: reload() が request('/operator/products')
        Http->>Ctrl: GET /api/operator/products
        Ctrl-->>Http: 200 最新の Product の配列
        Http-->>Hook: data
        Hook-->>Mod: run() が true を返す
        Mod-->>User: 「警告を解除しました。出店者に通知しました。」<br/>「警告中」のバッジが消える
    else 3c 公開停止を解除する
        User->>Mod: 「公開停止を解除」(suspended のときだけ出る) をクリック
        Mod-->>User: open('resume')。ConfirmDialog「公開停止の解除の確認」<br/>対象：商品名、resumeText、「理由（任意・出店者に通知します）」
        User->>Mod: 必要なら理由を入力して「公開停止の解除を確定」をクリック
        Mod->>Hook: confirm() が run(send, '再開しました。出店者に通知しました。')
        Hook->>Http: write() が request('/operator/products/{id}/moderation',<br/>'PUT', suspended=false と reason)
        Http->>Ctrl: PUT /api/operator/products/{id}/moderation
        Ctrl->>Svc: moderate() が suspend(id, false, reason)
        alt 公開停止していない (isSuspended() が false)
            Note right of Svc: 何もしない。履歴も通知も足さない
        else 公開停止中
            Svc->>Svc: product.moderate(false)
            Svc->>Db: record() が save()<br/>product_moderation_events に RESUME を INSERT
            Db-->>Svc: 保存した行
            Svc->>Notice: toStore(店舗 ID, MODERATION,<br/>「商品の公開停止を解除しました」, 商品名 または 商品名 / 理由)
            Notice-->>Svc: 戻る
        end
        Svc-->>Ctrl: State(suspended, warning)
        Ctrl-->>Http: 200 suspended=false, warning
        Http-->>Hook: data
        Hook->>Http: reload() が request('/operator/products')
        Http->>Ctrl: GET /api/operator/products
        Ctrl-->>Http: 200 最新の Product の配列
        Http-->>Hook: data
        Hook-->>Mod: run() が true を返す
        Mod-->>User: 「再開しました。出店者に通知しました。」<br/>状態は active なら「公開可能」。デンジャーエリアの「公開を停止」が戻る
    end
```

## ユースケース記述との差

- 共通代替フロー *a: 通信に失敗したときやエラーの応答のとき、`confirm()` は結果にかかわらず `setPending(null)` でダイアログを閉じます。エラーは画面上部の `ResourceStatus` に出ます。もう一度ボタンを押すと `open()` が理由を空にするので、入力した理由は残りません。*a-2 の「入力内容を保持したまま、再実行を可能にする」と違います。
- 関連情報「すでに公開停止中の商品の停止、公開停止していない商品の解除、警告していない商品の警告の解除は、何もせず」: サーバーは何もせずに 200 を返します。画面は 200 を成功として扱うので、このときも「停止しました。出店者に通知しました。」などを出します。通知を送っていないのに「通知しました」と出ます。2 人の運営者が同じ商品を続けて操作したときなどに起きます。
- 3c-4・3c-5: 解除のあとの表示は、出店者が商品を削除していれば（在庫の `publicationStatus` が `DELETED`）「公開可能」ではなく「販売終了」です。記述は「公開可能」に更新するとだけ書いています。
- 5a: 理由の検査は画面（`reason.trim()`）とサーバー（`ModerationHistory.reasonFor()` の 400 `REASON_REQUIRED`）の両方にあります。画面の検査が先に止めるので、画面からサーバーの検査には届きません。記述は画面の検査だけを書いています。
- 基本フロー 7: 操作の応答（`State` の `suspended` と `warning`）を画面は使わず、`reload()` で一覧を取り直して表示します。記述にない処理です。

## 確かめられなかったこと

- MySQL に送る SQL は、`@Lock(PESSIMISTIC_WRITE)` やメソッド名から読んだものです。SELECT … FOR UPDATE になることや、UPDATE と INSERT を送る時点は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `operatorMenu`、`Workspace`（`/operator/products` と `ReviewPage` の対応）
- [frontend/src/workspace/OperatorPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OperatorPages.jsx): `ReviewPage`、`ProductModerationRow`
- [frontend/src/workspace/Moderation.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Moderation.jsx): `targets`、`ModerationControls`（`open`、`confirm`、`send`、`done`、`titles`）、`WarningBadge`、`ModerationEvents`
- [frontend/src/components/ConfirmDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ConfirmDialog.jsx): `ConfirmDialog`（`onConfirm`、`onCancel`）
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`、`run`、`write`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `authFetch`（`/api/auth/csrf`）
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/controller/ProductModerationController.java): `Input`、`list`、`moderate`、`warning`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `suspend`、`warn`、`record`、`currentWarning`、`state`、`lock`、`notFound`
- [backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/service/ModerationHistory.java): `reasonFor`、`activeWarning`、`noticeBody`
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/entity/ModerationAction.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/persistence/entity/ModerationAction.java): `requiresReason`
- [backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/dto/ModerationDtos.java): `State`、`WarningRequest`、`Warning`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findLocked`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/ProductEntity.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/ProductEntity.java): `moderate`、`suspended`
- [backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/moderation/persistence/repository/ProductModerationEventRepository.java): `findByProductIdOrderByIdDesc`、`save`（JpaRepository）
- [backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/notification/service/NotificationService.java): `toStore`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireAdmin`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`
