'use client'

import { useState } from 'react'
import { useDebateStore } from '@/store/useDebateStore'
import { useRouter } from 'next/navigation'

const ESTADOS_LABEL: Record<string, string> = {
  analizando: 'Analizando tu idea...',
  buscando_web: 'Buscando datos reales del mercado...',
  generando_perfiles: 'Generando perfiles de los agentes...',
  debatiendo: 'Los agentes están debatiendo tu idea...',
  consenso: 'Construyendo el árbol de argumentos...',
}

export default function Home() {
  const [texto, setTexto] = useState('')
  const { estado, setIdea, setEstado, setContexto, addArgumento, setArbol, setError, reset } = useDebateStore()
  const router = useRouter()
  const cargando = estado !== 'idle' && estado !== 'error'

  async function evaluarIdea() {
    if (!texto.trim() || texto.trim().length < 20) return
    reset()
    setIdea(texto)
    setEstado('analizando')

    try {
      const res = await fetch('https://synthetic-users-dnt.onrender.com/api/evaluar-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_texto: texto }),
      })

      if (!res.ok) throw new Error('Error al conectar con el servidor')
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
            if (tipo === 'contexto') { setContexto(data); setEstado('buscando_web') }
            else if (tipo === 'datos_web') { setEstado('generando_perfiles') }
            else if (tipo === 'perfiles_listos') { setEstado('debatiendo') }
            else if (tipo === 'argumento') { addArgumento(data) }
            else if (tipo === 'consenso') { setArbol(data); setEstado('consenso') }
            else if (tipo === 'fin') { setEstado('completado'); router.push('/debate') }
          } catch {}
        }
      }
    } catch (e: unknown) {
     const error = e as Error
      setError(error.message || 'Error inesperado')
    }
  }

  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center px-4">

      {/* Header */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 bg-blue-950 border border-blue-800 rounded-full px-4 py-1.5 text-blue-300 text-sm mb-6">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          Sistema Multiagente · DNT Startups UPAO
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
          Evalúa tu idea de negocio
        </h1>
        <p className="text-gray-400 text-lg max-w-xl">
          Expón tu idea libremente. Una suite de agentes especializados
          la debatirá desde múltiples perspectivas críticas.
        </p>
      </div>

      {/* Card principal */}
      <div className="w-full max-w-2xl bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-2xl">

        <label className="block text-sm text-gray-400 mb-2">
          Cuéntanos tu idea de negocio
        </label>

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={cargando}
          placeholder="Ej: Quiero crear una app que conecte a dueños de bodegas con proveedores mayoristas para hacer pedidos directos sin intermediarios..."
          rows={6}
          className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition disabled:opacity-50 text-sm leading-relaxed"
        />

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

        {/* Estado de carga */}
        {cargando && (
          <div className="mb-5 bg-blue-950 border border-blue-900 rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="text-blue-300 text-sm font-medium">
                {ESTADOS_LABEL[estado] || 'Procesando...'}
              </p>
              <p className="text-blue-400/60 text-xs mt-0.5">
                Esto toma entre 60 y 90 segundos — no cierres la ventana
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {estado === 'error' && (
          <div className="mb-5 bg-red-950 border border-red-900 rounded-xl px-4 py-3">
            <p className="text-red-400 text-sm">
              Hubo un error al conectar con el servidor. Asegúrate de que el backend está corriendo.
            </p>
          </div>
        )}

        {/* Botón */}
        <button
          onClick={evaluarIdea}
          disabled={cargando || texto.trim().length < 20}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-sm"
        >
          {cargando ? 'Evaluando...' : 'Evaluar idea →'}
        </button>
      </div>

      {/* Agentes info */}
      <div className="mt-8 flex flex-wrap justify-center gap-2">
        {['Usuario Objetivo', 'Analista de Negocio', 'Experto Técnico', 'Analista de Contexto', 'Analista de Riesgos'].map((rol) => (
          <span key={rol} className="bg-gray-900 border border-gray-800 text-gray-400 text-xs px-3 py-1.5 rounded-full">
            {rol}
          </span>
        ))}
      </div>

    </main>
  )
}