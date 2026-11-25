# EC-B17 出店の申請をする

```mermaid
sequenceDiagram
    autonumber
    actor User as 事業者
    box rgba(47,111,219,0.10) ブラウザー React
        participant Work as マイページのサイドバー<br/>(Workspace.jsx)
        participant Page as 出店申請画面<br/>(StoreApplication.jsx)
        participant Wiz as 申請の入力と送信<br/>(ApplicationWizard.jsx)
        participant Hook as 申請の取得<br/>(useResource.js)
        participant Http as バックエンドのAPIを叩く<br/>(api.js)
    end
    box rgba(27,127,92,0.12) EC API Spring Boot
        participant Ctrl as 出店申請API<br/>(StoreApplicationController.java)
        participant Errs as エラーの応答<br/>(ApiErrors.java)
        participant Svc as 出店申請の処理<br/>(StoreApplicationService.java)
        participant Repo as 出店申請の読み書き<br/>(StoreApplicationRepository.java)
        participant Ntf as 通知の保存<br/>(NotificationService.java)
    end
    participant Db as MySQL

    Note over User,Db: 共通代替フロー<br/>*b 未ログインの場合: 2 (URL を直接開いたときのログインの確認)、4、17、サイドバーの取り直しの 33 に適用<br/>*a 通信に失敗した場合: 4、17、サイドバーの取り直しの 33 に適用

    User->>Work: マイページのサイドバー「出店をご検討の方」の<br/>「出店申請」をクリック
    Work->>Page: 出店申請画面を表示
    Page->>Hook: 自分の出店申請を取得する処理を呼ぶ
    Hook->>Ctrl: 同左<br/>GET /api/account/store-applications
    Ctrl-->>Hook: 今の申請と前回の申請のリストを新しい順に返す (なければ 0 件)
    Hook-->>Page: 申請のリストを返す
    Page->>Wiz: 最新の申請が却下か取り下げ済みなら前回の申請として渡し、<br/>入力の手順を表示
    alt 申請がない場合
        Wiz-->>User: 手順「事業者情報」「担当者・連絡先」「事業確認書類」「入力内容の確認」と、<br/>「ステップ 1 / 4：事業者情報」の入力欄を表示
    else 再申請の場合 (EC-B18 の「再申請する」から開いた)
        Wiz-->>User: 前回の内容を入れた入力欄と「前回の申請内容を入力しています。<br/>事業確認書類はもう一度選択してください。」を表示
    end

    loop 手順ごとに繰り返す (事業者情報 → 担当者・連絡先 → 事業確認書類)
        opt 5a 前の手順に戻るとき
            User->>Wiz: 「戻る」をクリック
            Note over User,Wiz: 入力はそのままで、前の手順の入力欄を表示する。
        end
        User->>Wiz: その手順の項目を入力し、「次へ」<br/>(事業確認書類では「確認画面へ」) をクリック
        alt 事業者情報か担当者・連絡先の手順の場合
            Wiz-->>User: 次の手順の入力欄を表示
        else 事業確認書類の手順の場合
            Wiz-->>User: 「入力内容の確認」と入力した内容、<br/>「…を修正」の 3 つのボタンと「申請する」を表示
        end
    end
    opt 10a 入力内容を修正するとき
        User->>Wiz: 「事業者情報を修正」「担当者・連絡先を修正」<br/>「事業確認書類を修正」のどれかをクリック
        Note over User,Wiz: その手順の入力欄に戻る。入力を直して「確認画面へ」まで進める。
    end

    User->>Wiz: 入力内容を確かめ、「申請する」をクリック
    Wiz->>Http: 入力した内容と書類を送る処理を呼ぶ (send)
    Http->>Ctrl: CSRF トークンを付けて、バックエンドのAPIを叩く<br/>POST /api/account/store-applications
    Ctrl->>Ctrl: 必須の項目、文字数、メールアドレスと電話番号の形を確かめる
    Ctrl->>Svc: 申請を保存するトランザクションを開始 (submit)<br/>会員の行をロックして読み直す
    Svc->>Repo: 自分の申請をすべてロックして読む (lockAllForMember)
    break 11a 今の申請が審査中の場合
        Svc--xErrs: 409 APPLICATION_EXISTS の例外を投げる
        Note over Errs,Wiz: 409 を返し、申請は保存しない。<br/>「入力内容の確認」のまま「審査中の申請があります。」を表示する。
    end
    Svc->>Svc: 審査中の新しい申請を作り、今の申請にする
    opt 再申請のとき
        Svc->>Repo: 前々回の申請を消し、今の申請を前回の申請にする
    end
    Svc->>Repo: 新しい申請を保存する (save)
    Svc->>Ntf: サイト内通知「出店申請を受け付けました」を保存する処理を呼ぶ (send)
    Svc->>Db: 申請と通知を保存する
    Db-->>Svc: 保存したことを返す
    Svc-->>Ctrl: 保存した申請を返す
    Ctrl-->>Http: 保存した申請を返す
    Http-->>Wiz: 保存した申請を返す
    Wiz->>Page: 申請が終わったことを伝え、受付の表示に切り替える (onDone)
    Page-->>User: 「出店申請を受け付けました」「審査結果は通知でお知らせします。」、<br/>「出店申請状況を確認する」を表示
    Work->>Ctrl: サイドバー用に申請を取り直す<br/>流れは 4〜5 と同じ
    Ctrl-->>Work: 申請のリストを返す (今の申請が 1 件以上)
    Work-->>User: サイドバーのリンクを「出店申請状況」にする
```

![EC-B17 シーケンス図](<images/EC-B17_出店の申請をする-1.png>)
