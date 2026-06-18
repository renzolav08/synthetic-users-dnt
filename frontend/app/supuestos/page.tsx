'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSupuestosStore, type Supuesto } from '@/store/useSupuestosStore'
import { useExplorarStore } from '@/store/useExplorarStore'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

const COLOR_TIPO: Record<string, string> = {
  deseabilidad:  'bg-blue-900/50 border-blue-700 text-blue-300',
  factibilidad:  'bg-purple-900/50 border-purple-700 text-purple-300',
  viabilidad:    'bg-green-900/50 border-green-700 text-green-300',
  adaptabilidad: 'bg-orange-900/50 border-orange-700 text-orange-300',
}

const COLOR_RIESGO: Record<string, string> = {
  alto:  'bg-red-900/60 text-red-300 border-red-700',
  medio: 'bg-yellow-900/60 text-yellow-300 border-yellow-700',
  bajo:  'bg-gray-800 text-gray-400 border-gray-700',
}

const ICONO_TIPO: Record<string, string> = {
  deseabilidad:  '👥',
  factibilidad:  '⚙️',
  viabilidad:    '💰',
  adaptabilidad: '🌍',
}

const LABEL_TIPO: Record<string, string> = {
  deseabilidad:  'Deseabilidad',
  factibilidad:  'Factibilidad',
  viabilidad:    'Viabilidad',
  adaptabilidad: 'Adaptabilidad',
}

