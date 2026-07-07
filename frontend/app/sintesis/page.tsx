'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useDebateStore } from '@/store/useDebateStore'

const COLOR_VALIDACION: Record<string, string> = {
  validado:      'bg-green-900/40 border-green-600 text-green-300',
  parcial:       'bg-yellow-900/40 border-yellow-600 text-yellow-300',
  no_validado:   'bg-red-900/40 border-red-600 text-red-300',
}

const LABEL_VALIDACION: Record<string, string> = {
  validado:    '✓ Problema validado',
  parcial:     '◐ Validación parcial',
  no_validado: '✗ No validado',
}

const COLOR_VEREDICTO: Record<string, string> = {
  validado:  'bg-green-900/40 border-green-700 text-green-300',
  parcial:   'bg-yellow-900/40 border-yellow-700 text-yellow-300',
  refutado:  'bg-red-900/40 border-red-700 text-red-300',
  sin_datos: 'bg-gray-800 border-gray-700 text-gray-400',
}

const ICONO_VEREDICTO: Record<string, string> = {
  validado:  '✓',
  parcial:   '◐',
  refutado:  '✗',
  sin_datos: '○',
}

const LABEL_VEREDICTO: Record<string, string> = {
  validado:  'Validado',
  parcial:   'Parcial',
  refutado:  'Refutado',
  sin_datos: 'Sin datos',
}

