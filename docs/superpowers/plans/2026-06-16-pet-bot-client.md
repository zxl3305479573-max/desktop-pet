# Pet-Bot Electron Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:parallel-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Electron desktop app with React management UI, PixiJS pet renderer, system tray integration, and transparent always-on-top pet windows.

**Architecture:** Electron main process manages three window types (main, pet, tray). Two separate renderer entry points: React for the main window UI, vanilla TS+PixiJS for the pet window. IPC bridge connects them. Local SQLite (better-sqlite3) caches downloaded pets.

**Tech Stack:** Electron 33, React 18 + TypeScript, PixiJS 8, electron-vite, zustand, better-sqlite3, Tailwind CSS

**Source:** Spec `docs/superpowers/specs/2026-06-16-pet-bot-design.md`

---

## File Structure Map

```
pet-bot/                              # Project root (D:\pet-bot)
├── package.json
├── electron-vite.config.ts
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── tailwind.config.js
├── postcss.config.js
├── electron/
│   ├── main.ts                       # App entry, lifecycle
│   ├── windows.ts                    # Window factory (main + pet)
│   ├── tray.ts                       # System tray setup
│   ├── ipc-handlers.ts               # IPC bridge handlers
│   └── preload.ts                    # Context bridge API
├── src/                              # Main window renderer (React)
│   ├── main.tsx                      # React entry
│   ├── App.tsx                       # Router + layout
│   ├── index.css                     # Tailwind imports + globals
│   ├── pages/
│   │   ├── Home.tsx                  # Pet browser (list saved pets)
│   │   ├── Create.tsx                # Upload photo → pipeline flow
│   │   └── Settings.tsx              # API key, preferences
│   ├── components/
│   │   ├── PetCard.tsx               # Pet thumbnail card
│   │   ├── UploadZone.tsx            # Drag/drop upload area
│   │   ├── GenerationProgress.tsx    # Pipeline status display
│   │   ├── PreviewCarousel.tsx       # Multi-view preview viewer
│   │   ├── ApiKeyInput.tsx           # API key configuration
│   │   └── Layout.tsx                # App shell (sidebar + content)
│   ├── hooks/
│   │   ├── usePets.ts                # Pet list query hook
│   │   └── useGeneration.ts          # Generation status polling hook
│   ├── store/
│   │   └── index.ts                  # Zustand store (global state)
│   └── lib/
│       ├── api.ts                    # Backend API client (fetch wrapper)
│       └── db.ts                     # Local SQLite for pet cache
├── pet-renderer/                     # Pet window renderer (PixiJS)
│   ├── index.ts                      # Entry: PixiJS app + anim loop
│   ├── skeleton.ts                   # Spine JSON loader + animator
│   ├── behavior.ts                   # Idle behavior tree
│   ├── interaction.ts                # Click & drag handlers
│   └── assets/
│       └── default-pet.json          # Fallback pet skeleton
└── shared/
    └── types.ts                      # Shared TypeScript types
```

---

### Task 1: Electron + React Scaffolding

**Files:**
- Create: `pet-bot/package.json`
- Create: `pet-bot/electron-vite.config.ts`
- Create: `pet-bot/tsconfig.json`
- Create: `pet-bot/tsconfig.node.json`
- Create: `pet-bot/tsconfig.web.json`
- Create: `pet-bot/tailwind.config.js`
- Create: `pet-bot/postcss.config.js`
- Create: `pet-bot/electron/main.ts`
- Create: `pet-bot/electron/preload.ts`
- Create: `pet-bot/src/main.tsx`
- Create: `pet-bot/src/App.tsx`
- Create: `pet-bot/src/index.css`
- Create: `pet-bot/index.html`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "pet-bot",
  "version": "0.1.0",
  "description": "Custom desktop pet from your photos",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "pixi.js": "^8.5.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.2",
    "zustand": "^5.0.0",
    "better-sqlite3": "^11.3.0",
    "jszip": "^3.10.1"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/react": "^18.3.8",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "electron": "^33.0.0",
    "electron-vite": "^2.3.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.2",
    "vite": "^5.4.8"
  }
}
```

- [ ] **Step 2: Create electron-vite.config.ts**

```typescript
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { main: resolve(__dirname, 'electron/main.ts') },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { preload: resolve(__dirname, 'electron/preload.ts') },
      },
    },
  },
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          pet: resolve(__dirname, 'pet-renderer/index.html'),
        },
      },
    },
  },
})
```

- [ ] **Step 3: Create tsconfig files**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.web.json" }
  ]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "./out",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["electron/**/*.ts", "shared/**/*.ts"]
}
```

`tsconfig.web.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "outDir": "./out",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "pet-renderer/**/*.ts", "shared/**/*.ts"]
}
```

- [ ] **Step 4: Create Tailwind config**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: { extend: {} },
  plugins: [],
}
```

`postcss.config.js`:
```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pet-Bot</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: Create electron/main.ts**

```typescript
import { app, BrowserWindow } from 'electron'
import { createMainWindow } from './windows'
import { setupTray } from './tray'
import { registerIpcHandlers } from './ipc-handlers'

let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  mainWindow = createMainWindow()
  setupTray(mainWindow)
  registerIpcHandlers()
})

app.on('window-all-closed', () => {
  // Don't quit on Windows when all windows closed (tray persists)
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
  }
})
```

- [ ] **Step 7: Create src/main.tsx + src/App.tsx**

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

`src/App.tsx`:
```tsx
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Create from './pages/Create'
import Settings from './pages/Settings'

export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </HashRouter>
  )
}
```

`src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
}

#root {
  min-height: 100vh;
}
```

- [ ] **Step 8: Install and verify**

```bash
cd pet-bot
npm install
npx electron-vite dev
```

Expected: Electron window opens with blank React app.

- [ ] **Step 9: Commit**

```bash
git add pet-bot/
git commit -m "feat: scaffold Electron + React + Tailwind project"
```

