'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft,
  Loader2,
  KeyRound,
  CheckCircle,
  XCircle,
  User,
  Clock,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface OfflineCodeRequestData {
  id: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { reason?: string | null }
  requestedBy: { id: string; name: string; email: string }
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  adminNote: string | null
  createdAt: string
}

interface OfflineCodeRequestClientProps {
  request: OfflineCodeRequestData
}

export function OfflineCodeRequestClient({ request }: OfflineCodeRequestClientProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [error, setError] = useState('')

  const isPending = request.status === 'PENDING'

  const handleReview = async (action: 'approve' | 'reject') => {
    setError('')
    setProcessing(true)
    try {
      const res = await apiFetch(`/api/admin/internal-requests/${request.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          adminNote: adminNote.trim() || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${action} request`)
      }
      router.push('/admin/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} request`)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="max-w-2xl mx-auto px-6 py-8">
        {/* Back Link */}
        <Link
          href="/admin/requests"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Requests
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-[9px] bg-[#ede9fe]">
            <KeyRound className="size-5 text-[#6d28d9]" />
          </div>
          <h1 className="text-[22px] font-bold text-[#0f172a]">
            Offline Code Card Request
          </h1>
          <span className={cn(
            'px-2 py-0.5 rounded-md text-[11px] font-semibold',
            isPending && 'bg-[#fffbeb] text-[#d97706]',
            request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
            request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]'
          )}>
            {request.status}
          </span>
        </div>

        {/* Request Details Card */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
          <div className="px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Request Details
            </span>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-2">
                <User className="size-4 text-[#94a3b8]" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Requested By</p>
                  <p className="text-[13px] font-medium text-[#0f172a]">{request.requestedBy.name}</p>
                  <p className="text-[12px] text-[#64748b]">{request.requestedBy.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="size-4 text-[#94a3b8]" />
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Submitted</p>
                  <p className="text-[13px] font-medium text-[#0f172a]">
                    {format(new Date(request.createdAt), 'PPp')}
                  </p>
                  <p className="text-[12px] text-[#64748b]">
                    {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>

            {request.data.reason && (
              <div className="bg-[#f8fafc] rounded-[9px] border border-[#e2e8f0] p-4">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">Reason</p>
                <p className="text-[13px] text-[#64748b] whitespace-pre-wrap">{request.data.reason}</p>
              </div>
            )}

            <div className="bg-[#ede9fe] rounded-[9px] border border-[#c4b5fd] p-4">
              <p className="text-[12px] text-[#6d28d9]">
                Approving this request will generate a new 50-pair challenge-response card for the engineer,
                valid for 30 days. Any existing card will be replaced.
              </p>
            </div>
          </div>
        </div>

        {/* Decision Card */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <div className="px-5 py-3 border-b border-[#e2e8f0] bg-[#f8fafc]">
            <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Decision
            </span>
          </div>
          <div className="p-5">
            {/* Status for processed requests */}
            {!isPending && (
              <div className={cn(
                'p-4 rounded-[9px] mb-4',
                request.status === 'APPROVED' && 'bg-[#f0fdf4] border border-[#bbf7d0]',
                request.status === 'REJECTED' && 'bg-[#fef2f2] border border-[#fecaca]'
              )}>
                <div className="flex items-center gap-2 mb-2 text-[13px]">
                  {request.status === 'APPROVED' ? (
                    <CheckCircle className="size-5 text-[#16a34a]" />
                  ) : (
                    <XCircle className="size-5 text-[#dc2626]" />
                  )}
                  <span className="font-semibold text-[#0f172a]">
                    {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  </span>
                </div>
                {request.reviewedBy && (
                  <p className="text-[12px] text-[#64748b]">
                    by {request.reviewedBy.name}
                    {request.reviewedAt && (
                      <span> on {format(new Date(request.reviewedAt), 'PPP')}</span>
                    )}
                  </p>
                )}
                {request.adminNote && (
                  <p className="mt-2 text-[12px] text-[#64748b] italic">
                    &ldquo;{request.adminNote}&rdquo;
                  </p>
                )}
              </div>
            )}

            {/* Action Form (only for pending) */}
            {isPending && (
              <div className="space-y-4">
                {error && (
                  <div className="p-3 text-[12px] text-[#dc2626] bg-[#fef2f2] rounded-[9px] border border-[#fecaca]">
                    {error}
                  </div>
                )}

                <div>
                  <label htmlFor="adminNote" className="block text-[12px] font-semibold text-[#0f172a] mb-2">
                    Note to Engineer (optional)
                  </label>
                  <textarea
                    id="adminNote"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Add a note for the engineer..."
                    rows={3}
                    className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => handleReview('reject')}
                    disabled={processing}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <XCircle className="size-4" />
                    )}
                    Reject
                  </button>
                  <button
                    onClick={() => handleReview('approve')}
                    disabled={processing}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {processing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CheckCircle className="size-4" />
                    )}
                    Approve & Generate Card
                  </button>
                </div>

                <p className="text-[10px] text-[#94a3b8] text-center">
                  Approving will generate a 50-pair challenge-response card valid for 30 days.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
