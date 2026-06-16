import { useState, useCallback, useRef } from 'react'
import { api } from '../lib/api'
import { savePetLocally, openPetWindow } from '../lib/db'
import type { JobStatus } from '../../shared/types'

type Stage = 'idle' | 'uploading' | 'stepping' | 'review' | 'confirming' | 'done' | 'error'

interface StepResult {
  stage: number
  status: string
  preview?: string
  keypoints?: number
  confidence?: number
  parts?: number
  bones?: number
  rig_quality?: string
  message?: string
}

export function useGeneration() {
  const [stage, setStage] = useState<Stage>('idle')
  const [petId, setPetId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [stepResult, setStepResult] = useState<StepResult | null>(null)
  const [stepLoading, setStepLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = useCallback(async (file: File, name: string, prompt: string, provider: string) => {
    setStage('uploading')
    setError(null)
    try {
      const result = await api.uploadPhoto(file, name, prompt, provider)
      setPetId(result.pet_id)
      setJobId(result.job_id)
      setCurrentStep(0) // Ready to start step 1
      setStage('stepping')
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [])

  const runNextStep = useCallback(async () => {
    if (!jobId) return
    const nextStep = currentStep + 1
    if (nextStep > 5) return

    setStepLoading(true)
    setError(null)
    try {
      const result = await api.runNextStage(jobId)
      if (result.status === 'failed' || result.status === 'error') {
        setError(result.message || 'Step failed')
        return
      }
      setStepResult(result)
      setCurrentStep(nextStep)
      if (nextStep === 5) {
        setStage('review')
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }, [jobId, currentStep])

  const regenerateStep = useCallback(async () => {
    if (!jobId) return
    setStepLoading(true)
    setError(null)
    try {
      const result = await api.runNextStage(jobId)
      if (result.status === 'failed' || result.status === 'error') {
        setError(result.message || 'Step failed')
        return
      }
      setStepResult(result)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setStepLoading(false)
    }
  }, [jobId])

  const confirm = useCallback(async () => {
    if (!jobId || !petId) return
    setStage('confirming')
    try {
      await api.confirmGeneration(jobId, 'confirm')
      const bundle = await api.downloadPet(petId)
      await savePetLocally(petId, bundle)
      openPetWindow(petId)
      setStage('done')
    } catch (e: any) {
      setError(e.message)
      setStage('error')
    }
  }, [jobId, petId])

  const regenerate = useCallback(async () => {
    if (!jobId) return
    try {
      await api.confirmGeneration(jobId, 'regenerate')
      setCurrentStep(0)
      setStepResult(null)
      setStage('stepping')
    } catch (e: any) {
      setError(e.message)
    }
  }, [jobId])

  const reset = useCallback(() => {
    setStage('idle')
    setPetId(null)
    setJobId(null)
    setCurrentStep(1)
    setStepResult(null)
    setStepLoading(false)
    setError(null)
  }, [])

  return { stage, petId, jobId, currentStep, stepResult, stepLoading, error, upload, runNextStep, regenerateStep, confirm, regenerate, reset }
}
