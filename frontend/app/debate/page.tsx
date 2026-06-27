'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useHistorialStore } from '@/store/useHistorialStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
const SIMLI_KEY           = process.env.NEXT_PUBLIC_SIMLI_API_KEY ?? ''
const SIMLI_FACE_FEMENINO = process.env.NEXT_PUBLIC_SIMLI_FACE_F  ?? 'tmp9i8bbq7c'
const SIMLI_FACE_MASCULINO= process.env.NEXT_PUBLIC_SIMLI_FACE_M  ?? 'tmp9i8bbq7c'

// ── Colores por rol ───────────────────────────────────────────────────────────
const COLOR_HEX: Record<string, string> = {
  'Usuario Objetivo':        '#a855f7',
  'Analista de Negocio':     '#eab308',
  'Experto Técnico':         '#3b82f6',
  'Analista de Contexto':    '#22c55e',
  'Analista de Riesgos':     '#ef4444',
  'Analista de Crecimiento': '#06b6d4',
  'Asesor Legal':            '#f97316',
  'Especialista de Rubro':   '#ec4899',
}
const INICIAL_ROL: Record<string, string> = {
  'Usuario Objetivo': 'UO', 'Analista de Negocio': 'AN', 'Experto Técnico': 'ET',
  'Analista de Contexto': 'AC', 'Analista de Riesgos': 'AR',
  'Analista de Crecimiento': 'AG', 'Asesor Legal': 'AL', 'Especialista de Rubro': 'ER',
}
const ICONO_POSICION: Record<string, string> = { pro: '✓', contra: '✗', neutral: '○' }
const COLOR_POSICION: Record<string, string> = { pro: '#4ade80', contra: '#f87171', neutral: '#9ca3af' }
const COLOR_RECOMENDACION: Record<string, string> = {
  viable:                    'bg-green-900 border-green-600 text-green-300',
  no_viable:                 'bg-red-900 border-red-600 text-red-300',
  condicionalmente_viable:   'bg-yellow-900 border-yellow-600 text-yellow-300',
}
const LABEL_RECOMENDACION: Record<string, string> = {
  viable: '✓ Viable', no_viable: '✗ No viable', condicionalmente_viable: '◐ Condicionalmente viable',
}
const LIKERT_LABELS: Record<number, string> = {
  1: 'Muy bajo', 2: 'Bajo', 3: 'Regular', 4: 'Alto', 5: 'Muy alto',
}

// ── Canvas mirror: copia el stream de Simli en múltiples tiles ───────────────
let mirrorRafId: number | null = null
const mirrorCallbacks = new Set<() => void>()

function registerMirror(cb: () => void): () => void {
  mirrorCallbacks.add(cb)
  if (!mirrorRafId) {
    const loop = () => { mirrorCallbacks.forEach(fn => fn()); mirrorRafId = requestAnimationFrame(loop) }
    mirrorRafId = requestAnimationFrame(loop)
  }
  return () => {
    mirrorCallbacks.delete(cb)
    if (mirrorCallbacks.size === 0 && mirrorRafId) { cancelAnimationFrame(mirrorRafId); mirrorRafId = null }
  }
}

function VideoMirror({ src }: { src: HTMLVideoElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!src || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    return registerMirror(() => {
      if (src.readyState >= 2 && src.videoWidth > 0) {
        if (canvas.width !== src.videoWidth)  canvas.width  = src.videoWidth
        if (canvas.height !== src.videoHeight) canvas.height = src.videoHeight
        ctx.drawImage(src, 0, 0)
      }
    })
  }, [src])
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover' }} />
}

