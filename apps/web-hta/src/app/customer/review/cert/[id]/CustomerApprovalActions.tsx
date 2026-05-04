'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import TypedSignature, { type TypedSignatureHandle } from '@/components/signatures/TypedSignature'
import { CONSENT_STATEMENTS, CONSENT_VERSION } from '@/lib/constants/consent-text'
import { REVISION_SECTIONS } from '@/components/feedback/shared/feedback-utils'
import { cn } from '@/lib/utils'
import type { SignatureData } from '@/types/signatures'
import {
  CheckCircle,
  RotateCcw,
  Loader2,
  X,
  Send,
  AlertCircle,
  FileText,
  ChevronRight,
  ChevronLeft,
  ClipboardCheck,
  PenTool,
  Beaker,
  Thermometer,
  BarChart3,
  StickyNote,
  Award,
  Wrench,
  Shield,
  User,
  Plus,
  Trash2,
} from 'lucide-react'
import type { CertificateData, CustomerData, Signature } from './CustomerCertReviewClient'

// Section definitions for the approve checklist
const SECTIONS = [
  { key: 'summary', label: 'Summary', icon: FileText, description: 'SRF details, dates, customer info' },
  { key: 'uuc-details', label: 'UUC Details', icon: Beaker, description: 'Unit Under Calibration specifications' },
  { key: 'master-inst', label: 'Master Instruments', icon: Wrench, description: 'Reference instruments used' },
  { key: 'environment', label: 'Environmental Conditions', icon: Thermometer, description: 'Temperature & humidity' },
  { key: 'results', label: 'Calibration Results', icon: BarChart3, description: 'Measurement results data' },
  { key: 'remarks', label: 'Remarks', icon: StickyNote, description: 'Calibration status remarks' },
  { key: 'conclusion', label: 'Conclusion', icon: Award, description: 'Conclusion statements' },
] as const

interface SectionFeedbackEntry {
  id: string
  section: string
  comment: string
}

interface CustomerApprovalActionsProps {
  certificate: CertificateData
  customer: CustomerData
  signatures: Signature[]
  canApprove: boolean
  onStatusChange?: (status: string) => void
}

