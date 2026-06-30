import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import NextAuthProvider from './NextAuthProvider'
import Sidebar from './Sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Synthetic Users DNT · UPAO',
  description: 'Sistema multiagente de evaluación de ideas de negocio basado en LLMs',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={`${inter.className} bg-gray-950 text-white`}>
        <NextAuthProvider>
        <AuthProvider>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
              {children}
            </main>
          </div>
        </AuthProvider>
        </NextAuthProvider>
      </body>
    </html>
  )
}
