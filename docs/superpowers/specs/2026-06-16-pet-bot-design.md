# Pet-Bot: Custom Desktop Pet — Design Specification

> Created: 2026-06-16 | Status: Approved

## 1. Product Overview

Pet-Bot 是一个自定义桌宠平台。用户上传一张人物/动物/角色的照片，AI 自动生成一个 2D 骨骼动画角色，该角色以可交互的桌宠形式浮现在电脑桌面上。

- **定位**: 可用产品 MVP
- **平台**: Electron 桌面应用（Windows 首发）
- **目标用户**: 普通用户，无需技术背景
- **核心价值**: "上传照片，拥有专属桌宠"

## 2. Architecture

### 2.1 System Overview

```
┌─────────────────────────────────┐      ┌──────────────────────────┐
│       Electron Client           │      │     Web Backend           │
│                                 │      │     (Python FastAPI)      │
│  ┌───────────────────────────┐  │      │                          │
│  │  Main Window (React UI)   │  │ HTTP │  User Management         │
│  │  - Upload & Browse Pets   │──┼──────▶  Pet CRUD & Storage      │
│  │  - API Key Settings       │  │      │  AI Pipeline Scheduler   │
│  │  - Preview & Confirm      │  │      │  Asset Distribution      │
│  └───────────────────────────┘  │      └──────────────────────────┘
│                                 │                │
│  ┌───────────────────────────┐  │                ▼
│  │  Pet Window × N           │  │      ┌──────────────────────────┐
│  │  (Transparent, AlwaysTop) │  │      │     AI Pipeline           │
│  │  - PixiJS Skeleton Engine │  │      │                          │
│  │  - Idle Behavior Tree     │◀──┼──────│  1. Pose Estimation      │
│  │  - Click & Drag Handlers  │  │ load │  2. Background Removal    │
│  └───────────────────────────┘  │ pet  │  3. Part Segmentation     │
│                                 │ file │  4. Part Stylization      │
│  ┌───────────────────────────┐  │      │  5. Skeleton Rigging      │
│  │  Tray Icon & Context Menu │  │      │  6. Multi-View Preview    │
│  └───────────────────────────┘  │      │  7. User Confirm/Retry    │
└─────────────────────────────────┘      └──────────────────────────┘
```

### 2.2 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop Shell | Electron | Cross-platform, transparent windows, tray integration |
| Pet Rendering | PixiJS + pixi-spine | Industry standard 2D skeletal animation, WebGL |
| Management UI | React + TypeScript | Mature ecosystem, rich UI libraries |
| Build Tool | electron-vite | Fast HMR, TypeScript out of box |
| Backend | Python FastAPI + BackgroundTasks | Native ML/AI ecosystem, async pipeline |
| Auth | JWT (python-jose) + bcrypt | Stateless, per-user quota tracking |
| AI Models | MediaPipe + RMBG-2.0 | Local inference, no external API dependency for MVP |
| Database | SQLite (dev/MVP) → PostgreSQL (prod) | User, Pet, GenerationJob, QuotaUsage models |
| File Storage | Local FS → S3-compatible | MVP local, prod S3 with presigned URLs |

## 3. Feature Matrix

### 3.1 MVP Features (v0.1) — SCOPE LOCKED

**MVP 交付物：一张正面照片 → 模板骨骼角色 → 桌面 idle/click/drag 可交互。**

| Feature | Description | Priority |
|---------|-------------|----------|
| Photo Upload | Drag & drop / click to upload image (person/animal) | P0 |
| Pose Estimation | MediaPipe pose → keypoints; confidence < 0.5 → 提示用户换照片 | P0 |
| Background Removal | RMBG-2.0 → transparent PNG; mask IOU > 0.85 | P0 |
| Part Segmentation | 基于 keypoints 的 bounding-box 分割（head/torso/arms/legs） | P0 |
| Template Skeleton | 用人体模板骨骼（12 bones）适配到检测出的 keypoints | P0 |
| Single-View Preview | 正面合成图供用户确认，确认后生成 .pet 包 | P0 |
| Idle Wandering | Pet walks, jumps, sits randomly on desktop (behavior tree) | P0 |
| Click Interaction | Click → poke/jump/spin animation, drag → reposition window | P0 |
| Tray Menu | System tray icon with context menu（开关宠物、打开设置、退出） | P0 |
| User Account | 注册/登录，配额按用户计（每人 5 次免费生成） | P0 |
| Custom API Key | 用户在设置页提供自有 API key，不受 5 次限制 | P1 |
| Local Pet Cache | .pet 包保存到本地 SQLite，断网也能用 | P0 |

