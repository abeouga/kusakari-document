# Kusakari Canvas クラス図 04 GardenDocument と画面の状態

Kusakari Canvas の画面（frontend）が持つ庭のデータ型 GardenDocument と、編集中の状態・編集ルール・HTTP・サーバーデータのモジュールのクラス図です。

## 対象のコード

- 対象のコード: kusakari-canvas の main、コミット c19d497（2026-11-20 時点）
- 対象のパッケージ:
  - [frontend/src/types/garden.d.ts](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/types/garden.d.ts): GardenDocument と、その中の写真・施工範囲・配置・カメラの型
  - [frontend/src/stores/editorStore.js](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/stores/editorStore.js): Zustand の編集中の状態
  - [frontend/src/domain](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/domain): 編集ルールと、写真・輪郭・カメラの計算
  - [frontend/src/api](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/api): HTTP の関数
  - [frontend/src/hooks](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/frontend/src/hooks): TanStack Query のサーバーデータと、自動保存などのフック
- backend の DTO は [backend/kusakari_canvas_api/schemas.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/schemas.py) と照らしました。

同じフォルダーのほかの図は、[00_モジュール構成](<00_モジュール構成.md>)、[01_APIとデータの層](<01_APIとデータの層.md>)、[02_画像生成と履歴](<02_画像生成と履歴.md>)、[03_植物モデル](<03_植物モデル.md>) です。PlantComposition の中身は 03 を見てください。テーブルの詳細は [テーブル設計図/kusakari-canvas](<../../テーブル設計図/kusakari-canvas>) を、処理の流れは [シーケンス図/kusakari-canvas](<../../シーケンス図/kusakari-canvas>) を見てください。保存の流れは [UC-07 庭プロジェクトを保存する](<../../シーケンス図/kusakari-canvas/UC-07_庭プロジェクトを保存する.md>)、配置の流れは [UC-05 庭オブジェクトを配置・編集する](<../../シーケンス図/kusakari-canvas/UC-05_庭オブジェクトを配置・編集する.md>) にあります。

## このパッケージの役割

- frontend は JavaScript（JSX）で書かれています。TypeScript のファイルは型の宣言（`.d.ts`）だけです。`npm run check:js`（`tsc -p frontend/jsconfig.json`、checkJs）で JS の型を検査します。interface は `types/garden.d.ts` にだけあります。
- `types/garden.d.ts` は、画面と E2E（`e2e/`）が共有する JSON の形です。JS のモジュールはこの型を import しません。frontend/src の中で参照するのは、`hooks/useUnavailablePlacements.js` の JSDoc と、`three/photoCamera.d.ts` の `import type` だけです。
- 編集の流れは、画面と 3D の操作 → `editorStore` のアクション → `domain` の検証済みの編集操作 → 新しい GardenDocument → 自動保存（`hooks/useGardenAutosave.js`）→ `api` → Canvas API です。AGENTS.md の依存の向きと同じです。
- 編集中の GardenDocument は `editorStore.document` にあります。サーバーから読んだ庭は TanStack Query のキャッシュ（`['garden', gardenId]`）にあり、庭を開いたときに `hydrate()` で写します。同じ id の庭なら写し直しません。
- 編集操作は、引数の GardenDocument を書き換えず、新しいオブジェクトを返します。成り立たない操作では、domain の関数が `null` か理由を返し、editorStore は document を変えません（理由を `editError` に入れるアクションはあります）。自動保存は、送った document と今の document が同じオブジェクトかどうかで、送っている間の編集を見分けます（`markSaved`）。
- Three.js の Scene・Object3D・Mesh・カメラは、GardenDocument にも editorStore にも入れません。

## 図の読み方

- `types/garden.d.ts` の interface は <<interface>> のクラスです。名前の無い入れ子の型（`{ ... }` と書かれた型）は、「親の型.フィールド名」を表示名にした <<無名の型>> のクラスにしました。そのフィールドの型は `object` と書きます。
- クラスを持たない JS のモジュールは <<module>> のクラスにしました。表示名はファイルのパスです。export している関数をメソッド、export している定数をフィールドとして書きます。export していない関数は書きません。`gardenApi` のように関数をまとめたオブジェクトは、`gardenApi.getGarden()` の形でメソッドに書きます。
- JS なので、引数と戻り値の型はコードに書かれていません。図の型は、渡している値と返している値から読みました。形が決まっていない引数（`asset`、`transform` など）は、名前だけ書きます。
- 戻り値の「地面の点」は `{ x, z }`（m）です。「行の配列」は、買い物リストなどの行のオブジェクトの配列です。2 つ以上の値をオブジェクトで返すものは、「A・B」とキーを並べました。
- `api` の戻り値で frontend に型が無いものは、backend の `response_model` のクラス名で書きました。
- 線は、`-->` がフィールドで持つ関連、`..>` が import して使う依存、`<|--` が継承です。線のラベルは、使っている関数や定数の名前です。ほかの図に詳しく載せたモジュールは、中身を省いた箱で示します。

## 座標と単位の決まり

| 対象 | 決まり | 根拠のコード |
| --- | --- | --- |
| 3D の座標（`Vector`） | 1 unit = 1 m です。Y が上で、地面は Y=0 です。原点は庭の中心で、X が幅、Z が奥行きの向きです。+Z が写真の手前、-Z が奥です。 | `domain/edgeCalibration.js`、`domain/polygonEdges.js`、`domain/placementBounds.js` の `groundOutline` |
| `GardenObject.position` | y は常に 0 です。x・z（配置基準点）だけを、施工範囲の輪郭と土台の矩形の中に制限します。辺の上も含み、許容誤差は 1e-6 m（`PLACEMENT_EPSILON`）です。モデルの枝葉や端は判定しません。 | `gardenEditing.addObject`、`isValidTransform`、`placementBounds.containsAnchor` |
| `GardenObject.rotation` | Y 軸の回りだけです（x=0、z=0）。単位はラジアンです。 | `isValidTransform` |
| `GardenObject.scale` | 一様（x=y=z）で、0.25〜3 です。 | `isValidTransform`、`MIN_OBJECT_SCALE`、`MAX_OBJECT_SCALE` |
| 庭の大きさ | `width`・`depth` はそれぞれ 1〜50 m です。配置は 200 個までです。 | `domain/limits.js` |
| `ImagePoint` | 元画像に対する 0〜1 の座標です。x は右、y は下の向きです。 | `calibratedProjection.projectWorld` |
| `GardenPhoto.boundary` | 施工範囲の輪郭です。3〜64 点の単純な多角形で、始点を最後に重ねません。 | `photoProjection.validBoundary` |
| `GardenPhoto.corners` | 輪郭の外接矩形から作る 4 点です（下左 → 下右 → 上右 → 上左）。利用者は入力しません。 | `photoProjection.withPhotoBoundary` |
| `GardenPhoto.edgeLengths` | `edgeLengths[i]` は `boundary[i]` → `boundary[i+1]` の辺の実寸（m）です。未入力は null です。 | `garden.d.ts` のコメント、`polygonEdges.edgeLength` |
| `PhotoCalibration` | 写真を撮ったカメラです。`rotation` は 3×3 の回転行列を行の順に並べた 9 要素で、世界座標をカメラ座標（OpenCV の軸。右・下・前）へ移します。`translation` は 3 要素、`focalLengthPx` は画素単位の焦点距離です。 | `calibratedProjection.projectWorld`、`edgeCalibration.js` |
| 表示のカメラ | 保存しません。写真の上の Three.js のカメラは、`three/photoCamera.js` の `createPhotoCamera(photo, width, depth)` が GardenPhoto から毎回作ります。3D 表示の視点は `editorStore.cameraCommand`（`'home'` か `'top'`）で切り替えます。 | `three/photoCamera.js`、`three/GardenCanvas.jsx` |

