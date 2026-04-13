'use client'

import { useState } from 'react'
import {
  AlertCircle,
  CheckCircle,
  User,
  Shield,
  Building2,
  Image as ImageIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { CollapsibleSection } from '@/components/certificate/CollapsibleSection'
import { InfoField } from '@/components/certificate/InfoField'
import { SignatureStatusCard } from '@/components/certificate/SignatureStatusCard'
import { MasterInstrumentsTable } from '@/components/certificate/MasterInstrumentsTable'
import { CalibrationResultsTable } from '@/components/certificate/CalibrationResultsTable'
import { getConclusionText } from '@/components/pdf/pdf-utils'
import { CALIBRATION_STATUS_OPTIONS } from '@/components/forms/RemarksSection'
import {
  ImageGalleryModal,
  ReadingImagesViewModal,
  type GalleryImage,
  type ParameterReadingImages,
} from '@/components/certificate'
import type { CertificateData, Signature } from './CustomerCertReviewClient'

interface CustomerCertificateContentProps {
  certificate: CertificateData
  signatures: Signature[]
}

export function CustomerCertificateContent({
  certificate,
  signatures,
}: CustomerCertificateContentProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    signatures: true,
    section1: true,
    section2: true,
    section3: true,
    section4: true,
    section5: true,
    section6: true,
    section7: true,
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

  const [masterImagesModal, setMasterImagesModal] = useState<{
    isOpen: boolean
    images: GalleryImage[]
    isLoading: boolean
    error: string | null
  }>({ isOpen: false, images: [], isLoading: false, error: null })

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  // Fetch UUC images
  const fetchUucImages = async () => {
    setUucImagesModal({ isOpen: true, images: [], isLoading: true, error: null })
    try {
      const response = await fetch(`/api/certificates/${certificate.id}/images?type=UUC`)
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
        fetch(`/api/certificates/${certificate.id}/images?type=READING_UUC`),
        fetch(`/api/certificates/${certificate.id}/images?type=READING_MASTER`),
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

  // Fetch master instrument images
  const fetchMasterImages = async () => {
    setMasterImagesModal({ isOpen: true, images: [], isLoading: true, error: null })
    try {
      const response = await fetch(`/api/certificates/${certificate.id}/images?type=MASTER_INSTRUMENT`)
      if (!response.ok) throw new Error('Failed to fetch images')
      const data = await response.json()
      setMasterImagesModal({
        isOpen: true,
        images: data.images || [],
        isLoading: false,
        error: null,
      })
    } catch (err) {
      setMasterImagesModal({
        isOpen: true,
        images: [],
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

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
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

  // Get signature by type
  const getSignature = (type: string) => signatures.find(s => s.signerType === type)
  const assigneeSignature = getSignature('ASSIGNEE')
  const reviewerSignature = getSignature('REVIEWER')
  const customerSignature = getSignature('CUSTOMER')

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

      {/* Signature Status Section */}
      <CollapsibleSection
        title="Signature Status"
        isExpanded={expandedSections.signatures}
        onToggle={() => toggleSection('signatures')}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Assignee Signature */}
          <SignatureStatusCard
            title="Engineer"
            icon={User}
            signature={assigneeSignature}
          />

          {/* Reviewer Signature */}
          <SignatureStatusCard
            title="Reviewer"
            icon={Shield}
            signature={reviewerSignature}
          />

          {/* Customer Signature */}
          <SignatureStatusCard
            title="Customer"
            icon={Building2}
            signature={customerSignature}
            isYours
          />
        </div>
      </CollapsibleSection>

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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoField label="Customer Name" value={certificate.customerName} />
              <InfoField label="Customer Address" value={certificate.customerAddress} />
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
        actionButton={
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              fetchMasterImages()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary bg-white/90 border border-white/20 rounded-lg hover:bg-white transition-colors"
          >
            <ImageIcon className="size-3.5" />
            View Images
          </button>
        }
      >
        <MasterInstrumentsTable instruments={certificate.masterInstruments} />
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

      <ImageGalleryModal
        isOpen={masterImagesModal.isOpen}
        onClose={() => setMasterImagesModal({ ...masterImagesModal, isOpen: false })}
        title="Master Instrument Images"
        images={masterImagesModal.images}
        isLoading={masterImagesModal.isLoading}
        error={masterImagesModal.error}
      />
    </div>
  )
}

