import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'

export default function Settings() {
  const { backendUrl, setBackendUrl, customApiKey, setCustomApiKey } = useStore()

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg mb-6">
        <h3 className="text-lg font-medium mb-4">Backend Server</h3>
        <label className="block text-sm font-medium mb-1">API URL</label>
        <input type="text" value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="http://localhost:8000"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        <p className="text-xs text-slate-500 mt-1">The FastAPI backend server address</p>
      </div>

      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg">
        <h3 className="text-lg font-medium mb-4">API Provider</h3>
        <p className="text-sm text-slate-400 mb-4">
          Pet-Bot includes a free tier with 5 generations. Provide your own API key for unlimited use.
        </p>
        <ApiKeyInput label="Custom API Key"
          value={customApiKey}
          onChange={setCustomApiKey}
          placeholder="sk-..."
          hint="Leave empty to use the built-in service" />
      </div>
    </div>
  )
}
