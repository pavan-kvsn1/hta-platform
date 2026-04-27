'use client'

import { useMemo, useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Info, Camera, ImageIcon } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
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
  CalibrationResult,
  ACCURACY_TYPE_CONFIG,
  AccuracyType as _AccuracyType,
} from '@/lib/stores/certificate-store'
import { cn } from '@/lib/utils'
import { useCertificateImages } from '@/lib/hooks/useCertificateImages'
import { ReadingImageModal, ReadingImage } from './ReadingImageModal'

const FORMULA_OPTIONS = [
  { value: 'A-B', label: 'A - B' },
  { value: 'B-A', label: 'B - A' },
]

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
function formatWithPrecision(value: number | null, precision: number): string {
  if (value === null) return '—'
  return value.toFixed(precision)
}

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
function getPrecisionViolation(
  value: string,
  requiredPrecision: number
): { isViolation: boolean; actualDecimals: number; message: string; type: 'too_few' | 'too_many' | 'none' } {
  if (!value || value.trim() === '') {
    return { isViolation: false, actualDecimals: 0, message: '', type: 'none' }
  }

  const numValue = parseFloat(value)
  if (isNaN(numValue)) {
    return { isViolation: false, actualDecimals: 0, message: '', type: 'none' }
  }

  const decimalIndex = value.indexOf('.')

  // Case 1: No decimals required but value has decimals
  if (requiredPrecision === 0) {
    if (decimalIndex !== -1) {
      const actualDecimals = value.substring(decimalIndex + 1).length
      return {
        isViolation: true,
        actualDecimals,
        message: `Value should be a whole number (no decimals), but has ${actualDecimals}`,
        type: 'too_many'
      }
    }
    return { isViolation: false, actualDecimals: 0, message: '', type: 'none' }
  }

  // Case 2: Decimals required but value has none
  if (decimalIndex === -1) {
    return {
      isViolation: true,
      actualDecimals: 0,
      message: `Value needs ${requiredPrecision} decimal${requiredPrecision > 1 ? 's' : ''} (e.g., ${numValue.toFixed(requiredPrecision)})`,
      type: 'too_few'
    }
  }

  const actualDecimals = value.substring(decimalIndex + 1).length

  // Case 3: Too few decimals
  if (actualDecimals < requiredPrecision) {
    return {
      isViolation: true,
      actualDecimals,
      message: `Value has ${actualDecimals} decimal${actualDecimals !== 1 ? 's' : ''}, but needs ${requiredPrecision} (e.g., ${numValue.toFixed(requiredPrecision)})`,
      type: 'too_few'
    }
  }

  // Case 4: Too many decimals
  if (actualDecimals > requiredPrecision) {
    return {
      isViolation: true,
      actualDecimals,
      message: `Value has ${actualDecimals} decimals, but least count allows only ${requiredPrecision}`,
      type: 'too_many'
    }
  }

  return { isViolation: false, actualDecimals, message: '', type: 'none' }
}

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
  onResultChange: (resultIndex: number, result: CalibrationResult) => void
  onPointCountChange: (count: number) => void
  onParameterUpdate: (parameter: Parameter) => void
  certificateId: string | null
  getReadingImages: (parameterIndex: number, pointNumber: number) => {
    uuc: ReadingImage | null
    master: ReadingImage | null
  }
  onOpenImageModal: (parameterIndex: number, pointNumber: number) => void
  disabled?: boolean
}

