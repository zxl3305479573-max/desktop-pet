interface StageInfo {
  stage: number
  name: string
  desc: string
}

const STAGES: Record<number, StageInfo> = {
  1: { stage: 1, name: '姿态识别', desc: 'AI 正在识别照片中的关键点...' },
  2: { stage: 2, name: '背景移除', desc: '移除背景，提取人物/角色...' },
  3: { stage: 3, name: '部件分割', desc: '将身体拆分为头、躯干、四肢...' },
  4: { stage: 4, name: '骨骼绑定', desc: '匹配骨骼模板，建立动画骨架...' },
  5: { stage: 5, name: '预览生成', desc: '合成最终效果预览...' },
}

interface Props {
  stage: number
  previewUrl: string | null
  stageData: Record<string, any> | null
  loading: boolean
  onContinue: () => void
  onRegenerate: () => void
}

export function StageViewer({ stage, previewUrl, stageData, loading, onContinue, onRegenerate }: Props) {
  const info = STAGES[stage] || STAGES[1]

  return (
    <div className="mt-6 bg-slate-800 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium">
            第 {stage} 步：{info.name}
          </h3>
          <p className="text-sm text-slate-400">{info.desc}</p>
        </div>
        <span className="text-xs bg-indigo-600 text-white px-2 py-1 rounded-full">
          {stage}/5
        </span>
      </div>

      {/* Preview image */}
      <div className="aspect-video bg-slate-900 rounded-lg flex items-center justify-center mb-4 max-w-lg mx-auto overflow-hidden">
        {loading ? (
          <div className="text-center">
            <div className="text-3xl animate-spin mb-2">⏳</div>
            <p className="text-sm text-slate-500">处理中...</p>
          </div>
        ) : previewUrl ? (
          <img src={`http://localhost:8000/${previewUrl}`}
            alt={`Stage ${stage}`} className="max-w-full max-h-full object-contain" />
        ) : (
          <span className="text-slate-600">等待处理</span>
        )}
      </div>

      {/* Stage data */}
      {stageData && (
        <div className="flex gap-4 justify-center mb-4 text-sm text-slate-400">
          {stageData.keypoints && <span>📍 {stageData.keypoints} 个关键点</span>}
          {stageData.confidence && <span>📊 置信度: {stageData.confidence}</span>}
          {stageData.parts && <span>🧩 {stageData.parts} 个部件</span>}
          {stageData.bones && <span>🦴 {stageData.bones} 根骨骼</span>}
          {stageData.rig_quality && <span>⭐ 质量: {stageData.rig_quality}</span>}
        </div>
      )}

      {/* Actions */}
      {!loading && (
        <div className="flex gap-3 justify-center">
          {stage < 5 ? (
            <>
              <button onClick={onRegenerate}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                🔄 重新生成此步
              </button>
              <button onClick={onContinue}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm transition font-medium">
                确认，继续下一步 →
              </button>
            </>
          ) : (
            <>
              <button onClick={onRegenerate}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition">
                🔄 重新生成
              </button>
              <button onClick={onContinue}
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm transition font-medium">
                ✅ 确认并启动伴侣
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