---

### Task 2: Electron Main Process — Windows & Tray

**Files:**
- Create: `pet-bot/electron/windows.ts`
- Create: `pet-bot/electron/tray.ts`
- Create: `pet-bot/electron/preload.ts`

- [ ] **Step 1: Create electron/windows.ts**

```typescript
import { BrowserWindow, screen } from 'electron'
import { join } from 'path'

const PET_WINDOW_SIZE = 200

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 700,
    minHeight: 500,
    title: 'Pet-Bot',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
    show: false,
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/main.html`)
  } else {
    win.loadFile(join(__dirname, '../renderer/main.html'))
  }

  win.once('ready-to-show', () => win.show())
  win.on('close', (e) => {
    // Minimize to tray instead of closing
    e.preventDefault()
    win.hide()
  })

  return win
}

export function createPetWindow(petId: string): BrowserWindow {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  const win = new BrowserWindow({
    width: PET_WINDOW_SIZE,
    height: PET_WINDOW_SIZE,
    x: Math.random() * (screenW - PET_WINDOW_SIZE),
    y: screenH - PET_WINDOW_SIZE - 100,
    transparent: true,
    alwaysOnTop: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  // Make window click-through except for the pet itself
  win.setIgnoreMouseEvents(false)

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pet.html?petId=${petId}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/pet.html'))
  }

  return win
}

export const activePetWindows = new Map<string, BrowserWindow>()

export function closePetWindow(petId: string) {
  const win = activePetWindows.get(petId)
  if (win && !win.isDestroyed()) {
    win.close()
    activePetWindows.delete(petId)
  }
}

export function closeAllPetWindows() {
  activePetWindows.forEach((win) => {
    if (!win.isDestroyed()) win.close()
  })
  activePetWindows.clear()
}
```

- [ ] **Step 2: Create electron/tray.ts**

```typescript
import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

export function setupTray(mainWindow: BrowserWindow) {
  // Use a small embedded icon (16x16 PNG base64)
  const icon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAbwAAAG8B8aLcQwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAEPSURBVDiNpZK9TgJBFIXPzA8oKGyMjaWJjY2Fj8ALaOlr+Aq+gW9gYWFiQWFiQSw0JjbGQhMTEwv9AYEoCIqwu8Uim90/u0PmJN9kcu/cmXszc5UzDMMwkqS+0Wjw4j6wD/SAPeAIqAEbwFt4HugDW8AF0AH2gV2gCbwCn4YNmNT9mAEvHMBNB8gBhYUKoEBx+voCtwWgDMwC00D+51D8kgsU0P/0U8Bl/RkDIwfIgFngsP7l4ugAv/P3hGQVSAHTYQCksR8cPwI3AwBJYFYAkgNAWvsZJAD4BysiEcpq+QeIAElAvCuIA4ncALh5NIAx0ADqQCMkWEbpXK7BMpB8Bd1d9tfvH34Z+9W3OQAAAABJRU5ErkJggg=='
  )
  tray = new Tray(icon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Pet-Bot',
      click: () => mainWindow.show(),
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        mainWindow.destroy()
        process.exit(0)
      },
    },
  ])

  tray.setToolTip('Pet-Bot')
  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow.show()
  })

  return tray
}
```

- [ ] **Step 3: Create electron/preload.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

export interface PetBotAPI {
  openPetWindow: (petId: string) => void
  closePetWindow: (petId: string) => void
  closeAllPetWindows: () => void
  savePetLocally: (petId: string, bundleData: ArrayBuffer) => Promise<void>
  loadPetBundle: (petId: string) => Promise<ArrayBuffer | null>
  listLocalPets: () => Promise<Array<{ id: string; name: string; preview: string }>>
  deleteLocalPet: (petId: string) => Promise<void>
  onPetWindowEvent: (callback: (event: string, data: any) => void) => void
  minimizeToTray: () => void
}

contextBridge.exposeInMainWorld('petBot', {
  openPetWindow: (petId: string) => ipcRenderer.send('pet:open', petId),
  closePetWindow: (petId: string) => ipcRenderer.send('pet:close', petId),
  closeAllPetWindows: () => ipcRenderer.send('pet:closeAll'),
  savePetLocally: (petId: string, bundleData: ArrayBuffer) =>
    ipcRenderer.invoke('pet:saveLocal', petId, bundleData),
  loadPetBundle: (petId: string) => ipcRenderer.invoke('pet:loadBundle', petId),
  listLocalPets: () => ipcRenderer.invoke('pet:listLocal'),
  deleteLocalPet: (petId: string) => ipcRenderer.invoke('pet:deleteLocal', petId),
  onPetWindowEvent: (callback: (event: string, data: any) => void) => {
    ipcRenderer.on('pet:event', (_event, eventName, data) => callback(eventName, data))
  },
  minimizeToTray: () => ipcRenderer.send('window:minimizeToTray'),
} as PetBotAPI)
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot/electron/windows.ts pet-bot/electron/tray.ts pet-bot/electron/preload.ts
git commit -m "feat: add Electron window management, tray, and preload IPC"
```

---

### Task 3: IPC Handlers & Local DB

**Files:**
- Create: `pet-bot/electron/ipc-handlers.ts`
- Create: `pet-bot/src/lib/db.ts`

- [ ] **Step 1: Create electron/ipc-handlers.ts**

```typescript
import { ipcMain } from 'electron'
import { createPetWindow, activePetWindows, closePetWindow, closeAllPetWindows } from './windows'
import Database from 'better-sqlite3'
import { join } from 'path'
import { app } from 'electron'

let db: Database.Database

function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'petbot-local.db')
    db = new Database(dbPath)
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_pets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        bundle BLOB NOT NULL,
        preview_front BLOB,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `)
  }
  return db
}

