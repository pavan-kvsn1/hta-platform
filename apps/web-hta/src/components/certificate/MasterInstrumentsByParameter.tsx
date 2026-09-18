'use client'

/**
 * The masters on a certificate, under the parameters they served.
 *
 * A flat table of instruments answers "what was used" and nothing else. The question a
 * reviewer is actually asking is "was this parameter measured by something good enough
 * for it", and that question is per parameter: a parameter can hold several masters
 * now, each over its own stretch of the range, and an instrument can appear twice for
 * two different parameters.
 *
 * The row is the engineer's own row, from the edit page - asset number, description,
 * how it was used, the two verdict badges, the ratio - with everything else opening
 * underneath. Reviewing a certificate should not mean learning a second way to read the
 * same fact.
 */

import { Fragment, useState } from 'react'
import { AlertTriangle, Camera, ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { MasterBand } from '@/lib/master-entry/snapshot'
import { masterFit } from '@/lib/certificate/master-fit'
import { COMPATIBILITY_BADGE, type Compatibility } from '@/lib/master/eligibility'
import { DEFAULT_ACCURACY_RATIO } from '@/lib/master/capability'

export interface MasterByParameterEntry {
  id: string
  parameterId?: string | null
  masterInstrumentId?: string | number | null
  assetNo?: string | null
  description: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibrationDueDate: string | null
  calibratedAt?: string | null
  reportNo?: string | null
  sopReference?: string | null
  /** The stretch of the parameter's range this master was used over; null means all. */
  rangeFrom?: string | null
  rangeTo?: string | null
  /** What the master's own certificate said, snapshotted when it was chosen. */
  masterLeastCount?: string | null
  masterLeastCountUnit?: string | null
  masterAccuracy?: string | null
  masterAccuracyUnit?: string | null
  /**
   * The bands the master declares over the stretch it was used, where it declares more
   * than one. Absent on every certificate written before this, which carries the single
   * pair above and is read exactly as it was.
   */
  masterBands?: MasterBand[] | null
  capabilityParameter?: string | null
  masterSubtype?: string | null
  masterAcceptanceReason?: string | null
  /** How many photos the engineer attached, where the caller knows. */
  photoCount?: number
}

export interface MasterByParameterParameter {
  id: string
  parameterName: string
  parameterUnit: string | null
  rangeMin?: string | null
  rangeMax?: string | null
  leastCountValue?: string | null
  leastCountUnit?: string | null
  accuracyValue?: string | null
  accuracyUnit?: string | null
}

export interface MasterInstrumentsByParameterProps {
  instruments: MasterByParameterEntry[]
  parameters: MasterByParameterParameter[]
  emptyMessage?: string
  /**
   * Open the photos for one master. Absent means the caller has no way to show them,
   * and the count is then stated without offering to open it.
   */
  onViewPhotos?: (entry: MasterByParameterEntry) => void
}

const PILL =
  'inline-flex items-center justify-center min-w-[2.75rem] px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0'

function Verdict({ state, label, note }: { state: Compatibility; label: string; note: string }) {
  return (
    <span className={cn(PILL, COMPATIBILITY_BADGE[state])} title={`${label} — ${note}`}>
      {label}
    </span>
  )
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold text-slate-500 uppercase leading-4">{label}</p>
      <p className="font-semibold text-slate-800 leading-5 break-words text-xs">{value || '—'}</p>
    </div>
  )
}

/**
 * A band's span as it reads.
 *
 * Every band in this lab's register states both ends, so the open cases below are
 * defensive rather than exercised. They read an open end as open rather than filling
 * it with a number the register does not state.
 */
function bandRange(band: MasterBand): string {
  const from = band.from === null ? '' : String(band.from)
  const to = band.to === null ? '' : String(band.to)
  if (!from && !to) return '—'
  if (!to) return `${from} and above`
  if (!from) return `up to ${to}`
  return `${from} – ${to}`
}

