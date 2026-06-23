import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type Stakeholder = {
  id: string
  nombre: string
  descripcion: string
  relevancia: 'alta' | 'media' | 'baja'
  tipo: string
  preguntas_clave: string[]
}

export type FormaDHablar = {
  formalidad: string
  estructura_frases: string
  vocabulario_tipico: string[]
  tono_emocional: string
  frases_caracteristicas: string[]
}

export type PerfilSintetico = {
  stakeholder_id: string
  stakeholder_nombre: string
  nombre: string
  edad: number
  ubicacion: string
  ocupacion: string
  autopercepcion: string
  creencias_centrales: string[]
  miedo_oculto: string
  job_funcional: string
  job_emocional: string
  job_social: string
  fricciones: string[]
  temores: string[]
  resultado_deseado: string
  variante_descripcion: string
  forma_de_hablar: FormaDHablar
}

export type Mensaje = {
  rol: 'emprendedor' | 'perfil'
  contenido: string
}

export type InsightsJTBD = {
  job_funcional: string
  job_emocional: string
  job_social: string
  fricciones: string[]
  temores: string[]
  resultado_deseado: string
  cita_clave: string
  nivel_confianza: number
}

export type Patrones = {
  stakeholder_id: string
  job_principal: string
  patrones_comunes: string[]
  divergencias: string[]
  fricciones_criticas: string[]
  oportunidad_clave: string
  segmentos_identificados: { nombre: string; descripcion: string; job_especifico: string }[]
}

export type SupuestoEvaluadoSintesis = {
  supuesto_id: string
  enunciado: string
  tipo: string
  veredicto: 'validado' | 'parcial' | 'refutado' | 'sin_datos'
  evidencia: string[]
  nivel_confianza: number
}

export type SintesisExploracion = {
  resumen_problema: string
  jobs_principales: { stakeholder: string; job_funcional: string; job_emocional: string; job_social: string }[]
  fricciones_criticas: string[]
  temores_recurrentes: string[]
  patrones_por_stakeholder: { stakeholder: string; patron: string; evidencia: string }[]
  oportunidades_detectadas: string[]
  validacion_problema: 'validado' | 'parcial' | 'no_validado'
  nivel_confianza: number
  recomendacion_siguiente_paso: string
  total_perfiles_entrevistados: number
  total_stakeholders: number
  supuestos_evaluados?: SupuestoEvaluadoSintesis[]
}

// clave: `${stakeholder_id}::${perfilIdx}`
type ConversacionKey = string

interface ExplorarStore {
  idea: string
  sector: string
  pais: string

  // Nodo 0
  stakeholders: Stakeholder[]
  cargandoStakeholders: boolean

  // Nodo 1 — perfiles por stakeholder
  perfilesPor: Record<string, PerfilSintetico[]>      // key: stakeholder_id
  cargandoPerfilesPor: Record<string, boolean>

  // Nodo 2 — conversaciones
  historialPor: Record<ConversacionKey, Mensaje[]>
  insightsPor: Record<ConversacionKey, InsightsJTBD | null>
  respondiendo: boolean

  // Nodo 3 — patrones
  patronesPor: Record<string, Patrones>
  cargandoPatronesPor: Record<string, boolean>

  // selección activa
  stakeholderActivo: string | null
  perfilActivoIdx: number | null

  // síntesis
  sintesis: SintesisExploracion | null
  cargandoSintesis: boolean
  errorSintesis: string | null

  // errores
  errorStakeholders: string | null

  // setters
  setIdea: (idea: string, sector: string, pais: string) => void
  setErrorStakeholders: (msg: string | null) => void
  setSintesis: (s: SintesisExploracion) => void
  setCargandoSintesis: (v: boolean) => void
  setErrorSintesis: (msg: string | null) => void
  setStakeholders: (list: Stakeholder[]) => void
  setCargandoStakeholders: (v: boolean) => void
  setPerfilesPor: (sid: string, perfiles: PerfilSintetico[]) => void
  appendPerfilesPor: (sid: string, perfiles: PerfilSintetico[]) => void
  setCargandoPerfilesPor: (sid: string, v: boolean) => void
  addMensaje: (key: ConversacionKey, msg: Mensaje) => void
  setInsights: (key: ConversacionKey, insights: InsightsJTBD) => void
  setRespondiendo: (v: boolean) => void
  setPatronesPor: (sid: string, p: Patrones) => void
  setCargandoPatronesPor: (sid: string, v: boolean) => void
  setStakeholderActivo: (sid: string | null) => void
  setPerfilActivoIdx: (idx: number | null) => void
  reset: () => void
}

const inicial = {
  idea: '',
  sector: '',
  pais: '',
  stakeholders: [],
  cargandoStakeholders: false,
  perfilesPor: {},
  cargandoPerfilesPor: {},
  historialPor: {},
  insightsPor: {},
  respondiendo: false,
  patronesPor: {},
  cargandoPatronesPor: {},
  stakeholderActivo: null,
  perfilActivoIdx: null,
  errorStakeholders: null,
  sintesis: null,
  cargandoSintesis: false,
  errorSintesis: null,
}

export const useExplorarStore = create<ExplorarStore>()(
  persist(
    (set) => ({
  ...inicial,

  setIdea: (idea, sector, pais) => set({ idea, sector, pais }),
  setStakeholders: (list) => set({ stakeholders: list }),
  setCargandoStakeholders: (v) => set({ cargandoStakeholders: v }),

  setPerfilesPor: (sid, perfiles) =>
    set((s) => ({ perfilesPor: { ...s.perfilesPor, [sid]: perfiles } })),
  appendPerfilesPor: (sid, perfiles) =>
    set((s) => ({ perfilesPor: { ...s.perfilesPor, [sid]: [...(s.perfilesPor[sid] ?? []), ...perfiles] } })),
  setCargandoPerfilesPor: (sid, v) =>
    set((s) => ({ cargandoPerfilesPor: { ...s.cargandoPerfilesPor, [sid]: v } })),

  addMensaje: (key, msg) =>
    set((s) => ({
      historialPor: {
        ...s.historialPor,
        [key]: [...(s.historialPor[key] ?? []), msg],
      },
    })),
  setInsights: (key, insights) =>
    set((s) => ({ insightsPor: { ...s.insightsPor, [key]: insights } })),
  setRespondiendo: (v) => set({ respondiendo: v }),

  setPatronesPor: (sid, p) =>
    set((s) => ({ patronesPor: { ...s.patronesPor, [sid]: p } })),
  setCargandoPatronesPor: (sid, v) =>
    set((s) => ({ cargandoPatronesPor: { ...s.cargandoPatronesPor, [sid]: v } })),

  setStakeholderActivo: (sid) => set({ stakeholderActivo: sid, perfilActivoIdx: null }),
  setPerfilActivoIdx: (idx) => set({ perfilActivoIdx: idx }),
  setErrorStakeholders: (msg) => set({ errorStakeholders: msg }),
  setSintesis: (s) => set({ sintesis: s }),
  setCargandoSintesis: (v) => set({ cargandoSintesis: v }),
  setErrorSintesis: (msg) => set({ errorSintesis: msg }),

  reset: () => set(inicial),
    }),
    {
      name: 'explorar-session-v2',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        idea: s.idea,
        sector: s.sector,
        pais: s.pais,
        stakeholders: s.stakeholders,
        perfilesPor: s.perfilesPor,
        historialPor: s.historialPor,
        insightsPor: s.insightsPor,
        patronesPor: s.patronesPor,
        sintesis: s.sintesis,
      }),
    }
  )
)
