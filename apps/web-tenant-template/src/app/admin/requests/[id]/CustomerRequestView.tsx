'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
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
      const res = await fetch(`/api/admin/customers/requests/${request.id}/approve`, {
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
      const res = await fetch(`/api/admin/customers/requests/${request.id}/reject`, {
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
    <div className="flex h-full p-3 overflow-hidden bg-section-inner">
      {/* Left Side - Request Details */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/requests"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <ArrowLeft className="size-5" strokeWidth={2} />
                </Link>
                <span className="text-slate-300 text-xl">|</span>
                <div className={cn(
                  'p-2 rounded-lg',
                  isUserAddition ? 'bg-green-100' : 'bg-purple-100'
                )}>
                  {isUserAddition ? (
                    <UserPlus className="size-5 text-green-600" />
                  ) : (
                    <Crown className="size-5 text-purple-600" />
                  )}
                </div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  {isUserAddition ? 'User Addition Request' : 'POC Change Request'}
                </h1>
                <Badge className={cn(
                  'px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                  isPending && 'bg-amber-50 text-amber-700 border-amber-200',
                  request.status === 'APPROVED' && 'bg-green-50 text-green-700 border-green-200',
                  request.status === 'REJECTED' && 'bg-red-50 text-red-700 border-red-200'
                )}>
                  {request.status}
                </Badge>
              </div>
            </div>

            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm mt-3">
              <div className="flex items-center gap-2 text-slate-600">
                <Building2 className="size-4 text-slate-400" />
                <span className="font-semibold">{request.customerAccount.companyName}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <Clock className="size-4 text-slate-400" />
                <span>{formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}</span>
              </div>
            </div>
          </div>

          {/* Content Area - Scrollable */}
          <div className="flex-1 overflow-auto bg-slate-50/30">
            <div className="p-6 space-y-6">
              {/* Request Summary Banner */}
              <div className={cn(
                'rounded-xl border-2 overflow-hidden',
                isUserAddition
                  ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200'
                  : 'bg-gradient-to-r from-purple-50 to-violet-50 border-purple-200'
              )}>
                <div className={cn(
                  'px-5 py-4 border-b',
                  isUserAddition ? 'border-green-200 bg-green-100/50' : 'border-purple-200 bg-purple-100/50'
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'p-2 rounded-lg',
                      isUserAddition ? 'bg-green-200' : 'bg-purple-200'
                    )}>
                      {isUserAddition ? (
                        <UserPlus className={cn('size-5', isUserAddition ? 'text-green-700' : 'text-purple-700')} />
                      ) : (
                        <Crown className="size-5 text-purple-700" />
                      )}
                    </div>
                    <div>
                      <h3 className={cn(
                        'font-bold',
                        isUserAddition ? 'text-green-900' : 'text-purple-900'
                      )}>
                        {isUserAddition ? 'New User Details' : 'POC Change Details'}
                      </h3>
                      <p className={cn(
                        'text-xs',
                        isUserAddition ? 'text-green-600' : 'text-purple-600'
                      )}>
                        {request.requestedBy
                          ? `Requested by ${request.requestedBy.name}`
                          : 'System request'} • {format(new Date(request.createdAt), 'PPp')}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  {isUserAddition ? (
                    /* User Addition Details */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Name</p>
                          <p className="text-sm font-semibold text-slate-900">{request.data.name}</p>
                        </div>
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Email</p>
                          <p className="text-sm font-semibold text-slate-900">{request.data.email}</p>
                        </div>
                      </div>

                      {/* Company Info */}
                      <div className="bg-white rounded-lg border border-slate-200 p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <Building2 className="size-4 text-slate-500" />
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Company Info</p>
                        </div>
                        <p className="text-sm font-semibold text-slate-900">{request.customerAccount.companyName}</p>
                        <p className="text-sm text-slate-500 mt-1">
                          Current users: {companyUsers.length} | POC: {request.customerAccount.primaryPoc?.name || 'None'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    /* POC Change Details */
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        {/* Current POC */}
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Current POC</p>
                          {request.customerAccount.primaryPoc ? (
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                                <Crown className="h-5 w-5 text-amber-600" />
                              </div>
                              <div>
                                <p className="font-semibold text-slate-900">{request.customerAccount.primaryPoc.name}</p>
                                <p className="text-sm text-slate-500">{request.customerAccount.primaryPoc.email}</p>
                              </div>
                            </div>
                          ) : (
                            <p className="text-slate-500">No current POC</p>
                          )}
                        </div>

                        {/* Arrow */}
                        <div className="flex items-center justify-center">
                          <div className="text-slate-300 text-3xl">→</div>
                        </div>
                      </div>

                      {/* New POC */}
                      <div className="bg-white rounded-lg border-2 border-purple-200 p-4">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3">Requested New POC</p>
                        {request.newPocUser ? (
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                              <Crown className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900">{request.newPocUser.name}</p>
                              <p className="text-sm text-slate-500">{request.newPocUser.email}</p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-500">User not found</p>
                        )}
                      </div>

                      {/* Reason */}
                      {request.data.reason && (
                        <div className="bg-white rounded-lg border border-slate-200 p-4">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Reason for Change</p>
                          <p className="text-slate-700 italic">&ldquo;{request.data.reason}&rdquo;</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Company Users Section */}
              <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                <button
                  onClick={() => setIsCompanyUsersExpanded(!isCompanyUsersExpanded)}
                  className="w-full px-5 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCompanyUsersExpanded ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                    <Users className="size-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-700 text-sm">Company Users ({companyUsers.length})</h3>
                  </div>
                </button>
                {isCompanyUsersExpanded && (
                  companyUsers.length > 0 ? (
                    <div className="divide-y divide-slate-100 border-t border-slate-200">
                      {companyUsers.map((user) => (
                        <div key={user.id} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              'h-8 w-8 rounded-full flex items-center justify-center',
                              user.isPoc ? 'bg-amber-100' : 'bg-slate-100'
                            )}>
                              {user.isPoc ? (
                                <Crown className="h-4 w-4 text-amber-600" />
                              ) : (
                                <span className="text-sm font-medium text-slate-500">
                                  {user.name.charAt(0).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div>
                              <p className="font-medium text-slate-900 text-sm">
                                {user.name}
                                {user.isPoc && (
                                  <Badge className="ml-2 bg-amber-100 text-amber-700 text-[10px]">POC</Badge>
                                )}
                              </p>
                              <p className="text-xs text-slate-500">{user.email}</p>
                            </div>
                          </div>
                          <Badge className={cn(
                            'text-[10px]',
                            user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          )}>
                            {user.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center border-t border-slate-200">
                      <p className="text-sm text-slate-400">No users in this company</p>
                    </div>
                  )
                )}
              </div>

              {/* Recent Requests Section */}
              <div className="bg-white rounded-lg border border-slate-300 overflow-hidden">
                <button
                  onClick={() => setIsRecentRequestsExpanded(!isRecentRequestsExpanded)}
                  className="w-full px-5 py-3 bg-slate-50 flex items-center justify-between hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isRecentRequestsExpanded ? (
                      <ChevronDown className="size-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="size-4 text-slate-400" />
                    )}
                    <Clock className="size-4 text-slate-500" />
                    <h3 className="font-semibold text-slate-700 text-sm">Recent Requests ({recentRequests.length})</h3>
                  </div>
                </button>
                {isRecentRequestsExpanded && (
                  recentRequests.length > 0 ? (
                    <div className="divide-y divide-slate-100 border-t border-slate-200">
                      {recentRequests.map((req) => (
                        <div key={req.id} className="px-5 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {req.status === 'APPROVED' ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : req.status === 'REJECTED' ? (
                              <XCircle className="h-4 w-4 text-red-500" />
                            ) : (
                              <Clock className="h-4 w-4 text-amber-500" />
                            )}
                            <div>
                              <p className="text-sm text-slate-700">{req.details}</p>
                              <p className="text-xs text-slate-400">
                                {formatDistanceToNow(new Date(req.createdAt), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                          <Badge className={cn(
                            'text-[10px]',
                            req.status === 'APPROVED' && 'bg-green-100 text-green-700',
                            req.status === 'REJECTED' && 'bg-red-100 text-red-700',
                            req.status === 'PENDING' && 'bg-amber-100 text-amber-700'
                          )}>
                            {req.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-5 py-8 text-center border-t border-slate-200">
                      <p className="text-sm text-slate-400">No previous requests from this company</p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Decision */}
      <div className="w-[500px] flex-shrink-0 flex flex-col px-3 overflow-y-auto">
        <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsDecisionExpanded(!isDecisionExpanded)}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {isDecisionExpanded ? (
                <ChevronDown className="size-4 text-slate-400" />
              ) : (
                <ChevronRight className="size-4 text-slate-400" />
              )}
              <span className="text-sm font-bold text-slate-700 uppercase tracking-wider">
                Decision Panel
              </span>
            </div>
            <Badge className={cn(
              'text-[10px]',
              isPending && 'bg-amber-100 text-amber-700',
              request.status === 'APPROVED' && 'bg-green-100 text-green-700',
              request.status === 'REJECTED' && 'bg-red-100 text-red-700'
            )}>
              {request.status}
            </Badge>
          </button>

          {isDecisionExpanded && (
            <div className="border-t border-slate-100">
              {/* Request Info */}
              <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wider">Requested</p>
                    <p className="font-medium text-slate-700 mt-0.5 text-sm">
                      {format(new Date(request.createdAt), 'PPp')}3
                    </p>
                  </div>
                  <div>
                    <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wider">By</p>
                    <p className="font-medium text-slate-700 mt-0.5 text-sm">
                      {request.requestedBy?.name || 'System'}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[12px] font-medium text-slate-400 uppercase tracking-wider">Company</p>
                    <p className="font-medium text-slate-700 mt-0.5 text-sm">
                      {request.customerAccount.companyName}
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4">
                {/* Status Info for processed requests */}
                {!isPending && (
                  <div className={cn(
                    'p-4 rounded-lg',
                    request.status === 'APPROVED' && 'bg-green-50 border border-green-200',
                    request.status === 'REJECTED' && 'bg-red-50 border border-red-200'
                  )}>
                    <div className="flex items-center gap-2 mb-2 text-sm">
                      {request.status === 'APPROVED' ? (
                        <CheckCircle className="size-5 text-green-600" />
                      ) : (
                        <XCircle className="size-5 text-red-600" />
                      )}
                      <span className="font-semibold text-slate-900">
                        {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                      </span>
                    </div>
                    {request.reviewedBy && (
                      <p className="text-sm text-slate-600">
                        by {request.reviewedBy.name}
                        {request.reviewedAt && (
                          <span> on {format(new Date(request.reviewedAt), 'PPP')}</span>
                        )}
                      </p>
                    )}
                    {request.rejectionReason && (
                      <p className="mt-2 text-sm text-slate-600 italic">
                        &ldquo;{request.rejectionReason}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Action Form (only for pending) */}
                {isPending && (
                  <>
                    {/* Warning for POC Change */}
                    {!isUserAddition && (
                      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-amber-800">If approved:</p>
                            <ul className="mt-1 text-amber-700 list-disc list-inside space-y-0.5">
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
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex gap-2">
                          <Mail className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                          <div className="text-sm">
                            <p className="font-medium text-green-800">If approved:</p>
                            <ul className="mt-1 text-green-700 list-disc list-inside space-y-0.5">
                              <li>User account will be created</li>
                              <li>Invite email sent to {request.data.email}</li>
                              <li>User can access certificates</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                        {error}
                      </div>
                    )}

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="rejectionReason" className="text-sm font-medium text-slate-700">
                          Rejection Reason (required if rejecting)
                        </Label>
                        <Textarea
                          id="rejectionReason"
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Enter reason for rejection..."
                          rows={6}
                          className="mt-2 text-sm border border-slate-300"
                        />
                      </div>

                      <div className="flex gap-3">
                        <Button
                          onClick={handleReject}
                          disabled={processing || !rejectionReason.trim()}
                          variant="outline"
                          className="flex-1 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          {processing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4 mr-2" />
                          )}
                          Reject
                        </Button>
                        <Button
                          onClick={handleApprove}
                          disabled={processing}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          {processing ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-2" />
                          )}
                          Approve
                        </Button>
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
