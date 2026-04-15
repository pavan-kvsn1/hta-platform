'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { ArrowLeft, Loader2, Users, FileText, Clock as _Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserTATMetrics } from '@/components/admin/UserTATMetrics'

interface User {
  id: string
  email: string
  name: string
  role: string
  adminType: string | null  // 'MASTER' | 'WORKER' for admins
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
      fetch(`/api/admin/users/${id}`).then((res) => res.json()),
      fetch('/api/admin/users/admins').then((res) => res.json()),
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
      const res = await fetch(`/api/admin/users/${id}`, {
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
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to deactivate user')
      }

      router.push('/admin/users')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate user')
      setShowDeactivateDialog(false)
    }
  }

  const handleReactivate = async () => {
    try {
      const res = await fetch(`/api/admin/users/${id}/reactivate`, {
        method: 'PUT',
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reactivate user')
      }

      // Refresh user data
      const userRes = await fetch(`/api/admin/users/${id}`)
      const userData = await userRes.json()
      if (userData.user) {
        setUser(userData.user)
      }
      setShowReactivateDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate user')
      setShowReactivateDialog(false)
    }
  }

  if (loading) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden h-full">
          <div className="p-6 flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
          </div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden h-full">
          <div className="p-6">
            <p className="text-red-600">User not found</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 h-full bg-section-inner">
      {/* Master Bounding Box */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden h-full">
        <div className="p-6 overflow-auto h-full">
          {/* Back Link */}
          <Link
            href="/admin/users"
            className="inline-flex items-center text-sm text-slate-600 hover:text-slate-900 mb-6"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Users
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Form */}
              <div className="lg:col-span-2 border border-slate-300 rounded-lg">
                <Card className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>Edit Staff User</CardTitle>
                    {user.isActive ? (
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-300 hover:bg-red-50"
                        onClick={() => setShowDeactivateDialog(true)}
                      >
                        Deactivate User
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="text-green-600 border-green-300 hover:bg-green-50"
                        onClick={() => setShowReactivateDialog(true)}
                      >
                        Reactivate User
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                      {error && (
                        <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-300">
                          {error}
                        </div>
                      )}

                      {/* Status Badge */}
                      {!user.isActive && (
                        <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg">
                          <p className="text-sm text-amber-800">
                            This user is currently deactivated and cannot log in.
                          </p>
                        </div>
                      )}

                      {/* Email (read-only) */}
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={user.email}
                          disabled
                          className="bg-slate-50 border border-slate-300"
                        />
                        <p className="text-xs text-slate-500">Email cannot be changed</p>
                      </div>

                      {/* Name */}
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          type="text"
                          value={formData.name}
                          onChange={(e) =>
                            setFormData((prev) => ({ ...prev, name: e.target.value }))
                          }
                          required
                          className="border border-slate-300"
                        />
                      </div>

                      {/* Role */}
                      <div className="space-y-2">
                        <Label htmlFor="role">Role</Label>
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
                          <SelectTrigger className="border border-slate-300">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ENGINEER">Engineer</SelectItem>
                            <SelectItem value="ADMIN">Administrator</SelectItem>
                          </SelectContent>
                        </Select>
                        {user.role === 'ADMIN' && user.engineers.length > 0 && formData.role !== 'ADMIN' && (
                          <p className="text-sm text-amber-600">
                            This Admin has {user.engineers.length} assigned engineers. Reassign them before
                            changing role.
                          </p>
                        )}
                      </div>

                      {/* Admin Assignment (for Engineers) */}
                      {formData.role === 'ENGINEER' && (
                        <div className="space-y-2">
                          <Label htmlFor="assignedAdminId">Assign to Admin</Label>
                          <Select
                            value={formData.assignedAdminId}
                            onValueChange={(value) =>
                              setFormData((prev) => ({ ...prev, assignedAdminId: value }))
                            }
                          >
                            <SelectTrigger className="border border-slate-300">
                              <SelectValue placeholder="Select Admin..." />
                            </SelectTrigger>
                            <SelectContent>
                              {admins.map((admin) => (
                                <SelectItem key={admin.id} value={admin.id}>
                                  {admin.name}{' '}
                                  <span className="text-slate-500">
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
                        <div className="space-y-2">
                          <Label>Admin Type</Label>
                          <div className="flex gap-4">
                            <label className={cn(
                              "flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                              formData.adminType === 'MASTER'
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-300 hover:border-slate-300"
                            )}>
                              <input
                                type="radio"
                                name="adminType"
                                value="MASTER"
                                checked={formData.adminType === 'MASTER'}
                                onChange={(e) =>
                                  setFormData((prev) => ({ ...prev, adminType: e.target.value as 'MASTER' | 'WORKER' }))
                                }
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <span className="font-medium text-slate-900">Master Admin</span>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Internal + Customer requests
                                </p>
                              </div>
                            </label>
                            <label className={cn(
                              "flex-1 flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                              formData.adminType === 'WORKER'
                                ? "border-blue-500 bg-blue-50"
                                : "border-slate-300 hover:border-slate-300"
                            )}>
                              <input
                                type="radio"
                                name="adminType"
                                value="WORKER"
                                checked={formData.adminType === 'WORKER'}
                                onChange={(e) =>
                                  setFormData((prev) => ({ ...prev, adminType: e.target.value as 'MASTER' | 'WORKER' }))
                                }
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                              />
                              <div>
                                <span className="font-medium text-slate-900">Worker Admin</span>
                                <p className="text-xs text-slate-500 mt-0.5">
                                  Internal requests only
                                </p>
                              </div>
                            </label>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex gap-3 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => router.push('/admin/users')}
                          disabled={saving}
                          className="border border-slate-300"
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          className="bg-green-600 hover:bg-green-700 border border-green-600"
                          disabled={saving}
                        >
                          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Changes
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar Info - matches form height */}
              <div className="flex flex-col gap-4">
                {/* User Info Card */}
                <Card className="border border-slate-300">
                  <CardHeader>
                    <CardTitle className="text-base">User Info</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status</span>
                      <Badge
                        className={cn(
                          user.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {user.isActive ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Auth</span>
                      <span>{user.authProvider}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Created</span>
                      <span>{new Date(user.createdAt).toLocaleDateString()}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Stats Card - fills remaining space */}
                <Card className="flex-1 border border-slate-300">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-slate-300" />
                      Certificates
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {stats ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Total Created</span>
                          <span className="font-medium">{stats.total}</span>
                        </div>
                        {Object.entries(stats.byStatus).map(([status, count]) => (
                          <div key={status} className="flex justify-between text-xs">
                            <span className="text-slate-300">{status}</span>
                            <span>{count}</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <p className="text-slate-300 text-sm">No certificates yet</p>
                    )}
                  </CardContent>
                </Card>

                {/* Managed Engineers (for Admins) */}
                {user.role === 'ADMIN' && user.engineers.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-slate-300" />
                        Managed Engineers ({user.engineers.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {user.engineers.map((eng) => (
                        <div key={eng.id} className="text-sm">
                          <p className="font-medium">{eng.name}</p>
                          <p className="text-xs text-slate-500">{eng.email}</p>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* Performance Metrics - Full Width */}
            <div className="mt-6">
              <UserTATMetrics userId={id} userRole={user.role} adminType={user.adminType} periodDays={30} />
            </div>
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
              className="bg-red-600 hover:bg-red-700"
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
              className="bg-green-600 hover:bg-green-700"
            >
              Reactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
