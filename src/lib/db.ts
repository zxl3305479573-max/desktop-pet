type PetBotBridge = {
  openPetWindow: (id: string) => void
  closePetWindow: (id: string) => void
  closeCurrentPetWindow?: () => void
  savePetLocally: (id: string, data: ArrayBuffer) => Promise<void>
  loadPetBundle: (id: string) => Promise<ArrayBuffer | null>
  listLocalPets: () => Promise<Array<{ id: string; name: string; preview: string | null }>>
  deleteLocalPet: (id: string) => Promise<void>
  saveSettings: (data: Record<string, string>) => Promise<void>
  loadSettings: () => Promise<Record<string, string>>
}

export const DESKTOP_PET_UNAVAILABLE_MESSAGE =
  '桌宠只能在 Electron desktop app 中启动。请使用项目自动打开的桌面窗口，不要在浏览器页面中启动。'

const api = (): PetBotBridge | null => {
  if (typeof window === 'undefined') return null
  return ((window as any).petBot as PetBotBridge | undefined) ?? null
}

function requireApi(): PetBotBridge {
  const bridge = api()
  if (!bridge) {
    throw new Error(DESKTOP_PET_UNAVAILABLE_MESSAGE)
  }
  return bridge
}

export function isDesktopPetAvailable(): boolean {
  return Boolean(api())
}

export function openPetWindow(petId: string) {
  requireApi().openPetWindow(petId)
}

export function closePetWindow(petId: string) {
  requireApi().closePetWindow(petId)
}

export async function savePetLocally(petId: string, bundleData: ArrayBuffer): Promise<void> {
  await requireApi().savePetLocally(petId, bundleData)
}

export async function loadPetBundle(petId: string): Promise<ArrayBuffer | null> {
  return await requireApi().loadPetBundle(petId)
}

export async function listLocalPets() {
  return await requireApi().listLocalPets()
}

export async function deleteLocalPet(petId: string) {
  await requireApi().deleteLocalPet(petId)
}

export async function saveAndOpenPet(petId: string, bundleData: ArrayBuffer): Promise<void> {
  const bridge = requireApi()
  await bridge.savePetLocally(petId, bundleData)
  bridge.openPetWindow(petId)
}

export async function saveAppSettings(data: Record<string, string>): Promise<void> {
  const bridge = api()
  if (bridge) {
    await bridge.saveSettings(data)
  }
}

export async function loadAppSettings(): Promise<Record<string, string>> {
  const bridge = api()
  if (bridge) {
    return await bridge.loadSettings()
  }
  return {}
}

export async function cacheAndOpenPet(
  petId: string,
  downloadBundle: () => Promise<ArrayBuffer>,
): Promise<void> {
  const bridge = requireApi()
  const bundleData = await downloadBundle()
  await bridge.savePetLocally(petId, bundleData)
  bridge.openPetWindow(petId)
}
