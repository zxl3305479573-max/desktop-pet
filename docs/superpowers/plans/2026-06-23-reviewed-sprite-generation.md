# Reviewed Sprite Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change generation so users approve the three-view character sheet before generating action sprites and packaging the desktop pet.

**Architecture:** Split provider generation into reference-sheet and action-sheet methods. The pipeline becomes three reviewed stages: reference, actions, package. Frontend constants and labels follow the backend stage count.

**Tech Stack:** FastAPI, SQLAlchemy, pytest, React, TypeScript, Vite.

---

### Task 1: Backend Pipeline Contract

**Files:**
- Modify: `pet-bot-server/app/providers/base.py`
- Modify: `pet-bot-server/app/providers/builtin.py`
- Modify: `pet-bot-server/app/services/pipeline.py`
- Test: `pet-bot-server/tests/test_pipeline.py`

- [ ] Write tests that expect Stage 1 to create only `spritesheet_idle.png`, Stage 2 to create action sheets using the reference sheet, and Stage 3 to build package assets.
- [ ] Run the focused pytest file and verify the new tests fail before production changes.
- [ ] Add `generate_reference_sheet` to the provider contract.
- [ ] Split pipeline saving helpers into reference and action saves.
- [ ] Run the focused pytest file and verify it passes.

### Task 2: Frontend Stage Flow

**Files:**
- Modify: `src/components/StageViewer.tsx`
- Modify: `src/components/GenerationProgress.tsx`
- Modify: `src/hooks/useGeneration.ts`
- Modify: `src/pages/Create.tsx`

- [ ] Update stage count and labels to three reviewed stages.
- [ ] Keep the existing continue/regenerate behavior, now mapped to reference, actions, package.
- [ ] Run TypeScript checks.

### Task 3: Final Verification

**Files:**
- Verify all changed files.

- [ ] Run `pet-bot-server\venv\Scripts\python.exe -m pytest pet-bot-server\tests`.
- [ ] Run `npx tsc -p tsconfig.web.json --noEmit --pretty false`.
- [ ] Run `npx tsc -p tsconfig.node.json --noEmit --pretty false`.
- [ ] Run `npm run build`.
