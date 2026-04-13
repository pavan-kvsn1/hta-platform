'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  CheckCircle,
  Mail,
  X,
  Loader2,
  AlertTriangle,
  Lock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import TypedSignature, { type TypedSignatureHandle } from '@/components/signatures/TypedSignature'
import { CONSENT_STATEMENTS, CONSENT_VERSION } from '@/lib/constants/consent-text'
import type { ClientEvidence } from '@/types/signatures'

interface ReviewerApproveModalProps {
  isOpen: boolean
  onClose: () => void
  certificateId: string
  certificateNumber: string
  uucDescription: string | null
  customerName: string | null
  customerEmail?: string | null
  onApprove: (data: ApprovalData) => Promise<void>
}

interface ApprovalData {
  comment?: string
  sendToCustomer?: {
    email: string
    name: string
    message?: string
  }
  signatureInfo: {
    signatureImage: string
    signerName: string
    clientEvidence: ClientEvidence
  }
}

export function ReviewerApproveModal({
  isOpen,
  onClose,
  certificateId: _certificateId,
  certificateNumber,
  uucDescription,
  customerName,
  customerEmail,
  onApprove,
}: ReviewerApproveModalProps) {
  const { data: session } = useSession()
  const [mounted, setMounted] = useState(false)

  // Approval comment
  const [approvalComment, setApprovalComment] = useState('')

  // Send to customer state
  const [sendToCustomer, setSendToCustomer] = useState(true)
  const [email, setEmail] = useState(customerEmail || '')
  const [name, setName] = useState(customerName || '')
  const [message, setMessage] = useState('')

  // Signature state
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const signerName = session?.user?.name || ''

  // Consent state
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<number | null>(null)

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // For SSR safety
  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setApprovalComment('')
      setEmail(customerEmail || '')
      setName(customerName || '')
      setMessage('')
      setSendToCustomer(true)
      setConsentAccepted(false)
      setConsentAcceptedAt(null)
      setError(null)
    }
  }, [isOpen, customerEmail, customerName])

  const handleSignatureReady = useCallback((hasSig: boolean) => {
    setHasSignature(hasSig)
  }, [])

  const handleSubmit = async () => {
    setError(null)

    // Validate consent
    if (!consentAccepted) {
      setError('Please accept the consent statements before signing')
      return
    }

    // Validate signature
    if (!hasSignature) {
      setError('Please sign to approve this certificate')
      return
    }
    if (!signerName.trim()) {
      setError('Your name could not be retrieved from your profile')
      return
    }

    // Validate customer data if sending to customer
    if (sendToCustomer) {
      if (!email.trim()) {
        setError('Customer email is required')
        return
      }
      if (!name.trim()) {
        setError('Customer name is required')
        return
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setError('Please enter a valid email address')
        return
      }
    }

    setIsSubmitting(true)

    const signatureImage = signatureRef.current?.toDataURL() || ''

    // Collect client evidence
    const clientEvidence: ClientEvidence = {
      clientTimestamp: Date.now(),
      userAgent: navigator.userAgent,
      screenResolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvasSize: { width: 400, height: 150 },
      consentVersion: CONSENT_VERSION,
      consentAcceptedAt: consentAcceptedAt!,
    }

    const approvalData: ApprovalData = {
      comment: approvalComment.trim() || undefined,
      signatureInfo: {
        signatureImage,
        signerName: signerName.trim(),
        clientEvidence,
      },
    }

    // Add send to customer data if selected
    if (sendToCustomer) {
      approvalData.sendToCustomer = {
        email: email.trim(),
        name: name.trim(),
        message: message.trim() || undefined,
      }
    }

    try {
      await onApprove(approvalData)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen || !mounted) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-green-100 rounded-lg">
              <CheckCircle className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Approve Certificate</h2>
              <p className="text-xs text-slate-500">{certificateNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Approval Comment */}
          <div>
            <Label className="text-xs font-medium text-gray-700 pb-0.5">
              Approval Comment (Optional)
            </Label>
            <Textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Add any comments about the approval..."
              className="mt-1 resize-none text-xs md:text-xs"
              rows={2}
            />
          </div>

          {/* Send to Customer Section */}
          <div className="space-y-3 pt-3 border-t border-gray-200">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendToCustomer}
                onChange={(e) => setSendToCustomer(e.target.checked)}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-medium text-gray-700">
                Send to customer for approval
              </span>
            </label>

            {sendToCustomer && (
              <div className="space-y-3 pl-5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-medium text-gray-700 pb-0.5 flex items-center gap-1">
                      Customer's Reviewer Email <span className="text-red-500">*</span>
                      {customerEmail && <Lock className="h-3 w-3 text-slate-400" />}
                    </Label>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => !customerEmail && setEmail(e.target.value)}
                      placeholder="customer@company.com"
                      readOnly={!!customerEmail}
                      className={cn(
                        "mt-0.5 text-xs h-8 md:text-xs",
                        customerEmail && "bg-gray-100 cursor-not-allowed text-gray-600"
                      )}
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-medium text-gray-700 pb-0.5 flex items-center gap-1">
                      Customer's Reviewer Name <span className="text-red-500">*</span>
                      {customerName && <Lock className="h-3 w-3 text-slate-400" />}
                    </Label>
                    <Input
                      type="text"
                      value={name}
                      onChange={(e) => !customerName && setName(e.target.value)}
                      placeholder="Contact person name"
                      readOnly={!!customerName}
                      className={cn(
                        "mt-0.5 text-xs h-8 md:text-xs",
                        customerName && "bg-gray-100 cursor-not-allowed text-gray-600"
                      )}
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-medium text-gray-700 pb-0.5">
                    Message (optional)
                  </Label>
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Add a personal message to the email..."
                    className="mt-0.5 resize-none text-xs md:text-xs"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Consent Section */}
          <div className="space-y-2 pt-3 border-t border-gray-200">
            <p className="text-xs font-medium text-gray-700">Before signing, please confirm:</p>
            <ul className="text-xs text-gray-600 space-y-0.5 ml-4 list-disc">
              {CONSENT_STATEMENTS.map((statement, i) => (
                <li key={i}>{statement}</li>
              ))}
            </ul>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={consentAccepted}
                onChange={(e) => {
                  setConsentAccepted(e.target.checked)
                  if (e.target.checked) setConsentAcceptedAt(Date.now())
                }}
                className="rounded border-gray-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5"
              />
              <span className="text-xs font-medium text-gray-700">I agree to the above statements</span>
            </label>
          </div>

          {/* Signature Section */}
          <div className={cn("space-y-2 pt-3 border-t border-gray-200", !consentAccepted && "opacity-50 pointer-events-none")}>
            <div>
              <Label className="text-xs font-medium text-gray-700 py-0.5">
                Your Name <span className="text-[10px] text-gray-500 font-normal ml-1">(from your profile)</span>
              </Label>
              <Input
                type="text"
                value={signerName}
                readOnly
                className="mt-0.5 bg-gray-100 cursor-not-allowed text-xs h-8 md:text-xs"
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-gray-700 py-0.5">
                Your Signature <span className="text-red-500">*</span>
              </Label>
              <div className="mt-0.5">
                <TypedSignature
                  ref={signatureRef}
                  name={signerName}
                  onSignatureReady={handleSignatureReady}
                />
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />
              <p className="text-xs text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t bg-gray-50 flex justify-end gap-2 sticky bottom-0">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={isSubmitting || !consentAccepted || !hasSignature}
            className="bg-green-600 hover:bg-green-700 text-xs"
          >
            {isSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : sendToCustomer ? (
              <Mail className="h-3.5 w-3.5 mr-1.5" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
            )}
            {isSubmitting
              ? 'Processing...'
              : sendToCustomer
                ? 'Approve & Send'
                : 'Approve Certificate'
            }
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}