### 3.2 Future Features (v0.2+)

| Feature | Description |
|---------|-------------|
| AI Stylization (Stage 4) | 真正的风格化（SD img2img），而非当前的原图裁剪 |
| Multi-View Generation | 生成侧面/背面；当前 MVP 仅正面 |
| Complex Animations | sleep/sit/wave 等更多动画状态 |
| Manual Keypoint Adjustment | 用户可拖拽纠正检测不准的关键点 |
| System Awareness | Pet reacts to window maximize, notifications |
| Emotion System | Mood states (happy, bored, sleepy) |
| Pet Marketplace | Share/browse community-generated pets |
| Multiple Pets | Run several pets on screen simultaneously |
| macOS/Linux Support | 跨平台支持 |

## 4. AI Pipeline Design

### 4.1 Pipeline Stages (MVP — 5 stages, async via job queue)

```
Photo Upload → generation_job created (status=queued)
    │
    ▼ (worker picks up job)
[1] Pose Estimation ─── MediaPipe Pose
    │   SUCCESS IF: ≥8 keypoints with confidence ≥ 0.5
    │   FAIL → job.status=needs_better_photo, 提示用户换照片
    ▼
[2] Background Removal ─── RMBG-2.0
    │   SUCCESS IF: foreground/background ratio between 5%-90%
    │   FAIL → fallback to full-image (no removal), warn user
    ▼
[3] Part Segmentation ─── Keypoint-guided bounding boxes
    │   SUCCESS IF: at least head + torso segments produced
    │   FAIL → use whole-image as single "torso" part, allow confirm with warning
    ▼
[4] Template Skeleton Rigging ─── 12-bone humanoid template
    │   Maps detected keypoints → Spine JSON bones
    │   Unmapped keypoints → bones placed at default positions
    ▼
[5] Atlas + Preview ─── Pack part PNGs into atlas.png + atlas.json
    │   Generate single front-view composite preview
    │   Package .pet zip (skeleton.json + atlas.png + atlas.json + metadata.json)
    ▼
User Confirm → job.status=completed, pet.status=ready
User Regenerate → new job created (back to stage 1, but keep the same upload)
```

### 4.2 Quality Gates (built into pipeline code, not optional)

| Stage | Gate | Fail Action |
|-------|------|-------------|
| Pose | ≥ 8 keypoints, confidence ≥ 0.5 | `needs_better_photo` — 提示用户上传清晰正面照 |
| BG Removal | 5% ≤ foreground ratio ≤ 90% | 降低阈值重试；仍失败→跳过抠图，全图当素材 |
| Segmentation | head + torso must exist | 缺失部件用模板默认位置填充 |
| Rigging | ≥ 4 bones mapped successfully | 不足的 bones 放默认位置，标记 `rig_quality: "partial"` |
| Atlas | atlas.png > 1KB, 至少 2 个 region | 失败→返回错误，提供 regenerate |

### 4.3 API Strategy (REVISED — Server-side key holding)

- **服务端持有密钥**：内置 API key 存储在服务端环境变量，**绝不**下发到客户端
- **客户端认证**：用户注册/登录后获得 JWT token；配额按 `user_id` 计数，存在 `quota_usage` 表
- **每用户 5 次免费生成**：`SELECT COUNT(*) FROM generation_jobs WHERE user_id=? AND provider='builtin'`
- **自定义 Key**：用户在设置页提交自己的 API key，**加密存储**在服务端 `user_api_keys` 表，使用时按用户查询
- **Provider 抽象**：后端 `providers/` 模块支持 builtin / user_custom / 未来第三方，切换对客户端透明
- **临时上传 URL**：上传照片返回 `presigned_upload_url`（一次性 token），不暴露存储路径

### 4.4 Async Job Model

