import { useRef, useState, useCallback } from 'react'

const MIN_BLOB_SIZE = 6000
const MIN_WORDS = 1
const SILENCE_THRESHOLD = 20
const SILENCE_TIMEOUT_MS = 2800
const FETCH_TIMEOUT_MS = 30000
const BASELINE_MS = 600      // ms iniciales para medir ruido ambiente
const SPEECH_RATIO = 2.5     // la voz debe ser 2.5x más fuerte que el ruido base

interface UseMicOptions {
  apiUrl: string
  onSend: (text: string) => void
  onBeepStart?: () => void
  onBeepEnd?: () => void
  skipPreview?: boolean
}

export function useMic({ apiUrl, onSend, onBeepStart, onBeepEnd, skipPreview = false }: UseMicOptions) {
  const [grabando, setGrabando] = useState(false)
  const [transcribiendo, setTranscribiendo] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [errorMic, setErrorMic] = useState('')
  const [preview, setPreview] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const animFrameRef = useRef<number>(0)
  const silenceStartRef = useRef<number | null>(null)
  const maxLevelRef = useRef<number>(0)     // nivel máximo captado durante la grabación
  const baselineRef = useRef<number>(0)     // ruido ambiente medido al inicio
  const baselineSamplesRef = useRef<number[]>([])

  const _stopAll = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current)
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setAudioLevel(0)
  }, [])

  const _startLevelMonitor = useCallback(
    (stream: MediaStream, onSilenceTimeout: () => void) => {
      try {
        const ctx = new AudioContext()
        audioCtxRef.current = ctx
        ctx.resume().catch(() => {})
        const source = ctx.createMediaStreamSource(stream)
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 256
        source.connect(analyser)
        const data = new Uint8Array(analyser.frequencyBinCount)
        silenceStartRef.current = null

        const startTime = Date.now()
        const tick = () => {
          analyser.getByteFrequencyData(data)
          const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length)
          setAudioLevel(Math.min(100, rms * 2.5))

          const elapsed = Date.now() - startTime
          if (elapsed < BASELINE_MS) {
            // Primeros 600ms: medir ruido ambiente
            baselineSamplesRef.current.push(rms)
            const samples = baselineSamplesRef.current
            baselineRef.current = samples.reduce((s, v) => s + v, 0) / samples.length
          } else {
            // Resto: rastrear nivel máximo
            if (rms > maxLevelRef.current) maxLevelRef.current = rms
          }

          if (rms < SILENCE_THRESHOLD) {
            if (silenceStartRef.current === null) silenceStartRef.current = Date.now()
            else if (Date.now() - silenceStartRef.current > SILENCE_TIMEOUT_MS) {
              onSilenceTimeout()
              return
            }
          } else {
            silenceStartRef.current = null
          }
          animFrameRef.current = requestAnimationFrame(tick)
        }
        animFrameRef.current = requestAnimationFrame(tick)
      } catch {
        // AudioContext no disponible
      }
    },
    []
  )

  const stopGrabacion = useCallback(() => {
    onBeepEnd?.()
    mediaRecorderRef.current?.stop()
  }, [onBeepEnd])

  const startGrabacion = useCallback(async () => {
    setErrorMic('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMic('Tu navegador no soporta grabación de audio.')
      return
    }

    maxLevelRef.current = 0
    baselineRef.current = 0
    baselineSamplesRef.current = []
    // Beep ANTES del await para estar dentro del gesto del usuario
    onBeepStart?.()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      streamRef.current = stream

      const chunks: BlobPart[] = []
      const rec = new MediaRecorder(stream)
      mediaRecorderRef.current = rec

      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data) }

      rec.onstop = async () => {
        _stopAll()
        setGrabando(false)
        setTranscribiendo(true)
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' })

          const minRequired = Math.max(15, baselineRef.current * SPEECH_RATIO)
          if (blob.size < MIN_BLOB_SIZE || maxLevelRef.current < minRequired) {
            setErrorMic('No se detectó voz. Habla más cerca del micrófono e intenta de nuevo.')
            return
          }

          const form = new FormData()
          form.append('file', blob, 'audio.webm')

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

          let res: Response
          try {
            res = await fetch(`${apiUrl}/transcribir`, {
              method: 'POST',
              body: form,
              signal: controller.signal,
            })
            clearTimeout(timer)
          } catch (fetchErr: any) {
            clearTimeout(timer)
            if (fetchErr?.name === 'AbortError') {
              setErrorMic('La transcripción tardó demasiado. Intenta de nuevo.')
            } else {
              setErrorMic(`Error de red: ${fetchErr?.message ?? 'sin conexión'}`)
            }
            return
          }

          if (!res.ok) {
            setErrorMic(`Error del servidor (${res.status}). Intenta de nuevo.`)
            return
          }

          const json = await res.json()
          const texto: string = (json.texto ?? json.transcripcion ?? '').trim()

          if (!texto || texto.split(/\s+/).filter(Boolean).length < MIN_WORDS) {
            setErrorMic('No se entendió bien. ¿Puedes repetirlo con más claridad?')
            return
          }

          if (skipPreview) {
            onSend(texto)
          } else {
            setPreview(texto)
          }
        } catch (e: any) {
          setErrorMic(`Error inesperado: ${e?.message ?? String(e)}`)
        } finally {
          setTranscribiendo(false)
        }
      }

      _startLevelMonitor(stream, () => rec.stop())
      rec.start()
      setGrabando(true)
    } catch (e: any) {
      setErrorMic('No se pudo acceder al micrófono. Verifica los permisos.')
    }
  }, [apiUrl, onBeepStart, _stopAll, _startLevelMonitor])

  const toggleMic = useCallback(() => {
    if (grabando) stopGrabacion()
    else startGrabacion()
  }, [grabando, stopGrabacion, startGrabacion])

  const confirmPreview = useCallback(
    (text: string) => {
      setPreview(null)
      if (text.trim()) onSend(text.trim())
    },
    [onSend]
  )

  const cancelPreview = useCallback(() => setPreview(null), [])

  const retryMic = useCallback(() => {
    setPreview(null)
    startGrabacion()
  }, [startGrabacion])

  return {
    grabando,
    transcribiendo,
    audioLevel,
    errorMic,
    setErrorMic,
    preview,
    toggleMic,
    confirmPreview,
    cancelPreview,
    retryMic,
  }
}
