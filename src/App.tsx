import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Create from './pages/Create'
import Settings from './pages/Settings'
import Login from './pages/Login'
import { useStore } from './store'

export default function App() {
  const token = useStore((s) => s.token)

  return (
    <HashRouter>
      {!token ? (
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<Create />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
    </HashRouter>
  )
}