```
generation_jobs 表:
  id, user_id, pet_id, status(queued|running|awaiting_review|completed|failed),
  provider, error_message, stage_progress(int 0-5), created_at, updated_at

POST /upload  → pet.created, job.created(status=queued) → 202 Accepted
GET  /jobs/{job_id} → 轮询状态 + stage_progress
POST /jobs/{job_id}/confirm  → job → completed
POST /jobs/{job_id}/regenerate → new job created
```

Worker 可以是同一进程内的 `background_tasks`（MVP 更简单），也可以是独立 Celery worker（规模扩展）。MVP 用 FastAPI `BackgroundTasks`。

## 5. Client Architecture

### 5.1 Window Structure

```
Electron App
├── Main Window (normal browser window)
│   ├── Pet Browser: list saved pets, switch active pet
│   ├── Create Pet: upload photo → generation status → preview → confirm
│   ├── Settings: API key, preferences, about
│   └── (hidden when not in use)
│
├── Pet Window(s) — BrowserWindow with:
│   ├── transparent: true
│   ├── alwaysOnTop: true
│   ├── frame: false
│   ├── resizable: false
│   ├── skipTaskbar: true
│   └── PixiJS canvas filling the whole window
│
└── Tray Icon
    ├── Show/Hide Pets
    ├── Open Main Window
    ├── Settings
    └── Quit
```

### 5.2 Electron Security Baseline (MANDATORY)

```
contextIsolation: true
nodeIntegration: false
sandbox: true
webSecurity: true
```

- **IPC allowlist**: 只暴露 `pet:open/close/saveLocal/loadBundle/listLocal/deleteLocal` 和 `window:minimizeToTray`，不允许任意 channel
- **外链打开**: 用 `shell.openExternal` 且校验 URL scheme 为 `https:`
- **CSP**: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' http://localhost:8000`
- **本地文件访问**: 仅通过 preload 暴露的 `savePetLocally`/`loadPetBundle` 访问 app 的 `userData` 目录，不暴露任意文件路径
- **自动更新**: 后续版本引入 `electron-updater`，签名校验

### 5.3 Pet Window Rendering

- PixiJS Application with transparent background
- Spine skeleton data loaded from local `.json` + atlas files
- Animation state machine: `idle/walk/jump/sit/sleep/react_click/react_drag`
- Behavior tree drives idle actions with random intervals and weighted probabilities
- Click handler: hit-test against skeleton bounding box, trigger reaction animation
- Drag handler: move the entire BrowserWindow

## 6. Data Flow

### 6.1 Create Pet Flow (Async)

```
User (Main Window)          Backend                   Worker (BackgroundTasks)
      │                       │                           │
      ├─ POST /upload ────────▶                           │
      │                       ├─ Save photo               │
      │                       ├─ Create Pet(status=uploaded)│
      │                       ├─ Create Job(status=queued) │
      │◀── 202 {pet_id, job_id}─┤                          │
      │                       │                           │
      │                       ├─ BackgroundTasks.add ─────▶
      │                       │                           ├─ Stage 1 (Pose)
      │                       │                           ├─ Stage 2 (BG Remove)
      │                       │                           ├─ Stage 3 (Segment)
      │                       │                           ├─ Stage 4 (Rig)
      │                       │                           ├─ Stage 5 (Atlas+Preview)
      │                       │                           ├─ job.status=awaiting_review
      │                       │                           │
      ├─ GET /jobs/{id} ──────▶ (poll every 2s)          │
      │◀── {status, progress}──┤                          │
      │                       │                           │
      │  [status=awaiting_review]                         │
      ├─ Show preview ────────┤                           │
      │                       │                           │
      ├─ POST /jobs/{id}/confirm ─▶                       │
      │                       ├─ Package .pet zip        │
      │                       ├─ pet.status=ready        │
      │◀── 200 {download_url}──┤                          │
      │                       │                           │
      ├─ GET /download/{id} ──▶                           │
      │◀── .pet bundle ───────┤                           │
      ├─ Save to local cache  │                           │
      ├─ IPC: pet:open ───────▶ (Electron main process)
      ├─ Pet window appears   │                           │
```

### 6.2 Runtime Pet Flow

