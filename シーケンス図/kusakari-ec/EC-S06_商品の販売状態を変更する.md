# EC-S06 商品の販売状態を変更する

- ユースケース記述: [EC-S06_商品の販売状態を変更する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S06_商品の販売状態を変更する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
代替フローのうち、エラーで終わるもの（4a・4b）と記述にない分岐（店舗・商品がない 404、商品 ID の重複の 400）は、分かれる所だけを描き、結果と画面は Note に文で書いています。3c（確認ダイアログの「取消」）は、`break` の中の矢印 1 本と Note にしています。サーバーが失敗を返したときの画面の後処理（`readResponse` が `ApiError` を投げる → `write` の `catch` でエラーの文を覚える → 一覧を取り直す → 失敗を返し、確認ダイアログから確定したときはダイアログが開いたまま）は、どれも同じです。

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

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、8、32、一覧の取り直しの 41 に適用<br/>*a 通信に失敗した場合: 4、8、30、32、一覧の取り直しの 41、購入者向けの商品の 43 に適用

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
        break 3c 確認ダイアログで「取消」をクリック
            User->>List: 「取消」をクリック<br/>(Esc キー、「閉じる」、ダイアログの外側のクリックも同じ)
            Note over User,List: 結果: 通信せず、選択は残る (setPending(null))。<br/>画面: 3c-1 ダイアログを閉じる。3c-2 ここで終わり
        end
        User->>List: 3a-3「非表示を確定」か「再公開を確定」をクリック
        List->>Cat: 変更を頼む (apply → onStatus → changeStatus)
    else 3b 取り扱いをやめる商品を削除する
        User->>List: 3b-1 対象商品の行の「削除」をクリック<br/>(複数なら選んで「選択商品を削除」)
        List-->>User: 3b-2 確認ダイアログを表示 (confirm → setPending)<br/>「削除の確認」、対象店舗：店舗名 / N件、商品名、<br/>「この店舗の管理一覧からも削除します。復元はできません。<br/>注文履歴と他店舗の販売には影響しません。」、「削除を確定」、「取消」
        break 3c 確認ダイアログで「取消」をクリック
            User->>List: 「取消」をクリック<br/>(Esc キー、「閉じる」、ダイアログの外側のクリックも同じ)
            Note over User,List: 結果: 通信しない (setPending(null))。<br/>画面: 3c-1 ダイアログを閉じる。3c-2 ここで終わり
        end
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
    break 4b 権限がない (削除は STAFF・ロールなし、公開状態の変更はロールなし)
        Note over Auth,Mgr: 結果: 403 FORBIDDEN を返し、何も変えない (requireStoreRole → denied)。<br/>画面: 4b-1「この操作の権限がありません。」
    end
    Svc->>Prod: 店舗があるか (CatalogService.requireStore、SELECT stores)、商品 ID に重複がないか、<br/>商品がこの店舗のものか (requireAtStore → findStoreReferences、SELECT products) を確かめる
    break 店舗がない、商品 ID の重複、ほかの店舗の商品 (記述なし)
        Note over Prod,Mgr: 結果: 404 STORE_NOT_FOUND、400 DUPLICATE_PRODUCT か 404 PRODUCT_NOT_FOUND を返し、何も変えない。<br/>画面: エラーの文
    end
    Svc->>Inv: 在庫の行を商品 ID の順にロックして読む<br/>(lockAll、SELECT ... ORDER BY product_id FOR UPDATE inventory)
    break 4a 保存できない (行の数が違う、削除済みの商品を公開・非表示にする)
        Note over Inv,Mgr: 結果: 404 PRODUCT_NOT_FOUND か 409 PRODUCT_ARCHIVED を返し、何も変えない。<br/>画面: 4a-1「選択店舗の商品が見つかりません。」か「削除済みの商品は再公開・非表示に変更できません。」と最新の販売状態 (4a-2 基本フロー 3 へ戻る)
    end
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

## 共通代替フローを直接書いた図

上の図の、販売状態を変える通信（CSRF トークンの取得と `PATCH /api/seller/products/status`）に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。画面を開いて一覧を取る通信の \*a・\*b は、[EC-S05](<EC-S05_店舗在庫数を更新する.md>) の「共通代替フローを直接書いた図」と同じなので省いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Mgr as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant List as 商品の一覧と確認ダイアログ<br/>SellerProductList<br/>(SellerProductList.jsx)
        participant Cat as 商品の取得と変更<br/>useSellerCatalog<br/>(useSellerCatalog.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 出店者の商品API<br/>SellerProductController<br/>(SellerProductController.java)
        participant Svc as 出店者の商品の処理<br/>SellerProductService<br/>(SellerProductService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>List: 「公開状態」のボタン、または確認ダイアログの<br/>「非表示を確定」「再公開を確定」「削除を確定」をクリック
    List->>Cat: 変更を頼む (onStatus → changeStatus)
    Cat->>Http: 販売状態を変える通信を送る (write → api.setProductStatus)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない、または PATCH が届かない、応答が JSON でない
        AuthJs-xFilter: GET /api/auth/csrf または PATCH /api/seller/products/status
        Http->>Http: 通信の失敗にまとめる<br/>(ApiError(networkErrorMessage, 0))
        Http--xCat: エラーを投げる
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
        Http-->>Cat: 最新の商品の一覧 (これも失敗したら取り直さない)
        Cat-->>List: 失敗を返す (false)
        Mgr-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」<br/>*a-2 確認ダイアログと選択はそのまま
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        AuthJs->>Filter: PATCH /api/seller/products/status
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる (kusakari-session-expired)
        Http--xCat: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)。これも 401
        Cat-->>List: 失敗を返す (false)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/seller/products のログイン画面<br/>(*b-2 ログインの後は商品管理画面を開き直す。販売状態は変わっていない)
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: PATCH /api/seller/products/status
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xCat: エラーを投げる (ApiError 503)
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
        Cat-->>List: 失敗を返す (false)
        Mgr-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」<br/>*a-2 確認ダイアログと選択はそのまま
    else 要求が Controller まで届いた
        AuthJs->>Filter: PATCH /api/seller/products/status
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 販売状態を変えるよう頼む (update)
        Svc->>Db: 権限と商品を確かめ、在庫の行をロックして読み、<br/>書き換えてコミットする (上の図の 34〜38)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xCat: エラーを投げる (ApiError 503)
            Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
            Cat-->>List: 失敗を返す (false)
            Mgr-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」<br/>*a-2 確認ダイアログと選択はそのまま
        else 書き換えた
            Db-->>Svc: 完了
            Svc-->>Ctrl: 終わった
            Ctrl-->>Http: 200 { updated: true }
            Http-->>Cat: { updated: true }
            Cat-->>List: 一覧を取り直して成功を返す (refresh、true)
            Mgr-->>User: 「N件の商品を…しました。」と最新の一覧
        end
    end
    opt *a-3 やり直す
        User->>List: 開いたままの確認ダイアログの確定のボタンか、<br/>もう一度「公開状態」のボタンをクリック (基本フロー 3 へ戻る)
    end
```

![EC-S06 共通代替フローを直接書いた図](<images/EC-S06_商品の販売状態を変更する-2.png>)

## ユースケース記述との差

- 4a: 確認ダイアログ（3a・3b）から確定して失敗したとき、`apply()` は成功のときだけ `setPending(null)` を呼ぶので、ダイアログは開いたままです。エラーの文はダイアログの中ではなく、`ProductManager` の上部に出ます。記述の 4a-2「基本フロー 3 へ戻る」とは、ダイアログが残る点が違います。
- 4a: 記述は「保存に失敗した場合」とだけ書いています。サーバーが返す失敗は、店舗がない 404 `STORE_NOT_FOUND`（店舗がないと権限の確認が先に 403 にするので、運営のアカウントのときだけ）、ID の重複の 400 `DUPLICATE_PRODUCT`「商品IDが重複しています。」、選択店舗の商品でない 404 `PRODUCT_NOT_FOUND`「選択店舗の商品が見つかりません。」、削除済みの商品を公開・非表示にする 409 `PRODUCT_ARCHIVED`「削除済みの商品は再公開・非表示に変更できません。」です。どれも画面の動き（エラーの文を出して一覧を取り直す）は同じです。重複の 400 は、画面が同じ商品を 2 度選ばないので、画面からはふつう起きません。
- 4a: `useSellerCatalog.js` の `write()` は、失敗の種類によらず一覧を取り直します（共通代替フローの通信の失敗でも取り直す）。
- 4b: 権限の確かめ方は記述のとおりで、削除は `requireManager()`（オーナーか MANAGER）、公開状態の変更は `requireSeller()`（STAFF 以上）です。ただし画面は、STAFF にも「削除」「選択商品を削除」を出し、確認ダイアログも開きます。確定するとサーバーが 403 を返します。また、運営が停止した店舗と、存在しない店舗でも 403 になります。
- 4b: ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が「商品管理」画面の代わりに人事の画面だけを使える旨を出し、通信しません。403 に届く「ロールなし」は、所属店舗でロールのない担当者（`memberRole` が `NONE`）です。
- 3a・3b: 確認ダイアログには、変更の内容として「この店舗の購入者一覧から除外し、カートに入っている場合も購入できなくなります。」（非表示・削除）か「この店舗の購入者一覧へ再公開します。」（再公開）も出ます。
- 3b-4: 削除は `inventory.publication_status` を `DELETED` にする論理削除で、商品と在庫の行は残ります。一覧は `findNotDeletedAtStore()` が `DELETED` の商品を除くので、画面から消えます。
- 基本フロー 5・3b-5: 成功すると、「N件の商品を非表示に変更しました。」「N件の商品を再公開しました。」「N件の商品を削除しました。」のどれかを出します。記述にはメッセージが書かれていません。
- 基本フロー 4: 成功のあと、出店者の一覧（`GET /api/seller/products`）のほかに、`shop.refreshProducts()` が購入者向けの商品（`GET /api/cart`、`GET /api/products`）も取り直します。記述にない処理です。保存が成功しても、この取り直しに失敗すると `write()` は失敗として扱い、エラーの文を出してダイアログを開いたままにします。
- 3c: 「取消」のほか、ダイアログの「閉じる」ボタン、Esc キー、ダイアログの外側のクリックも同じく `setPending(null)` だけです（通信中は閉じない）。選んでいたチェックボックスは残ります。
- 関連情報「商品一覧は25件ずつ…」: 検索（商品名と商品番号、大文字と小文字を区別しない）、絞り込み、並び替え、「条件をリセット」、ページ送りは画面の中だけで、通信しません。条件を変えると選択は外れ、1 ページ目に戻ります。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`personnelOnly`、`/seller/products` と `ProductManager` の対応
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ProductManager.jsx): `ProductManager`（`catalog.error`、`shop.notice` の表示、`onStatus`）
- [frontend/src/components/SellerProductList.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SellerProductList.jsx): `SellerProductList`、`statusLabels`、`confirm`、`apply`、`setPending`、`setSelected`、確認ダイアログの文言
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Dialog.jsx): `Dialog`（Esc キー、「閉じる」）
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/useSellerCatalog.js): `useEffect`（一覧の取得）、`refresh`、`write`、`changeStatus`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `refresh`（`refreshProducts`）、`setNotice`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`api.sellerProducts`、`api.setProductStatus`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`wasSignedIn`、`login`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list`、`moderation`、`update`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductStatusRequest.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/dto/ProductStatusRequest.java): `ProductStatusRequest`（`productIds` は 1〜25 件、`status` は PUBLISHED・HIDDEN・DELETED）
- [backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java): `list`、`update`、`requireAtStore`、`notAtStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `requireStore`、`storeProducts`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `noticesAt`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lockAll`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findStoreReferences`、`findNotDeletedAtStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/entity/InventoryEntity.java): `PUBLISHED`、`HIDDEN`、`DELETED`、`setPublicationStatus`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireSeller`、`requireManager`、`requireStoreRole`、`denied`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`database`
