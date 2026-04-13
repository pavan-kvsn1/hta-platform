'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  ChevronLeft,
  ChevronDown,
  ChevronRight,
  Loader2,
  Users,
  FileText,
  Building2,
  Crown,
  UserPlus,
  Eye,
  Plus,
  Bell,
  Mail,
  Phone,
  MapPin,
  UserCog,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'

interface CustomerAccount {
  id: string
  companyName: string
  address: string | null
  contactEmail: string | null
  contactPhone: string | null
  isActive: boolean
  assignedAdmin: { id: string; name: string; email: string } | null
  primaryPocId: string | null
  primaryPoc: {
    id: string
    name: string
    email: string
    isActive: boolean
    activatedAt: string | null
    createdAt: string
  } | null
  createdAt: string
  updatedAt: string
}

interface CustomerUser {
  id: string
  email: string
  name: string
  isPoc: boolean
  isActive: boolean
  activatedAt: string | null
  createdAt: string
}

interface CustomerRequest {
  id: string
  type: 'USER_ADDITION' | 'POC_CHANGE'
  data: { name?: string; email?: string; newPocUserId?: string; reason?: string }
  requestedBy: { id: string; name: string; email: string } | null
  createdAt: string
}

interface Certificate {
  id: string
  certificateNumber: string
  uucDescription: string | null
  status: string
  createdAt: string
}

