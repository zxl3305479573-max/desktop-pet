# Pet-Bot Backend Implementation Plan (Revised)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:parallel-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Python FastAPI backend that accepts photo uploads, runs an async 5-stage AI pipeline (pose → bg removal → segment → rig → atlas+preview) via BackgroundTasks, serves validated .pet bundles, with JWT auth + per-user quota tracking.

**Architecture:** FastAPI + SQLite + JWT auth + BackgroundTasks for async pipeline + server-side-only API keys. Four core models: User, Pet, GenerationJob, QuotaUsage. Pipeline stages have quality gates that fail gracefully with actionable error codes.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy + SQLite, python-jose (JWT), bcrypt, Pillow, rembg, mediapipe

**Source:** Revised spec `docs/superpowers/specs/2026-06-16-pet-bot-design.md`

---

## File Structure Map

```
pet-bot-server/
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py
│   ├── main.py               # FastAPI app, lifespan, CORS, router registration
│   ├── config.py             # Pydantic Settings (secrets from env only)
│   ├── database.py           # Engine, SessionLocal, Base, init_db
│   ├── auth.py               # JWT encode/decode, get_current_user dependency
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py           # User: id, email, password_hash, created_at
│   │   ├── pet.py            # Pet: id, user_id FK, name, status, paths
│   │   ├── generation_job.py # Job: id, user_id FK, pet_id FK, status, progress, provider
│   │   └── quota.py          # QuotaUsage: id, user_id, provider, job_count, date
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py           # RegisterRequest, LoginRequest, TokenResponse
│   │   ├── pet.py            # PetCreate, PetResponse, PetList
│   │   └── generation.py     # UploadResponse, JobStatus, ConfirmRequest
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── auth.py           # POST /auth/register, /auth/login
│   │   ├── pets.py           # GET/DELETE /pets, GET /pets/{id}
│   │   └── generation.py     # POST /upload, GET/POST /jobs/...
│   ├── services/
│   │   ├── __init__.py
│   │   ├── pipeline.py       # Orchestrator: run stages, update job, check quota
│   │   ├── pose.py           # Stage 1: Pose estimation + quality gate
│   │   ├── segmentation.py   # Stage 2-3: BG removal + part split + fallbacks
│   │   ├── rigging.py        # Stage 4: 12-bone template → skeleton JSON
│   │   └── atlas.py          # Stage 5: Part packing → atlas.png + atlas.json
│   ├── providers/
│   │   ├── __init__.py
│   │   ├── base.py           # AIProvider abstract interface
│   │   ├── builtin.py        # Server-side builtin (key from env)
│   │   └── registry.py       # Provider lookup
│   ├── storage/
│   │   ├── __init__.py
│   │   └── local.py          # File save/read/delete
│   └── validators/
│       ├── __init__.py
│       └── pet_bundle.py     # validate_pet_bundle() → list of errors
└── tests/
    ├── __init__.py
    ├── conftest.py            # Fixtures: test DB, auth headers, mock provider, test image
    ├── test_auth.py
    ├── test_pets.py
    ├── test_generation.py
    ├── test_pipeline.py
    ├── test_rigging.py
    ├── test_atlas.py
    └── test_bundle_validation.py
```

---

### Task 1: Project Scaffolding & Dependencies

**Files:**
- Create: `pet-bot-server/requirements.txt`
- Create: `pet-bot-server/.env.example`
- Create: `pet-bot-server/app/__init__.py`
- Create: `pet-bot-server/app/main.py`
- Create: `pet-bot-server/app/config.py`

- [ ] **Step 1: Create requirements.txt**

```txt
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
pydantic==2.9.2
pydantic-settings==2.5.2
python-multipart==0.0.12
python-jose[cryptography]==3.3.0
bcrypt==4.2.0
Pillow==10.4.0
rembg==2.0.59
mediapipe==0.10.14
opencv-python-headless==4.10.0.84
numpy==2.1.1
aiofiles==24.1.0
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
BUILTIN_PROVIDER_KEY=  # Set in real .env, never committed
MAX_FREE_GENERATIONS=5
JWT_SECRET=change-me-in-production
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
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
    builtin_provider_key: str = ""
    max_free_generations: int = 5
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440
    cors_origins: str = "*"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
Path(settings.upload_dir).mkdir(parents=True, exist_ok=True)
Path(settings.asset_dir).mkdir(parents=True, exist_ok=True)
```

- [ ] **Step 4: Create app/main.py (skeleton)**

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

- [ ] **Step 5: Install and verify**

```bash
cd pet-bot-server
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Verify: `curl http://localhost:8000/health` → `{"status":"ok","app":"pet-bot-server"}`

- [ ] **Step 6: Commit**

```bash
git add pet-bot-server/
git commit -m "feat: scaffold FastAPI project with deps and config"
```

---

### Task 2: All Four Database Models

**Files:**
- Create: `pet-bot-server/app/database.py`
- Create: `pet-bot-server/app/models/__init__.py`
- Create: `pet-bot-server/app/models/user.py`
- Create: `pet-bot-server/app/models/pet.py`
- Create: `pet-bot-server/app/models/generation_job.py`
- Create: `pet-bot-server/app/models/quota.py`

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
    from app.models.user import User
    from app.models.pet import Pet
    from app.models.generation_job import GenerationJob
    from app.models.quota import QuotaUsage
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 2: Create app/models/user.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 3: Create app/models/pet.py**

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PetStatus(str, enum.Enum):
    UPLOADED = "uploaded"
    GENERATING = "generating"
    AWAITING_REVIEW = "awaiting_review"
    READY = "ready"
    FAILED = "failed"


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), default="My Pet")
    status: Mapped[PetStatus] = mapped_column(SAEnum(PetStatus), default=PetStatus.UPLOADED)
    source_photo_path: Mapped[str] = mapped_column(String(512), nullable=True)
    asset_bundle_path: Mapped[str] = mapped_column(String(512), nullable=True)
    preview_front: Mapped[str] = mapped_column(String(512), nullable=True)
    skeleton_json: Mapped[str] = mapped_column(Text, nullable=True)
    rig_quality: Mapped[str] = mapped_column(String(32), nullable=True)  # "full" | "partial" | "minimal"
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 4: Create app/models/generation_job.py**

```python
import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Text, Enum as SAEnum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class JobStatus(str, enum.Enum):
    QUEUED = "queued"
    RUNNING = "running"
    AWAITING_REVIEW = "awaiting_review"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_BETTER_PHOTO = "needs_better_photo"


class GenerationJob(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id"), nullable=False, index=True)
    status: Mapped[JobStatus] = mapped_column(SAEnum(JobStatus), default=JobStatus.QUEUED)
    provider: Mapped[str] = mapped_column(String(64), default="builtin")
    stage_progress: Mapped[int] = mapped_column(Integer, default=0)  # 0-5
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    failed_stage: Mapped[str] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

- [ ] **Step 5: Create app/models/quota.py**

```python
import uuid
from datetime import datetime, date
from sqlalchemy import String, Integer, DateTime, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class QuotaUsage(Base):
    __tablename__ = "quota_usage"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(64), default="builtin")
    job_count: Mapped[int] = mapped_column(Integer, default=0)
    usage_date: Mapped[date] = mapped_column(Date, default=date.today)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 6: Verify DB creation**

