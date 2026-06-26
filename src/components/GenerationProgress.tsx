import type { JobStatus } from '../../shared/types'
import { TOTAL_STAGES } from './StageViewer'

const stages = ['三视图', '动作素材', '桌宠打包']

export function GenerationProgress({ job }: { job: JobStatus | null }) {
  if (!job) return null

  return (
    <div className="mt-4">
      <div className="grid grid-cols-3 gap-1">
        {stages.map((label, index) => {
          const step = index + 1
          const active = job.stage_progress >= step
          return (
            <div key={label} className="min-w-0">
              <div
                className={[
                  'h-1.5 rounded-full',
                  active ? 'bg-blue-600' : 'bg-slate-200',
                  job.status === 'running' && job.stage_progress === step ? 'animate-pulse' : '',
                ].join(' ')}
              />
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-center text-xs text-slate-500">
        {job.status === 'running' ? `正在处理第 ${job.stage_progress}/${TOTAL_STAGES} 步` : job.status}
        {job.failed_stage ? `，失败步骤：${job.failed_stage}` : ''}
      </p>
    </div>
  )
}
