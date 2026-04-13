'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

interface TokenValidation {
  valid: boolean
  user?: {
    name: string
    email: string
    companyName: string
  }
  error?: string
}

export default function ActivateAccountPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const [validating, setValidating] = useState(true)
  const [validation, setValidation] = useState<TokenValidation | null>(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [activating, setActivating] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Password validation state
  const [passwordChecks, setPasswordChecks] = useState({
    minLength: false,
    hasUppercase: false,
    hasNumber: false,
    matches: false,
  })

  // Validate token on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        const res = await fetch(`/api/customer/activate?token=${encodeURIComponent(token)}`)
        const data = await res.json()

        if (res.ok) {
          setValidation({ valid: true, user: data.user })
        } else {
          setValidation({ valid: false, error: data.error })
        }
      } catch {
        setValidation({ valid: false, error: 'Failed to validate token' })
      } finally {
        setValidating(false)
      }
    }

    validateToken()
  }, [token])

  // Update password checks
  useEffect(() => {
    setPasswordChecks({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasNumber: /[0-9]/.test(password),
      matches: password.length > 0 && password === confirmPassword,
    })
  }, [password, confirmPassword])

  const isPasswordValid =
    passwordChecks.minLength &&
    passwordChecks.hasUppercase &&
    passwordChecks.hasNumber &&
    passwordChecks.matches

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!isPasswordValid) {
      setError('Please ensure all password requirements are met')
      return
    }

    setActivating(true)
    try {
      const res = await fetch('/api/customer/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to activate account')
      }

      setSuccess(true)
      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/customer/login')
      }, 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate account')
    } finally {
      setActivating(false)
    }
  }

  // Loading state
  if (validating) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8 max-w-md w-full mx-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Validating activation link...</p>
      </div>
    )
  }

  // Invalid token
  if (!validation?.valid) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8 max-w-md w-full mx-4 text-center">
        <div className="flex justify-center mb-4">
          <Image
            src={tenantConfig.branding.logoUrl}
            alt={tenantConfig.branding.logoAlt}
            width={120}
            height={60}
            className="object-contain"
          />
        </div>
        <div className="flex justify-center mb-4">
          <XCircle className="h-12 w-12 text-red-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Invalid Activation Link</h1>
        <p className="text-muted-foreground mb-6">{validation?.error || 'This activation link is invalid or has expired.'}</p>
        <p className="text-sm text-muted-foreground">
          Please contact your administrator to request a new activation link.
        </p>
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="bg-card rounded-lg shadow-lg p-8 max-w-md w-full mx-4 text-center">
        <div className="flex justify-center mb-4">
          <Image
            src={tenantConfig.branding.logoUrl}
            alt={tenantConfig.branding.logoAlt}
            width={120}
            height={60}
            className="object-contain"
          />
        </div>
        <div className="flex justify-center mb-4">
          <CheckCircle className="h-12 w-12 text-green-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-2">Account Activated!</h1>
        <p className="text-muted-foreground mb-4">
          Your account has been successfully activated. You can now log in with your email and password.
        </p>
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    )
  }

  // Activation form
  return (
    <div className="max-w-md w-full mx-4">
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
          <h1 className="text-2xl font-bold text-foreground">Activate Your Account</h1>
          <p className="text-muted-foreground mt-2">Create a password to complete your account setup</p>
        </div>

        {/* User Info */}
        <div className="bg-primary/10 rounded-lg p-4 mb-6">
          <p className="text-sm text-primary">
            <span className="font-medium">Welcome, {validation.user?.name}!</span>
          </p>
          <p className="text-sm text-primary/80 mt-1">
            {validation.user?.email} | {validation.user?.companyName}
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleActivate} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a password"
                disabled={activating}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                disabled={activating}
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
          </div>

          {/* Password Requirements */}
          <div className="space-y-1.5 text-sm">
            <p className="text-muted-foreground font-medium">Password must:</p>
            <div className="grid grid-cols-2 gap-1">
              <div className={`flex items-center gap-1.5 ${passwordChecks.minLength ? 'text-green-600' : 'text-muted-foreground'}`}>
                {passwordChecks.minLength ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-current" />
                )}
                <span>8+ characters</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordChecks.hasUppercase ? 'text-green-600' : 'text-muted-foreground'}`}>
                {passwordChecks.hasUppercase ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-current" />
                )}
                <span>Uppercase letter</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordChecks.hasNumber ? 'text-green-600' : 'text-muted-foreground'}`}>
                {passwordChecks.hasNumber ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-current" />
                )}
                <span>Number</span>
              </div>
              <div className={`flex items-center gap-1.5 ${passwordChecks.matches ? 'text-green-600' : 'text-muted-foreground'}`}>
                {passwordChecks.matches ? (
                  <CheckCircle className="h-3.5 w-3.5" />
                ) : (
                  <div className="h-3.5 w-3.5 rounded-full border border-current" />
                )}
                <span>Passwords match</span>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={activating || !isPasswordValid}
          >
            {activating ? (
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

      {/* Footer */}
      <p className="text-center text-sm text-muted-foreground mt-4">
        {tenantConfig.name}
      </p>
    </div>
  )
}
