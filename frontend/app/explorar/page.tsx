'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useExplorarStore, type PerfilSintetico, type Stakeholder, type InsightsJTBD } from '@/store/useExplorarStore'
import { useSupuestosStore, type Supuesto } from '@/store/useSupuestosStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

const COLOR_RELEVANCIA: Record<string, string> = {
  alta:  'bg-green-900/40 border-green-700 text-green-300',
  media: 'bg-yellow-900/40 border-yellow-700 text-yellow-300',
  baja:  'bg-gray-800 border-gray-700 text-gray-400',
}

const COLOR_TIPO: Record<string, string> = {
  usuario_final: 'text-blue-400',
  decisor:       'text-purple-400',
  influenciador: 'text-pink-400',
  aliado:        'text-cyan-400',
  regulador:     'text-orange-400',
}


const COLOR_RIESGO: Record<string, string> = {
  alto:  'bg-red-900/40 border-red-800 text-red-400',
  medio: 'bg-yellow-900/40 border-yellow-800 text-yellow-400',
  bajo:  'bg-gray-800 border-gray-700 text-gray-500',
}

const COLOR_VEREDICTO_ICON: Record<string, string> = {
  validado: 'text-green-400',
  parcial:  'text-yellow-400',
  refutado: 'text-red-400',
}

