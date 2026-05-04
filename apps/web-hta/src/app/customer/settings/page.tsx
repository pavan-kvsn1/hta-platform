'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'
import {
  Loader2,
  Crown,
  ArrowRight,
  AlertCircle,
  Clock,
  Settings,
  UserCog,
  Building2,
  Download,
  Shield,
  Trash2,
  CheckCircle,
} from 'lucide-react'
import { format } from 'date-fns'

interface TeamMember {
  id: string
  name: string
  email: string
  isActive: boolean
}

interface PendingRequest {
  id: string
  type: 'USER_ADDITION' | 'POC_CHANGE' | 'ACCOUNT_DELETION' | 'DATA_EXPORT'
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

export default function SettingsPage() {
  const router = useRouter()
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletionReason, setDeletionReason] = useState('')
  const [deletionSubmitting, setDeletionSubmitting] = useState(false)
  const [deletionSubmitted, setDeletionSubmitted] = useState(false)
  const [deletionError, setDeletionError] = useState('')
  const [exportReason, setExportReason] = useState('')
  const [exportSubmitting, setExportSubmitting] = useState(false)
  const [exportSubmitted, setExportSubmitted] = useState(false)
  const [exportError, setExportError] = useState('')

  useEffect(() => {
    const fetchTeamData = async () => {
      try {
        const res = await apiFetch('/api/customer/team')
        if (!res.ok) {
          if (res.status === 403) {
            router.push('/customer/dashboard')
            return
          }
          throw new Error('Failed to fetch data')
        }
        const data = await res.json()
        setTeamData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings')
      } finally {
        setLoading(false)
      }
    }

    fetchTeamData()
  }, [router])

  const pendingPocChange = teamData?.pendingRequests.find(
    (req) => req.type === 'POC_CHANGE'
  )

  const eligiblePocUsers = teamData?.users.filter(
    (user) => user.id !== teamData.currentUserId && user.isActive
  ) || []

  const newPocUser = pendingPocChange
    ? teamData?.users.find(u => u.id === pendingPocChange.data.newPocUserId)
    : null

  const pendingDeletion = teamData?.pendingRequests.find(
    (req) => req.type === 'ACCOUNT_DELETION'
  )

  const pendingExport = teamData?.pendingRequests.find(
    (req) => req.type === 'DATA_EXPORT'
  )

  const handleRequestExport = async () => {
    if (!exportReason.trim()) {
      setExportError('Please provide a reason for the data export request')
      return
    }
    setExportSubmitting(true)
    setExportError('')
    try {
      const res = await apiFetch('/api/customer/team/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'DATA_EXPORT',
          data: { reason: exportReason.trim() },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit request')
      }
      setExportSubmitted(true)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setExportSubmitting(false)
    }
  }

  const handleRequestDeletion = async () => {
    if (!deletionReason.trim()) {
      setDeletionError('Please provide a reason for account deletion')
      return
    }
    setDeletionSubmitting(true)
    setDeletionError('')
    try {
      const res = await apiFetch('/api/customer/team/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ACCOUNT_DELETION',
          data: { reason: deletionReason.trim() },
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to submit request')
      }
      setDeletionSubmitted(true)
    } catch (err) {
      setDeletionError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setDeletionSubmitting(false)
    }
  }

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
            <p className="text-[13px] text-[#dc2626] mb-4">{error || 'Failed to load settings'}</p>
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
      <div className="px-6 sm:px-9 py-8 max-w-[820px] mx-auto">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <Settings className="size-[22px] text-[#94a3b8]" />
            Settings
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">{teamData.account.companyName}</p>
        </div>

