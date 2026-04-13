'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'

export interface CollapsibleSectionProps {
  title: string
  isExpanded: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: React.ReactNode
  /** Optional slot for feedback content, rendered before children */
  feedbackSlot?: React.ReactNode
  /** Optional action button (e.g., View Images) displayed in header */
  actionButton?: React.ReactNode
}

/**
 * Collapsible section component for certificate content display.
 * Used across Admin, Reviewer, and Customer certificate views.
 */
export function CollapsibleSection({
  title,
  isExpanded,
  onToggle,
  children,
  badge,
  feedbackSlot,
  actionButton,
}: CollapsibleSectionProps) {
  return (
    <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm">
      {/* Section Header - Primary Color */}
      <div className="flex items-center justify-between bg-primary">
        <button
          onClick={onToggle}
          className="flex-1 px-4 py-3 flex items-center justify-between hover:bg-primary/90 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold text-primary-foreground text-sm">
              {title}
            </span>
            {badge}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-primary-foreground/70" />
          ) : (
            <ChevronDown className="h-5 w-5 text-primary-foreground/70" />
          )}
        </button>
        {actionButton && (
          <div className="pr-3">
            {actionButton}
          </div>
        )}
      </div>
      {/* Section Content - White Background */}
      {isExpanded && (
        <div className="p-4 bg-white">
          {feedbackSlot}
          {children}
        </div>
      )}
    </div>
  )
}
