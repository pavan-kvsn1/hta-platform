'use client'

import { useMemo, useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { ColumnSetup } from '@/components/forms/ColumnSetup'
import { DynamicResultsTable } from '@/components/forms/DynamicResultsTable'
import type { ErrorConfig, FieldDefinition } from '@/lib/certificate-fields'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormSection } from './FormSection'
import {
  useCertificateStore,
  Parameter,
  ACCURACY_TYPE_CONFIG,
  AccuracyType as _AccuracyType,
} from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'
import { useCertificateImages } from '@/lib/hooks/useCertificateImages'
import { ReadingImageModal, ReadingImage } from './ReadingImageModal'

const POINT_COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]

// Calculate decimal precision from least count value
// e.g., 0.1 → 1, 0.01 → 2, 0.001 → 3, 1 → 0, 0.5 → 1
function getPrecisionFromLeastCount(leastCount: string): number {
  if (!leastCount) return 2 // Default precision

  const value = parseFloat(leastCount)
  if (isNaN(value) || value <= 0) return 2

  // Count decimal places in the least count
  const str = leastCount.replace(/^-/, '') // Remove negative sign if any
  const decimalIndex = str.indexOf('.')

  if (decimalIndex === -1) {
    // No decimal point - check if it's a whole number
    return 0
  }

  // Count significant digits after decimal
  const afterDecimal = str.substring(decimalIndex + 1)
  // Remove trailing zeros for values like "0.10"
  const trimmed = afterDecimal.replace(/0+$/, '')

  // Return at least the number of decimal places shown
  return Math.max(trimmed.length, afterDecimal.length - afterDecimal.replace(/0+$/, '').length + trimmed.length)
}

// Get the step value for input based on precision
function getStepFromPrecision(precision: number): string {
  if (precision <= 0) return '1'
  return (1 / Math.pow(10, precision)).toString()
}

// Format a number with specified precision

// Get least count and precision for a reading (considering binning)
function getLeastCountInfo(
  parameter: Parameter,
  standardReading: number
): { leastCount: string; precision: number; binIndex: number | null } {
  // For binned parameters, find the appropriate bin
  if (parameter.requiresBinning && parameter.bins.length > 0) {
    for (let i = 0; i < parameter.bins.length; i++) {
      const bin = parameter.bins[i]
      const binMin = parseFloat(bin.binMin)
      const binMax = parseFloat(bin.binMax)

      if (!isNaN(binMin) && !isNaN(binMax) && standardReading >= binMin && standardReading <= binMax) {
        const precision = getPrecisionFromLeastCount(bin.leastCount)
        return { leastCount: bin.leastCount, precision, binIndex: i }
      }
    }
    // If no bin matches but we have bins, use the first bin's least count as default
    if (parameter.bins[0]?.leastCount) {
      return {
        leastCount: parameter.bins[0].leastCount,
        precision: getPrecisionFromLeastCount(parameter.bins[0].leastCount),
        binIndex: null
      }
    }
  }

  // Non-binned parameter - use parameter's least count
  const precision = getPrecisionFromLeastCount(parameter.leastCountValue)
  return { leastCount: parameter.leastCountValue, precision, binIndex: null }
}

// Get default precision for parameter (when no reading entered yet)
function getDefaultPrecision(parameter: Parameter): number {
  if (parameter.requiresBinning && parameter.bins.length > 0) {
    // Use the smallest precision (most decimal places) among all bins
    let maxPrecision = 0
    parameter.bins.forEach(bin => {
      const precision = getPrecisionFromLeastCount(bin.leastCount)
      maxPrecision = Math.max(maxPrecision, precision)
    })
    return maxPrecision || 2
  }
  return getPrecisionFromLeastCount(parameter.leastCountValue)
}

// Check if a value respects the required precision (least count)
// Returns true if valid, false if value doesn't match required decimal places
function validatePrecision(value: string, requiredPrecision: number): boolean {
  if (!value || value.trim() === '') return true // Empty is valid

  const numValue = parseFloat(value)
  if (isNaN(numValue)) return true // Non-numeric is handled elsewhere

  // Count actual decimal places in the input
  const decimalIndex = value.indexOf('.')

  if (requiredPrecision === 0) {
    // No decimals required - should not have decimal point
    return decimalIndex === -1
  }

  if (decimalIndex === -1) {
    // No decimal point but precision required - invalid
    return false
  }

  const actualDecimals = value.substring(decimalIndex + 1).length

  // Value is valid if it has exactly the required precision
  return actualDecimals === requiredPrecision
}