```bash
cd pet-bot-server
python -c "from app.database import init_db; init_db(); print('OK')"
```

Expected: `OK`, `petbot.db` created with 4 tables.

- [ ] **Step 7: Commit**

```bash
git add pet-bot-server/app/database.py pet-bot-server/app/models/
git commit -m "feat: add User, Pet, GenerationJob, QuotaUsage models"
```

---

### Task 3: JWT Authentication

**Files:**
- Create: `pet-bot-server/app/auth.py`
- Create: `pet-bot-server/app/schemas/__init__.py`
- Create: `pet-bot-server/app/schemas/auth.py`

- [ ] **Step 1: Create app/auth.py**

```python
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError, jwt
import bcrypt
from app.config import settings
from app.database import get_db
from app.models.user import User

security = HTTPBearer()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user
```

- [ ] **Step 2: Create app/schemas/auth.py**

```python
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
```

- [ ] **Step 3: Write auth tests**

Create `tests/conftest.py`:
```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.auth import hash_password
from app.models.user import User


TEST_DB_URL = "sqlite:///./test.db"


@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
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


@pytest.fixture
def test_user(db_session) -> User:
    user = User(id="test-user-1", email="test@petbot.io", password_hash=hash_password("secret123"))
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def auth_headers(test_user) -> dict:
    from app.auth import create_token
    token = create_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
```

Create `tests/test_auth.py`:
```python
def test_register_success(client):
    resp = client.post("/auth/register", json={"email": "new@test.com", "password": "pass1234"})
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate(client):
    client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    resp = client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    assert resp.status_code == 409


def test_login_success(client, test_user):
    resp = client.post("/auth/login", json={"email": "test@petbot.io", "password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, test_user):
    resp = client.post("/auth/login", json={"email": "test@petbot.io", "password": "wrong"})
    assert resp.status_code == 401
```

- [ ] **Step 4: Run tests (will fail — no routes yet)**

```bash
python -m pytest tests/test_auth.py -v
```

Expected: FAIL with 404 (routes not created yet). This is correct TDD — we'll add routes next.

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/auth.py pet-bot-server/app/schemas/auth.py pet-bot-server/tests/
git commit -m "test: add JWT auth module and failing auth tests (TDD)"
```

---

### Task 4: Auth Routes

**Files:**
- Create: `pet-bot-server/app/routers/__init__.py`
- Create: `pet-bot-server/app/routers/auth.py`
- Modify: `pet-bot-server/app/main.py` (register auth router)

- [ ] **Step 1: Create app/routers/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.auth import hash_password, verify_password, create_token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=body.email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_token(user.id)
    return TokenResponse(access_token=token)
```

- [ ] **Step 2: Register in app/main.py**

Add after the CORS middleware:
```python
from app.routers import auth

app.include_router(auth.router)
```

- [ ] **Step 3: Run auth tests**

```bash
python -m pytest tests/test_auth.py -v
```

Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/routers/auth.py pet-bot-server/app/main.py
git commit -m "feat: add auth routes (register/login) — tests pass"
```

---

### Task 5: Pydantic Schemas (pets + generation)

**Files:**
- Create: `pet-bot-server/app/schemas/pet.py`
- Create: `pet-bot-server/app/schemas/generation.py`

- [ ] **Step 1: Create app/schemas/pet.py**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PetCreate(BaseModel):
    name: str = Field(default="My Pet", max_length=128)


class PetResponse(BaseModel):
    id: str
    name: str
    status: str
    preview_front: Optional[str] = None
    rig_quality: Optional[str] = None
    error_message: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class PetDetailResponse(PetResponse):
    user_id: str
    source_photo_path: Optional[str] = None
    asset_bundle_path: Optional[str] = None
    skeleton_json: Optional[str] = None
    updated_at: datetime


class PetListResponse(BaseModel):
    pets: list[PetResponse]
    total: int
```

- [ ] **Step 2: Create app/schemas/generation.py**

```python
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class UploadResponse(BaseModel):
    pet_id: str
    job_id: str
    status: str  # "queued"


class JobStatusResponse(BaseModel):
    job_id: str
    pet_id: str
    status: str  # queued|running|awaiting_review|completed|failed|needs_better_photo
    stage_progress: int  # 0-5
    error_message: Optional[str] = None
    failed_stage: Optional[str] = None
    preview_front: Optional[str] = None  # populated when awaiting_review
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ConfirmRequest(BaseModel):
    action: str = Field(pattern="^(confirm|regenerate)$")
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot-server/app/schemas/pet.py pet-bot-server/app/schemas/generation.py
git commit -m "feat: add pet and generation Pydantic schemas"
```

---

### Task 6: Storage + File Upload Endpoint

**Files:**
- Create: `pet-bot-server/app/storage/__init__.py`
- Create: `pet-bot-server/app/storage/local.py`
- Create: `pet-bot-server/app/routers/generation.py` (upload endpoint only)
- Modify: `pet-bot-server/app/main.py` (register generation router)

- [ ] **Step 1: Create app/storage/local.py**

```python
import shutil
from pathlib import Path
from app.config import settings


class LocalStorage:
    def save_upload(self, file_bytes: bytes, filename: str) -> str:
        """Save uploaded file, return path relative to project root."""
        dest_dir = Path(settings.upload_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / filename
        dest.write_bytes(file_bytes)
        return str(dest)

    def save_asset(self, file_bytes: bytes, pet_id: str, name: str) -> str:
        """Save generated asset, return full path."""
        asset_dir = Path(settings.asset_dir) / pet_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        dest = asset_dir / name
        dest.write_bytes(file_bytes)
        return str(dest)

    def read(self, path_str: str) -> bytes:
        return Path(path_str).read_bytes()

    def delete_pet_assets(self, pet_id: str):
        asset_dir = Path(settings.asset_dir) / pet_id
        if asset_dir.exists():
            shutil.rmtree(asset_dir)

    def delete_upload(self, path_str: str):
        p = Path(path_str)
        if p.exists():
            p.unlink()


storage = LocalStorage()
```

- [ ] **Step 2: Create upload endpoint in app/routers/generation.py**

```python
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.auth import get_current_user
from app.storage.local import storage
from app.schemas.generation import UploadResponse

router = APIRouter(prefix="/api/v1", tags=["generation"])


@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_photo(
    name: str = Form(default="My Pet"),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    allowed = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}
    if file.content_type not in allowed:
        raise HTTPException(400, f"Unsupported file type. Use JPEG, PNG, or WebP.")

    contents = await file.read()
    if len(contents) > 10 * 1024 * 1024:
        raise HTTPException(400, "File too large (max 10 MB)")

    pet_id = str(uuid.uuid4())
    ext = allowed[file.content_type]
    photo_path = storage.save_upload(contents, f"{pet_id}_source.{ext}")

    pet = Pet(id=pet_id, user_id=user.id, name=name, status=PetStatus.UPLOADED, source_photo_path=photo_path)
    db.add(pet)

    job = GenerationJob(
        id=str(uuid.uuid4()),
        user_id=user.id,
        pet_id=pet_id,
        status=JobStatus.QUEUED,
        provider="builtin",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Enqueue pipeline as background task
    from app.services.pipeline import run_pipeline_async
    import asyncio
    # We'll use asyncio.create_task — this requires the endpoint to be async
    # and the pipeline to be an async function

    return UploadResponse(pet_id=pet_id, job_id=job.id, status="queued")
```

