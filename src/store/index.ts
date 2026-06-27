import { create } from 'zustand'

// ── generation state types ────────────────────────────────────────────

export type GenerationStage =
  | 'idle'
  | 'uploading'
  | 'stepping'
  | 'review'
  | 'confirming'
  | 'done'
  | 'error'

export interface StepResult {
  stage: number
  status: string
  preview?: string
  /** Stage 1/3: Record<string, string>. Stage 2 (action_pack): Record<string, string[]>. */
  previews?: Record<string, string | string[]>
  sprite_type?: string
  animations?: string[]
  frame_counts?: Record<string, number>
  message?: string
}

export interface GenerationState {
  stage: GenerationStage
  petId: string | null
  jobId: string | null
  currentStep: number
  stepResult: StepResult | null
  stepLoading: boolean
  stepError: string | null
}

const DEFAULT_GENERATION: GenerationState = {
  stage: 'idle',
  petId: null,
  jobId: null,
  currentStep: 1,
  stepResult: null,
  stepLoading: false,
  stepError: null,
}

// ── store ──────────────────────────────────────────────────────────────

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

  // Generation state — lifted here so it survives route changes
  generation: GenerationState
  patchGeneration: (patch: Partial<GenerationState>) => void
  clearGeneration: () => void
}

export const useStore = create<AppState>((set) => ({
  backendUrl: (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8000',
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

  generation: { ...DEFAULT_GENERATION },
  patchGeneration: (patch) =>
    set((s) => ({ generation: { ...s.generation, ...patch } })),
  clearGeneration: () => set({ generation: { ...DEFAULT_GENERATION } }),
}))
