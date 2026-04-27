'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Loader2,
  UserPlus,
  Crown,
  Users,
  CheckCircle,
  Clock,
  AlertCircle,
  User,
  PenTool,
  ArrowRightLeft,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Search,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const ROWS_PER_PAGE_OPTIONS = [10, 15, 25]

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = [1]
  if (currentPage > 3) pages.push('ellipsis')
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (currentPage < totalPages - 2) pages.push('ellipsis')
  if (totalPages > 1) pages.push(totalPages)
  return pages
}
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import TypedSignature, { TypedSignatureHandle } from '@/components/signatures/TypedSignature'

interface TeamMember {
  id: string
  name: string
  email: string
  isActive: boolean
  activatedAt: string | null
  createdAt: string
}

interface PendingRequest {
  id: string
  type: 'USER_ADDITION' | 'POC_CHANGE'
  data: { name?: string; email?: string; newPocUserId?: string; reason?: string }
  createdAt: string
}

interface TeamData {
  account: {
    id: string
    companyName: string
    primaryPocId: string | null
  }
  users: TeamMember[]
  primaryPoc: TeamMember | null
  pendingRequests: PendingRequest[]
  currentUserId: string
  isPrimaryPoc: boolean
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

type AddUserStep = 1 | 2 | 3

const ADD_USER_STEPS = [
  { num: 1 as AddUserStep, label: 'User Details' },
  { num: 2 as AddUserStep, label: 'Review' },
  { num: 3 as AddUserStep, label: 'Sign & Confirm' },
]

export default function UsersPage() {
  const router = useRouter()
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add User Modal
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [addUserName, setAddUserName] = useState('')
  const [addUserEmail, setAddUserEmail] = useState('')
  const [addUserSubmitting, setAddUserSubmitting] = useState(false)
  const [addUserError, setAddUserError] = useState('')
  const [addUserStep, setAddUserStep] = useState<AddUserStep>(1)

  // Signature state
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [signatureConsent, setSignatureConsent] = useState(false)
  const [signatureReady, setSignatureReady] = useState(false)

  // POC Change Modal
  const [pocChangeOpen, setPocChangeOpen] = useState(false)
  const [newPocUserId, setNewPocUserId] = useState('')
  const [pocChangeReason, setPocChangeReason] = useState('')
  const [pocChangeSubmitting, setPocChangeSubmitting] = useState(false)
  const [pocChangeError, setPocChangeError] = useState('')

  // Pagination & search
  const [page, setPage] = useState(1)
  const [rowsPerPage, setRowsPerPage] = useState(10)
  const [searchQuery, setSearchQuery] = useState('')
  const [tableUsers, setTableUsers] = useState<TeamMember[]>([])
  const [tablePagination, setTablePagination] = useState<Pagination | null>(null)
  const [tableLoading, setTableLoading] = useState(false)

  const debouncedSearch = useDebounce(searchQuery)

  const totalPages = tablePagination?.totalPages ?? 1
  const total = tablePagination?.total ?? 0
  const startIndex = total === 0 ? 0 : (page - 1) * rowsPerPage + 1
  const endIndex = Math.min(page * rowsPerPage, total)
  const pageNumbers = getPageNumbers(page, totalPages)
  const handleRowsPerPage = (value: number) => { setRowsPerPage(value); setPage(1) }

  // Get current user's name for signature
  const currentUserName = teamData?.users.find(u => u.id === teamData.currentUserId)?.name || ''

  // Fetch full team data for modals/context (no pagination)
  const fetchTeamData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/customer/team')
      if (!res.ok) {
        if (res.status === 403) {
          router.push('/customer/dashboard')
          return
        }
        throw new Error('Failed to fetch team data')
      }
      const data = await res.json()
      setTeamData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team data')
    } finally {
      setLoading(false)
    }
  }, [router])

  // Fetch paginated users for table display
  const fetchTableUsers = useCallback(async () => {
    setTableLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', page.toString())
      params.set('limit', rowsPerPage.toString())
      if (debouncedSearch) params.set('search', debouncedSearch)

      const res = await apiFetch(`/api/customer/team?${params}`)
      if (res.ok) {
        const data = await res.json()
        setTableUsers(data.users)
        setTablePagination(data.pagination)
      }
    } catch (error) {
      console.error('Failed to fetch users:', error)
    } finally {
      setTableLoading(false)
    }
  }, [page, rowsPerPage, debouncedSearch])

  useEffect(() => {
    fetchTeamData()
  }, [fetchTeamData])

  useEffect(() => {
    fetchTableUsers()
  }, [fetchTableUsers])

  const resetAddUserForm = () => {
    setAddUserOpen(false)
    setAddUserName('')
    setAddUserEmail('')
    setAddUserStep(1)
    setSignatureConsent(false)
    setSignatureReady(false)
    signatureRef.current?.clear()
    setAddUserError('')
  }

  const handleAddUser = async () => {
    setAddUserError('')

    if (!signatureConsent || !signatureReady || signatureRef.current?.isEmpty()) {
      setAddUserError('Please provide your signature and consent to submit this request')
      return
    }

    setAddUserSubmitting(true)

    try {
      const signatureDataUrl = signatureRef.current?.toDataURL() || ''

      const res = await apiFetch('/api/customer/team/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'USER_ADDITION',
          data: {
            name: addUserName,
            email: addUserEmail,
            pocSignature: {
              signedBy: currentUserName,
              signedAt: new Date().toISOString(),
              signatureImage: signatureDataUrl,
              consent: signatureConsent,
            },
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to submit request (${res.status})`)
      }

      await fetchTeamData()
      fetchTableUsers()
      resetAddUserForm()
    } catch (err) {
      console.error('Add user error:', err)
      setAddUserError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setAddUserSubmitting(false)
    }
  }

  const handleAddUserNext = () => {
    setAddUserError('')
    if (addUserStep === 1) {
      if (!addUserName.trim()) { setAddUserError('Full name is required'); return }
      if (!addUserEmail.trim()) { setAddUserError('Email address is required'); return }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addUserEmail)) { setAddUserError('Please enter a valid email address'); return }
    }
    setAddUserStep((s) => Math.min(s + 1, 3) as AddUserStep)
  }

  const handleAddUserBack = () => {
    setAddUserError('')
    setAddUserStep((s) => Math.max(s - 1, 1) as AddUserStep)
  }

  const handlePocChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPocChangeError('')
    setPocChangeSubmitting(true)

    try {
      const res = await apiFetch('/api/customer/team/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'POC_CHANGE',
          data: {
            newPocUserId,
            reason: pocChangeReason,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request')
      }

      await fetchTeamData()
      fetchTableUsers()
      setPocChangeOpen(false)
      setNewPocUserId('')
      setPocChangeReason('')
    } catch (err) {
      setPocChangeError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setPocChangeSubmitting(false)
    }
  }

  const eligiblePocUsers = teamData?.users.filter(
    (user) => user.id !== teamData.currentUserId && user.isActive
  ) || []

  const hasPendingPocChange = teamData?.pendingRequests.some(
    (req) => req.type === 'POC_CHANGE'
  ) || false

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (error || !teamData) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9]">
        <div className="px-6 sm:px-9 py-8">
          <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-8 text-center">
            <div className="size-12 bg-[#fef2f2] rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-5 text-[#dc2626]" />
            </div>
            <p className="text-[13px] text-[#dc2626] mb-4">{error || 'Failed to load team data'}</p>
            <button
              onClick={() => router.push('/customer/dashboard')}
              className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-7">
          <div>
            <h1 className="text-[26px] font-extrabold tracking-tight text-[#0f172a]">Users</h1>
            <p className="text-sm text-[#94a3b8] mt-1">
              Manage team members for {teamData.account.companyName}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {/* POC Transfer Button */}
            {teamData.isPrimaryPoc && eligiblePocUsers.length > 0 && !hasPendingPocChange && (
              <button
                onClick={() => setPocChangeOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
              >
                <ArrowRightLeft className="size-3.5" />
                Transfer POC
              </button>
            )}

            {/* Add User Button */}
            {teamData.isPrimaryPoc && (
              <button
                onClick={() => setAddUserOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors"
              >
                <UserPlus className="size-3.5" />
                Request User
              </button>
            )}
          </div>
        </div>

        {/* Pending Requests */}
        {teamData.pendingRequests.length > 0 && (
          <div className="bg-[#fffbeb] border border-[#fde68a] rounded-[14px] p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="size-4 text-[#d97706]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#92400e]">
                Pending Requests
              </span>
            </div>
            <div className="space-y-2.5">
              {teamData.pendingRequests.map((req) => (
                <div
                  key={req.id}
                  className="flex items-center justify-between bg-white px-4 py-3 rounded-xl border border-[#fde68a]"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-[#eff6ff]">
                      {req.type === 'USER_ADDITION' ? (
                        <UserPlus className="size-4 text-[#2563eb]" />
                      ) : (
                        <ArrowRightLeft className="size-4 text-[#7c3aed]" />
                      )}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">
                        {req.type === 'USER_ADDITION'
                          ? `Add: ${req.data.name} (${req.data.email})`
                          : 'POC Transfer Request'}
                      </p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        Submitted {format(new Date(req.createdAt), 'PPP')}
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] bg-[#fef3c7] text-[#92400e] border border-[#fde68a] rounded-full">
                    Pending Review
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-[#94a3b8]" />
              <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Team Members ({total || teamData.users.length})
              </span>
            </div>
            <div className="relative w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-[#94a3b8]" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
                className="w-full pl-9 pr-3 py-1.5 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="border-b border-[#f1f5f9] hover:bg-transparent">
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Name</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Email</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Role</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Status</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] h-10">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableUsers.map((user) => {
                const isPoc = user.id === teamData.account.primaryPocId
                const isCurrentUser = user.id === teamData.currentUserId

                return (
                  <TableRow key={user.id} className="border-b border-[#f1f5f9] last:border-0 hover:bg-[#f8fafc]">
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className={`size-8 rounded-full flex items-center justify-center flex-shrink-0 ${isPoc ? 'bg-[#fef3c7]' : 'bg-[#f0fdf4]'}`}>
                          {isPoc ? (
                            <Crown className="size-3.5 text-[#92400e]" />
                          ) : (
                            <User className="size-3.5 text-[#16a34a]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#0f172a]">{user.name}</span>
                          {isCurrentUser && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium text-[#64748b] bg-[#f1f5f9] rounded-[4px]">
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">{user.email}</TableCell>
                    <TableCell>
                      {isPoc ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] bg-[#fef3c7] text-[#92400e] border border-[#fde68a] rounded-full">
                          <Crown className="size-2.5" />
                          POC
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] bg-[#f1f5f9] text-[#64748b] border border-[#e2e8f0] rounded-full">
                          <User className="size-2.5" />
                          User
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] rounded-full">
                          <CheckCircle className="size-2.5" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.05em] bg-[#f1f5f9] text-[#94a3b8] border border-[#e2e8f0] rounded-full">
                          <Clock className="size-2.5" />
                          Pending
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-[13px] text-[#64748b]">
                      {user.activatedAt
                        ? format(new Date(user.activatedAt), 'PP')
                        : format(new Date(user.createdAt), 'PP')}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination Footer */}
          {total > 0 && (
            <div className="px-4 py-3 border-t border-[#f1f5f9] flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-[13px] text-[#94a3b8]">
                Showing {startIndex}–{endIndex} of {total}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#94a3b8]">Rows per page</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => handleRowsPerPage(Number(e.target.value))}
                    className="h-8 px-2 border border-[#e2e8f0] rounded-lg text-[13px] text-[#0f172a] bg-white outline-none focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed]"
                  >
                    {ROWS_PER_PAGE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    {pageNumbers.map((pg, idx) =>
                      pg === 'ellipsis' ? (
                        <span key={`e-${idx}`} className="size-8 flex items-center justify-center text-[13px] text-[#94a3b8]">…</span>
                      ) : (
                        <button
                          key={pg}
                          onClick={() => setPage(pg)}
                          className={`size-8 flex items-center justify-center rounded-lg text-[13px] font-medium transition-colors ${
                            pg === page ? 'bg-[#0f172a] text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'
                          }`}
                        >
                          {pg}
                        </button>
                      )
                    )}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="size-8 flex items-center justify-center rounded-lg border border-[#e2e8f0] text-[#64748b] hover:bg-[#f1f5f9] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info for non-POC users */}
        {!teamData.isPrimaryPoc && (
          <div className="mt-6 flex items-start gap-3 p-4 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl">
            <AlertCircle className="size-4 text-[#2563eb] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-[#1e40af]">View Only</p>
              <p className="text-[12.5px] text-[#2563eb] mt-0.5">
                Only the Primary Point of Contact can request new team members or transfer the POC role.
                Contact {teamData.primaryPoc?.name || 'your POC'} if you need to make changes.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ===== ADD USER MODAL ===== */}
      {addUserOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#dcfce7] rounded-[9px]">
                  <UserPlus className="size-4 text-[#16a34a]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request New User</h2>
                  <p className="text-[11px] text-[#94a3b8]">Submit a request to add a new team member</p>
                </div>
              </div>
              <button
                onClick={resetAddUserForm}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Progress Bar */}
            <div className="px-5 py-3 border-b border-[#f1f5f9] flex-shrink-0">
              <div className="flex items-center justify-between">
                {ADD_USER_STEPS.map((step, i) => (
                  <div key={step.num} className="flex items-center flex-1">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          'size-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors',
                          addUserStep > step.num
                            ? 'bg-[#16a34a] text-white'
                            : addUserStep === step.num
                              ? 'bg-[#0f172a] text-white'
                              : 'bg-[#f1f5f9] text-[#94a3b8]'
                        )}
                      >
                        {addUserStep > step.num ? (
                          <Check className="size-3.5" />
                        ) : (
                          step.num
                        )}
                      </div>
                      <span
                        className={cn(
                          'text-[12px] font-semibold hidden sm:block',
                          addUserStep >= step.num ? 'text-[#0f172a]' : 'text-[#94a3b8]'
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                    {i < ADD_USER_STEPS.length - 1 && (
                      <div
                        className={cn(
                          'flex-1 h-px mx-3',
                          addUserStep > step.num ? 'bg-[#16a34a]' : 'bg-[#e2e8f0]'
                        )}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* ===== STEP 1: User Details ===== */}
              {addUserStep === 1 && (
                <>
                  <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <UserPlus className="size-3.5 text-[#94a3b8]" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">New Team Member</span>
                    </div>
                    <p className="text-[12.5px] text-[#64748b]">
                      Enter the details of the new user you want to add to {teamData.account.companyName}&apos;s HTA portal account.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                        Full Name <span className="text-[#dc2626]">*</span>
                      </label>
                      <Input
                        value={addUserName}
                        onChange={(e) => setAddUserName(e.target.value)}
                        placeholder="John Smith"
                        disabled={addUserSubmitting}
                        className="h-10 rounded-[9px] border-border text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                        Email Address <span className="text-[#dc2626]">*</span>
                      </label>
                      <Input
                        type="email"
                        value={addUserEmail}
                        onChange={(e) => setAddUserEmail(e.target.value)}
                        placeholder="john.smith@company.com"
                        disabled={addUserSubmitting}
                        className="h-10 rounded-[9px] border-border text-sm"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* ===== STEP 2: Review ===== */}
              {addUserStep === 2 && (
                <>
                  <div className="bg-[#f8fafc] border border-[#f1f5f9] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Users className="size-3.5 text-[#94a3b8]" />
                      <span className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Request Summary</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                      <div>
                        <p className="text-[11px] text-[#94a3b8]">Full Name</p>
                        <p className="text-[13px] font-medium text-[#0f172a]">{addUserName}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#94a3b8]">Email Address</p>
                        <p className="text-[13px] font-medium text-[#0f172a]">{addUserEmail}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#94a3b8]">Organization</p>
                        <p className="text-[13px] font-medium text-[#0f172a]">{teamData.account.companyName}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#94a3b8]">Requested By</p>
                        <p className="text-[13px] font-medium text-[#0f172a]">{currentUserName} (POC)</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-xl p-3.5 text-[12px] text-[#1e40af]">
                    <p className="font-semibold mb-1">What happens next?</p>
                    <p className="text-[#2563eb]">This request will be reviewed by HTA admin before the user is added. You will be notified once processed.</p>
                  </div>
                </>
              )}

              {/* ===== STEP 3: Sign & Confirm ===== */}
              {addUserStep === 3 && (
                <>
                  <div className="space-y-2.5">
                    <p className="text-[12.5px] font-semibold text-[#0f172a]">Before signing, please confirm:</p>
                    <ul className="text-[12px] text-[#64748b] space-y-1 ml-4 list-disc">
                      <li>I authorize adding <span className="font-semibold text-[#0f172a]">{addUserName}</span> ({addUserEmail}) to our organization&apos;s HTA portal account.</li>
                      <li>I am the Primary Point of Contact for {teamData.account.companyName} and have the authority to make this request.</li>
                      <li>I understand this request will be reviewed by HTA administration before the user is activated.</li>
                    </ul>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={signatureConsent}
                        onChange={(e) => setSignatureConsent(e.target.checked)}
                        className="rounded border-[#e2e8f0] text-[#16a34a] focus:ring-[#16a34a]/20 h-4 w-4"
                      />
                      <span className="text-[12.5px] font-semibold text-[#0f172a]">I agree to the above statements</span>
                    </label>
                  </div>

                  <div className={cn('space-y-3 pt-4 border-t border-[#f1f5f9]', !signatureConsent && 'opacity-40 pointer-events-none')}>
                    <div>
                      <label className="text-[12.5px] font-semibold text-[#0f172a]">
                        Signing as: <span className="text-[#94a3b8] font-normal">{currentUserName}</span>
                      </label>
                    </div>
                    <TypedSignature
                      ref={signatureRef}
                      name={currentUserName}
                      width={500}
                      height={120}
                      onSignatureReady={setSignatureReady}
                    />
                  </div>
                </>
              )}

              {/* Error */}
              {addUserError && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{addUserError}</p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between flex-shrink-0">
              <div>
                {addUserStep > 1 && (
                  <button
                    type="button"
                    onClick={handleAddUserBack}
                    disabled={addUserSubmitting}
                    className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#475569] hover:text-[#0f172a] transition-colors disabled:opacity-50"
                  >
                    <ArrowLeft className="size-3.5" />
                    Back
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetAddUserForm}
                  disabled={addUserSubmitting}
                  className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                {addUserStep < 3 ? (
                  <button
                    type="button"
                    onClick={handleAddUserNext}
                    className="inline-flex items-center gap-1 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
                  >
                    Next
                    <ArrowRight className="size-3.5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleAddUser}
                    disabled={addUserSubmitting || !signatureConsent || !signatureReady}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
                  >
                    {addUserSubmitting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="size-3.5" />
                    )}
                    {addUserSubmitting ? 'Submitting...' : 'Submit Request'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== POC TRANSFER MODAL ===== */}
      {pocChangeOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-[#f3e8ff] rounded-[9px]">
                  <ArrowRightLeft className="size-4 text-[#7c3aed]" />
                </div>
                <div>
                  <h2 className="text-[14px] font-semibold text-[#0f172a]">Request POC Transfer</h2>
                  <p className="text-[11px] text-[#94a3b8]">Transfer your Primary POC role</p>
                </div>
              </div>
              <button
                onClick={() => setPocChangeOpen(false)}
                className="p-1.5 hover:bg-[#f8fafc] rounded-lg transition-colors"
              >
                <X className="size-4 text-[#94a3b8]" />
              </button>
            </div>

            {/* Content */}
            <form onSubmit={handlePocChange} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {pocChangeError && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                    <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                    <p className="text-[12px] text-[#dc2626]">{pocChangeError}</p>
                  </div>
                )}

                <div className="bg-[#faf5ff] border border-[#e9d5ff] rounded-xl p-3.5 text-[12px] text-[#6b21a8]">
                  Transfer your Primary Point of Contact role to another team member. HTA admin will review and approve the request.
                </div>

                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                    New POC <span className="text-[#dc2626]">*</span>
                  </label>
                  <Select value={newPocUserId} onValueChange={setNewPocUserId}>
                    <SelectTrigger className="h-10 rounded-[9px] border-border bg-white text-sm">
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligiblePocUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                    Reason <span className="text-[#94a3b8] font-normal">(optional)</span>
                  </label>
                  <Textarea
                    value={pocChangeReason}
                    onChange={(e) => setPocChangeReason(e.target.value)}
                    placeholder="e.g., Role change, leaving company..."
                    rows={3}
                    disabled={pocChangeSubmitting}
                    className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] placeholder:text-[#94a3b8]"
                  />
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-end gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setPocChangeOpen(false)}
                  disabled={pocChangeSubmitting}
                  className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pocChangeSubmitting || !newPocUserId}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  {pocChangeSubmitting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <ArrowRightLeft className="size-3.5" />
                  )}
                  {pocChangeSubmitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
