'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { SignatureModal } from '@/components/signatures'
import type { SignatureData } from '@/types/signatures'
import { CustomerPDFViewer } from '@/app/customer/review/[token]/CustomerPDFViewer'
import {
  Clock,
  Calendar,
  Building2,
  CheckCircle,
  Loader2 as _Loader2,
  ChevronLeft,
  LogOut,
  FileEdit,
  AlertTriangle,
  User,
} from 'lucide-react'
import { CustomerChatPanel } from './CustomerChatPanel'

interface CertificateData {
  id: string
  certificateNumber: string
  status: string
  customerName: string | null
  customerAddress: string | null
  uucDescription: string | null
  uucMake: string | null
  uucModel: string | null
  uucSerialNumber: string | null
  dateOfCalibration: string | null
  calibrationDueDate: string | null
  currentRevision: number
}

interface CustomerData {
  id: string
  name: string
  email: string
  companyName: string
}

interface SignatureInfo {
  engineer?: { name: string }
  hod?: { name: string }
  customer?: { name: string }
}

interface CustomerReviewClientProps {
  token: string
  certificate: CertificateData
  customer: CustomerData
  expiresAt: string | null // null for session-based access (no token)
  sentAt?: string // when the certificate was sent for review (for TAT calculation)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function getInitials(name: string): string {
  if (!name) return 'C'
  const parts = name.split(' ')
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
  }
  return name.substring(0, 2).toUpperCase()
}

function formatTATTime(ms: number): { hours: number; minutes: number } {
  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  return { hours, minutes }
}

