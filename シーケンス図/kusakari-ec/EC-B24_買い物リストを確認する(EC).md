# EC-B24 買い物リストを確認する(EC)

- ユースケース記述: [EC-B24_買い物リストを確認する(EC)](<../../アーカイブ/ユースケース/kusakari-ec/EC-B24_買い物リストを確認する(EC).md>)
- 共通代替フロー: [00_全ユースケース共通の代替フロー](<00_全ユースケース共通の代替フロー.md>)
- 対象のコード: kusakari-ec の main（6bad7e3、2026-11-24 時点）。基本フロー 1〜3 と Canvas API は kusakari-canvas の main（7e9a8dd、2026-11-24 時点）

## シーケンス図

参加者は、上から「画面や役割の名前」「コンポーネント・クラスの名前」「ファイル名（かっこ付き）」の順に書いています。
基本フロー 1〜3 は Canvas の画面で、4 からは EC の「ショッピングカート」画面です。EC の画面は Canvas の買い物リストを直接読まず、EC API がサーバーから Canvas API を呼びます。
共通代替フローの中身は、00 の図か、下の「共通代替フローを直接書いた図」を見てください。
エラーの代替フローは描かず、図の下に並べています。選べない理由や選択欄を出すだけのもの（6a・6b・7a・7b）と、画面の中だけで終わるもの（4b、閉じる）は、分かれる所だけを描き、結果と画面は Note に文で書いています。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React（Canvas の画面）
        participant Panel as 商品と買い物リストの欄<br/>CommercePanel<br/>(CommercePanel.jsx)
        participant Editor as 庭シミュレーション画面<br/>EditorPage<br/>(EditorPage.jsx)
        participant Save as 庭の自動保存<br/>useGardenAutosave<br/>(useGardenAutosave.js)
    end
    box rgba(47,111,219,0.10) ブラウザー React（EC の画面）
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Shop as カートの状態<br/>useShop<br/>(useShop.js)
        participant Dlg as 庭に設置したものから追加<br/>AddFromGardenCard・GardenItemsDialog・GardenItems<br/>(GardenItemsDialog.jsx)
        participant Data as 買い物リストの取得<br/>useShoppingData<br/>(useShoppingData.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CartCtrl as カートAPI<br/>CartController<br/>(CartController.java)
        participant Ctrl as 庭の買い物リストAPI<br/>ShoppingController<br/>(ShoppingController.java)
        participant Res as 会員のカートの決定<br/>CartSessionResolver<br/>(CartSessionResolver.java)
        participant Svc as 買い物リストの処理<br/>ShoppingService<br/>(ShoppingService.java)
        participant Saved as EC で追加した商品<br/>SavedShoppingItems<br/>(SavedShoppingItems.java)
        participant Client as Canvas との通信<br/>CanvasShoppingClient<br/>(CanvasShoppingClient.java)
        participant Mat as 素材と商品の対応<br/>MaterialProductRepository<br/>(MaterialProductRepository.java)
        participant Cat as 商品と在庫<br/>CatalogService<br/>(CatalogService.java)
    end
    participant Db as MySQL
    box rgba(27,127,92,0.12) Canvas API FastAPI
        participant CApi as 庭と買い物リストのAPI<br/>create_app・thumbnail_router<br/>(main.py、thumbnails.py)
    end

    Note over User,CApi: 共通代替フロー<br/>*b 未ログインの場合: 10 (URL を開いたときのログインの確認)、12、20、41、取り直しの 61 に適用<br/>*a 通信に失敗した場合: 12、20、41、取り直しの 61 に適用<br/>Canvas の共通代替フロー *a・*b: 7 に適用 (保存に失敗すると EC へ移らない)

    alt 基本フロー 1〜3 Canvas の庭シミュレーション画面から開く
        User->>Panel: サイドバーの「買い物リスト（n）」タブをクリック (UC-09)
        Panel-->>User: 買い物リストの行と「リストを確認」を表示する (setTab('list'))。<br/>行は UC-09 で読み込み済みで、ここでは通信しない。<br/>行が無いときは「植物が設置されていません」だけ
        User->>Panel: 「リストを確認」をクリック
        Panel->>Editor: EC の /cart?garden={庭の ID} へ移るよう頼む<br/>(onNavigate → requestNavigation)
        opt 輪郭の描画中か、保存できない写真がある (記述なし)
            Editor-->>User: 移る前に確認を出す (requestNavigation)
            Note over User,Editor: 画面: 「変更を保存せずに戻りますか？」か「庭写真を保存せずに戻りますか？」。<br/>この先は図では省略。
        end
        Editor->>Save: 未保存の編集を保存し終えるまで待つ (flush)
        opt 未保存の編集がある (isDirty)
            Save->>CApi: PUT /api/gardens/{id} (save → saveGarden、gardens.js)
            Note over Save,CApi: 結果: 200 で保存した庭を返す。<br/>画面: 失敗すると保存のエラーを出し、flush が false を返して EC へ移らない。
        end
        Save-->>Editor: 保存が済んだ (true)
        Editor->>App: EC の画面を読み込む (window.location.assign)
        App->>App: ログイン状態を確かめる (useAuth → readSession、GET /api/auth/me)。<br/>/cart なので、ログインしていなければログイン画面へ移る
        App->>Shop: カートを読み込むよう頼む (useShop の initialize → refresh)
        Shop->>CartCtrl: GET /api/cart (api.cart → request)。中身は EC-B08 の図と同じ流れ。<br/>続けて商品・注文・店舗も読む (図では省略)
        CartCtrl-->>Shop: 200 カート
        App->>Dlg: カート画面を描き (CartPage → Cart → AddFromGardenCard)、<br/>URL の garden を読んでダイアログを開く<br/>(useRequestedGarden。initialGarden は庭の ID)
    else 1a EC のカート画面から開く
        User->>App: 1a-1 共通ヘッダーの「カート」をクリック
        App-->>User: 1a-2 URL を /cart に変え、「ショッピングカート」画面を表示する<br/>(navigateFromHeader → navigate。EC-B08)
        User->>Dlg: 1a-3 カートの商品の一覧の下の「庭に設置したものから追加」をクリック
        Dlg->>Dlg: 1a-4 ダイアログを開く (setOpen(true)。initialGarden は空)
    end

    Dlg->>Data: 4 庭の一覧を取りに行くよう頼む (useShoppingData(''))。<br/>3 秒ごと (画面が見えているとき) と、画面に戻ったとき (focus) にも取り直す
    Data->>Ctrl: 庭の一覧の通信を始める (load → api.shoppingLists → request)<br/>GET /api/shopping-lists
    Ctrl->>Res: 購入者かを確かめ、会員のカートを決めるよう頼む<br/>(resolve → requireBuyer、MemberCartService.resolve)
    Ctrl->>Svc: 庭の一覧を作るよう頼む (summaries)
    Svc->>Saved: EC で商品を追加した庭の ID を読む (gardens)<br/>SELECT garden_id FROM garden_shopping_lists (revision が 0 より大きい行)
    Svc->>Client: Canvas から庭の一覧を取るよう頼む (summaries)
    Client->>CApi: GET /api/shopping-lists (Cookie の KUSAKARI_SESSION を付ける)
    CApi->>CApi: EC の GET /api/auth/me で持ち主を確かめ、<br/>Canvas の MySQL から持ち主の庭をすべて読む<br/>(authenticate、shopping.summaries)
    CApi-->>Client: 200 庭の一覧 (名前、庭の版、サムネイルの版、種類数)
    Client-->>Svc: 庭の一覧
    loop EC で商品を追加した庭ごと
        Svc->>Client: 配置の行を取るよう頼む (detail)。<br/>GET /api/gardens/{id}/shopping-list。流れは基本フロー 5 と同じ
        Svc->>Saved: EC で追加した商品を読む (read)<br/>SELECT garden_shopping_lists と garden_shopping_items、products
        Svc->>Svc: EC で追加した商品を足して、<br/>種類数と点数を数え直す (supplement)
    end
    Svc-->>Ctrl: 庭の一覧
    Ctrl-->>Data: 200 庭の配列
    Data-->>Dlg: 庭の一覧 (lists)
    Dlg->>Dlg: 選ぶ庭を決める<br/>(URL の庭が一覧にあればその庭、なければ先頭の庭)
    loop 庭ごと
        Dlg->>Ctrl: GET /api/shopping-lists/{id}/thumbnail?v=サムネイルの版<br/>(img の src。api.js を通らない)
        Ctrl->>Svc: 購入者かを確かめ (requireBuyer)、サムネイルを取るよう頼む (thumbnail)。<br/>Canvas の GET /api/gardens/{id}/thumbnail から PNG を取る<br/>(CanvasShoppingClient.thumbnail)
        Ctrl-->>Dlg: 200 image/png (Cache-Control private, no-cache)
    end
    Dlg-->>User: 「庭をえらび、カートに入れる商品にチェックしてください。」と<br/>庭の一覧 (サムネイル、名前、n種類)。選んだ庭は押された状態

    Dlg->>Data: 5 選んだ庭の買い物リストを取りに行くよう頼む<br/>(GardenItems の useShoppingData(gardenId))。<br/>3 秒ごとと focus でも取り直す
    Data->>Ctrl: 買い物リストの通信を始める (load → api.shoppingList → request)<br/>GET /api/shopping-lists/{gardenId}
    Ctrl->>Svc: 購入者の確認とカートの決定 (resolve) をしてから、<br/>買い物リストを作るよう頼む (detail)
    Svc->>Client: Canvas から配置の行を取るよう頼む (detail)
    Client->>CApi: GET /api/gardens/{id}/shopping-list
    CApi->>CApi: 持ち主を確かめ、配置を商品か素材ごとにまとめて数える<br/>(authenticate、shopping.detail)
    CApi-->>Client: 200 配置の行 (key、productId、materialCode、個数) と庭の版
    Client-->>Svc: 配置の行
    Svc->>Saved: 買い物リストの版と EC で追加した商品を読む (read)<br/>SELECT revision FROM garden_shopping_lists と garden_shopping_items、products
    Svc->>Svc: 6 EC で追加した商品を、庭に配置していなければ<br/>必要数 1 の行として足す (supplement)
    Svc->>Mat: 素材コードに対応する商品 ID を読む (findAllForCodes、SELECT material_products)
    Svc->>Cat: 商品、在庫、店舗と買えない理由を読む (listingsByIds → Listing)<br/>SELECT products、inventory、stores、organizations
    Svc->>Svc: 行ごとに候補の商品を決める (resolve)。<br/>素材コードから選ぶ候補からは、削除・閉店・停止で<br/>買えなくなった商品を外す (removed)
    Svc-->>Ctrl: 買い物リスト
    Ctrl-->>Data: 200 行と候補の商品 (価格、在庫、買えるか、店舗)、<br/>庭の版、買い物リストの版
    Data-->>Dlg: 買い物リスト (detail)
    Dlg->>Dlg: 行ごとに買う商品、カートの数量、選べない理由を決める<br/>(chosenProduct、quantityInCart、lineReason。shoppingSelection.js)
    Dlg-->>User: 7 行ごとにチェックボックス、商品画像、商品名、<br/>「必要数 n点・店舗在庫 n点」、小計 (価格×必要数)、<br/>「すべて選択」「キャンセル」「カートに追加」
    opt 6a・7a・7b 選べない行がある
        Dlg-->>User: その行のチェックボックスを選べなくし、理由を出す (lineReason)
        Note over User,Dlg: 画面: 6a-1「対応する販売商品がありません」、7a-1「販売終了」「カートの数量と合わせると上限99点を超えます」「在庫不足」、<br/>7b-1「カートに入っています」のどれか
    end
    opt 6b 候補の商品が複数ある
        User->>Dlg: 6b-2「購入商品」の選択欄で商品を選ぶ
        Note over User,Dlg: 画面: 6b-1「購入商品を選択」の選択欄 (商品名 / 価格) と「購入商品を選択してください」(選ぶまでチェックボックスは選べない)。<br/>6b-3 選んだ商品の在庫と小計 (setChoices。通信しない)
    end

    User->>Dlg: 8 買い物リストの内容を確認する
    loop 3 秒ごと (画面が見えているとき) と、画面に戻ったとき (focus)
        Data->>Ctrl: 庭の一覧と買い物リストを取り直す (2 つの useShoppingData の load)。<br/>流れは 20〜 と 41〜 と同じ
        Data-->>Dlg: 最新の庭の一覧と買い物リスト (在庫、価格、配置) で描き直す。<br/>庭の版か買い物リストの版が変わったらチェックを外す (setSelection({}))
    end
    opt 4b 別の庭の買い物リストを確認する
        User->>Dlg: 4b-1 庭の一覧から別の庭をクリック
        Note over User,Dlg: 結果: その庭を選び、買い物リストを作り直す (setChosen。GardenItems の key が変わる)。<br/>画面: 4b-2 基本フロー 5 (40) へ戻る
    end
    opt 閉じる
        User->>Dlg: 「キャンセル」か、ダイアログを閉じる操作
        Note over User,Dlg: 結果: ダイアログを閉じ、URL から garden を外す (close → setOpen(false)、requested.clear)。<br/>画面: カートには追加しない
    end
```

![EC-B24 シーケンス図](<images/EC-B24_買い物リストを確認する(EC)-1.png>)

図に描いていない代替フロー：4a（庭がない）、5a（行がない）、5b（庭が見つからない）、5c（Canvas に接続できない）

## 共通代替フローを直接書いた図

上の図の、Canvas から `/cart?garden={id}` を開いたときのログインの確認と、ダイアログの `GET /api/shopping-lists` に、この画面で起こる共通代替フロー（\*a、\*b）を書き込んだ図です。選んだ庭の `GET /api/shopping-lists/{gardenId}` も同じように失敗しますが、そちらにはエラーの文だけが出て「再取得」が出ません（3 秒ごとの取り直しを待ちます）。カートの `GET /api/cart` の \*a・\*b は [EC-B08](<EC-B08_カートを確認する.md>) の図、Canvas の保存の \*a・\*b は Canvas の図のとおりなので省いています。サムネイルの画像は `api.js` を通らないので、失敗すると画像が出ないだけで、文は出ません。

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant App as EC の画面の切り替え<br/>App<br/>(App.jsx)
        participant Dlg as 庭に設置したものから追加<br/>GardenItemsDialog<br/>(GardenItemsDialog.jsx)
        participant Data as 買い物リストの取得<br/>useShoppingData<br/>(useShoppingData.js)
        participant Http as 通信<br/>request<br/>(api.js)
        participant AuthJs as ログインと通信の準備<br/>readSession・authFetch・redirectToLogin<br/>(auth.js)
        participant Notice as 期限切れのお知らせ<br/>SessionNotice<br/>(SessionNotice.jsx)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant AuthCtrl as ログイン状態API<br/>AuthController<br/>(AuthController.java)
        participant Filter as セッションの確認<br/>SessionValidityFilter<br/>(SessionValidityFilter.java)
        participant Ctrl as 庭の買い物リストAPI<br/>ShoppingController<br/>(ShoppingController.java)
        participant Svc as 買い物リストの処理<br/>ShoppingService<br/>(ShoppingService.java)
    end
    participant Db as MySQL
    box rgba(180,120,20,0.12) 外部サービス
        participant Cog as Amazon Cognito
    end

    User->>App: Canvas の「リストを確認」で /cart?garden={id} を開く
    App->>AuthJs: ログイン状態を読むよう頼む (useAuth → readSession)
    alt *a ログイン状態を読めない (届かない、または 200 と 403 以外)
        AuthJs-xAuthCtrl: GET /api/auth/me
        AuthJs--xApp: エラーを投げる (届かないときはブラウザーの文、<br/>200 以外は「ログイン状態を確認できません。」)
        App-->>User: その文だけを表示する (/cart の authError。「再取得」は無い)
    else *b ログインしていない
        AuthJs->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>AuthJs: 200 authenticated=false
        AuthJs-->>App: ログインしていない
        App->>AuthJs: ログイン画面に置き換えるよう頼む (cartLoginRequired → redirectToLogin)
        AuthJs-->>User: *b-1 /account/login?returnTo=/cart?garden={id} のログイン画面 (LoginPage)
        User->>App: *b-2 ログインする (流れは 00 の図と EC-B01)。<br/>returnTo の /cart?garden={id} を読み込み直し、1 からやり直す
    else ログインしている
        AuthJs->>AuthCtrl: GET /api/auth/me
        AuthCtrl-->>AuthJs: 200 authenticated=true
        AuthJs-->>App: ログイン中の会員
        App->>Dlg: カートを読んでからカート画面を描き、ダイアログを開く (上の図の 11〜14)
    end

    Dlg->>Data: 庭の一覧を取りに行くよう頼む (useShoppingData(''))
    Data->>Http: 庭の一覧の通信を始める (load → api.shoppingLists → request)
    Http->>AuthJs: 要求を送るよう頼む (send → authFetch。GET なので CSRF トークンは取らない)
    alt *a 届かない、または応答が JSON でない
        AuthJs-xFilter: GET /api/shopping-lists
        Http->>Http: 通信の失敗にまとめる<br/>(send か readResponse → ApiError(networkErrorMessage, 0))
        Http--xData: エラーを投げる
        Data-->>Dlg: エラーの文 (error)
        Dlg-->>User: *a-1「サーバーに接続できません。<br/>接続を確認して再試行してください。」と「再取得」
    else *b ログインの期限切れ (サーバーのセッションがない、refresh トークンが失効)
        AuthJs->>Filter: GET /api/shopping-lists
        Filter-->>Http: 401 LOGIN_REQUIRED<br/>(セッションが無いときは AuthConfiguration.java が返す)
        Http->>Notice: 期限切れを知らせる<br/>(wasSignedIn が真なので kusakari-session-expired)
        Http--xData: エラーを投げる (ApiError(sessionExpiredMessage, 401))
        Data-->>Dlg: エラーの文 (error)
        Dlg-->>User: 「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」と「再取得」
        Notice-->>User: *b-1「ログインの有効期限が切れました。<br/>もう一度ログインしてください。」「ログインする」「閉じる」
        User->>Notice: 「ログインする」をクリック
        Notice->>AuthJs: ログイン画面へ移る (login)
        AuthJs-->>User: /account/login?returnTo=今の URL のログイン画面<br/>(*b-2 ログインの後は今の URL を読み込み直す。<br/>URL に garden が残っていればダイアログも開く)
    else *a ID トークンの更新で Cognito に届かない
        AuthJs->>Filter: GET /api/shopping-lists
        Filter-xCog: ID トークンを更新する<br/>(InitiateAuth REFRESH_TOKEN_AUTH、CognitoPasswordLogin.java)
        Filter-->>Http: 503 AUTH_UNAVAILABLE (セッションは残す)
        Http--xData: エラーを投げる (ApiError 503)
        Data-->>Dlg: エラーの文 (error)
        Dlg-->>User: *a-1「認証を確認できません。<br/>時間をおいて再試行してください。」と「再取得」
    else 要求が Controller まで届いた
        AuthJs->>Filter: GET /api/shopping-lists
        Filter->>Ctrl: 要求を通す (chain.doFilter)
        Ctrl->>Svc: 庭の一覧を作るよう頼む (summaries)
        Svc->>Db: EC で商品を追加した庭と、EC で追加した商品を読む<br/>(上の図の 23、30)
        alt *a MySQL との通信に失敗
            Db--xSvc: 失敗 (DataAccessException)
            Svc--xCtrl: 例外
            Ctrl-->>Http: 503 DATABASE_UNAVAILABLE (ApiErrors.java の database)
            Http--xData: エラーを投げる (ApiError 503)
            Data-->>Dlg: エラーの文 (error)
            Dlg-->>User: *a-1「保存処理を完了できませんでした。<br/>時間をおいて再試行してください。」と「再取得」
        else 読めた
            Db-->>Svc: 行
            Svc-->>Ctrl: 庭の一覧 (Canvas に接続できないときは 5c)
            Ctrl-->>Http: 200 庭の配列
            Http-->>Data: 庭の一覧
            Data-->>Dlg: 庭の一覧 (以降は上の図の 36〜)
        end
    end
    opt *a-3 やり直す
        alt 「再取得」をクリックした
            User->>Dlg: 「再取得」をクリック
            Dlg->>Data: 庭の一覧を取り直す (reload → load)。流れは 17〜 と同じ
        else 待つ
            Data->>Data: 3 秒ごと (画面が見えているとき) と<br/>画面に戻ったとき (focus) に、自動で取り直す
        end
    end
```

![EC-B24 共通代替フローを直接書いた図](<images/EC-B24_買い物リストを確認する(EC)-2.png>)

## ユースケース記述との差

- 基本フロー 2: Canvas の買い物リストのタブには「(庭の名前)の買い物リスト」の見出しがありません。タブ（「買い物リスト（n）」）の中に行と「リストを確認」が出るだけです。行が無いときは「植物が設置されていません」が出て、「リストを確認」は出ません。
- 基本フロー 3: Canvas の「リストを確認」は、未保存の編集を `PUT /api/gardens/{id}` で保存してから EC を開きます。輪郭の描画中と、輪郭が確定していない写真があるときは、移る前に確認ダイアログを出します。どちらも記述にありません。保存に失敗すると EC へ移りません。
- 基本フロー 4: ダイアログ（`AddFromGardenCard`）は、カートの読み込みが終わってから描かれます（`Cart.jsx` はカートが無い間は「カートを読み込んでいます。」だけを出す）。`GET /api/cart` に失敗すると、`?garden=` を付けて開いてもダイアログは開きません。
- 基本フロー 4: 庭の一覧は Canvas の持ち主の庭すべてです（`shopping.summaries`）。EC で商品を追加した庭だけは、EC が庭ごとに `GET /api/gardens/{id}/shopping-list` を呼び、EC で追加した商品を足して種類数を数え直します。庭が多いと Canvas への通信がその数だけ増えます。
- Canvas API は、EC から届いた要求のたびに、Cookie の `KUSAKARI_SESSION` で EC の `GET /api/auth/me` を呼んで持ち主を確かめます（`auth.py` の `authenticate`）。図では Canvas API の自分への矢印にまとめました。Canvas がこの確認に失敗して 401・503 を返したときも、EC は 404 以外をすべて 503 `SHOPPING_LIST_UNAVAILABLE`（5c）にします。
- 5b: URL で指定した庭が庭の一覧に無いとき（削除済み、ほかの購入者の庭など）、コードは「庭が見つかりません。」を出さず、一覧の先頭の庭を選びます（`GardenItemsDialog` の `gardenId` の決め方）。「庭が見つかりません。」は、選んだ庭の `GET /api/shopping-lists/{gardenId}` が 404 になったときだけ出ます。このとき、その庭の取り直しを止めます。
- 5c: 「再取得」ボタンが出るのは、庭の一覧（`GET /api/shopping-lists`）の取得に失敗したときだけです。選んだ庭の買い物リストの取得に失敗したときは文だけを出し、3 秒ごとの取り直しを待ちます。記述の 5c-3 は「基本フロー 5 へ戻る」ですが、「再取得」で取り直すのは庭の一覧（基本フロー 4）です。
- 6a・候補の商品: 素材コードから候補を選ぶ行では、削除・閉店・店舗の停止・組織の停止で買えなくなった商品を候補から外します（`ShoppingService.resolve` の `removed`、`CatalogService.REMOVED_REASONS`）。そのため、候補がすべてそうした商品なら 7a の「販売終了」ではなく 6a の「対応する販売商品がありません」になります。商品を指定した行（`productId` のある行）は、理由を出すために候補に残すので「販売終了」になります。
- 関連情報の「3秒ごとと画面に戻ったときに、在庫・カートの内容・庭プロジェクトの変更を反映する」: 3 秒ごとと `focus` で取り直すのは、庭の一覧と買い物リスト（在庫、価格、配置を含む）だけです。カート（`shop.cart`）は取り直さないので、別の画面でカートを変えても「カートに入っています」の表示はすぐには変わりません。カートは、カートへの追加が 409 になったときに取り直します（[EC-B25 の図](<EC-B25_買い物リストから商品をカートに追加する.md>)）。
- 7a: カートにある商品は 7b で選べないので、画面はカートの数量を 0 として判定します（`lineReason(line, product, 0)`）。「カートの数量と合わせると上限99点を超えます」が出るのは、必要数だけで 99 点を超えるときです。
- 庭の版か買い物リストの版が変わると、3 秒ごとの取り直しでチェックがすべて外れます（`GardenItems` の `useEffect`）。記述にない動きです。
- 関連情報の「店舗側のアカウントと出店申請用アカウントでは使えない」: 画面は `CartPage` で `buyerOnlyMessage` を出してカートとダイアログを描かず、API も `requireBuyer()` で 403 `BUYER_REQUIRED` を返します。事前条件が購入者のログインなので、図には書いていません。

## 参照したコード

kusakari-ec

- [frontend/src/components/GardenItemsDialog.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/GardenItemsDialog.jsx): `useRequestedGarden`、`AddFromGardenCard`（`close`）、`GardenItemsDialog`（`gardenId` の決め方、「再取得」）、`GardenItems`（選択を外す `useEffect`、行の表示）
- [frontend/src/components/useShoppingData.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/useShoppingData.js): `useShoppingData`（`load`、3 秒ごとの `setInterval`、`focus`、404 のときの `removed`、`reload`）
- [frontend/src/shoppingSelection.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/shoppingSelection.js): `chosenProduct`、`quantityInCart`、`lineReason`、`unavailableReason`
- [frontend/src/api.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/api.js): `request`、`send`、`readResponse`、`api.shoppingLists`、`api.shoppingList`、`api.cart`、`networkErrorMessage`、`sessionExpiredMessage`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/auth.js): `readSession`、`authFetch`、`wasSignedIn`、`login`、`redirectToLogin`
- [frontend/src/useAuth.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useAuth.js): `useAuth`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/useShop.js): `initialize`、`refresh`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/App.jsx): `navigateFromHeader`、`cartLoginRequired` と `redirectToLogin`、`/cart` の `authError` と `CartPage`
- [frontend/src/components/CartPage.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/CartPage.jsx): `CartPage`（店舗側のアカウントの案内）
- [frontend/src/components/Cart.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/Cart.jsx): `AddFromGardenCard` を描く場所、カートの読み込み中の表示
- [frontend/src/components/SessionNotice.jsx](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/components/SessionNotice.jsx): 期限切れのお知らせ
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/frontend/src/workspace/navigation.js): `navigate`、`redirect`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingController.java): `summaries`、`detail`、`thumbnail`
- [backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/ShoppingService.java): `summaries`、`detail`、`thumbnail`、`supplement`、`resolve`、`removed`
- [backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/SavedShoppingItems.java): `read`、`gardens`
- [backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/shopping/CanvasShoppingClient.java): `summaries`、`detail`、`thumbnail`、`unavailable`
- [backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/session/CartSessionResolver.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/MemberCartService.java): `resolve`
- [backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/commerce/controller/CartController.java): `get`
- [backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/MaterialProductRepository.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/persistence/repository/MaterialProductRepository.java): `findAllForCodes`
- [backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/catalog/service/CatalogService.java): `listingsByIds`、`REMOVED_REASONS`、`Listing.purchasable`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthService.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthService.java): `requireBuyer`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthController.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthController.java): `GET /api/auth/me`
- [backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/SessionValidityFilter.java): `doFilterInternal`、`renewIdToken`（ID トークンの更新、401）
- [backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/CognitoPasswordLogin.java): ID トークンの更新、503 `AUTH_UNAVAILABLE`
- [backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/auth/AuthConfiguration.java): `authenticationEntryPoint`（401 `LOGIN_REQUIRED`）
- [backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java](https://github.com/abeouga/kusakari-ec/blob/6bad7e37c4135034fbe97e30309772fbe872e675/backend/src/main/java/jp/kusakari/ec/common/web/ApiErrors.java): `business`、`database`

kusakari-canvas

- [frontend/src/components/CommercePanel.jsx](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/frontend/src/components/CommercePanel.jsx): `CommercePanel`（タブ、「植物が設置されていません」、「リストを確認」）
- [frontend/src/pages/EditorPage.jsx](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/frontend/src/pages/EditorPage.jsx): `requestNavigation`、移る前の確認ダイアログ
- [frontend/src/hooks/useGardenAutosave.js](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/frontend/src/hooks/useGardenAutosave.js): `save`、`flush`
- [frontend/src/api/gardens.js](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/frontend/src/api/gardens.js): `saveGarden`
- [backend/kusakari_canvas_api/main.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/main.py): `create_app` の `shopping_lists`、`shopping_list`、`update`
- [backend/kusakari_canvas_api/shopping.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/shopping.py): `summaries`、`detail`
- [backend/kusakari_canvas_api/thumbnails.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/thumbnails.py): `thumbnail_router` の `get`
- [backend/kusakari_canvas_api/auth.py](https://github.com/abeouga/kusakari-canvas/blob/7e9a8dd0a40f2b212ca20b3aa94f2dc984b00b7a/backend/kusakari_canvas_api/auth.py): `authenticate`（EC の `GET /api/auth/me` で持ち主を決める）
