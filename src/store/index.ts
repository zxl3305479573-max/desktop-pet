import { create } from 'zustand'

interface AppState {
  token: string | null
  backendUrl: string
  customApiKey: string

  setToken: (token: string | null) => void
  setBackendUrl: (url: string) => void
  setCustomApiKey: (key: string) => void
}

export const useStore = create<AppState>((set) => ({
  token: null,
  backendUrl: 'http://localhost:8000',
  customApiKey: '',

  setToken: (token) => set({ token }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setCustomApiKey: (key) => set({ customApiKey: key }),
}))
