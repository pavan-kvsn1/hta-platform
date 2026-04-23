'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  ArrowLeft,
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

        // Non-POC users should be redirected to dashboard
        if (!data.isPrimaryPoc) {
          router.push('/customer/dashboard')
          return
        }

        // If there's already a pending POC change, redirect to settings
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

  // Get eligible users for POC transfer (active users except current user)
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
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  if (error || !teamData) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error || 'Failed to load data'}</p>
            <Button variant="outline" onClick={() => router.push('/customer/settings')}>
              Back to Settings
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Request Submitted</h2>
              <p className="text-slate-600 mb-6">
                Your POC transfer request has been submitted for admin review.
                You will be notified once the request is processed.
              </p>
              <Link href="/customer/settings">
                <Button className="bg-green-600 hover:bg-green-700">
                  Back to Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (eligiblePocUsers.length === 0) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6">
            <Link
              href="/customer/settings"
              className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Settings
            </Link>

            <div className="text-center py-12">
              <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-slate-900 mb-2">No Eligible Users</h2>
              <p className="text-slate-600 mb-6">
                You need at least one other active team member to transfer the POC role.
              </p>
              <Link href="/customer/users">
                <Button variant="outline">
                  Manage Users
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 h-full">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Back Link */}
          <Link
            href="/customer/settings"
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Settings
          </Link>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Crown className="h-6 w-6 text-purple-600" />
              Transfer POC Role
            </h1>
            <p className="text-slate-500 mt-1">
              Transfer your Primary Point of Contact role to another team member
            </p>
          </div>

          {/* Warning Banner */}
          <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
              <div>
                <p className="font-medium text-amber-800">Important</p>
                <p className="text-sm text-amber-700 mt-1">
                  After the transfer is approved, you will lose:
                </p>
                <ul className="text-sm text-amber-700 mt-1 list-disc list-inside">
                  <li>Ability to request new team members</li>
                  <li>Access to settings</li>
                  <li>Ability to transfer POC role</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Form */}
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>Select New POC</CardTitle>
              <CardDescription>
                Choose who will take over as the Primary Point of Contact
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {submitError && (
                  <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                    {submitError}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="newPoc">New Primary POC *</Label>
                  <Select value={newPocUserId} onValueChange={setNewPocUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a team member" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligiblePocUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-slate-400" />
                            <span>{user.name}</span>
                            <span className="text-slate-400">({user.email})</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedUser && (
                  <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                    <p className="text-sm text-purple-700">
                      <strong>{selectedUser.name}</strong> will become the new POC and will be able to manage team members and settings.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="reason">Reason for Transfer *</Label>
                  <Textarea
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g., Role change, leaving company, transferring responsibilities..."
                    rows={3}
                    required
                    disabled={submitting}
                  />
                  <p className="text-xs text-slate-500">
                    This helps the admin understand and approve your request.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Link href="/customer/settings" className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={submitting}
                    >
                      Cancel
                    </Button>
                  </Link>
                  <Button
                    type="submit"
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                    disabled={submitting || !newPocUserId || !reason.trim()}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Crown className="h-4 w-4 mr-2" />
                        Submit Request
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
