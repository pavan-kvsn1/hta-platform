/**
 * PDF Layout Planning Utilities
 *
 * Implements smart page distribution logic for calibration certificate PDFs.
 * See README.md in this directory for detailed documentation.
 *
 * Strategy: "Compress Then Break"
 * 1. Calculate total content height
 * 2. If fits with room → expand spacing (up to 1.5x)
 * 3. If overflow ≤ 15% of adjustable spacing → compress (0.85x-0.99x)
 * 4. If overflow > 15% → multi-page with strategic breaks + compression
 */

import { CertificateFormData } from '@/lib/stores/certificate-store'

// ============================================================================
// CONSTANTS
// ============================================================================

// A4 page dimensions in points (1 point = 1/72 inch)
const PAGE_HEIGHT = 841.89 // A4 height in points

// Padding/margins (these match the page styles in CalibrationCertificatePDF.tsx)
// Header and footer are absolutely positioned, so padding reserves their space
const PAGE_PADDING_TOP = 105 // Reserves space for absolutely positioned header + title + gap
const PAGE_PADDING_BOTTOM = 60 // Reserves space for absolutely positioned footer (~45px)

// Usable content height per page
// A4 (841.89pt) minus top padding (90) minus bottom padding (60) = ~692pt usable
const USABLE_HEIGHT = PAGE_HEIGHT - PAGE_PADDING_TOP - PAGE_PADDING_BOTTOM

// Spacing adjustment limits
const MIN_SPACING_MULTIPLIER = 0.75 // 25% compression max
const MAX_SPACING_MULTIPLIER = 2.00 // 100% expansion max (to fill page completely)
const _COMPRESSION_THRESHOLD = 0.25 // Can compress if overflow ≤ 25% of adjustable spacing

// Minimum sections per page (excluding header/footer)
const _MIN_SECTIONS_PER_PAGE = 3

// ============================================================================
// TYPES
// ============================================================================

export type SectionType =
  | 'customerInfo'      // Group A
  | 'uucDetails'        // Group A
  | 'environmental'     // Group B
  | 'sopReference'      // Group B
  | 'calibrationTable'  // Group C (one per parameter)
  | 'masterInstruments' // Group D
  | 'conclusion'        // Group E
  | 'validity'          // Group E
  | 'signature'         // Group E

export type SectionGroup = 'A' | 'B' | 'C' | 'D' | 'E'

export interface Section {
  id: string
  type: SectionType
  group: SectionGroup
  estimatedHeight: number
  isFlexible: boolean // Can be reordered within its group
  parameterId?: string // For calibration tables
  parameterName?: string // For calibration tables
}

export interface PageLayout {
  pageNumber: number
  sections: Section[]
  totalHeight: number
  availableSpace: number
  spacingMultiplier: number // Factor to multiply spacing by
}

export interface LayoutPlan {
  pages: PageLayout[]
  totalPages: number
  strategy: 'expand' | 'compress' | 'multi-page'
  globalSpacingMultiplier: number // 0.85 to 1.50
  breakBefore: Set<string> // Section IDs to force page break before
}

// ============================================================================
// HEIGHT ESTIMATION FUNCTIONS
// ============================================================================

/**
 * Estimate height of Customer Info + UUC Details table (Group A)
 * Customer: 2 rows × 18px minHeight + 3px padding = ~38px
 * UUC: 5 rows × 14px minHeight + 3px padding = ~75px
 */
export function estimateGroupAHeight(data: CertificateFormData): number {
  // Customer table: 2 rows × ~18px each
  const customerTableHeight = 36

  // UUC table: 5 rows × ~14px each
  // Extra height for binned parameters (multi-line)
  const hasBinnedParams = data.parameters.some(p => p.requiresBinning && p.bins.length > 1)
  const binnedExtraHeight = hasBinnedParams
    ? Math.max(...data.parameters.map(p => p.bins.length)) * 8
    : 0
  const uucTableHeight = 70 + binnedExtraHeight

  return customerTableHeight + uucTableHeight + 10 // + margin between tables
}

/**
 * Estimate height of Environmental + SOP Reference (Group B)
 * Two info lines with reduced lineHeight (1.15)
 */
export function estimateGroupBHeight(): number {
  // Two simple info lines ~12px each + margins
  return 28
}

/**
 * Estimate height of a single calibration table (Group C)
 * Header: 2 rows × ~16px = 32px, Sub-header: ~14px, Data: 14px each
 */
export function estimateCalibrationTableHeight(
  resultsCount: number,
  _parameterName: string
): number {
  // Header rows: ~32px (2 rows with reduced padding)
  // Sub-header row: ~14px
  const headerHeight = 46
  // Data rows: ~14px each (minHeight 14 + padding 2)
  const dataRowsHeight = resultsCount * 14
  const margin = 10

  return headerHeight + dataRowsHeight + margin
}

