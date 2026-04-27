'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Mail,
  Send,
  Loader2,
  CheckCircle,
  Download,
  Clock,
  ExternalLink,
} from 'lucide-react'

interface DownloadTokenHistory {
  id: string
  customerEmail: string
  customerName: string
  downloadUrl: string
  createdAt: string
  expiresAt: string
  downloadCount: number
  maxDownloads: number
  downloadedAt: string | null
  isExpired: boolean
  isExhausted: boolean
  sentBy: string
}

interface SendDownloadLinkModalProps {
  isOpen: boolean
  onClose: () => void
  certificateId: string
  customerName?: string | null
  customerEmail?: string | null
}

export function SendDownloadLinkModal({
  isOpen,
  onClose,
  certificateId,
  customerName: initialCustomerName,
  customerEmail: initialCustomerEmail,
}: SendDownloadLinkModalProps) {
  const [customerEmail, setCustomerEmail] = useState(initialCustomerEmail || '')
  const [customerName, setCustomerName] = useState(initialCustomerName || '')
  const [ccAdmin, setCcAdmin] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ downloadUrl: string } | null>(null)
  const [history, setHistory] = useState<DownloadTokenHistory[]>([])
  const [_loadingHistory, setLoadingHistory] = useState(false)

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true)
    try {
      const response = await apiFetch(`/api/admin/certificates/${certificateId}/send-download-link`)
      if (response.ok) {
        const data = await response.json()
        setHistory(data.tokens || [])
      }
    } catch (err) {
      console.error('Failed to load history:', err)
    } finally {
      setLoadingHistory(false)
    }
  }, [certificateId])

  // Load history when modal opens
  useEffect(() => {
    if (isOpen) {
      loadHistory()
      // Reset form state
      setCustomerEmail(initialCustomerEmail || '')
      setCustomerName(initialCustomerName || '')
      setCcAdmin(false)
      setError(null)
      setSuccess(null)
    }
  }, [isOpen, initialCustomerEmail, initialCustomerName, loadHistory])

  const handleSend = async () => {
    if (!customerEmail.trim() || !customerName.trim()) {
      setError('Please fill in all required fields')
      return
    }

    setIsSending(true)
    setError(null)

    try {
      const response = await apiFetch(`/api/admin/certificates/${certificateId}/send-download-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: customerEmail.trim(),
          customerName: customerName.trim(),
          ccAdmin,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Failed to send download link')
        return
      }

      setSuccess({ downloadUrl: data.downloadUrl })
      loadHistory() // Refresh history
    } catch {
      setError('An error occurred. Please try again.')
    } finally {
      setIsSending(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-[#2563eb]" />
            Send Download Link to Customer
          </DialogTitle>
          <DialogDescription>
            Send an email with a secure download link for the finalized certificate.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4">
            <div className="text-center mb-4">
              <div className="size-12 rounded-full bg-[#dcfce7] flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-[#16a34a]" />
              </div>
              <p className="text-sm font-medium text-[#166534]">Download Link Sent!</p>
              <p className="text-xs text-[#16a34a] mt-1">
                An email has been sent to {customerEmail}
              </p>
            </div>

            <div className="bg-[#f8fafc] rounded-xl p-3 text-xs">
              <p className="text-[#475569] mb-2">Download Link:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white p-2 rounded-[7px] border border-[#e2e8f0] text-[#334155] break-all">
                  {success.downloadUrl}
                </code>
                <button
                  onClick={() => window.open(success.downloadUrl, '_blank')}
                  className="p-2 border border-[#e2e8f0] rounded-[7px] hover:bg-[#f8fafc] transition-colors"
                >
                  <ExternalLink className="size-3" />
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => {
                  setSuccess(null)
                  setCustomerEmail('')
                  setCustomerName('')
                }}
                className="flex-1 px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
              >
                Send Another
              </button>
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <label htmlFor="customerEmail" className="text-sm font-medium text-[#0f172a]">
                  Customer Email *
                </label>
                <input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                />
              </div>

              <div>
                <label htmlFor="customerName" className="text-sm font-medium text-[#0f172a]">
                  Customer Name *
                </label>
                <input
                  id="customerName"
                  type="text"
                  placeholder="John Smith"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1 w-full px-3 py-2 text-sm text-[#0f172a] border border-[#e2e8f0] rounded-[9px] placeholder:text-[#94a3b8] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ccAdmin}
                  onChange={(e) => setCcAdmin(e.target.checked)}
                  className="size-4 rounded border-[#cbd5e1] text-[#7c3aed] focus:ring-[#7c3aed]/20"
                />
                <span className="text-sm text-[#0f172a]">CC: Send a copy to me</span>
              </label>

              {error && (
                <div className="px-3 py-2.5 text-sm text-[#dc2626] bg-[#fef2f2] border border-[#fee2e2] rounded-[9px]">
                  {error}
                </div>
              )}
            </div>

            {/* Previously Sent Section */}
            {history.length > 0 && (
              <div className="border-t border-[#e2e8f0] pt-4">
                <p className="text-xs font-medium text-[#334155] mb-2">Previously Sent</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {history.map((token) => (
                    <div
                      key={token.id}
                      className={`text-xs p-2 rounded-lg border ${
                        token.isExpired || token.isExhausted
                          ? 'bg-[#f8fafc] border-[#e2e8f0]'
                          : 'bg-[#f0fdf4] border-[#bbf7d0]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#0f172a]">{token.customerEmail}</span>
                        <span className="text-[#64748b]">
                          {formatDate(token.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[#64748b]">
                        <span className="flex items-center gap-1">
                          <Download className="size-3" />
                          {token.downloadCount}/{token.maxDownloads}
                        </span>
                        {token.isExpired ? (
                          <span className="text-[#dc2626]">Expired</span>
                        ) : token.isExhausted ? (
                          <span className="text-[#d97706]">Limit reached</span>
                        ) : (
                          <span className="flex items-center gap-1 text-[#16a34a]">
                            <Clock className="size-3" />
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-[12.5px] font-semibold text-[#0f172a] border border-[#e2e8f0] rounded-[9px] hover:bg-[#f8fafc] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isSending || !customerEmail.trim() || !customerName.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-[12.5px] font-semibold text-white bg-[#0f172a] hover:bg-[#1e293b] rounded-[9px] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="size-4" />
                    Send Download Link
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
