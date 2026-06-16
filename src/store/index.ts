import { create } from 'zustand'

interface AppState {
  token: string | null
  backendUrl: string
  customApiKey: string
  selectedProvider: string
  credits: number
  costPerGen: number

  setToken: (token: string | null) => void
  setBackendUrl: (url: string) => void
  setCustomApiKey: (key: string) => void
  setSelectedProvider: (p: string) => void
  setCredits: (c: number) => void
  setCostPerGen: (c: number) => void
}

export const useStore = create<AppState>((set) => ({
  token: null,
  backendUrl: 'http://localhost:8000',
  customApiKey: '',
  selectedProvider: 'builtin',
  credits: 0,
  costPerGen: 10,

  setToken: (token) => set({ token }),
  setBackendUrl: (url) => set({ backendUrl: url }),
  setCustomApiKey: (key) => set({ customApiKey: key }),
  setSelectedProvider: (p) => set({ selectedProvider: p }),
  setCredits: (c) => set({ credits: c }),
  setCostPerGen: (c) => set({ costPerGen: c }),
}))
