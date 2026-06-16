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
| Backend | Python FastAPI | Native ML/AI ecosystem, zero-bridge |
| AI Models | (TBD per pipeline stage) | See Section 4 |
| Database | SQLite (local) + PostgreSQL (server) | Lightweight for client, reliable for server |
| File Storage | Local FS (cache) + S3-compatible (assets) | CDN distribution |

## 3. Feature Matrix

### 3.1 MVP Features (v0.1)

| Feature | Description | Priority |
|---------|-------------|----------|
| Photo Upload | Drag & drop / click to upload image | P0 |
| AI Generation | Photo → bone-rigged character (7-stage pipeline) | P0 |
| Multi-View Preview | Show front/side/back views, user confirms or regenerates | P0 |
| Idle Wandering | Pet walks, jumps, sits randomly on desktop | P0 |
| Click Interaction | Click to poke/jump/spin, drag to reposition | P0 |
| Tray Menu | System tray icon with context menu (switch pet, settings, quit) | P0 |
| Built-in API | Default AI API key bundled with the app | P0 |
| Custom API Key | User can supply their own API key in settings | P1 |
| Pet Storage | Save generated pets locally, switch between them | P0 |

### 3.2 Future Features (v0.2+)

| Feature | Description |
|---------|-------------|
| System Awareness | Pet reacts to window maximize, notifications |
| Emotion System | Mood states (happy, bored, sleepy) with corresponding animations |
| Pet Marketplace | Share/browse community-generated pets |
| Multiple Pets | Run several pets on screen simultaneously |
| Voice Interaction | Pet responds to voice/whistle |

## 4. AI Pipeline Design

### 4.1 Pipeline Stages

```
Photo Upload
    │
    ▼
[1] Pose Estimation ─── MediaPipe / OpenPose-like model
    │                    → keypoints (17 for human, custom for animals)
    ▼
[2] Background Removal ─── SAM / rembg / BiRefNet
    │                    → clean foreground mask
    ▼
[3] Part Segmentation ─── Combined mask + keypoints
    │                    → head, torso, L/R arm, L/R leg, tail(optional)
    ▼
[4] Part Stylization ─── SD img2img or dedicated model per part
    │                    → consistent art style across all parts
    ▼
[5] Skeleton Rigging ─── Keypoint-to-bone mapping
    │                    → Spine JSON format: bones, slots, attachments
    ▼
[6] Multi-View Preview ─── Render front/side/back views from rig
    │                    → PNG previews for user review
    ▼
[7] User Decision ─── Confirm → save pet file
                      Regenerate → back to [4] with different seed/style
```

### 4.2 Model Candidates

Each pipeline stage maps to a model/service, all Python-native:

| Stage | Model Candidate | Notes |
|-------|----------------|-------|
| Pose Estimation | MediaPipe Pose / RTMPose | On-device possible, low latency |
| Background Removal | BiRefNet / RMBG-2.0 | SOTA, fast on GPU |
| Part Segmentation | SAM + keypoint-guided mask | Fine-tuned for character parts |
| Part Stylization | SDXL img2img + ControlNet | Consistent style via prompt + reference |
| Skeleton Rigging | Custom algorithm | Keypoints → Spine JSON mapper |
| Multi-View Render | In-engine preview | PixiJS renders from generated rig |

### 4.3 API Strategy

- **Built-in API**: Bundled default provider key, capped at 5 free generations per user (prevent abuse)
- **Custom API Key**: User settings page to override provider/endpoint/key
- **Provider abstraction**: Python backend uses a provider interface, swap implementations without client changes

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

### 5.2 Pet Window Rendering

- PixiJS Application with transparent background
- Spine skeleton data loaded from local `.json` + atlas files
- Animation state machine: `idle/walk/jump/sit/sleep/react_click/react_drag`
- Behavior tree drives idle actions with random intervals and weighted probabilities
- Click handler: hit-test against skeleton bounding box, trigger reaction animation
- Drag handler: move the entire BrowserWindow

## 6. Data Flow

### 6.1 Create Pet Flow

```
User (Main Window)          Backend              AI Pipeline
      │                       │                      │
      ├─ Upload photo ────────▶                      │
      │                       ├─ Store original ─────▶
      │                       │                      ├─ Stage 1-6
      │                       │◀─ Multi-view previews─┤
      │◀── Show previews ─────┤                      │
      │                       │                      │
      ├─ Confirm/Retry ───────▶                      │
      │  (if retry: back to Stage 4)                 │
      │  (if confirm:)        │                      │
      │                       ├─ Generate .json + atlas│
      │                       ├─ Store pet asset      │
      │◀── Download pet file ─┤                      │
      │                       │                      │
      ├─ Save to local cache  │                      │
      ├─ Open Pet Window      │                      │
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

A zipped directory containing:
```
mypet.pet (zip)
├── skeleton.json      # Spine-compatible skeleton data
├── atlas.png          # Texture atlas of all body parts
├── atlas.json         # Atlas descriptor (UV coords, names)
├── preview_front.png  # Front view thumbnail
├── preview_side.png   # Side view thumbnail
├── preview_back.png   # Back view thumbnail
└── metadata.json      # name, created_at, model_version, source photo hash
```

### 7.2 skeleton.json Schema

Spine-compatible JSON with standard fields: `bones`, `slots`, `skins`, `animations`. Animation set includes MVP animations: `idle`, `walk`, `jump`, `sit`, `sleep`, `poke`, `spin`, `wave`.

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

## 9. Backend Project Structure

```
pet-bot-server/
├── app/
│   ├── main.py              # FastAPI entry
│   ├── config.py            # Settings & env
│   ├── models/              # DB models (SQLAlchemy)
│   ├── routers/             # API routes
│   │   ├── auth.py
│   │   ├── pets.py
│   │   └── generation.py
│   ├── services/
│   │   ├── pipeline.py      # AI pipeline orchestrator
│   │   ├── pose.py          # Stage 1: Pose estimation
│   │   ├── segmentation.py  # Stage 2-3: BG removal + parts
│   │   ├── stylization.py   # Stage 4: Part stylization
│   │   ├── rigging.py       # Stage 5: Skeleton rigging
│   │   └── preview.py       # Stage 6: Multi-view render
│   ├── providers/           # API provider abstraction
│   │   ├── base.py
│   │   ├── builtin.py       # Default bundled provider
│   │   └── custom.py        # User-provided API key
│   └── storage/             # File & asset storage
│       ├── local.py
│       └── s3.py
├── tests/
├── requirements.txt
└── Dockerfile
```

## 10. Known Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| AI generation quality inconsistent | High | Multi-view preview + easy regenerate; seed variation |
| Part segmentation fails for unusual poses | Medium | Fallback to manual keypoint adjustment UI |
| Electron performance with multiple pets | Medium | Limit pet count, throttle animations when unfocused |
| API costs at scale | Medium | User brings own key; server-side quota + caching |
| Spine format licensing | Low | Use our own JSON schema, PixiJS renders standard spine-compatible data |

## 11. Non-Goals (Explicitly Out of Scope for MVP)

- 3D pets or 3D rendering
- Real-time voice interaction
- Pet marketplace / community sharing
- Mobile companion app
- Linux/macOS support (Windows first, ports later)
- Plugin system for custom behaviors
