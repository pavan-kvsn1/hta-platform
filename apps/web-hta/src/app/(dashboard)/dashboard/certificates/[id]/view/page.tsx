'use client'

import { apiFetch } from '@/lib/api-client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  User,
  Building2,
  MapPin,
  AlertCircle,
  CheckCircle,
  MessageSquare,
  Image as ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { cn } from '@/lib/utils'
import { safeJsonParse } from '@/lib/utils/safe-json'
import { getConclusionText } from '@/components/pdf/pdf-utils'
import { CALIBRATION_STATUS_OPTIONS } from '@/components/forms/RemarksSection'
import { FeedbackTimeline } from '@/components/feedback/shared'
import {
  ImageGalleryModal,
  ReadingImagesViewModal,
  type GalleryImage,
  type ParameterReadingImages,
} from '@/components/certificate'

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  DRAFT: { label: 'Draft', className: 'bg-slate-50 text-slate-700 border-slate-200' },
  PENDING_REVIEW: { label: 'Pending Review', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  REVISION_REQUIRED: { label: 'Revision Required', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  PENDING_CUSTOMER_APPROVAL: { label: 'Pending Customer', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  CUSTOMER_REVISION_REQUIRED: { label: 'Customer Revision', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  PENDING_ADMIN_AUTHORIZATION: { label: 'Pending Authorization', className: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  APPROVED: { label: 'Approved', className: 'bg-green-50 text-green-700 border-green-200' },
  AUTHORIZED: { label: 'Authorized', className: 'bg-green-50 text-green-700 border-green-200' },
  REJECTED: { label: 'Rejected', className: 'bg-red-50 text-red-700 border-red-200' },
}

interface Feedback {
  id: string
  feedbackType: string
  comment: string | null
  createdAt: string
  revisionNumber: number
  targetSection: string | null
  user: {
    name: string | null
    role: string
  }
}

interface ApiEvent {
  id: string
  eventType: string
  eventData: string
  createdAt: string
  revision: number
}

interface ApiCertificate {
  id: string
  certificateNumber: string
  status: string
  calibratedAt: string
  srfNumber: string | null
  srfDate: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  dueDateNotApplicable: boolean
  customerName: string | null
  customerAddress: string | null
  customerContactName: string | null
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  uucLocationName: string | null
  ambientTemperature: string | null
  relativeHumidity: string | null
  calibrationStatus: string | null
  selectedConclusionStatements: string | null
  additionalConclusionStatement: string | null
  currentRevision: number
  createdBy?: {
    name: string | null
  }
  reviewer?: {
    id: string
    name: string | null
    email: string
  }
  parameters: {
    id: string
    parameterName: string
    parameterUnit: string | null
    showAfterAdjustment: boolean
    results: {
      id: string
      pointNumber: number
      standardReading: string | null
      beforeAdjustment: string | null
      afterAdjustment: string | null
      errorObserved: number | null
      isOutOfLimit: boolean
    }[]
  }[]
  masterInstruments: {
    id: string
    description: string | null
    make: string | null
    model: string | null
    serialNumber: string | null
    calibrationDueDate: string | null
  }[]
  feedbacks?: Feedback[]
  events?: ApiEvent[]
}

export default function CertificateViewPage() {
  const params = useParams()
  const certificateId = params.id as string

  const [certificate, setCertificate] = useState<ApiCertificate | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    section1: true,
    section2: true,
    section3: true,
    section4: true,
    section5: true,
    section6: true,
    section7: true,
    feedback: true,
  })

  const [customerFeedback, setCustomerFeedback] = useState<{
    notes: string
    sectionFeedbacks: { section: string; comment: string }[] | null
    generalNotes: string | null
    customerName: string
    customerEmail: string
    requestedAt: string
    revision?: number
  } | null>(null)

  // Image modal state
  const [uucImagesModal, setUucImagesModal] = useState<{
    isOpen: boolean
    images: GalleryImage[]
    isLoading: boolean
    error: string | null
  }>({ isOpen: false, images: [], isLoading: false, error: null })

  const [readingImagesModal, setReadingImagesModal] = useState<{
    isOpen: boolean
    parameters: ParameterReadingImages[]
    isLoading: boolean
    error: string | null
  }>({ isOpen: false, parameters: [], isLoading: false, error: null })

  // Fetch UUC images
  const fetchUucImages = async () => {
    setUucImagesModal({ isOpen: true, images: [], isLoading: true, error: null })
    try {
      const response = await apiFetch(`/api/certificates/${certificateId}/images?type=UUC`)
      if (!response.ok) throw new Error('Failed to fetch images')
      const data = await response.json()
      setUucImagesModal({
        isOpen: true,
        images: data.images || [],
        isLoading: false,
        error: null,
      })
    } catch (err) {
      setUucImagesModal({
        isOpen: true,
        images: [],
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load images',
      })
    }
  }

  // Fetch reading images for all parameters
  const fetchReadingImages = async () => {
    if (!certificate) return
    setReadingImagesModal({ isOpen: true, parameters: [], isLoading: true, error: null })
    try {
      // Fetch all reading images
      const [uucResponse, masterResponse] = await Promise.all([
        apiFetch(`/api/certificates/${certificateId}/images?type=READING_UUC`),
        apiFetch(`/api/certificates/${certificateId}/images?type=READING_MASTER`),
      ])

      if (!uucResponse.ok || !masterResponse.ok) throw new Error('Failed to fetch images')

      const [uucData, masterData] = await Promise.all([
        uucResponse.json(),
        masterResponse.json(),
      ])

      // Build parameter structure with images
      const parameters: ParameterReadingImages[] = certificate.parameters.map((param, paramIndex) => ({
        parameterIndex: paramIndex,
        parameterName: param.parameterName,
        parameterUnit: param.parameterUnit,
        points: param.results.map((result) => {
          const uucImage = uucData.images?.find(
            (img: { parameterIndex: number; pointNumber: number }) =>
              img.parameterIndex === paramIndex && img.pointNumber === result.pointNumber
          )
          const masterImage = masterData.images?.find(
            (img: { parameterIndex: number; pointNumber: number }) =>
              img.parameterIndex === paramIndex && img.pointNumber === result.pointNumber
          )
          return {
            pointNumber: result.pointNumber,
            standardReading: result.standardReading,
            uucReading: result.beforeAdjustment,
            uucImage: uucImage || null,
            masterImage: masterImage || null,
          }
        }),
      }))

      setReadingImagesModal({
        isOpen: true,
        parameters,
        isLoading: false,
        error: null,
      })
    } catch (err) {
      setReadingImagesModal({
        isOpen: true,
        parameters: [],
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to load images',
      })
    }
  }

  useEffect(() => {
    async function fetchCertificate() {
      try {
        setIsLoading(true)
        const response = await apiFetch(`/api/certificates/${certificateId}?include=feedbacks,events`)

        if (!response.ok) {
          if (response.status === 404) {
            setError('Certificate not found')
          } else if (response.status === 403) {
            setError('You do not have permission to view this certificate')
          } else {
            setError('Failed to load certificate')
          }
          return
        }

        const data = await response.json()
        setCertificate(data)

        // Extract customer feedback from events
        if (data.events) {
          const customerEvent = data.events
            .filter((e: ApiEvent) => e.eventType === 'CUSTOMER_REVISION_REQUESTED')
            .sort((a: ApiEvent, b: ApiEvent) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

          if (customerEvent) {
            const eventData = safeJsonParse<Record<string, unknown>>(customerEvent.eventData, {})
            setCustomerFeedback({
              notes: (eventData.notes as string) || '',
              sectionFeedbacks: (eventData.sectionFeedbacks as { section: string; comment: string }[] | null) || null,
              generalNotes: (eventData.generalNotes as string | null) || null,
              customerName: (eventData.customerName as string) || 'Customer',
              customerEmail: (eventData.customerEmail as string) || '',
              requestedAt: (eventData.requestedAt as string) || customerEvent.createdAt,
              revision: customerEvent.revision,
            })
          }
        }
      } catch (err) {
        console.error('Error fetching certificate:', err)
        setError('Failed to load certificate')
      } finally {
        setIsLoading(false)
      }
    }

    if (certificateId) {
      fetchCertificate()
    }
  }, [certificateId])

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Loading certificate...</p>
        </div>
      </div>
    )
  }

  if (error || !certificate) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-slate-900 mb-2">
            {error || 'Certificate not found'}
          </h2>
          <Link href="/dashboard">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[certificate.status] || STATUS_CONFIG.DRAFT
  const calibrationStatus = safeJsonParse<string[]>(certificate.calibrationStatus, [])
  const conclusionStatements = safeJsonParse<string[]>(certificate.selectedConclusionStatements, [])
  const feedbacks = certificate.feedbacks || []

  // Check if any results are out of limit
  const hasOutOfLimitResults = certificate.parameters.some((p) =>
    p.results.some((r) => r.isOutOfLimit)
  )

  // Check if chat should be available (has a reviewer assigned)
  const hasReviewer = !!certificate.reviewer

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] overflow-hidden">
      {/* Header Row */}
      <div className="flex-shrink-0 px-7 py-[14px] bg-white border-b border-[#e2e8f0] flex items-center gap-3.5">
        <Link
          href="/dashboard"
          className="w-9 h-9 rounded-lg border border-[#e2e8f0] bg-white flex items-center justify-center hover:bg-[#f8fafc] transition-colors flex-shrink-0"
        >
          <ArrowLeft className="size-[14px] text-[#64748b]" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <h1 className="text-[20px] font-extrabold tracking-[-0.025em] text-[#0f172a]">
            {certificate.certificateNumber}
          </h1>
          <Badge
            variant="outline"
            className={cn(
              'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
              statusConfig.className
            )}
          >
            {statusConfig.label}
          </Badge>
        </div>
        {(certificate.status === 'APPROVED' || certificate.status === 'AUTHORIZED') && (
          <a href={`/api/certificates/${certificate.id}/download-signed`} download className="flex-shrink-0">
            <Button size="sm" className="h-[38px] px-[18px] rounded-[9px] bg-primary hover:bg-primary/90 text-white text-[13px] font-bold">
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download PDF
            </Button>
          </a>
        )}
      </div>

      {/* Breadcrumb Row */}
      <div className="flex-shrink-0 px-7 py-[9px] bg-white border-b border-[#f1f5f9] flex items-center">
        <div className="flex items-center gap-[5px] text-[13px] text-[#64748b]">
          <User className="size-[13px] text-[#94a3b8]" />
          <span>{certificate.createdBy?.name || 'Unknown'}</span>
        </div>
        <span className="text-[#e2e8f0] mx-3">|</span>
        <div className="flex items-center gap-[5px] text-[13px] text-[#64748b]">
          <Building2 className="size-[13px] text-[#94a3b8]" />
          <span>{certificate.customerName || '-'}</span>
        </div>
        <span className="text-[#e2e8f0] mx-3">|</span>
        <div className="flex items-center gap-[5px] text-[13px] text-[#64748b]">
          <MapPin className="size-[13px] text-[#94a3b8]" />
          <span>{certificate.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}</span>
        </div>
        <span className="text-[#e2e8f0] mx-3">|</span>
        <span className="text-[13px] text-[#64748b]">Revision {certificate.currentRevision}</span>
      </div>

      {/* Body — left sections + right chat */}
      <div className="flex-1 flex overflow-hidden min-h-0">
      {/* Left Side - Scrollable Sections */}
      <div className="flex-1 overflow-auto min-w-0">
          <div className="p-6 space-y-2.5 bg-[#f1f5f9]">
              {/* Out of Limit Warning */}
              {hasOutOfLimitResults && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-red-800 text-sm">Out of Limit Results</h4>
                    <p className="text-xs text-red-700 mt-1">
                      This certificate contains one or more results that are outside the
                      acceptable limits.
                    </p>
                  </div>
                </div>
              )}

              {/* Section 1: Summary */}
              <CollapsibleSection
                title="Section 1: Summary"
                isExpanded={expandedSections.section1}
                onToggle={() => toggleSection('section1')}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <InfoField label="SRF Number" value={certificate.srfNumber} />
                  <InfoField label="SRF Date" value={formatDate(certificate.srfDate)} />
                  <InfoField
                    label="Calibrated At"
                    value={certificate.calibratedAt === 'LAB' ? 'Laboratory' : 'Site'}
                  />
                  <InfoField
                    label="Date of Calibration"
                    value={formatDate(certificate.dateOfCalibration)}
                  />
                  <InfoField
                    label="Calibration Due Date"
                    value={
                      certificate.dueDateNotApplicable
                        ? 'Not Applicable'
                        : formatDate(certificate.calibrationDueDate)
                    }
                  />
                  <div className="md:col-span-2 lg:col-span-3 border-t pt-4 mt-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <InfoField label="Customer Name" value={certificate.customerName} />
                      <InfoField label="Customer Address" value={certificate.customerAddress} />
                      <InfoField label="Customer's Reviewer Name" value={certificate.customerContactName} />
                    </div>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Section 2: UUC Details */}
              <CollapsibleSection
                title="Section 2: UUC Details"
                isExpanded={expandedSections.section2}
                onToggle={() => toggleSection('section2')}
                actionButton={
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      fetchUucImages()
                    }}
                    className="flex items-center gap-[5px] px-[11px] py-[5px] border border-[#e2e8f0] rounded-[7px] bg-white text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors"
                  >
                    <ImageIcon className="size-3.5" />
                    View Images
                  </button>
                }
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <InfoField label="Description" value={certificate.uucDescription} />
                  </div>
                  <InfoField label="Make" value={certificate.uucMake} />
                  <InfoField label="Model" value={certificate.uucModel} />
                  <InfoField label="Serial Number" value={certificate.uucSerialNumber} />
                  <InfoField label="Location/Tag" value={certificate.uucLocationName} />
                </div>
              </CollapsibleSection>

              {/* Section 3: Master Instruments */}
              <CollapsibleSection
                title="Section 3: Master Instruments"
                isExpanded={expandedSections.section3}
                onToggle={() => toggleSection('section3')}
              >
                {certificate.masterInstruments.length === 0 ? (
                  <p className="text-slate-500 text-xs">No master instruments listed.</p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-section-inner">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Description
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Make
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Model
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Serial No.
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700 uppercase">
                            Cal. Due Date
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {certificate.masterInstruments.map((mi) => (
                          <tr key={mi.id}>
                            <td className="px-4 py-2 text-slate-900 text-xs">{mi.description || '-'}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{mi.make || '-'}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{mi.model || '-'}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{mi.serialNumber || '-'}</td>
                            <td className="px-4 py-2 text-slate-700 text-xs">{mi.calibrationDueDate || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 4: Environmental Conditions */}
              <CollapsibleSection
                title="Section 4: Environmental Conditions"
                isExpanded={expandedSections.section4}
                onToggle={() => toggleSection('section4')}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoField
                    label="Ambient Temperature"
                    value={certificate.ambientTemperature ? `${certificate.ambientTemperature} °C` : '-'}
                  />
                  <InfoField
                    label="Relative Humidity"
                    value={certificate.relativeHumidity ? `${certificate.relativeHumidity} %RH` : '-'}
                  />
                </div>
              </CollapsibleSection>

              {/* Section 5: Calibration Results */}
              <CollapsibleSection
                title="Section 5: Calibration Results"
                isExpanded={expandedSections.section5}
                onToggle={() => toggleSection('section5')}
                badge={
                  hasOutOfLimitResults ? (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Out of Limit
                    </span>
                  ) : undefined
                }
                actionButton={
                  certificate.parameters.length > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        fetchReadingImages()
                      }}
                      className="flex items-center gap-[5px] px-[11px] py-[5px] border border-[#e2e8f0] rounded-[7px] bg-white text-[12px] font-medium text-[#475569] hover:bg-[#f8fafc] transition-colors"
                    >
                      <ImageIcon className="size-3.5" />
                      View Images
                    </button>
                  ) : undefined
                }
              >
                {certificate.parameters.length === 0 ? (
                  <p className="text-slate-500 text-xs">No results recorded.</p>
                ) : (
                  <div className="space-y-4">
                    {certificate.parameters.map((param) => (
                      <div key={param.id} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-primary/10 px-4 py-2 border-b border-slate-200">
                          <span className="font-medium text-primary text-sm">
                            {param.parameterName}
                            {param.parameterUnit && (
                              <span className="text-primary/70 font-normal ml-1 text-sm">
                                ({param.parameterUnit})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-section-inner">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                                  Point
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                                  Standard Reading
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                                  UUC Reading
                                </th>
                                {param.showAfterAdjustment && (
                                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                                    After Adjustment
                                  </th>
                                )}
                                <th className="px-4 py-2 text-left text-xs font-semibold text-slate-700">
                                  Error
                                </th>
                                <th className="px-4 py-2 text-center text-xs font-semibold text-slate-700">
                                  Status
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {param.results.map((result) => (
                                <tr
                                  key={result.id}
                                  className={cn(result.isOutOfLimit && 'bg-red-50')}
                                >
                                  <td className="px-4 py-2 text-slate-900 text-xs">{result.pointNumber}</td>
                                  <td className="px-4 py-2 text-slate-700 text-xs">{result.standardReading || '-'}</td>
                                  <td className="px-4 py-2 text-slate-700 text-xs">{result.beforeAdjustment || '-'}</td>
                                  {param.showAfterAdjustment && (
                                    <td className="px-4 py-2 text-slate-700 text-xs">{result.afterAdjustment || '-'}</td>
                                  )}
                                  <td className="px-4 py-2 text-slate-700 text-xs">{result.errorObserved ?? '-'}</td>
                                  <td className="px-4 py-2 text-center">
                                    {result.isOutOfLimit ? (
                                      <span className="inline-flex items-center gap-1 text-red-600">
                                        <AlertCircle className="h-3 w-3" />
                                        <span className="text-xs">Out of Limit</span>
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 text-green-600">
                                        <CheckCircle className="h-3 w-3" />
                                        <span className="text-xs">OK</span>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* Section 6: Remarks */}
              <CollapsibleSection
                title="Section 6: Remarks"
                isExpanded={expandedSections.section6}
                onToggle={() => toggleSection('section6')}
              >
                <div className="space-y-4">
                  {calibrationStatus.length > 0 ? (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 mb-2">
                        Calibration Status
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {calibrationStatus.map((statusId: string, i: number) => {
                          const option = CALIBRATION_STATUS_OPTIONS.find(o => o.id === statusId)
                          return (
                            <span
                              key={i}
                              className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium"
                            >
                              {option?.label || statusId}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">No remarks added.</p>
                  )}
                </div>
              </CollapsibleSection>

              {/* Section 7: Conclusion */}
              <CollapsibleSection
                title="Section 7: Conclusion"
                isExpanded={expandedSections.section7}
                onToggle={() => toggleSection('section7')}
              >
                <div className="space-y-4">
                  {conclusionStatements.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 mb-2">
                        Conclusion Statements
                      </h4>
                      <ul className="list-disc list-inside space-y-2 text-slate-700">
                        {conclusionStatements.map((statementKey: string, i: number) => (
                          <li key={i} className="text-xs">
                            {getConclusionText(statementKey)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {certificate.additionalConclusionStatement && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 mb-2">
                        Additional Statement
                      </h4>
                      <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg">
                        {certificate.additionalConclusionStatement}
                      </p>
                    </div>
                  )}

                  {conclusionStatements.length === 0 && !certificate.additionalConclusionStatement && (
                    <p className="text-slate-500 text-xs">No conclusion statements added.</p>
                  )}
                </div>
              </CollapsibleSection>

              {/* Feedback History */}
              {(feedbacks.length > 0 || customerFeedback) && (
                <FeedbackTimeline
                  feedbacks={feedbacks}
                  currentRevision={certificate.currentRevision}
                  title="Feedback History"
                  groupBySection={true}
                  showRevisionTransition={true}
                  customerFeedback={customerFeedback}
                />
              )}
            </div>
      </div>{/* end left panel */}

      {/* Right Panel - Chat */}
      <div className="w-[380px] flex-shrink-0 flex flex-col border-l border-[#e2e8f0] bg-white h-full overflow-hidden">
        {/* Chat Header */}
        <div className="flex-shrink-0 px-[18px] py-[13px] border-b border-[#f1f5f9] flex items-center gap-2">
          <MessageSquare className="size-[14px] text-[#94a3b8]" />
          <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Chat with Reviewer</span>
        </div>

        {/* Reviewer Info */}
        {hasReviewer && (
          <div className="flex-shrink-0 px-[18px] py-[14px] border-b border-[#f8fafc] flex items-center gap-2.5">
            <div className="w-[38px] h-[38px] rounded-full bg-[#0f1e2e] flex items-center justify-center text-[13px] font-bold text-[#93c5fd] flex-shrink-0">
              {(certificate.reviewer?.name || 'R').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
            </div>
            <div>
              <div className="text-[14px] font-bold text-[#0f172a]">
                {certificate.reviewer?.name || 'Reviewer'}
              </div>
              <div className="text-[12px] text-[#94a3b8] flex items-center gap-[5px] mt-px">
                <span className="w-[7px] h-[7px] rounded-full bg-[#22c55e] inline-block flex-shrink-0" />
                Reviewer · Online
              </div>
            </div>
          </div>
        )}

        {/* Chat Messages Area */}
        <div className="flex-1 min-h-0 overflow-hidden text-xs">
          {hasReviewer ? (
            <ChatSidebar
              isOpen={true}
              onClose={() => {}}
              certificateId={certificate.id}
              threadType="ASSIGNEE_REVIEWER"
              embedded={true}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-[#94a3b8] text-xs p-4 text-center">
              <div>
                <MessageSquare className="size-8 mx-auto mb-2 text-[#cbd5e1]" />
                <p>No reviewer assigned yet</p>
                <p className="text-[10px] mt-1">Chat will be available once a reviewer is assigned</p>
              </div>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Image Modals */}
      <ImageGalleryModal
        isOpen={uucImagesModal.isOpen}
        onClose={() => setUucImagesModal({ ...uucImagesModal, isOpen: false })}
        title="UUC Images"
        images={uucImagesModal.images}
        isLoading={uucImagesModal.isLoading}
        error={uucImagesModal.error}
      />

      <ReadingImagesViewModal
        isOpen={readingImagesModal.isOpen}
        onClose={() => setReadingImagesModal({ ...readingImagesModal, isOpen: false })}
        certificateId={certificateId}
        parameters={readingImagesModal.parameters}
        isLoading={readingImagesModal.isLoading}
        error={readingImagesModal.error}
      />
    </div>
  )
}

// Helper Components

function extractSectionNumber(title: string): string | null {
  const match = title.match(/Section\s+(\d+)/i)
  return match ? match[1] : null
}

function extractSectionLabel(title: string): string {
  const match = title.match(/Section\s+\d+:\s*(.+)/i)
  return match ? match[1] : title
}

function CollapsibleSection({
  title,
  isExpanded,
  onToggle,
  children,
  badge,
  actionButton,
}: {
  title: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: React.ReactNode
  actionButton?: React.ReactNode
}) {
  const sectionNum = extractSectionNumber(title)
  const sectionLabel = extractSectionLabel(title)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
      <div
        className={`flex items-center justify-between cursor-pointer transition-colors duration-100 ${isExpanded ? 'bg-[#f8fafc] border-b border-[#e2e8f0]' : 'bg-white'}`}
      >
        <button
          onClick={onToggle}
          className="flex-1 px-5 py-[14px] flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            {sectionNum && (
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] px-2 py-[3px] bg-[#f1f5f9] rounded-[5px]">
                §{sectionNum}
              </span>
            )}
            <span className="text-[15px] font-bold text-[#0f172a] tracking-[-0.01em]">
              {sectionLabel}
            </span>
            {badge}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-[15px] w-[15px] text-[#94a3b8]" />
          ) : (
            <ChevronDown className="h-[15px] w-[15px] text-[#94a3b8]" />
          )}
        </button>
        {actionButton && (
          <div className="pr-4">
            {actionButton}
          </div>
        )}
      </div>
      {isExpanded && <div className="p-5 bg-white">{children}</div>}
    </div>
  )
}

function InfoField({
  label,
  value,
}: {
  label: string
  value: string | null | undefined
}) {
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#94a3b8] mb-[5px]">{label}</div>
      <div className="text-[14px] text-[#0f172a]">
        {value || <span className="text-[#cbd5e1]">&mdash;</span>}
      </div>
    </div>
  )
}

