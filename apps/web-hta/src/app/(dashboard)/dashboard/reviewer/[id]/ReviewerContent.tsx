'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  Image as ImageIcon,
} from 'lucide-react'
import { CollapsibleSection } from '@/components/certificate/CollapsibleSection'
import { InfoField } from '@/components/certificate/InfoField'
import { MasterInstrumentsTable } from '@/components/certificate/MasterInstrumentsTable'
import { CalibrationResultsTable } from '@/components/certificate/CalibrationResultsTable'
import { getConclusionText } from '@/components/pdf/pdf-utils'
import { CALIBRATION_STATUS_OPTIONS } from '@/components/forms/RemarksSection'
import {
  FeedbackTimeline,
  isRevisionRequest,
  isEngineerResponse as isAssigneeResponse,
  type InternalRequestItem,
} from '@/components/feedback/shared'
import {
  ImageGalleryModal,
  ReadingImagesViewModal,
  type GalleryImage,
  type ParameterReadingImages,
} from '@/components/certificate'

interface Parameter {
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
  accuracyType: string
  errorFormula: string
  showAfterAdjustment: boolean
  requiresBinning: boolean
  bins: string | null
  sopReference: string | null
  results: {
    id: string
    pointNumber: number
    standardReading: string | null
    beforeAdjustment: string | null
    afterAdjustment: string | null
    errorObserved: number | null
    isOutOfLimit: boolean
  }[]
}

