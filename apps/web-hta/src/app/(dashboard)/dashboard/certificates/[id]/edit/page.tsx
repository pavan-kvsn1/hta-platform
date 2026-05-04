'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Send, Save, Loader2, AlertTriangle, MessageSquare, User, ChevronDown, ChevronUp, ChevronRight, Calendar, ArrowRight, MapPin, Lock, Clock, CheckCircle, PenLine, Camera, ZoomIn, X, Image as ImageIcon } from 'lucide-react'
import {
  SummarySection,
  UUCSection,
  MasterInstrumentSection,
  EnvironmentalSection,
  ResultsSection,
  RemarksSection,
  ConclusionSection,
  FinalizeSection,
  SectionFeedback,
} from '@/components/forms'
import { FeedbackTimeline, type InternalRequestItem } from '@/components/feedback/shared'
import { useCertificateStore, CertificateFormData, Parameter, CalibrationResult } from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { SectionUnlockRequest } from '@/components/engineer/SectionUnlockRequest'
import { ConflictResolutionDialog } from '@/components/certificates'
import { apiFetch } from '@/lib/api-client'
import { useCertificateImages, type CertificateImage } from '@/lib/hooks/useCertificateImages'

const SECTIONS: { id: string; label: string; showWhenNotDraft?: boolean }[] = [
  { id: 'summary', label: 'Summary' },
  { id: 'uuc-details', label: 'UUC Details' },
  { id: 'master-inst', label: 'Master Inst' },
  { id: 'environment', label: 'Environment' },
  { id: 'results', label: 'Results' },
  { id: 'remarks', label: 'Remarks' },
  { id: 'conclusion', label: 'Conclusion' },
  { id: 'feedback-history', label: 'History', showWhenNotDraft: true },
  { id: 'submit', label: 'Submit' },
]

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Customer Revision', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
}

interface ApiMasterInstrument {
  id: string
  masterInstrumentId: string
  sopReference: string
  category: string | null
  description: string | null
  make: string | null
  model: string | null
  assetNo: string | null
  serialNumber: string | null
  calibratedAt: string | null
  reportNo: string | null
  calibrationDueDate: string | null
}

interface ApiCertificate {
  id: string
  certificateNumber: string
  status: string
  calibratedAt: string
  srfNumber: string | null
  srfDate: string | null
  dateOfCalibration: string | null
  calibrationTenure: number
  dueDateAdjustment: number
  calibrationDueDate: string | null
  dueDateNotApplicable: boolean
  customerName: string | null
  customerAddress: string | null
  customerContactName: string | null
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  uucInstrumentId: string | null
  uucLocationName: string | null
  uucMachineName: string | null
  ambientTemperature: string | null
  relativeHumidity: string | null
  calibrationStatus: string | null
  stickerOldRemoved: string | null
  stickerNewAffixed: string | null
  statusNotes: string | null
  selectedConclusionStatements: string | null
  additionalConclusionStatement: string | null
  parameters: ApiParameter[]
  masterInstruments: ApiMasterInstrument[]
  feedbacks?: ApiFeedback[]
  events?: ApiEvent[]
  currentRevision: number
  updatedAt: string
  reviewer?: {
    id: string
    name: string | null
  } | null
}

interface ApiParameter {
  id: string
  parameterName: string
  parameterUnit: string | null
  rangeMin: string | null
  rangeMax: string | null
  rangeUnit: string | null
  operatingMin: string | null
  operatingMax: string | null
  operatingUnit: string | null
  leastCountValue: string | null
  leastCountUnit: string | null
  accuracyValue: string | null
  accuracyUnit: string | null
  accuracyType: string | null
  errorFormula: string | null
  showAfterAdjustment: boolean
  requiresBinning: boolean
  bins: unknown // JSON field - can be array, string, or null
  sopReference: string | null
  masterInstrumentId: string | null
  results: ApiResult[]
}

interface ApiResult {
  id: string
  pointNumber: number
  standardReading: string | null
  beforeAdjustment: string | null
  afterAdjustment: string | null
  errorObserved: number | null
  isOutOfLimit: boolean
}

interface ReviewerEdit {
  field: string
  fieldLabel: string
  previousValue: string | null
  newValue: string
  reason: string
  autoCalculated: boolean
}

interface ApiFeedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  targetSection: string | null
  user: {
    name: string
    role: string
  }
  reviewerEdits?: ReviewerEdit[] | null
}

interface ApiEvent {
  id: string
  eventType: string
  eventData: string
  createdAt: string
  revision: number
  user: {
    name: string
    role: string
  }
}

interface FieldChangeRequest {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  fields: string[]
  description: string
  adminNote: string | null
  reviewedBy: string | null
  reviewedAt: string | null
  createdAt: string
}

const FIELD_LABELS: Record<string, string> = {
  certificateNumber: 'Certificate Number',
  srfNumber: 'SRF Number',
  srfDate: 'SRF Date',
  customerName: 'Customer Name',
  customerAddress: 'Customer Address',
  customerContactName: 'Contact Name',
  customerContactEmail: 'Contact Email',
  calibratedAt: 'Calibrated At',
  dateOfCalibration: 'Date of Calibration',
  calibrationDueDate: 'Calibration Due Date',
}

