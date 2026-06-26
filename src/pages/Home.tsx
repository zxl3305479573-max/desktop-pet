import { Link } from 'react-router-dom'
import { usePets } from '../hooks/usePets'
import { PetCard } from '../components/PetCard'

export default function Home() {
  const { pets, loading, error, deletePet } = usePets()

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.01em] text-slate-950">我的桌宠</h1>
          <p className="mt-2 text-sm text-slate-500">查看已生成的桌宠，或继续创建新的角色。</p>
        </div>
        <Link
          to="/create"
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          创建桌宠
        </Link>
      </div>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          正在加载桌宠列表。
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          加载失败：{error}
        </div>
      )}

      {!loading && pets.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <h2 className="text-lg font-semibold text-slate-950">还没有桌宠</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
            上传一张角色图片，逐步检查 AI 生成的素材，确认后即可启动桌宠。
          </p>
          <Link
            to="/create"
            className="mt-5 inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            创建第一个桌宠
          </Link>
        </div>
      )}

      {pets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {pets.map((pet) => (
            <PetCard key={pet.id} pet={pet} onDelete={deletePet} />
          ))}
        </div>
      )}
    </div>
  )
}
