// Face IDs de Simli Studio — únicos por avatar, deben existir y estar activos
// en la cuenta de Simli Studio del proyecto. Fuente única para evitar que
// debate/page.tsx y LlamadaExploracion.tsx queden desincronizados.
export const SIMLI_FACES_F = [
  'afdb6a3e-3939-40aa-92df-01604c23101c',
  '5fc23ea5-8175-4a82-aaaf-cdd8c88543dc',
  'b9e5fba3-071a-4e35-896e-211c4d6eaa7b',
  'cace3ef7-a4c4-425d-a8cf-a5358eb0c427',
]
export const SIMLI_FACES_M = [
  '804c347a-26c9-4dcf-bb49-13df4bed61e8',
  '1c6aa65c-d858-4721-a4d9-bda9fde03141',
  'dd10cb5a-d31d-4f12-b69f-6db3383c006e',
]

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Crea un asignador de faceId con estado propio (usar un ref por sesión de debate).
 * Garantiza que, mientras haya faces disponibles entre ambos pools (7 en total),
 * dos agentes concurrentes nunca compartan faceId — incluso si el debate resulta
 * con más de 4 mujeres o más de 3 hombres, casos donde el round-robin por género
 * por sí solo repetiría cara.
 */
export function crearAsignadorDeCaras() {
  const usados = new Set<string>()
  return function asignar(genero: string): string {
    const esFem = genero !== 'masculino'
    const propio = esFem ? SIMLI_FACES_F : SIMLI_FACES_M
    const otro = esFem ? SIMLI_FACES_M : SIMLI_FACES_F
    const libre = [...propio, ...otro].find(f => !usados.has(f))
    // Si se agotan las 7 caras distintas (más de 7 agentes concurrentes), repetir
    // desde el pool propio en vez de romper.
    const elegido = libre ?? propio[usados.size % propio.length]
    usados.add(elegido)
    return elegido
  }
}
