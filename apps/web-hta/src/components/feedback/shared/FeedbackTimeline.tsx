'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Clock, CheckCircle2 } from 'lucide-react'
import {
  type Feedback,
  type InternalRequestItem,
  SECTION_CONFIG,
  groupFeedbacksByRevision,
  groupFeedbacksBySection,
  internalRequestsToFeedbacks,
} from './feedback-utils'
import { FeedbackItem } from './FeedbackItem'

interface CustomerFeedbackData {
  notes: string
  sectionFeedbacks: { section: string; comment: string }[] | null
  generalNotes: string | null
  customerName: string
  customerEmail: string
  requestedAt: string
  revision?: number
}

interface FeedbackTimelineProps {
  feedbacks: Feedback[]
  currentRevision: number
  className?: string
  title?: string
  emptyMessage?: string
  /** Whether to group by sections within revisions */
  groupBySection?: boolean
  /** Show "Revision N → N+1" format vs "Version N" */
  showRevisionTransition?: boolean
  /** Current user name for highlighting own responses */
  currentUserName?: string
  /** Variant for display density */
  variant?: 'default' | 'compact' | 'sidebar'
  /** Initially expanded revision numbers */
  defaultExpandedRevisions?: number[]
  /** Customer feedback data (from CUSTOMER_REVISION_REQUESTED event) */
  customerFeedback?: CustomerFeedbackData | null
  /** Internal requests (section unlock / field change) to show in timeline */
  internalRequests?: InternalRequestItem[]
}

