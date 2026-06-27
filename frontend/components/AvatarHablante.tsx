'use client'

import { useEffect, useRef, useState } from 'react'

const SIMLI_KEY = process.env.NEXT_PUBLIC_SIMLI_API_KEY ?? ''
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

// Audio global — solo uno reproduce a la vez
let audioGlobal: HTMLAudioElement | null = null
function reproducirAudio(src: string, onEnd: () => void) {
  if (audioGlobal) {
    audioGlobal.pause()
    audioGlobal.onended = null
    audioGlobal = null
  }
  const el = new Audio(src)
  audioGlobal = el
  el.play().catch(() => {})
  el.onended = () => { audioGlobal = null; onEnd() }
}

// Solo el face ID confirmado como válido en el free tier de Simli
const FACE_ID = 'tmp9i8bbq7c'

interface Props {
  fotoUrl: string
  genero?: 'masculino' | 'femenino'
  nombre: string
  textoParaHablar?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function AvatarHablante({
  fotoUrl,
  genero = 'masculino',
  nombre,
  textoParaHablar,
  size = 'md',
  className = '',
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioSimliRef = useRef<HTMLAudioElement>(null)
  const simliRef = useRef<InstanceType<typeof import('simli-client').SimliClient> | null>(null)
  const [hablando, setHablando] = useState(false)
  const [simliConectado, setSimliConectado] = useState(false)
  const textoAnteriorRef = useRef<string>('')

  const dim = { sm: 'w-12 h-12', md: 'w-16 h-16', lg: 'w-24 h-24' }[size]

  // Simli deshabilitado en AvatarHablante — usar LlamadaExploracion para videollamadas
  useEffect(() => { setSimliConectado(false) }, [])

  // Hablar cuando llega nuevo texto
  useEffect(() => {
    if (!textoParaHablar || textoParaHablar === textoAnteriorRef.current) return

    textoAnteriorRef.current = textoParaHablar

    async function hablar() {
      setHablando(true)
      try {
        const res = await fetch(`${API}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texto: textoParaHablar ?? '', genero }),
        })
        if (!res.ok) throw new Error('TTS error')

        const { audio_base64, wav_base64 } = await res.json()

        // ── Reproducción directa — cancela audio previo automáticamente ──────
        if (wav_base64) {
          reproducirAudio(`data:audio/wav;base64,${wav_base64}`, () => setHablando(false))
        }

        // ── Animación Simli si está conectado (bonus) ────────────────────────
        if (simliConectado && simliRef.current && audio_base64) {
          const binary = atob(audio_base64)
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          simliRef.current.sendAudioData(bytes)
        } else if (!wav_base64) {
          // Fallback de duración si no hay WAV
          const ms = (atob(audio_base64 ?? '').length / 2 / 16000) * 1000 + 800
          setTimeout(() => setHablando(false), ms)
        }
      } catch {
        setHablando(false)
      }
    }

    hablar()
  }, [textoParaHablar, simliConectado, genero])

  const fallbackUrl = `https://api.dicebear.com/9.x/personas/svg?seed=${encodeURIComponent(nombre)}`

  return (
    <div className={`relative ${dim} rounded-full overflow-hidden flex-shrink-0 ${className}`}>
      {/* Foto del perfil — siempre visible cuando no habla */}
      <img
        src={fotoUrl || fallbackUrl}
        alt={nombre}
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          simliConectado && hablando ? 'opacity-0' : 'opacity-100'
        }`}
        onError={e => { (e.target as HTMLImageElement).src = fallbackUrl }}
      />

      {/* Video Simli — solo visible cuando habla y está conectado */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
          simliConectado && hablando ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <audio ref={audioSimliRef} autoPlay className="hidden" />

      {/* Indicador de voz activa */}
      {hablando && (
        <div className="absolute bottom-0 inset-x-0 flex justify-center items-end gap-0.5 pb-1">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className="w-0.5 bg-green-400 rounded-full animate-bounce"
              style={{ height: 6 + i * 2, animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
