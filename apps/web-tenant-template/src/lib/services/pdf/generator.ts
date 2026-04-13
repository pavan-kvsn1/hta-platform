/**
 * Server-side PDF generation for signed certificates.
 *
 * Uses the same two-pass approach as the client-side pdf-two-pass.ts,
 * but works with Buffers instead of Blobs for Node.js compatibility.
 */

import React from 'react'
import { prisma } from '@/lib/prisma'
import { CertificateFormData, ParameterBin } from '@/lib/stores/certificate-store'
import { PDFSignatureData, SigningMetadata, parseUserAgent } from '@/components/pdf/pdf-utils'
import { safeJsonParse } from '@/lib/utils/safe-json'

// Binary search bounds for multiplier
const MIN_MULTIPLIER = 0.75
const MAX_MULTIPLIER = 1.47
const MULTIPLIER_STEP = 0.02

/**
 * Collect a Node.js ReadableStream into a Buffer.
 * @react-pdf/renderer's pdf().toBuffer() returns a ReadableStream, not a Buffer.
 */
async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = []
  return new Promise((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}

/**
 * Extract page count from PDF buffer by parsing the PDF structure
 */
export function getPageCountFromBuffer(buffer: Buffer): number {
  const text = buffer.toString('latin1')
  const match = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/)
  if (match) {
    return parseInt(match[1], 10)
  }

  // Fallback: count /Type /Page occurrences (individual pages)
  const pageMatches = text.match(/\/Type\s*\/Page[^s]/g)
  if (pageMatches) {
    return pageMatches.length
  }

  return 1
}

/**
 * Fetch certificate data from DB and transform to CertificateFormData + signatures.
 * Consolidates the logic from the customer certificate route's getFullCertificateData().
 */
