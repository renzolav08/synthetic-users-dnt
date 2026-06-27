'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useExplorarStore, type PerfilSintetico } from '@/store/useExplorarStore'

const SIMLI_KEY = process.env.NEXT_PUBLIC_SIMLI_API_KEY ?? ''
const SIMLI_FACE_FEMENINO  = process.env.NEXT_PUBLIC_SIMLI_FACE_F ?? 'tmp9i8bbq7c'
const SIMLI_FACE_MASCULINO = process.env.NEXT_PUBLIC_SIMLI_FACE_M ?? 'tmp9i8bbq7c'
const SIMLI_IMG_F = process.env.NEXT_PUBLIC_SIMLI_IMG_F ?? ''
const SIMLI_IMG_M = process.env.NEXT_PUBLIC_SIMLI_IMG_M ?? ''
function getAvatarImg(genero?: string, fotoUrl?: string) {
  if (SIMLI_IMG_F || SIMLI_IMG_M) {
    return genero === 'masculino' ? (SIMLI_IMG_M || fotoUrl || '') : (SIMLI_IMG_F || fotoUrl || '')
  }
  return fotoUrl || ''
}

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// ── Web Audio API para amplitud en tiempo real ────────────────────────────────
let audioActivo: HTMLAudioElement | null = null
let audioCtx: AudioContext | null = null

function reproducir(
  wavB64: string,
  onEnd: () => void,
  onAmplitud?: (v: number) => void,
) {
  if (audioActivo) { audioActivo.pause(); audioActivo.onended = null; audioActivo = null }

  const el = new Audio(`data:audio/wav;base64,${wavB64}`)
  audioActivo = el

  if (onAmplitud) {
    try {
      if (!audioCtx || audioCtx.state === 'closed') audioCtx = new AudioContext()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 256
      const source = audioCtx.createMediaElementSource(el)
      source.connect(analyser)
      analyser.connect(audioCtx.destination)

      const data = new Uint8Array(analyser.frequencyBinCount)
      let activo = true
      ;(function loop() {
        if (!activo) return
        analyser.getByteFrequencyData(data)
        // Promedio de frecuencias medias (voz ~300-3000 Hz)
        const slice = data.slice(2, 20)
        const avg = slice.reduce((s, v) => s + v, 0) / slice.length
        onAmplitud(avg / 255)
        requestAnimationFrame(loop)
      })()

      el.onended = () => { activo = false; audioActivo = null; onAmplitud(0); onEnd() }
    } catch {
      // Fallback sin análisis
      el.play().catch(() => {})
      el.onended = () => { audioActivo = null; onEnd() }
      return
    }
  } else {
    el.onended = () => { audioActivo = null; onEnd() }
  }

  el.play().catch(() => {})
}

