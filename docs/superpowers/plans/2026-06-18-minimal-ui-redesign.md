# Minimal UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Pet Bot app UI as a minimal light interface centered on the desktop pet creation flow.

**Architecture:** Keep the existing React/Electron structure and API hooks. Replace the visual layer and broken Chinese copy in pages/components without changing backend generation logic. Use Tailwind utility classes and a small global CSS reset.

**Tech Stack:** React 18, React Router, Zustand, Tailwind CSS, Vite, Electron.

---

## File Structure

- Modify `src/index.css`: global light theme, font stack, base rendering.
- Modify `src/components/Layout.tsx`: top navigation app shell with text-only links.
- Modify `src/pages/Login.tsx`: clean centered auth form with Chinese copy.
- Modify `src/pages/Home.tsx`: minimal pet list and empty state.
- Modify `src/pages/Create.tsx`: centered wizard creation flow, readable provider/credit state.
- Modify `src/components/UploadZone.tsx`: text-only upload panel.
- Modify `src/components/StageViewer.tsx`: readable nine-stage review panel, no emoji.
- Modify `src/components/PetCard.tsx`: restrained preview card and status labels.
- Modify `src/components/GenerationProgress.tsx`: compact progress labels.
- Modify `src/components/ApiKeyInput.tsx`: text-only show/hide action.
- Modify `src/pages/Settings.tsx`: minimal settings, credits, API key, admin panel.

## Tasks

### Task 1: App Shell And Base Theme

- [ ] Rewrite `src/index.css` to use a light background, system Chinese-capable font stack, and stable text rendering.
- [ ] Rewrite `src/components/Layout.tsx` with top navigation: `Pet Bot`, `我的桌宠`, `创建桌宠`, `设置`, `退出`.
- [ ] Remove all emoji/icon nav markers.

### Task 2: Authentication And Home

- [ ] Rewrite `src/pages/Login.tsx` with normal Chinese copy, simple form states, and text-only submit/switch buttons.
- [ ] Rewrite `src/pages/Home.tsx` with a minimal header, create button, loading/error/empty states, and a responsive pet grid.
- [ ] Rewrite `src/components/PetCard.tsx` with Chinese status labels and text-only actions.

### Task 3: Creation Wizard

- [ ] Rewrite `src/pages/Create.tsx` around the centered creation flow.
- [ ] Fix generation enablement so provider readiness controls upload availability.
- [ ] Rewrite `src/components/UploadZone.tsx` as a clean drag/drop area.
- [ ] Rewrite `src/components/StageViewer.tsx` with clear stage names, preview area, error details, and retry/continue buttons.
- [ ] Rewrite `src/components/GenerationProgress.tsx` with readable labels.

### Task 4: Settings

- [ ] Rewrite `src/pages/Settings.tsx` with simple panels for credits, recharge, API key, and admin tools.
- [ ] Rewrite `src/components/ApiKeyInput.tsx` with `显示` / `隐藏` text buttons.
- [ ] Keep all existing API behavior intact.

### Task 5: Verification

- [ ] Run `npm run build`.
- [ ] Run focused backend tests if backend changes remain in the worktree: `D:\pet-bot\pet-bot-server\venv\Scripts\python.exe -m pytest tests\test_provider_response_parsing.py tests\test_bundle_validation.py -q`.
- [ ] Inspect `git diff -- src` to ensure no emoji/icon copy remains in the redesigned UI files.
