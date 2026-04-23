'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Loader2,
  UserPlus,
  Crown,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react'
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
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="p-6">
        <p className="text-red-600">Request not found</p>
        <Link href="/admin/customers/requests" className="text-blue-600 hover:underline">
          Back to requests
        </Link>
      </div>
    )
  }

  const isPending = request.status === 'PENDING'

  return (
    <div className="p-3 h-full">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <div className="max-w-2xl">
            {/* Back Link */}
            <Link
              href="/admin/customers/requests"
              className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Requests
            </Link>

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              {request.type === 'USER_ADDITION' ? (
                <div className="p-2 bg-blue-100 rounded-lg">
                  <UserPlus className="h-6 w-6 text-blue-600" />
                </div>
              ) : (
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Crown className="h-6 w-6 text-purple-600" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">
                  {request.type === 'USER_ADDITION' ? 'User Addition Request' : 'POC Change Request'}
                </h1>
                <p className="text-slate-500">
                  {request.customerAccount.companyName}
                </p>
              </div>
            </div>

            {error && (
              <div className="mb-6 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            {/* Request Status (if not pending) */}
            {!isPending && (
              <Card className="mb-6">
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    {request.status === 'APPROVED' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <span className="font-medium">
                      {request.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                    </span>
                    {request.reviewedBy && (
                      <span className="text-slate-500">
                        by {request.reviewedBy.name}
                      </span>
                    )}
                    {request.reviewedAt && (
                      <span className="text-slate-500">
                        on {format(new Date(request.reviewedAt), 'PPP')}
                      </span>
                    )}
                  </div>
                  {request.rejectionReason && (
                    <p className="mt-2 text-sm text-slate-600">
                      Reason: {request.rejectionReason}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Request Details */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg">Request Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-slate-500">Company</p>
                    <p className="font-medium">{request.customerAccount.companyName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Request Date</p>
                    <p className="font-medium">
                      {format(new Date(request.createdAt), 'PPP p')}
                    </p>
                  </div>
                  {request.requestedBy && (
                    <div className="col-span-2">
                      <p className="text-sm text-slate-500">Requested By</p>
                      <p className="font-medium">
                        {request.requestedBy.name} ({request.requestedBy.email})
                        {request.requestedBy.id === request.customerAccount.primaryPoc?.id && (
                          <Badge className="ml-2 bg-amber-100 text-amber-700">POC</Badge>
                        )}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* User Addition Details */}
            {request.type === 'USER_ADDITION' && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg">New User Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm text-slate-500">Name</p>
                    <p className="font-medium">{request.data.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">Email</p>
                    <p className="font-medium">{request.data.email}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* POC Change Details */}
            {request.type === 'POC_CHANGE' && (
              <>
                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Current POC</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {request.customerAccount.primaryPoc ? (
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-100 rounded-full flex items-center justify-center">
                          <Crown className="h-5 w-5 text-amber-600" />
                        </div>
                        <div>
                          <p className="font-medium">{request.customerAccount.primaryPoc.name}</p>
                          <p className="text-sm text-slate-500">{request.customerAccount.primaryPoc.email}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500">No current POC</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="mb-6">
                  <CardHeader>
                    <CardTitle className="text-lg">Requested New POC</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {request.newPocUser ? (
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                          <Crown className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium">{request.newPocUser.name}</p>
                          <p className="text-sm text-slate-500">{request.newPocUser.email}</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-500">User not found</p>
                    )}
                  </CardContent>
                </Card>

                {request.data.reason && (
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="text-lg">Reason for Change</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-slate-700 italic">&ldquo;{request.data.reason}&rdquo;</p>
                    </CardContent>
                  </Card>
                )}

                {/* Warning for POC Change */}
                {isPending && (
                  <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <p className="font-medium text-amber-800">If approved:</p>
                        <ul className="mt-1 text-sm text-amber-700 list-disc list-inside">
                          <li>{request.newPocUser?.name || 'New user'} will become the new POC</li>
                          <li>{request.customerAccount.primaryPoc?.name || 'Current POC'} will become a regular user</li>
                          <li>Both parties will be notified via email</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Decision Section (only for pending) */}
            {isPending && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Decision</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-4">
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
                    <Button
                      onClick={handleReject}
                      disabled={processing || !rejectionReason.trim()}
                      variant="destructive"
                      className="flex-1"
                    >
                      {processing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Reject
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="rejectionReason">
                      Rejection Reason (required if rejecting)
                    </Label>
                    <Textarea
                      id="rejectionReason"
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Enter reason for rejection..."
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Back button */}
            <div className="mt-6">
              <Link href="/admin/customers/requests">
                <Button variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to List
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
