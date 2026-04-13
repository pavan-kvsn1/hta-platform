'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Download,
  FileText,
  Calendar,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
} from 'lucide-react'

interface CertificateInfo {
  certificateNumber: string
  instrumentDescription: string | null
  make: string | null
  model: string | null
  serialNumber: string | null
  calibrationDate: string | null
  calibrationDueDate: string | null
  customerName: string | null
  hasPdf: boolean
}

interface DownloadInfo {
  customerName: string
  customerEmail: string
  downloadCount: number
  maxDownloads: number
  remainingDownloads: number
  expiresAt: string
}

interface TokenData {
  valid: boolean
  certificate: CertificateInfo
  download: DownloadInfo
}

export default function CustomerDownloadPage() {
  const params = useParams()
  const token = params.token as string

  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<TokenData | null>(null)

  useEffect(() => {
    async function validateToken() {
      try {
        const response = await fetch(`/api/customer/download/${token}`)
        const result = await response.json()

        if (!response.ok) {
          setError(result.error || 'Failed to validate download link')
          return
        }

        setData(result)
      } catch (err) {
        setError('Failed to connect to server')
      } finally {
        setLoading(false)
      }
    }

    if (token) {
      validateToken()
    }
  }, [token])

  const handleDownload = async () => {
    if (!data) return

    setDownloading(true)
    try {
      const response = await fetch(`/api/customer/download/${token}/pdf`)

      if (!response.ok) {
        const result = await response.json()
        setError(result.error || 'Failed to download certificate')
        return
      }

      // Get the blob and trigger download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Certificate-${data.certificate.certificateNumber}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      // Refresh data to update download count
      const refreshResponse = await fetch(`/api/customer/download/${token}`)
      if (refreshResponse.ok) {
        const refreshResult = await refreshResponse.json()
        setData(refreshResult)
      }
    } catch (err) {
      setError('Failed to download certificate')
    } finally {
      setDownloading(false)
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  const getExpiryDays = (expiresAt: string) => {
    const now = new Date()
    const expiry = new Date(expiresAt)
    const diff = expiry.getTime() - now.getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Validating download link...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <h2 className="mt-4 text-xl font-semibold text-gray-900">
                Download Link Error
              </h2>
              <p className="mt-2 text-gray-600">{error}</p>
              <p className="mt-4 text-sm text-gray-500">
                If you believe this is an error, please contact HTA Instrumentation
                for assistance.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const { certificate, download } = data
  const expiryDays = getExpiryDays(download.expiresAt)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="HTA Instrumentation"
              width={180}
              height={50}
              className="h-12 w-auto"
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* Success Banner */}
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            <span className="text-green-800 font-medium">
              Your Calibration Certificate is Ready
            </span>
          </div>
        </div>

        {/* Certificate Details */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-600" />
              Certificate Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Certificate Number
                </dt>
                <dd className="mt-1 text-lg font-semibold text-gray-900">
                  {certificate.certificateNumber}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Customer</dt>
                <dd className="mt-1 text-gray-900">
                  {certificate.customerName || 'N/A'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500">Instrument</dt>
                <dd className="mt-1 text-gray-900">
                  {certificate.instrumentDescription || 'N/A'}
                  {certificate.make && ` - ${certificate.make}`}
                  {certificate.model && ` ${certificate.model}`}
                </dd>
              </div>
              {certificate.serialNumber && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    Serial Number
                  </dt>
                  <dd className="mt-1 text-gray-900">{certificate.serialNumber}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Calibration Date
                </dt>
                <dd className="mt-1 text-gray-900 flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  {formatDate(certificate.calibrationDate)}
                </dd>
              </div>
              {certificate.calibrationDueDate && (
                <div>
                  <dt className="text-sm font-medium text-gray-500">Valid Until</dt>
                  <dd className="mt-1 text-gray-900">
                    {formatDate(certificate.calibrationDueDate)}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Download Section */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-center">
              {/* PDF Preview Placeholder */}
              <div className="mx-auto w-48 h-64 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center mb-6">
                <div className="text-center">
                  <FileText className="h-16 w-16 text-gray-400 mx-auto" />
                  <span className="text-sm text-gray-500 mt-2 block">
                    PDF Certificate
                  </span>
                </div>
              </div>

              <Button
                size="lg"
                onClick={handleDownload}
                disabled={downloading || download.remainingDownloads <= 0}
                className="px-8"
              >
                {downloading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-5 w-5" />
                    Download Certificate (PDF)
                  </>
                )}
              </Button>

              {/* Download Stats */}
              <div className="mt-4 flex items-center justify-center gap-6 text-sm text-gray-500">
                <span className="flex items-center gap-1">
                  <Download className="h-4 w-4" />
                  {download.remainingDownloads} of {download.maxDownloads} downloads
                  remaining
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Link expires in {expiryDays} day{expiryDays !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portal Upsell */}
        <Alert>
          <AlertDescription>
            <strong>Need full portal access?</strong>
            <p className="mt-1 text-sm">
              Contact us to set up your customer account with complete certificate
              history, calibration reminders, and team access.
            </p>
            <a
              href="mailto:portal@htainstrumentation.com"
              className="mt-2 inline-block text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Contact Us &rarr;
            </a>
          </AlertDescription>
        </Alert>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-6 text-center text-sm text-gray-500">
          <p className="font-medium text-gray-700">
            HTA Instrumentation (P) Ltd.
          </p>
          <p className="mt-1">Calibration & Testing Services</p>
          <p className="mt-4">
            &copy; {new Date().getFullYear()} HTA Instrumentation (P) Ltd. All
            rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
