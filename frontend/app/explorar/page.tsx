'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useExplorarStore, type PerfilSintetico, type Stakeholder, type InsightsJTBD } from '@/store/useExplorarStore'

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

// ─── Panel izquierdo: lista de stakeholders ───────────────────────────────────
function StakeholderCard({
  sk,
  activo,
  onClick,
}: {
  sk: Stakeholder
  activo: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
        activo
          ? 'bg-blue-950 border-blue-600'
          : 'bg-gray-900 border-gray-800 hover:border-gray-600'
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
  stakeholder,
  idea,
  sector,
  pais,
  perfilActivoIdx,
  onSelectPerfil,
}: {
  stakeholder: Stakeholder
  idea: string
  sector: string
  pais: string
  perfilActivoIdx: number | null
  onSelectPerfil: (idx: number) => void
}) {
  const { perfilesPor, cargandoPerfilesPor, setPerfilesPor, setCargandoPerfilesPor,
          patronesPor, cargandoPatronesPor, setPatronesPor, setCargandoPatronesPor,
          historialPor, insightsPor } = useExplorarStore()

  const perfiles = perfilesPor[stakeholder.id] ?? []
  const cargando = cargandoPerfilesPor[stakeholder.id] ?? false
  const patrones = patronesPor[stakeholder.id]
  const cargandoPatrones = cargandoPatronesPor[stakeholder.id] ?? false

  // Cuántos perfiles tienen insights completos
  const insightsDisponibles = perfiles
    .map((_, idx) => insightsPor[`${stakeholder.id}::${idx}`])
    .filter(Boolean)

  useEffect(() => {
    if (perfiles.length > 0 || cargando) return

    async function cargar() {
      setCargandoPerfilesPor(stakeholder.id, true)
      try {
        const res = await fetch(`${API}/explorar/perfiles-stakeholder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idea_texto: idea,
            stakeholder: stakeholder,
            sector,
            pais,
            cantidad: 4,
          }),
        })
        const data = await res.json()
        setPerfilesPor(stakeholder.id, data.perfiles)
      } catch {
        // silencioso — el usuario puede reintentar cambiando de stakeholder
      } finally {
        setCargandoPerfilesPor(stakeholder.id, false)
      }
    }

    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakeholder.id])

  async function detectarPatrones() {
    if (insightsDisponibles.length < 2) return
    setCargandoPatronesPor(stakeholder.id, true)
    try {
      const res = await fetch(`${API}/explorar/patrones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stakeholder_id: stakeholder.id,
          stakeholder_nombre: stakeholder.nombre,
          idea_texto: idea,
          insights_por_perfil: insightsDisponibles,
        }),
      })
      const data = await res.json()
      setPatronesPor(stakeholder.id, data)
    } finally {
      setCargandoPatronesPor(stakeholder.id, false)
    }
  }

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm">Generando perfiles para {stakeholder.nombre}...</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-base">{stakeholder.nombre}</h2>
          <p className="text-gray-400 text-xs mt-0.5">{perfiles.length} perfiles generados</p>
        </div>
        {insightsDisponibles.length >= 2 && !patrones && (
          <button
            onClick={detectarPatrones}
            disabled={cargandoPatrones}
            className="text-xs bg-purple-800 hover:bg-purple-700 disabled:opacity-50 text-purple-200 px-3 py-1.5 rounded-lg transition"
          >
            {cargandoPatrones ? 'Analizando...' : 'Detectar patrones'}
          </button>
        )}
      </div>

      {/* Preguntas sugeridas */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Preguntas sugeridas</p>
        <ul className="space-y-1.5">
          {stakeholder.preguntas_clave.map((q, i) => (
            <li key={i} className="text-gray-300 text-xs flex gap-2">
              <span className="text-blue-500 flex-shrink-0">{i + 1}.</span>
              {q}
            </li>
          ))}
        </ul>
      </div>

      {/* Tarjetas de perfiles */}
      <div className="space-y-3">
        {perfiles.map((perfil, idx) => {
          const convKey = `${stakeholder.id}::${idx}`
          const tieneInsights = !!insightsPor[convKey]
          const mensajes = historialPor[convKey] ?? []
          const seleccionado = perfilActivoIdx === idx

          return (
            <button
              key={idx}
              onClick={() => onSelectPerfil(idx)}
              className={`w-full text-left rounded-xl border p-4 transition-all duration-200 ${
                seleccionado
                  ? 'bg-blue-950 border-blue-600'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-white font-medium text-sm">{perfil.nombre}</p>
                  <p className="text-gray-400 text-xs">{perfil.edad} años · {perfil.ocupacion}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {tieneInsights && (
                    <span className="text-xs bg-green-900/50 border border-green-700 text-green-300 px-2 py-0.5 rounded-full">
                      insights ✓
                    </span>
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

      {/* Patrones detectados */}
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
              <ul className="space-y-1">
                {patrones.patrones_comunes.map((p, i) => (
                  <li key={i} className="text-gray-300 text-xs">· {p}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-red-400 mb-1">Fricciones críticas</p>
              <ul className="space-y-1">
                {patrones.fricciones_criticas.map((f, i) => (
                  <li key={i} className="text-gray-300 text-xs">· {f}</li>
                ))}
              </ul>
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

// ─── Panel derecho: conversación con un perfil ────────────────────────────────
function ConversacionPanel({
  perfil,
  convKey,
  idea,
}: {
  perfil: PerfilSintetico
  convKey: string
  idea: string
}) {
  const { historialPor, insightsPor, addMensaje, setInsights, setRespondiendo, respondiendo } =
    useExplorarStore()

  const historial = historialPor[convKey] ?? []
  const insights  = insightsPor[convKey]
  const [pregunta, setPregunta] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

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
        }),
      })
      const data = await res.json()
      addMensaje(convKey, { rol: 'perfil', contenido: data.respuesta })
      if (data.insights_jtbd) {
        setInsights(convKey, data.insights_jtbd)
      }
    } catch {
      addMensaje(convKey, { rol: 'perfil', contenido: '(Error al conectar con el servidor)' })
    } finally {
      setRespondiendo(false)
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Cabecera del perfil */}
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

        {/* Jobs rápidos */}
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
      </div>

      {/* Historial de mensajes */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">

        {historial.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 text-sm">
              Inicia la conversación con {perfil.nombre.split(' ')[0]}
            </p>
            <p className="text-gray-600 text-xs mt-1">
              Habla como si fuera una entrevista real — pregunta por sus experiencias, no por tu solución
            </p>
          </div>
        )}

        {historial.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.rol === 'emprendedor' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.rol === 'emprendedor'
                  ? 'bg-blue-600 text-white rounded-br-sm'
                  : 'bg-gray-800 text-gray-200 rounded-bl-sm'
              }`}
            >
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

      {/* Insights JTBD extraídos */}
      {insights && (
        <div className="bg-green-950/30 border border-green-800 rounded-xl p-4 mb-4 flex-shrink-0">
          <p className="text-green-400 text-xs font-semibold uppercase tracking-wider mb-2">
            Insights JTBD detectados
          </p>
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
          onChange={(e) => setPregunta(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={respondiendo}
          placeholder="Pregunta algo... (Enter para enviar)"
          rows={2}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-600 transition disabled:opacity-50"
        />
        <button
          onClick={enviar}
          disabled={!pregunta.trim() || respondiendo}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-4 rounded-xl transition text-sm font-medium"
        >
          →
        </button>
      </div>
    </div>
  )
}

// ─── Página principal de exploración ─────────────────────────────────────────
export default function ExplorarPage() {
  const router = useRouter()
  const {
    idea, sector, pais,
    stakeholders: _stakeholders, cargandoStakeholders,
    stakeholderActivo, perfilActivoIdx,
    perfilesPor, historialPor, insightsPor,
    errorStakeholders,
    cargandoSintesis, errorSintesis,
    setStakeholders, setCargandoStakeholders,
    setStakeholderActivo, setPerfilActivoIdx,
    setErrorStakeholders,
    setSintesis, setCargandoSintesis, setErrorSintesis,
  } = useExplorarStore()

  // Protección contra undefined en el primer render (hidratación Zustand/Next.js)
  const stakeholders = _stakeholders ?? []

  // Si no hay idea, redirigir al inicio
  useEffect(() => {
    if (!idea) router.replace('/')
  }, [idea, router])

  // Función de carga reutilizable (también usada en reintento)
  async function cargarStakeholders() {
    if (!idea) return
    setCargandoStakeholders(true)
    setErrorStakeholders(null)
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
      const msg = e instanceof Error ? e.message : 'Error al conectar con el backend'
      setErrorStakeholders(msg)
    } finally {
      setCargandoStakeholders(false)
    }
  }

  // Cargar stakeholders al montar
  useEffect(() => {
    if (!idea || stakeholders.length > 0 || cargandoStakeholders) return
    cargarStakeholders()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  // Construir payload de síntesis a partir del historial acumulado
  async function finalizarExploracion() {
    if (!idea) return
    setCargandoSintesis(true)
    setErrorSintesis(null)

    // Agrupar conversaciones por stakeholder (proteger contra undefined)
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
          return {
            nombre: p.nombre,
            variante_descripcion: p.variante_descripcion ?? '',
            ocupacion: p.ocupacion,
            historial,
            insights_jtbd: insSeg[key] ?? null,
          }
        })
        .filter(Boolean)

      if (perfilesConversados.length === 0) return null
      return {
        stakeholder_id: sk.id,
        stakeholder_nombre: sk.nombre,
        perfiles: perfilesConversados,
      }
    }).filter(Boolean)

    // Si no hay ninguna conversación válida, abortar
    if (conversaciones.length === 0) {
      setErrorSintesis('No se encontraron conversaciones. Habla con al menos un perfil antes de finalizar.')
      setCargandoSintesis(false)
      return
    }

    try {
      const res = await fetch(`${API}/sintetizar-exploracion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea, conversaciones }),
      })
      if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
      const data = await res.json()
      setSintesis(data)
      router.push('/sintesis')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al sintetizar'
      setErrorSintesis(msg)
    } finally {
      setCargandoSintesis(false)
    }
  }

  // Contar cuántas conversaciones hay en total (proteger contra undefined)
  const historialSeguro = historialPor ?? {}
  const totalConversaciones = Object.keys(historialSeguro).filter(
    k => (historialSeguro[k] ?? []).length > 0
  ).length

  const skActivo = (stakeholders ?? []).find(s => s.id === stakeholderActivo) ?? null
  const perfilesActivos = skActivo ? (perfilesPor[skActivo.id] ?? []) : []
  const perfilSeleccionado = perfilActivoIdx !== null ? perfilesActivos[perfilActivoIdx] : null
  const convKey = skActivo && perfilActivoIdx !== null
    ? `${skActivo.id}::${perfilActivoIdx}`
    : null

  return (
    <main className="h-[calc(100vh-120px)] flex flex-col">

      {/* Barra superior */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur px-4 py-3 flex items-center justify-between flex-shrink-0">
        <button
          onClick={() => router.push('/')}
          className="text-gray-400 hover:text-white text-sm transition"
        >
          ← Cambiar idea
        </button>

        <div className="flex-1 mx-6 max-w-lg">
          <p className="text-gray-400 text-xs text-center truncate">{idea}</p>
        </div>

        <div className="flex items-center gap-2">
          {totalConversaciones > 0 && (
            <span className="text-xs text-gray-500">
              {totalConversaciones} conversación{totalConversaciones !== 1 ? 'es' : ''}
            </span>
          )}
          <button
            onClick={finalizarExploracion}
            disabled={totalConversaciones === 0 || cargandoSintesis}
            className="text-xs bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition font-medium"
            title={totalConversaciones === 0 ? 'Realiza al menos una conversación para continuar' : ''}
          >
            {cargandoSintesis ? 'Sintetizando...' : 'Finalizar exploración →'}
          </button>
        </div>
      </div>

      {/* Error de síntesis */}
      {errorSintesis && (
        <div className="bg-red-950/60 border-b border-red-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <p className="text-red-400 text-xs">⚠ {errorSintesis}</p>
          <button onClick={() => setErrorSintesis(null)} className="text-red-500 hover:text-red-300 text-xs ml-4">✕</button>
        </div>
      )}

      {/* Layout de 3 paneles */}
      <div className="flex flex-1 overflow-hidden">

        {/* Panel izquierdo — Stakeholders */}
        <div className="w-64 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-3 space-y-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider px-1 mb-3">
            Stakeholders detectados
          </p>

          {cargandoStakeholders && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-xs text-center">Identificando con quiénes hablar...</p>
            </div>
          )}

          {errorStakeholders && !cargandoStakeholders && (
            <div className="mx-1 mt-2 bg-red-950/50 border border-red-800 rounded-xl p-4 flex flex-col gap-3">
              <p className="text-red-400 text-xs leading-relaxed">
                ⚠ {errorStakeholders}
              </p>
              <p className="text-gray-500 text-xs">
                Asegúrate de que el backend esté corriendo en <span className="text-gray-300 font-mono">localhost:8000</span>
              </p>
              <button
                onClick={cargarStakeholders}
                className="w-full bg-red-900 hover:bg-red-800 text-red-200 text-xs py-2 rounded-lg transition"
              >
                Reintentar
              </button>
            </div>
          )}

          {stakeholders.map((sk) => (
            <StakeholderCard
              key={sk.id}
              sk={sk}
              activo={stakeholderActivo === sk.id}
              onClick={() => {
                setStakeholderActivo(sk.id)
                setPerfilActivoIdx(null)
              }}
            />
          ))}
        </div>

        {/* Panel central — Perfiles */}
        <div className="w-80 flex-shrink-0 border-r border-gray-800 overflow-y-auto p-4">
          {skActivo ? (
            <PerfilesPanel
              stakeholder={skActivo}
              idea={idea}
              sector={sector}
              pais={pais}
              perfilActivoIdx={perfilActivoIdx}
              onSelectPerfil={(idx) => setPerfilActivoIdx(idx)}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-600 text-sm text-center">
                Selecciona un stakeholder<br />para ver sus perfiles
              </p>
            </div>
          )}
        </div>

        {/* Panel derecho — Conversación */}
        <div className="flex-1 overflow-hidden p-4">
          {perfilSeleccionado && convKey ? (
            <ConversacionPanel
              perfil={perfilSeleccionado}
              convKey={convKey}
              idea={idea}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-16 h-16 rounded-2xl bg-gray-800 border border-gray-700 flex items-center justify-center text-2xl">
                💬
              </div>
              <p className="text-gray-400 text-sm text-center">
                Selecciona un perfil para iniciar<br />la entrevista de exploración
              </p>
              <p className="text-gray-600 text-xs text-center max-w-xs">
                Conversa con al menos 2 perfiles del mismo stakeholder<br />
                para detectar patrones y jobs to be done
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
