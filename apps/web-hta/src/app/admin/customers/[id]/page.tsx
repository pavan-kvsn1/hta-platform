'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

  const [isUsersExpanded, setIsUsersExpanded] = useState(true)
  const [isCertificatesExpanded, setIsCertificatesExpanded] = useState(true)

  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    assignedAdminId: '',
  })

  const fetchData = useCallback(async () => {
    try {
      const [accountRes, adminsRes] = await Promise.all([
        apiFetch(`/api/admin/customers/${id}`),
        apiFetch('/api/admin/users/admins'),
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
  }, [id])

  useEffect(() => {
    fetchData()
  }, [id, fetchData])

  const handleSave = async () => {
    setError('')
    setSaving(true)

    try {
      const res = await apiFetch(`/api/admin/customers/${id}`, {
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
      const res = await apiFetch(`/api/admin/customers/${id}/users`, {
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

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (!account) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <p className="text-[14px] text-[#dc2626]">Customer account not found</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8 flex gap-6">
        {/* Left Panel - Main Content */}
        <div className="flex-1 min-w-0 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/customers"
                className="text-[#94a3b8] hover:text-[#0f172a] transition-colors"
              >
                <ChevronLeft className="size-5" />
              </Link>
              <div className="w-px h-6 bg-[#e2e8f0]" />
              <Building2 className="size-5 text-[#94a3b8]" />
              <div>
                <div className="flex items-center gap-2.5">
                  <h1 className="text-[22px] font-bold text-[#0f172a]">{account.companyName}</h1>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                      account.isActive
                        ? 'bg-[#f0fdf4] text-[#16a34a]'
                        : 'bg-[#f1f5f9] text-[#94a3b8]'
                    )}
                  >
                    {account.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-[12px] text-[#94a3b8]">
                  Created {format(new Date(account.createdAt), 'PPP')}
                </p>
              </div>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-3.5 py-1.5 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
              >
                Edit Details
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
              <AlertCircle className="size-3.5 text-[#dc2626] shrink-0" />
              <p className="text-[12px] text-[#dc2626]">{error}</p>
            </div>
          )}

          {/* Company Information */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <div className="flex items-center gap-2">
                <Building2 className="size-3.5 text-[#94a3b8]" />
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Company Information
                </h3>
              </div>
            </div>
            <div className="p-5">
              {isEditing ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Company Name *</label>
                      <input
                        value={formData.companyName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, companyName: e.target.value }))}
                        className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Assigned Admin</label>
                      <Select
                        value={formData.assignedAdminId || 'none'}
                        onValueChange={(value) =>
                          setFormData((prev) => ({
                            ...prev,
                            assignedAdminId: value === 'none' ? '' : value,
                          }))
                        }
                      >
                        <SelectTrigger className="h-10 rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
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
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Address</label>
                    <textarea
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Contact Email</label>
                      <input
                        type="email"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))}
                        className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Contact Phone</label>
                      <input
                        value={formData.contactPhone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))}
                        className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2.5 pt-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      disabled={saving}
                      className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
                    >
                      {saving && <Loader2 className="size-3.5 animate-spin" />}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Company Name</p>
                      <p className="text-[13px] font-semibold text-[#0f172a]">{account.companyName}</p>
                    </div>
                    {account.address && (
                      <div className="flex items-start gap-2">
                        <MapPin className="size-3.5 text-[#94a3b8] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Address</p>
                          <p className="text-[13px] text-[#64748b]">{account.address}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="flex items-start gap-2">
                      <Mail className="size-3.5 text-[#94a3b8] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Contact Email</p>
                        <p className="text-[13px] text-[#64748b]">{account.contactEmail || '\u2014'}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="size-3.5 text-[#94a3b8] mt-0.5 shrink-0" />
                      <div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Contact Phone</p>
                        <p className="text-[13px] text-[#64748b]">{account.contactPhone || '\u2014'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <UserCog className="size-3.5 text-[#94a3b8] mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Assigned Admin</p>
                      <p className="text-[13px] text-[#64748b]">{account.assignedAdmin?.name || 'Not assigned'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Primary POC */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#fffbeb]">
              <div className="flex items-center gap-2">
                <Crown className="size-3.5 text-[#d97706]" />
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#92400e]">
                  Primary Point of Contact
                </h3>
              </div>
            </div>
            <div className="p-5">
              {account.primaryPoc ? (
                <div className="flex items-start gap-4">
                  <div className="size-11 bg-[#fffbeb] rounded-full flex items-center justify-center shrink-0">
                    <Crown className="size-5 text-[#d97706]" />
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Name</p>
                      <p className="text-[13px] font-semibold text-[#0f172a]">{account.primaryPoc.name}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Email</p>
                      <p className="text-[13px] text-[#64748b]">{account.primaryPoc.email}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-0.5">Status</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={cn(
                            'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold',
                            account.primaryPoc.isActive
                              ? 'bg-[#f0fdf4] text-[#16a34a]'
                              : 'bg-[#fffbeb] text-[#d97706]'
                          )}
                        >
                          {account.primaryPoc.isActive ? 'Active' : 'Pending'}
                        </span>
                        {account.primaryPoc.activatedAt && (
                          <span className="text-[11px] text-[#94a3b8]">
                            since {format(new Date(account.primaryPoc.activatedAt), 'PP')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Crown className="size-8 mx-auto mb-2 text-[#e2e8f0]" />
                  <p className="text-[13px] text-[#94a3b8]">No primary POC assigned</p>
                </div>
              )}
            </div>
          </div>

          {/* Users Section */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
              <button
                onClick={() => setIsUsersExpanded(!isUsersExpanded)}
                className="flex items-center gap-2 hover:bg-[#f1f5f9] -ml-2 px-2 py-1 rounded transition-colors"
              >
                {isUsersExpanded ? (
                  <ChevronDown className="size-3.5 text-[#94a3b8]" />
                ) : (
                  <ChevronRight className="size-3.5 text-[#94a3b8]" />
                )}
                <Users className="size-3.5 text-[#94a3b8]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Users</span>
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f1f5f9] text-[#64748b]">
                  {users.length}
                </span>
              </button>
              <button
                onClick={() => setShowAddUserDialog(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-[#64748b] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded-md transition-colors"
              >
                <Plus className="size-3" />
                Add User
              </button>
            </div>
            {isUsersExpanded && (
              <div>
                {users.length === 0 ? (
                  <div className="text-center py-10">
                    <Users className="size-8 mx-auto mb-2 text-[#e2e8f0]" />
                    <p className="text-[13px] text-[#94a3b8] mb-3">No users registered yet</p>
                    <button
                      onClick={() => setShowAddUserDialog(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
                    >
                      <Plus className="size-3" />
                      Add First User
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th className="text-left py-2.5 px-5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Name</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Email</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Role</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-[#f1f5f9]">
                          <td className="py-2.5 px-5 font-medium text-[#0f172a]">
                            <div className="flex items-center gap-1.5">
                              {user.isPoc && <Crown className="size-3 text-[#d97706]" />}
                              {user.name}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-[#64748b]">{user.email}</td>
                          <td className="py-2.5 px-4">
                            {user.isPoc ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#d97706]">
                                POC
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f1f5f9] text-[#64748b]">
                                User
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold',
                                user.isActive
                                  ? 'bg-[#f0fdf4] text-[#16a34a]'
                                  : 'bg-[#fffbeb] text-[#d97706]'
                              )}
                            >
                              {user.isActive ? 'Active' : 'Pending'}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[12px] text-[#94a3b8]">
                            {format(new Date(user.createdAt), 'PP')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>

          {/* Certificates Section */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
              <button
                onClick={() => setIsCertificatesExpanded(!isCertificatesExpanded)}
                className="flex items-center gap-2 hover:bg-[#f1f5f9] -ml-2 px-2 py-1 rounded transition-colors"
              >
                {isCertificatesExpanded ? (
                  <ChevronDown className="size-3.5 text-[#94a3b8]" />
                ) : (
                  <ChevronRight className="size-3.5 text-[#94a3b8]" />
                )}
                <FileText className="size-3.5 text-[#94a3b8]" />
                <span className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Recent Certificates</span>
                <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f1f5f9] text-[#64748b]">
                  {certificateCount}
                </span>
              </button>
              {certificateCount > 10 && (
                <span className="text-[11px] text-[#94a3b8]">Showing 10 of {certificateCount}</span>
              )}
            </div>
            {isCertificatesExpanded && (
              <div>
                {recentCertificates.length === 0 ? (
                  <div className="text-center py-10">
                    <FileText className="size-8 mx-auto mb-2 text-[#e2e8f0]" />
                    <p className="text-[13px] text-[#94a3b8]">No certificates yet</p>
                  </div>
                ) : (
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th className="text-left py-2.5 px-5 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Certificate #</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Description</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Status</th>
                        <th className="text-left py-2.5 px-4 text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentCertificates.map((cert) => (
                        <tr key={cert.id} className="border-b border-[#f1f5f9]">
                          <td className="py-2.5 px-5 font-medium text-[#0f172a]">
                            {cert.certificateNumber}
                          </td>
                          <td className="py-2.5 px-4 text-[#64748b] max-w-xs truncate">
                            {cert.uucDescription || '\u2014'}
                          </td>
                          <td className="py-2.5 px-4">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#f1f5f9] text-[#64748b]">
                              {cert.status.replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-[12px] text-[#94a3b8]">
                            {format(new Date(cert.createdAt), 'PP')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Sidebar */}
        <div className="w-[320px] shrink-0 space-y-5 hidden lg:block">
          {/* Pending Requests */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="size-3.5 text-[#94a3b8]" />
                <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                  Pending Requests
                </h3>
              </div>
              {pendingRequests.length > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#fffbeb] text-[#d97706]">
                  {pendingRequests.length}
                </span>
              )}
            </div>
            <div className="p-4">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-6">
                  <Bell className="size-7 mx-auto mb-2 text-[#e2e8f0]" />
                  <p className="text-[12px] text-[#94a3b8]">No pending requests</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-3 bg-[#f8fafc] rounded-xl border border-[#e2e8f0]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2">
                          <div
                            className={cn(
                              'p-1.5 rounded-md',
                              request.type === 'USER_ADDITION' ? 'bg-[#eff6ff]' : 'bg-[#faf5ff]'
                            )}
                          >
                            {request.type === 'USER_ADDITION' ? (
                              <UserPlus className="size-3 text-[#2563eb]" />
                            ) : (
                              <Crown className="size-3 text-[#7c3aed]" />
                            )}
                          </div>
                          <div>
                            <span
                              className={cn(
                                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold',
                                request.type === 'USER_ADDITION'
                                  ? 'bg-[#eff6ff] text-[#1d4ed8]'
                                  : 'bg-[#faf5ff] text-[#7c3aed]'
                              )}
                            >
                              {request.type === 'USER_ADDITION' ? 'User Addition' : 'POC Change'}
                            </span>
                            {request.type === 'USER_ADDITION' && request.data.name && (
                              <p className="text-[12px] font-medium text-[#0f172a] mt-1">
                                {request.data.name}
                              </p>
                            )}
                            <p className="text-[10px] text-[#94a3b8] mt-0.5">
                              {formatDistanceToNow(new Date(request.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => router.push(`/admin/customers/requests/${request.id}`)}
                          className="p-1 text-[#94a3b8] hover:text-[#0f172a] hover:bg-[#f1f5f9] rounded transition-colors"
                        >
                          <Eye className="size-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-4 py-3.5 border-b border-[#f1f5f9] bg-[#f8fafc]">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Quick Actions
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <button
                onClick={() => setShowAddUserDialog(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium text-[#0f172a] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors text-left"
              >
                <UserPlus className="size-4 text-[#2563eb]" />
                Add New User
              </button>
              <button
                onClick={() => router.push(`/admin/certificates?customer=${encodeURIComponent(account.companyName)}`)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12.5px] font-medium text-[#0f172a] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors text-left"
              >
                <FileText className="size-4 text-[#7c3aed]" />
                View All Certificates
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add User Dialog */}
      <Dialog open={showAddUserDialog} onOpenChange={setShowAddUserDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[16px]">Add User to {account.companyName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Name *</label>
              <input
                value={newUser.name}
                onChange={(e) => setNewUser((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="John Smith"
                className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Email *</label>
              <input
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="john@company.com"
                className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
            </div>
            <div className="flex items-start gap-2.5 p-3 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl">
              <Mail className="size-3.5 text-[#2563eb] shrink-0 mt-0.5" />
              <p className="text-[12px] text-[#1e40af]">
                An invitation email will be sent to the user to activate their account.
              </p>
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setShowAddUserDialog(false)}
              className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAddUser}
              disabled={addingUser}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
            >
              {addingUser && <Loader2 className="size-3.5 animate-spin" />}
              Add User
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
