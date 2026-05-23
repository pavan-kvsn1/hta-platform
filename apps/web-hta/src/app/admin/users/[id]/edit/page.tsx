'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, use, useCallback, useMemo } from 'react'
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
  Monitor,
  RefreshCw,
  ShieldOff,
  Mail,
  GraduationCap,
  Upload,
  Eye,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { UserTATMetrics } from '@/components/admin/UserTATMetrics'

interface VpnStatus {
  peer: { ipAddress: string; provisionedAt: string; revokedAt: string | null; isActive: boolean } | null
  hasProvisioningToken: boolean
  latestRequest: { id: string; status: string; createdAt: string } | null
}

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
  vpn?: VpnStatus
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

interface InstrumentOption {
  id: string
  instrumentId: string
  category: string
  parameterGroup: string | null
  assetNumber: string
  description: string
  make: string
  model: string
  status?: string
  daysUntilExpiry?: number
}

interface TrainingRecord {
  id: string
  masterInstrument: InstrumentOption | null
  certificateFileName: string
  certificateFileSize: number
  trainedAt: string | null
  expiresAt: string | null
  notes: string | null
  uploadedBy: { id: string; name: string; email: string }
  uploadedAt: string
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
  const [vpnRevoking, setVpnRevoking] = useState(false)
  const [vpnRegenerating, setVpnRegenerating] = useState(false)
  const [vpnError, setVpnError] = useState('')
  const [trainingRecords, setTrainingRecords] = useState<TrainingRecord[]>([])
  const [trainingLoading, setTrainingLoading] = useState(false)
  const [trainingError, setTrainingError] = useState('')
  const [instruments, setInstruments] = useState<InstrumentOption[]>([])
  const [showTrainingModal, setShowTrainingModal] = useState(false)
  const [trainingModalStep, setTrainingModalStep] = useState<1 | 2>(1)
  const [trainingSubmitting, setTrainingSubmitting] = useState(false)
  const [trainingForm, setTrainingForm] = useState({
    masterInstrumentId: '',
    trainedAt: '',
    expiresAt: '',
    notes: '',
  })
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedParameterGroup, setSelectedParameterGroup] = useState('')
  const [selectedDescription, setSelectedDescription] = useState('')
  const [selectedMake, setSelectedMake] = useState('')
  const [trainingFile, setTrainingFile] = useState<File | null>(null)
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null)
  const [editTrainingForm, setEditTrainingForm] = useState({ trainedAt: '', expiresAt: '', notes: '' })
  const [trainingPdfUrl, setTrainingPdfUrl] = useState<string | null>(null)
  const [trainingPdfTitle, setTrainingPdfTitle] = useState('Training certificate')
  const [trainingPdfViewMode, setTrainingPdfViewMode] = useState<'iframe' | 'card'>('iframe')

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    assignedAdminId: '',
    adminType: '' as 'MASTER' | 'WORKER' | '',
  })

  useEffect(() => {
    const fetchAllInstruments = async () => {
      const allInstruments: InstrumentOption[] = []
      let page = 1
      let totalPages = 1

      do {
        const res = await apiFetch(`/api/admin/instruments?page=${page}&limit=25`)
        const data = await res.json()
        allInstruments.push(...((data.instruments || []) as InstrumentOption[]).map((instrument) => ({
          id: instrument.id,
          instrumentId: instrument.instrumentId,
          category: instrument.category,
          parameterGroup: instrument.parameterGroup || null,
          assetNumber: instrument.assetNumber,
          description: instrument.description,
          make: instrument.make,
          model: instrument.model,
          status: instrument.status,
          daysUntilExpiry: instrument.daysUntilExpiry,
        })))
        totalPages = data.pagination?.totalPages || 1
        page += 1
      } while (page <= totalPages)

      return allInstruments
    }

    Promise.all([
      apiFetch(`/api/admin/users/${id}`).then((res) => res.json()),
      apiFetch('/api/admin/users/admins').then((res) => res.json()),
      fetchAllInstruments(),
    ])
      .then(([userData, adminsData, instrumentsData]) => {
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
        setInstruments(instrumentsData)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    return () => {
      if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
    }
  }, [trainingPdfUrl])

  const fetchTrainingRecords = useCallback(async () => {
    try {
      setTrainingLoading(true)
      setTrainingError('')
      const res = await apiFetch(`/api/admin/users/${id}/trainings`)
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to load training records')
      setTrainingRecords(data?.trainings || [])
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to load training records')
    } finally {
      setTrainingLoading(false)
    }
  }, [id])

  useEffect(() => {
    if (user?.role === 'ENGINEER') {
      fetchTrainingRecords()
    }
  }, [user?.role, fetchTrainingRecords])

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

  const [reactivateSuccess, setReactivateSuccess] = useState<string | null>(null)

  const handleReactivate = async () => {
    try {
      const res = await apiFetch(`/api/admin/users/${id}/reactivate`, { method: 'PUT' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reactivate user')
      const userRes = await apiFetch(`/api/admin/users/${id}`)
      const userData = await userRes.json()
      if (userData.user) setUser(userData.user)
      setReactivateSuccess(data.message || 'Activation email sent')
      setShowReactivateDialog(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate user')
      setShowReactivateDialog(false)
    }
  }

  const refreshUser = async () => {
    const res = await apiFetch(`/api/admin/users/${id}`)
    const userData = await res.json()
    if (userData.user) setUser(userData.user)
  }

  const handleVpnRevoke = async () => {
    setVpnError('')
    setVpnRevoking(true)
    try {
      const res = await apiFetch(`/api/admin/users/${id}/vpn`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to revoke VPN access')
      await refreshUser()
    } catch (err) {
      setVpnError(err instanceof Error ? err.message : 'Failed to revoke VPN access')
    } finally {
      setVpnRevoking(false)
    }
  }

  const handleVpnRegenToken = async () => {
    setVpnError('')
    setVpnRegenerating(true)
    try {
      const res = await apiFetch(`/api/admin/users/${id}/vpn/token`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to regenerate token')
      await refreshUser()
    } catch (err) {
      setVpnError(err instanceof Error ? err.message : 'Failed to regenerate token')
    } finally {
      setVpnRegenerating(false)
    }
  }

  const categories = useMemo(() => {
    return Array.from(new Set(instruments.map((instrument) => instrument.category).filter(Boolean))).sort()
  }, [instruments])

  const parameterGroups = useMemo(() => {
    if (!selectedCategory) return []
    return Array.from(new Set(
      instruments
        .filter((instrument) => instrument.category === selectedCategory && instrument.parameterGroup)
        .map((instrument) => instrument.parameterGroup as string)
    )).sort()
  }, [instruments, selectedCategory])

  const descriptions = useMemo(() => {
    if (!selectedCategory) return []
    return Array.from(new Set(
      instruments
        .filter((instrument) => {
          if (instrument.category !== selectedCategory) return false
          if (selectedParameterGroup && instrument.parameterGroup !== selectedParameterGroup) return false
          return true
        })
        .map((instrument) => instrument.description)
        .filter(Boolean)
    )).sort()
  }, [instruments, selectedCategory, selectedParameterGroup])

  const makes = useMemo(() => {
    if (!selectedCategory || !selectedDescription) return []
    return Array.from(new Set(
      instruments
        .filter((instrument) => {
          if (instrument.category !== selectedCategory) return false
          if (instrument.description !== selectedDescription) return false
          if (selectedParameterGroup && instrument.parameterGroup !== selectedParameterGroup) return false
          return true
        })
        .map((instrument) => instrument.make)
        .filter(Boolean)
    )).sort()
  }, [instruments, selectedCategory, selectedParameterGroup, selectedDescription])

  const availableInstruments = useMemo(() => {
    if (!selectedCategory || !selectedDescription) return []
    return instruments.filter((instrument) => {
      if (instrument.category !== selectedCategory) return false
      if (instrument.description !== selectedDescription) return false
      if (selectedParameterGroup && instrument.parameterGroup !== selectedParameterGroup) return false
      if (selectedMake && instrument.make !== selectedMake) return false
      return true
    })
  }, [instruments, selectedCategory, selectedParameterGroup, selectedDescription, selectedMake])

  const selectedTrainingInstrument = useMemo(() => {
    return instruments.find((instrument) => instrument.id === trainingForm.masterInstrumentId) || null
  }, [instruments, trainingForm.masterInstrumentId])

  const handleTrainingCategoryChange = (value: string) => {
    setSelectedCategory(value)
    setSelectedParameterGroup('')
    setSelectedDescription('')
    setSelectedMake('')
    setTrainingForm(prev => ({ ...prev, masterInstrumentId: '' }))
  }

  const handleTrainingParameterGroupChange = (value: string) => {
    setSelectedParameterGroup(value === '__all__' ? '' : value)
    setSelectedDescription('')
    setSelectedMake('')
    setTrainingForm(prev => ({ ...prev, masterInstrumentId: '' }))
  }

  const handleTrainingDescriptionChange = (value: string) => {
    setSelectedDescription(value)
    setSelectedMake('')
    setTrainingForm(prev => ({ ...prev, masterInstrumentId: '' }))

    const makeList = Array.from(new Set(
      instruments
        .filter((instrument) => {
          if (instrument.category !== selectedCategory) return false
          if (instrument.description !== value) return false
          if (selectedParameterGroup && instrument.parameterGroup !== selectedParameterGroup) return false
          return true
        })
        .map((instrument) => instrument.make)
        .filter(Boolean)
    ))

    if (makeList.length === 1) {
      setSelectedMake(makeList[0])
    }
  }

  const handleTrainingMakeChange = (value: string) => {
    setSelectedMake(value === '__all__' ? '' : value)
    setTrainingForm(prev => ({ ...prev, masterInstrumentId: '' }))
  }

  const handleTrainingInstrumentChange = (value: string) => {
    const instrument = instruments.find((item) => item.id === value)
    if (instrument?.status === 'EXPIRED') {
      setTrainingError('Expired master instruments cannot be selected for training documents.')
      return
    }
    setTrainingError('')
    setTrainingForm(prev => ({ ...prev, masterInstrumentId: value }))
  }

  const resetTrainingForm = () => {
    setTrainingForm({ masterInstrumentId: '', trainedAt: '', expiresAt: '', notes: '' })
    setTrainingFile(null)
    setTrainingModalStep(1)
    setSelectedCategory('')
    setSelectedParameterGroup('')
    setSelectedDescription('')
    setSelectedMake('')
  }

  const handleTrainingSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!trainingForm.masterInstrumentId || !trainingFile) {
      setTrainingError('Select a master instrument and upload a PDF certificate.')
      return
    }

    setTrainingSubmitting(true)
    setTrainingError('')
    try {
      const formData = new FormData()
      formData.append('masterInstrumentId', trainingForm.masterInstrumentId)
      if (trainingForm.trainedAt) formData.append('trainedAt', trainingForm.trainedAt)
      if (trainingForm.expiresAt) formData.append('expiresAt', trainingForm.expiresAt)
      if (trainingForm.notes.trim()) formData.append('notes', trainingForm.notes.trim())
      formData.append('file', trainingFile)

      const res = await apiFetch(`/api/admin/users/${id}/trainings`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to add training document')

      resetTrainingForm()
      setShowTrainingModal(false)
      await fetchTrainingRecords()
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to add training document')
    } finally {
      setTrainingSubmitting(false)
    }
  }

  const openTrainingPdf = async (training: TrainingRecord) => {
    try {
      setTrainingError('')
      const res = await apiFetch(`/api/admin/users/${id}/trainings/${training.id}/pdf`)
      const contentType = res.headers.get('content-type') || ''
      if (!res.ok) {
        const data = contentType.includes('application/json') ? await res.json().catch(() => null) : null
        throw new Error(data?.error || 'Failed to load training certificate')
      }
      const blob = await res.blob()
      if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
      setTrainingPdfUrl(URL.createObjectURL(blob))
      setTrainingPdfTitle(`${training.masterInstrument?.assetNumber || 'Training'} - ${training.certificateFileName}`)
      setTrainingPdfViewMode('iframe')
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to load training certificate')
    }
  }

  const closeTrainingPdf = () => {
    if (trainingPdfUrl) URL.revokeObjectURL(trainingPdfUrl)
    setTrainingPdfUrl(null)
  }

  const startEditTraining = (training: TrainingRecord) => {
    setEditingTrainingId(training.id)
    setEditTrainingForm({
      trainedAt: training.trainedAt ? training.trainedAt.slice(0, 10) : '',
      expiresAt: training.expiresAt ? training.expiresAt.slice(0, 10) : '',
      notes: training.notes || '',
    })
  }

  const saveTrainingEdit = async (trainingId: string) => {
    try {
      setTrainingError('')
      const res = await apiFetch(`/api/admin/users/${id}/trainings/${trainingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trainedAt: editTrainingForm.trainedAt || null,
          expiresAt: editTrainingForm.expiresAt || null,
          notes: editTrainingForm.notes,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to update training record')
      setEditingTrainingId(null)
      await fetchTrainingRecords()
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to update training record')
    }
  }

  const removeTraining = async (trainingId: string) => {
    if (!window.confirm('Remove this training document?')) return
    try {
      setTrainingError('')
      const res = await apiFetch(`/api/admin/users/${id}/trainings/${trainingId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to remove training record')
      await fetchTrainingRecords()
    } catch (err) {
      setTrainingError(err instanceof Error ? err.message : 'Failed to remove training record')
    }
  }

  const formatOptionalDate = (value: string | null) => value ? new Date(value).toLocaleDateString() : '-'

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
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
                {reactivateSuccess && (
                  <div className="flex items-center gap-2 p-2.5 bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg">
                    <Mail className="size-3.5 text-[#16a34a] shrink-0" />
                    <p className="text-[12px] text-[#15803d]">{reactivateSuccess}. The activation link expires in 24 hours.</p>
                  </div>
                )}
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

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Auth</label>
                    <input
                      type="text"
                      value={user.authProvider}
                      disabled
                      className="w-full h-10 px-3 text-[13px] text-[#64748b] border border-[#e2e8f0] rounded-[9px] bg-[#f8fafc]"
                    />
                  </div>

                  <div>
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">Active Since</label>
                    <input
                      type="text"
                      value={new Date(user.createdAt).toLocaleDateString()}
                      disabled
                      className="w-full h-10 px-3 text-[13px] text-[#64748b] border border-[#e2e8f0] rounded-[9px] bg-[#f8fafc]"
                    />
                  </div>
                </div>

                <div className={cn('grid grid-cols-1 gap-4', formData.role === 'ENGINEER' && 'md:grid-cols-2')}>
                {/* Role */}
                <div className="flex min-h-[4.25rem] flex-col justify-start">
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
                    <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
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
                  <div className="flex min-h-[4.25rem] flex-col justify-start">
                    <label className="block text-[12.5px] font-semibold text-[#0f172a] mb-1.5">
                      Assign to Admin <span className="text-[#dc2626]">*</span>
                    </label>
                    <Select
                      value={formData.assignedAdminId}
                      onValueChange={(value) => setFormData((prev) => ({ ...prev, assignedAdminId: value }))}
                    >
                      <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                        <SelectValue placeholder="Select Admin..." />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
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
                </div>

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
            {/* Stats */}
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5">
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
            {/* Desktop VPN */}
            <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-5">
              <h2 className="text-[14px] font-semibold text-[#0f172a] flex items-center gap-2 mb-4">
                <Monitor className="size-4 text-[#94a3b8]" />
                Desktop VPN
              </h2>

              {vpnError && (
                <p className="text-[12px] text-[#dc2626] mb-3">{vpnError}</p>
              )}

              {user.vpn?.peer?.isActive ? (
                <div className="space-y-3">
                  <div className="divide-y divide-[#f1f5f9] text-[13px]">
                    <div className="flex justify-between py-2">
                      <span className="text-[#64748b]">Status</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-[#ecfdf5] text-[#065f46]">Active</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[#64748b]">IP</span>
                      <span className="font-mono text-[12px] text-[#0f172a]">{user.vpn.peer.ipAddress}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-[#64748b]">Since</span>
                      <span className="text-[#0f172a]">{new Date(user.vpn.peer.provisionedAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleVpnRegenToken}
                      disabled={vpnRegenerating}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[8px] transition-colors disabled:opacity-50"
                    >
                      {vpnRegenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                      New Token
                    </button>
                    <button
                      onClick={handleVpnRevoke}
                      disabled={vpnRevoking}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11.5px] font-semibold text-[#dc2626] border border-[#fecaca] bg-white hover:bg-[#fef2f2] rounded-[8px] transition-colors disabled:opacity-50"
                    >
                      {vpnRevoking ? <Loader2 className="size-3 animate-spin" /> : <ShieldOff className="size-3" />}
                      Revoke
                    </button>
                  </div>
                </div>
              ) : user.vpn?.hasProvisioningToken ? (
                <div className="space-y-3">
                  <div className="px-3 py-2 bg-[#fffbeb] border border-[#fde68a] rounded-[8px]">
                    <p className="text-[12px] text-[#92400e]">Token issued — awaiting provisioning</p>
                  </div>
                  <button
                    onClick={handleVpnRegenToken}
                    disabled={vpnRegenerating}
                    className="w-full inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[11.5px] font-semibold text-[#475569] border border-[#e2e8f0] bg-white hover:bg-[#f8fafc] rounded-[8px] transition-colors disabled:opacity-50"
                  >
                    {vpnRegenerating ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
                    Regenerate Token
                  </button>
                </div>
              ) : user.vpn?.latestRequest?.status === 'PENDING' ? (
                <p className="text-[12.5px] text-[#64748b]">
                  Request pending —{' '}
                  <span className="text-[#d97706]">awaiting review</span>
                </p>
              ) : (
                <p className="text-[12.5px] text-[#94a3b8]">No VPN access configured</p>
              )}
            </div>
          </div>
        </div>

        {user.role === 'ENGINEER' && (
          <div className="mt-5 bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-[#f1f5f9]">
              <div>
                <h2 className="text-[14px] font-semibold text-[#0f172a] flex items-center gap-2">
                  <GraduationCap className="size-4 text-[#94a3b8]" />
                  Training Documents
                </h2>
                <p className="mt-1 text-[12px] text-[#94a3b8]">
                  Master instrument training evidence assigned to this user.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTrainingError('')
                  setTrainingModalStep(1)
                  setShowTrainingModal(true)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px]"
              >
                <Upload className="size-3.5" />
                Add Document
              </button>
            </div>

            <div className="p-5">
              {trainingError && (
                <div className="mb-4 rounded-[9px] border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] font-medium text-[#dc2626]">
                  {trainingError}
                </div>
              )}

              {trainingLoading ? (
                <div className="flex items-center justify-center py-8 text-[#94a3b8]">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : trainingRecords.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] p-6 text-center">
                  <GraduationCap className="size-8 mx-auto mb-2 text-[#cbd5e1]" />
                  <p className="text-[13px] font-semibold text-[#475569]">No training documents recorded</p>
                  <p className="text-[12px] text-[#94a3b8] mt-1">Upload a PDF training document for a master instrument.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-[#e2e8f0] bg-[#f8fafc]">
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Master Instrument</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Trained</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Expires</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Certificate</th>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Uploaded</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-[#94a3b8] uppercase tracking-[0.07em]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {trainingRecords.map((training) => {
                        const isEditing = editingTrainingId === training.id
                        return (
                          <tr key={training.id} className="align-top">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-[#0f172a]">{training.masterInstrument?.assetNumber || '-'}</p>
                              <p className="text-[12px] text-[#64748b]">{training.masterInstrument?.description || '-'}</p>
                              {isEditing && (
                                <textarea
                                  value={editTrainingForm.notes}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, notes: event.target.value }))}
                                  rows={2}
                                  className="mt-2 w-full min-w-[220px] rounded-[8px] border border-[#e2e8f0] px-2 py-1 text-[12px]"
                                  placeholder="Notes"
                                />
                              )}
                              {!isEditing && training.notes && (
                                <p className="text-[12px] text-[#64748b] mt-1 italic">{training.notes}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editTrainingForm.trainedAt}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, trainedAt: event.target.value }))}
                                  className="h-8 rounded-[8px] border border-[#e2e8f0] px-2 text-[12px]"
                                />
                              ) : formatOptionalDate(training.trainedAt)}
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              {isEditing ? (
                                <input
                                  type="date"
                                  value={editTrainingForm.expiresAt}
                                  onChange={(event) => setEditTrainingForm(prev => ({ ...prev, expiresAt: event.target.value }))}
                                  className="h-8 rounded-[8px] border border-[#e2e8f0] px-2 text-[12px]"
                                />
                              ) : formatOptionalDate(training.expiresAt)}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-[#0f172a] truncate max-w-[220px]" title={training.certificateFileName}>{training.certificateFileName}</p>
                              <p className="text-[12px] text-[#94a3b8]">{formatFileSize(training.certificateFileSize)}</p>
                            </td>
                            <td className="px-4 py-3 text-[#64748b]">
                              <p>{formatOptionalDate(training.uploadedAt)}</p>
                              <p className="text-[12px] text-[#94a3b8]">{training.uploadedBy.name}</p>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-1.5">
                                {isEditing ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => saveTrainingEdit(training.id)}
                                      className="px-2.5 py-1.5 text-[12px] font-semibold text-white bg-[#0f172a] rounded-[8px]"
                                    >
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingTrainingId(null)}
                                      className="px-2.5 py-1.5 text-[12px] font-semibold text-[#475569] border border-[#e2e8f0] rounded-[8px]"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => openTrainingPdf(training)}
                                      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#e2e8f0] px-2.5 text-[12px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                                      title="View certificate"
                                    >
                                      <Eye className="size-3.5" />
                                      PDF
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => startEditTraining(training)}
                                      className="size-8 rounded-[8px] border border-[#e2e8f0] flex items-center justify-center hover:bg-[#f8fafc]"
                                      title="Edit training"
                                    >
                                      <Pencil className="size-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeTraining(training.id)}
                                      className="size-8 rounded-[8px] border border-[#fecaca] text-[#dc2626] flex items-center justify-center hover:bg-[#fef2f2]"
                                      title="Remove training"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        <div className="mt-5">
          <UserTATMetrics userId={id} userRole={user.role} adminType={user.adminType} periodDays={30} />
        </div>
      </div>

      {showTrainingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
          <form
            onSubmit={handleTrainingSubmit}
            className="bg-white rounded-[14px] border border-[#e2e8f0] p-6 w-full max-w-[52rem] min-h-[29rem] max-h-[86vh] flex flex-col"
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-semibold text-[#0f172a]">Add Training Document</h3>
                <p className="text-[13px] text-[#64748b] mt-1">
                  {trainingModalStep === 1 ? 'Select the master instrument hierarchy.' : `Upload a PDF certificate for ${user.name}.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowTrainingModal(false)
                  resetTrainingForm()
                }}
                className="size-8 rounded-lg border border-[#e2e8f0] flex items-center justify-center hover:bg-[#f8fafc]"
                aria-label="Close training form"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mb-5 flex items-center gap-2">
              <div className={cn(
                'flex h-7 items-center rounded-full px-3 text-[12px] font-semibold',
                trainingModalStep === 1 ? 'bg-[#0f172a] text-white' : 'bg-[#e2e8f0] text-[#475569]'
              )}>
                1. Instrument
              </div>
              <div className="h-px flex-1 bg-[#e2e8f0]" />
              <div className={cn(
                'flex h-7 items-center rounded-full px-3 text-[12px] font-semibold',
                trainingModalStep === 2 ? 'bg-[#0f172a] text-white' : 'bg-[#e2e8f0] text-[#475569]'
              )}>
                2. Details
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              {trainingModalStep === 1 ? (
                <div className="grid min-h-full grid-cols-1 gap-4 md:grid-cols-2 md:auto-rows-fr">
                    <div className="flex flex-col justify-center">
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Category</label>
                      <Select
                        value={selectedCategory}
                        onValueChange={handleTrainingCategoryChange}
                      >
                        <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                          <SelectValue placeholder="Select category..." />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
                          {categories.map((category) => (
                            <SelectItem key={category} value={category}>{category}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col justify-center">
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Parameter Group</label>
                      <Select
                        value={selectedParameterGroup || '__all__'}
                        onValueChange={handleTrainingParameterGroupChange}
                        disabled={!selectedCategory || parameterGroups.length === 0}
                      >
                        <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                          <SelectValue placeholder={selectedCategory ? 'All parameter groups' : 'Select category first'} />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
                          <SelectItem value="__all__">All Parameter Groups</SelectItem>
                          {parameterGroups.map((group) => (
                            <SelectItem key={group} value={group}>{group}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col justify-center">
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Instrument Description</label>
                      <Select
                        value={selectedDescription}
                        onValueChange={handleTrainingDescriptionChange}
                        disabled={!selectedCategory}
                      >
                        <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                          <SelectValue placeholder={selectedCategory ? 'Select description...' : 'Select category first'} />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
                          {descriptions.map((description) => (
                            <SelectItem key={description} value={description}>{description}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col justify-center">
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Make</label>
                      <Select
                        value={selectedMake || '__all__'}
                        onValueChange={handleTrainingMakeChange}
                        disabled={!selectedDescription}
                      >
                        <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                          <SelectValue placeholder={selectedDescription ? 'All makes' : 'Select description first'} />
                        </SelectTrigger>
                        <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
                          <SelectItem value="__all__">All Makes</SelectItem>
                          {makes.map((make) => (
                            <SelectItem key={make} value={make}>{make}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                  <div className="flex flex-col justify-center md:col-span-2">
                    <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Select Instrument</label>
                    <Select
                      value={trainingForm.masterInstrumentId}
                      onValueChange={handleTrainingInstrumentChange}
                      disabled={!selectedDescription}
                    >
                      <SelectTrigger className="h-10 w-full rounded-[9px] border-[#e2e8f0] bg-white text-[13px]">
                        <SelectValue placeholder={selectedDescription ? 'Select instrument...' : 'Select description first'} />
                      </SelectTrigger>
                      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-3rem)]">
                        {availableInstruments.map((instrument) => (
                          <SelectItem
                            key={instrument.id}
                            value={instrument.id}
                            disabled={instrument.status === 'EXPIRED'}
                          >
                            <span>
                              {instrument.assetNumber} - {instrument.model || instrument.make}
                              {instrument.status && instrument.status !== 'VALID' ? ` (${instrument.status}${instrument.daysUntilExpiry !== undefined ? `, ${instrument.daysUntilExpiry}d` : ''})` : ''}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : (
                <div className="grid min-h-full grid-cols-1 gap-4">
                  <div className="rounded-[10px] border border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 self-start">
                    <p className="text-[11px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Selected Instrument</p>
                    <p className="mt-1 text-[13px] font-semibold text-[#0f172a]">
                      {selectedTrainingInstrument?.assetNumber || '-'} - {selectedTrainingInstrument?.description || '-'}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Trained Date</label>
                      <input
                        type="date"
                        value={trainingForm.trainedAt}
                        onChange={(event) => setTrainingForm(prev => ({ ...prev, trainedAt: event.target.value }))}
                        className="w-full h-10 rounded-[9px] border border-[#e2e8f0] px-3 text-[13px]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Expires Date</label>
                      <input
                        type="date"
                        value={trainingForm.expiresAt}
                        onChange={(event) => setTrainingForm(prev => ({ ...prev, expiresAt: event.target.value }))}
                        className="w-full h-10 rounded-[9px] border border-[#e2e8f0] px-3 text-[13px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">
                  <div className="flex flex-col">
                    <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Certificate PDF</label>
                    <label className="flex min-h-[7.5rem] flex-1 cursor-pointer items-center justify-between gap-3 rounded-[9px] border border-dashed border-[#cbd5e1] bg-[#f8fafc] px-4 py-3 text-[13px] hover:bg-[#f1f5f9]">
                      <span className={cn('truncate', trainingFile ? 'font-semibold text-[#0f172a]' : 'text-[#64748b]')}>
                        {trainingFile ? trainingFile.name : 'Choose PDF file'}
                      </span>
                      <span className="shrink-0 rounded-[7px] bg-white border border-[#e2e8f0] px-3 py-1.5 text-[12px] font-semibold text-[#0f172a]">
                        Choose File
                      </span>
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(event) => setTrainingFile(event.target.files?.[0] || null)}
                        className="sr-only"
                        required
                      />
                    </label>
                  </div>

                  <div className="flex flex-col">
                    <label className="block text-[12px] font-semibold text-[#0f172a] mb-1.5">Notes</label>
                    <textarea
                      value={trainingForm.notes}
                      onChange={(event) => setTrainingForm(prev => ({ ...prev, notes: event.target.value }))}
                      className="min-h-[7.5rem] flex-1 resize-none rounded-[9px] border border-[#e2e8f0] px-3 py-2 text-[13px]"
                      placeholder="Optional training scope or remarks"
                    />
                  </div>
                  </div>
                </div>
              )}
            </div>

            {trainingError && (
              <p className="mt-4 text-[12px] font-medium text-[#dc2626]">{trainingError}</p>
            )}

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-[#f1f5f9]">
              <button
                type="button"
                onClick={() => trainingModalStep === 1 ? (setShowTrainingModal(false), resetTrainingForm()) : setTrainingModalStep(1)}
                className="px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] bg-white border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc]"
              >
                {trainingModalStep === 1 ? 'Cancel' : 'Back'}
              </button>
              {trainingModalStep === 1 ? (
                <button
                  type="button"
                  disabled={!trainingForm.masterInstrumentId}
                  onClick={() => setTrainingModalStep(2)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] disabled:opacity-50"
                >
                  Next
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={trainingSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] disabled:opacity-50"
                >
                  <Upload className="size-3.5" />
                  {trainingSubmitting ? 'Uploading...' : 'Add Document'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {trainingPdfUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="bg-white rounded-[14px] border border-[#e2e8f0] w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0]">
              <div className="min-w-0">
                <p className="text-[12px] font-bold uppercase tracking-[0.07em] text-[#94a3b8]">Training Certificate</p>
                <p className="text-[13px] font-semibold text-[#0f172a] truncate">{trainingPdfTitle}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-8 rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-0.5">
                  <button
                    type="button"
                    onClick={() => setTrainingPdfViewMode('iframe')}
                    className={cn(
                      'px-3 text-[12px] font-semibold rounded-md transition-colors',
                      trainingPdfViewMode === 'iframe'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#64748b] hover:text-[#0f172a]'
                    )}
                  >
                    Iframe
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrainingPdfViewMode('card')}
                    className={cn(
                      'px-3 text-[12px] font-semibold rounded-md transition-colors',
                      trainingPdfViewMode === 'card'
                        ? 'bg-white text-[#0f172a] shadow-sm'
                        : 'text-[#64748b] hover:text-[#0f172a]'
                    )}
                  >
                    Card
                  </button>
                </div>
                <button
                  onClick={closeTrainingPdf}
                  className="size-8 rounded-lg border border-[#e2e8f0] flex items-center justify-center hover:bg-[#f8fafc]"
                  aria-label="Close training certificate preview"
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
            {trainingPdfViewMode === 'iframe' ? (
              <iframe src={trainingPdfUrl} title={trainingPdfTitle} className="flex-1 w-full" />
            ) : (
              <div className="flex-1 overflow-auto bg-[#f1f5f9] p-6">
                <div className="mx-auto flex min-h-full max-w-4xl flex-col overflow-hidden rounded-[12px] border border-[#cbd5e1] bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-[#0f172a]">{trainingPdfTitle}</p>
                      <p className="text-[12px] text-[#94a3b8]">PDF card view</p>
                    </div>
                    <a
                      href={trainingPdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-[8px] border border-[#e2e8f0] px-3 py-1.5 text-[12px] font-semibold text-[#0f172a] hover:bg-[#f8fafc]"
                    >
                      Open
                    </a>
                  </div>
                  <object data={trainingPdfUrl} type="application/pdf" className="h-[70vh] w-full">
                    <iframe src={trainingPdfUrl} title={trainingPdfTitle} className="h-[70vh] w-full" />
                  </object>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

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
            <AlertDialogTitle>Reactivate & Send Activation Email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will send a new activation email to <span className="font-semibold text-[#0f172a]">{user.email}</span>. They will need to set a new password before logging in. The activation link expires in 24 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReactivate}
              className="bg-[#16a34a] hover:bg-[#15803d]"
            >
              Reactivate & Send Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
