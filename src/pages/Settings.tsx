import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'
import { saveAppSettings, loadAppSettings, isDesktopPetAvailable } from '../lib/db'
import { api } from '../lib/api'

export default function Settings() {
  const { apiKey, apiBaseUrl, apiModel, setApiKey, setApiBaseUrl, setApiModel, loadSettings } =
    useStore()

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Load persisted settings on mount
  useEffect(() => {
    if (!isDesktopPetAvailable()) return
    loadAppSettings().then((settings) => {
      if (settings && Object.keys(settings).length > 0) {
        loadSettings(settings)
      }
    }).catch(() => {})
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const data = {
        apiKey: apiKey || '',
        apiBaseUrl: apiBaseUrl || '',
        apiModel: apiModel || '',
      }
      // Persist locally via Electron IPC
      await saveAppSettings(data)
      // Sync to backend for immediate effect
      await api.updateConfig({
        api_key: apiKey || undefined,
        api_base_url: apiBaseUrl || undefined,
        model: apiModel || undefined,
      })
      setMessage({ type: 'success', text: '设置已保存，新配置将在下次生成时生效。' })
    } catch (e: any) {
      setMessage({ type: 'error', text: `保存失败: ${e.message}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">设置</h2>

      <div className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 max-w-lg space-y-5">
        <div>
          <h3 className="text-lg font-medium text-slate-950">API 配置</h3>
          <p className="mt-1 text-sm text-slate-500">
            配置 AI 图像生成服务的连接参数。支持任何 OpenAI 兼容的 API 地址。修改后点击保存生效。
          </p>
        </div>

        {/* API Base URL */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">API 地址</label>
          <input
            type="text"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
            placeholder="https://api.openai.com/v1"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            支持 OpenAI 兼容的 API 地址，如 OpenAI、兼容网关或中转服务。
          </p>
        </div>

        {/* Model name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">模型名称</label>
          <input
            type="text"
            value={apiModel}
            onChange={(e) => setApiModel(e.target.value)}
            placeholder="gpt-image-2"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            图片生成模型的名称。不同服务商可用的模型名称可能不同，请参照其文档。
          </p>
        </div>

        {/* API Key */}
        <ApiKeyInput
          label="API Key"
          value={apiKey}
          onChange={setApiKey}
          placeholder="sk-..."
          hint="留空使用系统内置 Key。填写后将覆盖内置配置，使用你自己的 API Key 进行生成。"
        />

        {/* Message */}
        {message && (
          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              message.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-700'
                : 'border border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:bg-slate-300"
        >
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>
    </div>
  )
}
