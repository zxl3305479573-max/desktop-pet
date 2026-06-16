import { ipcMain, BrowserWindow, app } from 'electron'
import { createPetWindow, activePetWindows, closePetWindow, closeAllPetWindows } from './windows'
import Database from 'better-sqlite3'
import { join } from 'path'

let db: Database.Database

function getDb(): Database.Database {
  if (!db) {
    const dbPath = join(app.getPath('userData'), 'petbot-local.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
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

  ipcMain.on('pet:close', (_event, petId: string) => closePetWindow(petId))

  ipcMain.on('pet:closeAll', () => closeAllPetWindows())

  ipcMain.on('pet:move', (event, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) {
      const [x, y] = win.getPosition()
      win.setPosition(x + dx, y + dy)
    }
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
    return row ? row.bundle.buffer : null
  })

  ipcMain.handle('pet:listLocal', async () => {
    const database = getDb()
    const rows = database.prepare(
      'SELECT id, name, preview_front, created_at FROM local_pets ORDER BY created_at DESC'
    ).all() as any[]
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      preview: r.preview_front
        ? `data:image/png;base64,${r.preview_front.toString('base64')}`
        : null,
    }))
  })

  ipcMain.handle('pet:deleteLocal', async (_event, petId: string) => {
    const database = getDb()
    database.prepare('DELETE FROM local_pets WHERE id = ?').run(petId)
  })

  ipcMain.on('window:minimizeToTray', () => {})
}

export function closeDb() {
  if (db) {
    db.close()
  }
}
