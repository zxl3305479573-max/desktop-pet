import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { ApiKeyInput } from '../components/ApiKeyInput'
import { api } from '../lib/api'

const RECHARGE_OPTIONS = [100, 300, 500, 1000]

export default function Settings() {
  const { customApiKey, setCustomApiKey, credits, setCredits, costPerGen, role } = useStore()
  const [recharging, setRecharging] = useState(false)
  const [customAmount, setCustomAmount] = useState('')
  const [txns, setTxns] = useState<any[]>([])
  const [adminUsers, setAdminUsers] = useState<any[]>([])
  const [adminEmail, setAdminEmail] = useState('')
  const [adminCredits, setAdminCredits] = useState('')

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

  const loadAdminUsers = async () => {
    try {
      const data = await api.adminListUsers()
      setAdminUsers(data.users)
    } catch (e: any) { alert(e.message) }
  }

  const handlePromote = async () => {
    try {
      await api.adminPromote(adminEmail)
      alert(`已将 ${adminEmail} 提升为管理员`)
      loadAdminUsers()
    } catch (e: any) { alert(e.message) }
  }

  const handleAdjustCredits = async () => {
    try {
      const amt = parseInt(adminCredits)
      if (isNaN(amt)) return
      await api.adminAdjustCredits(adminEmail, amt)
      alert(`已将 ${adminEmail} 积分调整为 ${amt}`)
      loadAdminUsers()
    } catch (e: any) { alert(e.message) }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">设置</h2>

      {/* Admin Panel */}
      {role === 'admin' && (
        <div className="bg-indigo-900/50 rounded-xl p-6 border border-indigo-700 max-w-2xl mb-6">
          <h3 className="text-lg font-medium mb-4">🛡️ 管理员面板</h3>

          <div className="mb-4 flex gap-2">
            <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="用户邮箱" className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            <button onClick={handlePromote}
              className="px-3 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg text-sm">提升为管理员</button>
          </div>

          <div className="mb-4 flex gap-2">
            <input type="number" value={adminCredits} onChange={(e) => setAdminCredits(e.target.value)}
              placeholder="积分数额" className="w-32 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm" />
            <button onClick={handleAdjustCredits}
              className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm">调整积分</button>
          </div>

          <button onClick={loadAdminUsers}
            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm mb-3">
            🔄 加载所有用户
          </button>

          {adminUsers.length > 0 && (
            <div className="max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-slate-400 border-b border-slate-700">
                  <th className="text-left py-1">邮箱</th>
                  <th className="text-right py-1">积分</th>
                  <th className="text-right py-1">角色</th>
                </tr></thead>
                <tbody>
                  {adminUsers.map((u: any) => (
                    <tr key={u.id} className="border-b border-slate-800">
                      <td className="py-1">{u.email}</td>
                      <td className="text-right py-1">{u.credits}</td>
                      <td className="text-right py-1">
                        <span className={u.role === 'admin' ? 'text-yellow-400' : 'text-slate-500'}>{u.role}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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
