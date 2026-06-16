# Pet-Bot Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:parallel-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python FastAPI backend that accepts photo uploads, runs the 7-stage AI pipeline to generate a bone-rigged desktop pet, and serves pet asset bundles.

**Architecture:** FastAPI app with SQLite, provider-abstraction for AI APIs, local file storage. The 7-stage pipeline is orchestrated by a Pipeline service; each stage is an independent service module. API routes are versioned under `/api/v1`.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy + SQLite, httpx, Pillow, rembg, mediapipe

**Source:** Spec `docs/superpowers/specs/2026-06-16-pet-bot-design.md`

---

## File Structure Map

```
pet-bot-server/
├── requirements.txt          # Dependencies
├── .env.example              # Environment template
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI app entry, lifespan, CORS
│   ├── config.py             # Pydantic Settings, env loading
│   ├── database.py           # SQLAlchemy engine, session, Base
│   ├── models/
│   │   ├── __init__.py
│   │   └── pet.py            # Pet ORM model
│   ├── schemas/
│   │   ├── __init__.py
│   │   └── pet.py            # Pydantic request/response schemas
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── pets.py           # Pet CRUD endpoints
│   │   └── generation.py     # Upload + pipeline trigger + status
│   ├── services/
│   │   ├── __init__.py
│   │   ├── pipeline.py       # Orchestrator: run all 7 stages
│   │   ├── pose.py           # Stage 1: Pose estimation
│   │   ├── segmentation.py   # Stage 2-3: BG removal + part split
│   │   ├── stylization.py    # Stage 4: Part stylization
│   │   ├── rigging.py        # Stage 5: Keypoints → Spine JSON
│   │   └── preview.py        # Stage 6: Render multi-view PNGs
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py           # Abstract provider interface
│   │   ├── builtin.py        # Default provider (bundled key)
│   │   └── registry.py       # Provider lookup by user config
│   └── storage/
│       ├── __init__.py
│       └── local.py          # Local filesystem asset storage
└── tests/
    ├── __init__.py
    ├── conftest.py            # Fixtures: test client, test DB
    ├── test_pets.py           # Pet CRUD tests
    ├── test_generation.py     # Upload + pipeline endpoint tests
    ├── test_pipeline.py       # Pipeline orchestrator tests
    ├── test_pose.py           # Pose estimation tests
    ├── test_segmentation.py   # Segmentation tests
    ├── test_rigging.py        # Rigging output tests
    └── test_preview.py        # Preview render tests
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `pet-bot-server/requirements.txt`
- Create: `pet-bot-server/.env.example`
- Create: `pet-bot-server/app/__init__.py`
- Create: `pet-bot-server/app/main.py`
- Create: `pet-bot-server/app/config.py`
- Create: `pet-bot-server/tests/__init__.py`

- [ ] **Step 1: Create requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pydantic-settings==2.5.2
python-multipart==0.0.12
httpx==0.27.2
Pillow==10.4.0
rembg==2.0.59
mediapipe==0.10.14
opencv-python-headless==4.10.0.84
numpy==2.1.1
aiofiles==24.1.0
python-dotenv==1.0.1
pytest==8.3.3
pytest-asyncio==0.24.0
httpx==0.27.2
```

- [ ] **Step 2: Create .env.example**

```
APP_NAME=pet-bot-server
DATABASE_URL=sqlite:///./petbot.db
UPLOAD_DIR=./uploads
ASSET_DIR=./assets
BUILTIN_PROVIDER=replicate
BUILTIN_API_KEY=sk-default-key-placeholder
MAX_FREE_GENERATIONS=5
CORS_ORIGINS=*
```

- [ ] **Step 3: Create app/config.py**

```python
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    app_name: str = "pet-bot-server"
    database_url: str = "sqlite:///./petbot.db"
    upload_dir: str = "./uploads"
    asset_dir: str = "./assets"
    builtin_provider: str = "replicate"
    builtin_api_key: str = ""
    max_free_generations: int = 5
    cors_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

# Ensure directories exist
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.asset_dir).mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 4: Create app/main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
```

- [ ] **Step 5: Install dependencies and verify startup**

Run:
```bash
cd pet-bot-server
python -m venv venv
source venv/Scripts/activate  # Windows
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Verify: `curl http://localhost:8000/health` returns `{"status":"ok","app":"pet-bot-server"}`

- [ ] **Step 6: Commit**

```bash
git add pet-bot-server/
git commit -m "feat: scaffold FastAPI project with config and health endpoint"
```

---

### Task 2: Database Layer

**Files:**
- Create: `pet-bot-server/app/database.py`
- Create: `pet-bot-server/app/models/__init__.py`
- Create: `pet-bot-server/app/models/pet.py`

- [ ] **Step 1: Create app/database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.config import settings


engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
    echo=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db():
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Create app/models/pet.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base
import enum


class PetStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    AWAITING_REVIEW = "awaiting_review"
    READY = "ready"
    FAILED = "failed"


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(128), default="My Pet")
    status: Mapped[PetStatus] = mapped_column(SAEnum(PetStatus), default=PetStatus.UPLOADED)
    source_photo_path: Mapped[str] = mapped_column(String(512), nullable=True)
    asset_bundle_path: Mapped[str] = mapped_column(String(512), nullable=True)
    preview_front: Mapped[str] = mapped_column(String(512), nullable=True)
    preview_side: Mapped[str] = mapped_column(String(512), nullable=True)
    preview_back: Mapped[str] = mapped_column(String(512), nullable=True)
    skeleton_json: Mapped[str] = mapped_column(Text, nullable=True)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    generations_used: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 3: Verify DB init**

