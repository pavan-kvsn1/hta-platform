'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, MessageSquare, Clock, CheckCircle2 } from 'lucide-react'
import { format } from 'date-fns'
import {
  SECTION_CONFIG,
  isRevisionRequest,
  isEngineerResponse,
  isApproval,
  type Feedback as BaseFeedback,
} from '@/components/feedback/shared/feedback-utils'

// Extend base feedback type to allow non-nullable user fields (for display)
interface Feedback extends Omit<BaseFeedback, 'user'> {
  user: {
    name: string
    role: string
  }
}

interface FeedbackHistorySectionProps {
  feedbacks: Feedback[]
  currentRevision: number
  className?: string
}

export function FeedbackHistorySection({ feedbacks, currentRevision, className }: FeedbackHistorySectionProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(new Set([currentRevision]))

  // Group feedbacks by revision, then by section (excluding approvals which are shown separately)
  const { revisionGroups, revisionApprovals } = useMemo(() => {
    const groups: Record<number, Record<string, Feedback[]>> = {}
    const approvals: Record<number, Feedback[]> = {}

    const sortedFeedbacks = [...feedbacks].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )

    for (const feedback of sortedFeedbacks) {
      const revision = feedback.revisionNumber || 1

      // Separate approvals from section feedbacks
      if (isApproval(feedback.feedbackType)) {
        if (!approvals[revision]) {
          approvals[revision] = []
        }
        approvals[revision].push(feedback)
      } else {
        const section = feedback.targetSection || 'general'

        if (!groups[revision]) {
          groups[revision] = {}
        }
        if (!groups[revision][section]) {
          groups[revision][section] = []
        }
        groups[revision][section].push(feedback)
      }
    }

    return { revisionGroups: groups, revisionApprovals: approvals }
  }, [feedbacks])

  // Get all revision cycles (including those with only approvals)
  const revisionCycles = [...new Set([
    ...Object.keys(revisionGroups).map(Number),
    ...Object.keys(revisionApprovals).map(Number)
  ])].sort((a, b) => b - a) // Most recent first

  const toggleRevision = (revision: number) => {
    setExpandedRevisions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(revision)) {
        newSet.delete(revision)
      } else {
        newSet.add(revision)
      }
      return newSet
    })
  }

  // Get section order for display
  const getSectionOrder = (sectionGroups: Record<string, Feedback[]>) => {
    const order = ['summary', 'uuc-details', 'master-inst', 'environment', 'results', 'remarks', 'conclusion', 'general']
    return order.filter(s => sectionGroups[s]?.length > 0)
  }

  if (revisionCycles.length === 0) {
    return (
      <div id="feedback-history" className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden', className)}>
        {/* Collapsible Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4 text-slate-400" />
            ) : (
              <ChevronRight className="size-4 text-slate-400" />
            )}
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Feedback History
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 py-8 text-center border-t border-slate-100">
            <Clock className="size-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">No feedback history yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Feedback from reviewers will appear here after your first submission is reviewed.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div id="feedback-history" className={cn('bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden', className)}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="size-4 text-slate-400" />
          ) : (
            <ChevronRight className="size-4 text-slate-400" />
          )}
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Feedback History
          </span>
        </div>
        {!isExpanded && (
          <span className="text-xs text-slate-500">
            {revisionCycles.length} revision cycle{revisionCycles.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          {revisionCycles.map((revision, revIndex) => {
            const isCurrentRevision = revision === currentRevision
            const sectionGroups = revisionGroups[revision] || {}
            const approvals = revisionApprovals[revision] || []
            const isRevisionExpanded = expandedRevisions.has(revision)
            const sectionOrder = getSectionOrder(sectionGroups)
            const totalFeedbacks = Object.values(sectionGroups).reduce((sum, arr) => sum + arr.length, 0) + approvals.length

            return (
              <div key={revision} className={cn(revIndex > 0 && 'border-t border-slate-100')}>
                {/* Revision Header */}
                <button
                  onClick={() => toggleRevision(revision)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'size-8 rounded-lg flex items-center justify-center text-xs font-bold',
                      isCurrentRevision
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-600'
                    )}>
                      {revision}
                    </div>
                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">
                          Revision {revision} → {revision + 1}
                        </span>
                        {isCurrentRevision && (
                          <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Current
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {approvals.length > 0 && <span className="text-green-600">✓ Approved</span>}
                        {approvals.length > 0 && sectionOrder.length > 0 && ' • '}
                        {sectionOrder.length > 0 && `${sectionOrder.length} section${sectionOrder.length !== 1 ? 's' : ''}`}
                        {' • '}{totalFeedbacks} feedback{totalFeedbacks !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isRevisionExpanded && (
                      <div className="flex -space-x-1">
                        {sectionOrder.slice(0, 4).map(section => {
                          const config = SECTION_CONFIG[section] || SECTION_CONFIG.general
                          const Icon = config.icon
                          return (
                            <div
                              key={section}
                              className="size-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center"
                            >
                              <Icon className="size-3 text-slate-500" />
                            </div>
                          )
                        })}
                        {sectionOrder.length > 4 && (
                          <div className="size-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                            +{sectionOrder.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                    {isRevisionExpanded ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Revision Content - Approvals first, then Grouped by Section */}
                {isRevisionExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    {/* Approvals - displayed separately at the top */}
                    {approvals.length > 0 && (
                      <div className="rounded-xl border-2 border-green-200 bg-green-50 overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-100/50 border-b border-green-200">
                          <div className="size-6 rounded-lg flex items-center justify-center bg-green-200">
                            <CheckCircle2 className="size-3.5 text-green-700" />
                          </div>
                          <span className="text-xs font-bold text-green-800">
                            Approved
                          </span>
                        </div>
                        <div className="p-2 space-y-2">
                          {approvals.map((approval) => {
                            const approvalDate = new Date(approval.createdAt)
                            const formattedDate = format(approvalDate, 'dd MMM, h:mm a')
                            return (
                              <div key={approval.id} className="rounded-lg bg-white border border-green-100 p-3">
                                <div className="flex items-start gap-2.5">
                                  <div className="size-7 rounded-full flex items-center justify-center bg-green-200 text-green-700 ring-2 ring-green-50 flex-shrink-0">
                                    <CheckCircle2 className="size-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-semibold text-green-900">
                                          {approval.user.name}
                                        </span>
                                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 text-green-700">
                                          Approved
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-slate-400 flex-shrink-0">
                                        {formattedDate}
                                      </span>
                                    </div>
                                    {approval.comment && (
                                      <p className="text-xs text-slate-700 leading-relaxed">
                                        {approval.comment}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Section-grouped feedbacks */}
                    {sectionOrder.map((section) => {
                      const sectionFeedbacks = sectionGroups[section]
                      const config = SECTION_CONFIG[section] || SECTION_CONFIG.general
                      const Icon = config.icon

                      return (
                        <div
                          key={section}
                          className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden"
                        >
                          {/* Section Header */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-100">
                            <div className={cn(
                              'size-6 rounded-lg flex items-center justify-center',
                              config.bgClass
                            )}>
                              <Icon className={cn('size-3.5', config.iconClass)} />
                            </div>
                            <span className="text-xs font-bold text-slate-700">
                              {config.label}
                            </span>
                            <span className="text-[10px] text-slate-400 ml-auto">
                              {sectionFeedbacks.length} item{sectionFeedbacks.length !== 1 ? 's' : ''}
                            </span>
                          </div>

                          {/* Section Feedbacks */}
                          <div className="p-2 space-y-2">
                            {sectionFeedbacks.map((feedback, fbIndex) => {
                              const feedbackDate = new Date(feedback.createdAt)
                              const formattedDate = format(feedbackDate, 'dd MMM, h:mm a')
                              const isLast = fbIndex === sectionFeedbacks.length - 1

                              if (isRevisionRequest(feedback.feedbackType)) {
                                const isCustomerForwarded = feedback.feedbackType === 'CUSTOMER_REVISION_FORWARDED'
                                return (
                                  <div key={feedback.id} className="relative">
                                    {/* Timeline connector */}
                                    {!isLast && (
                                      <div className="absolute left-[14px] top-8 bottom-0 w-px bg-slate-200" />
                                    )}
                                    <div className={cn(
                                      'rounded-lg p-3 relative',
                                      isCustomerForwarded
                                        ? 'bg-purple-50 border border-purple-100'
                                        : 'bg-orange-50 border border-orange-100'
                                    )}>
                                      <div className="flex items-start gap-2.5">
                                        <div className={cn(
                                          'size-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 relative z-10',
                                          isCustomerForwarded
                                            ? 'bg-purple-200 text-purple-700 ring-2 ring-purple-50'
                                            : 'bg-orange-200 text-orange-700 ring-2 ring-orange-50'
                                        )}>
                                          {feedback.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className={cn(
                                                'text-xs font-semibold',
                                                isCustomerForwarded ? 'text-purple-900' : 'text-orange-900'
                                              )}>
                                                {feedback.user.name}
                                              </span>
                                              <span className={cn(
                                                'text-[10px] px-1.5 py-0.5 rounded font-medium',
                                                isCustomerForwarded
                                                  ? 'bg-purple-100 text-purple-700'
                                                  : 'bg-orange-100 text-orange-700'
                                              )}>
                                                {isCustomerForwarded ? 'Customer' : 'Reviewer'}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                                              {formattedDate}
                                            </span>
                                          </div>
                                          {feedback.comment && (
                                            <p className="text-xs text-slate-700 leading-relaxed">
                                              {feedback.comment}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              }

                              if (isEngineerResponse(feedback.feedbackType)) {
                                return (
                                  <div key={feedback.id} className="relative">
                                    {!isLast && (
                                      <div className="absolute left-[14px] top-8 bottom-0 w-px bg-slate-200" />
                                    )}
                                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
                                      <div className="flex items-start gap-2.5">
                                        <div className="size-7 rounded-full flex items-center justify-center text-[10px] font-bold bg-blue-200 text-blue-700 ring-2 ring-blue-50 flex-shrink-0 relative z-10">
                                          {feedback.user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center justify-between gap-2 mb-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="text-xs font-semibold text-blue-900">
                                                You
                                              </span>
                                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 text-blue-700">
                                                Response
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400 flex-shrink-0">
                                              {formattedDate}
                                            </span>
                                          </div>
                                          {feedback.comment && (
                                            <p className="text-xs text-slate-700 leading-relaxed">
                                              {feedback.comment}
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )
                              }

                              // Generic feedback (approvals are handled separately above)
                              return (
                                <div key={feedback.id} className="relative">
                                  {!isLast && (
                                    <div className="absolute left-[14px] top-8 bottom-0 w-px bg-slate-200" />
                                  )}
                                  <div className="rounded-lg bg-white border border-slate-200 p-3">
                                    <div className="flex items-start gap-2.5">
                                      <div className="size-7 rounded-full flex items-center justify-center bg-slate-100 flex-shrink-0 relative z-10">
                                        <MessageSquare className="size-3.5 text-slate-500" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                          <span className="text-xs font-semibold text-slate-700">
                                            {feedback.user.name}
                                          </span>
                                          <span className="text-[10px] text-slate-400 flex-shrink-0">
                                            {formattedDate}
                                          </span>
                                        </div>
                                        {feedback.comment && (
                                          <p className="text-xs text-slate-600 leading-relaxed">
                                            {feedback.comment}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
