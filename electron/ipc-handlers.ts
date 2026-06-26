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
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
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

  ipcMain.on('pet:closeCurrent', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return

    for (const [petId, petWindow] of activePetWindows) {
      if (petWindow === win) {
        activePetWindows.delete(petId)
        break
      }
    }

    if (!win.isDestroyed()) win.close()
  })

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
    if (!row) return null
    const bundle = row.bundle as Buffer
    return bundle.buffer.slice(bundle.byteOffset, bundle.byteOffset + bundle.byteLength)
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

  // ---- settings persistence ----

  ipcMain.handle('settings:save', async (_event, data: Record<string, string>) => {
    const database = getDb()
    const stmt = database.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
    )
    const insertMany = database.transaction((entries: [string, string][]) => {
      for (const [key, value] of entries) {
        stmt.run(key, value)
      }
    })
    insertMany(Object.entries(data))
  })

  ipcMain.handle('settings:loadAll', async () => {
    const database = getDb()
    const rows = database.prepare('SELECT key, value FROM settings').all() as {
      key: string
      value: string
    }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  })
}

export function closeDb() {
  if (db) {
    db.close()
  }
}
