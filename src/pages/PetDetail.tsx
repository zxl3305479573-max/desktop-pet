import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePetDetail } from '../hooks/usePetDetail'
import { resolveAssetUrl } from '../lib/api'
import { useStore } from '../store'

const STATUS_STYLES: Record<string, string> = {
  uploaded: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  generating: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_review: 'bg-violet-50 text-violet-700 border-violet-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_LABELS: Record<string, string> = {
  uploaded: '已上传',
  processing: '处理中',
  generating: '生成中',
  awaiting_review: '待确认',
  ready: '可启动',
  failed: '失败',
}

const ANIMATIONS = [
  { key: 'idle', label: '待机' },
  { key: 'dragged', label: '拖拽' },
  { key: 'eating', label: '喂食' },
  { key: 'sleep', label: '睡眠' },
  { key: 'petting', label: '摸摸' },
] as const

type ViewMode = 'sprite-sheet' | 'frames'

function formatDate(iso: string): string {
  if (!iso) return '-'
  try {
    const d = new Date(iso)
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function getBaseUrl(): string {
  return useStore.getState().backendUrl || 'http://localhost:8000'
}

function spriteSheetUrl(petId: string, anim: string): string {
  return `${getBaseUrl()}/assets/${petId}/spritesheet_${anim}.png`
}

function framePreviewUrl(petId: string, anim: string, index: number): string {
  return `${getBaseUrl()}/assets/${petId}/frames_preview/${anim}/frame-${index}.png`
}

export default function PetDetail() {
  const { id } = useParams<{ id: string }>()
  const { pet, manifest, loading, error, notFound, refetch } = usePetDetail(id!)
  const [activeAnimation, setActiveAnimation] = useState<string>('idle')
  const [viewMode, setViewMode] = useState<ViewMode>('sprite-sheet')

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-start gap-5">
            <div className="h-32 w-32 animate-pulse rounded-lg bg-slate-100" />
            <div className="flex-1 space-y-3">
              <div className="h-6 w-32 animate-pulse rounded bg-slate-200" />
              <div className="h-5 w-20 animate-pulse rounded-full bg-slate-100" />
              <div className="h-4 w-48 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex gap-3">
            {ANIMATIONS.map((a) => (
              <div key={a.key} className="h-8 w-16 animate-pulse rounded bg-slate-100" />
            ))}
          </div>
          <div className="mt-5 aspect-video animate-pulse rounded-lg bg-slate-50" />
        </div>
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/" className="text-sm text-slate-500 transition hover:text-slate-700">
          ← 返回我的桌宠
        </Link>
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-sm font-semibold text-red-800">加载失败</h2>
          <p className="mt-2 text-sm text-red-700">{error}</p>
          <button
            onClick={refetch}
            className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
          >
            重试
          </button>
        </div>
      </div>
    )
  }

  // ── Not Found ────────────────────────────────────────────────────
  if (notFound || !pet) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Link to="/" className="text-sm text-slate-500 transition hover:text-slate-700">
          ← 返回我的桌宠
        </Link>
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-950">桌宠不存在</h2>
          <p className="mt-2 text-sm text-slate-500">该桌宠可能已被删除，或 ID 无效。</p>
          <Link
            to="/"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            返回列表
          </Link>
        </div>
      </div>
    )
  }

  // ── Normal ───────────────────────────────────────────────────────
  const hasAnyMaterial = pet.status === 'ready' || pet.status === 'awaiting_review'

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back link */}
      <Link to="/" className="inline-flex items-center text-sm text-slate-500 transition hover:text-slate-700">
        ← 返回我的桌宠
      </Link>

      {/* Pet info card */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
            {pet.preview_front ? (
              <img
                src={resolveAssetUrl(pet.preview_front)}
                alt={pet.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-sm text-slate-400">暂无预览</span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.01em] text-slate-950">
                {pet.name}
              </h1>
              <span
                className={`mt-2 inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  STATUS_STYLES[pet.status] || 'border-slate-200 bg-slate-50 text-slate-600'
                }`}
              >
                {STATUS_LABELS[pet.status] || pet.status}
              </span>
            </div>
            {pet.error_message && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                {pet.error_message}
              </p>
            )}
            <div className="grid gap-1 text-sm text-slate-500">
              <p>创建时间：{formatDate(pet.created_at)}</p>
              <p>更新时间：{formatDate((pet as any).updated_at)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Materials section */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-slate-950">生成素材</h2>

        {!hasAnyMaterial ? (
          <p className="mt-4 text-sm text-slate-500">
            该桌宠的素材尚未生成或正在生成中。
          </p>
        ) : (
          <>
            {/* Animation tabs */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {ANIMATIONS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setActiveAnimation(key)}
                  className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
                    activeAnimation === key
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="mt-4 flex items-center gap-2">
              <span className="text-xs text-slate-400">视图：</span>
              <button
                onClick={() => setViewMode('sprite-sheet')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === 'sprite-sheet'
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                精灵表
              </button>
              <button
                onClick={() => setViewMode('frames')}
                className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                  viewMode === 'frames'
                    ? 'bg-slate-800 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                单帧
              </button>
            </div>

            {/* Content */ }
            <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
              {viewMode === 'sprite-sheet' ? (
                <SpriteSheetView petId={id!} anim={activeAnimation} />
              ) : (
                <FrameGridView
                  petId={id!}
                  anim={activeAnimation}
                  manifest={manifest}
                />
              )}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

/** Full sprite sheet image in a scrollable container. */
function SpriteSheetView({ petId, anim }: { petId: string; anim: string }) {
  return (
    <div className="flex items-center justify-center overflow-auto p-3">
      <img
        src={spriteSheetUrl(petId, anim)}
        alt={`${anim} sprite sheet`}
        className="max-w-full object-contain"
        onError={(e) => {
          const el = e.target as HTMLImageElement
          el.style.display = 'none'
          const parent = el.parentElement
          if (parent && parent.querySelectorAll('img[style*="display: none"]').length >= 1) {
            const msg = parent.querySelector('.sprite-fallback-msg')
            if (!msg) {
              const p = document.createElement('p')
              p.className = 'sprite-fallback-msg py-8 text-center text-sm text-slate-400'
              p.textContent = '暂无该动作的精灵表素材'
              parent.appendChild(p)
            }
          }
        }}
      />
    </div>
  )
}

/** Grid of individual frame images. */
function FrameGridView({
  petId,
  anim,
  manifest,
}: {
  petId: string
  anim: string
  manifest: import('../hooks/usePetDetail').ManifestData | null
}) {
  // Prefer manifest frames, fall back to frames_preview naming convention
  const manifestAnim = manifest?.animations?.[anim]
  const manifestFrames = manifestAnim?.frames

  let frameCount = 4 // default for 1x4 horizontal row layout
  if (manifestFrames) {
    frameCount = manifestFrames.length
  }

  const frameUrls: string[] = []
  if (manifestFrames && manifestFrames.length > 0) {
    for (const f of manifestFrames) {
      frameUrls.push(`${getBaseUrl()}/assets/${petId}/${f.src}`)
    }
  } else {
    // Fallback: try frames_preview naming convention
    for (let i = 0; i < Math.min(frameCount, 8); i++) {
      frameUrls.push(framePreviewUrl(petId, anim, i))
    }
  }

  const [hiddenFrames, setHiddenFrames] = useState<Set<number>>(new Set())
  const allHidden = hiddenFrames.size >= frameUrls.length && frameUrls.length > 0

  function handleError(index: number) {
    setHiddenFrames((prev) => {
      const next = new Set(prev)
      next.add(index)
      return next
    })
  }

  if (allHidden) {
    return (
      <p className="py-8 text-center text-sm text-slate-400">
        暂无该动作的单帧素材
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-3 p-3">
      {frameUrls.map((url, idx) =>
        hiddenFrames.has(idx) ? null : (
          <div
            key={idx}
            className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <img
              src={url}
              alt={`${anim} frame ${idx + 1}`}
              className="max-h-full max-w-full object-contain"
              onError={() => handleError(idx)}
            />
          </div>
        ),
      )}
    </div>
  )
}
