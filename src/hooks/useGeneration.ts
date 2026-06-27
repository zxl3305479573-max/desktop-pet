import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { GenerationState, StepResult } from '../store'
import { api } from '../lib/api'
import {
  DESKTOP_PET_UNAVAILABLE_MESSAGE,
  isDesktopPetAvailable,
  saveAndOpenPet,
} from '../lib/db'
import { TOTAL_STAGES } from '../components/StageViewer'

function isAiStage(stage: number) {
  return stage === 1 || stage === 2
}

function formatFailure(stage: number, message?: string) {
  if (isAiStage(stage)) {
    return `AI 素材生成失败：${message || 'API 调用出错，请检查网络、API Key 或模型通道后重试'}`
  }
  return `打包失败：${message || '未知错误'}`
}

/**
 * Select the current generation slice from Zustand.
 * Using a selector avoids re-rendering on unrelated state changes.
 */
function selectGen(s: { generation: GenerationState }) {
  return s.generation
}

export function useGeneration() {
  const gen = useStore(selectGen)
  const patch = useStore((s) => s.patchGeneration)
  const clear = useStore((s) => s.clearGeneration)

  // Track whether we've already tried to resume this job so we don't
  // fire extra requests on every re-render.
  const resumedRef = useRef<string | null>(null)

  // ── resume on mount ───────────────────────────────────────────────
  useEffect(() => {
    const jobId = gen.jobId
    if (!jobId) return
    if (resumedRef.current === jobId) return   // already handled this job

    // Only resume when the hook mounts with a stale in-memory state
    // (i.e. the Create page was re-mounted after navigation).
    // If the job is in a terminal state we don't need to fetch.
    if (gen.stage === 'done' || gen.stage === 'error') return

    resumedRef.current = jobId

    api.getJobStatus(jobId).then((status) => {
      const progress = status.stage_progress ?? 0
      const jobStatus = status.status

      if (jobStatus === 'failed') {
        patch({
          stage: 'error',
          stepError: status.error_message || '生成失败',
          stepResult: { stage: progress, status: 'error', message: status.error_message ?? undefined },
        })
        return
      }

      if (jobStatus === 'awaiting_review') {
        patch({ stage: 'review', currentStep: TOTAL_STAGES })
        return
      }

      if (jobStatus === 'completed') {
        patch({ stage: 'done', currentStep: TOTAL_STAGES })
        return
      }

      // Still running / queued — restore to where it was
      patch({
        stage: 'stepping',
        currentStep: progress,
        stepLoading: false,
        stepError: null,
      })
    }).catch(() => {
      // If the backend is unreachable, leave the state as-is;
      // the user will see the previous step and can retry.
    })
  }, [gen.jobId, gen.stage, patch])

  // ── upload ────────────────────────────────────────────────────────
  const upload = useCallback(async (file: File, name: string, prompt: string, provider: string) => {
    patch({ stage: 'uploading', stepError: null })
    try {
      const result = await api.uploadPhoto(file, name, prompt, provider)
      patch({
        petId: result.pet_id,
        jobId: result.job_id,
        currentStep: 0,
        stepResult: null,
        stage: 'stepping',
      })
      resumedRef.current = null
    } catch (e: any) {
      patch({ stepError: e.message, stage: 'error' })
    }
  }, [patch])

  // ── runNextStep ───────────────────────────────────────────────────
  const runNextStep = useCallback(async () => {
    // Read latest from store so the callback always sees fresh values
    const { jobId, currentStep, stepLoading } = useStore.getState().generation
    if (!jobId || stepLoading) return
    const nextStep = currentStep + 1
    if (nextStep > TOTAL_STAGES) return

    patch({ stepLoading: true, stepError: null, stepResult: null })

    try {
      const result: StepResult = await api.runNextStage(jobId)
      const completedStep = result.stage ?? nextStep

      if (result.status === 'failed' || result.status === 'error') {
        patch({
          stepResult: { stage: completedStep, status: 'error', message: result.message },
          currentStep: completedStep,
          stepError: formatFailure(completedStep, result.message),
          stepLoading: false,
        })
        return
      }

      patch({ stepResult: result, currentStep: completedStep })

      if (completedStep === TOTAL_STAGES) {
        patch({ stage: 'review', stepLoading: false })
      } else {
        patch({ stepLoading: false })
      }
    } catch (e: any) {
      patch({
        stepError: formatFailure(nextStep, `网络请求异常：${(e as Error).message}`),
        currentStep: nextStep,
        stepResult: { stage: nextStep, status: 'error', message: (e as Error).message },
        stepLoading: false,
      })
    }
  }, [patch])

  // ── regenerateStep ────────────────────────────────────────────────
  const regenerateStep = useCallback(async () => {
    const { jobId, currentStep, stepLoading } = useStore.getState().generation
    if (!jobId || stepLoading) return

    patch({ stepLoading: true, stepError: null, stepResult: null })

    try {
      const result: StepResult = await api.regenerateStage(jobId, currentStep)

      if (result.status === 'failed' || result.status === 'error') {
        patch({
          stepResult: { stage: currentStep, status: 'error', message: result.message },
          stepError: formatFailure(currentStep, result.message),
          stepLoading: false,
        })
        return
      }

      patch({ stepResult: result, stepLoading: false })
    } catch (e: any) {
      patch({
        stepError: formatFailure(currentStep, `网络请求异常：${(e as Error).message}`),
        stepResult: { stage: currentStep, status: 'error', message: (e as Error).message },
        stepLoading: false,
      })
    }
  }, [patch])

  // ── confirm ───────────────────────────────────────────────────────
  const confirm = useCallback(async () => {
    const { jobId, petId } = useStore.getState().generation
    if (!jobId || !petId) return

    patch({ stage: 'confirming', stepError: null })
    try {
      if (!isDesktopPetAvailable()) {
        throw new Error(DESKTOP_PET_UNAVAILABLE_MESSAGE)
      }
      await api.confirmGeneration(jobId, 'confirm')
      const bundle = await api.downloadPet(petId)
      await saveAndOpenPet(petId, bundle)
      patch({ stage: 'done' })
    } catch (e: any) {
      patch({ stepError: (e as Error).message, stage: 'error' })
    }
  }, [patch])

  // ── regenerate (full redo) ────────────────────────────────────────
  const regenerate = useCallback(async () => {
    const { jobId } = useStore.getState().generation
    if (!jobId) return

    patch({ stepError: null })
    try {
      const result = await api.confirmGeneration(jobId, 'regenerate')
      patch({
        jobId: result.job_id ?? jobId,
        currentStep: 0,
        stepResult: null,
        stage: 'stepping',
      })
      resumedRef.current = null
    } catch (e: any) {
      patch({ stepError: (e as Error).message })
    }
  }, [patch])

  // ── reset ─────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    clear()
    resumedRef.current = null
  }, [clear])

  return {
    stage: gen.stage,
    petId: gen.petId,
    jobId: gen.jobId,
    currentStep: gen.currentStep,
    stepResult: gen.stepResult,
    stepLoading: gen.stepLoading,
    stepError: gen.stepError,
    upload,
    runNextStep,
    regenerateStep,
    confirm,
    regenerate,
    reset,
  }
}
