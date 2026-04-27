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
} from 'lucide-react'
import { DeleteAccountDialog } from '@/components/delete-account-dialog'
import { format } from 'date-fns'

interface TeamMember {
  id: string
  name: string
  email: string
  isActive: boolean
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

export default function SettingsPage() {
  const router = useRouter()
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
      <div className="px-6 sm:px-9 py-8 max-w-[820px]">
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4">
              <div>
                <h3 className="text-[13px] font-semibold text-[#0f172a]">Export Your Data</h3>
                <p className="text-[12.5px] text-[#94a3b8] mt-0.5">
                  Download a copy of your personal data in JSON format
                </p>
              </div>
              <button
                onClick={() => { window.location.href = '/api/customer/data-export' }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors shrink-0"
              >
                <Download className="size-3.5" />
                Export Data
              </button>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4">
              <div>
                <h3 className="text-[13px] font-semibold text-[#0f172a]">Delete Account</h3>
                <p className="text-[12.5px] text-[#94a3b8] mt-0.5">
                  Permanently delete your account and personal data
                </p>
              </div>
              <DeleteAccountDialog />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
