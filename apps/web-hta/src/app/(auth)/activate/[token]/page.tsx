'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { tenantConfig } from '@/config/tenant'

interface TokenValidation {
  valid: boolean
  email?: string
  name?: string
  error?: string
}

function ActivationForm() {
  const router = useRouter()
  const params = useParams()
  const token = params.token as string

  const [tokenValidation, setTokenValidation] = useState<TokenValidation | null>(null)
  const [validating, setValidating] = useState(true)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/auth/activate?token=${token}`)
        const data = await res.json()
        setTokenValidation(data)
      } catch {
        setTokenValidation({ valid: false, error: 'Failed to validate activation link' })
      } finally {
        setValidating(false)
      }
    }

    if (token) {
      validateToken()
    }
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const res = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
          confirmPassword,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate account')
      }

      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  // Password validation indicators
  const passwordChecks = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
  }
  const allChecksPass = Object.values(passwordChecks).every(Boolean)
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

  // Loading state
  if (validating) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8">
        <div className="flex flex-col items-center justify-center min-h-[300px]">
          <Loader2 className="size-8 animate-spin text-primary mb-4" />
          <p className="text-muted-foreground">Validating activation link...</p>
        </div>
      </div>
    )
  }

  // Invalid or expired token
  if (!tokenValidation?.valid) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src={tenantConfig.branding.logoUrl}
              alt={tenantConfig.branding.logoAlt}
              width={120}
              height={60}
              className="object-contain"
            />
          </div>
          <div className="size-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Invalid Activation Link
          </h1>
          <p className="text-muted-foreground mb-6">
            {tokenValidation?.error || 'This activation link is invalid or has expired.'}
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Please contact your administrator if you need a new activation link.
          </p>
          <Link href="/login">
            <Button variant="outline">Go to Login</Button>
          </Link>
        </div>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <Image
              src={tenantConfig.branding.logoUrl}
              alt={tenantConfig.branding.logoAlt}
              width={120}
              height={60}
              className="object-contain"
            />
          </div>
          <div className="size-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground mb-2">
            Account Activated!
          </h1>
          <p className="text-muted-foreground mb-6">
            Your account has been activated successfully. You can now log in with your email and password.
          </p>
          <Button
            onClick={() => router.push('/login')}
          >
            Go to Login
          </Button>
        </div>
      </div>
    )
  }

  // Activation form
  return (
    <div className="bg-card rounded-lg shadow-lg p-8">
      {/* Logo and Header */}
      <div className="text-center mb-6">
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
          Activate Your Account
        </h1>
        <p className="text-muted-foreground mt-2">
          Welcome, {tokenValidation.name}!
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          {tokenValidation.email}
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Activation Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Create Password</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Password requirements */}
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground mb-1">Password requirements:</p>
              <div className="grid grid-cols-2 gap-1">
                <PasswordCheck checked={passwordChecks.length} label="8+ characters" />
                <PasswordCheck checked={passwordChecks.uppercase} label="Uppercase letter" />
                <PasswordCheck checked={passwordChecks.lowercase} label="Lowercase letter" />
                <PasswordCheck checked={passwordChecks.number} label="Number" />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword">Confirm Password</Label>
          <div className="relative">
            <Input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={isLoading}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {confirmPassword.length > 0 && !passwordsMatch && (
            <p className="text-xs text-red-500">Passwords do not match</p>
          )}
          {passwordsMatch && (
            <p className="text-xs text-green-500">Passwords match</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full mt-6"
          disabled={isLoading || !allChecksPass || !passwordsMatch}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Activating...
            </>
          ) : (
            'Activate Account'
          )}
        </Button>
      </form>
    </div>
  )
}

function PasswordCheck({ checked, label }: { checked: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1">
      {checked ? (
        <CheckCircle className="h-3 w-3 text-green-500" />
      ) : (
        <div className="h-3 w-3 rounded-full border border-muted-foreground" />
      )}
      <span className={`text-xs ${checked ? 'text-green-600' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </div>
  )
}

// Loading skeleton
function ActivationFormSkeleton() {
  return (
    <div className="bg-card rounded-lg shadow-lg p-8">
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    </div>
  )
}

export default function ActivatePage() {
  return (
    <div className="max-w-md w-full mx-4">
      <Suspense fallback={<ActivationFormSkeleton />}>
        <ActivationForm />
      </Suspense>
    </div>
  )
}
