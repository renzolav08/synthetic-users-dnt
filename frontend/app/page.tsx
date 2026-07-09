'use client'

import { useState, useEffect, useCallback } from 'react'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useSupuestosStore } from '@/store/useSupuestosStore'
import { useRouter } from 'next/navigation'
import { useMic } from '@/hooks/useMic'
import { MicPreviewModal } from '@/components/MicPreviewModal'
import { MicAudioBar } from '@/components/MicAudioBar'
import { beep } from '@/utils/beep'

const PAISES: { nombre: string; bandera: string }[] = [
  { nombre: 'Perú',      bandera: '🇵🇪' },
  { nombre: 'México',    bandera: '🇲🇽' },
  { nombre: 'Colombia',  bandera: '🇨🇴' },
  { nombre: 'Argentina', bandera: '🇦🇷' },
  { nombre: 'Chile',     bandera: '🇨🇱' },
  { nombre: 'Ecuador',   bandera: '🇪🇨' },
  { nombre: 'Bolivia',   bandera: '🇧🇴' },
  { nombre: 'Venezuela', bandera: '🇻🇪' },
  { nombre: 'Uruguay',   bandera: '🇺🇾' },
  { nombre: 'Paraguay',  bandera: '🇵🇾' },
  { nombre: 'España',    bandera: '🇪🇸' },
]

// Mapeo de código ISO → nombre en español usado en el sistema
const PAIS_POR_CODIGO: Record<string, string> = {
  PE: 'Perú', MX: 'México', CO: 'Colombia', AR: 'Argentina',
  CL: 'Chile', EC: 'Ecuador', BO: 'Bolivia', VE: 'Venezuela',
  UY: 'Uruguay', PY: 'Paraguay', ES: 'España',
}

