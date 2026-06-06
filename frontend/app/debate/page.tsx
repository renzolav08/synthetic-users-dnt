'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'

const COLORES_ROL: Record<string, string> = {
  'Usuario Objetivo':    'border-purple-500 bg-purple-950/30',
  'Analista de Negocio': 'border-yellow-500 bg-yellow-950/30',
  'Experto Técnico':     'border-blue-500 bg-blue-950/30',
  'Analista de Contexto':'border-green-500 bg-green-950/30',
  'Analista de Riesgos': 'border-red-500 bg-red-950/30',
  'Analista de Crecimiento': 'border-cyan-500 bg-cyan-950/30',
  'Asesor Legal':        'border-orange-500 bg-orange-950/30',
  'Especialista de Rubro': 'border-pink-500 bg-pink-950/30',
}

const ICONO_POSICION: Record<string, string> = {
  pro: '✓',
  contra: '✗',
  neutral: '○',
}

const COLOR_POSICION: Record<string, string> = {
  pro: 'text-green-400',
  contra: 'text-red-400',
  neutral: 'text-gray-400',
}

const COLOR_RECOMENDACION: Record<string, string> = {
  viable: 'bg-green-900 border-green-600 text-green-300',
  no_viable: 'bg-red-900 border-red-600 text-red-300',
  condicionalmente_viable: 'bg-yellow-900 border-yellow-600 text-yellow-300',
}

