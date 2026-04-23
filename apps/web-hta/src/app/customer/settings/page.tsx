'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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

  // Check if there's a pending POC change request
  const pendingPocChange = teamData?.pendingRequests.find(
    (req) => req.type === 'POC_CHANGE'
  )

  // Get eligible users for POC transfer (active users except current user)
  const eligiblePocUsers = teamData?.users.filter(
    (user) => user.id !== teamData.currentUserId && user.isActive
  ) || []

  // Get new POC name if there's a pending request
  const newPocUser = pendingPocChange
    ? teamData?.users.find(u => u.id === pendingPocChange.data.newPocUserId)
    : null

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
            <p className="text-red-600 mb-4">{error || 'Failed to load settings'}</p>
            <Button variant="outline" onClick={() => router.push('/customer/dashboard')}>
              Back to Dashboard
            </Button>
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
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="h-6 w-6 text-slate-400" />
              Settings
            </h1>
            <p className="text-slate-500 mt-1">{teamData.account.companyName}</p>
          </div>

          {/* POC Change Section - Only visible to POC users */}
          {teamData.isPrimaryPoc && (
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-purple-600" />
                <CardTitle className="text-lg">Primary Point of Contact</CardTitle>
              </div>
              <CardDescription>
                Transfer your POC role to another active team member
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Current POC Info */}
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg border border-purple-100 mb-4">
                <div className="h-10 w-10 bg-purple-100 rounded-full flex items-center justify-center">
                  <Crown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {teamData.users.find(u => u.id === teamData.currentUserId)?.name}
                  </p>
                  <p className="text-sm text-slate-500">Current Primary POC (You)</p>
                </div>
              </div>

              {/* Pending Request */}
              {pendingPocChange && (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 mb-4">
                  <div className="flex items-center gap-2 text-amber-800 font-medium mb-2">
                    <Clock className="h-4 w-4" />
                    POC Transfer Request Pending
                  </div>
                  <p className="text-sm text-amber-700">
                    Transfer to <strong>{newPocUser?.name || 'Unknown'}</strong> ({newPocUser?.email})
                  </p>
                  <p className="text-xs text-amber-600 mt-1">
                    Submitted {format(new Date(pendingPocChange.createdAt), 'PPP')}
                  </p>
                  {pendingPocChange.data.reason && (
                    <p className="text-sm text-amber-700 mt-2 italic">
                      Reason: {pendingPocChange.data.reason}
                    </p>
                  )}
                </div>
              )}

              {/* Transfer Button or Message */}
              {!pendingPocChange && eligiblePocUsers.length > 0 && (
                <Link href="/customer/settings/change-poc">
                  <Button className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto">
                    <Crown className="h-4 w-4 mr-2" />
                    Request POC Change
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}

              {!pendingPocChange && eligiblePocUsers.length === 0 && (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="text-sm text-slate-600">
                    <strong>No eligible users available.</strong> You need at least one other active team member to transfer the POC role.
                  </p>
                </div>
              )}

              {/* Warning */}
              {eligiblePocUsers.length > 0 && !pendingPocChange && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Transferring the POC role means you will no longer be able to manage team members or access settings.
                    This action requires admin approval.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Account Info - Only for POC */}
          {teamData.isPrimaryPoc && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  Account Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Company Name</span>
                    <span className="font-medium">{teamData.account.companyName}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b border-slate-100">
                    <span className="text-slate-500">Team Members</span>
                    <span className="font-medium">{teamData.users.length}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-slate-500">Active Users</span>
                    <span className="font-medium">
                      {teamData.users.filter(u => u.isActive).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Password Change - Available to all users */}
          <ChangePasswordForm apiEndpoint="/api/customer/change-password" />

          {/* Data Privacy Section */}
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5 text-slate-400" />
                Data & Privacy
              </CardTitle>
              <CardDescription>
                Manage your personal data and account
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Data Export */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-medium text-slate-900">Export Your Data</h3>
                  <p className="text-sm text-slate-500">
                    Download a copy of your personal data in JSON format
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    window.location.href = '/api/customer/data-export'
                  }}
                >
                  <Download className="h-4 w-4" />
                  Export Data
                </Button>
              </div>

              {/* Privacy Policy Link */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h3 className="font-medium text-slate-900">Privacy Policy</h3>
                  <p className="text-sm text-slate-500">
                    Learn how we collect, use, and protect your data
                  </p>
                </div>
                <Link href="/privacy">
                  <Button variant="outline" className="gap-2">
                    View Privacy Policy
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              {/* Delete Account */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-medium text-slate-900">Delete Account</h3>
                  <p className="text-sm text-slate-500">
                    Permanently delete your account and personal data
                  </p>
                </div>
                <DeleteAccountDialog />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
