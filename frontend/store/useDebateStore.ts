import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Agente = {
  rol: string
  tipo: string
  peso: number
  categoria: string
}

export type Contexto = {
  sector: string
  pais: string
  region: string | null
  idioma: string
  usuarios_objetivo: string
  modelo_negocio: string
  riesgos_detectados: string[]
  agentes: Agente[]
}

export type Argumento = {
  agente_rol: string
  agente_nombre: string
  agente_categoria: string
  agente_peso: number
  argumento: string
  posicion: string
  fuente_insight?: string | null
}

export type ArbolArgumentos = {
  acuerdos: { punto: string; agentes: string[] }[]
  divergencias: { punto: string; agente_a: string; agente_b: string }[]
  fortalezas_idea: string[]
  debilidades_idea: string[]
  recomendacion: string
  nivel_confianza: number
  condiciones: string[]
  resumen_ejecutivo: string
}

type Estado =
  | 'idle'
  | 'analizando'
  | 'buscando_web'
  | 'generando_perfiles'
  | 'debatiendo'
  | 'consenso'
  | 'completado'
  | 'error'

interface DebateStore {
  idea: string
  estado: Estado
  contexto: Contexto | null
  argumentos: Argumento[]
  arbol: ArbolArgumentos | null
  error: string | null
  insights_exploracion: Record<string, unknown> | null
  sessionId: string | null
  setIdea: (idea: string) => void
  setEstado: (estado: Estado) => void
  setContexto: (contexto: Contexto) => void
  addArgumento: (arg: Argumento) => void
  setArbol: (arbol: ArbolArgumentos) => void
  setError: (error: string) => void
  setInsightsExploracion: (insights: Record<string, unknown> | null) => void
  setSessionId: (id: string) => void
  reset: () => void
}

export const useDebateStore = create<DebateStore>()(
  persist(
    (set) => ({
      idea: '',
      estado: 'idle',
      contexto: null,
      argumentos: [],
      arbol: null,
      error: null,
      insights_exploracion: null,
      sessionId: null,
      setIdea: (idea) => set({ idea }),
      setEstado: (estado) => set({ estado }),
      setContexto: (contexto) => set({ contexto }),
      addArgumento: (arg) => set((s) => ({ argumentos: [...s.argumentos, arg] })),
      setArbol: (arbol) => set({ arbol }),
      setError: (error) => set({ error, estado: 'error' }),
      setInsightsExploracion: (insights) => set({ insights_exploracion: insights }),
      setSessionId: (id) => set({ sessionId: id }),
      reset: () => set({
        idea: '', estado: 'idle', contexto: null,
        argumentos: [], arbol: null, error: null, insights_exploracion: null, sessionId: null,
      }),
    }),
    {
      name: 'debate-session-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        idea: s.idea,
        estado: s.estado,
        contexto: s.contexto,
        argumentos: s.argumentos,
        arbol: s.arbol,
        insights_exploracion: s.insights_exploracion,
        sessionId: s.sessionId,
      }),
    }
  )
)
