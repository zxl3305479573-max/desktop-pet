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
  if (process.platform !== 'darwin') {
    // Keep running in tray on Windows
  }
})

app.on('activate', () => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = createMainWindow()
  } else {
    mainWindow.show()
  }
})
