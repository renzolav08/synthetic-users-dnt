'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'

type DebateResumen = {
  id: string
  idea_texto: string
  veredicto: string | null
  confianza: number | null
  resumen_ejecutivo: string | null
  created_at: string
}

const COLOR_VEREDICTO: Record<string, string> = {
  viable: 'bg-green-900/60 border-green-700 text-green-300',
  no_viable: 'bg-red-900/60 border-red-700 text-red-300',
  condicionalmente_viable: 'bg-yellow-900/60 border-yellow-700 text-yellow-300',
}
const LABEL_VEREDICTO: Record<string, string> = {
  viable: '✓ Viable',
  no_viable: '✗ No viable',
  condicionalmente_viable: '◐ Condicional',
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export default function HistorialPage() {
  const router = useRouter()
  const { setIdea, setInsightsExploracion } = useDebateStore()
  const [debates, setDebates] = useState<DebateResumen[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${API}/historial`)
      .then(r => r.json())
      .then(d => setDebates(d.debates ?? []))
      .catch(() => setError('No se pudo cargar el historial'))
      .finally(() => setCargando(false))
  }, [])

  function formatFecha(iso: string) {
    try {
      return new Date(iso + 'Z').toLocaleDateString('es-PE', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  function reevaluar(idea: string) {
    setIdea(idea)
    setInsightsExploracion(null)
    router.push('/debate')
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-gray-400 hover:text-white text-sm transition"
          >
            ← Inicio
          </button>
          <h1 className="text-sm font-semibold text-white">Historial de debates</h1>
          <div className="w-20" />
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {cargando && (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Cargando historial...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-950/40 border border-red-800 rounded-xl p-5 text-red-300 text-sm">
            {error}
          </div>
        )}

        {!cargando && !error && debates.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">Aún no hay debates guardados.</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition"
            >
              Evaluar una idea →
            </button>
          </div>
        )}

        <div className="space-y-3">
          {debates.map(d => (
            <div
              key={d.id}
              className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-gray-200 text-sm leading-relaxed line-clamp-2">
                    {d.idea_texto.length > 100 ? d.idea_texto.slice(0, 100) + '…' : d.idea_texto}
                  </p>
                  {d.resumen_ejecutivo && (
                    <p className="text-gray-500 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                      {d.resumen_ejecutivo}
                    </p>
                  )}
                  <p className="text-gray-600 text-xs mt-2">{formatFecha(d.created_at)}</p>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {d.veredicto && (
                    <span className={`text-xs border px-2.5 py-1 rounded-full font-medium ${COLOR_VEREDICTO[d.veredicto] || 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                      {LABEL_VEREDICTO[d.veredicto] || d.veredicto}
                    </span>
                  )}
                  {d.confianza != null && (
                    <span className="text-xs text-gray-500">
                      {(d.confianza * 100).toFixed(0)}% confianza
                    </span>
                  )}
                  <button
                    onClick={() => reevaluar(d.idea_texto)}
                    className="text-xs text-blue-400 hover:text-blue-300 transition mt-1"
                  >
                    Re-evaluar →
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