/**
 * Estimate height of Master Instruments section (Group D)
 * With reduced lineHeight (1.15), each line ~10px
 */
export function estimateMasterInstrumentsHeight(instrumentCount: number): number {
  if (instrumentCount === 0) return 0

  // Header: ~16px
  // Each instrument block: ~4 lines × 10px = ~40px + margin between blocks
  const headerHeight = 16
  const instrumentHeight = 45 * instrumentCount

  return headerHeight + instrumentHeight
}

/**
 * Estimate height of Group E (Conclusion + Validity + Signature)
 * With reduced lineHeight (1.15)
 */
export function estimateGroupEHeight(conclusionCount: number): number {
  // Conclusion: header + statements (~12px each with reduced lineHeight)
  const conclusionHeight = conclusionCount > 0 ? 20 + (conclusionCount * 12) : 0

  // Validity statement: ~20px
  const validityHeight = 20

  // Signature block: ~70px (3 columns with boxes, slightly reduced)
  const signatureHeight = 70

  return conclusionHeight + validityHeight + signatureHeight + 10 // + margins
}

/**
 * Estimate total adjustable spacing in the document
 * This is used to calculate compression/expansion limits
 */
function estimateAdjustableSpacing(sections: Section[]): number {
  // Section margins: ~10px between each section
  const sectionGaps = (sections.length - 1) * 10

  // Table row padding (roughly 2-3px per row, estimate ~25 rows total)
  const tablePadding = 60

  // Info line spacing
  const infoLineSpacing = 15

  return sectionGaps + tablePadding + infoLineSpacing // ~70-100px typically
}

// ============================================================================
// SECTION GENERATION
// ============================================================================

/**
 * Generate all sections from certificate data with estimated heights
 */
export function generateSections(data: CertificateFormData): Section[] {
  const sections: Section[] = []

  // Group A: Customer Info + UUC Details (combined as one section for simplicity)
  sections.push({
    id: 'group-a',
    type: 'customerInfo',
    group: 'A',
    estimatedHeight: estimateGroupAHeight(data),
    isFlexible: false,
  })

  // Group B: Environmental + SOP Reference
  sections.push({
    id: 'group-b',
    type: 'environmental',
    group: 'B',
    estimatedHeight: estimateGroupBHeight(),
    isFlexible: false,
  })

  // Group C: Calibration Tables (one per parameter)
  data.parameters.forEach((param, idx) => {
    const resultsCount = param.results.filter(r => r.standardReading || r.beforeAdjustment).length
    if (resultsCount > 0) {
      sections.push({
        id: `cal-table-${param.id}`,
        type: 'calibrationTable',
        group: 'C',
        estimatedHeight: estimateCalibrationTableHeight(resultsCount, param.parameterName || `Parameter ${idx + 1}`),
        isFlexible: true,
        parameterId: param.id,
        parameterName: param.parameterName || `Parameter ${idx + 1}`,
      })
    }
  })

  // Group D: Master Instruments
  const masterCount = data.masterInstruments.filter(m => m.masterInstrumentId).length
  if (masterCount > 0) {
    sections.push({
      id: 'master-instruments',
      type: 'masterInstruments',
      group: 'D',
      estimatedHeight: estimateMasterInstrumentsHeight(masterCount),
      isFlexible: true,
    })
  }

  // Group E: Conclusion + Validity + Signature (combined as one section)
  sections.push({
    id: 'group-e',
    type: 'conclusion',
    group: 'E',
    estimatedHeight: estimateGroupEHeight(data.selectedConclusionStatements.length),
    isFlexible: false,
  })

  return sections
}

// ============================================================================
// SPACING CALCULATION
// ============================================================================

/**
 * Calculate spacing multiplier based on content height vs usable space
 * Returns strategy and multiplier
 *
 * Key insight: We want to FILL the page, not just fit.
 * So even after compression gets us to fit, we expand to use remaining space.
 */
function calculateSpacingStrategy(
  totalHeight: number,
  usableHeight: number,
  _adjustableSpacing: number
): { multiplier: number; strategy: 'expand' | 'compress' | 'multi-page' } {
  // Calculate min possible height (with max compression)
  const minPossibleHeight = totalHeight * MIN_SPACING_MULTIPLIER

  // Calculate max possible height (with max expansion)
  const _maxPossibleHeight = totalHeight * MAX_SPACING_MULTIPLIER

  // Check if we can fit on one page at all (even with max compression)
  if (minPossibleHeight > usableHeight) {
    // Can't fit even with max compression - need multi-page
    return { multiplier: MIN_SPACING_MULTIPLIER, strategy: 'multi-page' }
  }

  // We CAN fit on one page - now calculate optimal multiplier to FILL the space
  // Target: totalHeight × multiplier = usableHeight (with small buffer)
  const targetHeight = usableHeight * 0.98 // Leave 2% buffer to avoid overflow
  const optimalMultiplier = targetHeight / totalHeight

  // Clamp to allowed range
  const clampedMultiplier = Math.max(
    MIN_SPACING_MULTIPLIER,
    Math.min(MAX_SPACING_MULTIPLIER, optimalMultiplier)
  )

  // Determine strategy based on whether we're compressing or expanding
  const strategy = clampedMultiplier < 1 ? 'compress' : 'expand'

  return { multiplier: clampedMultiplier, strategy }
}

