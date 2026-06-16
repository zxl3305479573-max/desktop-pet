import { Link } from 'react-router-dom'

export default function Home() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">My Pets</h2>
        <Link
          to="/create"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm transition"
        >
          + New Pet
        </Link>
      </div>
      <div className="text-center py-20">
        <p className="text-5xl mb-4">🐾</p>
        <p className="text-slate-400 text-lg mb-4">No pets yet</p>
        <Link to="/create" className="text-indigo-400 hover:underline">
          Create your first desktop pet →
        </Link>
      </div>
    </div>
  )
}