```
Pet Window (PixiJS)
      │
      ├─ Load spine JSON + atlas from local cache
      ├─ Start Behavior Tree
      │   ├─ Timer: (5-15s) → pick random idle action
      │   ├─ Is idle? → walk to new position → back to idle
      │   └─ Loop
      │
      ├─ On click → interrupt BT → play react animation → resume BT
      ├─ On drag start → pause BT → follow mouse → on drop → resume BT
      └─ On tray quit → save state → destroy window
```

## 7. File Formats

### 7.1 Pet Asset Bundle (`.pet`)

A zipped directory. **Every file inside must be non-empty and valid.** Validation rejects bundles with empty/placeholder files.

```
mypet.pet (zip)
├── skeleton.json      # Spine-compatible skeleton (bones ≥ 4, animations ≥ 3)
├── atlas.png          # Real packed texture atlas (≥ 2KB, valid PNG)
├── atlas.json         # UV coords for each part region (≥ 2 regions)
├── preview_front.png  # Front view composite (≥ 1KB)
└── metadata.json      # name, created_at, pet_id, rig_quality, provider
```

### 7.2 skeleton.json Schema (MVP)

Spine-compatible JSON. **Mandatory minimum:**
- `bones`: ≥ 4 (root + spine + 2 limbs); fallback: 12-bone humanoid template
- `slots`: one per atlas region
- `animations`: ≥ 3 (`idle`, `walk`, `poke`); others optional with sensible defaults

### 7.3 atlas.json Schema

```json
{
  "image": "atlas.png",
  "size": {"w": 512, "h": 512},
  "regions": {
    "head":    {"x": 0,   "y": 0,   "w": 128, "h": 128},
    "torso":   {"x": 128, "y": 0,   "w": 128, "h": 192},
    "left_arm":  {"x": 256, "y": 0,   "w": 64,  "h": 192},
    "right_arm": {"x": 320, "y": 0,   "w": 64,  "h": 192},
    "left_leg":  {"x": 384, "y": 0,   "w": 64,  "h": 192},
    "right_leg": {"x": 448, "y": 0,   "w": 64,  "h": 192}
  }
}
```

UV regions must reference pixel coordinates within `atlas.png`. Each region's dimensions must match the actual cropped part image.

### 7.4 .pet Bundle Validation (server-side, before sending to client)

```python
def validate_pet_bundle(zip_bytes: bytes) -> list[str]:
    errors = []
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        required = ["skeleton.json", "atlas.png", "atlas.json", "preview_front.png", "metadata.json"]
        for name in required:
            if name not in zf.namelist():
                errors.append(f"Missing: {name}")
                continue
            info = zf.getinfo(name)
            if name.endswith(".png") and info.file_size < 1024:
                errors.append(f"Too small: {name} ({info.file_size} bytes)")
            if name.endswith(".json"):
                data = json.loads(zf.read(name))
                if not data:
                    errors.append(f"Empty: {name}")
        # Validate atlas regions point to real pixel data
        if "atlas.json" in zf.namelist() and "atlas.png" in zf.namelist():
            atlas_data = json.loads(zf.read("atlas.json"))
            if len(atlas_data.get("regions", {})) < 2:
                errors.append("atlas.json has < 2 regions")
    return errors
```

## 8. Project Structure (Client Repository)

```
pet-bot/
├── electron/            # Electron main process
│   ├── main.ts          # App entry, window management
│   ├── tray.ts          # System tray logic
│   ├── pet-window.ts    # Transparent pet window factory
│   └── preload.ts       # IPC bridge
├── src/                 # Renderer (React)
│   ├── App.tsx
│   ├── pages/
│   │   ├── Home.tsx         # Pet browser
│   │   ├── Create.tsx       # Upload & pipeline
│   │   └── Settings.tsx     # Config & API keys
│   ├── components/
│   │   ├── PetCard.tsx
│   │   ├── UploadZone.tsx
│   │   ├── PreviewCarousel.tsx
│   │   └── ApiKeyInput.tsx
│   └── store/               # State management (zustand)
├── pet-renderer/        # Pet window renderer (PixiJS, separate entry)
│   ├── index.ts             # PixiJS app bootstrap
│   ├── skeleton.ts          # Spine loader & player
│   ├── behavior.ts          # Behavior tree for idle actions
│   ├── interaction.ts       # Click/drag handlers
│   └── animations/          # Animation definitions
├── shared/              # Shared types & IPC contracts
│   └── types.ts
├── package.json
├── electron-vite.config.ts
└── tsconfig.json
```

