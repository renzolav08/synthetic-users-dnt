'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'

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
  pro: '✓', contra: '✗', neutral: '○',
}
const COLOR_POSICION: Record<string, string> = {
  pro: 'text-green-400', contra: 'text-red-400', neutral: 'text-gray-400',
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

const LIKERT_LABELS: Record<number, string> = {
  1: 'Muy bajo', 2: 'Bajo', 3: 'Regular', 4: 'Alto', 5: 'Muy alto',
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// ── HU-009: Modal de encuesta ─────────────────────────────────────────────────
function EncuestaModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [valores, setValores] = useState({ utilidad: 3, calidad_argumentos: 3, relevancia_contexto: 3, intencion_reuso: 3, confianza_recomendacion: 3 })
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)

  const preguntas: { key: keyof typeof valores; label: string }[] = [
    { key: 'utilidad', label: 'Utilidad general del debate para tu decisión' },
    { key: 'calidad_argumentos', label: 'Calidad y profundidad de los argumentos' },
    { key: 'relevancia_contexto', label: 'Relevancia del contexto y agentes elegidos' },
    { key: 'intencion_reuso', label: '¿Volverías a usar este sistema?' },
    { key: 'confianza_recomendacion', label: 'Confianza en la recomendación final' },
  ]

  async function enviar() {
    setEnviando(true)
    try {
      await fetch(`${API}/encuesta`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, ...valores, comentario }),
      })
      setEnviado(true)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        {enviado ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">🙏</div>
            <p className="text-white font-semibold text-lg mb-1">¡Gracias por tu feedback!</p>
            <p className="text-gray-400 text-sm mb-5">Tu opinión ayuda a mejorar el sistema.</p>
            <button onClick={onClose} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold text-base">Encuesta de satisfacción</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-white transition text-lg">✕</button>
            </div>
            <div className="space-y-5">
              {preguntas.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-gray-300 text-sm mb-2">{label}</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setValores(v => ({ ...v, [key]: n }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                          valores[key] === n
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                        }`}
                        title={LIKERT_LABELS[n]}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">{LIKERT_LABELS[valores[key]]}</p>
                </div>
              ))}
              <div>
                <p className="text-gray-300 text-sm mb-2">Comentario adicional (opcional)</p>
                <textarea
                  value={comentario}
                  onChange={e => setComentario(e.target.value)}
                  rows={2}
                  placeholder="¿Algo que mejorarías?"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={onClose} className="text-gray-400 hover:text-white text-sm transition px-4 py-2">
                Omitir
              </button>
              <button
                onClick={enviar}
                disabled={enviando}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition"
              >
                {enviando ? 'Enviando...' : 'Enviar feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export default function DebatePage() {
  const router = useRouter()
  const {
    idea, estado, contexto, argumentos, arbol, reset, insights_exploracion,
    sessionId, setEstado, setContexto, addArgumento, setArbol, setError, setSessionId,
  } = useDebateStore()
  const { pais: paisExploracion } = useExplorarStore()

  // HU-003: panel de contexto colapsable
  const [mostrarContexto, setMostrarContexto] = useState(false)
  // HU-009: modal de encuesta
  const [mostrarEncuesta, setMostrarEncuesta] = useState(false)
  const [encuestaMostrada, setEncuestaMostrada] = useState(false)
  // Debate interactivo
  const [rondas, setRondas] = useState<{ replica: string; respuestas: typeof argumentos }[]>([])
  const [textoReplica, setTextoReplica] = useState('')
  const [enviandoReplica, setEnviandoReplica] = useState(false)
  // fase: 'debatiendo' | 'preguntando' | 'interviniendo' | 'finalizado'
  const [faseInteraccion, setFaseInteraccion] = useState<'debatiendo' | 'preguntando' | 'interviniendo' | 'finalizado'>('debatiendo')

  useEffect(() => {
    if (!idea) { router.replace('/'); return }
    if (estado !== 'idle') return
    iniciarDebate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  // Mostrar encuesta cuando el debate completa
  useEffect(() => {
    if (estado === 'completado' && sessionId && !encuestaMostrada) {
      setEncuestaMostrada(true)
      setTimeout(() => setMostrarEncuesta(true), 1200)
    }
  }, [estado, sessionId, encuestaMostrada])

  async function iniciarDebate() {
    setEstado('analizando')
    try {
      const res = await fetch(`${API}/evaluar-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_texto: idea,
          insights_exploracion: insights_exploracion ?? undefined,
          pais: paisExploracion || undefined,
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
            const parsed = JSON.parse(line.slice(6))
            const { tipo, data } = parsed
            if (tipo === 'session_id')     { setSessionId(parsed.session_id) }
            else if (tipo === 'contexto')  { setContexto(data); setEstado('buscando_web') }
            else if (tipo === 'datos_web') { setEstado('generando_perfiles') }
            else if (tipo === 'perfiles_listos') {
              setEstado('debatiendo')
            }
            else if (tipo === 'argumento') { addArgumento(data) }
            else if (tipo === 'consenso')  { setArbol(data); setEstado('consenso') }
            else if (tipo === 'fin')       { setEstado('completado'); setFaseInteraccion('preguntando') }
          } catch {}
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error inesperado'
      setError(msg)
    }
  }

  async function enviarReplica() {
    const texto = textoReplica.trim()
    if (!texto || enviandoReplica || !contexto) return
    setEnviandoReplica(true)
    setTextoReplica('')

    const nuevaRonda: { replica: string; respuestas: typeof argumentos } = {
      replica: texto,
      respuestas: [],
    }
    setRondas(prev => [...prev, nuevaRonda])
    const rondaIdx = rondas.length

    try {
      const res = await fetch(`${API}/debate/replica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_texto: idea,
          replica_usuario: texto,
          perfiles: argumentos.map(a => ({
            nombre: a.agente_nombre,
            rol: a.agente_rol,
            categoria: a.agente_categoria,
            peso: a.agente_peso,
          })),
          contexto: contexto,
          argumentos_previos: argumentos,
          session_id: sessionId,
        }),
      })
      if (!res.body) return
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
            const parsed = JSON.parse(line.slice(6))
            if (parsed.tipo === 'replica_agente') {
              setRondas(prev =>
                prev.map((r, i) =>
                  i === rondaIdx
                    ? { ...r, respuestas: [...r.respuestas, parsed.data] }
                    : r
                )
              )
            }
          } catch {}
        }
      }
    } finally {
      setEnviandoReplica(false)
      setFaseInteraccion('preguntando')
    }
  }

  // HU-007: exportar CSV
  function exportarCSV() {
    const rows = [
      ['Agente', 'Posición', 'Peso (%)', 'Argumento', 'Fuente insight'],
      ...argumentos.map(a => [
        a.agente_rol,
        a.posicion,
        ((a.agente_peso ?? 0) * 100).toFixed(0),
        a.argumento.replace(/"/g, '""'),
        a.fuente_insight ?? '',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `debate-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // HU-007: exportar PDF
  function exportarPDF() {
    window.print()
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

      {/* Modal de encuesta HU-009 */}
      {mostrarEncuesta && sessionId && (
        <EncuestaModal sessionId={sessionId} onClose={() => setMostrarEncuesta(false)} />
      )}

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10 print:hidden">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <button
            onClick={() => { reset(); router.push('/') }}
            className="text-gray-400 hover:text-white text-sm flex items-center gap-1 transition"
          >
            ← Nueva evaluación
          </button>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {insights_exploracion && (
              <span className="text-xs bg-purple-900/60 border border-purple-700 text-purple-300 px-2.5 py-1 rounded-full">
                ✓ Con insights de exploración
              </span>
            )}
            {/* HU-007: botones de exportación */}
            {estado === 'completado' && (
              <>
                <button
                  onClick={exportarCSV}
                  className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  ↓ CSV
                </button>
                <button
                  onClick={exportarPDF}
                  className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-1.5 rounded-lg transition"
                >
                  ↓ PDF
                </button>
                <button
                  onClick={() => setMostrarEncuesta(true)}
                  className="text-xs bg-blue-900/60 hover:bg-blue-800/60 border border-blue-700 text-blue-300 px-3 py-1.5 rounded-lg transition"
                >
                  ★ Valorar
                </button>
              </>
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

          {/* HU-003: Contexto colapsable */}
          {contexto && (
            <div className="mt-4">
              <button
                onClick={() => setMostrarContexto(v => !v)}
                className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition"
              >
                <span className={`transition-transform ${mostrarContexto ? 'rotate-90' : ''}`}>▶</span>
                <span>Contexto detectado — {contexto.sector} · {contexto.pais} · {contexto.modelo_negocio}</span>
              </button>

              {mostrarContexto && (
                <div className="mt-4 bg-gray-800/60 rounded-xl p-4 space-y-4">
                  {/* Datos generales */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Sector', value: contexto.sector },
                      { label: 'País', value: `${contexto.pais}${contexto.region ? ` · ${contexto.region}` : ''}` },
                      { label: 'Modelo de negocio', value: contexto.modelo_negocio },
                      { label: 'Usuarios objetivo', value: contexto.usuarios_objetivo },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-gray-900 rounded-lg p-3">
                        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                        <p className="text-sm text-gray-200 font-medium leading-snug">{value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Agentes con peso */}
                  <div>
                    <p className="text-xs text-gray-500 mb-2">Agentes del debate</p>
                    <div className="space-y-2">
                      {contexto.agentes.map(a => (
                        <div key={a.rol} className="flex items-center gap-3">
                          <div className="flex-1 flex items-center justify-between bg-gray-900 rounded-lg px-3 py-2">
                            <span className="text-sm text-gray-200">{a.rol}</span>
                            <span className="text-xs text-gray-500">{a.tipo}</span>
                          </div>
                          <div className="w-24 bg-gray-700 rounded-full h-2 overflow-hidden flex-shrink-0">
                            <div
                              className="h-2 bg-blue-500 rounded-full"
                              style={{ width: `${(a.peso * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-right flex-shrink-0">
                            {(a.peso * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Riesgos detectados */}
                  {contexto.riesgos_detectados.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-2">Riesgos detectados</p>
                      <div className="flex flex-wrap gap-2">
                        {contexto.riesgos_detectados.map((r, i) => (
                          <span key={i} className="text-xs bg-red-950/40 border border-red-800 text-red-300 px-2.5 py-1 rounded-full">
                            {r}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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
                      <span className="font-semibold text-white text-sm">{arg.agente_rol}</span>
                      {arg.agente_nombre && (
                        <span className="text-gray-500 text-xs ml-2">— {arg.agente_nombre}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-medium ${COLOR_POSICION[arg.posicion] || 'text-gray-400'}`}>
                        {ICONO_POSICION[arg.posicion] || '○'} {arg.posicion}
                      </span>
                      <span className="text-xs text-gray-600">
                        peso {((arg.agente_peso ?? 0) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-300 text-sm leading-relaxed">{arg.argumento}</p>
                  {arg.fuente_insight && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex items-start gap-2">
                      <span className="text-purple-400 text-xs flex-shrink-0 mt-0.5">📎</span>
                      <p className="text-purple-300/80 text-xs italic leading-relaxed">
                        <span className="not-italic font-medium text-purple-400">Insight de campo: </span>
                        &ldquo;{arg.fuente_insight}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              ))}

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

        {/* ── Debate interactivo: rondas de réplica ───────────────────────── */}
        {rondas.map((ronda, ri) => (
          <div key={ri} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-800" />
              <span className="text-xs text-gray-500 flex-shrink-0">Ronda {ri + 2}</span>
              <div className="flex-1 h-px bg-gray-800" />
            </div>
            {/* Réplica del usuario */}
            <div className="flex justify-end">
              <div className="max-w-[75%] bg-blue-600 rounded-2xl rounded-br-sm px-4 py-3">
                <p className="text-xs text-blue-200 mb-1 font-medium">Tú</p>
                <p className="text-white text-sm leading-relaxed">{ronda.replica}</p>
              </div>
            </div>
            {/* Respuestas de agentes */}
            {ronda.respuestas.map((resp, i) => (
              <div key={i} className={`border-l-2 rounded-xl p-4 ${COLORES_ROL[resp.agente_rol] || 'border-gray-600 bg-gray-900'}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-white text-sm font-semibold">{resp.agente_rol}</span>
                  <span className="text-xs text-gray-500">peso {((resp.agente_peso ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed">{resp.argumento}</p>
              </div>
            ))}
            {/* Spinner mientras carga esta ronda */}
            {enviandoReplica && ri === rondas.length - 1 && ronda.respuestas.length < (contexto?.agentes.length ?? 5) && (
              <div className="border-l-2 border-gray-700 bg-gray-900 rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-gray-500 text-sm">Los agentes analizan tu réplica...</span>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* ── Fase interacción post-debate ─────────────────────────────────── */}

        {/* Pregunta al usuario si desea intervenir */}
        {faseInteraccion === 'preguntando' && (
          <div className="bg-gray-900 border border-blue-800 rounded-xl p-5 space-y-3">
            <p className="text-white text-sm font-medium">El debate ha concluido. ¿Deseas intervenir con una réplica o nueva perspectiva?</p>
            <p className="text-gray-500 text-xs">Los agentes responderán directamente a tu punto de vista antes de mostrar los resultados finales.</p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setFaseInteraccion('interviniendo')}
                className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-xl transition"
              >
                Sí, quiero intervenir
              </button>
              <button
                onClick={() => setFaseInteraccion('finalizado')}
                className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium py-2.5 rounded-xl transition"
              >
                No, ver resultados
              </button>
            </div>
          </div>
        )}

        {/* Input de réplica */}
        {faseInteraccion === 'interviniendo' && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 space-y-3">
            <p className="text-sm text-gray-300 font-medium">Tu réplica</p>
            <div className="flex gap-2">
              <textarea
                value={textoReplica}
                onChange={e => setTextoReplica(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarReplica() } }}
                disabled={enviandoReplica}
                autoFocus
                placeholder="Ej: ¿Qué pasa si el primer mes es gratuito? ¿Cambia la viabilidad del modelo?"
                rows={3}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-600 transition disabled:opacity-50"
              />
              <button
                onClick={enviarReplica}
                disabled={!textoReplica.trim() || enviandoReplica}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 rounded-xl transition text-sm font-medium self-end py-2.5"
              >
                {enviandoReplica ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </span>
                ) : '→'}
              </button>
            </div>
          </div>
        )}

        {/* Separador y árbol — solo cuando el usuario eligió finalizar */}
        {faseInteraccion === 'finalizado' && arbol && (
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-800" />
            <span className="text-xs text-gray-500">Resultados finales</span>
            <div className="flex-1 h-px bg-gray-800" />
          </div>
        )}

        {/* Árbol de argumentos — solo visible tras finalizar */}
        {faseInteraccion === 'finalizado' && arbol && (
          <div className="space-y-5">
            <h2 className="text-lg font-semibold text-white">Árbol de argumentos</h2>

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

            <div className="grid md:grid-cols-2 gap-4">
              {arbol.acuerdos.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-green-400 mb-3">
                    ✓ Puntos de acuerdo ({arbol.acuerdos.length})
                  </h3>
                  <ul className="space-y-2">
                    {arbol.acuerdos.map((a, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-green-500 mr-1.5">·</span>{a.punto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {arbol.divergencias.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-red-400 mb-3">
                    ✗ Puntos de divergencia ({arbol.divergencias.length})
                  </h3>
                  <ul className="space-y-2">
                    {arbol.divergencias.map((d, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-red-500 mr-1.5">·</span>{d.punto}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {arbol.fortalezas_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-blue-400 mb-3">↑ Fortalezas de la idea</h3>
                  <ul className="space-y-2">
                    {arbol.fortalezas_idea.map((f, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-blue-500 mr-1.5">·</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {arbol.debilidades_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-orange-400 mb-3">↓ Debilidades de la idea</h3>
                  <ul className="space-y-2">
                    {arbol.debilidades_idea.map((d, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        <span className="text-orange-500 mr-1.5">·</span>{d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {arbol.condiciones.length > 0 && (
              <div className="bg-yellow-950/30 border border-yellow-800 rounded-xl p-5">
                <h3 className="text-sm font-semibold text-yellow-400 mb-3">⚠ Condiciones para viabilidad</h3>
                <ul className="space-y-2">
                  {arbol.condiciones.map((c, i) => (
                    <li key={i} className="text-sm text-yellow-200 flex gap-2">
                      <span className="text-yellow-500 flex-shrink-0">{i + 1}.</span>{c}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-3 pt-4 print:hidden">
              {sessionId && (
                <button
                  onClick={() => setMostrarEncuesta(true)}
                  className="border border-blue-700 text-blue-300 hover:bg-blue-900/30 font-semibold px-6 py-3 rounded-xl transition text-sm"
                >
                  ★ Valorar debate
                </button>
              )}
              <button
                onClick={() => { reset(); router.push('/') }}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl transition text-sm"
              >
                Evaluar otra idea →
              </button>
            </div>
          </div>
        )}

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
