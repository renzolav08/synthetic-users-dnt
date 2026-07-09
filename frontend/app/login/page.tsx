'use client'
import { useState, FormEvent } from 'react'
import { signIn } from 'next-auth/react'
import { useAuth } from '@/contexts/AuthContext'

type Step = 'inicial' | 'login' | 'registro'

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
    </svg>
  ) : (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
    </svg>
  )
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  minLen = 4,
  showCount = false,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  minLen?: number
  showCount?: boolean
}) {
  const [show, setShow] = useState(false)
  const ok = value.length >= minLen

  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 pr-10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition"
        tabIndex={-1}
      >
        <EyeIcon open={show} />
      </button>
      {showCount && value.length > 0 && (
        <p className={`mt-1 text-xs ${ok ? 'text-green-400' : 'text-yellow-400'}`}>
          {value.length} / {minLen} caracteres mínimos {ok ? '✓' : ''}
        </p>
      )}
    </div>
  )
}

export default function LoginPage() {
  const { login, register } = useAuth()
  const [step, setStep] = useState<Step>('inicial')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault()
    if (password.length < 4) {
      setError('La contraseña debe tener al menos 4 caracteres')
      return
    }
    setError('')
    setLoading(true)
    try {
      await register(email, password, nombre || email.split('@')[0])
    } catch (err: any) {
      setError(err.message || 'Error al crear la cuenta')
    } finally {
      setLoading(false)
    }
  }

  function goBack() {
    setStep('inicial')
    setError('')
    setPassword('')
  }

  return (
    <div className="min-h-screen w-screen flex flex-col items-center justify-center px-4 bg-gray-950">

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-10">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-base flex-shrink-0">
          S
        </div>
        <span className="text-white text-xl font-semibold tracking-tight">Synthetic Users</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm">

        {/* ── Paso 1: opciones iniciales ── */}
        {step === 'inicial' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-white text-3xl font-bold mb-2">Iniciar sesión</h1>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col gap-3">
              {/* Google */}
              <button
                type="button"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm font-medium transition"
              >
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuar con Google
              </button>

              {/* Separador */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-800" />
                <span className="text-gray-600 text-xs">o</span>
                <div className="flex-1 h-px bg-gray-800" />
              </div>

              {/* Email */}
              <button
                type="button"
                onClick={() => setStep('login')}
                className="w-full flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-white rounded-xl px-4 py-3.5 text-sm font-medium transition"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
                Continuar con Email
              </button>
            </div>
          </>
        )}

        {/* ── Paso 2: login con email ── */}
        {step === 'login' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-white text-3xl font-bold mb-2">Iniciar sesión</h1>
              <p className="text-gray-500 text-sm">Ingresa tu cuenta para continuar</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <form onSubmit={handleLogin} className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoFocus
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Contraseña</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••"
                  />
                </div>

                {error && <p className="text-red-400 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl py-3 text-sm font-semibold transition-all mt-1"
                >
                  {loading ? 'Verificando...' : 'Iniciar sesión'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                <button onClick={goBack} className="text-xs text-gray-500 hover:text-gray-300 transition">
                  ← Volver
                </button>
                <button
                  onClick={() => { setStep('registro'); setError('') }}
                  className="text-xs text-gray-500 hover:text-white transition"
                >
                  ¿No tienes cuenta? <span className="text-blue-400 font-medium underline underline-offset-2">Regístrate</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Paso 3: registro ── */}
        {step === 'registro' && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-white text-3xl font-bold mb-2">Crear cuenta</h1>
              <p className="text-gray-500 text-sm">Únete y genera gratis</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Nombre</label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Tu nombre"
                    autoFocus
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1.5">
                    Contraseña
                    <span className="ml-1 text-gray-600 font-normal">(mín. 4 caracteres)</span>
                  </label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="Al menos 4 caracteres"
                    minLen={4}
                    showCount
                  />
                </div>

                {error && <p className="text-red-400 text-xs text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading || password.length < 4}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-xl py-3 text-sm font-semibold transition-all mt-1"
                >
                  {loading ? 'Creando cuenta...' : 'Continuar con Email'}
                </button>
              </form>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-800">
                <button onClick={goBack} className="text-xs text-gray-500 hover:text-gray-300 transition">
                  ← Volver
                </button>
                <button
                  onClick={() => { setStep('login'); setError('') }}
                  className="text-xs text-gray-500 hover:text-white transition"
                >
                  ¿Ya tienes cuenta? <span className="text-blue-400 font-medium underline underline-offset-2">Inicia sesión</span>
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  )
}
