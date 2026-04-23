'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
} from 'lucide-react'
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

export default function UsersPage() {
  const router = useRouter()
  const [teamData, setTeamData] = useState<TeamData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add User Dialog
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [addUserName, setAddUserName] = useState('')
  const [addUserEmail, setAddUserEmail] = useState('')
  const [addUserSubmitting, setAddUserSubmitting] = useState(false)
  const [addUserError, setAddUserError] = useState('')

  // Signature state
  const signatureRef = useRef<TypedSignatureHandle>(null)
  const [signatureConsent, setSignatureConsent] = useState(false)
  const [signatureReady, setSignatureReady] = useState(false)

  // POC Change Dialog
  const [pocChangeOpen, setPocChangeOpen] = useState(false)
  const [newPocUserId, setNewPocUserId] = useState('')
  const [pocChangeReason, setPocChangeReason] = useState('')
  const [pocChangeSubmitting, setPocChangeSubmitting] = useState(false)
  const [pocChangeError, setPocChangeError] = useState('')

  // Get current user's name for signature
  const currentUserName = teamData?.users.find(u => u.id === teamData.currentUserId)?.name || ''

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

  useEffect(() => {
    fetchTeamData()
  }, [fetchTeamData])

  const resetAddUserForm = () => {
    setAddUserOpen(false)
    setAddUserName('')
    setAddUserEmail('')
    setSignatureConsent(false)
    setSignatureReady(false)
    signatureRef.current?.clear()
    setAddUserError('')
  }

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setAddUserError('')

    // Validate signature
    if (!signatureConsent || !signatureReady || signatureRef.current?.isEmpty()) {
      setAddUserError('Please provide your signature and consent to submit this request')
      return
    }

    setAddUserSubmitting(true)

    try {
      // Get signature data
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

      // Refresh data and close dialog
      await fetchTeamData()
      resetAddUserForm()
    } catch (err) {
      console.error('Add user error:', err)
      setAddUserError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setAddUserSubmitting(false)
    }
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

      // Refresh data and close dialog
      await fetchTeamData()
      setPocChangeOpen(false)
      setNewPocUserId('')
      setPocChangeReason('')
    } catch (err) {
      setPocChangeError(err instanceof Error ? err.message : 'Failed to submit request')
    } finally {
      setPocChangeSubmitting(false)
    }
  }

  // Get eligible users for POC transfer (active users except current user)
  const eligiblePocUsers = teamData?.users.filter(
    (user) => user.id !== teamData.currentUserId && user.isActive
  ) || []

  // Check if there's a pending POC change request
  const hasPendingPocChange = teamData?.pendingRequests.some(
    (req) => req.type === 'POC_CHANGE'
  ) || false

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
            <p className="text-red-600 mb-4">{error || 'Failed to load team data'}</p>
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Users</h1>
              <p className="text-slate-500 mt-1">
                Manage team members for {teamData.account.companyName}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* POC Transfer Button */}
              {teamData.isPrimaryPoc && eligiblePocUsers.length > 0 && !hasPendingPocChange && (
                <Dialog open={pocChangeOpen} onOpenChange={setPocChangeOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <ArrowRightLeft className="h-4 w-4 mr-2" />
                      Transfer POC
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <form onSubmit={handlePocChange}>
                      <DialogHeader>
                        <DialogTitle>Request POC Transfer</DialogTitle>
                        <DialogDescription>
                          Request to transfer your Primary Point of Contact role to another team member.
                          HTA admin will review and approve the request.
                        </DialogDescription>
                      </DialogHeader>

                      {pocChangeError && (
                        <div className="my-4 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                          {pocChangeError}
                        </div>
                      )}

                      <div className="space-y-4 my-4">
                        <div className="space-y-2">
                          <Label htmlFor="newPoc">New POC</Label>
                          <Select value={newPocUserId} onValueChange={setNewPocUserId}>
                            <SelectTrigger>
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
                        <div className="space-y-2">
                          <Label htmlFor="reason">Reason (optional)</Label>
                          <Textarea
                            id="reason"
                            value={pocChangeReason}
                            onChange={(e) => setPocChangeReason(e.target.value)}
                            placeholder="e.g., Role change, leaving company..."
                            rows={3}
                            disabled={pocChangeSubmitting}
                          />
                        </div>
                      </div>

                      <DialogFooter>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setPocChangeOpen(false)}
                          disabled={pocChangeSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          className="bg-purple-600 hover:bg-purple-700"
                          disabled={pocChangeSubmitting || !newPocUserId}
                        >
                          {pocChangeSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Submit Request'
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}

              {/* Add User Button */}
              {teamData.isPrimaryPoc && (
                <Dialog open={addUserOpen} onOpenChange={(open) => {
                  if (!open) resetAddUserForm()
                  else setAddUserOpen(true)
                }}>
                  <DialogTrigger asChild>
                    <Button className="bg-green-600 hover:bg-green-700">
                      <UserPlus className="h-4 w-4 mr-2" />
                      + Request User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <form onSubmit={handleAddUser}>
                      <DialogHeader>
                        <DialogTitle className="text-xl">Request New User</DialogTitle>
                        <DialogDescription>
                          Submit a request to add a new user to your organization. Your signature is required to authorize this request.
                        </DialogDescription>
                      </DialogHeader>

                      {addUserError && (
                        <div className="my-4 p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                          {addUserError}
                        </div>
                      )}

                      <div className="space-y-6 my-6">
                        {/* New User Details Section */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            New User Details
                          </h3>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="name">Full Name</Label>
                              <Input
                                id="name"
                                value={addUserName}
                                onChange={(e) => setAddUserName(e.target.value)}
                                placeholder="John Smith"
                                required
                                disabled={addUserSubmitting}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="email">Email Address</Label>
                              <Input
                                id="email"
                                type="email"
                                value={addUserEmail}
                                onChange={(e) => setAddUserEmail(e.target.value)}
                                placeholder="john.smith@company.com"
                                required
                                disabled={addUserSubmitting}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div className="border-t border-slate-200" />

                        {/* POC Signature Section */}
                        <div className="space-y-4">
                          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                            <PenTool className="h-4 w-4" />
                            POC Authorization Signature
                          </h3>

                          {/* Signature Preview - uses logged-in user's name */}
                          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                            <Label className="text-xs text-slate-500 mb-2 block">
                              Signing as: <span className="font-semibold text-slate-700">{currentUserName}</span>
                            </Label>
                            <TypedSignature
                              ref={signatureRef}
                              name={currentUserName}
                              width={500}
                              height={120}
                              onSignatureReady={setSignatureReady}
                            />
                          </div>

                          {/* Consent Checkbox */}
                          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <Checkbox
                              id="consent"
                              checked={signatureConsent}
                              onCheckedChange={(checked) => setSignatureConsent(checked === true)}
                              disabled={addUserSubmitting}
                              className="mt-0.5 shrink-0 h-5 w-5 border-2 border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:border-amber-600"
                            />
                            <Label htmlFor="consent" className="text-sm text-amber-800 cursor-pointer leading-relaxed">
                              I, {currentUserName}, as the Primary Point of Contact for {teamData.account.companyName}, authorize this request to add a new user to our organization&apos;s HTA portal account. I understand this request will be reviewed by HTA administration.
                            </Label>
                          </div>
                        </div>

                        {/* Info Note */}
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <p className="text-sm text-blue-700">
                            <strong>Note:</strong> This request will be reviewed by HTA admin before the user is added. You will be notified once the request is processed.
                          </p>
                        </div>
                      </div>

                      <DialogFooter className="gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={resetAddUserForm}
                          disabled={addUserSubmitting}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          className="bg-green-600 hover:bg-green-700"
                          disabled={addUserSubmitting || !signatureConsent || !signatureReady}
                        >
                          {addUserSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            'Submit Request'
                          )}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          {/* Pending Requests */}
          {teamData.pendingRequests.length > 0 && (
            <Card className="mb-6 border-amber-200 bg-amber-50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                  <Clock className="h-4 w-4" />
                  Pending Requests
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {teamData.pendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center justify-between bg-white p-3 rounded-lg border border-amber-200"
                  >
                    <div className="flex items-center gap-3">
                      {req.type === 'USER_ADDITION' ? (
                        <UserPlus className="h-5 w-5 text-blue-600" />
                      ) : (
                        <ArrowRightLeft className="h-5 w-5 text-purple-600" />
                      )}
                      <div>
                        <p className="font-medium text-slate-900">
                          {req.type === 'USER_ADDITION'
                            ? `Add: ${req.data.name} (${req.data.email})`
                            : 'POC Transfer Request'}
                        </p>
                        <p className="text-sm text-slate-500">
                          Submitted {format(new Date(req.createdAt), 'PPP')}
                        </p>
                      </div>
                    </div>
                    <Badge className="bg-amber-100 text-amber-700">Pending Review</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Users Table */}
          <div className="bg-white rounded-lg border shadow-sm">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                Team Members ({teamData.users.length})
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData.users.map((user) => {
                  const isPoc = user.id === teamData.account.primaryPocId
                  const isCurrentUser = user.id === teamData.currentUserId

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                            {isPoc ? (
                              <Crown className="h-4 w-4 text-amber-600" />
                            ) : (
                              <User className="h-4 w-4 text-green-700" />
                            )}
                          </div>
                          <div>
                            <span className="font-medium">{user.name}</span>
                            {isCurrentUser && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{user.email}</TableCell>
                      <TableCell>
                        {isPoc ? (
                          <Badge className="bg-amber-100 text-amber-700">
                            <Crown className="h-3 w-3 mr-1" />
                            POC
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600">
                            <User className="h-3 w-3 mr-1" />
                            User
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.isActive ? (
                          <Badge className="bg-green-100 text-green-700">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-600">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-500">
                        {user.activatedAt
                          ? format(new Date(user.activatedAt), 'PP')
                          : format(new Date(user.createdAt), 'PP')}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Info for non-POC users */}
          {!teamData.isPrimaryPoc && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="font-medium text-blue-800">View Only</p>
                  <p className="text-sm text-blue-700 mt-1">
                    Only the Primary Point of Contact can request new team members or transfer the POC role.
                    Contact {teamData.primaryPoc?.name || 'your POC'} if you need to make changes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