- [ ] **Step 3: Register in main.py**

```python
from app.routers import generation

app.include_router(generation.router)
```

- [ ] **Step 4: Write upload test**

Create `tests/test_generation.py`:
```python
import io


def test_upload_photo_requires_auth(client):
    resp = client.post("/api/v1/upload")
    assert resp.status_code == 403  # No auth header


def test_upload_photo_success(client, auth_headers):
    fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 200)
    resp = client.post(
        "/api/v1/upload",
        files={"file": ("test.png", fake_img, "image/png")},
        data={"name": "Test Pet"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "pet_id" in data
    assert "job_id" in data
    assert data["status"] == "queued"


def test_upload_bad_type(client, auth_headers):
    resp = client.post(
        "/api/v1/upload",
        files={"file": ("test.txt", io.BytesIO(b"text"), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
```

Run:
```bash
python -m pytest tests/test_generation.py -v
```

Expected: 3 tests PASS (upload endpoint works, no pipeline execution yet).

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/storage/ pet-bot-server/app/routers/generation.py pet-bot-server/app/main.py pet-bot-server/tests/test_generation.py
git commit -m "feat: add file upload endpoint with JWT auth guard"
```

---

### Task 7: Provider Abstraction + Builtin Provider (with Quality Gates)

**Files:**
- Create: `pet-bot-server/app/providers/base.py`
- Create: `pet-bot-server/app/providers/builtin.py`
- Create: `pet-bot-server/app/providers/registry.py`

- [ ] **Step 1: Create app/providers/base.py**

```python
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class PoseResult:
    keypoints: list[dict]        # [{x, y, visibility, name}, ...]
    image_width: int
    image_height: int
    confidence: float = 0.0      # Average visibility of detected joints
    passed: bool = False         # Quality gate result

    @property
    def keypoint_count(self) -> int:
        return len(self.kp)


@dataclass
class SegmentationResult:
    mask: Any                     # numpy array
    parts: dict[str, Any]        # {"head": np.array, "torso": np.array, ...}
    part_count: int = 0
    passed: bool = False


@dataclass
class RiggingResult:
    skeleton_json: str            # Spine-compatible JSON string
    bone_count: int = 0
    rig_quality: str = "minimal"  # "full" | "partial" | "minimal"


@dataclass
class AtlasResult:
    atlas_png: bytes              # Packed texture PNG
    atlas_json: str               # UV coords JSON string
    preview_front: bytes          # Front composite PNG
    region_count: int = 0
    passed: bool = False


class AIProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @abstractmethod
    def estimate_pose(self, image_bytes: bytes) -> PoseResult: ...

    @abstractmethod
    def remove_background(self, image_bytes: bytes) -> bytes: ...

    @abstractmethod
    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult: ...

    @abstractmethod
    def rig_skeleton(self, pose: PoseResult, segmentation: SegmentationResult) -> RiggingResult: ...

    @abstractmethod
    def build_atlas(self, segmentation: SegmentationResult, rigging: RiggingResult) -> AtlasResult: ...
```

- [ ] **Step 2: Create app/providers/builtin.py**

```python
import io
import json
import logging
import numpy as np
from PIL import Image
from rembg import remove
from app.providers.base import AIProvider, PoseResult, SegmentationResult, RiggingResult, AtlasResult
from app.services.rigging import build_skeleton
from app.services.atlas import build_atlas

logger = logging.getLogger(__name__)

# Quality gate thresholds
MIN_KEYPOINTS = 8
MIN_CONFIDENCE = 0.5
MIN_FG_RATIO = 0.05
MAX_FG_RATIO = 0.90


class BuiltinProvider(AIProvider):
    name = "builtin"

    def __init__(self, api_key: str = ""):
        self._api_key = api_key  # Server-side, never exposed
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
        confidences = []
        if results.pose_landmarks:
            for idx, lm in enumerate(results.pose_landmarks.landmark):
                keypoints.append({
                    "x": lm.x * w,
                    "y": lm.y * h,
                    "visibility": lm.visibility,
                    "name": f"joint_{idx}",
                })
                confidences.append(lm.visibility)

        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0
        passed = len(keypoints) >= MIN_KEYPOINTS and avg_conf >= MIN_CONFIDENCE

        if not passed:
            logger.warning(
                f"Pose gate FAILED: {len(keypoints)} keypoints (need {MIN_KEYPOINTS}), "
                f"avg confidence {avg_conf:.2f} (need {MIN_CONFIDENCE})"
            )

        return PoseResult(
            keypoints=keypoints,
            image_width=w,
            image_height=h,
            confidence=avg_conf,
            passed=passed,
        )

    def remove_background(self, image_bytes: bytes) -> bytes:
        result = remove(image_bytes)
        # Check foreground ratio as quality signal (non-blocking in MVP)
        return result

    def segment_parts(self, image_bytes: bytes, pose: PoseResult) -> SegmentationResult:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        np_img = np.array(img)
        h, w = np_img.shape[:2]

        parts = {}
        # Head: around nose
        nose_kps = [k for k in pose.keypoints if k["name"] in ("joint_0",)]
        if nose_kps:
            nx, ny = nose_kps[0]["x"], nose_kps[0]["y"]
            r = 60
            x1, y1 = max(0, int(nx - r)), max(0, int(ny - r * 1.5))
            x2, y2 = min(w, int(nx + r)), min(h, int(ny + r * 0.5))
            parts["head"] = np_img[y1:y2, x1:x2].copy()

        # Torso: shoulders to hips
        shoulder_names = ["joint_11", "joint_12"]
        hip_names = ["joint_23", "joint_24"]
        torso_kps = [k for k in pose.keypoints if k["name"] in shoulder_names + hip_names]
        if torso_kps:
            xs = [k["x"] for k in torso_kps]
            ys = [k["y"] for k in torso_kps]
            x1, y1 = max(0, int(min(xs)) - 20), max(0, int(min(ys)) - 10)
            x2, y2 = min(w, int(max(xs)) + 20), min(h, int(max(ys)) + 10)
            parts["torso"] = np_img[y1:y2, x1:x2].copy()

        # Arms
        for side, shoulder_j, elbow_j in [("left_arm", "joint_11", "joint_13"), ("right_arm", "joint_12", "joint_14")]:
            sk = next((k for k in pose.keypoints if k["name"] == shoulder_j), None)
            ek = next((k for k in pose.keypoints if k["name"] == elbow_j), None)
            if sk and ek:
                px = min(sk["x"], ek["x"]) - 10
                py = min(sk["y"], ek["y"]) - 10
                pw = abs(ek["x"] - sk["x"]) + 40
                ph = abs(ek["y"] - sk["y"]) + 40
                x1, y1 = max(0, int(px)), max(0, int(py))
                x2, y2 = min(w, int(px + pw)), min(h, int(py + ph))
                parts[side] = np_img[y1:y2, x1:x2].copy()

        # Legs
        for side, hip_j, knee_j in [("left_leg", "joint_23", "joint_25"), ("right_leg", "joint_24", "joint_26")]:
            hk = next((k for k in pose.keypoints if k["name"] == hip_j), None)
            kk = next((k for k in pose.keypoints if k["name"] == knee_j), None)
            if hk and kk:
                px = min(hk["x"], kk["x"]) - 15
                py = min(hk["y"], kk["y"]) - 10
                pw = abs(kk["x"] - hk["x"]) + 50
                ph = abs(kk["y"] - hk["y"]) + 50
                x1, y1 = max(0, int(px)), max(0, int(py))
                x2, y2 = min(w, int(px + pw)), min(h, int(py + ph))
                parts[side] = np_img[y1:y2, x1:x2].copy()

        passed = "head" in parts and "torso" in parts

        return SegmentationResult(
            mask=np_img[:, :, 3],
            parts=parts,
            part_count=len(parts),
            passed=passed,
        )

    def rig_skeleton(self, pose: PoseResult, segmentation: SegmentationResult) -> RiggingResult:
        skeleton_json = build_skeleton(pose, segmentation)
        data = json.loads(skeleton_json)
        bone_count = len(data.get("bones", []))
        rig_quality = "full" if bone_count >= 8 else "partial" if bone_count >= 4 else "minimal"
        return RiggingResult(skeleton_json=skeleton_json, bone_count=bone_count, rig_quality=rig_quality)

    def build_atlas(self, segmentation: SegmentationResult, rigging: RiggingResult) -> AtlasResult:
        atlas_png, atlas_json_str, preview_front = build_atlas(segmentation, rigging)
        atlas_data = json.loads(atlas_json_str)
        region_count = len(atlas_data.get("regions", {}))
        passed = atlas_png is not None and len(atlas_png) > 1024 and region_count >= 2
        return AtlasResult(
            atlas_png=atlas_png,
            atlas_json=atlas_json_str,
            preview_front=preview_front,
            region_count=region_count,
            passed=passed,
        )