## 図 0 フォルダーの依存の向き

フォルダーの単位で、import の向きを示します。`pages/` と `components/` は、どちらも React の画面の部品なので 1 つの箱にしました。`types/garden.d.ts` への線だけは import ではなく、その形のデータを持つ・扱うことを示します。

```mermaid
classDiagram
    direction TB
    class Ui["pages/・components/"] {
        <<React>>
    }
    class Three["three/"] {
        <<R3F>>
    }
    class Hooks["hooks/"] {
        <<module>>
    }
    class Store["stores/editorStore.js"] {
        <<store>>
    }
    class Domain["domain/"] {
        <<module>>
    }
    class Api["api/"] {
        <<module>>
    }
    class Capture["capture/"] {
        <<module>>
    }
    class Types["types/garden.d.ts"] {
        <<interface>>
    }
    class Query["TanStack Query"] {
        <<library>>
    }
    class CanvasApi["Canvas API（FastAPI）"] {
        <<external>>
    }
    class EcApi["Kusakari EC の API"] {
        <<external>>
    }
    Ui ..> Three
    Ui ..> Hooks
    Ui ..> Store
    Ui ..> Domain
    Ui ..> Api
    Ui ..> Capture
    Ui ..> Query : useQuery・useMutation
    Three ..> Store
    Three ..> Domain
    Hooks ..> Store
    Hooks ..> Domain
    Hooks ..> Api
    Hooks ..> Capture
    Hooks ..> Query
    Store ..> Domain : 検証済みの編集操作
    Store --> Types : document
    Domain ..> Types : 引数と戻り値の形
    Api ..> Domain : urls.js・shopping.js の URL だけ
    Api ..> CanvasApi : HTTP
    Api ..> EcApi : HTTP
```

## 図 1 GardenDocument の型（types/garden.d.ts）

GardenDocument は、庭 1 つ分の全体のスナップショットです。保存は、この全体を `PUT /api/gardens/{id}` で送ります。多重度は、保存できる形（API の検査を通る形）で書きました。写真を読み込んだ直後は `corners` と `boundary` が空の配列で、輪郭を確定するまで自動保存しません。

```mermaid
classDiagram
    direction TB
    class GardenDocument {
        <<interface>>
        +schemaVersion: number
        +id: string
        +revision: number
        +name: string
        +width: number
        +depth: number
        +objects: GardenObject[]
        +photo: GardenPhoto | null
        +shoppingTargets?: object[]
    }
    class ShoppingTarget["GardenDocument.shoppingTargets の要素"] {
        <<無名の型>>
        +key: string
        +quantity: number
    }
    class GardenObject {
        <<interface>>
        +id: string
        +assetId: string
        +productId?: string
        +productName?: string
        +materialCode?: string
        +modelComposition?: PlantComposition
        +position: Vector
        +rotation: Vector
        +scale: Vector
    }
    class Vector {
        <<interface>>
        +x: number
        +y: number
        +z: number
    }
    class PlantComposition {
        <<interface>>
        +version: 1 | 2 | 3 | 4 | 5
        +catalogVersion: 1 | 2 | 3 | 4
        +profile: object
        +baseDimensions: object
        +fitScale?: number[]
        +parts: object[]
    }
    class PlantProfile["PlantComposition.profile"] {
        <<無名の型>>
        +plantType: 'tree' ほか 10 種の文字列
        +[key: string]: unknown
    }
    class PlantBaseDimensions["PlantComposition.baseDimensions"] {
        <<無名の型>>
        +width: number
        +height: number
        +depth: number
    }
    class PlantPart["PlantComposition.parts の要素"] {
        <<無名の型>>
        +partId: string
        +position: number[]
        +quaternion: number[]
        +scale: number[]
        +color: string | null
    }
    class GardenPhoto {
        <<interface>>
        +dataUrl: string
        +imageWidth: number
        +imageHeight: number
        +corners: ImagePoint[]
        +boundary: ImagePoint[]
        +calibration?: PhotoCalibration | null
        +edgeLengths?: Array~number | null~
        +projectionSize?: object | null
    }
    class ProjectionSize["GardenPhoto.projectionSize"] {
        <<無名の型>>
        +width: number
        +depth: number
    }
    class PhotoCalibration {
        <<interface>>
        +version: 1
        +method?: 'rectangle' | 'edges'
        +points?: ImagePoint[]
        +referenceWidth?: number
        +referenceDepth?: number
        +focalLengthPx: number
        +focalSource: 'estimated' | 'manual'
        +rotation: number[]
        +translation: number[]
        +reprojectionErrorPx: number
    }
    class ImagePoint {
        <<interface>>
        +x: number
        +y: number
    }
    GardenDocument "1" --> "0..200" GardenObject : objects
    GardenDocument "1" --> "0..1" GardenPhoto : photo
    GardenDocument "1" --> "0..200" ShoppingTarget : shoppingTargets
    GardenObject --> Vector : position・rotation・scale
    GardenObject "1" --> "0..1" PlantComposition : modelComposition
    PlantComposition "1" --> "1" PlantProfile : profile
    PlantComposition "1" --> "1" PlantBaseDimensions : baseDimensions
    PlantComposition "1" --> "*" PlantPart : parts
    GardenPhoto "1" --> "4" ImagePoint : corners
    GardenPhoto "1" --> "3..64" ImagePoint : boundary
    GardenPhoto "1" --> "0..1" PhotoCalibration : calibration
    GardenPhoto "1" --> "0..1" ProjectionSize : projectionSize
    PhotoCalibration "1" --> "0 または 4" ImagePoint : points
    note for Vector "単位は m。Y が上で地面は Y=0、原点は庭の中心。<br/>position.y は 0。rotation は Y 軸だけ（ラジアン）。<br/>scale は x=y=z で 0.25〜3"
    note for ImagePoint "元画像に対する 0〜1 の座標。<br/>x は右、y は下の向き"
    note for PhotoCalibration "rotation は 3×3 の行列を行の順に 9 要素（世界 → カメラ）。<br/>translation は 3 要素。軸は OpenCV（右・下・前）。<br/>method が edges のときは points と基準の実寸を持たない"
```

- `shoppingTargets` は、以前の画面で保存していた必要数です。今の画面では編集も表示もしませんが、読み込んだ値をそのまま保存し直します（`garden.d.ts` のコメント）。
- `GardenObject` の `productId`・`productName`・`materialCode`・`modelComposition` は、植物の商品から置いた配置（`assetId` が `plant_modular`）だけが持ちます。固定のアセット（`tree_oak`、`shrub_boxwood`、`brick_paver`、`bench_wood`）の配置は持ちません。
- `PlantComposition.profile.plantType` は `'tree'`・`'shrub'`・`'flower'`・`'conifer'`・`'multistem'`・`'spreading'`・`'grass'`・`'rosette'`・`'vine'`・`'palm'` の 10 種です。`version` 1〜4 は以前の組み立ての規則で、5 が今の規則です。
- `PhotoCalibration.method` が無いか `'rectangle'` のときは、基準の長方形（`points` の 4 点と `referenceWidth`・`referenceDepth`）から backend の `POST /api/photo-calibration` が求めたカメラです。`'edges'` のときは、輪郭と `edgeLengths` から画面の `applyEdgeLength` が求めたカメラです。
- `projectionSize` は、カメラの無い写真で、輪郭の外接矩形に当てはめる実寸（m）です。

