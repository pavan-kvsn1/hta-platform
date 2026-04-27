'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
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
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
        <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-5">
          <Shield className="size-[18px] text-[#94a3b8]" />
          Two-Factor Authentication
        </h2>
        <div className="flex justify-center py-8">
          <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
        <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-5">
          <Shield className="size-[18px] text-[#94a3b8]" />
          Two-Factor Authentication
        </h2>
        <div className="text-center py-4">
          <p className="text-destructive text-[13px] mb-4">{error}</p>
          <Button variant="outline" size="sm" onClick={fetchStatus} className="rounded-lg border-[#e2e8f0] text-[13px]">
            <RefreshCw className="mr-1.5 size-3.5" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-[#e2e8f0] p-6">
        <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-5">
          <Shield className="size-[18px] text-[#94a3b8]" />
          Two-Factor Authentication
        </h2>

        <div className="space-y-0">
          {/* Status */}
          <div className="flex items-center justify-between py-3 border-b border-[#f1f5f9]">
            <div className="flex items-center gap-2">
              {status?.enabled ? (
                <ShieldCheck className="size-4 text-[#16a34a]" />
              ) : (
                <ShieldOff className="size-4 text-[#94a3b8]" />
              )}
              <span className="text-[13px] text-[#64748b]">Status</span>
            </div>
            <span className={
              status?.enabled
                ? 'text-[12px] font-medium text-[#16a34a] bg-[#f0fdf4] border border-[#bbf7d0] px-2.5 py-0.5 rounded-full'
                : 'text-[12px] font-medium text-[#dc2626] bg-[#fef2f2] border border-[#fecaca] px-2.5 py-0.5 rounded-full'
            }>
              {status?.enabled ? 'Enabled' : 'Disabled'}
            </span>
          </div>

          {/* Enabled At */}
          {status?.enabled && status.enabledAt && (
            <div className="flex items-center justify-between py-3 border-b border-[#f1f5f9]">
              <span className="text-[13px] text-[#64748b]">Enabled Since</span>
              <span className="text-[13px] font-medium text-[#0f172a]">
                {new Date(status.enabledAt).toLocaleDateString()}
              </span>
            </div>
          )}

          {/* Backup Codes */}
          {status?.enabled && (
            <div className="flex items-center justify-between py-3 border-b border-[#f1f5f9]">
              <div className="flex items-center gap-2">
                <Key className="size-3.5 text-[#94a3b8]" />
                <span className="text-[13px] text-[#64748b]">Backup Codes</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={
                  (status.remainingBackupCodes ?? 0) < 3
                    ? 'text-[13px] font-medium text-amber-600'
                    : 'text-[13px] font-medium text-[#0f172a]'
                }>
                  {status.remainingBackupCodes} remaining
                </span>
                {(status.remainingBackupCodes ?? 0) < 3 && (
                  <AlertTriangle className="size-3.5 text-amber-500" />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-5 space-y-2.5">
          {status?.enabled ? (
            <>
              <Button
                variant="outline"
                onClick={() => setShowRegenerateBackup(true)}
                className="w-full rounded-lg border-[#e2e8f0] text-[13px] font-medium text-[#475569] h-10"
              >
                <RefreshCw className="mr-1.5 size-3.5" />
                Regenerate Backup Codes
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowDisable(true)}
                className="w-full rounded-lg border-[#e2e8f0] text-[13px] font-medium text-destructive hover:text-destructive h-10"
              >
                <ShieldOff className="mr-1.5 size-3.5" />
                Disable 2FA
              </Button>
            </>
          ) : (
            <>
              <p className="text-[13px] text-[#94a3b8]">
                Add an extra layer of security to your account by enabling two-factor authentication.
              </p>
              <Button
                variant="outline"
                onClick={() => setShowSetup(true)}
                className="w-full rounded-lg border-[#e2e8f0] text-[13px] font-medium text-[#475569] h-10"
              >
                <ShieldCheck className="mr-1.5 size-3.5" />
                Enable 2FA
              </Button>
            </>
          )}
        </div>
      </div>

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
