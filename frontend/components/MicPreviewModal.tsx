'use client'
import { useState, useEffect } from 'react'

interface Props {
  text: string
  onConfirm: (text: string) => void
  onRetry: () => void
  onCancel: () => void
}

export function MicPreviewModal({ text, onConfirm, onRetry, onCancel }: Props) {
  const [edited, setEdited] = useState(text)
  useEffect(() => setEdited(text), [text])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm px-4 pb-4 sm:pb-0">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">🎤</span>
          <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Esto es lo que escuché</p>
        </div>
        <textarea
          value={edited}
          onChange={e => setEdited(e.target.value)}
          rows={3}
          autoFocus
          className="w-full bg-gray-800 border border-gray-600 rounded-xl px-3 py-2.5 text-sm text-white resize-none focus:outline-none focus:border-blue-500 transition"
        />
        <p className="text-xs text-gray-600 mt-1.5 mb-4">Puedes editar el texto antes de enviarlo.</p>
        <div className="flex gap-2">
          <button
            onClick={onRetry}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2.5 text-sm font-medium transition"
          >
            🔄 Repetir
          </button>
          <button
            onClick={onCancel}
            className="px-4 bg-gray-800 hover:bg-gray-700 text-gray-500 rounded-xl py-2.5 text-sm transition"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(edited)}
            disabled={!edited.trim()}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl py-2.5 text-sm font-semibold transition"
          >
            Enviar ✓
          </button>
        </div>
      </div>
    </div>
  )
}
