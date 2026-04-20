'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getCsrfToken } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

function StaffLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const error = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | undefined>()

  // Fetch CSRF token on mount
  useEffect(() => {
    getCsrfToken().then(setCsrfToken)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setLoginError(null)

    try {
      const result = await signIn('staff-credentials', {
        email,
        password,
        totpCode: requires2FA ? totpCode : undefined,
        redirect: false,
        csrfToken,
      })

      if (result?.error) {
        if (requires2FA) {
          setLoginError('Invalid 2FA code')
        } else {
          setLoginError('Invalid email or password')
        }
      } else if (result?.ok) {
        // Check if 2FA is required by fetching session
        const sessionRes = await fetch('/api/auth/session')
        const session = await sessionRes.json()

        if (session?.user?.requires2FA) {
          // 2FA required - show code input
          setRequires2FA(true)
          setTotpCode('')
          setIsLoading(false)
          return
        }

        // Issue refresh token after successful login
        try {
          await fetch('/api/auth/issue-refresh-token', {
            method: 'POST',
            credentials: 'include',
          })
        } catch (err) {
          console.warn('Failed to issue refresh token:', err)
        }
        router.push(callbackUrl)
        router.refresh()
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Reset 2FA state when email changes
  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (requires2FA) {
      setRequires2FA(false)
      setTotpCode('')
    }
  }

  return (
    <div className="bg-card rounded-lg shadow-lg p-8">
      {/* Logo and Header */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <Image
            src={tenantConfig.branding.logoUrl}
            alt={tenantConfig.branding.logoAlt}
            width={120}
            height={60}
            className="object-contain"
          />
        </div>
        <h1 className="text-2xl font-bold text-foreground">
          {tenantConfig.metadata.title}
        </h1>
        <p className="text-muted-foreground mt-2">Staff Login</p>
      </div>

      {/* Error Messages */}
      {(error || loginError) && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">
            {loginError || 'Authentication failed. Please try again.'}
          </p>
        </div>
      )}

      {/* Login Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="engineer@htaipl.com"
            value={email}
            onChange={handleEmailChange}
            required
            disabled={isLoading || requires2FA}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a
              href="/forgot-password"
              className="text-sm text-primary hover:text-primary/80"
            >
              Forgot password?
            </a>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading || requires2FA}
            className="w-full"
          />
        </div>

        {/* 2FA Code Input - shown when required */}
        {requires2FA && (
          <div className="space-y-2">
            <Label htmlFor="totpCode">Two-Factor Authentication Code</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Enter the 6-digit code from your authenticator app
            </p>
            <Input
              id="totpCode"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
              required
              disabled={isLoading}
              className="w-full text-center text-2xl tracking-widest"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Lost your authenticator?{' '}
              <button
                type="button"
                onClick={() => router.push('/login/backup-code')}
                className="text-primary hover:underline"
              >
                Use a backup code
              </button>
            </p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || !csrfToken || (requires2FA && totpCode.length !== 6)}
        >
          {isLoading
            ? 'Verifying...'
            : requires2FA
              ? 'Verify & Sign In'
              : 'Sign In'
          }
        </Button>

        {requires2FA && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setRequires2FA(false)
              setTotpCode('')
              setPassword('')
            }}
          >
            Back to Login
          </Button>
        )}
      </form>

      {/* Customer Login Link */}
      <div className="mt-6 text-center">
        <p className="text-sm text-muted-foreground">
          Customer?{' '}
          <a
            href="/customer/login"
            className="text-primary hover:text-primary/80 font-medium"
          >
            Login here
          </a>
        </p>
      </div>
    </div>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="bg-card rounded-lg shadow-lg p-8">
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div className="max-w-md w-full mx-4">
      <Suspense fallback={<LoginFormSkeleton />}>
        <StaffLoginForm />
      </Suspense>
    </div>
  )
}