### backend の DTO との対応

| schemas.py の DTO | 使うところ | frontend の型 | 違いと追加の検査 |
| --- | --- | --- | --- |
| `GardenDocumentRequest` | `PUT /api/gardens/{id}` の本文 | `GardenDocument` | `NamedRequest` を継承します。name は空白だけを不可とし、UTF-16 で 120 単位までです。width・depth は 1〜50 です。schemaVersion は 1 だけ、revision は 0 以上、objects は 200 個まで、shoppingTargets は 200 個までで key の重複は不可です。 |
| `GardenDocument` | `GET /api/gardens/{id}`、`POST /api/gardens`、`PUT /api/gardens/{id}` の応答 | `GardenDocument` | shoppingTargets の既定は空の配列で、応答には必ず入ります（frontend の型では省略できます）。 |
| `GardenObject` | GardenDocument の objects | `GardenObject` | productId は英小文字か数字で始まり、英小文字・数字・ハイフンからなる 40 文字まで、productName は 1〜120 文字、materialCode は 80 文字までです。この 3 つと modelComposition は、無いときは JSON に出しません。validation.py が、id が UUID の形であること、`plant_modular` なら productId・productName・modelComposition があり materialCode が `product.{productId}` であることを確かめます。 |
| `Vector` | position、rotation、scale | `Vector` | 形は同じです。validation.py が、position.y=0、施工範囲の中、rotation の x・z が 0、scale が 0.25〜3 で一様なことを確かめます。 |
| `PlantComposition`（plant_schemas.py） | GardenObject の modelComposition | `PlantComposition` | version 5 は plants/schemas.py の `PlantComposition`、1〜4 は plant_legacy の `LegacyComposition` で受けます。 |
| `GardenPhoto` | GardenDocument の photo | `GardenPhoto` | 保存するときは、corners が 4 点、boundary が 3〜64 点です（validation.py）。dataUrl は JPEG か PNG の data URL で、画像は 5,000,000 バイトまで、各辺 6000 px まで、2500 万画素までです。edgeLengths は 3〜64 要素で、各要素は 0.01〜100 か null です。calibration・edgeLengths・projectionSize は、無いときは JSON に出しません。 |
| `ImagePoint` | corners、boundary、PhotoCalibration の points、CalibrationRequest の points | `ImagePoint` | 形は同じです。0〜1 の範囲は validation.py が確かめます。 |
| `PhotoCalibration` | GardenPhoto の calibration、`POST /api/photo-calibration` の応答 | `PhotoCalibration` | method の既定は `'rectangle'` で、`'rectangle'` のときは JSON に出しません。`'rectangle'` は points（4 点）・referenceWidth・referenceDepth（0.1〜50）が必須で、`'edges'` はこの 3 つを持てません。rotation は 9 要素、translation は 3 要素です。 |
| `PhotoProjectionSize` | GardenPhoto の projectionSize | `GardenPhoto.projectionSize`（無名の型） | width・depth は 1〜50 です。 |
| `ShoppingTarget`、`ShoppingTargets` | GardenDocument の shoppingTargets | `GardenDocument.shoppingTargets` の要素（無名の型） | key は `product:` か `asset:` で始まる 80 文字まで、quantity は 1〜999 です。`ShoppingTargets` は、200 個までの配列の型の別名です。 |
| `CreateGardenRequest` | `POST /api/gardens` の本文 | 型なし（`gardenApi.createGarden` の JSDoc が `{name: string, width?: number, depth?: number}`） | width の既定は 10、depth の既定は 8 です。画面は name だけを送ります（`pages/GardenListPage.jsx`）。 |
| `CalibrationRequest` | `POST /api/photo-calibration` の本文 | 型なし（`components/PhotoCalibrationEditor.jsx` が作ります） | imageWidth・imageHeight は 1〜6000、points は 4 点、referenceWidth・referenceDepth は 0.1〜50 です。focalLengthPx は null か、0 より大きく 100000 以下の値です。 |
| `GardenSummary` | `GET /api/gardens` の応答の要素、`POST /api/gardens/{id}/duplicate` の応答 | 型なし | id、name、width、depth、revision、updatedAt、objectCount です。 |
| `AssetResponse`、`BaseDimensions` | `GET /api/assets` の応答の要素 | 型なし（図 5 の asset の表を見てください） | id、name、category、modelUrl、baseDimensions（width・height・depth）です。 |
| `ApiModel`、`NamedRequest` | DTO の基底のクラス | なし | `ApiModel` は余分なキーを拒否し（`extra="forbid"`）、NaN と Infinity を拒否します（`allow_inf_nan=False`）。 |

GardenDocument とテーブルの対応は、次のとおりです（backend の `service.py` が変換します）。

| frontend の型 | テーブルと列 |
| --- | --- |
| `GardenDocument` の id・name・width・depth・revision | `gardens` の同じ名前の列です。schemaVersion は保存せず、応答では常に 1 です。持ち主（`owner_id`）と `updated_at` は GardenDocument に入れません。 |
| `GardenDocument.photo`（`GardenPhoto` の全体） | `gardens.photo_json`（JSON の文字列）です。画像の保存先が `s3` のときは、dataUrl の代わりに `imageKey` を入れます（`media.py`）。 |
| `GardenDocument.shoppingTargets` | `gardens.shopping_targets_json` です。 |
| `GardenObject` | `placed_objects` の 1 行です（`id`、`asset_id`、`product_id`、`product_name`、`material_code`、`model_composition_json`、`position_x`〜`scale_z`）。 |

## 図 2 編集中の状態（stores/editorStore.js）

`editorStore.js` は、Zustand の `create()` で作る 1 つのストア `useEditorStore` です。部品は `useEditorStore((state) => ...)` で状態を読み、`useEditorStore.getState()` からアクションを呼びます。編集のアクションは domain の関数で新しい GardenDocument を作り、`set()` で `document` を差し替えて `isDirty` を true にします。

```mermaid
classDiagram
    direction LR
    class editorStore["useEditorStore（stores/editorStore.js）"] {
        <<store>>
        +document: GardenDocument | null
        +selectedObjectId: string | null
        +selectedAssetId: string | null
        +tool: 'move' | 'rotate' | 'scale'
        +isDirty: boolean
        +isSaving: boolean
        +isTransformDragging: boolean
        +isCalibrating: boolean
        +photoBoundaryDraft: ImagePoint[] | null
        +saveError: string | null
        +editError: string | null
        +cameraCommand: object
        +loadedModelIds: string[]
        +failedModelIds: string[]
        +hydrate(GardenDocument document) void
        +resizeGarden(number width, number depth) boolean
        +renameGarden(string name) boolean
        +setPhotoEdgeLength(number index, number length) string | null
        +setPhoto(GardenPhoto | null photo) void
        +moveBoundaryVertex(number index, ImagePoint point) string | null
        +setPhotoBoundaryDraft(ImagePoint[] | null photoBoundaryDraft) void
        +confirmPhotoBoundary() boolean
        +addAssetAt(asset, number x, number z) void
        +selectObject(string | null id) void
        +selectAsset(string | null id) void
        +setTool(string tool) void
        +transformObject(string id, transform) boolean
        +deleteSelected() void
        +removeObjects(string[] objectIds) boolean
        +setSaving(boolean isSaving) void
        +setTransformDragging(boolean isTransformDragging) void
        +setCalibrating(boolean isCalibrating) void
        +setSaveError(string | null saveError) void
        +setEditError(string | null editError) void
        +markSaved(GardenDocument document, GardenDocument submitted) void
        +commandCamera(string view) void
        +markModelLoaded(string id) void
        +markModelFailed(string id) void
        +clearModelFailure(string id) void
    }
    class CameraCommand["editorStore.cameraCommand"] {
        <<無名の型>>
        +view: 'home' | 'top'
        +sequence: number
    }
    class GardenDocument
    <<interface>> GardenDocument
    class GardenPhoto
    <<interface>> GardenPhoto
    class ImagePoint
    <<interface>> ImagePoint
    class gardenEditing["domain/gardenEditing.js"]
    class photoProjection["domain/photoProjection.js"]
    class gardenDimensions["domain/gardenDimensions.js"]
    class edgeCalibration["domain/edgeCalibration.js"]
    class calibratedProjection["domain/calibratedProjection.js"]
    class limits["domain/limits.js"]
    editorStore "1" --> "0..1" GardenDocument : document
    editorStore "1" --> "*" ImagePoint : photoBoundaryDraft
    editorStore "1" --> "1" CameraCommand : cameraCommand
    editorStore ..> GardenPhoto : setPhoto で差し替える
    editorStore ..> gardenEditing : createPlacedObject・addObject・<br/>changeObjectTransform・<br/>removeObject・removeObjects
    editorStore ..> photoProjection : validSurface・withPhotoBoundary
    editorStore ..> gardenDimensions : dimensionError
    editorStore ..> edgeCalibration : applyEdgeLength・<br/>withEdgeLengthsForBoundary
    editorStore ..> calibratedProjection : calibratedBoundaryError
    editorStore ..> limits : MAX_GARDEN_NAME_LENGTH
    note for editorStore "photoBoundaryDraft は描画中の輪郭の頂点で、<br/>document にも API にも入れない"
```

