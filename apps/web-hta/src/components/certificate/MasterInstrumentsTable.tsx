import { Fragment } from 'react'
/**
 * Minimal master instrument interface for table display.
 * Compatible with both centralized MasterInstrument type and local definitions.
 */
interface MasterInstrumentData {
  id: string
  description: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibrationDueDate: string | null
  /**
   * Why a master the app could not vouch for was used anyway.
   *
   * Written by the engineer when the accuracy ratio falls below the lab's threshold,
   * or when there is nothing to rate the master by at all. Null on every master that
   * did not need one, which is nearly all of them.
   */
  masterAcceptanceReason?: string | null
  /** The parameter it was used for, where the entry records one. */
  parameterName?: string | null
}

export interface MasterInstrumentsTableProps {
  instruments: MasterInstrumentData[]
  emptyMessage?: string
  /**
   * Whether to show why a master was accepted despite the app not vouching for it.
   *
   * Off by default, and deliberately so. The reason is one lab engineer explaining a
   * judgement to another; it is internal reasoning, and a customer reading it learns
   * only that somebody had a doubt. Turned on for the people whose job is to weigh
   * that judgement - the reviewer and the authorising admin - and left off everywhere
   * a customer can reach.
   */
  showAcceptanceReasons?: boolean
}

/**
 * Master instruments table for certificate display.
 * Shows description, make, model, serial number, and calibration due date.
 */
export function MasterInstrumentsTable({
  instruments,
  emptyMessage = 'No master instruments listed.',
  showAcceptanceReasons = false,
}: MasterInstrumentsTableProps) {
  if (instruments.length === 0) {
    return <p className="text-gray-500 text-sm">{emptyMessage}</p>
  }

  return (
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
        <tbody className="divide-y divide-slate-100 bg-white">
          {instruments.map((mi) => {
            const reason = showAcceptanceReasons ? mi.masterAcceptanceReason?.trim() : ''
            return (
              <Fragment key={mi.id}>
                <tr>
                  <td className="px-4 py-2 text-gray-900 text-xs">{mi.description}</td>
                  <td className="px-4 py-2 text-gray-700 text-xs">{mi.make || '-'}</td>
                  <td className="px-4 py-2 text-gray-700 text-xs">{mi.model || '-'}</td>
                  <td className="px-4 py-2 text-gray-700 text-xs">{mi.serialNumber || '-'}</td>
                  <td className="px-4 py-2 text-gray-700 text-xs">
                    {mi.calibrationDueDate || '-'}
                  </td>
                </tr>
                {/* Under the master it is about, rather than in a column of its own: it
                    is a sentence, it is rare, and a column that is empty on nine rows
                    out of ten reads as a field nobody fills in rather than as the
                    exception it is. */}
                {reason && (
                  <tr className="bg-amber-50">
                    <td colSpan={5} className="px-4 py-2 text-xs text-amber-900">
                      <span className="font-semibold">
                        Accepted by the engineer
                        {mi.parameterName ? ` for ${mi.parameterName}` : ''}, with a reason:
                      </span>{' '}
                      {reason}
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
