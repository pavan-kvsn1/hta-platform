'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Crown,
  ChevronLeft,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  User,
} from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string
  isActive: boolean
}

interface TeamData {
  account: {
    id: string
    companyName: string
    primaryPocId: string | null
  }
  users: TeamMember[]
  currentUserId: string
  isPrimaryPoc: boolean
  pendingRequests: { type: string }[]
}

export default function ChangePocPage() {
  const router = useRouter()
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Form state
  const [newPocUserId, setNewPocUserId] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitted, setSubmitted] = useState(false)

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

        if (!data.isPrimaryPoc) {
          router.push('/customer/dashboard')
          return
        }

        if (data.pendingRequests.some((r: { type: string }) => r.type === 'POC_CHANGE')) {
          router.push('/customer/settings')
          return
        }

        setTeamData(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    fetchTeamData()
  }, [router])

  const eligiblePocUsers = teamData?.users.filter(
    (user) => user.id !== teamData.currentUserId && user.isActive
  ) || []

  const selectedUser = eligiblePocUsers.find(u => u.id === newPocUserId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPocUserId) return

    setSubmitting(true)
    setSubmitError('')

    try {
      const res = await apiFetch('/api/customer/team/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'POC_CHANGE',
          data: {
            newPocUserId,
            reason: reason.trim() || undefined,
          },
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request')
      }

      setSubmitted(true)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setSubmitting(false)
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
            <p className="text-[13px] text-[#dc2626] mb-4">{error || 'Failed to load data'}</p>
            <button
              onClick={() => router.push('/customer/settings')}
              className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              Back to Settings
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="size-14 bg-[#dcfce7] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="size-6 text-[#16a34a]" />
          </div>
          <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">Request Submitted</h2>
          <p className="text-[13px] text-[#64748b] mb-6">
            Your POC transfer request has been submitted for admin review.
            You will be notified once the request is processed.
          </p>
          <Link href="/customer/settings">
            <button className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors">
              Back to Settings
            </button>
          </Link>
        </div>
      </div>
    )
  }

  if (eligiblePocUsers.length === 0) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9]">
        <div className="px-6 sm:px-9 py-8">
          <Link
            href="/customer/settings"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Settings
          </Link>

          <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-8 text-center">
            <div className="size-12 bg-[#f1f5f9] rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-5 text-[#94a3b8]" />
            </div>
            <h2 className="text-[16px] font-bold text-[#0f172a] mb-2">No Eligible Users</h2>
            <p className="text-[13px] text-[#64748b] mb-6">
              You need at least one other active team member to transfer the POC role.
            </p>
            <Link href="/customer/users">
              <button className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors">
                Manage Users
              </button>
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8 max-w-[620px]">
        {/* Back Link */}
        <Link
          href="/customer/settings"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Settings
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <Crown className="size-[22px] text-[#7c3aed]" />
            Transfer POC Role
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            Transfer your Primary Point of Contact role to another team member
          </p>
        </div>

        {/* Warning Banner */}
        <div className="p-4 bg-[#fffbeb] border border-[#fde68a] rounded-[14px] mb-6">
          <div className="flex gap-3">
            <AlertTriangle className="size-4 text-[#d97706] flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-semibold text-[#92400e]">Important</p>
              <p className="text-[12.5px] text-[#92400e] mt-1">
                After the transfer is approved, you will lose:
              </p>
              <ul className="text-[12.5px] text-[#92400e] mt-1 list-disc list-inside">
                <li>Ability to request new team members</li>
                <li>Access to settings</li>
                <li>Ability to transfer POC role</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-[#e2e8f0] rounded-[14px] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#f1f5f9]">
            <h2 className="text-[14px] font-semibold text-[#0f172a]">Select New POC</h2>
            <p className="text-[12.5px] text-[#94a3b8] mt-0.5">
              Choose who will take over as the Primary Point of Contact
            </p>
          </div>

          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {submitError && (
              <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                <AlertCircle className="size-3.5 text-[#dc2626] flex-shrink-0" />
                <p className="text-[12px] text-[#dc2626]">{submitError}</p>
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                New Primary POC <span className="text-[#dc2626]">*</span>
              </label>
              <Select value={newPocUserId} onValueChange={setNewPocUserId}>
                <SelectTrigger className="h-10 rounded-[9px] border-border bg-white text-sm">
                  <SelectValue placeholder="Select a team member" />
                </SelectTrigger>
                <SelectContent>
                  {eligiblePocUsers.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      <div className="flex items-center gap-2">
                        <User className="size-3.5 text-[#94a3b8]" />
                        <span>{user.name}</span>
                        <span className="text-[#94a3b8]">({user.email})</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedUser && (
              <div className="p-3 bg-[#faf5ff] border border-[#e9d5ff] rounded-xl">
                <p className="text-[12.5px] text-[#6b21a8]">
                  <span className="font-semibold text-[#0f172a]">{selectedUser.name}</span> will become the new POC and will be able to manage team members and settings.
                </p>
              </div>
            )}

            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                Reason for Transfer <span className="text-[#dc2626]">*</span>
              </label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Role change, leaving company, transferring responsibilities..."
                rows={3}
                required
                disabled={submitting}
                className="resize-none text-[12.5px] md:text-[12.5px] border-[#e2e8f0] rounded-lg placeholder:text-[#94a3b8]"
              />
              <p className="text-[11px] text-[#94a3b8] mt-1.5">
                This helps the admin understand and approve your request.
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <Link href="/customer/settings" className="flex-1">
                <button
                  type="button"
                  disabled={submitting}
                  className="w-full px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </Link>
              <button
                type="submit"
                disabled={submitting || !newPocUserId || !reason.trim()}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px] transition-colors disabled:opacity-50"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Crown className="size-3.5" />
                )}
                {submitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
