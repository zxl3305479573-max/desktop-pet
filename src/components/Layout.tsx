import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useStore } from '../store'

const navItems = [
  { to: '/', label: '我的伴侣', icon: '🎭' },
  { to: '/create', label: '创建', icon: '✨' },
  { to: '/settings', label: '设置', icon: '⚙️' },
]

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const setToken = useStore((s) => s.setToken)

  const handleLogout = () => {
    setToken(null)
    navigate('/')
  }

  return (
    <div className="flex h-screen">
      <nav className="w-48 bg-slate-900 border-r border-slate-700 flex flex-col p-4 gap-2">
        <h1 className="text-xl font-bold text-white mb-6">✨ 可视化伴侣</h1>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${
                isActive ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            <span>{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        <div className="flex-1" />
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-800 hover:text-red-400 transition"
        >
          <span>🚪</span>
          退出
        </button>
      </nav>
      <main className="flex-1 overflow-auto p-6">
        {children}
      </main>
    </div>
  )
}
