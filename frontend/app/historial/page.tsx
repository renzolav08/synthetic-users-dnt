'use client'

import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useHistorialStore } from '@/store/useHistorialStore'

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

export default function HistorialPage() {
  const router = useRouter()
  const { reset: resetDebate } = useDebateStore()
  const { idea: ideaExplorar, setIdea: setIdeaExplorar, reset: resetExplorar } = useExplorarStore()
  const { entradas, limpiar } = useHistorialStore()

  function formatFecha(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('es-PE', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch { return iso }
  }

  function verExploracion(idea: string) {
    // Si la idea coincide con la sesión activa en explorarStore, ir directo — verán sus perfiles y conversaciones
    // Si no, resetear explorar y pre-cargar la idea para que puedan re-explorar desde cero
    if (ideaExplorar !== idea) {
      resetExplorar()
      setIdeaExplorar(idea, '', '')
    }
    router.push('/explorar')
  }


  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm transition">
            ← Inicio
          </button>
          <h1 className="text-sm font-semibold text-white">Historial</h1>
          {entradas.length > 0 ? (
            <button onClick={limpiar} className="text-xs text-gray-500 hover:text-red-400 transition">
              Limpiar
            </button>
          ) : <div className="w-16" />}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {entradas.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm">Aún no hay debates guardados.</p>
            <button
              onClick={() => router.push('/')}
              className="mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition"
            >
              Evaluar una idea →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {entradas.map((d) => (
              <div key={d.session_id} className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-5 transition">
                <div className="flex items-start gap-4">
                  {/* Info principal */}
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-200 text-sm leading-relaxed">
                      {d.idea_texto.length > 140 ? d.idea_texto.slice(0, 140) + '…' : d.idea_texto}
                    </p>
                    {d.resumen_ejecutivo && (
                      <p className="text-gray-500 text-xs mt-1.5 line-clamp-2 leading-relaxed">
                        {d.resumen_ejecutivo}
                      </p>
                    )}
                    <p className="text-gray-600 text-xs mt-2">{formatFecha(d.fecha)}</p>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className={`text-xs border px-2.5 py-1 rounded-full font-medium ${COLOR_VEREDICTO[d.recomendacion] || 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                      {LABEL_VEREDICTO[d.recomendacion] || d.recomendacion}
                    </span>
                    <span className="text-xs text-gray-500">
                      {(d.nivel_confianza * 100).toFixed(0)}% confianza
                    </span>

                    <div className="flex flex-col gap-1.5 mt-1 items-end">
                      <button
                        onClick={() => verExploracion(d.idea_texto)}
                        className="text-xs text-purple-400 hover:text-purple-300 transition"
                        title={ideaExplorar === d.idea_texto ? 'Ver perfiles y conversaciones de esta exploración' : 'Re-explorar esta idea desde cero'}
                      >
                        {ideaExplorar === d.idea_texto ? '← Ver exploración' : '← Re-explorar idea'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
