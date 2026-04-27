'use client'

import { apiFetch } from '@/lib/api-client'

import { useState } from 'react'
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
  ChevronDown,
  ChevronRight,
  Building2,
  Users,
  Mail,
  Clock,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface CustomerRequestData {
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

interface CompanyUser {
  id: string
  name: string
  email: string
  isPoc: boolean
  isActive: boolean
}

interface RecentRequest {
  id: string
  type: string
  status: string
  createdAt: string
  details: string
}

interface CustomerRequestViewProps {
  request: CustomerRequestData
  companyUsers?: CompanyUser[]
  recentRequests?: RecentRequest[]
}

export function CustomerRequestView({
  request,
  companyUsers = [],
  recentRequests = []
}: CustomerRequestViewProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [error, setError] = useState('')
  const [isDecisionExpanded, setIsDecisionExpanded] = useState(true)
  const [isCompanyUsersExpanded, setIsCompanyUsersExpanded] = useState(true)
  const [isRecentRequestsExpanded, setIsRecentRequestsExpanded] = useState(true)

  const isPending = request.status === 'PENDING'
  const isUserAddition = request.type === 'USER_ADDITION'

  const handleApprove = async () => {
    setError('')
    setProcessing(true)
    try {
      const res = await apiFetch(`/api/admin/customers/requests/${request.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve request')
      }
      router.push('/admin/requests')
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
      const res = await apiFetch(`/api/admin/customers/requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectionReason }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reject request')
      }
      router.push('/admin/requests')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-[#f1f5f9]">
      {/* Left Side - Request Details */}
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-6 pr-3">
        {/* Header */}
        <div className="mb-5">
          <Link
            href="/admin/requests"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-4 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Requests
          </Link>

          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-[9px]',
              isUserAddition ? 'bg-[#dcfce7]' : 'bg-[#ede9fe]'
            )}>
              {isUserAddition ? (
                <UserPlus className="size-5 text-[#16a34a]" />
              ) : (
                <Crown className="size-5 text-[#7c3aed]" />
              )}
            </div>
            <h1 className="text-[22px] font-bold text-[#0f172a]">
              {isUserAddition ? 'User Addition Request' : 'POC Change Request'}
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

          {/* Meta */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] mt-3">
            <div className="flex items-center gap-2 text-[#64748b]">
              <Building2 className="size-4 text-[#94a3b8]" />
              <span className="font-semibold text-[#0f172a]">{request.customerAccount.companyName}</span>
            </div>
            <div className="flex items-center gap-2 text-[#94a3b8]">
              <Clock className="size-4" />
              <span>{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
            </div>
          </div>
        </div>

        {/* Request Summary Banner */}
        <div className={cn(
          'rounded-[14px] border overflow-hidden mb-5',
          isUserAddition ? 'bg-[#f0fdf4] border-[#bbf7d0]' : 'bg-[#faf5ff] border-[#e9d5ff]'
        )}>
          <div className={cn(
            'px-5 py-3 border-b',
            isUserAddition ? 'border-[#bbf7d0] bg-[#dcfce7]/50' : 'border-[#e9d5ff] bg-[#ede9fe]/50'
          )}>
            <div className="flex items-center gap-3">
              <div className={cn(
                'p-2 rounded-[9px]',
                isUserAddition ? 'bg-[#bbf7d0]' : 'bg-[#ddd6fe]'
              )}>
                {isUserAddition ? (
                  <UserPlus className="size-5 text-[#15803d]" />
                ) : (
                  <Crown className="size-5 text-[#6d28d9]" />
                )}
              </div>
              <div>
                <h3 className={cn(
                  'font-bold text-[13px]',
                  isUserAddition ? 'text-[#14532d]' : 'text-[#3b0764]'
                )}>
                  {isUserAddition ? 'New User Details' : 'POC Change Details'}
                </h3>
                <p className={cn(
                  'text-[12px]',
                  isUserAddition ? 'text-[#16a34a]' : 'text-[#7c3aed]'
                )}>
                  {request.requestedBy
                    ? `Requested by ${request.requestedBy.name}`
                    : 'System request'} &bull; {format(new Date(request.createdAt), 'PPp')}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            {isUserAddition ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Name</p>
                    <p className="text-[13px] font-semibold text-[#0f172a]">{request.data.name}</p>
                  </div>
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-1">Email</p>
                    <p className="text-[13px] font-semibold text-[#0f172a]">{request.data.email}</p>
                  </div>
                </div>
                <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 className="size-4 text-[#94a3b8]" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Company Info</p>
                  </div>
                  <p className="text-[13px] font-semibold text-[#0f172a]">{request.customerAccount.companyName}</p>
                  <p className="text-[12px] text-[#64748b] mt-1">
                    Current users: {companyUsers.length} | POC: {request.customerAccount.primaryPoc?.name || 'None'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-3">Current POC</p>
                    {request.customerAccount.primaryPoc ? (
                      <div className="flex items-center gap-3">
                        <div className="size-10 bg-[#fef3c7] rounded-full flex items-center justify-center">
                          <Crown className="size-5 text-[#d97706]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#0f172a] text-[13px]">{request.customerAccount.primaryPoc.name}</p>
                          <p className="text-[12px] text-[#94a3b8]">{request.customerAccount.primaryPoc.email}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[#94a3b8] text-[13px]">No current POC</p>
                    )}
                  </div>
                  <div className="flex items-center justify-center">
                    <div className="text-[#cbd5e1] text-3xl">&rarr;</div>
                  </div>
                </div>
                <div className="bg-white rounded-[9px] border-2 border-[#e9d5ff] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#7c3aed] mb-3">Requested New POC</p>
                  {request.newPocUser ? (
                    <div className="flex items-center gap-3">
                      <div className="size-10 bg-[#ede9fe] rounded-full flex items-center justify-center">
                        <Crown className="size-5 text-[#7c3aed]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#0f172a] text-[13px]">{request.newPocUser.name}</p>
                        <p className="text-[12px] text-[#94a3b8]">{request.newPocUser.email}</p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[#94a3b8] text-[13px]">User not found</p>
                  )}
                </div>
                {request.data.reason && (
                  <div className="bg-white rounded-[9px] border border-[#e2e8f0] p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-2">Reason for Change</p>
                    <p className="text-[13px] text-[#64748b] italic">&ldquo;{request.data.reason}&rdquo;</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Company Users */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden mb-5">
          <button
            onClick={() => setIsCompanyUsersExpanded(!isCompanyUsersExpanded)}
            className="w-full px-5 py-3 bg-[#f8fafc] flex items-center justify-between hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              {isCompanyUsersExpanded ? (
                <ChevronDown className="size-4 text-[#94a3b8]" />
              ) : (
                <ChevronRight className="size-4 text-[#94a3b8]" />
              )}
              <Users className="size-4 text-[#64748b]" />
              <h3 className="font-semibold text-[#0f172a] text-[13px]">Company Users ({companyUsers.length})</h3>
            </div>
          </button>
          {isCompanyUsersExpanded && (
            companyUsers.length > 0 ? (
              <div className="divide-y divide-[#f1f5f9] border-t border-[#e2e8f0]">
                {companyUsers.map((user) => (
                  <div key={user.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        'size-8 rounded-full flex items-center justify-center',
                        user.isPoc ? 'bg-[#fef3c7]' : 'bg-[#f1f5f9]'
                      )}>
                        {user.isPoc ? (
                          <Crown className="size-4 text-[#d97706]" />
                        ) : (
                          <span className="text-[12px] font-medium text-[#64748b]">
                            {user.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-[#0f172a] text-[13px]">
                          {user.name}
                          {user.isPoc && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fef3c7] text-[#d97706]">POC</span>
                          )}
                        </p>
                        <p className="text-[12px] text-[#94a3b8]">{user.email}</p>
                      </div>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-semibold',
                      user.isActive ? 'bg-[#f0fdf4] text-[#16a34a]' : 'bg-[#f1f5f9] text-[#94a3b8]'
                    )}>
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center border-t border-[#e2e8f0]">
                <p className="text-[13px] text-[#94a3b8]">No users in this company</p>
              </div>
            )
          )}
        </div>

        {/* Recent Requests */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setIsRecentRequestsExpanded(!isRecentRequestsExpanded)}
            className="w-full px-5 py-3 bg-[#f8fafc] flex items-center justify-between hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              {isRecentRequestsExpanded ? (
                <ChevronDown className="size-4 text-[#94a3b8]" />
              ) : (
                <ChevronRight className="size-4 text-[#94a3b8]" />
              )}
              <Clock className="size-4 text-[#64748b]" />
              <h3 className="font-semibold text-[#0f172a] text-[13px]">Recent Requests ({recentRequests.length})</h3>
            </div>
          </button>
          {isRecentRequestsExpanded && (
            recentRequests.length > 0 ? (
              <div className="divide-y divide-[#f1f5f9] border-t border-[#e2e8f0]">
                {recentRequests.map((req) => (
                  <div key={req.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {req.status === 'APPROVED' ? (
                        <CheckCircle className="size-4 text-[#16a34a]" />
                      ) : req.status === 'REJECTED' ? (
                        <XCircle className="size-4 text-[#dc2626]" />
                      ) : (
                        <Clock className="size-4 text-[#d97706]" />
                      )}
                      <div>
                        <p className="text-[13px] text-[#0f172a]">{req.details}</p>
                        <p className="text-[11px] text-[#94a3b8]">
                          {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      'px-2 py-0.5 rounded-md text-[10px] font-semibold',
                      req.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
                      req.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]',
                      req.status === 'PENDING' && 'bg-[#fffbeb] text-[#d97706]'
                    )}>
                      {req.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-8 text-center border-t border-[#e2e8f0]">
                <p className="text-[13px] text-[#94a3b8]">No previous requests from this company</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Right Panel - Decision */}
      <div className="w-[420px] flex-shrink-0 p-6 pl-3 overflow-y-auto">
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <button
            onClick={() => setIsDecisionExpanded(!isDecisionExpanded)}
            className="w-full flex items-center justify-between px-5 py-3 bg-[#f8fafc] hover:bg-[#f1f5f9] transition-colors"
          >
            <div className="flex items-center gap-2">
              {isDecisionExpanded ? (
                <ChevronDown className="size-4 text-[#94a3b8]" />
              ) : (
                <ChevronRight className="size-4 text-[#94a3b8]" />
              )}
              <span className="text-[11px] font-bold text-[#0f172a] uppercase tracking-[0.07em]">
                Decision Panel
              </span>
            </div>
            <span className={cn(
              'px-2 py-0.5 rounded-md text-[10px] font-semibold',
              isPending && 'bg-[#fffbeb] text-[#d97706]',
              request.status === 'APPROVED' && 'bg-[#f0fdf4] text-[#16a34a]',
              request.status === 'REJECTED' && 'bg-[#fef2f2] text-[#dc2626]'
            )}>
              {request.status}
            </span>
          </button>

          {isDecisionExpanded && (
            <div className="border-t border-[#e2e8f0]">
              {/* Request Info */}
              <div className="p-4 bg-[#f8fafc] border-b border-[#f1f5f9]">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Requested</p>
                    <p className="font-medium text-[#0f172a] mt-0.5 text-[12px]">
                      {format(new Date(request.createdAt), 'PPp')}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">By</p>
                    <p className="font-medium text-[#0f172a] mt-0.5 text-[12px]">
                      {request.requestedBy?.name || 'System'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Company</p>
                    <p className="font-medium text-[#0f172a] mt-0.5 text-[12px]">
                      {request.customerAccount.companyName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Status for processed requests */}
                {!isPending && (
                  <div className={cn(
                    'p-4 rounded-[9px]',
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
                    {request.rejectionReason && (
                      <p className="mt-2 text-[12px] text-[#64748b] italic">
                        &ldquo;{request.rejectionReason}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Pending action form */}
                {isPending && (
                  <>
                    {/* Warning for POC Change */}
                    {!isUserAddition && (
                      <div className="mb-4 p-3 bg-[#fffbeb] border border-[#fde68a] rounded-[9px]">
                        <div className="flex gap-2">
                          <AlertTriangle className="size-4 text-[#d97706] flex-shrink-0 mt-0.5" />
                          <div className="text-[12px]">
                            <p className="font-semibold text-[#92400e]">If approved:</p>
                            <ul className="mt-1 text-[#d97706] list-disc list-inside space-y-0.5">
                              <li>{request.newPocUser?.name || 'New user'} becomes POC</li>
                              <li>{request.customerAccount.primaryPoc?.name || 'Current POC'} becomes regular</li>
                              <li>Both will be notified</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Info for User Addition */}
                    {isUserAddition && (
                      <div className="mb-4 p-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[9px]">
                        <div className="flex gap-2">
                          <Mail className="size-4 text-[#16a34a] flex-shrink-0 mt-0.5" />
                          <div className="text-[12px]">
                            <p className="font-semibold text-[#14532d]">If approved:</p>
                            <ul className="mt-1 text-[#16a34a] list-disc list-inside space-y-0.5">
                              <li>User account will be created</li>
                              <li>Invite email sent to {request.data.email}</li>
                              <li>User can access certificates</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="mb-4 p-3 text-[12px] text-[#dc2626] bg-[#fef2f2] rounded-[9px] border border-[#fecaca]">
                        {error}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <label htmlFor="rejectionReason" className="block text-[12px] font-semibold text-[#0f172a] mb-2">
                          Rejection Reason (required if rejecting)
                        </label>
                        <textarea
                          id="rejectionReason"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Enter reason for rejection..."
                          rows={6}
                          className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={handleReject}
                          disabled={processing || !rejectionReason.trim()}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold border border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {processing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <XCircle className="size-4" />
                          )}
                          Reject
                        </button>
                        <button
                          onClick={handleApprove}
                          disabled={processing}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {processing ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <CheckCircle className="size-4" />
                          )}
                          Approve
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
