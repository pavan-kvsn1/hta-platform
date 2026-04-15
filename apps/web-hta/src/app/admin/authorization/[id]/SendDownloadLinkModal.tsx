'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
      const response = await fetch(`/api/admin/certificates/${certificateId}/send-download-link`)
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
      const response = await fetch(`/api/admin/certificates/${certificateId}/send-download-link`, {
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
            <Mail className="h-5 w-5 text-blue-600" />
            Send Download Link to Customer
          </DialogTitle>
          <DialogDescription>
            Send an email with a secure download link for the finalized certificate.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="py-4">
            <div className="text-center mb-4">
              <div className="size-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <p className="text-sm font-medium text-green-800">Download Link Sent!</p>
              <p className="text-xs text-green-600 mt-1">
                An email has been sent to {customerEmail}
              </p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs">
              <p className="text-slate-600 mb-2">Download Link:</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-white p-2 rounded border text-slate-700 break-all">
                  {success.downloadUrl}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(success.downloadUrl, '_blank')}
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setSuccess(null)
                  setCustomerEmail('')
                  setCustomerName('')
                }}
              >
                Send Another
              </Button>
              <Button className="flex-1" onClick={onClose}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="customerEmail">Customer Email *</Label>
                <Input
                  id="customerEmail"
                  type="email"
                  placeholder="customer@example.com"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="customerName">Customer Name *</Label>
                <Input
                  id="customerName"
                  type="text"
                  placeholder="John Smith"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="mt-1"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ccAdmin"
                  checked={ccAdmin}
                  onCheckedChange={(checked) => setCcAdmin(checked === true)}
                />
                <Label htmlFor="ccAdmin" className="text-sm font-normal cursor-pointer">
                  CC: Send a copy to me
                </Label>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            {/* Previously Sent Section */}
            {history.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-xs font-medium text-slate-700 mb-2">Previously Sent</p>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {history.map((token) => (
                    <div
                      key={token.id}
                      className={`text-xs p-2 rounded border ${
                        token.isExpired || token.isExhausted
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-green-50 border-green-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{token.customerEmail}</span>
                        <span className="text-slate-500">
                          {formatDate(token.createdAt)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-slate-500">
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {token.downloadCount}/{token.maxDownloads}
                        </span>
                        {token.isExpired ? (
                          <span className="text-red-500">Expired</span>
                        ) : token.isExhausted ? (
                          <span className="text-amber-500">Limit reached</span>
                        ) : (
                          <span className="flex items-center gap-1 text-green-600">
                            <Clock className="h-3 w-3" />
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
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleSend}
                disabled={isSending || !customerEmail.trim() || !customerName.trim()}
              >
                {isSending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send Download Link
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
