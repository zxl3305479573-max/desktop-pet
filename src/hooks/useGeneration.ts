import { useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { savePetLocally, openPetWindow } from '../lib/db'
import type { JobStatus } from '../../shared/types'

type Stage = 'idle' | 'uploading' | 'generating' | 'review' | 'confirming' | 'done' | 'error'

export function useGeneration() {
  const [stage, setStage] = useState<Stage>('idle')
  const [petId, setPetId] = useState<string | null>(null)
  const [job, setJob] = useState<JobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval>>()

  const startPolling = useCallback((jobId: string) => {
    pollRef.current = setInterval(async () => {
      try {
        const status = await api.getJobStatus(jobId)
        setJob(status)
        if (status.status === 'awaiting_review') {
          clearInterval(pollRef.current)
          setStage('review')
        } else if (status.status === 'failed' || status.status === 'needs_better_photo') {
          clearInterval(pollRef.current)
          setStage('error')
          setError(status.error_message || 'Generation failed')
        }
      } catch {
        // keep polling
      }
    }, 2000)
  }, [])

  const upload = useCallback(async (file: File, name: string, prompt: string, provider: string) => {
    setStage('uploading')
    setError(null)
    try {
      const result = await api.uploadPhoto(file, name, prompt, provider)
      setPetId(result.pet_id)
      setStage('generating')
      startPolling(result.job_id)
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [startPolling])

  const confirm = useCallback(async () => {
    if (!job) return
    setStage('confirming')
    try {
      const result = await api.confirmGeneration(job.job_id, 'confirm')
      if (result.pet_id) {
        const bundle = await api.downloadPet(result.pet_id)
        await savePetLocally(result.pet_id, bundle)
        openPetWindow(result.pet_id)
      }
      setStage('done')
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [job])

  const regenerate = useCallback(async () => {
    if (!job) return
    setStage('generating')
    setError(null)
    try {
      const result = await api.confirmGeneration(job.job_id, 'regenerate')
      if (result.job_id) startPolling(result.job_id)
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [job, startPolling])

  const reset = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    setStage('idle')
    setPetId(null)
    setJob(null)
    setError(null)
  }, [])

  return { stage, petId, job, error, upload, confirm, regenerate, reset }
}
