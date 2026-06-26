# Spritesheet Pet Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a real playable desktop pet from generated spritesheet assets.

**Architecture:** The backend produces and packages spritesheet artifacts with a stable `.pet` contract. The frontend keeps the existing stage-by-stage confirmation flow. The Electron pet renderer loads the saved local bundle and plays frame-based Pixi animations from the generated spritesheets.

**Tech Stack:** FastAPI, SQLAlchemy, Pillow, ZIP bundles, React, Electron IPC, JSZip, PixiJS.

---

### Task 1: Backend Bundle Contract

**Files:**
- Modify: `pet-bot-server/app/services/pipeline.py`
- Modify: `pet-bot-server/app/routers/generation.py`
- Modify: `pet-bot-server/app/validators/pet_bundle.py`
- Test: `pet-bot-server/tests/test_bundle_validation.py`

- [ ] Add tests that accept bundles with spritesheet files and compatibility atlas/skeleton files.
- [ ] Make stage 9 persist `preview_front.png`, `atlas.png`, `atlas.json`, and `skeleton.json` even when the output is spritesheet-based.
- [ ] Make `_build_pet_bundle` include the spritesheet files and metadata animation list.
- [ ] Keep existing validation rules for required files, while allowing simple compatibility atlas data.

### Task 2: Stage Results and UI Flow

**Files:**
- Modify: `src/hooks/useGeneration.ts`
- Modify: `src/components/StageViewer.tsx`
- Modify: `src/pages/Create.tsx`
- Modify: `src/lib/api.ts`

- [ ] Preserve failed stage data so the UI can regenerate the same stage.
- [ ] Ensure each successful stage returns a visible preview path.
- [ ] Keep the continue button disabled until `status === "ok"`.
- [ ] Make final confirm download the generated bundle and save it locally.

### Task 3: Local Bundle Loading

**Files:**
- Modify: `electron/ipc-handlers.ts`
- Modify: `electron/preload.ts`
- Modify: `src/lib/db.ts`

- [ ] Return local bundle bytes in a renderer-safe format.
- [ ] Keep IPC allowlisted to pet bundle operations only.
- [ ] Avoid exposing arbitrary file paths.

### Task 4: Real Pet Renderer

**Files:**
- Modify: `pet-renderer/index.ts`
- Modify: `pet-renderer/skeleton.ts`
- Modify: `pet-renderer/behavior.ts`

- [ ] Load `petId` from URL query params.
- [ ] Fetch the local `.pet` bundle through preload IPC.
- [ ] Use `JSZip` to extract generated spritesheets.
- [ ] Slice each spritesheet into frames with a fixed grid heuristic.
- [ ] Play `idle`, `walk`, `dragged`, and `eating` animations through Pixi sprites.
- [ ] Fall back to `preview_front.png` or the default skeleton if bundle loading fails.

### Task 5: Verification

**Files:**
- Build/test commands only.

- [ ] Run `npm run build`.
- [ ] Run backend tests if a working Python runtime is available.
- [ ] Report any verification gaps explicitly.