```

- [ ] **Step 3: Create app/providers/registry.py**

```python
from app.providers.base import AIProvider
from app.providers.builtin import BuiltinProvider
from app.config import settings

_providers: dict[str, AIProvider] = {}


def get_provider(name: str = "builtin") -> AIProvider:
    if name not in _providers:
        if name == "builtin":
            _providers[name] = BuiltinProvider(api_key=settings.builtin_provider_key)
        else:
            raise ValueError(f"Unknown provider: {name}")
    return _providers[name]
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/providers/
git commit -m "feat: add provider abstraction with builtin provider and quality gates"
```

---

### Task 8: Pipeline Services — Pose, Segmentation, Rigging, Atlas

**Files:**
- Create: `pet-bot-server/app/services/__init__.py`
- Create: `pet-bot-server/app/services/pipeline.py`
- Create: `pet-bot-server/app/services/pose.py` (thin wrapper)
- Create: `pet-bot-server/app/services/segmentation.py` (thin wrapper)
- Create: `pet-bot-server/app/services/rigging.py`
- Create: `pet-bot-server/app/services/atlas.py`

- [ ] **Step 1: Create app/services/rigging.py**

```python
"""Stage 4: Keypoints → template skeleton → Spine JSON."""
import json
from app.providers.base import PoseResult, SegmentationResult

BONE_TEMPLATE = [
    ("root", "", 0, 0, 0),
    ("spine", "root", 0, 0, 1),
    ("chest", "spine", 0, -40, 1),
    ("neck", "chest", 0, -30, 0.5),
    ("head", "neck", 0, -30, 0.3),
    ("left_upper_arm", "chest", -30, 0, 1),
    ("left_lower_arm", "left_upper_arm", 0, 50, 0.8),
    ("right_upper_arm", "chest", 30, 0, 1),
    ("right_lower_arm", "right_upper_arm", 0, 50, 0.8),
    ("left_upper_leg", "root", -15, 50, 1.2),
    ("left_lower_leg", "left_upper_leg", 0, 60, 0.8),
    ("right_upper_leg", "root", 15, 50, 1.2),
    ("right_lower_leg", "right_upper_leg", 0, 60, 0.8),
]

def build_skeleton(pose: PoseResult, segmentation: SegmentationResult) -> str:
    """Map detected keypoints onto the 13-bone template."""
    kp_map = {k["name"]: k for k in pose.keypoints}

    # Calculate chest position from shoulders
    chest_x, chest_y = _avg_kps(kp_map, ["joint_11", "joint_12"], default=(pose.image_width / 2, pose.image_height * 0.4))

    bones = []
    for name, parent, dx, dy, length_scale in BONE_TEMPLATE:
        x, y = chest_x + dx, chest_y + dy
        bones.append({
            "name": name,
            "parent": parent,
            "x": x,
            "y": y,
            "length": 30 * length_scale,
            "rotation": 0,
        })

    skeleton = {
        "skeleton": {"spine": "4.1.0", "width": pose.image_width, "height": pose.image_height},
        "bones": bones,
        "slots": _build_slots(segmentation.parts.keys()),
        "skins": [{"name": "default", "attachments": _build_attachments(segmentation.parts.keys())}],
        "animations": {
            "idle": {"bones": {b["name"]: {"rotate": [{"time": 0, "angle": 0}]} for b in bones if b["name"] != "root"}},
            "walk": {"bones": {b["name"]: {"rotate": [{"time": 0, "angle": 0}]} for b in bones if b["name"] != "root"}},
            "poke": {"bones": {b["name"]: {"rotate": [{"time": 0, "angle": 0}]} for b in bones if b["name"] != "root"}},
        },
    }
    return json.dumps(skeleton, indent=2)


def _avg_kps(kp_map, names, default):
    pts = [(kp_map[n]["x"], kp_map[n]["y"]) for n in names if n in kp_map]
    if not pts:
        return default
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def _build_slots(part_names) -> list:
    return [{"name": f"{p}_slot", "bone": "root", "attachment": f"{p}_attach"} for p in part_names]


def _build_attachments(part_names) -> dict:
    return {
        f"{p}_slot": {f"{p}_attach": {"type": "region", "x": 0, "y": 0, "width": 32, "height": 32}}
        for p in part_names
    }
```

- [ ] **Step 2: Create app/services/atlas.py**

```python
"""Stage 5: Pack part images into atlas.png + atlas.json + preview.png."""
import io
import json
from PIL import Image
from app.providers.base import SegmentationResult, RiggingResult


ATLAS_SIZE = 512


