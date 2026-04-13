import type { LucideIcon } from 'lucide-react'

export interface MetaInfoItemProps {
  icon: LucideIcon
  children: React.ReactNode
  /** If true, uses font-medium styling for the text */
  emphasized?: boolean
}

/**
 * Meta information item with icon for certificate headers.
 * Used to display assignee, customer, location, etc.
 */
export function MetaInfoItem({
  icon: Icon,
  children,
  emphasized = false,
}: MetaInfoItemProps) {
  return (
    <div className="flex items-center gap-2 text-slate-600">
      <div className="p-1 rounded bg-slate-100">
        <Icon className="size-3 text-slate-500" />
      </div>
      <span className={emphasized ? 'font-medium text-slate-700' : undefined}>
        {children}
      </span>
    </div>
  )
}
