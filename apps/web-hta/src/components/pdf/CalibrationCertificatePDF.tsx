import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
  Font,
} from '@react-pdf/renderer'

// ============================================================================
// FONT REGISTRATION - Using Roboto from unpkg (fontsource)
// ============================================================================
Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-400-normal.woff',
      fontWeight: 'normal',
    },
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-400-italic.woff',
      fontWeight: 'normal',
      fontStyle: 'italic',
    },
    {
      src: 'https://unpkg.com/@fontsource/roboto@5.0.8/files/roboto-latin-700-normal.woff',
      fontWeight: 'bold',
    },
  ],
})

// Disable hyphenation to prevent word breaks
Font.registerHyphenationCallback((word) => [word])

// HTA Brand Blue Color
const HTA_BLUE = '#0099CC'
import { CertificateFormData, ACCURACY_TYPE_CONFIG } from '@/lib/stores/certificate-store'
import { HTA_LOGO_BASE64 } from './logo-base64'
import { HTA_WATERMARK_BASE64 } from './watermark-base64'
import {
  formatDateDDMMYYYY,
  padSerialNumber,
  getPrecisionFromLeastCount,
  formatWithPrecision,
  getConclusionText,
  COMPANY_INFO,
  SIGNATORIES,
  FOOTER_NOTES,
  VALIDITY_STATEMENT,
  CUSTOMER_ACKNOWLEDGMENT_TEXT,
  PDFSignatureData,
} from './pdf-utils'

// Format ISO date string to readable format: "09 Feb 2026, 14:30 IST"
function formatSigningDateTime(isoString: string | undefined, timezone?: string): string {
  if (!isoString) return ''
  try {
    const date = new Date(isoString)
    const day = date.getDate().toString().padStart(2, '0')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const month = months[date.getMonth()]
    const year = date.getFullYear()
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')

    // Extract timezone abbreviation if available
    let tzAbbr = ''
    if (timezone) {
      // Convert timezone to abbreviation (e.g., "Asia/Kolkata" -> "IST")
      const tzMap: Record<string, string> = {
        'Asia/Kolkata': 'IST',
        'America/New_York': 'EST',
        'America/Los_Angeles': 'PST',
        'Europe/London': 'GMT',
        'UTC': 'UTC',
      }
      tzAbbr = tzMap[timezone] || timezone.split('/').pop() || ''
    }

    return `${day} ${month} ${year}, ${hours}:${minutes}${tzAbbr ? ' ' + tzAbbr : ''}`
  } catch {
    return ''
  }
}
import {
  planLayout,
  getParameterRenderOrder,
  isSinglePage,
  shouldBreakBefore,
} from './pdf-layout'