        {/* POC Section - Only visible to POC users */}
        {teamData.isPrimaryPoc && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 mb-5">
            <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-1">
              <UserCog className="size-[18px] text-[#94a3b8]" />
              Primary Point of Contact
            </h2>
            <p className="text-[12.5px] text-[#94a3b8] mb-5">
              Transfer your POC role to another active team member
            </p>

            {/* Current POC Info */}
            <div className="flex items-center gap-3 p-3.5 bg-[#faf5ff] rounded-xl border border-[#e9d5ff] mb-4">
              <div className="size-10 bg-[#f3e8ff] rounded-full flex items-center justify-center">
                <Crown className="size-4 text-[#92400e]" />
              </div>
              <div>
                <p className="text-[13px] font-medium text-[#0f172a]">
                  {teamData.users.find(u => u.id === teamData.currentUserId)?.name}
                </p>
                <p className="text-[11px] text-[#94a3b8]">Current Primary POC (You)</p>
              </div>
            </div>

            {/* Pending Request */}
            {pendingPocChange && (
              <div className="p-3.5 bg-[#fffbeb] rounded-xl border border-[#fde68a] mb-4">
                <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#92400e] mb-1.5">
                  <Clock className="size-3.5" />
                  POC Transfer Request Pending
                </div>
                <p className="text-[12.5px] text-[#92400e]">
                  Transfer to <span className="font-semibold text-[#0f172a]">{newPocUser?.name || 'Unknown'}</span> ({newPocUser?.email})
                </p>
                <p className="text-[11px] text-[#d97706] mt-1">
                  Submitted {format(new Date(pendingPocChange.createdAt), 'PPP')}
                </p>
                {pendingPocChange.data.reason && (
                  <p className="text-[12.5px] text-[#92400e] mt-2 italic">
                    Reason: {pendingPocChange.data.reason}
                  </p>
                )}
              </div>
            )}

            {/* Transfer Button */}
            {!pendingPocChange && eligiblePocUsers.length > 0 && (
              <>
                <Link href="/customer/settings/change-poc">
                  <button className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors">
                    <Crown className="size-3.5" />
                    Request POC Change
                    <ArrowRight className="size-3.5" />
                  </button>
                </Link>
                <div className="mt-4 p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl">
                  <p className="text-[12px] text-[#2563eb]">
                    <span className="font-semibold text-[#1e40af]">Note:</span> Transferring the POC role means you will no longer be able to manage team members or access settings. This action requires admin approval.
                  </p>
                </div>
              </>
            )}

            {!pendingPocChange && eligiblePocUsers.length === 0 && (
              <div className="p-3 bg-[#f8fafc] rounded-xl border border-[#f1f5f9]">
                <p className="text-[12.5px] text-[#64748b]">
                  <span className="font-semibold text-[#0f172a]">No eligible users available.</span> You need at least one other active team member to transfer the POC role.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Account Information - Only for POC */}
        {teamData.isPrimaryPoc && (
          <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 mb-5">
            <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-5">
              <Building2 className="size-[18px] text-[#94a3b8]" />
              Account Information
            </h2>
            <div className="divide-y divide-[#f1f5f9]">
              <div className="flex justify-between py-3">
                <span className="text-[13px] text-[#64748b]">Company Name</span>
                <span className="text-[13px] font-medium text-[#0f172a]">{teamData.account.companyName}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-[13px] text-[#64748b]">Team Members</span>
                <span className="text-[13px] font-medium text-[#0f172a]">{teamData.users.length}</span>
              </div>
              <div className="flex justify-between py-3">
                <span className="text-[13px] text-[#64748b]">Active Users</span>
                <span className="text-[13px] font-medium text-[#0f172a]">
                  {teamData.users.filter(u => u.isActive).length}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Password Change */}
        <ChangePasswordForm apiEndpoint="/api/customer/change-password" />

        {/* Data & Privacy */}
        <div className="bg-white rounded-xl border border-[#e2e8f0] p-6 mt-5">
          <h2 className="text-[15px] font-semibold text-[#0f172a] flex items-center gap-2 mb-1">
            <Shield className="size-[18px] text-[#94a3b8]" />
            Data & Privacy
          </h2>
          <p className="text-[12.5px] text-[#94a3b8] mb-5">
            Manage your personal data and account
          </p>

          <div className="divide-y divide-[#f1f5f9]">
            {/* Data Export */}
            <div className="pb-4">
              <h3 className="text-[13px] font-semibold text-[#0f172a]">Export Your Data</h3>
              <p className="text-[12.5px] text-[#94a3b8] mt-0.5 mb-3">
                Request a copy of your personal data
              </p>

              {(pendingExport || exportSubmitted) ? (
                <div className="p-3.5 bg-[#fffbeb] rounded-xl border border-[#fde68a]">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#92400e] mb-1">
                    <Clock className="size-3.5" />
                    Export Request Pending
                  </div>
                  <p className="text-[12.5px] text-[#92400e]">
                    Your data export request has been submitted and is awaiting admin review.
                  </p>
                  {pendingExport && (
                    <p className="text-[11px] text-[#d97706] mt-1">
                      Submitted {format(new Date(pendingExport.createdAt), 'PPP')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label htmlFor="exportReason" className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
                      Reason for request
                    </label>
                    <textarea
                      id="exportReason"
                      value={exportReason}
                      onChange={(e) => setExportReason(e.target.value)}
                      placeholder="Please provide a reason for your data export request..."
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#c2410c]/20 focus:border-[#c2410c] outline-none resize-none"
                    />
                  </div>
                  {exportError && (
                    <p className="text-[12px] text-[#dc2626]">{exportError}</p>
                  )}
                  <button
                    onClick={handleRequestExport}
                    disabled={exportSubmitting || !exportReason.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] disabled:opacity-50 disabled:cursor-not-allowed rounded-[9px] transition-colors"
                  >
                    {exportSubmitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Download className="size-3.5" />
                        Request Data Export
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Privacy Policy */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-4">
              <div>
                <h3 className="text-[13px] font-semibold text-[#0f172a]">Privacy Policy</h3>
                <p className="text-[12.5px] text-[#94a3b8] mt-0.5">
                  Learn how we collect, use, and protect your data
                </p>
              </div>
              <Link href="/privacy">
                <button className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors shrink-0">
                  View Policy
                  <ArrowRight className="size-3.5" />
                </button>
              </Link>
            </div>

            {/* Delete Account */}
            <div className="pt-4">
              <h3 className="text-[13px] font-semibold text-[#0f172a]">Delete Account</h3>
              <p className="text-[12.5px] text-[#94a3b8] mt-0.5 mb-4">
                Request permanent deletion of your account and personal data
              </p>

              {(pendingDeletion || deletionSubmitted) ? (
                <div className="p-3.5 bg-[#fffbeb] rounded-xl border border-[#fde68a]">
                  <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[#92400e] mb-1">
                    <Clock className="size-3.5" />
                    Deletion Request Pending
                  </div>
                  <p className="text-[12.5px] text-[#92400e]">
                    Your account deletion request has been submitted and is awaiting admin review.
                  </p>
                  {pendingDeletion && (
                    <p className="text-[11px] text-[#d97706] mt-1">
                      Submitted {format(new Date(pendingDeletion.createdAt), 'PPP')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl">
                    <p className="text-[12px] text-[#dc2626]">
                      <span className="font-semibold text-[#991b1b]">Warning:</span> This will permanently remove your account and personal data. Calibration certificates will be retained for 7 years as required by regulations. This action requires admin approval.
                    </p>
                  </div>
                  <div>
                    <label htmlFor="deletionReason" className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">
                      Reason for deletion
                    </label>
                    <textarea
                      id="deletionReason"
                      value={deletionReason}
                      onChange={(e) => setDeletionReason(e.target.value)}
                      placeholder="Please provide a reason for your account deletion request..."
                      rows={3}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#dc2626]/20 focus:border-[#dc2626] outline-none resize-none"
                    />
                  </div>
                  {deletionError && (
                    <p className="text-[12px] text-[#dc2626]">{deletionError}</p>
                  )}
                  <button
                    onClick={handleRequestDeletion}
                    disabled={deletionSubmitting || !deletionReason.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#dc2626] hover:bg-[#b91c1c] disabled:opacity-50 disabled:cursor-not-allowed rounded-[9px] transition-colors"
                  >
                    {deletionSubmitting ? (
                      <>
                        <Loader2 className="size-3.5 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="size-3.5" />
                        Request Account Deletion
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
