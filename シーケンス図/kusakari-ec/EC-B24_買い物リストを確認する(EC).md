# EC-B24 買い物リストを確認する(EC)

```mermaid
sequenceDiagram
    autonumber
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React（Canvas の画面）
        participant Panel as 商品と買い物リストの欄<br/>(CommercePanel.jsx)
        participant Editor as 庭シミュレーション画面<br/>(EditorPage.jsx)
        participant Save as 庭の自動保存<br/>(useGardenAutosave.js)
    end
    box rgba(47,111,219,0.10) ブラウザー React（EC の画面）
        participant App as EC の画面<br/>(App.jsx)
        participant Dlg as 庭に設置したものから追加<br/>(GardenItemsDialog.jsx)
        participant Data as 買い物リストの取得<br/>(useShoppingData.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant CartCtrl as カートAPI<br/>(CartController.java)
        participant Ctrl as 庭の買い物リストAPI<br/>(ShoppingController.java)
        participant Svc as 買い物リストの処理<br/>(ShoppingService.java)
        participant Saved as EC で追加した商品<br/>(SavedShoppingItems.java)
        participant Client as Canvas との通信<br/>(CanvasShoppingClient.java)
        participant Cat as 商品と在庫<br/>(CatalogService.java)
    end
    participant Db as MySQL
    box rgba(27,127,92,0.12) Canvas API FastAPI
        participant CApi as 庭と買い物リストのAPI<br/>(main.py、thumbnails.py)
    end

    Note over User,CApi: 共通代替フロー<br/>*b 未ログインの場合: 9 (URL を開いたときのログインの確認)、10、18、26、取り直しの 44 に適用<br/>*a 通信に失敗した場合: 10、18、26、取り直しの 44 に適用<br/>Canvas の共通代替フロー *a・*b: 6 に適用 (保存に失敗すると EC へ移らない)

    alt 基本フロー 1〜3 Canvas の庭シミュレーション画面から開くとき
        User->>Panel: サイドバーの「買い物リスト（n）」タブをクリック
        Panel-->>User: 買い物リストの行と「リストを確認」を表示
        User->>Panel: 「リストを確認」をクリック
        Panel->>Editor: EC のカート画面へ移る処理を呼ぶ (requestNavigation)
        opt 輪郭の描画中か、保存できない写真がある (記述なし)
            Editor-->>User: 「変更を保存せずに戻りますか？」などの確認を表示
            Note over User,Editor: この先は図では省略する。
        end
        Editor->>Save: 未保存の編集を保存し終えるまで待つ (flush)<br/>未保存の編集があれば庭を保存する PUT /api/gardens/{id}
        Save-->>Editor: 保存が済んだことを返す
        Editor->>App: EC のカート画面を開く
        App->>App: ログイン状態を確かめる
        App->>CartCtrl: カートを取得する<br/>GET /api/cart (流れは EC-B08 の図と同じ)
        CartCtrl-->>App: カートを返す
        App->>Dlg: カート画面を表示し、URL で指定された庭を選んで<br/>「庭に設置したものから追加」のダイアログを開く
    else 1a EC のカート画面から開くとき
        User->>App: 共通ヘッダーの「カート」をクリック
        App-->>User: 「ショッピングカート」画面を表示
        User->>Dlg: 「庭に設置したものから追加」をクリック
        Dlg->>Dlg: ダイアログを開く
    end

    Dlg->>Data: 庭の一覧を取得する処理を呼ぶ<br/>(3 秒ごとと、画面に戻ったときにも取り直す)
    Data->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/shopping-lists
    Ctrl-->>Data: 庭の一覧 (名前、版、種類数) を返す
    Data-->>Dlg: 庭の一覧
    Dlg->>Dlg: 選ぶ庭を決める<br/>(URL の庭が一覧にあればその庭、なければ先頭の庭)
    Dlg->>Ctrl: 庭ごとのサムネイルを取得する<br/>GET /api/shopping-lists/{id}/thumbnail
    Ctrl-->>Dlg: サムネイルの画像を返す
    Dlg-->>User: 「庭をえらび、カートに入れる商品にチェックしてください。」と<br/>庭の一覧 (サムネイル、名前、種類数) を表示

    Dlg->>Data: 選んだ庭の買い物リストを取得する処理を呼ぶ<br/>(3 秒ごとと、画面に戻ったときにも取り直す)
    Data->>Ctrl: バックエンドのAPIを叩く<br/>GET /api/shopping-lists/{gardenId}
    Ctrl->>Svc: 購入者かを確かめ、買い物リストを作る処理を呼ぶ (detail)
    Svc->>Client: Canvas から配置の行を取得する処理を呼ぶ (detail)
    Client->>CApi: GET /api/gardens/{id}/shopping-list
    CApi->>CApi: 持ち主を確かめ、配置を商品か素材ごとにまとめて数える
    CApi-->>Client: 配置の行と庭の版を返す
    Client-->>Svc: 配置の行を返す
    Svc->>Saved: 買い物リストの版と EC で追加した商品を読む
    Svc->>Cat: 素材コードに対応する商品と、その在庫、店舗、買えない理由を読む
    Svc->>Svc: 庭に配置していない、EC で追加した商品を必要数 1 の行として足し、<br/>行ごとに候補の商品を決める (削除・閉店・停止で買えなくなった商品は外す)
    Svc-->>Ctrl: 買い物リストを返す
    Ctrl-->>Data: 行と候補の商品 (価格、在庫、店舗) を返す
    Data-->>Dlg: 買い物リストを返す
    Dlg->>Dlg: 行ごとに買う商品、カートの数量、選べない理由を決める
    Dlg-->>User: 行ごとにチェックボックス、商品画像、商品名、<br/>「必要数 n点・店舗在庫 n点」、小計、「カートに追加」を表示
    opt 6a・7a・7b 選べない行があるとき
        Dlg-->>User: その行のチェックボックスを選べなくし、理由を表示
        Note over User,Dlg: 理由は「対応する販売商品がありません」「販売終了」「在庫不足」「カートに入っています」など。
    end
    opt 6b 候補の商品が複数あるとき
        User->>Dlg: 「購入商品」の選択欄で商品を選ぶ
        Note over User,Dlg: 選ぶまでチェックボックスは選べない。選ぶと、その商品の在庫と小計を表示する。
    end

    User->>Dlg: 買い物リストの内容を確認する
    loop 3 秒ごとと、画面に戻ったとき
        Data->>Ctrl: 庭の一覧と買い物リストを取り直す<br/>流れは 18〜20 と 26〜38 と同じ
        Data-->>Dlg: 最新の内容で表示し直す<br/>(庭か買い物リストの版が変わったらチェックを外す)
    end
    opt 4b 別の庭の買い物リストを確認するとき
        User->>Dlg: 庭の一覧から別の庭をクリック
        Note over User,Dlg: その庭を選び、25 からと同じ流れで買い物リストを作り直す。
    end
    opt 閉じるとき
        User->>Dlg: 「キャンセル」をクリック、またはダイアログを閉じる
        Note over User,Dlg: ダイアログを閉じる。カートには追加しない。
    end
```

![EC-B24 シーケンス図](<images/EC-B24_買い物リストを確認する(EC)-1.png>)
