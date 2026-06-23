import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type TipoSupuesto = 'deseabilidad' | 'factibilidad' | 'viabilidad' | 'adaptabilidad'
export type RiesgoSupuesto = 'alto' | 'medio' | 'bajo'
export type VeredictoSupuesto = 'validado' | 'parcial' | 'refutado' | 'sin_datos'

export type Supuesto = {
  id: string
  enunciado: string
  tipo: TipoSupuesto
  nivel_riesgo: RiesgoSupuesto
  por_que_es_riesgoso: string
  que_confirmaria: string
  stakeholders_relevantes: string[]
}

export type SupuestoEvaluado = {
  supuesto_id: string
  enunciado: string
  tipo: string
  veredicto: VeredictoSupuesto
  evidencia: string[]
  nivel_confianza: number
}

export type EvidenciaSupuesto = {
  validado: number
  parcial: number
  refutado: number
}

interface SupuestosStore {
  supuestos: Supuesto[]
  razonamiento: string
  cargando: boolean
  error: string | null
  activosIds: string[]
  evidencia: Record<string, EvidenciaSupuesto>

  setSupuestos: (supuestos: Supuesto[], razonamiento: string) => void
  setCargando: (v: boolean) => void
  setError: (msg: string | null) => void
  toggleActivo: (id: string) => void
  editarEnunciado: (id: string, texto: string) => void
  registrarEvidencia: (supuesto_id: string, veredicto: 'validado' | 'parcial' | 'refutado') => void
  reset: () => void
}

export const useSupuestosStore = create<SupuestosStore>()(
  persist(
    (set, get) => ({
      supuestos: [],
      razonamiento: '',
      cargando: false,
      error: null,
      activosIds: [],
      evidencia: {},

      setSupuestos: (supuestos, razonamiento) =>
        set({ supuestos, razonamiento, activosIds: supuestos.map(s => s.id), evidencia: {} }),

      setCargando: (v) => set({ cargando: v }),
      setError: (msg) => set({ error: msg }),

      toggleActivo: (id) =>
        set((s) => ({
          activosIds: s.activosIds.includes(id)
            ? s.activosIds.filter(x => x !== id)
            : [...s.activosIds, id],
        })),

      editarEnunciado: (id, texto) =>
        set((s) => ({
          supuestos: s.supuestos.map(sup =>
            sup.id === id ? { ...sup, enunciado: texto } : sup
          ),
        })),

      registrarEvidencia: (supuesto_id, veredicto) =>
        set((s) => {
          const prev = s.evidencia[supuesto_id] ?? { validado: 0, parcial: 0, refutado: 0 }
          return {
            evidencia: {
              ...s.evidencia,
              [supuesto_id]: { ...prev, [veredicto]: prev[veredicto] + 1 },
            },
          }
        }),

      reset: () =>
        set({ supuestos: [], razonamiento: '', cargando: false, error: null, activosIds: [], evidencia: {} }),
    }),
    {
      name: 'supuestos-session',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        supuestos: s.supuestos,
        razonamiento: s.razonamiento,
        activosIds: s.activosIds,
        evidencia: s.evidencia,
      }),
    }
  )
)
