# EC-S07 注文実績を確認する

- ユースケース記述: [EC-S07_注文実績を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S07_注文実績を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

## 概要図

```mermaid
sequenceDiagram
    actor User as 出店者
    participant Page as 「注文実績」画面<br/>React
    participant Api as EC API<br/>Spring Boot
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用 (未ログインなら画面はログインの案内を出し、API は 401 LOGIN_REQUIRED を返す)
    Note over User,Db: 1a 店舗が 2 つ以上なら、画面上部の「管理する店舗」で選ぶ。<br/>選び直すと画面を作り直し、下の通信をやり直す

    Note over User,Db: 基本フロー 1〜2 見られる店舗を確かめ、注文実績を取得する
    User->>Page: 出店者メニューの「注文実績」をクリック
    Page->>Api: GET /api/seller/sales/stores
    Api->>Db: 会員、組織、担当の店舗、店舗を読む
    Db-->>Api: 行
    Api->>Api: 店舗での立場と、閉鎖済みかどうかで、<br/>見られる店舗だけに絞る
    Api-->>Page: 200 見られる店舗の配列 (id、name、closedAt)
    opt 選択中の店舗のほかに、閉鎖済みの店舗がある
        Page-->>User: 「表示する店舗」の選択欄<br/>(「閉鎖した店舗」の「店舗名（閉鎖済み）」)
    end
    alt 2b 選択中の店舗が配列になく、閉鎖した店舗も選んでいない
        Page-->>User: 「選択中の店舗の注文実績を見る権限がありません。」<br/>閉鎖した店舗があれば「閉鎖した店舗は上の欄から選べます。」も。<br/>通信しない。2b-2 で終わる
    else 選択中の店舗が配列にある、または 2a で閉鎖した店舗を選んだ
        opt 2a 閉鎖した店舗を選ぶ (オーナー・ORG_ADMIN)
            User->>Page: 「表示する店舗」で「店舗名（閉鎖済み）」を選ぶ
        end
        Page->>Api: GET /api/seller/stores/{storeId}/sales
        Api->>Db: 店舗を読む
        Db-->>Api: stores の行
        alt 店舗がない (記述にない)
            Api-->>Page: 404 STORE_NOT_FOUND
        else 店舗がある
            Api->>Db: 会員の、店舗での立場を読む
            Db-->>Api: 行
            alt 見る権限がない (記述にない)
                Api-->>Page: 403 FORBIDDEN
            else 見られる
                Api->>Db: 店舗の注文を新しい順に読む
                Db-->>Api: orders の行
                Api->>Api: 注文ごとの手数料と差引額、件数と合計を計算する
                Api-->>Page: 200 店舗名、closedAt、注文の一覧、合計
            end
        end
        alt 失敗の応答 (404、403)
            Page-->>User: エラーの文 (403 は「この店舗の注文実績を見る権限がありません。」) と「再取得」
        else 200
            Note over User,Db: 基本フロー 3〜4 注文実績を表示し、出店者が確認する (読み取りだけ)
            Page-->>User: 店舗名
            opt 2a-2 閉鎖済みの店舗
                Page-->>User: 店舗名の横の「閉鎖済み」と、「(日時)に閉鎖した店舗です。<br/>注文実績は読み取り専用で、期限なく確認できます。」
            end
            Page-->>User: 件数 (注文数、支払い待ち、キャンセル、キャンセル申請中)、<br/>合計 (注文金額、販売手数料、差引額)、販売手数料の計算方法の説明
            alt 3a 注文がない
                Page-->>User: 件数と合計は 0、「この店舗の注文はまだありません。」
            else 注文がある
                Page-->>User: 注文ごとの一覧 (注文番号、注文日時、状態、支払方法、<br/>注文金額、手数料率、販売手数料、差引額)
            end
        end
    end
```

## 詳細図 1 基本フロー 1〜2 表示する店舗を決める

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as Workspace.jsx
        participant Page as SalesPage<br/>SalesReport.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as SalesReport<br/>Controller
        participant Svc as SalesReport<br/>Service
        participant Auth as AuthService
        participant Policy as StoreCapability<br/>Policy
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー *b を適用。未ログインなら Workspace.jsx が AuthPanel を出す
    Note over User,Db: 基本フロー 1〜2 見られる店舗を取得し、表示する店舗を決める
    User->>Work: 出店者メニューの「注文実績」をクリック
    Work->>Work: shop.sellerStoresLoading が false になってから<br/>/seller/sales を SalesPage に対応させる
    Work->>Page: SalesPage (key と storeId は shop.sellerStoreId)
    Note right of Work: 1a 店舗が 2 つ以上なら上に SellerStoreSelect を出す。<br/>選び直すと key が変わり、SalesPage を作り直す
    Page->>Hook: useResource('/seller/sales/stores')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request('/seller/sales/stores')
    Http->>Ctrl: GET /api/seller/sales/stores
    Ctrl->>Svc: viewableStores()
    Note over Svc,Db: @Transactional(readOnly = true)。読むだけでロックしない
    Svc->>Auth: requireSellerRole()
    Note right of Auth: 店舗側のアカウントと運営でなければ 403。<br/>Workspace.jsx の canSell() が先に止めるので、<br/>画面からは届かない
    Auth-->>Svc: 戻る
    Svc->>Auth: current()、candidateStoreIdsOf(member)
    Auth-->>Svc: 会員と候補の店舗 ID<br/>(オーナーと ORG_ADMIN は組織の全店舗、<br/>ほかの担当者は所属する店舗)
    Svc->>Repo: StoreRepository.findAllById(ids)<br/>(運営は findAllByOrderByIdAsc())
    Repo->>Db: SELECT stores
    Db-->>Repo: 行
    Repo-->>Svc: StoreEntity のリスト
    loop 店舗ごと
        Svc->>Policy: canViewSales(member, store)
        Policy->>Auth: positionsAt() の中で memberRoleAt()、<br/>organizationRoleOf()、organizationIdOf()
        Note right of Auth: 担当と組織の所属は Repository で読む<br/>(図では省略)
        Auth-->>Policy: 店舗での立場 (OWNER、ORG_ADMIN、MANAGER、STAFF、ADMIN)
        Policy-->>Svc: closedAt があれば VIEW_CLOSED_STORE_SALES (オーナー、ORG_ADMIN、運営)、<br/>なければ VIEW_STORE_SALES (オーナー、MANAGER、STAFF、運営。<br/>停止中の店舗は運営だけ) で判定した結果
    end
    Svc-->>Ctrl: SalesStore のリスト (id、name、closedAt)
    Ctrl-->>Http: 200 JSON
    Http-->>Hook: data
    Hook-->>Page: stores.data
    Note right of Page: 取得の失敗は ResourceStatus が<br/>エラーの文と「再取得」を出す
    Page->>Page: chosen は storeId の店舗、closed は閉鎖済みのほかの店舗、<br/>target は picked か chosen の id
    opt closed が 1 件以上
        Page-->>User: 「表示する店舗」の選択欄<br/>(chosen と、「閉鎖した店舗」の「店舗名（閉鎖済み）」)
    end
    alt 2b target がない
        Page-->>User: 「選択中の店舗の注文実績を見る権限がありません。」<br/>closed があれば「閉鎖した店舗は上の欄から選べます。」も。<br/>通信しない
    else target がある
        opt 2a 閉鎖した店舗を選ぶ (オーナー・ORG_ADMIN)
            User->>Page: 「表示する店舗」で「店舗名（閉鎖済み）」を選ぶ
            Page->>Page: onChange で setPicked(id)
        end
        Page->>Page: SalesReport (key と storeId は target) を表示する。詳細図 2 へ
    end
```

## 詳細図 2 基本フロー 2〜4 注文実績を取得して表示する

```mermaid
sequenceDiagram
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Report as SalesReport<br/>SalesReport.jsx
        participant Hook as useResource.js
        participant Http as api.js
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as SalesReport<br/>Controller
        participant Errs as ApiErrors
        participant Svc as SalesReport<br/>Service
        participant Auth as AuthService
        participant Policy as StoreCapability<br/>Policy
        participant Mapper as OrderResponse<br/>Mapper
        participant Repo as 各 Repository
    end
    participant Db as MySQL

    Note over User,Db: 基本フロー 2 選んだ店舗の注文実績を取得する (SalesPage が SalesReport を表示したとき)
    Report->>Hook: useResource('/seller/stores/{storeId}/sales')
    Note right of Hook: useEffect が reload() を自動で実行する
    Hook->>Http: request(path)
    Http->>Ctrl: GET /api/seller/stores/{storeId}/sales
    Ctrl->>Svc: report(storeId)
    Note over Svc,Db: @Transactional(readOnly = true)。読むだけでロックしない
    Svc->>Repo: StoreRepository.findById(storeId)
    Repo->>Db: SELECT stores
    Db-->>Repo: 行
    Repo-->>Svc: StoreEntity
    alt 店舗がない (記述にない)
        Svc--xErrs: notFound() の ApiException(404, STORE_NOT_FOUND) を throw
        Errs-->>Http: business() が 404 と「店舗が見つかりません。」
    else 店舗がある
        Svc->>Auth: current()
        Auth-->>Svc: AuthMember
        Svc->>Policy: canViewSales(member, store)
        Policy-->>Svc: true か false (判定は詳細図 1 と同じ)
        alt 見る権限がない (記述にない)
            Svc--xErrs: throw ApiException(403, FORBIDDEN)
            Errs-->>Http: business() が 403 と<br/>「この店舗の注文実績を見る権限がありません。」
        else 見られる
            Svc->>Repo: build() の中で<br/>OrderRepository.findByStoreIdOrderByCreatedAtDesc(storeId)
            Repo->>Db: SELECT orders (新しい順)
            Db-->>Repo: 行
            Repo-->>Svc: OrderEntity のリスト
            loop 注文ごとに row(order)
                Svc->>Mapper: figures(order)
                Mapper-->>Svc: SalesFigures (commissionRateBp、commissionYen、netYen、counted)
            end
            Note right of Mapper: キャンセルは手数料と差引額を 0 にする。<br/>counted はキャンセルでも支払い待ちでもない注文
            Svc->>Svc: SalesTotals を作る。注文数は counted の件数、<br/>金額の合計は counted の注文だけ
            Svc-->>Ctrl: SalesReport (storeId、storeName、closedAt、orders、totals)
            Ctrl-->>Http: 200 JSON
        end
    end
    alt 失敗の応答 (404、403)
        Http--xHook: readResponse() が throw ApiError(status, message)
        Hook-->>Report: resource.error
        Report-->>User: ResourceStatus がエラーの文と「再取得」を出す
    else 200
        Http-->>Hook: data
        Hook-->>Report: resource.data
        Note over User,Db: 基本フロー 3〜4 注文実績を表示し、出店者が確認する (読み取りだけで、注文を変える操作はない)
        Report-->>User: 店舗名 (report.storeName)
        opt 2a-2 report.closedAt がある
            Report-->>User: 店舗名の横の「閉鎖済み」と、「(日時)に閉鎖した店舗です。<br/>注文実績は読み取り専用で、期限なく確認できます。」
        end
        Report-->>User: 「注文数：N件 / 支払い待ち：N件 / キャンセル：N件 / キャンセル申請中：N件」、<br/>注文金額、販売手数料、差引額と、販売手数料の計算方法の説明
        alt 3a report.orders が空
            Report-->>User: 件数と合計は 0、「この店舗の注文はまだありません。」
        else 注文がある
            Report-->>User: DataTable 注文番号、注文日時、状態、支払方法、注文金額、<br/>手数料率、販売手数料、差引額 (キャンセルは「手数料なし」と「—」)
        end
    end
```

## ユースケース記述との差

- 2b: 見る権限があるかどうかは、画面が `GET /api/seller/sales/stores` の配列に選択中の店舗があるかで決めます。配列になければ、注文実績の API を呼ばずに「選択中の店舗の注文実績を見る権限がありません。」を出します。記述の 2b と同じ文言です。
- 記述にない失敗の応答があります。`GET /api/seller/stores/{storeId}/sales` は、店舗がないと 404 `STORE_NOT_FOUND`「店舗が見つかりません。」、見る権限がないと 403 `FORBIDDEN`「この店舗の注文実績を見る権限がありません。」を返します。画面は 2b で先に止めるので、届くのは店舗の一覧を取ったあとに権限や店舗が変わったときです。画面は `ResourceStatus` でエラーの文と「再取得」を出します。
- 2a: 「表示する店舗」の選択欄は、選択中の店舗のほかに閉鎖済みの店舗が 1 つ以上あるときだけ出ます。選択中の店舗そのものが閉鎖済みで見られる店舗なら、「表示する店舗」で選ばなくても、そのまま 2a-2 の表示になります。
- 2b・関連情報: `/seller/sales` は、ロールのない店舗の ORG_ADMIN にも「注文実績」画面を出し、見られるかどうかを API の配列で決めます（`Workspace.jsx` で `personnelOnly` より前に `SalesPage` を選ぶ）。営業中・閉鎖中の店舗では ORG_ADMIN の立場だけでは見られないので、店舗のロールがなければ 2b になります。
- 基本フロー 3: 「注文数」はキャンセルと支払い待ちを除いた件数です（`SalesTotals` の `orderCount` は `counted` の件数）。「キャンセル申請中」はキャンセルでない注文のうち、キャンセル申請が `PENDING` の件数です。記述は件数の名前だけを書いています。
- 1a: 店舗を選び直すと、`Workspace.jsx` が `SalesPage` を `key` で作り直すので、店舗の一覧（`GET /api/seller/sales/stores`）から取り直します。「表示する店舗」で選んでいた閉鎖済みの店舗の選択（`picked`）は消えます。

## 確かめられなかったこと

- 注文実績の API の 403・404 が画面から起きる条件（店舗の一覧を取ってから注文実績を取るまでの間に、権限や店舗が変わったとき）は、実行して確かめていません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`storePaths`、`/seller/sales` と `SalesPage` の対応、`SellerStoreSelect` の表示
- [frontend/src/workspace/SalesReport.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/SalesReport.jsx): `SalesPage`（`chosen`、`closed`、`target`、`setPicked`）、`SalesReport`、`rateLabel`
- [frontend/src/workspace/ResourceView.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/ResourceView.jsx): `ResourceStatus`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/workspace/OrderPages.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/OrderPages.jsx): `orderLabels`、`cancellationLabels`
- [frontend/src/payment.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/payment.js): `paymentLabel`
- [frontend/src/components/SellerStoreSelect.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/SellerStoreSelect.jsx): `SellerStoreSelect`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/api.js): `request`、`readResponse`、`ApiError`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `canSell`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/controller/SalesReportController.java): `stores`、`seller`
- [backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/service/SalesReportService.java): `viewableStores`、`report`、`build`、`row`、`notFound`
- [backend/src/main/java/jp/kusakari/ec/auth/StoreCapabilityPolicy.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/StoreCapabilityPolicy.java): `TABLE`、`canViewSales`、`can`、`positionsAt`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSellerRole`、`current`、`candidateStoreIdsOf`、`memberRoleAt`、`organizationRoleOf`、`organizationIdOf`
- [backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/mapper/OrderResponseMapper.java): `figures`
- [backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/commerce/persistence/repository/OrderRepository.java): `findByStoreIdOrderByCreatedAtDesc`
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`
