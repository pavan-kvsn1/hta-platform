'use client'

// Which parameters have a master instrument, and which do not.
//
// A certificate is signed per parameter, but masters are chosen per instrument, so it
// was possible to finish this section with a parameter nobody had assigned anything to
// and nothing on screen saying so. The count was never shown; the omission had to be
// noticed.

import { AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CoverageParameter {
  id: string
  parameterName: string
  parameterUnit: string
  rangeMin: string
  rangeMax: string
  masterInstrumentId: number | null
}

interface ParameterCoverageProps {
  parameters: CoverageParameter[]
  /**
   * Asset number by master instrument id, so a covered parameter can name its master.
   * A Map rather than an object: the keys are ids from stored data, and indexing an
   * object literal with them is an injection sink.
   */
  assetByInstrumentId?: Map<number, string>
}

/** "A", "A and B", "A, B and C" - a list of names reads as canned otherwise. */
export function listOf(items: string[]): string {
  if (items.length < 3) return items.join(' and ')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

export function ParameterCoverage({ parameters, assetByInstrumentId = new Map() }: ParameterCoverageProps) {
  if (parameters.length === 0) return null

  const missing = parameters.filter((p) => p.masterInstrumentId === null)
  const complete = missing.length === 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mb-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
          Parameter Coverage
        </p>
        <p className="text-xs text-slate-500">
          {parameters.length - missing.length} of {parameters.length}{' '}
          {parameters.length === 1 ? 'parameter' : 'parameters'} assigned
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {parameters.map((p, i) => {
          const covered = p.masterInstrumentId !== null
          const asset = covered ? assetByInstrumentId.get(p.masterInstrumentId!) : null
          const range =
            p.rangeMin && p.rangeMax
              ? `${p.rangeMin} to ${p.rangeMax} ${p.parameterUnit}`
              : p.parameterUnit || 'Range not set'

          return (
            <div
              key={p.id}
              className={cn(
                'rounded-xl border px-3 py-2.5',
                covered ? 'border-green-100 bg-green-50' : 'border-amber-200 bg-amber-50',
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800 truncate">
                  {p.parameterName || `Parameter ${i + 1}`}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums whitespace-nowrap">{range}</p>
              </div>
              <p
                className={cn(
                  'text-xs mt-0.5 font-medium',
                  covered ? 'text-green-700' : 'text-amber-700',
                )}
              >
                {covered ? (asset ? `Assigned to ${asset}` : 'Assigned') : 'No master assigned'}
              </p>
            </div>
          )
        })}
      </div>

      <div
        className={cn(
          'mt-3 flex items-start gap-1.5 rounded-xl border px-3 py-2 text-xs',
          complete
            ? 'border-green-100 bg-green-50 text-green-800'
            : 'border-amber-200 bg-amber-50 text-amber-800',
        )}
      >
        {complete ? (
          <CheckCircle className="size-3.5 shrink-0 mt-px" />
        ) : (
          <AlertTriangle className="size-3.5 shrink-0 mt-px" />
        )}
        <span>
          {complete ? (
            <>
              <b>
                {parameters.length === 1
                  ? 'The parameter has'
                  : `All ${parameters.length} parameters have`}{' '}
                a master.
              </b>{' '}
              This section is complete.
            </>
          ) : (
            <>
              <b>{listOf(missing.map((p, i) => p.parameterName || `Parameter ${i + 1}`))}</b>{' '}
              {missing.length === 1 ? 'has' : 'have'} no master instrument assigned. Every
              parameter needs one before this certificate can be submitted.
            </>
          )}
        </span>
      </div>
    </div>
  )
}
