import { ipcMain, BrowserWindow } from 'electron'
import { createPetWindow, activePetWindows, closePetWindow, closeAllPetWindows } from './windows'

export function registerIpcHandlers() {
  ipcMain.on('pet:open', (_event, petId: string) => {
    if (!activePetWindows.has(petId)) {
      const win = createPetWindow(petId)
      activePetWindows.set(petId, win)
    }
  })

  ipcMain.on('pet:close', (_event, petId: string) => closePetWindow(petId))

  ipcMain.on('pet:closeAll', () => closeAllPetWindows())

  ipcMain.on('pet:move', (event, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const [x, y] = win.getPosition()
      win.setPosition(x + dx, y + dy)
    }
  })

  ipcMain.handle('pet:saveLocal', async (_event, petId: string, _bundleData: ArrayBuffer) => {
    // Stub: implement with better-sqlite3 later
    return true
  })

  ipcMain.handle('pet:loadBundle', async (_event, _petId: string) => null)
  ipcMain.handle('pet:listLocal', async () => [])
  ipcMain.handle('pet:deleteLocal', async (_event, _petId: string) => {})

  ipcMain.on('window:minimizeToTray', () => {})
}
