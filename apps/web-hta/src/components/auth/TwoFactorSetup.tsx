'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { TwoFactorInput } from './TwoFactorInput'
import { Loader2, Copy, Check, Shield, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface TwoFactorSetupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

type SetupStep = 'qr' | 'verify' | 'backup' | 'complete'

interface SetupData {
  secret: string
  qrCodeUrl: string
  backupCodes: string[]
}

/**
 * Two-Factor Authentication setup dialog
 * Guides user through QR code scanning, verification, and backup code display
 */
export function TwoFactorSetup({
  open,
  onOpenChange,
  onSuccess,
}: TwoFactorSetupProps) {
  const [step, setStep] = useState<SetupStep>('qr')
  const [setupData, setSetupData] = useState<SetupData | null>(null)
  const [verificationCode, setVerificationCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)
  const [copiedBackup, setCopiedBackup] = useState(false)

  // Fetch setup data when dialog opens
  useEffect(() => {
    if (open && !setupData) {
      fetchSetupData()
    }
  }, [open, setupData])

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setStep('qr')
      setSetupData(null)
      setVerificationCode('')
      setBackupCodes([])
      setError(null)
      setCopiedSecret(false)
      setCopiedBackup(false)
    }
  }, [open])

  const fetchSetupData = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/2fa/setup', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to initialize 2FA setup')
      }
      setSetupData({
        secret: data.secret,
        qrCodeUrl: data.qrCodeUrl,
        backupCodes: data.backupCodes || [],
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start setup')
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerify = async () => {
    if (verificationCode.length !== 6) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: verificationCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Invalid verification code')
      }
      // Use backup codes from setup data (they're only returned once during setup)
      setBackupCodes(setupData?.backupCodes || [])
      setStep('backup')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed')
      setVerificationCode('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopySecret = async () => {
    if (!setupData) return
    await navigator.clipboard.writeText(setupData.secret)
    setCopiedSecret(true)
    setTimeout(() => setCopiedSecret(false), 2000)
  }

  const handleCopyBackupCodes = async () => {
    const text = backupCodes.join('\n')
    await navigator.clipboard.writeText(text)
    setCopiedBackup(true)
    setTimeout(() => setCopiedBackup(false), 2000)
  }

  const handleComplete = () => {
    onOpenChange(false)
    onSuccess()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {step === 'qr' && 'Set Up Two-Factor Authentication'}
            {step === 'verify' && 'Verify Your Code'}
            {step === 'backup' && 'Save Your Backup Codes'}
            {step === 'complete' && '2FA Enabled'}
          </DialogTitle>
          <DialogDescription>
            {step === 'qr' &&
              'Scan the QR code with your authenticator app (Google Authenticator, Authy, etc.)'}
            {step === 'verify' &&
              'Enter the 6-digit code from your authenticator app'}
            {step === 'backup' &&
              'Save these backup codes in a secure location. You can use them if you lose access to your authenticator.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Loading State */}
          {isLoading && step === 'qr' && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Step 1: QR Code */}
          {step === 'qr' && setupData && !isLoading && (
            <div className="space-y-4">
              <div className="flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={setupData.qrCodeUrl}
                  alt="2FA QR Code"
                  className="w-48 h-48 rounded-lg border"
                />
              </div>

              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-2">
                  Can&apos;t scan? Enter this code manually:
                </p>
                <div className="flex items-center justify-center gap-2">
                  <code className="bg-muted px-3 py-1.5 rounded font-mono text-sm">
                    {setupData.secret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleCopySecret}
                    className="h-8 w-8"
                  >
                    {copiedSecret ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={() => setStep('verify')}
              >
                Continue
              </Button>
            </div>
          )}

          {/* Step 2: Verification */}
          {step === 'verify' && (
            <div className="space-y-6">
              <TwoFactorInput
                value={verificationCode}
                onChange={setVerificationCode}
                disabled={isLoading}
                autoFocus
              />

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setStep('qr')}
                  disabled={isLoading}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleVerify}
                  disabled={verificationCode.length !== 6 || isLoading}
                  className="flex-1"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Enable'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Backup Codes */}
          {step === 'backup' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <p className="font-medium">Important!</p>
                    <p>
                      Each backup code can only be used once. Store them securely
                      and don&apos;t share them with anyone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((code, index) => (
                    <code
                      key={index}
                      className="bg-background px-3 py-2 rounded text-center font-mono text-sm"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                onClick={handleCopyBackupCodes}
                className="w-full"
              >
                {copiedBackup ? (
                  <>
                    <Check className="mr-2 h-4 w-4 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy All Codes
                  </>
                )}
              </Button>

              <Button onClick={handleComplete} className="w-full">
                I&apos;ve Saved My Codes
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