export default function SintesisPage() {
  const router = useRouter()
  const { idea, sintesis, cargandoSintesis, errorSintesis } = useExplorarStore()
  const { idea: ideaDebate, estado: estadoDebate, setIdea, setInsightsExploracion, reset: resetDebate } = useDebateStore()

  // Redirigir si no hay sesión activa
  useEffect(() => {
    if (!idea) router.replace('/')
  }, [idea, router])

  function irAlDebate() {
    if (!sintesis) return
    // Solo resetear si la idea cambió — preservar debate cacheado de la misma idea
    if (ideaDebate !== idea || estadoDebate === 'idle' || estadoDebate === 'error') {
      resetDebate()
    }
    setIdea(idea)
    setInsightsExploracion(sintesis as unknown as Record<string, unknown>)
    router.push('/debate')
  }

  // ── Estado: cargando ─────────────────────────────────────────────────────
  if (cargandoSintesis) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
        <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Sintetizando insights de la exploración...</p>
        <p className="text-gray-600 text-xs">Esto puede tardar 20-30 segundos</p>
      </div>
    )
  }

  // ── Estado: error ─────────────────────────────────────────────────────────
  if (errorSintesis) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4 px-4">
        <div className="bg-red-950/50 border border-red-800 rounded-xl p-6 max-w-md text-center">
          <p className="text-red-400 text-sm mb-4">⚠ {errorSintesis}</p>
          <button
            onClick={() => router.push('/explorar')}
            className="bg-red-900 hover:bg-red-800 text-red-200 text-sm px-4 py-2 rounded-lg transition"
          >
            ← Volver a explorar
          </button>
        </div>
      </div>
    )
  }

  // ── Estado: sin síntesis aún ──────────────────────────────────────────────
  if (!sintesis) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center gap-4">
        <p className="text-gray-500 text-sm">No hay síntesis disponible todavía.</p>
        <button
          onClick={() => router.push('/explorar')}
          className="text-blue-400 hover:text-blue-300 text-sm transition"
        >
          ← Volver a explorar
        </button>
      </div>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 space-y-8 pt-16 md:pt-8">

      {/* Barra de navegación */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/explorar')}
          className="text-gray-400 hover:text-white text-sm transition"
        >
          ← Volver a explorar
        </button>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="text-gray-600">Supuestos</span>
          <span className="text-gray-700">→</span>
          <span className="text-gray-600">Explorar</span>
          <span className="text-gray-700">→</span>
          <span className="text-white font-medium">Síntesis</span>
          <span className="text-gray-700">→</span>
          <span className="text-gray-600">Debate</span>
        </div>
        <button
          onClick={irAlDebate}
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-5 py-2 rounded-xl transition"
        >
          Ir al debate →
        </button>
      </div>

      {/* Cabecera */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Síntesis de exploración</h1>
        <p className="text-gray-400 text-sm leading-relaxed line-clamp-2">{idea}</p>
      </div>

      {/* Métricas rápidas */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{sintesis.total_perfiles_entrevistados}</p>
          <p className="text-gray-400 text-xs mt-1">Perfiles entrevistados</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{sintesis.total_stakeholders}</p>
          <p className="text-gray-400 text-xs mt-1">Segmentos explorados</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-white">{(sintesis.nivel_confianza * 100).toFixed(0)}%</p>
          <p className="text-gray-400 text-xs mt-1">Nivel de confianza</p>
        </div>
      </div>

      {/* Validación del problema */}
      <div className={`border rounded-xl p-5 ${COLOR_VALIDACION[sintesis.validacion_problema] ?? 'bg-gray-900 border-gray-700 text-gray-300'}`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wider opacity-70 mb-1">Estado del problema</p>
            <p className="text-xl font-bold">
              {LABEL_VALIDACION[sintesis.validacion_problema] ?? sintesis.validacion_problema}
            </p>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed opacity-90 border-t border-white/10 pt-3">
          {sintesis.resumen_problema}
        </p>
      </div>

      {/* Jobs to Be Done */}
      {sintesis.jobs_principales.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Jobs to Be Done por segmento</h2>
          <div className="space-y-3">
            {sintesis.jobs_principales.map((job, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-3">
                  {job.stakeholder}
                </p>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Funcional</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{job.job_funcional}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Emocional</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{job.job_emocional}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs mb-1">Social</p>
                    <p className="text-gray-200 text-sm leading-relaxed">{job.job_social}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Patrones por stakeholder */}
      {sintesis.patrones_por_stakeholder.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Patrones detectados</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {sintesis.patrones_por_stakeholder.map((p, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-purple-400 text-xs font-semibold mb-2">{p.stakeholder}</p>
                <p className="text-gray-200 text-sm mb-2">{p.patron}</p>
                <p className="text-yellow-200 text-xs italic border-l-2 border-yellow-700 pl-3">
                  "{p.evidencia}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fricciones y temores */}
      <div className="grid md:grid-cols-2 gap-4">
        {sintesis.fricciones_criticas.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-red-400 text-sm font-semibold mb-3">⚡ Fricciones críticas</h3>
            <ul className="space-y-2">
              {sintesis.fricciones_criticas.map((f, i) => (
                <li key={i} className="text-gray-300 text-sm flex gap-2">
                  <span className="text-red-500 flex-shrink-0">·</span>{f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {sintesis.temores_recurrentes.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-orange-400 text-sm font-semibold mb-3">😰 Temores recurrentes</h3>
            <ul className="space-y-2">
              {sintesis.temores_recurrentes.map((t, i) => (
                <li key={i} className="text-gray-300 text-sm flex gap-2">
                  <span className="text-orange-500 flex-shrink-0">·</span>{t}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Oportunidades */}
      {sintesis.oportunidades_detectadas.length > 0 && (
        <div className="bg-blue-950/30 border border-blue-800 rounded-xl p-5">
          <h3 className="text-blue-400 text-sm font-semibold mb-3">💡 Oportunidades detectadas</h3>
          <ul className="space-y-2">
            {sintesis.oportunidades_detectadas.map((o, i) => (
              <li key={i} className="text-gray-200 text-sm flex gap-2">
                <span className="text-blue-400 flex-shrink-0">{i + 1}.</span>{o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Mapa de supuestos evaluados */}
      {sintesis.supuestos_evaluados && sintesis.supuestos_evaluados.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            Mapa de supuestos
            <span className="text-xs font-normal text-gray-500 bg-gray-800 px-2 py-0.5 rounded-full">
              Testing Business Ideas
            </span>
          </h2>
          <p className="text-gray-500 text-xs">
            Cada supuesto fue puesto a prueba durante las entrevistas de exploración.
          </p>
          <div className="space-y-3">
            {sintesis.supuestos_evaluados.map((sup: {
              supuesto_id: string; enunciado: string; tipo: string;
              veredicto: string; evidencia: string[]; nivel_confianza: number
            }, i: number) => (
              <div key={i} className={`border rounded-xl p-4 ${COLOR_VEREDICTO[sup.veredicto] ?? 'bg-gray-900 border-gray-700'}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-sm font-medium leading-relaxed flex-1">{sup.enunciado}</p>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${COLOR_VEREDICTO[sup.veredicto]}`}>
                      {ICONO_VEREDICTO[sup.veredicto]} {LABEL_VEREDICTO[sup.veredicto]}
                    </span>
                    <span className="text-xs opacity-60">{(sup.nivel_confianza * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {sup.evidencia.length > 0 && (
                  <div className="space-y-1 mt-2 pt-2 border-t border-white/10">
                    {sup.evidencia.slice(0, 2).map((ev: string, j: number) => (
                      <p key={j} className="text-xs opacity-75 italic">"{ev}"</p>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recomendación */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-5">
        <h3 className="text-gray-400 text-xs uppercase tracking-wider mb-2">Recomendación para el siguiente paso</h3>
        <p className="text-white text-sm leading-relaxed">{sintesis.recomendacion_siguiente_paso}</p>
      </div>

      {/* CTA final */}
      <div className="flex justify-center pt-4 pb-8">
        <button
          onClick={irAlDebate}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-4 rounded-xl transition text-sm"
        >
          Llevar estos insights al debate multiagente →
        </button>
      </div>

    </main>
  )
}
