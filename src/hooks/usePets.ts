import { useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'
import type { PetStatus } from '../../shared/types'

export function usePets() {
  const [pets, setPets] = useState<PetStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPets = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listPets()
      setPets(data.pets)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPets() }, [fetchPets])

  const deletePet = useCallback(async (id: string) => {
    try {
      await api.deletePet(id)
      setPets((prev) => prev.filter((p) => p.id !== id))
    } catch (e: any) {
      setError(e.message)
    }
  }, [])

  return { pets, loading, error, refetch: fetchPets, deletePet }
}
