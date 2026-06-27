import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import { useStore } from '../store'
import type { PetDetail } from '../../shared/types'

export interface ManifestAnimation {
  mode: 'static' | 'sequence'
  frame_duration_ms: number
  frames: Array<{ src: string; anchor: { x: number; y: number } }>
  rows?: Array<{ frames: Array<{ src: string; anchor: { x: number; y: number } }> }>
}

export interface ManifestData {
  version: number
  asset_type: string
  animations: Record<string, ManifestAnimation>
}

function getBaseUrl(): string {
  return useStore.getState().backendUrl || 'http://localhost:8000'
}

async function fetchManifest(petId: string): Promise<ManifestData | null> {
  try {
    const res = await fetch(`${getBaseUrl()}/assets/${petId}/manifest.json`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export function usePetDetail(id: string) {
  const [pet, setPet] = useState<PetDetail | null>(null)
  const [manifest, setManifest] = useState<ManifestData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)

  const fetchPet = useCallback(async () => {
    setLoading(true)
    setError(null)
    setNotFound(false)
    try {
      const data = await api.getPet(id)
      setPet(data)
      // Try to load manifest for frame-level material display
      const manifestData = await fetchManifest(id)
      setManifest(manifestData)
    } catch (e: any) {
      if (e.message?.includes('404') || e.message?.includes('not found')) {
        setNotFound(true)
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchPet() }, [fetchPet])

  return { pet, manifest, loading, error, notFound, refetch: fetchPet }
}