// Get precision violation info for a value

// Calculate error limit based on accuracy type (client-side helper for display)
function calculateDisplayLimit(
  parameter: Parameter,
  standardReading: number
): { limit: number | null; binIndex: number | null } {
  const accuracyType = parameter.accuracyType

  // For binned parameters, find the appropriate bin
  if (parameter.requiresBinning && parameter.bins.length > 0) {
    for (let i = 0; i < parameter.bins.length; i++) {
      const bin = parameter.bins[i]
      const binMin = parseFloat(bin.binMin)
      const binMax = parseFloat(bin.binMax)
      const binAccuracy = parseFloat(bin.accuracy.replace('±', ''))

      if (!isNaN(binMin) && !isNaN(binMax) && standardReading >= binMin && standardReading <= binMax) {
        if (isNaN(binAccuracy)) {
          return { limit: null, binIndex: i }
        }

        let limit: number
        switch (accuracyType) {
          case 'PERCENT_READING':
            // Use absolute value of reading for percentage calculation
            limit = (binAccuracy * Math.abs(standardReading)) / 100
            break
          case 'PERCENT_SCALE': {
            const rangeMin = parseFloat(parameter.rangeMin)
            const rangeMax = parseFloat(parameter.rangeMax)
            if (isNaN(rangeMin) || isNaN(rangeMax)) {
              limit = binAccuracy
            } else {
              limit = (binAccuracy * Math.abs(rangeMax - rangeMin)) / 100
            }
            break
          }
          case 'ABSOLUTE':
          default:
            limit = binAccuracy
        }
        return { limit, binIndex: i }
      }
    }
    return { limit: null, binIndex: null }
  }

  // Non-binned parameter
  const accuracy = parseFloat(parameter.accuracyValue.replace('±', ''))
  if (isNaN(accuracy)) {
    return { limit: null, binIndex: null }
  }

  let limit: number
  switch (accuracyType) {
    case 'PERCENT_READING':
      // Use absolute value of reading for percentage calculation
      limit = (accuracy * Math.abs(standardReading)) / 100
      break
    case 'PERCENT_SCALE': {
      const rangeMin = parseFloat(parameter.rangeMin)
      const rangeMax = parseFloat(parameter.rangeMax)
      if (isNaN(rangeMin) || isNaN(rangeMax)) {
        limit = accuracy
      } else {
        limit = (accuracy * Math.abs(rangeMax - rangeMin)) / 100
      }
      break
    }
    case 'ABSOLUTE':
    default:
      limit = accuracy
  }

  return { limit, binIndex: null }
}

// Format limit for display
function _formatLimit(limit: number | null, _unit: string): string {
  if (limit === null) return '—'
  return `±${Math.round(limit * 1000) / 1000}`
}

interface ResultsTableProps {
  parameter: Parameter
  parameterIndex: number
  onPointCountChange: (count: number) => void
  certificateId: string | null
  getReadingImages: (parameterIndex: number, pointNumber: number) => {
    uuc: ReadingImage | null
    master: ReadingImage | null
  }
  onOpenImageModal: (parameterIndex: number, pointNumber: number) => void
  disabled?: boolean

  // Section 05 dynamic fields
  onTableNameChange: (tableName: string) => void
  onSchemaChange: (fields: FieldDefinition[], errorConfig: ErrorConfig) => void
  onRowValueChange: (rowIndex: number, fieldId: string, value: string) => void
  onAddRow: () => void
  onRemoveRow: (rowIndex: number) => void
}

