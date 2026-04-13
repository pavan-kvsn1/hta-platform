'use client'

import { useState } from 'react'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AdminAuthChatPanelProps {
  certificateId: string
  assigneeName: string
  customerName: string | null
}

export function AdminAuthChatPanel({
  certificateId,
  assigneeName,
  customerName,
}: AdminAuthChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [activeChatTab, setActiveChatTab] = useState<'engineer' | 'customer'>('engineer')

  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden',
        isExpanded ? 'flex-1 min-h-0' : 'flex-shrink-0'
      )}
    >
      {/* Header - Collapsible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="size-4 text-slate-400" />
          ) : (
            <ChevronRight className="size-4 text-slate-400" />
          )}
          <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Chat
          </span>
        </div>
        {!isExpanded && (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Eng</span>
            <span>|</span>
            <span>Cust</span>
          </div>
        )}
      </button>

      {/* Content - Only when expanded */}
      {isExpanded && (
        <div className="flex-1 flex flex-col min-h-0 border-t border-slate-100">
          {/* Person Header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div className="size-10 rounded-full bg-slate-700 text-white flex items-center justify-center font-semibold text-sm flex-shrink-0">
                {activeChatTab === 'engineer'
                  ? assigneeName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                  : (customerName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                }
              </div>
              {/* Name & Status */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {activeChatTab === 'engineer' ? assigneeName : (customerName || 'Customer')}
                </p>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  {activeChatTab === 'engineer' ? (
                    <>
                      <span>Assignee ↔ Reviewer</span>
                    </>
                  ) : (
                    <>
                      <span>Reviewer ↔ Customer</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Pill-Style Tab Switcher */}
          <div className="flex-shrink-0 px-4 py-2 border-b border-slate-200 bg-white">
            <div className="flex bg-slate-100 rounded-full p-1">
              <button
                onClick={() => setActiveChatTab('engineer')}
                className={cn(
                  'flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition-all',
                  activeChatTab === 'engineer'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Engineer
              </button>
              <button
                onClick={() => setActiveChatTab('customer')}
                className={cn(
                  'flex-1 px-4 py-1.5 text-xs font-medium rounded-full transition-all',
                  activeChatTab === 'customer'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                Customer
              </button>
            </div>
          </div>

          {/* Chat Messages Area */}
          <div className="flex-1 min-h-0 overflow-hidden text-xs">
            {activeChatTab === 'engineer' ? (
              <ChatSidebar
                isOpen={true}
                onClose={() => {}}
                certificateId={certificateId}
                threadType="ASSIGNEE_REVIEWER"
                embedded={true}
              />
            ) : (
              <ChatSidebar
                isOpen={true}
                onClose={() => {}}
                certificateId={certificateId}
                threadType="REVIEWER_CUSTOMER"
                embedded={true}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
