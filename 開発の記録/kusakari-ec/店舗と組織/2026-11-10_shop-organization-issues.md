# 店舗側アカウントの組織・複数店舗対応 issue 一覧

元の場所：kusakari-canvas の未追跡ファイル docs/discussions/shop-organization-issues.md（2026-11-16 に移動。Git の履歴はない）

kusakari-ec#102 を閉じて、実行できる単位に分けた issue の一覧です（2026-11-10 作成）。

- 変更範囲が大きく、既存DBを初期化する破壊的変更を含むため、**main にはマージせず**、統合ブランチ `feature/shop-organization`（EC・Canvas 両方）で実装する
- 統合ブランチを GitHub に push するか、main にいつ・どう入れるかは未決定

## 親 issue

| issue | 内容 |
|---|---|
| [kusakari-ec#103](https://github.com/abeouga/kusakari-ec/issues/103) | 店舗側アカウントの組織・複数店舗対応（#102 の実装の親 issue）。子 issue の進み具合を管理する |

## 子 issue

### すぐ着手できるもの

| issue | 内容 | 決めること |
|---|---|---|
| [kusakari-ec#104](https://github.com/abeouga/kusakari-ec/issues/104) | 組織・店舗・メンバーのテーブル構成を決めて docs と ER 図に記録する | 会員・店舗テーブルの名前・列・主キーの型／別組織の店舗への割り当て防止と一意制約／オーナーを組織への所属にも入れるか／商品の所有者（組織か店舗か）／アカウント種別の持ち方と店舗側アカウントでの購入可否／ADMIN の表し方／Flyway の扱い |
| [kusakari-ec#105](https://github.com/abeouga/kusakari-ec/issues/105) | 店舗ロールの権限と、子アカウント・店舗切り替えの画面仕様を決める | MANAGER と STAFF の違い／子アカウント用の Cognito アカウントの用意方法／店舗切り替え画面／複数店舗の商品管理画面 |
| [kusakari-ec#106](https://github.com/abeouga/kusakari-ec/issues/106) | プロジェクトが使っている MySQL を特定して EC の DB を初期化するスクリプトを作る | E2E 用 DB も含めるか／確認の方法／管理者権限の要否／Canvas と一度に実行できるようにするか |
| [kusakari-canvas#63](https://github.com/abeouga/kusakari-canvas/issues/63) | プロジェクトが使っている MySQL を特定して Canvas の DB を初期化し、最新の DB を作り直すスクリプトを作る | E2E 用 DB も含めるか／確認の方法／EC と一度に実行できるようにするか／既存 MySQL での権限の得方 |

### 前の issue が終わってから着手するもの

| issue | 内容 | 前提の issue | 決めること |
|---|---|---|---|
| [kusakari-ec#107](https://github.com/abeouga/kusakari-ec/issues/107) | 新しいテーブル構成のマイグレーションとサンプルデータを作る | ec#104、ec#106 | — |
| [kusakari-ec#108](https://github.com/abeouga/kusakari-ec/issues/108) | アカウント種別の判定と、オーナー・店舗ロールによる認可に切り替える | ec#104、ec#105、ec#107 | 初期化後、Cognito に残ったユーザーの初回ログインで会員をどう作るか |
| [kusakari-ec#109](https://github.com/abeouga/kusakari-ec/issues/109) | 出店申請の承認で組織・最初の店舗・オーナーを作り、運営が組織・店舗単位で管理できるようにする | ec#107、ec#108 | 組織を停止したときの店舗・商品・受付中の注文の扱い |
| [kusakari-ec#110](https://github.com/abeouga/kusakari-ec/issues/110) | 商品・在庫・注文・通知を店舗単位で扱うようにする | ec#104、ec#107、ec#108 | 店舗宛ての通知をオーナーにも送るか |
| [kusakari-ec#111](https://github.com/abeouga/kusakari-ec/issues/111) | オーナーが子アカウントを組織に追加し、担当店舗とロールを割り当てられるようにする | ec#105、ec#108 | 未登録のメールアドレスを指定されたときの案内 |
| [kusakari-ec#112](https://github.com/abeouga/kusakari-ec/issues/112) | 店舗側画面に店舗の切り替えと複数店舗の商品管理を入れる | ec#105、ec#110 | — |
| [kusakari-canvas#64](https://github.com/abeouga/kusakari-canvas/issues/64) | EC の会員・アカウント種別の作り直しに Canvas を追従させる | ec#104、ec#108、canvas#63 | 店舗側アカウントで Canvas を開いたときの扱い |
| [kusakari-ec#113](https://github.com/abeouga/kusakari-ec/issues/113) | 統合ブランチで全 E2E を通し、他の PC の DB 初期化・移行手順を整える | すべて | 統合ブランチを main に入れるか、入れる時期と方法 |

## 着手の順番

1. ec#104、ec#105、ec#106、canvas#63（並行して進められる）
2. ec#107
3. ec#108
4. ec#109、ec#110、ec#111、canvas#64
5. ec#112
6. ec#113

## #102 で未決定だった事項の移し先

| #102 の未決定事項 | 移した先 | 状態 |
|---|---|---|
| 担当者が別の組織の店舗に割り当てられないことの保証と、一意制約 | ec#104 | 未決定 |
| テーブルの具体的な構成（会員・店舗の名前と列、主キーの型） | ec#104 | 未決定 |
| 商品の所有者を組織と店舗のどちらにするか | ec#104 | 未決定 |
| アカウント種別の持ち方と、店舗側アカウントで買い物できるか | ec#104 | 未決定 |
| 運営（ADMIN）の表し方 | ec#104 | 未決定 |
| Flyway の扱い | ec#104 | 未決定 |
| MANAGER と STAFF の違い | ec#105 | 未決定 |
| 子アカウント用の Cognito アカウントの用意方法 | ec#105 | 未決定 |
| 店舗の切り替え画面 | ec#105（実装は ec#112） | 未決定 |
| 複数店舗の商品管理画面 | ec#105（実装は ec#112） | 未決定 |
| 初期化スクリプトの対象範囲と、実行前の確認方法 | ec#106、canvas#63 | 未決定 |
| 初期化後、Cognito に残ったユーザーの初回ログインで会員をどう作り直すか | ec#108 | 未決定 |
| 決めた内容を `docs/` に記録する | ec#104、ec#105（実装との照合は ec#113） | 未着手 |
| Canvas の DB も一緒に初期化するか | canvas#63 | **決定**：初期化する |
| 実装用の issue に分ける | ec#103 | **完了** |