// ── TTS para debate ───────────────────────────────────────────────────────────
async function pedirTTSDebate(texto: string, genero: string): Promise<{ wav: string | null; pcm: string | null }> {
  try {
    const r = await fetch(`${API}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texto, genero }),
    })
    const { wav_base64, audio_base64 } = await r.json()
    return { wav: wav_base64 ?? null, pcm: audio_base64 ?? null }
  } catch { return { wav: null, pcm: null } }
}

let audioDebate: HTMLAudioElement | null = null
let skipAudioFn: (() => void) | null = null

function reproducirDebate(wavB64: string): Promise<void> {
  return new Promise(resolve => {
    if (audioDebate) { audioDebate.pause(); audioDebate = null }
    const el = new Audio(`data:audio/wav;base64,${wavB64}`)
    audioDebate = el
    const done = () => { audioDebate = null; skipAudioFn = null; resolve() }
    el.onended = done
    el.onerror = done
    el.play().catch(done)
    skipAudioFn = () => { el.pause(); done() }
  })
}

// ── Modal encuesta ────────────────────────────────────────────────────────────
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
    try { await fetch(`${API}/encuesta`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, ...valores, comentario }) }); setEnviado(true) }
    finally { setEnviando(false) }
  }
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
        {enviado ? (
          <div className="text-center py-6">
            <p className="text-white font-semibold text-lg mb-1">¡Gracias por tu feedback!</p>
            <button onClick={onClose} className="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-semibold">Encuesta de satisfacción</h2>
              <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-4">
              {preguntas.map(({ key, label }) => (
                <div key={key}>
                  <p className="text-gray-300 text-sm mb-2">{label}</p>
                  <div className="flex gap-2">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setValores(v => ({ ...v, [key]: n }))}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${valores[key] === n ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                        title={LIKERT_LABELS[n]}>{n}</button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1 text-right">{LIKERT_LABELS[valores[key]]}</p>
                </div>
              ))}
              <textarea value={comentario} onChange={e => setComentario(e.target.value)} rows={2}
                placeholder="Comentario adicional (opcional)"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={onClose} className="text-gray-400 hover:text-white text-sm px-4 py-2">Omitir</button>
              <button onClick={enviar} disabled={enviando}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition">
                {enviando ? 'Enviando...' : 'Enviar feedback'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Tile agente — estilo Meet ─────────────────────────────────────────────────
function TileAgente({ rol, nombre, estadoTile, posicion, tileRef, videoSrc }: {
  rol: string
  nombre?: string
  estadoTile: 'pendiente' | 'hablando' | 'completado'
  posicion?: string
  tileRef?: (el: HTMLDivElement | null) => void
  videoSrc?: HTMLVideoElement | null
}) {
  const color = COLOR_HEX[rol] || '#6b7280'
  const inicial = INICIAL_ROL[rol] ?? rol.slice(0, 2).toUpperCase()
  const hablando = estadoTile === 'hablando'
  const completado = estadoTile === 'completado'
  const tieneVideo = !!videoSrc

  return (
    <div ref={tileRef} className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-0 transition-all duration-300"
      style={{
        background: hablando
          ? `radial-gradient(ellipse at 50% 40%, ${color}35 0%, #0f172a 65%)`
          : `radial-gradient(ellipse at 50% 40%, ${color}12 0%, #111827 70%)`,
        border: hablando ? `3px solid ${color}` : `1px solid ${color}30`,
        boxShadow: hablando ? `0 0 40px ${color}70, 0 0 80px ${color}30, inset 0 0 30px ${color}15` : 'none',
        opacity: estadoTile === 'pendiente' ? 0.35 : 1,
        transform: hablando ? 'scale(1.02)' : 'scale(1)',
        zIndex: hablando ? 10 : 1,
      }}>

      {/* Canvas Simli — ocupa el tile salvo los 52px inferiores del nombre */}
      {tieneVideo && (
        <div className="absolute inset-0" style={{ bottom: 52 }}>
          <VideoMirror src={videoSrc!} />
        </div>
      )}

      {/* Glow pulsante cuando habla (sin video) */}
      {!tieneVideo && hablando && (
        <div className="absolute inset-0 pointer-events-none animate-pulse rounded-xl"
          style={{ background: `${color}10` }} />
      )}

      {/* Círculo de iniciales — solo cuando no hay video */}
      {!tieneVideo && (
        <div className="relative rounded-full flex items-center justify-center font-black text-white z-10"
          style={{
            width: 'clamp(64px, 28%, 120px)', height: 'clamp(64px, 28%, 120px)',
            background: hablando ? `radial-gradient(circle, ${color}66 0%, ${color}33 100%)` : `radial-gradient(circle, ${color}33 0%, ${color}18 100%)`,
            border: hablando ? `4px solid ${color}` : `3px solid ${color}55`,
            fontSize: 'clamp(20px, 8%, 40px)',
            boxShadow: hablando ? `0 0 24px ${color}` : 'none',
          }}>
          {inicial}
          {hablando && <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: color }} />}
        </div>
      )}

      {/* Barras de audio — sobre el video (bottom:60) o debajo del círculo */}
      {hablando && tieneVideo && (
        <div className="absolute flex gap-1 items-end z-20" style={{ bottom: 60, height: 16 }}>
          {[4, 8, 12, 8, 4].map((h, i) => (
            <span key={i} className="rounded-full animate-bounce"
              style={{ width: 3, height: h, background: '#4ade80', animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      )}
      {hablando && !tieneVideo && (
        <div className="flex gap-1 items-end mt-2 z-10" style={{ height: 16 }}>
          {[4, 8, 12, 8, 4].map((h, i) => (
            <span key={i} className="rounded-full animate-bounce"
              style={{ width: 3, height: h, background: color, animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      )}

      {/* Nombre y rol — franja inferior siempre visible */}
      <div className="absolute bottom-0 inset-x-0 z-20"
        style={{ height: 52, background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '0 8px 6px' }}>
        {nombre && <p className="text-white font-semibold truncate w-full text-center" style={{ fontSize: 11, lineHeight: 1.3 }}>{nombre}</p>}
        <p className="truncate w-full text-center" style={{ fontSize: 10, color: tieneVideo ? '#d1d5db' : `${color}bb`, lineHeight: 1.3 }}>{rol}</p>
        {posicion && completado && (
          <p style={{ fontSize: 10, color: COLOR_POSICION[posicion] || '#9ca3af' }}>{ICONO_POSICION[posicion]} {posicion}</p>
        )}
      </div>

      {/* Check completado */}
      {completado && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center z-20"
          style={{ background: `${color}44`, border: `1.5px solid ${color}` }}>
          <span style={{ color, fontSize: 9 }}>✓</span>
        </div>
      )}
    </div>
  )
}

// ── Tile usuario ──────────────────────────────────────────────────────────────
function TileUsuario({ videoRef, camaraActiva, grabando }: {
  videoRef: React.RefObject<HTMLVideoElement>
  camaraActiva: boolean
  grabando: boolean
}) {
  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-800 border border-gray-700 flex flex-col items-center justify-center min-h-0">
      <video ref={videoRef} autoPlay muted playsInline
        className={`absolute inset-0 w-full h-full object-cover ${camaraActiva ? 'opacity-100' : 'opacity-0'}`} />
      {!camaraActiva && (
        <div className="flex flex-col items-center gap-2 z-10">
          <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
            </svg>
          </div>
          <p className="text-gray-500 text-xs">Cámara apagada</p>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 rounded px-2 py-0.5 flex items-center gap-1.5">
        <p className="text-white text-xs">Tú</p>
        {grabando && <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────
export default function DebatePage() {
  const router = useRouter()
  const {
    idea, estado, contexto, argumentos, arbol, reset, insights_exploracion,
    sessionId, setEstado, setContexto, addArgumento, setArbol, setError, setSessionId,
  } = useDebateStore()
  const { pais: paisExploracion, snapshotExploracion } = useExplorarStore()
  const { agregar: agregarHistorial } = useHistorialStore()

  const [mostrarEncuesta, setMostrarEncuesta] = useState(false)
  const [encuestaMostrada, setEncuestaMostrada] = useState(false)
  const [mostrarContexto, setMostrarContexto] = useState(false)
  const [rondas, setRondas] = useState<{ replica: string; respuestas: typeof argumentos }[]>([])
  const yaGuardoRef = useRef(false)
  const [textoReplica, setTextoReplica] = useState('')
  const [enviandoReplica, setEnviandoReplica] = useState(false)
  const [grabandoReplica, setGrabandoReplica] = useState(false)
  const [transcribiendoReplica, setTranscribiendoReplica] = useState(false)
  const mediaRecorderReplicaRef = useRef<MediaRecorder | null>(null)
  const enviarReplicaRef = useRef<() => void>(() => {})
  const [faseInteraccion, setFaseInteraccion] = useState<'debatiendo' | 'preguntando' | 'interviniendo' | 'generando_consenso' | 'finalizado'>('debatiendo')

  // TTS debate
  const [agenteHablandoIdx, setAgenteHablandoIdx] = useState<number | null>(null)
  const [subtituloActivo, setSubtituloActivo] = useState('')
  const ttsQueueRef = useRef<number[]>([])
  const ttsPlayingRef = useRef(false)
  const ultimoArgPlayedRef = useRef(-1)
  const argumentosRef = useRef(argumentos)
  const faseRef = useRef(faseInteraccion)
  useEffect(() => { argumentosRef.current = argumentos }, [argumentos])
  useEffect(() => { faseRef.current = faseInteraccion }, [faseInteraccion])

  // Simli — dos conexiones: femenino (Hope) y masculino (Ong)
  const simliVideoRefF = useRef<HTMLVideoElement>(null)
  const simliAudioRefF = useRef<HTMLAudioElement>(null)
  const simliVideoRefM = useRef<HTMLVideoElement>(null)
  const simliAudioRefM = useRef<HTMLAudioElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simliRefF = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simliRefM = useRef<any>(null)
  const [simliConectadoF, setSimliConectadoF] = useState(false)
  const [simliConectadoM, setSimliConectadoM] = useState(false)
  const simliConectadoFRef = useRef(false)
  const simliConectadoMRef = useRef(false)

  const tileRefs = useRef<(HTMLDivElement | null)[]>([])

  // User media
  const [camaraActiva, setCamaraActiva] = useState(false)
  const videoUsuarioRef = useRef<HTMLVideoElement>(null)
  const camaraStreamRef = useRef<MediaStream | null>(null)

  // ── Simli init — espera a que el debate arranque para no saturar la red ──
  useEffect(() => {
    // Solo iniciar cuando el debate ya está en progreso o completado
    if (estado !== 'debatiendo' && estado !== 'consenso' && estado !== 'completado') return
    if (!SIMLI_KEY || typeof window === 'undefined') return
    if (!simliVideoRefF.current || !simliAudioRefF.current) return
    if (!simliVideoRefM.current || !simliAudioRefM.current) return
    if (simliConectadoFRef.current || simliConectadoMRef.current) return // ya conectado
    let destroyed = false

    async function initOne(
      faceId: string,
      videoEl: HTMLVideoElement,
      audioEl: HTMLAudioElement,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      refSetter: (c: any) => void,
      onConnected: () => void,
    ) {
      try {
        const { SimliClient, generateSimliSessionToken, generateIceServers } = await import('simli-client')
        if (destroyed) return
        const { session_token } = await generateSimliSessionToken({
          apiKey: SIMLI_KEY,
          config: { faceId, handleSilence: true, maxSessionLength: 1800, maxIdleTime: 300 },
        })
        if (destroyed) return
        const iceServers = await generateIceServers(SIMLI_KEY)
        if (destroyed) return
        const simli = new SimliClient(session_token, videoEl, audioEl, iceServers)
        refSetter(simli)
        await simli.start()
        if (!destroyed) onConnected()
      } catch (e) { console.error('[Simli debate]', e) }
    }

    initOne(SIMLI_FACE_FEMENINO, simliVideoRefF.current!, simliAudioRefF.current!,
      c => { simliRefF.current = c },
      () => { setSimliConectadoF(true); simliConectadoFRef.current = true },
    )
    initOne(SIMLI_FACE_MASCULINO, simliVideoRefM.current!, simliAudioRefM.current!,
      c => { simliRefM.current = c },
      () => { setSimliConectadoM(true); simliConectadoMRef.current = true },
    )

    return () => {
      destroyed = true
      try { simliRefF.current?.stop() } catch {}
      try { simliRefM.current?.stop() } catch {}
      setSimliConectadoF(false); simliConectadoFRef.current = false
      setSimliConectadoM(false); simliConectadoMRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado])


  // ── TTS queue ──────────────────────────────────────────────────────────────
  async function processQueue() {
    if (ttsQueueRef.current.length === 0) {
      ttsPlayingRef.current = false
      setAgenteHablandoIdx(null)
      setSubtituloActivo('')
      return
    }
    ttsPlayingRef.current = true
    const idx = ttsQueueRef.current.shift()!
    const arg = argumentosRef.current[idx]
    if (!arg) { processQueue(); return }
    setAgenteHablandoIdx(idx)
    setSubtituloActivo(arg.argumento)
    const genero = (arg as { genero?: string }).genero ?? 'femenino'
    const { wav, pcm } = await pedirTTSDebate(arg.argumento, genero)
    if (faseRef.current !== 'finalizado') {
      const esFem = genero !== 'masculino'
      const simliConRef = esFem ? simliConectadoFRef : simliConectadoMRef
      const simliInst  = esFem ? simliRefF.current   : simliRefM.current
      if (simliConRef.current && simliInst && pcm) {
        try {
          const bin = atob(pcm); const bytes = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
          simliInst.sendAudioData(bytes)
        } catch {}
        const durMs = (atob(pcm).length / 2 / 16000) * 1000 + 500
        await new Promise<void>(resolve => {
          const t = setTimeout(resolve, durMs)
          skipAudioFn = () => { clearTimeout(t); resolve() }
        })
      } else if (wav) {
        await reproducirDebate(wav)
      }
    }
    setAgenteHablandoIdx(null)
    setSubtituloActivo('')
    processQueue()
  }

  useEffect(() => {
    if (faseInteraccion === 'finalizado') return
    for (let i = ultimoArgPlayedRef.current + 1; i < argumentos.length; i++) {
      ttsQueueRef.current.push(i)
      ultimoArgPlayedRef.current = i
    }
    if (!ttsPlayingRef.current && ttsQueueRef.current.length > 0) processQueue()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argumentos.length])

  function saltarHablando() { skipAudioFn?.() }

  // ── Init ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!idea) { router.replace('/'); return }
    if (!insights_exploracion) { router.replace('/explorar'); return }
    if (estado === 'completado') { setFaseInteraccion('preguntando'); return }
    // Si hay un error guardado del estado anterior, resetear y reintentar
    if (estado === 'error') { setEstado('idle'); }
    if (estado !== 'idle') return
    iniciarDebate()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea, estado])

  useEffect(() => {
    if (estado === 'completado' && sessionId && !encuestaMostrada) {
      setEncuestaMostrada(true)
      setTimeout(() => setMostrarEncuesta(true), 2000)
    }
  }, [estado, sessionId, encuestaMostrada])

  useEffect(() => { if (!idea) router.replace('/') }, [idea, router])

  // ── Debate ────────────────────────────────────────────────────────────────
  async function iniciarDebate() {
    setEstado('analizando')
    try {
      const res = await fetch(`${API}/evaluar-stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea, insights_exploracion: insights_exploracion ?? undefined, pais: paisExploracion || undefined }),
      })
      if (!res.ok || !res.body) throw new Error(`Error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      const timeoutId = setTimeout(() => { reader.cancel(); setError('El debate tardó demasiado.') }, 120_000)
      try {
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
              if (tipo === 'session_id')      setSessionId(parsed.session_id)
              else if (tipo === 'contexto')   { setContexto(data); setEstado('buscando_web') }
              else if (tipo === 'datos_web')  setEstado('generando_perfiles')
              else if (tipo === 'perfiles_listos') setEstado('debatiendo')
              else if (tipo === 'argumento')  addArgumento(data)
              else if (tipo === 'consenso') {
                setArbol(data)
                setEstado('consenso')
                if (idea && data.recomendacion && !yaGuardoRef.current) {
                  yaGuardoRef.current = true
                  agregarHistorial({ session_id: parsed.session_id ?? crypto.randomUUID(), idea_texto: idea, recomendacion: data.recomendacion, nivel_confianza: data.nivel_confianza ?? 0, resumen_ejecutivo: data.resumen_ejecutivo ?? '', fecha: new Date().toISOString(), exploracion: snapshotExploracion ?? undefined })
                }
              }
              else if (tipo === 'fin') { setEstado('completado'); setFaseInteraccion('preguntando') }
            } catch {}
          }
        }
      } finally { clearTimeout(timeoutId) }
    } catch (e) { setError(e instanceof Error ? e.message : 'Error inesperado') }
  }

  // ── Replica ───────────────────────────────────────────────────────────────
  enviarReplicaRef.current = () => enviarReplica()

  function toggleMicReplica() {
    if (grabandoReplica) { mediaRecorderReplicaRef.current?.stop(); return }
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(stream => {
      const chunks: BlobPart[] = []
      const recorder = new MediaRecorder(stream)
      mediaRecorderReplicaRef.current = recorder
      recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setGrabandoReplica(false)
        setTranscribiendoReplica(true)
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })
          if (blob.size < 5000) { setTranscribiendoReplica(false); return }
          const form = new FormData()
          form.append('file', blob, 'audio.webm')
          const res = await fetch(`${API}/transcribir`, { method: 'POST', body: form })
          const { texto } = await res.json()
          if (texto?.trim()) { setTextoReplica(texto.trim()); setTimeout(() => enviarReplicaRef.current(), 400) }
        } catch {} finally { setTranscribiendoReplica(false) }
      }
      recorder.start()
      setGrabandoReplica(true)
    }).catch(() => {})
  }

  async function enviarReplica() {
    const texto = textoReplica.trim()
    if (!texto || enviandoReplica || !contexto) return
    setEnviandoReplica(true)
    setTextoReplica('')
    const rondaIdx = rondas.length
    setRondas(prev => [...prev, { replica: texto, respuestas: [] }])
    try {
      const res = await fetch(`${API}/debate/replica`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea, replica_usuario: texto, perfiles: argumentos.map(a => ({ nombre: a.agente_nombre, rol: a.agente_rol, categoria: a.agente_categoria, peso: a.agente_peso })), contexto, argumentos_previos: argumentos, session_id: sessionId }),
      })
      if (!res.ok || !res.body) { setEnviandoReplica(false); setFaseInteraccion('preguntando'); return }
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
            if (parsed.tipo === 'replica_agente') setRondas(prev => prev.map((r, i) => i === rondaIdx ? { ...r, respuestas: [...r.respuestas, parsed.data] } : r))
          } catch {}
        }
      }
    } finally { setEnviandoReplica(false); setFaseInteraccion('preguntando') }
  }

  async function generarConsensoFinal() {
    if (audioDebate) { audioDebate.pause(); audioDebate = null }
    skipAudioFn?.()
    ttsQueueRef.current = []
    ttsPlayingRef.current = false
    setAgenteHablandoIdx(null)
    setSubtituloActivo('')
    setFaseInteraccion('generando_consenso')
    try {
      const res = await fetch(`${API}/debate/consenso-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: idea, contexto, argumentos, rondas, session_id: sessionId, insights_exploracion: insights_exploracion ?? null }),
      })
      if (res.ok) { const data = await res.json(); setArbol(data) }
    } catch {}
    setFaseInteraccion('finalizado')
  }

  function toggleCamara() {
    if (camaraActiva) {
      camaraStreamRef.current?.getTracks().forEach(t => t.stop())
      camaraStreamRef.current = null
      if (videoUsuarioRef.current) videoUsuarioRef.current.srcObject = null
      setCamaraActiva(false); return
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(stream => {
      camaraStreamRef.current = stream
      if (videoUsuarioRef.current) videoUsuarioRef.current.srcObject = stream
      setCamaraActiva(true)
    }).catch(() => {})
  }

  function exportarCSV() {
    const rows = [['Agente','Posición','Peso (%)','Argumento','Fuente insight'], ...argumentos.map(a => [a.agente_rol, a.posicion, ((a.agente_peso??0)*100).toFixed(0), a.argumento.replace(/"/g,'""'), a.fuente_insight??''])]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿'+csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `debate-${Date.now()}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Estado visual ──────────────────────────────────────────────────────────
  const cargando = estado !== 'completado' && estado !== 'error'
  const ESTADOS_LABEL: Record<string, string> = {
    analizando: 'Analizando tu idea...', buscando_web: 'Buscando datos del mercado...',
    generando_perfiles: 'Generando agentes...', debatiendo: `Debate en progreso · ${argumentos.length}/${contexto?.agentes.length ?? '?'}`,
    consenso: 'Construyendo árbol de argumentos...',
  }

  // Grid layout — número total de tiles
  const totalAgentes = contexto?.agentes.length ?? argumentos.length
  const totalTiles = totalAgentes + 1 // +1 usuario
  const gridCols = totalTiles <= 3 ? 'grid-cols-2' : totalTiles <= 6 ? 'grid-cols-3' : 'grid-cols-4'

  // Lista de agentes para mostrar (conocidos o en espera)
  const agentesParaMostrar: { rol: string; nombre?: string; argIdx: number | null }[] =
    contexto?.agentes.map((a, i) => ({
      rol: a.rol,
      nombre: argumentos[i]?.agente_nombre,
      argIdx: i < argumentos.length ? i : null,
    })) ?? argumentos.map((a, i) => ({ rol: a.agente_rol, nombre: a.agente_nombre, argIdx: i }))

  const portalEl = typeof document !== 'undefined' ? document.body : null

  return (
    <main className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      {/* Overlay generando consenso */}
      {faseInteraccion === 'generando_consenso' && portalEl && createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9999, background:'rgba(3,7,18,0.95)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:20 }}>
          <div className="animate-spin" style={{ width:48, height:48, borderRadius:'50%', borderTop:'4px solid #a855f7', borderRight:'4px solid transparent', borderBottom:'4px solid transparent', borderLeft:'4px solid transparent' }} />
          <p style={{ color:'#fff', fontSize:18, fontWeight:600 }}>Generando consenso final</p>
          <p style={{ color:'#9ca3af', fontSize:14 }}>Integrando argumentos y réplicas...</p>
        </div>,
        portalEl
      )}

      {/* Encuesta */}
      {mostrarEncuesta && sessionId && <EncuestaModal sessionId={sessionId} onClose={() => setMostrarEncuesta(false)} />}

      {/* Modal de consenso finalizado */}
      {faseInteraccion === 'finalizado' && arbol && portalEl && createPortal(
        <div style={{ position:'fixed', inset:0, zIndex:9998, background:'rgba(3,7,18,0.85)', overflowY:'auto', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'24px 16px' }}>
          <div className="w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-700" />
              <span className="text-xs text-gray-400 font-semibold tracking-wider">CONSENSO FINAL</span>
              <div className="flex-1 h-px bg-gray-700" />
            </div>
            <div className={`border rounded-xl p-5 ${COLOR_RECOMENDACION[arbol.recomendacion] || 'bg-gray-900 border-gray-700'}`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs uppercase opacity-70 mb-1">Recomendación</p>
                  <p className="text-xl font-bold">{LABEL_RECOMENDACION[arbol.recomendacion] || arbol.recomendacion}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70 mb-1">Confianza</p>
                  <p className="text-2xl font-bold">{(arbol.nivel_confianza*100).toFixed(0)}%</p>
                </div>
              </div>
              {arbol.resumen_ejecutivo && <p className="mt-3 text-sm opacity-80 leading-relaxed border-t border-white/10 pt-3">{arbol.resumen_ejecutivo}</p>}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              {arbol.acuerdos.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-green-400 mb-2">✓ Acuerdos ({arbol.acuerdos.length})</h3>
                  <ul className="space-y-1">{arbol.acuerdos.map((a, i) => <li key={i} className="text-sm text-gray-300"><span className="text-green-500 mr-1.5">·</span>{a.punto}</li>)}</ul>
                </div>
              )}
              {arbol.divergencias.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-red-400 mb-2">✗ Divergencias ({arbol.divergencias.length})</h3>
                  <ul className="space-y-1">{arbol.divergencias.map((d, i) => <li key={i} className="text-sm text-gray-300"><span className="text-red-500 mr-1.5">·</span>{d.punto}</li>)}</ul>
                </div>
              )}
              {arbol.fortalezas_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-blue-400 mb-2">↑ Fortalezas</h3>
                  <ul className="space-y-1">{arbol.fortalezas_idea.map((f, i) => <li key={i} className="text-sm text-gray-300"><span className="text-blue-500 mr-1.5">·</span>{f}</li>)}</ul>
                </div>
              )}
              {arbol.debilidades_idea.length > 0 && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-orange-400 mb-2">↓ Debilidades</h3>
                  <ul className="space-y-1">{arbol.debilidades_idea.map((d, i) => <li key={i} className="text-sm text-gray-300"><span className="text-orange-500 mr-1.5">·</span>{d}</li>)}</ul>
                </div>
              )}
            </div>
            {arbol.condiciones.length > 0 && (
              <div className="bg-yellow-950/30 border border-yellow-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-yellow-400 mb-2">⚠ Condiciones</h3>
                <ul className="space-y-1">{arbol.condiciones.map((c, i) => <li key={i} className="text-sm text-yellow-200 flex gap-2"><span className="text-yellow-500 flex-shrink-0">{i+1}.</span>{c}</li>)}</ul>
              </div>
            )}
            <div className="flex justify-center gap-3 pt-2">
              {sessionId && <button onClick={() => setMostrarEncuesta(true)} className="border border-blue-700 text-blue-300 hover:bg-blue-900/30 font-semibold px-6 py-2.5 rounded-xl transition text-sm">★ Valorar</button>}
              <button onClick={exportarCSV} className="border border-gray-700 text-gray-300 hover:bg-gray-800 px-4 py-2.5 rounded-xl transition text-sm">↓ CSV</button>
              <button onClick={() => { reset(); router.push('/') }} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-2.5 rounded-xl transition text-sm">Evaluar otra idea →</button>
            </div>
          </div>
        </div>,
        portalEl
      )}

      {/* ── Barra superior ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-11 bg-gray-900/90 border-b border-gray-800 backdrop-blur flex items-center px-4 gap-3 z-10">
        <button onClick={() => { if (audioDebate) { audioDebate.pause(); audioDebate = null }; reset(); router.push('/') }}
          className="text-gray-500 hover:text-white text-sm transition flex-shrink-0">
          ← Salir
        </button>
        {contexto && (
          <button onClick={() => setMostrarContexto(v => !v)}
            className="text-xs text-gray-600 hover:text-gray-400 border border-gray-800 px-2 py-0.5 rounded flex-shrink-0 transition">
            {mostrarContexto ? '▲' : '▼'} Contexto
          </button>
        )}
        <p className="text-gray-500 text-xs truncate flex-1 hidden sm:block">{idea}</p>
        <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
          {insights_exploracion && <span className="text-xs bg-purple-900/40 border border-purple-800 text-purple-400 px-2 py-0.5 rounded-full hidden sm:block">✓ Insights</span>}
          {cargando && <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          <span className="text-xs text-gray-400">{cargando ? ESTADOS_LABEL[estado] || 'Iniciando...' : 'Debate completado'}</span>
        </div>
      </div>

      {/* Panel de contexto colapsable */}
      {mostrarContexto && contexto && (
        <div className="flex-shrink-0 bg-gray-900/80 border-b border-gray-800 px-4 py-2">
          <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-2">
            {[{ label:'Sector', value:contexto.sector },{ label:'País', value:contexto.pais },{ label:'Modelo', value:contexto.modelo_negocio },{ label:'Usuarios', value:contexto.usuarios_objetivo }].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg px-3 py-1.5">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xs text-gray-200 truncate">{value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Grilla Meet ─────────────────────────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden p-2">
        {estado === 'error' ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <p className="text-red-400 text-sm">{useDebateStore.getState().error || 'Error inesperado.'}</p>
            <div className="flex gap-3">
              <button onClick={() => { setEstado('idle'); iniciarDebate() }} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition">Reintentar</button>
              <button onClick={() => { reset(); router.push('/') }} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-6 py-2.5 rounded-xl transition">Volver</button>
            </div>
          </div>
        ) : (
          <div className={`h-full grid ${gridCols} gap-2`}>
            {agentesParaMostrar.map(({ rol, nombre, argIdx }, i) => {
              const tieneArg = argIdx !== null
              const estaHablando = agenteHablandoIdx === argIdx && argIdx !== null
              const estadoTile: 'pendiente' | 'hablando' | 'completado' =
                estaHablando ? 'hablando' : tieneArg ? 'completado' : 'pendiente'
              // Solo el tile activo (hablando) muestra el video Simli
              const generoAgente = argIdx !== null ? (argumentos[argIdx]?.genero ?? 'femenino') : 'femenino'
              let videoSrc: HTMLVideoElement | null = null
              if (estaHablando) {
                videoSrc = generoAgente === 'masculino'
                  ? (simliConectadoM ? simliVideoRefM.current : null)
                  : (simliConectadoF ? simliVideoRefF.current : null)
              }
              return (
                <TileAgente
                  key={i}
                  tileRef={(el) => { tileRefs.current[i] = el }}
                  rol={rol}
                  nombre={nombre}
                  estadoTile={estadoTile}
                  videoSrc={videoSrc}
                  posicion={argIdx !== null ? argumentos[argIdx]?.posicion : undefined}
                />
              )
            })}
            {/* Tile del usuario */}
            <TileUsuario
              videoRef={videoUsuarioRef}
              camaraActiva={camaraActiva}
              grabando={grabandoReplica}
            />
          </div>
        )}

        {/* Videos Simli ocultos — fuente para los canvas mirrors */}
        <video ref={simliVideoRefF} autoPlay playsInline className="hidden" />
        <video ref={simliVideoRefM} autoPlay playsInline className="hidden" />
        <audio ref={simliAudioRefF} autoPlay className="hidden" />
        <audio ref={simliAudioRefM} autoPlay className="hidden" />


        {/* Subtítulo del agente hablando */}
        {subtituloActivo && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 pointer-events-none">
            <div className="bg-black/75 backdrop-blur rounded-xl px-4 py-2.5">
              <p className="text-white text-sm leading-relaxed text-center line-clamp-3">{subtituloActivo}</p>
            </div>
          </div>
        )}

        {/* Cargando inicial */}
        {cargando && agentesParaMostrar.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">{ESTADOS_LABEL[estado] || 'Iniciando...'}</p>
          </div>
        )}
      </div>

      {/* ── Barra de controles inferior ─────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900/95 border-t border-gray-800 px-4 py-3">
        {/* Durante debate */}
        {faseInteraccion === 'debatiendo' && (
          <div className="flex items-center justify-center gap-4">
            {agenteHablandoIdx !== null && (
              <button onClick={saltarHablando}
                className="text-xs text-gray-500 hover:text-white border border-gray-700 px-3 py-1.5 rounded-lg transition">
                ⏭ Saltar
              </button>
            )}
            <p className="text-xs text-gray-600">{cargando ? ESTADOS_LABEL[estado] : 'Finalizando...'}</p>
          </div>
        )}

        {/* Después del debate — elegir acción */}
        {faseInteraccion === 'preguntando' && (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            {/* Controles de media del usuario */}
            <button onClick={toggleCamara}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition ${camaraActiva ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={camaraActiva ? 'Apagar cámara' : 'Encender cámara'}>
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                {camaraActiva
                  ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  : <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>}
              </svg>
            </button>
            <div className="w-px h-8 bg-gray-700" />
            <p className="text-sm text-gray-400">El debate terminó.</p>
            <button onClick={() => setFaseInteraccion('interviniendo')}
              className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-xl transition">
              Intervenir
            </button>
            <button onClick={generarConsensoFinal}
              className="bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-xl transition">
              Consenso →
            </button>
          </div>
        )}

        {/* Intervención activa */}
        {faseInteraccion === 'interviniendo' && (
          <div className="flex gap-2 items-end max-w-3xl mx-auto">
            {/* Cámara toggle */}
            <button onClick={toggleCamara}
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition ${camaraActiva ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {camaraActiva
                  ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  : <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>}
              </svg>
            </button>
            <textarea
              value={textoReplica}
              onChange={e => setTextoReplica(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarReplica() } }}
              disabled={enviandoReplica || grabandoReplica}
              autoFocus
              placeholder={transcribiendoReplica ? 'Transcribiendo...' : grabandoReplica ? 'Grabando...' : 'Escribe tu punto de vista... (Enter para enviar)'}
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm resize-none focus:outline-none focus:border-blue-600 transition disabled:opacity-50"
            />
            <button onClick={toggleMicReplica} disabled={enviandoReplica}
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition ${grabandoReplica ? 'bg-red-600 animate-pulse' : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40'}`}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {grabandoReplica ? <rect x="6" y="6" width="12" height="12" rx="2" /> : <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 14.93A7 7 0 0 1 5 9H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.07A9 9 0 0 0 21 9h-2a7 7 0 0 1-6 6.93z"/>}
              </svg>
            </button>
            <button onClick={enviarReplica} disabled={!textoReplica.trim() || enviandoReplica || grabandoReplica}
              className="w-10 h-10 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-xl flex items-center justify-center flex-shrink-0 transition">
              {enviandoReplica
                ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
              }
            </button>
            <button onClick={() => setFaseInteraccion('preguntando')}
              className="text-gray-500 hover:text-gray-300 text-xs px-2 flex-shrink-0 transition">
              Cancelar
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
