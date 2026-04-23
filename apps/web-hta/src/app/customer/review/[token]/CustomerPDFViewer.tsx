'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect, useCallback } from 'react'
import { FileText, Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CertificateFormData } from '@/lib/stores/certificate-store'
import type { PDFSignatureData } from '@/components/pdf/pdf-utils'

interface CustomerPDFViewerProps {
  token: string
  certificateNumber: string
}

export function CustomerPDFViewer({ token, certificateNumber }: CustomerPDFViewerProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [certificateData, setCertificateData] = useState<CertificateFormData | null>(null)
  const [signatureData, setSignatureData] = useState<PDFSignatureData | undefined>(undefined)

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfUrl])

  // Fetch certificate data
  const fetchCertificateData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await apiFetch(`/api/customer/review/${token}/certificate`)

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch certificate data')
      }

      const data = await response.json()
      const { signatures, ...certData } = data
      setSignatureData(signatures)
      setCertificateData(certData)
    } catch (err) {
      console.error('Error fetching certificate:', err)
      setError(err instanceof Error ? err.message : 'Failed to load certificate')
    } finally {
      setIsLoading(false)
    }
  }, [token])

  // Generate PDF from certificate data
  const generatePDF = useCallback(async () => {
    if (!certificateData) return

    try {
      setIsGenerating(true)
      setError(null)

      // Revoke old URL if exists
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
        setPdfUrl(null)
      }

      // Dynamic import of PDF generation
      const { generatePDFWithOptimalSpacing } = await import('@/components/pdf/pdf-two-pass')
      const result = await generatePDFWithOptimalSpacing(certificateData, signatureData)

      console.log(`PDF generated: ${result.pageCount} pages, multiplier: ${result.multiplier.toFixed(2)}`)

      const url = URL.createObjectURL(result.blob)
      setPdfUrl(url)
    } catch (err) {
      console.error('Error generating PDF:', err)
      setError('Failed to generate PDF preview')
    } finally {
      setIsGenerating(false)
    }
  }, [certificateData, signatureData, pdfUrl])

  // Download PDF
  const handleDownload = useCallback(async () => {
    if (!certificateData) return

    try {
      setIsGenerating(true)

      const { generatePDFWithOptimalSpacing } = await import('@/components/pdf/pdf-two-pass')
      const result = await generatePDFWithOptimalSpacing(certificateData, signatureData)

      const fileName = `${certificateNumber.replace(/\//g, '-')}-DRAFT.pdf`
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      console.error('Error downloading PDF:', err)
      setError('Failed to download PDF')
    } finally {
      setIsGenerating(false)
    }
  }, [certificateData, signatureData, certificateNumber])

  // Fetch data on mount
  useEffect(() => {
    fetchCertificateData()
  }, [fetchCertificateData])

  // Generate PDF when data is loaded
  useEffect(() => {
    if (certificateData && !pdfUrl && !isGenerating) {
      generatePDF()
    }
  }, [certificateData, pdfUrl, isGenerating, generatePDF])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Loading certificate data...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (error && !pdfUrl) {
    return (
      <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center h-full">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-6 w-6 text-red-600" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Unable to Load Certificate</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <Button onClick={fetchCertificateData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  // Generating state
  if (isGenerating || (!pdfUrl && certificateData)) {
    return (
      <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p>Generating PDF preview...</p>
        </div>
      </div>
    )
  }

  // PDF preview
  return (
    <>
      {/* Header with controls */}
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
        <h2 className="font-semibold text-gray-900 text-sm">Certificate Preview</h2>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={generatePDF}
            disabled={isGenerating}
            title="Refresh preview"
            className="h-7 w-7 p-0"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isGenerating ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={isGenerating} className="h-7 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" />
            Download
          </Button>
        </div>
      </div>

      {pdfUrl ? (
        <iframe
          src={pdfUrl}
          className="w-full flex-1 border-0"
          title="Certificate Preview"
        />
      ) : (
        <div className="flex-1 bg-gray-100 p-4 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-md text-center">
            <FileText className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No preview available</p>
          </div>
        </div>
      )}

      {error && pdfUrl && (
        <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}
    </>
  )
}
