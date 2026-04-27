'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use } from 'react'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ChevronLeft,
  Loader2,
  Users,
  FileText,
  UserCog,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserTATMetrics } from '@/components/admin/UserTATMetrics'

interface User {
  id: string
  email: string
  name: string
  role: string
  adminType: string | null
  isAdmin: boolean
  isActive: boolean
  authProvider: string
  signatureUrl: string | null
  assignedAdmin: { id: string; name: string } | null
  engineers: { id: string; name: string; email: string }[]
  createdAt: string
  updatedAt: string
}

interface Stats {
  total: number
  byStatus: Record<string, number>
}

interface Admin {
  id: string
  name: string
  email: string
  adminType: string | null
  engineerCount: number
}

export default function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [user, setUser] = useState<User | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [admins, setAdmins] = useState<Admin[]>([])
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)
  const [showReactivateDialog, setShowReactivateDialog] = useState(false)

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    assignedAdminId: '',
    adminType: '' as 'MASTER' | 'WORKER' | '',
  })

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/admin/users/${id}`).then((res) => res.json()),
      apiFetch('/api/admin/users/admins').then((res) => res.json()),
    ])
      .then(([userData, adminsData]) => {
        if (userData.user) {
          setUser(userData.user)
          setStats(userData.stats)
          setFormData({
            name: userData.user.name,
            role: userData.user.role,
            assignedAdminId: userData.user.assignedAdmin?.id || '',
            adminType: userData.user.adminType || '',
          })
        }
        setAdmins(adminsData.admins || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.role === 'ENGINEER' && !formData.assignedAdminId) {
      setError('Please select an Admin for this engineer')
      return
    }

    if (formData.role === 'ADMIN' && !formData.adminType) {
      setError('Please select admin type (Master or Worker)')
      return
    }

    setSaving(true)

    try {
      const res = await apiFetch(`/api/admin/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          role: formData.role,
          assignedAdminId: formData.role === 'ENGINEER' ? formData.assignedAdminId : null,
          adminType: formData.role === 'ADMIN' ? formData.adminType : null,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update user')
      }

      router.push('/admin/users')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async () => {
    try {
      const res = await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to deactivate user')
      router.push('/admin/users')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user')
      setShowDeactivateDialog(false)
    }
  }

  const handleReactivate = async () => {
    try {
      const res = await apiFetch(`/api/admin/users/${id}/reactivate`, { method: 'PUT' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reactivate user')
      const userRes = await apiFetch(`/api/admin/users/${id}`)
      const userData = await userRes.json()
      if (userData.user) setUser(userData.user)
      setShowReactivateDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate user')
      setShowReactivateDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-full overflow-auto bg-[#f1f5f9]">
        <div className="px-6 sm:px-9 py-8">
          <div className="bg-white border border-[#e2e8f0] rounded-[14px] p-8 text-center">
            <div className="size-12 bg-[#fef2f2] rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="size-5 text-[#dc2626]" />
            </div>
            <p className="text-[13px] text-[#dc2626] mb-4">User not found</p>
            <button
              onClick={() => router.push('/admin/users')}
              className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              Back to Users
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8">
        {/* Back Link */}
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Users
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#f1f5f9]">
                <div>
                  <h1 className="text-[16px] font-bold text-[#0f172a] flex items-center gap-2">
                    <UserCog className="size-[18px] text-[#94a3b8]" />
                    Edit Staff User
                  </h1>
                </div>
                {user.isActive ? (
                  <button
                    onClick={() => setShowDeactivateDialog(true)}
                    className="px-3.5 py-1.5 text-[12px] font-semibold text-[#dc2626] border border-[#fecaca] bg-white hover:bg-[#fef2f2] rounded-[9px] transition-colors"
                  >
                    Deactivate User
                  </button>
                ) : (
                  <button
                    onClick={() => setShowReactivateDialog(true)}
                    className="px-3.5 py-1.5 text-[12px] font-semibold text-[#16a34a] border border-[#bbf7d0] bg-white hover:bg-[#f0fdf4] rounded-[9px] transition-colors"
                  >
                    Reactivate User
                  </button>
                )}
              </div>

              <form onSubmit={handleSubmit} className="p-5 space-y-5">
                {error && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                    <AlertCircle className="size-3.5 text-[#dc2626] shrink-0" />
                    <p className="text-[12px] text-[#dc2626]">{error}</p>
                  </div>
                )}

                {!user.isActive && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#fffbeb] border border-[#fde68a] rounded-lg">
                    <AlertCircle className="size-3.5 text-[#d97706] shrink-0" />
                    <p className="text-[12px] text-[#92400e]">This user is currently deactivated and cannot log in.</p>
                  </div>
                )}

                {/* Email (read-only) */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full px-3 py-2 text-[13px] text-[#94a3b8] border border-[#e2e8f0] rounded-[9px] bg-[#f8fafc]"
                  />
                  <p className="text-[11px] text-[#94a3b8] mt-1.5">Email cannot be changed</p>
                </div>

                {/* Name */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                    Full Name <span className="text-[#dc2626]">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                  />
                </div>

                {/* Role */}
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Role</label>
                  <Select
                    value={formData.role}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        role: value,
                        assignedAdminId: value !== 'ENGINEER' ? '' : prev.assignedAdminId,
                        adminType: value === 'ADMIN' ? prev.adminType : '',
                      }))
                    }
                  >
                    <SelectTrigger className="h-10 rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ENGINEER">Engineer</SelectItem>
                      <SelectItem value="ADMIN">Administrator</SelectItem>
                    </SelectContent>
                  </Select>
                  {user.role === 'ADMIN' && user.engineers.length > 0 && formData.role !== 'ADMIN' && (
                    <p className="text-[12px] text-[#d97706] mt-1.5">
                      This Admin has {user.engineers.length} assigned engineers. Reassign them before changing role.
                    </p>
                  )}
                </div>

                {/* Admin Assignment (for Engineers) */}
                {formData.role === 'ENGINEER' && (
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Assign to Admin <span className="text-[#dc2626]">*</span>
                    </label>
                    <Select
                      value={formData.assignedAdminId}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, assignedAdminId: value }))}
                    >
                      <SelectTrigger className="h-10 rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                        <SelectValue placeholder="Select Admin..." />
                      </SelectTrigger>
                      <SelectContent>
                        {admins.map((admin) => (
                          <SelectItem key={admin.id} value={admin.id}>
                            {admin.name}{' '}
                            <span className="text-[#94a3b8]">
                              ({admin.adminType === 'MASTER' ? 'Master' : 'Worker'} · {admin.engineerCount} engineers)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Admin Type (for Admin role) */}
                {formData.role === 'ADMIN' && (
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Admin Type</label>
                    <div className="flex gap-3">
                      <label
                        className={cn(
                          'flex-1 flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
                          formData.adminType === 'MASTER'
                            ? 'border-[#7c3aed] bg-[#faf5ff]'
                            : 'border-[#e2e8f0] hover:border-[#cbd5e1]'
                        )}
                      >
                        <input
                          type="radio"
                          name="adminType"
                          value="MASTER"
                          checked={formData.adminType === 'MASTER'}
                          onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value as 'MASTER' | 'WORKER' }))}
                          className="size-4 accent-[#7c3aed]"
                        />
                        <div>
                          <span className="text-[13px] font-semibold text-[#0f172a]">Master Admin</span>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Internal + Customer requests</p>
                        </div>
                      </label>
                      <label
                        className={cn(
                          'flex-1 flex items-center gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all',
                          formData.adminType === 'WORKER'
                            ? 'border-[#7c3aed] bg-[#faf5ff]'
                            : 'border-[#e2e8f0] hover:border-[#cbd5e1]'
                        )}
                      >
                        <input
                          type="radio"
                          name="adminType"
                          value="WORKER"
                          checked={formData.adminType === 'WORKER'}
                          onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value as 'MASTER' | 'WORKER' }))}
                          className="size-4 accent-[#7c3aed]"
                        />
                        <div>
                          <span className="text-[13px] font-semibold text-[#0f172a]">Worker Admin</span>
                          <p className="text-[11px] text-[#94a3b8] mt-0.5">Internal requests only</p>
                        </div>
                      </label>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => router.push('/admin/users')}
                    disabled={saving}
                    className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
                  >
                    {saving && <Loader2 className="size-3.5 animate-spin" />}
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Sidebar Info */}
          <div className="flex flex-col gap-4">
            {/* User Info */}
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5">
              <h2 className="text-[14px] font-semibold text-[#0f172a] mb-4">User Info</h2>
              <div className="divide-y divide-[#f1f5f9] text-[13px]">
                <div className="flex justify-between py-2.5">
                  <span className="text-[#64748b]">Status</span>
                  <span
                    className={cn(
                      'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold',
                      user.isActive
                        ? 'bg-[#f0fdf4] text-[#16a34a]'
                        : 'bg-[#f1f5f9] text-[#94a3b8]'
                    )}
                  >
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#64748b]">Auth</span>
                  <span className="font-medium text-[#0f172a]">{user.authProvider}</span>
                </div>
                <div className="flex justify-between py-2.5">
                  <span className="text-[#64748b]">Created</span>
                  <span className="font-medium text-[#0f172a]">{new Date(user.createdAt).toLocaleDateString()}</span>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5 flex-1">
              <h2 className="text-[14px] font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
                <FileText className="size-4 text-[#94a3b8]" />
                Certificates
              </h2>
              {stats ? (
                <div className="divide-y divide-[#f1f5f9] text-[13px]">
                  <div className="flex justify-between py-2.5">
                    <span className="text-[#64748b]">Total Created</span>
                    <span className="font-semibold text-[#0f172a]">{stats.total}</span>
                  </div>
                  {Object.entries(stats.byStatus).map(([status, count]) => (
                    <div key={status} className="flex justify-between py-2 text-[12px]">
                      <span className="text-[#94a3b8]">{status}</span>
                      <span className="text-[#64748b]">{count}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[12.5px] text-[#94a3b8]">No certificates yet</p>
              )}
            </div>

            {/* Managed Engineers (for Admins) */}
            {user.role === 'ADMIN' && user.engineers.length > 0 && (
              <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5">
                <h2 className="text-[14px] font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
                  <Users className="size-4 text-[#94a3b8]" />
                  Managed Engineers ({user.engineers.length})
                </h2>
                <div className="space-y-2.5">
                  {user.engineers.map((eng) => (
                    <div key={eng.id} className="text-[13px]">
                      <p className="font-medium text-[#0f172a]">{eng.name}</p>
                      <p className="text-[11px] text-[#94a3b8]">{eng.email}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="mt-5">
          <UserTATMetrics userId={id} userRole={user.role} adminType={user.adminType} periodDays={30} />
        </div>
      </div>

      {/* Deactivate Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will prevent {user.name} from logging in. Their certificates and data
              will be preserved. You can reactivate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reactivate Dialog */}
      <AlertDialog open={showReactivateDialog} onOpenChange={setShowReactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will allow {user.name} to log in again with their existing credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              className="bg-[#16a34a] hover:bg-[#15803d]"
            >
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
