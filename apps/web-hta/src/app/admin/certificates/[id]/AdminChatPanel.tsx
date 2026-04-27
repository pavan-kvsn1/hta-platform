'use client'

import { useState } from 'react'
import { ChatSidebar } from '@/components/chat/ChatSidebar'
import { cn } from '@/lib/utils'
import type { Assignee } from './AdminCertificateClient'

interface AdminChatPanelProps {
  certificateId: string
  assignee: Assignee
  customerName: string | null
}

export function AdminChatPanel({
  certificateId,
  assignee,
  customerName,
}: AdminChatPanelProps) {
  const [activeChatTab, setActiveChatTab] = useState<'engineer' | 'customer'>('engineer')

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Person Header */}
      <div className="flex-shrink-0 px-[18px] py-[14px] border-b border-[#f8fafc]">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-[#334155] text-white flex items-center justify-center font-semibold text-[13px] flex-shrink-0">
            {activeChatTab === 'engineer'
              ? assignee.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
              : (customerName || 'C').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
            }
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[#0f172a] truncate">
              {activeChatTab === 'engineer' ? assignee.name : (customerName || 'Customer')}
            </p>
            <p className="text-[12px] text-[#94a3b8] flex items-center gap-1.5">
              {activeChatTab === 'engineer' ? (
                <>
                  <span>Engineer</span>
                  <span className="size-1.5 rounded-full bg-[#22c55e]" />
                  <span className="text-[#16a34a]">Online</span>
                </>
              ) : (
                <span>{customerName ? 'Customer' : 'No customer assigned'}</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Pill-Style Tab Switcher */}
      <div className="flex-shrink-0 px-[18px] py-2.5 border-b border-[#f1f5f9] bg-white">
        <div className="flex bg-[#f1f5f9] rounded-full p-1">
          <button
            onClick={() => setActiveChatTab('engineer')}
            className={cn(
              'flex-1 px-4 py-1.5 text-[12px] font-medium rounded-full transition-all',
              activeChatTab === 'engineer'
                ? 'bg-white text-[#0f172a] shadow-sm'
                : 'text-[#94a3b8] hover:text-[#64748b]'
            )}
          >
            Engineer
          </button>
          <button
            onClick={() => setActiveChatTab('customer')}
            className={cn(
              'flex-1 px-4 py-1.5 text-[12px] font-medium rounded-full transition-all',
              activeChatTab === 'customer'
                ? 'bg-white text-[#0f172a] shadow-sm'
                : 'text-[#94a3b8] hover:text-[#64748b]'
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
  )
}
