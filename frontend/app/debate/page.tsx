'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useHistorialStore } from '@/store/useHistorialStore'
import { useMic } from '@/hooks/useMic'
import { MicPreviewModal } from '@/components/MicPreviewModal'
import { MicAudioBar } from '@/components/MicAudioBar'
import { beep } from '@/utils/beep'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'
const SIMLI_KEY = process.env.NEXT_PUBLIC_SIMLI_API_KEY ?? ''

const SIMLI_FACES_F = [
  'afdb6a3e-3939-40aa-92df-01604c23101c',
  '5fc23ea5-8175-4a82-aaaf-cdd8c88543dc',
  'b9e5fba3-071a-4e35-896e-211c4d6eaa7b',
  'cace3ef7-a4c4-425d-a8cf-a5358eb0c427',
]
const SIMLI_FACES_M = [
  '804c347a-26c9-4dcf-bb49-13df4bed61e8',
  '1c6aa65c-d858-4721-a4d9-bda9fde03141',
  'dd10cb5a-d31d-4f12-b69f-6db3383c006e',
]

function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

const MAX_AGENTS = 5

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

// Versión lenta (1fps) del mirror — para agentes que no hablan: cara visible pero sin lipsync
function SlowMirror({ src }: { src: HTMLVideoElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!src || !canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const draw = () => {
      if (src.readyState >= 2 && src.videoWidth > 0) {
        if (canvas.width !== src.videoWidth) canvas.width = src.videoWidth
        if (canvas.height !== src.videoHeight) canvas.height = src.videoHeight
        ctx.drawImage(src, 0, 0)
      }
    }
    draw()
    const id = setInterval(draw, 1500)
    return () => clearInterval(id)
  }, [src])
  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full"
    style={{ objectFit: 'cover', filter: 'brightness(0.78)' }} />
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
let _audioMuted = false   // estado global de mute — sincronizado con silenciadoRef

function reproducirDebate(wavB64: string): Promise<void> {
  return new Promise(resolve => {
    if (audioDebate) { audioDebate.pause(); audioDebate = null }
    const el = new Audio(`data:audio/wav;base64,${wavB64}`)
    el.muted = _audioMuted   // respetar el estado de mute al crear el elemento
    audioDebate = el
    let resolved = false
    const done = () => {
      if (resolved) return   // evitar doble resolución
      resolved = true
      audioDebate = null
      skipAudioFn = null
      resolve()
    }
    el.onended = done
    el.onerror = done
    el.play().catch(done)
    skipAudioFn = () => { el.pause(); done() }
  })
}


