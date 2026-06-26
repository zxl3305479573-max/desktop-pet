import { resolveAssetUrl } from '../lib/api'

interface StageInfo {
  stage: number
  name: string
  desc: string
}

export const TOTAL_STAGES = 3

const STAGES: Record<number, StageInfo> = {
  1: {
    stage: 1,
    name: '三视图定型',
    desc: '先生成正面、侧面、背面的角色设计稿，确认造型后再继续。',
  },
  2: {
    stage: 2,
    name: '动作素材生成',
    desc: '基于已确认的三视图，一次性生成拖拽、喂食、睡眠和摸摸动作素材。',
  },
  3: {
    stage: 3,
    name: '桌宠打包预览',
    desc: '把三视图和动作素材打包成可启动的桌宠资源包。',
  },
}

const PREVIEW_LABELS: Record<string, string> = {
  dragged: '拖拽',
  eating: '喂食',
  sleep: '睡眠',
  petting: '摸摸',
}

interface Props {
  stage: number
  previewUrl: string | null
  stageData: Record<string, any> | null
  loading: boolean
  error: string | null
  onContinue: () => void
  onRegenerate: () => void
}

export function StageViewer({ stage, previewUrl, stageData, loading, error, onContinue, onRegenerate }: Props) {
  const info = STAGES[stage] || STAGES[1]
  const isAiStage = stage === 1 || stage === 2
  const isComplete = stageData?.status === 'ok'
  const isFailed = stageData?.status === 'failed' || stageData?.status === 'error'
  const previews = stageData?.previews && typeof stageData.previews === 'object'
    ? Object.entries(stageData.previews as Record<string, string>)
    : []
  const hasPreview = Boolean(previewUrl && !isFailed)
  const animations = Array.isArray(stageData?.animations) ? stageData.animations.join(' / ') : ''

  const loadingText =
    stage === 1
      ? 'AI 正在生成三视图，请稍候。'
      : stage === 2
        ? 'AI 正在生成动作素材，请稍候。'
        : '正在打包桌宠资源，请稍候。'

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-blue-700">第 {stage} 步 / 共 {TOTAL_STAGES} 步</p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.01em] text-slate-950">{info.name}</h2>
          <p className="mt-2 text-sm text-slate-500">{info.desc}</p>
        </div>
        <span
          className={[
            'w-fit rounded-full border px-2.5 py-1 text-xs font-medium',
            isFailed
              ? 'border-red-200 bg-red-50 text-red-700'
              : isComplete
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-blue-200 bg-blue-50 text-blue-700',
          ].join(' ')}
        >
          {isFailed ? '生成失败' : isComplete ? '已完成' : '等待处理'}
        </span>
      </div>

      {isFailed && (
        <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
          <h3 className="text-sm font-semibold text-red-800">
            {isAiStage ? 'AI 生成失败' : '打包失败'}
          </h3>
          <p className="mt-1 text-sm text-red-700">
            {error || stageData?.message || '未知错误，请重新生成当前步骤。'}
          </p>
          {isAiStage && (
            <p className="mt-2 text-xs text-red-600">
              请检查 API Key、网络连接和模型服务状态，或尝试重新生成。
            </p>
          )}
        </div>
      )}

      <div className="mt-5 flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {loading ? (
          <div className="px-4 text-center">
            <div className="mx-auto mb-3 h-2 w-28 animate-pulse rounded-full bg-blue-200" />
            <p className="text-sm text-slate-500">{loadingText}</p>
          </div>
        ) : previews.length > 0 && !isFailed ? (
          <div className="grid h-full w-full grid-cols-1 gap-3 overflow-auto p-3 sm:grid-cols-3">
            {previews.map(([name, url]) => (
              <figure key={name} className="flex min-h-0 flex-col">
                <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <img
                    src={resolveAssetUrl(url)}
                    alt={`${PREVIEW_LABELS[name] || name}素材预览`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <figcaption className="mt-1 text-center text-xs text-slate-500">
                  {PREVIEW_LABELS[name] || name}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : hasPreview ? (
          <img
            src={resolveAssetUrl(previewUrl as string)}
            alt={`第 ${stage} 步预览`}
            className="h-full w-full object-contain"
            onError={(e) => {
              ;(e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : !isFailed ? (
          <span className="text-sm text-slate-400">等待生成预览</span>
        ) : null}
      </div>

      {stageData && !isFailed && (
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
          {stageData.sprite_type && <p>素材类型：{stageData.sprite_type}</p>}
          {animations && <p>动作：{animations}</p>}
          {stageData.message && <p>{stageData.message}</p>}
        </div>
      )}

      {!loading && (
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          {isFailed ? (
            <button
              onClick={onRegenerate}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
            >
              重新生成
            </button>
          ) : stage < TOTAL_STAGES ? (
            <>
              <button
                onClick={onRegenerate}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                重新生成此步骤
              </button>
              <button
                onClick={onContinue}
                disabled={!isComplete}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
              >
                确认并继续
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onRegenerate}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                重新生成
              </button>
              <button
                onClick={onContinue}
                disabled={!isComplete}
                className="rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:bg-slate-300"
              >
                确认并启动
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}
