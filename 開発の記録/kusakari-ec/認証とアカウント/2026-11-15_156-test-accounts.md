# EC #156 テスト用アカウントの案（2026-11-15 時点）

元の場所：kusakari-canvas の未追跡ファイル docs/discussions/156-test-accounts.md（2026-11-16 に移動。Git の履歴はない）

まだ issue・docs・コードには反映していない検討用の図です。

## 1. アカウントと組織・店舗の関係

```mermaid
flowchart LR
  subgraph NOORG["組織に属さないアカウント"]
    user01["user01<br/>購入者（USER）"]
    admin01["admin01<br/>運営（ADMIN）"]
    applicant01["applicant01<br/>申請中（SHOP_OWNER_APPLICANT）"]
  end

  subgraph ORG1["サンプル組織（組織1）"]
    S1["店舗1 二子玉川"]
    S2["店舗2 横浜"]
    S3["店舗3 大宮"]
  end

  subgraph ORG2["組織2（境界の確認用・作り方は未決）"]
    S4["組織2の店舗"]
  end

  owner01["owner01<br/>SHOP_OWNER"] -- オーナー --> ORG1
  orgadmin01["orgadmin01<br/>SHOP_STAFF"] -- ORG_ADMIN --> ORG1
  orgadmin01 -- MANAGER --> S2
  manager01["manager01<br/>SHOP_STAFF"] -- MANAGER --> S1
  staff01["staff01<br/>SHOP_STAFF"] -- STAFF --> S1
  unassigned01["unassigned01<br/>SHOP_STAFF"] -. ロールなし .-> S1
  owner02["owner02<br/>SHOP_OWNER"] -- オーナー --> ORG2

  applicant01 -. 手で申請して承認されると<br/>新しい組織のオーナーになる .-> NEWORG["新しい組織"]
  owner02 -. 操作できない .-x ORG1
```

## 2. 登録と種別の付け方（どこが何を書くか）

```mermaid
flowchart TB
  subgraph TF["kusakari-terraform（全 PC 共通で1回）"]
    REG["register-test-users.py<br/>9つを登録・確認済みにする"]
  end
  POOL[("User Pool<br/>kusakari-development")]
  REG --> POOL

  subgraph PC["各 PC（EC のリポジトリ）"]
    SEED["種別を付けるスクリプト（新規）<br/>一覧を持ち、1回で全員に付ける"]
    ROLE["set-member-role.ps1<br/>ロールなし・ORG_ADMIN・申請中を追加"]
    DB[("EC の開発用 DB kusakari<br/>members / organizations /<br/>organization_members / store_members")]
    SEED -- 中で使い回す --> ROLE
    ROLE --> DB
  end

  POOL -- sub を読み取るだけ --> SEED
  SEED -- 会員がいなければ先に作る --> DB
```

## 3. 申請中のアカウントの確かめ方

```mermaid
flowchart LR
  subgraph E2E["E2E（使い捨ての MySQL）"]
    TMP["password-UUID@example.com を作る"] --> APPLY1["申請 → 承認"] --> DEL["アカウントを消す"]
  end
  subgraph MANUAL["手での確認（開発用 DB）"]
    A01["applicant01（固定）"] --> APPLY2["申請 → 承認（DB 初期化まで1回）"] --> OWN["新しい組織のオーナーとして使い続ける"]
  end
```

## 4. 切り替えの順番

```mermaid
flowchart TB
  T1["1. terraform #1：新しい9つを User Pool に登録<br/>（今の test.user / test.seller / test.admin は残す）"]
  T2["2. EC の E2E を切り替え<br/>メールアドレスを1か所に集めてから置き換え（57ファイル）"]
  T3["3. Canvas の E2E を切り替え<br/>e2e/auth-session.ts の1か所"]
  T4["4. EC と Canvas の全 E2E と受け入れ試験が通ることを確かめる"]
  T5["5. 今の3つを User Pool から消す"]
  T1 --> T2 --> T3 --> T4 --> T5

  MAP["置き換え<br/>test.user → user01<br/>test.seller → manager01<br/>test.admin → admin01"]
  MAP -.-> T2
  MAP -.-> T3
```

## 未決のこと

- なし（組織2は種別を付けるスクリプトで作る。2026-11-15 に決定。正本は EC の docs/decisions/2026-11-15-test-accounts.md）
