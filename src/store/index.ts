import { create } from 'zustand'

interface AppState {
  backendUrl: string
  apiKey: string
  apiBaseUrl: string
  apiModel: string
  selectedProvider: string

  setBackendUrl: (url: string) => void
  setApiKey: (key: string) => void
  setApiBaseUrl: (url: string) => void
  setApiModel: (model: string) => void
  setSelectedProvider: (p: string) => void
  loadSettings: (settings: Record<string, string>) => void
}

export const useStore = create<AppState>((set) => ({
  backendUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  apiKey: '',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiModel: 'gpt-image-2',
  selectedProvider: 'builtin',

  setBackendUrl: (url) => set({ backendUrl: url }),
  setApiKey: (key) => set({ apiKey: key }),
  setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
  setApiModel: (model) => set({ apiModel: model }),
  setSelectedProvider: (p) => set({ selectedProvider: p }),

  loadSettings: (settings) =>
    set({
      apiKey: settings.apiKey ?? '',
      apiBaseUrl: settings.apiBaseUrl ?? 'https://api.openai.com/v1',
      apiModel: settings.apiModel ?? 'gpt-image-2',
    }),
}))
