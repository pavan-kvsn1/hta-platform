'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, AlertCircle, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { CertificateFormData } from '@/lib/stores/certificate-store'
import type { PDFSignatureData } from '@/components/pdf/pdf-utils'

interface InlinePDFViewerProps {
  certificateId: string
  certificateNumber: string
}

export function InlinePDFViewer({ certificateId, certificateNumber }: InlinePDFViewerProps) {
  const [isLoading, setIsLoading] = useState(false)
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

      const response = await fetch(`/api/certificates/${certificateId}/pdf-data`)

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
  }, [certificateId])

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

      const fileName = `${certificateNumber.replace(/\//g, '-')}-PREVIEW.pdf`
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
    if (!certificateData && !isLoading) {
      fetchCertificateData()
    }
  }, [certificateData, isLoading, fetchCertificateData])

  // Generate PDF when data is loaded
  useEffect(() => {
    if (certificateData && !pdfUrl && !isGenerating) {
      generatePDF()
    }
  }, [certificateData, pdfUrl, isGenerating, generatePDF])

  return (
    <div className="flex flex-col h-full bg-slate-100">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700">PDF Preview</h3>
          {isGenerating && (
            <span className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              Generating...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={generatePDF}
            disabled={isGenerating || !certificateData}
            title="Refresh preview"
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${isGenerating ? 'animate-spin' : ''}`} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={isGenerating || !certificateData}
            className="h-8"
          >
            <Download className="h-4 w-4 mr-1.5" />
            Download
          </Button>
        </div>
      </div>

      {/* PDF Content */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Loading certificate data...</p>
          </div>
        ) : error && !pdfUrl ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 max-w-md text-center">
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
        ) : isGenerating || (!pdfUrl && certificateData) ? (
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p className="text-sm">Generating PDF preview...</p>
          </div>
        ) : pdfUrl ? (
          <iframe
            src={pdfUrl}
            className="w-full h-full bg-white rounded-lg shadow-lg border"
            title="Certificate Preview"
          />
        ) : (
          <div className="text-slate-500 text-center">
            <p className="text-sm">No preview available</p>
          </div>
        )}
      </div>

      {/* Error toast at bottom */}
      {error && pdfUrl && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}
    </div>
  )
}
