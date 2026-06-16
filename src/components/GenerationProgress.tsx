import type { JobStatus } from '../../shared/types'

const stages = [
  { idx: 1, label: 'Pose' },
  { idx: 2, label: 'Background' },
  { idx: 3, label: 'Parts' },
  { idx: 4, label: 'Skeleton' },
  { idx: 5, label: 'Atlas' },
]

export function GenerationProgress({ job }: { job: JobStatus | null }) {
  if (!job) return null

  return (
    <div className="mt-4">
      <div className="flex gap-1">
        {stages.map((s) => (
          <div key={s.idx} className="flex-1">
            <div className={`h-1.5 rounded-full ${
              job.stage_progress >= s.idx ? 'bg-indigo-500' : 'bg-slate-700'
            } ${job.status === 'running' && job.stage_progress === s.idx ? 'animate-pulse' : ''}`} />
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2 text-center">
        {job.status === 'running' ? `Stage ${job.stage_progress}/5` : job.status}
        {job.failed_stage && ` — failed at: ${job.failed_stage}`}
      </p>
    </div>
  )
}
