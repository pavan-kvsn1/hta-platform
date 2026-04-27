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

function extractSectionNumber(title: string): string | null {
  const match = title.match(/Section\s+(\d+)/i)
  return match ? match[1] : null
}

function extractSectionLabel(title: string): string {
  const match = title.match(/Section\s+\d+:\s*(.+)/i)
  return match ? match[1] : title
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
  const sectionNum = extractSectionNumber(title)
  const sectionLabel = extractSectionLabel(title)

  return (
    <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
      <div
        className={`flex items-center justify-between cursor-pointer transition-colors duration-100 ${isExpanded ? 'bg-[#f8fafc] border-b border-[#e2e8f0]' : 'bg-white'}`}
      >
        <button
          onClick={onToggle}
          className="flex-1 px-5 py-[14px] flex items-center justify-between"
        >
          <div className="flex items-center gap-2.5">
            {sectionNum && (
              <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#94a3b8] px-2 py-[3px] bg-[#f1f5f9] rounded-[5px]">
                §{sectionNum}
              </span>
            )}
            <span className="text-[15px] font-bold text-[#0f172a] tracking-[-0.01em]">
              {sectionLabel}
            </span>
            {badge}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-[15px] w-[15px] text-[#94a3b8]" />
          ) : (
            <ChevronDown className="h-[15px] w-[15px] text-[#94a3b8]" />
          )}
        </button>
        {actionButton && (
          <div className="pr-4">
            {actionButton}
          </div>
        )}
      </div>
      {isExpanded && (
        <div className="p-5 bg-white">
          {feedbackSlot}
          {children}
        </div>
      )}
    </div>
  )
}