export function registerIpcHandlers() {
  ipcMain.on('pet:open', (_event, petId: string) => {
    if (!activePetWindows.has(petId)) {
      const win = createPetWindow(petId)
      activePetWindows.set(petId, win)
    }
  })

  ipcMain.on('pet:close', (_event, petId: string) => {
    closePetWindow(petId)
  })

  ipcMain.on('pet:closeAll', () => {
    closeAllPetWindows()
  })

  ipcMain.handle('pet:saveLocal', async (_event, petId: string, bundleData: ArrayBuffer) => {
    const database = getDb()
    const stmt = database.prepare(
      'INSERT OR REPLACE INTO local_pets (id, name, bundle) VALUES (?, ?, ?)'
    )
    stmt.run(petId, `Pet-${petId.slice(0, 8)}`, Buffer.from(bundleData))
  })

  ipcMain.handle('pet:loadBundle', async (_event, petId: string) => {
    const database = getDb()
    const row = database.prepare('SELECT bundle FROM local_pets WHERE id = ?').get(petId) as any
    return row ? row.bundle : null
  })

  ipcMain.handle('pet:listLocal', async () => {
    const database = getDb()
    const rows = database.prepare(
      'SELECT id, name, preview_front, created_at FROM local_pets ORDER BY created_at DESC'
    ).all() as any[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      preview: r.preview_front ? `data:image/png;base64,${r.preview_front.toString('base64')}` : null,
      createdAt: r.created_at,
    }))
  })

  ipcMain.handle('pet:deleteLocal', async (_event, petId: string) => {
    const database = getDb()
    database.prepare('DELETE FROM local_pets WHERE id = ?').run(petId)
  })

  ipcMain.on('window:minimizeToTray', () => {
    // Main window hide handled in window 'close' event
  })
}
```

- [ ] **Step 2: Create src/lib/db.ts (renderer-side API client)**

```typescript
export interface LocalPet {
  id: string
  name: string
  preview: string | null
  createdAt: string
}

export function getPetBotAPI() {
  return (window as any).petBot
}

export async function listLocalPets(): Promise<LocalPet[]> {
  const api = getPetBotAPI()
  if (!api) return []
  return api.listLocalPets()
}

export async function savePetLocally(petId: string, bundleData: ArrayBuffer): Promise<void> {
  const api = getPetBotAPI()
  if (api) await api.savePetLocally(petId, bundleData)
}

export async function loadPetBundle(petId: string): Promise<ArrayBuffer | null> {
  const api = getPetBotAPI()
  if (!api) return null
  return api.loadPetBundle(petId)
}

export function openPetWindow(petId: string) {
  const api = getPetBotAPI()
  if (api) api.openPetWindow(petId)
}

export function closePetWindow(petId: string) {
  const api = getPetBotAPI()
  if (api) api.closePetWindow(petId)
}
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot/electron/ipc-handlers.ts pet-bot/src/lib/db.ts
git commit -m "feat: add IPC handlers and local SQLite pet storage"
```

---

### Task 4: React UI — Layout & Navigation

**Files:**
- Create: `pet-bot/src/components/Layout.tsx`
- Create: `pet-bot/src/pages/Home.tsx` (placeholder)
- Create: `pet-bot/src/pages/Create.tsx` (placeholder)
- Create: `pet-bot/src/pages/Settings.tsx` (placeholder)

- [ ] **Step 1: Create src/components/Layout.tsx**

```tsx
import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

const navItems = [
  { to: '/', label: 'My Pets', icon: '🐾' },
  { to: '/create', label: 'Create', icon: '✨' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      <nav className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col p-4 gap-2">
        <h1 className="text-xl font-bold text-white mb-6">🐶 Pet-Bot</h1>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
```

- [ ] **Step 2: Create placeholder pages**

`src/pages/Home.tsx`:
```tsx
export default function Home() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">My Pets</h2>
      <p className="text-slate-400">No pets yet. Create your first one!</p>
    </div>
  )
}
```

`src/pages/Create.tsx`:
```tsx
export default function Create() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Create New Pet</h2>
      <p className="text-slate-400">Upload a photo to get started.</p>
    </div>
  )
}
```

`src/pages/Settings.tsx`:
```tsx
export default function Settings() {
  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Settings</h2>
      <p className="text-slate-400">Configure your API keys and preferences.</p>
    </div>
  )
}
```

- [ ] **Step 3: Verify React renders with navigation**

```bash
cd pet-bot
npx electron-vite dev
```

Expected: App shows sidebar with 3 nav links, content changes on click.

- [ ] **Step 4: Commit**

```bash
git add pet-bot/src/components/Layout.tsx pet-bot/src/pages/
git commit -m "feat: add React layout, navigation, and page placeholders"
```

---

### Task 5: API Client & Backend Integration

**Files:**
- Create: `pet-bot/src/lib/api.ts`
- Create: `pet-bot/src/store/index.ts`
- Create: `pet-bot/shared/types.ts`

- [ ] **Step 1: Create shared/types.ts**

```typescript
export interface PetStatus {
  id: string
  name: string
  status: 'uploaded' | 'processing' | 'awaiting_review' | 'ready' | 'failed'
  preview_front: string | null
  preview_side: string | null
  preview_back: string | null
  error_message: string | null
  created_at: string
}

export interface PetDetail extends PetStatus {
  source_photo_path: string | null
  asset_bundle_path: string | null
  skeleton_json: string | null
  generations_used: number
  updated_at: string
}

export interface PetListResponse {
  pets: PetStatus[]
  total: number
}