### アクションと、呼ぶ部品

| アクション | 呼ぶ部品 | 使う domain の関数 | 変えるもの、失敗したとき |
| --- | --- | --- | --- |
| `hydrate(document)` | `pages/EditorPage.jsx`（庭を読み込んだとき） | なし | 同じ id の庭なら何もしません。違えば `structuredClone` で写して先頭の配置を選び、保存・変形・描画中の輪郭・カメラ設定・エラー・モデルの読み込みの状態を初めに戻します（`tool` と `cameraCommand` はそのままです）。 |
| `resizeGarden(width, depth)` | `components/GardenDimensions.jsx` | `dimensionError` | 輪郭の描画中・カメラ設定中・変形のドラッグ中と、`dimensionError` が理由を返したときは false です。 |
| `renameGarden(name)` | `components/GardenTitle.jsx` | `MAX_GARDEN_NAME_LENGTH` | 前後の空白を除いて 1〜60 文字です。上の操作中、空、60 文字を超えるときは false です。 |
| `setPhotoEdgeLength(index, length)` | `components/EdgeMeasurementPopover.jsx` | `applyEdgeLength` | 失敗の理由の文字列を返し、成功は null です。全部の辺がそろうとカメラを求め直し、庭の width・depth と配置の位置も変わります。 |
| `setPhoto(photo)` | `components/PhotoOverlay.jsx`（写真の読み込みと取り外し）、`components/PhotoCalibrationEditor.jsx`（カメラの設定） | `withEdgeLengthsForBoundary` | 基準の長方形でカメラを設定し直したときは `edgeLengths` を消します。輪郭が変わったときは `edgeLengths` を合わせ直します。写真を替えたか外したときは `photoBoundaryDraft` を null にします。 |
| `moveBoundaryVertex(index, point)` | `components/PhotoOverlay.jsx` | `withPhotoBoundary`、`validSurface`、`calibratedBoundaryError` | 成り立たない形や、地平線・実寸の範囲を越える移動は反映せず、理由の文字列を返します。反映は `setPhoto` で行います。 |
| `setPhotoBoundaryDraft(draft)` | `components/PhotoOverlay.jsx` | なし | 描画中の頂点を置き換えます。写真が無いときは何もしません。 |
| `confirmPhotoBoundary()` | `components/PhotoOverlay.jsx` | `withPhotoBoundary`、`withEdgeLengthsForBoundary`、`validSurface` | 描画中の頂点を `photo.boundary` にします。成り立たない輪郭は false です。 |
| `addAssetAt(asset, x, z)` | `three/DropPlacement.jsx`、`three/GardenGround.jsx` | `createPlacedObject`、`addObject` | 置いた配置を選びます。置けないときは `editError` に「配置数の上限に達したか、配置位置が範囲外です。」を入れます。 |
| `transformObject(id, transform)` | `three/PlacedObject.jsx` | `changeObjectTransform` | 制限を外れると `editError` に「庭の範囲、回転軸、拡大縮小の制限内で入力してください。」を入れ、false を返します。 |
| `deleteSelected()` | `pages/EditorPage.jsx`（「削除」、Delete・Backspace キー） | `removeObject` | 選んだ配置を消し、先頭の配置を選びます。 |
| `removeObjects(objectIds)` | `hooks/useUnavailablePlacements.js` | `removeObjects` | 買えなくなった商品の配置をまとめて外します。 |
| `selectObject(id)`、`selectAsset(id)`、`setTool(tool)` | `pages/EditorPage.jsx`、`components/PhotoOverlay.jsx`、`three/PlacedObject.jsx`、`three/DropPlacement.jsx` | なし | 選んだ配置、置く商品・アセット、ツール（`'move'`・`'rotate'`・`'scale'`）だけを変えます。 |
| `setSaving`、`setSaveError`、`markSaved` | `hooks/useGardenAutosave.js` | なし | 自動保存の状態です。`markSaved` は、送ったあとに編集が無ければ応答の document に置き換え、編集があれば revision だけを受け取って `isDirty` を残します。 |
| `setTransformDragging`、`setEditError`、`setCalibrating` | `three/PlacedObject.jsx`、`three/RotationRing.jsx`、`three/DropPlacement.jsx`、`three/GardenGround.jsx`、`components/PhotoOverlay.jsx` | なし | 変形のドラッグ中、配置のエラー、カメラ設定中の印です。 |
| `commandCamera(view)` | `pages/EditorPage.jsx`（「上から見る」「初期視点」） | なし | `cameraCommand.sequence` を 1 増やします。`three/GardenCanvas.jsx` がこれを見て視点を動かします。 |
| `markModelLoaded`、`markModelFailed`、`clearModelFailure` | `pages/EditorPage.jsx` | なし | GLB と植物モデルの読み込みの結果です。 |

### 状態の置き場所

| 状態 | 置き場所 | 保存 |
| --- | --- | --- |
| 編集中の庭（GardenDocument） | `editorStore.document` | 自動保存で `PUT /api/gardens/{id}` に送ります。 |
| 選択、ツール、描画中の輪郭、カメラ設定中、保存中、エラー、モデルの読み込み | `editorStore` のほかのフィールド | 保存しません。 |
| サーバーの庭、アセット、庭の一覧、EC の商品など | TanStack Query のキャッシュ（図 7 の表） | サーバーが正です。 |
| 写真と 3D の切り替え（`viewMode`）、ログインの期限切れ（`sessionExpired`）、ダイアログの開閉など | `pages/EditorPage.jsx` の `useState` | 保存しません。 |
| 右パネルの幅 | `localStorage`（`components/SidebarResize.jsx`） | そのブラウザーだけに残します。 |

## 図 3 配置と庭の寸法の編集ルール（domain）

配置の追加・変形・削除と、土台の寸法・庭の名前の決まりです。`gardenEditing.js` の関数は、成り立たないときに `null` を返します。`transform` は `{ position, rotation, scale }`（どれも Vector）の形です。