// ============================================================================
// STYLES - Balanced layout with proper spacing and alignment
// ============================================================================
const styles = StyleSheet.create({
  // Page
  page: {
    paddingTop: 115, // Space for fixed header (letterhead ~70 + title ~25 + gap)
    paddingBottom: 60, // Space for fixed footer only (~45pt + buffer)
    paddingHorizontal: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    lineHeight: 1.15,
  },

  // Watermark - centered on every page (A4: 595.28 x 841.89 points)
  watermark: {
    position: 'absolute',
    top: 270, // (841.89 - 300) / 2 ≈ 270
    left: 148, // (595.28 - 300) / 2 ≈ 148
    width: 300,
    height: 300,
    opacity: 0.15,
  },

  // Section A: Letterhead - fixed at top of every page (3-column layout)
  letterhead: {
    position: 'absolute',
    top: 15,
    left: 40,
    right: 40,
    flexDirection: 'row',
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: HTA_BLUE,
  },
  logo: {
    width: 60,
    height: 60,
  },
  companyInfo: {
    flex: 1,
    marginLeft: 8,
    justifyContent: 'center',
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Roboto',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 7,
    color: HTA_BLUE,
  },
  certification: {
    fontSize: 9,
    fontFamily: 'Roboto',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 3,
    color: HTA_BLUE,
  },
  addressLine: {
    fontSize: 9,
    fontFamily: 'Roboto',
    textAlign: 'center',
    color: HTA_BLUE,
    lineHeight: 1.3,
  },
  contactLine: {
    fontSize: 9,
    fontFamily: 'Roboto',
    textAlign: 'center',
    color: HTA_BLUE,
    marginTop: 2,
  },
  // Phone numbers column on the right
  phoneColumn: {
    width: 95,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  phoneLine: {
    fontSize: 9,
    fontFamily: 'Roboto',
    color: HTA_BLUE,
    textAlign: 'right',
    marginBottom: 1,
  },

  // Section B: Document Title - fixed below letterhead
  titleSection: {
    position: 'absolute',
    top: 85, // Below letterhead (15 + 60 logo + 10 gap)
    left: 40,
    right: 40,
    paddingVertical: 4,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: 'bold',
    textAlign: 'center',
    color: HTA_BLUE,
  },
  titleReview: {
    fontSize: 14,
    fontFamily: 'Roboto',
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#000000',
  },
  // Absolutely positioned page number (repeats on each page)
  // Positioned below the letterhead to avoid overlapping phone numbers
  pageNumber: {
    position: 'absolute',
    top: 70,
    right: 40,
    fontSize: 8,
    color: '#666',
  },

  // Section C: Customer Info Table (4-column paired: label-value-label-value)
  customerTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 18,
  },
  customerRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 18,
  },
  customerLabelCell: {
    width: '20%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerValueCell: {
    width: '30%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerLabelCellRight: {
    width: '18%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  customerValueCellRight: {
    width: '32%',
    padding: 3,
    justifyContent: 'center',
  },
  customerLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  customerValue: {
    fontSize: 8.5,
  },

  // Section D: UUC Details Table (4-column paired)
  uucTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 10,
  },
  uucRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  uucRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  uucLabelCell: {
    width: '18%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucValueCell: {
    width: '32%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucLabelCellRight: {
    width: '15%',
    padding: 3,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  uucValueCellRight: {
    width: '35%',
    padding: 3,
    justifyContent: 'center',
  },
  uucLabel: {
    fontSize: 8.5,
    fontFamily: 'Helvetica-Bold',
  },
  uucValue: {
    fontSize: 8.5,
  },

  // Section E & F: Environmental & SOP Reference
  infoLine: {
    flexDirection: 'row',
    marginBottom: 5,
    paddingVertical: 3,
  },
  infoLabel: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    width: 180,
  },
  infoValue: {
    fontSize: 9.5,
    flex: 1,
  },

  // Section G: Calibration Data Table
  calibrationSection: {
    marginBottom: 12,
  },
  calibrationHeader: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
    padding: 4,
  },
  calibrationTable: {
    borderWidth: 1,
    borderColor: '#000',
  },
  calibrationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
  },
  calibrationSubHeaderRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
  },
  calibrationDataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  calibrationDataRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  calCell: {
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  calCellLast: {
    padding: 2,
    justifyContent: 'center',
  },
  // For merged cell appearance (no bottom border)
  calCellMerged: {
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
    borderBottomWidth: 0,
  },
  calHeaderText: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'center',
  },
  calSubHeaderText: {
    fontSize: 8,
    textAlign: 'center',
  },
  calCellText: {
    fontSize: 8,
    textAlign: 'center',
  },
  calCellTextLeft: {
    fontSize: 8,
    textAlign: 'left',
  },

  // Section H: Master Instruments Table (4-column paired like UUC)
  masterSection: {
    marginBottom: 8,
  },
  masterHeader: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  masterTable: {
    borderWidth: 1,
    borderColor: '#000',
    marginBottom: 4,
  },
  masterRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    minHeight: 14,
  },
  masterRowLast: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 14,
  },
  masterLabelCell: {
    width: '18%',
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterValueCell: {
    width: '32%',
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterLabelCellRight: {
    width: '18%',
    padding: 2,
    borderRightWidth: 0.5,
    borderRightColor: '#000',
    justifyContent: 'center',
  },
  masterValueCellRight: {
    width: '32%',
    padding: 2,
    justifyContent: 'center',
  },
  masterLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },
  masterValue: {
    fontSize: 8,
  },

  // Section I: Conclusion
  conclusionSection: {
    marginBottom: 8,
  },
  conclusionHeader: {
    flexDirection: 'row',
  },
  conclusionLabel: {
    fontSize: 9.5,
    fontFamily: 'Helvetica-Bold',
    width: 70,
  },
  conclusionColon: {
    fontSize: 9.5,
    width: 10,
  },
  conclusionStatements: {
    flex: 1,
  },
  conclusionItem: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  conclusionNumber: {
    fontSize: 9.5,
    width: 18,
  },
  conclusionText: {
    fontSize: 9.5,
    flex: 1,
  },

  // Section J: Validity Statement
  validitySection: {
    marginBottom: 2,
    paddingVertical: 2,
  },
  validityText: {
    fontSize: 9.5,
    fontStyle: 'italic',
  },

  // Section K: Signature Block (3-column)
  signatureSection: {
    marginTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    paddingTop: 4,
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  signatureColumn: {
    width: '32%',
  },
  signatureLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  signatureName: {
    fontSize: 9,
    marginBottom: 20,
  },
  signatureBox: {
    height: 22,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    borderBottomStyle: 'dashed',
    marginBottom: 3,
  },
  signatureImage: {
    height: 42,
    width: 100,
    objectFit: 'contain' as const,
    marginBottom: 3,
  },
  // Signing metadata (Layer 2 evidence)
  signatureMetadata: {
    marginTop: 1,
    paddingTop: 1,
    borderTopWidth: 0.5,
    borderTopColor: '#ddd',
    borderTopStyle: 'dotted' as const,
  },
  signatureMetadataLine: {
    fontSize: 6,
    color: '#666',
    marginBottom: 1,
  },
  signatureId: {
    fontSize: 6,
    color: '#888',
    marginTop: 3,
  },
  signatureMetadataLabel: {
    fontFamily: 'Helvetica-Bold',
  },

  // Section M: Customer Acknowledgment (conditional)
  customerAckSection: {
    marginTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#000',
    borderBottomWidth: 0.5,
    borderBottomColor: '#000',
    paddingTop: 6,
    paddingBottom: 6,
  },
  customerAckTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  customerAckText: {
    fontSize: 8.5,
    marginBottom: 6,
    lineHeight: 1.3,
  },
  customerAckBody: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
  },
  customerAckSigBox: {
    width: 100,
    height: 50,
    borderWidth: 0.5,
    borderColor: '#999',
    marginRight: 12,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
  },
  customerAckSigImage: {
    width: 90,
    height: 44,
    objectFit: 'contain' as const,
  },
  customerAckDetails: {
    flex: 1,
    justifyContent: 'center' as const,
  },
  customerAckDetailLine: {
    fontSize: 8.5,
    marginBottom: 2,
  },
  customerAckDetailLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  customerAckSignatureId: {
    fontSize: 7,
    color: '#666',
    marginTop: 4,
  },

  // Section L: Footer Notes - fixed at bottom
  footerSection: {
    position: 'absolute',
    bottom: 12,
    left: 40,
    right: 40,
    borderTopWidth: 0.5,
    borderTopColor: '#ccc',
    paddingTop: 3,
  },
  footerNote: {
    fontSize: 7,
    marginBottom: 3,
    lineHeight: 1.3,
  },

  // Page continuation indicator
  continuedText: {
    fontSize: 10,
    fontStyle: 'italic',
    textAlign: 'right',
    color: '#666',
    marginTop: 5,
  },
})