export async function fetchCertificateForPDF(certificateId: string): Promise<{
  formData: CertificateFormData
  signatures: PDFSignatureData | undefined
}> {
  const certificate = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: {
      parameters: {
        include: {
          results: {
            orderBy: { pointNumber: 'asc' },
          },
        },
        orderBy: { sortOrder: 'asc' },
      },
      masterInstruments: true,
      createdBy: {
        select: { id: true, name: true, email: true },
      },
    },
  })

  if (!certificate) {
    throw new Error(`Certificate not found: ${certificateId}`)
  }

  // Fetch signature records
  const dbSignatures = await prisma.signature.findMany({
    where: { certificateId },
    orderBy: { signedAt: 'desc' },
  })

  // Fetch signing evidence for metadata - filter by current revision
  const signingEvidence = await prisma.signingEvidence.findMany({
    where: {
      certificateId,
      revision: certificate.currentRevision,
    },
    orderBy: { sequenceNumber: 'asc' },
  })

  // Helper to extract metadata from signing evidence
  const getMetadataForSignature = (signatureId: string | null, signerType: string): SigningMetadata | undefined => {
    // First try to match by signatureId
    let evidence = signatureId
      ? signingEvidence.find(e => e.signatureId === signatureId)
      : null

    // Fallback: match by event type
    if (!evidence) {
      const eventTypeMap: Record<string, string> = {
        'ASSIGNEE': 'ASSIGNEE_SIGNED',
        'REVIEWER': 'REVIEWER_SIGNED',
        'ADMIN': 'ADMIN_SIGNED',
        'CUSTOMER': 'CUSTOMER_SIGNED',
      }
      evidence = signingEvidence.find(e => e.eventType === eventTypeMap[signerType])
    }

    if (!evidence) return undefined

    const parsed = safeJsonParse<Record<string, string>>(evidence.evidence, {})
    if (Object.keys(parsed).length === 0) {
      return { signedAt: evidence.createdAt.toISOString() }
    }
    return {
      signedAt: parsed.serverTimestamp || evidence.createdAt.toISOString(),
      ipAddress: parsed.ipAddress,
      timezone: parsed.timezone,
      deviceInfo: parseUserAgent(parsed.userAgent || ''),
    }
  }

  // Helper to check if signature has evidence for current revision
  const hasEvidenceForCurrentRevision = (signatureId: string, signerType: string): boolean => {
    const eventTypeMap: Record<string, string> = {
      'ASSIGNEE': 'ASSIGNEE_SIGNED',
      'REVIEWER': 'REVIEWER_SIGNED',
      'ADMIN': 'ADMIN_SIGNED',
      'CUSTOMER': 'CUSTOMER_SIGNED',
    }
    return signingEvidence.some(e =>
      e.signatureId === signatureId || e.eventType === eventTypeMap[signerType]
    )
  }

  const assigneeSig = dbSignatures.find(s => s.signerType === 'ASSIGNEE')
  const reviewerSig = dbSignatures.find(s => s.signerType === 'REVIEWER')
  const adminSig = dbSignatures.find(s => s.signerType === 'ADMIN')
  const customerSig = dbSignatures.find(s => s.signerType === 'CUSTOMER')

  // Only include signatures that have evidence for the current revision
  const validAssigneeSig = assigneeSig && hasEvidenceForCurrentRevision(assigneeSig.id, 'ASSIGNEE') ? assigneeSig : null
  const validReviewerSig = reviewerSig && hasEvidenceForCurrentRevision(reviewerSig.id, 'REVIEWER') ? reviewerSig : null
  const validAdminSig = adminSig && hasEvidenceForCurrentRevision(adminSig.id, 'ADMIN') ? adminSig : null
  const validCustomerSig = customerSig && hasEvidenceForCurrentRevision(customerSig.id, 'CUSTOMER') ? customerSig : null

  const signatures: PDFSignatureData | undefined = (validAssigneeSig || validReviewerSig || validAdminSig || validCustomerSig) ? {
    ...(validAssigneeSig ? {
      engineer: {
        name: validAssigneeSig.signerName.toUpperCase(),
        image: validAssigneeSig.signatureData,
        signatureId: validAssigneeSig.id,
        metadata: getMetadataForSignature(validAssigneeSig.id, 'ASSIGNEE'),
      }
    } : {}),
    ...(validReviewerSig ? {
      hod: {
        name: validReviewerSig.signerName.toUpperCase(),
        image: validReviewerSig.signatureData,
        signatureId: validReviewerSig.id,
        metadata: getMetadataForSignature(validReviewerSig.id, 'REVIEWER'),
      }
    } : {}),
    ...(validAdminSig ? {
      admin: {
        name: validAdminSig.signerName.toUpperCase(),
        image: validAdminSig.signatureData,
        signatureId: validAdminSig.id,
        metadata: getMetadataForSignature(validAdminSig.id, 'ADMIN'),
      }
    } : {}),
    ...(validCustomerSig ? {
      customer: {
        name: validCustomerSig.signerName.toUpperCase(),
        companyName: certificate.customerName || '',
        email: validCustomerSig.signerEmail,
        image: validCustomerSig.signatureData,
        signedAt: validCustomerSig.signedAt.toISOString(),
        signatureId: validCustomerSig.id,
        metadata: getMetadataForSignature(validCustomerSig.id, 'CUSTOMER'),
      }
    } : {}),
  } : undefined

  // Transform to CertificateFormData format
  const formData: CertificateFormData = {
    certificateNumber: certificate.certificateNumber,
    status: certificate.status,
    lastSaved: certificate.updatedAt,

    // Section 1: Summary
    calibratedAt: certificate.calibratedAt || 'LAB',
    srfNumber: certificate.srfNumber || '',
    srfDate: certificate.srfDate?.toISOString().split('T')[0] || '',
    dateOfCalibration: certificate.dateOfCalibration?.toISOString().split('T')[0] || '',
    calibrationTenure: certificate.calibrationTenure || 12,
    dueDateAdjustment: certificate.dueDateAdjustment || 0,
    calibrationDueDate: certificate.calibrationDueDate?.toISOString().split('T')[0] || '',
    dueDateNotApplicable: certificate.dueDateNotApplicable || false,
    customerName: certificate.customerName || '',
    customerAddress: certificate.customerAddress || '',

    // Section 2: UUC Details
    uucDescription: certificate.uucDescription || '',
    uucMake: certificate.uucMake || '',
    uucModel: certificate.uucModel || '',
    uucSerialNumber: certificate.uucSerialNumber || '',
    uucInstrumentId: certificate.uucInstrumentId || '',
    uucLocationName: certificate.uucLocationName || '',
    uucMachineName: certificate.uucMachineName || '',

    // Parameters with results
    parameters: certificate.parameters.map((param) => ({
      id: param.id,
      parameterName: param.parameterName || '',
      parameterUnit: param.parameterUnit || '',
      rangeMin: param.rangeMin || '',
      rangeMax: param.rangeMax || '',
      rangeUnit: param.rangeUnit || '',
      operatingMin: param.operatingMin || '',
      operatingMax: param.operatingMax || '',
      operatingUnit: param.operatingUnit || '',
      leastCountValue: param.leastCountValue || '',
      leastCountUnit: param.leastCountUnit || '',
      accuracyValue: param.accuracyValue || '',
      accuracyUnit: param.accuracyUnit || '',
      accuracyType: param.accuracyType || 'ABSOLUTE',
      requiresBinning: param.requiresBinning || false,
      bins: safeJsonParse<ParameterBin[]>(param.bins, []),
      errorFormula: param.errorFormula || 'A-B',
      showAfterAdjustment: param.showAfterAdjustment || false,
      masterInstrumentId: param.masterInstrumentId ? parseInt(param.masterInstrumentId) : null,
      sopReference: param.sopReference || '',
      results: param.results.map((result) => ({
        id: result.id,
        pointNumber: result.pointNumber,
        standardReading: result.standardReading || '',
        beforeAdjustment: result.beforeAdjustment || '',
        afterAdjustment: result.afterAdjustment || '',
        errorObserved: result.errorObserved,
        isOutOfLimit: result.isOutOfLimit || false,
      })),
    })),

    // Section 3: Master Instruments
    masterInstruments: certificate.masterInstruments.map((mi) => ({
      id: mi.id,
      masterInstrumentId: parseInt(mi.masterInstrumentId) || 0,
      category: mi.category || '',
      description: mi.description || '',
      make: mi.make || '',
      model: mi.model || '',
      assetNo: mi.assetNo || '',
      serialNumber: mi.serialNumber || '',
      calibratedAt: mi.calibratedAt || '',
      reportNo: mi.reportNo || '',
      calibrationDueDate: mi.calibrationDueDate || '',
      isExpired: false,
      isExpiringSoon: false,
    })),

    // Section 4: Environmental Conditions
    ambientTemperature: certificate.ambientTemperature || '',
    relativeHumidity: certificate.relativeHumidity || '',

    // Section 6: Remarks
    calibrationStatus: safeJsonParse<string[]>(certificate.calibrationStatus, []),
    stickerOldRemoved: certificate.stickerOldRemoved || null,
    stickerNewAffixed: certificate.stickerNewAffixed || null,
    statusNotes: certificate.statusNotes || '',

    // Section 7: Conclusion Statements
    selectedConclusionStatements: safeJsonParse<string[]>(certificate.selectedConclusionStatements, []),
    additionalConclusionStatement: certificate.additionalConclusionStatement || '',

    engineerNotes: '',
  } as CertificateFormData

  return { formData, signatures }
}