function ResultsTable({
  parameter,
  parameterIndex,
  onResultChange,
  onPointCountChange,
  onParameterUpdate,
  certificateId: _certificateId,
  getReadingImages,
  onOpenImageModal,
  disabled = false,
}: ResultsTableProps) {
  // Count out-of-limit points
  const outOfLimitCount = parameter.results.filter((r) => r.isOutOfLimit).length
  const allWithinLimits = outOfLimitCount === 0 && parameter.results.some(r => r.errorObserved !== null)

  // Get accuracy type config
  const accuracyTypeConfig = ACCURACY_TYPE_CONFIG[parameter.accuracyType]

  // Validate if standard reading is within operating range
  const validateOperatingRange = (value: string): { isValid: boolean; message: string | null } => {
    if (!value || value.trim() === '') return { isValid: true, message: null }

    const numValue = parseFloat(value)
    if (isNaN(numValue)) return { isValid: true, message: null }

    const opMin = parseFloat(parameter.operatingMin)
    const opMax = parseFloat(parameter.operatingMax)

    // If operating range is not defined, skip validation
    if (isNaN(opMin) && isNaN(opMax)) return { isValid: true, message: null }

    if (!isNaN(opMin) && numValue < opMin) {
      return { isValid: false, message: `Below operating min (${parameter.operatingMin} ${parameter.parameterUnit})` }
    }

    if (!isNaN(opMax) && numValue > opMax) {
      return { isValid: false, message: `Exceeds operating max (${parameter.operatingMax} ${parameter.parameterUnit})` }
    }

    return { isValid: true, message: null }
  }

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
    let count = 0
    parameter.results.forEach(result => {
      const standardReading = parseFloat(result.standardReading)
      const { precision } = !isNaN(standardReading)
        ? getLeastCountInfo(parameter, standardReading)
        : { precision: getDefaultPrecision(parameter) }

      // Check standard reading
      if (!validatePrecision(result.standardReading, precision)) count++
      // Check UUC reading
      if (!validatePrecision(result.beforeAdjustment, precision)) count++
      // Check after adjustment if shown
      if (parameter.showAfterAdjustment && !validatePrecision(result.afterAdjustment, precision)) count++
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

  const handleInputChange = (
    resultIndex: number,
    field: keyof CalibrationResult,
    value: string
  ) => {
    const result = parameter.results[resultIndex]
    onResultChange(resultIndex, { ...result, [field]: value })
  }

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
            {/* Formula Select */}
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-500 uppercase text-[10px]">Formula:</span>
              <Select
                value={parameter.errorFormula}
                onValueChange={(value) =>
                  onParameterUpdate({ ...parameter, errorFormula: value })
                }
              >
                <SelectTrigger className="text-[10px] rounded-lg border-slate-300 py-1 font-bold w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORMULA_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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

            {/* Show After Adjustment Toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={parameter.showAfterAdjustment}
                onCheckedChange={(checked) =>
                  onParameterUpdate({ ...parameter, showAfterAdjustment: !!checked })
                }
                className="size-4"
              />
              <span className="font-bold text-slate-500 uppercase text-[10px]">
                Show After Adjustment
              </span>
            </label>
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/50 border-b border-slate-300 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-6 py-3 text-left w-16">Sl.</th>
              <th className="px-6 py-3 text-left">Std. Reading (A)</th>
              <th className="px-6 py-3 text-left">UUC Reading (B)</th>
              {parameter.showAfterAdjustment && (
                <th className="px-6 py-3 text-left">After Adj. (C)</th>
              )}
              <th className="px-6 py-3 text-left">Error Observed</th>
              <th className="px-6 py-3 text-left">Limit</th>
              <th className="px-6 py-3 text-center w-20">Status</th>
              <th className="px-3 py-3 text-center w-12">Photo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {parameter.results.map((result, resultIndex) => {
              const standardReading = parseFloat(result.standardReading)
              const hasStandardReading = !isNaN(standardReading)

              // Get limit info
              const { limit, binIndex } = hasStandardReading
                ? calculateDisplayLimit(parameter, standardReading)
                : { limit: null, binIndex: null }

              // Get precision info based on standard reading (for binned) or default
              const { precision, binIndex: precisionBinIndex } = hasStandardReading
                ? getLeastCountInfo(parameter, standardReading)
                : { precision: defaultPrecision, binIndex: null }

              const step = getStepFromPrecision(precision)

              // Determine which bin index to show (use limit's bin if available, otherwise precision's)
              const displayBinIndex = binIndex !== null ? binIndex : precisionBinIndex

              // Check precision violations for each field
              const stdViolation = getPrecisionViolation(result.standardReading, precision)
              const uucViolation = getPrecisionViolation(result.beforeAdjustment, precision)
              const afterViolation = getPrecisionViolation(result.afterAdjustment, precision)

              // Check operating range violation for standard reading
              const operatingRangeViolation = validateOperatingRange(result.standardReading)

              return (
                <tr
                  key={result.id}
                  className={cn(result.isOutOfLimit && 'bg-red-50')}
                >
                  <td className="px-6 py-4 font-bold text-slate-400">
                    {String(result.pointNumber).padStart(2, '0')}
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <Input
                        type="number"
                        step={step}
                        value={result.standardReading}
                        onChange={(e) =>
                          handleInputChange(resultIndex, 'standardReading', e.target.value)
                        }
                        placeholder={`0.${'0'.repeat(precision)}`}
                        className={cn(
                          "w-full max-w-[140px] rounded-lg font-semibold",
                          !operatingRangeViolation.isValid
                            ? "border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-200"
                            : stdViolation.isViolation
                            ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-200"
                            : "border-slate-300"
                        )}
                        title={!operatingRangeViolation.isValid ? operatingRangeViolation.message ?? undefined : stdViolation.isViolation ? stdViolation.message : undefined}
                      />
                      {!operatingRangeViolation.isValid ? (
                        <div className="absolute -top-1 -right-1">
                          <span className="flex size-4 items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold">
                            !
                          </span>
                        </div>
                      ) : stdViolation.isViolation && (
                        <div className="absolute -top-1 -right-1">
                          <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-white text-[8px] font-bold">
                            !
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <Input
                        type="number"
                        step={step}
                        value={result.beforeAdjustment}
                        onChange={(e) =>
                          handleInputChange(resultIndex, 'beforeAdjustment', e.target.value)
                        }
                        placeholder={`0.${'0'.repeat(precision)}`}
                        className={cn(
                          "w-full max-w-[140px] rounded-lg font-semibold",
                          uucViolation.isViolation
                            ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-200"
                            : "border-slate-300"
                        )}
                        title={uucViolation.isViolation ? uucViolation.message : undefined}
                      />
                      {uucViolation.isViolation && (
                        <div className="absolute -top-1 -right-1">
                          <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-white text-[8px] font-bold">
                            !
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                  {parameter.showAfterAdjustment && (
                    <td className="px-6 py-4">
                      <div className="relative">
                        <Input
                          type="number"
                          step={step}
                          value={result.afterAdjustment}
                          onChange={(e) =>
                            handleInputChange(resultIndex, 'afterAdjustment', e.target.value)
                          }
                          placeholder={`0.${'0'.repeat(precision)}`}
                          className={cn(
                            "w-full max-w-[140px] rounded-lg font-semibold",
                            afterViolation.isViolation
                              ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-200"
                              : "border-slate-300"
                          )}
                          title={afterViolation.isViolation ? afterViolation.message : undefined}
                        />
                        {afterViolation.isViolation && (
                          <div className="absolute -top-1 -right-1">
                            <span className="flex size-4 items-center justify-center rounded-full bg-amber-400 text-white text-[8px] font-bold">
                              !
                            </span>
                          </div>
                        )}
                      </div>
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        'font-black',
                        result.isOutOfLimit ? 'text-red-600' : 'text-slate-700'
                      )}
                    >
                      {result.errorObserved !== null
                        ? formatWithPrecision(result.errorObserved, precision)
                        : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-500 font-medium text-xs">
                      {limit !== null ? `±${formatWithPrecision(limit, precision).replace('-', '')}` : '—'}
                      {displayBinIndex !== null && (
                        <span className="text-[9px] text-slate-400 ml-1">(Bin {displayBinIndex + 1})</span>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {result.errorObserved !== null ? (
                      result.isOutOfLimit ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold uppercase">
                          <AlertTriangle className="size-3" />
                          Fail
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase">
                          <CheckCircle className="size-3" />
                          Pass
                        </span>
                      )
                    ) : (
                      <span className="text-slate-300 text-[10px]">—</span>
                    )}
                  </td>
                  <td className="px-3 py-4 text-center">
                    {(() => {
                      const readingImages = getReadingImages(parameterIndex, result.pointNumber)
                      const hasUuc = readingImages.uuc !== null
                      const hasMaster = readingImages.master !== null
                      const hasBoth = hasUuc && hasMaster
                      const hasOne = (hasUuc || hasMaster) && !hasBoth
                      const hasNone = !hasUuc && !hasMaster
                      return (
                        <button
                          type="button"
                          onClick={() => onOpenImageModal(parameterIndex, result.pointNumber)}
                          disabled={disabled}
                          className={cn(
                            "p-1.5 rounded-lg transition-colors",
                            hasBoth
                              ? "bg-green-100 text-green-600 hover:bg-green-200"
                              : hasOne
                              ? "bg-red-100 text-red-500 hover:bg-red-200"
                              : "bg-slate-100 text-slate-400 hover:bg-slate-200 hover:text-slate-600",
                            disabled && "opacity-50 cursor-not-allowed"
                          )}
                          title={hasBoth ? "View/edit photos" : hasOne ? "Missing one photo" : "Add photos"}
                        >
                          {hasNone ? (
                            <Camera className="size-4" />
                          ) : (
                            <ImageIcon className="size-4" />
                          )}
                        </button>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
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
  const { formData, certificateId, setResult, setPointCount, setParameter, saveDraft } = useCertificateStore()

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
            onResultChange={(resultIndex, result) =>
              setResult(parameterIndex, resultIndex, result)
            }
            onPointCountChange={(count) => setPointCount(parameterIndex, count)}
            onParameterUpdate={(param) => setParameter(parameterIndex, param)}
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