// ============================================================================
// COMPONENT PROPS
// ============================================================================
interface CalibrationCertificatePDFProps {
  data: CertificateFormData
  spacingMultiplier?: number // Override from two-pass system (1.0 = default, >1 = expand, <1 = compress)
  signatures?: PDFSignatureData
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
export function CalibrationCertificatePDF({ data, spacingMultiplier: externalMultiplier, signatures }: CalibrationCertificatePDFProps) {
  // ========================================================================
  // LAYOUT PLANNING
  // ========================================================================
  const layoutPlan = planLayout(data)
  const parameterRenderOrder = getParameterRenderOrder(layoutPlan)
  const singlePage = isSinglePage(layoutPlan)

  // Reorder parameters based on layout plan (smallest tables first for better packing)
  const orderedParameters = parameterRenderOrder
    .map(id => data.parameters.find(p => p.id === id))
    .filter(Boolean) as typeof data.parameters

  // If no reordering happened (no IDs matched), use original order
  const parametersToRender = orderedParameters.length > 0 ? orderedParameters : data.parameters

  // Use external multiplier if provided (from two-pass system), otherwise use layout plan
  const spacingMultiplier = externalMultiplier ?? (singlePage
    ? layoutPlan.pages[0]?.spacingMultiplier || 1
    : 1)

  console.log('=== PDF RENDER ===')
  console.log('External multiplier:', externalMultiplier)
  console.log('Final spacingMultiplier:', spacingMultiplier)
  console.log('Layout strategy:', layoutPlan.strategy)
  console.log('Total pages planned:', layoutPlan.totalPages)

  // Dynamic margin calculator (for margins between sections)
  const dynamicMargin = (base: number) => {
    const result = Math.round(base * spacingMultiplier)
    // Log first few calls to see values
    if (base === 10 || base === 8) {
      console.log(`dynamicMargin(${base}) = ${result}`)
    }
    return result
  }

  // Dynamic height calculator (for row minHeight - compress when needed)
  const dynamicHeight = (base: number) => {
    const result = Math.round(base * spacingMultiplier)
    if (base === 14 || base === 18) {
      console.log(`dynamicHeight(${base}) = ${result}`)
    }
    return result
  }

  // ========================================================================
  // HELPER FUNCTIONS
  // ========================================================================

  // Helper to get least count from parameter (handles binning with range context)
  const getLeastCount = (p: typeof data.parameters[0]): string[] => {
    if (p.requiresBinning && p.bins.length > 0) {
      // Return array of "range: value" strings for each bin (using "to" to avoid confusion with negatives)
      return p.bins
        .filter(b => b.leastCount)
        .map(b => `${b.binMin} to ${b.binMax} ${p.parameterUnit}: ${b.leastCount} ${p.parameterUnit}`)
    }
    return p.leastCountValue ? [`${p.leastCountValue} ${p.parameterUnit}`] : []
  }

  // Helper to get accuracy from parameter (handles binning with range context)
  const getAccuracy = (p: typeof data.parameters[0]): string[] => {
    const accuracyTypeLabel = ACCURACY_TYPE_CONFIG[p.accuracyType]?.shortLabel || ''
    const unit = p.accuracyType === 'ABSOLUTE' ? p.parameterUnit : accuracyTypeLabel

    if (p.requiresBinning && p.bins.length > 0) {
      // Return array of "range: value" strings for each bin (using "to" to avoid confusion with negatives)
      return p.bins
        .filter(b => b.accuracy)
        .map(b => `${b.binMin} to ${b.binMax} ${p.parameterUnit}: ± ${b.accuracy} ${unit}`)
    }
    return p.accuracyValue ? [`± ${p.accuracyValue} ${unit}`] : []
  }

  // Derive combined values from parameters (as arrays for multi-line rendering)
  const leastCountLines = data.parameters
    .flatMap(getLeastCount)
    .filter(Boolean)

  const operatingRangeStr = data.parameters
    .filter(p => p.operatingMin && p.operatingMax)
    .map(p => `${p.operatingMin} to ${p.operatingMax} ${p.parameterUnit}`)
    .join(', ') || '-'

  const accuracyLines = data.parameters
    .flatMap(getAccuracy)
    .filter(Boolean)

  // Get unique SOP references from parameters
  const sopReferences = data.parameters
    .filter(p => p.sopReference)
    .map(p => p.sopReference)
    .filter((v, i, a) => a.indexOf(v) === i)

  // Check if any calibration point has failed (isOutOfLimit)
  // If any point fails, due date should be "Not Applicable"
  const hasFailedCalibrationPoints = data.parameters.some(p =>
    p.results.some(r => r.isOutOfLimit === true)
  )

  // Determine document title based on authorization status
  // Only show "Calibration Certificate" (blue) when fully authorized
  // Otherwise show "Data Sheet Calibration" (black) for review
  const isAuthorized = data.status === 'AUTHORIZED'
  const documentTitle = isAuthorized ? 'Calibration Certificate' : 'Data Sheet Calibration'

  return (
    <Document>
      <Page size="A4" style={styles.page} wrap>
        {/* ================================================================ */}
        {/* WATERMARK - centered background logo on every page */}
        {/* ================================================================ */}
        <Image style={styles.watermark} src={HTA_WATERMARK_BASE64} fixed />

        {/* ================================================================ */}
        {/* SECTION A: LETTERHEAD (fixed - repeats on each page) */}
        {/* 3-column layout: Logo | Company Info (center) | Phone Numbers (right) */}
        {/* ================================================================ */}
        <View style={styles.letterhead} fixed>
          <Image style={styles.logo} src={HTA_LOGO_BASE64} />
          <View style={styles.companyInfo}>
            <Text style={styles.companyName}>{COMPANY_INFO.name}</Text>
            <Text style={styles.certification}>{COMPANY_INFO.certification}</Text>
            <Text style={styles.addressLine}>{COMPANY_INFO.address}</Text>
            <Text style={styles.contactLine}>{COMPANY_INFO.webEmail}</Text>
          </View>
          <View style={styles.phoneColumn}>
            {COMPANY_INFO.contact.phone.map((phone, idx) => (
              <Text key={idx} style={styles.phoneLine}>
                {idx === 0 ? 'Tel: ' : '      '}{phone}
              </Text>
            ))}
            <Text style={styles.phoneLine}>
              Mob: {COMPANY_INFO.contact.mobile}
            </Text>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION B: DOCUMENT TITLE (fixed - repeats on each page) */}
        {/* Blue for authorized "Calibration Certificate", Black for "Data Sheet Calibration" */}
        {/* ================================================================ */}
        <View style={styles.titleSection} fixed>
          <Text style={isAuthorized ? styles.title : styles.titleReview}>{documentTitle}</Text>
        </View>

        {/* Page number - absolutely positioned (fixed - repeats on each page) */}
        <Text
          style={styles.pageNumber}
          fixed
          render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
        />

        {/* ================================================================ */}
        {/* SECTION C: CUSTOMER INFO TABLE (4-column paired) */}
        {/* ================================================================ */}
        <View style={[styles.customerTable, { marginBottom: dynamicMargin(10) }]} wrap={false}>
          {/* Row 1: Customer Name & Address / Date of Calibration */}
          <View style={[styles.customerRow, { minHeight: dynamicHeight(18) }]}>
            <View style={styles.customerLabelCell}>
              <Text style={styles.customerLabel}>Customer Name{'\n'}& Address</Text>
            </View>
            <View style={styles.customerValueCell}>
              <Text style={styles.customerValue}>{data.customerName || '-'}</Text>
              {data.customerAddress && (
                <Text style={styles.customerValue}>{data.customerAddress}</Text>
              )}
            </View>
            <View style={styles.customerLabelCellRight}>
              <Text style={styles.customerLabel}>Date of{'\n'}Calibration</Text>
            </View>
            <View style={styles.customerValueCellRight}>
              <Text style={styles.customerValue}>{formatDateDDMMYYYY(data.dateOfCalibration)}</Text>
            </View>
          </View>
          {/* Row 2: Certificate No. / Recommended Cal Due */}
          <View style={[styles.customerRowLast, { minHeight: dynamicHeight(18) }]}>
            <View style={styles.customerLabelCell}>
              <Text style={styles.customerLabel}>Certificate No.</Text>
            </View>
            <View style={styles.customerValueCell}>
              <Text style={styles.customerValue}>{data.certificateNumber || '-'}</Text>
            </View>
            <View style={styles.customerLabelCellRight}>
              <Text style={styles.customerLabel}>Recommended{'\n'}Cal Due</Text>
            </View>
            <View style={styles.customerValueCellRight}>
              <Text style={styles.customerValue}>
                {(hasFailedCalibrationPoints || data.dueDateNotApplicable) ? 'Not Applicable' : formatDateDDMMYYYY(data.calibrationDueDate)}
              </Text>
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION D: UUC DETAILS TABLE (4-column paired) */}
        {/* ================================================================ */}
        <View style={[styles.uucTable, { marginBottom: dynamicMargin(10) }]} wrap={false}>
          {/* Row 1: UUC / Make */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Unit Under{'\n'}Calibration [UUC]</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucDescription || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Make</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.uucMake || '-'}</Text>
            </View>
          </View>