// ─── Panel supuestos interactivo ──────────────────────────────────────────────
function SupuestosPanel({ idea }: { idea: string }) {
  const {
    supuestos, cargando, error, activosIds, evidencia,
    setSupuestos, setCargando, setError, toggleActivo, editarEnunciado,
  } = useSupuestosStore()

  const [expandido, setExpandido] = useState(true)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [textoEdit, setTextoEdit] = useState('')

  // Generar supuestos en background al montar
  useEffect(() => {
    if (supuestos.length > 0 || cargando) return
    setCargando(true)
    setError(null)
    fetch(`${API}/supuestos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_texto: idea }),
    })
      .then(r => r.json())
      .then(d => setSupuestos(d.supuestos ?? [], d.razonamiento ?? ''))
      .catch(() => setError('No se pudieron generar supuestos'))
      .finally(() => setCargando(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  function iniciarEdicion(sup: Supuesto) {
    setEditandoId(sup.id)
    setTextoEdit(sup.enunciado)
  }

  function guardarEdicion(id: string) {
    if (textoEdit.trim()) editarEnunciado(id, textoEdit.trim())
    setEditandoId(null)
  }

  const totalActivos = activosIds.length
  const totalEvidencia = Object.values(evidencia).reduce(
    (acc, e) => acc + e.validado + e.parcial + e.refutado, 0
  )

  return (
    <div className="mt-4 pt-4 border-t border-gray-800">
      {/* Header del panel */}
      <button
        onClick={() => setExpandido(v => !v)}
        className="w-full flex items-center justify-between px-1 mb-2 group"
      >
        <div className="flex items-center gap-2">
          <span className={`text-gray-600 text-xs transition-transform ${expandido ? 'rotate-90' : ''}`}>▶</span>
          <p className="text-xs text-gray-500 uppercase tracking-wider">Supuestos</p>
          {cargando && (
            <span className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {totalEvidencia > 0 && (
            <span className="text-xs bg-green-900/40 border border-green-800 text-green-400 px-1.5 py-0.5 rounded-full">
              {totalEvidencia} resp.
            </span>
          )}
          <span className="text-xs text-gray-600">{totalActivos}/{supuestos.length}</span>
        </div>
      </button>

      {!expandido ? null : error ? (
        <p className="text-xs text-red-400 px-1">{error}</p>
      ) : cargando && supuestos.length === 0 ? (
        <div className="px-1 py-3 text-center">
          <p className="text-xs text-gray-600">Analizando supuestos de tu modelo...</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {supuestos.map(sup => {
            const activo = activosIds.includes(sup.id)
            const ev = evidencia[sup.id]
            const hayEvidencia = ev && (ev.validado + ev.parcial + ev.refutado) > 0
            const editando = editandoId === sup.id

            return (
              <div
                key={sup.id}
                className={`rounded-lg border transition-all ${
                  activo
                    ? 'bg-blue-950/30 border-blue-800/60'
                    : 'bg-gray-900/40 border-gray-800/60 opacity-50'
                }`}
              >
                <div className="flex items-start gap-2 p-2">
                  {/* Toggle */}
                  <button
                    onClick={() => toggleActivo(sup.id)}
                    className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 border transition-all ${
                      activo
                        ? 'bg-blue-600 border-blue-500'
                        : 'bg-gray-800 border-gray-600 hover:border-gray-400'
                    }`}
                    title={activo ? 'Desactivar' : 'Activar'}
                  >
                    {activo && (
                      <svg viewBox="0 0 10 8" className="w-full h-full p-0.5" fill="none" stroke="white" strokeWidth="2">
                        <path d="M1 4l3 3 5-6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    {/* Badge de riesgo */}
                    <div className="flex items-center gap-1 mb-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border leading-none ${COLOR_RIESGO[sup.nivel_riesgo]}`}>
                        {sup.nivel_riesgo}
                      </span>
                      <span className="text-xs text-gray-600">{sup.tipo}</span>
                    </div>

                    {/* Enunciado editable — texto completo visible */}
                    {editando ? (
                      <div className="flex gap-1">
                        <textarea
                          autoFocus
                          value={textoEdit}
                          rows={3}
                          onChange={e => setTextoEdit(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); guardarEdicion(sup.id) } if (e.key === 'Escape') setEditandoId(null) }}
                          className="flex-1 bg-gray-800 border border-blue-600 rounded px-1.5 py-1 text-xs text-white focus:outline-none min-w-0 resize-none"
                        />
                        <div className="flex flex-col gap-1">
                          <button onClick={() => guardarEdicion(sup.id)} className="text-green-400 text-xs px-1 hover:text-green-300">✓</button>
                          <button onClick={() => setEditandoId(null)} className="text-gray-500 text-xs px-1 hover:text-gray-300">✕</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => iniciarEdicion(sup)}
                        className="text-left w-full"
                        title="Clic para editar"
                      >
                        <p className="text-gray-300 text-xs leading-relaxed hover:text-white transition-colors">
                          {sup.enunciado}
                        </p>
                      </button>
                    )}

                    {/* Evidencia acumulada */}
                    {hayEvidencia && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {ev.validado > 0 && (
                          <span className="text-xs text-green-400">✓{ev.validado}</span>
                        )}
                        {ev.parcial > 0 && (
                          <span className="text-xs text-yellow-400">◐{ev.parcial}</span>
                        )}
                        {ev.refutado > 0 && (
                          <span className="text-xs text-red-400">✗{ev.refutado}</span>
                        )}
                        <span className="text-gray-700 text-xs">perfiles</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Panel izquierdo: lista de stakeholders ───────────────────────────────────
function StakeholderCard({ sk, activo, onClick }: { sk: Stakeholder; activo: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        activo ? 'bg-blue-950 border-blue-600' : 'bg-gray-900 border-gray-800 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white font-medium text-sm truncate">{sk.nombre}</p>
          <p className={`text-xs mt-0.5 ${COLOR_TIPO[sk.tipo] ?? 'text-gray-400'}`}>
            {sk.tipo.replace('_', ' ')}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${COLOR_RELEVANCIA[sk.relevancia]}`}>
          {sk.relevancia}
        </span>
      </div>
      <p className="text-gray-400 text-xs mt-2 leading-relaxed line-clamp-2">{sk.descripcion}</p>
    </button>
  )
}

// ─── Panel central: perfiles de un stakeholder ───────────────────────────────
function PerfilesPanel({
  stakeholder, idea, sector, pais, perfilActivoIdx, onSelectPerfil,
}: {
  stakeholder: Stakeholder; idea: string; sector: string; pais: string
  perfilActivoIdx: number | null; onSelectPerfil: (idx: number) => void
}) {
  const { perfilesPor, cargandoPerfilesPor, setPerfilesPor, appendPerfilesPor,
          setCargandoPerfilesPor, patronesPor, cargandoPatronesPor, setPatronesPor,
          setCargandoPatronesPor, historialPor, insightsPor } = useExplorarStore()

  const perfiles = perfilesPor[stakeholder.id] ?? []
  const cargando = cargandoPerfilesPor[stakeholder.id] ?? false
  const patrones = patronesPor[stakeholder.id]
  const cargandoPatrones = cargandoPatronesPor[stakeholder.id] ?? false

  const insightsDisponibles = perfiles
    .map((_, idx) => insightsPor[`${stakeholder.id}::${idx}`])
    .filter(Boolean)

  const [generandoMas, setGenerandoMas] = useState(false)
  const [errorMas, setErrorMas] = useState<string | null>(null)

  useEffect(() => {
    if (perfiles.length > 0 || cargando) return
    setCargandoPerfilesPor(stakeholder.id, true)
    fetch(`${API}/explorar/perfiles-stakeholder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idea_texto: idea, stakeholder, sector, pais, cantidad: 4 }),
    })
      .then(r => r.json())
      .then(d => setPerfilesPor(stakeholder.id, d.perfiles))
      .catch(() => {})
      .finally(() => setCargandoPerfilesPor(stakeholder.id, false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakeholder.id])

  async function generarMasPerfiles() {
    setGenerandoMas(true); setErrorMas(null)
    try {
      const res = await fetch(`${API}/explorar/perfiles-stakeholder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea, stakeholder, sector, pais, cantidad: 2 }),
      })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      if (!data.perfiles?.length) throw new Error('Sin perfiles')
      appendPerfilesPor(stakeholder.id, data.perfiles)
    } catch (e: unknown) {
      setErrorMas(e instanceof Error ? e.message : 'Error')
    } finally {
      setGenerandoMas(false)
    }
  }

  async function detectarPatrones() {
    if (insightsDisponibles.length < 2) return
    setCargandoPatronesPor(stakeholder.id, true)
    try {
      const res = await fetch(`${API}/explorar/patrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholder_id: stakeholder.id, stakeholder_nombre: stakeholder.nombre,
          idea_texto: idea, insights_por_perfil: insightsDisponibles,
        }),
      })
      const data = await res.json()
      setPatronesPor(stakeholder.id, data)
    } finally {
      setCargandoPatronesPor(stakeholder.id, false)
    }
  }

  // Contador animado mientras se generan perfiles
  const [contadorAnim, setContadorAnim] = useState(0)
  useEffect(() => {
    if (!cargando) { setContadorAnim(0); return }
    const cantidad = 4
    let i = 0
    const iv = setInterval(() => {
      i += 1
      setContadorAnim(Math.min(i, cantidad - 1))
      if (i >= cantidad - 1) clearInterval(iv)
    }, 1800)
    return () => clearInterval(iv)
  }, [cargando])

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="relative w-12 h-12">
          <div className="w-12 h-12 border-2 border-blue-800 rounded-full" />
          <div className="absolute inset-0 w-12 h-12 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-white text-sm font-medium">
            Generando perfil {contadorAnim + 1} de 4
          </p>
          <p className="text-gray-500 text-xs mt-1">
            Construyendo {stakeholder.nombre.toLowerCase()}...
          </p>
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all duration-500 ${
                i <= contadorAnim ? 'bg-blue-500' : 'bg-gray-700'
              }`}
            />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-white font-semibold text-base">{stakeholder.nombre}</h2>
          <p className="text-gray-400 text-xs mt-0.5">{perfiles.length} perfiles generados</p>
        </div>
        <div className="flex items-center gap-2">
          {perfiles.length > 0 && (
            <button onClick={generarMasPerfiles} disabled={generandoMas}
              className="flex items-center gap-2 text-xs text-gray-400 hover:text-white border border-dashed border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition disabled:opacity-60">
              {generandoMas ? (
                <>
                  <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  Generando 2 perfiles...
                </>
              ) : (
                '+ Más perfiles'
              )}
            </button>
          )}
          {insightsDisponibles.length >= 2 && !patrones && (
            <button onClick={detectarPatrones} disabled={cargandoPatrones}
              className="text-xs bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-purple-200 px-3 py-1.5 rounded-lg transition">
              {cargandoPatrones ? 'Analizando...' : 'Detectar patrones'}
            </button>
          )}
        </div>
      </div>

      {errorMas && (
        <p className="text-red-400 text-xs bg-red-950/40 border border-red-800 rounded-lg px-3 py-2">⚠ {errorMas}</p>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Preguntas sugeridas</p>
        <ul className="space-y-1.5">
          {stakeholder.preguntas_clave.map((q, i) => (
            <li key={i} className="text-gray-300 text-xs flex gap-2">
              <span className="text-blue-500 flex-shrink-0">{i + 1}.</span>{q}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        {perfiles.map((perfil, idx) => {
          const convKey = `${stakeholder.id}::${idx}`
          const tieneInsights = !!insightsPor[convKey]
          const mensajes = historialPor[convKey] ?? []
          const seleccionado = perfilActivoIdx === idx
          return (
            <button key={idx} onClick={() => onSelectPerfil(idx)}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
                seleccionado ? 'bg-blue-950 border-blue-600' : 'bg-gray-900 border-gray-800 hover:border-gray-600'
              }`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-medium text-sm">{perfil.nombre}</p>
                  <p className="text-gray-400 text-xs">{perfil.edad} años · {perfil.ocupacion}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {tieneInsights && (
                    <span className="text-xs bg-green-900/50 border border-green-700 text-green-300 px-2 py-0.5 rounded-full">insights ✓</span>
                  )}
                  {mensajes.length > 0 && (
                    <span className="text-xs text-gray-500">{Math.floor(mensajes.length / 2)} preguntas</span>
                  )}
                </div>
              </div>
              <p className="text-blue-300 text-xs mt-2 italic">"{perfil.variante_descripcion}"</p>
            </button>
          )
        })}
      </div>

      {patrones && (
        <div className="bg-purple-950/30 border border-purple-800 rounded-xl p-5 space-y-4">
          <h3 className="text-purple-300 font-semibold text-sm">Patrones del segmento</h3>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">Job principal</p>
            <p className="text-white text-sm leading-relaxed">{patrones.job_principal}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-green-400 mb-1">Patrones comunes</p>
              <ul className="space-y-1">{patrones.patrones_comunes.map((p, i) => <li key={i} className="text-gray-300 text-xs">· {p}</li>)}</ul>
            </div>
            <div>
              <p className="text-xs text-red-400 mb-1">Fricciones críticas</p>
              <ul className="space-y-1">{patrones.fricciones_criticas.map((f, i) => <li key={i} className="text-gray-300 text-xs">· {f}</li>)}</ul>
            </div>
          </div>
          <div>
            <p className="text-xs text-yellow-400 mb-1">Oportunidad clave</p>
            <p className="text-gray-200 text-sm">{patrones.oportunidad_clave}</p>
          </div>
          {patrones.segmentos_identificados.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sub-segmentos</p>
              <div className="space-y-2">
                {patrones.segmentos_identificados.map((seg, i) => (
                  <div key={i} className="bg-gray-900/60 rounded-lg p-3">
                    <p className="text-white text-xs font-medium">{seg.nombre}</p>
                    <p className="text-gray-400 text-xs mt-0.5">{seg.descripcion}</p>
                    <p className="text-purple-300 text-xs mt-1 italic">Job: {seg.job_especifico}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Panel derecho: conversación ─────────────────────────────────────────────
function ConversacionPanel({ perfil, convKey, idea }: { perfil: PerfilSintetico; convKey: string; idea: string }) {
  const { historialPor, insightsPor, addMensaje, setInsights, setRespondiendo, respondiendo } = useExplorarStore()
  const { supuestos, activosIds, registrarEvidencia } = useSupuestosStore()

  const historial = historialPor[convKey] ?? []
  const insights  = insightsPor[convKey]
  const [pregunta, setPregunta] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // Supuestos activos filtrados
  const supuestosActivos = supuestos.filter(s => activosIds.includes(s.id))

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [historial.length])

  async function enviar() {
    const texto = pregunta.trim()
    if (!texto || respondiendo) return
    setPregunta('')
    addMensaje(convKey, { rol: 'emprendedor', contenido: texto })
    setRespondiendo(true)

    try {
      const res = await fetch(`${API}/explorar/conversar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil,
          idea_texto: idea,
          historial: [...historial, { rol: 'emprendedor', contenido: texto }],
          pregunta: texto,
          // Pasar solo campos esenciales de supuestos activos para no inflar el payload
          supuestos_activos: supuestosActivos.length > 0
            ? supuestosActivos.map(s => ({ id: s.id, enunciado: s.enunciado }))
            : null,
        }),
      })
      const data = await res.json()
      addMensaje(convKey, { rol: 'perfil', contenido: data.respuesta })
      if (data.insights_jtbd) setInsights(convKey, data.insights_jtbd)
      // Registrar evidencia de supuestos evaluados en esta respuesta
      if (data.supuestos_evaluados?.length) {
        for (const ev of data.supuestos_evaluados) {
          registrarEvidencia(ev.supuesto_id, ev.veredicto)
        }
      }
    } catch {
      addMensaje(convKey, { rol: 'perfil', contenido: '(Error al conectar con el servidor)' })
    } finally {
      setRespondiendo(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabecera */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4 flex-shrink-0">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            {perfil.nombre.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm">{perfil.nombre}</p>
            <p className="text-gray-400 text-xs">{perfil.edad} años · {perfil.ocupacion} · {perfil.ubicacion}</p>
            <p className="text-blue-300 text-xs mt-1 italic">"{perfil.variante_descripcion}"</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-gray-500 mb-0.5">Job funcional</p>
            <p className="text-gray-200 line-clamp-2">{perfil.job_funcional}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-gray-500 mb-0.5">Job emocional</p>
            <p className="text-gray-200 line-clamp-2">{perfil.job_emocional}</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-2">
            <p className="text-gray-500 mb-0.5">Job social</p>
            <p className="text-gray-200 line-clamp-2">{perfil.job_social}</p>
          </div>
        </div>

        {/* Supuestos activos — indicador en la cabecera del perfil */}
        {supuestosActivos.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500">Explorando:</span>
            {supuestosActivos.slice(0, 3).map(s => (
              <span key={s.id} className="text-xs bg-blue-950/50 border border-blue-800/50 text-blue-300 px-2 py-0.5 rounded-full truncate max-w-[140px]">
                {s.enunciado.slice(0, 35)}{s.enunciado.length > 35 ? '…' : ''}
              </span>
            ))}
            {supuestosActivos.length > 3 && (
              <span className="text-xs text-gray-500">+{supuestosActivos.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {historial.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">Inicia la conversación con {perfil.nombre.split(' ')[0]}</p>
            {supuestosActivos.length > 0 && (
              <p className="text-gray-600 text-xs mt-2 max-w-xs mx-auto leading-relaxed">
                Los supuestos activos guiarán naturalmente las respuestas del perfil
              </p>
            )}
          </div>
        )}

        {historial.map((msg, i) => (
          <div key={i} className={`flex ${msg.rol === 'emprendedor' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              msg.rol === 'emprendedor'
                ? 'bg-blue-600 text-white rounded-br-sm'
                : 'bg-gray-800 text-gray-200 rounded-bl-sm'
            }`}>
              {msg.rol === 'perfil' && (
                <p className="text-gray-500 text-xs mb-1 font-medium">{perfil.nombre.split(' ')[0]}</p>
              )}
              {msg.contenido}
            </div>
          </div>
        ))}

        {respondiendo && (
          <div className="flex justify-start">
            <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Insights JTBD */}
      {insights && (
        <div className="bg-green-950/30 border border-green-800 rounded-xl p-4 mb-4 flex-shrink-0">
          <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">Insights JTBD detectados</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-500 mb-0.5">Job funcional</p>
              <p className="text-gray-200">{insights.job_funcional}</p>
            </div>
            <div>
              <p className="text-gray-500 mb-0.5">Resultado deseado</p>
              <p className="text-gray-200">{insights.resultado_deseado}</p>
            </div>
            <div className="col-span-2">
              <p className="text-gray-500 mb-0.5">Cita clave</p>
              <p className="text-yellow-200 italic">"{insights.cita_clave}"</p>
            </div>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex-shrink-0 flex gap-2">
        <textarea
          value={pregunta}
          onChange={e => setPregunta(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={respondiendo}
          placeholder="Pregunta algo... (Enter para enviar)"
          rows={2}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-600 transition disabled:opacity-50"
        />
        <button onClick={enviar} disabled={!pregunta.trim() || respondiendo}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 rounded-xl transition text-sm font-medium">
          →
        </button>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function ExplorarPage() {
  const router = useRouter()
  const {
    idea, sector, pais,
    stakeholders: _stakeholders, cargandoStakeholders,
    stakeholderActivo, perfilActivoIdx,
    perfilesPor, historialPor, insightsPor,
    errorStakeholders, cargandoSintesis, errorSintesis,
    setStakeholders, setCargandoStakeholders,
    setStakeholderActivo, setPerfilActivoIdx,
    setErrorStakeholders, setSintesis, setCargandoSintesis, setErrorSintesis,
  } = useExplorarStore()

  const { supuestos, activosIds } = useSupuestosStore()
  const stakeholders = _stakeholders ?? []

  useEffect(() => {
    if (!idea) router.replace('/')
  }, [idea, router])

  async function cargarStakeholders() {
    if (!idea) return
    setCargandoStakeholders(true); setErrorStakeholders(null)
    try {
      const res = await fetch(`${API}/explorar/stakeholders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea }),
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      const data = await res.json()
      if (!data.stakeholders?.length) throw new Error('No se detectaron stakeholders')
      setStakeholders(data.stakeholders)
      useExplorarStore.getState().setIdea(idea, data.sector ?? '', data.pais ?? '')
      setStakeholderActivo(data.stakeholders[0].id)
    } catch (e: unknown) {
      setErrorStakeholders(e instanceof Error ? e.message : 'Error al conectar con el backend')
    } finally {
      setCargandoStakeholders(false)
    }
  }

  useEffect(() => {
    if (!idea || stakeholders.length > 0 || cargandoStakeholders) return
    cargarStakeholders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  async function finalizarExploracion() {
    if (!idea) return
    setCargandoSintesis(true); setErrorSintesis(null)

    const histSeg  = useExplorarStore.getState().historialPor  ?? {}
    const insSeg   = useExplorarStore.getState().insightsPor   ?? {}
    const perfSeg  = useExplorarStore.getState().perfilesPor   ?? {}
    const sks      = useExplorarStore.getState().stakeholders  ?? []

    const conversaciones = sks.map(sk => {
      const perfiles = perfSeg[sk.id] ?? []
      const perfilesConversados = perfiles
        .map((p, idx) => {
          const key = `${sk.id}::${idx}`
          const historial = histSeg[key] ?? []
          if (historial.length === 0) return null
          return { nombre: p.nombre, variante_descripcion: p.variante_descripcion ?? '',
                   ocupacion: p.ocupacion, historial, insights_jtbd: insSeg[key] ?? null }
        })
        .filter(Boolean)
      if (perfilesConversados.length === 0) return null
      return { stakeholder_id: sk.id, stakeholder_nombre: sk.nombre, perfiles: perfilesConversados }
    }).filter(Boolean)

    if (conversaciones.length === 0) {
      setErrorSintesis('Habla con al menos un perfil antes de finalizar.')
      setCargandoSintesis(false); return
    }

    // Pasar supuestos activos (con enunciado completo) para evaluación en síntesis
    const supuestosParaSintesis = supuestos.filter(s => activosIds.includes(s.id))

    try {
      const res = await fetch(`${API}/sintetizar-exploracion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_texto: idea,
          conversaciones,
          ...(supuestosParaSintesis.length > 0 && { supuestos: supuestosParaSintesis }),
        }),
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      const data = await res.json()
      setSintesis(data)
      router.push('/sintesis')
    } catch (e: unknown) {
      setErrorSintesis(e instanceof Error ? e.message : 'Error al sintetizar')
    } finally {
      setCargandoSintesis(false)
    }
  }

  const MINIMO_INSIGHTS_TOTAL = 4
  const MINIMO_STAKEHOLDERS   = 2

  const insightsPorSegmento = stakeholders.map(sk => {
    const perfiles = perfilesPor[sk.id] ?? []
    const conInsights = perfiles.filter((_, idx) => !!insightsPor[`${sk.id}::${idx}`]).length
    return { id: sk.id, nombre: sk.nombre, conInsights }
  })

  const totalInsightosCompletos = insightsPorSegmento.reduce((s, x) => s + x.conInsights, 0)
  const segmentosConDosInsights = insightsPorSegmento.filter(x => x.conInsights >= 2).length
  const puedeFinalizarExploracion = totalInsightosCompletos >= MINIMO_INSIGHTS_TOTAL &&
                                    segmentosConDosInsights >= MINIMO_STAKEHOLDERS

  const skActivo = stakeholders.find(s => s.id === stakeholderActivo) ?? null
  const perfilesActivos = skActivo ? (perfilesPor[skActivo.id] ?? []) : []
  const perfilSeleccionado = perfilActivoIdx !== null ? perfilesActivos[perfilActivoIdx] : null
  const convKey = skActivo && perfilActivoIdx !== null ? `${skActivo.id}::${perfilActivoIdx}` : null

  return (
    <main className="h-[calc(100vh-120px)] flex flex-col">

      {/* Barra superior */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm transition">
          ← Cambiar idea
        </button>
        <div className="flex-1 mx-6 max-w-lg">
          <p className="text-gray-400 text-xs text-center truncate">{idea}</p>
        </div>
        <div className="flex items-center gap-3">
          {stakeholders.length > 0 && !cargandoSintesis && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {Array.from({ length: MINIMO_INSIGHTS_TOTAL }).map((_, i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${i < totalInsightosCompletos ? 'bg-green-400' : 'bg-gray-700'}`} />
                  ))}
                </div>
                <span className="text-xs text-gray-500">{totalInsightosCompletos}/{MINIMO_INSIGHTS_TOTAL} perfiles</span>
              </div>
              <span className="text-gray-700">·</span>
              <div className="flex items-center gap-1.5">
                <div className="flex gap-0.5">
                  {Array.from({ length: MINIMO_STAKEHOLDERS }).map((_, i) => (
                    <span key={i} className={`w-2 h-2 rounded-full ${i < segmentosConDosInsights ? 'bg-blue-400' : 'bg-gray-700'}`} />
                  ))}
                </div>
                <span className="text-xs text-gray-500">{segmentosConDosInsights}/{MINIMO_STAKEHOLDERS} segmentos</span>
              </div>
            </div>
          )}
          <button
            onClick={finalizarExploracion}
            disabled={!puedeFinalizarExploracion || cargandoSintesis}
            className="text-xs bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition font-medium"
          >
            {cargandoSintesis ? 'Sintetizando...' : 'Finalizar exploración →'}
          </button>
        </div>
      </div>

      {errorSintesis && (
        <div className="bg-red-950/60 border-b border-red-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <p className="text-red-400 text-xs">⚠ {errorSintesis}</p>
          <button onClick={() => setErrorSintesis(null)} className="text-red-500 hover:text-red-300 text-xs ml-4">✕</button>
        </div>
      )}

      {/* Layout 3 paneles */}
      <div className="flex flex-1 overflow-hidden">

        {/* Panel izquierdo — Stakeholders + Supuestos */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-3 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider px-1 mb-3">Stakeholders</p>

          {cargandoStakeholders && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-xs text-center">Identificando con quiénes hablar...</p>
            </div>
          )}

          {errorStakeholders && !cargandoStakeholders && (
            <div className="mx-1 mt-2 bg-red-950/50 border border-red-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-red-400 text-xs leading-relaxed">⚠ {errorStakeholders}</p>
              <button onClick={cargarStakeholders}
                className="w-full bg-red-900 hover:bg-red-800 text-red-200 text-xs py-2 rounded-lg transition">
                Reintentar
              </button>
            </div>
          )}

          {stakeholders.map(sk => (
            <StakeholderCard key={sk.id} sk={sk} activo={stakeholderActivo === sk.id}
              onClick={() => { setStakeholderActivo(sk.id); setPerfilActivoIdx(null) }} />
          ))}

          {/* Panel de supuestos interactivo */}
          {idea && <SupuestosPanel idea={idea} />}
        </div>

        {/* Panel central — Perfiles */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4">
          {skActivo ? (
            <PerfilesPanel stakeholder={skActivo} idea={idea} sector={sector} pais={pais}
              perfilActivoIdx={perfilActivoIdx} onSelectPerfil={idx => setPerfilActivoIdx(idx)} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-sm text-center">Selecciona un stakeholder<br />para ver sus perfiles</p>
            </div>
          )}
        </div>

        {/* Panel derecho — Conversación */}
        <div className="flex-1 overflow-hidden p-4">
          {perfilSeleccionado && convKey ? (
            <ConversacionPanel perfil={perfilSeleccionado} convKey={convKey} idea={idea} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">💬</div>
              <p className="text-gray-400 text-sm text-center">Selecciona un perfil para iniciar<br />la entrevista de exploración</p>
              <p className="text-gray-600 text-xs text-center max-w-xs">
                Entrevista al menos 2 perfiles por segmento (4+ mensajes c/u)<br />cubriendo 2 segmentos distintos para sintetizar
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
