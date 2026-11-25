# EC-S06 商品の販売状態を変更する

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Mgr as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant List as 商品の一覧と確認ダイアログ<br/>SellerProductList<br/>(SellerProductList.jsx)
        participant Cat as 商品の取得と変更<br/>useSellerCatalog<br/>(useSellerCatalog.js)
        participant Hook as 警告・停止の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 出店者の商品API<br/>SellerProductController<br/>(SellerProductController.java)
        participant Svc as 出店者の商品の処理<br/>SellerProductService<br/>(SellerProductService.java)
        participant Mod as 運営の警告・停止<br/>ProductModerationService<br/>(ProductModerationService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant Prod as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
        participant Inv as 在庫の読み書き<br/>InventoryRepository<br/>(InventoryRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、8、30、一覧の取り直しの 39 に適用<br/>*a 通信に失敗した場合: 4、8、28、30、一覧の取り直しの 39、購入者向けの商品の 41 に適用

    User->>Work: 出店者メニューの「商品管理」をクリック
    Work->>Mgr: URL を /seller/products に変え、<br/>ProductManager を表示 (選択中の店舗にロールがあるとき)
    par 商品の一覧
        Mgr->>Cat: 選択中の店舗の商品を取りに行くよう頼む (useSellerCatalog)
        Cat->>Ctrl: 店舗が決まったら自動で一覧の通信を始める (useEffect → api.sellerProducts)<br/>GET /api/seller/products?storeId={店舗ID}
        Ctrl->>Svc: 店舗の商品の一覧を作るよう頼む (list)<br/>中身は EC-S05 の図と同じ流れ
        Ctrl-->>Cat: 200 出店者向けの商品の配列 (公開状態 publicationStatus を含む。setProducts)
    and 運営からの警告・停止
        Mgr->>Hook: 運営からの警告・停止を取りに行くよう頼む (useResource)
        Hook->>Ctrl: 画面を開いたときに自動で通信を始める (reload → request)<br/>GET /api/seller/products/moderation?storeId={店舗ID}
        Ctrl->>Mod: 警告中・公開停止中の商品を読むよう頼む (noticesAt)<br/>中身は EC-S05 の図と同じ流れ
        Ctrl-->>Hook: 200 警告・停止の配列
    end
    Mgr->>List: 商品の一覧を渡して表示 (SellerProductList)<br/>変更の頼み先は changeStatus (onStatus)
    List->>List: 検索、カテゴリ、公開状態、並び順で絞って並べ、<br/>25 件ずつのページに分ける (はじめは条件なし、登録が新しい順)
    List-->>User: 商品の一覧、行ごとの「公開状態」のボタン (「公開中」か「非表示」)、<br/>「編集」「削除」、「選択商品を非表示」「選択商品を再公開」「選択商品を削除」

    alt 基本フロー 3 1 件の「公開状態」のボタン
        User->>List: 対象商品の行の「公開状態」のボタンをクリック
        List->>Cat: 確認ダイアログを出さずに変更を頼む (onStatus → changeStatus)<br/>「公開中」なら HIDDEN、「非表示」なら PUBLISHED
    else 3a 複数の商品をまとめて変更する
        User->>List: 3a-1 各商品のチェックボックス (または<br/>「現在ページの商品をすべて選択」) を選ぶ
        List->>List: 選んだ商品を覚える (setSelected)。<br/>選べるのは表示中のページの商品だけ
        User->>List: 「選択商品を非表示」か「選択商品を再公開」をクリック
        List-->>User: 3a-2 確認ダイアログを表示 (confirm → setPending)<br/>「商品状態変更の確認」「非表示の確認」か「再公開の確認」、対象店舗：店舗名 / N件、<br/>商品名、変更の内容、「非表示を確定」か「再公開を確定」、「取消」
        User->>List: 3a-3「非表示を確定」か「再公開を確定」をクリック
        List->>Cat: 変更を頼む (apply → onStatus → changeStatus)
    else 3b 取り扱いをやめる商品を削除する
        User->>List: 3b-1 対象商品の行の「削除」をクリック<br/>(複数なら選んで「選択商品を削除」)
        List-->>User: 3b-2 確認ダイアログを表示 (confirm → setPending)<br/>「削除の確認」、対象店舗：店舗名 / N件、商品名、<br/>「この店舗の管理一覧からも削除します。復元はできません。<br/>注文履歴と他店舗の販売には影響しません。」、「削除を確定」、「取消」
        User->>List: 3b-3「削除を確定」をクリック
        List->>Cat: 削除を頼む (apply → onStatus → changeStatus、status は DELETED)
    end

    Cat->>Http: 前のお知らせとエラーを消し、販売状態を変える通信を送る<br/>(write → api.setProductStatus、本文は { storeId, productIds, status })
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    AuthJs->>AuthCtrl: GET /api/auth/csrf
    AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
    AuthJs->>Ctrl: PATCH /api/seller/products/status<br/>(CSRF トークンのヘッダー付き)
    Ctrl->>Svc: 販売状態を変えるよう頼む (update)<br/>update 全体が 1 つのトランザクション
    Svc->>Auth: 削除ならオーナーか MANAGER か (requireManager)、<br/>ほかは STAFF 以上か (requireSeller) を確かめる
    Svc->>Prod: 店舗があるか (CatalogService.requireStore、SELECT stores)、商品 ID に重複がないか、<br/>商品がこの店舗のものか (requireAtStore → findStoreReferences、SELECT products) を確かめる
    Svc->>Inv: 在庫の行を商品 ID の順にロックして読む<br/>(lockAll、SELECT ... ORDER BY product_id FOR UPDATE inventory)
    Svc->>Svc: 選んだ商品の公開状態を書き換える (setPublicationStatus)<br/>削除は DELETED にするだけで、行は残す
    Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE inventory)
    Ctrl-->>Http: 200 { updated: true }
    Http-->>Cat: { updated: true }
    par 出店者の一覧
        Cat->>Ctrl: 一覧を取り直す (refresh → api.sellerProducts)<br/>GET /api/seller/products?storeId={店舗ID}。流れは 4〜6 と同じ
        Ctrl-->>Cat: 200 最新の商品の一覧
    and 購入者向けの商品
        Cat->>Http: カートと購入者向けの商品を取り直す (shop.refreshProducts)<br/>GET /api/cart は出店者には 403 BUYER_REQUIRED、続けて GET /api/products
        Http-->>Cat: 購入者向けの商品
    end
    Cat-->>List: 結果の文を出し (shop.setNotice)、成功を返す (true)<br/>「N件の商品を非表示に変更しました。」「N件の商品を再公開しました。」<br/>「N件の商品を削除しました。」
    List->>List: ダイアログを閉じ、選択を外す (setPending(null)、setSelected([]))
    Mgr-->>User: 結果の文と最新の一覧と販売状態。<br/>3b-4 削除した商品は一覧から消える (3b-5 終わり)
```

![EC-S06 シーケンス図](<images/EC-S06_商品の販売状態を変更する-1.png>)
