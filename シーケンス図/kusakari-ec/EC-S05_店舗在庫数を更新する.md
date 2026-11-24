# EC-S05 店舗在庫数を更新する

- ユースケース記述: [EC-S05_店舗在庫数を更新する](<../../アーカイブ/ユースケース/kusakari-ec/EC-S05_店舗在庫数を更新する.md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant Mgr as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant List as 商品の一覧<br/>SellerProductList<br/>(SellerProductList.jsx)
        participant Editor as 在庫数の入力欄<br/>StockEditor<br/>(StockEditor.jsx)
        participant Cat as 商品の取得と変更<br/>useSellerCatalog<br/>(useSellerCatalog.js)
        participant Hook as 警告・停止の取得<br/>useResource<br/>(useResource.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch<br/>(auth.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Ctrl as 出店者の商品API<br/>SellerProductController<br/>(SellerProductController.java)
        participant Errs as エラーの応答<br/>ApiErrors<br/>(ApiErrors.java)
        participant Svc as 出店者の商品の処理<br/>SellerProductService<br/>(SellerProductService.java)
        participant Mod as 運営の警告・停止<br/>ProductModerationService<br/>(ProductModerationService.java)
        participant Auth as ログイン中の会員<br/>AuthService<br/>(AuthService.java)
        participant CatSvc as 商品の読み込み<br/>CatalogService<br/>(CatalogService.java)
        participant Prod as 商品の読み書き<br/>ProductRepository<br/>(ProductRepository.java)
        participant Inv as 在庫の読み書き<br/>InventoryRepository<br/>(InventoryRepository.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、5、23、45、一覧の取り直しの 81・87 に適用<br/>*a 通信に失敗した場合: 5、23、43、45、一覧の取り直しの 81・87・89 に適用

    User->>Work: 出店者メニューの「商品管理」をクリック
    Work->>Mgr: URL を /seller/products に変え、<br/>ProductManager を表示 (選択中の店舗にロールがあるとき)
    par 商品の一覧
        Mgr->>Cat: 選択中の店舗の商品を取りに行くよう頼む (useSellerCatalog)
        Cat->>Http: 店舗が決まったら自動で<br/>一覧の通信を始める (useEffect → api.sellerProducts)
        Http->>Ctrl: GET /api/seller/products?storeId={店舗ID}
        Ctrl->>Svc: 店舗の商品の一覧を作るよう頼む (list)<br/>読むだけのトランザクション
        Svc->>Auth: ログイン中の人がこの店舗の商品を<br/>見られるかを確かめる (requireStoreViewer)
        Auth-->>Svc: 見られる (オーナー、所属の担当者、運営)
        Svc->>Prod: 商品を追加した人の名前を読む (findCreatorNamesAtStore)
        Prod->>Db: SELECT products JOIN members
        Db-->>Prod: 商品 ID と表示名
        Prod-->>Svc: 追加した人の名前
        Svc->>CatSvc: 店舗の削除されていない商品を読むよう頼む (storeProducts)
        CatSvc->>Db: 店舗があるかを確かめ、商品、在庫、店舗、組織を読む<br/>(requireStore、findNotDeletedAtStore、listings)
        Db-->>CatSvc: stores、products、inventory、organizations の行
        CatSvc-->>Svc: 商品の一覧 (在庫数 stock、公開状態)
        Svc-->>Ctrl: 出店者向けの商品の一覧 (toSellerView)
        Ctrl-->>Http: 200 商品の配列
        Http-->>Cat: 商品の一覧
        Cat-->>Mgr: 商品の一覧 (setProducts)
    and 運営からの警告・停止
        Mgr->>Hook: 運営からの警告・停止を取りに行くよう頼む (useResource)
        Hook->>Http: 画面を開いたときに自動で<br/>通信を始める (reload → request)
        Http->>Ctrl: GET /api/seller/products/moderation?storeId={店舗ID}
        Ctrl->>Mod: 警告中・公開停止中の商品を読むよう頼む (noticesAt)
        Mod->>Db: 見られる店舗かを確かめ、警告の履歴と<br/>公開停止中の商品を読む (requireStoreViewer ほか)
        Db-->>Mod: 行
        Mod-->>Ctrl: 警告・停止の一覧
        Ctrl-->>Http: 200 警告・停止の配列
        Http-->>Hook: 警告・停止の一覧
        Hook-->>Mgr: 警告・停止の一覧
    end
    Mgr->>List: 商品の一覧と警告・停止を渡して表示 (SellerProductList)
    List-->>User: 商品ごとの在庫数、0 なら「在庫切れ」、<br/>行ごとの「在庫を編集」

    User->>List: 対象商品の行の「在庫を編集」をクリック
    List->>Mgr: 選択を外し、在庫を変える商品を伝える (setSelected([]) → onStock)
    Mgr->>Editor: 在庫数の入力欄を表示 (setStocking → StockEditor)<br/>変更前の在庫数として今の在庫数を覚える (expected)
    Editor-->>User: 「(商品名)：変更前の在庫数 N」、「在庫数」の入力欄、<br/>「在庫を保存」、「取消」
    User->>Editor: 「在庫数」の入力欄に新しい在庫数を入力し、<br/>「在庫を保存」をクリック
    Editor->>Editor: 入力値が 0〜10000 の整数かを確かめる (save)

    alt 7a 空、整数でない、0〜10000 の範囲外
        Editor-->>User: 7a-1「在庫は0〜10000の整数で入力してください。」<br/>通信せず、在庫数は変えない (7a-2 基本フロー 5 へ戻る)
    else 入力が正しい
        Editor->>Cat: 在庫数の保存を頼む (onSave → saveStock)<br/>店舗 ID、変更前の在庫数、新しい在庫数
        Cat->>Http: 前のお知らせとエラーを消し、在庫数を書き換える<br/>通信を送る (write → request、本文は { storeId, expectedStock, stock })
        Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
        AuthJs->>AuthCtrl: GET /api/auth/csrf
        AuthCtrl-->>AuthJs: 200 ヘッダー名とトークン (csrf)
        AuthJs->>Ctrl: PUT /api/seller/products/{id}/stock<br/>(CSRF トークンのヘッダー付き)
        Ctrl->>Svc: 在庫数を書き換えるよう頼む (updateStock)<br/>updateStock 全体が 1 つのトランザクション
        Svc->>Auth: ログイン中の人がこの店舗で STAFF 以上の<br/>ロールを持つかを確かめる (requireSeller → requireStoreRole)
        alt 8b ロールがない (運営が停止した店舗、ない店舗も同じ)
            Auth--xErrs: 403 FORBIDDEN の例外を投げる (denied)
            Errs-->>Http: 403「この操作の権限がありません。」(business)
        else ロールがある
            Auth-->>Svc: 扱える
            Svc->>CatSvc: 店舗があるかを確かめるよう頼む (requireStore)
            CatSvc->>Db: SELECT stores (existsById)
            Db-->>CatSvc: 店舗の有無
            CatSvc-->>Svc: ある (なければ 404 STORE_NOT_FOUND)
            Svc->>Prod: 商品がこの店舗のものかを確かめる<br/>(requireAtStore → findStoreReferences)
            Prod->>Db: SELECT products の id、store_id
            Db-->>Prod: 商品の店舗
            Prod-->>Svc: 商品の店舗 (ほかの店舗なら 404 PRODUCT_NOT_FOUND)
            Svc->>Inv: 在庫の行をロックして読む (lock)
            Inv->>Db: SELECT ... FOR UPDATE inventory
            Db-->>Inv: ロックした在庫の行
            Inv-->>Svc: 在庫 (数量、公開状態)
            alt 商品が削除済み (記述なし)
                Svc--xErrs: 409 PRODUCT_ARCHIVED の例外を投げる (ApiException)
                Errs-->>Http: 409「削除済みの商品の在庫は変更できません。」(business)
            else 8a 今の在庫数が変更前の在庫数と違う (注文の引き当て、キャンセルの戻しなど)
                Svc--xErrs: 409 STOCK_CHANGED の例外を投げる (stockChanged)
                Errs-->>Http: 409「在庫数が変更されています（現在の在庫数：N）。<br/>最新の在庫数を確認して、もう一度保存してください。」(business)
            else 同じ
                Svc->>Svc: 在庫の数量を新しい在庫数に書き換える (setQuantity)
                Svc->>Prod: 商品を追加した人の名前を読む (findCreatorName)
                Prod->>Db: SELECT products JOIN members
                Db-->>Prod: 表示名
                Prod-->>Svc: 追加した人の名前
                Svc->>CatSvc: 書き換えた後の商品を読むよう頼む (product)
                CatSvc->>Db: 商品、在庫、店舗、組織を読む (findByIdIn、listings)
                Db-->>CatSvc: 行
                CatSvc-->>Svc: 商品
                Svc->>Db: 書き換えた行を保存してコミットする<br/>(save は呼ばない。UPDATE inventory)
                Db-->>Svc: 完了
                Svc-->>Ctrl: 出店者向けの商品 (toSellerView)
                Ctrl-->>Http: 200 更新後の商品
            end
        end
        alt 失敗の応答 (8a、8b、記述にない 404・409)
            Http--xCat: エラーを投げる (readResponse → ApiError)
            Cat->>Http: エラーの文を覚え (setError)、<br/>一覧を取り直す (refresh → api.sellerProducts)。流れは 5〜18 と同じ
            Http-->>Cat: 最新の商品の一覧
            Cat-->>Editor: 失敗と、同じ商品の最新の値を返す (saved が false、latest)
            Editor->>Editor: 変更前の在庫数を最新の値にする (setExpected)。<br/>入力した値は残す
            Mgr-->>User: エラーの文と最新の在庫数の一覧。入力欄は開いたまま<br/>(8a-1・8a-2 基本フロー 5 へ戻る。8b-1 は「この操作の権限がありません。」)
        else 200
            Http-->>Cat: 更新後の商品
            par 出店者の一覧
                Cat->>Http: 一覧を取り直す (refresh → api.sellerProducts)<br/>流れは 5〜18 と同じ
                Http-->>Cat: 最新の商品の一覧
            and 購入者向けの商品
                Cat->>Http: カートと購入者向けの商品を取り直す (shop.refreshProducts)<br/>GET /api/cart は出店者には 403 BUYER_REQUIRED、続けて GET /api/products
                Http-->>Cat: 購入者向けの商品
            end
            Cat->>Cat: 「在庫数を保存しました。」を出す (shop.setNotice)
            Cat-->>Editor: 成功を返す (saved が true)
            Editor->>Mgr: 入力欄を閉じるよう伝える (onDone → setStocking(null))
            Mgr-->>User: 入力欄を閉じ、「在庫数を保存しました。」と<br/>更新後の在庫数の一覧
        end
    end
```

## 共通代替フローを直接書いた図

上の図の、画面を開いたときの通信と在庫数の保存の通信に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。
この画面の商品の一覧は `useResource.js` ではなく `useSellerCatalog.js` が受けるので、失敗の出方が 00 の例（「再取得」が出る）と違います。運営からの警告・停止の通信（上の図の 23）は、失敗しても画面に何も出ません（`ProductManager` がエラーを表示しない）。

```mermaid
sequenceDiagram
    autonumber
    actor User as 出店者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as 出店者画面の枠<br/>Workspace<br/>(Workspace.jsx)
        participant UseAuth as ログイン状態の読み込み<br/>useAuth<br/>(useAuth.js)
        participant Panel as ログイン欄<br/>AuthPanel<br/>(AuthPanel.jsx)
        participant Mgr as 商品管理画面<br/>ProductManager<br/>(ProductManager.jsx)
        participant Editor as 在庫数の入力欄<br/>StockEditor<br/>(StockEditor.jsx)
        participant Cat as 商品の取得と変更<br/>useSellerCatalog<br/>(useSellerCatalog.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as 通信の準備<br/>authFetch・readSession<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant PwCtrl as ログインAPI<br/>PasswordLoginController<br/>(PasswordLoginController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 出店者の商品API<br/>SellerProductController<br/>(SellerProductController.java)
        participant Svc as 出店者の商品の処理<br/>SellerProductService<br/>(SellerProductService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    alt URL を直接開いた (再読み込みも同じ)
        User->>Work: /seller/products を開く
        Work->>UseAuth: ログイン状態を読むよう頼む (useAuth → refreshSession)
        UseAuth->>AuthJs: ログイン状態を読む (readSession)
        alt *a ログイン状態を読めない
            AuthJs-xAuthCtrl: GET /api/auth/me
            AuthJs--xUseAuth: エラーを投げる (届かなければブラウザーの文、<br/>200 以外なら「ログイン状態を確認できません。」)
            UseAuth-->>Work: エラーの文 (setError)
            Work-->>User: *a-1 そのエラーの文だけ。「再取得」はなく、<br/>*a-3 はブラウザーの再読み込み
        else *b ログインしていない
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=false
            AuthJs-->>UseAuth: ログインしていない
            UseAuth-->>Work: ログインしていない
            Work->>Panel: 画面の代わりにログイン欄を表示 (AuthPanel)
            Panel-->>User: *b-1「メールアドレス」「パスワード」「ログイン」
            User->>Panel: 入力して「ログイン」をクリック
            Panel->>AuthJs: ログインを頼む (submit → passwordLogin)<br/>returnTo は今の URL
            AuthJs->>PwCtrl: GET /api/auth/csrf のあと POST /api/auth/login
            PwCtrl->>Cog: メールアドレスとパスワードを確かめる<br/>(InitiateAuth USER_PASSWORD_AUTH)
            Cog-->>PwCtrl: ID トークン、refresh トークン
            PwCtrl-->>AuthJs: 200 returnTo
            AuthJs-->>Panel: 戻り先の URL
            Panel-->>User: *b-2 /seller/products を読み込み直す (complete)。<br/>この図の 1 からやり直す
        else ログインしている
            AuthJs->>AuthCtrl: GET /api/auth/me
            AuthCtrl-->>AuthJs: 200 authenticated=true
            AuthJs-->>UseAuth: ログイン中の会員
            UseAuth-->>Work: ログイン中の会員
            Work->>Mgr: ProductManager を表示
        end
    else メニューから開いた
        User->>Work: 出店者メニューの「商品管理」をクリック
        Work->>Mgr: URL を /seller/products に変え、ProductManager を表示。<br/>ログイン状態は読み直さない
    end

    Mgr->>Cat: 選択中の店舗の商品を取りに行くよう頼む (useSellerCatalog)
    Cat->>Http: 一覧の通信を始める (useEffect → api.sellerProducts)
    alt *a 届かない、または応答が JSON でない
        Http-xFilter: GET /api/seller/products?storeId={店舗ID}
        Http--xCat: エラーを投げる (ApiError(networkErrorMessage, 0))
        Cat-->>Mgr: エラーの文 (catch → setError)
        Mgr-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と空の一覧。<br/>「再取得」はなく、*a-3 はブラウザーの再読み込みか店舗の選び直し
    else *b 使っている間にログインが切れた
        Http->>Filter: GET /api/seller/products?storeId={店舗ID}
        Filter-->>Http: 401 LOGIN_REQUIRED
        Http->>Notice: 期限切れを知らせる (kusakari-session-expired)
        Http--xCat: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Cat-->>Mgr: エラーの文 (setError)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
    else *a Cognito か MySQL に届かない
        Http->>Filter: GET /api/seller/products?storeId={店舗ID}
        Filter-->>Http: 503 AUTH_UNAVAILABLE か DATABASE_UNAVAILABLE
        Http--xCat: エラーを投げる (ApiError 503)
        Cat-->>Mgr: エラーの文 (setError)
        Mgr-->>User: *a-1「認証を確認できません。…」か<br/>「保存処理を完了できませんでした。…」と空の一覧
    else 一覧を取れた
        Http->>Filter: GET /api/seller/products?storeId={店舗ID}
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl-->>Http: 200 商品の配列 (上の図の 6〜18)
        Http-->>Cat: 商品の一覧
        Cat-->>Mgr: 商品の一覧
        Mgr-->>User: 商品ごとの在庫数と「在庫を編集」
    end

    User->>Editor: 新しい在庫数を入力し、「在庫を保存」をクリック
    Editor->>Cat: 在庫数の保存を頼む (onSave → saveStock)
    Cat->>Http: 在庫数を書き換える通信を送る (write → request)
    Http->>AuthJs: 書き込みの前に CSRF トークンを取るよう頼む (send → authFetch)
    alt *a CSRF トークンを取れない、または PUT が届かない、応答が JSON でない
        AuthJs-xFilter: GET /api/auth/csrf または PUT /api/seller/products/{id}/stock
        Http->>Http: 通信の失敗にまとめる<br/>(ApiError(networkErrorMessage, 0))
        Http--xCat: エラーを投げる
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
        Http-->>Cat: 最新の商品の一覧 (これも失敗したら取り直さない)
        Cat-->>Editor: 失敗を返す (saved が false)
        Mgr-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」<br/>*a-2 入力欄は開いたまま、入力した値も残る
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        AuthJs->>Filter: PUT /api/seller/products/{id}/stock
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる (kusakari-session-expired)
        Http--xCat: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)。これも 401
        Cat-->>Editor: 失敗を返す (saved が false)
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=/seller/products のログイン画面<br/>(*b-2 ログインの後は商品管理画面を開き直す。入力した値は残らない)
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: PUT /api/seller/products/{id}/stock
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xCat: エラーを投げる (ApiError 503)
        Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
        Cat-->>Editor: 失敗を返す (saved が false)
        Mgr-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」<br/>*a-2 入力欄と入力した値は残る
    else 要求が Controller まで届いた
        AuthJs->>Filter: PUT /api/seller/products/{id}/stock
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 在庫数を書き換えるよう頼む (updateStock)
        Svc->>Db: ロールを確かめ、在庫の行をロックして読み、<br/>書き換えてコミットする (上の図の 47〜79)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)。<br/>トランザクションの変更はすべて取り消す
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xCat: エラーを投げる (ApiError 503)
            Cat->>Http: エラーの文を覚え、一覧を取り直す (setError → refresh)
            Cat-->>Editor: 失敗を返す (saved が false)
            Mgr-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」<br/>*a-2 入力欄と入力した値は残る
        else 書き換えた
            Db-->>Svc: 完了
            Svc-->>Ctrl: 更新後の商品
            Ctrl-->>Http: 200 更新後の商品
            Http-->>Cat: 更新後の商品
            Cat-->>Editor: 一覧を取り直して成功を返す (refresh、saved が true)
            Mgr-->>User: 入力欄を閉じ、「在庫数を保存しました。」
        end
    end
    opt *a-3 やり直す
        User->>Editor: 残った入力のまま、もう一度「在庫を保存」をクリック<br/>(基本フロー 6 へ戻る)
    end
```

## ユースケース記述との差

- 8a: 「在庫数の表示後に在庫が変わっていた」かどうかは、画面が送る `expectedStock`（入力欄を開いたときの在庫数）と、ロックして読んだ `inventory.quantity` を比べて決めます。違うと 409 `STOCK_CHANGED` になり、メッセージに現在の在庫数が入ります。画面は一覧を取り直し、`StockEditor` の「変更前の在庫数」を最新の値に変えます。入力した値は残ります。
- 8b: 403 になるのはロールがないときだけではありません。`requireStoreRole()` は、運営が停止した店舗と、存在しない店舗でも 403 `FORBIDDEN` を返します。403 のあとも `StockEditor` は開いたままで、記述の 8b-2「ユースケースを終了する」のように画面が閉じることはありません。
- 8b: 403 に届く「ロールなし」は、所属店舗でロールが割り当てられていない担当者（`memberRole` が `NONE`）です。この担当者は `requireStoreViewer()` を通るので、一覧と「在庫を編集」が表示されます。ORG_ADMIN でロールのない店舗（`memberRole` が `null`）では、`Workspace.jsx` が「商品管理」画面の代わりに「(店舗名)では担当のロールがないため、人事（アカウント・招待キー）の画面だけを使えます。」を出し、通信しません。
- 記述にない失敗の応答があります。商品が選択店舗の商品でないと 404 `PRODUCT_NOT_FOUND`「選択店舗の商品が見つかりません。」、削除済みの商品だと 409 `PRODUCT_ARCHIVED`「削除済みの商品の在庫は変更できません。」です。`requireStore()` の 404 `STORE_NOT_FOUND` は、店舗がないと `requireSeller()` が先に 403 にするので、運営のアカウントのときだけ起きます。画面の動きは 8a と同じで、エラーの文を出して一覧を取り直します。
- 7a: 検査は画面（`StockEditor` の `save`）とサーバー（`StockUpdateRequest` の `@Min(0)`・`@Max(10000)`、違反は 400 `INVALID_INPUT`）の両方にあります。画面の検査が先に止めるので、画面からサーバーの検査には届きません。
- 基本フロー 8: 保存に成功すると、更新後の在庫数に加えて「在庫数を保存しました。」を出し、入力欄を閉じます。記述にはメッセージと入力欄を閉じることが書かれていません。
- 基本フロー 8: 成功のあと、出店者の一覧（`GET /api/seller/products`）のほかに、`shop.refreshProducts()` が購入者向けの商品（`GET /api/cart`、`GET /api/products`）も取り直します。記述にない処理です。
- 一覧の各行には「追加した人：(表示名)」（追加した人が記録されていない商品は「初期データ」）が出ます。サーバーは一覧と在庫の保存のたびに `findCreatorNamesAtStore()`・`findCreatorName()` で名前を読みます。記述にない表示です。
- 記述にない操作として、`StockEditor` の「取消」があります。入力欄を閉じるだけで、通信しません。
- 共通代替フロー: 保存に失敗すると、`useSellerCatalog.js` の `write()` は失敗の種類によらず一覧を取り直します（`useResource.js` は 404・409 のときだけ取り直す）。保存が成功しても、そのあとの一覧か購入者向けの商品の取り直し（上の図の 87・89）に失敗すると、`write()` は失敗として扱い、エラーの文を出して入力欄を開いたままにします（在庫数は保存済みです）。画面を開いたときの一覧の失敗は `ProductManager` の上部に文が出るだけで、「再取得」のボタンはありません。

## 参照したコード

- [frontend/src/workspace/Workspace.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Workspace.jsx): `sellerMenu`、`rolePaths`、`personnelOnly`、未ログインのときの `AuthPanel`、`/seller/products` と `ProductManager` の対応
- [frontend/src/workspace/WorkspaceSidebar.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/WorkspaceSidebar.jsx): `MenuLink`
- [frontend/src/workspace/Common.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/Common.jsx): `PageLink`
- [frontend/src/components/ProductManager.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/ProductManager.jsx): `ProductManager`（`stocking`、`setStocking`、`moderation`、`catalog.error` と `shop.notice` の表示）
- [frontend/src/components/SellerProductList.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SellerProductList.jsx): 「在庫切れ」「在庫を編集」「追加した人」の表示、`onStock`
- [frontend/src/components/StockEditor.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/StockEditor.jsx): `StockEditor`、`save`、`setExpected`
- [frontend/src/components/useSellerCatalog.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/useSellerCatalog.js): `useEffect`（一覧の取得）、`refresh`、`write`、`saveStock`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `refresh`（`refreshProducts`）、`sellerStoreId`、`setNotice`
- [frontend/src/workspace/useResource.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/useResource.js): `useResource`、`reload`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`ApiError`、`api.sellerProducts`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `authFetch`（`GET /api/auth/csrf`）、`readSession`、`passwordLogin`、`wasSignedIn`、`login`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`、`refreshSession`
- [frontend/src/components/AuthPanel.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/AuthPanel.jsx): `submit`、`complete`、`returnTo`
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/controller/SellerProductController.java): `list`、`moderation`、`updateStock`
- [backend/src/main/java/jp/kusakari/ec/catalog/dto/StockUpdateRequest.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/dto/StockUpdateRequest.java): `StockUpdateRequest`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/SellerProductService.java): `list`、`updateStock`、`requireAtStore`、`notAtStore`、`stockChanged`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `storeProducts`、`product`、`listing`、`listings`、`requireStore`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/ProductModerationService.java): `noticesAt`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/InventoryRepository.java): `lock`（`@Lock(PESSIMISTIC_WRITE)`）
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/ProductRepository.java): `findNotDeletedAtStore`、`findStoreReferences`、`findByIdIn`、`findCreatorNamesAtStore`、`findCreatorName`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireStoreViewer`、`canManageView`、`requireSeller`、`requireStoreRole`、`denied`、`requireBuyer`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `me`、`csrf`
- [backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/PasswordLoginController.java): `POST /api/auth/login`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`（ID トークンの更新、401、503）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ログインと ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`invalid`、`database`
