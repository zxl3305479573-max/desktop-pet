import type { PetStatus } from '../../shared/types'
import { openPetWindow } from '../lib/db'

const statusColors: Record<string, string> = {
  uploaded: 'bg-yellow-600',
  generating: 'bg-blue-600 animate-pulse',
  awaiting_review: 'bg-purple-600',
  ready: 'bg-green-600',
  failed: 'bg-red-600',
}

interface Props {
  pet: PetStatus
  onDelete: (id: string) => void
}

export function PetCard({ pet, onDelete }: Props) {
  return (
    <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500 transition">
      <div className="aspect-square bg-slate-700 flex items-center justify-center">
        {pet.preview_front ? (
          <img src={`http://localhost:8000/${pet.preview_front}`} alt={pet.name} className="w-full h-full object-contain" />
        ) : (
          <span className="text-4xl">📷</span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-medium text-sm truncate">{pet.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full text-white ${statusColors[pet.status] || 'bg-slate-600'}`}>
            {pet.status}
          </span>
        </div>
        {pet.rig_quality && (
          <p className="text-xs text-slate-500">Rig: {pet.rig_quality}</p>
        )}
        {pet.error_message && (
          <p className="text-xs text-red-400 truncate">{pet.error_message}</p>
        )}
        <div className="mt-2 flex gap-2">
          {pet.status === 'ready' && (
            <button onClick={() => openPetWindow(pet.id)}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm py-1.5 rounded-lg transition">
              🚀 Launch
            </button>
          )}
          <button onClick={() => onDelete(pet.id)}
            className="text-xs text-slate-500 hover:text-red-400 py-1.5 px-2">
            🗑
          </button>
        </div>
      </div>
    </div>
  )
}