export default function Home() {
  const [texto, setTexto] = useState('')
  const [pais, setPais] = useState('Perú')
  const [detectandoPais, setDetectandoPais] = useState(true)
  const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

  const handleMicSend = useCallback((transcrito: string) => {
    setTexto(prev => prev ? prev + ' ' + transcrito : transcrito)
  }, [])

  const { grabando, transcribiendo, audioLevel, errorMic, preview, toggleMic, confirmPreview, cancelPreview, retryMic } = useMic({
    apiUrl: API,
    onSend: handleMicSend,
    onBeepStart: () => beep('inicio'),
    onBeepEnd: () => beep('fin'),
  })
  const { estado, setEstado } = useDebateStore()
  const explorarStore = useExplorarStore()
  const supuestosStore = useSupuestosStore()
  const sesionActiva = !!explorarStore.idea && explorarStore.stakeholders.length > 0
  const mensajesEnSesion = Object.values(explorarStore.historialPor).reduce((s, h) => s + h.length, 0)
  const router = useRouter()
  const cargando = false

  useEffect(() => {
    // Si el debate quedó en progreso al volver al home, resetear a idle
    if (estado !== 'idle' && estado !== 'error') setEstado('idle')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then(r => r.json())
      .then(data => {
        const detected = PAIS_POR_CODIGO[data.country_code]
        if (detected) setPais(detected)
      })
      .catch(() => {})
      .finally(() => setDetectandoPais(false))
  }, [])

  function explorarPrimero() {
    if (!texto.trim() || texto.trim().length < 20) return
    explorarStore.reset()
    supuestosStore.reset()
    explorarStore.setIdea(texto, '', pais)
    router.push('/explorar')
  }

  return (
    <main className="min-h-full bg-gray-950 text-white flex flex-col items-center justify-center px-4 pt-14 md:pt-0">
      {preview && <MicPreviewModal text={preview} onConfirm={confirmPreview} onRetry={retryMic} onCancel={cancelPreview} />}

      {/* Header */}
      <div className="mb-8 md:mb-12 text-center px-2">
        <div className="inline-flex items-center gap-2 bg-blue-950 border border-blue-800 rounded-full px-3 py-1 md:px-4 md:py-1.5 text-blue-300 text-xs md:text-sm mb-4 md:mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Sistema Multiagente
        </div>
        <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 md:mb-4 tracking-tight">
          Evalúa tu idea de negocio
        </h1>
        <p className="text-gray-400 text-sm md:text-lg max-w-xl">
          Expón tu idea libremente. Una suite de agentes especializados
          la debatirá desde múltiples perspectivas críticas.
        </p>
      </div>

      {/* Card principal */}
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">

        <label className="block text-sm text-gray-400 mb-2">
          Cuéntanos tu idea de negocio
        </label>

        <div className="relative">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            disabled={cargando}
            placeholder={grabando ? '🎤 Grabando... da click al micrófono para terminar' : transcribiendo ? 'Transcribiendo...' : 'Ej: Quiero crear una app que conecte a dueños de bodegas con proveedores mayoristas para hacer pedidos directos sin intermediarios...'}
            rows={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-14 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition disabled:opacity-50 text-sm leading-relaxed"
          />
          <button
            type="button"
            onClick={toggleMic}
            disabled={transcribiendo}
            title={grabando ? 'Detener grabación' : 'Dictar idea por voz'}
            className={`absolute bottom-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all ${
              grabando
                ? 'bg-red-600 hover:bg-red-500 shadow-lg shadow-red-900/50'
                : transcribiendo
                ? 'bg-gray-600 opacity-60 cursor-not-allowed'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            {transcribiendo ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                {grabando ? (
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                ) : (
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 14.93A7 7 0 0 1 5 9H3a9 9 0 0 0 8 8.94V21H9v2h6v-2h-2v-2.07A9 9 0 0 0 21 9h-2a7 7 0 0 1-6 6.93z"/>
                )}
              </svg>
            )}
          </button>
        </div>
        {(grabando || transcribiendo) && (
          <div className="mt-2">
            <MicAudioBar level={audioLevel} grabando={grabando} transcribiendo={transcribiendo} />
          </div>
        )}
        {errorMic && <p className="mt-2 text-xs text-red-400">{errorMic}</p>}

        {/* Selector de país */}
        <div className="flex items-center gap-2 mt-3 mb-1">
          <label className="text-xs text-gray-500 flex-shrink-0">
            País de operación
            {detectandoPais && <span className="ml-1 text-gray-600">· detectando...</span>}
          </label>
          <select
            value={pais}
            onChange={e => setPais(e.target.value)}
            disabled={detectandoPais}
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600 transition disabled:opacity-50"
          >
            {PAISES.map(p => (
              <option key={p.nombre} value={p.nombre}>{p.bandera} {p.nombre}</option>
            ))}
          </select>
        </div>

        {/* Contador de palabras */}
        <div className="flex justify-between items-center mt-2 mb-5">
          <span className="text-xs text-gray-500">
            {texto.trim().length < 20 && texto.length > 0
              ? 'Escribe al menos 20 caracteres para continuar'
              : texto.trim().length >= 20
              ? '✓ Listo para evaluar'
              : 'Describe tu idea con el mayor detalle posible'}
          </span>
          <span className={`text-xs ${texto.length > 500 ? 'text-yellow-400' : 'text-gray-500'}`}>
            {texto.length} caracteres
          </span>
        </div>

        {/* Botones */}
        <div className="flex flex-col gap-3">
          <button
            onClick={explorarPrimero}
            disabled={cargando || texto.trim().length < 20}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-sm"
          >
            Explorar con usuarios sintéticos
          </button>
        </div>

        {/* Descripción del flujo */}
        {!cargando && texto.trim().length >= 20 && (
          <p className="text-center text-xs text-gray-600 mt-4">
            Paso 1: entrevistas · Paso 2: síntesis · Paso 3: debate multiagente
          </p>
        )}

        {/* Sesión en progreso */}
        {sesionActiva && (
          <div className="mt-4 bg-blue-950/40 border border-blue-800 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
                <p className="text-blue-300 text-xs font-semibold">Exploración en progreso</p>
              </div>
              <p className="text-gray-400 text-xs truncate">
                {explorarStore.idea.slice(0, 80)}{explorarStore.idea.length > 80 ? '…' : ''}
              </p>
              <p className="text-gray-600 text-xs mt-0.5">
                {explorarStore.stakeholders.length} segmentos · {mensajesEnSesion} mensajes
              </p>
            </div>
            <button
              onClick={() => router.push('/explorar')}
              className="flex-shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
            >
              Retomar →
            </button>
          </div>
        )}
      </div>


      {/* Link al historial */}
      <div className="mt-6">
        <a
          href="/historial"
          className="text-xs text-gray-600 hover:text-gray-400 transition underline underline-offset-2"
        >
          Ver historial →
        </a>
      </div>

    </main>
  )
}