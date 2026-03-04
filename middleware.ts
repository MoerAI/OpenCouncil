import NextAuth from 'next-auth'
import authConfig from '@/auth.config'

/**
 * Middleware uses the edge-safe config only.
 * DO NOT import from '@/auth' here — it pulls in Node.js modules.
 */
export const { auth: middleware } = NextAuth(authConfig)

export const config = {
  matcher: ['/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)'],
}
