'use client'

import { useState, useEffect, Suspense } from 'react'
import { signIn, getCsrfToken } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Image from 'next/image'
import { Loader2, ArrowLeft } from 'lucide-react'
import { tenantConfig } from '@/config/tenant'

function BackupCodeForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [backupCode, setBackupCode] = useState('')
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
      // First authenticate with email/password
      const result = await signIn('staff-credentials', {
        email,
        password,
        redirect: false,
        csrfToken,
      })

      if (result?.error) {
        setLoginError('Invalid email or password')
        setIsLoading(false)
        return
      }

      // Then verify backup code via API
      const verifyRes = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: backupCode.replace(/-/g, ''),
          isBackupCode: true,
        }),
      })

      const verifyData = await verifyRes.json()

      if (!verifyRes.ok || !verifyData.success) {
        setLoginError(verifyData.error || 'Invalid backup code')
        setIsLoading(false)
        return
      }

      // Issue refresh token
      try {
        await fetch('/api/auth/issue-refresh-token', {
          method: 'POST',
          credentials: 'include',
        })
      } catch (err) {
        console.warn('Failed to issue refresh token:', err)
      }

      // Show warning if low on backup codes
      if (verifyData.remainingBackupCodes !== undefined && verifyData.remainingBackupCodes < 3) {
        alert(`Warning: You only have ${verifyData.remainingBackupCodes} backup codes remaining. Please generate new ones in Settings.`)
      }

      router.push(callbackUrl)
      router.refresh()
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
        <h1 className="text-2xl font-bold text-foreground">Use Backup Code</h1>
        <p className="text-muted-foreground mt-2">
          Enter one of your backup codes to sign in
        </p>
      </div>

      {/* Error Messages */}
      {loginError && (
        <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{loginError}</p>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="email">Email Address</Label>
          <Input
            id="email"
            type="email"
            placeholder="engineer@htaipl.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
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

        <div className="space-y-2">
          <Label htmlFor="backupCode">Backup Code</Label>
          <Input
            id="backupCode"
            type="text"
            placeholder="XXXX-XXXX"
            value={backupCode}
            onChange={(e) => setBackupCode(e.target.value.toUpperCase())}
            required
            disabled={isLoading}
            className="w-full text-center text-lg tracking-wider"
          />
          <p className="text-xs text-muted-foreground">
            Enter one of the backup codes you saved when setting up 2FA
          </p>
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={isLoading || backupCode.length < 8}
        >
          {isLoading ? 'Verifying...' : 'Sign In with Backup Code'}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => router.push('/login')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Login
        </Button>
      </form>
    </div>
  )
}

function FormSkeleton() {
  return (
    <div className="bg-card rounded-lg shadow-lg p-8">
      <div className="flex justify-center items-center min-h-[300px]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    </div>
  )
}

export default function BackupCodePage() {
  return (
    <div className="max-w-md w-full mx-4">
      <Suspense fallback={<FormSkeleton />}>
        <BackupCodeForm />
      </Suspense>
    </div>
  )
}
