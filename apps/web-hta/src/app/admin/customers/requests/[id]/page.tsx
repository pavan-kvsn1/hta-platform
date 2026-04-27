'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ChevronLeft,
  Loader2,
  UserPlus,
  Crown,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface CustomerRequest {
  id: string
  type: 'USER_ADDITION' | 'POC_CHANGE'
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  data: { name?: string; email?: string; newPocUserId?: string; reason?: string }
  newPocUser?: { id: string; name: string; email: string; isActive: boolean } | null
  customerAccount: {
    id: string
    companyName: string
    primaryPoc: { id: string; name: string; email: string } | null
  }
  requestedBy: { id: string; name: string; email: string } | null
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
}

export default function ReviewRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [request, setRequest] = useState<CustomerRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchRequest = async () => {
      try {
        const res = await apiFetch(`/api/admin/customers/requests/${id}`)
        if (res.ok) {
          const data = await res.json()
          setRequest(data.request)
        }
      } catch (error) {
        console.error('Failed to fetch request:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchRequest()
  }, [id])

  const handleApprove = async () => {
    setError('')
    setProcessing(true)
    try {
      const res = await apiFetch(`/api/admin/customers/requests/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve request')
      }
      router.push('/admin/customers/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve request')
    } finally {
      setProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      setError('Rejection reason is required')
      return
    }
    setError('')
    setProcessing(true)
    try {
      const res = await apiFetch(`/api/admin/customers/requests/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject request')
      }
      router.push('/admin/customers/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setProcessing(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <div className="text-center">
          <p className="text-[14px] text-[#dc2626] mb-2">Request not found</p>
          <Link href="/admin/customers/requests" className="text-[13px] text-[#2563eb] hover:underline">
            Back to requests
          </Link>
        </div>
      </div>
    )
  }

  const isPending = request.status === 'PENDING'

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8 max-w-[680px]">
        {/* Back Link */}
        <Link
          href="/admin/customers/requests"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Requests
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className={cn(
            'p-2 rounded-lg',
            request.type === 'USER_ADDITION' ? 'bg-[#eff6ff]' : 'bg-[#faf5ff]'
          )}>
            {request.type === 'USER_ADDITION' ? (
              <UserPlus className="size-5 text-[#2563eb]" />
            ) : (
              <Crown className="size-5 text-[#7c3aed]" />
            )}
          </div>
          <div>
            <h1 className="text-[22px] font-bold text-[#0f172a]">
              {request.type === 'USER_ADDITION' ? 'User Addition Request' : 'POC Change Request'}
            </h1>
            <p className="text-[13px] text-[#94a3b8]">
              {request.customerAccount.companyName}
            </p>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-2.5 mb-5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
            <XCircle className="size-3.5 text-[#dc2626] shrink-0" />
            <p className="text-[12px] text-[#dc2626]">{error}</p>
          </div>
        )}

        {/* Status Banner (if not pending) */}
        {!isPending && (
          <div className={cn(
            'flex items-center gap-2.5 p-3.5 rounded-[14px] border mb-5',
            request.status === 'APPROVED'
              ? 'bg-[#f0fdf4] border-[#bbf7d0]'
              : 'bg-[#fef2f2] border-[#fecaca]'
          )}>
            {request.status === 'APPROVED' ? (
              <CheckCircle className="size-4 text-[#16a34a] shrink-0" />
            ) : (
              <XCircle className="size-4 text-[#dc2626] shrink-0" />
            )}
            <div>
              <span className={cn(
                'text-[13px] font-semibold',
                request.status === 'APPROVED' ? 'text-[#16a34a]' : 'text-[#dc2626]'
              )}>
                {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
              </span>
              {request.reviewedBy && (
                <span className="text-[13px] text-[#64748b]"> by {request.reviewedBy.name}</span>
              )}
              {request.reviewedAt && (
                <span className="text-[13px] text-[#94a3b8]"> on {format(new Date(request.reviewedAt), 'PPP')}</span>
              )}
              {request.rejectionReason && (
                <p className="text-[12px] text-[#64748b] mt-1">
                  Reason: {request.rejectionReason}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Request Details */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
          <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
              Request Details
            </h3>
          </div>
          <div className="p-5 grid grid-cols-2 gap-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Company</p>
              <p className="text-[13px] font-medium text-[#0f172a]">{request.customerAccount.companyName}</p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Request Date</p>
              <p className="text-[13px] font-medium text-[#0f172a]">
                {format(new Date(request.createdAt), 'PPP p')}
              </p>
            </div>
            {request.requestedBy && (
              <div className="col-span-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Requested By</p>
                <p className="text-[13px] font-medium text-[#0f172a]">
                  {request.requestedBy.name} ({request.requestedBy.email})
                  {request.requestedBy.id === request.customerAccount.primaryPoc?.id && (
                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#d97706]">
                      POC
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* User Addition Details */}
        {request.type === 'USER_ADDITION' && (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                New User Details
              </h3>
            </div>
            <div className="p-5 grid grid-cols-2 gap-5">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Name</p>
                <p className="text-[13px] font-medium text-[#0f172a]">{request.data.name}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Email</p>
                <p className="text-[13px] font-medium text-[#0f172a]">{request.data.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* POC Change Details */}
        {request.type === 'POC_CHANGE' && (
          <>
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
              <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Current POC
                </h3>
              </div>
              <div className="p-5">
                {request.customerAccount.primaryPoc ? (
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-[#fffbeb] rounded-full flex items-center justify-center">
                      <Crown className="size-5 text-[#d97706]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">{request.customerAccount.primaryPoc.name}</p>
                      <p className="text-[12px] text-[#94a3b8]">{request.customerAccount.primaryPoc.email}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#94a3b8]">No current POC</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
              <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Requested New POC
                </h3>
              </div>
              <div className="p-5">
                {request.newPocUser ? (
                  <div className="flex items-center gap-3">
                    <div className="size-10 bg-[#faf5ff] rounded-full flex items-center justify-center">
                      <Crown className="size-5 text-[#7c3aed]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">{request.newPocUser.name}</p>
                      <p className="text-[12px] text-[#94a3b8]">{request.newPocUser.email}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-[13px] text-[#94a3b8]">User not found</p>
                )}
              </div>
            </div>

            {request.data.reason && (
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
                <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                    Reason for Change
                  </h3>
                </div>
                <div className="p-5">
                  <p className="text-[13px] text-[#64748b] italic">&ldquo;{request.data.reason}&rdquo;</p>
                </div>
              </div>
            )}

            {/* POC Change Warning */}
            {isPending && (
              <div className="flex gap-2.5 p-3.5 bg-[#fffbeb] border border-[#fde68a] rounded-[14px] mb-5">
                <AlertTriangle className="size-4 text-[#d97706] shrink-0 mt-0.5" />
                <div>
                  <p className="text-[13px] font-semibold text-[#92400e]">If approved:</p>
                  <ul className="mt-1 text-[12px] text-[#a16207] list-disc list-inside space-y-0.5">
                    <li>{request.newPocUser?.name || 'New user'} will become the new POC</li>
                    <li>{request.customerAccount.primaryPoc?.name || 'Current POC'} will become a regular user</li>
                    <li>Both parties will be notified via email</li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        {/* Decision Section (only for pending) */}
        {isPending && (
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Decision
              </h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={processing}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CheckCircle className="size-3.5" />
                  )}
                  Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={processing || !rejectionReason.trim()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-[12.5px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  {processing ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <XCircle className="size-3.5" />
                  )}
                  Reject
                </button>
              </div>

              <div>
                <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                  Rejection Reason <span className="text-[#94a3b8] font-normal text-[11px]">(required if rejecting)</span>
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                  rows={3}
                  className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Back button */}
        <Link
          href="/admin/customers/requests"
          className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
        >
          <ChevronLeft className="size-3.5" />
          Back to List
        </Link>
      </div>
    </div>
  )
}