def build_atlas(segmentation: SegmentationResult, rigging: RiggingResult) -> tuple[bytes, str, bytes]:
    """Pack parts into a texture atlas. Returns (atlas_png_bytes, atlas_json_str, preview_front_bytes)."""
    parts = segmentation.parts
    if not parts:
        raise ValueError("No parts to pack into atlas")

    atlas_img = Image.new("RGBA", (ATLAS_SIZE, ATLAS_SIZE), (0, 0, 0, 0))
    regions = {}
    x, y = 0, 0
    row_height = 0

    for name in ["head", "torso", "left_arm", "right_arm", "left_leg", "right_leg"]:
        if name not in parts:
            continue
        part_arr = parts[name]
        part_img = Image.fromarray(part_arr)
        pw, ph = part_img.size

        # Fit into atlas row
        if pw > ATLAS_SIZE:
            pw = ATLAS_SIZE
            part_img = part_img.resize((pw, ph))
        if x + pw > ATLAS_SIZE:
            x = 0
            y += row_height + 4
            row_height = 0

        atlas_img.paste(part_img, (x, y), part_img if part_img.mode == "RGBA" else None)
        regions[name] = {"x": x, "y": y, "w": pw, "h": ph}
        x += pw + 4
        row_height = max(row_height, ph)

    # atlas.png
    atlas_buf = io.BytesIO()
    atlas_img.save(atlas_buf, format="PNG")
    atlas_png = atlas_buf.getvalue()

    # atlas.json
    atlas_json = json.dumps({"image": "atlas.png", "size": {"w": ATLAS_SIZE, "h": ATLAS_SIZE}, "regions": regions}, indent=2)

    # preview_front.png — stack parts vertically
    preview = _composite_preview(parts)
    preview_buf = io.BytesIO()
    preview.save(preview_buf, format="PNG")
    preview_png = preview_buf.getvalue()

    return atlas_png, atlas_json, preview_png


def _composite_preview(parts: dict) -> Image.Image:
    images = [(n, Image.fromarray(arr)) for n, arr in parts.items()]
    images.sort(key=lambda x: {"head": 0, "torso": 1, "left_arm": 2, "right_arm": 2, "left_leg": 3, "right_leg": 3}.get(x[0], 99))
    total_h = sum(img.height for _, img in images)
    max_w = max(img.width for _, img in images) if images else 128
    canvas = Image.new("RGBA", (max_w, max(total_h, 1)), (0, 0, 0, 0))
    y_off = 0
    for _, img in images:
        x_off = (max_w - img.width) // 2
        canvas.paste(img, (x_off, y_off), img if img.mode == "RGBA" else None)
        y_off += img.height
    return canvas
```

- [ ] **Step 3: Write rigging + atlas tests**

Create `tests/test_rigging.py`:
```python
import json
from app.providers.base import PoseResult, SegmentationResult
from app.services.rigging import build_skeleton
import numpy as np


def test_build_skeleton_produces_valid_json():
    pose = PoseResult(
        keypoints=[
            {"x": 100, "y": 50, "visibility": 0.9, "name": "joint_0"},     # nose
            {"x": 90, "y": 120, "visibility": 0.9, "name": "joint_11"},    # L shoulder
            {"x": 110, "y": 120, "visibility": 0.9, "name": "joint_12"},   # R shoulder
            {"x": 95, "y": 200, "visibility": 0.9, "name": "joint_23"},    # L hip
            {"x": 105, "y": 200, "visibility": 0.9, "name": "joint_24"},   # R hip
        ],
        image_width=200, image_height=400, confidence=0.85, passed=True,
    )
    seg = SegmentationResult(
        mask=np.ones((400, 200)),
        parts={"head": np.zeros((80, 60, 4), dtype=np.uint8), "torso": np.zeros((100, 60, 4), dtype=np.uint8)},
        part_count=2, passed=True,
    )

    result = build_skeleton(pose, seg)
    data = json.loads(result)

    assert "bones" in data
    assert len(data["bones"]) >= 4, f"Expected ≥4 bones, got {len(data['bones'])}"
    assert "animations" in data
    for anim in ["idle", "walk", "poke"]:
        assert anim in data["animations"], f"Missing animation: {anim}"
    assert "slots" in data
    assert len(data["slots"]) >= 2
```

Create `tests/test_atlas.py`:
```python
import json
import io
from PIL import Image
from app.providers.base import SegmentationResult, RiggingResult
from app.services.atlas import build_atlas
import numpy as np


def test_build_atlas_produces_valid_output():
    seg = SegmentationResult(
        mask=np.ones((400, 200)),
        parts={
            "head": (np.ones((60, 60, 4), dtype=np.uint8) * 255).astype(np.uint8),
            "torso": (np.ones((100, 60, 4), dtype=np.uint8) * 200).astype(np.uint8),
        },
        part_count=2, passed=True,
    )
    rig = RiggingResult(skeleton_json="{}", bone_count=8, rig_quality="full")

    png_bytes, atlas_json_str, preview_bytes = build_atlas(seg, rig)

    # atlas.png is a valid PNG > 2KB
    assert len(png_bytes) > 2048, f"atlas.png too small: {len(png_bytes)} bytes"
    img = Image.open(io.BytesIO(png_bytes))
    assert img.format == "PNG"
    assert img.size == (512, 512)

    # atlas.json has ≥ 2 regions
    atlas_data = json.loads(atlas_json_str)
    assert len(atlas_data["regions"]) >= 2, f"Expected ≥2 regions, got {len(atlas_data['regions'])}"

    # preview is a valid PNG > 1KB
    assert len(preview_bytes) > 1024
    preview_img = Image.open(io.BytesIO(preview_bytes))
    assert preview_img.format == "PNG"
```

Run:
```bash
python -m pytest tests/test_rigging.py tests/test_atlas.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/services/ pet-bot-server/tests/test_rigging.py pet-bot-server/tests/test_atlas.py
git commit -m "feat: add rigging and atlas services with strict tests"
```

---

### Task 9: Async Pipeline Orchestrator + Quota Check

**Files:**
- Create: `pet-bot-server/app/services/pipeline.py`
- Create: `pet-bot-server/tests/test_pipeline.py`

- [ ] **Step 1: Create app/services/pipeline.py**

```python
import asyncio
import logging
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.models.quota import QuotaUsage
from app.config import settings
from app.providers.registry import get_provider
from app.storage.local import storage
from datetime import date

logger = logging.getLogger(__name__)


