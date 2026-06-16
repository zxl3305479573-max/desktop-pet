import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'

export default function Settings() {
  const { backendUrl, setBackendUrl, customApiKey, setCustomApiKey } = useStore()

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">设置</h2>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg mb-6">
        <h3 className="text-lg font-medium mb-4">后端服务器</h3>
        <label className="block text-sm font-medium mb-1">API 地址</label>
        <input type="text" value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="http://localhost:8000"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        <p className="text-xs text-slate-500 mt-1">FastAPI 后端服务器地址</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg">
        <h3 className="text-lg font-medium mb-4">API 供应商</h3>
        <p className="text-sm text-slate-400 mb-4">
          可视化伴侣内置免费额度（5 次生成）。填写自有 API Key 可无限使用。
        </p>
        <ApiKeyInput label="自定义 API Key"
          value={customApiKey}
          onChange={setCustomApiKey}
          placeholder="sk-..."
          hint="留空使用内置服务" />
      </div>
    </div>
  )
}
