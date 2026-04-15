/**
 * Two-Pass PDF Generation
 *
 * Pass 1: Generate PDF with default spacing (multiplier = 1.0)
 * Parse: Analyze the PDF to measure actual content vs available space
 * Pass 2: Regenerate with adjusted spacing to fill the page
 */

import React from 'react'
import { CertificateFormData } from '@/lib/stores/certificate-store'
import { PDFSignatureData } from './pdf-utils'

// Binary search bounds for multiplier
const _MIN_MULTIPLIER = 0.75
const MAX_MULTIPLIER = 1.47 // Cap at 50% expansion
const MULTIPLIER_STEP = 0.02

interface TwoPassResult {
  blob: Blob
  pageCount: number
  multiplier: number
  iterations: number
}

/**
 * Extract page count from PDF binary by parsing the PDF structure
 * Looks for /Type /Pages and /Count N pattern
 */
async function getPageCountFromPDF(blob: Blob): Promise<number> {
  const arrayBuffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  const text = new TextDecoder('latin1').decode(bytes)

  // Look for /Type /Pages followed by /Count N
  // This is in the Pages dictionary of the PDF
  const pagesMatch = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)
  if (pagesMatch) {
    return parseInt(pagesMatch[1], 10)
  }

  // Fallback: count /Type /Page occurrences (individual pages)
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g)
  if (pageMatches) {
    return pageMatches.length
  }

  // Default to 1 if we can't determine
  return 1
}

/**
 * Generate PDF with optimal spacing using two-pass approach
 */
export async function generatePDFWithOptimalSpacing(
  formData: CertificateFormData,
  signatures?: PDFSignatureData
): Promise<TwoPassResult> {
  console.log('generatePDFWithOptimalSpacing called')

  // Dynamic imports
  console.log('Loading PDF modules...')
  const [pdfRenderer, pdfDoc] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./CalibrationCertificatePDF'),
  ])
  console.log('PDF modules loaded')

  let iterations = 0
  let bestBlob: Blob | null = null
  let bestMultiplier = 1.0
  let bestPageCount = Infinity

  // Pass 1: Generate with default multiplier to get baseline
  console.log('Pass 1: Generating with multiplier 1.0...')
  const pass1Element = React.createElement(pdfDoc.CalibrationCertificatePDF, {
    data: formData,
    spacingMultiplier: 1.0,
    signatures,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pass1Blob = await (pdfRenderer.pdf(pass1Element as any).toBlob())
  iterations++
  console.log('Pass 1: PDF generated, size:', pass1Blob.size)

  // Parse Pass 1 to get page count
  const pass1PageCount = await getPageCountFromPDF(pass1Blob)
  console.log('Pass 1: Page count:', pass1PageCount)

  // Goal: Find the MAXIMUM multiplier that keeps the same page count
  // This fills the last page as much as possible without adding more pages

  let low = 1.0
  let high = MAX_MULTIPLIER
  bestBlob = pass1Blob
  bestMultiplier = 1.0
  bestPageCount = pass1PageCount

  console.log(`Binary search: expanding from 1.0 to ${MAX_MULTIPLIER} while keeping ${pass1PageCount} pages`)

  while (high - low > MULTIPLIER_STEP) {
    const mid = (low + high) / 2

    const testElement = React.createElement(pdfDoc.CalibrationCertificatePDF, {
      data: formData,
      spacingMultiplier: mid,
      signatures,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const testBlob = await (pdfRenderer.pdf(testElement as any).toBlob())
    iterations++

    const testPageCount = await getPageCountFromPDF(testBlob)
    console.log(`  Testing multiplier ${mid.toFixed(2)}: ${testPageCount} pages`)

    if (testPageCount === pass1PageCount) {
      // Same page count - this is good, try higher
      bestBlob = testBlob
      bestMultiplier = mid
      low = mid
    } else {
      // More pages - try lower
      high = mid
    }
  }

  return {
    blob: bestBlob!,
    pageCount: bestPageCount,
    multiplier: bestMultiplier,
    iterations,
  }
}

/**
 * Simple single-pass generation (for comparison or fallback)
 */
export async function generatePDFSimple(
  formData: CertificateFormData,
  multiplier: number = 1.0,
  signatures?: PDFSignatureData
): Promise<Blob> {
  const [pdfRenderer, pdfDoc] = await Promise.all([
    import('@react-pdf/renderer'),
    import('./CalibrationCertificatePDF'),
  ])

  const element = React.createElement(pdfDoc.CalibrationCertificatePDF, {
    data: formData,
    spacingMultiplier: multiplier,
    signatures,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return await (pdfRenderer.pdf(element as any).toBlob())
}
