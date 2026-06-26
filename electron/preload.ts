import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('petBot', {
  openPetWindow: (petId: string) => ipcRenderer.send('pet:open', petId),
  closePetWindow: (petId: string) => ipcRenderer.send('pet:close', petId),
  closeCurrentPetWindow: () => ipcRenderer.send('pet:closeCurrent'),
  closeAllPetWindows: () => ipcRenderer.send('pet:closeAll'),
  savePetLocally: (petId: string, bundleData: ArrayBuffer) =>
    ipcRenderer.invoke('pet:saveLocal', petId, bundleData),
  loadPetBundle: (petId: string) => ipcRenderer.invoke('pet:loadBundle', petId),
  listLocalPets: () => ipcRenderer.invoke('pet:listLocal'),
  deleteLocalPet: (petId: string) => ipcRenderer.invoke('pet:deleteLocal', petId),
  movePetWindow: (dx: number, dy: number) => ipcRenderer.send('pet:move', dx, dy),
  minimizeToTray: () => ipcRenderer.send('window:minimizeToTray'),
  saveSettings: (data: Record<string, string>) =>
    ipcRenderer.invoke('settings:save', data),
  loadSettings: () => ipcRenderer.invoke('settings:loadAll'),
})
