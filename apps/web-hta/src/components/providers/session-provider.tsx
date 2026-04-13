'use client'

import { SessionProvider as NextAuthSessionProvider } from 'next-auth/react'
import { ReactNode } from 'react'
import { TokenRefreshProvider } from '@/hooks/useTokenRefresh'

interface SessionProviderProps {
  children: ReactNode
}

export function SessionProvider({ children }: SessionProviderProps) {
  return (
    <NextAuthSessionProvider
      // Refetch session every 5 minutes to keep it fresh
      refetchInterval={5 * 60}
      // Refetch session when window regains focus
      refetchOnWindowFocus={true}
    >
      <TokenRefreshProvider>
        {children}
      </TokenRefreshProvider>
    </NextAuthSessionProvider>
  )
}
