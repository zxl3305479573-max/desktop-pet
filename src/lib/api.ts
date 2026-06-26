import { useStore } from '../store'
import type { PetStatus, PetDetail, PetListResponse, JobStatus } from '../../shared/types'

function getBaseUrl(): string {
  return useStore.getState().backendUrl || 'http://localhost:8000'
}

/**
 * Convert a server-side asset path (e.g. "./assets/abc/preview_front.png")
 * to a full URL the browser can load.
 */
export function resolveAssetUrl(path: string | null): string {
  if (!path) return ''
  const base = getBaseUrl()
  // The backend stores paths like "./assets/..." or "assets/..."
  const relative = path.replace(/^\.[\\/]/, '')
  return `${base}/${relative}`
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.body instanceof FormData ? {} : options?.headers),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as unknown as T
  return res.json()
}

export const api = {
  listPets: () => request<PetListResponse>('/api/v1/pets/'),

  getPet: (id: string) => request<PetDetail>(`/api/v1/pets/${id}`),

  deletePet: (id: string) =>
    fetch(`${getBaseUrl()}/api/v1/pets/${id}`, { method: 'DELETE' }),

  uploadPhoto: async (file: File, name: string, prompt?: string, provider?: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    if (prompt) form.append('prompt', prompt)
    if (provider) form.append('provider', provider)
    const res = await fetch(`${getBaseUrl()}/api/v1/upload`, {
      method: 'POST',
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    return res.json()
  },

  getJobStatus: (jobId: string) => request<JobStatus>(`/api/v1/jobs/${jobId}`),

  runNextStage: (jobId: string) =>
    request<any>(`/api/v1/jobs/${jobId}/next`, { method: 'POST' }),

  regenerateStage: (jobId: string, stage: number) =>
    request<any>(`/api/v1/jobs/${jobId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ stage }),
    }),

  confirmGeneration: (jobId: string, action: 'confirm' | 'regenerate') =>
    request<{ status: string; pet_id?: string; job_id?: string }>(
      `/api/v1/jobs/${jobId}/confirm`,
      { method: 'POST', body: JSON.stringify({ action }) }
    ),

  downloadPet: async (petId: string) => {
    const res = await fetch(`${getBaseUrl()}/api/v1/download/${petId}`)
    if (!res.ok) throw new Error('Download failed')
    return res.arrayBuffer()
  },

  updateConfig: (config: { api_key?: string; api_base_url?: string; model?: string }) =>
    request('/api/v1/config', { method: 'PUT', body: JSON.stringify(config) }),
}
