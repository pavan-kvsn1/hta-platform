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
}

export interface MasterInstrumentsTableProps {
  instruments: MasterInstrumentData[]
  emptyMessage?: string
}

/**
 * Master instruments table for certificate display.
 * Shows description, make, model, serial number, and calibration due date.
 */
export function MasterInstrumentsTable({
  instruments,
  emptyMessage = 'No master instruments listed.',
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
          {instruments.map((mi) => (
            <tr key={mi.id}>
              <td className="px-4 py-2 text-gray-900 text-xs">{mi.description}</td>
              <td className="px-4 py-2 text-gray-700 text-xs">{mi.make || '-'}</td>
              <td className="px-4 py-2 text-gray-700 text-xs">{mi.model || '-'}</td>
              <td className="px-4 py-2 text-gray-700 text-xs">{mi.serialNumber || '-'}</td>
              <td className="px-4 py-2 text-gray-700 text-xs">{mi.calibrationDueDate || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
