'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useSession, signOut as nextSignOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'

interface User {
  nombre: string
  email: string
  token?: string
  image?: string
}

interface AuthContextType {
  user: User | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [manualUser, setManualUser] = useState<User | null>(null)
  const [manualLoading, setManualLoading] = useState(true)
  const router = useRouter()

  // Cargar usuario manual desde localStorage al iniciar
  useEffect(() => {
    const stored = localStorage.getItem('auth_token')
    const storedUser = localStorage.getItem('auth_user')
    if (stored && storedUser) {
      setManualUser({ ...JSON.parse(storedUser), token: stored })
    }
    setManualLoading(false)
  }, [])

  // Usuario activo: Google session tiene prioridad, luego manual
  const user: User | null = session?.user
    ? {
        nombre: session.user.name || session.user.email || '',
        email: session.user.email || '',
        image: session.user.image || undefined,
      }
    : manualUser

  const loading = status === 'loading' || manualLoading

  const login = async (email: string, password: string) => {
    const form = new URLSearchParams()
    form.append('username', email)
    form.append('password', password)

    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.detail || 'Error al iniciar sesión')
    }

    const data = await res.json()
    const userData = { nombre: data.nombre, email: data.email, token: data.access_token }
    setManualUser(userData)
    localStorage.setItem('auth_token', data.access_token)
    localStorage.setItem('auth_user', JSON.stringify({ nombre: data.nombre, email: data.email }))
    document.cookie = `auth_token=${data.access_token}; path=/; max-age=${8 * 3600}; SameSite=Lax`
    router.push('/')
  }

  const logout = () => {
    setManualUser(null)
    localStorage.removeItem('auth_token')
    localStorage.removeItem('auth_user')
    document.cookie = 'auth_token=; path=/; max-age=0'
    if (session) {
      nextSignOut({ callbackUrl: '/login' })
    } else {
      router.push('/login')
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
