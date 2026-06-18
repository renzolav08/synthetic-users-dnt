import { create } from 'zustand'

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

interface SupuestosStore {
  supuestos: Supuesto[]
  razonamiento: string
  cargando: boolean
  error: string | null

  setSupuestos: (supuestos: Supuesto[], razonamiento: string) => void
  setCargando: (v: boolean) => void
  setError: (msg: string | null) => void
  reset: () => void
}

export const useSupuestosStore = create<SupuestosStore>((set) => ({
  supuestos: [],
  razonamiento: '',
  cargando: false,
  error: null,

  setSupuestos: (supuestos, razonamiento) => set({ supuestos, razonamiento }),
  setCargando: (v) => set({ cargando: v }),
  setError: (msg) => set({ error: msg }),
  reset: () => set({ supuestos: [], razonamiento: '', cargando: false, error: null }),
}))