```mermaid
classDiagram
    direction TB
    class gardenEditing["domain/gardenEditing.js"] {
        <<module>>
        +createPlacedObject(asset, number x, number z) GardenObject
        +addObject(GardenDocument document, GardenObject object) GardenDocument | null
        +changeObjectTransform(GardenDocument document, string objectId, transform) GardenDocument | null
        +removeObject(GardenDocument document, string objectId) GardenDocument | null
        +removeObjects(GardenDocument document, string[] objectIds) GardenDocument | null
        +isValidTransform(GardenDocument document, transform) boolean
        +withPosition(current, number x, number z) transform
        +withRotation(current, number radians) transform
        +withScale(current, number value) transform
    }
    class placementBounds["domain/placementBounds.js"] {
        <<module>>
        +PLACEMENT_EPSILON: number = 1e-6
        +PHOTO_REQUIRED_MESSAGE: string
        +groundOutline(GardenDocument document) 地面の点[]
        +containsAnchor(GardenDocument document, Vector position) boolean
        +outsideObjects(GardenDocument document) GardenObject[]
        +placementBlockedReason(GardenDocument document) string | null
    }
    class limits["domain/limits.js"] {
        <<module>>
        +GARDEN_MIN_SIDE: number = 1
        +GARDEN_MAX_SIDE: number = 50
        +MAX_PLACED_OBJECTS: number = 200
        +MIN_OBJECT_SCALE: number = 0.25
        +MAX_OBJECT_SCALE: number = 3
        +MAX_GARDEN_NAME_LENGTH: number = 60
        +isValidGardenSize(number width, number depth) boolean
    }
    class gardenDimensions["domain/gardenDimensions.js"] {
        <<module>>
        +dimensionError(GardenDocument document, number width, number depth) string | null
    }
    class gardenNames["domain/gardenNames.js"] {
        <<module>>
        +DEFAULT_GARDEN_NAME: string = '新しい庭'
        +nextDefaultGardenName(gardens) string
    }
    class photoProjection["domain/photoProjection.js（図 4）"]
    class calibratedProjection["domain/calibratedProjection.js（図 4）"]
    class polygonEdges["domain/polygonEdges.js（図 4）"]
    gardenEditing ..> placementBounds : containsAnchor
    gardenEditing ..> limits : MAX_PLACED_OBJECTS・<br/>MIN_OBJECT_SCALE・MAX_OBJECT_SCALE
    gardenDimensions ..> limits : isValidGardenSize
    gardenDimensions ..> calibratedProjection : calibratedBoundaryError
    gardenDimensions ..> polygonEdges : photoGroundPoint
    placementBounds ..> photoProjection : validSurface
    placementBounds ..> calibratedProjection : calibratedBoundaryError
    placementBounds ..> polygonEdges : photoGroundPoint
    note for gardenEditing "どの関数も引数の document を書き換えず、新しいオブジェクトを返す。<br/>withPosition・withRotation・withScale は frontend/src に呼び出し元が無い"
    note for placementBounds "groundOutline は、写真が無ければ土台の矩形、<br/>写真があれば確定した輪郭を地面へ写した多角形。<br/>輪郭が成り立たないときは空の配列"
```

- `createPlacedObject` は `crypto.randomUUID()` で id を作り、position を `{ x, y: 0, z }`、rotation を 0、scale を 1 にします。`asset.modelComposition` があるとき（植物の商品）だけ、productId・productName・materialCode・modelComposition の写しを持たせます。`assetId` は `asset.placedAssetId` があればそれ（`plant_modular`）、無ければ `asset.id` です。
- `addObject` は、配置がすでに 200 個のとき、position.y が 0 でないとき、x・z が有限でないとき、施工範囲の外のとき、id が重なるときに `null` を返します。
- `placementBlockedReason` は、写真の無い庭に新しく置こうとしたときの理由（`PHOTO_REQUIRED_MESSAGE`）を返します。
- `dimensionError` は、幅・奥行きが 1〜50 m でないとき、配置が新しい土台の外に出るとき、写真の輪郭が範囲の外になるときに理由を返します。
- `nextDefaultGardenName` は、庭の一覧と重ならない名前（「新しい庭」「新しい庭 2」…）を返します。

## 図 4 写真・輪郭・カメラの計算（domain）

写真の上の点と地面の点を行き来する計算です。カメラの無い写真は、輪郭の外接矩形を庭の幅・奥行き（`projectionSize` があればその値）に当てはめる射影変換（`homography`）を使います。カメラのある写真は `PhotoCalibration` で投影します。

```mermaid
classDiagram
    direction TB
    class photoProjection["domain/photoProjection.js"] {
        <<module>>
        +unitCorners: ImagePoint[]
        +homography(ImagePoint[] from, ImagePoint[] to) 点を写す関数 | null
        +homographyMatrix(ImagePoint[] from, ImagePoint[] to) number[] | null
        +validCorners(ImagePoint[] points) boolean
        +validBoundary(ImagePoint[] points) boolean
        +validSurface(GardenPhoto photo) boolean
        +withPhotoBoundary(GardenPhoto photo, ImagePoint[] boundary) GardenPhoto
        +pointInPolygon(point, polygon) boolean
    }
    class calibratedProjection["domain/calibratedProjection.js"] {
        <<module>>
        +projectWorld(GardenPhoto photo, Vector point) ImagePoint | null
        +projectionCorners(GardenPhoto photo, number width, number depth) ImagePoint[]
        +groundPoint(GardenPhoto photo, ImagePoint point) 地面の点 | null
        +cameraAlignedGrid(GardenPhoto photo, outline) 線の配列
        +calibratedBoundaryError(GardenPhoto photo, number width, number depth) string | null
    }
    class polygonEdges["domain/polygonEdges.js"] {
        <<module>>
        +photoGroundPoint(GardenPhoto photo, number width, number depth, ImagePoint point) 地面の点 | null
        +edgeLength(GardenDocument document, number index) number | null
    }
    class edgeCalibration["domain/edgeCalibration.js"] {
        <<module>>
        +EDGE_LENGTH_TOLERANCE: number = 0.01
        +isEdgeCalibration(GardenPhoto photo) boolean
        +applyEdgeLength(GardenDocument document, number edgeIndex, number requestedLength) document または error
        +withEdgeLengthsForBoundary(GardenPhoto photo) GardenPhoto
    }
    class gardenSummary["domain/gardenSummary.js"] {
        <<module>>
        +groundSummary(GardenDocument document) area・perimeter・label
    }
    class limits["domain/limits.js（図 3）"]
    class placementBounds["domain/placementBounds.js（図 3）"]
    calibratedProjection ..> photoProjection : homography・unitCorners
    polygonEdges ..> calibratedProjection : groundPoint
    polygonEdges ..> photoProjection : homography・unitCorners
    edgeCalibration ..> calibratedProjection : calibratedBoundaryError・<br/>groundPoint・projectWorld
    edgeCalibration ..> photoProjection : homography・unitCorners
    edgeCalibration ..> polygonEdges : edgeLength
    edgeCalibration ..> limits : isValidGardenSize
    edgeCalibration ..> placementBounds : containsAnchor
    gardenSummary ..> polygonEdges : photoGroundPoint・edgeLength
    note for edgeCalibration "全部の辺の実寸がそろうと、輪郭と実寸だけからカメラを求め、<br/>method が edges の PhotoCalibration を作る。<br/>庭の width・depth は輪郭の外接矩形、projectionSize は null。<br/>配置は写真の上の根元の位置を保って地面の座標を求め直す"
```

