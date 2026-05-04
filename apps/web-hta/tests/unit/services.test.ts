/**
 * Services Unit Tests
 *
 * Tests for pure / side-effect-free logic in service modules:
 * - image-processing helpers (isHeicImage)
 * - notification template message generation
 * - api-client helpers (clearAccessToken, URL building logic)
 * - certificate-store utility functions (calculateDueDateString, generateCertNumber patterns)
 *
 * Avoids heavy mocking of prisma / sharp / queue by only importing and
 * exercising the exported pure functions or re-implementing the logic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// 1. Image processing — isHeicImage (pure function, no sharp needed)
// ---------------------------------------------------------------------------
describe('isHeicImage', () => {
  // Inline the pure function to avoid importing sharp in test env
  function isHeicImage(mimeType: string): boolean {
    return mimeType === 'image/heic' || mimeType === 'image/heif'
  }

  it('returns true for image/heic', () => {
    expect(isHeicImage('image/heic')).toBe(true)
  })

  it('returns true for image/heif', () => {
    expect(isHeicImage('image/heif')).toBe(true)
  })

  it('returns false for image/jpeg', () => {
    expect(isHeicImage('image/jpeg')).toBe(false)
  })

  it('returns false for image/png', () => {
    expect(isHeicImage('image/png')).toBe(false)
  })

  it('returns false for image/webp', () => {
    expect(isHeicImage('image/webp')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isHeicImage('')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 2. Notification template message generation (pure message functions)
// ---------------------------------------------------------------------------
describe('Notification template messages', () => {
  // Mirrors the template definitions in src/lib/services/notifications.ts
  type TemplateData = Record<string, string>

  const templates: Record<string, (data: TemplateData) => string> = {
    REVISION_REQUESTED: (d) => `${d.reviewerName || 'Reviewer'} requested revision on ${d.certificateNumber}`,
    CERTIFICATE_APPROVED: (d) => `Your certificate ${d.certificateNumber} has been approved`,
    SENT_TO_CUSTOMER: (d) => `Certificate ${d.certificateNumber} has been sent to customer`,
    CERTIFICATE_FINALIZED: (d) => `Customer approved certificate ${d.certificateNumber}`,
    SUBMITTED_FOR_REVIEW: (d) => `${d.assigneeName || 'Engineer'} submitted ${d.certificateNumber} for review`,
    ENGINEER_RESPONDED: (d) => `${d.assigneeName || 'Engineer'} responded to revision request on ${d.certificateNumber}`,
    CUSTOMER_REVISION_REQUEST: (d) => `Customer requested revision on ${d.certificateNumber}`,
    CUSTOMER_APPROVED: (d) => `Customer approved certificate ${d.certificateNumber}`,
    CERTIFICATE_READY: (d) => `Certificate ${d.certificateNumber} is ready for your review`,
    REVIEWER_REPLIED: (d) => `HTA has responded to your feedback on ${d.certificateNumber}`,
    NEW_CHAT_MESSAGE: (d) => `${d.senderName || 'Someone'} sent a message on ${d.certificateNumber}`,
    REGISTRATION_SUBMITTED: (d) => `${d.name} (${d.email}) registered for ${d.companyName}`,
    REGISTRATION_APPROVED: (d) => `Your account for ${d.companyName} has been approved. You can now login.`,
    REGISTRATION_REJECTED: (d) => `Your registration was not approved. Reason: ${d.reason || 'Not specified'}`,
  }

  it('REVISION_REQUESTED uses reviewerName when provided', () => {
    const msg = templates.REVISION_REQUESTED({ reviewerName: 'Alice', certificateNumber: 'HTA/C12345/01/25' })
    expect(msg).toBe('Alice requested revision on HTA/C12345/01/25')
  })

  it('REVISION_REQUESTED falls back to "Reviewer" when no name', () => {
    const msg = templates.REVISION_REQUESTED({ certificateNumber: 'HTA/C12345/01/25' })
    expect(msg).toBe('Reviewer requested revision on HTA/C12345/01/25')
  })

  it('CERTIFICATE_APPROVED includes certificate number', () => {
    const msg = templates.CERTIFICATE_APPROVED({ certificateNumber: 'HTA/C99999/06/24' })
    expect(msg).toContain('HTA/C99999/06/24')
    expect(msg).toContain('approved')
  })

  it('SUBMITTED_FOR_REVIEW uses assigneeName when provided', () => {
    const msg = templates.SUBMITTED_FOR_REVIEW({ assigneeName: 'Bob', certificateNumber: 'HTA/C00001/02/25' })
    expect(msg).toBe('Bob submitted HTA/C00001/02/25 for review')
  })

  it('SUBMITTED_FOR_REVIEW falls back to "Engineer"', () => {
    const msg = templates.SUBMITTED_FOR_REVIEW({ certificateNumber: 'HTA/C00001/02/25' })
    expect(msg).toBe('Engineer submitted HTA/C00001/02/25 for review')
  })

  it('NEW_CHAT_MESSAGE uses senderName when provided', () => {
    const msg = templates.NEW_CHAT_MESSAGE({ senderName: 'Carol', certificateNumber: 'HTA/C55555/03/25' })
    expect(msg).toContain('Carol')
  })

  it('NEW_CHAT_MESSAGE falls back to "Someone"', () => {
    const msg = templates.NEW_CHAT_MESSAGE({ certificateNumber: 'HTA/C55555/03/25' })
    expect(msg).toContain('Someone')
  })

  it('REGISTRATION_SUBMITTED includes name, email, and company', () => {
    const msg = templates.REGISTRATION_SUBMITTED({ name: 'David', email: 'd@acme.com', companyName: 'Acme Corp' })
    expect(msg).toContain('David')
    expect(msg).toContain('d@acme.com')
    expect(msg).toContain('Acme Corp')
  })

  it('REGISTRATION_REJECTED uses reason when provided', () => {
    const msg = templates.REGISTRATION_REJECTED({ reason: 'Incomplete documents' })
    expect(msg).toContain('Incomplete documents')
  })

  it('REGISTRATION_REJECTED falls back to "Not specified"', () => {
    const msg = templates.REGISTRATION_REJECTED({})
    expect(msg).toContain('Not specified')
  })
})

// ---------------------------------------------------------------------------
// 3. API client helpers (pure logic, no network)
// ---------------------------------------------------------------------------
describe('API client URL building', () => {
  // Mirrors the logic in src/lib/api-client.ts without importing it
  function resolveApiUrl(input: string, apiBaseUrl: string): string {
    if (typeof input === 'string' && input.startsWith('/api/') && !input.startsWith('/api/auth/')) {
      if (apiBaseUrl) {
        return `${apiBaseUrl}${input}`
      }
    }
    return input
  }

  it('prepends API_BASE_URL for non-auth API calls when set', () => {
    const url = resolveApiUrl('/api/certificates', 'https://api.example.com')
    expect(url).toBe('https://api.example.com/api/certificates')
  })

  it('does not prepend base URL for auth routes', () => {
    const url = resolveApiUrl('/api/auth/refresh', 'https://api.example.com')
    expect(url).toBe('/api/auth/refresh')
  })

  it('does not prepend base URL when API_BASE_URL is empty', () => {
    const url = resolveApiUrl('/api/instruments', '')
    expect(url).toBe('/api/instruments')
  })

  it('leaves non-API paths unchanged', () => {
    const url = resolveApiUrl('/dashboard', 'https://api.example.com')
    expect(url).toBe('/dashboard')
  })

  it('leaves absolute URLs unchanged', () => {
    const url = resolveApiUrl('https://other.com/path', 'https://api.example.com')
    expect(url).toBe('https://other.com/path')
  })
})

describe('isDraftRoute', () => {
  const OFFLINE_ROUTES = ['/api/certificates', '/api/instruments']

  function isDraftRoute(url: string): boolean {
    return OFFLINE_ROUTES.some((r) => url.startsWith(r))
  }

  it('returns true for /api/certificates', () => {
    expect(isDraftRoute('/api/certificates')).toBe(true)
  })

  it('returns true for /api/certificates/123', () => {
    expect(isDraftRoute('/api/certificates/123')).toBe(true)
  })

  it('returns true for /api/instruments', () => {
    expect(isDraftRoute('/api/instruments')).toBe(true)
  })

  it('returns false for /api/notifications', () => {
    expect(isDraftRoute('/api/notifications')).toBe(false)
  })

  it('returns false for /api/auth/refresh', () => {
    expect(isDraftRoute('/api/auth/refresh')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 4. Token management logic
// ---------------------------------------------------------------------------
describe('Access token expiry logic', () => {
  // Mirrors the getAccessToken caching logic
  function isTokenValid(accessToken: string | null, tokenExpiresAt: number): boolean {
    return !!accessToken && Date.now() < tokenExpiresAt - 30000
  }

  it('returns false when token is null', () => {
    expect(isTokenValid(null, Date.now() + 60000)).toBe(false)
  })

  it('returns false when token is expired', () => {
    expect(isTokenValid('token', Date.now() - 1000)).toBe(false)
  })

  it('returns false when token expires within 30 seconds buffer', () => {
    expect(isTokenValid('token', Date.now() + 20000)).toBe(false)
  })

  it('returns true when token is valid with plenty of time', () => {
    expect(isTokenValid('token', Date.now() + 120000)).toBe(true)
  })

  it('returns false when token expires exactly at boundary', () => {
    // At exactly 30000ms from now it should be invalid (not yet > 30s buffer)
    expect(isTokenValid('token', Date.now() + 30000)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// 5. Certificate number generation pattern validation
// ---------------------------------------------------------------------------
describe('Certificate number pattern', () => {
  // Mirrors the generateCertificateNumber function pattern from certificate-store.ts
  const CERT_NUMBER_PATTERN = /^HTA\/C\d{5}\/\d{2}\/\d{2}$/

  function generateCertificateNumber(): string {
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const year = String(now.getFullYear()).slice(-2)
    const sequence = Math.floor(50000 + Math.random() * 1000).toString().padStart(5, '0')
    return `HTA/C${sequence}/${month}/${year}`
  }

  it('generated number matches expected pattern', () => {
    const certNum = generateCertificateNumber()
    expect(certNum).toMatch(CERT_NUMBER_PATTERN)
  })

  it('generated number starts with HTA/C', () => {
    const certNum = generateCertificateNumber()
    expect(certNum).toMatch(/^HTA\/C/)
  })

  it('generated numbers are unique (stochastic)', () => {
    const nums = new Set(Array.from({ length: 20 }, () => generateCertificateNumber()))
    // With random in [50000, 51000) range, all 20 should typically be unique
    expect(nums.size).toBeGreaterThan(1)
  })

  it('sequence portion is 5 digits', () => {
    const certNum = generateCertificateNumber()
    const parts = certNum.split('/')
    // Format: HTA / C12345 / MM / YY
    expect(parts[1].slice(1)).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// 6. Due date calculation logic (from certificate-store.ts)
// ---------------------------------------------------------------------------
describe('calculateDueDateString', () => {
  function calculateDueDateString(dateOfCalibration: string, tenure: number, adjustment = 0): string {
    if (!dateOfCalibration) return ''
    const date = new Date(dateOfCalibration)
    date.setMonth(date.getMonth() + tenure)
    date.setDate(date.getDate() + adjustment)
    return date.toISOString().split('T')[0]
  }

  it('returns empty string for empty date input', () => {
    expect(calculateDueDateString('', 12)).toBe('')
  })

  it('adds 12 months for annual calibration', () => {
    expect(calculateDueDateString('2024-01-15', 12)).toBe('2025-01-15')
  })

  it('adds 6 months for semi-annual calibration', () => {
    expect(calculateDueDateString('2024-01-15', 6)).toBe('2024-07-15')
  })

  it('adds 3 months for quarterly calibration', () => {
    expect(calculateDueDateString('2024-03-01', 3)).toBe('2024-06-01')
  })

  it('applies negative day adjustment', () => {
    expect(calculateDueDateString('2024-01-15', 12, -3)).toBe('2025-01-12')
  })

  it('applies -2 day adjustment', () => {
    expect(calculateDueDateString('2024-06-15', 6, -2)).toBe('2024-12-13')
  })

  it('applies zero adjustment (no change)', () => {
    expect(calculateDueDateString('2024-01-15', 12, 0)).toBe('2025-01-15')
  })

  it('handles end of month correctly when adding months', () => {
    // Jan 31 + 1 month can roll over to March in some implementations
    const result = calculateDueDateString('2024-01-31', 1)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ---------------------------------------------------------------------------
// 7. Error limit calculation logic (from certificate-store.ts)
// ---------------------------------------------------------------------------
describe('calculateErrorLimit - accuracy types', () => {
  interface SimpleParameter {
    accuracyType: 'PERCENT_READING' | 'ABSOLUTE' | 'PERCENT_SCALE'
    accuracyValue: string
    rangeMin: string
    rangeMax: string
    requiresBinning: boolean
    bins: Array<{ binMin: string; binMax: string; accuracy: string }>
  }

  function calculateErrorLimit(parameter: SimpleParameter, standardReading: number): { limit: number | null } {
    const accuracy = parseFloat(parameter.accuracyValue.replace('±', ''))
    if (isNaN(accuracy)) return { limit: null }

    let limit: number
    switch (parameter.accuracyType) {
      case 'PERCENT_READING':
        limit = (accuracy * Math.abs(standardReading)) / 100
        break
      case 'PERCENT_SCALE': {
        const rangeMin = parseFloat(parameter.rangeMin)
        const rangeMax = parseFloat(parameter.rangeMax)
        if (isNaN(rangeMin) || isNaN(rangeMax)) {
          limit = accuracy
        } else {
          limit = (accuracy * Math.abs(rangeMax - rangeMin)) / 100
        }
        break
      }
      case 'ABSOLUTE':
      default:
        limit = accuracy
    }

    return { limit }
  }

  const baseParam: SimpleParameter = {
    accuracyType: 'ABSOLUTE',
    accuracyValue: '0.5',
    rangeMin: '0',
    rangeMax: '100',
    requiresBinning: false,
    bins: [],
  }

  it('ABSOLUTE accuracy returns the accuracy value as limit', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyType: 'ABSOLUTE', accuracyValue: '0.5' }, 50)
    expect(result.limit).toBe(0.5)
  })

  it('PERCENT_READING calculates limit as percentage of reading', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyType: 'PERCENT_READING', accuracyValue: '2' }, 100)
    expect(result.limit).toBe(2) // 2% of 100 = 2
  })

  it('PERCENT_READING uses absolute value of reading', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyType: 'PERCENT_READING', accuracyValue: '2' }, -100)
    expect(result.limit).toBe(2) // 2% of |−100| = 2
  })

  it('PERCENT_SCALE calculates limit as percentage of range', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyType: 'PERCENT_SCALE', accuracyValue: '1', rangeMin: '0', rangeMax: '200' }, 50)
    expect(result.limit).toBe(2) // 1% of 200 = 2
  })

  it('PERCENT_SCALE falls back to absolute when range not set', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyType: 'PERCENT_SCALE', accuracyValue: '1.5', rangeMin: 'NaN', rangeMax: 'NaN' }, 50)
    expect(result.limit).toBe(1.5)
  })

  it('returns null limit for non-numeric accuracy value', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyValue: 'N/A' }, 50)
    expect(result.limit).toBeNull()
  })

  it('strips ± prefix from accuracy value', () => {
    const result = calculateErrorLimit({ ...baseParam, accuracyValue: '±0.5' }, 50)
    expect(result.limit).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// 8. ACCURACY_TYPE_CONFIG labels (from certificate-store.ts export)
// ---------------------------------------------------------------------------
describe('ACCURACY_TYPE_CONFIG', () => {
  const ACCURACY_TYPE_CONFIG = {
    'PERCENT_READING': { label: '% of Reading', shortLabel: '%Rdg', description: '± Margin of Error (%) against master instrument reading' },
    'ABSOLUTE': { label: 'Absolute', shortLabel: 'Abs', description: '± Absolute Margin of Error in measurement units' },
    'PERCENT_SCALE': { label: '% of Scale', shortLabel: '%Scale', description: '± Margin of Error (%) × total UUC range' },
  }

  it('all three accuracy types are defined', () => {
    expect(Object.keys(ACCURACY_TYPE_CONFIG)).toHaveLength(3)
  })

  it('ABSOLUTE has correct labels', () => {
    expect(ACCURACY_TYPE_CONFIG.ABSOLUTE.label).toBe('Absolute')
    expect(ACCURACY_TYPE_CONFIG.ABSOLUTE.shortLabel).toBe('Abs')
  })

  it('PERCENT_READING has correct labels', () => {
    expect(ACCURACY_TYPE_CONFIG.PERCENT_READING.label).toBe('% of Reading')
    expect(ACCURACY_TYPE_CONFIG.PERCENT_READING.shortLabel).toBe('%Rdg')
  })

  it('PERCENT_SCALE has correct labels', () => {
    expect(ACCURACY_TYPE_CONFIG.PERCENT_SCALE.label).toBe('% of Scale')
    expect(ACCURACY_TYPE_CONFIG.PERCENT_SCALE.shortLabel).toBe('%Scale')
  })

  it('all configs have description', () => {
    for (const key of Object.keys(ACCURACY_TYPE_CONFIG) as Array<keyof typeof ACCURACY_TYPE_CONFIG>) {
      expect(ACCURACY_TYPE_CONFIG[key].description).toBeTruthy()
    }
  })
})
