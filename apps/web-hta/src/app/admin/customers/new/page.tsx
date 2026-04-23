'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
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

    if (!formData.pocName.trim()) {
      setError('POC name is required')
      return
    }

    if (!formData.pocEmail.trim()) {
      setError('POC email is required')
      return
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.pocEmail)) {
      setError('Please enter a valid POC email address')
      return
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
          pocName: formData.pocName,
          pocEmail: formData.pocEmail,
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

  // Check if form has required fields filled
  const isFormValid = formData.companyName.trim() && formData.pocName.trim() && formData.pocEmail.trim()

  return (
    <div className="flex h-full bg-section-inner p-3 gap-3 overflow-hidden">
      {/* Left Panel - Form */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          {/* Header */}
          <div className="flex-shrink-0 border-b border-slate-300 px-6 py-4">
            <div className="flex items-center gap-3">
              <Link
                href="/admin/customers"
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </Link>
              <span className="text-slate-300 text-xl">|</span>
              <div className="p-2 bg-green-100 rounded-lg">
                <UserPlus className="size-5 text-green-600" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Create Customer Account
                </h1>
                <p className="text-xs text-slate-500">
                  Set up a new customer organization with their primary contact
                </p>
              </div>
            </div>
          </div>

          {/* Form Content - Scrollable */}
          <div className="flex-1 overflow-auto p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
                  {error}
                </div>
              )}

              {/* Section 1: Company Information */}
              <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                      1
                    </div>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-slate-500" />
                      <h3 className="font-semibold text-slate-900">Company Information</h3>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="companyName" className="text-xs font-semibold text-slate-600">
                      Company Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="companyName"
                      type="text"
                      placeholder="Acme Industries Pvt Ltd"
                      value={formData.companyName}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, companyName: e.target.value }))
                      }
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address" className="text-xs font-semibold text-slate-600">
                      Address <span className="text-slate-400 font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      id="address"
                      placeholder="123 Industrial Area, City, State"
                      value={formData.address}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, address: e.target.value }))
                      }
                      rows={2}
                      className="text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="contactEmail" className="text-xs font-semibold text-slate-600">
                        Contact Email <span className="text-slate-400 font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        placeholder="info@company.com"
                        value={formData.contactEmail}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, contactEmail: e.target.value }))
                        }
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="contactPhone" className="text-xs font-semibold text-slate-600">
                        Contact Phone <span className="text-slate-400 font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="contactPhone"
                        type="tel"
                        placeholder="+91 9876543210"
                        value={formData.contactPhone}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, contactPhone: e.target.value }))
                        }
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Primary POC */}
              <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-amber-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-amber-600 text-white text-sm font-bold flex items-center justify-center">
                      2
                    </div>
                    <div className="flex items-center gap-2">
                      <Crown className="size-4 text-amber-600" />
                      <h3 className="font-semibold text-slate-900">Primary Point of Contact</h3>
                    </div>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pocName" className="text-xs font-semibold text-slate-600">
                        POC Name <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="pocName"
                        type="text"
                        placeholder="John Smith"
                        value={formData.pocName}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, pocName: e.target.value }))
                        }
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pocEmail" className="text-xs font-semibold text-slate-600">
                        POC Email <span className="text-red-500">*</span>
                      </Label>
                      <Input
                        id="pocEmail"
                        type="email"
                        placeholder="john.smith@company.com"
                        value={formData.pocEmail}
                        onChange={(e) =>
                          setFormData((prev) => ({ ...prev, pocEmail: e.target.value }))
                        }
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-500">
                    The POC is the main contact for this customer who can manage users and approve certificates.
                  </p>
                </div>
              </div>

              {/* Section 3: Assignment */}
              <div className="bg-white rounded-xl border border-slate-300 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-purple-600 text-white text-sm font-bold flex items-center justify-center">
                      3
                    </div>
                    <div className="flex items-center gap-2">
                      <UserCog className="size-4 text-slate-500" />
                      <h3 className="font-semibold text-slate-900">Assignment</h3>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      Optional
                    </Badge>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="assignedAdminId" className="text-xs font-semibold text-slate-600">
                      Assigned Admin <span className="text-slate-400 font-normal">(optional)</span>
                    </Label>
                    <Select
                      value={formData.assignedAdminId || 'none'}
                      onValueChange={(value) =>
                        setFormData((prev) => ({
                          ...prev,
                          assignedAdminId: value === 'none' ? '' : value,
                        }))
                      }
                    >
                      <SelectTrigger className="text-sm">
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
                    <p className="text-xs text-slate-500">
                      The assigned Admin will manage customer communications for certificates.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push('/admin/customers')}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700"
                  disabled={loading || !isFormValid}
                >
                  {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Account
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Right Panel - Preview & Info */}
      <div className="w-[380px] flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
        {/* Live Preview */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Preview
            </h3>
          </div>
          <div className="p-4">
            <div className="bg-gradient-to-br from-slate-50 to-blue-50 rounded-lg border border-slate-300 p-4">
              {/* Company Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="p-2 bg-blue-100 rounded-lg flex-shrink-0">
                  <Building2 className="size-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className={cn(
                    'font-bold text-slate-900 truncate',
                    !formData.companyName && 'text-slate-400 italic'
                  )}>
                    {formData.companyName || 'Company Name'}
                  </h4>
                  <Badge className="bg-green-100 text-green-700 mt-1 text-[10px]">
                    Active
                  </Badge>
                </div>
              </div>

              {/* Company Details */}
              <div className="space-y-2 text-xs mb-4 pb-4 border-b border-slate-300">
                {formData.address && (
                  <div className="flex items-start gap-2">
                    <MapPin className="size-3 text-slate-400 mt-0.5" />
                    <span className="text-slate-600">{formData.address}</span>
                  </div>
                )}
                {formData.contactEmail && (
                  <div className="flex items-center gap-2">
                    <Mail className="size-3 text-slate-400" />
                    <span className="text-slate-600">{formData.contactEmail}</span>
                  </div>
                )}
                {formData.contactPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="size-3 text-slate-400" />
                    <span className="text-slate-600">{formData.contactPhone}</span>
                  </div>
                )}
                {!formData.address && !formData.contactEmail && !formData.contactPhone && (
                  <p className="text-slate-400 italic">No contact details yet</p>
                )}
              </div>

              {/* POC Section */}
              <div className="mb-4 pb-4 border-b border-slate-300">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="size-3 text-amber-500" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Primary POC
                  </span>
                </div>
                {formData.pocName || formData.pocEmail ? (
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Crown className="h-4 w-4 text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className={cn(
                        'text-sm font-medium text-slate-900 truncate',
                        !formData.pocName && 'text-slate-400 italic'
                      )}>
                        {formData.pocName || 'POC Name'}
                      </p>
                      <p className={cn(
                        'text-xs text-slate-500 truncate',
                        !formData.pocEmail && 'text-slate-400 italic'
                      )}>
                        {formData.pocEmail || 'poc@email.com'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No POC details yet</p>
                )}
              </div>

              {/* Admin Section */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <UserCog className="size-3 text-slate-400" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    Assigned Admin
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {selectedAdmin?.name || <span className="text-slate-400 italic">Not assigned</span>}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* What Happens Next */}
        <div className="bg-white rounded-xl border border-slate-300 shadow-sm overflow-hidden flex-1">
          <div className="px-4 py-3 border-b border-slate-100 bg-blue-50/50">
            <h3 className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              What Happens Next
            </h3>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle className="size-4 text-green-600" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Account Created</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Customer account is set up and active immediately
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center">
                    <Send className="size-4 text-blue-600" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Invitation Sent</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    POC receives an email to activate their account and set password
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-amber-100 flex items-center justify-center">
                    <Clock className="size-4 text-amber-600" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Awaiting Activation</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    POC status shows &quot;Pending&quot; until they complete activation
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0">
                  <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center">
                    <ArrowRight className="size-4 text-purple-600" />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Ready to Use</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Once activated, POC can add users and manage certificates
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
