'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

type AccordionStatus = 'default' | 'locked' | 'unlocked' | 'pending'

interface FormSectionProps {
  id: string
  sectionNumber: string
  title: string
  children: React.ReactNode
  className?: string
  headerClassName?: string
  isDark?: boolean
  /** Optional feedback element to render inside the section, below the header */
  feedbackSlot?: React.ReactNode
  /** When true, the section content is disabled/locked (read-only mode) */
  disabled?: boolean
  /** Accordion status for visual styling */
  accordionStatus?: AccordionStatus
  /** Whether this section has reviewer feedback */
  hasFeedback?: boolean
  /** Whether section is marked complete (for draft progress) */
  isComplete?: boolean
  /** Control collapsed state externally */
  defaultExpanded?: boolean
  /** Called when section expand state changes */
  onExpandChange?: (expanded: boolean) => void
}

export function FormSection({
  id,
  sectionNumber,
  title,
  children,
  className,
  headerClassName,
  isDark: _isDark = false,
  feedbackSlot,
  disabled = false,
  accordionStatus = 'default',
  hasFeedback = false,
  isComplete = false,
  defaultExpanded,
  onExpandChange,
}: FormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? !disabled)

  const handleToggle = () => {
    const next = !isExpanded
    setIsExpanded(next)
    onExpandChange?.(next)
  }

  // Determine header styling based on status
  const getHeaderClasses = () => {
    if (isExpanded && !disabled) {
      return 'bg-primary text-white'
    }
    if (disabled) {
      if (accordionStatus === 'pending') {
        return 'bg-[#fffbeb] text-[#92400e] border-b border-[#fde68a]'
      }
      return 'bg-[#f8fafc] text-[#94a3b8]'
    }
    if (accordionStatus === 'unlocked') {
      return 'bg-[#f0fdf4] text-[#0f172a] border-b border-[#bbf7d0]'
    }
    // Default closed state
    return 'bg-[#eef4fc] text-[#0f172a]'
  }

  const getNumClasses = () => {
    if (isExpanded && !disabled) return 'bg-white/20 text-white'
    if (disabled) {
      if (accordionStatus === 'pending') return 'bg-[#fef3c7] text-[#92400e]'
      return 'bg-[#e2e8f0] text-[#94a3b8]'
    }
    if (accordionStatus === 'unlocked') return 'bg-[#dcfce7] text-[#16a34a]'
    return 'bg-[rgba(26,111,219,0.08)] text-primary'
  }

  // Extract just the number from "Section 01" etc
  const numLabel = sectionNumber.replace(/\D/g, '') || sectionNumber

  return (
    <section className="scroll-mt-32" id={id}>
      <div className={cn(
        "bg-white rounded-xl overflow-hidden border",
        disabled ? "border-[#e2e8f0]" : "border-[#e2e8f0]",
        accordionStatus === 'unlocked' && !isExpanded && "border-[#bbf7d0]",
        accordionStatus === 'pending' && "border-[#fde68a]",
        isExpanded && !disabled && "border-primary/30",
        className
      )}>
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "w-full px-5 py-3 flex items-center justify-between text-left transition-colors",
            getHeaderClasses(),
            headerClassName
          )}
        >
          <div className="flex items-center gap-2.5">
            <div className={cn(
              "h-6 rounded-md flex items-center justify-center text-[11px] font-mono font-medium flex-shrink-0",
              numLabel.length > 2 ? "px-2" : "w-6",
              getNumClasses()
            )}>
              {numLabel}
            </div>
            <span className="text-[13.5px] font-semibold tracking-[-0.01em]">
              {title}
            </span>
            {/* Status tags */}
            {hasFeedback && isExpanded && !disabled && (
              <span className="text-[10px] font-mono font-medium bg-white/20 px-2 py-0.5 rounded-full">
                Feedback
              </span>
            )}
            {isComplete && !isExpanded && !disabled && (
              <span className="text-[10px] font-mono font-medium bg-[rgba(22,163,74,0.1)] text-[#16a34a] px-2 py-0.5 rounded-full">
                Complete
              </span>
            )}
            {accordionStatus === 'unlocked' && !isExpanded && (
              <span className="text-[10px] font-mono font-medium bg-[rgba(22,163,74,0.1)] text-[#16a34a] px-2 py-0.5 rounded-full">
                Unlocked
              </span>
            )}
            {accordionStatus === 'pending' && (
              <span className="text-[10px] font-mono font-medium bg-[#fef3c7] text-[#92400e] px-2 py-0.5 rounded-full">
                Pending
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {disabled && accordionStatus !== 'pending' && (
              <Lock className="size-3.5 opacity-50" />
            )}
            {accordionStatus === 'pending' && (
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" className="opacity-60">
                <circle cx="7" cy="7" r="5.5" /><path d="M7 4v3.5l2 1" />
              </svg>
            )}
            {!disabled && (
              isExpanded ? (
                <ChevronUp className="size-4 opacity-50" />
              ) : (
                <ChevronDown className="size-4 opacity-50" />
              )
            )}
          </div>
        </button>

        {isExpanded && (
          <>
            {/* Feedback slot - renders inside the section, below header */}
            {feedbackSlot && (
              <div className="px-5 pt-4">
                {feedbackSlot}
              </div>
            )}
            <div className={cn("p-5 pt-4 relative", disabled && "pointer-events-none")}>
              {children}
              {/* Disabled overlay */}
              {disabled && (
                <div className="absolute inset-0 bg-[#f8fafc]/70 backdrop-blur-[1px] flex items-center justify-center">
                  <div className="bg-white border border-[#e2e8f0] rounded-lg px-4 py-2.5 shadow-sm flex items-center gap-2">
                    <Lock className="size-3.5 text-[#94a3b8]" />
                    <span className="text-[12px] text-[#475569] font-medium">
                      This section is locked. Request unlock to edit.
                    </span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