/**
 * Generate a signed PDF for a certificate.
 * Uses two-pass rendering with binary search for optimal spacing.
 * Returns a Buffer containing the final PDF.
 */
export async function generateSignedPDF(certificateId: string): Promise<Buffer> {
  const { formData, signatures } = await fetchCertificateForPDF(certificateId)

  // Dynamic imports
  const [pdfRenderer, pdfDoc] = await Promise.all([
    import('@react-pdf/renderer'),
    import('@/components/pdf/CalibrationCertificatePDF'),
  ])

  // Helper to render a PDF element to Buffer
  const renderToBuffer = async (multiplier: number): Promise<Buffer> => {
    const element = React.createElement(pdfDoc.CalibrationCertificatePDF, {
      data: formData,
      spacingMultiplier: multiplier,
      signatures,
    })
    const stream = await pdfRenderer.pdf(element as any).toBuffer()
    return streamToBuffer(stream)
  }

  // Pass 1: Generate with default multiplier to get baseline page count
  const pass1Buffer = await renderToBuffer(1.0)
  const pass1PageCount = getPageCountFromBuffer(pass1Buffer)

  // Binary search for optimal multiplier that fills pages without adding more
  let low = 1.0
  let high = MAX_MULTIPLIER
  let bestBuffer = pass1Buffer

  while (high - low > MULTIPLIER_STEP) {
    const mid = (low + high) / 2
    const testBuffer = await renderToBuffer(mid)
    const testPageCount = getPageCountFromBuffer(testBuffer)

    if (testPageCount === pass1PageCount) {
      bestBuffer = testBuffer
      low = mid
    } else {
      high = mid
    }
  }

  return bestBuffer
}
