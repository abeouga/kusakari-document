# EC-B23 利用ガイド・利用方法を確認する

```mermaid
sequenceDiagram
    autonumber
    actor User as 利用者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Header as 共通ヘッダー<br/>(KusakariHeader.jsx)
        participant App as EC の画面<br/>(App.jsx)
        participant Dlg as ダイアログ<br/>(Dialog.jsx)
    end

    User->>Header: 共通ヘッダーの「Kusakariについて」をクリック
    Header->>App: 「Kusakariについて」を開く処理を呼ぶ (openHeaderPanel)
    App->>App: 「メイン」画面に移り、前のお知らせとエラーを消す
    App->>Dlg: 「Kusakariについて」のダイアログを表示
    Dlg->>Dlg: 後ろの画面のスクロールを止める
    Dlg-->>User: 「植物と暮らす、はじめの一歩。」と紹介文、<br/>「お買い物の流れ」、「お買い物について」を表示

    User->>Dlg: 見出しの横の「閉じる」をクリック<br/>(Esc キーやダイアログの外のクリックも同じ)
    Dlg->>App: ダイアログを閉じる処理を呼ぶ (close)
    App->>App: 表示中のダイアログと商品の詳細を空にする
    App->>Dlg: ダイアログを消す
    Dlg->>Dlg: 後ろの画面のスクロールとフォーカスを元に戻す
    Dlg-->>User: 「メイン」画面を表示
```

![EC-B23 シーケンス図](<images/EC-B23_利用ガイド・利用方法を確認する-1.png>)