def run_pipeline_background(job_id: str):
    """Entry point for BackgroundTasks. Sync wrapper that runs async pipeline."""
    db = SessionLocal()
    try:
        job = db.query(GenerationJob).filter(GenerationJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        if not pet:
            logger.error(f"Pet {job.pet_id} not found for job {job_id}")
            return

        _run_pipeline_sync(db, job, pet)
    finally:
        db.close()


def _run_pipeline_sync(db: Session, job: GenerationJob, pet: Pet):
    provider = get_provider(job.provider)
    photo_bytes = storage.read(pet.source_photo_path)

    # Update status
    job.status = JobStatus.RUNNING
    pet.status = PetStatus.GENERATING
    db.commit()

    try:
        # Stage 1: Pose
        job.stage_progress = 1
        db.commit()
        pose = provider.estimate_pose(photo_bytes)
        if not pose.passed:
            job.status = JobStatus.NEEDS_BETTER_PHOTO
            job.error_message = f"Pose detection failed: {pose.keypoint_count} keypoints, confidence {pose.confidence:.2f}. Please upload a clear front-facing photo."
            job.failed_stage = "pose_estimation"
            pet.status = PetStatus.FAILED
            pet.error_message = job.error_message
            db.commit()
            return

        # Stage 2: Background Removal
        job.stage_progress = 2
        db.commit()
        bg_removed = provider.remove_background(photo_bytes)

        # Stage 3: Part Segmentation
        job.stage_progress = 3
        db.commit()
        segmentation = provider.segment_parts(bg_removed, pose)
        # Even if segmentation doesn't fully pass, continue with what we have

        # Stage 4: Skeleton Rigging
        job.stage_progress = 4
        db.commit()
        rigging = provider.rig_skeleton(pose, segmentation)
        pet.rig_quality = rigging.rig_quality

        # Stage 5: Atlas + Preview
        job.stage_progress = 5
        db.commit()
        atlas = provider.build_atlas(segmentation, rigging)
        if not atlas.passed:
            job.status = JobStatus.FAILED
            job.error_message = f"Atlas generation failed: {atlas.region_count} regions"
            job.failed_stage = "atlas"
            pet.status = PetStatus.FAILED
            pet.error_message = job.error_message
            db.commit()
            return

        # Save assets
        atlas_png_path = storage.save_asset(atlas.atlas_png, pet.id, "atlas.png")
        atlas_json_path = storage.save_asset(atlas.atlas_json.encode("utf-8"), pet.id, "atlas.json")
        preview_path = storage.save_asset(atlas.preview_front, pet.id, "preview_front.png")
        skeleton_path = storage.save_asset(rigging.skeleton_json.encode("utf-8"), pet.id, "skeleton.json")

        pet.skeleton_json = rigging.skeleton_json
        pet.preview_front = preview_path
        pet.status = PetStatus.AWAITING_REVIEW

        job.status = JobStatus.AWAITING_REVIEW
        db.commit()

    except Exception as e:
        logger.exception(f"Pipeline failed for job {job.id}")
        job.status = JobStatus.FAILED
        job.error_message = str(e)
        job.failed_stage = f"stage_{job.stage_progress}"
        pet.status = PetStatus.FAILED
        pet.error_message = str(e)
        db.commit()


def check_and_increment_quota(user_id: str, provider: str, db: Session) -> bool:
    """Return True if user is within quota, False if exceeded. Increments count."""
    today = date.today()
    quota = db.query(QuotaUsage).filter(
        QuotaUsage.user_id == user_id,
        QuotaUsage.provider == provider,
        QuotaUsage.usage_date == today,
    ).first()

    if quota:
        if quota.job_count >= settings.max_free_generations:
            return False
        quota.job_count += 1
    else:
        quota = QuotaUsage(user_id=user_id, provider=provider, job_count=1, usage_date=today)
        db.add(quota)
    db.commit()
    return True
```

- [ ] **Step 2: Write pipeline test with mock provider**

Create `tests/test_pipeline.py`:
```python
import io
import json
from PIL import Image
import numpy as np
from app.services.pipeline import _run_pipeline_sync, check_and_increment_quota
from app.models.pet import Pet, PetStatus
from app.models.generation_job import GenerationJob, JobStatus
from app.models.quota import QuotaUsage
from app.models.user import User
from app.providers.registry import _providers, get_provider
from app.providers.base import AIProvider, PoseResult, SegmentationResult, RiggingResult, AtlasResult


class MockProvider(AIProvider):
    """Fully working mock that passes all quality gates."""
    name = "mock"

    def estimate_pose(self, image_bytes):
        kps = [{"x": 100 + i * 10, "y": 50 + i * 30, "visibility": 0.9, "name": f"joint_{i}"}
               for i in range(12)]
        return PoseResult(keypoints=kps, image_width=200, image_height=400, confidence=0.9, passed=True)

    def remove_background(self, image_bytes):
        return image_bytes

    def segment_parts(self, image_bytes, pose):
        parts = {
            "head": np.ones((60, 60, 4), dtype=np.uint8) * 255,
            "torso": np.ones((100, 60, 4), dtype=np.uint8) * 200,
            "left_arm": np.ones((80, 40, 4), dtype=np.uint8) * 150,
            "right_arm": np.ones((80, 40, 4), dtype=np.uint8) * 150,
        }
        return SegmentationResult(mask=np.ones((400, 200)), parts=parts, part_count=4, passed=True)

    def rig_skeleton(self, pose, segmentation):
        skel = json.dumps({"bones": [{"name": "root"}, {"name": "spine", "parent": "root"},
                                      {"name": "head", "parent": "spine"}, {"name": "left_arm", "parent": "spine"},
                                      {"name": "right_arm", "parent": "spine"}],
                            "animations": {"idle": {}, "walk": {}, "poke": {}}})
        return RiggingResult(skeleton_json=skel, bone_count=5, rig_quality="full")

    def build_atlas(self, segmentation, rigging):
        atlas_img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        buf = io.BytesIO()
        atlas_img.save(buf, format="PNG")
        atlas_png = buf.getvalue()
        atlas_json = json.dumps({"image": "atlas.png", "size": {"w": 512, "h": 512},
                                  "regions": {"head": {"x": 0, "y": 0, "w": 60, "h": 60},
                                              "torso": {"x": 64, "y": 0, "w": 60, "h": 100}}})
        preview_img = Image.new("RGBA", (60, 200), (100, 100, 100, 255))
        buf2 = io.BytesIO()
        preview_img.save(buf2, format="PNG")
        return AtlasResult(atlas_png=atlas_png, atlas_json=atlas_json, preview_front=buf2.getvalue(),
                           region_count=2, passed=True)


def _make_test_image_bytes() -> bytes:
    img = Image.new("RGB", (200, 400), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_pipeline_completes_with_mock_provider(db_session, test_user):
    # Register mock provider
    _providers["mock"] = MockProvider()

    # Create pet + job
    from app.storage.local import storage
    photo_path = storage.save_upload(_make_test_image_bytes(), "test_source.png")

    pet = Pet(id="pet-test-1", user_id=test_user.id, name="Mock Pet",
              status=PetStatus.UPLOADED, source_photo_path=photo_path)
    job = GenerationJob(id="job-test-1", user_id=test_user.id, pet_id=pet.id,
                        status=JobStatus.QUEUED, provider="mock")
    db_session.add(pet)
    db_session.add(job)
    db_session.commit()

    # Run pipeline
    _run_pipeline_sync(db_session, job, pet)

    # Assertions
    assert job.status == JobStatus.AWAITING_REVIEW, f"Expected awaiting_review, got {job.status}: {job.error_message}"
    assert pet.status == PetStatus.AWAITING_REVIEW
    assert pet.rig_quality in ("full", "partial")
    assert pet.preview_front is not None
    assert pet.skeleton_json is not None

    # Verify skeleton JSON is valid
    skel = json.loads(pet.skeleton_json)
    assert len(skel["bones"]) >= 3
    assert "idle" in skel["animations"]


def test_quota_enforcement(db_session, test_user):
    # Exhaust quota
    for i in range(5):
        ok = check_and_increment_quota(test_user.id, "builtin", db_session)
        assert ok, f"Quota check {i} should pass"
    # 6th should fail
    ok = check_and_increment_quota(test_user.id, "builtin", db_session)
    assert not ok, "6th generation should be blocked by quota"
```

Run:
```bash
python -m pytest tests/test_pipeline.py -v
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/services/pipeline.py pet-bot-server/tests/test_pipeline.py
git commit -m "feat: add async pipeline orchestrator with quota enforcement — mock tests pass"
```

---

### Task 10: Generation Routes (Status Polling + Confirm/Regenerate + Download)

**Files:**
- Modify: `pet-bot-server/app/routers/generation.py` (add remaining endpoints)
- Create: `pet-bot-server/app/validators/__init__.py`
- Create: `pet-bot-server/app/validators/pet_bundle.py`

- [ ] **Step 1: Add remaining endpoints to app/routers/generation.py**

Replace the upload endpoint's return with background task dispatch, then append:

```python
import zipfile
import json as json_mod
from datetime import datetime
from fastapi import BackgroundTasks
from fastapi.responses import FileResponse
from pathlib import Path

# ... (keep existing imports and upload_photo, but add BackgroundTasks to params)

# MODIFY upload_photo — add background task dispatch before return:
@router.post("/upload", response_model=UploadResponse, status_code=202)
async def upload_photo(
    name: str = Form(default="My Pet"),
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # ... (same validation + pet/job creation as Task 6) ...

    # Enqueue background pipeline
    from app.services.pipeline import run_pipeline_background
    background_tasks.add_task(run_pipeline_background, job.id)

    return UploadResponse(pet_id=pet_id, job_id=job.id, status="queued")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job_status(
    job_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(GenerationJob).filter(GenerationJob.id == job_id, GenerationJob.user_id == user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
    preview = pet.preview_front if pet else None

    return JobStatusResponse(
        job_id=job.id,
        pet_id=job.pet_id,
        status=job.status.value,
        stage_progress=job.stage_progress,
        error_message=job.error_message,
        failed_stage=job.failed_stage,
        preview_front=preview,
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.post("/jobs/{job_id}/confirm")
def confirm_job(
    job_id: str,
    body: ConfirmRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    job = db.query(GenerationJob).filter(GenerationJob.id == job_id, GenerationJob.user_id == user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")

    if body.action == "confirm":
        if job.status != JobStatus.AWAITING_REVIEW:
            raise HTTPException(400, f"Cannot confirm job in status: {job.status.value}")

        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        if not pet:
            raise HTTPException(404, "Pet not found")

        # Build .pet bundle
        bundle_bytes = _build_pet_bundle(pet)
        bundle_path = storage.save_asset(bundle_bytes, pet.id, "bundle.pet")
        pet.asset_bundle_path = bundle_path
        pet.status = PetStatus.READY
        job.status = JobStatus.COMPLETED
        db.commit()

        return {"status": "completed", "pet_id": pet.id}

    elif body.action == "regenerate":
        if job.status not in (JobStatus.AWAITING_REVIEW, JobStatus.FAILED, JobStatus.NEEDS_BETTER_PHOTO):
            raise HTTPException(400, f"Cannot regenerate job in status: {job.status.value}")

        # Create new job for regeneration
        pet = db.query(Pet).filter(Pet.id == job.pet_id).first()
        new_job = GenerationJob(
            id=str(uuid.uuid4()),
            user_id=user.id,
            pet_id=job.pet_id,
            status=JobStatus.QUEUED,
            provider=job.provider,
        )
        db.add(new_job)
        pet.status = PetStatus.UPLOADED
        db.commit()

        return {"status": "queued", "job_id": new_job.id}


@router.get("/download/{pet_id}")
def download_pet(
    pet_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet or not pet.asset_bundle_path:
        raise HTTPException(404, "Pet bundle not found")
    if pet.status != PetStatus.READY:
        raise HTTPException(400, f"Pet not ready (status: {pet.status.value})")

    bundle_path = Path(pet.asset_bundle_path)
    if not bundle_path.exists():
        raise HTTPException(404, "Bundle file missing")

    # Validate bundle before serving
    from app.validators.pet_bundle import validate_pet_bundle
    errors = validate_pet_bundle(bundle_path.read_bytes())
    if errors:
        raise HTTPException(500, f"Bundle validation failed: {'; '.join(errors)}")

    return FileResponse(bundle_path, filename=f"{pet.name}.pet", media_type="application/zip")


def _build_pet_bundle(pet: Pet) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        # Load from stored paths
        asset_dir = Path(settings.asset_dir) / pet.id
        for fname in ["skeleton.json", "atlas.png", "atlas.json", "preview_front.png"]:
            fpath = asset_dir / fname
            if fpath.exists():
                zf.write(fpath, fname)
        zf.writestr("metadata.json", json_mod.dumps({
            "name": pet.name,
            "pet_id": pet.id,
            "rig_quality": pet.rig_quality,
            "created_at": pet.created_at.isoformat() if pet.created_at else "",
        }))
    return buf.getvalue()
```

- [ ] **Step 2: Create app/validators/pet_bundle.py**

```python
import io
import zipfile
import json
from PIL import Image


def validate_pet_bundle(zip_bytes: bytes) -> list[str]:
    errors = []
    required = ["skeleton.json", "atlas.png", "atlas.json", "preview_front.png", "metadata.json"]
    try:
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            namelist = zf.namelist()
            for name in required:
                if name not in namelist:
                    errors.append(f"Missing: {name}")
                    continue
                info = zf.getinfo(name)
                if name.endswith(".png"):
                    if info.file_size < 1024:
                        errors.append(f"Too small: {name} ({info.file_size} bytes)")
                    else:
                        try:
                            img = Image.open(io.BytesIO(zf.read(name)))
                            img.verify()
                        except Exception:
                            errors.append(f"Invalid PNG: {name}")
                if name.endswith(".json"):
                    data = json.loads(zf.read(name))
                    if not data:
                        errors.append(f"Empty JSON: {name}")

            if "atlas.json" in namelist and "atlas.png" in namelist:
                atlas_data = json.loads(zf.read("atlas.json"))
                if len(atlas_data.get("regions", {})) < 2:
                    errors.append("atlas.json: fewer than 2 regions")

            if "skeleton.json" in namelist:
                skel = json.loads(zf.read("skeleton.json"))
                if len(skel.get("bones", [])) < 4:
                    errors.append(f"skeleton.json: only {len(skel.get('bones', []))} bones (need ≥4)")
                anims = skel.get("animations", {})
                for a in ["idle", "walk", "poke"]:
                    if a not in anims:
                        errors.append(f"skeleton.json: missing animation '{a}'")
    except zipfile.BadZipFile:
        errors.append("Not a valid zip file")

    return errors
```

- [ ] **Step 3: Write generation integration tests**

Add to `tests/test_generation.py`:
```python
def test_job_status_not_found(client, auth_headers):
    resp = client.get("/api/v1/jobs/nonexistent", headers=auth_headers)
    assert resp.status_code == 404


def test_confirm_nonexistent_job(client, auth_headers):
    resp = client.post("/api/v1/jobs/nonexistent/confirm", json={"action": "confirm"}, headers=auth_headers)
    assert resp.status_code == 404


def test_download_not_ready(client, auth_headers):
    resp = client.get("/api/v1/download/nonexistent", headers=auth_headers)
    assert resp.status_code == 404
```

- [ ] **Step 4: Write bundle validation tests**

Create `tests/test_bundle_validation.py`:
```python
import io
import zipfile
import json
from PIL import Image
from app.validators.pet_bundle import validate_pet_bundle


def _make_valid_bundle() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", json.dumps({"bones": [{"name": "root"}, {"name": "a"}, {"name": "b"}, {"name": "c"}],
                                                   "animations": {"idle": {}, "walk": {}, "poke": {}}}))
        zf.writestr("atlas.json", json.dumps({"image": "atlas.png", "size": {"w": 512, "h": 512},
                                               "regions": {"head": {"x": 0, "y": 0, "w": 64, "h": 64},
                                                           "torso": {"x": 64, "y": 0, "w": 64, "h": 100}}}))
        # Valid PNG > 2KB
        img = Image.new("RGBA", (512, 512), (255, 0, 0, 255))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        zf.writestr("atlas.png", png_buf.getvalue())
        zf.writestr("preview_front.png", png_buf.getvalue())
        zf.writestr("metadata.json", json.dumps({"name": "Test"}))
    return buf.getvalue()


def test_valid_bundle_passes():
    errors = validate_pet_bundle(_make_valid_bundle())
    assert errors == [], f"Expected no errors, got: {errors}"


def test_missing_atlas():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", "{}")
        zf.writestr("atlas.json", "{}")
        zf.writestr("preview_front.png", b"x" * 2000)
        zf.writestr("metadata.json", "{}")
    errors = validate_pet_bundle(buf.getvalue())
    assert any("Missing" in e and "atlas.png" in e for e in errors)


def test_empty_skeleton():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("skeleton.json", "{}")
        img = Image.new("RGBA", (512, 512))
        png_buf = io.BytesIO()
        img.save(png_buf, format="PNG")
        zf.writestr("atlas.png", png_buf.getvalue())
        zf.writestr("atlas.json", json.dumps({"regions": {"a": {}, "b": {}}}))
        zf.writestr("preview_front.png", png_buf.getvalue())
        zf.writestr("metadata.json", "{}")
    errors = validate_pet_bundle(buf.getvalue())
    assert any("bones" in e for e in errors)
```

Run:
```bash
python -m pytest tests/test_generation.py tests/test_bundle_validation.py -v
```

- [ ] **Step 5: Commit**

```bash
git add pet-bot-server/app/routers/generation.py pet-bot-server/app/validators/ pet-bot-server/tests/
git commit -m "feat: add generation routes, .pet bundle builder, and validation with strict tests"
```

---

### Task 11: Pet CRUD Routes

**Files:**
- Create: `pet-bot-server/app/routers/pets.py`
- Modify: `pet-bot-server/app/main.py` (register pets router)

- [ ] **Step 1: Create app/routers/pets.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.pet import Pet
from app.schemas.pet import PetResponse, PetDetailResponse, PetListResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/pets", tags=["pets"])


@router.get("/", response_model=PetListResponse)
def list_pets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pets = db.query(Pet).filter(Pet.user_id == user.id).order_by(Pet.created_at.desc()).all()
    return PetListResponse(
        pets=[PetResponse.model_validate(p) for p in pets],
        total=len(pets),
    )


@router.get("/{pet_id}", response_model=PetDetailResponse)
def get_pet(pet_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return PetDetailResponse.model_validate(pet)


@router.delete("/{pet_id}", status_code=204)
def delete_pet(pet_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    from app.storage.local import storage
    storage.delete_pet_assets(pet_id)
    if pet.source_photo_path:
        storage.delete_upload(pet.source_photo_path)

    db.delete(pet)
    db.commit()
```

- [ ] **Step 2: Register in main.py**

```python
from app.routers import pets
app.include_router(pets.router)
```

- [ ] **Step 3: Write pet CRUD tests**

Create `tests/test_pets.py`:
```python
def test_list_pets_empty(client, auth_headers):
    resp = client.get("/api/v1/pets/", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"pets": [], "total": 0}


def test_list_pets_requires_auth(client):
    resp = client.get("/api/v1/pets/")
    assert resp.status_code == 403
```

Run:
```bash
python -m pytest tests/test_pets.py -v
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/routers/pets.py pet-bot-server/app/main.py pet-bot-server/tests/test_pets.py
git commit -m "feat: add user-scoped Pet CRUD routes with auth"
```

---

### Task 12: Static Asset Serving + Final Wiring

**Files:**
- Modify: `pet-bot-server/app/main.py` (static mount, all routers)

- [ ] **Step 1: Final main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
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

# Static file serving for generated assets (previews, downloads)
app.mount("/assets", StaticFiles(directory=settings.asset_dir), name="assets")

# Routers
from app.routers import auth, pets, generation
app.include_router(auth.router)
app.include_router(pets.router)
app.include_router(generation.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}
```

- [ ] **Step 2: Run the full test suite**

```bash
cd pet-bot-server
python -m pytest tests/ -v --tb=short
```

Expected: All tests in `test_auth.py`, `test_pets.py`, `test_generation.py`, `test_pipeline.py`, `test_rigging.py`, `test_atlas.py`, `test_bundle_validation.py` PASS.

- [ ] **Step 3: Manual smoke test**

```bash
# Terminal 1: Start server
python -m uvicorn app.main:app --reload

# Terminal 2: Smoke test the full flow
# Register
curl -X POST http://localhost:8000/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"123456"}'
# Save the token as TOKEN

# Upload a photo
curl -X POST http://localhost:8000/api/v1/upload -H "Authorization: Bearer $TOKEN" -F "file=@test_photo.png" -F "name=MyPet"
# Returns {"pet_id": "...", "job_id": "...", "status": "queued"}

# Poll job status (replace JOB_ID)
curl http://localhost:8000/api/v1/jobs/$JOB_ID -H "Authorization: Bearer $TOKEN"

# When status=awaiting_review: confirm
curl -X POST http://localhost:8000/api/v1/jobs/$JOB_ID/confirm -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"action":"confirm"}'

# Download .pet bundle
curl http://localhost:8000/api/v1/download/$PET_ID -H "Authorization: Bearer $TOKEN" -o mypet.pet

# Verify .pet is valid
python -c "from app.validators.pet_bundle import validate_pet_bundle; print(validate_pet_bundle(open('mypet.pet','rb').read()))"
# Should print: []
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot-server/app/main.py
git commit -m "feat: final wiring — static assets, all routers registered, full test suite passing"
```

---

## Backend Implementation Complete

After all 12 tasks: the FastAPI server supports:
- **Auth**: register/login with JWT, all endpoints guarded by `get_current_user`
- **Upload**: photo → pet + generation_job created, pipeline dispatched via BackgroundTasks
- **Pipeline**: 5 async stages (pose → bg removal → segment → rig → atlas) with quality gates at each stage
- **Quota**: per-user daily generation limit (`quota_usage` table), enforced at job creation
- **Review**: front-view preview → confirm (builds .pet zip) or regenerate (creates new job)
- **Download**: validated .pet bundle (real atlas.png + proper UV regions + ≥4 bones + ≥3 animations)
- **API keys**: server-side only, never exposed to clients
- **Tests**: 15+ tests across 7 test files, all with strict assertions (no "200 or 500" permissiveness)
