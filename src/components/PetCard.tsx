import { useState } from 'react'
import type { PetStatus } from '../../shared/types'
import { cacheAndOpenPet } from '../lib/db'
import { api, resolveAssetUrl } from '../lib/api'

const statusStyles: Record<string, string> = {
  uploaded: 'bg-amber-50 text-amber-700 border-amber-200',
  processing: 'bg-blue-50 text-blue-700 border-blue-200',
  awaiting_review: 'bg-violet-50 text-violet-700 border-violet-200',
  ready: 'bg-green-50 text-green-700 border-green-200',
  failed: 'bg-red-50 text-red-700 border-red-200',
}

const statusLabels: Record<string, string> = {
  uploaded: '已上传',
  processing: '处理中',
  awaiting_review: '待确认',
  ready: '可启动',
  failed: '失败',
}

interface Props {
  pet: PetStatus
  onDelete: (id: string) => void
}

export function PetCard({ pet, onDelete }: Props) {
  const [launching, setLaunching] = useState(false)
  const [launchError, setLaunchError] = useState<string | null>(null)

  async function handleLaunch() {
    if (launching) return
    setLaunching(true)
    setLaunchError(null)
    try {
      await cacheAndOpenPet(pet.id, () => api.downloadPet(pet.id))
    } catch (error: any) {
      setLaunchError(error?.message || '启动桌宠失败')
    } finally {
      setLaunching(false)
    }
  }

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex aspect-square items-center justify-center bg-slate-100">
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
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-slate-950">{pet.name}</h2>
          </div>
          <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[pet.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
            {statusLabels[pet.status] || pet.status}
          </span>
        </div>

        {pet.error_message && (
          <p className="line-clamp-2 text-xs text-red-600">{pet.error_message}</p>
        )}

        {launchError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {launchError}
          </p>
        )}

        <div className="flex gap-2">
          {pet.status === 'ready' && (
            <button
              onClick={handleLaunch}
              disabled={launching}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
            >
              {launching ? '正在启动' : '启动桌宠'}
            </button>
          )}
          <button
            onClick={() => onDelete(pet.id)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700"
          >
            删除
          </button>
        </div>
      </div>
    </article>
  )
}
