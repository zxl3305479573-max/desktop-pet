import { useState } from 'react'

interface Props {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
}

export function ApiKeyInput({ label, value, onChange, placeholder, hint }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
        />
        <button onClick={() => setVisible(!visible)}
          className="px-3 py-2 bg-slate-700 rounded-lg text-sm hover:bg-slate-600">
          {visible ? '🙈' : '👁'}
        </button>
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  )
}