// ── Tile agente — estilo Meet ─────────────────────────────────────────────────
function TileAgente({ rol, estadoTile, posicion, tileRef, videoSrc, slowVideoSrc, capturedFrame }: {
  rol: string
  estadoTile: 'pendiente' | 'hablando' | 'completado'
  posicion?: string
  tileRef?: (el: HTMLDivElement | null) => void
  videoSrc?: HTMLVideoElement | null
  slowVideoSrc?: HTMLVideoElement | null
  capturedFrame?: string | null
}) {
  const color = COLOR_HEX[rol] || '#6b7280'
  const inicial = INICIAL_ROL[rol] ?? rol.slice(0, 2).toUpperCase()
  const hablando = estadoTile === 'hablando'
  const completado = estadoTile === 'completado'
  const tieneVideo = !!videoSrc
  const tieneCapturedFrame = !!capturedFrame && !tieneVideo
  const tieneSlowVideo = !!slowVideoSrc && !tieneVideo && !tieneCapturedFrame

  return (
    <div ref={tileRef} className="relative rounded-xl overflow-hidden flex flex-col items-center justify-center min-h-0 transition-all duration-300"
      style={{
        background: hablando
          ? `radial-gradient(ellipse at 50% 40%, ${color}35 0%, #0f172a 65%)`
          : `radial-gradient(ellipse at 50% 40%, ${color}12 0%, #111827 70%)`,
        border: hablando ? `3px solid ${color}` : `1px solid ${color}22`,
        boxShadow: hablando ? `0 0 40px ${color}70, 0 0 80px ${color}30, inset 0 0 30px ${color}15` : 'none',
        opacity: estadoTile === 'pendiente' ? 0.75 : 1,
        transform: hablando ? 'scale(1.02)' : 'scale(1)',
        zIndex: hablando ? 10 : 1,
      }}>

      {/* Video en vivo Simli — agente que habla (lipsync real, cara única) */}
      {tieneVideo && (
        <div className="absolute inset-0" style={{ bottom: 44 }}>
          <VideoMirror src={videoSrc!} />
        </div>
      )}

      {/* Frame capturado — cara estática del agente que ya habló (no requiere stream activo) */}
      {tieneCapturedFrame && (
        <div className="absolute inset-0" style={{ bottom: 44 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={capturedFrame!} alt="" className="absolute inset-0 w-full h-full"
            style={{ objectFit: 'cover', filter: 'brightness(0.78)' }} />
        </div>
      )}

      {/* Cara a 1fps — agente que ya habló pero cuyo stream aún está activo */}
      {tieneSlowVideo && (
        <div className="absolute inset-0" style={{ bottom: 44 }}>
          <SlowMirror src={slowVideoSrc!} />
        </div>
      )}

      {/* Círculo de iniciales — mientras Simli conecta o agente pendiente */}
      {!tieneVideo && !tieneSlowVideo && (
        <>
          {hablando && <div className="absolute inset-0 pointer-events-none animate-pulse rounded-xl" style={{ background: `${color}10` }} />}
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
        </>
      )}

      {/* Barras de audio — solo al agente que habla */}
      {hablando && (
        <div className="absolute flex gap-1 items-end z-20" style={{ bottom: (tieneVideo || tieneSlowVideo) ? 52 : undefined, height: 16 }}>
          {[4, 8, 12, 8, 4].map((h, i) => (
            <span key={i} className="rounded-full animate-bounce"
              style={{ width: 3, height: h, background: '#4ade80', animationDelay: `${i * 70}ms` }} />
          ))}
        </div>
      )}

      {/* Solo rol */}
      <div className="absolute bottom-0 inset-x-0 z-20"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', padding: '10px 8px 5px' }}>
        <p className="truncate w-full text-center font-semibold" style={{ fontSize: 11, color: hablando ? color : '#e5e7eb', lineHeight: 1.3 }}>{rol}</p>
        {posicion && completado && (
          <p style={{ fontSize: 10, color: COLOR_POSICION[posicion] || '#9ca3af' }}>{ICONO_POSICION[posicion]} {posicion}</p>
        )}
      </div>

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

  const estadoRef = useRef(estado)
  useEffect(() => { estadoRef.current = estado }, [estado])

  const [silenciado, setSilenciado] = useState(false)
  const silenciadoRef = useRef(false)
  const [pausado, setPausado] = useState(false)
  const pausadoRef = useRef(false)
  const [mostrarContexto, setMostrarContexto] = useState(false)
  const [mostrarChat, setMostrarChat] = useState(true)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const [rondas, setRondas] = useState<{ replica: string; respuestas: typeof argumentos }[]>([])
  const yaGuardoRef = useRef(false)
  const debateIniciadoRef = useRef(false)
  const [textoReplica, setTextoReplica] = useState('')
  const [enviandoReplica, setEnviandoReplica] = useState(false)
  const handleMicReplicaSend = useCallback((texto: string) => {
    setTextoReplica(texto)
    setTimeout(() => enviarReplicaRef.current(), 400)
  }, [])

  const { grabando: grabandoReplica, transcribiendo: transcribiendoReplica, audioLevel: audioLevelReplica, errorMic: errorMicReplica, preview: previewReplica, toggleMic: toggleMicReplica, confirmPreview: confirmPreviewReplica, cancelPreview: cancelPreviewReplica, retryMic: retryMicReplica } = useMic({
    apiUrl: API,
    onSend: handleMicReplicaSend,
    onBeepStart: () => beep('inicio'),
    onBeepEnd: () => beep('fin'),
  })
  const enviarReplicaRef = useRef<() => void>(() => {})
  const [faseInteraccion, setFaseInteraccion] = useState<'debatiendo' | 'preguntando' | 'interviniendo' | 'generando_consenso' | 'finalizado'>('debatiendo')

  // TTS debate
  const [agenteHablandoIdx, setAgenteHablandoIdx] = useState<number | null>(null)
  const [subtituloActivo, setSubtituloActivo] = useState('')
  const ttsQueueRef = useRef<number[]>([])
  const ttsPlayingRef = useRef(false)
  const desmontadoRef = useRef(false)  // abortar audio al salir de la página
  const ultimoArgPlayedRef = useRef(-1)
  const argumentosRef = useRef(argumentos)
  const faseRef = useRef(faseInteraccion)
  useEffect(() => { argumentosRef.current = argumentos }, [argumentos])
  useEffect(() => { faseRef.current = faseInteraccion }, [faseInteraccion])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [argumentos.length])

  // Simli — dos conexiones: femenino (Hope) y masculino (Ong)
  // Simli — una conexión por agente (máx 5), cara única según género
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simliRefsArr   = useRef<(any | null)[]>(Array(MAX_AGENTS).fill(null))
  const simliConArr    = useRef<boolean[]>(Array(MAX_AGENTS).fill(false))
  const simliVideoEls  = useRef<(HTMLVideoElement | null)[]>(Array(MAX_AGENTS).fill(null))
  const simliAudioEls  = useRef<(HTMLAudioElement | null)[]>(Array(MAX_AGENTS).fill(null))
  const faceIds        = useRef<(string | null)[]>(Array(MAX_AGENTS).fill(null))
  const faceCounters   = useRef({ f: 0, m: 0 })
  const simliInitedIdx = useRef<Set<number>>(new Set())
  const [simliConState, setSimliConState] = useState<boolean[]>(Array(MAX_AGENTS).fill(false))

  const tileRefs = useRef<(HTMLDivElement | null)[]>([])

  // Frames capturados de cada agente (dataURL) — para mostrar cara estática sin stream activo
  const capturedFrames = useRef<(string | null)[]>(Array(MAX_AGENTS).fill(null))
  const [capturedFrameState, setCapturedFrameState] = useState<(string | null)[]>(Array(MAX_AGENTS).fill(null))

  function captureFrame(idx: number) {
    const videoEl = simliVideoEls.current[idx]
    if (!videoEl || videoEl.videoWidth === 0 || videoEl.readyState < 2) return
    try {
      const c = document.createElement('canvas')
      c.width = videoEl.videoWidth; c.height = videoEl.videoHeight
      c.getContext('2d')?.drawImage(videoEl, 0, 0)
      const dataUrl = c.toDataURL('image/jpeg', 0.85)
      if (dataUrl && dataUrl !== 'data:,') {
        capturedFrames.current[idx] = dataUrl
        setCapturedFrameState(prev => { const n = [...prev]; n[idx] = dataUrl; return n })
      }
    } catch {}
  }

  // User media
  const [camaraActiva, setCamaraActiva] = useState(false)
  const [errorCamara, setErrorCamara] = useState<string | null>(null)
  const videoUsuarioRef = useRef<HTMLVideoElement>(null)
  const camaraStreamRef = useRef<MediaStream | null>(null)

  // ── Simli: inicializa la conexión del agente idx justo cuando va a hablar ──
  // Se llama en paralelo con pedirTTSDebate para no añadir latencia
  async function initSimliAgente(idx: number, genero: string): Promise<void> {
    if (simliConArr.current[idx]) return          // ya conectado
    if (simliInitedIdx.current.has(idx)) return   // ya iniciando
    if (!SIMLI_KEY || typeof window === 'undefined') return
    const videoEl = simliVideoEls.current[idx]
    const audioEl = simliAudioEls.current[idx]
    if (!videoEl || !audioEl) return

    simliInitedIdx.current.add(idx)

    // Asignar cara única por género, sin repetir
    if (!faceIds.current[idx]) {
      const esFem = genero !== 'masculino'
      faceIds.current[idx] = esFem
        ? SIMLI_FACES_F[faceCounters.current.f++ % SIMLI_FACES_F.length]
        : SIMLI_FACES_M[faceCounters.current.m++ % SIMLI_FACES_M.length]
    }
    const faceId = faceIds.current[idx]!

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, attempt * 2000))
        if (desmontadoRef.current) return
        const { SimliClient, generateSimliSessionToken, generateIceServers } = await import('simli-client')
        if (desmontadoRef.current) return
        const { session_token } = await generateSimliSessionToken({
          apiKey: SIMLI_KEY,
          config: { faceId, handleSilence: true, maxSessionLength: 600, maxIdleTime: 120 },
        })
        if (desmontadoRef.current) return
        const iceServers = await generateIceServers(SIMLI_KEY)
        if (desmontadoRef.current) return
        const simli = new SimliClient(session_token, videoEl, audioEl, iceServers)
        simliRefsArr.current[idx] = simli
        await simli.start()
        // Forzar mute del audio Simli — el audio real se reproduce por WAV independientemente
        if (audioEl) { audioEl.muted = true; audioEl.volume = 0 }
        if (!desmontadoRef.current) {
          simliConArr.current[idx] = true
          setSimliConState(prev => { const next = [...prev]; next[idx] = true; return next })
        }
        return  // éxito
      } catch (e) {
        console.error(`[Simli agent ${idx}] intento ${attempt + 1}`, e)
        if (attempt === 2) simliInitedIdx.current.delete(idx)  // permite reintento externo
      }
    }
  }


  // ── TTS queue ──────────────────────────────────────────────────────────────
  async function processQueue() {
    if (desmontadoRef.current) return
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
    if (desmontadoRef.current) return
    setAgenteHablandoIdx(idx)
    setSubtituloActivo(arg.argumento)
    try {
      const genero = (arg as { genero?: string }).genero ?? 'femenino'
      // Liberar sesión Simli de hace 2 turnos para evitar el límite de 2 sesiones concurrentes.
      // SlowMirror sigue mostrando la cara porque dibuja en canvas independientemente del stream.
      const prevPrevIdx = idx - 2
      if (prevPrevIdx >= 0 && simliRefsArr.current[prevPrevIdx]) {
        try { simliRefsArr.current[prevPrevIdx]?.stop() } catch {}
        simliRefsArr.current[prevPrevIdx] = null
      }
      // Iniciar Simli y TTS en paralelo — ambos tardan ~2s, así no acumulamos latencia
      const [{ wav, pcm }] = await Promise.all([
        pedirTTSDebate(arg.argumento, genero),
        initSimliAgente(idx, genero),
      ])
      if (desmontadoRef.current) return  // navegó fuera mientras pedía TTS
      if (faseRef.current !== 'finalizado') {
        // Enviar PCM a la conexión Simli específica de este agente (lipsync único)
        if (pcm) {
          const simliInst = simliRefsArr.current[idx]
          if (simliConArr.current[idx] && simliInst) {
            try {
              const bin = atob(pcm); const bytes = new Uint8Array(bin.length)
              for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
              simliInst.sendAudioData(bytes)
            } catch {}
          }
        }
        // Audio real siempre por WAV: evento 'ended' confiable, sin bleeding de Simli
        if (wav && !desmontadoRef.current) {
          await reproducirDebate(wav)
          // Capturar el último frame del avatar justo al terminar de hablar
          captureFrame(idx)
        } else if (pcm && !desmontadoRef.current) {
          const durMs = (atob(pcm).length / 2 / 16000) * 1000
          await new Promise<void>(resolve => {
            const t = setTimeout(resolve, durMs + 500)
            skipAudioFn = () => { clearTimeout(t); resolve() }
          })
          captureFrame(idx)
        }
      }
    } catch (e) {
      console.error('[TTS processQueue]', e)
    } finally {
      if (!desmontadoRef.current) {
        setAgenteHablandoIdx(null)
        setSubtituloActivo('')
        processQueue()
      }
    }
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

  useEffect(() => { if (!idea) router.replace('/') }, [idea, router])

  // Detener TODO audio al desmontar (navegación fuera del debate)
  useEffect(() => {
    desmontadoRef.current = false
    return () => {
      desmontadoRef.current = true          // aborta processQueue en curso
      ttsQueueRef.current = []              // vacía cola pendiente
      ttsPlayingRef.current = false
      skipAudioFn?.()
      skipAudioFn = null
      if (audioDebate) { audioDebate.pause(); audioDebate = null }
      simliRefsArr.current.forEach((s, i) => {
        try { s?.stop() } catch {}
        simliRefsArr.current[i] = null
        simliConArr.current[i] = false
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function toggleSilencio() {
    const nuevoValor = !silenciadoRef.current
    silenciadoRef.current = nuevoValor
    _audioMuted = nuevoValor          // sincronizar flag global para nuevos elementos
    setSilenciado(nuevoValor)
    if (audioDebate) audioDebate.muted = nuevoValor
    // Simli audio siempre en volumen 0 — no tocar
  }

  function togglePausa() {
    const nuevoValor = !pausadoRef.current
    pausadoRef.current = nuevoValor
    setPausado(nuevoValor)
    if (nuevoValor) {
      if (audioDebate) audioDebate.pause()
    } else {
      if (audioDebate) audioDebate.play().catch(() => {})
    }
  }

  // ── Debate ────────────────────────────────────────────────────────────────
  async function iniciarDebate() {
    if (debateIniciadoRef.current) return   // StrictMode llama el efecto dos veces — ignorar el segundo
    debateIniciadoRef.current = true
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
    ttsQueueRef.current = []
    ttsPlayingRef.current = false
    skipAudioFn?.(); skipAudioFn = null
    if (audioDebate) { audioDebate.pause(); audioDebate = null }
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
      setCamaraActiva(false)
      setErrorCamara(null)
      return
    }
    setErrorCamara(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorCamara('Tu navegador no soporta acceso a cámara')
      return
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false }).then(stream => {
      camaraStreamRef.current = stream
      if (videoUsuarioRef.current) {
        videoUsuarioRef.current.srcObject = stream
        videoUsuarioRef.current.play().catch(() => {})
      }
      setCamaraActiva(true)
    }).catch((err: Error) => {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorCamara('Permiso de cámara denegado. Habilítalo en el navegador.')
      } else if (err.name === 'NotFoundError') {
        setErrorCamara('No se encontró ninguna cámara.')
      } else {
        setErrorCamara('No se pudo acceder a la cámara.')
      }
    })
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
  const gridColsDesktop = totalTiles <= 3 ? 'md:grid-cols-2' : totalTiles <= 6 ? 'md:grid-cols-3' : 'md:grid-cols-4'
  const gridCols = `grid-cols-2 ${gridColsDesktop}`

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
              <button onClick={exportarCSV} className="border border-gray-700 text-gray-300 hover:bg-gray-800 px-4 py-2.5 rounded-xl transition text-sm">↓ CSV</button>
              <button onClick={() => { reset(); router.push('/') }} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-2.5 rounded-xl transition text-sm">Evaluar otra idea →</button>
            </div>
          </div>
        </div>,
        portalEl
      )}

      {/* ── Barra superior ──────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 h-11 bg-gray-900/90 border-b border-gray-800 backdrop-blur flex items-center pl-12 md:pl-4 pr-4 gap-3 z-10">
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
          <button onClick={() => setMostrarChat(v => !v)}
            className={`text-xs border px-2.5 py-1 rounded transition flex items-center gap-1 ${mostrarChat ? 'border-blue-700 bg-blue-900/30 text-blue-400' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 16c0 .55-.45 1-1 1H7l-4 4V5c0-.55.45-1 1-1h16c.55 0 1 .45 1 1v11z"/></svg>
            Chat
          </button>
          {insights_exploracion && <span className="text-xs bg-purple-900/40 border border-purple-800 text-purple-400 px-2 py-0.5 rounded-full hidden sm:block">✓ Insights</span>}
          {cargando && <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />}
          <span className="text-xs text-gray-400">{cargando ? ESTADOS_LABEL[estado] || 'Iniciando...' : faseInteraccion === 'preguntando' ? 'Ronda completada' : faseInteraccion === 'interviniendo' ? 'Interviniendo...' : 'Debate en curso'}</span>
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

      {/* ── Zona principal: grilla + chat ───────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden gap-0">
      {/* Grilla de video */}
      <div className="flex-1 relative overflow-hidden p-2">
        {estado === 'error' ? (
          <div className="h-full flex flex-col items-center justify-center gap-4">
            <p className="text-red-400 text-sm">{useDebateStore.getState().error || 'Error inesperado.'}</p>
            <div className="flex gap-3">
              <button onClick={() => { debateIniciadoRef.current = false; setEstado('idle'); iniciarDebate() }} className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition">Reintentar</button>
              <button onClick={() => { reset(); router.push('/') }} className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm px-6 py-2.5 rounded-xl transition">Volver</button>
            </div>
          </div>
        ) : (
          <div className={`h-full grid ${gridCols} gap-2`}>
            {agentesParaMostrar.map(({ rol, argIdx }, i) => {
              const tieneArg = argIdx !== null
              const estaHablando = agenteHablandoIdx === argIdx && argIdx !== null
              const estadoTile: 'pendiente' | 'hablando' | 'completado' =
                estaHablando ? 'hablando' : tieneArg ? 'completado' : 'pendiente'
              // Video del agente: su propia conexión Simli con cara única
              const simliVid = simliConState[i] ? simliVideoEls.current[i] : null
              const videoSrc: HTMLVideoElement | null = estaHablando ? simliVid : null
              const slowVideoSrc: HTMLVideoElement | null = (!estaHablando && tieneArg) ? simliVid : null
              return (
                <TileAgente
                  key={i}
                  tileRef={(el) => { tileRefs.current[i] = el }}
                  rol={rol}
                  estadoTile={estadoTile}
                  videoSrc={videoSrc}
                  slowVideoSrc={slowVideoSrc}
                  capturedFrame={capturedFrameState[i]}
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

        {/* Videos/audios Simli ocultos — uno por agente, cara única */}
        {Array.from({ length: MAX_AGENTS }, (_, i) => (
          <React.Fragment key={i}>
            <video autoPlay playsInline className="hidden"
              ref={el => { simliVideoEls.current[i] = el }} />
            <audio autoPlay muted className="hidden"
              ref={el => {
                if (el) { el.muted = true; el.volume = 0 }
                simliAudioEls.current[i] = el
              }} />
          </React.Fragment>
        ))}



        {/* Cargando inicial */}
        {cargando && agentesParaMostrar.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">{ESTADOS_LABEL[estado] || 'Iniciando...'}</p>
          </div>
        )}
      </div>{/* fin grilla */}

      {/* ── Panel de chat en tiempo real ─────────────────────────────────────── */}
      {mostrarChat && (
        <div className="
          fixed bottom-0 left-0 right-0 h-2/3 z-30 border-t border-gray-800
          md:relative md:bottom-auto md:left-auto md:right-auto md:h-auto md:w-72 md:border-t-0 md:border-l md:z-auto
          flex-shrink-0 bg-gray-950 flex flex-col overflow-hidden
        ">
          <div className="flex-shrink-0 px-3 py-2 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Debate en tiempo real</span>
            <span className="text-xs text-gray-600">{argumentos.length} intervenciones</span>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
            {argumentos.map((arg, i) => {
              const color = COLOR_HEX[arg.agente_rol] || '#6b7280'
              const esHablando = agenteHablandoIdx === i
              return (
                <div key={i}
                  className="rounded-xl p-3 transition-all duration-500"
                  style={{
                    background: esHablando ? `${color}20` : 'rgba(255,255,255,0.03)',
                    borderLeft: `3px solid ${esHablando ? color : color + '55'}`,
                    boxShadow: esHablando ? `0 0 16px ${color}30, inset 0 0 12px ${color}10` : 'none',
                    transform: esHablando ? 'scale(1.015)' : 'scale(1)',
                  }}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-xs font-semibold truncate" style={{ color, opacity: esHablando ? 1 : 0.75 }}>
                      {arg.agente_rol}
                    </span>
                    {arg.posicion && (
                      <span className="text-xs flex-shrink-0" style={{ color: COLOR_POSICION[arg.posicion] }}>
                        {ICONO_POSICION[arg.posicion]}
                      </span>
                    )}
                    {esHablando && (
                      <span className="flex gap-0.5 ml-auto flex-shrink-0 items-end">
                        {[3, 6, 4, 7, 3, 5, 4].map((h, j) => (
                          <span key={j} className="rounded-full animate-bounce inline-block"
                            style={{ width: 2.5, height: h, background: color, animationDelay: `${j * 55}ms`, animationDuration: '0.7s' }} />
                        ))}
                      </span>
                    )}
                  </div>
                  <p className="text-xs leading-relaxed transition-colors duration-300"
                    style={{ color: esHablando ? '#f3f4f6' : '#9ca3af' }}>
                    {arg.argumento}
                  </p>
                  {esHablando && (
                    <div className="mt-2 h-0.5 rounded-full overflow-hidden" style={{ background: `${color}30` }}>
                      <div className="h-full rounded-full animate-pulse" style={{ background: color, width: '60%' }} />
                    </div>
                  )}
                </div>
              )
            })}
            {/* Rondas de réplica */}
            {rondas.map((ronda, ri) => (
              <div key={`ronda-${ri}`} className="space-y-2">
                <div className="rounded-xl p-3 bg-blue-950/30 border-l-2 border-blue-600">
                  <p className="text-xs text-blue-400 font-semibold mb-1">Tú</p>
                  <p className="text-xs text-gray-300 leading-relaxed">{ronda.replica}</p>
                </div>
                {ronda.respuestas.map((resp, si) => {
                  const color2 = COLOR_HEX[resp.agente_rol] || '#6b7280'
                  return (
                    <div key={si} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', borderLeft: `3px solid ${color2}` }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: color2 }}>{resp.agente_rol}</p>
                      <p className="text-xs text-gray-300 leading-relaxed">{resp.argumento}</p>
                    </div>
                  )
                })}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        </div>
      )}

      </div>{/* fin flex-row zona principal */}

      {/* ── Barra de controles inferior ─────────────────────────────────────── */}
      <div className="flex-shrink-0 bg-gray-900/95 border-t border-gray-800 px-3 md:px-4 py-2 md:py-3">
        {/* Error de cámara */}
        {errorCamara && (
          <p className="text-center text-xs text-yellow-400 mb-1">{errorCamara}</p>
        )}

        {/* Durante debate */}
        {faseInteraccion === 'debatiendo' && (
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {/* Cámara toggle */}
            <button onClick={toggleCamara}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${camaraActiva ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={camaraActiva ? 'Apagar cámara' : 'Encender cámara'}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {camaraActiva
                  ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  : <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>}
              </svg>
            </button>
            <div className="w-px h-6 bg-gray-700" />
            <button onClick={togglePausa}
              className={`text-xs border px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5 ${pausado ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-gray-600 text-gray-300 hover:border-blue-500 hover:text-blue-300'}`}>
              {pausado ? '▶ Reanudar' : '⏸ Pausar'}
            </button>
            <button onClick={toggleSilencio}
              className={`text-xs border px-4 py-2 rounded-lg transition font-medium flex items-center gap-1.5 ${silenciado ? 'border-yellow-600 bg-yellow-900/20 text-yellow-400' : 'border-gray-600 text-gray-300 hover:text-white'}`}>
              {silenciado ? '🔇 Silenciado' : '🔊 Silenciar'}
            </button>
            {agenteHablandoIdx !== null && (
              <button onClick={saltarHablando}
                className="text-xs text-gray-400 hover:text-white border border-gray-600 px-4 py-2 rounded-lg transition">
                ⏭ Saltar
              </button>
            )}
            <p className="text-xs text-gray-600">{cargando ? ESTADOS_LABEL[estado] : 'Finalizando...'}</p>
          </div>
        )}

        {/* Después del debate — elegir acción */}
        {faseInteraccion === 'preguntando' && (
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {/* Controles de media del usuario */}
            <button onClick={toggleCamara}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${camaraActiva ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={camaraActiva ? 'Apagar cámara' : 'Encender cámara'}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {camaraActiva
                  ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                  : <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>}
              </svg>
            </button>
            <button onClick={toggleSilencio}
              className={`w-9 h-9 rounded-full flex items-center justify-center transition ${silenciado ? 'bg-yellow-700 hover:bg-yellow-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              title={silenciado ? 'Activar sonido' : 'Silenciar'}>
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {silenciado
                  ? <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>}
              </svg>
            </button>
            <div className="w-px h-8 bg-gray-700" />
            <p className="text-sm text-gray-400">Ronda completada — ¿deseas intervenir o cerrar el debate?</p>
            <button onClick={() => setFaseInteraccion('interviniendo')}
              className="bg-blue-700 hover:bg-blue-600 text-white text-sm font-medium px-5 py-2 rounded-xl transition">
              Intervenir
            </button>
            <button onClick={generarConsensoFinal}
              className="bg-purple-700 hover:bg-purple-600 text-white text-sm font-semibold px-5 py-2 rounded-xl transition">
              Cerrar debate y generar consenso →
            </button>
          </div>
        )}

        {previewReplica && <MicPreviewModal text={previewReplica} onConfirm={confirmPreviewReplica} onRetry={retryMicReplica} onCancel={cancelPreviewReplica} />}

        {/* Intervención activa */}
        {faseInteraccion === 'interviniendo' && (
          <div className="flex flex-col gap-2 max-w-3xl mx-auto">
          {(grabandoReplica || transcribiendoReplica) && (
            <MicAudioBar level={audioLevelReplica} grabando={grabandoReplica} transcribiendo={transcribiendoReplica} />
          )}
          {errorMicReplica && <p className="text-yellow-400 text-xs">{errorMicReplica}</p>}
          <div className="flex gap-2 items-end">
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
              className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition ${grabandoReplica ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40'}`}>
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
          </div>
        )}
      </div>
    </main>
  )
}
