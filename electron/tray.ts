import { Tray, Menu, nativeImage, BrowserWindow } from 'electron'

let tray: Tray | null = null

export function setupTray(mainWindow: BrowserWindow) {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon.resize({ width: 16, height: 16 }))

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Pet-Bot', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => { mainWindow.destroy(); process.exit(0) } },
  ])

  tray.setToolTip('Pet-Bot')
  tray.setContextMenu(contextMenu)
  tray.on('click', () => mainWindow.show())
  return tray
}
