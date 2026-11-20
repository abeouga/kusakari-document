# EC-B23 利用ガイド・利用方法を確認する

- ユースケース記述: [EC-B23_利用ガイド・利用方法を確認する](<../../アーカイブ/ユースケース/kusakari-ec/EC-B23_利用ガイド・利用方法を確認する.md>)
- 対象のコード: kusakari-ec の main（19a2be3、2026-11-20 時点）

「Kusakariについて」ポップアップの案内の文は、`App.jsx` に直接書かれています。開くときも閉じるときも、サーバーとは通信しません。そのため、共通代替フロー *a・*b を適用する場所はありません。

## 概要図

```mermaid
sequenceDiagram
    actor User as 利用者
    participant Page as 「メイン」画面<br/>React

    Note over User,Page: 基本フロー 1〜2 「Kusakariについて」を開く
    User->>Page: 共通ヘッダーの「Kusakariについて」をクリック
    Page->>Page: URL を / に切り替え<br/>表示するパネルを guide にする
    Page-->>User: 「Kusakariについて」ポップアップ<br/>「お買い物の流れ」「お買い物について」
    Note over User,Page: サーバーとは通信しない

    Note over User,Page: 基本フロー 3〜5 内容を確かめて閉じる
    User->>Page: 内容を確かめて「閉じる」をクリック
    Page->>Page: 表示するパネルを空にする
    Page-->>User: 「メイン」画面
```

## 詳細図

```mermaid
sequenceDiagram
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as KusakariHeader.jsx<br/>site-header
        participant App as App.jsx
        participant Nav as navigation.js
        participant Dlg as Dialog.jsx
    end

    Note over User,Dlg: 基本フロー 1〜2 「Kusakariについて」を開く
    User->>Header: 「Kusakariについて」をクリック
    Header->>App: panelAction('guide') のボタンが<br/>onPanel('guide') で openHeaderPanel('guide') を呼ぶ
    App->>Nav: next が guide なので navigate('/')
    Nav->>Nav: history.pushState() と popstate の発行<br/>window.scrollTo(0, 0)
    Nav-->>App: usePath() が setPath(currentPath())
    App->>App: open('guide') が shop.setError('')、<br/>shop.setNotice('')、setPanel('guide')
    App->>Dlg: path が / で panel が guide なので<br/>Dialog title=Kusakariについて に案内の文を渡す
    Dlg->>Dlg: useEffect が showModal() を実行し<br/>body のスクロールを止める
    Dlg-->>User: 「Kusakariについて」ポップアップ<br/>「お買い物の流れ」「お買い物について」
    Note right of App: 「メイン」画面の「Kusakariについて」と<br/>フッターの「ご利用ガイド」は<br/>open('guide') を直接呼ぶ (navigate しない)

    Note over User,Dlg: 基本フロー 3〜5 内容を確かめて閉じる
    User->>Dlg: 内容を確かめて「閉じる」(X のボタン) をクリック
    Note right of Dlg: Esc キーの onCancel と<br/>ポップアップの外のクリックの onClick でも<br/>onClose() を呼ぶ
    Dlg->>App: onClose() で close() を呼ぶ
    App->>App: setPanel('')、setDetailId('')、<br/>shop.setLastOrders(null)
    App->>Dlg: panel が空なので Dialog を描かない
    Dlg->>Dlg: useEffect のクリーンアップが close() を実行し<br/>body のスクロールとフォーカスを元に戻す
    Dlg-->>User: 「メイン」画面
```

## ユースケース記述との差

- 「閉じる」は、文字のない X のアイコンのボタンです。「閉じる」は `aria-label` にあります。
- 記述にない処理です。共通ヘッダーから開くと、どの画面にいても `navigate('/')` で「メイン」画面へ切り替えます。このときブラウザーの履歴が 1 つ増え、ページの先頭までスクロールします。「メイン」画面の「Kusakariについて」とフッターの「ご利用ガイド」から開くときは、URL を変えません。
- 記述にない入口です。Kusakari Canvas の画面の共通ヘッダーは同じ部品（`KusakariHeader`）を使いますが、`onPanel` を渡さないので「Kusakariについて」は EC の `/?panel=guide` へのリンクになります。EC のページを読み込むと、`App.jsx` の `requestedPanel()` が最初から `guide` にしてポップアップを開きます。このときはページを読み込んだときの取得（EC-B03 の事前条件）も走ります。閉じても URL の `?panel=guide` は残ります。
- 記述にない内容です。ポップアップの先頭に、Kusakari が庭木・草花・ハーブ・観葉植物を探して店舗ごとの価格と在庫を確かめられる EC サイトであることの紹介文があります。

## 参照したコード

- [packages/site-header/KusakariHeader.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/packages/site-header/KusakariHeader.jsx): `panelAction()`、「Kusakariについて」、`shopUrl()`
- [frontend/src/App.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/App.jsx): `openHeaderPanel()`、`open()`、`close()`、`requestedPanel()`、案内の文、フッターの「ご利用ガイド」
- [frontend/src/workspace/navigation.js](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/workspace/navigation.js): `navigate()`、`usePath()`
- [frontend/src/components/Dialog.jsx](https://github.com/abeouga/kusakari-ec/blob/19a2be307ee71a2cd87e538236c3c8c42929c5b3/frontend/src/components/Dialog.jsx): `showModal()`、クリーンアップ、`onCancel`、`onClick`、閉じるボタン
- [kusakari-canvas の frontend/src/components/SiteHeader.jsx](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/components/SiteHeader.jsx): Canvas の画面の共通ヘッダー（`onPanel` を渡さない）