export function FeedbackTimeline({
  feedbacks,
  currentRevision,
  className,
  title = 'Feedback History',
  emptyMessage = 'No feedback history yet',
  groupBySection = true,
  showRevisionTransition = true,
  currentUserName,
  variant = 'default',
  defaultExpandedRevisions,
  customerFeedback,
  internalRequests,
}: FeedbackTimelineProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [expandedRevisions, setExpandedRevisions] = useState<Set<number>>(
    new Set(defaultExpandedRevisions ?? [currentRevision])
  )

  // Merge internal requests into feedbacks
  const mergedFeedbacks = useMemo(() => {
    if (!internalRequests || internalRequests.length === 0) return feedbacks
    const requestFeedbacks = internalRequestsToFeedbacks(internalRequests, currentRevision)
    return [...feedbacks, ...requestFeedbacks]
  }, [feedbacks, internalRequests, currentRevision])

  const revisionGroups = useMemo(
    () => groupFeedbacksByRevision(mergedFeedbacks),
    [mergedFeedbacks]
  )

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

  // Show empty state only if no feedbacks, no customer feedback, AND no internal requests
  if (revisionGroups.length === 0 && !customerFeedback && (!internalRequests || internalRequests.length === 0)) {
    return (
      <div className={cn(
        'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
        className
      )}>
        {/* Header */}
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
              {title}
            </span>
          </div>
        </button>

        {isExpanded && (
          <div className="px-4 py-8 text-center border-t border-slate-100">
            <Clock className="size-8 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">{emptyMessage}</p>
            <p className="text-xs text-slate-400 mt-1">
              Feedback from reviewers will appear here.
            </p>
          </div>
        )}
      </div>
    )
  }

  // If there are no revision groups but we have customer feedback, create a synthetic group for the customer feedback's revision
  const effectiveRevisionGroups = revisionGroups.length > 0
    ? revisionGroups
    : customerFeedback
      ? [{ revision: customerFeedback.revision ?? currentRevision, feedbacks: [], approvals: [] }]
      : []

  return (
    <div className={cn(
      'bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
      className
    )}>
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
            {title}
          </span>
        </div>
        {!isExpanded && (
          <span className="text-xs text-slate-500">
            {effectiveRevisionGroups.length} revision cycle{effectiveRevisionGroups.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t border-slate-100">
          {effectiveRevisionGroups.map((group, revIndex) => (
            <RevisionGroupContent
              key={group.revision}
              group={group}
              currentRevision={currentRevision}
              isExpanded={expandedRevisions.has(group.revision)}
              onToggle={() => toggleRevision(group.revision)}
              showBorder={revIndex > 0}
              groupBySection={groupBySection}
              showRevisionTransition={showRevisionTransition}
              currentUserName={currentUserName}
              variant={variant}
              customerFeedback={group.revision === (customerFeedback?.revision ?? currentRevision) ? customerFeedback : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Sub-component for revision group content
interface RevisionGroupContentProps {
  group: ReturnType<typeof groupFeedbacksByRevision>[number]
  currentRevision: number
  isExpanded: boolean
  onToggle: () => void
  showBorder: boolean
  groupBySection: boolean
  showRevisionTransition: boolean
  currentUserName?: string
  variant: 'default' | 'compact' | 'sidebar'
  customerFeedback?: CustomerFeedbackData | null
}

function RevisionGroupContent({
  group,
  currentRevision,
  isExpanded,
  onToggle,
  showBorder,
  groupBySection,
  showRevisionTransition,
  currentUserName,
  variant,
  customerFeedback,
}: RevisionGroupContentProps) {
  const { revision, feedbacks, approvals } = group
  const isCurrentRevision = revision === currentRevision

  // Convert customer feedback into Feedback items to integrate with section groups
  const customerFeedbackItems: Feedback[] = []
  if (customerFeedback) {
    // Add section-specific feedbacks
    if (customerFeedback.sectionFeedbacks && customerFeedback.sectionFeedbacks.length > 0) {
      customerFeedback.sectionFeedbacks.forEach((sf, idx) => {
        customerFeedbackItems.push({
          id: `customer-section-${idx}`,
          feedbackType: 'CUSTOMER_REVISION_REQUEST',
          comment: sf.comment,
          createdAt: customerFeedback.requestedAt,
          revisionNumber: customerFeedback.revision ?? currentRevision,
          targetSection: sf.section,
          user: {
            name: customerFeedback.customerName,
            role: 'CUSTOMER',
          },
        })
      })
    }
    // Add general notes as a feedback item in 'general' section (only if generalNotes exists)
    if (customerFeedback.generalNotes) {
      customerFeedbackItems.push({
        id: 'customer-general',
        feedbackType: 'CUSTOMER_REVISION_REQUEST',
        comment: customerFeedback.generalNotes,
        createdAt: customerFeedback.requestedAt,
        revisionNumber: customerFeedback.revision ?? currentRevision,
        targetSection: 'general',
        user: {
          name: customerFeedback.customerName,
          role: 'CUSTOMER',
        },
      })
    }
  }

  // Merge customer feedback items with regular feedbacks
  const allFeedbacks = [...feedbacks, ...customerFeedbackItems]
  const sectionGroups = groupBySection ? groupFeedbacksBySection(allFeedbacks) : []
  const totalItems = allFeedbacks.length + approvals.length

  return (
    <div className={cn(showBorder && 'border-t border-slate-100')}>
      {/* Revision Header */}
      <button
        onClick={onToggle}
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
                {showRevisionTransition
                  ? `Revision ${revision} → ${revision + 1}`
                  : `Version ${revision}`}
              </span>
              {isCurrentRevision && (
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  {variant === 'sidebar' ? 'Current' : 'Latest'}
                </span>
              )}
            </div>
            <span className="text-[11px] text-slate-500">
              {approvals.length > 0 && (
                <span className="text-green-600">✓ Approved</span>
              )}
              {approvals.length > 0 && sectionGroups.length > 0 && ' • '}
              {groupBySection && sectionGroups.length > 0 && (
                <span>{sectionGroups.length} section{sectionGroups.length !== 1 ? 's' : ''}</span>
              )}
              {groupBySection && sectionGroups.length > 0 && ' • '}
              {totalItems} feedback{totalItems !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isExpanded && groupBySection && (
            <div className="flex -space-x-1">
              {sectionGroups.slice(0, 4).map(sg => {
                const config = SECTION_CONFIG[sg.section] || SECTION_CONFIG.general
                const Icon = config.icon
                return (
                  <div
                    key={sg.section}
                    className="size-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center"
                  >
                    <Icon className="size-3 text-slate-500" />
                  </div>
                )
              })}
              {sectionGroups.length > 4 && (
                <div className="size-6 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-600">
                  +{sectionGroups.length - 4}
                </div>
              )}
            </div>
          )}
          {isExpanded ? (
            <ChevronDown className="size-4 text-slate-400" />
          ) : (
            <ChevronRight className="size-4 text-slate-400" />
          )}
        </div>
      </button>

      {/* Revision Content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Approvals */}
          {approvals.length > 0 && (
            <div className="rounded-xl border-2 border-green-200 bg-green-50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-100/50 border-b border-green-200">
                <div className="size-6 rounded-lg flex items-center justify-center bg-green-200">
                  <CheckCircle2 className="size-3.5 text-green-700" />
                </div>
                <span className="text-xs font-bold text-green-800">Approved</span>
              </div>
              <div className="p-2 space-y-2">
                {approvals.map(approval => (
                  <FeedbackItem
                    key={approval.id}
                    feedback={approval}
                    variant={variant === 'sidebar' ? 'compact' : 'default'}
                    currentUserName={currentUserName}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Section-grouped feedbacks */}
          {groupBySection ? (
            sectionGroups.map(sg => (
              <SectionContent
                key={sg.section}
                section={sg.section}
                feedbacks={sg.feedbacks}
                currentUserName={currentUserName}
                variant={variant}
              />
            ))
          ) : (
            // Flat list without sections
            <div className="space-y-2">
              {feedbacks.map((feedback, idx) => (
                <FeedbackItem
                  key={feedback.id}
                  feedback={feedback}
                  showTimeline
                  isLast={idx === feedbacks.length - 1}
                  variant={variant === 'sidebar' ? 'compact' : 'default'}
                  currentUserName={currentUserName}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Sub-component for section content
interface SectionContentProps {
  section: string
  feedbacks: Feedback[]
  currentUserName?: string
  variant: 'default' | 'compact' | 'sidebar'
}

function SectionContent({
  section,
  feedbacks,
  currentUserName,
  variant,
}: SectionContentProps) {
  const config = SECTION_CONFIG[section] || SECTION_CONFIG.general
  const Icon = config.icon

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden">
      {/* Section Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-100">
        <div className={cn('size-6 rounded-lg flex items-center justify-center', config.bgClass)}>
          <Icon className={cn('size-3.5', config.iconClass)} />
        </div>
        <span className="text-xs font-bold text-slate-700">{config.label}</span>
        <span className="text-[10px] text-slate-400 ml-auto">
          {feedbacks.length} item{feedbacks.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Section Feedbacks */}
      <div className="p-2 space-y-2">
        {feedbacks.map((feedback, idx) => (
          <FeedbackItem
            key={feedback.id}
            feedback={feedback}
            showTimeline
            isLast={idx === feedbacks.length - 1}
            variant={variant === 'sidebar' ? 'compact' : 'default'}
            currentUserName={currentUserName}
          />
        ))}
      </div>
    </div>
  )
}

// Export for barrel file
export type { FeedbackTimelineProps, CustomerFeedbackData }
