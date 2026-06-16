import { Link } from 'react-router-dom'
import { usePets } from '../hooks/usePets'
import { PetCard } from '../components/PetCard'

export default function Home() {
  const { pets, loading, error, deletePet } = usePets()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">My Pets</h2>
        <Link to="/create"
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm transition">
          + New Pet
        </Link>
      </div>

      {loading && <p className="text-slate-400">Loading...</p>}
      {error && <p className="text-red-400 mb-4">Error: {error}</p>}

      {!loading && pets.length === 0 && (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">🐾</p>
          <p className="text-slate-400 text-lg mb-4">No pets yet</p>
          <Link to="/create" className="text-indigo-400 hover:underline">
            Create your first desktop pet →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {pets.map(pet => (
          <PetCard key={pet.id} pet={pet} onDelete={deletePet} />
        ))}
      </div>
    </div>
  )
}
