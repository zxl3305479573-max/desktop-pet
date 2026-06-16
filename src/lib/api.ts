import { useStore } from '../store'
import type { PetStatus, PetDetail, PetListResponse, JobStatus } from '../../shared/types'

function getBaseUrl(): string {
  return useStore.getState().backendUrl || 'http://localhost:8000'
}

function headers(): Record<string, string> {
  const token = useStore.getState().token
  const h: Record<string, string> = {}
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${getBaseUrl()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...headers(),
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
    fetch(`${getBaseUrl()}/api/v1/pets/${id}`, { method: 'DELETE', headers: headers() }),

  uploadPhoto: async (file: File, name: string, prompt?: string, provider?: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('name', name)
    if (prompt) form.append('prompt', prompt)
    if (provider) form.append('provider', provider)
    const res = await fetch(`${getBaseUrl()}/api/v1/upload`, {
      method: 'POST',
      headers: { ...headers() },
      body: form,
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }))
      throw new Error(err.detail || `HTTP ${res.status}`)
    }
    return res.json()
  },

  getJobStatus: (jobId: string) => request<JobStatus>(`/api/v1/jobs/${jobId}`),

  confirmGeneration: (jobId: string, action: 'confirm' | 'regenerate') =>
    request<{ status: string; pet_id?: string; job_id?: string }>(
      `/api/v1/jobs/${jobId}/confirm`,
      { method: 'POST', body: JSON.stringify({ action }) }
    ),

  downloadPet: async (petId: string) => {
    const res = await fetch(`${getBaseUrl()}/api/v1/download/${petId}`, { headers: headers() })
    if (!res.ok) throw new Error('Download failed')
    return res.arrayBuffer()
  },

  getCredits: () =>
    request<{ balance: number; cost_per_generation: number; transactions: any[] }>('/api/v1/credits/me'),

  rechargeCredits: (amount: number) =>
    request<{ balance: number; recharged: number }>('/api/v1/credits/recharge', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),
}