- `validSurface` は、corners と boundary が成り立つかを確かめます。カメラも `projectionSize` も無い写真では、輪郭が corners の内側にあることも確かめます。自動保存と配置の範囲は、これが false の間は止まります。
- `calibratedBoundaryError` は、カメラのある写真で、輪郭の点が地平線を越えるか、庭の実寸の範囲（幅・奥行きの半分 + 0.05 m）を越えるときに理由を返します。
- `edgeLength` は、利用者が入力した辺の実寸があればそれを返し、無ければ今の投影から測った長さを返します。
- `applyEdgeLength` は `{ document }` か `{ error }` を返します。長さは 0.01〜100 m です。カメラを求められないとき、求めたあとの幅・奥行きが 1〜50 m に収まらないとき、輪郭が庭の実寸の範囲を越えるとき、配置が庭の外に出るときなどは `error` です。
- `withEdgeLengthsForBoundary` は、輪郭を変えたときの `edgeLengths` です。`'edges'` のカメラなら新しい輪郭の辺の長さを入れ直し、そうでなければ辺の数が変わったときだけ消します。
- `groundSummary` は、輪郭の面積・外周と、その求め方の説明（「写真上の辺の実寸から求めたパースに基づく推定」など）を返します。

## 図 5 商品・買い物リスト・URL（domain）

EC の商品と配置をつなぐ関数、買い物リストの行、URL の組み立て、AI 画像生成の参考写真の検査です。

```mermaid
classDiagram
    direction LR
    class productModels["domain/productModels.js"] {
        <<module>>
        +productDragType: string = 'application/x-kusakari-product'
        +productAsset(product, assets) asset | null
        +assetForObject(GardenObject object, Map~string, asset~ assetMap) asset | undefined
        +placedProductAsset(GardenObject object, assets) asset | null
        +startProductDrag(event, asset) void
    }
    class shopping["domain/shopping.js"] {
        <<module>>
        +ecUrl: string
        +materialCodes: object
        +placementRows(GardenDocument document, assets) 行の配列
        +withSavedItems(rows, saved) 行の配列
    }
    class productAvailability["domain/productAvailability.js"] {
        <<module>>
        +REMOVED_REASONS: Set~string~
        +uniqueProductIds(string[] ids) string[]
        +placedProductIds(GardenDocument document) string[]
        +removedPlacements(GardenDocument document, Map references) objectIds・names
        +availabilityNote(reference) string | null
    }
    class urls["domain/urls.js"] {
        <<module>>
        +canvasBase: string
        +canvasUrl(string path) string
        +canvasAssetUrl(string path) string
        +canvasPathname() string
        +gardenEntryUrl(string path) string
    }
    class aiReferencePhoto["domain/aiReferencePhoto.js"] {
        <<module>>
        +requiredReferencePhotoMessage(product) string
        +readAiReferencePhoto(File file) Promise~dataUrl・name・width・height~
        +plantReferenceRows(GardenDocument document, assets) 行の配列
    }
    shopping ..> productModels : assetForObject
    note for productAvailability "REMOVED_REASONS は DELETED・STORE_CLOSED・<br/>STORE_SUSPENDED・ORGANIZATION_SUSPENDED。<br/>この理由の商品の配置だけを外す"
    note for shopping "ecUrl は VITE_KUSAKARI_EC_URL から作る EC の基準の URL"
```

画面の「asset」は、型の宣言の無いオブジェクトです。作る関数ごとの形は次のとおりです。`createPlacedObject(asset, x, z)` がこれを受け取って GardenObject を作ります。

| 作るところ | id | placedAssetId | ほかのキー |
| --- | --- | --- | --- |
| `GET /api/assets`（`AssetResponse`） | `tree_oak` などのアセット ID | なし | name、category、modelUrl、baseDimensions |
| `productAsset(product, assets)`（植物の商品） | `product:` + 商品 ID | `plant_modular` | name、category（`profile.plantType`）、productId、materialCode（商品の `canvasMaterialCode`）、modelComposition、baseDimensions |
| `productAsset(product, assets)`（固定のアセットの商品 `canvas-oak`・`canvas-boxwood`・`canvas-brick`・`canvas-bench`） | 対応するアセットの `AssetResponse` をそのまま返します。ほかの商品は null です。 | なし | `GET /api/assets` と同じ |
| `placedProductAsset(object, assets)`（保存済みの植物の配置） | `saved:` + 配置の id | 配置の assetId | name、category、productId、materialCode、modelComposition、baseDimensions。modelComposition の無い配置には、その assetId の `AssetResponse` を返します。 |

- `placementRows` は、配置を商品 ID（無ければ assetId）ごとにまとめた買い物リストの行を返します。行は key、productId、assetId、name、materialCode、footprint、quantity、unit（`"piece"`）を持ちます。materialCode は、配置が持つ値か、`materialCodes`（`tree_oak` → `plant.oak` など 4 つ）の値です。
- `withSavedItems` は、EC で買い物リストに入れた商品のうち、配置に無いものを `unplaced: true` の行として足します。
- `availabilityNote` は、買えない商品に「在庫なし」か「現在は購入できません」を返します。
- `canvasUrl` は、Vite の `BASE_URL`（`canvasBase`）の下の URL を作ります。`gardenEntryUrl` は、今の URL の `productId` を引き継ぎます。
- `aiReferencePhoto.js` は AI 画像生成の参考写真の検査です（PNG・JPEG・WebP、8,000,000 バイトまで、各辺 2,048 px まで、合計 3,686,400 画素まで）。AI 画像生成は [02_画像生成と履歴](<02_画像生成と履歴.md>) を見てください。

## 図 6 HTTP の関数（api）

Canvas API へは `requestJson`（同じオリジン）で、EC の API へは `commerce.js` の中の関数（`credentials: 'include'`）で送ります。どちらも、書き込みの要求の前に `authHeaders` が EC の CSRF トークンを取り、401 のときは `handleUnauthorized` を呼びます。下の表の Canvas API のパスは、`canvasUrl()` が Vite の `BASE_URL`（`frontend/vite.config.js` の `KUSAKARI_CANVAS_WEB_BASE`、既定は `/`）の下に付けます。

