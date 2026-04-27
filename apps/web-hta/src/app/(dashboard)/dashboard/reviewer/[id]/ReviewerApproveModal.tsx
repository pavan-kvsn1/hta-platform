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
  Pencil,
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
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

type Step = 1 | 2 | 3

const STEPS = [
  { num: 1 as Step, label: 'Review Details' },
  { num: 2 as Step, label: 'Delivery' },
  { num: 3 as Step, label: 'Sign & Confirm' },
]

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

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>(1)

  // Step 1 - Review Details
  const [approvalComment, setApprovalComment] = useState('')

  // Step 2 - Customer Delivery
  const [sendToCustomer, setSendToCustomer] = useState(true)
  const [email, setEmail] = useState(customerEmail || '')
  const [name, setName] = useState(customerName || '')
  const [message, setMessage] = useState('')
  const [editCustomerInfo, setEditCustomerInfo] = useState(false)
  const hasPrefilledInfo = !!(customerEmail && customerName)

  // Step 3 - Signature
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [hasSignature, setHasSignature] = useState(false)
  const signerName = session?.user?.name || ''

  // Consent
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<number | null>(null)

  // Form state
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(1)
      setApprovalComment('')
      setEmail(customerEmail || '')
      setName(customerName || '')
      setMessage('')
      setSendToCustomer(true)
      setEditCustomerInfo(false)
      setConsentAccepted(false)
      setConsentAcceptedAt(null)
      setHasSignature(false)
      setError(null)
    }
  }, [isOpen, customerEmail, customerName])

  const handleSignatureReady = useCallback((hasSig: boolean) => {
    setHasSignature(hasSig)
  }, [])

  const canProceedStep2 = (): boolean => {
    if (!sendToCustomer) return true
    if (!email.trim() || !name.trim()) return false
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false
    return true
  }

  const handleNext = () => {
    setError(null)
    if (currentStep === 2 && !canProceedStep2()) {
      if (!email.trim()) setError('Customer email is required')
      else if (!name.trim()) setError('Customer name is required')
      else setError('Please enter a valid email address')
      return
    }
    setCurrentStep((s) => Math.min(s + 1, 3) as Step)
  }

  const handleBack = () => {
    setError(null)
    setCurrentStep((s) => Math.max(s - 1, 1) as Step)
  }

  const handleSubmit = async () => {
    setError(null)

    if (!consentAccepted) {
      setError('Please accept the consent statements before signing')
      return
    }
    if (!hasSignature) {
      setError('Please sign to approve this certificate')
      return
    }
    if (!signerName.trim()) {
      setError('Your name could not be retrieved from your profile')
      return
    }

    setIsSubmitting(true)

    const signatureImage = signatureRef.current?.toDataURL() || ''

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-[#dcfce7] rounded-[9px]">
              <CheckCircle className="size-4 text-[#16a34a]" />
            </div>
            <div>
              <h2 className="text-[14px] font-semibold text-[#0f172a]">Approve Certificate</h2>
              <p className="text-[11px] font-mono text-[#94a3b8]">{certificateNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
          >
            <X className="size-4 text-[#94a3b8]" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-5 py-3 border-b border-[#f1f5f9] flex-shrink-0">
          <div className="flex items-center justify-between">
            {STEPS.map((step, i) => (
              <div key={step.num} className="flex items-center flex-1">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'size-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors',
                      currentStep > step.num
                        ? 'bg-[#16a34a] text-white'
                        : currentStep === step.num
                          ? 'bg-[#0f172a] text-white'
                          : 'bg-[#f1f5f9] text-[#94a3b8]'
                    )}
                  >
                    {currentStep > step.num ? (
                      <Check className="size-3.5" />
                    ) : (
                      step.num
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-[12px] font-semibold hidden sm:block',
                      currentStep >= step.num ? 'text-[#0f172a]' : 'text-[#94a3b8]'
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div
                    className={cn(
                      'flex-1 h-px mx-3',
                      currentStep > step.num ? 'bg-[#16a34a]' : 'bg-[#e2e8f0]'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* ===== STEP 1: Review Details ===== */}
          {currentStep === 1 && (
            <>
              {/* Certificate Summary */}
              <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="size-3.5 text-[#94a3b8]" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Certificate Summary</span>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] text-[#94a3b8]">UUC Description</p>
                    <p className="text-[13px] font-medium text-[#0f172a]">{uucDescription || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-[#94a3b8]">Customer</p>
                    <p className="text-[13px] font-medium text-[#0f172a]">{customerName || '—'}</p>
                  </div>
                </div>
              </div>

              {/* Approval Comment */}
              <div>
                <Label className="text-[12.5px] font-semibold text-[#0f172a]">
                  Approval Comment <span className="text-[#94a3b8] font-normal">(optional)</span>
                </Label>
                <Textarea
                  value={approvalComment}
                  onChange={(e) => setApprovalComment(e.target.value)}
                  placeholder="Add any comments about the approval..."
                  className="mt-1.5 resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8]"
                  rows={3}
                />
              </div>
            </>
          )}

          {/* ===== STEP 2: Customer Delivery ===== */}
          {currentStep === 2 && (
            <>
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendToCustomer}
                  onChange={(e) => setSendToCustomer(e.target.checked)}
                  className="rounded border-[#e2e8f0] text-[#16a34a] focus:ring-[#16a34a]/20 h-4 w-4"
                />
                <span className="text-[13px] font-semibold text-[#0f172a]">
                  Send to customer for approval
                </span>
              </label>

              {sendToCustomer && (
                <div className="space-y-3 pl-6 border-l-2 border-[#dcfce7]">
                  {hasPrefilledInfo && !editCustomerInfo ? (
                    <div className="flex items-center justify-between bg-[#f8fafc] border border-[#f1f5f9] rounded-lg px-3.5 py-3">
                      <div className="text-[12.5px] text-[#475569]">
                        <span className="font-semibold text-[#0f172a]">{name || '(no name)'}</span>
                        {email && <span className="text-[#94a3b8] ml-1.5">— {email}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setEditCustomerInfo(true)}
                        className="flex items-center gap-1 text-[12px] text-primary hover:text-primary/80 font-semibold"
                      >
                        <Pencil className="size-3" />
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                          Reviewer Email <span className="text-[#dc2626]">*</span>
                        </Label>
                        <Input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="customer@company.com"
                          className="mt-1.5 text-[12.5px] h-9 md:text-[12.5px] border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8]"
                        />
                      </div>
                      <div>
                        <Label className="text-[11px] font-semibold text-[#64748b] uppercase tracking-wider">
                          Reviewer Name <span className="text-[#dc2626]">*</span>
                        </Label>
                        <Input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Contact person name"
                          className="mt-1.5 text-[12.5px] h-9 md:text-[12.5px] border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8]"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <Label className="text-[12.5px] font-semibold text-[#0f172a]">
                      Message <span className="text-[#94a3b8] font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Add a personal message to the email..."
                      className="mt-1.5 resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8]"
                      rows={2}
                    />
                  </div>
                </div>
              )}

              {!sendToCustomer && (
                <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-4 text-center">
                  <p className="text-[12.5px] text-[#94a3b8]">
                    The certificate will be approved without sending to the customer.
                  </p>
                </div>
              )}
            </>
          )}

          {/* ===== STEP 3: Sign & Confirm ===== */}
          {currentStep === 3 && (
            <>
              {/* Consent */}
              <div className="space-y-2.5">
                <p className="text-[12.5px] font-semibold text-[#0f172a]">Before signing, please confirm:</p>
                <ul className="text-[12px] text-[#64748b] space-y-1 ml-4 list-disc">
                  {CONSENT_STATEMENTS.map((statement, i) => (
                    <li key={i}>{statement}</li>
                  ))}
                </ul>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentAccepted}
                    onChange={(e) => {
                      setConsentAccepted(e.target.checked)
                      if (e.target.checked) setConsentAcceptedAt(Date.now())
                    }}
                    className="rounded border-[#e2e8f0] text-[#16a34a] focus:ring-[#16a34a]/20 h-4 w-4"
                  />
                  <span className="text-[12.5px] font-semibold text-[#0f172a]">I agree to the above statements</span>
                </label>
              </div>

              {/* Signature */}
              <div className={cn('space-y-3 pt-4 border-t border-[#f1f5f9]', !consentAccepted && 'opacity-40 pointer-events-none')}>
                <div>
                  <Label className="text-[12.5px] font-semibold text-[#0f172a]">
                    Your Name <span className="text-[10px] text-[#94a3b8] font-normal ml-1">(from your profile)</span>
                  </Label>
                  <Input
                    type="text"
                    value={signerName}
                    readOnly
                    className="mt-1.5 bg-[#f8fafc] cursor-not-allowed text-[12.5px] h-9 md:text-[12.5px] border-[#e2e8f0] rounded-lg"
                  />
                </div>
                <div>
                  <Label className="text-[12.5px] font-semibold text-[#0f172a]">
                    Your Signature <span className="text-[#dc2626]">*</span>
                  </Label>
                  <div className="mt-1.5">
                    <TypedSignature
                      ref={signatureRef}
                      name={signerName}
                      onSignatureReady={handleSignatureReady}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
              <AlertTriangle className="h-3.5 w-3.5 text-[#dc2626] flex-shrink-0" />
              <p className="text-[12px] text-[#dc2626]">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
          <div>
            {currentStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                disabled={isSubmitting}
                className="text-[12.5px] font-semibold text-[#475569] hover:text-[#0f172a]"
              >
                <ArrowLeft className="size-3.5 mr-1" />
                Back
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
            >
              Cancel
            </Button>
            {currentStep < 3 ? (
              <Button
                size="sm"
                onClick={handleNext}
                className="bg-[#0f172a] hover:bg-[#1e293b] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                Next
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || !consentAccepted || !hasSignature}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isSubmitting ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : sendToCustomer ? (
                  <Mail className="size-3.5 mr-1.5" />
                ) : (
                  <CheckCircle className="size-3.5 mr-1.5" />
                )}
                {isSubmitting
                  ? 'Processing...'
                  : sendToCustomer
                    ? 'Approve & Send'
                    : 'Approve Certificate'
                }
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
