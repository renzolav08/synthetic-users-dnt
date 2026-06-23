import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type EntradaHistorial = {
  session_id: string
  idea_texto: string
  recomendacion: string
  nivel_confianza: number
  resumen_ejecutivo: string
  fecha: string // ISO string
}

interface HistorialStore {
  entradas: EntradaHistorial[]
  agregar: (entrada: EntradaHistorial) => void
  limpiar: () => void
}

export const useHistorialStore = create<HistorialStore>()(
  persist(
    (set) => ({
      entradas: [],
      agregar: (entrada) =>
        set((s) => ({
          entradas: [entrada, ...s.entradas].slice(0, 50), // máx 50
        })),
      limpiar: () => set({ entradas: [] }),
    }),
    {
      name: 'debate-historial-v1',
      storage: createJSONStorage(() => localStorage),
    }
  )
)
