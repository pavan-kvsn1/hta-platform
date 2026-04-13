'use client'

import { useState } from 'react'
import { ChevronDown, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

export function FormSection({
  id,
  sectionNumber,
  title,
  children,
  className,
  headerClassName,
  isDark = false,
  feedbackSlot,
  disabled = false,
}: FormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <section className="scroll-mt-32" id={id}>
      <div className={cn(
        "bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden",
        disabled && "border-slate-200 bg-slate-50/50",
        className
      )}>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "w-full px-8 py-5 flex items-center justify-between text-left group border-b border-slate-100",
            isDark
              ? "bg-slate-900 text-white"
              : "bg-primary",
            disabled && "bg-slate-100",
            headerClassName
          )}
        >
          <div className="flex items-center gap-3">
            {disabled && (
              <div className="p-1.5 bg-slate-200 rounded-lg">
                <Lock className="size-4 text-slate-500" />
              </div>
            )}
            <div>
              <span className={cn(
                "text-[10px] font-extrabold uppercase tracking-widest mb-1 block",
                isDark ? "text-primary" : "text-white/80",
                disabled && "text-slate-400"
              )}>
                {sectionNumber}
              </span>
              <h2 className={cn(
                "text-xl font-extrabold tracking-tight",
                isDark ? "text-white" : "text-white",
                disabled && "text-slate-500"
              )}>
                {title}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {disabled && (
              <span className="text-xs text-slate-400 font-medium">Locked</span>
            )}
            <ChevronDown
              className={cn(
                "size-5 transition-transform duration-200",
                isDark ? "text-slate-400" : "text-white/70 group-hover:text-white",
                !isExpanded && "-rotate-90"
              )}
            />
          </div>
        </button>

        {isExpanded && (
          <>
            {/* Feedback slot - renders inside the section, below header */}
            {feedbackSlot && (
              <div className="px-8 pt-4  border border-slate-300 bg-section-inner">
                {feedbackSlot}
              </div>
            )}
            <div className={cn("p-8 pt-4 relative  border border-slate-300 bg-section-inner", disabled && "pointer-events-none")}>
              {children}
              {/* Disabled overlay */}
              {disabled && (
                <div className="absolute inset-0 bg-slate-100/60 backdrop-blur-[1px] flex items-center justify-center">
                  <div className="bg-white/90 border border-slate-200 rounded-lg px-4 py-3 shadow-sm flex items-center gap-2">
                    <Lock className="size-4 text-slate-400" />
                    <span className="text-xs text-slate-600 font-semibold">
                      This section is locked. Request unlock if you need to edit.
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
