import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'
import { api } from '../lib/api'

const RECHARGE_OPTIONS = [100, 300, 500, 1000]

export default function Settings() {
  const { backendUrl, setBackendUrl, customApiKey, setCustomApiKey, credits, setCredits, costPerGen } = useStore()
  const [recharging, setRecharging] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [txns, setTxns] = useState<any[]>([])

  useEffect(() => {
    api.getCredits().then(d => {
      setCredits(d.balance)
      setTxns(d.transactions || [])
    }).catch(() => {})
  }, [])

  const handleRecharge = async (amount: number) => {
    setRecharging(true)
    try {
      const result = await api.rechargeCredits(amount)
      setCredits(result.balance)
      // Refresh transactions
      const d = await api.getCredits()
      setTxns(d.transactions || [])
    } catch (e: any) {
      alert('充值失败: ' + e.message)
    } finally {
      setRecharging(false)
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">设置</h2>

      {/* Credits section */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg mb-6">
        <h3 className="text-lg font-medium mb-4">💰 我的积分</h3>
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-indigo-600 rounded-xl px-6 py-4 text-center">
            <p className="text-3xl font-bold">{credits}</p>
            <p className="text-xs text-indigo-200">积分余额</p>
          </div>
          <div className="text-sm text-slate-400">
            <p>每次生成消耗: <span className="text-yellow-400 font-bold">{costPerGen}</span> 积分</p>
            <p>可生成: <span className="text-green-400 font-bold">{Math.floor(credits / costPerGen)}</span> 次</p>
          </div>
        </div>

        <h4 className="text-sm font-medium mb-2">充值积分</h4>
        <div className="flex gap-2 flex-wrap mb-3">
          {RECHARGE_OPTIONS.map((amount) => (
            <button
              key={amount}
              onClick={() => handleRecharge(amount)}
              disabled={recharging}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm transition"
            >
              +{amount} 积分
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            placeholder="自定义数量"
            min="1"
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => {
              const amt = parseInt(customAmount)
              if (amt > 0) { handleRecharge(amt); setCustomAmount('') }
            }}
            disabled={recharging || !customAmount || parseInt(customAmount) <= 0}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-sm transition"
          >
            充值
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">模拟充值 — 正式版接入支付网关</p>

        {/* Transaction history */}
        {txns.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-2">交易记录</h4>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {txns.map((t: any) => (
                <div key={t.id} className="flex justify-between text-xs text-slate-400 py-1 border-b border-slate-700">
                  <span>{t.description || t.type}</span>
                  <span className={t.amount > 0 ? 'text-green-400' : 'text-red-400'}>
                    {t.amount > 0 ? '+' : ''}{t.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Backend settings */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg mb-6">
        <h3 className="text-lg font-medium mb-4">后端服务器</h3>
        <div className="bg-slate-700/50 rounded-lg p-3 mb-3 text-sm text-slate-300 leading-relaxed">
          💡 可视化伴侣是一个 <strong>客户端+服务端</strong> 架构。客户端（这个桌面窗口）负责界面和动画展示，服务端负责 AI 生成照片。
          这里的地址就是服务端运行的位置。本地使用时保持默认 <code className="bg-slate-600 px-1 rounded">http://localhost:8000</code> 即可。
        </div>
        <label className="block text-sm font-medium mb-1">API 地址</label>
        <input type="text" value={backendUrl}
          onChange={(e) => setBackendUrl(e.target.value)}
          placeholder="http://localhost:8000"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
        <p className="text-xs text-slate-500 mt-1">默认指向本地后端。如果你把服务端部署到了服务器上，这里改为服务器地址即可。</p>
      </div>

      {/* API Key */}
      <div className="bg-slate-800 rounded-xl p-6 border border-slate-700 max-w-lg">
        <h3 className="text-lg font-medium mb-4">API 供应商</h3>
        <p className="text-sm text-slate-400 mb-4">
          使用内置 AI 消耗积分，使用自定义 API Key 不限次数（费用由你的 API 供应商收取）。
        </p>
        <ApiKeyInput label="自定义 API Key"
          value={customApiKey}
          onChange={setCustomApiKey}
          placeholder="sk-..."
          hint="留空使用内置服务（消耗积分）" />
      </div>
    </div>
  )
}
