import { useState, useEffect } from 'react'
import { UploadZone } from '../components/UploadZone'
import { GenerationProgress } from '../components/GenerationProgress'
import { useGeneration } from '../hooks/useGeneration'
import { useStore } from '../store'
import { api } from '../lib/api'

export default function Create() {
  const { stage, job, error, upload, confirm, regenerate, reset } = useGeneration()
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const { selectedProvider, setSelectedProvider, credits, setCredits, costPerGen, setCostPerGen, customApiKey } = useStore()

  // Fetch credits on mount
  useEffect(() => {
    api.getCredits().then(d => {
      setCredits(d.balance)
      setCostPerGen(d.cost_per_generation)
    }).catch(() => {})
  }, [])

  const handleUpload = (f: File, n: string) => {
    setFile(f)
    setName(n)
    upload(f, n, prompt, selectedProvider)
    // Refresh credits after upload
    setTimeout(() => {
      api.getCredits().then(d => setCredits(d.balance)).catch(() => {})
    }, 1000)
  }

  const providers = [
    { value: 'builtin', label: `内置 AI (${costPerGen} 积分/次)` },
    { value: 'custom', label: customApiKey ? '自定义 API Key' : '自定义 API Key (请在设置中配置)' },
  ]

  if (stage === 'done') {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-2">伴侣创建成功！</h2>
        <p className="text-slate-400 mb-6">你的桌面伴侣已经启动了</p>
        <button onClick={reset}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition">
          再创建一个
        </button>
      </div>
    )
  }

  const canGenerate = file && selectedProvider === 'builtin' ? credits >= costPerGen : file && customApiKey

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">创建新伴侣</h2>

      {/* Credit display */}
      <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💰</span>
          <div>
            <p className="text-sm text-slate-400">我的积分</p>
            <p className="text-xl font-bold">{credits} <span className="text-xs text-slate-500">积分</span></p>
          </div>
        </div>
        <div className="text-right text-xs text-slate-500">
          每次生成消耗 <span className="text-yellow-400 font-bold">{costPerGen}</span> 积分
        </div>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-300">{error}</p>
          {(stage === 'error') && (
            <button onClick={reset} className="text-sm text-red-400 underline mt-1">重试</button>
          )}
        </div>
      )}

      {stage === 'idle' && (
        <div className="space-y-4">
          {/* Prompt input */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <label className="block text-sm font-medium mb-2">🎨 描述你想要的效果（可选）</label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：卡通风格、可爱的大眼睛、粉色背景..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Model selector */}
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <label className="block text-sm font-medium mb-2">🤖 选择模型</label>
            <select
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            >
              {providers.map((p) => (
                <option key={p.value} value={p.value} disabled={p.value === 'custom' && !customApiKey}>
                  {p.label}
                </option>
              ))}
            </select>
            {selectedProvider === 'builtin' && credits < costPerGen && (
              <p className="text-red-400 text-xs mt-2">
                ⚠️ 积分不足！需要 {costPerGen} 积分，当前 {credits} 积分。
                请前往 <a href="#/settings" className="underline">设置页</a> 充值。
              </p>
            )}
            {selectedProvider === 'custom' && !customApiKey && (
              <p className="text-yellow-400 text-xs mt-2">
                ⚠️ 请先在 <a href="#/settings" className="underline">设置页</a> 配置自定义 API Key
              </p>
            )}
          </div>

          {/* Upload zone */}
          <UploadZone onUpload={handleUpload} disabled={!canGenerate} />
        </div>
      )}

      {(stage === 'uploading' || stage === 'generating') && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-lg">{stage === 'uploading' ? '上传中...' : 'AI 正在生成你的伴侣...'}</p>
          <GenerationProgress job={job} />
        </div>
      )}

      {stage === 'review' && job && (
        <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700">
          <h3 className="text-lg font-medium mb-4">预览</h3>
          <div className="aspect-square bg-slate-900 rounded-lg flex items-center justify-center mb-6 max-w-sm mx-auto">
            {job.preview_front ? (
              <img src={`http://localhost:8000/${job.preview_front}`}
                alt="Preview" className="max-w-full max-h-full object-contain" />
            ) : (
              <span className="text-slate-600">暂无预览</span>
            )}
          </div>
          <div className="flex gap-3 justify-center">
            <button onClick={regenerate}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition">
              🔄 重新生成
            </button>
            <button onClick={confirm}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg transition">
              ✅ 确认并启动
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