function ResultsTable({
  parameter,
  parameterIndex,
  onPointCountChange,
  certificateId: _certificateId,
  getReadingImages,
  onOpenImageModal,
  disabled = false,
  onTableNameChange,
  onSchemaChange,
  onRowValueChange,
  onAddRow,
  onRemoveRow,
}: ResultsTableProps) {
  // Count out-of-limit points
  // Counts come from resultRows, which is the source of truth once a parameter has a
  // field schema. `results` is a projection kept in step for the PDF and API paths.
  const outOfLimitCount = parameter.resultRows.filter((r) => r.isOutOfLimit).length
  const allWithinLimits =
    outOfLimitCount === 0 && parameter.resultRows.some((r) => r.errorObserved !== null)

  // Get accuracy type config
  const accuracyTypeConfig = ACCURACY_TYPE_CONFIG[parameter.accuracyType]

  // Validate if standard reading is within operating range

  // Count operating range violations
  const operatingRangeViolations = useMemo(() => {
    let count = 0
    const opMin = parseFloat(parameter.operatingMin)
    const opMax = parseFloat(parameter.operatingMax)

    // If operating range is not defined, no violations possible
    if (isNaN(opMin) && isNaN(opMax)) return 0

    parameter.results.forEach(result => {
      const value = result.standardReading
      if (!value || value.trim() === '') return

      const numValue = parseFloat(value)
      if (isNaN(numValue)) return

      if ((!isNaN(opMin) && numValue < opMin) || (!isNaN(opMax) && numValue > opMax)) {
        count++
      }
    })
    return count
  }, [parameter])

  // Count precision violations
  const precisionViolations = useMemo(() => {
    // Covers every numeric column, not just the two the legacy shape had, so an extra
    // Master or UUC field the engineer adds is checked too.
    const numericFields = parameter.fieldDefinitions.filter((f) => f.type === 'numeric')
    let count = 0
    parameter.resultRows.forEach((row) => {
      const masterRaw = row.values[parameter.errorConfig.masterFieldId] ?? ''
      const masterReading = parseFloat(masterRaw)
      const { precision } = !isNaN(masterReading)
        ? getLeastCountInfo(parameter, masterReading)
        : { precision: getDefaultPrecision(parameter) }

      numericFields.forEach((field) => {
        if (!validatePrecision(row.values[field.id] ?? '', precision)) count++
      })
    })
    return count
  }, [parameter])

  // Calculate base limit for display (for ABSOLUTE and PERCENT_SCALE which are constant)
  const baseLimit = useMemo(() => {
    if (parameter.accuracyType === 'PERCENT_READING') return null
    if (parameter.requiresBinning) return null

    const accuracy = parseFloat(parameter.accuracyValue.replace('±', ''))
    if (isNaN(accuracy)) return null

    if (parameter.accuracyType === 'ABSOLUTE') {
      return accuracy
    }

    // PERCENT_SCALE
    const rangeMin = parseFloat(parameter.rangeMin)
    const rangeMax = parseFloat(parameter.rangeMax)
    if (isNaN(rangeMin) || isNaN(rangeMax)) return accuracy
    return (accuracy * (rangeMax - rangeMin)) / 100
  }, [parameter])

  // Get default precision for the parameter
  const defaultPrecision = useMemo(() => getDefaultPrecision(parameter), [parameter])
  const _defaultStep = getStepFromPrecision(defaultPrecision)


  return (
    <div className="bg-white rounded-2xl border border-slate-300 overflow-hidden">
      {/* Table Header */}
      <div className="bg-slate-50 px-6 py-4 border-b border-slate-300 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-wider">
              Parameter {parameterIndex + 1}: {parameter.parameterName || 'Untitled'}
            </h3>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-[10px] text-primary font-bold">
                Accuracy: {parameter.accuracyValue ? `±${parameter.accuracyValue.replace('±', '')}` : 'N/A'}
                {parameter.accuracyType !== 'ABSOLUTE' && (
                  <span className="text-slate-500">
                    {parameter.accuracyType === 'PERCENT_READING' ? '%Rdg' : '%Scale'}
                  </span>
                )}
                {parameter.accuracyType === 'ABSOLUTE' && parameter.parameterUnit && (
                  <span className="text-slate-500"> {parameter.parameterUnit}</span>
                )}
              </span>
              <span className="text-slate-300">|</span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider",
                  parameter.accuracyType === 'ABSOLUTE' && "bg-blue-100 text-blue-700",
                  parameter.accuracyType === 'PERCENT_READING' && "bg-purple-100 text-purple-700",
                  parameter.accuracyType === 'PERCENT_SCALE' && "bg-amber-100 text-amber-700"
                )}
              >
                {accuracyTypeConfig.shortLabel}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-[10px] text-slate-600">
                <span className="font-bold">Least Count:</span>{' '}
                {parameter.requiresBinning ? 'Per bin' : (parameter.leastCountValue || 'N/A')}
                {!parameter.requiresBinning && parameter.parameterUnit && ` ${parameter.parameterUnit}`}
                <span className="text-slate-400 ml-1">
                  ({defaultPrecision} decimal{defaultPrecision !== 1 ? 's' : ''})
                </span>
              </span>
              {parameter.requiresBinning && (
                <>
                  <span className="text-slate-300">|</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-200 text-slate-700">
                    {parameter.bins.length} Bins
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-6 text-xs">
            {/* Points Select */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 uppercase text-[10px]">Points:</span>
              <Select
                value={String(parameter.results.length)}
                onValueChange={(value) => onPointCountChange(parseInt(value))}
              >
                <SelectTrigger className="text-[10px] rounded-lg border-slate-300 py-1 font-bold w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POINT_COUNT_OPTIONS.map((count) => (
                    <SelectItem key={count} value={String(count)}>
                      {count}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>
        </div>

        {/* Accuracy type explanation */}
        <div className="flex items-start gap-2 p-3 bg-slate-100/50 rounded-lg text-[11px] text-slate-600">
          <Info className="size-4 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">{accuracyTypeConfig.label}:</span>{' '}
            {accuracyTypeConfig.description}
            {baseLimit !== null && (
              <span className="font-bold text-primary ml-2">
                (Limit: ±{Math.round(baseLimit * 1000) / 1000} {parameter.parameterUnit})
              </span>
            )}
          </div>
        </div>

        {/* Operating range violation alert */}
        {operatingRangeViolations > 0 && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-800">
            <AlertTriangle className="size-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Operating Range Error:</span>{' '}
              {operatingRangeViolations} standard reading{operatingRangeViolations !== 1 ? 's are' : ' is'} outside the operating range.
              <span className="text-red-600 ml-1">
                (Operating range: {parameter.operatingMin || '—'} to {parameter.operatingMax || '—'} {parameter.parameterUnit})
              </span>
            </div>
          </div>
        )}

        {/* Precision violation alert */}
        {precisionViolations > 0 && (
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
            <AlertTriangle className="size-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Precision Warning:</span>{' '}
              {precisionViolations} reading{precisionViolations !== 1 ? 's have' : ' has'} more decimal places than the least count allows.
              <span className="text-amber-600 ml-1">
                (Expected: {defaultPrecision} decimal{defaultPrecision !== 1 ? 's' : ''} based on least count)
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Results Table */}
      {/* Table name + column schema (Section 05 dynamic fields) */}
      <div className="space-y-2 border-b border-slate-200 px-5 py-3">
        {/* Table name sits inline; it is one short field and does not warrant a block. */}
        <label className="flex items-center gap-3">
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Table Name
          </span>
          <input
            type="text"
            value={parameter.tableName}
            disabled={disabled}
            placeholder={`Calibration of ${parameter.parameterName || 'Parameter'}`}
            title="Heading for this table on the certificate PDF"
            onChange={(e) => onTableNameChange(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:bg-slate-50"
          />
        </label>

        <ColumnSetup
          fields={parameter.fieldDefinitions}
          errorConfig={parameter.errorConfig}
          parameterUnit={parameter.parameterUnit}
          disabled={disabled}
          onChange={onSchemaChange}
        />
      </div>

      <div className="p-3">
        <DynamicResultsTable
          fields={parameter.fieldDefinitions}
          rows={parameter.resultRows}
          precision={defaultPrecision}
          precisionFor={(_field, row) => {
            // The parameter section describes the UUC, so its least count - blanket or
            // per bin - is the UUC's resolution. Bins are picked by the row's reading,
            // so a binned parameter changes resolution across its range.
            //
            // The master has no least count on the certificate: it lives on the
            // capability profile in the master instrument registry and is not plumbed
            // through yet, so master columns follow the UUC's for now. That is a gap
            // to close, not a claim that the two resolutions are the same.
            const reading = Number(row.values[parameter.errorConfig.masterFieldId])
            return getLeastCountInfo(parameter, reading).precision
          }}
          disabled={disabled}
          onValueChange={onRowValueChange}
          onAddRow={onAddRow}
          onRemoveRow={onRemoveRow}
          getLimit={(row) => {
            const master = Number(row.values[parameter.errorConfig.masterFieldId])
            return calculateDisplayLimit(parameter, master)
          }}
          getReadingImages={(pointNumber) => getReadingImages(parameterIndex, pointNumber)}
          onOpenImages={(pointNumber) => onOpenImageModal(parameterIndex, pointNumber)}
        />
      </div>

      {/* Status Footer */}
      <div
        className={cn(
          'p-4 border-t border-slate-100 flex items-center justify-between',
          allWithinLimits ? 'bg-green-50/50' : outOfLimitCount > 0 ? 'bg-red-50/50' : 'bg-slate-50/50'
        )}
      >
        <div>
          {allWithinLimits ? (
            <p className="text-xs text-green-700 font-bold flex items-center gap-1">
              <CheckCircle className="size-4" /> All {parameter.results.length} points within accuracy limits
            </p>
          ) : outOfLimitCount > 0 ? (
            <p className="text-xs text-red-700 font-bold flex items-center gap-1">
              <AlertTriangle className="size-4" /> {outOfLimitCount} of {parameter.results.length} point(s) exceed accuracy limit
            </p>
          ) : (
            <p className="text-xs text-slate-500 font-medium">
              Enter readings to calculate errors
            </p>
          )}
        </div>
        <div className="text-[10px] text-slate-400 font-medium">
          Accuracy Type: {accuracyTypeConfig.label}
        </div>
      </div>
    </div>
  )
}

interface ResultsSectionProps {
  feedbackSlot?: React.ReactNode
  disabled?: boolean
  accordionStatus?: 'default' | 'locked' | 'unlocked' | 'pending'
  hasFeedback?: boolean
}

interface ImageModalState {
  isOpen: boolean
  parameterIndex: number
  pointNumber: number
}

export function ResultsSection({ feedbackSlot, disabled, accordionStatus, hasFeedback }: ResultsSectionProps = {}) {
  const {
    formData,
    certificateId,
    saveDraft,
    setTableName,
    setParameterSchema,
    setResultRowValue,
    addResultRow,
    removeResultRow,
    setResultRowCount,
  } = useCertificateStore()

  // Image modal state
  const [imageModal, setImageModal] = useState<ImageModalState>({
    isOpen: false,
    parameterIndex: 0,
    pointNumber: 1,
  })

  // Image management
  const {
    uploadImageWithId,
    deleteImage,
    getReadingImages,
    refreshWithId,
  } = useCertificateImages({
    certificateId,
  })

  // Auto-save as draft helper - returns the certificate ID
  const ensureCertificateSaved = useCallback(async (): Promise<string> => {
    if (certificateId) return certificateId

    const result = await saveDraft()
    if (!result.success) {
      throw new Error(result.error || 'Failed to save draft before uploading image')
    }
    // Get the new certificateId from the store
    const newCertId = useCertificateStore.getState().certificateId
    if (!newCertId) {
      throw new Error('Failed to get certificate ID after saving draft')
    }
    return newCertId
  }, [certificateId, saveDraft])

  // Open image modal
  const handleOpenImageModal = useCallback((parameterIndex: number, pointNumber: number) => {
    setImageModal({
      isOpen: true,
      parameterIndex,
      pointNumber,
    })
  }, [])

  // Close image modal
  const handleCloseImageModal = useCallback(() => {
    setImageModal((prev) => ({ ...prev, isOpen: false }))
  }, [])

  // Navigate between points in modal
  const handleNavigateModal = useCallback(
    (direction: 'prev' | 'next') => {
      setImageModal((prev) => {
        const parameter = formData.parameters[prev.parameterIndex]
        if (!parameter) return prev

        const totalPoints = parameter.results.length
        let newPointNumber = prev.pointNumber

        if (direction === 'prev' && prev.pointNumber > 1) {
          newPointNumber = prev.pointNumber - 1
        } else if (direction === 'next' && prev.pointNumber < totalPoints) {
          newPointNumber = prev.pointNumber + 1
        }

        return { ...prev, pointNumber: newPointNumber }
      })
    },
    [formData.parameters]
  )

  // Get reading images for modal
  const getReadingImagesForModal = useCallback(
    (parameterIndex: number, pointNumber: number) => {
      const images = getReadingImages(parameterIndex, pointNumber)
      return {
        uuc: images.uuc as ReadingImage | null,
        master: images.master as ReadingImage | null,
      }
    },
    [getReadingImages]
  )

  // Upload handlers - auto-save as draft if needed
  const handleUploadUuc = useCallback(
    async (file: File) => {
      const certId = await ensureCertificateSaved()
      await uploadImageWithId(certId, file, {
        imageType: 'READING_UUC',
        parameterIndex: imageModal.parameterIndex,
        pointNumber: imageModal.pointNumber,
      })
      await refreshWithId(certId)
    },
    [ensureCertificateSaved, uploadImageWithId, refreshWithId, imageModal.parameterIndex, imageModal.pointNumber]
  )

  const handleUploadMaster = useCallback(
    async (file: File) => {
      const certId = await ensureCertificateSaved()
      await uploadImageWithId(certId, file, {
        imageType: 'READING_MASTER',
        parameterIndex: imageModal.parameterIndex,
        pointNumber: imageModal.pointNumber,
      })
      await refreshWithId(certId)
    },
    [ensureCertificateSaved, uploadImageWithId, refreshWithId, imageModal.parameterIndex, imageModal.pointNumber]
  )

  // Delete handlers
  const handleDeleteUuc = useCallback(
    async (imageId: string) => {
      await deleteImage(imageId)
    },
    [deleteImage]
  )

  const handleDeleteMaster = useCallback(
    async (imageId: string) => {
      await deleteImage(imageId)
    },
    [deleteImage]
  )

  // Get current modal data
  const currentParameter = formData.parameters[imageModal.parameterIndex]
  const currentResult = currentParameter?.results.find(
    (r) => r.pointNumber === imageModal.pointNumber
  )
  const currentImages = getReadingImagesForModal(
    imageModal.parameterIndex,
    imageModal.pointNumber
  )

  return (
    <FormSection id="results" sectionNumber="Section 05" title="Calibration Results" feedbackSlot={feedbackSlot} disabled={disabled} accordionStatus={accordionStatus} hasFeedback={hasFeedback}>
      <div className="space-y-4 p-5 rounded-xl border border-slate-300 bg-section-inner">
        {formData.parameters.map((parameter, parameterIndex) => (
          <ResultsTable
            key={parameter.id}
            parameter={parameter}
            parameterIndex={parameterIndex}
            onPointCountChange={(count) => setResultRowCount(parameterIndex, count)}
            onTableNameChange={(name) => setTableName(parameterIndex, name)}
            onSchemaChange={(fields, errorConfig) =>
              setParameterSchema(parameterIndex, fields, errorConfig)
            }
            onRowValueChange={(rowIndex, fieldId, value) =>
              setResultRowValue(parameterIndex, rowIndex, fieldId, value)
            }
            onAddRow={() => addResultRow(parameterIndex)}
            onRemoveRow={(rowIndex) => removeResultRow(parameterIndex, rowIndex)}
            certificateId={certificateId}
            getReadingImages={getReadingImagesForModal}
            onOpenImageModal={handleOpenImageModal}
            disabled={disabled}
          />
        ))}

        {formData.parameters.length === 0 && (
          <div className="text-center py-10 text-slate-500">
            <p className="font-medium">No parameters defined.</p>
            <p className="text-sm mt-1">Add parameters in Section 2 to enter calibration results.</p>
          </div>
        )}
      </div>

      {/* Reading Image Modal */}
      {currentParameter && currentResult && (
        <ReadingImageModal
          isOpen={imageModal.isOpen}
          onClose={handleCloseImageModal}
          certificateId={certificateId || 'pending'}
          parameterIndex={imageModal.parameterIndex}
          parameterName={currentParameter.parameterName || `Parameter ${imageModal.parameterIndex + 1}`}
          pointNumber={imageModal.pointNumber}
          standardReading={currentResult.standardReading || '—'}
          uucReading={currentResult.beforeAdjustment || '—'}
          uucImage={currentImages.uuc}
          masterImage={currentImages.master}
          onUploadUuc={handleUploadUuc}
          onUploadMaster={handleUploadMaster}
          onDeleteUuc={handleDeleteUuc}
          onDeleteMaster={handleDeleteMaster}
          totalPoints={currentParameter.results.length}
          onNavigate={handleNavigateModal}
          disabled={disabled}
        />
      )}
    </FormSection>
  )
}
