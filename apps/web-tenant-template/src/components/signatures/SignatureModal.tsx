'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import TypedSignature, { type TypedSignatureHandle } from './TypedSignature'
import type { SignatureData } from '@/types/signatures'
import { CONSENT_STATEMENTS, CONSENT_VERSION } from '@/lib/constants/consent-text'
import {
  CheckCircle,
  Loader2,
  AlertTriangle,
  X,
} from 'lucide-react'

interface SignatureModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (data: SignatureData) => void | Promise<void>
  defaultName?: string
  nameReadOnly?: boolean // When true, name field is locked to defaultName (for profile validation)
  title?: string
  description?: string
  confirmLabel?: string
  loading?: boolean
  error?: string | null
  collectEvidence?: boolean // defaults to true
}

export default function SignatureModal({
  isOpen,
  onClose,
  onConfirm,
  defaultName = '',
  nameReadOnly = false,
  title = 'Sign Certificate',
  description = 'Please sign below. Your signature will be added to the document.',
  confirmLabel = 'Confirm & Sign',
  loading = false,
  error = null,
  collectEvidence = true,
}: SignatureModalProps) {
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const [signerName, setSignerName] = useState(defaultName)
  const [localError, setLocalError] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<number | null>(null)

  // For SSR safety - only render portal after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  const displayError = error || localError

  const handleSignatureReady = useCallback((hasSig: boolean) => {
    setHasSignature(hasSig)
    if (hasSig) setLocalError(null)
  }, [])

  const handleConsentChange = (checked: boolean) => {
    setConsentAccepted(checked)
    if (checked) {
      setConsentAcceptedAt(Date.now())
      setLocalError(null)
    } else {
      setConsentAcceptedAt(null)
    }
  }

  const handleConfirm = async () => {
    if (collectEvidence && !consentAccepted) {
      setLocalError('Please accept the consent statements before signing')
      return
    }
    if (!signerName.trim()) {
      setLocalError('Please enter your name to generate signature')
      return
    }

    setLocalError(null)
    const signatureImage = signatureRef.current?.toDataURL() || ''

    // Build signature data with optional client evidence
    const signatureData: SignatureData = {
      signatureImage,
      signerName: signerName.trim(),
    }

    if (collectEvidence && consentAcceptedAt) {
      signatureData.clientEvidence = {
        clientTimestamp: Date.now(),
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvasSize: { width: 400, height: 150 },
        consentVersion: CONSENT_VERSION,
        consentAcceptedAt: consentAcceptedAt,
      }
    }

    await onConfirm(signatureData)
  }

  const handleClose = () => {
    if (loading) return
    // Reset local state on close
    setLocalError(null)
    setHasSignature(false)
    setSignerName(defaultName)
    setConsentAccepted(false)
    setConsentAcceptedAt(null)
    onClose()
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600">{description}</p>

          {/* Consent Section */}
          {collectEvidence && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg border">
              <p className="text-sm font-medium text-gray-700">Before signing, please confirm:</p>
              <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc">
                {CONSENT_STATEMENTS.map((statement, i) => (
                  <li key={i}>{statement}</li>
                ))}
              </ul>
              <label className="flex items-center gap-2 cursor-pointer pt-2">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => handleConsentChange(e.target.checked)}
                  className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                  disabled={loading}
                />
                <span className="text-sm font-medium text-gray-700">I agree to the above statements</span>
              </label>
            </div>
          )}

          {/* Name Input - moved above signature since signature is generated from name */}
          <div className={collectEvidence && !consentAccepted ? 'opacity-50 pointer-events-none' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
              {nameReadOnly && (
                <span className="ml-2 text-xs text-gray-500 font-normal">(from your profile)</span>
              )}
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => {
                if (nameReadOnly) return // Prevent changes when read-only
                setSignerName(e.target.value)
                if (localError) setLocalError(null)
              }}
              readOnly={nameReadOnly}
              disabled={collectEvidence && !consentAccepted}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
                nameReadOnly ? 'bg-gray-100 cursor-not-allowed' : ''
              }`}
              placeholder="Enter your full name"
            />
          </div>

          {/* Signature Preview - auto-generated from name */}
          <div className={collectEvidence && !consentAccepted ? 'opacity-50' : ''}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Signature
            </label>
            <TypedSignature
              ref={signatureRef}
              name={signerName}
              onSignatureReady={handleSignatureReady}
            />
          </div>

          {/* Error Display */}
          {displayError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {displayError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !signerName.trim() || (collectEvidence && !consentAccepted)}
            className="bg-green-600 hover:bg-green-700"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-2" />
            )}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
