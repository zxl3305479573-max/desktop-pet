import { useState, useEffect } from 'react'
import { UploadZone } from '../components/UploadZone'
import { StageViewer } from '../components/StageViewer'
import { useGeneration } from '../hooks/useGeneration'
import { useStore } from '../store'
import { api } from '../lib/api'

export default function Create() {
  const { stage, currentStep, stepResult, stepLoading, error, upload, runNextStep, regenerateStep, confirm, regenerate, reset } = useGeneration()
  const [file, setFile] = useState<File | null>(null)
  const [prompt, setPrompt] = useState('')
  const { selectedProvider, setSelectedProvider, credits, setCredits, costPerGen, setCostPerGen, customApiKey } = useStore()

  useEffect(() => {
    api.getCredits().then(d => { setCredits(d.balance); setCostPerGen(d.cost_per_generation) }).catch(() => {})
  }, [])

  const handleUpload = (f: File, _name: string) => {
    setFile(f)
    upload(f, _name, prompt, selectedProvider)
    setTimeout(() => { api.getCredits().then(d => setCredits(d.balance)).catch(() => {}) }, 1000)
  }

  const providers = [
    { value: 'builtin', label: `内置 AI (${costPerGen} 积分/次)` },
    { value: 'custom', label: customApiKey ? '自定义 API Key' : '自定义 API Key（请在设置中配置）' },
  ]

  const canGenerate = file !== null || (selectedProvider === 'builtin' ? credits >= costPerGen : !!customApiKey)

  if (stage === 'done') {
    return (
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold mb-2">伴侣创建成功！</h2>
        <p className="text-slate-400 mb-6">你的桌面伴侣已经启动了</p>
        <button onClick={reset} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2 rounded-lg transition">再创建一个</button>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4">创建新伴侣</h2>

      {/* Credit bar */}
      <div className="bg-slate-800 rounded-xl p-3 border border-slate-700 mb-4 flex items-center justify-between text-sm">
        <span>💰 积分: <strong>{credits}</strong>（每次 {costPerGen} 积分）</span>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-700 rounded-lg p-4 mb-4">
          <p className="text-red-300">{error}</p>
          {(stage === 'error') && <button onClick={reset} className="text-sm text-red-400 underline mt-1">重试</button>}
        </div>
      )}

      {/* Upload phase */}
      {stage === 'idle' && (
        <div className="space-y-4">
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <label className="block text-sm font-medium mb-2">🎨 描述你想要的效果（可选）</label>
            <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
              placeholder="例如：卡通风格、可爱的大眼睛、粉色背景..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
          </div>

          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
            <label className="block text-sm font-medium mb-2">🤖 选择模型</label>
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
              {providers.map(p => <option key={p.value} value={p.value} disabled={p.value === 'custom' && !customApiKey}>{p.label}</option>)}
            </select>
            {selectedProvider === 'builtin' && credits < costPerGen && (
              <p className="text-red-400 text-xs mt-2">⚠️ 积分不足！请前往 <a href="#/settings" className="underline">设置页</a> 充值。</p>
            )}
          </div>

          <UploadZone onUpload={handleUpload} disabled={!canGenerate} />
        </div>
      )}

      {/* Uploading */}
      {stage === 'uploading' && (
        <div className="text-center py-12">
          <div className="text-4xl animate-spin mb-4">⏳</div>
          <p className="text-lg">上传中...</p>
        </div>
      )}

      {/* Step-by-step generation */}
      {stage === 'stepping' && (
        <div>
          {/* Step progress bar */}
          <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <div key={s} className="flex-1 flex items-center gap-1">
                <div className={`flex-1 h-2 rounded-full ${s <= currentStep ? 'bg-indigo-500' : 'bg-slate-700'} ${stepLoading && s === currentStep + 1 ? 'animate-pulse' : ''}`} />
                <span className={`text-xs ${s <= currentStep ? 'text-indigo-400' : 'text-slate-600'}`}>{s}</span>
              </div>
            ))}
          </div>

          {/* Current step viewer */}
          {currentStep === 0 ? (
            <div className="text-center py-12 bg-slate-800 rounded-xl border border-slate-700">
              <p className="text-lg mb-4">照片已上传，准备开始生成</p>
              <button onClick={runNextStep}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-lg transition font-medium">
                🚀 开始生成
              </button>
            </div>
          ) : (
            <StageViewer
              stage={currentStep}
              previewUrl={stepResult?.preview || null}
              stageData={stepResult || null}
              loading={stepLoading}
              onContinue={currentStep < 5 ? runNextStep : confirm}
              onRegenerate={currentStep < 5 ? regenerateStep : regenerate}
            />
          )}
        </div>
      )}

      {/* Review (stage 5 complete) */}
      {stage === 'review' && stepResult && (
        <StageViewer
          stage={5}
          previewUrl={stepResult.preview || null}
          stageData={stepResult}
          loading={stepLoading}
          onContinue={confirm}
          onRegenerate={regenerate}
        />
      )}

      {/* Confirming */}
      {stage === 'confirming' && (
        <div className="text-center py-12">
          <div className="text-4xl animate-spin mb-4">💾</div>
          <p className="text-lg">正在保存...</p>
        </div>
      )}
    </div>
  )
}
