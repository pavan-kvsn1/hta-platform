export interface InfoFieldProps {
  label: string
  value: string | null | undefined
  className?: string
}

/**
 * Display field for certificate information.
 * Shows a label and value in a consistent format.
 */
export function InfoField({ label, value, className }: InfoFieldProps) {
  return (
    <div className={className}>
      <dt className="text-xs font-semibold text-gray-500 tracking-wider">
        {label}
      </dt>
      <dd className="mt-1 text-xs text-gray-900">{value || '-'}</dd>
    </div>
  )
}
