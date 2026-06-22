'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Los supuestos ahora se generan dentro de /explorar como panel interactivo.
// Esta página ya no es parte del flujo — redirigir siempre a /explorar.
export default function SupuestosPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/explorar') }, [router])
  return null
}
