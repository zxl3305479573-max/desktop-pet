import { useState } from 'react'
import { UploadZone } from '../components/UploadZone'
import { StageViewer, TOTAL_STAGES } from '../components/StageViewer'
import { useGeneration } from '../hooks/useGeneration'

const stepLabels = ['三视图', '动作素材', '桌宠打包']

function generationStatusText(stage: string, displayStep: number, loading: boolean, error: string | null) {
  if (error) return '生成失败'
  if (stage === 'idle') return '等待上传'
  if (stage === 'uploading') return '正在上传'
  if (stage === 'stepping' && displayStep === 0 && !loading) return '图片已上传，等待生成三视图'
  if (stage === 'stepping' && loading) return `正在处理第 ${displayStep} 步`
  if (stage === 'stepping') return `第 ${displayStep} 步已完成`
  if (stage === 'review') return '桌宠已打包，等待最终确认'
  if (stage === 'confirming') return '正在保存并启动'
  if (stage === 'done') return '已完成'
  return '等待处理'
}

function generationStatusDetail(stage: string, displayStep: number, loading: boolean, error: string | null) {
  if (error) return error
  if (stage === 'stepping' && loading) return '请保持窗口打开，当前步骤完成后会显示预览。'
  if (stage === 'stepping' && displayStep === 0) return '点击开始生成后，会先生成三视图。确认三视图后，再一次性生成动作素材。'
  if (stage === 'review') return '检查最终预览后，可以确认并启动桌宠。'
  return '流程：三视图确认 -> 动作素材生成 -> 桌宠打包。'
}

export default function Create() {
  const {
    stage,
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
  } = useGeneration()
  const [prompt, setPrompt] = useState('')

  const handleUpload = (file: File, name: string) => {
    upload(file, name, prompt, 'builtin')
  }

  const displayStep = stepLoading ? Math.min(currentStep + 1, TOTAL_STAGES) : currentStep

  if (stage === 'done') {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-green-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-green-700">生成完成</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.01em] text-slate-950">桌宠已创建并启动</h1>
        <p className="mt-3 text-sm text-slate-500">你可以继续创建新的桌宠，或回到列表管理已有角色。</p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          再创建一个
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-[-0.01em] text-slate-950">创建桌宠</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
          上传图片后，系统会先生成三视图，确认后生成动作素材，最后打包成可启动的桌宠。
        </p>
      </div>

      <div
        className={[
          'rounded-xl border p-4',
          stepError
            ? 'border-red-200 bg-red-50'
            : stepLoading
              ? 'border-blue-200 bg-blue-50'
              : 'border-slate-200 bg-white',
        ].join(' ')}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p
              className={[
                'text-sm font-semibold',
                stepError ? 'text-red-700' : stepLoading ? 'text-blue-700' : 'text-slate-950',
              ].join(' ')}
            >
              {generationStatusText(stage, displayStep, stepLoading, stepError)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              {generationStatusDetail(stage, displayStep, stepLoading, stepError)}
            </p>
          </div>
          {stepLoading && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100 sm:w-40">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" />
            </div>
          )}
        </div>
      </div>

      {stepError && stage === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{stepError}</p>
          <button onClick={reset} className="mt-2 text-sm font-medium text-red-700 hover:text-red-800">
            返回重新上传
          </button>
        </div>
      )}

      {stage === 'idle' && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">效果描述，可选</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：卡通风格，保留原始颜色，动作可爱"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <UploadZone onUpload={handleUpload} disabled={false} />
        </section>
      )}

      {stage === 'uploading' && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 h-2 w-32 animate-pulse rounded-full bg-blue-200" />
          <p className="text-sm text-slate-500">正在上传图片。</p>
        </div>
      )}

      {stage === 'stepping' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid grid-cols-3 gap-1">
              {stepLabels.map((label, index) => {
                const step = index + 1
                const failed = stepResult?.status === 'error' && stepResult?.stage === step
                const active = step <= displayStep
                return (
                  <div key={label} className="min-w-0">
                    <div
                      className={[
                        'h-1.5 rounded-full',
                        failed ? 'bg-red-500' : active ? 'bg-blue-600' : 'bg-slate-200',
                        stepLoading && step === displayStep ? 'animate-pulse' : '',
                      ].join(' ')}
                    />
                    <p className="mt-1 hidden truncate text-center text-[11px] text-slate-500 sm:block">{label}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {currentStep === 0 && !stepLoading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
              <h2 className="text-lg font-semibold text-slate-950">图片已上传</h2>
              <p className="mt-2 text-sm text-slate-500">现在可以先生成三视图。</p>
              <button
                onClick={runNextStep}
                disabled={stepLoading}
                className="mt-5 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                开始生成
              </button>
            </div>
          ) : (
            <StageViewer
              stage={displayStep}
              previewUrl={stepLoading ? null : stepResult?.preview || null}
              stageData={stepLoading ? null : stepResult || null}
              loading={stepLoading}
              error={stepError}
              onContinue={currentStep < TOTAL_STAGES ? runNextStep : confirm}
              onRegenerate={currentStep < TOTAL_STAGES ? regenerateStep : regenerate}
            />
          )}
        </div>
      )}

      {stage === 'review' && stepResult && (
        <StageViewer
          stage={TOTAL_STAGES}
          previewUrl={stepResult.preview || null}
          stageData={stepResult}
          loading={stepLoading}
          error={stepError}
          onContinue={confirm}
          onRegenerate={regenerate}
        />
      )}

      {stage === 'confirming' && (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mx-auto mb-3 h-2 w-32 animate-pulse rounded-full bg-green-200" />
          <p className="text-sm text-slate-500">正在保存并启动桌宠。</p>
        </div>
      )}
    </div>
  )
}