const LABEL_RECOMENDACION: Record<string, string> = {
  viable: '✓ Viable',
  no_viable: '✗ No viable',
  condicionalmente_viable: '◐ Condicionalmente viable',
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export default function DebatePage() {
  const router = useRouter()
  const { idea, estado, contexto, argumentos, arbol, reset, insights_exploracion,
          setEstado, setContexto, addArgumento, setArbol, setError } = useDebateStore()

  // Si llegamos aquí sin debate iniciado todavía, arrancarlo automáticamente
  useEffect(() => {
    if (!idea) { router.replace('/'); return }
    if (estado !== 'idle') return   // ya está corriendo o terminó

    iniciarDebate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  async function iniciarDebate() {
    setEstado('analizando')
    try {
      const res = await fetch(`${API}/evaluar-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_texto: idea,
          insights_exploracion: insights_exploracion ?? undefined,
        }),
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      if (!res.body) throw new Error('Sin respuesta del servidor')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const { tipo, data } = JSON.parse(line.slice(6))
            if (tipo === 'contexto')        { setContexto(data); setEstado('buscando_web') }
            else if (tipo === 'datos_web')  { setEstado('generando_perfiles') }
            else if (tipo === 'perfiles_listos') { setEstado('debatiendo') }
            else if (tipo === 'argumento')  { addArgumento(data) }
            else if (tipo === 'consenso')   { setArbol(data); setEstado('consenso') }
            else if (tipo === 'fin')        { setEstado('completado') }
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      setError(msg)
    }
  }

  useEffect(() => {
    if (!idea) router.replace('/')
  }, [idea, router])

  const cargando = estado !== 'completado' && estado !== 'error'

  const ESTADOS_LABEL: Record<string, string> = {
    analizando:          'Analizando tu idea...',
    buscando_web:        'Buscando datos reales del mercado...',
    generando_perfiles:  'Generando perfiles de los agentes...',
    debatiendo:          `Debate en progreso · ${argumentos.length} de ${contexto?.agentes.length ?? '?'} agentes`,
    consenso:            'Construyendo el árbol de argumentos...',
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => { reset(); router.push('/') }}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition"
          >
            ← Nueva evaluación
          </button>
          <div className="flex items-center gap-3">
            {insights_exploracion && (
              <span className="text-xs bg-purple-900/60 border border-purple-700 text-purple-300 px-2.5 py-1 rounded-full">
                ✓ Con insights de exploración
              </span>
            )}
            {cargando && (
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            )}
            <span className="text-sm text-gray-400">
              {cargando ? ESTADOS_LABEL[estado] || 'Procesando...' : 'Evaluación completada'}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Idea evaluada */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Idea evaluada</p>
          <p className="text-gray-200 leading-relaxed">{idea}</p>
          {contexto && (
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">
                {contexto.sector}
              </span>
              <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">
                {contexto.pais}{contexto.region ? ` · ${contexto.region}` : ''}
              </span>
              <span className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1 rounded-full">
                {contexto.modelo_negocio}
              </span>
              {contexto.agentes.map(a => (
                <span key={a.rol} className="bg-blue-950 text-blue-300 text-xs px-2.5 py-1 rounded-full">
                  {a.rol}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Debate */}
        {argumentos.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4">
              Debate multiagente
              <span className="ml-2 text-sm font-normal text-gray-500">
                {argumentos.length} argumento{argumentos.length !== 1 ? 's' : ''}
              </span>
            </h2>
            <div className="space-y-4">
              {argumentos.map((arg, i) => (
                <div
                  key={i}
                  className={`border-l-2 rounded-xl p-5 ${COLORES_ROL[arg.agente_rol] || 'border-gray-600 bg-gray-900'}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <span className="font-semibold text-white text-sm">{arg.agente_nombre}</span>
                      <span className="ml-2 text-xs text-gray-400">{arg.agente_rol}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium ${COLOR_POSICION[arg.posicion] || 'text-gray-400'}`}>
                        {ICONO_POSICION[arg.posicion] || '○'} {arg.posicion}
                      </span>
                      <span className="text-xs text-gray-600">
                        peso {(arg.agente_peso * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{arg.argumento}</p>
                </div>
              ))}

              {/* Indicador de carga de agentes pendientes */}
              {cargando && estado === 'debatiendo' && contexto && argumentos.length < contexto.agentes.length && (
                <div className="border-l-2 border-gray-700 bg-gray-900 rounded-xl p-5 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-500 text-sm">
                      Esperando {contexto.agentes.length - argumentos.length} agente{contexto.agentes.length - argumentos.length !== 1 ? 's' : ''}...
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Árbol de argumentos */}
        {arbol && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Árbol de argumentos</h2>

            {/* Recomendación */}
            <div className={`border rounded-xl p-5 ${COLOR_RECOMENDACION[arbol.recomendacion] || 'bg-gray-900 border-gray-700'}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-70 mb-1">Recomendación ponderada</p>
                  <p className="text-xl font-bold">
                    {LABEL_RECOMENDACION[arbol.recomendacion] || arbol.recomendacion}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70 mb-1">Nivel de confianza</p>
                  <p className="text-2xl font-bold">{(arbol.nivel_confianza * 100).toFixed(0)}%</p>
                </div>
              </div>
              {arbol.resumen_ejecutivo && (
                <p className="mt-3 text-sm opacity-80 leading-relaxed border-t border-white/10 pt-3">
                  {arbol.resumen_ejecutivo}
                </p>
              )}
            </div>

            {/* Grid de detalles */}
            <div className="grid md:grid-cols-2 gap-4">

              {/* Acuerdos */}
              {arbol.acuerdos.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-green-400 mb-3">
                    ✓ Puntos de acuerdo ({arbol.acuerdos.length})
                  </h3>
                  <ul className="space-y-2">
                    {arbol.acuerdos.map((a, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-green-500 mr-1.5">·</span>
                        {a.punto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Divergencias */}
              {arbol.divergencias.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-3">
                    ✗ Puntos de divergencia ({arbol.divergencias.length})
                  </h3>
                  <ul className="space-y-2">
                    {arbol.divergencias.map((d, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-red-500 mr-1.5">·</span>
                        {d.punto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Fortalezas */}
              {arbol.fortalezas_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">
                    ↑ Fortalezas de la idea
                  </h3>
                  <ul className="space-y-2">
                    {arbol.fortalezas_idea.map((f, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-blue-500 mr-1.5">·</span>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Debilidades */}
              {arbol.debilidades_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-orange-400 mb-3">
                    ↓ Debilidades de la idea
                  </h3>
                  <ul className="space-y-2">
                    {arbol.debilidades_idea.map((d, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-orange-500 mr-1.5">·</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Condiciones */}
            {arbol.condiciones.length > 0 && (
              <div className="bg-yellow-950/30 border border-yellow-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-yellow-400 mb-3">
                  ⚠ Condiciones para viabilidad
                </h3>
                <ul className="space-y-2">
                  {arbol.condiciones.map((c, i) => (
                    <li key={i} className="text-sm text-yellow-200 flex gap-2">
                      <span className="text-yellow-500 flex-shrink-0">{i + 1}.</span>
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Botón nueva evaluación */}
            <div className="flex justify-center pt-4">
              <button
                onClick={() => { reset(); router.push('/') }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition text-sm"
              >
                Evaluar otra idea →
              </button>
            </div>
          </div>
        )}

        {/* Estado vacío mientras carga */}
        {cargando && argumentos.length === 0 && (
          <div className="text-center py-20">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400 text-sm">{ESTADOS_LABEL[estado] || 'Iniciando...'}</p>
          </div>
        )}

      </div>
    </main>
  )
}