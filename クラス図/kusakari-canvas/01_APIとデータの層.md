# Kusakari Canvas クラス図 01 API とデータの層

- 対象のコード: kusakari-canvas の main（c19d497、2026-11-20 時点）
- 対象のパッケージ: [backend/kusakari_canvas_api](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api) のうち、[02_画像生成と履歴](<02_画像生成と履歴.md>)（`ai_*.py`、`history_*.py`）と [03_植物モデル](<03_植物モデル.md>)（`plants/`、`plant_legacy/`、`plant_schemas.py`）に入らないモジュールです。
- モジュール全体の一覧と依存は [00_モジュール構成](<00_モジュール構成.md>) にあります。責務とデータ境界は [AGENTS.md](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/AGENTS.md) に書かれています。

## 対象のモジュール

| モジュール | 役割 | 載せた図 |
|---|---|---|
| [main.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/main.py) | FastAPI のアプリを組み立てる。ルーター、例外ハンドラー、ミドルウェア、ヘルスチェック | 図 1、図 2 |
| [auth.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/auth.py) | EC のセッションでログインを確かめ、所有者 ID を決める | 図 1 |
| [config.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/config.py) | 環境変数と `.env` から設定を読む | 図 1、図 9 |
| [database.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/database.py) | SQLAlchemy の Engine を作る | 図 1、図 9 |
| [errors.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/errors.py) | API のエラー（`ApiError`）と、それを投げる関数 | 図 1、図 5 |
| [media.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/media.py) | 画像の保存先（MySQL か S3）を切り替える | 図 1、図 3、図 7 |
| [schemas.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/schemas.py) | Pydantic の Request・Response DTO | 図 4、図 5 |
| [service.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/service.py) | 庭の Service。DTO と Entity を詰め替える | 図 3 |
| [validation.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/validation.py) | 保存する庭（GardenDocument）のドメイン検証 | 図 5 |
| [calibration.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/calibration.py) | 写真のカメラ校正の計算と検証 | 図 5 |
| [placement_bounds.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/placement_bounds.py) | 施工範囲を地面の座標（m）に直し、配置基準点が中にあるかを調べる | 図 5 |
| [models.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/models.py) | SQLAlchemy の Entity | 図 6 |
| [thumbnails.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/thumbnails.py) | 庭のサムネイルの読み書きと、そのルーター | 図 7 |
| [shopping.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/shopping.py) | 保存済みの配置から買い物リストを作る | 図 8 |
| [`__main__.py`](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/__main__.py) | `python -m kusakari_canvas_api serve` と `migrate` の入口 | 図 9 |
| [migrations.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/migrations.py) | スキーマの照合、バックアップ、Alembic の実行 | 図 1、図 9 |
| [setup_database.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/setup_database.py) | ローカルの MySQL のアカウント・設定・スキーマを用意する（setup.bat から） | 図 9 |
| [setup_files.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/setup_files.py) | 接続設定ファイルの書き込みと、Windows による秘密の保護 | 図 9 |
| [reset_database.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/reset_database.py) | 開発用と E2E 用の DB を作り直す（DB-reset.bat から） | 図 9 |
| [local_mysql.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/local_mysql.py) | Canvas 専用のローカル MySQL を起動・管理する（Windows） | 図 9 |
| [startup_errors.py](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/startup_errors.py) | DB のエラーを、秘密を含まない文に直す | 図 9 |
| [`__init__.py`](https://github.com/abeouga/kusakari-canvas/blob/c19d497dfef15b119f9bce8ecb5c886a36da6b7d/backend/kusakari_canvas_api/__init__.py) | パッケージの説明文だけ | 載せていない |

## 読み方の要点

### DTO・Service・Entity の分け方

AGENTS.md の「Pydantic Request/Response DTO、ドメイン検証、SQLAlchemy Entity を分けます。Entity を API へ直接返しません」は、次の形になっています。

- 受け口は `main.py` の `create_app` の中の `router`（APIRouter）と、`thumbnails.py` の `thumbnail_router` が作る APIRouter です。引数で Pydantic の Request DTO を受け、`response_model` の Response DTO を返します。
- Request DTO と Response DTO は別のクラスです。庭の保存は `GardenDocumentRequest`（`NamedRequest` を継承し、値の範囲の制約を持つ）、応答は `GardenDocument`（制約を持たない）です。作成は `CreateGardenRequest`、一覧は `GardenSummary` です。DTO は `ApiModel`（`extra="forbid"`、`allow_inf_nan=False`）を継承します。ただし `shopping.py` の 3 つの DTO は `BaseModel` を直接継承し、`thumbnails.py` の `ThumbnailRequest` は `schemas.py` の外にあります。
- Service は `service.py`、`shopping.py`、`thumbnails.py` の `read_thumbnail` と、02 の `history_service.py` です。どれも `Session` を引数で受け、`with session.begin()` でトランザクションを区切ります。`service.py` は、Entity を `as_document` と `object_response` で DTO に詰め替えてから返します。
- Repository のクラスはありません。Service が `select`、`session.add`、`delete` を直接書きます。AGENTS.md の「Repository/MySQL」にあたるのは `models.py` の Entity と SQLAlchemy の `Session` です。
- ドメイン検証は `validation.py` の `validate_document` です。`update_garden` の最初に呼びます（02 の `ai_service.py` と `history_service.py` も、送られた庭のスナップショットに使います）。中で `calibration.py`、`placement_bounds.py`、03 の `plant_schemas.resolve_saved` を使います。
- 所有者は `AuthBoundary.owner` が返す `request.state.owner_id` です。ルーターは `Owner`（`Depends(auth.owner)`）として受け取り、Service は `owned_garden` で `owner_id` を条件に読みます。DTO に `ownerId` はありません。

### Entity とテーブル

| Entity（models.py） | テーブル | 主な使い手 |
|---|---|---|
| `Asset` | `assets` | `service.list_assets`、`service.update_garden`（assetId の照合）、`shopping.detail` |
| `Garden` | `gardens` | `service.py` の全関数、`shopping.summaries` |
| `PlacedObject` | `placed_objects` | `service.py`、`shopping.py`、`thumbnails.placement_plan` |
| `GardenThumbnail` | `garden_thumbnails` | `thumbnails.py`、`service.duplicate_garden`、`shopping.summaries` |
| `HistoryEntity`（02 の `history_models.py`） | `garden_image_history` | 02 の `history_service.py`、`thumbnails.read_thumbnail`、`shopping.summaries` |

列の MySQL の型と制約は [テーブル設計図](<../../テーブル設計図/kusakari-canvas/>) を見てください。

### API と受け口

`router` のパスの前には `Settings.api_prefix`（空か `/canvas`）が付きます。`/health/live` と `/health/ready` は `app` に直接あり、前に何も付きません。

| HTTP | パス | 受け口 | Request DTO | Response DTO | 呼ぶ Service など |
|---|---|---|---|---|---|
| GET | `/health/live` | `live` | なし | dict | なし |
| GET | `/health/ready` | `ready` | なし | dict、失敗は 503 `NOT_READY` | `engine.connect` |
| GET | `/api/auth/status` | `auth_status` | なし | dict（`mode`） | `AuthBoundary.mode` |
| GET | `/api/ai/status` | `ai_status` | なし | `AiStatus` | 02 |
| GET | `/api/ai/stores` | `ai_stores` | なし | `list[AiStore]` | 02 `ai_catalog.stores` |
| GET | `/api/ai/candidates` | `ai_candidates` | クエリ `assetId` | `list[AiCandidate]` | `service.require_asset`、02 `ai_catalog` |
| POST | `/api/gardens/{id}/ai-image` | `ai_image` | `AiImageRequest` | `AiImageResponse` | 02 `ai_service.generate_image` |
| POST | `/api/ai/product-references` | `automatic_references` | `ProductReferencesRequest` | `list[AiCandidate]` | 02 `ai_catalog.product_references` |
| POST | `/api/photo-calibration` | `calibrate` | `CalibrationRequest` | `PhotoCalibration` | `calibration.solve_calibration` |
| GET | `/api/assets` | `assets` | なし | `list[AssetResponse]` | `service.list_assets` |
| GET | `/api/model-parts` | `model_parts` | なし | dict（`response_model` なし） | 03 `plants.part_catalog` |
| POST | `/api/model-assemblies/resolve` | `resolve_model` | `PlantProfile` | `PlantComposition` | 03 `plants.assemble` |
| GET | `/api/shopping-lists` | `shopping_lists` | なし | `list[ShoppingSummary]` | `shopping.summaries` |
| GET | `/api/gardens/{id}/shopping-list` | `shopping_list` | なし | `ShoppingList` | `shopping.detail` |
| GET | `/api/gardens` | `gardens` | なし | `list[GardenSummary]` | `service.list_gardens` |
| POST | `/api/gardens` | `create` | `CreateGardenRequest` | `GardenDocument`（201） | `service.create_garden` |
| POST | `/api/gardens/{id}/duplicate` | `duplicate` | なし | `GardenSummary`（201） | `service.duplicate_garden` |
| GET | `/api/gardens/{id}` | `get` | なし | `GardenDocument` | `service.get_garden` |
| PUT | `/api/gardens/{id}` | `update` | `GardenDocumentRequest` | `GardenDocument` | `service.update_garden` |
| DELETE | `/api/gardens/{id}` | `delete` | なし | なし（204） | `service.delete_garden` |
| GET | `/api/gardens/{id}/thumbnail` | `thumbnail_router` の `get` | なし | PNG | `thumbnails.read_thumbnail` |
| POST | `/api/gardens/{id}/thumbnail` | `thumbnail_router` の `save` | `ThumbnailRequest` | なし（204） | `MediaStore.put` |
| GET・POST・DELETE | `/api/gardens/{id}/image-history` 以下 | 02 の `history_router` | 02 | 02 | 02 |

`/api/shopping-lists` と `/api/gardens/{id}/shopping-list` は、Canvas の画面ではなく EC のサーバー（`CanvasShoppingClient`）が呼びます。`/api/model-assemblies/resolve` は、Canvas の `PlantPreviewPage.jsx` と EC のサーバー（`CanvasModelClient`）が呼びます。

処理の流れは [シーケンス図](<../../シーケンス図/kusakari-canvas/>) にあります。とくに、庭の作成は [UC-01](<../../シーケンス図/kusakari-canvas/UC-01_庭プロジェクトを新規作成する.md>)、読み込みは [UC-01-1](<../../シーケンス図/kusakari-canvas/UC-01-1_庭プロジェクトを開く.md>)、保存とサムネイルは [UC-07](<../../シーケンス図/kusakari-canvas/UC-07_庭プロジェクトを保存する.md>)、複製と削除は [UC-08](<../../シーケンス図/kusakari-canvas/UC-08_庭プロジェクトを管理する.md>)、カメラ校正は [UC-04](<../../シーケンス図/kusakari-canvas/UC-04_施工範囲の実寸を定義する.md>)、ログインの確認は [全ユースケース共通の代替フロー](<../../シーケンス図/kusakari-canvas/00_全ユースケース共通の代替フロー.md>)、買い物リストを EC から読む流れは [EC-B24](<../../シーケンス図/kusakari-ec/EC-B24_買い物リストを確認する(EC).md>) です。

## 図 1 アプリの組み立てと横断の部品

`create_app` が、設定・Engine・`MediaStore`・`AuthBoundary` を 1 つずつ作り、`app` と `router` に渡します。`app` の要素（ヘルスチェック、ミドルウェア、例外ハンドラー、lifespan）は `create_app` の中の関数です。

```mermaid
classDiagram
    class main_py["main.py"] {
        <<module>>
        +error_response(status: int, code: str, message: str) JSONResponse
        +create_app(settings: Settings | None) FastAPI
    }
    class app["app: FastAPI"] {
        <<FastAPI>>
        +lifespan(_app: FastAPI)
        +live() dict
        +ready() dict | JSONResponse
        +backend_identity(request, call_next) Response
        +domain_error(_request, error: ApiError) JSONResponse
        +invalid_request(_request, _error) JSONResponse
        +http_error(_request, error: HTTPException) JSONResponse
        +storage_conflict(_request, _error) JSONResponse
        +unexpected_error(_request, error) JSONResponse
    }
    note for app "live: GET /health/live<br/>ready: GET /health/ready（失敗は 503 NOT_READY）<br/>backend_identity: http ミドルウェア。接続元の確認、認証、500 INTERNAL_ERROR<br/>domain_error: ApiError を status と code で返す<br/>invalid_request: RequestValidationError を 400 INVALID_REQUEST<br/>http_error: HTTPException を 405 METHOD_NOT_ALLOWED か 404 NOT_FOUND<br/>storage_conflict: IntegrityError を 409 STORAGE_CONFLICT<br/>unexpected_error: Exception を 500 INTERNAL_ERROR<br/>lifespan: 起動時にスキーマが HEAD か確かめる"
    class router["router: APIRouter"] {
        <<APIRouter>>
    }
    note for router "受け口の一覧は図 2"
    class AuthBoundary {
        +settings: Settings
        +mode: str
        +origin: str
        +client: AsyncClient
        +close() None
        +error(status, code, message)$ JSONResponse
        +authenticate(request: Request) JSONResponse | None
        +owner(request: Request) str
    }
    note for AuthBoundary "mode は demo か cognito。demo は profile が e2e で KUSAKARI_TEST_AUTH が true のときだけ<br/>authenticate は EC の GET /api/auth/me（読む操作）か POST /api/auth/verify（書く操作）を呼ぶ<br/>購入者 USER, ADMIN は全 API。出店者 SHOP_OWNER, SHOP_STAFF, SHOP_OWNER_APPLICANT は<br/>POST /api/model-assemblies/resolve だけ（ほかは 403 BUYER_ACCOUNT_REQUIRED）<br/>GET の /health/ 以下、/api/assets、/api/model-parts、/api/auth/status はログインを確かめない"
    class Settings {
        <<dataclass>>
        +profile: str
        +host: str
        +port: int
        +database_url: URL
        +backup_dir: Path
        +api_prefix: str = ""
        +db_ca: str | None = None
        +pool_size: int = 5
        +preview_owner: str
        +public_origin: str | None = None
        +owner_id: str
        +from_env()$ Settings
    }
    class config_py["config.py"] {
        <<module>>
        +BACKEND_ROOT: Path
        +REPO_ROOT: Path
        +canvas_data_home() Path
        +load_local_settings(profile: str) None
    }
    class database_py["database.py"] {
        <<module>>
        +create_database_engine(settings: Settings) Engine
    }
    class MediaStore {
        +external: bool
        +client
        +bucket: str
        +prefix: str
        +put(content: bytes, mime: str) tuple~bytes | None, str | None~
        +get(content: bytes | None, key: str | None) bytes
        +store_photo(photo: dict | None) dict | None
        +load_photo(photo: dict | None) dict | None
        +store_document(value: str) str
        +load_document(value: str) dict
        +close() None
    }
    note for MediaStore "KUSAKARI_CANVAS_MEDIA_STORAGE が database（既定）なら MySQL に、s3 なら S3 に置く<br/>s3 のときの写真は photo_json の dataUrl の代わりに imageKey と imageMime を持つ"
    class Exception
    class ApiError {
        <<exception>>
        +status: int
        +code: str
        +message: str
    }
    class errors_py["errors.py"] {
        <<module>>
        +bad_request(code: str, message: str) None
        +not_found() ApiError
    }
    class migrations_py["migrations.py"] {
        <<module>>
        +HEAD: str
        +validate_schema(connection: Connection, revision: str) None
        +current_revision(connection: Connection) str | None
    }
    class AiBodyLimitMiddleware["AiBodyLimitMiddleware（02）"] {
        <<middleware>>
    }
    note for AiBodyLimitMiddleware "ai_body.py のクラス。POST の ai-image、image-history、thumbnail の本文の大きさを制限する"

    main_py ..> app : create_app で作る
    main_py ..> Settings : from_env
    main_py ..> database_py : create_database_engine
    main_py ..> MediaStore : 作る
    main_py ..> AuthBoundary : 作る
    app --> router : include_router
    app ..> AiBodyLimitMiddleware : add_middleware
    app ..> AuthBoundary : authenticate
    app ..> migrations_py : lifespan
    app ..> ApiError : domain_error
    router ..> AuthBoundary : Owner は auth.owner
    AuthBoundary --> Settings : settings
    Settings ..> config_py : load_local_settings, canvas_data_home
    database_py ..> Settings
    Exception <|-- ApiError
    errors_py ..> ApiError : 投げる・返す
    MediaStore ..> ApiError : MEDIA_UNAVAILABLE, MEDIA_MISSING
```

## 図 2 受け口（ルーター）と呼び先

`router` の関数の引数の `Db` は `get_session`（`create_app` の中の関数）が渡す `Session`、`Owner` は `AuthBoundary.owner` が返す所有者 ID（str）です。HTTP メソッドとパスは note にあります。

```mermaid
classDiagram
    direction LR
    class router["router: APIRouter"] {
        <<APIRouter>>
        +auth_status() dict
        +ai_status() AiStatus
        +ai_stores() list~AiStore~
        +ai_candidates(db: Db, assetId: str) list~AiCandidate~
        +ai_image(id: str, request: AiImageRequest, db: Db, owner: Owner) AiImageResponse
        +automatic_references(request: ProductReferencesRequest) list~AiCandidate~
        +calibrate(request: CalibrationRequest) PhotoCalibration
        +assets(db: Db) list~AssetResponse~
        +model_parts() dict
        +resolve_model(profile: PlantProfile) PlantComposition
        +shopping_lists(db: Db, owner: Owner) list~ShoppingSummary~
        +shopping_list(id: str, db: Db, owner: Owner) ShoppingList
        +gardens(db: Db, owner: Owner) list~GardenSummary~
        +create(request: CreateGardenRequest, response: Response, db: Db, owner: Owner) GardenDocument
        +duplicate(id: str, response: Response, db: Db, owner: Owner) GardenSummary
        +get(id: str, db: Db, owner: Owner) GardenDocument
        +update(id: str, request: GardenDocumentRequest, db: Db, owner: Owner) GardenDocument
        +delete(id: str, db: Db, owner: Owner) Response
    }
    note for router "auth_status: GET /api/auth/status<br/>ai_status: GET /api/ai/status<br/>ai_stores: GET /api/ai/stores<br/>ai_candidates: GET /api/ai/candidates<br/>ai_image: POST /api/gardens/{id}/ai-image<br/>automatic_references: POST /api/ai/product-references<br/>calibrate: POST /api/photo-calibration<br/>assets: GET /api/assets<br/>model_parts: GET /api/model-parts<br/>resolve_model: POST /api/model-assemblies/resolve<br/>shopping_lists: GET /api/shopping-lists<br/>shopping_list: GET /api/gardens/{id}/shopping-list<br/>gardens: GET /api/gardens<br/>create: POST /api/gardens（201、Location ヘッダー）<br/>duplicate: POST /api/gardens/{id}/duplicate（201、Location ヘッダー）<br/>get: GET /api/gardens/{id}<br/>update: PUT /api/gardens/{id}<br/>delete: DELETE /api/gardens/{id}（204）"
    class AuthBoundary {
        +owner(request: Request) str
    }
    class service_py["service.py"] {
        <<Service>>
    }
    class shopping_py["shopping.py"] {
        <<Service>>
    }
    class calibration_py["calibration.py"] {
        <<module>>
    }
    class thumbnails_py["thumbnails.py"] {
        <<module>>
        +thumbnail_router(get_owner, get_session, media: MediaStore | None) APIRouter
    }
    class history_routes_py["history_routes.py（02）"] {
        <<module>>
        +history_router(get_owner, get_session, media) APIRouter
    }
    class ai_service_py["ai_service.py（02）"] {
        <<module>>
    }
    class ai_catalog_py["ai_catalog.py（02）"] {
        <<module>>
    }
    class plants_pkg["plants（03）"] {
        <<package>>
    }

    router ..> AuthBoundary : Owner
    router ..> thumbnails_py : include_router
    router ..> history_routes_py : include_router
    router ..> service_py : 庭と assets
    router ..> shopping_py : summaries, detail
    router ..> calibration_py : solve_calibration
    router ..> plants_pkg : assemble, part_catalog
    router ..> ai_service_py : generate_image
    router ..> ai_catalog_py : stores, candidates, material_code, product_references
```

## 図 3 Service と DTO・Entity の詰め替え（service.py）

`service.py` は Request DTO を受け、Entity を読み書きし、Response DTO を返します。庭の保存（`update_garden`）は、`validate_document` のあと、`with_for_update` で庭の行を固定して `revision` を比べ、一致したら `revision` を 1 増やします。配置は庭の全件を消してから入れ直します（全体スナップショット）。

```mermaid
classDiagram
    direction LR
    class service_py["service.py"] {
        <<Service>>
        +DUPLICATE_SUFFIX: str
        +DUPLICATE_NAME_UNITS: int
        +COPIED_OBJECT_COLUMNS: tuple
        +owned_garden(session: Session, owner: str, id: str, lock: bool = False) Garden
        +as_document(garden: Garden, objects: list~GardenObject~, media: MediaStore | None) GardenDocument
        +object_response(obj: PlacedObject) GardenObject
        +list_assets(session: Session) list~AssetResponse~
        +require_asset(session: Session, asset_id: str) None
        +list_gardens(session: Session, owner: str) list~GardenSummary~
        +create_garden(session: Session, owner: str, request: CreateGardenRequest) GardenDocument
        +get_garden(session: Session, owner: str, id: str, media: MediaStore | None) GardenDocument
        +update_garden(session: Session, owner: str, id: str, document: GardenDocumentRequest, media: MediaStore | None) GardenDocument
        +delete_garden(session: Session, owner: str, id: str) None
        +duplicate_name(name: str) str
        +duplicate_garden(session: Session, owner: str, id: str) GardenSummary
    }
    note for service_py "409 REVISION_CONFLICT: revision が一致しない<br/>409 REVISION_EXHAUSTED: revision が上限<br/>400 GARDEN_ID_MISMATCH: URL と本文の id が違う<br/>400 UNKNOWN_ASSET: assets に無い assetId<br/>404 GARDEN_NOT_FOUND: owned_garden が見つけられない"
    class CreateGardenRequest {
        <<DTO>>
    }
    class GardenDocumentRequest {
        <<DTO>>
    }
    class GardenDocument {
        <<DTO>>
    }
    class GardenSummary {
        <<DTO>>
    }
    class GardenObject {
        <<DTO>>
    }
    class AssetResponse {
        <<DTO>>
    }
    class Garden {
        <<Entity>>
    }
    class PlacedObject {
        <<Entity>>
    }
    class Asset {
        <<Entity>>
    }
    class GardenThumbnail {
        <<Entity>>
    }
    class validation_py["validation.py"] {
        <<module>>
        +validate_document(document: GardenDocumentRequest) None
    }
    class MediaStore {
        +store_photo(photo: dict | None) dict | None
        +load_photo(photo: dict | None) dict | None
    }
    class plant_schemas_py["plant_schemas.py（03）"] {
        <<module>>
        +composition_adapter: TypeAdapter
    }

    service_py ..> CreateGardenRequest : create_garden
    service_py ..> GardenDocumentRequest : update_garden
    service_py ..> GardenDocument : 返す
    service_py ..> GardenSummary : 返す
    service_py ..> GardenObject : object_response
    service_py ..> AssetResponse : list_assets
    service_py ..> Garden : 読む・書く
    service_py ..> PlacedObject : 読む・消す・入れ直す
    service_py ..> Asset : 読む
    service_py ..> GardenThumbnail : duplicate_garden で写す
    service_py ..> validation_py : validate_document
    service_py ..> MediaStore : store_photo, load_photo
    service_py ..> plant_schemas_py : model_composition_json を読む
```

## 図 4 DTO 庭と配置（schemas.py）

`GardenDocumentRequest` が `PUT /api/gardens/{id}` の本文、`GardenDocument` がその応答と `GET /api/gardens/{id}` の応答です。座標の決まり（1 unit = 1 m、Y が上、地面 Y=0、庭の中心が原点、回転は Y 軸、拡縮は一様）は `GardenObject` の `position`・`rotation`・`scale` に当てはまり、`validation.py` が確かめます。画面側の同じ型は [04_GardenDocumentと画面の状態](<04_GardenDocumentと画面の状態.md>) にあります。

```mermaid
classDiagram
    class BaseModel {
        <<pydantic>>
    }
    class ApiModel {
        <<DTO>>
        +model_config: extra forbid, allow_inf_nan False
    }
    class NamedRequest {
        <<DTO>>
        +name: str 空白だけは不可、UTF-16 で 120 単位まで
        +width: float 1〜50
        +depth: float 1〜50
        +valid_name(value: str)$ str
    }
    class CreateGardenRequest {
        <<DTO>>
        +width: float = 10
        +depth: float = 8
    }
    class GardenDocumentRequest {
        <<DTO>>
        +schemaVersion: int 1 だけ
        +id: str
        +revision: int 0 以上
        +objects: list~GardenObject~ 200 個まで
        +photo: GardenPhoto | None
        +shoppingTargets: ShoppingTargets 200 個まで
        +unique_targets(value: list~ShoppingTarget~)$ list~ShoppingTarget~
    }
    class GardenDocument {
        <<DTO>>
        +schemaVersion: int = 1
        +id: str
        +revision: int
        +name: str
        +width: float
        +depth: float
        +objects: list~GardenObject~
        +photo: GardenPhoto | None
        +shoppingTargets: list~ShoppingTarget~
    }
    class GardenSummary {
        <<DTO>>
        +id: str
        +name: str
        +width: float
        +depth: float
        +revision: int
        +updatedAt: datetime
        +objectCount: int
    }
    class GardenObject {
        <<DTO>>
        +id: str
        +assetId: str
        +position: Vector
        +rotation: Vector
        +scale: Vector
        +productId: str | None 40 文字まで
        +productName: str | None 1〜120 文字
        +materialCode: str | None 80 文字まで
        +modelComposition: PlantComposition | None
        +nonblank(value: str)$ str
    }
    class Vector {
        <<DTO>>
        +x: float
        +y: float
        +z: float
    }
    class ShoppingTarget {
        <<DTO>>
        +key: str product: か asset: で始まる、80 文字まで
        +quantity: int 1〜999
    }
    class AssetResponse {
        <<DTO>>
        +id: str
        +name: str
        +category: str
        +modelUrl: str
        +baseDimensions: BaseDimensions
    }
    class BaseDimensions {
        <<DTO>>
        +width: float
        +height: float
        +depth: float
    }
    class GardenPhoto {
        <<DTO>>
    }
    class PlantComposition {
        <<union>>
    }
    note for GardenPhoto "フィールドは図 5"
    note for PlantComposition "plant_schemas.py の型。v5 の plants.PlantComposition か、v1〜v4 の plant_legacy の型。03 に載せる"

    BaseModel <|-- ApiModel
    ApiModel <|-- NamedRequest
    NamedRequest <|-- CreateGardenRequest
    NamedRequest <|-- GardenDocumentRequest
    ApiModel <|-- GardenDocument
    ApiModel <|-- GardenSummary
    ApiModel <|-- GardenObject
    ApiModel <|-- Vector
    ApiModel <|-- ShoppingTarget
    ApiModel <|-- AssetResponse
    ApiModel <|-- BaseDimensions
    GardenDocumentRequest --> "0..200" GardenObject : objects
    GardenDocumentRequest --> "0..1" GardenPhoto : photo
    GardenDocumentRequest --> "0..200" ShoppingTarget : shoppingTargets
    GardenDocument --> "0..*" GardenObject : objects
    GardenDocument --> "0..1" GardenPhoto : photo
    GardenDocument --> "0..*" ShoppingTarget : shoppingTargets
    GardenObject --> "3" Vector : position, rotation, scale
    GardenObject --> "0..1" PlantComposition : modelComposition
    AssetResponse --> "1" BaseDimensions : baseDimensions
```

## 図 5 写真とカメラ校正の DTO と、ドメイン検証

`validate_document` が、写真（`validate_photo`、`validate_calibrated_photo`、`validate_projection_frame`）、配置の ID・座標・回転・倍率、植物の構成を確かめます。method が rectangle のカメラ校正は、保存のたびに `solve_calibration` で計算し直して置き換えます。クライアントが送ったカメラの行列をそのまま使いません。

```mermaid
classDiagram
    class ApiModel {
        <<DTO>>
    }
    class GardenDocumentRequest {
        <<DTO>>
        +photo: GardenPhoto | None
    }
    class GardenPhoto {
        <<DTO>>
        +dataUrl: str
        +imageWidth: int
        +imageHeight: int
        +corners: list~ImagePoint~
        +boundary: list~ImagePoint~
        +calibration: PhotoCalibration | None
        +edgeLengths: list~float | None~ | None 3〜64 個、各 0.01〜100
        +projectionSize: PhotoProjectionSize | None
    }
    class ImagePoint {
        <<DTO>>
        +x: float
        +y: float
    }
    class PhotoCalibration {
        <<DTO>>
        +version: Literal 1
        +method: Literal rectangle, edges = rectangle
        +points: list~ImagePoint~ | None 4 個
        +referenceWidth: float | None 0.1〜50
        +referenceDepth: float | None 0.1〜50
        +focalLengthPx: float 0 より大きく 100000 まで
        +focalSource: Literal estimated, manual
        +rotation: list~float~ 9 個
        +translation: list~float~ 3 個
        +reprojectionErrorPx: float 0 以上
        +single_reference() PhotoCalibration
    }
    class PhotoProjectionSize {
        <<DTO>>
        +width: float 1〜50
        +depth: float 1〜50
    }
    class CalibrationRequest {
        <<DTO>>
        +imageWidth: int 1〜6000
        +imageHeight: int 1〜6000
        +points: list~ImagePoint~ 4 個
        +referenceWidth: float 0.1〜50
        +referenceDepth: float 0.1〜50
        +focalLengthPx: float | None 0 より大きく 100000 まで
    }
    class validation_py["validation.py"] {
        <<module>>
        +validate_document(document: GardenDocumentRequest) None
        +validate_projection_frame(photo: GardenPhoto, width: float, depth: float) None
        +orientation(a: ImagePoint, b: ImagePoint, c: ImagePoint) float
        +on_segment(a: ImagePoint, b: ImagePoint, point: ImagePoint) bool
        +segments_cross(a: ImagePoint, b: ImagePoint, c: ImagePoint, d: ImagePoint) bool
        +image_point_valid(p: ImagePoint) bool
        +validate_photo(photo: GardenPhoto) None
    }
    class calibration_py["calibration.py"] {
        <<module>>
        +reject(message: str)
        +solve_calibration(request: CalibrationRequest) PhotoCalibration
        +ground_points(photo: GardenPhoto, rotation: ndarray, translation: ndarray, focal: float) list~ndarray~
        +verify_edge_calibration(photo: GardenPhoto, calibration: PhotoCalibration) None
        +validate_calibrated_photo(photo: GardenPhoto, width: float, depth: float) None
    }
    class placement_bounds_py["placement_bounds.py"] {
        <<module>>
        +EPSILON: float = 1e-6
        +ground_outline(document: GardenDocumentRequest) list~tuple float, float~
        +contains_anchor(outline: list~tuple float, float~, x: float, z: float) bool
    }
    class plant_schemas_py["plant_schemas.py（03）"] {
        <<module>>
        +resolve_saved(composition) PlantComposition
    }
    class errors_py["errors.py"] {
        <<module>>
        +bad_request(code: str, message: str) None
    }
    note for validation_py "400 のコード: INVALID_PHOTO, INVALID_PHOTO_CORNERS, INVALID_PHOTO_BOUNDARY,<br/>INVALID_PLANT_MODEL, INVALID_OBJECT_ID, DUPLICATE_OBJECT_ID, NON_FINITE_NUMBER,<br/>OBJECT_POSITION_OUT_OF_BOUNDS, INVALID_OBJECT_ROTATION, INVALID_OBJECT_SCALE"

    ApiModel <|-- GardenPhoto
    ApiModel <|-- ImagePoint
    ApiModel <|-- PhotoCalibration
    ApiModel <|-- PhotoProjectionSize
    ApiModel <|-- CalibrationRequest
    GardenDocumentRequest --> "0..1" GardenPhoto : photo
    GardenPhoto --> "4" ImagePoint : corners（validate_photo で 4 個）
    GardenPhoto --> "3..64" ImagePoint : boundary（validate_photo で 3〜64 個）
    GardenPhoto --> "0..1" PhotoCalibration : calibration
    GardenPhoto --> "0..1" PhotoProjectionSize : projectionSize
    PhotoCalibration --> "0..4" ImagePoint : points（rectangle のとき 4 個）
    CalibrationRequest --> "4" ImagePoint : points
    validation_py ..> GardenDocumentRequest : 検証する
    validation_py ..> calibration_py : validate_calibrated_photo
    validation_py ..> placement_bounds_py : ground_outline, contains_anchor
    validation_py ..> plant_schemas_py : resolve_saved
    validation_py ..> errors_py : bad_request
    calibration_py ..> CalibrationRequest : solve_calibration
    calibration_py ..> PhotoCalibration : 作る・置き換える
    calibration_py ..> errors_py : INVALID_CALIBRATION
    placement_bounds_py ..> GardenDocumentRequest : photo, width, depth
    placement_bounds_py ..> errors_py : INVALID_PHOTO_BOUNDARY
```

## 図 6 Entity（models.py）

`models.py` には `relationship()` がありません。Entity どうしの関連は `ForeignKey` の列だけで、多重度はその列の NULL 可否と主キーから書いています。フィールドの型は `Mapped[...]` の Python の型です。`GardenThumbnail.image_png` は `deferred=True` で、必要なときだけ読みます。

```mermaid
classDiagram
    class DeclarativeBase {
        <<SQLAlchemy>>
    }
    class Base
    class Asset {
        <<Entity>>
        +id: str PK
        +name: str
        +category: str
        +model_url: str
        +base_width: Decimal
        +base_height: Decimal
        +base_depth: Decimal
    }
    class Garden {
        <<Entity>>
        +id: str PK
        +owner_id: str
        +name: str
        +width: float
        +depth: float
        +revision: int
        +updated_at: datetime
        +photo_json: str | None
        +shopping_targets_json: str | None
    }
    class PlacedObject {
        <<Entity>>
        +id: str PK
        +garden_id: str FK
        +asset_id: str FK
        +product_id: str | None
        +product_name: str | None
        +material_code: str | None
        +model_composition_json: str | None
        +position_x: float
        +position_y: float
        +position_z: float
        +rotation_x: float
        +rotation_y: float
        +rotation_z: float
        +scale_x: float
        +scale_y: float
        +scale_z: float
    }
    class GardenThumbnail {
        <<Entity>>
        +garden_id: str PK, FK
        +revision: int
        +image_png: bytes | None
        +image_key: str | None
    }
    class HistoryEntity {
        <<Entity>>
        +garden_id: str FK
    }
    note for Garden "テーブル gardens。owner_id は EC の会員 ID（外部キーではない）<br/>photo_json は GardenPhoto の JSON、shopping_targets_json は ShoppingTarget の配列の JSON"
    note for PlacedObject "テーブル placed_objects。model_composition_json は PlantComposition の JSON"
    note for HistoryEntity "history_models.py のテーブル garden_image_history。02 に載せる"

    DeclarativeBase <|-- Base
    Base <|-- Asset
    Base <|-- Garden
    Base <|-- PlacedObject
    Base <|-- GardenThumbnail
    Base <|-- HistoryEntity
    PlacedObject "0..*" --> "1" Garden : garden_id（ON DELETE CASCADE）
    PlacedObject "0..*" --> "1" Asset : asset_id
    GardenThumbnail "0..1" --> "1" Garden : garden_id（ON DELETE CASCADE）
    HistoryEntity "0..*" --> "1" Garden : garden_id（ON DELETE CASCADE）
```

## 図 7 サムネイル（thumbnails.py）

庭一覧のカードの画像です。読むときは、生成画像（`garden_image_history` の最新）、保存した画面の画像（`garden_thumbnails` の `revision` が庭と同じとき）、配置図（`placed_objects` から描く）の順に使います。保存は、送られた `revision` が庭の `revision` と同じときだけです（違えば 409 `THUMBNAIL_STALE`）。

```mermaid
classDiagram
    direction LR
    class thumbnails_py["thumbnails.py"] {
        <<module>>
        +thumbnail_version(history_id: str | None, revision: int, captured_revision: int | None) str
        +small_png(image: Image) bytes
        +placement_plan(session: Session, garden) bytes
        +read_thumbnail(session: Session, owner: str, garden_id: str, media: MediaStore | None) tuple~bytes, str~
        +thumbnail_router(get_owner, get_session, media: MediaStore | None) APIRouter
    }
    class thumb_router["router: APIRouter"] {
        <<APIRouter>>
        +get(id: str, db: Db, owner: Owner) Response
        +save(id: str, request: ThumbnailRequest, db: Db, owner: Owner) Response
    }
    note for thumb_router "thumbnail_router の中で作る<br/>get: GET /api/gardens/{id}/thumbnail（image/png、X-Thumbnail-Source ヘッダー）<br/>save: POST /api/gardens/{id}/thumbnail（204。640×400 px を超えると 400 THUMBNAIL_SIZE）"
    class ApiModel {
        <<DTO>>
    }
    class ThumbnailRequest {
        <<DTO>>
        +revision: int 0 以上
        +dataUrl: str 450000 文字まで
    }
    class service_py["service.py"] {
        <<Service>>
        +owned_garden(session: Session, owner: str, id: str, lock: bool = False) Garden
    }
    class MediaStore {
        +put(content: bytes, mime: str) tuple~bytes | None, str | None~
        +get(content: bytes | None, key: str | None) bytes
    }
    class ai_images_py["ai_images.py（02）"] {
        <<module>>
        +decode_data_url(value: str, png_only: bool, opaque: bool, max_bytes: int) Image
        +decode_image(content: bytes, expected_format: str | None, max_bytes: int) Image
    }
    class ai_config_py["ai_config.py（02）"] {
        <<module>>
        +MAX_AFTER_IMAGE_BYTES: int
    }
    class Garden {
        <<Entity>>
    }
    class PlacedObject {
        <<Entity>>
    }
    class GardenThumbnail {
        <<Entity>>
    }
    class HistoryEntity["HistoryEntity（02）"] {
        <<Entity>>
    }

    thumbnails_py ..> thumb_router : thumbnail_router で作る
    ApiModel <|-- ThumbnailRequest
    thumb_router ..> ThumbnailRequest : save の本文
    thumb_router ..> thumbnails_py : read_thumbnail, small_png
    thumb_router ..> MediaStore : put
    thumb_router ..> ai_images_py : decode_data_url
    thumb_router ..> service_py : owned_garden
    thumb_router ..> GardenThumbnail : 書く
    thumbnails_py ..> service_py : owned_garden
    thumbnails_py ..> MediaStore : get
    thumbnails_py ..> ai_images_py : decode_image
    thumbnails_py ..> ai_config_py : MAX_AFTER_IMAGE_BYTES
    thumbnails_py ..> HistoryEntity : 最新の after_png, after_key
    thumbnails_py ..> GardenThumbnail : 読む
    thumbnails_py ..> PlacedObject : 配置図を描く
    thumbnails_py ..> Garden : width, depth, revision
```

## 図 8 買い物リスト（shopping.py）

保存済みの配置を、商品（`productId`）か、商品が無ければアセット（`assetId`）ごとに数えます。呼び出し元は EC のサーバーです。`materialCode` が無い配置は `MATERIAL_CODES`（`tree_oak`、`shrub_boxwood`、`brick_paver`、`bench_wood` の 4 つ）から補います。

```mermaid
classDiagram
    direction LR
    class shopping_py["shopping.py"] {
        <<Service>>
        +MATERIAL_CODES: dict
        +summaries(session: Session, owner: str) list~ShoppingSummary~
        +detail(session: Session, owner: str, garden_id: str) ShoppingList
    }
    class BaseModel {
        <<pydantic>>
    }
    class ShoppingRow {
        <<DTO>>
        +key: str
        +name: str
        +productId: str | None
        +materialCode: str
        +quantity: int
        +unit: str = "piece"
    }
    class ShoppingList {
        <<DTO>>
        +gardenId: str
        +name: str
        +revision: int
        +updatedAt: datetime
        +items: list~ShoppingRow~
    }
    class ShoppingSummary {
        <<DTO>>
        +gardenId: str
        +name: str
        +revision: int
        +updatedAt: datetime
        +thumbnailVersion: str
        +productCount: int
        +itemCount: int
    }
    class service_py["service.py"] {
        <<Service>>
        +owned_garden(session: Session, owner: str, id: str, lock: bool = False) Garden
    }
    class thumbnails_py["thumbnails.py"] {
        <<module>>
        +thumbnail_version(history_id: str | None, revision: int, captured_revision: int | None) str
    }
    class Garden {
        <<Entity>>
    }
    class PlacedObject {
        <<Entity>>
    }
    class Asset {
        <<Entity>>
    }
    class GardenThumbnail {
        <<Entity>>
    }
    class HistoryEntity["HistoryEntity（02）"] {
        <<Entity>>
    }
    note for ShoppingRow "key は product:（productId）か asset:（assetId）"
    note for ShoppingSummary "thumbnailVersion は generated-（履歴の id）、scene-（revision）、layout-（revision）のどれか"

    BaseModel <|-- ShoppingRow
    BaseModel <|-- ShoppingList
    BaseModel <|-- ShoppingSummary
    ShoppingList --> "0..*" ShoppingRow : items
    shopping_py ..> ShoppingSummary : summaries が返す
    shopping_py ..> ShoppingList : detail が返す
    shopping_py ..> service_py : owned_garden
    shopping_py ..> thumbnails_py : thumbnail_version
    shopping_py ..> Garden : owner_id で絞る
    shopping_py ..> PlacedObject : 数える
    shopping_py ..> Asset : 名前
    shopping_py ..> GardenThumbnail : revision
    shopping_py ..> HistoryEntity : 最新の id
```

## 図 9 起動・マイグレーション・ローカル DB の準備

API の起動とマイグレーションは `python -m kusakari_canvas_api serve` と `migrate`（`scripts/api.mjs`、`docker/api.Dockerfile`）です。`serve` も、container 以外ではマイグレーションを先に行います。ローカルの DB は、setup.bat（`scripts/setup.ps1`）が `setup_database` を、DB-reset.bat（`scripts/reset-database.ps1`）が `reset_database` を実行して用意します。`setup_database` と `reset_database` は、API の起動では使いません。`local_mysql` と、それが使う `setup_files` は、container 以外で API を起動するときにも `ensure_for_settings` から使います（Canvas 専用のローカル MySQL が動いていなければ起動し、ポートが変わっていれば接続先を直す）。

```mermaid
classDiagram
    direction LR
    class dunder_main["#95;#95;main#95;#95;.py"] {
        <<module>>
        +main() int
    }
    class main_py["main.py"] {
        <<module>>
        +create_app(settings: Settings | None) FastAPI
    }
    class config_py["config.py"] {
        <<module>>
        +REPO_ROOT: Path
        +canvas_data_home() Path
    }
    class Settings {
        <<dataclass>>
        +from_env()$ Settings
    }
    class database_py["database.py"] {
        <<module>>
        +create_database_engine(settings: Settings) Engine
    }
    class migrations_py["migrations.py"] {
        <<module>>
        +HEAD: str = "0008"
        +SUPPORTED_REVISIONS: set
        +migration_lock_name(database: str) str
        +type_signature(value, dialect) str
        +validate_schema(connection: Connection, revision: str) None
        +current_revision(connection: Connection) str | None
        +legacy_revision(connection: Connection) str
        +backup_database(settings: Settings) Path
        +alembic_config(connection: Connection) Config
        +migrate(settings: Settings) dict
    }
    class Base {
        <<SQLAlchemy>>
    }
    class HistoryEntity["HistoryEntity（02）"] {
        <<Entity>>
    }
    class startup_errors_py["startup_errors.py"] {
        <<module>>
        +MESSAGES: dict
        +safe_error(error: Exception) str
    }
    class local_mysql_py["local_mysql.py"] {
        <<module>>
        +local_root() Path
        +read_state() dict | None
        +connect_admin(state: dict)
        +verify_directory(connection, state: dict) None
        +initialize(bin_path: Path) dict
        +ensure_server(state: dict) dict
        +ensure_for_settings(settings) Settings
    }
    class setup_files_py["setup_files.py"] {
        <<module>>
        +instance_lock(root: Path)
        +private_file(path: Path, content: str) None
        +save_settings(path: Path, values: dict~str, str~) None
        +protect_secret(value: str, decrypt: bool = False) str
    }
    class Structure["ctypes.Structure"]
    class Blob {
        +size: DWORD
        +data: POINTER c_byte
    }
    class setup_database_py["setup_database.py"] {
        <<module>>
        +file_values(profile: str) dict
        +profile_config(profile: str, default_port: int) dict
        +connect(config: dict, database: bool = True)
        +check_connection(config: dict) bool
        +validate_version(version: str) None
        +mysql_server_responds(host: str, port: int) bool
        +configured_settings(config: dict) Settings
        +validate_existing_database(admin, config: dict, admin_user: str, admin_password: str) None
        +prepare_profile(admin, config: dict) None
        +existing_admin(config: dict)
        +migrate_and_verify(configs: list~dict~) list~dict~
        +main() int
    }
    class reset_database_py["reset_database.py"] {
        <<module>>
        +SUMMARY_TABLES: tuple
        +load_configs() tuple~dict | None, list~
        +start_managed_server(state: dict | None, configs: list~dict~) None
        +summarize(config: dict) dict
        +show_plan(configs: list~dict~, summaries: list~dict~) None
        +kill_connections(configs: list~dict~) None
        +backup(configs: list~dict~, summaries: list~dict~) None
        +recreate(config: dict) None
        +main() int
    }
    note for migrations_py "MySQL の GET_LOCK で同時実行を防ぐ。既存 DB を変えるときは先にバックアップする<br/>（container 以外は mysqldump、container は RDS スナップショットの ARN を必須にする）<br/>Flyway の V1, V2 の DB は照合してから Alembic の 0001 か 0002 として記録する"
    note for local_mysql_py "Windows だけ。ほかに先頭が _ の非公開の関数が 15 個ある"

    dunder_main ..> Settings : from_env
    dunder_main ..> local_mysql_py : ensure_for_settings
    dunder_main ..> migrations_py : migrate
    dunder_main ..> main_py : create_app
    dunder_main ..> startup_errors_py : safe_error
    Settings ..> config_py
    database_py ..> Settings
    migrations_py ..> Settings
    migrations_py ..> database_py : create_database_engine
    migrations_py ..> Base : metadata と照合
    migrations_py ..> HistoryEntity : metadata に登録
    local_mysql_py ..> config_py : REPO_ROOT, canvas_data_home
    local_mysql_py ..> setup_files_py : instance_lock, private_file, protect_secret, save_settings
    Structure <|-- Blob
    setup_files_py ..> Blob : protect_secret
    setup_database_py ..> config_py : REPO_ROOT
    setup_database_py ..> Settings : configured_settings
    setup_database_py ..> local_mysql_py : connect_admin, initialize, read_state
    setup_database_py ..> migrations_py : current_revision, legacy_revision, migrate, validate_schema
    setup_database_py ..> setup_files_py : protect_secret, save_settings
    setup_database_py ..> startup_errors_py : safe_error
    reset_database_py ..> local_mysql_py : ensure_server, read_state
    reset_database_py ..> migrations_py : backup_database
    reset_database_py ..> setup_database_py : configured_settings, connect, file_values など
    reset_database_py ..> startup_errors_py : safe_error
```

## 図に載せなかったクラス

対象のモジュールのクラス 30 個（`AuthBoundary`、`Settings`、`ApiError`、`MediaStore`、`models.py` の 5 個、`schemas.py` の 16 個、`shopping.py` の 3 個、`ThumbnailRequest`、`Blob`）は、すべてどれかの図に載せました。クラス以外で図に載せなかったものは次のとおりです。

- `schemas.py` の `ShoppingTargets`: `list[ShoppingTarget]` に 200 個までの制約を付けた型の別名です。図 4 では `GardenDocumentRequest.shoppingTargets` の型として書きました。
- `schemas.py` の `_absent`: `PhotoCalibration` の `exclude_if` と検証で使う、値が `None` かを返す小さな関数です。
- `main.py` の `get_session`: `create_app` の中の関数で、`Depends` で `Session` を渡します。図 2 の本文に書きました。
- `local_mysql.py` の、名前が `_` で始まる非公開の関数 15 個: ポートの選び直し、PowerShell の呼び出し、プロセスの確認など、`initialize` と `ensure_server` の中だけで使う部品です。
- `__init__.py`: パッケージの説明文だけで、クラスも関数もありません。
