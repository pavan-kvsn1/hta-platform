'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getCsrfToken } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

function StaffLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [requires2FA, setRequires2FA] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [csrfToken, setCsrfToken] = useState<string | undefined>()

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
        const sessionRes = await fetch('/api/auth/session')
        const session = await sessionRes.json()

        if (session?.user?.requires2FA) {
          setRequires2FA(true)
          setTotpCode('')
          setIsLoading(false)
          return
        }

        try {
          await fetch('/api/auth/issue-refresh-token', {
            method: 'POST',
            credentials: 'include',
          })
        } catch (err) {
          console.warn('Failed to issue refresh token:', err)
        }

        const destination = searchParams.get('callbackUrl')
          || (session?.user?.role === 'ADMIN' ? '/admin' : '/dashboard')
        router.push(destination)
        router.refresh()
      }
    } catch {
      setLoginError('An error occurred. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    if (requires2FA) {
      setRequires2FA(false)
      setTotpCode('')
    }
  }

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight text-foreground mb-1.5">
        Sign in
      </h1>
      <p className="text-[15px] text-muted-foreground mb-9 leading-relaxed">
        Enter your staff credentials to continue
      </p>

      {/* Error */}
      {(error || loginError) && (
        <div className="mb-5 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <p className="text-sm text-destructive">
            {loginError || 'Authentication failed. Please try again.'}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="mb-[18px]">
          <Label htmlFor="email" className="block text-xs font-bold text-slate-600 mb-[7px] tracking-wide">
            Email Address
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="engineer@htaipl.com"
            value={email}
            onChange={handleEmailChange}
            required
            disabled={isLoading || requires2FA}
            className="h-11 rounded-[10px] border-border px-3.5 text-sm"
          />
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-[7px]">
            <Label htmlFor="password" className="text-xs font-bold text-slate-600 tracking-wide">
              Password
            </Label>
            <a href="/forgot-password" className="text-xs text-primary font-semibold hover:text-primary/80">
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
            className="h-11 rounded-[10px] border-border px-3.5 text-sm"
          />
        </div>

        {/* 2FA */}
        {requires2FA && (
          <div className="mb-8">
            <Label htmlFor="totpCode" className="block text-xs font-bold text-slate-600 mb-[7px] tracking-wide">
              Two-Factor Authentication Code
            </Label>
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
              className="h-11 rounded-[10px] text-center text-2xl tracking-widest"
              autoFocus
            />
            <p className="text-xs text-muted-foreground mt-2">
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
          className="w-full h-[46px] rounded-[10px] bg-primary text-white text-[15px] font-bold mb-6"
          disabled={isLoading || (requires2FA && totpCode.length !== 6)}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : null}
          {isLoading
            ? 'Verifying...'
            : requires2FA
              ? 'Verify & Sign In'
              : 'Sign in'}
        </Button>

        {requires2FA && (
          <Button
            type="button"
            variant="outline"
            className="w-full h-[46px] rounded-[10px] mb-6"
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

      {/* Customer link */}
      <div className="mt-6 pt-5 border-t border-slate-100 text-center flex items-center justify-center gap-1.5">
        <span className="text-[13px] text-muted-foreground">Customer?</span>
        <a href="/customer/login" className="text-[13px] text-primary font-bold hover:text-primary/80">
          Login here &rarr;
        </a>
      </div>
    </>
  )
}

function LoginFormSkeleton() {
  return (
    <div className="flex justify-center items-center min-h-[300px]">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <StaffLoginForm />
    </Suspense>
  )
}
