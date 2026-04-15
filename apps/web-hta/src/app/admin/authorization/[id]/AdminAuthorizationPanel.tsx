'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, CheckCircle, ChevronDown, ChevronRight, User, Mail, Send as _Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
      const response = await fetch(`/api/admin/authorization/${certificateId}/authorize`, {
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
      <div className="flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex-shrink-0">
        {/* Header - Collapsible */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors',
            isAuthorized ? 'bg-green-50' : ''
          )}
        >
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="size-4 text-slate-400" />
            ) : (
              <ChevronRight className="size-4 text-slate-400" />
            )}
            <span
              className={cn(
                'text-xs font-bold uppercase tracking-wider',
                isAuthorized ? 'text-green-700' : 'text-slate-700'
              )}
            >
              Authorization
            </span>
            {isAuthorized && (
              <CheckCircle className="size-4 text-green-600" />
            )}
          </div>
        </button>

        {/* Content - Only when expanded */}
        {isExpanded && (
          <div className="border-t border-slate-100">
            <div className="p-4">
              {isAuthorized ? (
                <div className="text-center py-2">
                  <div className="size-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-green-800">Certificate Authorized</p>
                  <p className="text-xs text-green-600 mt-1">
                    This certificate has been authorized and is now complete.
                  </p>

                  {/* Option to send download link after authorization */}
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSendLinkModal(true)}
                      className="w-full"
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Send Download Link to Customer
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-500 mb-4 text-center">
                    By authorizing, you confirm this certificate is complete and has been approved
                    by the customer.
                  </p>

                  {/* Send Download Link Option */}
                  <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <div className="flex items-start gap-2 mb-3">
                      <Checkbox
                        id="sendDownloadLink"
                        checked={sendDownloadLink}
                        onCheckedChange={(checked) => setSendDownloadLink(checked === true)}
                        className="mt-0.5"
                      />
                      <div className="flex-1">
                        <Label htmlFor="sendDownloadLink" className="text-sm font-medium text-blue-900 cursor-pointer">
                          Send download link to customer
                        </Label>
                        <p className="text-xs text-blue-700 mt-0.5">
                          Email the finalized certificate to the customer after authorization
                        </p>
                      </div>
                    </div>

                    {sendDownloadLink && (
                      <div className="space-y-3 pl-6">
                        <div>
                          <Label htmlFor="customerEmail" className="text-xs text-blue-800">
                            Customer Email *
                          </Label>
                          <Input
                            id="customerEmail"
                            type="email"
                            placeholder="customer@example.com"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            className="mt-1 h-8 text-sm bg-white"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customerName" className="text-xs text-blue-800">
                            Customer Name *
                          </Label>
                          <Input
                            id="customerName"
                            type="text"
                            placeholder="John Smith"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            className="mt-1 h-8 text-sm bg-white"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => setShowAuthorizeModal(true)}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-sm h-10"
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    {sendDownloadLink && customerEmail && customerName
                      ? 'Authorize & Send to Customer'
                      : 'Authorize & Sign'}
                  </Button>
                </>
              )}
            </div>

            {/* Certificate Info */}
            <div className="px-4 py-3 border-t bg-slate-50">
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-400">Revision:</span>
                  <span className="font-medium">{currentRevision}</span>
                </div>
                <div className="h-3 w-px bg-slate-300" />
                <div className="flex items-center gap-1.5">
                  <User className="size-3 text-slate-400" />
                  <span className="text-slate-400">Created by:</span>
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