function SupuestoCard({ sup }: { sup: Supuesto }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-3">
      {/* Cabecera */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${COLOR_TIPO[sup.tipo]}`}>
            {ICONO_TIPO[sup.tipo]} {LABEL_TIPO[sup.tipo]}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full border ${COLOR_RIESGO[sup.nivel_riesgo]}`}>
            Riesgo {sup.nivel_riesgo}
          </span>
        </div>
      </div>

      {/* Enunciado */}
      <p className="text-white font-medium text-sm leading-relaxed">{sup.enunciado}</p>

      {/* Por qué es riesgoso */}
      <div className="bg-red-950/20 border border-red-900/40 rounded-lg px-3 py-2">
        <p className="text-gray-500 text-xs mb-1">¿Por qué es riesgoso?</p>
        <p className="text-gray-300 text-xs leading-relaxed">{sup.por_que_es_riesgoso}</p>
      </div>

      {/* Qué lo confirmaría */}
      <div className="bg-green-950/20 border border-green-900/40 rounded-lg px-3 py-2">
        <p className="text-gray-500 text-xs mb-1">¿Qué lo confirmaría?</p>
        <p className="text-gray-300 text-xs leading-relaxed">{sup.que_confirmaria}</p>
      </div>

      {/* Stakeholders */}
      {sup.stakeholders_relevantes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          <span className="text-gray-600 text-xs">Testeado con:</span>
          {sup.stakeholders_relevantes.map((s, i) => (
            <span key={i} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full border border-gray-700">
              {s}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SupuestosPage() {
  const router = useRouter()
  const { idea } = useExplorarStore()
  const { supuestos, razonamiento, cargando, error, setSupuestos, setCargando, setError } = useSupuestosStore()

  useEffect(() => {
    if (!idea) { router.replace('/'); return }
    if (supuestos.length > 0 || cargando) return

    async function cargar() {
      setCargando(true)
      setError(null)
      try {
        const res = await fetch(`${API}/supuestos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idea_texto: idea }),
        })
        if (!res.ok) throw new Error(`Error del servidor: ${res.status}`)
        const data = await res.json()
        setSupuestos(data.supuestos, data.razonamiento)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Error al detectar supuestos')
      } finally {
        setCargando(false)
      }
    }
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea])

  // Agrupar por tipo
  const porTipo = ['deseabilidad', 'factibilidad', 'viabilidad', 'adaptabilidad'].map(tipo => ({
    tipo,
    items: supuestos.filter(s => s.tipo === tipo),
  })).filter(g => g.items.length > 0)

  const altosCount = supuestos.filter(s => s.nivel_riesgo === 'alto').length

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button onClick={() => router.push('/')} className="text-gray-400 hover:text-white text-sm transition">
            ← Cambiar idea
          </button>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="text-white font-medium">Supuestos</span>
            <span className="text-gray-700">→</span>
            <span className="text-gray-600">Explorar</span>
            <span className="text-gray-700">→</span>
            <span className="text-gray-600">Síntesis</span>
            <span className="text-gray-700">→</span>
            <span className="text-gray-600">Debate</span>
          </div>
          <button
            onClick={() => router.push('/explorar')}
            disabled={supuestos.length === 0 || cargando}
            className="text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition font-medium"
          >
            Comenzar exploración →
          </button>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">

        {/* Idea */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Idea evaluada</p>
          <p className="text-gray-200 text-sm leading-relaxed">{idea}</p>
        </div>

        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Mapa de supuestos riesgosos</h1>
          <p className="text-gray-400 text-sm">
            Basado en <span className="text-white font-medium">Testing Business Ideas</span> (Bland & Osterwalder) —
            estos son los supuestos que podrían hundir tu idea si resultan falsos.
            La exploración los pondrá a prueba.
          </p>
        </div>

        {/* Estado: cargando */}
        {cargando && (
          <div className="flex flex-col items-center py-20 gap-4">
            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Identificando supuestos riesgosos...</p>
            <p className="text-gray-600 text-xs">Analizando deseabilidad, factibilidad, viabilidad y adaptabilidad</p>
          </div>
        )}

        {/* Estado: error */}
        {error && !cargando && (
          <div className="bg-red-950/50 border border-red-800 rounded-xl p-5 text-center">
            <p className="text-red-400 text-sm mb-3">⚠ {error}</p>
            <button
              onClick={() => { setError(null); router.replace('/supuestos') }}
              className="text-red-300 hover:text-white text-xs border border-red-800 px-4 py-1.5 rounded-lg transition"
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Resumen de riesgo */}
        {supuestos.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-950/30 border border-red-900/50 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-red-400">{altosCount}</p>
                <p className="text-gray-400 text-xs mt-1">Riesgo alto</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white">{supuestos.length}</p>
                <p className="text-gray-400 text-xs mt-1">Supuestos totales</p>
              </div>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
                <p className="text-3xl font-bold text-white">{porTipo.length}</p>
                <p className="text-gray-400 text-xs mt-1">Dimensiones de riesgo</p>
              </div>
            </div>

            {/* Razonamiento */}
            {razonamiento && (
              <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-4">
                <p className="text-blue-400 text-xs font-semibold uppercase tracking-wider mb-2">
                  Por qué estos son los supuestos críticos
                </p>
                <p className="text-gray-300 text-sm leading-relaxed">{razonamiento}</p>
              </div>
            )}

            {/* Supuestos por tipo */}
            {porTipo.map(({ tipo, items }) => (
              <div key={tipo} className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                  <span>{ICONO_TIPO[tipo]}</span>
                  <span>{LABEL_TIPO[tipo]}</span>
                  <span className="text-gray-700 font-normal normal-case">— {items.length} supuesto{items.length !== 1 ? 's' : ''}</span>
                </h2>
                <div className="space-y-3">
                  {items.map(sup => <SupuestoCard key={sup.id} sup={sup} />)}
                </div>
              </div>
            ))}

            {/* CTA */}
            <div className="flex flex-col items-center gap-3 pt-4 pb-8">
              <p className="text-gray-500 text-xs text-center max-w-md">
                La fase de exploración entrevistará a usuarios sintéticos para validar o refutar estos supuestos.
                Los hallazgos enriquecerán el debate multiagente final.
              </p>
              <button
                onClick={() => router.push('/explorar')}
                className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-10 py-3.5 rounded-xl transition text-sm"
              >
                Comenzar exploración con usuarios sintéticos →
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