```mermaid
classDiagram
    direction LR
    class Error {
        <<JavaScript>>
    }
    class ApiError {
        +status: number
        +code: string
        +name: string = 'ApiError'
        +constructor(string message, number status, string code)
    }
    class CommerceError {
        +status: number
        +constructor(string message, number status)
    }
    class http["api/http.js"] {
        <<module>>
        +requestJson(string path, init) Promise~any~
    }
    class auth["api/auth.js"] {
        <<module>>
        +loginCompleteParam: string = 'loginComplete'
        +authMode() Promise~string~
        +authHeaders(string method) Promise~object~
        +login() void
        +setUnauthorizedHandler(handler) 解除の関数
        +handleUnauthorized() void
        +openLoginWindow() void
        +onLoginCompleted(callback) 解除の関数
        +announceLoginCompleted() void
    }
    class gardens["api/gardens.js"] {
        <<module>>
        +gardenApi.listAssets() Promise~AssetResponse[]~
        +gardenApi.listGardens() Promise~GardenSummary[]~
        +gardenApi.getGarden(string id) Promise~GardenDocument~
        +gardenApi.createGarden(request) Promise~GardenDocument~
        +gardenApi.saveGarden(GardenDocument document) Promise~GardenDocument~
        +gardenApi.duplicateGarden(string id) Promise~GardenSummary~
        +gardenApi.deleteGarden(string id) Promise~undefined~
    }
    class commerce["api/commerce.js"] {
        <<module>>
        +commerceApi.cart() Promise~any~
        +commerceApi.products() Promise~any~
        +commerceApi.references(string[] productIds) Promise~any~
        +commerceApi.quote(items) Promise~any~
        +commerceApi.savedItems(string gardenId) Promise~any~
        +productImage(string path) string
        +yen(number value) string
    }
    class aiImages["api/aiImages.js"] {
        <<module>>
        +aiImageApi.status() Promise~AiStatus~
        +aiImageApi.stores() Promise~AiStore[]~
        +aiImageApi.candidates(string assetId) Promise~AiCandidate[]~
        +aiImageApi.productReferences(string[] productIds) Promise~AiCandidate[]~
        +aiImageApi.generate(string gardenId, request) Promise~AiImageResponse~
    }
    class imageHistory["api/imageHistory.js"] {
        <<module>>
        +imageHistoryApi.list(string gardenId, string cursor) Promise~HistoryPage~
        +imageHistoryApi.detail(string gardenId, string historyId) Promise~HistoryDetail~
        +imageHistoryApi.thumbnailUrl(string gardenId, string historyId) string
        +imageHistoryApi.save(string gardenId, request) Promise~HistorySummary~
        +imageHistoryApi.remove(string gardenId, string historyId) Promise~undefined~
    }
    class urls["domain/urls.js（図 5）"]
    class shopping["domain/shopping.js（図 5）"]
    Error <|-- ApiError
    Error <|-- CommerceError
    http ..> ApiError : throw
    commerce ..> CommerceError : throw
    gardens ..> http : requestJson
    aiImages ..> http : requestJson
    imageHistory ..> http : requestJson
    http ..> auth : authHeaders・handleUnauthorized
    commerce ..> auth : authHeaders・handleUnauthorized
    http ..> urls : canvasUrl
    auth ..> urls : canvasUrl
    auth ..> shopping : ecUrl
    commerce ..> shopping : ecUrl
    note for http "失敗の応答は ApiError（message、status、code）にする。<br/>本文が読めないときは code が REQUEST_FAILED。204 は undefined"
```

| 関数 | 送り先 | HTTP | パス | 呼ぶところ |
| --- | --- | --- | --- | --- |
| `gardenApi.listAssets` | Canvas API | GET | `/api/assets` | `pages/EditorPage.jsx` |
| `gardenApi.listGardens` | Canvas API | GET | `/api/gardens` | `pages/GardenListPage.jsx` |
| `gardenApi.getGarden` | Canvas API | GET | `/api/gardens/{id}` | `pages/EditorPage.jsx` |
| `gardenApi.createGarden` | Canvas API | POST | `/api/gardens` | `pages/GardenListPage.jsx` |
| `gardenApi.saveGarden` | Canvas API | PUT | `/api/gardens/{id}` | `hooks/useGardenAutosave.js` |
| `gardenApi.duplicateGarden` | Canvas API | POST | `/api/gardens/{id}/duplicate` | `pages/GardenListPage.jsx` |
| `gardenApi.deleteGarden` | Canvas API | DELETE | `/api/gardens/{id}` | `pages/GardenListPage.jsx` |
| `requestJson` を直接 | Canvas API | POST | `/api/gardens/{id}/thumbnail` | `hooks/useGardenThumbnail.js` |
| `requestJson` を直接 | Canvas API | POST | `/api/photo-calibration` | `components/PhotoCalibrationEditor.jsx` |
| `requestJson` を直接 | Canvas API | POST | `/api/model-assemblies/resolve` | `pages/PlantPreviewPage.jsx` |
| `authMode` | Canvas API | GET | `/api/auth/status` | `components/AuthGate.jsx`、`authHeaders` |
| `authHeaders` | EC | GET | `/api/auth/csrf` | `requestJson`、`commerce.js` の書き込み。GET・HEAD・OPTIONS と、`authMode` が `demo` のときは取りません。 |
| `login`、`openLoginWindow` | EC | 画面の移動 | `/account/login?returnTo=...` | `handleUnauthorized`、`components/AuthGate.jsx`、`pages/EditorPage.jsx` |
| `commerceApi.cart` | EC | GET | `/api/cart` | `hooks/useCommerce.js` の `useEcCart` |
| `commerceApi.products` | EC | GET | `/api/products` | `hooks/useCommerce.js` |
| `commerceApi.references` | EC | POST | `/api/products/references` | `hooks/useCommerce.js` |
| `commerceApi.quote` | EC | POST | `/api/materials/quote` | frontend/src に呼び出し元はありません。 |
| `commerceApi.savedItems` | EC | GET | `/api/shopping-lists/{gardenId}/saved-items` | `hooks/useCommerce.js` |
| `aiImageApi.status` | Canvas API | GET | `/api/ai/status` | `components/AiImageGeneration.jsx` |
| `aiImageApi.stores` | Canvas API | GET | `/api/ai/stores` | frontend/src に呼び出し元はありません。 |
| `aiImageApi.candidates` | Canvas API | GET | `/api/ai/candidates?assetId=...` | frontend/src に呼び出し元はありません。 |
| `aiImageApi.productReferences` | Canvas API | POST | `/api/ai/product-references` | `components/AiImageGeneration.jsx` |
| `aiImageApi.generate` | Canvas API | POST | `/api/gardens/{id}/ai-image` | `components/AiImageGeneration.jsx` |
| `imageHistoryApi.list` | Canvas API | GET | `/api/gardens/{id}/image-history?limit=20&cursor=...` | `components/GenerationHistory.jsx` |
| `imageHistoryApi.detail` | Canvas API | GET | `/api/gardens/{id}/image-history/{historyId}` | `components/GenerationHistory.jsx` |
| `imageHistoryApi.thumbnailUrl` | Canvas API | （URL を返すだけ。img 要素が GET） | `/api/gardens/{id}/image-history/{historyId}/thumbnail` | `components/HistoryCard.jsx` |
| `imageHistoryApi.save` | Canvas API | POST | `/api/gardens/{id}/image-history` | `components/AiImageGeneration.jsx` |
| `imageHistoryApi.remove` | Canvas API | DELETE | `/api/gardens/{id}/image-history/{historyId}` | `components/GenerationHistory.jsx` |

- `setUnauthorizedHandler` は、401 のときの処理を差し替えます。`pages/EditorPage.jsx` は、未保存の編集があるときは EC のログインへ移らず、編集内容を残して再ログインを案内する処理を登録します（[UC-07 の詳細図 2](<../../シーケンス図/kusakari-canvas/UC-07_庭プロジェクトを保存する.md>)）。
- `onLoginCompleted` と `announceLoginCompleted` は、別のウィンドウでの再ログインの完了を `BroadcastChannel` で知らせます。

## 図 7 サーバーデータとフック（hooks）

TanStack Query で EC の商品などを取るフックと、自動保存・サムネイル・買えなくなった商品の配置を外すフックです。図は、保存にかかわる 2 つ（図 7-1）と、EC の商品にかかわる 2 つ（図 7-2）に分けました。

### 図 7-1 自動保存とサムネイル

