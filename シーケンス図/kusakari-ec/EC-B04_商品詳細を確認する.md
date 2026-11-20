# EC-B04 商品詳細を確認する

- ユースケース記述: [EC-B04_商品詳細を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B04_商品詳細を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

「植物について」ダイアログは、画面を開いたときに取得した商品（`useShop` の `products`）から選んだ商品を探して表示します。開くときに API は呼びません。商品の取得は [EC-B03 商品を検索する](<EC-B03_商品を検索する.md>) の「事前条件」の図にあります。基本フローに API を呼ぶステップがないので、共通代替フロー *a・*b を適用する場所はありません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 購入者
    participant Page as 「トップ」画面<br/>React
    participant Api as EC API<br/>Spring Boot

    Note over Page,Api: 事前条件 商品は画面を開いたときの GET /api/products で取得済み
    Note over User,Api: 基本フロー 1〜2 商品を選んで詳細を開く
    User->>Page: 商品一覧で商品の画像か商品名をクリック
    Page->>Page: 取得済みの商品から選んだ商品を探す
    Note over Page,Api: 開くときに API は呼ばない。<br/>img が商品画像を読み込むのは図では省略
    alt 購入者・運営者・未ログイン
        Page-->>User: 「植物について」ダイアログ<br/>画像、出店者・生産者、スペック、価格、<br/>在庫、受取店舗、「購入数量」「カートに追加」
    else 店舗側・出店申請中のアカウント
        Page-->>User: 「植物について」ダイアログ<br/>「カートに追加」の代わりに購入できない旨の注記
    end

    Note over User,Api: 基本フロー 3 商品情報を確認する
    User->>Page: 商品情報を確認する<br/>画像が 2 枚以上なら「商品画像 n」を選ぶ
    Page-->>User: 選んだ画像を大きく表示
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 購入者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Card as ProductCard.jsx
        participant List as CatalogProducts.jsx
        participant App as App.jsx
        participant Detail as ProductDetail.jsx
        participant Dlg as Dialog.jsx
    end

    Note over User,Dlg: 事前条件 App.jsx の useShop() が取得した shop.products を使う
    Note over User,Dlg: 基本フロー 1〜2 商品を選んで詳細を開く
    User->>Card: 画像 (product-photo) か<br/>商品名 (product-name) のボタンをクリック
    Card->>List: onOpen()
    List->>App: onDetail(product.id)
    Note right of List: Catalog.jsx は App の openDetail を<br/>onDetail としてそのまま渡す
    App->>App: openDetail(id) が shop.setError('')、<br/>shop.setNotice('')、setDetailId(id)
    App->>App: shop.products.find() で detail を決める
    App->>Detail: ProductDetail product=detail を表示 (key は detail.id)
    Detail->>Detail: imageUrl と images から画像の一覧を作り<br/>maxQuantity を在庫と 99 の小さい方にする
    Detail->>Dlg: Dialog title=植物について wide
    Dlg->>Dlg: useEffect が showModal() を実行し<br/>body のスクロールを止める
    Note right of Dlg: API は呼ばない。<br/>img が商品画像を読み込むのは図では省略
    alt canBuy が true (購入者・運営者・未ログイン)
        Dlg-->>User: 商品情報と「購入数量」「カートに追加」
    else canBuy が false (店舗側・出店申請中のアカウント)
        Dlg-->>User: 商品情報と buyerOnlyMessage の注記
    end

    Note over User,Dlg: 基本フロー 3 商品情報を確認する
    User->>Detail: 画像が 2 枚以上なら<br/>「商品画像 n」のボタンをクリック
    Detail->>Detail: setImage(url)
    Detail-->>User: 選んだ画像を大きく表示
```

## ユースケース記述との差

- 記述にない処理です。開くときにサーバーから取り直さないので、ダイアログの在庫や価格は、画面を開いて商品を取得した時点の値です。
- 記述にない入口です。「トップ」画面の上部にある商品のカルーセル（`HeroProductCarousel.jsx`）の「（商品名）の商品詳細を見る」ボタンも、同じ `openDetail()` を呼びます。
- 記述にない処理です。ダイアログは、見出しの横の閉じるボタン（`aria-label` が「閉じる」）、Esc キー、ダイアログの外のクリックで `App.jsx` の `close()` が呼ばれて閉じます。
- 記述にない内容です。ダイアログには「カートに追加」（EC-B07）、「販売店舗の紹介を見る」（EC-B05）、「Canvasでイメージする」のリンクもあります。
- ダイアログの「店舗受け取りのご案内」の文は「受取店舗はカートで指定できます。」です。受取店舗は商品の店舗で決まり、購入者は選びません（EC-B03 の関連情報、`ProductDetail.jsx` の先頭のコメント）。この文だけが今の仕様と合っていません。
- 事前条件は「トップ」画面と書いていますが、EC-B03 は同じ画面（パス `/`）を「メイン」画面と書いています。

## 参照したコード

- [frontend/src/components/ProductCard.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductCard.jsx): 画像と商品名のボタンの `onOpen`
- [frontend/src/components/CatalogProducts.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/CatalogProducts.jsx): `onOpen={() => onDetail(product.id)}`
- [frontend/src/components/Catalog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Catalog.jsx): `onDetail` の受け渡し
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `openDetail()`、`detail`、`close()`、`canBuy`
- [frontend/src/components/ProductDetail.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/ProductDetail.jsx): 画像の一覧、`maxQuantity`、`setImage()`、`canBuy` の分岐
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): `showModal()`、`onCancel`、`onClick`、閉じるボタン
- [frontend/src/components/HeroProductCarousel.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/HeroProductCarousel.jsx): 「商品詳細を見る」ボタンの `onDetail(product.id)`
- [frontend/src/auth.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/auth.js): `buyerOnlyMessage`、`isShopAccount()`
- [frontend/src/useShop.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/useShop.js): `products`、`buyerBlocked`
