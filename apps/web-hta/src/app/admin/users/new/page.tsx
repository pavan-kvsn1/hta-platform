'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
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
  ChevronLeft,
  Loader2,
  Mail,
  CheckCircle,
  UserPlus,
  AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
    apiFetch('/api/admin/users/admins')
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
      const res = await apiFetch('/api/admin/users', {
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
      <div className="h-full overflow-auto bg-[#f1f5f9] flex items-center justify-center">
        <div className="text-center max-w-md px-6">
          <div className="size-14 bg-[#dcfce7] rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="size-6 text-[#16a34a]" />
          </div>
          <h2 className="text-[18px] font-bold text-[#0f172a] mb-2">User Created Successfully</h2>
          <p className="text-[13px] text-[#64748b] mb-5">
            An activation email has been sent to <span className="font-semibold text-[#0f172a]">{success.email}</span>
          </p>

          <div className="flex items-start gap-2.5 p-3.5 bg-[#eff6ff] border border-[#bfdbfe] rounded-xl text-left mb-6">
            <Mail className="size-4 text-[#2563eb] shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-[#1e40af]">
              The user will need to click the activation link in their email to set their password and activate their account. The link expires in 24 hours.
            </p>
          </div>

          <div className="flex gap-2.5 justify-center">
            <button
              onClick={() => {
                setSuccess(null)
                setFormData({ email: '', name: '', role: 'ENGINEER', assignedAdminId: '', adminType: 'WORKER' })
              }}
              className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors"
            >
              Create Another User
            </button>
            <button
              onClick={() => router.push('/admin/users')}
              className="px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
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
      <div className="px-6 sm:px-9 py-8 max-w-[620px]">
        {/* Back Link */}
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
        >
          <ChevronLeft className="size-4" />
          Back to Users
        </Link>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
            <UserPlus className="size-[22px] text-[#94a3b8]" />
            Create Staff User
          </h1>
          <p className="text-[13px] text-[#94a3b8] mt-1">
            An activation email will be sent to the user to set their password.
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
          <form onSubmit={handleSubmit} className="p-5 space-y-5">
            {error && (
              <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                <AlertCircle className="size-3.5 text-[#dc2626] shrink-0" />
                <p className="text-[12px] text-[#dc2626]">{error}</p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                Email Address <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="email"
                placeholder="user@htaipl.com"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                required
                className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
              />
              <p className="text-[11px] text-[#94a3b8] mt-1.5">Activation link will be sent to this email</p>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                Full Name <span className="text-[#dc2626]">*</span>
              </label>
              <input
                type="text"
                placeholder="John Doe"
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
                  setFormData((prev) => ({ ...prev, role: value, assignedAdminId: '', adminType: 'WORKER' }))
                }
              >
                <SelectTrigger className="h-10 rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
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
                        {admin.name} <span className="text-[#94a3b8]">({admin.engineerCount} engineers)</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {admins.length === 0 && (
                  <p className="text-[12px] text-[#d97706] mt-1.5">No Admins available. Create an Admin first.</p>
                )}
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value }))}
                      className="size-4 text-[#7c3aed] accent-[#7c3aed]"
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
                      onChange={(e) => setFormData((prev) => ({ ...prev, adminType: e.target.value }))}
                      className="size-4 text-[#7c3aed] accent-[#7c3aed]"
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
                disabled={loading}
                className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Mail className="size-3.5" />
                )}
                {loading ? 'Creating...' : 'Create & Send Activation Email'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