## 9. Backend Project Structure (REVISED)

```
pet-bot-server/
├── app/
│   ├── main.py              # FastAPI entry, lifespan, CORS, BackgroundTasks
│   ├── config.py            # Settings & env (API keys NEVER exposed to client)
│   ├── database.py          # SQLAlchemy engine, session, Base
│   ├── auth.py              # JWT token creation/verification, user dependency
│   ├── models/              # DB models (SQLAlchemy)
│   │   ├── user.py          # User (id, email, password_hash, created_at)
│   │   ├── pet.py           # Pet (id, user_id FK, name, status, paths)
│   │   ├── generation_job.py # Job (id, user_id FK, pet_id FK, status, progress, provider)
│   │   └── quota.py         # QuotaUsage (id, user_id, provider, count, date)
│   ├── schemas/             # Pydantic request/response schemas
│   │   ├── auth.py          # Register/Login/Token
│   │   ├── pet.py           # Pet CRUD schemas
│   │   └── generation.py    # Upload response, Job status, Confirm/Regenerate
│   ├── routers/             # API routes
│   │   ├── auth.py          # POST /auth/register, /auth/login
│   │   ├── pets.py          # CRUD /pets
│   │   └── generation.py    # POST /upload, GET /jobs/{id}, POST /jobs/{id}/confirm
│   ├── services/
│   │   ├── pipeline.py      # Orchestrator: run stages 1-5, update job progress
│   │   ├── pose.py          # Stage 1: Pose estimation with confidence gate
│   │   ├── segmentation.py  # Stage 2-3: BG removal + part split with fallbacks
│   │   ├── rigging.py       # Stage 4: 12-bone template → Spine JSON
│   │   └── atlas.py         # Stage 5: Pack parts → atlas.png + atlas.json
│   ├── providers/
│   │   ├── base.py          # Abstract provider interface
│   │   ├── builtin.py       # Server-side builtin provider (key from env)
│   │   └── registry.py      # Provider lookup
│   ├── storage/
│   │   └── local.py         # File storage + temp upload URL generator
│   └── validators/
│       └── pet_bundle.py    # .pet zip validation (pre-download check)
├── tests/
│   ├── conftest.py          # Fixtures: test DB, mock provider, auth headers
│   ├── test_auth.py
│   ├── test_pets.py
│   ├── test_generation.py
│   ├── test_pipeline.py
│   ├── test_rigging.py
│   ├── test_atlas.py
│   └── test_bundle_validation.py
├── requirements.txt
└── .env.example
```

## 10. Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pose detection fails (low confidence / partial body) | High | Stage 1 quality gate: confidence < 0.5 → `needs_better_photo`；prompt user to upload clear front-facing photo |
| Part segmentation produces unusable output | Medium | Fallback chain: keypoint-BB → full-image-as-torso → user confirms with quality warning flag |
| API key leakage from client | **Critical** | Keys stored server-side ONLY in env vars or encrypted `user_api_keys` table；client uses JWT |
| .pet bundle unloadable by PixiJS | High | Server-side validation before download；atlas must have ≥ 2 regions + valid PNG > 2KB；integration test loads .pet in PixiJS as gate |
| Sync pipeline blocks server / times out | High | Async via BackgroundTasks + polling；each stage updates `job.stage_progress`；timeout at 120s per stage |
| Free quota abused (new accounts for more generations) | Medium | Quota tracked per user_id in `quota_usage` table；optional device fingerprinting later |
| Electron security misconfiguration | Medium | Enforce contextIsolation + sandbox + CSP in CI lint step；no nodeIntegration in renderer |

## 11. Non-Goals (Explicitly Out of Scope for MVP)

- 3D pets or 3D rendering
- Real-time voice interaction
- Pet marketplace / community sharing
- Mobile companion app
- Linux/macOS support (Windows first, ports later)
- Plugin system for custom behaviors