function transformApiToFormData(apiData: ApiCertificate): Partial<CertificateFormData> {
  const generateId = () => Math.random().toString(36).substring(2, 9)

  // Parse bins - handles both already-parsed arrays (from Prisma JSON field) and JSON strings
  const parseBins = (bins: unknown) => {
    if (!bins) return []
    // If already an array, return it directly
    if (Array.isArray(bins)) return bins
    // If it's a string, try to parse it
    if (typeof bins === 'string') {
      try {
        return JSON.parse(bins)
      } catch {
        return []
      }
    }
    return []
  }

  const parameters: Parameter[] = apiData.parameters.map((param) => ({
    id: generateId(),
    parameterName: param.parameterName || '',
    parameterUnit: param.parameterUnit || '',
    rangeMin: param.rangeMin || '',
    rangeMax: param.rangeMax || '',
    rangeUnit: param.rangeUnit || '',
    operatingMin: param.operatingMin || '',
    operatingMax: param.operatingMax || '',
    operatingUnit: param.operatingUnit || '',
    leastCountValue: param.leastCountValue || '',
    leastCountUnit: param.leastCountUnit || '',
    accuracyValue: param.accuracyValue || '',
    accuracyUnit: param.accuracyUnit || '',
    accuracyType: (param.accuracyType || 'ABSOLUTE') as 'PERCENT_READING' | 'ABSOLUTE' | 'PERCENT_SCALE',
    requiresBinning: param.requiresBinning || false,
    bins: parseBins(param.bins),
    errorFormula: param.errorFormula || 'A-B',
    showAfterAdjustment: param.showAfterAdjustment || false,
    masterInstrumentId: param.masterInstrumentId ? parseInt(param.masterInstrumentId) : null,
    sopReference: param.sopReference || '',
    results: param.results.map((result): CalibrationResult => ({
      id: generateId(),
      pointNumber: result.pointNumber,
      standardReading: result.standardReading || '',
      beforeAdjustment: result.beforeAdjustment || '',
      afterAdjustment: result.afterAdjustment || '',
      errorObserved: result.errorObserved,
      isOutOfLimit: result.isOutOfLimit || false,
    })),
  }))

  if (parameters.length === 0) {
    parameters.push({
      id: generateId(),
      parameterName: '',
      parameterUnit: '',
      rangeMin: '',
      rangeMax: '',
      rangeUnit: '',
      operatingMin: '',
      operatingMax: '',
      operatingUnit: '',
      leastCountValue: '',
      leastCountUnit: '',
      accuracyValue: '',
      accuracyUnit: '',
      accuracyType: 'ABSOLUTE',
      requiresBinning: false,
      bins: [],
      errorFormula: 'A-B',
      showAfterAdjustment: false,
      masterInstrumentId: null,
      sopReference: '',
      results: [{
        id: generateId(),
        pointNumber: 1,
        standardReading: '',
        beforeAdjustment: '',
        afterAdjustment: '',
        errorObserved: null,
        isOutOfLimit: false,
      }],
    })
  }

  let calibrationStatus: string[] = []
  let selectedConclusionStatements: string[] = []

  try {
    calibrationStatus = apiData.calibrationStatus ? JSON.parse(apiData.calibrationStatus) : []
  } catch {
    calibrationStatus = []
  }

  try {
    selectedConclusionStatements = apiData.selectedConclusionStatements ? JSON.parse(apiData.selectedConclusionStatements) : []
  } catch {
    selectedConclusionStatements = []
  }

  const masterInstruments = apiData.masterInstruments && apiData.masterInstruments.length > 0
    ? apiData.masterInstruments.map((mi) => {
        const dueDate = mi.calibrationDueDate ? new Date(mi.calibrationDueDate) : null
        const now = new Date()
        const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

        return {
          id: generateId(),
          masterInstrumentId: parseInt(mi.masterInstrumentId) || 0,
          category: mi.category || '',
          description: mi.description || '',
          make: mi.make || '',
          model: mi.model || '',
          assetNo: mi.assetNo || '',
          serialNumber: mi.serialNumber || '',
          calibratedAt: mi.calibratedAt || '',
          reportNo: mi.reportNo || '',
          calibrationDueDate: mi.calibrationDueDate || '',
          isExpired: dueDate ? dueDate < now : false,
          isExpiringSoon: dueDate ? (dueDate >= now && dueDate <= thirtyDaysFromNow) : false,
        }
      })
    : [{
        id: generateId(),
        masterInstrumentId: 0,
        category: '',
        description: '',
        make: '',
        model: '',
        assetNo: '',
        serialNumber: '',
        calibratedAt: '',
        reportNo: '',
        calibrationDueDate: '',
        isExpired: false,
        isExpiringSoon: false,
      }]

  return {
    certificateNumber: apiData.certificateNumber,
    status: apiData.status as CertificateFormData['status'],
    lastSaved: new Date(apiData.updatedAt),
    serverUpdatedAt: apiData.updatedAt,  // Track server timestamp for optimistic concurrency control
    reviewerId: apiData.reviewer?.id || null,  // Map reviewer.id to reviewerId
    calibratedAt: (apiData.calibratedAt || 'LAB') as 'LAB' | 'SITE',
    srfNumber: apiData.srfNumber || '',
    srfDate: apiData.srfDate ? apiData.srfDate.split('T')[0] : '',
    dateOfCalibration: apiData.dateOfCalibration ? apiData.dateOfCalibration.split('T')[0] : '',
    calibrationTenure: (apiData.calibrationTenure || 12) as 3 | 6 | 9 | 12,
    dueDateAdjustment: (apiData.dueDateAdjustment || 0) as -3 | -2 | -1 | 0,
    calibrationDueDate: apiData.calibrationDueDate ? apiData.calibrationDueDate.split('T')[0] : '',
    dueDateNotApplicable: apiData.dueDateNotApplicable || false,
    customerName: apiData.customerName || '',
    customerAddress: apiData.customerAddress || '',
    customerContactName: apiData.customerContactName || '',
    uucDescription: apiData.uucDescription || '',
    uucMake: apiData.uucMake || '',
    uucModel: apiData.uucModel || '',
    uucSerialNumber: apiData.uucSerialNumber || '',
    uucInstrumentId: apiData.uucInstrumentId || '',
    uucLocationName: apiData.uucLocationName || '',
    uucMachineName: apiData.uucMachineName || '',
    ambientTemperature: apiData.ambientTemperature || '',
    relativeHumidity: apiData.relativeHumidity || '',
    calibrationStatus,
    stickerOldRemoved: (apiData.stickerOldRemoved || null) as 'yes' | 'no' | 'na' | null,
    stickerNewAffixed: (apiData.stickerNewAffixed || null) as 'yes' | 'no' | 'na' | null,
    statusNotes: apiData.statusNotes || '',
    selectedConclusionStatements,
    additionalConclusionStatement: apiData.additionalConclusionStatement || '',
    parameters,
    masterInstruments,
  }
}

// ── Progress Sidebar ────────────────────────────────────────────────────
interface ProgressSidebarProps {
  sections: typeof SECTIONS
  activeSection: string
  status: string
  editableSections: string[]
  unlockedSections: string[]
  sectionsWithFeedback: string[]
  pendingSections: string[]
  onSectionClick: (sectionId: string) => void
  completedSections?: string[]
}