interface MasterInstrument {
  id: string
  description: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibrationDueDate: string | null
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

interface CustomerFeedback {
  notes: string
  sectionFeedbacks: { section: string; comment: string }[] | null
  generalNotes: string | null
  customerName: string
  customerEmail: string
  requestedAt: string
  revision?: number
}

// Section mapping for display
const _SECTION_LABELS: Record<string, string> = {
  'summary': 'Summary',
  'uuc-details': 'UUC Details',
  'master-inst': 'Master Instruments',
  'environment': 'Environmental Conditions',
  'results': 'Calibration Results',
  'remarks': 'Remarks',
  'conclusion': 'Conclusion',
}

interface CertificateData {
  id: string
  certificateNumber: string
  status: string
  customerName: string | null
  customerAddress: string | null
  customerContactName: string | null
  customerContactEmail: string | null
  calibratedAt: string | null
  srfNumber: string | null
  srfDate: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  dueDateNotApplicable: boolean
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  uucLocationName: string | null
  ambientTemperature: string | null
  relativeHumidity: string | null
  calibrationStatus: string[]
  conclusionStatements: string[]
  additionalConclusionStatement: string | null
  currentRevision: number
  parameters: Parameter[]
  masterInstruments: MasterInstrument[]
}

interface Assignee {
  id: string
  name: string
  email: string
}

interface ReviewerContentProps {
  certificate: CertificateData
  assignee: Assignee
  feedbacks: Feedback[]
  customerFeedback?: CustomerFeedback | null
  internalRequests?: InternalRequestItem[]
}

export function ReviewerContent({
  certificate,
  assignee: _assignee,
  feedbacks,
  customerFeedback,
  internalRequests,
}: ReviewerContentProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    section1: true,
    section2: true,
    section3: true,
    section4: true,
    section5: true,
    section6: true,
    section7: true,
    feedback: feedbacks.length > 0,
  })

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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Fetch UUC images
  const fetchUucImages = async () => {
    setUucImagesModal({ isOpen: true, images: [], isLoading: true, error: null })
    try {
      const response = await apiFetch(`/api/certificates/${certificate.id}/images?type=UUC`)
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
    setReadingImagesModal({ isOpen: true, parameters: [], isLoading: true, error: null })
    try {
      const [uucResponse, masterResponse] = await Promise.all([
        apiFetch(`/api/certificates/${certificate.id}/images?type=READING_UUC`),
        apiFetch(`/api/certificates/${certificate.id}/images?type=READING_MASTER`),
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  }

  const _formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Check if any results are out of limit
  const hasOutOfLimitResults = certificate.parameters.some((p) =>
    p.results.some((r) => r.isOutOfLimit)
  )

  return (
    <div className="space-y-4">
      {/* Out of Limit Warning */}
      {hasOutOfLimitResults && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-medium text-red-800">Out of Limit Results</h4>
            <p className="text-sm text-red-700 mt-1">
              This certificate contains one or more results that are outside the
              acceptable limits. Please review carefully.
            </p>
          </div>
        </div>
      )}

      {/* Section 1: Summary */}
      <CollapsibleSection
        title="Section 1: Summary"
        isExpanded={expandedSections.section1}
        onToggle={() => toggleSection('section1')}
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="summary"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
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
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="uuc-details"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
        actionButton={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              fetchUucImages()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-white/90 border border-white/20 rounded-lg hover:bg-white transition-colors"
          >
            <ImageIcon className="size-3.5" />
            View Images
          </button>
        }
      >
        <div className="space-y-6">
          {/* Basic UUC Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <InfoField label="Description" value={certificate.uucDescription} />
            </div>
            <InfoField label="Make" value={certificate.uucMake} />
            <InfoField label="Model" value={certificate.uucModel} />
            <InfoField label="Serial Number" value={certificate.uucSerialNumber} />
            <InfoField label="Location/Tag" value={certificate.uucLocationName} />
          </div>

          {/* Parameter Specifications */}
          {certificate.parameters.length > 0 && (
            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Parameter Specifications</h4>
              <div className="space-y-4">
                {certificate.parameters.map((param) => {
                  const parsedBins = param.bins ? (typeof param.bins === 'string' ? JSON.parse(param.bins) : param.bins) : []
                  const hasBins = param.requiresBinning && parsedBins.length > 0

                  return (
                    <div key={param.id} className="border rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 border-b flex items-center justify-between">
                        <span className="font-semibold text-gray-900 text-xs">
                          {param.parameterName}
                          {param.parameterUnit && (
                            <span className="text-gray-500 font-normal ml-1">({param.parameterUnit})</span>
                          )}
                        </span>
                        {param.sopReference && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            SOP: {param.sopReference}
                          </span>
                        )}
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 text-sm">
                          {(param.rangeMin !== null || param.rangeMax !== null) && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">Range</span>
                              <span className="text-gray-900 text-xs">
                                {param.rangeMin || '0'} to {param.rangeMax || '∞'} {param.rangeUnit || param.parameterUnit || ''}
                              </span>
                            </div>
                          )}
                          {(param.operatingMin !== null || param.operatingMax !== null) && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">Operating Range</span>
                              <span className="text-gray-900 text-xs">
                                {param.operatingMin || '0'} to {param.operatingMax || '∞'} {param.operatingUnit || param.parameterUnit || ''}
                              </span>
                            </div>
                          )}
                          {param.accuracyValue && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">Accuracy</span>
                              <span className="text-gray-900">
                                ±{param.accuracyValue} {param.accuracyUnit || ''}{' '}
                                {param.accuracyType !== 'ABSOLUTE' && (
                                  <span className="text-gray-500">({param.accuracyType})</span>
                                )}
                              </span>
                            </div>
                          )}
                          {param.leastCountValue && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">Resolution</span>
                              <span className="text-gray-900">
                                {param.leastCountValue} {param.leastCountUnit || param.parameterUnit || ''}
                              </span>
                            </div>
                          )}
                          {param.errorFormula && param.errorFormula !== 'A-B' && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">Error Formula</span>
                              <span className="text-gray-900 font-mono">{param.errorFormula}</span>
                            </div>
                          )}
                          {param.showAfterAdjustment && (
                            <div>
                              <span className="text-xs font-medium text-gray-500 block">After Adjustment</span>
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle className="h-3 w-3" /> Enabled
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Bins */}
                        {hasBins && (
                          <div className="mt-4 pt-4 border-t">
                            <span className="text-xs font-semibold text-gray-500 block mb-2">Range-wise Specifications</span>
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead className="bg-gray-50">
                                  <tr>
                                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500">Range</th>
                                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500">Least Count</th>
                                    <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-500">Accuracy</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                  {parsedBins.map((bin: { id?: string; binMin: string; binMax: string; leastCount: string; accuracy: string }, i: number) => (
                                    <tr key={bin.id || i}>
                                      <td className="px-3 py-1.5 text-gray-900 text-xs">
                                        {bin.binMin} to {bin.binMax} {param.parameterUnit || ''}
                                      </td>
                                      <td className="px-3 py-1.5 text-gray-700 text-xs">
                                        {bin.leastCount} {param.parameterUnit || ''}
                                      </td>
                                      <td className="px-3 py-1.5 text-gray-700 text-xs">
                                        ±{bin.accuracy}{' '}
                                        {param.accuracyType === 'ABSOLUTE'
                                          ? param.parameterUnit || ''
                                          : param.accuracyType === 'PERCENT_READING'
                                            ? '% of reading'
                                            : '% of scale'}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 3: Master Instruments */}
      <CollapsibleSection
        title="Section 3: Master Instruments"
        isExpanded={expandedSections.section3}
        onToggle={() => toggleSection('section3')}
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="master-inst"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
      >
        <MasterInstrumentsTable instruments={certificate.masterInstruments} />
      </CollapsibleSection>

      {/* Section 4: Environmental Conditions */}
      <CollapsibleSection
        title="Section 4: Environmental Conditions"
        isExpanded={expandedSections.section4}
        onToggle={() => toggleSection('section4')}
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="environment"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
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
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="results"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
        actionButton={
          certificate.parameters.length > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                fetchReadingImages()
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-white/90 border border-white/20 rounded-lg hover:bg-white transition-colors"
            >
              <ImageIcon className="size-3.5" />
              View Images
            </button>
          ) : undefined
        }
      >
        <CalibrationResultsTable parameters={certificate.parameters} />
      </CollapsibleSection>

      {/* Section 6: Remarks */}
      <CollapsibleSection
        title="Section 6: Remarks"
        isExpanded={expandedSections.section6}
        onToggle={() => toggleSection('section6')}
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="remarks"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
      >
        <div className="space-y-4">
          {certificate.calibrationStatus.length > 0 ? (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Calibration Status
              </h4>
              <div className="flex flex-wrap gap-2">
                {certificate.calibrationStatus.map((statusId, i) => {
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
            <p className="text-gray-500 text-sm">No remarks added.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 7: Conclusion */}
      <CollapsibleSection
        title="Section 7: Conclusion"
        isExpanded={expandedSections.section7}
        onToggle={() => toggleSection('section7')}
        feedbackSlot={
          <SectionFeedbackChain
            customerFeedback={customerFeedback}
            feedbacks={feedbacks}
            sectionId="conclusion"
            currentRevision={certificate.currentRevision}
            certificateStatus={certificate.status}
          />
        }
      >
        <div className="space-y-4">
          {certificate.conclusionStatements.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Conclusion Statements
              </h4>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                {certificate.conclusionStatements.map((statementKey, i) => (
                  <li key={i} className="text-xs">
                    {getConclusionText(statementKey)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {certificate.additionalConclusionStatement && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Additional Statement
              </h4>
              <p className="text-xs text-gray-700 bg-gray-50 p-3 rounded-lg">
                {certificate.additionalConclusionStatement}
              </p>
            </div>
          )}

          {certificate.conclusionStatements.length === 0 && !certificate.additionalConclusionStatement && (
            <p className="text-gray-500 text-xs">No conclusion statements added.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Feedback History - Grouped by Revision */}
      {(feedbacks.length > 0 || customerFeedback || (internalRequests && internalRequests.length > 0)) && (
        <FeedbackTimeline
          feedbacks={feedbacks}
          currentRevision={certificate.currentRevision}
          title="Feedback History"
          groupBySection={true}
          showRevisionTransition={true}
          customerFeedback={customerFeedback}
          internalRequests={internalRequests}
        />
      )}

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
        certificateId={certificate.id}
        parameters={readingImagesModal.parameters}
        isLoading={readingImagesModal.isLoading}
        error={readingImagesModal.error}
      />
    </div>
  )
}

// Unified component to show section feedback chain based on certificate status
// Chain: Customer (purple) → Reviewer (orange) → Engineer (blue)
// Shows feedback up to current point in workflow
function SectionFeedbackChain({
  customerFeedback,
  feedbacks,
  sectionId,
  currentRevision,
  certificateStatus,
}: {
  customerFeedback: CustomerFeedback | null | undefined
  feedbacks: Feedback[]
  sectionId: string
  currentRevision: number
  certificateStatus: string
}) {
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get customer feedback for this section
  const customerSectionFeedback = customerFeedback?.sectionFeedbacks?.find(
    (sf) => sf.section === sectionId
  )

  // Get reviewer feedback for this section - filter by current revision
  const reviewerRequests = feedbacks.filter(
    (f) => f.targetSection === sectionId &&
           f.comment &&
           isRevisionRequest(f.feedbackType) &&
           f.revisionNumber === currentRevision
  )
  const latestReviewerRequest = reviewerRequests
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]

  // Get engineer response for this section - filter by current revision
  const engineerResponse = latestReviewerRequest
    ? feedbacks
        .filter(f => isAssigneeResponse(f.feedbackType) &&
                     f.targetSection === sectionId &&
                     f.revisionNumber === currentRevision)
        .filter(f => new Date(f.createdAt).getTime() > new Date(latestReviewerRequest.createdAt).getTime())
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0]
    : undefined

  // Determine what to show based on status
  const showCustomer = customerSectionFeedback && (
    certificateStatus === 'CUSTOMER_REVISION_REQUIRED' ||
    certificateStatus === 'REVISION_REQUIRED' ||
    certificateStatus === 'PENDING_REVIEW' ||
    certificateStatus === 'PENDING_REVIEW'
  )

  const showReviewer = latestReviewerRequest && (
    certificateStatus === 'REVISION_REQUIRED' ||
    certificateStatus === 'PENDING_REVIEW' ||
    certificateStatus === 'PENDING_REVIEW'
  )

  const showEngineer = engineerResponse && (
    certificateStatus === 'PENDING_REVIEW' ||
    certificateStatus === 'PENDING_REVIEW'
  )

  // If there's no feedback in the chain, check for non-customer-initiated reviewer feedback
  const showReviewerOnly = !customerSectionFeedback && latestReviewerRequest && (
    certificateStatus === 'REVISION_REQUIRED' ||
    certificateStatus === 'PENDING_REVIEW' ||
    certificateStatus === 'PENDING_REVIEW'
  )

  const showEngineerOnly = !customerSectionFeedback && engineerResponse && (
    certificateStatus === 'PENDING_REVIEW' ||
    certificateStatus === 'PENDING_REVIEW'
  )

  // Nothing to show
  if (!showCustomer && !showReviewer && !showEngineer && !showReviewerOnly) {
    return null
  }

  // Determine waiting state
  const isWaitingForReviewer = showCustomer && !showReviewer && certificateStatus === 'CUSTOMER_REVISION_REQUIRED'
  const isWaitingForEngineer = (showReviewer || showReviewerOnly) && !showEngineer && !showEngineerOnly && certificateStatus === 'REVISION_REQUIRED'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden mb-4">
      {/* Header */}
      <div className="px-4 py-2 border-b bg-slate-100 border-slate-200">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
          Section Feedback (Latest)
        </span>
      </div>

      {/* Content */}
      <div className="p-3 space-y-2">
        {/* Customer Feedback (purple) */}
        {showCustomer && customerFeedback && (
          <div className="bg-white rounded-lg border-l-4 border-purple-400 p-3">
            <div className="flex items-start gap-2">
              <div className="size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-purple-100 text-purple-700">
                {(customerFeedback.customerName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-xs">
                    {customerFeedback.customerName || 'Customer'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">
                    Customer
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(customerFeedback.requestedAt)}
                  </span>
                </div>
                <p className="text-slate-700 text-xs whitespace-pre-wrap">
                  {customerSectionFeedback?.comment}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Reviewer Feedback (orange) */}
        {(showReviewer || showReviewerOnly) && latestReviewerRequest && (
          <div className="bg-white rounded-lg border-l-4 border-orange-400 p-3">
            <div className="flex items-start gap-2">
              <div className="size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-orange-100 text-orange-700">
                {(latestReviewerRequest.user.name || 'R').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-xs">
                    {latestReviewerRequest.user.name || 'Reviewer'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                    Reviewer
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(latestReviewerRequest.createdAt)}
                  </span>
                </div>
                <p className="text-slate-700 text-xs whitespace-pre-wrap">
                  {latestReviewerRequest.comment}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Engineer Response (blue) */}
        {(showEngineer || showEngineerOnly) && engineerResponse && (
          <div className="bg-white rounded-lg border-l-4 border-blue-400 p-3">
            <div className="flex items-start gap-2">
              <div className="size-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold bg-blue-100 text-blue-700">
                {(engineerResponse.user.name || 'E').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-slate-900 text-xs">
                    {engineerResponse.user.name || 'Engineer'}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                    Engineer
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {formatDateTime(engineerResponse.createdAt)}
                  </span>
                </div>
                <p className="text-slate-700 text-xs whitespace-pre-wrap">
                  {engineerResponse.comment}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Waiting indicators */}
        {isWaitingForReviewer && (
          <div className="bg-slate-50 rounded-lg border border-dashed border-slate-300 p-3 text-center">
            <p className="text-xs text-slate-500 italic">
              Awaiting your response...
            </p>
          </div>
        )}

        {isWaitingForEngineer && (
          <div className="bg-slate-50 rounded-lg border border-dashed border-slate-300 p-3 text-center">
            <p className="text-xs text-slate-500 italic">
              Awaiting engineer response...
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
