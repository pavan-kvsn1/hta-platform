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

  // Fetch CSRF token on mount
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
        redirect: false,
        csrfToken,
      })

      if (result?.error) {
        setLoginError('Invalid email or password')
      } else if (result?.ok) {
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
        <p className="text-muted-foreground mt-2">Customer Portal</p>
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
            placeholder="your.email@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <a
              href="/customer/forgot-password"
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
            disabled={isLoading}
            className="w-full"
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </Button>
      </form>

      {/* Help Text */}
      <div className="mt-6 text-center border-t pt-6">
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account? Contact your company administrator
          or reach out to {tenantConfig.name} to set up your account.
        </p>
      </div>

      {/* Staff Login Link */}
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          {tenantConfig.name} Staff?{' '}
          <a
            href="/login"
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

export default function CustomerLoginPage() {
  return (
    <div className="max-w-md w-full mx-4">
      <Suspense fallback={<LoginFormSkeleton />}>
        <CustomerLoginForm />
      </Suspense>
    </div>
  )
}