export interface GenerationAction {
  pet_id: string
  action: 'confirm' | 'regenerate'
}
```

- [ ] **Step 2: Create src/lib/api.ts**

```typescript
import type { PetStatus, PetDetail, PetListResponse } from '../../shared/types'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  listPets: () => request<PetListResponse>('/api/v1/pets/'),

  getPet: (id: string) => request<PetDetail>(`/api/v1/pets/${id}`),

  deletePet: (id: string) =>
    fetch(`${BASE_URL}/api/v1/pets/${id}`, { method: 'DELETE' }),

  uploadPhoto: async (file: File, name: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    return request<PetStatus>('/api/v1/generation/upload', { method: 'POST', body: form })
  },

  generatePet: async (petId: string, style?: string) => {
    const form = new FormData()
    if (style) form.append('style', style)
    return request<PetStatus>(`/api/v1/generation/generate/${petId}`, { method: 'POST', body: form })
  },

  getGenerationStatus: (petId: string) =>
    request<PetStatus>(`/api/v1/generation/status/${petId}`),

  confirmGeneration: (petId: string, action: 'confirm' | 'regenerate') =>
    request<PetStatus>('/api/v1/generation/confirm', {
      method: 'POST',
      body: JSON.stringify({ pet_id: petId, action }),
    }),

  downloadPet: async (petId: string) => {
    const res = await fetch(`${BASE_URL}/api/v1/generation/download/${petId}`)
    if (!res.ok) throw new Error('Download failed')
    return res.arrayBuffer()
  },
}
```

- [ ] **Step 3: Create src/store/index.ts**

```typescript
import { create } from 'zustand'
import type { PetStatus } from '../../shared/types'

interface AppState {
  pets: PetStatus[]
  activePetId: string | null
  backendUrl: string
  customApiKey: string

  setPets: (pets: PetStatus[]) => void
  addPet: (pet: PetStatus) => void
  updatePet: (id: string, updates: Partial<PetStatus>) => void
  removePet: (id: string) => void
  setActivePet: (id: string | null) => void
  setBackendUrl: (url: string) => void
  setCustomApiKey: (key: string) => void
}

export const useStore = create<AppState>((set) => ({
  pets: [],
  activePetId: null,
  backendUrl: 'http://localhost:8000',
  customApiKey: '',

  setPets: (pets) => set({ pets }),
  addPet: (pet) => set((s) => ({ pets: [pet, ...s.pets] })),
  updatePet: (id, updates) =>
    set((s) => ({
      pets: s.pets.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    })),
  removePet: (id) => set((s) => ({ pets: s.pets.filter((p) => p.id !== id) })),
  setActivePet: (id) => set({ activePetId: id }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setCustomApiKey: (key) => set({ customApiKey: key }),
}))
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot/src/lib/api.ts pet-bot/src/store/index.ts pet-bot/shared/types.ts
git commit -m "feat: add API client, Zustand store, and shared types"
```

---

### Task 6: Home Page — Pet Browser

**Files:**
- Modify: `pet-bot/src/pages/Home.tsx`
- Create: `pet-bot/src/components/PetCard.tsx`
- Create: `pet-bot/src/hooks/usePets.ts`

- [ ] **Step 1: Create src/hooks/usePets.ts**

```typescript
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store'
import type { PetStatus } from '../../shared/types'

export function usePets() {
  const { pets, setPets } = useStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPets = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listPets()
      setPets(data.pets)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPets()
  }, [])

  return { pets, loading, error, refetch: fetchPets }
}
```

- [ ] **Step 2: Create src/components/PetCard.tsx**

```tsx
import type { PetStatus } from '../../shared/types'
import { useStore } from '../store'
import { openPetWindow } from '../lib/db'

const statusColors: Record<string, string> = {
  uploaded: 'bg-yellow-600',
  processing: 'bg-blue-600 animate-pulse',
  awaiting_review: 'bg-purple-600',
  ready: 'bg-green-600',
  failed: 'bg-red-600',
}

