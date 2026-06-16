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
      contextIsolation: true,
      nodeIntegration: false,
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
    e.preventDefault()
    win.hide()
  })

  return win
}

export function createPetWindow(_petId: string): BrowserWindow {
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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/pet.html?petId=${_petId}`)
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
