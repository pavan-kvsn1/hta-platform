'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, CheckCircle, ChevronDown, ChevronRight, User, Mail } from 'lucide-react'
import { SignatureModal } from '@/components/signatures'
import { SendDownloadLinkModal } from './SendDownloadLinkModal'
import type { SignatureData } from '@/types/signatures'
import { cn } from '@/lib/utils'

interface AdminAuthorizationPanelProps {
  certificateId: string
  isAuthorized: boolean
  currentRevision: number
  createdByName: string | null
  customerName?: string | null
  customerEmail?: string | null
}

export function AdminAuthorizationPanel({
  certificateId,
  isAuthorized,
  currentRevision,
  createdByName,
  customerName: initialCustomerName,
  customerEmail: initialCustomerEmail,
}: AdminAuthorizationPanelProps) {
  const router = useRouter()
  const [isExpanded, setIsExpanded] = useState(true)
  const [showAuthorizeModal, setShowAuthorizeModal] = useState(false)
  const [showSendLinkModal, setShowSendLinkModal] = useState(false)
  const [isAuthorizing, setIsAuthorizing] = useState(false)
  const [authorizeError, setAuthorizeError] = useState<string | null>(null)

  // Send download link options
  const [sendDownloadLink, setSendDownloadLink] = useState(true)
  const [customerEmail, setCustomerEmail] = useState(initialCustomerEmail || '')
  const [customerName, setCustomerName] = useState(initialCustomerName || '')

  // Update customer info if props change
  useEffect(() => {
    if (initialCustomerEmail) setCustomerEmail(initialCustomerEmail)
    if (initialCustomerName) setCustomerName(initialCustomerName)
  }, [initialCustomerEmail, initialCustomerName])

  // Authorize certificate
  const handleAuthorize = async (data: SignatureData) => {
    setIsAuthorizing(true)
    setAuthorizeError(null)

    try {
      const response = await apiFetch(`/api/admin/authorization/${certificateId}/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData: data.signatureImage,
          signerName: data.signerName,
          clientEvidence: data.clientEvidence,
          // Include download link options
          sendDownloadLink: sendDownloadLink && customerEmail.trim() && customerName.trim(),
          customerEmail: customerEmail.trim(),
          customerName: customerName.trim(),
        }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.downloadLink?.sent) {
          // Show success message briefly, then redirect
          setTimeout(() => {
            router.push('/admin/authorization')
          }, 1500)
        } else {
          router.push('/admin/authorization')
        }
      } else {
        let errorMessage = 'Failed to authorize certificate'
        try {
          const text = await response.text()
          if (text) {
            const responseData = JSON.parse(text)
            errorMessage = responseData.error || errorMessage
          }
        } catch {
          errorMessage = `Server error (${response.status})`
        }
        setAuthorizeError(errorMessage)
      }
    } catch (err) {
      console.error('Authorization error:', err)
      setAuthorizeError('An error occurred. Please try again.')
    } finally {
      setIsAuthorizing(false)
    }
  }

  return (
    <>
      <div className="flex flex-col bg-white rounded-[14px] border border-[#e2e8f0] overflow-hidden flex-shrink-0">
        {/* Header - Collapsible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center justify-between px-4 py-3 hover:bg-[#f8fafc] transition-colors',
            isAuthorized ? 'bg-[#f0fdf4]' : ''
          )}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4 text-[#94a3b8]" />
            ) : (
              <ChevronRight className="size-4 text-[#94a3b8]" />
            )}
            <span
              className={cn(
                'text-xs font-bold uppercase tracking-wider',
                isAuthorized ? 'text-[#15803d]' : 'text-[#334155]'
              )}
            >
              Authorization
            </span>
            {isAuthorized && (
              <CheckCircle className="size-4 text-[#16a34a]" />
            )}
          </div>
        </button>

        {/* Content - Only when expanded */}
        {isExpanded && (
          <div className="border-t border-[#f1f5f9]">
            <div className="p-4">
              {isAuthorized ? (
                <div className="text-center py-2">
                  <div className="size-12 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-6 w-6 text-[#16a34a]" />
                  </div>
                  <p className="text-sm font-medium text-[#166534]">Certificate Authorized</p>
                  <p className="text-xs text-[#16a34a] mt-1">
                    This certificate has been authorized and is now complete.
                  </p>

                  {/* Option to send download link after authorization */}
                  <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
                    <button
                      onClick={() => setShowSendLinkModal(true)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
                    >
                      <Mail className="size-4" />
                      Send Download Link to Customer
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-[#64748b] mb-4 text-center">
                    By authorizing, you confirm this certificate is complete and has been approved
                    by the customer.
                  </p>

                  {/* Send Download Link Option */}
                  <div className="mb-4 p-3 bg-[#eff6ff] rounded-xl border border-[#dbeafe]">
                    <label className="flex items-start gap-2 mb-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendDownloadLink}
                        onChange={(e) => setSendDownloadLink(e.target.checked)}
                        className="mt-1 size-4 rounded border-[#cbd5e1] text-[#2563eb] focus:ring-[#2563eb]/20"
                      />
                      <div className="flex-1">
                        <span className="text-sm font-medium text-[#1e3a5f]">
                          Send download link to customer
                        </span>
                        <p className="text-xs text-[#1d4ed8] mt-0.5">
                          Email the finalized certificate to the customer after authorization
                        </p>
                      </div>
                    </label>

                    {sendDownloadLink && (
                      <div className="space-y-3 pl-6">
                        <div>
                          <label htmlFor="customerEmail" className="text-xs font-medium text-[#1e40af]">
                            Customer Email *
                          </label>
                          <input
                            id="customerEmail"
                            type="email"
                            placeholder="customer@example.com"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            className="mt-1 w-full h-8 px-3 text-sm text-[#0f172a] bg-white border border-[#e2e8f0] rounded-[7px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                          />
                        </div>
                        <div>
                          <label htmlFor="customerName" className="text-xs font-medium text-[#1e40af]">
                            Customer Name *
                          </label>
                          <input
                            id="customerName"
                            type="text"
                            placeholder="John Smith"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="mt-1 w-full h-8 px-3 text-sm text-[#0f172a] bg-white border border-[#e2e8f0] rounded-[7px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => setShowAuthorizeModal(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-[12.5px] font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-[9px] transition-colors"
                  >
                    <ShieldCheck className="size-4" />
                    {sendDownloadLink && customerEmail && customerName
                      ? 'Authorize & Send to Customer'
                      : 'Authorize & Sign'}
                  </button>
                </>
              )}
            </div>

            {/* Certificate Info */}
            <div className="px-4 py-3 border-t border-[#f1f5f9] bg-[#f8fafc]">
              <div className="flex items-center gap-4 text-xs text-[#475569]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[#94a3b8]">Revision:</span>
                  <span className="font-medium">{currentRevision}</span>
                </div>
                <div className="h-3 w-px bg-[#cbd5e1]" />
                <div className="flex items-center gap-1.5">
                  <User className="size-3 text-[#94a3b8]" />
                  <span className="text-[#94a3b8]">Created by:</span>
                  <span className="font-medium">{createdByName || '-'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Authorize Modal */}
      <SignatureModal
        isOpen={showAuthorizeModal}
        onClose={() => {
          setShowAuthorizeModal(false)
          setAuthorizeError(null)
        }}
        onConfirm={handleAuthorize}
        title="Authorize Certificate"
        description={
          sendDownloadLink && customerEmail && customerName
            ? `Please sign below to authorize this certificate. A download link will be sent to ${customerEmail}.`
            : 'Please sign below to authorize this calibration certificate. Your signature will be added as the final authorization.'
        }
        confirmLabel={
          sendDownloadLink && customerEmail && customerName
            ? 'Authorize & Send'
            : 'Confirm Authorization'
        }
        loading={isAuthorizing}
        error={authorizeError}
      />

      {/* Send Download Link Modal (for post-authorization) */}
      <SendDownloadLinkModal
        isOpen={showSendLinkModal}
        onClose={() => setShowSendLinkModal(false)}
        certificateId={certificateId}
        customerName={initialCustomerName}
        customerEmail={initialCustomerEmail}
      />
    </>
  )
}
