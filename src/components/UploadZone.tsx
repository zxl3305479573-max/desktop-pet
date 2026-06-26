import { useState, DragEvent } from 'react'

interface Props {
  onUpload: (file: File, name: string) => void
  disabled?: boolean
}

export function UploadZone({ onUpload, disabled = false }: Props) {
  const [dragging, setDragging] = useState(false)

  const submitFile = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return
    onUpload(file, file.name.split('.')[0] || '桌宠')
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    submitFile(e.dataTransfer.files[0])
  }

  return (
    <div
      className={[
        'rounded-xl border border-dashed bg-white p-8 text-center transition',
        dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400',
        disabled ? 'pointer-events-none opacity-50' : '',
      ].join(' ')}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => submitFile(e.target.files?.[0])}
        className="hidden"
        id="photo-upload"
        disabled={disabled}
      />
      <label htmlFor="photo-upload" className="block cursor-pointer">
        <span className="block text-base font-semibold text-slate-950">上传角色图片</span>
        <span className="mt-2 block text-sm text-slate-500">
          拖入图片到这里，或点击选择文件。支持 PNG、JPG、WebP。
        </span>
      </label>
    </div>
  )
}