// Lanza TTS en paralelo al procesamiento — la promesa resuelve con wav_base64
async function pedirTTS(texto: string, genero: string): Promise<{ wav: string | null; pcm: string | null }> {
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

export type Mensaje = { rol: 'emprendedor' | 'perfil'; contenido: string }

interface Props {
  perfil: PerfilSintetico
  convKey: string
  idea: string
  onColgar: () => void
  supuestosActivos?: { id: string; enunciado: string }[]
  onInsights?: (insights: unknown) => void
  onSupuestosEvaluados?: (evs: { supuesto_id: string; veredicto: string }[]) => void
}

export default function LlamadaExploracion({
  perfil,
  convKey,
  idea,
  onColgar,
  supuestosActivos,
  onInsights,
  onSupuestosEvaluados,
}: Props) {
  // Lee historial directamente del store — se persiste en localStorage automáticamente
  const { historialPor, addMensaje, setInsights: storeSetInsights } = useExplorarStore()
  const historial = historialPor[convKey] ?? []
  const [pensando, setPensando] = useState(false)
  const [hablando, setHablando] = useState(false)
  const [amplitud, setAmplitud] = useState(0)
  const amplitudRef = useRef(0)
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [subtitulo, setSubtitulo] = useState('')
  const [subtituloUsuario, setSubtituloUsuario] = useState('')
  const [duracionLlamada, setDuracionLlamada] = useState(0)
  const [camaraActiva, setCamaraActiva] = useState(false)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const camaraStreamRef = useRef<MediaStream | null>(null)
  const videoUsuarioRef = useRef<HTMLVideoElement>(null)
  const simliVideoRef = useRef<HTMLVideoElement>(null)
  const simliAudioRef = useRef<HTMLAudioElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simliRef = useRef<any>(null)
  const [simliConectado, setSimliConectado] = useState(false)
  const [simliError, setSimliError] = useState<string | null>(null)
  const simliConectadoRef = useRef(false)
  const enviarRef = useRef<(t: string) => void>(() => {})
  const inicioRef = useRef(Date.now())

  // Cronómetro
  useEffect(() => {
    const iv = setInterval(() => setDuracionLlamada(Math.floor((Date.now() - inicioRef.current) / 1000)), 1000)
    return () => clearInterval(iv)
  }, [])

  // Simli v3 — generar session token, luego conectar
  useEffect(() => {
    if (!SIMLI_KEY || typeof window === 'undefined') return
    if (!simliVideoRef.current || !simliAudioRef.current) return
    let destroyed = false
    async function initSimli() {
      try {
        const { SimliClient, generateSimliSessionToken, generateIceServers } = await import('simli-client')
        if (destroyed) return
        const faceId = (perfil as PerfilSintetico & { simli_face_id?: string }).simli_face_id
          ?? (perfil.genero === 'masculino' ? SIMLI_FACE_MASCULINO : SIMLI_FACE_FEMENINO)

        // 1. Generar session token
        const { session_token } = await generateSimliSessionToken({
          apiKey: SIMLI_KEY,
          config: { faceId, handleSilence: true, maxSessionLength: 600, maxIdleTime: 120 },
        })
        if (destroyed) return

        // 2. Obtener ICE servers
        const iceServers = await generateIceServers(SIMLI_KEY)
        if (destroyed) return

        // 3. Crear cliente y conectar
        const simli = new SimliClient(
          session_token,
          simliVideoRef.current!,
          simliAudioRef.current!,
          iceServers,
        )
        simliRef.current = simli
        await simli.start()
        if (!destroyed) { setSimliConectado(true); simliConectadoRef.current = true }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        console.error('[Simli] Error:', msg)
        setSimliError(msg)
      }
    }
    initSimli()
    return () => {
      destroyed = true
      try { simliRef.current?.stop() } catch { /* ignorar */ }
      setSimliConectado(false); simliConectadoRef.current = false
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function formatTiempo(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const ss = (s % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
  }

  const enviarMensaje = useCallback(async (texto: string) => {
    if (!texto.trim() || pensando || hablando) return
    // Escribe directo al store → persiste en localStorage inmediatamente
    addMensaje(convKey, { rol: 'emprendedor', contenido: texto })
    setSubtituloUsuario(texto)
    setPensando(true)
    setTimeout(() => setSubtituloUsuario(''), 3000)

    try {
      const histActual = [...historial, { rol: 'emprendedor' as const, contenido: texto }]

      const res = await fetch(`${API}/explorar/conversar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          perfil,
          idea_texto: idea,
          historial: histActual,
          pregunta: texto,
          supuestos_activos: supuestosActivos?.length ? supuestosActivos : null,
        }),
      })
      const data = await res.json()
      const respuesta: string = data.respuesta ?? ''

      // Persiste la respuesta del perfil inmediatamente
      addMensaje(convKey, { rol: 'perfil', contenido: respuesta })
      setPensando(false)
      setSubtitulo(respuesta)

      // Lanza TTS en paralelo con el procesamiento de insights para reducir latencia
      const [{ wav, pcm }] = await Promise.all([
        pedirTTS(respuesta, perfil.genero ?? 'femenino'),
        Promise.resolve().then(() => {
          if (data.insights_jtbd) { storeSetInsights(convKey, data.insights_jtbd); onInsights?.(data.insights_jtbd) }
          if (data.supuestos_evaluados?.length) onSupuestosEvaluados?.(data.supuestos_evaluados)
        }),
      ])
      if (wav) {
        setHablando(true)
        if (simliConectadoRef.current && simliRef.current && pcm) {
          // Simli maneja audio + video — no reproducir WAV por separado
          try {
            const bin = atob(pcm)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            simliRef.current.sendAudioData(bytes)
          } catch { /* ignorar */ }
          // Estimar duración para ocultar subtítulo
          const durMs = (atob(pcm).length / 2 / 16000) * 1000 + 500
          setTimeout(() => { setHablando(false); setAmplitud(0); amplitudRef.current = 0; setSubtitulo('') }, durMs)
        } else {
          // Fallback sin Simli — reproducir WAV normal
          reproducir(wav, () => { setHablando(false); setAmplitud(0); amplitudRef.current = 0; setSubtitulo('') }, (v) => { setAmplitud(v); amplitudRef.current = v })
        }
      } else {
        setSubtitulo('')
      }
    } catch {
      addMensaje(convKey, { rol: 'perfil', contenido: '(Error al conectar)' })
      setPensando(false); setSubtitulo('')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial, pensando, hablando, convKey, perfil, idea, supuestosActivos])

  // Mantener ref fresca
  enviarRef.current = enviarMensaje

  function toggleMic() {
    if (grabando) { mediaRecorderRef.current?.stop(); return }
    // No grabar mientras el avatar habla — evita transcribir el audio del altavoz
    if (hablando) return
    if (!navigator.mediaDevices?.getUserMedia) return

    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
    })
      .then(stream => {
        const chunks: BlobPart[] = []
        const inicioGrabacion = Date.now()
        const rec = new MediaRecorder(stream)
        mediaRecorderRef.current = rec
        rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }
        rec.onstop = async () => {
          stream.getTracks().forEach(t => t.stop())
          setGrabando(false)
          const duracion = Date.now() - inicioGrabacion
          // Ignorar grabaciones muy cortas — probablemente click accidental o silencio
          if (duracion < 800) { setTranscribiendo(false); return }
          setTranscribiendo(true)
          try {
            const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })
            // Ignorar blobs muy pequeños — silencio o ruido
            if (blob.size < 5000) { setTranscribiendo(false); return }
            const form = new FormData()
            form.append('file', blob, 'audio.webm')
            const r = await fetch(`${API}/transcribir`, { method: 'POST', body: form })
            const { texto } = await r.json()
            if (texto?.trim()) enviarRef.current(texto.trim())
          } catch { /* ignorar */ }
          finally { setTranscribiendo(false) }
        }
        rec.start()
        setGrabando(true)
      })
      .catch(() => {})
  }

  function toggleCamara() {
    if (camaraActiva) {
      camaraStreamRef.current?.getTracks().forEach(t => t.stop())
      camaraStreamRef.current = null
      if (videoUsuarioRef.current) videoUsuarioRef.current.srcObject = null
      setCamaraActiva(false)
      return
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        camaraStreamRef.current = stream
        if (videoUsuarioRef.current) videoUsuarioRef.current.srcObject = stream
        setCamaraActiva(true)
      })
      .catch(() => {})
  }

  // Limpiar cámara al desmontar
  useEffect(() => {
    return () => {
      camaraStreamRef.current?.getTracks().forEach(t => t.stop())
      if (audioActivo) { audioActivo.pause(); audioActivo = null }
    }
  }, [])

  function colgar() {
    if (audioActivo) { audioActivo.pause(); audioActivo = null }
    mediaRecorderRef.current?.stop()
    camaraStreamRef.current?.getTracks().forEach(t => t.stop())
    onColgar()
  }

  const fallbackUrl = `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(perfil.nombre)}`
  const avatarImg = getAvatarImg(perfil.genero, perfil.foto_url) || fallbackUrl

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col overflow-hidden">

      {/* Barra superior */}
      <div className="flex-shrink-0 h-12 bg-black/80 flex items-center justify-center z-20">
        <span className="text-green-400 text-sm font-mono bg-black/60 px-4 py-1 rounded-full">
          ● {formatTiempo(duracionLlamada)}
        </span>
      </div>

      {/* Split-screen — ocupa todo el espacio disponible */}
      <div className="flex flex-1 overflow-hidden">

        {/* Mitad izquierda — usuario sintético */}
        <div className="w-1/2 relative bg-gray-950 border-r border-gray-800 overflow-hidden">

          {/* Fondo mientras Simli conecta — iniciales sobre gradiente oscuro */}
          <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${simliConectado ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
            style={{ background: 'linear-gradient(160deg, #1a1f2e 0%, #111827 100%)' }}>
            <div className="w-32 h-32 rounded-full bg-gray-700/60 flex items-center justify-center mb-4 border border-gray-600/40">
              <span className="text-4xl font-bold text-gray-300 select-none">
                {perfil.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            {!simliError && (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            )}
          </div>
          {/* Video Simli — siempre visible cuando conectado */}
          <video
            ref={simliVideoRef}
            autoPlay
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${simliConectado ? 'opacity-100' : 'opacity-0'}`}
          />
          <audio ref={simliAudioRef} autoPlay className="hidden" />

          {/* Glow verde al hablar */}
          {hablando && (
            <div className="absolute inset-0 pointer-events-none animate-pulse"
              style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(74,222,128,0.12) 100%)' }}
            />
          )}

          {/* Badge estado Simli — debug */}
          <div className="absolute top-3 right-3 z-30">
            {simliConectado
              ? <span className="bg-green-700/80 text-green-200 text-xs px-2 py-0.5 rounded-full">Simli ✓</span>
              : simliError
              ? <span className="bg-red-800/80 text-red-200 text-xs px-2 py-0.5 rounded-full" title={simliError}>Simli ✗</span>
              : SIMLI_KEY
              ? <span className="bg-yellow-800/80 text-yellow-200 text-xs px-2 py-0.5 rounded-full">Simli...</span>
              : <span className="bg-gray-700/80 text-gray-400 text-xs px-2 py-0.5 rounded-full">Sin key</span>
            }
          </div>

          {/* Gradiente inferior */}
          <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-black/80 to-transparent pointer-events-none z-10" />

          {/* Nombre + pensando */}
          <div className="absolute bottom-20 left-0 right-0 px-6 z-20">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-white font-semibold text-lg drop-shadow">{perfil.nombre}</p>
              {pensando && !hablando && (
                <div className="flex items-center gap-1 ml-1">
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              )}
            </div>
            <p className="text-gray-400 text-sm drop-shadow">{perfil.ocupacion} · {perfil.ubicacion}</p>
          </div>

          {/* Subtítulo */}
          {subtitulo && (
            <div className="absolute bottom-0 inset-x-0 px-5 pb-4 z-20">
              <div className="bg-black/60 backdrop-blur rounded-xl px-4 py-2.5">
                <p className="text-white text-sm leading-relaxed text-center">{subtitulo}</p>
              </div>
            </div>
          )}
        </div>

        {/* Mitad derecha — cámara del usuario */}
        <div className="w-1/2 relative bg-gray-900 flex flex-col items-center justify-center">

          {/* Video real */}
          <video
            ref={videoUsuarioRef}
            autoPlay
            muted
            playsInline
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${camaraActiva ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Placeholder sin cámara */}
          {!camaraActiva && (
            <div className="flex flex-col items-center gap-4 z-10">
              <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
                </svg>
              </div>
              <p className="text-gray-500 text-sm">Cámara apagada</p>
              <button
                onClick={toggleCamara}
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-5 py-2 rounded-xl transition"
              >
                Encender cámara
              </button>
            </div>
          )}

          {/* Nombre del usuario */}
          <div className="absolute bottom-6 left-4">
            <div className="bg-black/60 backdrop-blur rounded-lg px-3 py-1.5 flex items-center gap-2">
              <p className="text-white text-sm font-medium">Tú</p>
              {grabando && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
          </div>

          {/* Subtítulo del usuario */}
          {subtituloUsuario && (
            <div className="absolute top-6 left-4 right-4">
              <div className="bg-blue-900/70 backdrop-blur border border-blue-700/50 rounded-xl px-5 py-2.5 text-center">
                <p className="text-blue-100 text-sm leading-relaxed">{subtituloUsuario}</p>
              </div>
            </div>
          )}
          {transcribiendo && (
            <div className="absolute top-6 left-4 right-4">
              <p className="text-gray-400 text-sm text-center">Transcribiendo...</p>
            </div>
          )}
        </div>
      </div>

      {/* Barra de controles inferior */}
      <div className="flex-shrink-0 h-24 bg-black/90 flex items-center justify-center gap-5 z-20">

        {/* Micrófono */}
        <button
          onClick={toggleMic}
          disabled={pensando || hablando || transcribiendo}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
            grabando
              ? 'bg-red-600 hover:bg-red-500 ring-4 ring-red-400/40'
              : 'bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed'
          }`}
          title={grabando ? 'Detener grabación' : 'Hablar'}
        >
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            {grabando
              ? <rect x="6" y="6" width="12" height="12" rx="2" />
              : <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 14.93A7 7 0 0 1 5 9H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.07A9 9 0 0 0 21 9h-2a7 7 0 0 1-6 6.93z"/>
            }
          </svg>
        </button>

        {/* Cámara */}
        <button
          onClick={toggleCamara}
          className={`w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg ${
            camaraActiva ? 'bg-blue-600 hover:bg-blue-500' : 'bg-gray-700 hover:bg-gray-600'
          }`}
          title={camaraActiva ? 'Apagar cámara' : 'Encender cámara'}
        >
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            {camaraActiva
              ? <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
              : <path d="M21 6.5l-4 4V7c0-.55-.45-1-1-1H9.82L21 17.18V6.5zM3.27 2L2 3.27 4.73 6H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.21 0 .39-.08.54-.18L19.73 21 21 19.73 3.27 2z"/>
            }
          </svg>
        </button>

        {/* Colgar */}
        <button
          onClick={colgar}
          className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-all shadow-xl"
          title="Terminar llamada"
        >
          <svg className="w-7 h-7 text-white rotate-135" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
          </svg>
        </button>

        {/* Escribir */}
        <TextoRapido onEnviar={t => enviarRef.current(t)} disabled={pensando || hablando} />
      </div>
    </div>
  )
}

// Botón de texto rápido — se expande al hacer click
function TextoRapido({ onEnviar, disabled }: { onEnviar: (t: string) => void; disabled: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')

  function enviar() {
    if (!texto.trim()) return
    onEnviar(texto.trim())
    setTexto('')
    setAbierto(false)
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className="w-14 h-14 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-40 flex items-center justify-center transition-all shadow-lg"
        title="Escribir mensaje"
      >
        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72A8.878 8.878 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-2xl px-3 py-2">
      <input
        autoFocus
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') enviar(); if (e.key === 'Escape') setAbierto(false) }}
        placeholder="Escribe algo..."
        className="bg-transparent text-white text-sm outline-none w-52 placeholder-gray-500"
      />
      <button onClick={enviar} className="text-blue-400 hover:text-blue-300 text-sm font-medium">Enviar</button>
      <button onClick={() => setAbierto(false)} className="text-gray-500 hover:text-gray-400 text-xs">✕</button>
    </div>
  )
}