function ProgressSidebar({
  sections,
  activeSection,
  status,
  editableSections,
  unlockedSections,
  sectionsWithFeedback,
  pendingSections,
  onSectionClick,
  completedSections = [],
}: ProgressSidebarProps) {
  const isDraft = status === 'DRAFT'
  const isRevision = status === 'REVISION_REQUIRED' || status === 'CUSTOMER_REVISION_REQUIRED'

  const formSections = sections.filter(s => s.id !== 'feedback-history' && s.id !== 'submit')
  const editableCount = isRevision ? editableSections.length : 0
  const pendingCount = isRevision ? pendingSections.length : 0
  const completedCount = isDraft ? completedSections.length : 0

  return (
    <div className="w-[180px] flex-shrink-0 bg-white rounded-[14px] border border-[#e2e8f0] flex flex-col p-4 overflow-hidden">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.06em] text-[#94a3b8] px-2 mb-3">
        {isRevision ? 'Sections' : 'Sections'}
      </div>

      <div className="flex flex-col gap-[2px]">
        {formSections.map((section) => {
          const isActive = activeSection === section.id
          const isEditable = editableSections.includes(section.id)
          const _isUnlocked = unlockedSections.includes(section.id)
          const isPending = pendingSections.includes(section.id)
          const _hasFeedback = sectionsWithFeedback.includes(section.id)
          const isCompleted = completedSections.includes(section.id)

          if (isRevision) {
            // Revision mode: lock/unlock/pending icons
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => onSectionClick(section.id)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-[7px] rounded-[7px] text-[12.5px] font-medium text-left transition-colors',
                  isEditable ? 'bg-[#f0fdf4] text-[#0f172a] font-semibold' : 'text-[#64748b]',
                  isPending && 'text-[#d97706]',
                  isActive && isEditable && 'ring-1 ring-[#16a34a]/30',
                )}
              >
                <span className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                  {isEditable ? (
                    <CheckCircle className="size-3.5 text-[#16a34a]" />
                  ) : isPending ? (
                    <Clock className="size-3.5 text-[#d97706]" />
                  ) : (
                    <Lock className="size-3.5 text-[#94a3b8] opacity-50" />
                  )}
                </span>
                <span className="truncate">{section.label}</span>
              </button>
            )
          }

          // Draft mode: completion dots
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionClick(section.id)}
              className={cn(
                'flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[12.5px] font-medium text-left transition-colors',
                isActive ? 'bg-primary text-white font-semibold' : 'text-[#64748b] hover:bg-[#f8fafc]',
              )}
            >
              <span className={cn(
                'flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center',
                isActive ? 'border-white/40 bg-white/20' : isCompleted ? 'border-[#16a34a] bg-[#16a34a]' : 'border-[#e2e8f0]',
              )}>
                {isCompleted && !isActive && (
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="1.5"><path d="M2 4l1.5 1.5L6 3"/></svg>
                )}
              </span>
              <span className="truncate">{section.label}</span>
            </button>
          )
        })}

        {/* Feedback History link - only in non-draft */}
        {status !== 'DRAFT' && (
          <button
            type="button"
            onClick={() => onSectionClick('feedback-history')}
            className={cn(
              'flex items-center gap-2.5 px-2.5 py-2 rounded-[7px] text-[12.5px] font-medium text-left transition-colors mt-1',
              activeSection === 'feedback-history' ? 'bg-[#7c3aed] text-white font-semibold' : 'text-[#7c3aed] hover:bg-[#faf5ff]',
            )}
          >
            <span className={cn(
              'flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold',
              activeSection === 'feedback-history' ? 'bg-white/20 text-white' : 'bg-[rgba(124,58,237,0.1)] text-[#7c3aed]',
            )}>
              H
            </span>
            <span>History</span>
          </button>
        )}
      </div>

      {/* Bottom summary */}
      <div className="mt-auto pt-3">
        {isDraft ? (
          <div className="bg-[#f8fafc] rounded-[9px] border border-[#f1f5f9] p-2.5">
            <div className="text-[11px] font-semibold text-[#475569] mb-1.5">Completion</div>
            <div className="h-1 rounded-full bg-[#e2e8f0]">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${formSections.length > 0 ? (completedCount / formSections.length) * 100 : 0}%` }}
              />
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1.5">
              {completedCount} of {formSections.length} sections
            </div>
          </div>
        ) : isRevision ? (
          <div className="bg-[#f8fafc] rounded-[9px] border border-[#f1f5f9] p-2.5">
            <div className="text-[11px] font-semibold text-[#475569]">
              {editableCount} editable {pendingCount > 0 ? `· ${pendingCount} pending` : ''}
            </div>
            <div className="text-[10px] text-[#94a3b8] mt-1">
              {formSections.length - editableCount - pendingCount} sections locked
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function formatDateDisplay(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function mergeDateAdjustmentsWithFeedbacks(
  feedbacks: ApiFeedback[],
  events: ApiEvent[]
): ApiFeedback[] {
  if (!events || events.length === 0) return feedbacks

  const dateAdjustmentMap = new Map<number, { edits: ReviewerEdit[] }>()

  events.forEach((event) => {
    try {
      const data = JSON.parse(event.eventData)
      const eventTime = new Date(event.createdAt).getTime()

      let edits: ReviewerEdit[] = []

      if (data.edits && Array.isArray(data.edits)) {
        edits = data.edits.map((edit: {
          field: string
          fieldLabel: string
          previousValue: string | null
          newValue: string
          reason: string
          autoCalculated?: boolean
        }) => ({
          field: edit.field,
          fieldLabel: edit.fieldLabel,
          previousValue: edit.previousValue,
          newValue: edit.newValue,
          reason: edit.reason,
          autoCalculated: edit.autoCalculated || false,
        }))
      } else {
        if (data.newDateOfCalibration) {
          edits.push({
            field: 'dateOfCalibration',
            fieldLabel: 'Date of Calibration',
            previousValue: data.previousDateOfCalibration,
            newValue: data.newDateOfCalibration,
            reason: data.reason || '',
            autoCalculated: false,
          })
        }
        if (data.newDueDate) {
          edits.push({
            field: 'calibrationDueDate',
            fieldLabel: 'Calibration Due Date',
            previousValue: data.previousDueDate,
            newValue: data.newDueDate,
            reason: data.newDateOfCalibration ? 'Auto-adjusted based on Date of Calibration change' : data.reason || '',
            autoCalculated: !!data.newDateOfCalibration,
          })
        }
      }

      dateAdjustmentMap.set(eventTime, { edits })
    } catch (e) {
      console.error('Error parsing date event data:', e)
    }
  })

  return feedbacks.map((feedback) => {
    const feedbackTime = new Date(feedback.createdAt).getTime()

    let matchedAdjustment: { edits: ReviewerEdit[] } | null = null
    for (const [eventTime, adjustment] of dateAdjustmentMap.entries()) {
      if (Math.abs(feedbackTime - eventTime) < 10000) {
        matchedAdjustment = adjustment
        dateAdjustmentMap.delete(eventTime)
        break
      }
    }

    let cleanComment = feedback.comment
    if (matchedAdjustment && cleanComment) {
      const editsSectionIndex = cleanComment.indexOf('[Reviewer Edits Applied]')
      if (editsSectionIndex !== -1) {
        cleanComment = cleanComment.substring(0, editsSectionIndex).trim()
      }
    }

    return {
      ...feedback,
      comment: cleanComment,
      reviewerEdits: matchedAdjustment?.edits || null,
    }
  })
}

// ── TAT Banner (12h target for engineer) ────────────────────────────────
function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, certificateCreatedAt, targetHours = 12, totalTargetHours = 48 }: { sentAt: string; certificateCreatedAt?: string | null; targetHours?: number; totalTargetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalElapsed, setTotalElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [totalRemaining, setTotalRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')
  const [totalStatus, setTotalStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const now = Date.now()

      // Phase TAT (12h target)
      const sentTime = new Date(sentAt).getTime()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 3 * 60 * 60 * 1000) {
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }

      // Total TAT (48h target)
      if (certificateCreatedAt) {
        const createdTime = new Date(certificateCreatedAt).getTime()
        const totalElapsedMs = now - createdTime
        const totalTargetMs = totalTargetHours * 60 * 60 * 1000
        const totalRemainingMs = totalTargetMs - totalElapsedMs

        setTotalElapsed(formatTATTime(totalElapsedMs))

        if (totalRemainingMs <= 0) {
          setTotalRemaining({ hours: 0, minutes: 0 })
          setTotalStatus('critical')
        } else if (totalRemainingMs <= 8 * 60 * 60 * 1000) {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('warning')
        } else {
          setTotalRemaining(formatTATTime(totalRemainingMs))
          setTotalStatus('good')
        }
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000)
    return () => clearInterval(interval)
  }, [sentAt, certificateCreatedAt, targetHours, totalTargetHours])

  const config = {
    good: { bg: 'bg-[#f0fdf4]', border: 'border-[#bbf7d0]', text: 'text-[#166534]', icon: <Clock className="size-3.5 text-[#16a34a]" /> },
    warning: { bg: 'bg-[#fffbeb]', border: 'border-[#fde68a]', text: 'text-[#92400e]', icon: <AlertTriangle className="size-3.5 text-[#d97706]" /> },
    critical: { bg: 'bg-[#fef2f2]', border: 'border-[#fecaca]', text: 'text-[#991b1b]', icon: <AlertTriangle className="size-3.5 text-[#dc2626]" /> },
  }

  const c = config[status]
  const totalColor = totalStatus === 'critical' ? 'text-[#dc2626]' : totalStatus === 'warning' ? 'text-[#d97706]' : 'text-[#64748b]'

  return (
    <div className={cn('px-4 py-2 rounded-xl border flex items-center justify-between text-[12.5px]', c.bg, c.border, c.text)}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {c.icon}
          <span className="font-semibold">
            Phase: {elapsed.hours}h {elapsed.minutes}m
          </span>
        </div>
        <span className="text-[#e2e8f0]">|</span>
        {status === 'critical' ? (
          <span className="font-semibold">{targetHours}h target exceeded</span>
        ) : (
          <span>{remaining.hours}h {remaining.minutes}m of {targetHours}h left</span>
        )}
      </div>
      {certificateCreatedAt && (
        <div className={cn('flex items-center gap-1.5', totalColor)}>
          <span className="text-[#cbd5e1]">|</span>
          <span className="font-medium">
            Total: {totalElapsed.hours}h {totalElapsed.minutes}m
          </span>
          <span className="opacity-60">·</span>
          {totalStatus === 'critical' ? (
            <span className="font-semibold">{totalTargetHours}h exceeded</span>
          ) : (
            <span>{totalRemaining.hours}h {totalRemaining.minutes}m of {totalTargetHours}h left</span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Photos Summary Panel ────────────────────────────────────────────
interface PhotoGroup {
  label: string
  images: CertificateImage[]
}

function PhotosSummaryPanel({
  images,
  masterInstruments,
  parameters,
}: {
  images: CertificateImage[]
  masterInstruments: { description: string }[]
  parameters: { parameterName: string }[]
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [previewImage, setPreviewImage] = useState<CertificateImage | null>(null)

  const groups = useMemo<PhotoGroup[]>(() => {
    const result: PhotoGroup[] = []

    // UUC images
    const uucImages = images.filter(i => i.imageType === 'UUC')
    result.push({ label: 'UUC', images: uucImages })

    // Master instrument images – one group per instrument
    const miIndexes = [...new Set(images.filter(i => i.imageType === 'MASTER_INSTRUMENT').map(i => i.masterInstrumentIndex!))]
      .sort((a, b) => a - b)
    for (const idx of miIndexes) {
      const miImages = images.filter(i => i.imageType === 'MASTER_INSTRUMENT' && i.masterInstrumentIndex === idx)
      const label = masterInstruments[idx]?.description || `Instrument ${idx + 1}`
      result.push({ label, images: miImages })
    }
    // If no MI images exist but instruments are present, show empty group
    if (miIndexes.length === 0 && masterInstruments.length > 0) {
      result.push({ label: 'Master Inst.', images: [] })
    }

    // Reading images – grouped together
    const readingImages = images.filter(i => i.imageType === 'READING_UUC' || i.imageType === 'READING_MASTER')
    result.push({ label: 'Readings', images: readingImages })

    return result
  }, [images, masterInstruments])

  const totalCount = images.length
  const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  return (
    <>
      <div className="w-[180px] bg-white rounded-[14px] border border-[#e2e8f0] flex flex-col min-h-0 overflow-hidden flex-1">
        {/* Header */}
        <div className="flex-shrink-0 px-3.5 py-2.5 border-b border-[#f1f5f9] flex items-center gap-2">
          <Camera className="size-3.5 text-[#94a3b8]" />
          <span className="text-[11px] font-mono font-medium uppercase tracking-[0.06em] text-[#94a3b8]">
            Photos
          </span>
          <span className="ml-auto text-[10px] font-medium text-[#94a3b8] bg-[#f1f5f9] rounded-full px-1.5 py-0.5">
            {totalCount}
          </span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2 space-y-1.5">
          {totalCount === 0 && (
            <div className="flex flex-col items-center justify-center py-4 text-center">
              <ImageIcon className="size-5 text-[#cbd5e1] mb-1.5" />
              <p className="text-[10px] text-[#94a3b8]">No photos uploaded</p>
            </div>
          )}
          {groups.map((group) => {
            const key = group.label
            const isCollapsed = collapsed[key] ?? (group.images.length === 0)
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex items-center gap-1.5 w-full text-left py-1"
                >
                  <ChevronRight
                    className={cn(
                      'size-3 text-[#94a3b8] transition-transform',
                      !isCollapsed && 'rotate-90',
                    )}
                  />
                  <span className="text-[11px] font-semibold text-[#475569] truncate">{group.label}</span>
                  <span className="text-[10px] text-[#94a3b8] ml-auto">{group.images.length}</span>
                </button>

                {!isCollapsed && (
                  <div className="mt-1 mb-1.5">
                    {group.images.length === 0 ? (
                      <p className="text-[10px] text-[#94a3b8] pl-4.5 italic">No photos</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-1.5">
                        {group.images.map((img) => (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() => setPreviewImage(img)}
                            className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 group cursor-pointer"
                          >
                            {img.thumbnailUrl ? (
                              <Image
                                src={img.thumbnailUrl}
                                alt={img.fileName}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                {img.isProcessing ? (
                                  <Loader2 className="size-4 text-slate-400 animate-spin" />
                                ) : (
                                  <ImageIcon className="size-4 text-slate-300" />
                                )}
                              </div>
                            )}
                            {/* Hover overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <ZoomIn className="size-4 text-white" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Lightbox */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-4xl max-h-full" style={{ width: '100%', height: '80vh' }}>
            <Image
              src={previewImage.optimizedUrl || previewImage.originalUrl || ''}
              alt={previewImage.fileName}
              fill
              className="object-contain rounded-lg"
              unoptimized
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute top-2 right-2 w-10 h-10 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="absolute bottom-2 left-2 right-2 bg-black/50 rounded-lg p-2">
              <p className="text-white text-sm truncate">{previewImage.fileName}</p>
              {previewImage.caption && (
                <p className="text-white/80 text-xs mt-1">{previewImage.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function EditCertificatePage() {
  const params = useParams()
  const router = useRouter()
  const certificateId = params.id as string

  const { formData, isDirty, isSaving, saveDraft, loadForm, setCertificateId } = useCertificateStore()
  const [activeSection, setActiveSection] = useState('summary')
  const [_isScrolled, setIsScrolled] = useState(false)
  const [_saveError, setSaveError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<ApiFeedback[]>([])
  const [isTopFeedbackExpanded, setIsTopFeedbackExpanded] = useState(true)
  const [currentRevision, setCurrentRevision] = useState(1)
  const [reviewerName, setReviewerName] = useState<string | null>(null)
  const [isChatExpanded, setIsChatExpanded] = useState(true)
  const [isFieldChangeLogsExpanded, setIsFieldChangeLogsExpanded] = useState(true)
  const [fieldChangeRequests, setFieldChangeRequests] = useState<FieldChangeRequest[]>([])
  const [unlockRequests, setUnlockRequests] = useState<InternalRequestItem[]>([])
  const [tatStartedAt, setTatStartedAt] = useState<string | null>(null)
  const [certificateCreatedAt, setCertificateCreatedAt] = useState<string | null>(null)
  const [unlockedSections, setUnlockedSections] = useState<string[]>([])
  const [pendingSections, setPendingSections] = useState<string[]>([])
  const [customerFeedback, setCustomerFeedback] = useState<{
    notes: string
    sectionFeedbacks: { section: string; comment: string }[] | null
    generalNotes: string | null
    customerName: string
    customerEmail: string
    requestedAt: string
    revision?: number
  } | null>(null)

  // Conflict resolution state
  const [conflictState, setConflictState] = useState<{
    hasConflict: boolean
    serverTimestamp: Date | null
  } | null>(null)

  // Photos
  const { images: certificateImages } = useCertificateImages({ certificateId, autoRefresh: true })

  // Fetch unlock requests when certificate is in REVISION_REQUIRED status
  useEffect(() => {
    async function fetchUnlockRequests() {
      if (formData.status !== 'REVISION_REQUIRED') {
        setUnlockedSections([])
        setPendingSections([])
        return
      }

      try {
        const response = await apiFetch(`/api/certificates/${certificateId}/unlock-requests`)
        if (response.ok) {
          const data = await response.json()
          setUnlockedSections(data.unlockedSections?.all || [])
          // Extract pending sections from requests
          const pending = (data.requests || [])
            .filter((r: { status: string }) => r.status === 'PENDING')
            .flatMap((r: { data: { sections: string[] } }) => r.data.sections)
          setPendingSections(pending)
          // Store full requests for timeline display
          setUnlockRequests((data.requests || []).map((r: { id: string; status: string; data: { sections?: string[]; reason?: string; revisionNumber?: number }; requestedBy?: { name: string }; reviewedBy?: { name: string } | null; adminNote?: string | null; createdAt: string }) => ({
            id: r.id,
            type: 'SECTION_UNLOCK' as const,
            status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
            sections: r.data.sections || [],
            reason: r.data.reason || '',
            adminNote: r.adminNote || null,
            requestedByName: r.requestedBy?.name || undefined,
            reviewedByName: r.reviewedBy?.name || null,
            createdAt: r.createdAt,
            revisionNumber: r.data.revisionNumber,
          })))
        }
      } catch (error) {
        console.error('Error fetching unlock requests:', error)
      }
    }

    if (certificateId && !isLoading) {
      fetchUnlockRequests()
    }
  }, [certificateId, formData.status, isLoading])

  // Fetch field change requests for this certificate
  useEffect(() => {
    async function fetchFieldChangeRequests() {
      try {
        const response = await apiFetch(`/api/certificates/${certificateId}/field-change-requests`)
        if (response.ok) {
          const data = await response.json()
          setFieldChangeRequests((data.requests || []).map((r: { id: string; status: string; fields: string[]; description: string; adminNote: string | null; reviewedBy: { name: string } | null; reviewedAt: string | null; createdAt: string }) => ({
            id: r.id,
            status: r.status as 'PENDING' | 'APPROVED' | 'REJECTED',
            fields: r.fields || [],
            description: r.description || '',
            adminNote: r.adminNote,
            reviewedBy: r.reviewedBy?.name || null,
            reviewedAt: r.reviewedAt,
            createdAt: r.createdAt,
          })))
        }
      } catch (error) {
        console.error('Error fetching field change requests:', error)
      }
    }

    if (certificateId && !isLoading) {
      fetchFieldChangeRequests()
    }
  }, [certificateId, isLoading])

  // Calculate which sections have feedback targeting them (only from current revision)
  const sectionsWithFeedback = feedbacks
    .filter(f =>
      (f.feedbackType === 'REVISION_REQUESTED' || f.feedbackType === 'CUSTOMER_REVISION_FORWARDED') &&
      f.revisionNumber === currentRevision
    )
    .map(f => f.targetSection)
    .filter(Boolean) as string[]

  // Combined editable sections (from feedback + approved unlock requests)
  const editableSections = [...new Set([...sectionsWithFeedback, ...unlockedSections])]

  // Helper to check if a section should be disabled
  const isSectionDisabled = (sectionId: string): boolean => {
    // Only lock sections when in REVISION_REQUIRED status
    if (formData.status !== 'REVISION_REQUIRED') return false
    // Section is editable if it has feedback or approved unlock
    return !editableSections.includes(sectionId)
  }

  // Helper to get accordion visual status
  const getAccordionStatus = (sectionId: string): 'default' | 'locked' | 'unlocked' | 'pending' => {
    if (formData.status !== 'REVISION_REQUIRED') return 'default'
    if (editableSections.includes(sectionId)) return 'unlocked'
    if (pendingSections.includes(sectionId)) return 'pending'
    return 'locked'
  }

  // Compute completed sections for draft progress sidebar
  const completedSections = (() => {
    const completed: string[] = []
    // Section 1: Summary — needs customer name and date of calibration at minimum
    if (formData.customerName && formData.dateOfCalibration) {
      completed.push('summary')
    }
    // Section 2: UUC — needs description and at least one parameter
    if (formData.uucDescription && formData.parameters.length > 0) {
      completed.push('uuc-details')
    }
    // Section 3: Master Instruments — needs at least one selected
    if (formData.masterInstruments.length > 0) {
      completed.push('master-inst')
    }
    // Section 4: Environment — needs both temperature and humidity
    if (formData.ambientTemperature && formData.relativeHumidity) {
      completed.push('environment')
    }
    // Section 5: Results — needs at least one parameter with at least one result filled
    if (formData.parameters.some(p => p.results.some(r => r.standardReading !== null && r.standardReading !== ''))) {
      completed.push('results')
    }
    // Section 6: Remarks — needs calibration status selected
    if (formData.calibrationStatus.length > 0) {
      completed.push('remarks')
    }
    // Section 7: Conclusion — needs at least one conclusion statement
    if (formData.selectedConclusionStatements.length > 0) {
      completed.push('conclusion')
    }
    return completed
  })()

  // Fetch certificate data on mount
  useEffect(() => {
    async function fetchCertificate() {
      try {
        setIsLoading(true)
        setLoadError(null)

        const response = await apiFetch(`/api/certificates/${certificateId}`)

        if (!response.ok) {
          if (response.status === 404) {
            setLoadError('Certificate not found')
          } else if (response.status === 403) {
            setLoadError('You do not have permission to edit this certificate')
          } else {
            setLoadError('Failed to load certificate')
          }
          return
        }

        const data: ApiCertificate = await response.json()

        const editableStatuses = ['DRAFT', 'REVISION_REQUIRED', 'CUSTOMER_REVISION_REQUIRED']
        if (!editableStatuses.includes(data.status)) {
          router.replace(`/dashboard/certificates/${certificateId}/view`)
          return
        }

        const formData = transformApiToFormData(data)
        loadForm(formData)
        setCertificateId(certificateId)

        if (data.feedbacks) {
          const mergedFeedbacks = mergeDateAdjustmentsWithFeedbacks(
            data.feedbacks,
            data.events || []
          )
          setFeedbacks(mergedFeedbacks)
        }

        // Extract customer feedback from events
        if (data.events) {
          const customerEvent = data.events
            .filter(e => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

          if (customerEvent) {
            try {
              const eventData = JSON.parse(customerEvent.eventData)
              setCustomerFeedback({
                notes: eventData.notes || '',
                sectionFeedbacks: eventData.sectionFeedbacks || null,
                generalNotes: eventData.generalNotes || null,
                customerName: eventData.customerName || 'Customer',
                customerEmail: eventData.customerEmail || '',
                requestedAt: eventData.requestedAt || customerEvent.createdAt,
                revision: customerEvent.revision,
              })
            } catch {
              // If parsing fails, ignore
            }
          }
        }

        // Compute TAT start for engineer
        let computedTatStart: string | null = null
        if (data.events && data.events.length > 0) {
          if (data.status === 'DRAFT') {
            const createdEvent = data.events.find((e: { eventType: string }) => e.eventType === 'CERTIFICATE_CREATED')
            computedTatStart = createdEvent?.createdAt || data.updatedAt
          } else if (data.status === 'REVISION_REQUIRED') {
            const revisionEvent = [...data.events]
              .filter((e: { eventType: string }) => e.eventType === 'REVISION_REQUESTED' || e.eventType === 'CUSTOMER_REVISION_FORWARDED')
              .sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            computedTatStart = revisionEvent?.createdAt || null
          } else if (data.status === 'CUSTOMER_REVISION_REQUIRED') {
            const customerRevEvent = [...data.events]
              .filter((e: { eventType: string }) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
              .sort((a: { createdAt: string }, b: { createdAt: string }) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
            computedTatStart = customerRevEvent?.createdAt || null
          }
        }
        setTatStartedAt(computedTatStart)

        // Capture certificate creation time for total TAT
        if (data.events && data.events.length > 0) {
          const createdEvent = data.events.find((e: { eventType: string }) => e.eventType === 'CERTIFICATE_CREATED')
          setCertificateCreatedAt(createdEvent?.createdAt || data.updatedAt)
        } else {
          setCertificateCreatedAt(data.updatedAt)
        }

        setCurrentRevision(data.currentRevision ?? 1)
        setReviewerName(data.reviewer?.name || null)
      } catch (error) {
        console.error('Error fetching certificate:', error)
        setLoadError('Failed to load certificate')
      } finally {
        setIsLoading(false)
      }
    }

    if (certificateId) {
      fetchCertificate()
    }
  }, [certificateId, loadForm, setCertificateId])

  // Auto-save functionality
  const autoSave = useCallback(async () => {
    if (!isDirty) return

    setSaveError(null)
    const result = await saveDraft()
    if (!result.success) {
      // Handle conflict error
      if (result.error === 'CONFLICT') {
        setConflictState({
          hasConflict: true,
          serverTimestamp: result.serverTimestamp ? new Date(result.serverTimestamp) : null,
        })
      } else {
        setSaveError(result.error || 'Failed to save')
      }
    }
  }, [isDirty, saveDraft])

  // Auto-save every 30 seconds
  useEffect(() => {
    const interval = setInterval(autoSave, 30000)
    return () => clearInterval(interval)
  }, [autoSave])

  // Track scroll position
  useEffect(() => {
    const container = document.getElementById('form-content')
    if (!container) return

    const handleScroll = () => {
      const scrollTop = container.scrollTop
      setIsScrolled(scrollTop > 100)

      const sections = SECTIONS.map((s) => ({
        id: s.id,
        element: document.getElementById(s.id),
      })).filter((s) => s.element)

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i]
        if (section.element && section.element.offsetTop - 200 <= scrollTop) {
          setActiveSection(section.id)
          break
        }
      }
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isLoading])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    const container = document.getElementById('form-content')
    if (element && container) {
      container.scrollTo({
        top: element.offsetTop - 20,
        behavior: 'smooth'
      })
    }
  }

  const formatLastSaved = () => {
    if (!formData.lastSaved) return 'Not saved'
    const now = new Date()
    const diff = Math.floor((now.getTime() - formData.lastSaved.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    return formData.lastSaved.toLocaleTimeString()
  }

  const statusConfig = STATUS_CONFIG[formData.status] || STATUS_CONFIG.DRAFT

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-slate-600">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="size-16 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangle className="size-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-slate-900">{loadError}</h2>
          <Link href="/dashboard" className="text-primary hover:underline font-medium">
            Return to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#f1f5f9] overflow-hidden">
      {/* Progress Sidebar + Photos */}
      <div className="flex-shrink-0 p-2.5 pr-0 flex flex-col gap-2.5 h-full">
        <ProgressSidebar
          sections={SECTIONS.filter(section => !section.showWhenNotDraft || formData.status !== 'DRAFT')}
          activeSection={activeSection}
          status={formData.status}
          editableSections={editableSections}
          unlockedSections={unlockedSections}
          sectionsWithFeedback={sectionsWithFeedback}
          pendingSections={pendingSections}
          onSectionClick={scrollToSection}
          completedSections={completedSections}
        />
        <PhotosSummaryPanel
          images={certificateImages}
          masterInstruments={formData.masterInstruments}
          parameters={formData.parameters}
        />
      </div>

      {/* Form Card */}
      <div className="flex-1 min-w-0 p-2.5 flex flex-col">
        {tatStartedAt && (
          <div className="flex-shrink-0 mb-2">
            <TATBanner sentAt={tatStartedAt} certificateCreatedAt={certificateCreatedAt} />
          </div>
        )}
        <div className="flex-1 min-h-0 flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-[#e2e8f0] px-5 py-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <Link href="/dashboard" className="text-[#94a3b8] hover:text-[#475569] transition-colors flex-shrink-0">
                  <ArrowLeft className="size-[18px]" strokeWidth={2} />
                </Link>
                <span className="text-[#e2e8f0] text-lg flex-shrink-0">|</span>
                <h1 className="text-[15px] font-mono font-medium text-[#0f172a] tracking-[0.01em] truncate">
                  {formData.certificateNumber || 'New Certificate'}
                </h1>
                <Badge
                  variant="outline"
                  className={cn(
                    'px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-[0.05em] flex-shrink-0',
                    statusConfig.className
                  )}
                >
                  {statusConfig.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[11px] text-[#94a3b8]">
                  Saved {formatLastSaved()}
                </span>
                <Button
                  onClick={autoSave}
                  disabled={isSaving || !isDirty}
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-[9px] border-[#e2e8f0] text-[#475569] text-[12.5px] font-semibold"
                >
                  <Save className="size-3.5 mr-1.5" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
                <Button
                  onClick={() => scrollToSection('submit')}
                  size="sm"
                  className="h-8 rounded-[9px] bg-primary text-white text-[12.5px] font-semibold"
                >
                  <Send className="size-3.5 mr-1.5" />
                  {formData.status === 'REVISION_REQUIRED' ? 'Resubmit' : 'Submit'}
                </Button>
              </div>
            </div>
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-[#64748b] mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-[5px] bg-[#f8fafc] flex items-center justify-center">
                  <User className="size-2.5 text-[#94a3b8]" />
                </div>
                <span className="font-medium text-[#475569]">{formData.customerName || 'No customer'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-[5px] bg-[#f8fafc] flex items-center justify-center">
                  <MapPin className="size-2.5 text-[#94a3b8]" />
                </div>
                <span>{formData.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}</span>
              </div>
              <span className="text-[#e2e8f0]">|</span>
              <span>Rev {currentRevision}</span>
              {reviewerName && (
                <>
                  <span className="text-[#e2e8f0]">|</span>
                  <span className="text-primary font-medium">Reviewer: {reviewerName}</span>
                </>
              )}
            </div>
          </div>

          {/* Content Area - Scrollable */}
          <div id="form-content" className="flex-1 min-h-0 overflow-auto bg-[#f8fafc]">
            <div className="p-5">
              {/* Feedback Banner */}
              {formData.status === 'REVISION_REQUIRED' && feedbacks.filter(f => f.feedbackType === 'REVISION_REQUESTED' || f.feedbackType === 'REVISION_REQUEST' || f.feedbackType === 'CUSTOMER_REVISION_FORWARDED').length > 0 && (() => {
                const latestFeedback = feedbacks.filter(f => f.feedbackType === 'REVISION_REQUESTED' || f.feedbackType === 'REVISION_REQUEST' || f.feedbackType === 'CUSTOMER_REVISION_FORWARDED')[0]
                const isCustomerForwarded = latestFeedback?.feedbackType === 'CUSTOMER_REVISION_FORWARDED'

                return (
                  <div className={cn(
                    "rounded-xl border-[1.5px] overflow-hidden mb-4",
                    isCustomerForwarded ? "border-purple-300 bg-purple-50" : "border-[#fdba74] bg-[#fff7ed]"
                  )}>
                    <button
                      onClick={() => setIsTopFeedbackExpanded(!isTopFeedbackExpanded)}
                      className={cn(
                        "w-full px-3.5 py-2.5 flex items-center justify-between border-b transition-colors",
                        isCustomerForwarded ? "bg-purple-100 border-purple-200" : "bg-[#ffedd5] border-[#fdba74]"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className={cn("p-1 rounded-md", isCustomerForwarded ? "bg-purple-200" : "bg-[rgba(234,88,12,0.15)]")}>
                          <AlertTriangle className={cn("size-3.5", isCustomerForwarded ? "text-purple-700" : "text-[#ea580c]")} />
                        </div>
                        <h3 className={cn("font-bold text-[12.5px]", isCustomerForwarded ? "text-purple-900" : "text-[#9a3412]")}>
                          {isCustomerForwarded ? 'Customer Revision Forwarded' : 'Revision Required'}
                        </h3>
                      </div>
                      {isTopFeedbackExpanded ? (
                        <ChevronUp className={cn("size-3.5", isCustomerForwarded ? "text-purple-700" : "text-[#ea580c]")} />
                      ) : (
                        <ChevronDown className={cn("size-3.5", isCustomerForwarded ? "text-purple-700" : "text-[#ea580c]")} />
                      )}
                    </button>
                    {isTopFeedbackExpanded && (
                      <div className="p-3">
                        {feedbacks.filter(f => f.feedbackType === 'REVISION_REQUESTED' || f.feedbackType === 'REVISION_REQUEST' || f.feedbackType === 'CUSTOMER_REVISION_FORWARDED').slice(0, 1).map((feedback) => (
                          <div key={feedback.id} className={cn(
                            "bg-white rounded-lg border p-3",
                            feedback.feedbackType === 'CUSTOMER_REVISION_FORWARDED' ? "border-purple-200" : "border-[#fdba74]"
                          )}>
                            <div className="flex items-start gap-2.5">
                              <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0", feedback.feedbackType === 'CUSTOMER_REVISION_FORWARDED' ? "bg-purple-100 text-purple-700" : "bg-[#ffedd5] text-[#9a3412]")}>
                                {feedback.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <span className="font-semibold text-[#0f172a] text-[11.5px]">{feedback.user.name}</span>
                                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[rgba(0,0,0,0.04)] text-[#64748b]">
                                    {feedback.user.role === 'ADMIN' ? 'Reviewer' : feedback.user.role}
                                  </span>
                                </div>
                                {feedback.comment && (
                                  <p className="text-[#475569] whitespace-pre-wrap text-[12px] leading-relaxed">{feedback.comment}</p>
                                )}
                                {feedback.reviewerEdits && feedback.reviewerEdits.length > 0 && (
                                  <div className="mt-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-center gap-1.5 text-amber-700 font-semibold mb-2 text-xs">
                                      <Calendar className="size-3.5" />
                                      Reviewer Edits Applied
                                    </div>
                                    <div className="space-y-2">
                                      {feedback.reviewerEdits.map((edit, idx) => (
                                        <div key={edit.field} className={cn(idx > 0 && 'pt-2 border-t border-amber-200/60')}>
                                          <p className="font-semibold text-slate-700 text-[11px] mb-0.5">{edit.fieldLabel}</p>
                                          <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                                            <span>{formatDateDisplay(edit.previousValue)}</span>
                                            <ArrowRight className="size-3 text-slate-400" />
                                            <span className={cn('font-semibold', edit.autoCalculated ? 'text-blue-600' : 'text-amber-700')}>
                                              {formatDateDisplay(edit.newValue)}
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Form Sections — Accordion */}
              <div className="space-y-2.5">
                <SummarySection
                  isNewCertificate={formData.status === 'DRAFT'}
                  certificateId={certificateId}
                  reviewerName={reviewerName}
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="summary" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('summary')}
                  accordionStatus={getAccordionStatus('summary')}
                  hasFeedback={sectionsWithFeedback.includes('summary')}
                />
                <UUCSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="uuc-details" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('uuc-details')}
                  accordionStatus={getAccordionStatus('uuc-details')}
                  hasFeedback={sectionsWithFeedback.includes('uuc-details')}
                />
                <MasterInstrumentSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="master-inst" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('master-inst')}
                  accordionStatus={getAccordionStatus('master-inst')}
                  hasFeedback={sectionsWithFeedback.includes('master-inst')}
                />
                <EnvironmentalSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="environment" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('environment')}
                  accordionStatus={getAccordionStatus('environment')}
                  hasFeedback={sectionsWithFeedback.includes('environment')}
                />
                <ResultsSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="results" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('results')}
                  accordionStatus={getAccordionStatus('results')}
                  hasFeedback={sectionsWithFeedback.includes('results')}
                />
                <RemarksSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="remarks" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('remarks')}
                  accordionStatus={getAccordionStatus('remarks')}
                  hasFeedback={sectionsWithFeedback.includes('remarks')}
                />
                <ConclusionSection
                  feedbackSlot={<SectionFeedback feedbacks={feedbacks} sectionId="conclusion" currentRevision={currentRevision} />}
                  disabled={isSectionDisabled('conclusion')}
                  accordionStatus={getAccordionStatus('conclusion')}
                  hasFeedback={sectionsWithFeedback.includes('conclusion')}
                />
                {/* Feedback History Section */}
                {formData.status !== 'DRAFT' && (feedbacks.length > 0 || customerFeedback || unlockRequests.length > 0 || fieldChangeRequests.length > 0) && (
                  <FeedbackTimeline
                    feedbacks={feedbacks}
                    currentRevision={currentRevision}
                    title="Feedback History"
                    emptyMessage="No feedback history yet"
                    groupBySection={true}
                    showRevisionTransition={true}
                    customerFeedback={customerFeedback}
                    internalRequests={[
                      ...unlockRequests,
                      ...fieldChangeRequests.map((r): InternalRequestItem => ({
                        id: r.id,
                        type: 'FIELD_CHANGE',
                        status: r.status,
                        fields: r.fields,
                        description: r.description,
                        adminNote: r.adminNote,
                        reviewedByName: r.reviewedBy,
                        createdAt: r.createdAt,
                      })),
                    ]}
                  />
                )}
                <FinalizeSection feedbacks={feedbacks} reviewerName={reviewerName} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Chat, Unlock & Field Change Logs */}
      {(formData.status === 'REVISION_REQUIRED' || reviewerName) && (
        <div className="w-[340px] flex-shrink-0 flex flex-col gap-2.5 p-2.5 pl-0 h-full overflow-hidden">

          {/* ===== CHAT SECTION ===== */}
          <div className={cn(
            'flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden',
            isChatExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
          )}>
            <button
              onClick={() => setIsChatExpanded(!isChatExpanded)}
              className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <MessageSquare className="size-[14px] text-[#94a3b8]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Chat</span>
              </div>
              {isChatExpanded ? (
                <ChevronUp className="size-3.5 text-[#94a3b8]" />
              ) : (
                <ChevronDown className="size-3.5 text-[#94a3b8]" />
              )}
            </button>

            {isChatExpanded && (
              <div className="flex-1 flex flex-col min-h-0">
                {reviewerName && (
                  <div className="flex-shrink-0 px-[18px] py-[14px] border-b border-[#f8fafc]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-[38px] h-[38px] rounded-full bg-[#0f1e2e] text-white flex items-center justify-center font-bold text-[13px] flex-shrink-0">
                        {reviewerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-bold text-[#0f172a] truncate">{reviewerName}</p>
                        <p className="text-[12px] text-[#94a3b8] flex items-center gap-[5px] mt-px">
                          <span>Reviewer</span>
                          <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block flex-shrink-0" />
                          <span className="text-[#22c55e]">Online</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden text-xs">
                  {reviewerName ? (
                    <ChatSidebar
                      isOpen={true}
                      onClose={() => {}}
                      certificateId={certificateId}
                      threadType="ASSIGNEE_REVIEWER"
                      embedded={true}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-[#94a3b8] text-xs p-4 text-center">
                      <div>
                        <MessageSquare className="size-7 mx-auto mb-2 text-[#e2e8f0]" />
                        <p className="font-medium text-[#475569] text-[12px]">No reviewer assigned</p>
                        <p className="text-[10px] mt-1 text-[#94a3b8]">Chat will be available once a reviewer is assigned</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ===== SECTION UNLOCK SECTION ===== */}
          <div className="flex-shrink-0 max-h-[40vh] overflow-auto">
            <SectionUnlockRequest
              certificateId={certificateId}
              certificateStatus={formData.status}
            />
          </div>

          {/* ===== FIELD CHANGE LOGS SECTION (Read-only) ===== */}
          {fieldChangeRequests.length > 0 && (
            <div className="flex flex-col bg-white rounded-[14px] border border-[#f1f5f9] overflow-hidden flex-shrink-0">
              <button
                onClick={() => setIsFieldChangeLogsExpanded(!isFieldChangeLogsExpanded)}
                className="flex items-center justify-between px-[18px] py-[13px] hover:bg-[#f8fafc] transition-colors"
              >
                <div className="flex items-center gap-2">
                  <PenLine className="size-[14px] text-[#94a3b8]" />
                  <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Field Changes</span>
                </div>
                <div className="flex items-center gap-2">
                  {fieldChangeRequests.some(r => r.status === 'PENDING') && (
                    <span className="px-1.5 py-0.5 bg-[#fef9c3] text-[#a16207] rounded text-[10px] font-semibold">
                      {fieldChangeRequests.filter(r => r.status === 'PENDING').length} pending
                    </span>
                  )}
                  {isFieldChangeLogsExpanded ? (
                    <ChevronUp className="size-3.5 text-[#94a3b8]" />
                  ) : (
                    <ChevronDown className="size-3.5 text-[#94a3b8]" />
                  )}
                </div>
              </button>

              {isFieldChangeLogsExpanded && (
                <div className="px-[18px] pb-[18px] pt-3 space-y-2.5 border-t border-[#f1f5f9] max-h-[40vh] overflow-auto">
                  {fieldChangeRequests.map((req) => {
                    const fieldLabels = req.fields.map(f => FIELD_LABELS[f] || f)

                    return (
                      <div
                        key={req.id}
                        className={cn(
                          'rounded-xl border p-3 space-y-1.5',
                          req.status === 'PENDING' && 'border-[#fde68a] bg-[#fefce8]',
                          req.status === 'APPROVED' && 'border-[#bbf7d0] bg-[#f0fdf4]',
                          req.status === 'REJECTED' && 'border-[#fecaca] bg-[#fef2f2]'
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {fieldLabels.map((label) => (
                              <span
                                key={label}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-medium',
                                  req.status === 'PENDING' && 'bg-[#fef3c7] text-[#a16207]',
                                  req.status === 'APPROVED' && 'bg-[#dcfce7] text-[#166534]',
                                  req.status === 'REJECTED' && 'bg-[#fee2e2] text-[#991b1b]'
                                )}
                              >
                                {label}
                              </span>
                            ))}
                          </div>
                          <span className={cn(
                            'text-[10px] font-semibold',
                            req.status === 'PENDING' && 'text-[#d97706]',
                            req.status === 'APPROVED' && 'text-[#16a34a]',
                            req.status === 'REJECTED' && 'text-[#dc2626]'
                          )}>
                            {req.status === 'PENDING' ? 'Pending' : req.status === 'APPROVED' ? 'Applied' : 'Rejected'}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748b] line-clamp-2">{req.description}</p>
                        {req.adminNote && (
                          <p className="text-[11px] text-[#94a3b8] italic">&ldquo;{req.adminNote}&rdquo;</p>
                        )}
                        <p className="text-[10px] text-[#94a3b8]">
                          {new Date(req.createdAt).toLocaleDateString()}
                          {req.reviewedBy && ` · ${req.reviewedBy}`}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={conflictState?.hasConflict ?? false}
        onOpenChange={(open) => {
          if (!open) {
            setConflictState(null)
          }
        }}
        serverTimestamp={conflictState?.serverTimestamp ?? null}
        onRefresh={() => {
          window.location.reload()
        }}
      />
    </div>
  )
}
