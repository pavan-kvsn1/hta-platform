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
  Building2,
  Crown,
  UserCog,
  Mail,
  Phone,
  MapPin,
  CheckCircle,
  ArrowRight,
  Send,
  UserPlus,
  Clock,
  AlertCircle,
  Mail,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Admin {
  id: string
  name: string
  email: string
  adminType: string | null
}

export default function CreateCustomerPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [admins, setAdmins] = useState<Admin[]>([])

  const [enablePortal, setEnablePortal] = useState(false)
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    assignedAdminId: '',
    pocName: '',
    pocEmail: '',
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

    if (!formData.companyName.trim()) {
      setError('Company name is required')
      return
    }

    if (enablePortal) {
      if (!formData.pocName.trim()) {
        setError('POC name is required when portal is enabled')
        return
      }
      if (!formData.pocEmail.trim()) {
        setError('POC email is required when portal is enabled')
        return
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.pocEmail)) {
        setError('Please enter a valid POC email address')
        return
      }
    }

    setLoading(true)

    try {
      const res = await apiFetch('/api/admin/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: formData.companyName,
          address: formData.address || undefined,
          contactEmail: formData.contactEmail || undefined,
          contactPhone: formData.contactPhone || undefined,
          assignedAdminId: formData.assignedAdminId || undefined,
          ...(enablePortal ? {
            pocName: formData.pocName,
            pocEmail: formData.pocEmail,
          } : {}),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create customer account')
      }

      router.push('/admin/customers')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const selectedAdmin = admins.find((a) => a.id === formData.assignedAdminId)
  const isFormValid = formData.companyName.trim() && (!enablePortal || (formData.pocName.trim() && formData.pocEmail.trim()))

  return (
    <div className="h-full overflow-auto bg-[#f1f5f9]">
      <div className="px-6 sm:px-9 py-8 flex gap-6">
        {/* Left Panel - Form */}
        <div className="flex-1 min-w-0 max-w-[680px]">
          {/* Back Link */}
          <Link
            href="/admin/customers"
            className="inline-flex items-center gap-1 text-[13px] text-[#64748b] hover:text-[#0f172a] mb-6 transition-colors"
          >
            <ChevronLeft className="size-4" />
            Back to Customers
          </Link>

          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[22px] font-bold text-[#0f172a] flex items-center gap-2.5">
              <UserPlus className="size-[22px] text-[#94a3b8]" />
              Create Customer Account
            </h1>
            <p className="text-[13px] text-[#94a3b8] mt-1">
              Set up a new customer organization with their primary contact
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <form onSubmit={handleSubmit} className="p-5 space-y-6">
              {error && (
                <div className="flex items-center gap-2 p-2.5 bg-[#fef2f2] border border-[#fecaca] rounded-lg">
                  <AlertCircle className="size-3.5 text-[#dc2626] shrink-0" />
                  <p className="text-[12px] text-[#dc2626]">{error}</p>
                </div>
              )}

              {/* Company Information */}
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
                  Company Information
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Company Name <span className="text-[#dc2626]">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Acme Industries Pvt Ltd"
                      value={formData.companyName}
                      onChange={(e) => setFormData((prev) => ({ ...prev, companyName: e.target.value }))}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Address <span className="text-[#94a3b8] font-normal text-[11px]">(optional)</span>
                    </label>
                    <textarea
                      placeholder="123 Industrial Area, City, State"
                      value={formData.address}
                      onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                        Contact Email <span className="text-[#94a3b8] font-normal text-[11px]">(optional)</span>
                      </label>
                      <input
                        type="email"
                        placeholder="info@company.com"
                        value={formData.contactEmail}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))}
                        className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                        Contact Phone <span className="text-[#94a3b8] font-normal text-[11px]">(optional)</span>
                      </label>
                      <input
                        type="tel"
                        placeholder="+91 9876543210"
                        value={formData.contactPhone}
                        onChange={(e) => setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))}
                        className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Portal Access Toggle */}
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
                  Portal Access
                </h3>
                <div className="flex items-center justify-between p-3 bg-[#f8fafc] border border-[#e2e8f0] rounded-[9px]">
                  <div>
                    <p className="text-[12.5px] font-semibold text-[#0f172a]">Enable customer portal</p>
                    <p className="text-[11px] text-[#94a3b8] mt-0.5">
                      {enablePortal
                        ? 'Customer will receive login credentials to access the portal.'
                        : 'Customer will review certificates via email token links only.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEnablePortal(!enablePortal)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                      enablePortal ? 'bg-[#16a34a]' : 'bg-[#cbd5e1]'
                    )}
                  >
                    <span className={cn(
                      'inline-block h-4 w-4 rounded-full bg-white transition-transform',
                      enablePortal ? 'translate-x-6' : 'translate-x-1'
                    )} />
                  </button>
                </div>
              </div>

              {/* Primary POC (only when portal enabled) */}
              {enablePortal && (
                <div>
                  <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
                    Primary Point of Contact
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                          POC Name <span className="text-[#dc2626]">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="John Smith"
                          value={formData.pocName}
                          onChange={(e) => setFormData((prev) => ({ ...prev, pocName: e.target.value }))}
                          className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                          POC Email <span className="text-[#dc2626]">*</span>
                        </label>
                        <input
                          type="email"
                          placeholder="john.smith@company.com"
                          value={formData.pocEmail}
                          onChange={(e) => setFormData((prev) => ({ ...prev, pocEmail: e.target.value }))}
                          className="w-full px-3 py-2 text-[13px] text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-[#94a3b8]">
                      The POC is the main contact for this customer who can manage users and approve certificates.
                    </p>
                  </div>
                </div>
              )}

              {/* Assignment */}
              <div>
                <h3 className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8] mb-4">
                  Assignment <span className="font-normal normal-case tracking-normal text-[11px]">(optional)</span>
                </h3>
                <div>
                  <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                    Assigned Admin
                  </label>
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
                  <p className="text-[11px] text-[#94a3b8] mt-1.5">
                    The assigned Admin will manage customer communications for certificates.
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => router.push('/admin/customers')}
                  disabled={loading}
                  className="px-4 py-2 text-[12.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !isFormValid}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#16a34a] hover:bg-[#15803d] rounded-[9px] transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Building2 className="size-3.5" />
                  )}
                  {loading ? 'Creating...' : enablePortal ? 'Create & Send Invitation' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Panel - Preview & Info */}
        <div className="w-[340px] flex-shrink-0 space-y-5 hidden lg:block">
          {/* Live Preview */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#f1f5f9]">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                Preview
              </h3>
            </div>
            <div className="p-4">
              <div className="bg-[#f8fafc] rounded-xl border border-[#e2e8f0] p-4">
                {/* Company Header */}
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-[#eff6ff] rounded-lg shrink-0">
                    <Building2 className="size-5 text-[#2563eb]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={cn(
                      'font-bold text-[#0f172a] truncate text-[14px]',
                      !formData.companyName && 'text-[#cbd5e1] italic'
                    )}>
                      {formData.companyName || 'Company Name'}
                    </h4>
                    <span className={cn(
                      'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold mt-1',
                      enablePortal ? 'bg-[#eff6ff] text-[#1d4ed8]' : 'bg-[#f1f5f9] text-[#64748b]'
                    )}>
                      {enablePortal ? 'Portal' : 'Token-only'}
                    </span>
                  </div>
                </div>

                {/* Company Details */}
                <div className="space-y-2 text-[12px] mb-4 pb-4 border-b border-[#e2e8f0]">
                  {formData.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="size-3 text-[#94a3b8] mt-0.5" />
                      <span className="text-[#64748b]">{formData.address}</span>
                    </div>
                  )}
                  {formData.contactEmail && (
                    <div className="flex items-center gap-2">
                      <Mail className="size-3 text-[#94a3b8]" />
                      <span className="text-[#64748b]">{formData.contactEmail}</span>
                    </div>
                  )}
                  {formData.contactPhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="size-3 text-[#94a3b8]" />
                      <span className="text-[#64748b]">{formData.contactPhone}</span>
                    </div>
                  )}
                  {!formData.address && !formData.contactEmail && !formData.contactPhone && (
                    <p className="text-[#cbd5e1] italic">No contact details yet</p>
                  )}
                </div>

                {/* POC */}
                <div className="mb-4 pb-4 border-b border-[#e2e8f0]">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Crown className="size-3 text-[#d97706]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      Primary POC
                    </span>
                  </div>
                  {formData.pocName || formData.pocEmail ? (
                    <div>
                      <p className={cn(
                        'text-[13px] font-medium text-[#0f172a] truncate',
                        !formData.pocName && 'text-[#cbd5e1] italic'
                      )}>
                        {formData.pocName || 'POC Name'}
                      </p>
                      <p className={cn(
                        'text-[12px] text-[#64748b] truncate',
                        !formData.pocEmail && 'text-[#cbd5e1] italic'
                      )}>
                        {formData.pocEmail || 'poc@email.com'}
                      </p>
                    </div>
                  ) : (
                    <p className="text-[12px] text-[#cbd5e1] italic">No POC details yet</p>
                  )}
                </div>

                {/* Admin */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <UserCog className="size-3 text-[#94a3b8]" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">
                      Assigned Admin
                    </span>
                  </div>
                  <p className="text-[13px] text-[#64748b]">
                    {selectedAdmin?.name || <span className="text-[#cbd5e1] italic">Not assigned</span>}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* What Happens Next */}
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#f1f5f9] bg-[#eff6ff]">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#1d4ed8]">
                What Happens Next
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex gap-3">
                <div className="size-7 rounded-full bg-[#f0fdf4] flex items-center justify-center shrink-0">
                  <CheckCircle className="size-4 text-[#16a34a]" />
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[#0f172a]">Account Created</p>
                  <p className="text-[11px] text-[#94a3b8] mt-0.5">
                    Customer account is set up and active immediately
                  </p>
                </div>
              </div>
              {enablePortal ? (
                <>
                  <div className="flex gap-3">
                    <div className="size-7 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
                      <Send className="size-4 text-[#2563eb]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">Invitation Sent</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        POC receives an email to activate their account
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="size-7 rounded-full bg-[#fffbeb] flex items-center justify-center shrink-0">
                      <Clock className="size-4 text-[#d97706]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">Awaiting Activation</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        POC status shows &quot;Pending&quot; until activation
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="size-7 rounded-full bg-[#faf5ff] flex items-center justify-center shrink-0">
                      <ArrowRight className="size-4 text-[#7c3aed]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">Ready to Use</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        POC can add users and manage certificates
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex gap-3">
                    <div className="size-7 rounded-full bg-[#eff6ff] flex items-center justify-center shrink-0">
                      <Mail className="size-4 text-[#2563eb]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">Reviews via Token Links</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        Certificates sent for review via email links — no login needed
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="size-7 rounded-full bg-[#faf5ff] flex items-center justify-center shrink-0">
                      <ArrowRight className="size-4 text-[#7c3aed]" />
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#0f172a]">Upgrade Anytime</p>
                      <p className="text-[11px] text-[#94a3b8] mt-0.5">
                        You can add portal access later from the customer detail page
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
