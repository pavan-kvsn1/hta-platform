'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TwoFactorSetup } from './TwoFactorSetup'
import { TwoFactorDisable } from './TwoFactorDisable'
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Key,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Copy,
  Check,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { TwoFactorInput } from './TwoFactorInput'

interface TwoFactorStatus {
  enabled: boolean
  enabledAt: string | null
  remainingBackupCodes: number
  hasBackupCodes: boolean
}

/**
 * Two-Factor Authentication settings card
 * Shows current 2FA status and provides enable/disable controls
 */
export function TwoFactorSettings() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showSetup, setShowSetup] = useState(false)
  const [showDisable, setShowDisable] = useState(false)
  const [showRegenerateBackup, setShowRegenerateBackup] = useState(false)

  const fetchStatus = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/2fa/status')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch 2FA status')
      }
      setStatus(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleSetupSuccess = () => {
    fetchStatus()
  }

  const handleDisableSuccess = () => {
    fetchStatus()
  }

  const handleRegenerateSuccess = () => {
    setShowRegenerateBackup(false)
    fetchStatus()
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <p className="text-destructive mb-4">{error}</p>
            <Button variant="outline" onClick={fetchStatus}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-slate-400" />
            Two-Factor Authentication
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between py-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              {status?.enabled ? (
                <ShieldCheck className="h-5 w-5 text-green-500" />
              ) : (
                <ShieldOff className="h-5 w-5 text-slate-400" />
              )}
              <span className="text-slate-700">Status</span>
            </div>
            <Badge variant={status?.enabled ? 'default' : 'secondary'}>
              {status?.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>

          {/* Enabled At */}
          {status?.enabled && status.enabledAt && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <span className="text-slate-500">Enabled Since</span>
              <span className="text-slate-700">
                {new Date(status.enabledAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Backup Codes */}
          {status?.enabled && (
            <div className="flex items-center justify-between py-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Key className="h-4 w-4 text-slate-400" />
                <span className="text-slate-500">Backup Codes</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={
                    (status.remainingBackupCodes ?? 0) < 3
                      ? 'text-amber-600 font-medium'
                      : 'text-slate-700'
                  }
                >
                  {status.remainingBackupCodes} remaining
                </span>
                {(status.remainingBackupCodes ?? 0) < 3 && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="pt-2 space-y-2">
            {status?.enabled ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRegenerateBackup(true)}
                  className="w-full"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate Backup Codes
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowDisable(true)}
                  className="w-full text-destructive hover:text-destructive"
                >
                  <ShieldOff className="mr-2 h-4 w-4" />
                  Disable 2FA
                </Button>
              </>
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-3">
                  Add an extra layer of security to your account by enabling
                  two-factor authentication.
                </p>
                <Button onClick={() => setShowSetup(true)} className="w-full">
                  <ShieldCheck className="mr-2 h-4 w-4" />
                  Enable 2FA
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <TwoFactorSetup
        open={showSetup}
        onOpenChange={setShowSetup}
        onSuccess={handleSetupSuccess}
      />

      {/* Disable Dialog */}
      <TwoFactorDisable
        open={showDisable}
        onOpenChange={setShowDisable}
        onSuccess={handleDisableSuccess}
      />

      {/* Regenerate Backup Codes Dialog */}
      <RegenerateBackupCodesDialog
        open={showRegenerateBackup}
        onOpenChange={setShowRegenerateBackup}
        onSuccess={handleRegenerateSuccess}
      />
    </>
  )
}

interface RegenerateBackupCodesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

function RegenerateBackupCodesDialog({
  open,
  onOpenChange,
  onSuccess,
}: RegenerateBackupCodesDialogProps) {
  const [step, setStep] = useState<'confirm' | 'codes'>('confirm')
  const [totpCode, setTotpCode] = useState('')
  const [backupCodes, setBackupCodes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleRegenerate = async () => {
    if (totpCode.length !== 6) return

    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/2fa/backup-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: totpCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to regenerate codes')
      }
      setBackupCodes(data.backupCodes)
      setStep('codes')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate codes')
      setTotpCode('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyBackupCodes = async () => {
    const text = backupCodes.join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setStep('confirm')
      setTotpCode('')
      setBackupCodes([])
      setError(null)
      setCopied(false)
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Regenerate Backup Codes
          </DialogTitle>
          <DialogDescription>
            {step === 'confirm'
              ? 'Enter your authenticator code to generate new backup codes. This will invalidate all existing backup codes.'
              : 'Save these new backup codes in a secure location.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-800">
                    All existing backup codes will be invalidated and replaced
                    with new ones.
                  </p>
                </div>
              </div>

              <TwoFactorInput
                value={totpCode}
                onChange={setTotpCode}
                disabled={isLoading}
                autoFocus
              />
            </div>
          )}

          {step === 'codes' && (
            <div className="space-y-4">
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
                {copied ? (
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
            </div>
          )}
        </div>

        <DialogFooter>
          {step === 'confirm' ? (
            <>
              <Button
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRegenerate}
                disabled={totpCode.length !== 6 || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Regenerate'
                )}
              </Button>
            </>
          ) : (
            <Button onClick={onSuccess} className="w-full">
              I&apos;ve Saved My Codes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
