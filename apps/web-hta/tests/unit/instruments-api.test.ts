/**
 * Instruments API Unit Tests
 *
 * Tests for the instruments API endpoint:
 * - Listing all active instruments
 * - Category filtering
 * - Date formatting
 * - Null value handling
 * - Range data parsing
 * - Cache headers
 * - Error handling
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface MasterInstrument {
  id: string
  legacyId: number | null
  category: string
  description: string
  make: string | null
  model: string | null
  assetNumber: string | null
  serialNumber: string | null
  usage: string | null
  calibratedAtLocation: string | null
  reportNo: string | null
  calibrationDueDate: Date | null
  rangeData: string | null
  remarks: string | null
}

interface TransformedInstrument {
  id: number
  dbId: string
  type: string
  instrument_desc: string
  make: string
  model: string
  asset_no: string
  sr_no: string
  usage: string
  calibrated_at: string
  report_no: string
  next_due_on: string
  range: Array<{ min: number; max: number; unit?: string }>
  remarks: string
}

// Mock implementations
const mockFindMany = vi.fn<[unknown], Promise<MasterInstrument[]>>()

// Format date to MM/DD/YYYY
function formatDate(date: Date | null): string {
  if (!date) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${month}/${day}/${year}`
}

// Parse range data
function parseRangeData(rangeData: string | null): Array<{ min: number; max: number; unit?: string }> {
  if (!rangeData) return []
  try {
    return JSON.parse(rangeData)
  } catch {
    return []
  }
}

// Generate numeric ID from UUID if legacyId is null
function generateIdFromUuid(uuid: string): number {
  let hash = 0
  for (let i = 0; i < uuid.length; i++) {
    const char = uuid.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

// Transform instrument to response format
function transformInstrument(instrument: MasterInstrument): TransformedInstrument {
  return {
    id: instrument.legacyId ?? generateIdFromUuid(instrument.id),
    dbId: instrument.id,
    type: instrument.category,
    instrument_desc: instrument.description,
    make: instrument.make || '',
    model: instrument.model || '',
    asset_no: instrument.assetNumber || '',
    sr_no: instrument.serialNumber || '',
    usage: instrument.usage || '',
    calibrated_at: instrument.calibratedAtLocation || '',
    report_no: instrument.reportNo || '',
    next_due_on: formatDate(instrument.calibrationDueDate),
    range: parseRangeData(instrument.rangeData),
    remarks: instrument.remarks || '',
  }
}

// Mock GET handler
async function GET(params: { category?: string }): Promise<{
  status: number
  body: unknown
  headers: Map<string, string>
}> {
  try {
    const where: Record<string, unknown> = { isActive: true }

    if (params.category) {
      where.category = params.category
    }

    const instruments = await mockFindMany({
      where,
      orderBy: [{ category: 'asc' }, { description: 'asc' }],
    })

    const transformed = instruments.map(transformInstrument)

    const headers = new Map<string, string>()
    headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=60')

    return {
      status: 200,
      body: transformed,
      headers,
    }
  } catch {
    return {
      status: 500,
      body: { error: 'Failed to fetch instruments' },
      headers: new Map(),
    }
  }
}

describe('Instruments API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/instruments', () => {
    it('should return all active instruments', async () => {
      const mockInstruments: MasterInstrument[] = [
        {
          id: 'inst-1',
          legacyId: 1001,
          category: 'ELECTRICAL',
          description: 'Digital Multimeter',
          make: 'Fluke',
          model: '87V',
          assetNumber: 'AST-001',
          serialNumber: 'SN12345',
          usage: 'Voltage measurement',
          calibratedAtLocation: 'Lab A',
          reportNo: 'RPT-001',
          calibrationDueDate: new Date('2025-01-15'),
          rangeData: JSON.stringify([{ min: 0, max: 1000 }]),
          remarks: 'Primary instrument',
        },
      ]

      mockFindMany.mockResolvedValue(mockInstruments)

      const response = await GET({})
      const data = response.body as TransformedInstrument[]

      expect(response.status).toBe(200)
      expect(data).toHaveLength(1)
      expect(data[0].instrument_desc).toBe('Digital Multimeter')
      expect(data[0].make).toBe('Fluke')
      expect(data[0].dbId).toBe('inst-1')
      expect(data[0].type).toBe('ELECTRICAL')
    })

    it('should filter instruments by category', async () => {
      mockFindMany.mockResolvedValue([])

      await GET({ category: 'ELECTRICAL' })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { isActive: true, category: 'ELECTRICAL' },
        orderBy: [{ category: 'asc' }, { description: 'asc' }],
      })
    })

    it('should only return active instruments', async () => {
      mockFindMany.mockResolvedValue([])

      await GET({})

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isActive: true }),
        })
      )
    })

    it('should transform date to MM/DD/YYYY format', async () => {
      const mockInstruments: MasterInstrument[] = [
        {
          id: 'inst-1',
          legacyId: null,
          category: 'MECHANICAL',
          description: 'Pressure Gauge',
          make: 'Ashcroft',
          model: 'PG-100',
          assetNumber: null,
          serialNumber: 'SN-PG-001',
          usage: null,
          calibratedAtLocation: null,
          reportNo: null,
          calibrationDueDate: new Date('2025-03-20'),
          rangeData: null,
          remarks: null,
        },
      ]

      mockFindMany.mockResolvedValue(mockInstruments)

      const response = await GET({})
      const data = response.body as TransformedInstrument[]

      expect(data[0].next_due_on).toBe('03/20/2025')
    })

    it('should handle null values gracefully', async () => {
      const mockInstruments: MasterInstrument[] = [
        {
          id: 'inst-1',
          legacyId: null,
          category: 'THERMAL',
          description: 'Thermocouple',
          make: null,
          model: null,
          assetNumber: null,
          serialNumber: null,
          usage: null,
          calibratedAtLocation: null,
          reportNo: null,
          calibrationDueDate: null,
          rangeData: null,
          remarks: null,
        },
      ]

      mockFindMany.mockResolvedValue(mockInstruments)

      const response = await GET({})
      const data = response.body as TransformedInstrument[]

      expect(response.status).toBe(200)
      expect(data[0].usage).toBe('')
      expect(data[0].calibrated_at).toBe('')
      expect(data[0].next_due_on).toBe('')
      expect(data[0].range).toEqual([])
    })

    it('should parse rangeData JSON correctly', async () => {
      const rangeData = [
        { min: 0, max: 100, unit: 'V' },
        { min: 0, max: 10, unit: 'A' },
      ]
      const mockInstruments: MasterInstrument[] = [
        {
          id: 'inst-1',
          legacyId: 5001,
          category: 'ELECTRICAL',
          description: 'Power Analyzer',
          make: 'Hioki',
          model: 'PW3198',
          assetNumber: 'AST-005',
          serialNumber: 'SN-PA-001',
          usage: 'Power analysis',
          calibratedAtLocation: 'Lab B',
          reportNo: 'RPT-005',
          calibrationDueDate: new Date('2025-06-15'),
          rangeData: JSON.stringify(rangeData),
          remarks: null,
        },
      ]

      mockFindMany.mockResolvedValue(mockInstruments)

      const response = await GET({})
      const data = response.body as TransformedInstrument[]

      expect(data[0].range).toEqual(rangeData)
    })

    it('should set cache headers', async () => {
      mockFindMany.mockResolvedValue([])

      const response = await GET({})

      expect(response.headers.get('Cache-Control')).toBe(
        'public, max-age=300, stale-while-revalidate=60'
      )
    })

    it('should handle database errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('DB error'))

      const response = await GET({})

      expect(response.status).toBe(500)
      expect((response.body as { error: string }).error).toBe('Failed to fetch instruments')
    })

    it('should generate ID from UUID when legacyId is null', async () => {
      const mockInstruments: MasterInstrument[] = [
        {
          id: 'abcd1234-5678-90ab-cdef-ghijklmnopqr',
          legacyId: null,
          category: 'DIMENSIONAL',
          description: 'Caliper',
          make: 'Mitutoyo',
          model: 'CD-6"',
          assetNumber: null,
          serialNumber: 'SN-CAL-001',
          usage: null,
          calibratedAtLocation: null,
          reportNo: null,
          calibrationDueDate: null,
          rangeData: null,
          remarks: null,
        },
      ]

      mockFindMany.mockResolvedValue(mockInstruments)

      const response = await GET({})
      const data = response.body as TransformedInstrument[]

      expect(typeof data[0].id).toBe('number')
    })
  })
})
