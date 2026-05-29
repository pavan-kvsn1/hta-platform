'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Monitor, Lock, KeyRound, WifiOff, AlertTriangle, Eye, EyeOff } from 'lucide-react'

// ElectronAPI types are declared globally in src/types/electron.d.ts

type AuthView = 'loading' | 'login' | 'unlock' | 'password-only'

type ReprovisionImpact = {
  unsyncedAuditEntries: number
  affectedCertificates: number
  pendingDrafts: number
  unsyncedImages: number
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    promise.then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      }
    )
  })
}

export default function DesktopLoginPage() {
  const forceReauth = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('reauth') === 'true'
  const [view, setView] = useState<AuthView>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOnline, setIsOnline] = useState(true)
  const [setupStatus, setSetupStatus] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showReprovisionConfirm, setShowReprovisionConfirm] = useState(false)
  const [reprovisionImpact, setReprovisionImpact] = useState<ReprovisionImpact | null>(null)
  const [isLoadingReprovisionImpact, setIsLoadingReprovisionImpact] = useState(false)

  // Login form state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Unlock state
  const [unlockPassword, setUnlockPassword] = useState('')
  const [challengeKey, setChallengeKey] = useState<string | undefined>()
  const [responseValue, setResponseValue] = useState('')
  const [codesRemaining, setCodesRemaining] = useState<number | undefined>()
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  const checkAuthStatus = useCallback(async () => {
    const api = window.electronAPI
    if (!api) {
      // Running in a browser, not Electron — show the login form directly
      setView('login')
      return
    }

    // Force fresh login when tokens are dead (redirected from 401 retry)
    if (forceReauth) {
      setView('login')
      setError('Your session expired. Please sign in again to get fresh credentials.')
      return
    }

    const online = await api.getOnlineStatus()
    setIsOnline(online)

    const status = await api.getAuthStatus()

    if (status.isUnlocked) {
      const profile = await api.getUserProfile()
      if (profile) await restoreSession(profile)
      window.location.replace('/dashboard')
      return
    }

    if (status.isSetUp) {
      setCodesRemaining(status.codesRemaining)
      setChallengeKey(status.challengeKey)

      // Show who this device belongs to
      const profile = await api.getUserProfile()
      if (profile) {
        setUserDisplayName((profile.name as string) || null)
        setUserEmail((profile.email as string) || null)
      }

      if (status.needsFullAuth && status.challengeKey) {
        setView('unlock') // Password + challenge code
      } else {
        setView('password-only') // Password only (idle re-entry), or no challenge key available
      }
    } else {
      if (!online) {
        setView('login')
        setError('You must be online for first-time setup.')
        return
      }
      setView('login')
    }
  }, [forceReauth])

  useEffect(() => {
    checkAuthStatus()
  }, [checkAuthStatus])

  useEffect(() => {
    if (!setupStatus) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = 'Local cache setup is still running. Closing now can leave the device partially configured.'
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [setupStatus])

  async function restoreSession(userProfile: Record<string, unknown>, requireSuccess = false) {
    try {
      const res = await fetch('/api/auth/desktop-session', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userProfile }),
      })
      if (!res.ok && requireSuccess) {
        const body = await res.text().catch(() => '')
        throw new Error(`Desktop session restore failed (${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`)
      }
    } catch (err) {
      if (requireSuccess) throw err
      // Session restoration is best-effort
    }
  }

  async function startReprovisionFlow() {
    setError(null)
    setShowReprovisionConfirm(true)
    setIsLoadingReprovisionImpact(true)

    try {
      const impact = await window.electronAPI?.getReprovisionImpact()
      setReprovisionImpact(impact || {
        unsyncedAuditEntries: 0,
        affectedCertificates: 0,
        pendingDrafts: 0,
        unsyncedImages: 0,
      })
    } catch (err) {
      setError(`Unable to check unsynced local data: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsLoadingReprovisionImpact(false)
    }
  }

  async function confirmReprovision() {
    setError(null)
    setIsLoading(true)

    try {
      const result = await window.electronAPI?.resetLocalSetup()
      if (!result?.success) {
        setError(result?.error || 'Could not reset local setup.')
        return
      }

      setShowReprovisionConfirm(false)
      setReprovisionImpact(null)
      setUserDisplayName(null)
      setUserEmail(null)
      setUnlockPassword('')
      setResponseValue('')
      setChallengeKey(undefined)
      setCodesRemaining(undefined)
      setShowPassword(false)
      setView('login')
      setError('Local setup was reset. Sign in online to set up this device for another user.')
    } catch (err) {
      setError(`Could not reset local setup: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Login + Setup (first-time, online) ───────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    setSetupStatus('Signing in to the API...')

    try {
      // 1. Authenticate against API
      const res = await withTimeout(fetch('/api/auth/desktop-login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }), 15000, 'API sign-in')

      const data = await res.json()
      if (!res.ok) {
        const diagnostic = data.diagnostic
        const diagnosticText = diagnostic
          ? ` API: ${diagnostic.apiBase || 'unknown'}${diagnostic.apiStatus ? `, status ${diagnostic.apiStatus}` : ''}${diagnostic.apiBody ? `, body ${diagnostic.apiBody}` : ''}${diagnostic.cause ? `, cause ${diagnostic.cause}` : ''}`
          : ''
        setError(`${data.error || 'Login failed'}${diagnosticText}`)
        return
      }

      const userProfile = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        isAdmin: data.user.isAdmin,
        adminType: data.user.adminType,
        tenantId: data.user.tenantId,
      }

      // 2. Set up offline auth (encrypt credentials with password-derived key + register device)
      setSetupStatus('Creating encrypted local cache. Please do not close the app.')
      const api = window.electronAPI!
      const result = await withTimeout(api.setup(password, data.user.id, data.refreshToken, data.accessToken, userProfile), 30000, 'Encrypted local cache setup')

      if (!result.success) {
        setError(result.error || 'Setup failed')
        return
      }

      setSetupStatus('Preparing offline challenge...')
      await withTimeout(api.logout(), 10000, 'Offline challenge preparation')
      await checkAuthStatus()
      return
    } catch (err) {
      setError(`Desktop setup failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsLoading(false)
      setSetupStatus(null)
    }
  }

  // ─── Unlock (password + challenge code) ───────────────────────────────────

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const api = window.electronAPI!
      if (!challengeKey) {
        setError('No challenge key available. Your code card may be empty.')
        setIsLoading(false)
        return
      }
      const result = await api.unlock(unlockPassword, challengeKey, responseValue)

      if (!result.success) {
        if ((result as Record<string, unknown>).needsLocalCacheRepair) {
          setView('login')
          setError(result.error || 'Local cache needs repair. Sign in online to rebuild it.')
          return
        }
        if (result.attemptsRemaining === 0) {
          setError('Device wiped due to too many failed attempts. Please reinstall.')
          return
        }
        setError(result.error || `Unlock failed. ${result.attemptsRemaining} attempts remaining.`)
        return
      }

      if ((result as Record<string, unknown>).needsReauth) {
        setView('login')
        setError('Your session expired. Please sign in again to get fresh credentials.')
        return
      }

      setCodesRemaining(result.codesRemaining)

      const profile = await api.getUserProfile()
      if (profile) await restoreSession(profile)

      window.location.replace('/dashboard')
    } catch (err) {
      setError('Unlock failed: ' + String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Password-Only Re-entry (idle timeout) ────────────────────────────────

  async function handlePasswordOnly(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const api = window.electronAPI!
      const result = await api.unlockPasswordOnly(unlockPassword)

      if (!result.success) {
        if (result.attemptsRemaining === 0) {
          setError('Device wiped due to too many failed attempts. Please reinstall.')
          return
        }
        setError(result.error || `Incorrect password. ${result.attemptsRemaining} attempts remaining.`)
        return
      }

      if ((result as Record<string, unknown>).needsReauth) {
        setView('login')
        setError('Your session expired. Please sign in again to get fresh credentials.')
        return
      }

      const profile = await api.getUserProfile()
      if (profile) await restoreSession(profile)

      window.location.replace('/dashboard')
    } catch (err) {
      setError('Unlock failed: ' + String(err))
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (view === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
            <Monitor className="size-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">HTA Calibration</h1>
          <p className="text-sm text-slate-500 mt-1">Desktop Application</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          {!isOnline && (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
              <WifiOff className="size-4 flex-shrink-0" />
              <span>You are offline</span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">
              <AlertTriangle className="size-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {setupStatus && (
            <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div className="flex items-start gap-3">
                <Loader2 className="mt-0.5 size-5 flex-shrink-0 animate-spin text-blue-700" />
                <div>
                  <p className="text-sm font-semibold text-blue-900">{setupStatus}</p>
                  <p className="mt-1 text-xs leading-5 text-blue-700">
                    Keep this window open until the dashboard loads. Closing during this step can leave the offline database partially configured.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Login Form (first-time setup) ───────────────────── */}
          {view === 'login' && (
            <>
              <h2 className="text-lg font-semibold text-slate-900 mb-1">Sign In</h2>
              <p className="text-sm text-slate-500 mb-6">Enter your staff credentials to set up this device</p>

              <form onSubmit={handleLogin}>
                <div className="mb-4">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="engineer@htaipl.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-11"
                  />
                </div>

                <div className="mb-6">
                  <Label htmlFor="password" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pr-11"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={isLoading}
                      aria-label={showPassword ? 'Hide typed text' : 'Show typed text'}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11" disabled={isLoading || !isOnline}>
                  {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  {isLoading ? 'Setting up local cache...' : 'Sign In & Set Up Device'}
                </Button>
              </form>
            </>
          )}

          {/* ─── Password + Challenge Code Unlock ────────────────── */}
          {view === 'unlock' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-slate-900">Unlock Device</h2>
              </div>
              {userDisplayName && (
                <p className="text-sm font-medium text-slate-700 mb-1">{userDisplayName}</p>
              )}
              {userEmail && (
                <p className="text-xs text-slate-400 mb-2">{userEmail}</p>
              )}
              <p className="text-sm text-slate-500 mb-6">
                Enter your password and look up the code on your printed card.
              </p>

              {codesRemaining !== undefined && codesRemaining <= 5 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
                  <AlertTriangle className="size-4 flex-shrink-0" />
                  <span>{codesRemaining} codes remaining. Connect online to replenish.</span>
                </div>
              )}

              {challengeKey && (
                <div className="flex items-center justify-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg mb-5">
                  <span className="text-sm text-blue-700">Find code</span>
                  <span className="text-3xl font-bold font-mono text-blue-900 tracking-wider">{challengeKey}</span>
                  <span className="text-sm text-blue-700">on your card</span>
                </div>
              )}

              <form onSubmit={handleUnlock}>
                <div className="mb-4">
                  <Label htmlFor="unlockPassword" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="unlockPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pr-11"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={isLoading}
                      aria-label={showPassword ? 'Hide typed text' : 'Show typed text'}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <Label htmlFor="responseValue" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Code for {challengeKey || '...'}
                  </Label>
                  <Input
                    id="responseValue"
                    type="text"
                    placeholder="e.g. KX9P"
                    value={responseValue}
                    onChange={(e) => setResponseValue(e.target.value.toUpperCase().replace(/\s/g, ''))}
                    required
                    maxLength={4}
                    disabled={isLoading}
                    className="h-11 text-center text-2xl tracking-[0.4em] font-mono"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={isLoading || unlockPassword.length < 1 || responseValue.length < 4 || !challengeKey}
                >
                  {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  {isLoading ? 'Unlocking...' : 'Unlock'}
                </Button>
              </form>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500">
                  Not {userDisplayName || userEmail || 'this user'}? You can reprovision this setup with a different user.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={isLoading}
                  onClick={startReprovisionFlow}
                >
                  Reprovision Device
                </Button>
              </div>
            </>
          )}

          {/* ─── Password-Only Re-entry (idle timeout) ───────────── */}
          {view === 'password-only' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Lock className="size-5 text-primary" />
                <h2 className="text-lg font-semibold text-slate-900">Welcome Back</h2>
              </div>
              {userDisplayName && (
                <p className="text-sm font-medium text-slate-700 mb-1">{userDisplayName}</p>
              )}
              {userEmail && (
                <p className="text-xs text-slate-400 mb-4">{userEmail}</p>
              )}
              {!userDisplayName && (
                <p className="text-sm text-slate-500 mb-6">
                  Enter your password to continue.
                </p>
              )}

              <form onSubmit={handlePasswordOnly}>
                <div className="mb-6">
                  <Label htmlFor="reentryPassword" className="text-xs font-semibold text-slate-600 mb-1.5 block">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="reentryPassword"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={unlockPassword}
                      onChange={(e) => setUnlockPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      className="h-11 pr-11"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      disabled={isLoading}
                      aria-label={showPassword ? 'Hide typed text' : 'Show typed text'}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full h-11" disabled={isLoading || unlockPassword.length < 1}>
                  {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  {isLoading ? 'Unlocking...' : 'Unlock'}
                </Button>
              </form>
              <div className="mt-5 border-t border-slate-100 pt-4">
                <p className="text-xs text-slate-500">
                  Not {userDisplayName || userEmail || 'this user'}? You can reprovision this setup with a different user.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={isLoading}
                  onClick={startReprovisionFlow}
                >
                  Reprovision Device
                </Button>
              </div>
            </>
          )}

          {showReprovisionConfirm && (view === 'unlock' || view === 'password-only') && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 size-5 flex-shrink-0 text-red-700" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-red-900">Reprovision this device?</p>
                  {isLoadingReprovisionImpact ? (
                    <p className="mt-2 text-sm text-red-800">Checking unsynced local data...</p>
                  ) : (
                    <p className="mt-2 text-sm leading-5 text-red-800">
                      There are {reprovisionImpact?.unsyncedAuditEntries ?? 0} audit entries not yet synced, including {reprovisionImpact?.affectedCertificates ?? 0} certificates. This will also remove {reprovisionImpact?.pendingDrafts ?? 0} pending local drafts and {reprovisionImpact?.unsyncedImages ?? 0} unsynced images from this device.
                    </p>
                  )}
                  <p className="mt-2 text-sm font-medium text-red-900">
                    Are you sure you want to reprovision this setup? Local offline data will be lost.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button
                      type="button"
                      variant="destructive"
                      className="flex-1"
                      disabled={isLoading || isLoadingReprovisionImpact}
                      onClick={confirmReprovision}
                    >
                      {isLoading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Yes, Reprovision
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      disabled={isLoading}
                      onClick={() => setShowReprovisionConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-slate-400 mt-6">
          &copy; 2026 HTA Instrumentation. All rights reserved.
        </p>
      </div>
    </div>
  )
}