          {/* Row 2: Location Name / Model */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Location Name</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucLocationName || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Model</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.uucModel || '-'}</Text>
            </View>
          </View>

          {/* Row 3: Machine Name / Id. No. */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Machine Name</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{data.uucMachineName || '-'}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Id. No.</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.uucSerialNumber || data.uucInstrumentId || '-'}</Text>
            </View>
          </View>

          {/* Row 4: Least Count / Accuracy (multi-line for binned parameters) */}
          <View style={[styles.uucRow, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Least Count</Text>
            </View>
            <View style={styles.uucValueCell}>
              {leastCountLines.length > 0 ? (
                leastCountLines.map((line, idx) => (
                  <Text key={idx} style={styles.uucValue}>{line}</Text>
                ))
              ) : (
                <Text style={styles.uucValue}>-</Text>
              )}
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Accuracy</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              {accuracyLines.length > 0 ? (
                accuracyLines.map((line, idx) => (
                  <Text key={idx} style={styles.uucValue}>{line}</Text>
                ))
              ) : (
                <Text style={styles.uucValue}>-</Text>
              )}
            </View>
          </View>

          {/* Row 5: Operating Range / Calibrated at */}
          <View style={[styles.uucRowLast, { minHeight: dynamicHeight(14) }]}>
            <View style={styles.uucLabelCell}>
              <Text style={styles.uucLabel}>Operating Range</Text>
            </View>
            <View style={styles.uucValueCell}>
              <Text style={styles.uucValue}>{operatingRangeStr}</Text>
            </View>
            <View style={styles.uucLabelCellRight}>
              <Text style={styles.uucLabel}>Calibrated at</Text>
            </View>
            <View style={styles.uucValueCellRight}>
              <Text style={styles.uucValue}>{data.calibratedAt === 'LAB' ? 'Lab' : 'Site'}</Text>
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION E: ENVIRONMENTAL CONDITION */}
        {/* ================================================================ */}
        <View style={[styles.infoLine, { marginBottom: dynamicMargin(5) }]} wrap={false}>
          <Text style={styles.infoLabel}>Environmental Condition :</Text>
          <Text style={styles.infoValue}>
            {data.ambientTemperature ? `${data.ambientTemperature} °C` : '-'}
            {data.relativeHumidity ? `, ${data.relativeHumidity} %RH` : ''}
          </Text>
        </View>

        {/* ================================================================ */}
        {/* SECTION F: CALIBRATION PROCEDURE REFERENCE */}
        {/* ================================================================ */}
        <View style={[styles.infoLine, { marginBottom: dynamicMargin(5) }]} wrap={false}>
          <Text style={styles.infoLabel}>Calibration procedure reference :</Text>
          <Text style={styles.infoValue}>
            {sopReferences.length > 0
              ? `HTA Cal Procedure ${sopReferences.join(', ')}`
              : '-'}
          </Text>
        </View>

        {/* ================================================================ */}
        {/* SECTION G: CALIBRATION DATA TABLES (per parameter) */}
        {/* Reordered based on layout plan for optimal page distribution */}
        {/* ================================================================ */}
        {parametersToRender.map((param, _paramIdx) => {
          const precision = getPrecisionFromLeastCount(param.leastCountValue)
          const rangeStr = param.rangeMin && param.rangeMax
            ? `${param.rangeMin} to ${param.rangeMax} ${param.parameterUnit}`
            : ''
          const _middleRowIdx = Math.floor(param.results.length / 2)
          const sectionId = `cal-table-${param.id}`
          const needsBreak = shouldBreakBefore(sectionId, layoutPlan)

          return (
            <View key={param.id} style={[styles.calibrationSection, { marginBottom: dynamicMargin(12) }]} wrap={false} break={needsBreak}>
              <View style={styles.calibrationTable}>
                {/* Header Row 1 */}
                <View style={styles.calibrationHeaderRow}>
                  <View style={[styles.calCell, { width: '8%' }]}>
                    <Text style={styles.calHeaderText}>Sl.</Text>
                    <Text style={styles.calHeaderText}>No.</Text>
                  </View>
                  <View style={[styles.calCell, { width: '20%' }]}>
                    <Text style={styles.calHeaderText}>Parameter &</Text>
                    <Text style={styles.calHeaderText}>Range</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calHeaderText}>Standard Meter</Text>
                    <Text style={styles.calHeaderText}>Reading (y)</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calHeaderText}>UUC Reading</Text>
                    <Text style={styles.calHeaderText}>(x)</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calHeaderText}>Error Observed</Text>
                    <Text style={styles.calHeaderText}>(±) z = (x-y)</Text>
                  </View>
                  <View style={[styles.calCellLast, { width: '18%' }]}>
                    <Text style={styles.calHeaderText}>Remarks</Text>
                  </View>
                </View>

                {/* Sub-header Row (units) */}
                <View style={styles.calibrationSubHeaderRow}>
                  <View style={[styles.calCell, { width: '8%' }]}>
                    <Text style={styles.calSubHeaderText}></Text>
                  </View>
                  <View style={[styles.calCell, { width: '20%' }]}>
                    <Text style={styles.calSubHeaderText}>{param.parameterName?.toUpperCase() || ''}</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                  </View>
                  <View style={[styles.calCell, { width: '18%' }]}>
                    <Text style={styles.calSubHeaderText}>{param.parameterUnit}</Text>
                  </View>
                  <View style={[styles.calCellLast, { width: '18%' }]}>
                    <Text style={styles.calSubHeaderText}></Text>
                  </View>
                </View>

                {/* Data section with merged Parameter & Range column */}
                <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
                  {/* Sl. No. column (individual cells per row) */}
                  <View style={{ width: '8%' }}>
                    {param.results.map((result, resultIdx) => {
                      const isLastRow = resultIdx === param.results.length - 1
                      return (
                        <View
                          key={`sl-${result.id}`}
                          style={[styles.calCell, {
                            width: '100%',
                            minHeight: dynamicHeight(14),
                            borderBottomWidth: isLastRow ? 0 : 0.5,
                            borderBottomColor: '#000',
                          }]}
                        >
                          <Text style={styles.calCellText}>{padSerialNumber(result.pointNumber)}</Text>
                        </View>
                      )
                    })}
                  </View>

                  {/* Merged Parameter & Range column (single cell spanning all rows) */}
                  <View style={[styles.calCell, { width: '20%', minHeight: param.results.length * dynamicHeight(14) }]}>
                    <Text style={styles.calCellText}>{rangeStr || '-'}</Text>
                  </View>

                  {/* Other data columns (individual cells per row) */}
                  <View style={{ width: '72%' }}>
                    {param.results.map((result, resultIdx) => {
                      const isLastRow = resultIdx === param.results.length - 1

                      return (
                        <View
                          key={result.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'stretch',
                            minHeight: dynamicHeight(14),
                            borderBottomWidth: isLastRow ? 0 : 0.5,
                            borderBottomColor: '#000',
                          }}
                        >
                          <View style={[styles.calCell, { width: '25%' }]}>
                            <Text style={styles.calCellText}>
                              {formatWithPrecision(result.standardReading, precision)}{result.isOutOfLimit ? '*' : ''}
                            </Text>
                          </View>
                          <View style={[styles.calCell, { width: '25%' }]}>
                            <Text style={styles.calCellText}>
                              {formatWithPrecision(result.beforeAdjustment, precision)}{result.isOutOfLimit ? '*' : ''}
                            </Text>
                          </View>
                          <View style={[styles.calCell, { width: '25%' }]}>
                            <Text style={styles.calCellText}>
                              {result.errorObserved !== null
                                ? `${formatWithPrecision(result.errorObserved, precision)}${result.isOutOfLimit ? '*' : ''}`
                                : '-'}
                            </Text>
                          </View>
                          <View style={[styles.calCellLast, { width: '25%' }]}>
                            <Text style={styles.calCellText}>
                              {result.errorObserved !== null
                                ? (result.isOutOfLimit ? 'Fail' : 'Pass')
                                : '-'}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              </View>
            </View>
          )
        })}

        {/* ================================================================ */}
        {/* SECTION H: MASTER INSTRUMENTS USED DETAILS (Table Format) */}
        {/* ================================================================ */}
        <View style={[styles.masterSection, { marginBottom: dynamicMargin(8) }]} wrap={false} break={shouldBreakBefore('master-instruments', layoutPlan)}>
          <Text style={[styles.masterHeader, { marginBottom: dynamicMargin(4) }]}>MASTER INSTRUMENTS USED DETAILS:-</Text>

          {data.masterInstruments
            .filter(m => m.masterInstrumentId)
            .map((master, _idx) => (
              <View key={master.id} style={styles.masterTable}>
                {/* Row 1: Inst. Description / Make */}
                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Inst. Description</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{master.description || '-'}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Make</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.make || '-'}</Text>
                  </View>
                </View>

                {/* Row 2: Model / Sl. No. */}
                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Model</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{master.model || '-'}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Sl. No.</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.serialNumber || '-'}</Text>
                  </View>
                </View>

                {/* Row 3: Calibration Due / Certificate No. */}
                <View style={[styles.masterRow, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Calibration Due</Text>
                  </View>
                  <View style={styles.masterValueCell}>
                    <Text style={styles.masterValue}>{formatDateDDMMYYYY(master.calibrationDueDate)}</Text>
                  </View>
                  <View style={styles.masterLabelCellRight}>
                    <Text style={styles.masterLabel}>Certificate No.</Text>
                  </View>
                  <View style={styles.masterValueCellRight}>
                    <Text style={styles.masterValue}>{master.reportNo || '-'}</Text>
                  </View>
                </View>

                {/* Row 4: Calibrated At (spans or paired with empty) */}
                <View style={[styles.masterRowLast, { minHeight: dynamicHeight(14) }]}>
                  <View style={styles.masterLabelCell}>
                    <Text style={styles.masterLabel}>Calibrated At</Text>
                  </View>
                  <View style={[styles.masterValueCell, { width: '82%', borderRightWidth: 0 }]}>
                    <Text style={styles.masterValue}>{master.calibratedAt || '-'}</Text>
                  </View>
                </View>
              </View>
            ))}
        </View>

        {/* ================================================================ */}
        {/* SECTION I: CONCLUSION (normal flow) */}
        {/* ================================================================ */}
        {(data.selectedConclusionStatements.length > 0 || data.additionalConclusionStatement) && (
          <View style={[styles.conclusionSection, { marginTop: dynamicMargin(8), marginBottom: dynamicMargin(8) }]} wrap={false}>
            {data.selectedConclusionStatements.map((statementKey, idx) => (
              <View key={idx} style={[styles.conclusionItem, { marginBottom: dynamicMargin(2) }]}>
                {idx === 0 ? (
                  <Text style={styles.conclusionLabel}>Conclusion</Text>
                ) : (
                  <View style={{ width: 70 }} />
                )}
                <Text style={styles.conclusionColon}>:</Text>
                <Text style={styles.conclusionNumber}>{idx + 1}.</Text>
                <Text style={styles.conclusionText}>{getConclusionText(statementKey)}</Text>
              </View>
            ))}
            {/* Additional custom conclusion statement */}
            {data.additionalConclusionStatement && (
              <View style={[styles.conclusionItem, { marginBottom: dynamicMargin(2) }]}>
                {data.selectedConclusionStatements.length === 0 ? (
                  <Text style={styles.conclusionLabel}>Conclusion</Text>
                ) : (
                  <View style={{ width: 70 }} />
                )}
                <Text style={styles.conclusionColon}>:</Text>
                <Text style={styles.conclusionNumber}>{data.selectedConclusionStatements.length + 1}.</Text>
                <Text style={styles.conclusionText}>{data.additionalConclusionStatement}</Text>
              </View>
            )}
          </View>
        )}

        {/* ================================================================ */}
        {/* SECTION J: VALIDITY STATEMENT (normal flow) */}
        {/* ================================================================ */}
        <View style={[styles.validitySection, { marginBottom: dynamicMargin(4) }]} wrap={false}>
          <Text style={styles.validityText}>{VALIDITY_STATEMENT}</Text>
        </View>

        {/* ================================================================ */}
        {/* SECTION K: SIGNATURE BLOCK - 3 columns: Engineer, Reviewer, Admin */}
        {/* ================================================================ */}
        <View style={[styles.signatureSection, { marginTop: dynamicMargin(4) }]} wrap={false}>
          <View style={styles.signatureRow}>
            {/* Column 1: Calibrated By (Engineer) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>CALIBRATED BY:</Text>
              {signatures?.engineer?.image ? (
                <Image src={signatures.engineer.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.engineer?.metadata ? 2 : 0 }]}>{signatures?.engineer?.name || SIGNATORIES.calibratedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.engineer?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.engineer.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed:</Text>
                      {formatSigningDateTime(signatures.engineer.metadata.signedAt, signatures.engineer.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.engineer.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.engineer.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.engineer.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.engineer.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.engineer?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.engineer.signatureId}
                </Text>
              )}
            </View>

            {/* Column 2: Checked By (Reviewer) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>CHECKED BY:</Text>
              {signatures?.hod?.image ? (
                <Image src={signatures.hod.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.hod?.metadata ? 2 : 0 }]}>{signatures?.hod?.name || SIGNATORIES.checkedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.hod?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.hod.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed: </Text>
                      {formatSigningDateTime(signatures.hod.metadata.signedAt, signatures.hod.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.hod.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.hod.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.hod.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.hod.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.hod?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.hod.signatureId}
                </Text>
              )}
            </View>

            {/* Column 3: Approved & Issued By (Admin) */}
            <View style={styles.signatureColumn}>
              <Text style={styles.signatureLabel}>APPROVED & ISSUED BY:</Text>
              {signatures?.admin?.image ? (
                <Image src={signatures.admin.image} style={styles.signatureImage} />
              ) : (
                <View style={styles.signatureBox} />
              )}
              <Text style={[styles.signatureName, { marginBottom: signatures?.admin?.metadata ? 2 : 0 }]}>{signatures?.admin?.name || SIGNATORIES.approvedIssuedBy}</Text>
              {/* Signing Metadata */}
              {signatures?.admin?.metadata && (
                <View style={styles.signatureMetadata}>
                  {signatures.admin.metadata.signedAt && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Signed: </Text>
                      {formatSigningDateTime(signatures.admin.metadata.signedAt, signatures.admin.metadata.timezone)}
                    </Text>
                  )}
                  {signatures.admin.metadata.ipAddress && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>IP: </Text>
                      {signatures.admin.metadata.ipAddress}
                    </Text>
                  )}
                  {signatures.admin.metadata.deviceInfo && (
                    <Text style={styles.signatureMetadataLine}>
                      <Text style={styles.signatureMetadataLabel}>Device: </Text>
                      {signatures.admin.metadata.deviceInfo}
                    </Text>
                  )}
                </View>
              )}
              {signatures?.admin?.signatureId && (
                <Text style={styles.signatureMetadataLine}>
                  <Text style={styles.signatureMetadataLabel}>Signature ID: </Text>
                  {signatures.admin.signatureId}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* ================================================================ */}
        {/* SECTION M: CUSTOMER ACKNOWLEDGMENT (conditional) */}
        {/* ================================================================ */}
        {signatures?.customer && (
          <View style={styles.customerAckSection} wrap={false}>
            <Text style={styles.customerAckTitle}>CUSTOMER ACKNOWLEDGMENT</Text>
            <Text style={styles.customerAckText}>{CUSTOMER_ACKNOWLEDGMENT_TEXT}</Text>
            <View style={styles.customerAckBody}>
              <View style={styles.customerAckSigBox}>
                {signatures.customer.image ? (
                  <Image src={signatures.customer.image} style={styles.customerAckSigImage} />
                ) : (
                  <Text style={{ fontSize: 7, color: '#999' }}>Signed</Text>
                )}
              </View>
              <View style={styles.customerAckDetails}>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Customer: </Text>
                  {signatures.customer.companyName}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Name: </Text>
                  {signatures.customer.name}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Email: </Text>
                  {signatures.customer.email}
                </Text>
                <Text style={styles.customerAckDetailLine}>
                  <Text style={styles.customerAckDetailLabel}>Date: </Text>
                  {signatures.customer.metadata?.signedAt
                    ? formatSigningDateTime(signatures.customer.metadata.signedAt, signatures.customer.metadata.timezone)
                    : formatDateDDMMYYYY(signatures.customer.signedAt.split('T')[0])}
                </Text>
                {signatures.customer.metadata?.ipAddress && (
                  <Text style={styles.customerAckDetailLine}>
                    <Text style={styles.customerAckDetailLabel}>IP: </Text>
                    {signatures.customer.metadata.ipAddress}
                  </Text>
                )}
                {signatures.customer.metadata?.deviceInfo && (
                  <Text style={styles.customerAckDetailLine}>
                    <Text style={styles.customerAckDetailLabel}>Device: </Text>
                    {signatures.customer.metadata.deviceInfo}
                  </Text>
                )}
              </View>
            </View>
            <Text style={styles.customerAckDetailLine}>
              <Text style={styles.customerAckDetailLabel}>Signature ID: </Text>
              {signatures.customer.signatureId}
            </Text>
          </View>
        )}

        {/* ================================================================ */}
        {/* SECTION L: FOOTER NOTES */}
        {/* ================================================================ */}
        <View style={styles.footerSection} fixed>
          {FOOTER_NOTES.map((note, idx) => (
            <Text key={idx} style={styles.footerNote}>
              {idx + 1}. {note}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  )
}

export default CalibrationCertificatePDF