```mermaid
classDiagram
    direction LR
    class useGardenAutosave["hooks/useGardenAutosave.js"] {
        <<module>>
        +useGardenAutosave(gardenId, document, dirty, saving, dragging, calibrating, boundaryDraft, error) save・flush
    }
    class useGardenThumbnail["hooks/useGardenThumbnail.js"] {
        <<module>>
        +useGardenThumbnail(garden, ready, photoMode, captureRef) void
    }
    class Query["TanStack Query"] {
        <<library>>
    }
    class editorStore["stores/editorStore.js（図 2）"]
    class gardens["api/gardens.js（図 6）"]
    class http["api/http.js（図 6）"]
    class placementBounds["domain/placementBounds.js（図 3）"]
    class photoProjection["domain/photoProjection.js（図 4）"]
    class calibratedProjection["domain/calibratedProjection.js（図 4）"]
    class capture["capture/（captureImage・thumbnailImage）"]
    useGardenAutosave ..> Query : useQueryClient・<br/>setQueryData・invalidateQueries
    useGardenAutosave ..> editorStore : getState・setSaving・<br/>setSaveError・markSaved
    useGardenAutosave ..> gardens : saveGarden
    useGardenAutosave ..> http : ApiError
    useGardenAutosave ..> placementBounds : outsideObjects
    useGardenAutosave ..> photoProjection : validSurface
    useGardenAutosave ..> calibratedProjection : calibratedBoundaryError
    useGardenThumbnail ..> http : requestJson
    useGardenThumbnail ..> capture : captureImage・thumbnailImage
    note for useGardenAutosave "document が変わって 500 ms たつと save()。要求は同時に 1 件だけ。<br/>変形のドラッグ中、カメラ設定中、輪郭の描画中、施工範囲の外の配置、<br/>成り立たない輪郭、実寸の範囲を越える輪郭のときは送らない（saveBlocker）。<br/>saveError やログインの期限切れがある間は自動では送らない。<br/>flush() は isDirty が消えるまで save() を繰り返す"
    note for useGardenThumbnail "ready になって 600 ms 後に撮影し、<br/>POST /api/gardens/{id}/thumbnail（revision、dataUrl）。<br/>失敗したら 1.5 秒後にやり直し、試すのは 3 回まで"
```

### 図 7-2 EC の商品と、買えなくなった商品の配置

```mermaid
classDiagram
    direction LR
    class useCommerce["hooks/useCommerce.js"] {
        <<module>>
        +useEcCart() UseQueryResult
        +useCommerce(GardenDocument document, assets) cart・products・saved・rows・references・referenceMap
    }
    class useUnavailablePlacements["hooks/useUnavailablePlacements.js"] {
        <<module>>
        +useUnavailablePlacements(string gardenId, GardenDocument document, references) removed・dismiss
    }
    class Query["TanStack Query"] {
        <<library>>
    }
    class editorStore["stores/editorStore.js（図 2）"]
    class commerce["api/commerce.js（図 6）"]
    class productAvailability["domain/productAvailability.js（図 5）"]
    class shopping["domain/shopping.js（図 5）"]
    useCommerce ..> Query : useQuery・keepPreviousData
    useCommerce ..> commerce : commerceApi
    useCommerce ..> productAvailability : uniqueProductIds
    useCommerce ..> shopping : ecUrl・placementRows・withSavedItems
    useUnavailablePlacements ..> productAvailability : placedProductIds・removedPlacements
    useUnavailablePlacements ..> editorStore : removeObjects
    note for useUnavailablePlacements "庭を開いたときに 1 回だけ調べる。<br/>照会に失敗したら配置を外さない。<br/>references は useCommerce が返す照会の結果"
```

- `useGardenAutosave` の保存が成功すると、`markSaved(saved, submitted)` で状態を確定し、`['garden', gardenId]` のキャッシュを応答で置き換え、`['gardens']` を古い印にします。失敗の文言は、401・`OBJECT_POSITION_OUT_OF_BOUNDS`・409・ほかの 4xx・通信の失敗で分けて `setSaveError` に入れます。
- `useCommerce` の `rows` は、`placementRows`（今の配置）に `withSavedItems`（EC で買い物リストに入れた商品）を足した買い物リストの行です。`referenceMap` は、商品 ID から EC の照会の結果を引く Map です。
- `useUnavailablePlacements` は、照会の結果がそろってから `removedPlacements` で外す配置を決め、`removeObjects` を呼びます。保存は自動保存に任せます。`removed` は知らせる商品名の配列、`dismiss()` は知らせを閉じます。

TanStack Query のキーは次のとおりです。`main.jsx` の `QueryClient` の既定は、取得が `retry: 1`・`refetchOnWindowFocus: false`、更新が `retry: false` です。

| queryKey | 取得する関数 | 使うところ | 設定と更新 |
| --- | --- | --- | --- |
| `['garden', gardenId]` | `gardenApi.getGarden` | `pages/EditorPage.jsx` | `staleTime: Infinity`。保存が成功すると `useGardenAutosave` が `setQueryData` で置き換えます。 |
| `['assets']` | `gardenApi.listAssets` | `pages/EditorPage.jsx` | `staleTime: Infinity` |
| `['gardens']` | `gardenApi.listGardens` | `pages/GardenListPage.jsx` | 作成・複製・削除と、保存の成功で `invalidateQueries` します。 |
| `['ec-cart', ecUrl]` | `commerceApi.cart` | `hooks/useCommerce.js` の `useEcCart`（`components/SiteHeader.jsx` も使います） | `retry: false`、`staleTime` 10 秒、`refetchOnWindowFocus: true` |
| `['ec-products', ecUrl]` | `commerceApi.products` | `hooks/useCommerce.js` | 同上 |
| `['ec-saved-items', ecUrl, document.id]` | `commerceApi.savedItems` | `hooks/useCommerce.js` | 同上。document の id があるときだけ取ります。 |
| `['ec-product-references', ecUrl, ids]` | `commerceApi.references` | `hooks/useCommerce.js` | 同上。ids は行の商品 ID を重ねずに並べ、コンマでつないだ文字列です。ids があるときだけ取り、`placeholderData: keepPreviousData` です。 |
| `['ai-status']`、`['ai-product-references', productIds]`、`['garden-image-history', gardenId]` など | `api/aiImages.js`、`api/imageHistory.js` | `components/AiImageGeneration.jsx`、`components/GenerationHistory.jsx` | [02_画像生成と履歴](<02_画像生成と履歴.md>) を見てください。 |

## 図に載せなかったクラス

- `types/garden.js`: 中身は `export {}` だけの空のモジュールです。型は `garden.d.ts` にあります。
- export していない関数と定数: `hooks/useGardenAutosave.js` の `saveBlocker`（図 7-1 の note に条件を書きました）、`hooks/useCommerce.js` の `cartKey`、`api/commerce.js` の `request`、`api/auth.js` の `loginUrl`、`api/imageHistory.js` の `historyPath`、`domain/aiReferencePhoto.js` の `matchesFormat`、`domain/photoProjection.js` の `orientation`・`onSegment`・`segmentsCross`、`domain/gardenEditing.js` の `cloneTransform`、`domain/edgeCalibration.js` のカメラを求める関数（`cameraAxes`、`evaluate`、`refine`、`fitCamera`、`cameraParams` など）、`domain/productModels.js` の `legacyModels`・`catalogForRule`。モジュールの外から使えないためです。
- `components/` と `pages/` の React のコンポーネント: 画面の部品で、データの型も保存する状態も持たないためです。どの部品がどのアクションを呼ぶかは図 2 の表に、TanStack Query を直接使う画面は図 7 の表に書きました。
- `three/` の描画の部品: GardenDocument と editorStore を読んで描くだけで、保存するデータを持たないためです。AGENTS.md で、Three.js の Scene・Object3D・Mesh を業務データにしない決まりです。座標にかかわる `createPhotoCamera` だけ、座標の節に書きました。
- `capture/`（`captureImage`、`thumbnailImage`）: このファイルの対象のフォルダーの外です。図 7 では、依存先として名前だけ載せました。
- EC の API の応答（カート、商品、商品の照会、保存した商品）: frontend に型の宣言が無く、形は EC の DTO で決まるためです。図 6 では `any` と書きました。