// ============================================================================
// STRATEGIC BREAK DETECTION
// ============================================================================

/**
 * Detect where to place strategic page breaks to avoid orphaned sections
 * Returns set of section IDs that should have a page break before them
 */
function detectStrategicBreaks(
  sections: Section[],
  usableHeight: number,
  spacingMultiplier: number
): Set<string> {
  const breakBefore = new Set<string>()

  // Apply spacing multiplier to heights for more accurate simulation
  const adjustedSections = sections.map(s => ({
    ...s,
    adjustedHeight: s.estimatedHeight * (s.isFlexible ? spacingMultiplier : 1)
  }))

  // Simulate page distribution
  let currentPageHeight = 0
  let currentPageSections: typeof adjustedSections = []
  const pages: (typeof adjustedSections)[] = []

  for (let i = 0; i < adjustedSections.length; i++) {
    const section = adjustedSections[i]

    if (currentPageHeight + section.adjustedHeight > usableHeight && currentPageSections.length > 0) {
      // Would overflow - start new page
      pages.push([...currentPageSections])
      currentPageSections = [section]
      currentPageHeight = section.adjustedHeight
      breakBefore.add(section.id)
    } else {
      currentPageSections.push(section)
      currentPageHeight += section.adjustedHeight
    }
  }

  // Don't forget the last page
  if (currentPageSections.length > 0) {
    pages.push(currentPageSections)
  }

  // Check for orphaned last page (Group E alone or < 3 sections)
  if (pages.length > 1) {
    const lastPage = pages[pages.length - 1]
    const prevPage = pages[pages.length - 2]

    // If last page only has Group E (or fewer than 2 non-GroupE sections)
    const lastPageNonGroupE = lastPage.filter(s => s.group !== 'E')

    if (lastPageNonGroupE.length < 2 && prevPage.length >= 3) {
      // Need to move some content to last page
      // Find the last flexible section on prev page that we can move
      const flexibleOnPrev = prevPage.filter(s => s.isFlexible)

      if (flexibleOnPrev.length > 0) {
        // Move break earlier - to before the last flexible section on prev page
        const sectionToMove = flexibleOnPrev[flexibleOnPrev.length - 1]

        // Calculate if moving this section would help
        const sectionToMoveHeight = sectionToMove.adjustedHeight
        const lastPageHeight = lastPage.reduce((sum, s) => sum + s.adjustedHeight, 0)

        if (sectionToMoveHeight + lastPageHeight <= usableHeight * 1.15) {
          // Moving this section works (allow slight compression on last page)
          breakBefore.delete(lastPage[0].id) // Remove existing break
          breakBefore.add(sectionToMove.id) // Add new break before the section to move
        }
      }
    }
  }

  return breakBefore
}

// ============================================================================
// LAYOUT PLANNING (MAIN ENTRY POINT)
// ============================================================================

/**
 * Plan the optimal layout for all sections across pages
 * This is the main entry point for layout planning
 */