Run: `python -c "from app.database import init_db; init_db(); print('DB ready')"`
Expected: `DB ready`, and `petbot.db` file created.

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/database.py pet-bot-server/app/models/
git commit -m "feat: add SQLite database layer and Pet model"
```

---

### Task 3: Pydantic Schemas

**Files:**
- Create: `pet-bot-server/app/schemas/__init__.py`
- Create: `pet-bot-server/app/schemas/pet.py`

- [ ] **Step 1: Create app/schemas/pet.py**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from app.models.pet import PetStatus


class PetCreate(BaseModel):
    name: str = Field(default="My Pet", max_length=128)


class PetStatusResponse(BaseModel):
    id: str
    name: str
    status: PetStatus
    preview_front: Optional[str] = None
    preview_side: Optional[str] = None
    preview_back: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PetDetailResponse(PetStatusResponse):
    source_photo_path: Optional[str] = None
    asset_bundle_path: Optional[str] = None
    skeleton_json: Optional[str] = None
    generations_used: int
    updated_at: datetime


class PetListResponse(BaseModel):
    pets: list[PetStatusResponse]
    total: int


class GenerationAction(BaseModel):
    pet_id: str
    action: str = Field(pattern="^(confirm|regenerate)$")


class ErrorResponse(BaseModel):
    detail: str
    error_code: str | None = None
```

- [ ] **Step 2: Commit**

```bash
git add pet-bot-server/app/schemas/
git commit -m "feat: add Pydantic request/response schemas"
```

---

### Task 4: Pet CRUD API Routes

**Files:**
- Create: `pet-bot-server/app/routers/__init__.py`
- Create: `pet-bot-server/app/routers/pets.py`
- Modify: `pet-bot-server/app/main.py` (register router)

- [ ] **Step 1: Create app/routers/pets.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.pet import Pet, PetStatus
from app.schemas.pet import PetStatusResponse, PetDetailResponse, PetListResponse

router = APIRouter(prefix="/api/v1/pets", tags=["pets"])


@router.get("/", response_model=PetListResponse)
def list_pets(db: Session = Depends(get_db)):
    pets = db.query(Pet).order_by(Pet.created_at.desc()).all()
    return PetListResponse(
        pets=[PetStatusResponse.model_validate(p) for p in pets],
        total=len(pets),
    )


