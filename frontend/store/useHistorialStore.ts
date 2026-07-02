import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { useAuth } from '@/contexts/AuthContext'

export type MensajeSnapshot = { rol: 'emprendedor' | 'perfil'; contenido: string }

export type PerfilSnapshot = {
  stakeholder_id: string
  stakeholder_nombre: string
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  variante_descripcion: string
  autopercepcion: string
  creencias_centrales: string[]
  miedo_oculto: string
  job_funcional: string
  job_emocional: string
  job_social: string
  fricciones: string[]
  temores: string[]
  resultado_deseado: string
  foto_url?: string
  genero?: 'masculino' | 'femenino'
  historial: MensajeSnapshot[]
  insights?: InsightsSnapshot | null
}

export type InsightsSnapshot = {
  job_funcional: string
  job_emocional: string
  job_social: string
  fricciones: string[]
  temores: string[]
  resultado_deseado: string
  cita_clave: string
  nivel_confianza: number
}

export type StakeholderSnapshot = {
  stakeholder_id: string
  stakeholder_nombre: string
  descripcion: string
  relevancia: string
  tipo: string
  preguntas_clave: string[]
  perfiles: PerfilSnapshot[]
}

export type SnapshotExploracion = {
  stakeholders: StakeholderSnapshot[]
}

export type EntradaHistorial = {
  session_id: string
  idea_texto: string
  recomendacion: string
  nivel_confianza: number
  resumen_ejecutivo: string
  fecha: string
  exploracion?: SnapshotExploracion
}

interface HistorialStore {
  entradas: EntradaHistorial[]
  agregar: (entrada: EntradaHistorial) => void
  limpiar: () => void
}

// Cache de stores por email
const storeCache: Record<string, ReturnType<typeof crearStore>> = {}

function crearStore(email: string) {
  return create<HistorialStore>()(
    persist(
      (set) => ({
        entradas: [],
        agregar: (entrada) =>
          set((s) => ({
            entradas: [entrada, ...s.entradas].slice(0, 50),
          })),
        limpiar: () => set({ entradas: [] }),
      }),
      {
        name: `historial-${email}`,
        storage: createJSONStorage(() => localStorage),
      }
    )
  )
}

function getStore(email: string) {
  if (!storeCache[email]) {
    storeCache[email] = crearStore(email)
  }
  return storeCache[email]
}

export function useHistorialStore(): HistorialStore {
  const { user } = useAuth()
  const email = user?.email ?? 'guest'
  return getStore(email)()
}
