'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useHistorialStore } from '@/store/useHistorialStore'
import { useExplorarStore } from '@/store/useExplorarStore'

const LABEL_VEREDICTO: Record<string, string> = {
  viable: '✓',
  no_viable: '✗',
  condicionalmente_viable: '◐',
}
const COLOR_VEREDICTO: Record<string, string> = {
  viable: 'text-green-400',
  no_viable: 'text-red-400',
  condicionalmente_viable: 'text-yellow-400',
}

export default function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { entradas, limpiar } = useHistorialStore()
  const { idea: ideaActiva, stakeholders } = useExplorarStore()
  const sesionActiva = !!ideaActiva && stakeholders.length > 0
  const [mobileOpen, setMobileOpen] = useState(false)

  if (pathname === '/login') return null

  const initials = user?.nombre
    ? user.nombre.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '??'

  function formatFecha(iso: string) {
    try {
      return new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
    } catch { return '' }
  }

  return (
    <>
      {/* Hamburger button — mobile only, shown when sidebar is closed */}
      <button
        onClick={() => setMobileOpen(true)}
        className="md:hidden fixed top-3 left-3 z-50 w-9 h-9 flex items-center justify-center rounded-lg bg-gray-900 border border-gray-700 text-gray-400 hover:text-white transition"
        aria-label="Abrir menú"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Backdrop — mobile only */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

    <aside className={`
      flex-col bg-gray-900 border-r border-gray-800 h-screen overflow-hidden
      fixed top-0 left-0 z-50 w-64 flex-shrink-0 flex
      transform transition-transform duration-300
      ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
      md:relative md:translate-x-0 md:sticky md:top-0
    `}>

      {/* Logo + close button (mobile) */}
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden mr-1 text-gray-500 hover:text-white transition flex-shrink-0"
            aria-label="Cerrar menú"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            S
          </div>
          <div>
            <div className="text-white text-sm font-semibold leading-tight">Synthetic Users</div>
          </div>
        </div>
      </div>

      {/* Nueva evaluación */}
      <div className="px-3 pb-3">
        <button
          onClick={() => router.push('/')}
          className="w-full flex items-center gap-2 bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-xl px-3 py-2.5 text-sm transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nueva evaluación
        </button>
      </div>

      {/* Nav items */}
      <div className="px-3 pb-2 flex flex-col gap-1">
        <button
          onClick={() => router.push('/historial')}
          className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors text-left ${
            pathname === '/historial'
              ? 'bg-gray-800 text-white'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'
          }`}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Historial
        </button>

        {sesionActiva && (
          <button
            onClick={() => router.push('/explorar')}
            className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-colors text-left ${
              pathname === '/explorar'
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse flex-shrink-0" />
            Exploración activa
          </button>
        )}
      </div>

      {/* Historial reciente */}
      {entradas.length > 0 && (
        <div className="px-3 pt-2 pb-1">
          <div className="flex items-center justify-between mb-1.5 px-1">
            <span className="text-[10px] text-gray-600 uppercase tracking-wider font-medium">Recientes</span>
            <button onClick={limpiar} className="text-[10px] text-gray-700 hover:text-red-500 transition">
              Limpiar
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-0.5 min-h-0">
        {entradas.map((e) => (
          <button
            key={e.session_id}
            onClick={() => router.push('/historial')}
            className="w-full text-left group rounded-xl px-3 py-2 hover:bg-gray-800 transition-colors"
          >
            <div className="flex items-start gap-2">
              <span className={`text-xs flex-shrink-0 mt-0.5 ${COLOR_VEREDICTO[e.recomendacion] || 'text-gray-500'}`}>
                {LABEL_VEREDICTO[e.recomendacion] || '·'}
              </span>
              <div className="min-w-0">
                <p className="text-gray-400 group-hover:text-gray-300 text-xs leading-snug line-clamp-2 transition-colors">
                  {e.idea_texto.slice(0, 60)}{e.idea_texto.length > 60 ? '…' : ''}
                </p>
                <p className="text-gray-600 text-[10px] mt-0.5">{formatFecha(e.fecha)}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Usuario */}
      {user && (
        <div className="border-t border-gray-800 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user.nombre}</p>
              <p className="text-gray-500 text-[10px] truncate">{user.email}</p>
            </div>
            <button
              onClick={logout}
              title="Cerrar sesión"
              className="flex-shrink-0 text-gray-600 hover:text-gray-400 transition p-1 rounded-lg hover:bg-gray-800"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </aside>
    </>
  )
}
