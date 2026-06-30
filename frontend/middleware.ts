import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const PUBLIC_PATHS = ['/login', '/api/auth']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Verificar sesión de NextAuth (Google)
  const nextAuthToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // Verificar token manual (email/password)
  const manualToken = request.cookies.get('auth_token')?.value

  if (!nextAuthToken && !manualToken) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}