const clean = (value: string | null | undefined) => {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** "-10 to 40 °C", or nothing where the parameter records no range. */
function rangeLabel(p: MasterByParameterParameter): string | null {
  const from = clean(p.rangeMin)
  const to = clean(p.rangeMax)
  if (!from && !to) return null
  return `${from ?? '0'} to ${to ?? '∞'}${p.parameterUnit ? ` ${p.parameterUnit}` : ''}`
}

export function MasterInstrumentsByParameter({
  instruments,
  parameters,
  emptyMessage = 'No master instruments listed.',
  onViewPhotos,
}: MasterInstrumentsByParameterProps) {
  const [open, setOpen] = useState<string | null>(null)

  if (instruments.length === 0) {
    return <p className="text-gray-500 text-sm">{emptyMessage}</p>
  }

  /**
   * Grouped by the parameter each entry names. Entries that name none are certificates
   * written before the pairing recorded it; they are listed at the end under their own
   * heading rather than dropped, because a master that was used is a fact about the
   * calibration whatever the certificate failed to record about it.
   */
  const groups = parameters.map((parameter) => ({
    parameter,
    entries: instruments.filter((i) => i.parameterId === parameter.id),
  }))
  const unassigned = instruments.filter(
    (i) => !i.parameterId || !parameters.some((p) => p.id === i.parameterId),
  )

  const renderEntry = (entry: MasterByParameterEntry, parameter?: MasterByParameterParameter) => {
    const fit = parameter
      ? masterFit(entry, parameter)
      : {
          leastCount: 'unknown' as const,
          accuracy: 'unknown' as const,
          ratio: null,
          leastCountNote: 'The certificate does not record which parameter this served.',
          accuracyNote: 'The certificate does not record which parameter this served.',
          otherScale: null,
        }
    const bands = entry.masterBands ?? []
    const isOpen = open === entry.id
    const usedOver =
      clean(entry.rangeFrom) && clean(entry.rangeTo)
        ? `${entry.rangeFrom} to ${entry.rangeTo}${parameter?.parameterUnit ? ` ${parameter.parameterUnit}` : ''}`
        : null
    const reason = clean(entry.masterAcceptanceReason)

    return (
      <div key={entry.id} className="border-t border-slate-100 first:border-t-0">
        <button
          type="button"
          onClick={() => setOpen(isOpen ? null : entry.id)}
          aria-expanded={isOpen}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors"
        >
          <ChevronRight
            className={cn('size-3.5 shrink-0 text-slate-400 transition-transform', isOpen && 'rotate-90')}
          />
          <span className="text-xs font-semibold text-slate-800 shrink-0 w-32 truncate">
            {entry.assetNo || `#${entry.masterInstrumentId ?? '—'}`}
          </span>
          <span className="text-xs text-slate-500 flex-1 min-w-0 truncate">
            {entry.description || ''}
          </span>
          {entry.masterSubtype && (
            <span className="text-[11px] text-slate-400 shrink-0 capitalize hidden md:inline">
              {entry.masterSubtype}
            </span>
          )}
          <Verdict state={fit.leastCount} label="LC" note={fit.leastCountNote} />
          <Verdict state={fit.accuracy} label="Acc." note={fit.accuracyNote} />
          {fit.ratio !== null && (
            <span
              className={cn(
                'shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold',
                COMPATIBILITY_BADGE[fit.accuracy],
              )}
            >
              {fit.ratio.toFixed(1)} : 1
            </span>
          )}
          {fit.otherScale && (
            <span
              className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700"
              title={`Judged in ${fit.otherScale}, not ${parameter?.parameterUnit ?? 'the parameter’s unit'}`}
            >
              {fit.otherScale}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="px-3 pb-3">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 space-y-4">
              {/* Two columns, not four: "Delta Ohm Ind: HD 2107.1 / Sen: TP 472 I" and
                  "Transcal, Bangalore · TSC/25-26/11942-3" do not fit a quarter width,
                  and half of them wrapping is what made the block read as ragged. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 items-start">
                <Info
                  label="Make / Model"
                  value={[entry.make, entry.model].filter(Boolean).join(' ')}
                />
                <Info label="Serial No" value={entry.serialNumber} />
                <Info label="Calibration Due" value={entry.calibrationDueDate} />
                <Info
                  label="Calibrated at"
                  value={[entry.calibratedAt, entry.reportNo].filter(Boolean).join(' · ')}
                />
                {/* Only where it says something. A master over the whole of a parameter
                    is the ordinary case; one over part of it is a fact about the
                    calibration, and the certificate prints it too. */}
                {usedOver && <Info label="Used over" value={usedOver} />}
                {entry.sopReference && <Info label="SOP" value={entry.sopReference} />}
                {/* One band is two figures and reads as two figures. Several is a
                    table, below, rather than one of them standing in for the rest. */}
                {bands.length < 2 && (
                  <>
                    <Info
                      label="Least count"
                      value={
                        entry.masterLeastCount
                          ? `${entry.masterLeastCount} ${entry.masterLeastCountUnit ?? ''}`.trim()
                          : 'Not recorded'
                      }
                    />
                    <Info
                      label="Accuracy"
                      value={
                        entry.masterAccuracy
                          ? `±${entry.masterAccuracy} ${entry.masterAccuracyUnit ?? ''}`.trim()
                          : 'Not recorded'
                      }
                    />
                  </>
                )}
              </div>

              {/* The master's own bands over the stretch it was used.
                  Set as a list rather than a table, the way the UUC's bands are set in
                  Section 2: a reviewer comparing the two is reading the same shape
                  twice. Only the bands the calibration reached - the instrument's full
                  capability is a fact about the instrument and belongs in the register,
                  not on a certificate. */}
              {bands.length >= 2 && (
                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-2.5">
                    <span className="text-xs font-semibold text-gray-500">
                      What this master was judged by
                    </span>
                    <span className="text-[11px] text-gray-400 tabular-nums">
                      {bands.length} bands over the range used
                    </span>
                  </div>
                  <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-8 items-baseline">
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-1.5 border-b">
                      Range
                    </dt>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-1.5 border-b text-right">
                      Least count
                    </dt>
                    <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 pb-1.5 border-b text-right">
                      Accuracy
                    </dt>
                    {bands.map((band, i) => {
                      const last = i === bands.length - 1
                      const cell = cn('py-1.5 text-xs tabular-nums', !last && 'border-b border-gray-100')
                      return (
                        <Fragment key={`${band.from}-${band.to}-${i}`}>
                          <dd className={cn(cell, 'text-gray-900')}>{bandRange(band)}</dd>
                          <dd className={cn(cell, 'text-gray-600 text-right')}>
                            {band.leastCount
                              ? `${band.leastCount} ${band.leastCountUnit ?? ''}`.trim()
                              : '—'}
                          </dd>
                          <dd className={cn(cell, 'text-gray-600 text-right')}>
                            {band.accuracy
                              ? `±${band.accuracy} ${band.accuracyUnit ?? ''}`.trim()
                              : '—'}
                          </dd>
                        </Fragment>
                      )
                    })}
                  </dl>
                </div>
              )}

              {fit.otherScale && parameter?.parameterUnit && (
                <p className="flex items-start gap-2 text-xs text-amber-800">
                  <AlertTriangle className="size-3.5 shrink-0 text-amber-600 mt-px" />
                  <span>
                    Judged in {fit.otherScale} against a parameter recorded in{' '}
                    {parameter.parameterUnit}. The engineer stated the master&rsquo;s span
                    in its own scale, so the ratio beside it compares two different
                    quantities.
                  </span>
                </p>
              )}

              {/* The photos the engineer attached. They were reachable only from the
                  edit page: the UUC and the readings each have a viewer on this screen
                  and the masters had none. */}
              <div className="pt-3 border-t border-slate-200 flex items-center gap-4 flex-wrap">
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  <Camera className="size-3.5" />
                  {entry.photoCount
                    ? `${entry.photoCount} photo${entry.photoCount === 1 ? '' : 's'}`
                    : 'No photos'}
                </span>
                {onViewPhotos && (
                  <button
                    type="button"
                    onClick={() => onViewPhotos(entry)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    View
                  </button>
                )}
              </div>
            </div>

            {reason && (
              <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <span className="font-semibold">Accepted by the engineer, with a reason:</span>{' '}
                {reason}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {groups.map(({ parameter, entries }) => {
        const range = rangeLabel(parameter)
        return (
          <div key={parameter.id} className="rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-gray-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs font-semibold text-gray-900">
                {parameter.parameterName}
                {range && <span className="text-gray-500 font-normal ml-1">({range})</span>}
              </span>
              {entries.length === 0 && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  No master recorded
                </span>
              )}
            </div>
            {entries.map((entry) => renderEntry(entry, parameter))}
          </div>
        )
      })}

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b border-slate-200">
            <span className="text-xs font-semibold text-gray-900">
              Not recorded against a parameter
            </span>
            <span className="text-gray-500 font-normal ml-1 text-xs">
              (written before the pairing named one)
            </span>
          </div>
          {unassigned.map((entry) => renderEntry(entry))}
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span>
          <b className="font-bold text-slate-600">LC</b> for least count
        </span>
        <span aria-hidden className="text-slate-300">|</span>
        <span>
          <b className="font-bold text-slate-600">Acc.</b> for accuracy, against the lab&rsquo;s{' '}
          {DEFAULT_ACCURACY_RATIO} : 1
        </span>
        {(
          [
            ['safe', 'with margin'],
            ['compatible', 'exact, none to spare'],
            ['incompatible', 'falls short'],
            ['unknown', 'not recorded'],
          ] as [Compatibility, string][]
        ).map(([state, meaning]) => (
          <span key={state} className="inline-flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', COMPATIBILITY_BADGE[state].split(' ')[0])} />
            {meaning}
          </span>
        ))}
      </p>
    </div>
  )
}
