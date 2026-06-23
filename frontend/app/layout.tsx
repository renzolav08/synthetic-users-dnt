import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import BackendStatus from './BackendStatus'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Synthetic Users DNT · UPAO',
  description: 'Sistema multiagente de evaluación de ideas de negocio basado en LLMs',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-gray-950 min-h-screen flex flex-col`}>

        {/* Header global */}
        <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-sm">
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                S
              </div>
              <span className="text-white font-semibold text-sm">Synthetic Users</span>
              <span className="text-gray-600 text-sm hidden sm:block">·</span>
              <span className="text-gray-500 text-sm hidden sm:block">DNT Startups UPAO</span>
            </div>
            <BackendStatus />
          </div>
        </header>

        {/* Contenido */}
        <div className="flex-1">
          {children}
        </div>

        {/* Footer */}
        <footer className="border-t border-gray-800 mt-auto">
          <div className="max-w-5xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-gray-600 text-xs">
              Universidad Privada Antenor Orrego · Taller Integrador 1 · 2026
            </span>
            <span className="text-gray-600 text-xs">
              Pacherres Tam, S. · Lavado Flores, R.
            </span>
          </div>
        </footer>

      </body>
    </html>
  )
}