export function planLayout(data: CertificateFormData): LayoutPlan {
  const sections = generateSections(data)

  // Calculate totals
  const totalHeight = sections.reduce((sum, s) => sum + s.estimatedHeight, 0)
  const adjustableSpacing = estimateAdjustableSpacing(sections)

  // Determine strategy
  const { multiplier, strategy } = calculateSpacingStrategy(
    totalHeight,
    USABLE_HEIGHT,
    adjustableSpacing
  )

  // Reorder flexible sections (smallest first) for better packing
  const groupA = sections.find(s => s.group === 'A')!
  const groupB = sections.find(s => s.group === 'B')!
  const groupE = sections.find(s => s.group === 'E')!
  const flexibleSections = sections.filter(s => s.group === 'C' || s.group === 'D')

  // Sort flexible sections by height (smallest first)
  const sortedFlexible = [...flexibleSections].sort((a, b) => a.estimatedHeight - b.estimatedHeight)

  // Reconstruct sections in optimal order
  const orderedSections: Section[] = [groupA, groupB, ...sortedFlexible, groupE]

  // Detect strategic breaks for multi-page scenarios
  const breakBefore = strategy === 'multi-page'
    ? detectStrategicBreaks(orderedSections, USABLE_HEIGHT, multiplier)
    : new Set<string>()

  // Build page layouts
  const pages: PageLayout[] = []
  let currentPage: PageLayout = {
    pageNumber: 1,
    sections: [],
    totalHeight: 0,
    availableSpace: USABLE_HEIGHT,
    spacingMultiplier: multiplier,
  }

  for (const section of orderedSections) {
    // Check if we need a page break before this section
    if (breakBefore.has(section.id) && currentPage.sections.length > 0) {
      // Recalculate spacing for current page before moving on
      currentPage.spacingMultiplier = calculatePageSpacingMultiplier(currentPage, USABLE_HEIGHT)
      pages.push(currentPage)

      currentPage = {
        pageNumber: pages.length + 1,
        sections: [],
        totalHeight: 0,
        availableSpace: USABLE_HEIGHT,
        spacingMultiplier: multiplier,
      }
    }

    // Check if section fits on current page (for natural overflow detection)
    // Apply multiplier for both compress AND expand strategies
    const effectiveHeight = section.estimatedHeight * multiplier

    if (currentPage.totalHeight + effectiveHeight > USABLE_HEIGHT && currentPage.sections.length > 0) {
      // Natural overflow - start new page
      currentPage.spacingMultiplier = calculatePageSpacingMultiplier(currentPage, USABLE_HEIGHT)
      pages.push(currentPage)

      currentPage = {
        pageNumber: pages.length + 1,
        sections: [],
        totalHeight: 0,
        availableSpace: USABLE_HEIGHT,
        spacingMultiplier: multiplier,
      }
    }

    // Add section to current page
    currentPage.sections.push(section)
    currentPage.totalHeight += effectiveHeight
    currentPage.availableSpace = USABLE_HEIGHT - currentPage.totalHeight
  }

  // Add last page
  if (currentPage.sections.length > 0) {
    currentPage.spacingMultiplier = calculatePageSpacingMultiplier(currentPage, USABLE_HEIGHT)
    pages.push(currentPage)
  }

  return {
    pages,
    totalPages: pages.length,
    strategy,
    globalSpacingMultiplier: multiplier,
    breakBefore,
  }
}

/**
 * Calculate per-page spacing multiplier to fill available space
 * Target: fill ~98% of usable height to avoid overflow while minimizing empty space
 */
function calculatePageSpacingMultiplier(page: PageLayout, usableHeight: number): number {
  if (page.sections.length <= 1) return 1
  if (page.totalHeight <= 0) return 1

  // Target 98% of usable height
  const targetHeight = usableHeight * 0.98

  // Calculate optimal multiplier: what multiplier makes totalHeight = targetHeight?
  const optimalMultiplier = targetHeight / page.totalHeight

  // Clamp to allowed range
  return Math.max(MIN_SPACING_MULTIPLIER, Math.min(MAX_SPACING_MULTIPLIER, optimalMultiplier))
}

// ============================================================================
// HELPER FUNCTIONS FOR PDF RENDERING
// ============================================================================

/**
 * Get the order of parameter IDs for rendering based on layout plan
 */
export function getParameterRenderOrder(layoutPlan: LayoutPlan): string[] {
  const order: string[] = []

  for (const page of layoutPlan.pages) {
    for (const section of page.sections) {
      if (section.type === 'calibrationTable' && section.parameterId) {
        order.push(section.parameterId)
      }
    }
  }

  return order
}

/**
 * Get dynamic spacing value based on layout plan
 */
export function getDynamicSpacing(baseSpacing: number, pageNumber: number, layoutPlan: LayoutPlan): number {
  const page = layoutPlan.pages.find(p => p.pageNumber === pageNumber)
  if (!page) return baseSpacing

  return Math.round(baseSpacing * page.spacingMultiplier)
}

/**
 * Check if all content fits on a single page
 */
export function isSinglePage(layoutPlan: LayoutPlan): boolean {
  return layoutPlan.totalPages === 1
}

/**
 * Get sections for a specific page
 */
export function getSectionsForPage(pageNumber: number, layoutPlan: LayoutPlan): Section[] {
  const page = layoutPlan.pages.find(p => p.pageNumber === pageNumber)
  return page?.sections || []
}

/**
 * Check if a section should have a page break before it
 */
export function shouldBreakBefore(sectionId: string, layoutPlan: LayoutPlan): boolean {
  return layoutPlan.breakBefore.has(sectionId)
}

/**
 * Get the spacing multiplier for a given page
 */
export function getPageSpacingMultiplier(pageNumber: number, layoutPlan: LayoutPlan): number {
  const page = layoutPlan.pages.find(p => p.pageNumber === pageNumber)
  return page?.spacingMultiplier ?? 1
}