interface Admin {
  id: string
  name: string
  email: string
  adminType: string | null
}

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [account, setAccount] = useState<CustomerAccount | null>(null)
  const [users, setUsers] = useState<CustomerUser[]>([])
  const [pendingRequests, setPendingRequests] = useState<CustomerRequest[]>([])
  const [recentCertificates, setRecentCertificates] = useState<Certificate[]>([])
  const [certificateCount, setCertificateCount] = useState(0)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [isEditing, setIsEditing] = useState(false)
  const [showAddUserDialog, setShowAddUserDialog] = useState(false)
  const [addingUser, setAddingUser] = useState(false)
  const [newUser, setNewUser] = useState({ name: '', email: '' })

  // Collapsible states
  const [isUsersExpanded, setIsUsersExpanded] = useState(true)
  const [isCertificatesExpanded, setIsCertificatesExpanded] = useState(true)

  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    assignedAdminId: '',
  })

  const fetchData = async () => {
    try {
      const [accountRes, adminsRes] = await Promise.all([
        fetch(`/api/admin/customers/${id}`),
        fetch('/api/admin/users/admins'),
      ])

      if (accountRes.ok) {
        const data = await accountRes.json()
        setAccount(data.account)
        setUsers(data.users)
        setPendingRequests(data.pendingRequests || [])
        setRecentCertificates(data.recentCertificates)
        setCertificateCount(data.certificateCount)
        setFormData({
          companyName: data.account.companyName,
          address: data.account.address || '',
          contactEmail: data.account.contactEmail || '',
          contactPhone: data.account.contactPhone || '',
          assignedAdminId: data.account.assignedAdmin?.id || '',
        })
      }

      if (adminsRes.ok) {
        const adminsData = await adminsRes.json()
        setAdmins(adminsData.admins || [])
      }
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [id])

  const handleSave = async () => {
    setError('')
    setSaving(true)

    try {
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: formData.companyName,
          address: formData.address || null,
          contactEmail: formData.contactEmail || null,
          contactPhone: formData.contactPhone || null,
          assignedAdminId: formData.assignedAdminId || null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update account')
      }

      setIsEditing(false)
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update account')
    } finally {
      setSaving(false)
    }
  }

  const handleAddUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) {
      setError('Name and email are required')
      return
    }

    setAddingUser(true)
    setError('')

    try {
      const res = await fetch(`/api/admin/customers/${id}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to add user')
      }

      setShowAddUserDialog(false)
      setNewUser({ name: '', email: '' })
      fetchData()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add user')
    } finally {
      setAddingUser(false)
    }
  }

  // Compute stats
  const activeUsers = users.filter((u) => u.isActive).length
  const pendingUsers = users.filter((u) => !u.isActive).length
  const inProgressCerts = recentCertificates.filter(
    (c) => c.status !== 'CUSTOMER_APPROVED' && c.status !== 'REJECTED'
  ).length

  if (loading) {
    return (
      <div className="flex h-full bg-slate-100 p-3 gap-3 overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="flex h-full bg-slate-100 p-3 gap-3 overflow-hidden">
        <div className="flex-1 flex items-center justify-center bg-white rounded-xl border border-slate-200 shadow-sm">
          <p className="text-red-600">Customer account not found</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full p-3 gap-3 overflow-hidden bg-section-inner border shadow-sm">
      {/* Left Panel - Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Link
                  href="/admin/customers"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <ChevronLeft className="size-5" strokeWidth={2} />
                </Link>
                <span className="text-slate-300 text-xl">|</span>
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Building2 className="size-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                    {account.companyName}
                  </h1>
                  <p className="text-xs text-slate-500">
                    Created {format(new Date(account.createdAt), 'PPP')}
                  </p>
                </div>
                <Badge
                  className={cn(
                    'ml-2',
                    account.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {account.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              {!isEditing && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  Edit Details
                </Button>
              )}
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-auto p-6 space-y-6">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            {/* Company Information */}
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Building2 className="size-4 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">Company Information</h3>
                </div>
              </div>
              <div className="p-5">
                {isEditing ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Company Name *</Label>
                        <Input
                          value={formData.companyName}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, companyName: e.target.value }))
                          }
                          className="text-sm border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Assigned Admin</Label>
                        <Select
                          value={formData.assignedAdminId || 'none'}
                          onValueChange={(value) =>
                            setFormData((prev) => ({
                              ...prev,
                              assignedAdminId: value === 'none' ? '' : value,
                            }))
                          }
                        >
                          <SelectTrigger className="text-sm border border-slate-300 rounded-lg">
                            <SelectValue placeholder="Select Admin..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Admin assigned</SelectItem>
                            {admins.map((admin) => (
                              <SelectItem key={admin.id} value={admin.id}>
                                {admin.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold text-slate-600">Address</Label>
                      <Textarea
                        value={formData.address}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, address: e.target.value }))
                        }
                        rows={2}
                        className="text-sm border-slate-300"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Contact Email</Label>
                        <Input
                          type="email"
                          value={formData.contactEmail}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))
                          }
                          className="text-sm border-slate-300"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-semibold text-slate-600">Contact Phone</Label>
                        <Input
                          value={formData.contactPhone}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))
                          }
                          className="text-sm border-slate-300"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsEditing(false)}
                        disabled={saving}
                        className='border-slate-300'
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Company Name
                        </p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">
                          {account.companyName}
                        </p>
                      </div>
                      {account.address && (
                        <div className="flex items-start gap-2">
                          <MapPin className="size-4 text-slate-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                              Address
                            </p>
                            <p className="text-sm text-slate-700 mt-0.5">{account.address}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div className="flex items-start gap-2">
                        <Mail className="size-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                            Contact Email
                          </p>
                          <p className="text-sm text-slate-700 mt-0.5">
                            {account.contactEmail || '-'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="size-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                            Contact Phone
                          </p>
                          <p className="text-sm text-slate-700 mt-0.5">
                            {account.contactPhone || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                       <UserCog className="size-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                            Assigned Admin
                          </p>
                          <p className="text-sm text-slate-700 mt-0.5">
                            {account.assignedAdmin?.name || 'Not assigned'}
                          </p>
                        </div>
                      </div>
                  </div>
                )}
              </div>
            </div>

            {/* Primary POC */}
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-amber-50/50">
                <div className="flex items-center gap-2">
                  <Crown className="size-4 text-amber-600" />
                  <h3 className="font-semibold text-slate-900">Primary Point of Contact</h3>
                </div>
              </div>
              <div className="p-5">
                {account.primaryPoc ? (
                  <div className="flex items-start gap-4">
                    <div className="h-12 w-12 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Crown className="h-6 w-6 text-amber-600" />
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Name
                        </p>
                        <p className="text-sm font-semibold text-slate-900 mt-0.5">
                          {account.primaryPoc.name}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Email
                        </p>
                        <p className="text-sm text-slate-700 mt-0.5">{account.primaryPoc.email}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
                          Status
                        </p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <Badge
                            className={cn(
                              'text-xs',
                              account.primaryPoc.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-amber-100 text-amber-700'
                            )}
                          >
                            {account.primaryPoc.isActive ? 'Active' : 'Pending'}
                          </Badge>
                          {account.primaryPoc.activatedAt && (
                            <span className="text-xs text-slate-500">
                              since {format(new Date(account.primaryPoc.activatedAt), 'PP')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 text-slate-500">
                    <Crown className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No primary POC assigned</p>
                  </div>
                )}
              </div>
            </div>

            {/* Users Section - Collapsible */}
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <button
                  onClick={() => setIsUsersExpanded(!isUsersExpanded)}
                  className="flex items-center gap-2 hover:bg-slate-100 -ml-2 px-2 py-1 rounded transition-colors"
                >
                  {isUsersExpanded ? (
                    <ChevronDown className="size-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="size-4 text-slate-400" />
                  )}
                  <Users className="size-4 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">Users</h3>
                  <Badge variant="secondary" className="ml-2">
                    {users.length}
                  </Badge>
                </button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowAddUserDialog(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add User
                </Button>
              </div>
              {isUsersExpanded && (
                <div className="p-5">
                  {users.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <Users className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No users registered yet</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setShowAddUserDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Add First User
                      </Button>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100/50">
                            <TableHead className="text-xs font-semibold">Name</TableHead>
                            <TableHead className="text-xs font-semibold">Email</TableHead>
                            <TableHead className="text-xs font-semibold">Role</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Joined</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {users.map((user) => (
                            <TableRow key={user.id} className="bg-white">
                              <TableCell className="font-medium text-sm">
                                <div className="flex items-center gap-2">
                                  {user.isPoc && <Crown className="h-4 w-4 text-amber-500" />}
                                  {user.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-slate-500 text-sm">{user.email}</TableCell>
                              <TableCell>
                                {user.isPoc ? (
                                  <Badge className="bg-amber-100 text-amber-700 text-xs">POC</Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    User
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={cn(
                                    'text-xs',
                                    user.isActive
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-amber-100 text-amber-700'
                                  )}
                                >
                                  {user.isActive ? 'Active' : 'Pending'}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-500 text-xs">
                                {format(new Date(user.createdAt), 'PP')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Certificates Section - Collapsible */}
            <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <button
                  onClick={() => setIsCertificatesExpanded(!isCertificatesExpanded)}
                  className="flex items-center gap-2 hover:bg-slate-100 -ml-2 px-2 py-1 rounded transition-colors"
                >
                  {isCertificatesExpanded ? (
                    <ChevronDown className="size-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="size-4 text-slate-400" />
                  )}
                  <FileText className="size-4 text-slate-500" />
                  <h3 className="font-semibold text-slate-900">Recent Certificates</h3>
                  <Badge variant="secondary" className="ml-2">
                    {certificateCount}
                  </Badge>
                </button>
                {certificateCount > 10 && (
                  <span className="text-xs text-slate-500">Showing 10 of {certificateCount}</span>
                )}
              </div>
              {isCertificatesExpanded && (
                <div className="p-5">
                  {recentCertificates.length === 0 ? (
                    <div className="text-center py-8 text-slate-500">
                      <FileText className="h-10 w-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No certificates yet</p>
                    </div>
                  ) : (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-100/50">
                            <TableHead className="text-xs font-semibold">Certificate #</TableHead>
                            <TableHead className="text-xs font-semibold">Description</TableHead>
                            <TableHead className="text-xs font-semibold">Status</TableHead>
                            <TableHead className="text-xs font-semibold">Created</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {recentCertificates.map((cert) => (
                            <TableRow key={cert.id} className="bg-white">
                              <TableCell className="font-medium text-sm">
                                {cert.certificateNumber}
                              </TableCell>
                              <TableCell className="text-slate-500 text-sm max-w-xs truncate">
                                {cert.uucDescription || '-'}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  {cert.status.replace(/_/g, ' ')}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-500 text-xs">
                                {format(new Date(cert.createdAt), 'PP')}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Quick Stats, Pending Requests, Quick Actions */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Pending Requests */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-1">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="size-4 text-slate-500" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Pending Requests
              </h3>
            </div>
            {pendingRequests.length > 0 && (
              <Badge className="bg-amber-100 text-amber-700 text-xs">
                {pendingRequests.length}
              </Badge>
            )}
          </div>
          <div className="p-4">
            {pendingRequests.length === 0 ? (
              <div className="text-center py-6 text-slate-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                <p className="text-sm">No pending requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingRequests.map((request) => (
                  <div
                    key={request.id}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <div
                          className={cn(
                            'p-1.5 rounded',
                            request.type === 'USER_ADDITION' ? 'bg-blue-100' : 'bg-purple-100'
                          )}
                        >
                          {request.type === 'USER_ADDITION' ? (
                            <UserPlus className="h-3.5 w-3.5 text-blue-600" />
                          ) : (
                            <Crown className="h-3.5 w-3.5 text-purple-600" />
                          )}
                        </div>
                        <div>
                          <Badge
                            className={cn(
                              'text-[10px]',
                              request.type === 'USER_ADDITION'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            )}
                          >
                            {request.type === 'USER_ADDITION' ? 'User Addition' : 'POC Change'}
                          </Badge>
                          {request.type === 'USER_ADDITION' && request.data.name && (
                            <p className="text-xs font-medium text-slate-700 mt-1">
                              {request.data.name}
                            </p>
                          )}
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => router.push(`/admin/requests/${request.id}?type=customer`)}
                      >
                        <Eye className="h-3 w-3 mr-1" />
                        View
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Quick Actions
            </h3>
          </div>
          <div className="p-4 space-y-2">
            <Button
              variant="outline"
              className="w-full justify-start text-sm"
              onClick={() => setShowAddUserDialog(true)}
            >
              <UserPlus className="h-4 w-4 mr-2 text-blue-600" />
              Add New User
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-sm"
              onClick={() => router.push(`/admin/certificates?customer=${encodeURIComponent(account.companyName)}`)}
            >
              <FileText className="h-4 w-4 mr-2 text-purple-600" />
              View All Certificates
            </Button>
          </div>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add User to {account.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="userName">Name *</Label>
              <Input
                id="userName"
                value={newUser.name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="userEmail">Email *</Label>
              <Input
                id="userEmail"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="john@company.com"
              />
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              An invitation email will be sent to the user to activate their account.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddUserDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              disabled={addingUser}
              className="bg-green-600 hover:bg-green-700"
            >
              {addingUser && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
