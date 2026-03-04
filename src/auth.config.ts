import type { NextAuthConfig } from 'next-auth'
import Google from 'next-auth/providers/google'

/**
 * Edge-safe Auth.js config — imported by middleware.
 * MUST NOT import: adapter, bcrypt, DB, or any Node.js-only modules.
 */
export default {
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/auth/signin',
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const protectedPaths = ['/debates', '/settings']
      const isProtected = protectedPaths.some((path) =>
        nextUrl.pathname.startsWith(path)
      )

      if (isProtected && !isLoggedIn) {
        return Response.redirect(new URL('/auth/signin', nextUrl))
      }

      return true
    },
  },
} satisfies NextAuthConfig
