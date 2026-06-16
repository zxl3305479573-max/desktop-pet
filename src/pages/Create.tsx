import { UploadZone } from '../components/UploadZone'
import { GenerationProgress } from '../components/GenerationProgress'
import { useGeneration } from '../hooks/useGeneration'

export default function Create() {
  const { stage, job, error, upload, confirm, regenerate, reset } = useGeneration()

  if (stage === 'done') {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-2">Pet Created!</h2>
        <p className="text-slate-400 mb-6">Your pet is now on your desktop</p>
        <button onClick={reset}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition">
          Create Another
        </button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">Create New Pet</h2>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-300">{error}</p>
          {(stage === 'error') && (
            <button onClick={reset} className="text-sm text-red-400 underline mt-1">Try again</button>
          )}
        </div>
      )}

      {stage === 'idle' && <UploadZone onUpload={upload} />}

      {(stage === 'uploading' || stage === 'generating') && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-lg">{stage === 'uploading' ? 'Uploading...' : 'AI is generating your pet...'}</p>
          <GenerationProgress job={job} />
        </div>
      )}

      {stage === 'review' && job && (
        <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-medium mb-4">Preview</h3>
          <div className="aspect-square bg-slate-900 rounded-lg flex items-center justify-center mb-6 max-w-sm mx-auto">
            {job.preview_front ? (
              <img src={`http://localhost:8000/${job.preview_front}`}
                alt="Preview" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-slate-600">No preview available</span>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={regenerate}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">
              🔄 Regenerate
            </button>
            <button onClick={confirm}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition">
              ✅ Confirm & Launch
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
