# EC-S07 注文実績を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Sel as 管理する店舗の選択欄<br/>SellerStoreSelect<br/>(SellerStoreSelect.jsx)
        participant Page as 注文実績画面<br/>SalesPage・SalesReport<br/>(SalesReport.jsx)
        participant Hook as 一覧の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 注文実績API<br/>SalesReportController<br/>(SalesReportController.java)
        participant Svc as 注文実績の処理<br/>SalesReportService<br/>(SalesReportService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Policy as 店舗での立場とできること<br/>StoreCapabilityPolicy<br/>(StoreCapabilityPolicy.java)
        participant StoreRepo as 店舗の読み書き<br/>StoreRepository<br/>(StoreRepository.java)
        participant OrderRepo as 注文の読み書き<br/>OrderRepository<br/>(OrderRepository.java)
        participant Mapper as 注文の応答の組み立て<br/>OrderResponseMapper<br/>(OrderResponseMapper.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、6、17 に適用<br/>*a 通信に失敗した場合: 6、17 に適用

    User->>Work: 出店者メニューの「注文実績」をクリック (EC-C03)
    Work->>Page: URL を /seller/sales に変え、管理する店舗が分かってから<br/>SalesPage を表示 (sellerStoresLoading が false。<br/>key と storeId は選択中の店舗 shop.sellerStoreId)
    opt 1a 複数の店舗を扱う (店舗が 2 つ以上のとき、見出しの下に選択欄を出す)
        User->>Sel: 1a-1 画面上部の「管理する店舗」で、確認する店舗を選ぶ (EC-C03)
        Note over User,Page: 結果: 選択中の店舗を変え (setSellerStoreId)、SalesPage を作り直す (key が変わる)。<br/>画面: 1a-2 基本フロー 2 へ (選んだ店舗で、この後の流れをやり直す)
    end
    Page->>Hook: 見られる店舗を取りに行くよう頼む<br/>(useResource('/seller/sales/stores'))
    Hook->>Http: 画面を開いたときに自動で通信を始める (reload → request)
    Http->>Ctrl: GET /api/seller/sales/stores
    Ctrl->>Svc: 注文実績を見られる店舗を集めるよう頼む (viewableStores)。読むだけのトランザクション<br/>店舗側のアカウントか運営かを確かめ (requireSellerRole)、会員と候補の店舗を調べる<br/>(current、candidateStoreIdsOf。ORG_ADMIN とオーナーは組織の全店舗、担当者は所属する店舗)
    Svc->>StoreRepo: 候補の店舗を読む (findAllById。運営は findAllByOrderByIdAsc、SELECT stores)
    loop 店舗ごと
        Svc->>Policy: その店舗の注文実績を見られるかを確かめる (canViewSales)<br/>その店舗での立場を調べる (AuthService の positionsAt →<br/>memberRoleAt、organizationRoleOf、organizationIdOf)
        Policy-->>Svc: 閉鎖済みならオーナー・ORG_ADMIN・運営、<br/>そうでなければオーナー・MANAGER・STAFF・運営<br/>(運営が停止した店舗は運営だけ) なら見られる
    end
    Ctrl-->>Hook: 200 見られる店舗の配列 (id、name、closedAt)
    Hook-->>Page: 見られる店舗
    Page->>Page: 選択中の店舗 (chosen)、ほかの閉鎖済みの店舗 (closed)、<br/>表示する店舗 (target = 選んだ店舗か chosen) を決める
    opt 2a 閉鎖した店舗の注文実績を確認する (閉鎖済みのほかの店舗があるとき。オーナー・ORG_ADMIN)
        User->>Page: 2a-1「表示する店舗」の「閉鎖した店舗」から店舗を選ぶ
        Note over User,Page: 結果: その店舗を表示する店舗にする (setPicked)。<br/>画面: 「表示する店舗」の選択欄 (選択中の店舗か「店舗を選んでください」と、「閉鎖した店舗」の「店舗名（閉鎖済み）」)
    end
    Page->>Hook: 2 その店舗の注文実績を取りに行くよう頼む<br/>(SalesReport → useResource('/seller/stores/{storeId}/sales'))
    Hook->>Http: 画面を開いたときに自動で通信を始める (reload → request)
    Http->>Ctrl: GET /api/seller/stores/{storeId}/sales
    Ctrl->>Svc: 店舗の注文実績を作るよう頼む (report)。読むだけのトランザクション
    Svc->>StoreRepo: 店舗を読む (findById、SELECT stores)
    Svc->>Policy: ログイン中の会員を調べ (AuthService の current)、<br/>その店舗の注文実績を見られるかを確かめる (canViewSales)。判定は 9〜10 と同じ
    Svc->>OrderRepo: 店舗の注文を新しい順に読む<br/>(build → findByStoreIdOrderByCreatedAtDesc、SELECT orders)
    loop 注文ごと (row)
        Svc->>Mapper: 手数料と差引額を求めるよう頼む (figures)
        Mapper-->>Svc: 注文のときの手数料率、販売手数料、差引額、合計に入れるか<br/>(キャンセルは手数料と差引額を 0 にする。<br/>キャンセルと支払い待ちは合計に入れない)
    end
    Svc->>Svc: 件数と合計を作る (SalesTotals。注文数と金額の合計は、<br/>キャンセルでも支払い待ちでもない注文だけ)
    Ctrl-->>Hook: 200 注文実績 (店舗名、closedAt、注文の一覧、件数と合計)
    Hook-->>Page: 注文実績
    Page-->>User: 3 店舗名、「注文数：N件 / 支払い待ち：N件 / キャンセル：N件 /<br/>キャンセル申請中：N件」、「注文金額」「販売手数料」「差引額」と、販売手数料の計算方法の説明<br/>(2a-2 閉鎖済みの店舗なら、店舗名の横の「閉鎖済み」と「(日時)に閉鎖した店舗です。<br/>注文実績は読み取り専用で、期限なく確認できます。」)
    Page-->>User: 注文ごとの一覧 (注文番号、注文日時、状態、支払方法、注文金額、<br/>手数料率、販売手数料、差引額。キャンセルは「手数料なし」と「—」)
    User->>Page: 4 注文実績を確認する (読み取りだけで、注文を変える操作はない)
```

![EC-S07 シーケンス図](<images/EC-S07_注文実績を確認する-1.png>)
