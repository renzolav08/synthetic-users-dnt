'use client'

import { useState } from 'react'
import { useDebateStore } from '@/store/useDebateStore'
import { useExplorarStore } from '@/store/useExplorarStore'
import { useRouter } from 'next/navigation'

export default function Home() {
  const [texto, setTexto] = useState('')
  const { estado } = useDebateStore()
  const explorarStore = useExplorarStore()
  const router = useRouter()
  const cargando = estado !== 'idle' && estado !== 'error'

  function explorarPrimero() {
    if (!texto.trim() || texto.trim().length < 20) return
    explorarStore.reset()
    explorarStore.setIdea(texto, '', '')
    router.push('/explorar')
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

        {/* Botones */}
        <div className="flex flex-col gap-3">
          <button
            onClick={explorarPrimero}
            disabled={cargando || texto.trim().length < 20}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white font-semibold py-3.5 rounded-xl transition-all duration-200 text-sm flex items-center justify-center gap-2"
          >
            <span>💬</span>
            Explorar con usuarios sintéticos →
          </button>
        </div>

        {/* Descripción del flujo */}
        {!cargando && texto.trim().length >= 20 && (
          <p className="text-center text-xs text-gray-600 mt-4">
            Paso 1: entrevistas · Paso 2: síntesis · Paso 3: debate multiagente
          </p>
        )}
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