function TATBanner({ sentAt, targetHours = 48 }: { sentAt: string; targetHours?: number }) {
  const [elapsed, setElapsed] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [remaining, setRemaining] = useState<{ hours: number; minutes: number }>({ hours: 0, minutes: 0 })
  const [status, setStatus] = useState<'good' | 'warning' | 'critical'>('good')

  useEffect(() => {
    const calculateTAT = () => {
      const sentTime = new Date(sentAt).getTime()
      const now = Date.now()
      const elapsedMs = now - sentTime
      const targetMs = targetHours * 60 * 60 * 1000
      const remainingMs = targetMs - elapsedMs

      setElapsed(formatTATTime(elapsedMs))

      if (remainingMs <= 0) {
        setRemaining({ hours: 0, minutes: 0 })
        setStatus('critical')
      } else if (remainingMs <= 6 * 60 * 60 * 1000) { // < 6 hours
        setRemaining(formatTATTime(remainingMs))
        setStatus('warning')
      } else {
        setRemaining(formatTATTime(remainingMs))
        setStatus('good')
      }
    }

    calculateTAT()
    const interval = setInterval(calculateTAT, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [sentAt, targetHours])

  const statusColors = {
    good: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    critical: 'bg-red-50 border-red-200 text-red-800',
  }

  const statusIcons = {
    good: <Clock className="h-4 w-4 text-green-600" />,
    warning: <AlertTriangle className="h-4 w-4 text-amber-600" />,
    critical: <AlertTriangle className="h-4 w-4 text-red-600" />,
  }

  return (
    <div className={`px-4 py-2 border-b ${statusColors[status]} flex items-center justify-between text-sm`}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {statusIcons[status]}
          <span className="font-medium">
            TAT: {elapsed.hours}h {elapsed.minutes}m elapsed
          </span>
        </div>
        <span className="text-gray-500">|</span>
        <span>Target: {targetHours}h</span>
      </div>
      <div>
        {status === 'critical' ? (
          <span className="font-medium text-red-700">Target exceeded</span>
        ) : (
          <span>
            {remaining.hours}h {remaining.minutes}m remaining
          </span>
        )}
      </div>
    </div>
  )
}

function SignatureStatusPanel({ signatures }: { signatures?: SignatureInfo }) {
  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        {signatures?.engineer ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-700">Assignee: {signatures.engineer.name}</span>
          </>
        ) : (
          <>
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-gray-500">Assignee: Pending</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {signatures?.hod ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-700">Reviewer: {signatures.hod.name}</span>
          </>
        ) : (
          <>
            <Clock className="h-4 w-4 text-gray-400" />
            <span className="text-gray-500">Reviewer: Pending</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {signatures?.customer ? (
          <>
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-green-700">Customer: {signatures.customer.name}</span>
          </>
        ) : (
          <>
            <User className="h-4 w-4 text-blue-500" />
            <span className="text-blue-700 font-medium">Customer: Awaiting your signature</span>
          </>
        )}
      </div>
    </div>
  )
}

export function CustomerReviewClient({
  token,
  certificate,
  customer,
  expiresAt,
  sentAt,
}: CustomerReviewClientProps) {
  const router = useRouter()
  const [showApproveModal, setShowApproveModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<SignatureInfo | undefined>()

  // Fetch signature status
  useEffect(() => {
    const fetchSignatures = async () => {
      try {
        const encodedToken = encodeURIComponent(token)
        const response = await apiFetch(`/api/customer/review/${encodedToken}/certificate`)
        if (response.ok) {
          const data = await response.json()
          if (data.signatures) {
            setSignatures({
              engineer: data.signatures.engineer,
              hod: data.signatures.hod,
              customer: data.signatures.customer,
            })
          }
        }
      } catch {
        // Ignore errors - signatures are optional
      }
    }

    fetchSignatures()
  }, [token])

  // Check if certificate is being revised by engineer (no approval allowed)
  const isBeingRevised = certificate.status === 'REVISION_REQUIRED'

  // Check if certificate is already approved/completed (read-only mode)
  const isCompleted = ['APPROVED', 'PENDING_ADMIN_AUTHORIZATION', 'PENDING_ADMIN_APPROVAL', 'AUTHORIZED'].includes(certificate.status)

  const handleApprove = async (data: SignatureData) => {
    setIsSubmitting(true)
    setSubmitError(null)

    try {
      // Encode token to handle special characters like colon in cert:ID format
      const encodedToken = encodeURIComponent(token)
      const response = await apiFetch(`/api/customer/review/${encodedToken}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData: data.signatureImage,
          signerName: data.signerName,
          signerEmail: customer.email,
          clientEvidence: data.clientEvidence,
        }),
      })

      if (response.ok) {
        // For session-based access, redirect to dashboard instead of token-based success page
        if (token.startsWith('cert:')) {
          router.push('/customer/dashboard')
        } else {
          router.push(`/customer/review/${encodedToken}/success`)
        }
      } else {
        // Try to parse error response, handle empty responses
        let errorMessage = 'Failed to approve certificate'
        try {
          const text = await response.text()
          if (text) {
            const responseData = JSON.parse(text)
            errorMessage = responseData.error || errorMessage
          }
        } catch {
          // Response was not JSON or empty
          errorMessage = `Server error (${response.status})`
        }
        setSubmitError(errorMessage)
      }
    } catch (error) {
      console.error('Approval error:', error)
      setSubmitError('An error occurred. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b px-4 py-2.5 z-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image
              src="/hta-logo.jpg"
              alt="HTA Instrumentation"
              width={50}
              height={25}
              className="object-contain"
            />
            <div className="h-5 w-px bg-gray-300" />
            <span className="text-sm font-bold text-gray-700">
              Certificate Review: {certificate.certificateNumber}
            </span>
          </div>

          {/* Right: User Info */}
          <div className="flex items-center gap-3">
            {/* Token Expiry (if token-based) */}
            {expiresAt && (
              <div className="hidden md:flex items-center gap-2 text-xs text-gray-500">
                <Clock className="h-3.5 w-3.5" />
                <span>Expires: {formatDate(expiresAt)}</span>
              </div>
            )}

            {/* Company Name Badge */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2.5 py-1 rounded-full border border-gray-100">
              <Building2 className="h-3.5 w-3.5" />
              <span>{customer.companyName}</span>
            </div>

            {/* User Avatar and Info */}
            <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full ring-1 ring-gray-100 bg-green-800 text-white flex items-center justify-center font-bold text-xs">
                  {getInitials(customer.name)}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs font-semibold text-gray-800">{customer.name}</p>
                  <p className="text-[10px] text-gray-500">Customer</p>
                </div>
              </div>

              <button
                onClick={() => signOut({ callbackUrl: '/customer/login' })}
                className="p-1.5 hover:bg-gray-50 rounded-full transition-colors text-gray-500 hover:text-gray-700"
                title="Sign out"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* TAT Banner (only for token-based access with sentAt) */}
      {sentAt && !isCompleted && <TATBanner sentAt={sentAt} />}

      {/* Certificate Info Banner */}
      <div className="bg-white border-b px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left: Back to Dashboard */}
          <Link href="/customer/dashboard" className="text-sm font-semibold hover:text-gray-700 flex items-center gap-1">
            <ChevronLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          {/* Right: Certificate Info */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500">Instrument:</span>
              <span className="font-medium">{certificate.uucDescription || 'N/A'}</span>
            </div>
            {certificate.uucMake && (
              <>
                <div className="h-4 w-px bg-gray-300" />
                <span className="text-gray-500">{certificate.uucMake} {certificate.uucModel}</span>
              </>
            )}
            <div className="h-4 w-px bg-gray-300" />
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span>Calibration: {formatDate(certificate.dateOfCalibration)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width & Full Height */}
      <div className="flex-1 w-full px-4 py-4 overflow-hidden flex flex-col min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
          {/* PDF Preview Panel */}
          <div className="lg:col-span-2 bg-white rounded-lg border shadow-sm overflow-hidden flex flex-col min-h-0">
            <CustomerPDFViewer
              token={token}
              certificateNumber={certificate.certificateNumber}
            />
          </div>

          {/* Right Side Panels */}
          <div className="flex flex-col gap-4 overflow-hidden min-h-0">
            {/* Chat Panel */}
            <CustomerChatPanel
              token={token}
              isCompleted={isCompleted}
              className="flex-1 min-h-0"
            />

            {/* Approval Panel */}
            {isCompleted ? (
              /* Certificate is approved/completed */
              <div className="bg-white rounded-lg border shadow-sm flex flex-col">
                <div className="px-4 py-3 border-b bg-green-50">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h2 className="font-semibold text-green-800 text-[13px]">
                      {certificate.status === 'AUTHORIZED' ? 'Completed' : 'Approved'}
                    </h2>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[12px] text-gray-600 text-center mb-3">
                    {certificate.status === 'AUTHORIZED'
                      ? 'This certificate has been fully authorized and completed.'
                      : 'This certificate has been approved and signed. Awaiting final admin authorization.'}
                  </p>
                  {signatures && <SignatureStatusPanel signatures={signatures} />}
                </div>

                {/* Customer Info */}
                <div className="px-4 py-3 border-t bg-gray-50">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{customer.companyName}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Reviewed as: {customer.email}</p>
                </div>
              </div>
            ) : isBeingRevised ? (
              /* Certificate is being revised by engineer - no approval allowed */
              <div className="bg-white rounded-lg border shadow-sm flex flex-col">
                <div className="px-4 py-3 border-b bg-blue-50">
                  <div className="flex items-center gap-2">
                    <FileEdit className="h-4 w-4 text-blue-600" />
                    <h2 className="font-semibold text-blue-800 text-[13px]">Under Revision</h2>
                  </div>
                </div>
                <div className="p-4">
                  <p className="text-[12px] text-gray-600 text-center mb-3">
                    Your feedback has been forwarded to the engineer. The certificate is being updated.
                  </p>
                  {signatures && <SignatureStatusPanel signatures={signatures} />}
                </div>

                {/* Customer Info */}
                <div className="px-4 py-3 border-t bg-gray-50">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{customer.companyName}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Reviewing as: {customer.email}</p>
                </div>
              </div>
            ) : (
              /* Customer can approve or request changes */
              <div className="bg-white rounded-lg border shadow-sm flex flex-col">
                <div className="px-4 py-3 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <h2 className="font-semibold text-gray-900 text-[13px]">Approval</h2>
                  </div>
                </div>
                <div className="p-4">
                  {/* Signature Status */}
                  {signatures && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg">
                      <SignatureStatusPanel signatures={signatures} />
                    </div>
                  )}

                  <p className="text-[11px] text-gray-500 mb-3 text-center">
                    By approving, you confirm all details are correct.
                  </p>
                  <Button
                    onClick={() => setShowApproveModal(true)}
                    className="w-full bg-green-600 hover:bg-green-700 text-sm h-10"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Approve & Sign
                  </Button>
                </div>

                {/* Customer Info */}
                <div className="px-4 py-3 border-t bg-gray-50">
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>{customer.companyName}</span>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Reviewing as: {customer.email}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      <SignatureModal
        isOpen={showApproveModal}
        onClose={() => {
          setShowApproveModal(false)
          setSubmitError(null)
        }}
        onConfirm={handleApprove}
        defaultName={customer.name}
        nameReadOnly={true}
        title="Approve Certificate"
        description="Please sign below to approve this calibration certificate. Your signature will be added to the final document."
        confirmLabel="Confirm Approval"
        loading={isSubmitting}
        error={submitError}
      />

    </div>
  )
}