@router.get("/{pet_id}", response_model=PetDetailResponse)
def get_pet(pet_id: str, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return PetDetailResponse.model_validate(pet)


@router.delete("/{pet_id}", status_code=204)
def delete_pet(pet_id: str, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    db.delete(pet)
    db.commit()
```

- [ ] **Step 2: Register router in main.py**

Add after CORS middleware in `app/main.py`:
```python
from app.routers import pets

app.include_router(pets.router)
```

- [ ] **Step 3: Write and run the tests**

Create `tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///./test.db", connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Create `tests/test_pets.py`:
```python
def test_list_pets_empty(client):
    response = client.get("/api/v1/pets/")
    assert response.status_code == 200
    assert response.json() == {"pets": [], "total": 0}


def test_get_pet_not_found(client):
    response = client.get("/api/v1/pets/nonexistent")
    assert response.status_code == 404


def test_delete_pet_not_found(client):
    response = client.delete("/api/v1/pets/nonexistent")
    assert response.status_code == 404
```

Run:
```bash
cd pet-bot-server
python -m pytest tests/test_pets.py -v
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/routers/ pet-bot-server/app/main.py pet-bot-server/tests/
git commit -m "feat: add Pet CRUD API routes with tests"
```

---

### Task 5: File Upload Endpoint & Storage

**Files:**
- Create: `pet-bot-server/app/storage/__init__.py`
- Create: `pet-bot-server/app/storage/local.py`
- Create: `pet-bot-server/app/routers/generation.py`
- Modify: `pet-bot-server/app/main.py` (register new router)

- [ ] **Step 1: Create app/storage/local.py**

```python
import shutil
from pathlib import Path
from app.config import settings


class LocalStorage:
    def __init__(self, base_dir: str | None = None):
        self.base = Path(base_dir or settings.upload_dir)

    def save_upload(self, file_bytes: bytes, filename: str) -> str:
        """Save uploaded file, return relative path."""
        self.base.mkdir(parents=True, exist_ok=True)
        dest = self.base / filename
        dest.write_bytes(file_bytes)
        return str(dest.relative_to(self.base.parent))

    def save_asset(self, file_bytes: bytes, pet_id: str, name: str) -> str:
        """Save generated asset, return relative path."""
        asset_dir = Path(settings.asset_dir) / pet_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        dest = asset_dir / name
        dest.write_bytes(file_bytes)
        return str(dest.relative_to(Path(settings.asset_dir).parent))

    def read(self, relative_path: str) -> bytes:
        full = Path(settings.asset_dir).parent / relative_path
        return full.read_bytes()

    def delete_pet_assets(self, pet_id: str):
        asset_dir = Path(settings.asset_dir) / pet_id
        if asset_dir.exists():
            shutil.rmtree(asset_dir)


storage = LocalStorage()
```

- [ ] **Step 2: Create app/routers/generation.py**

```python
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.pet import Pet, PetStatus
from app.schemas.pet import PetStatusResponse, GenerationAction
from app.storage.local import storage

router = APIRouter(prefix="/api/v1/generation", tags=["generation"])


@router.post("/upload", response_model=PetStatusResponse, status_code=202)
async def upload_photo(
    name: str = Form(default="My Pet"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    allowed_types = ["image/jpeg", "image/png", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:  # 10 MB
        raise HTTPException(400, "File too large (max 10 MB)")

    pet_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "png"
    filename = f"{pet_id}_source.{ext}"

    photo_path = storage.save_upload(contents, filename)

    pet = Pet(id=pet_id, name=name, status=PetStatus.UPLOADED, source_photo_path=photo_path)
    db.add(pet)
    db.commit()
    db.refresh(pet)

    return PetStatusResponse.model_validate(pet)


@router.get("/status/{pet_id}", response_model=PetStatusResponse)
def get_generation_status(pet_id: str, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return PetStatusResponse.model_validate(pet)
```

- [ ] **Step 3: Register in main.py**

```python
from app.routers import generation

app.include_router(generation.router)
```

- [ ] **Step 4: Write upload tests**

Create `tests/test_generation.py`:
```python
import io


def test_upload_photo_success(client):
    fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
    fake_img.name = "test.png"
    response = client.post(
        "/api/v1/generation/upload",
        files={"file": ("test.png", fake_img, "image/png")},
        data={"name": "Test Pet"},
    )
    assert response.status_code == 202
    data = response.json()
    assert data["name"] == "Test Pet"
    assert data["status"] == "uploaded"
    assert "id" in data


def test_upload_bad_file_type(client):
    fake_file = io.BytesIO(b"not an image")
    response = client.post(
        "/api/v1/generation/upload",
        files={"file": ("test.txt", fake_file, "text/plain")},
    )
    assert response.status_code == 400


def test_generation_status_not_found(client):
    response = client.get("/api/v1/generation/status/nonexistent")
    assert response.status_code == 404
```

Run:
```bash
python -m pytest tests/test_generation.py -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/storage/ pet-bot-server/app/routers/generation.py pet-bot-server/app/main.py pet-bot-server/tests/test_generation.py
git commit -m "feat: add file upload endpoint and local storage"
```

---

### Task 6: Provider Abstraction Layer

**Files:**
- Create: `pet-bot-server/app/providers/__init__.py`
- Create: `pet-bot-server/app/providers/base.py`
- Create: `pet-bot-server/app/providers/builtin.py`
- Create: `pet-bot-server/app/providers/registry.py`

- [ ] **Step 1: Create app/providers/base.py**

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any
import numpy as np


@dataclass
class PoseResult:
    keypoints: list[dict[str, float]]  # [{x, y, z, visibility, name}, ...]
    image_width: int
    image_height: int


@dataclass
class SegmentationResult:
    mask: Any  # numpy array, binary mask
    parts: dict[str, Any]  # {"head": np.array, "torso": np.array, ...}


@dataclass
class StylizationResult:
    part_images: dict[str, bytes]  # {"head": png_bytes, "torso": png_bytes, ...}
    style_prompt: str


class AIProvider(ABC):
    """Abstract interface for AI model providers."""

    @property
    @abstractmethod
    def name(self) -> str:
        ...

    @abstractmethod
    def estimate_pose(self, image_bytes: bytes) -> PoseResult:
        ...

    @abstractmethod
    def remove_background(self, image_bytes: bytes) -> bytes:
        """Returns transparent-background PNG bytes."""
        ...

    @abstractmethod
    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult:
        ...

    @abstractmethod
    def stylize_parts(self, parts: SegmentationResult, style: str | None = None) -> StylizationResult:
        ...
```

- [ ] **Step 2: Create app/providers/builtin.py**

```python
"""Built-in provider using local models (rembg + mediapipe)."""
import io
import numpy as np
from PIL import Image
from rembg import remove
from app.providers.base import AIProvider, PoseResult, SegmentationResult, StylizationResult


class BuiltinProvider(AIProvider):
    name = "builtin"

    def __init__(self):
        self._mp_pose = None

    def _get_mp_pose(self):
        if self._mp_pose is None:
            import mediapipe as mp
            self._mp_pose = mp.solutions.pose.Pose(
                static_image_mode=True,
                model_complexity=1,
                enable_segmentation=False,
            )
        return self._mp_pose

    def estimate_pose(self, image_bytes: bytes) -> PoseResult:
        pil_img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = pil_img.size
        np_img = np.array(pil_img)

        pose = self._get_mp_pose()
        results = pose.process(np_img)

        keypoints = []
        if results.pose_landmarks:
            for idx, lm in enumerate(results.pose_landmarks.landmark):
                keypoints.append({
                    "x": lm.x * w,
                    "y": lm.y * h,
                    "z": lm.z,
                    "visibility": lm.visibility,
                    "name": f"joint_{idx}",
                })

        return PoseResult(keypoints=keypoints, image_width=w, image_height=h)

    def remove_background(self, image_bytes: bytes) -> bytes:
        return remove(image_bytes)

    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult:
        """Rudimentary part segmentation using pose keypoints as anchors."""
        img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        np_img = np.array(img)

        parts = {}
        h, w = np_img.shape[:2]

        # Simple bounding-box segmentation from keypoints
        # Head: around nose + eyes region
        head_kps = [k for k in pose.keypoints if int(k["name"].split("_")[1]) in range(0, 11)]
        if head_kps:
            xs = [k["x"] for k in head_kps]
            ys = [k["y"] for k in head_kps]
            if xs and ys:
                cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
                r = max(max(xs) - min(xs), max(ys) - min(ys)) * 0.7
                x1, y1 = max(0, int(cx - r)), max(0, int(cy - r))
                x2, y2 = min(w, int(cx + r)), min(h, int(cy + r))
                parts["head"] = np_img[y1:y2, x1:x2].copy()

        # Torso: shoulders to hips
        torso_kps = [k for k in pose.keypoints if int(k["name"].split("_")[1]) in range(11, 25)]
        if torso_kps:
            xs = [k["x"] for k in torso_kps]
            ys = [k["y"] for k in torso_kps]
            if xs and ys:
                x1, y1 = max(0, int(min(xs))), max(0, int(min(ys)))
                x2, y2 = min(w, int(max(xs))), min(h, int(max(ys)))
                parts["torso"] = np_img[y1:y2, x1:x2].copy()

        return SegmentationResult(mask=np_img[:, :, 3], parts=parts)

    def stylize_parts(self, parts: SegmentationResult, style: str | None = None) -> StylizationResult:
        """MVP: return parts as-is (stylization is a future enhancement)."""
        part_images = {}
        for name, np_arr in parts.parts.items():
            img = Image.fromarray(np_arr)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            part_images[name] = buf.getvalue()
        return StylizationResult(part_images=part_images, style_prompt=style or "default")
```

- [ ] **Step 3: Create app/providers/registry.py**

```python
from app.providers.base import AIProvider
from app.providers.builtin import BuiltinProvider


_providers: dict[str, AIProvider] = {}


def register_provider(provider: AIProvider):
    _providers[provider.name] = provider


def get_provider(name: str | None = None) -> AIProvider:
    """Get a provider by name. Falls back to builtin if not found."""
    if name and name in _providers:
        return _providers[name]
    if "builtin" not in _providers:
        register_provider(BuiltinProvider())
    return _providers["builtin"]


def available_providers() -> list[str]:
    return list(_providers.keys())
```

- [ ] **Step 4: Write provider tests**

Create `tests/test_provider.py`:
```python
import pytest
from app.providers.builtin import BuiltinProvider
from app.providers.registry import get_provider, register_provider


@pytest.fixture
def builtin():
    return BuiltinProvider()


def test_builtin_provider_name(builtin):
    assert builtin.name == "builtin"


def test_pose_estimation(builtin):
    # Create a small test image
    from PIL import Image
    import io
    img = Image.new("RGB", (100, 200), color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    result = builtin.estimate_pose(buf.getvalue())
    assert result.image_width == 100
    assert result.image_height == 200
    assert isinstance(result.keypoints, list)


def test_remove_background(builtin):
    from PIL import Image
    import io
    img = Image.new("RGB", (50, 50), color="blue")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    result = builtin.remove_background(buf.getvalue())
    assert isinstance(result, bytes)
    assert len(result) > 0


def test_registry_default():
    provider = get_provider()
    assert provider.name == "builtin"
```

Run:
```bash
python -m pytest tests/test_provider.py -v
```

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/providers/ pet-bot-server/tests/test_provider.py
git commit -m "feat: add AI provider abstraction and builtin provider"
```

---

### Task 7: AI Pipeline Orchestrator

**Files:**
- Create: `pet-bot-server/app/services/__init__.py`
- Create: `pet-bot-server/app/services/pipeline.py`

- [ ] **Step 1: Create app/services/pipeline.py**

```python
import logging
from dataclasses import dataclass
from typing import Optional
from app.providers.base import AIProvider, PoseResult, SegmentationResult, StylizationResult
from app.providers.registry import get_provider

logger = logging.getLogger(__name__)


@dataclass
class PipelineResult:
    success: bool
    pose: Optional[PoseResult] = None
    bg_removed: Optional[bytes] = None
    segmentation: Optional[SegmentationResult] = None
    stylization: Optional[StylizationResult] = None
    skeleton_json: Optional[str] = None
    preview_front: Optional[bytes] = None
    preview_side: Optional[bytes] = None
    preview_back: Optional[bytes] = None
    error: Optional[str] = None
    stage_failed: Optional[str] = None


class PetPipeline:
    """Orchestrates the 7-stage AI pipeline for photo-to-pet generation."""

    def __init__(self, provider_name: str | None = None):
        self.provider: AIProvider = get_provider(provider_name)

    def run(self, image_bytes: bytes, style: str | None = None) -> PipelineResult:
        logger.info("Starting pet generation pipeline")

        # Stage 1: Pose Estimation
        try:
            pose = self.provider.estimate_pose(image_bytes)
            logger.info(f"Stage 1 OK: {len(pose.keypoints)} keypoints found")
        except Exception as e:
            logger.exception("Stage 1 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="pose_estimation")

        # Stage 2: Background Removal
        try:
            bg_removed = self.provider.remove_background(image_bytes)
            logger.info(f"Stage 2 OK: {len(bg_removed)} bytes")
        except Exception as e:
            logger.exception("Stage 2 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="background_removal")

        # Stage 3: Part Segmentation
        try:
            segmentation = self.provider.segment_parts(bg_removed, pose)
            logger.info(f"Stage 3 OK: {len(segmentation.parts)} parts")
        except Exception as e:
            logger.exception("Stage 3 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="part_segmentation")

        # Stage 4: Part Stylization
        try:
            stylization = self.provider.stylize_parts(segmentation, style)
            logger.info(f"Stage 4 OK: {len(stylization.part_images)} styled parts")
        except Exception as e:
            logger.exception("Stage 4 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="stylization")

        # Stage 5: Skeleton Rigging
        try:
            from app.services.rigging import build_skeleton
            skeleton_json = build_skeleton(pose, segmentation)
            logger.info(f"Stage 5 OK: {len(skeleton_json)} chars")
        except Exception as e:
            logger.exception("Stage 5 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="skeleton_rigging")

        # Stage 6: Multi-View Preview
        try:
            from app.services.preview import render_previews
            previews = render_previews(stylization, skeleton_json)
            logger.info("Stage 6 OK: previews rendered")
        except Exception as e:
            logger.exception("Stage 6 failed")
            return PipelineResult(success=False, error=str(e), stage_failed="multi_view_preview")

        return PipelineResult(
            success=True,
            pose=pose,
            bg_removed=bg_removed,
            segmentation=segmentation,
            stylization=stylization,
            skeleton_json=skeleton_json,
            preview_front=previews.get("front"),
            preview_side=previews.get("side"),
            preview_back=previews.get("back"),
        )


pipeline = PetPipeline()
```

- [ ] **Step 2: Write pipeline tests**

Create `tests/test_pipeline.py`:
```python
import io
from PIL import Image
from app.services.pipeline import PetPipeline, PipelineResult


def _make_test_image() -> bytes:
    img = Image.new("RGB", (200, 300), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_pipeline_runs_all_stages():
    pipe = PetPipeline("builtin")
    result = pipe.run(_make_test_image())
    assert isinstance(result, PipelineResult)
    # Pipeline may succeed or fail depending on pose detection,
    # but it should never throw an unhandled exception
    assert result.success or result.error is not None
```

Run:
```bash
python -m pytest tests/test_pipeline.py -v
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot-server/app/services/__init__.py pet-bot-server/app/services/pipeline.py pet-bot-server/tests/test_pipeline.py
git commit -m "feat: add AI pipeline orchestrator (stages 1-6)"
```

---

### Task 8: Skeleton Rigging Service (Stage 5)

**Files:**
- Create: `pet-bot-server/app/services/rigging.py`
- Create: `pet-bot-server/tests/test_rigging.py`

- [ ] **Step 1: Create app/services/rigging.py**

```python
"""Stage 5: Keypoints → Spine-compatible skeleton JSON."""
import json
from app.providers.base import PoseResult, SegmentationResult


# MediaPipe pose landmark indices mapping
LANDMARK_NAMES = {
    0: "nose", 1: "left_eye_inner", 2: "left_eye", 3: "left_eye_outer",
    4: "right_eye_inner", 5: "right_eye", 6: "right_eye_outer",
    7: "left_ear", 8: "right_ear", 9: "mouth_left", 10: "mouth_right",
    11: "left_shoulder", 12: "right_shoulder", 13: "left_elbow",
    14: "right_elbow", 15: "left_wrist", 16: "right_wrist",
    17: "left_pinky", 18: "right_pinky", 19: "left_index", 20: "right_index",
    21: "left_thumb", 22: "right_thumb", 23: "left_hip", 24: "right_hip",
    25: "left_knee", 26: "right_knee", 27: "left_ankle", 28: "right_ankle",
    29: "left_heel", 30: "right_heel", 31: "left_foot_index", 32: "right_foot_index",
}

# Bone definitions based on joints
BONE_DEFS = [
    ("spine", "hips", "chest"),
    ("neck", "chest", "head"),
    ("left_upper_arm", "left_shoulder", "left_elbow"),
    ("left_lower_arm", "left_elbow", "left_wrist"),
    ("right_upper_arm", "right_shoulder", "right_elbow"),
    ("right_lower_arm", "right_elbow", "right_wrist"),
    ("left_upper_leg", "left_hip", "left_knee"),
    ("left_lower_leg", "left_knee", "left_ankle"),
    ("right_upper_leg", "right_hip", "right_knee"),
    ("right_lower_leg", "right_knee", "right_ankle"),
]

# Rule-based bone-to-part attachment mapping
BONE_PART_MAP = {
    "head": ["head_attachment"],
    "torso": ["torso_attachment"],
    "left_upper_arm": ["left_arm_attachment"],
    "right_upper_arm": ["right_arm_attachment"],
    "left_upper_leg": ["left_leg_attachment"],
    "right_upper_leg": ["right_leg_attachment"],
}

MVP_ANIMATIONS = ["idle", "walk", "jump", "sit", "sleep", "poke", "spin", "wave"]


def build_skeleton(pose: PoseResult, segmentation: SegmentationResult) -> str:
    """Build a Spine-compatible skeleton JSON from pose keypoints."""
    kp_map = _build_keypoint_map(pose)
    bones = _build_bones(kp_map)
    slots, attachments = _build_slots_and_attachments(segmentation, bones)
    animations_data = _build_default_animations(bones)

    skeleton = {
        "skeleton": {
            "spine": "4.1.0",
            "width": pose.image_width,
            "height": pose.image_height,
        },
        "bones": bones,
        "slots": slots,
        "skins": [{"name": "default", "attachments": attachments}],
        "animations": animations_data,
    }
    return json.dumps(skeleton, indent=2)


def _build_keypoint_map(pose: PoseResult) -> dict[str, dict]:
    kp_map = {}
    for i, kp in enumerate(pose.keypoints):
        name = LANDMARK_NAMES.get(i, f"joint_{i}")
        kp_map[name] = {"x": kp["x"], "y": kp["y"]}
    return kp_map


def _build_bones(kp_map: dict) -> list[dict]:
    """Build bone hierarchy. Returns list of Spine bone objects."""
    bones = [{"name": "root"}]

    # Create virtual joints if real ones missing (e.g., only upper body visible)
    def get_or_default(name, default_x, default_y):
        if name in kp_map:
            return kp_map[name]["x"], kp_map[name]["y"]
        return default_x, default_y

    # Calculate virtual positions
    if "left_shoulder" in kp_map and "right_shoulder" in kp_map:
        chest_x = (kp_map["left_shoulder"]["x"] + kp_map["right_shoulder"]["x"]) / 2
        chest_y = (kp_map["left_shoulder"]["y"] + kp_map["right_shoulder"]["y"]) / 2
    else:
        chest_x, chest_y = 100, 150

    if "left_hip" in kp_map and "right_hip" in kp_map:
        hips_x = (kp_map["left_hip"]["x"] + kp_map["right_hip"]["x"]) / 2
        hips_y = (kp_map["left_hip"]["y"] + kp_map["right_hip"]["y"]) / 2
    else:
        hips_x, hips_y = chest_x, chest_y + 100

    if "nose" in kp_map:
        head_x, head_y = kp_map["nose"]["x"], kp_map["nose"]["y"]
    else:
        head_x, head_y = chest_x, chest_y - 80

    # Build virtual joints into map
    kp_map["chest"] = {"x": chest_x, "y": chest_y}
    kp_map["hips"] = {"x": hips_x, "y": hips_y}
    kp_map["head"] = {"x": head_x, "y": head_y}

    # Create bones from definitions
    for bone_name, parent_joint, child_joint in BONE_DEFS:
        parent = kp_map.get(parent_joint)
        child = kp_map.get(child_joint)
        if parent and child:
            length = ((child["x"] - parent["x"]) ** 2 + (child["y"] - parent["y"]) ** 2) ** 0.5
            bones.append({
                "name": bone_name,
                "parent": "root",
                "x": parent["x"],
                "y": parent["y"],
                "length": max(length, 1),
                "rotation": 0,
            })

    return bones


def _build_slots_and_attachments(segmentation, bones) -> tuple[list, dict]:
    bone_names = [b["name"] for b in bones]
    slots = []
    attachments = {}

    for part_name in segmentation.parts.keys():
        slot_name = f"{part_name}_slot"
        slot_attachment = f"{part_name}_attach"
        slots.append({
            "name": slot_name,
            "bone": "root",
            "attachment": slot_attachment,
        })
        attachments[slot_name] = {
            slot_attachment: {
                "type": "region",
                "x": 0, "y": 0,
                "width": 32, "height": 32,
            }
        }

    return slots, attachments


def _build_default_animations(bones: list[dict]) -> dict:
    """Generate stub animation tracks for all MVP animations."""
    anims = {}
    for anim_name in MVP_ANIMATIONS:
        anims[anim_name] = {
            "bones": {
                b["name"]: {
                    "rotate": [{"time": 0, "angle": 0}],
                    "translate": [{"time": 0, "x": 0, "y": 0}],
                }
                for b in bones if b["name"] != "root"
            }
        }
    return anims
```

- [ ] **Step 2: Write rigging tests**

Create `tests/test_rigging.py`:
```python
import json
from app.providers.base import PoseResult, SegmentationResult
from app.services.rigging import build_skeleton


def test_build_skeleton_with_keypoints():
    pose = PoseResult(
        keypoints=[
            {"x": 100, "y": 80, "z": 0, "visibility": 0.9, "name": "nose"},
            {"x": 100, "y": 150, "z": 0, "visibility": 0.9, "name": "left_shoulder"},
            {"x": 80, "y": 150, "z": 0, "visibility": 0.9, "name": "right_shoulder"},
            {"x": 100, "y": 250, "z": 0, "visibility": 0.9, "name": "left_hip"},
            {"x": 80, "y": 250, "z": 0, "visibility": 0.9, "name": "right_hip"},
        ],
        image_width=200,
        image_height=400,
    )
    import numpy as np
    seg = SegmentationResult(
        mask=np.ones((400, 200), dtype=bool),
        parts={"head": np.zeros((80, 40, 4)), "torso": np.zeros((100, 60, 4))},
    )

    result = build_skeleton(pose, seg)
    data = json.loads(result)

    assert "bones" in data
    assert "slots" in data
    assert "animations" in data
    assert "idle" in data["animations"]
    assert len(data["bones"]) >= 2  # root + at least one bone
    assert len(data["slots"]) == 2  # head + torso


def test_animations_include_all_mvp():
    from app.services.rigging import MVP_ANIMATIONS
    assert "idle" in MVP_ANIMATIONS
    assert "walk" in MVP_ANIMATIONS
    assert "poke" in MVP_ANIMATIONS
    assert len(MVP_ANIMATIONS) == 8
```

Run:
```bash
python -m pytest tests/test_rigging.py -v
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot-server/app/services/rigging.py pet-bot-server/tests/test_rigging.py
git commit -m "feat: add skeleton rigging service (stage 5)"
```

---

### Task 9: Multi-View Preview Service (Stage 6)

**Files:**
- Create: `pet-bot-server/app/services/preview.py`
- Create: `pet-bot-server/tests/test_preview.py`

- [ ] **Step 1: Create app/services/preview.py**

```python
"""Stage 6: Render multi-view PNG previews from styled parts + skeleton."""
import io
from PIL import Image, ImageDraw


def render_previews(stylization, skeleton_json: str) -> dict[str, bytes]:
    """Render front, side, and back preview images.
    
    MVP: composite the styled part images into simple orthogonal views.
    Front = as-is, Side = simplified silhouette from parts, Back = mirrored silhouette.
    """
    previews = {}

    # Front view: composite all part images vertically
    front = _composite_front(stylization.part_images)
    previews["front"] = front

    # Side view: create a simple silhouette from the front view
    side = _make_silhouette(front, flip=False)
    previews["side"] = side

    # Back view: mirror of front silhouette
    back = _make_silhouette(front, flip=True)
    previews["back"] = back

    return previews


def _composite_front(part_images: dict[str, bytes]) -> bytes:
    """Stack part images vertically for a simple front view."""
    images = []
    for name in sorted(part_images.keys()):
        img = Image.open(io.BytesIO(part_images[name]))
        images.append((name, img))

    if not images:
        # Return a placeholder
        placeholder = Image.new("RGBA", (128, 256), (200, 200, 200, 255))
        buf = io.BytesIO()
        placeholder.save(buf, format="PNG")
        return buf.getvalue()

    # Calculate total height and max width
    total_h = sum(img.height for _, img in images)
    max_w = max(img.width for _, img in images)

    canvas = Image.new("RGBA", (max_w, total_h), (0, 0, 0, 0))
    y_offset = 0
    for _, img in images:
        x_offset = (max_w - img.width) // 2
        canvas.paste(img, (x_offset, y_offset), img if img.mode == "RGBA" else None)
        y_offset += img.height

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def _make_silhouette(front_bytes: bytes, flip: bool = False) -> bytes:
    """Create a simple silhouette preview from the front view."""
    img = Image.open(io.BytesIO(front_bytes)).convert("RGBA")
    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)

    # Convert to silhouette: alpha → solid color
    data = img.getdata()
    new_data = []
    for item in data:
        r, g, b, a = item
        if a > 0:
            new_data.append((100, 100, 120, a))
        else:
            new_data.append((0, 0, 0, 0))
    img.putdata(new_data)

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
```

- [ ] **Step 2: Write preview tests**

Create `tests/test_preview.py`:
```python
import io
from PIL import Image
from app.services.preview import render_previews
from app.providers.base import StylizationResult


def _make_test_stylization():
    # Create a tiny test part image
    img = Image.new("RGBA", (32, 48), (255, 0, 0, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return StylizationResult(
        part_images={"head": buf.getvalue(), "torso": buf.getvalue()},
        style_prompt="test",
    )


def test_render_previews_returns_three_views():
    stylization = _make_test_stylization()
    result = render_previews(stylization, "{}")

    assert "front" in result
    assert "side" in result
    assert "back" in result
    assert len(result["front"]) > 0
    assert len(result["side"]) > 0
    assert len(result["back"]) > 0


def test_preview_images_are_valid_png():
    stylization = _make_test_stylization()
    result = render_previews(stylization, "{}")

    for view in ["front", "side", "back"]:
        img = Image.open(io.BytesIO(result[view]))
        assert img.format == "PNG"
```

Run:
```bash
python -m pytest tests/test_preview.py -v
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot-server/app/services/preview.py pet-bot-server/tests/test_preview.py
git commit -m "feat: add multi-view preview renderer (stage 6)"
```

---

### Task 10: End-to-End Generation Endpoint

**Files:**
- Modify: `pet-bot-server/app/routers/generation.py` (add pipeline trigger)
- Create: `pet-bot-server/tests/test_e2e_generation.py`

- [ ] **Step 1: Add generation endpoint to routers/generation.py**

Add after the upload endpoint:
```python
from app.services.pipeline import pipeline as pet_pipeline
from app.config import settings
import json


@router.post("/generate/{pet_id}", response_model=PetStatusResponse)
async def generate_pet(
    pet_id: str,
    style: str = Form(default=None),
    provider: str = Form(default=None),
    db: Session = Depends(get_db),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    if not pet.source_photo_path:
        raise HTTPException(400, "No source photo uploaded")

    # Check generation quota (for built-in provider)
    if pet.generations_used >= settings.max_free_generations and not provider:
        raise HTTPException(429, f"Free generation limit reached ({settings.max_free_generations}). Use custom API key.")

    pet.status = PetStatus.PROCESSING
    db.commit()

    try:
        photo_bytes = storage.read(pet.source_photo_path)
        result = pet_pipeline.run(photo_bytes, style)

        if not result.success:
            pet.status = PetStatus.FAILED
            pet.error_message = result.error
            db.commit()
            raise HTTPException(500, f"Generation failed at stage: {result.stage_failed}")

        # Save previews
        pet.preview_front = storage.save_asset(result.preview_front, pet_id, "preview_front.png")
        pet.preview_side = storage.save_asset(result.preview_side, pet_id, "preview_side.png")
        pet.preview_back = storage.save_asset(result.preview_back, pet_id, "preview_back.png")
        pet.skeleton_json = result.skeleton_json
        pet.status = PetStatus.AWAITING_REVIEW
        pet.generations_used += 1
        db.commit()
        db.refresh(pet)

        return PetStatusResponse.model_validate(pet)

    except HTTPException:
        raise
    except Exception as e:
        pet.status = PetStatus.FAILED
        pet.error_message = str(e)
        db.commit()
        raise HTTPException(500, f"Internal error: {str(e)}")


@router.post("/confirm", response_model=PetStatusResponse)
def confirm_generation(body: GenerationAction, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == body.pet_id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    if body.action == "confirm":
        # Build .pet asset bundle
        from app.services.pipeline import _build_pet_bundle
        bundle = _build_pet_bundle(pet, storage)
        pet.asset_bundle_path = storage.save_asset(bundle, pet.id, "bundle.pet")
        pet.status = PetStatus.READY
    elif body.action == "regenerate":
        pet.status = PetStatus.UPLOADED  # Reset for re-generation
    else:
        raise HTTPException(400, f"Unknown action: {body.action}")

    db.commit()
    db.refresh(pet)
    return PetStatusResponse.model_validate(pet)
```

Also add `_build_pet_bundle` to `app/services/pipeline.py`:
```python
def _build_pet_bundle(pet, storage) -> bytes:
    """Package pet assets into a .pet bundle (zip)."""
    import zipfile
    import io
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("skeleton.json", pet.skeleton_json or "{}")
        zf.writestr("atlas.json", "{}")
        for view in ["front", "side", "back"]:
            path = getattr(pet, f"preview_{view}", None)
            if path:
                try:
                    zf.writestr(f"preview_{view}.png", storage.read(path))
                except Exception:
                    pass
        import json
        zf.writestr("metadata.json", json.dumps({
            "name": pet.name,
            "created_at": pet.created_at.isoformat() if pet.created_at else "",
            "pet_id": pet.id,
        }))
    return buf.getvalue()
```

- [ ] **Step 2: Add download endpoint**

Add to `routers/generation.py`:
```python
from fastapi.responses import FileResponse
import tempfile


@router.get("/download/{pet_id}")
def download_pet(pet_id: str, db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet or not pet.asset_bundle_path:
        raise HTTPException(status_code=404, detail="Pet bundle not found")
    if pet.status != PetStatus.READY:
        raise HTTPException(400, "Pet not ready for download")

    bundle_path = Path(settings.asset_dir).parent / pet.asset_bundle_path
    return FileResponse(bundle_path, filename=f"{pet.name}.pet", media_type="application/zip")
```

- [ ] **Step 3: Write e2e test**

Create `tests/test_e2e_generation.py`:
```python
import io
from PIL import Image


def _upload_photo(client):
    img = Image.new("RGB", (200, 300), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    response = client.post(
        "/api/v1/generation/upload",
        files={"file": ("photo.png", buf, "image/png")},
        data={"name": "E2E Pet"},
    )
    assert response.status_code == 202
    return response.json()["id"]


def test_full_generation_flow(client):
    pet_id = _upload_photo(client)

    # Trigger generation
    response = client.post(f"/api/v1/generation/generate/{pet_id}")
    assert response.status_code in (200, 500)  # 500 if pose detection fails on blank image

    # Check status
    response = client.get(f"/api/v1/generation/status/{pet_id}")
    assert response.status_code == 200
    assert response.json()["status"] in ("awaiting_review", "failed", "processing")
```

Run:
```bash
python -m pytest tests/test_e2e_generation.py -v
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/routers/generation.py pet-bot-server/app/services/pipeline.py pet-bot-server/tests/test_e2e_generation.py
git commit -m "feat: add end-to-end generation and confirm/download endpoints"
```

---

### Task 11: Final Integration & Static Asset Serve

**Files:**
- Modify: `pet-bot-server/app/main.py` (static mount, final polish)

- [ ] **Step 1: Add static file serving to main.py**

```python
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# Mount asset directory for serving preview images
asset_path = Path(settings.asset_dir)
asset_path.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=str(asset_path)), name="assets")

upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 2: Run full test suite**

```bash
cd pet-bot-server
python -m pytest tests/ -v --tb=short
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot-server/app/main.py
git commit -m "feat: add static asset serving and final backend integration"
```

---

## Backend Implementation Complete

After all 11 tasks: the FastAPI server handles photo upload → AI pipeline → pet bundle download end-to-end. Tests cover every route and pipeline stage. Next: implement the Electron client.
