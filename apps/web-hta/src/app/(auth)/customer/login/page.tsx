'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getCsrfToken } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

function CustomerLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/customer/dashboard'
  const error = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      const result = await signIn('customer-credentials', {
        email,
        password,
        csrfToken,
        redirect: false,
      })

      if (result?.error) {
        setLoginError('Invalid email or password')
      } else if (result?.ok) {
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

  return (
    <>
      <h1 className="text-[30px] font-extrabold tracking-tight text-foreground mb-1.5">
        Sign in
      </h1>
      <p className="text-[15px] text-muted-foreground mb-9 leading-relaxed">
        Enter your credentials to continue
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
            placeholder="your.email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="h-11 rounded-[10px] border-border px-3.5 text-sm"
          />
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-[7px]">
            <Label htmlFor="password" className="text-xs font-bold text-slate-600 tracking-wide">
              Password
            </Label>
            <a href="/customer/forgot-password" className="text-xs text-primary font-semibold hover:text-primary/80">
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
            disabled={isLoading}
            className="h-11 rounded-[10px] border-border px-3.5 text-sm"
          />
        </div>

        <Button
          type="submit"
          className="w-full h-[46px] rounded-[10px] bg-primary text-white text-[15px] font-bold mb-6"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="size-4 animate-spin mr-2" />
          ) : null}
          {isLoading ? 'Signing in...' : 'Sign in'}
        </Button>
      </form>

      {/* Help text */}
      <p className="text-[13px] text-muted-foreground text-center leading-[1.7]">
        Don&apos;t have an account? Contact your company administrator or{' '}
        <span className="text-primary font-semibold cursor-pointer">reach out to HTA</span> to set up your account.
      </p>

      {/* Staff link */}
      <div className="mt-6 pt-5 border-t border-slate-100 text-center flex items-center justify-center gap-1.5">
        <span className="text-[13px] text-muted-foreground">{tenantConfig.name} Staff?</span>
        <a href="/login" className="text-[13px] text-primary font-bold hover:text-primary/80">
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

export default function CustomerLoginPage() {
  return (
    <Suspense fallback={<LoginFormSkeleton />}>
      <CustomerLoginForm />
    </Suspense>
  )
}
