'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  UserPlus,
  Building2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Registration {
  id: string
  email: string
  name: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  customerAccount: { id: string; companyName: string } | null
  reviewedBy: { id: string; name: string } | null
  reviewedAt: string | null
  rejectionReason: string | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function RegistrationsPage() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  })
  const [statusFilter, setStatusFilter] = useState('PENDING')
  const [processing, setProcessing] = useState<string | null>(null)

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')

  const fetchRegistrations = async (page = 1, status = statusFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        status,
      })
      const res = await fetch(`/api/admin/registrations?${params}`)
      if (res.ok) {
        const data = await res.json()
        setRegistrations(data.registrations)
        setPagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch registrations:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRegistrations()
  }, [])

  const handleStatusChange = (value: string) => {
    setStatusFilter(value)
    fetchRegistrations(1, value)
  }

  const handleApprove = async (id: string) => {
    setProcessing(id)
    try {
      const res = await fetch(`/api/admin/registrations/${id}/approve`, {
        method: 'POST',
      })

      if (res.ok) {
        fetchRegistrations(pagination.page)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to approve registration')
      }
    } catch (error) {
      console.error('Failed to approve registration:', error)
    } finally {
      setProcessing(null)
    }
  }

  const openRejectDialog = (id: string) => {
    setRejectingId(id)
    setRejectReason('')
    setRejectDialogOpen(true)
  }

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return

    setProcessing(rejectingId)
    setRejectDialogOpen(false)

    try {
      const res = await fetch(`/api/admin/registrations/${rejectingId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })

      if (res.ok) {
        fetchRegistrations(pagination.page)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to reject registration')
      }
    } catch (error) {
      console.error('Failed to reject registration:', error)
    } finally {
      setProcessing(null)
      setRejectingId(null)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case 'APPROVED':
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case 'REJECTED':
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return <Badge>{status}</Badge>
    }
  }

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Customer Registrations</h1>
              <p className="text-slate-600 mt-1">
                Review and process customer registration requests
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-slate-400" />
                  Registrations
                </CardTitle>
                <div className="flex items-center gap-4">
                  <Select value={statusFilter} onValueChange={handleStatusChange}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="APPROVED">Approved</SelectItem>
                      <SelectItem value="REJECTED">Rejected</SelectItem>
                      <SelectItem value="ALL">All</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : registrations.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  No registrations found
                </div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Reviewed By</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {registrations.map((reg) => (
                        <TableRow key={reg.id}>
                          <TableCell className="font-medium">{reg.name}</TableCell>
                          <TableCell className="text-slate-500">{reg.email}</TableCell>
                          <TableCell>
                            {reg.customerAccount ? (
                              <Link
                                href={`/admin/customers/${reg.customerAccount.id}`}
                                className="flex items-center gap-1 text-blue-600 hover:underline"
                              >
                                <Building2 className="h-3 w-3" />
                                {reg.customerAccount.companyName}
                              </Link>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>{getStatusBadge(reg.status)}</TableCell>
                          <TableCell className="text-slate-500">
                            {new Date(reg.createdAt).toLocaleDateString()}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {reg.reviewedBy ? (
                              <span>
                                {reg.reviewedBy.name}
                                <br />
                                <span className="text-xs">
                                  {reg.reviewedAt
                                    ? new Date(reg.reviewedAt).toLocaleDateString()
                                    : ''}
                                </span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {reg.status === 'PENDING' ? (
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700"
                                  onClick={() => handleApprove(reg.id)}
                                  disabled={processing === reg.id}
                                >
                                  {processing === reg.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <>
                                      <CheckCircle className="h-4 w-4 mr-1" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 border-red-200 hover:bg-red-50"
                                  onClick={() => openRejectDialog(reg.id)}
                                  disabled={processing === reg.id}
                                >
                                  <XCircle className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </div>
                            ) : reg.status === 'REJECTED' && reg.rejectionReason ? (
                              <span
                                className="text-xs text-slate-500 cursor-help"
                                title={reg.rejectionReason}
                              >
                                Reason: {reg.rejectionReason.substring(0, 30)}
                                {reg.rejectionReason.length > 30 ? '...' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4 border-t mt-4">
                      <p className="text-sm text-slate-500">
                        Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                        {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                        {pagination.total} registrations
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchRegistrations(pagination.page - 1)}
                          disabled={pagination.page === 1}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => fetchRegistrations(pagination.page + 1)}
                          disabled={pagination.page === pagination.totalPages}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reject Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Registration</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this registration. This will be
              recorded for audit purposes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="rejectReason">Rejection Reason</Label>
            <Textarea
              id="rejectReason"
              placeholder="Enter the reason for rejection..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              Reject Registration
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
