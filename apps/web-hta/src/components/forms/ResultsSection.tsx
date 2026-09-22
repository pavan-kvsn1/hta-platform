'use client'

import { useMemo, useState, useCallback } from 'react'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { ColumnSetup } from '@/components/forms/ColumnSetup'
import { DynamicResultsTable } from '@/components/forms/DynamicResultsTable'
import type {
  CalibrationResultRow,
  ErrorConfig,
  FieldDefinition,
} from '@/lib/certificate/fields'
import { needsResolution, pointsOutsideRange, rangeCoverage } from '@/lib/certificate/fields'
import {
  instrumentResolutions,
  masterBucketsFor,
  resolutionForField,
  stepViolationSentence,
  stepViolations,
} from '@/lib/certificate/step-violations'

/** A range bound as it reads, without a float's tail. */
const bound = (value: number) => String(Number(value.toFixed(6)))
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
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'
import { precisionOf, type ReadingResolution } from '@/lib/utils/reading-resolution'
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
  /**
   * The capability the master was declared against, resolved once.
   *
   * The master's resolution is not on the certificate - it lives on the profile in the
   * registry, and until this was plumbed through the master's columns borrowed the
   * UUC's. An empty list means no capability was declared, which the helper reports as
   * a different answer from a bucket that states no least count.
   */
  const getUnitByLegacyId = useMasterInstrumentStore((state) => state.getUnitByLegacyId)
  const masterEntries = useCertificateStore((state) => state.formData.masterInstruments)

  /**
   * The bands of every master on this parameter, pooled.
   *
   * Built by the shared helper, which the finalize checklist also uses: the table shows
   * the engineer an off-step reading while there is still something to type, and the
   * checklist refuses to send the certificate while one stands. Two implementations of
   * the same rule would drift, and the gate would end up on the wrong side of the drift.
   */
  const masterBuckets = useMemo(
    () => masterBucketsFor(parameter, masterEntries, getUnitByLegacyId),
    [parameter, masterEntries, getUnitByLegacyId],
  )

  /** What each instrument resolves to at a row's point of the range. */
  const resolutionsFor = useCallback(
    (row: { values: Record<string, string> }) =>
      instrumentResolutions(row, parameter, masterBuckets),
    [masterBuckets, parameter],
  )

  /** The step one column's figures move in - its own where it declared one. */
  const resolutionFor = useCallback(
    (field: FieldDefinition, row: { values: Record<string, string> }): ReadingResolution =>
      resolutionForField(field, row, parameter, masterBuckets),
    [masterBuckets, parameter],
  )

  // Count out-of-limit points
  // Counts come from resultRows, which is the source of truth once a parameter has a
  // field schema. `results` is a projection kept in step for the PDF and API paths.
  const outOfLimitCount = parameter.resultRows.filter((r) => r.isOutOfLimit).length
  const allWithinLimits =
    outOfLimitCount === 0 && parameter.resultRows.some((r) => r.errorObserved !== null)

  // Get accuracy type config
  const accuracyTypeConfig = ACCURACY_TYPE_CONFIG[parameter.accuracyType]

  /**
   * Points read outside the range the unit is being calibrated over.
   *
   * Every point has to sit inside it: the range is what the certificate claims to speak
   * for, and a reading past its end was taken somewhere the certificate says nothing
   * about. This used to ask the operating range instead, which failed any certificate
   * whose points sensibly spanned the whole scale - the operating range asks something
   * quite different, and only of one point.
   */
  const outsideRange = useMemo(
    () =>
      pointsOutsideRange(
        parameter,
        parameter.resultRows,
        parameter.fieldDefinitions,
        parameter.errorConfig,
      ),
    [parameter],
  )

  /**
   * Readings that no instrument could have shown.
   *
   * A least count is the size of one division, so an instrument stepping in 0.05 shows
   * 49.70 and 49.75 and nothing between them. A stored 49.72 is a typing error or a
   * wrong least count, and either way it is not a reading.
   *
   * Counted per column against that column's own step - its declared one, or the step
   * of the instrument it belongs to. Judged against a single number, a master reading
   * finer than the UUC's resolution was told off for a digit its own instrument shows.
   */
  const offStep = useMemo(() => stepViolations(parameter, masterBuckets), [parameter, masterBuckets])

  /**
   * Columns holding readings that nothing can judge.
   *
   * 118 bands in the registry state an accuracy and no least count. Those readings are
   * not passed and not failed - they are reported as unjudged, because checking them
   * against a step borrowed from the other instrument would be inventing a resolution.
   */
  const unjudged = useMemo(() => {
    const sides = { master: false, uuc: false }
    parameter.fieldDefinitions.filter(needsResolution).forEach((field) => {
      parameter.resultRows.forEach((row) => {
        if ((row.values[field.id] ?? '').trim() === '') return
        if (resolutionFor(field, row).kind !== 'declared') {
          sides[field.group === 'master' ? 'master' : 'uuc'] = true
        }
      })
    })
    return sides
  }, [parameter, resolutionFor])

  /**
   * Why a row needs a second look, or null when it does not.
   *
   * Distinct from a failure. A failure is one thing: the error exceeds the accuracy
   * limit, which is decided once in recomputeResultRow and stored on the row. A warning
   * is a reading that is not out of limit but is still wrong enough to matter - more
   * decimals than the instrument can resolve, or a point taken outside the operating
   * range.
   *
   * Derived here rather than stored, because a warning is something to fix before
   * signing rather than something to print: the certificate and the PDF show the
   * failure verdict only.
   */
  /**
   * Whether the readings reach into the range this certificate claims to cover.
   *
   * Recomputed rather than stored: it depends on the rows, on the range, and on which
   * column the error is taken from, and any of the three can change under it.
   */
  const coverage = useMemo(
    () =>
      rangeCoverage(parameter, parameter.resultRows, parameter.fieldDefinitions, parameter.errorConfig),
    [parameter],
  )

  const rowWarning = useCallback(
    (row: CalibrationResultRow): string | null => {
      const masterRaw = row.values[parameter.errorConfig.masterFieldId] ?? ''
      const masterReading = parseFloat(masterRaw)

      // Readings this row's instruments could not have shown. Each column against
      // its own step: judged against a single number, a master reading finer than the
      // UUC's resolution was told off for a digit its own instrument shows.
      const offStepHere = offStep.filter((v) => v.pointNumber === row.pointNumber)
      const sentence = stepViolationSentence(offStepHere)
      if (sentence) return sentence

      // Against the range being calibrated, not the operating range. A point outside
      // the operating range is perfectly ordinary - the operating range only asks that
      // one point reaches into it, and that is said once under the table rather than
      // against every row that sits outside it.
      if (outsideRange.outside.some((point) => point.rowId === row.id)) {
        return `This point is outside the range being calibrated, ${bound(outsideRange.from)} to ${bound(outsideRange.to)} ${parameter.parameterUnit}.`
      }

      return null
    },
    [parameter, offStep, outsideRange],
  )

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
        <div className="flex items-center gap-1.5 rounded-md bg-slate-100/60 px-2.5 py-1.5 text-[11px] text-slate-600">
          <Info className="size-3.5 shrink-0 text-slate-400" />
          <div>
            <span className="font-bold">{accuracyTypeConfig.label}:</span>{' '}
            {accuracyTypeConfig.description}
            {baseLimit !== null && (
              <span className="ml-1 font-bold text-primary">
                (Limit: ±{Math.round(baseLimit * 1000) / 1000} {parameter.parameterUnit})
              </span>
            )}
          </div>
        </div>

        {/* A point read outside the range the certificate speaks for. */}
        {outsideRange.outside.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-500" />
            <div>
              <span className="font-bold">Range Warning:</span>{' '}
              {outsideRange.outside.length} point{outsideRange.outside.length !== 1 ? 's were' : ' was'} read
              outside the range being calibrated, {bound(outsideRange.from)} to{' '}
              {bound(outsideRange.to)} {parameter.parameterUnit}. The certificate says
              nothing about readings beyond it.
              <span className="ml-1 text-amber-600">
                (Point{outsideRange.outside.length !== 1 ? 's' : ''}{' '}
                {outsideRange.outside.map((p) => p.pointNumber).join(', ')})
              </span>
            </div>
          </div>
        )}

        {/* A reading that no instrument could have shown. Named per column with both
            valid readings either side, because which one the instrument actually
            showed is the one thing the engineer knows and this does not. */}
        {offStep.length > 0 && (
          <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-amber-500" />
            <div>
              <span className="font-bold">Least Count Warning:</span>{' '}
              {offStep.length} reading{offStep.length !== 1 ? 's do' : ' does'} not land on
              a step its instrument can show. Fix {offStep.length !== 1 ? 'them' : 'it'} before
              submitting.
              <ul className="mt-1 space-y-0.5 text-amber-700">
                {offStep.map((v) => (
                  <li key={`${v.pointNumber}-${v.fieldId}`}>
                    Point {v.pointNumber}, {v.fieldName}: {v.value} is not a multiple of{' '}
                    {v.leastCount} — nearest are {v.below} and {v.above}.
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* A column nobody recorded a resolution for is not judged - and not silently
            passed either. 118 bands in the registry state an accuracy and no least
            count, and borrowing the other instrument's would be inventing one. */}
        {(unjudged.master || unjudged.uuc) && (
          <div className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-600">
            <Info className="size-3.5 shrink-0 text-slate-400" />
            <div>
              {unjudged.master && unjudged.uuc
                ? 'The master and the UUC record no least count'
                : unjudged.master
                  ? 'The master records no least count'
                  : 'The UUC records no least count'}
              , so those readings are not checked against one.
            </div>
          </div>
        )}
      </div>

      {/* Section 05: table name, column schema and the results table itself. One
          container so the gap between the three is one gap, rather than each block's
          own padding meeting the next one's and reading as three different sizes.
          They are three separate things, so the gap is wide enough to say so. */}
      <div className="space-y-4 p-3">
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
            className="min-w-0 flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-xs disabled:bg-slate-50"
          />
        </label>

        <ColumnSetup
          fields={parameter.fieldDefinitions}
          errorConfig={parameter.errorConfig}
          parameterUnit={parameter.parameterUnit}
          mapping={parameter.masterMapping}
          disabled={disabled}
          // First row with anything in it, so a formula previews against real readings
          // rather than an invented example. Undefined when nothing is entered yet, in
          // which case the editor omits the preview.
          sampleValues={
            parameter.resultRows.find((row) =>
              Object.values(row.values).some((v) => v !== ''),
            )?.values
          }
          precision={defaultPrecision}
          onChange={onSchemaChange}
        />

        {/* Whether the readings reach into the range the certificate claims. Stated
            under the table it is about, and only once there is something to say. */}
        {coverage.checked && (
          <p
            className={cn(
              'mt-2 rounded-lg border px-3 py-2 text-[11px]',
              coverage.satisfied
                ? 'border-slate-200 bg-slate-50 text-slate-600'
                : 'border-red-200 bg-red-50 text-red-800',
            )}
          >
            {coverage.satisfied ? (
              <>
                {coverage.inside.length} of {parameter.resultRows.length}{' '}
                {coverage.inside.length === 1 ? 'point falls' : 'points fall'} within the{' '}
                operating range, {bound(coverage.from)} to {bound(coverage.to)}{' '}
                {parameter.parameterUnit}.
              </>
            ) : (
              <>
                No point falls within the operating range,{' '}
                <b>
                  {bound(coverage.from)} to {bound(coverage.to)} {parameter.parameterUnit}
                </b>
                . That is the stretch the unit is actually used at, and a certificate
                that was never read there says nothing about how it behaves in service,
                so at least one reading has to land inside before this can be submitted.
              </>
            )}
          </p>
        )}

        <DynamicResultsTable
          fields={parameter.fieldDefinitions}
          rows={parameter.resultRows}
          errorConfig={parameter.errorConfig}
          precision={defaultPrecision}
          getWarning={rowWarning}
          outsideRange={
            // Marked only where the rule is not yet met. Once one reading lands inside,
            // the others being outside is ordinary - a certificate is not required to
            // read only within the operating range, only to reach it.
            coverage.checked && !coverage.satisfied
              ? (row) => !coverage.inside.includes(row.id)
              : undefined
          }
          precisionFor={(field, row) => {
            // Each column to its own instrument. A computed column has to print
            // something, so where the master states no resolution this falls back to
            // the UUC's - the warning below does not, and says it is not recorded.
            const { master, uuc } = resolutionsFor(row)
            return field.group === 'master' ? precisionOf(master, uuc) : precisionOf(uuc)
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
