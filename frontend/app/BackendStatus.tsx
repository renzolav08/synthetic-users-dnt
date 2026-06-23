'use client'

import { useEffect, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api'

export default function BackendStatus() {
  const [estado, setEstado] = useState<'verificando' | 'conectado' | 'error'>('verificando')

  useEffect(() => {
    let cancelado = false
    async function check() {
      try {
        const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) })
        if (!cancelado) setEstado(res.ok ? 'conectado' : 'error')
      } catch {
        if (!cancelado) setEstado('error')
      }
    }
    check()
    const iv = setInterval(check, 30_000)
    return () => { cancelado = true; clearInterval(iv) }
  }, [])

  if (estado === 'verificando') return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse" />
      <span className="text-gray-500 text-xs">Conectando...</span>
    </div>
  )
  if (estado === 'error') return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-red-500" />
      <span className="text-red-400 text-xs">Backend no disponible</span>
    </div>
  )
  return (
    <div className="flex items-center gap-2">
      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
      <span className="text-gray-400 text-xs">Backend conectado</span>
    </div>
  )
}
