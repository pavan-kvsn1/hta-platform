'use client'

import React, { useEffect, useCallback, useRef } from 'react'
import { useSession, signOut } from 'next-auth/react'

// Refresh token 2 minutes before access token expires
const REFRESH_BUFFER_MS = 2 * 60 * 1000 // 2 minutes

// Access token lifetime (should match server config: 15 minutes)
const ACCESS_TOKEN_LIFETIME_MS = 15 * 60 * 1000 // 15 minutes

interface UseTokenRefreshOptions {
  // Called when token refresh fails (user should be logged out)
  onRefreshFailure?: () => void
  // Enable/disable auto refresh
  enabled?: boolean
}

/**
 * Hook to automatically refresh the access token before it expires
 * Uses the refresh token to get a new access token
 */
export function useTokenRefresh(options: UseTokenRefreshOptions = {}) {
  const { onRefreshFailure, enabled = true } = options
  const { data: session, status } = useSession()
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRefreshingRef = useRef(false)

  const refreshToken = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      return
    }

    isRefreshingRef.current = true

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      })

      if (!response.ok) {
        // Refresh failed - token expired or revoked
        console.warn('Token refresh failed:', response.status)

        // Sign out the user
        if (onRefreshFailure) {
          onRefreshFailure()
        } else {
          await signOut({ redirect: true, callbackUrl: '/login' })
        }
        return false
      }

      const data = await response.json()
      console.log('Token refreshed successfully, expires at:', data.expiresAt)
      return true
    } catch (error) {
      console.error('Token refresh error:', error)

      // On network error, don't immediately log out
      // The user might be temporarily offline
      return false
    } finally {
      isRefreshingRef.current = false
    }
  }, [onRefreshFailure])

  const scheduleRefresh = useCallback(() => {
    // Clear any existing timeout
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // Schedule refresh 5 minutes before token expires
    const refreshIn = ACCESS_TOKEN_LIFETIME_MS - REFRESH_BUFFER_MS

    refreshTimeoutRef.current = setTimeout(async () => {
      const success = await refreshToken()

      // If refresh succeeded, schedule the next refresh
      if (success) {
        scheduleRefresh()
      }
    }, refreshIn)

    console.log(`Token refresh scheduled in ${Math.round(refreshIn / 1000 / 60)} minutes`)
  }, [refreshToken])

  useEffect(() => {
    // Only run if enabled and user is authenticated
    if (!enabled || status !== 'authenticated' || !session) {
      return
    }

    // Schedule the first refresh
    scheduleRefresh()

    // Cleanup on unmount
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [enabled, status, session, scheduleRefresh])

  // Also refresh on visibility change (when user returns to tab)
  useEffect(() => {
    if (!enabled || status !== 'authenticated') {
      return
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // When user returns to the tab, check if we need to refresh
        // This handles cases where the user was away longer than expected
        refreshToken().then((success) => {
          if (success) {
            scheduleRefresh()
          }
        })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [enabled, status, refreshToken, scheduleRefresh])

  return {
    refreshToken,
    isRefreshing: isRefreshingRef.current,
  }
}

/**
 * Provider component that sets up automatic token refresh for the entire app
 * Add this to your layout or providers
 */
export function TokenRefreshProvider({ children }: { children: React.ReactNode }) {
  useTokenRefresh()
  return <>{children}</>
}
