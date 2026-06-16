const api = () => (window as any).petBot as {
  openPetWindow: (id: string) => void
  closePetWindow: (id: string) => void
  savePetLocally: (id: string, data: ArrayBuffer) => Promise<void>
  loadPetBundle: (id: string) => Promise<ArrayBuffer | null>
  listLocalPets: () => Promise<Array<{ id: string; name: string; preview: string | null }>>
  deleteLocalPet: (id: string) => Promise<void>
} | null

export function openPetWindow(petId: string) {
  api()?.openPetWindow(petId)
}

export function closePetWindow(petId: string) {
  api()?.closePetWindow(petId)
}

export async function savePetLocally(petId: string, bundleData: ArrayBuffer): Promise<void> {
  await api()?.savePetLocally(petId, bundleData)
}

export async function loadPetBundle(petId: string): Promise<ArrayBuffer | null> {
  return (await api()?.loadPetBundle(petId)) ?? null
}

export async function listLocalPets() {
  return (await api()?.listLocalPets()) ?? []
}

export async function deleteLocalPet(petId: string) {
  await api()?.deleteLocalPet(petId)
}
