import { useState, useCallback } from 'react'
import { api } from '../lib/api'
import {
  DESKTOP_PET_UNAVAILABLE_MESSAGE,
  isDesktopPetAvailable,
  saveAndOpenPet,
} from '../lib/db'
import { TOTAL_STAGES } from '../components/StageViewer'

type Stage = 'idle' | 'uploading' | 'stepping' | 'review' | 'confirming' | 'done' | 'error'

interface StepResult {
  stage: number
  status: string
  preview?: string
  previews?: Record<string, string>
  sprite_type?: string
  animations?: string[]
  message?: string
}

function isAiStage(stage: number) {
  return stage === 1 || stage === 2
}

function formatFailure(stage: number, message?: string) {
  if (isAiStage(stage)) {
    return `AI 素材生成失败：${message || 'API 调用出错，请检查网络、API Key 或模型通道后重试'}`
  }
  return `打包失败：${message || '未知错误'}`
}

export function useGeneration() {
  const [stage, setStage] = useState<Stage>('idle')
  const [petId, setPetId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [stepResult, setStepResult] = useState<StepResult | null>(null)
  const [stepLoading, setStepLoading] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)

  const upload = useCallback(async (file: File, name: string, prompt: string, provider: string) => {
    setStage('uploading')
    setStepError(null)
    try {
      const result = await api.uploadPhoto(file, name, prompt, provider)
      setPetId(result.pet_id)
      setJobId(result.job_id)
      setCurrentStep(0)
      setStepResult(null)
      setStage('stepping')
    } catch (e: any) {
      setStepError(e.message)
      setStage('error')
    }
  }, [])

  const runNextStep = useCallback(async () => {
    if (!jobId || stepLoading) return
    const nextStep = currentStep + 1
    if (nextStep > TOTAL_STAGES) return

    setStepLoading(true)
    setStepError(null)
    setStepResult(null)

    try {
      const result = await api.runNextStage(jobId)
      const completedStep = result.stage ?? nextStep

      if (result.status === 'failed' || result.status === 'error') {
        setStepResult({ stage: completedStep, status: 'error', message: result.message })
        setCurrentStep(completedStep)
        setStepError(formatFailure(completedStep, result.message))
        return
      }

      setStepResult(result)
      setCurrentStep(completedStep)

      if (completedStep === TOTAL_STAGES) {
        setStage('review')
      }
    } catch (e: any) {
      setStepError(formatFailure(nextStep, `网络请求异常：${e.message}`))
      setCurrentStep(nextStep)
      setStepResult({ stage: nextStep, status: 'error', message: e.message })
    } finally {
      setStepLoading(false)
    }
  }, [jobId, currentStep, stepLoading])

  const regenerateStep = useCallback(async () => {
    if (!jobId || stepLoading) return
    setStepLoading(true)
    setStepError(null)
    setStepResult(null)

    try {
      const result = await api.regenerateStage(jobId, currentStep)

      if (result.status === 'failed' || result.status === 'error') {
        setStepResult({ stage: currentStep, status: 'error', message: result.message })
        setStepError(formatFailure(currentStep, result.message))
        return
      }

      setStepResult(result)
    } catch (e: any) {
      setStepError(formatFailure(currentStep, `网络请求异常：${e.message}`))
      setStepResult({ stage: currentStep, status: 'error', message: e.message })
    } finally {
      setStepLoading(false)
    }
  }, [jobId, currentStep, stepLoading])

  const confirm = useCallback(async () => {
    if (!jobId || !petId) return
    setStage('confirming')
    setStepError(null)
    try {
      if (!isDesktopPetAvailable()) {
        throw new Error(DESKTOP_PET_UNAVAILABLE_MESSAGE)
      }
      await api.confirmGeneration(jobId, 'confirm')
      const bundle = await api.downloadPet(petId)
      await saveAndOpenPet(petId, bundle)
      setStage('done')
    } catch (e: any) {
      setStepError(e.message)
      setStage('error')
    }
  }, [jobId, petId])

  const regenerate = useCallback(async () => {
    if (!jobId) return
    setStepError(null)
    try {
      const result = await api.confirmGeneration(jobId, 'regenerate')
      if (result.job_id) {
        setJobId(result.job_id)
      }
      setCurrentStep(0)
      setStepResult(null)
      setStage('stepping')
    } catch (e: any) {
      setStepError(e.message)
    }
  }, [jobId])

  const reset = useCallback(() => {
    setStage('idle')
    setPetId(null)
    setJobId(null)
    setCurrentStep(1)
    setStepResult(null)
    setStepLoading(false)
    setStepError(null)
  }, [])

  return {
    stage,
    petId,
    jobId,
    currentStep,
    stepResult,
    stepLoading,
    stepError,
    upload,
    runNextStep,
    regenerateStep,
    confirm,
    regenerate,
    reset,
  }
}