export function CustomerApprovalActions({
  certificate,
  customer,
  signatures,
  canApprove,
  onStatusChange,
}: CustomerApprovalActionsProps) {
  const router = useRouter()
  const [isApproving, setIsApproving] = useState(false)
  const [isRequestingRevision, setIsRequestingRevision] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Approve flow: step 1 = review checklist, step 2 = signature
  const [approveStep, setApproveStep] = useState<0 | 1 | 2>(0) // 0=closed, 1=checklist, 2=signature
  const [checkedSections, setCheckedSections] = useState<Record<string, boolean>>({})

  // Signature state
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [consentAccepted, setConsentAccepted] = useState(false)
  const [consentAcceptedAt, setConsentAcceptedAt] = useState<number | null>(null)

  // Revision flow (single-step, matching reviewer pattern)
  const [showRevisionModal, setShowRevisionModal] = useState(false)
  const [sectionFeedbackEntries, setSectionFeedbackEntries] = useState<SectionFeedbackEntry[]>([
    { id: crypto.randomUUID(), section: '', comment: '' },
  ])
  const [generalNotes, setGeneralNotes] = useState('')

  const [actionTaken, setActionTaken] = useState<'approved' | 'revision' | null>(null)

  const isRevisionRequired = certificate.status === 'REVISION_REQUIRED'
  const isCustomerRevisionRequired = actionTaken === 'revision' || certificate.status === 'CUSTOMER_REVISION_REQUIRED'
  const isApproved = actionTaken === 'approved' || ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  const customerSignature = signatures.find(s => s.signerType === 'CUSTOMER')

  const allSectionsChecked = SECTIONS.every(s => checkedSections[s.key])

  // ─── Approve handlers ───

  const openApproveFlow = () => {
    setCheckedSections({})
    setConsentAccepted(false)
    setConsentAcceptedAt(null)
    setError(null)
    setApproveStep(1)
  }

  const toggleSectionCheck = (key: string) => {
    setCheckedSections(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const checkAllSections = () => {
    const allChecked = SECTIONS.every(s => checkedSections[s.key])
    if (allChecked) {
      setCheckedSections({})
    } else {
      const all: Record<string, boolean> = {}
      SECTIONS.forEach(s => { all[s.key] = true })
      setCheckedSections(all)
    }
  }

  const handleConsentChange = (checked: boolean) => {
    setConsentAccepted(checked)
    setConsentAcceptedAt(checked ? Date.now() : null)
    if (checked) setError(null)
  }

  const handleApprove = useCallback(async () => {
    if (!consentAccepted) {
      setError('Please accept the consent statements before signing')
      return
    }

    const signatureImage = signatureRef.current?.toDataURL() || ''
    if (!signatureImage) {
      setError('Signature could not be generated')
      return
    }

    setIsApproving(true)
    setError(null)

    try {
      const token = `cert:${certificate.id}`
      const encodedToken = encodeURIComponent(token)

      const clientEvidence = consentAcceptedAt ? {
        clientTimestamp: Date.now(),
        userAgent: navigator.userAgent,
        screenResolution: `${screen.width}x${screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        canvasSize: { width: 400, height: 150 },
        consentVersion: CONSENT_VERSION,
        consentAcceptedAt,
      } : undefined

      const response = await apiFetch(`/api/customer/review/${encodedToken}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData: signatureImage,
          signerName: customer.name,
          signerEmail: customer.email,
          clientEvidence,
        }),
      })

      if (!response.ok) {
        let errorMessage = 'Failed to approve certificate'
        try {
          const text = await response.text()
          if (text) {
            const responseData = JSON.parse(text)
            errorMessage = responseData.error || errorMessage
          }
        } catch {
          errorMessage = `Server error (${response.status})`
        }
        throw new Error(errorMessage)
      }

      setApproveStep(0)
      setActionTaken('approved')
      onStatusChange?.('APPROVED')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsApproving(false)
    }
  }, [certificate.id, customer.name, customer.email, consentAccepted, consentAcceptedAt, router, onStatusChange])

  // ─── Revision handlers ───

  const openRevisionFlow = () => {
    setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
    setGeneralNotes('')
    setError(null)
    setShowRevisionModal(true)
  }

  const addSectionEntry = () => {
    setSectionFeedbackEntries(prev => [
      ...prev,
      { id: crypto.randomUUID(), section: '', comment: '' },
    ])
  }

  const removeSectionEntry = (id: string) => {
    setSectionFeedbackEntries(prev => {
      if (prev.length <= 1) return [{ id: crypto.randomUUID(), section: '', comment: '' }]
      return prev.filter(e => e.id !== id)
    })
  }

  const updateSectionEntry = (id: string, field: 'section' | 'comment', value: string) => {
    setSectionFeedbackEntries(prev =>
      prev.map(e => e.id === id ? { ...e, [field]: value } : e)
    )
  }

  const getAvailableSections = (currentEntryId: string) => {
    const usedSections = sectionFeedbackEntries
      .filter(e => e.id !== currentEntryId && e.section)
      .map(e => e.section)
    return REVISION_SECTIONS.filter(s => !usedSections.includes(s.id))
  }

  const handleRequestRevision = async () => {
    const sectionFeedbacks = sectionFeedbackEntries
      .filter(e => e.section && e.comment.trim())
      .map(e => ({ section: e.section, comment: e.comment.trim() }))

    const trimmedGeneral = generalNotes.trim()

    if (sectionFeedbacks.length === 0 && !trimmedGeneral) {
      setError('Please provide feedback for at least one section or add general notes')
      return
    }

    setIsRequestingRevision(true)
    setError(null)

    try {
      const token = `cert:${certificate.id}`
      const encodedToken = encodeURIComponent(token)

      const response = await apiFetch(`/api/customer/review/${encodedToken}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sectionFeedbacks: sectionFeedbacks.length > 0 ? sectionFeedbacks : undefined,
          generalNotes: trimmedGeneral || undefined,
        }),
      })

      if (!response.ok) {
        const responseData = await response.json()
        throw new Error(responseData.error || 'Failed to request revision')
      }

      setShowRevisionModal(false)
      setActionTaken('revision')
      onStatusChange?.('CUSTOMER_REVISION_REQUIRED')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRequestingRevision(false)
    }
  }

  // ─── Render ───

  return (
    <div className="px-[18px] pb-[18px] pt-3 space-y-2.5">
      {error && approveStep === 0 && !showRevisionModal && (
        <div className="p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg text-[12px] text-[#dc2626] flex items-center gap-2">
          <AlertCircle className="size-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Action Buttons */}
      {canApprove && !customerSignature && (
        <div className="space-y-2">
          <Button
            onClick={openApproveFlow}
            size="sm"
            className="w-full bg-[#16a34a] hover:bg-[#15803d] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
          >
            <CheckCircle className="size-3.5 mr-1.5" />
            Approve & Sign
          </Button>

          <Button
            onClick={openRevisionFlow}
            size="sm"
            className="w-full bg-[#d97706] hover:bg-[#b45309] text-white h-9 rounded-[9px] text-[12.5px] font-semibold"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Request Revision
          </Button>

          <p className="text-[10px] text-[#94a3b8] text-center pt-0.5">
            By approving, you confirm all details are correct.
          </p>
        </div>
      )}

      {/* Status Indicators */}
      {isRevisionRequired && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#eff6ff] rounded-xl border border-[#bfdbfe]">
          <div className="size-7 rounded-lg bg-[#dbeafe] flex items-center justify-center flex-shrink-0">
            <RotateCcw className="size-3.5 text-[#2563eb]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#1e40af]">Under Revision</p>
            <p className="text-[11px] text-[#2563eb]">The engineer is working on updates</p>
          </div>
        </div>
      )}

      {isCustomerRevisionRequired && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#faf5ff] rounded-xl border border-[#e9d5ff]">
          <div className="size-7 rounded-lg bg-[#f3e8ff] flex items-center justify-center flex-shrink-0">
            <Send className="size-3.5 text-[#7c3aed]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#6b21a8]">Awaiting Response</p>
            <p className="text-[11px] text-[#7c3aed]">HTA is reviewing your feedback</p>
          </div>
        </div>
      )}

      {isApproved && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
          <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
            <CheckCircle className="size-3.5 text-[#16a34a]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#166534]">
              {certificate.status === 'AUTHORIZED' ? 'Certificate Completed' : 'Certificate Approved'}
            </p>
            <p className="text-[11px] text-[#16a34a]">
              {certificate.status === 'AUTHORIZED'
                ? 'Fully authorized and ready for download'
                : 'Awaiting final authorization'}
            </p>
          </div>
        </div>
      )}

      {customerSignature && !isApproved && (
        <div className="flex items-center gap-2.5 py-2.5 px-3.5 bg-[#f0fdf4] rounded-xl border border-[#bbf7d0]">
          <div className="size-7 rounded-lg bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
            <CheckCircle className="size-3.5 text-[#16a34a]" />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#166534]">You Signed</p>
            <p className="text-[11px] text-[#16a34a]">Approved by {customerSignature.signerName}</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* APPROVE FLOW — Step 1: Review Checklist                */}
      {/* ═══════════════════════════════════════════════════════ */}
      {approveStep === 1 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#dcfce7] rounded-[9px]">
                  <ClipboardCheck className="size-4 text-[#16a34a]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Review Certificate</h2>
                  <p className="text-[11px] text-[#94a3b8]">Step 1 of 2 — Verify all sections</p>
                </div>
              </div>
              <button
                onClick={() => setApproveStep(0)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Certificate info strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <FileText className="size-3.5 text-[#94a3b8] flex-shrink-0" />
                <span className="font-semibold text-[#0f172a]">{certificate.certificateNumber}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.uucDescription || '—'}</span>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-[12.5px] font-semibold text-[#0f172a]">
                    Confirm you have reviewed each section
                  </p>
                  <button
                    onClick={checkAllSections}
                    className="text-[11px] text-[#2563eb] hover:text-[#1d4ed8] font-medium transition-colors"
                  >
                    {allSectionsChecked ? 'Uncheck all' : 'Check all'}
                  </button>
                </div>

                <div className="space-y-1.5">
                  {SECTIONS.map((section) => {
                    const Icon = section.icon
                    const checked = !!checkedSections[section.key]
                    return (
                      <button
                        key={section.key}
                        onClick={() => toggleSectionCheck(section.key)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all text-left ${
                          checked
                            ? 'bg-[#f0fdf4] border-[#bbf7d0]'
                            : 'bg-white border-[#e2e8f0] hover:border-[#cbd5e1]'
                        }`}
                      >
                        <div className={`size-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          checked ? 'bg-[#16a34a] border-[#16a34a]' : 'border-[#cbd5e1]'
                        }`}>
                          {checked && <CheckCircle className="size-3.5 text-white" />}
                        </div>
                        <div className={`p-1 rounded-md flex-shrink-0 ${checked ? 'bg-[#dcfce7]' : 'bg-[#f1f5f9]'}`}>
                          <Icon className={`size-3.5 ${checked ? 'text-[#16a34a]' : 'text-[#94a3b8]'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[12.5px] font-medium ${checked ? 'text-[#166534]' : 'text-[#0f172a]'}`}>
                            {section.label}
                          </p>
                          <p className={`text-[10.5px] ${checked ? 'text-[#16a34a]' : 'text-[#94a3b8]'}`}>
                            {section.description}
                          </p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Progress indicator */}
              <div className="flex items-center gap-2 px-3.5 py-2 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg">
                <div className="flex-1 h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#16a34a] rounded-full transition-all duration-300"
                    style={{ width: `${(Object.values(checkedSections).filter(Boolean).length / SECTIONS.length) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-medium text-[#64748b]">
                  {Object.values(checkedSections).filter(Boolean).length}/{SECTIONS.length}
                </span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setApproveStep(0)}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => setApproveStep(2)}
                disabled={!allSectionsChecked}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                Continue to Sign
                <ChevronRight className="size-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* APPROVE FLOW — Step 2: Consent & Signature             */}
      {/* ═══════════════════════════════════════════════════════ */}
      {approveStep === 2 && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#dcfce7] rounded-[9px]">
                  <PenTool className="size-4 text-[#16a34a]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Sign & Approve</h2>
                  <p className="text-[11px] text-[#94a3b8]">Step 2 of 2 — Digital signature</p>
                </div>
              </div>
              <button
                onClick={() => { setApproveStep(0); setError(null) }}
                disabled={isApproving}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors disabled:opacity-50"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Signer identity */}
              <div className="flex items-center gap-3 px-3.5 py-3 bg-[#f8fafc] border border-[#f1f5f9] rounded-xl">
                <div className="size-9 rounded-full bg-[#0f172a] flex items-center justify-center flex-shrink-0">
                  <User className="size-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-[#0f172a] truncate">{customer.name}</p>
                  <p className="text-[11px] text-[#94a3b8] truncate">{customer.email}</p>
                </div>
                <span className="text-[10px] font-medium text-[#94a3b8] bg-[#f1f5f9] px-2 py-0.5 rounded-full flex-shrink-0">
                  Signer
                </span>
              </div>

              {/* Signature preview */}
              <div>
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-2">
                  Your Signature
                </label>
                <div className="border-2 border-dashed border-[#e2e8f0] rounded-xl bg-white overflow-hidden">
                  <TypedSignature
                    ref={signatureRef}
                    name={customer.name}
                    onSignatureReady={() => {}}
                  />
                </div>
              </div>

              {/* Consent statements */}
              <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Shield className="size-3.5 text-[#64748b]" />
                  <p className="text-[12.5px] font-semibold text-[#0f172a]">Before signing, please confirm</p>
                </div>
                <ul className="space-y-1.5 ml-1">
                  {CONSENT_STATEMENTS.map((statement, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-[#475569]">
                      <div className="size-1.5 rounded-full bg-[#94a3b8] mt-1.5 flex-shrink-0" />
                      {statement}
                    </li>
                  ))}
                </ul>
                <div className="pt-2 border-t border-[#e2e8f0]">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <div
                      onClick={() => !isApproving && handleConsentChange(!consentAccepted)}
                      className={`size-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                        consentAccepted ? 'bg-[#16a34a] border-[#16a34a]' : 'border-[#cbd5e1] hover:border-[#94a3b8]'
                      }`}
                    >
                      {consentAccepted && <CheckCircle className="size-3.5 text-white" />}
                    </div>
                    <span className="text-[12.5px] font-medium text-[#0f172a]">
                      I agree to the above statements
                    </span>
                  </label>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setApproveStep(1); setError(null) }}
                disabled={isApproving}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                <ChevronLeft className="size-3.5 mr-1" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={isApproving || !consentAccepted}
                className="bg-[#16a34a] hover:bg-[#15803d] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isApproving ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <CheckCircle className="size-3.5 mr-1.5" />
                )}
                Confirm Approval
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════ */}
      {/* REVISION FLOW — Single-step (matches reviewer modal)   */}
      {/* ═══════════════════════════════════════════════════════ */}
      {showRevisionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#fef3c7] rounded-[9px]">
                  <RotateCcw className="size-4 text-[#d97706]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request Revision</h2>
                  <p className="text-[11px] font-mono text-[#94a3b8]">{certificate.certificateNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setShowRevisionModal(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Summary Strip */}
              <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#f8fafc] border border-[#f1f5f9] rounded-lg text-[12px] text-[#64748b]">
                <span className="font-semibold text-[#0f172a]">{certificate.uucDescription || '—'}</span>
                <span className="text-[#e2e8f0]">·</span>
                <span>{certificate.customerName || '—'}</span>
              </div>

              {/* Section Feedback */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <label className="text-[12.5px] font-semibold text-[#0f172a]">
                    Section Feedback <span className="text-[#dc2626]">*</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#94a3b8]">
                    {sectionFeedbackEntries.filter(e => e.section && e.comment.trim()).length} of {sectionFeedbackEntries.length} complete
                  </span>
                </div>

                <div className="space-y-2">
                  {sectionFeedbackEntries.map((entry) => {
                    const availableSections = getAvailableSections(entry.id)
                    const currentSection = REVISION_SECTIONS.find(s => s.id === entry.section)
                    const isComplete = !!(entry.section && entry.comment.trim())

                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'border rounded-xl p-3 transition-colors',
                          isComplete
                            ? 'border-[#fde68a] bg-[#fffbeb]'
                            : 'border-[#e2e8f0] bg-white'
                        )}
                      >
                        <div className="flex items-start gap-3">
                          {/* Section dropdown */}
                          <div className="w-[180px] flex-shrink-0">
                            <select
                              value={entry.section}
                              onChange={(e) => updateSectionEntry(entry.id, 'section', e.target.value)}
                              className="w-full px-2.5 py-2 text-[12.5px] border border-[#e2e8f0] rounded-lg bg-white text-[#0f172a] focus:ring-2 focus:ring-[#d97706]/20 focus:border-[#d97706]"
                            >
                              <option value="">Select section...</option>
                              {(currentSection ? [currentSection, ...availableSections.filter(s => s.id !== currentSection.id)] : availableSections).map((section) => (
                                <option key={section.id} value={section.id}>
                                  {section.label}
                                </option>
                              ))}
                            </select>
                            {isComplete && (
                              <span className="text-[10px] text-[#16a34a] font-medium mt-1 block">Complete</span>
                            )}
                          </div>

                          {/* Feedback textarea */}
                          <div className="flex-1 min-w-0">
                            <Textarea
                              placeholder="Describe what needs to be revised..."
                              value={entry.comment}
                              onChange={(e) => updateSectionEntry(entry.id, 'comment', e.target.value)}
                              rows={2}
                              className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#d97706]/20 focus:border-[#d97706] placeholder:text-[#94a3b8]"
                            />
                          </div>

                          {/* Delete button */}
                          <button
                            type="button"
                            onClick={() => removeSectionEntry(entry.id)}
                            className="p-1.5 text-[#94a3b8] hover:text-[#dc2626] hover:bg-[#fef2f2] rounded-lg transition-colors flex-shrink-0 mt-1"
                            title="Remove entry"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {sectionFeedbackEntries.length < REVISION_SECTIONS.length && (
                  <button
                    type="button"
                    onClick={addSectionEntry}
                    className="mt-2 flex items-center gap-1.5 text-[12px] text-[#d97706] hover:text-[#b45309] font-semibold px-2.5 py-1.5 hover:bg-[#fffbeb] rounded-lg transition-colors"
                  >
                    <Plus className="size-3.5" />
                    Add Another Section
                  </button>
                )}
              </div>

              {/* General Notes */}
              <div className="pt-3 border-t border-[#f1f5f9]">
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  General Notes
                  <span className="text-[#94a3b8] font-normal ml-1">(optional)</span>
                </label>
                <Textarea
                  placeholder="Any overall feedback or notes..."
                  value={generalNotes}
                  onChange={(e) => setGeneralNotes(e.target.value)}
                  rows={2}
                  className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#d97706]/20 focus:border-[#d97706] placeholder:text-[#94a3b8]"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowRevisionModal(false)
                  setSectionFeedbackEntries([{ id: crypto.randomUUID(), section: '', comment: '' }])
                  setGeneralNotes('')
                  setError(null)
                }}
                disabled={isRequestingRevision}
                className="rounded-[9px] border-[#e2e8f0] text-[12.5px] font-semibold text-[#475569]"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleRequestRevision}
                disabled={isRequestingRevision || sectionFeedbackEntries.every(e => !e.section || !e.comment.trim())}
                className="bg-[#d97706] hover:bg-[#b45309] text-white rounded-[9px] text-[12.5px] font-semibold"
              >
                {isRequestingRevision ? (
                  <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RotateCcw className="size-3.5 mr-1.5" />
                )}
                Request Revision
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
