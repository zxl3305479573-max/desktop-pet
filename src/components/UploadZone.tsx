import { useState, DragEvent } from 'react'

interface Props {
  onUpload: (file: File, name: string) => void
  disabled?: boolean
}

export function UploadZone({ onUpload, disabled = false }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      onUpload(file, file.name.split('.')[0] || 'My Pet')
    }
  }

  return (
    <div
      className={`border-2 border-dashed rounded-xl p-12 text-center transition cursor-pointer ${
        dragging ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-600 hover:border-slate-500'
      } ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input type="file" accept="image/png,image/jpeg,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onUpload(file, file.name.split('.')[0] || 'My Pet')
        }}
        className="hidden" id="photo-upload" disabled={disabled} />
      <label htmlFor="photo-upload" className="cursor-pointer">
        <p className="text-5xl mb-3">📸</p>
        <p className="text-lg font-medium mb-1">拖拽照片到此处</p>
        <p className="text-sm text-slate-400">或点击选择 — 支持 PNG、JPG、WebP（最大 10MB）</p>
      </label>
    </div>
  )
}
