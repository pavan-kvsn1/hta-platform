'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { FileDown, Loader2, AlertCircle } from 'lucide-react'
import { useCertificateStore, CertificateFormData } from '@/lib/stores/certificate-store'

interface PDFPreviewSectionProps {
  showPreview?: boolean
}

export function PDFPreviewSection({ showPreview = false }: PDFPreviewSectionProps) {
  const { formData } = useCertificateStore()
  const [isClient, setIsClient] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Only render on client side
  useEffect(() => {
    setIsClient(true)
  }, [])

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [pdfUrl])

  // Validate form data before allowing PDF generation
  const validationErrors: string[] = []

  if (!formData.certificateNumber) {
    validationErrors.push('Certificate number is missing')
  }
  if (!formData.uucDescription) {
    validationErrors.push('UUC description is required')
  }
  if (!formData.customerName) {
    validationErrors.push('Customer name is required')
  }
  if (!formData.dateOfCalibration) {
    validationErrors.push('Date of calibration is required')
  }
  if (formData.parameters.length === 0 || !formData.parameters[0].parameterName) {
    validationErrors.push('At least one parameter must be defined')
  }
  if (formData.masterInstruments.length === 0 || !formData.masterInstruments[0].masterInstrumentId) {
    validationErrors.push('At least one master instrument must be selected')
  }

  // Validate that all parameters are assigned to a master instrument
  const unassignedParams = formData.parameters.filter(p => p.parameterName && !p.masterInstrumentId)
  if (unassignedParams.length > 0) {
    validationErrors.push(`Parameter(s) not assigned to master instrument: ${unassignedParams.map(p => p.parameterName).join(', ')}`)
  }

  // Validate that all assigned parameters have SOP reference
  const paramsWithoutSOP = formData.parameters.filter(p => p.masterInstrumentId && !p.sopReference)
  if (paramsWithoutSOP.length > 0) {
    validationErrors.push(`SOP reference missing for parameter(s): ${paramsWithoutSOP.map(p => p.parameterName).join(', ')}`)
  }

  const canGeneratePDF = validationErrors.length === 0

  // Generate filename for download
  const fileName = `${formData.certificateNumber.replace(/\//g, '-') || 'Certificate'}.pdf`

  // Generate and download PDF using two-pass optimization
  const handleDownloadPDF = useCallback(async () => {
    if (!canGeneratePDF || isGenerating) return

    setIsGenerating(true)
    setError(null)

    try {
      console.log('Starting PDF generation...')
      // Use two-pass generation for optimal spacing
      const twoPass = await import('./pdf-two-pass')
      console.log('Two-pass module loaded')
      const result = await twoPass.generatePDFWithOptimalSpacing(formData)

      console.log(`PDF generated: ${result.pageCount} pages, multiplier: ${result.multiplier.toFixed(2)}, iterations: ${result.iterations}`)

      // Create download link and trigger download
      const url = URL.createObjectURL(result.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Cleanup
      setTimeout(() => URL.revokeObjectURL(url), 100)
    } catch (err) {
      console.error('PDF generation failed:', err)
      setError('Failed to generate PDF. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [canGeneratePDF, isGenerating, formData, fileName])

  // Generate PDF for preview using two-pass optimization
  const handleGeneratePreview = useCallback(async () => {
    if (!canGeneratePDF) return

    setIsGenerating(true)
    setError(null)

    try {
      // Use two-pass generation for optimal spacing
      const { generatePDFWithOptimalSpacing } = await import('./pdf-two-pass')
      const result = await generatePDFWithOptimalSpacing(formData)

      console.log(`Preview generated: ${result.pageCount} pages, multiplier: ${result.multiplier.toFixed(2)}, iterations: ${result.iterations}`)

      // Revoke old URL if exists
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }

      const url = URL.createObjectURL(result.blob)
      setPdfUrl(url)
    } catch (err) {
      console.error('PDF preview generation failed:', err)
      setError('Failed to generate preview. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }, [canGeneratePDF, formData, pdfUrl])

  // Generate preview when showPreview becomes true
  useEffect(() => {
    if (showPreview && canGeneratePDF && !pdfUrl && !isGenerating) {
      handleGeneratePreview()
    }
  }, [showPreview, canGeneratePDF, pdfUrl, isGenerating, handleGeneratePreview])

  if (!isClient) {
    return (
      <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 animate-pulse">
        <div className="h-10 bg-slate-200 rounded w-48"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Generate Certificate PDF</h3>
            <p className="text-xs text-slate-500 mt-1">
              Download the calibration certificate as PDF
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Download Button */}
            <button
              type="button"
              onClick={handleDownloadPDF}
              disabled={!canGeneratePDF || isGenerating}
              className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileDown className="size-4" />
              )}
              {isGenerating ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-4 text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {!canGeneratePDF && (
          <div className="mt-4 p-3 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="size-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-800">
                  Please complete the following before generating PDF:
                </p>
                <ul className="mt-1 text-xs text-amber-700 list-disc list-inside">
                  {validationErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PDF Preview using iframe */}
      {showPreview && pdfUrl && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600">Certificate Preview</p>
            <button
              type="button"
              onClick={handleGeneratePreview}
              disabled={isGenerating}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {isGenerating ? 'Refreshing...' : 'Refresh Preview'}
            </button>
          </div>
          <iframe
            src={pdfUrl}
            className="w-full h-[800px] border-0"
            title="Certificate Preview"
          />
        </div>
      )}

      {/* Loading state for preview */}
      {showPreview && !pdfUrl && canGeneratePDF && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-100 px-4 py-2 border-b border-slate-200">
            <p className="text-xs font-bold text-slate-600">Certificate Preview</p>
          </div>
          <div className="h-[400px] flex items-center justify-center">
            <div className="flex items-center gap-2 text-slate-500">
              <Loader2 className="size-5 animate-spin" />
              <span className="text-sm">Generating preview...</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default PDFPreviewSection