export function PetCard({ pet }: { pet: PetStatus }) {
  const { setActivePet } = useStore()

  const handleLaunch = () => {
    setActivePet(pet.id)
    openPetWindow(pet.id)
  }

  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 transition">
      <div className="aspect-square bg-slate-700 flex items-center justify-center">
        {pet.preview_front ? (
          <img src={pet.preview_front} alt={pet.name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-4xl">📷</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm truncate">{pet.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full text-white ${statusColors[pet.status] || 'bg-slate-600'}`}>
            {pet.status}
          </span>
        </div>
        {pet.error_message && (
          <p className="text-xs text-red-400 truncate">{pet.error_message}</p>
        )}
        {pet.status === 'ready' && (
          <button
            onClick={handleLaunch}
            className="mt-2 w-full bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-1.5 rounded-lg transition"
          >
            🚀 Launch Pet
          </button>
        )}
        {pet.status === 'awaiting_review' && (
          <button
            onClick={() => setActivePet(pet.id)}
            className="mt-2 w-full bg-purple-600 hover:bg-purple-500 text-white text-sm py-1.5 rounded-lg transition"
          >
            👀 Review
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update src/pages/Home.tsx**

```tsx
import { Link } from 'react-router-dom'
import { usePets } from '../hooks/usePets'
import { PetCard } from '../components/PetCard'

export default function Home() {
  const { pets, loading, error } = usePets()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">My Pets</h2>
        <Link
          to="/create"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          + New Pet
        </Link>
      </div>

      {loading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400">Error: {error}</p>}

      {!loading && pets.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🐾</p>
          <p className="text-slate-400 text-lg mb-4">No pets yet</p>
          <Link to="/create" className="text-indigo-400 hover:underline">
            Create your first desktop pet →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pets.map(pet => (
          <PetCard key={pet.id} pet={pet} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add pet-bot/src/pages/Home.tsx pet-bot/src/components/PetCard.tsx pet-bot/src/hooks/usePets.ts
git commit -m "feat: add Home page with pet browser grid and PetCard"
```

---

### Task 7: Create Page — Upload & Generation Flow

**Files:**
- Modify: `pet-bot/src/pages/Create.tsx`
- Create: `pet-bot/src/components/UploadZone.tsx`
- Create: `pet-bot/src/components/GenerationProgress.tsx`
- Create: `pet-bot/src/components/PreviewCarousel.tsx`
- Create: `pet-bot/src/hooks/useGeneration.ts`

- [ ] **Step 1: Create src/components/UploadZone.tsx**

```tsx
import { useCallback, useState, DragEvent } from 'react'

interface Props {
  onUpload: (file: File, name: string) => void
  disabled?: boolean
}

export function UploadZone({ onUpload, disabled = false }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onUpload(file, file.name.split('.')[0] || 'My Pet')
    }
  }, [onUpload])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file, file.name.split('.')[0] || 'My Pet')
    }
  }, [onUpload])

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-12 text-center transition cursor-pointer ${
        dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleChange}
        className="hidden"
        id="photo-upload"
        disabled={disabled}
      />
      <label htmlFor="photo-upload" className="cursor-pointer">
        <p className="text-5xl mb-3">📸</p>
        <p className="text-lg font-medium mb-1">Drop your photo here</p>
        <p className="text-sm text-slate-400">or click to browse — PNG, JPG, WebP (max 10MB)</p>
      </label>
    </div>
  )
}
```

- [ ] **Step 2: Create src/hooks/useGeneration.ts**

```typescript
import { useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import type { PetStatus } from '../../shared/types'

type Stage = 'idle' | 'uploading' | 'generating' | 'review' | 'confirming' | 'done' | 'error'

export function useGeneration() {
  const [stage, setStage] = useState<Stage>('idle')
  const [pet, setPet] = useState<PetStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<number>()

  const upload = useCallback(async (file: File, name: string) => {
    setStage('uploading')
    setError(null)
    try {
      const result = await api.uploadPhoto(file, name)
      setPet(result)
      setStage('generating')

      // Trigger generation
      const genResult = await api.generatePet(result.id)
      setPet(genResult)

      // Poll for status
      pollRef.current = window.setInterval(async () => {
        try {
          const status = await api.getGenerationStatus(result.id)
          setPet(status)
          if (status.status === 'awaiting_review') {
            clearInterval(pollRef.current)
            setStage('review')
          } else if (status.status === 'failed') {
            clearInterval(pollRef.current)
            setStage('error')
            setError(status.error_message || 'Generation failed')
          } else if (status.status === 'ready') {
            clearInterval(pollRef.current)
            setStage('done')
          }
        } catch {
          // Continue polling
        }
      }, 2000)

    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [])

  const confirm = useCallback(async () => {
    if (!pet) return
    setStage('confirming')
    try {
      await api.confirmGeneration(pet.id, 'confirm')
      setStage('done')
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [pet])

  const regenerate = useCallback(async () => {
    if (!pet) return
    setStage('generating')
    setError(null)
    try {
      await api.confirmGeneration(pet.id, 'regenerate')
      const genResult = await api.generatePet(pet.id)
      setPet(genResult)

      pollRef.current = window.setInterval(async () => {
        const status = await api.getGenerationStatus(pet.id)
        setPet(status)
        if (status.status === 'awaiting_review') {
          clearInterval(pollRef.current)
          setStage('review')
        } else if (status.status === 'failed') {
          clearInterval(pollRef.current)
          setStage('error')
        }
      }, 2000)
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [pet])

  const reset = useCallback(() => {
    clearInterval(pollRef.current)
    setStage('idle')
    setPet(null)
    setError(null)
  }, [])

  return { stage, pet, error, upload, confirm, regenerate, reset }
}
```

- [ ] **Step 3: Create PreviewCarousel and GenerationProgress**

`src/components/GenerationProgress.tsx`:
```tsx
import type { PetStatus } from '../../shared/types'

const stages = [
  { key: 'uploaded', label: 'Uploaded' },
  { key: 'processing', label: 'Generating...' },
  { key: 'awaiting_review', label: 'Ready for review' },
  { key: 'ready', label: 'Complete!' },
]

export function GenerationProgress({ pet }: { pet: PetStatus | null }) {
  if (!pet) return null

  const currentIdx = stages.findIndex(s => s.key === pet.status)

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2 mb-2">
        {stages.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2 flex-1">
            <div className={`flex-1 h-1 rounded-full ${
              i <= currentIdx ? 'bg-indigo-500' : 'bg-slate-700'
            } ${pet.status === 'processing' && i === 1 ? 'animate-pulse' : ''}`} />
          </div>
        ))}
      </div>
      <p className="text-sm text-slate-400">
        {stages[currentIdx]?.label || pet.status}
      </p>
    </div>
  )
}
```

`src/components/PreviewCarousel.tsx`:
```tsx
import { useState } from 'react'
import type { PetStatus } from '../../shared/types'

interface Props {
  pet: PetStatus
  onConfirm: () => void
  onRegenerate: () => void
  confirming?: boolean
}

export function PreviewCarousel({ pet, onConfirm, onRegenerate, confirming }: Props) {
  const [view, setView] = useState<'front' | 'side' | 'back'>('front')

  const previews = {
    front: pet.preview_front,
    side: pet.preview_side,
    back: pet.preview_back,
  }

  return (
    <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700">
      <h3 className="text-lg font-medium mb-4">Preview Your Pet</h3>

      <div className="flex justify-center gap-2 mb-4">
        {(['front', 'side', 'back'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 rounded text-sm ${
              view === v ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      <div className="aspect-square bg-slate-900 rounded-lg flex items-center justify-center mb-6 max-w-sm mx-auto">
        {previews[view] ? (
          <img src={previews[view]!} alt={`${view} view`} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-slate-600">No preview</span>
        )}
      </div>

      <div className="flex gap-3 justify-center">
        <button
          onClick={onRegenerate}
          disabled={confirming}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition disabled:opacity-50"
        >
          🔄 Regenerate
        </button>
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition disabled:opacity-50"
        >
          {confirming ? 'Saving...' : '✅ Confirm & Save'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update src/pages/Create.tsx**

```tsx
import { UploadZone } from '../components/UploadZone'
import { GenerationProgress } from '../components/GenerationProgress'
import { PreviewCarousel } from '../components/PreviewCarousel'
import { useGeneration } from '../hooks/useGeneration'
import { savePetLocally, openPetWindow } from '../lib/db'
import { api } from '../lib/api'

export default function Create() {
  const { stage, pet, error, upload, confirm, regenerate, reset } = useGeneration()

  const handleConfirm = async () => {
    await confirm()
    if (pet) {
      try {
        const bundle = await api.downloadPet(pet.id)
        await savePetLocally(pet.id, bundle)
        openPetWindow(pet.id)
      } catch (e) {
        console.error('Failed to download pet:', e)
      }
    }
  }

  if (stage === 'done') {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-2">Pet Created!</h2>
        <p className="text-slate-400 mb-6">Your pet is now on your desktop</p>
        <button
          onClick={reset}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition"
        >
          Create Another
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Create New Pet</h2>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-300">{error}</p>
          <button onClick={reset} className="text-sm text-red-400 underline mt-1">Try again</button>
        </div>
      )}

      {stage === 'idle' && (
        <UploadZone onUpload={upload} />
      )}

      {(stage === 'uploading' || stage === 'generating') && (
        <div className="text-center py-12">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-lg">{stage === 'uploading' ? 'Uploading...' : 'AI is generating your pet...'}</p>
          <GenerationProgress pet={pet} />
        </div>
      )}

      {stage === 'review' && pet && (
        <PreviewCarousel
          pet={pet}
          onConfirm={handleConfirm}
          onRegenerate={regenerate}
          confirming={stage === 'confirming'}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add pet-bot/src/pages/Create.tsx pet-bot/src/components/UploadZone.tsx pet-bot/src/components/GenerationProgress.tsx pet-bot/src/components/PreviewCarousel.tsx pet-bot/src/hooks/useGeneration.ts
git commit -m "feat: add Create page with upload, generation flow, and preview"
```

---

### Task 8: Settings Page

**Files:**
- Modify: `pet-bot/src/pages/Settings.tsx`
- Create: `pet-bot/src/components/ApiKeyInput.tsx`

- [ ] **Step 1: Create src/components/ApiKeyInput.tsx**

```tsx
import { useState } from 'react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
}

export function ApiKeyInput({ label, value, onChange, placeholder, hint }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button
          onClick={() => setVisible(!visible)}
          className="px-3 py-2 bg-slate-700 rounded-lg text-sm hover:bg-slate-600"
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Update src/pages/Settings.tsx**

```tsx
import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'

export default function Settings() {
  const { backendUrl, setBackendUrl, customApiKey, setCustomApiKey } = useStore()

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg mb-6">
        <h3 className="text-lg font-medium mb-4">Backend Server</h3>
        <label className="block text-sm font-medium mb-1">API URL</label>
        <input
          type="text"
          value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="http://localhost:8000"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <p className="text-xs text-slate-500 mt-1">The FastAPI backend server address</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg">
        <h3 className="text-lg font-medium mb-4">API Provider</h3>
        <p className="text-sm text-slate-400 mb-4">
          Pet-Bot includes a built-in API with 5 free generations. Provide your own key for unlimited use.
        </p>
        <ApiKeyInput
          label="Custom API Key"
          value={customApiKey}
          onChange={setCustomApiKey}
          placeholder="sk-..."
          hint="Leave empty to use the built-in service (5 free generations)"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot/src/pages/Settings.tsx pet-bot/src/components/ApiKeyInput.tsx
git commit -m "feat: add Settings page with API key and backend URL configuration"
```

---

### Task 9: Pet Renderer — PixiJS Skeleton Engine

**Files:**
- Create: `pet-bot/pet-renderer/index.html`
- Create: `pet-bot/pet-renderer/index.ts`
- Create: `pet-bot/pet-renderer/skeleton.ts`

- [ ] **Step 1: Create pet-renderer/index.html**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="module" src="./index.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create pet-renderer/skeleton.ts**

```typescript
import { Container, Graphics, Text, TextStyle } from 'pixi.js'

interface Bone {
  name: string
  parent: string
  x: number
  y: number
  length: number
  rotation: number
}

interface SkeletonData {
  skeleton: { width: number; height: number }
  bones: Bone[]
  slots: any[]
  animations: Record<string, any>
}

export class SkeletonRenderer {
  container: Container
  private bones: Map<string, Graphics> = new Map()
  private parts: Map<string, Container> = new Map()
  currentAnimation: string = 'idle'
  private animTimer: number = 0
  private animDuration: number = 2000
  private onComplete?: () => void

  constructor(data: SkeletonData) {
    this.container = new Container()
    this.buildSkeleton(data)
    this.play('idle')
  }

  private buildSkeleton(data: SkeletonData) {
    // Draw bones as simple colored shapes for MVP
    data.bones.forEach((bone) => {
      if (bone.name === 'root') return

      const g = new Graphics()
      // Draw bone line
      g.lineStyle(3, 0x888888, 0.5)
      g.moveTo(0, 0)
      g.lineTo(bone.length, 0)
      // Draw joint circle
      g.beginFill(0xffffff, 0.3)
      g.drawCircle(0, 0, 5)
      g.endFill()

      g.x = bone.x
      g.y = bone.y

      this.bones.set(bone.name, g)
      this.container.addChild(g)
    })

    // Position at center
    this.container.x = 100
    this.container.y = 100
  }

  play(name: string, onComplete?: () => void) {
    this.currentAnimation = name
    this.onComplete = onComplete
    this.animTimer = 0
    this.animDuration = name === 'poke' ? 500 : name === 'jump' ? 800 : 2000
  }

  update(delta: number) {
    this.animTimer += delta * 16.67 // Convert to ms

    const progress = Math.min(this.animTimer / this.animDuration, 1)

    // Simple animation: gentle bobbing for idle, sway for walk
    switch (this.currentAnimation) {
      case 'idle':
        this.container.y = 100 + Math.sin(progress * Math.PI * 4) * 3
        this.container.rotation = Math.sin(progress * Math.PI * 2) * 0.02
        break
      case 'walk':
        this.container.x += Math.sin(progress * Math.PI * 4) * 2
        this.container.y = 100 + Math.abs(Math.sin(progress * Math.PI * 8)) * 5
        break
      case 'jump':
        this.container.y = 100 - Math.sin(progress * Math.PI) * 40
        break
      case 'sit':
        this.container.y = 120
        this.container.scale.y = 1 - progress * 0.2
        break
      case 'sleep':
        this.container.rotation = 0.8 * progress
        this.container.y = 130 + progress * 10
        break
      case 'poke':
        this.container.x = 100 + Math.sin(progress * Math.PI * 2) * 10
        this.container.rotation = Math.sin(progress * Math.PI * 2) * 0.1
        break
      case 'spin':
        this.container.rotation = progress * Math.PI * 2
        break
      case 'wave':
        this.container.rotation = Math.sin(progress * Math.PI * 6) * 0.15
        break
    }

    if (progress >= 1 && this.onComplete) {
      this.onComplete()
    }
  }

  destroy() {
    this.container.destroy({ children: true })
  }
}
```

- [ ] **Step 3: Create pet-renderer/index.ts**

```typescript
import { Application } from 'pixi.js'
import { SkeletonRenderer } from './skeleton'

async function init() {
  const app = new Application()
  await app.init({
    width: 200,
    height: 200,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  document.body.appendChild(app.canvas)

  // Load default skeleton (or from IPC for the given petId)
  let skeleton: SkeletonRenderer

  try {
    const response = await fetch('/pet-renderer/assets/default-pet.json')
    const data = await response.json()
    skeleton = new SkeletonRenderer(data)
    app.stage.addChild(skeleton.container)
  } catch {
    // Create a fallback simple character
    skeleton = new SkeletonRenderer({
      skeleton: { width: 200, height: 200 },
      bones: [
        { name: 'root', parent: '', x: 0, y: 0, length: 0, rotation: 0 },
        { name: 'spine', parent: 'root', x: 100, y: 60, length: 40, rotation: 0 },
        { name: 'neck', parent: 'root', x: 100, y: 40, length: 20, rotation: 0 },
        { name: 'left_upper_arm', parent: 'root', x: 70, y: 60, length: 30, rotation: 0.5 },
        { name: 'right_upper_arm', parent: 'root', x: 130, y: 60, length: 30, rotation: -0.5 },
        { name: 'left_upper_leg', parent: 'root', x: 80, y: 100, length: 35, rotation: 0.3 },
        { name: 'right_upper_leg', parent: 'root', x: 120, y: 100, length: 35, rotation: -0.3 },
      ],
      slots: [],
      animations: {},
    })
    app.stage.addChild(skeleton.container)
  }

  // Main loop
  app.ticker.add((ticker) => {
    if (skeleton) {
      skeleton.update(ticker.deltaTime)
    }
  })
}

init()
```

- [ ] **Step 4: Create default pet skeleton asset**

`pet-renderer/assets/default-pet.json`:
```json
{
  "skeleton": { "spine": "4.1.0", "width": 200, "height": 200 },
  "bones": [
    { "name": "root" },
    { "name": "spine", "parent": "root", "x": 100, "y": 60, "length": 40, "rotation": 0 },
    { "name": "neck", "parent": "root", "x": 100, "y": 40, "length": 20, "rotation": 0 },
    { "name": "head", "parent": "root", "x": 100, "y": 20, "length": 20, "rotation": 0 },
    { "name": "left_upper_arm", "parent": "root", "x": 70, "y": 60, "length": 30, "rotation": 0.5 },
    { "name": "left_lower_arm", "parent": "root", "x": 55, "y": 70, "length": 25, "rotation": 0.3 },
    { "name": "right_upper_arm", "parent": "root", "x": 130, "y": 60, "length": 30, "rotation": -0.5 },
    { "name": "right_lower_arm", "parent": "root", "x": 145, "y": 70, "length": 25, "rotation": -0.3 },
    { "name": "left_upper_leg", "parent": "root", "x": 80, "y": 100, "length": 35, "rotation": 0.3 },
    { "name": "left_lower_leg", "parent": "root", "x": 70, "y": 115, "length": 30, "rotation": 0.1 },
    { "name": "right_upper_leg", "parent": "root", "x": 120, "y": 100, "length": 35, "rotation": -0.3 },
    { "name": "right_lower_leg", "parent": "root", "x": 130, "y": 115, "length": 30, "rotation": -0.1 }
  ],
  "slots": [],
  "animations": {
    "idle": {}, "walk": {}, "jump": {}, "sit": {}, "sleep": {}, "poke": {}, "spin": {}, "wave": {}
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add pet-bot/pet-renderer/
git commit -m "feat: add PixiJS pet renderer with skeleton animation engine"
```

---

### Task 10: Behavior Tree & Interaction

**Files:**
- Create: `pet-bot/pet-renderer/behavior.ts`
- Create: `pet-bot/pet-renderer/interaction.ts`

- [ ] **Step 1: Create pet-renderer/behavior.ts**

```typescript
import { SkeletonRenderer } from './skeleton'

type PetAction = 'idle' | 'walk' | 'jump' | 'sit' | 'sleep'

interface BehaviorNode {
  action: PetAction
  weight: number       // Probability weight
  minDuration: number  // ms
  maxDuration: number  // ms
}

const IDLE_BEHAVIORS: BehaviorNode[] = [
  { action: 'idle', weight: 50, minDuration: 3000, maxDuration: 8000 },
  { action: 'walk', weight: 25, minDuration: 2000, maxDuration: 5000 },
  { action: 'jump', weight: 10, minDuration: 500, maxDuration: 1500 },
  { action: 'sit', weight: 10, minDuration: 4000, maxDuration: 10000 },
  { action: 'sleep', weight: 5, minDuration: 8000, maxDuration: 20000 },
]

const TOTAL_WEIGHT = IDLE_BEHAVIORS.reduce((sum, b) => sum + b.weight, 0)

function pickRandomBehavior(): BehaviorNode {
  let r = Math.random() * TOTAL_WEIGHT
  for (const behavior of IDLE_BEHAVIORS) {
    r -= behavior.weight
    if (r <= 0) return behavior
  }
  return IDLE_BEHAVIORS[0]
}

export class BehaviorTree {
  private skeleton: SkeletonRenderer
  private timer: ReturnType<typeof setTimeout> | null = null
  private interrupted: boolean = false
  private paused: boolean = false

  constructor(skeleton: SkeletonRenderer) {
    this.skeleton = skeleton
  }

  start() {
    this.scheduleNext()
  }

  private scheduleNext() {
    if (this.paused) return

    const behavior = pickRandomBehavior()
    const duration = behavior.minDuration + Math.random() * (behavior.maxDuration - behavior.minDuration)

    this.skeleton.play(behavior.action, () => {
      if (!this.interrupted) {
        this.scheduleNext()
      }
    })

    // Schedule next behavior after this one's duration
    this.timer = setTimeout(() => {
      if (!this.interrupted && !this.paused) {
        this.scheduleNext()
      }
    }, duration)
  }

  interrupt(action: string) {
    this.interrupted = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }

    this.skeleton.play(action, () => {
      this.interrupted = false
      this.scheduleNext()
    })
  }

  pause() {
    this.paused = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  resume() {
    this.paused = false
    this.interrupted = false
    this.scheduleNext()
  }

  destroy() {
    this.pause()
  }
}
```

- [ ] **Step 2: Create pet-renderer/interaction.ts**

```typescript
export interface DragHandler {
  onDragStart: (x: number, y: number) => void
  onDragMove: (dx: number, dy: number) => void
  onDragEnd: () => void
}

export function setupDragHandlers(
  canvas: HTMLCanvasElement,
  handler: DragHandler
) {
  let dragging = false
  let lastX = 0
  let lastY = 0

  canvas.addEventListener('mousedown', (e) => {
    dragging = true
    lastX = e.screenX
    lastY = e.screenY
    handler.onDragStart(e.screenX, e.screenY)
    e.preventDefault()
  })

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const dx = e.screenX - lastX
    const dy = e.screenY - lastY
    handler.onDragMove(dx, dy)
    lastX = e.screenX
    lastY = e.screenY
  })

  window.addEventListener('mouseup', () => {
    if (dragging) {
      dragging = false
      handler.onDragEnd()
    }
  })
}
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot/pet-renderer/behavior.ts pet-bot/pet-renderer/interaction.ts
git commit -m "feat: add idle behavior tree and drag interaction"
```

---

### Task 11: Pet Window Integration & Final Assembly

**Files:**
- Modify: `pet-bot/pet-renderer/index.ts` (integrate behavior + interaction)
- Create: `pet-bot/.env` (Vite env)

- [ ] **Step 1: Update pet-renderer/index.ts with full integration**

Replace the init function body after skeleton creation with:
```typescript
import { BehaviorTree } from './behavior'
import { setupDragHandlers } from './interaction'

async function init() {
  const app = new Application()
  await app.init({
    width: 200,
    height: 200,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  })

  document.body.appendChild(app.canvas)

  // Load skeleton data
  let skeleton: SkeletonRenderer
  try {
    const response = await fetch('/pet-renderer/assets/default-pet.json')
    const data = await response.json()
    skeleton = new SkeletonRenderer(data)
  } catch {
    // ... fallback skeleton (same as Task 9) ...
  }

  app.stage.addChild(skeleton.container)

  // Start behavior tree
  const behavior = new BehaviorTree(skeleton)
  behavior.start()

  // Click to poke
  app.canvas.addEventListener('click', (e) => {
    // If click didn't start a drag, treat as poke
    behavior.interrupt('poke')
  })

  // Drag to reposition window
  setupDragHandlers(app.canvas, {
    onDragStart: () => behavior.pause(),
    onDragMove: (dx, dy) => {
      // Send IPC to move the pet window
      (window as any).petBot?.moveWindow?.(dx, dy)
    },
    onDragEnd: () => behavior.resume(),
  })

  // Main loop
  app.ticker.add((ticker) => {
    skeleton.update(ticker.deltaTime)
  })
}
```

- [ ] **Step 2: Create .env**

```
VITE_API_URL=http://localhost:8000
```

- [ ] **Step 3: Commit**

```bash
git add pet-bot/pet-renderer/index.ts pet-bot/.env
git commit -m "feat: integrate behavior tree and drag interaction into pet window"
```

---

### Task 12: Final Verification

- [ ] **Step 1: Start backend server**

```bash
cd pet-bot-server
source venv/Scripts/activate
python -m uvicorn app.main:app --reload
```

Expected: Server starts on http://localhost:8000, health check OK.

- [ ] **Step 2: Start Electron in dev mode**

```bash
cd pet-bot
npx electron-vite dev
```

Expected: Electron app opens with React UI. Can navigate between Home/Create/Settings pages.

- [ ] **Step 3: Verify end-to-end flow**

1. Upload a photo on Create page
2. Verify generation progress is shown
3. Preview shows (stub for now)
4. Confirm creates pet
5. Pet appears on Home page
6. Launch pet opens a transparent window with PixiJS skeleton
7. Click pet → reacts (poke animation)
8. Drag pet → window follows
9. Tray icon present with context menu

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: final integration — full pet creation flow working"
```

---

## Client Implementation Complete

All 12 tasks cover: Electron scaffolding → window management → React UI → API integration → PixiJS renderer → behavior tree → interaction → end-to-end flow.
