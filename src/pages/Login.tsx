import { useState } from 'react'
import { useStore } from '../store'

export default function Login() {
  const { backendUrl, setToken } = useStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegister, setIsRegister] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const endpoint = isRegister ? '/auth/register' : '/auth/login'
    try {
      const res = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(data.detail || 'Request failed')
      }
      const data = await res.json()
      setToken(data.access_token)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950">
      <div className="bg-slate-800 rounded-xl p-8 w-full max-w-sm border border-slate-700">
        <h1 className="text-2xl font-bold text-center mb-2">🐶 Pet-Bot</h1>
        <p className="text-slate-400 text-center mb-6 text-sm">
          {isRegister ? 'Create your account' : 'Sign in to your account'}
        </p>

        {error && (
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-3 mb-4 text-sm text-red-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              minLength={6}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg transition disabled:opacity-50"
          >
            {loading ? 'Please wait...' : isRegister ? 'Register' : 'Sign In'}
          </button>
        </form>

        <p className="text-sm text-slate-400 text-center mt-4">
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsRegister(!isRegister); setError('') }}
            className="text-indigo-400 hover:underline"
          >
            {isRegister ? 'Sign in' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}
