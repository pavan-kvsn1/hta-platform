'use client'

import { useState, useEffect } from 'react'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ArrowLeft, Loader2, Mail, CheckCircle } from 'lucide-react'

interface Admin {
  id: string
  name: string
  email: string
  adminType: string | null
  engineerCount: number
}

export default function CreateUserPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ email: string } | null>(null)
  const [admins, setAdmins] = useState<Admin[]>([])

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'ENGINEER',
    assignedAdminId: '',
    adminType: 'WORKER',
  })

  useEffect(() => {
    // Fetch Admins for assignment dropdown
    fetch('/api/admin/users/admins')
      .then((res) => res.json())
      .then((data) => setAdmins(data.admins || []))
      .catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess(null)

    if (formData.role === 'ENGINEER' && !formData.assignedAdminId) {
      setError('Please select an Admin for this engineer')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          name: formData.name,
          role: formData.role,
          assignedAdminId: formData.role === 'ENGINEER' ? formData.assignedAdminId : undefined,
          adminType: formData.role === 'ADMIN' ? formData.adminType : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create user')
      }

      setSuccess({ email: formData.email })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="p-3 h-full">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden h-full">
          <div className="p-6 overflow-auto h-full">
            <div className="max-w-md mx-auto mt-12">
              <div className="text-center">
                <div className="size-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">
                  User Created Successfully
                </h2>
                <p className="text-slate-600 mb-6">
                  An activation email has been sent to{' '}
                  <strong>{success.email}</strong>
                </p>
                <Alert className="mb-6 text-left">
                  <Mail className="h-4 w-4" />
                  <AlertDescription>
                    The user will need to click the activation link in their email
                    to set their password and activate their account. The link
                    expires in 24 hours.
                  </AlertDescription>
                </Alert>
                <div className="flex gap-3 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSuccess(null)
                      setFormData({
                        email: '',
                        name: '',
                        role: 'ENGINEER',
                        assignedAdminId: '',
                        adminType: 'WORKER',
                      })
                    }}
                  >
                    Create Another User
                  </Button>
                  <Button onClick={() => router.push('/admin/users')}>
                    Back to Users
                  </Button>
                </div>
              </div>
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
          <div className="border border-slate-300 rounded-lg">
            {/* Back Link */}
            <Link
              href="/admin/users"
              className="inline-flex items-center text-lg font-semibold text-slate-1000 hover:text-slate-600 mb-6 pt-6 pl-6"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to Users
            </Link>

            <Card>
              <CardHeader>
                <CardTitle>Create Staff User</CardTitle>
                <p className="text-sm text-slate-500 mt-1">
                  An activation email will be sent to the user to set their password.
                </p>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                  {error && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                      {error}
                    </div>
                  )}

                  {/* Email */}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="user@htaipl.com"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, email: e.target.value }))
                      }
                      required
                      className='border border-slate-300 rounded-sm'
                    />
                    <p className="text-xs text-slate-500">
                      Activation link will be sent to this email
                    </p>
                  </div>

                  {/* Name */}
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      type="text"
                      placeholder="John Doe"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, name: e.target.value }))
                      }
                      required
                      className='border border-slate-300 rounded-sm'
                    />
                  </div>

                  {/* Role */}
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, role: value, assignedAdminId: '', adminType: 'WORKER' }))
                      }
                    >
                      <SelectTrigger className="border border-slate-300 rounded-sm si">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ENGINEER">Engineer</SelectItem>
                        <SelectItem value="ADMIN">Admin</SelectItem>
                      </SelectContent>
                    </Select>
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
                        <SelectTrigger className="border border-slate-300 rounded-sm">
                          <SelectValue placeholder="Select Admin..." />
                        </SelectTrigger>
                        <SelectContent>
                          {admins.map((admin) => (
                            <SelectItem key={admin.id} value={admin.id}>
                              {admin.name}{' '}
                              <span className="text-slate-500">
                                ({admin.engineerCount} engineers)
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {admins.length === 0 && (
                        <p className="text-sm text-amber-600">
                          No Admins available. Create an Admin first.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Admin Type (for Admin role) */}
                  {formData.role === 'ADMIN' && (
                    <div className="space-y-2">
                      <Label>Admin Type</Label>
                      <div className="flex gap-4">
                        <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${formData.adminType === 'MASTER' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <input
                            type="radio"
                            name="adminType"
                            value="MASTER"
                            checked={formData.adminType === 'MASTER'}
                            onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value }))}
                            className="h-4 w-4 text-blue-600"
                          />
                          <div>
                            <span className="font-medium">Master Admin</span>
                            <p className="text-xs text-slate-500">Internal + Customer requests</p>
                          </div>
                        </label>
                        <label className={`flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${formData.adminType === 'WORKER' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                          <input
                            type="radio"
                            name="adminType"
                            value="WORKER"
                            checked={formData.adminType === 'WORKER'}
                            onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value }))}
                            className="h-4 w-4 text-blue-600"
                          />
                          <div>
                            <span className="font-medium">Worker Admin</span>
                            <p className="text-xs text-slate-500">Internal requests only</p>
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
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="bg-green-600 hover:bg-green-700"
                      disabled={loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Create & Send Activation Email
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
    </div>
  )
}
