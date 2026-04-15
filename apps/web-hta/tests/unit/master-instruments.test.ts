/**
 * Master Instruments Utility Tests
 *
 * Tests for instrument-related pure functions including:
 * - Type guards (isParameterCapability, isReferenceDoc)
 * - Display value formatters
 * - Date parsing
 * - Status calculation
 * - Capability filtering and matching
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  isParameterCapability,
  isReferenceDoc,
  getDisplayValue,
  getSimpleValue,
  parseDueDate,
  calculateInstrumentStatus,
  extractCapabilities,
  canMeasureParameter,
  coversRange,
  enrichInstrument,
  getParameterGroups,
  getParameterGroupsForCategory,
  filterByParameterGroup,
  hasCapability,
  hasRole,
  getAllCapabilities,
  getSopReferences,
  PARAMETER_TYPES,
  CATEGORY_LABELS,
  STATUS_CONFIG,
  type MasterInstrument,
  type ParameterCapability,
  type ReferenceDoc,
  type RangeItem,
} from '@/lib/master-instruments'

describe('Type Guards', () => {
  describe('isParameterCapability', () => {
    it('returns true for valid ParameterCapability', () => {
      const item: RangeItem = {
        parameter: 'Temperature',
        min: '-40',
        max: '200',
        unit: '°C',
      }
      expect(isParameterCapability(item)).toBe(true)
    })

    it('returns false for ReferenceDoc', () => {
      const item: RangeItem = { referencedoc: 'ISO 17025' }
      expect(isParameterCapability(item)).toBe(false)
    })

    it('returns false for partial ParameterCapability', () => {
      const item = { parameter: 'Temperature' } as RangeItem
      expect(isParameterCapability(item)).toBe(false)
    })
  })

  describe('isReferenceDoc', () => {
    it('returns true for valid ReferenceDoc', () => {
      const item: RangeItem = { referencedoc: 'ISO 17025' }
      expect(isReferenceDoc(item)).toBe(true)
    })

    it('returns false for ParameterCapability', () => {
      const item: RangeItem = {
        parameter: 'Temperature',
        min: '-40',
        max: '200',
        unit: '°C',
      }
      expect(isReferenceDoc(item)).toBe(false)
    })
  })
})

describe('Display Value Functions', () => {
  describe('getDisplayValue', () => {
    it('returns string value as-is', () => {
      expect(getDisplayValue('Fluke')).toBe('Fluke')
    })

    it('formats CompositeValue with both ind and sen', () => {
      const value = { ind: 'IND123', sen: 'SEN456' }
      expect(getDisplayValue(value)).toBe('Ind: IND123 / Sen: SEN456')
    })

    it('formats CompositeValue with only ind', () => {
      const value = { ind: 'IND123' }
      expect(getDisplayValue(value)).toBe('Ind: IND123')
    })

    it('formats CompositeValue with only sen', () => {
      const value = { sen: 'SEN456' }
      expect(getDisplayValue(value)).toBe('Sen: SEN456')
    })

    it('returns empty string for empty CompositeValue', () => {
      const value = {}
      expect(getDisplayValue(value)).toBe('')
    })
  })

  describe('getSimpleValue', () => {
    it('returns string value as-is', () => {
      expect(getSimpleValue('Fluke')).toBe('Fluke')
    })

    it('returns ind value from CompositeValue', () => {
      const value = { ind: 'IND123', sen: 'SEN456' }
      expect(getSimpleValue(value)).toBe('IND123')
    })

    it('returns sen value when ind is missing', () => {
      const value = { sen: 'SEN456' }
      expect(getSimpleValue(value)).toBe('SEN456')
    })

    it('returns empty string for empty CompositeValue', () => {
      const value = {}
      expect(getSimpleValue(value)).toBe('')
    })
  })
})

describe('Date Parsing', () => {
  describe('parseDueDate', () => {
    it('parses MM/DD/YYYY format correctly', () => {
      const result = parseDueDate('03/15/2024')
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(2) // March (0-indexed)
      expect(result!.getDate()).toBe(15)
      expect(result!.getFullYear()).toBe(2024)
    })

    it('parses different month/day combinations', () => {
      const result = parseDueDate('12/31/2025')
      expect(result).not.toBeNull()
      expect(result!.getMonth()).toBe(11) // December
      expect(result!.getDate()).toBe(31)
      expect(result!.getFullYear()).toBe(2025)
    })

    it('returns null for empty string', () => {
      expect(parseDueDate('')).toBeNull()
    })

    it('returns null for invalid date string', () => {
      const result = parseDueDate('invalid-date')
      // It will try to parse as Date but may return null for invalid
      expect(result === null || isNaN(result.getTime())).toBe(true)
    })

    it('handles ISO format as fallback', () => {
      const result = parseDueDate('2024-03-15')
      expect(result).not.toBeNull()
      expect(result!.getFullYear()).toBe(2024)
    })
  })
})

describe('Instrument Status Calculation', () => {
  describe('calculateInstrumentStatus', () => {
    beforeEach(() => {
      // Mock date to a fixed point: 2026-04-15
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 3, 15))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    const createInstrument = (
      nextDueOn: string,
      remarks = ''
    ): MasterInstrument => ({
      id: 1,
      type: 'Thermal',
      instrument_desc: 'Test Instrument',
      make: 'TestMake',
      model: 'TestModel',
      asset_no: 'A001',
      instrument_sl_no: 'SL001',
      usage: 'For Lab',
      calibrated_at: 'Lab A',
      report_no: 'RPT001',
      next_due_on: nextDueOn,
      range: [],
      remarks,
    })

    it('returns VALID for date > 14 days away', () => {
      // Due on May 15, 2026 (30 days from April 15)
      const instrument = createInstrument('05/15/2026')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('VALID')
      expect(result.daysUntilExpiry).toBe(30)
    })

    it('returns EXPIRING_SOON for date within 14 days', () => {
      // Due on April 25, 2026 (10 days from April 15)
      const instrument = createInstrument('04/25/2026')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('EXPIRING_SOON')
      expect(result.daysUntilExpiry).toBe(10)
    })

    it('returns EXPIRING_SOON for exactly 14 days', () => {
      // Due on April 29, 2026 (14 days from April 15)
      const instrument = createInstrument('04/29/2026')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('EXPIRING_SOON')
      expect(result.daysUntilExpiry).toBe(14)
    })

    it('returns EXPIRED for past due date', () => {
      // Due on April 1, 2026 (14 days ago)
      const instrument = createInstrument('04/01/2026')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('EXPIRED')
      expect(result.daysUntilExpiry).toBeLessThan(0)
    })

    it('returns UNDER_RECAL for "under recal" in remarks', () => {
      const instrument = createInstrument('05/15/2026', 'Under recal since Jan')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('UNDER_RECAL')
    })

    it('returns SERVICE_PENDING for "service request" in remarks', () => {
      const instrument = createInstrument('05/15/2026', 'Service request pending')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('SERVICE_PENDING')
    })

    it('returns SERVICE_PENDING for "SRF raised" in remarks', () => {
      const instrument = createInstrument('05/15/2026', 'SRF raised on 03/01')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('SERVICE_PENDING')
    })

    it('returns VALID with 999 days for missing due date', () => {
      const instrument = createInstrument('')
      const result = calculateInstrumentStatus(instrument)
      expect(result.status).toBe('VALID')
      expect(result.daysUntilExpiry).toBe(999)
    })
  })
})

describe('Capability Functions', () => {
  describe('extractCapabilities', () => {
    it('extracts only ParameterCapability items', () => {
      const range: RangeItem[] = [
        { parameter: 'Temperature', min: '-40', max: '200', unit: '°C' },
        { referencedoc: 'ISO 17025' },
        { parameter: 'Humidity', min: '10', max: '90', unit: '%RH' },
      ]
      const capabilities = extractCapabilities(range)
      expect(capabilities).toHaveLength(2)
      expect(capabilities[0].parameter).toBe('Temperature')
      expect(capabilities[1].parameter).toBe('Humidity')
    })

    it('returns empty array for no capabilities', () => {
      const range: RangeItem[] = [{ referencedoc: 'ISO 17025' }]
      const capabilities = extractCapabilities(range)
      expect(capabilities).toHaveLength(0)
    })

    it('returns empty array for empty range', () => {
      expect(extractCapabilities([])).toHaveLength(0)
    })
  })

  describe('canMeasureParameter', () => {
    const createInstrumentWithCaps = (
      caps: ParameterCapability[]
    ): MasterInstrument => ({
      id: 1,
      type: 'Thermal',
      instrument_desc: 'Test Instrument',
      make: 'TestMake',
      model: 'TestModel',
      asset_no: 'A001',
      instrument_sl_no: 'SL001',
      usage: 'For Lab',
      calibrated_at: 'Lab A',
      report_no: 'RPT001',
      next_due_on: '12/31/2025',
      range: caps,
      remarks: '',
    })

    it('returns true when capability matches parameter', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '-40', max: '200', unit: '°C' },
      ])
      expect(canMeasureParameter(instrument, 'Temperature')).toBe(true)
    })

    it('returns true for case-insensitive match', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '-40', max: '200', unit: '°C' },
      ])
      expect(canMeasureParameter(instrument, 'temperature')).toBe(true)
    })

    it('returns true for partial match', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'DC Voltage', min: '0', max: '1000', unit: 'V' },
      ])
      expect(canMeasureParameter(instrument, 'Voltage')).toBe(true)
    })

    it('returns false when no matching capability', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '-40', max: '200', unit: '°C' },
      ])
      expect(canMeasureParameter(instrument, 'Pressure')).toBe(false)
    })

    it('returns true when no capabilities (assumes all)', () => {
      const instrument = createInstrumentWithCaps([])
      expect(canMeasureParameter(instrument, 'Anything')).toBe(true)
    })
  })

  describe('coversRange', () => {
    const createInstrumentWithCaps = (
      caps: ParameterCapability[]
    ): MasterInstrument => ({
      id: 1,
      type: 'Thermal',
      instrument_desc: 'Test',
      make: 'Test',
      model: 'Test',
      asset_no: 'A001',
      instrument_sl_no: 'SL001',
      usage: 'For Lab',
      calibrated_at: 'Lab',
      report_no: 'RPT',
      next_due_on: '12/31/2025',
      range: caps,
      remarks: '',
    })

    it('returns true when instrument range covers required range', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '-40', max: '200', unit: '°C' },
      ])
      expect(coversRange(instrument, 'Temperature', 0, 100)).toBe(true)
    })

    it('returns true for exact match', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '0', max: '100', unit: '°C' },
      ])
      expect(coversRange(instrument, 'Temperature', 0, 100)).toBe(true)
    })

    it('returns false when required range exceeds capability', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: '0', max: '100', unit: '°C' },
      ])
      // Required max exceeds instrument max
      expect(coversRange(instrument, 'Temperature', 0, 200)).toBe(false)
    })

    it('returns true when no matching capability found', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Humidity', min: '10', max: '90', unit: '%' },
      ])
      expect(coversRange(instrument, 'Temperature', 0, 100)).toBe(true)
    })

    it('returns true when capability values are non-numeric', () => {
      const instrument = createInstrumentWithCaps([
        { parameter: 'Temperature', min: 'Low', max: 'High', unit: '' },
      ])
      expect(coversRange(instrument, 'Temperature', 0, 100)).toBe(true)
    })
  })
})

describe('Instrument Enrichment', () => {
  describe('enrichInstrument', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 3, 15))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('adds computed fields to instrument', () => {
      const instrument: MasterInstrument = {
        id: 1,
        type: 'Thermal',
        instrument_desc: 'Thermometer',
        make: 'Fluke',
        model: 'F52',
        asset_no: 'A001',
        instrument_sl_no: 'SL001',
        usage: 'For Lab',
        calibrated_at: 'Lab A',
        report_no: 'RPT001',
        next_due_on: '05/15/2026',
        range: [{ parameter: 'Temperature', min: '-40', max: '200', unit: '°C' }],
        remarks: '',
      }

      const enriched = enrichInstrument(instrument)

      expect(enriched.status).toBe('VALID')
      expect(enriched.daysUntilExpiry).toBe(30)
      expect(enriched.parsedDueDate).toBeInstanceOf(Date)
      expect(enriched.capabilities).toHaveLength(1)
    })

    it('handles instrument with no capabilities', () => {
      const instrument: MasterInstrument = {
        id: 1,
        type: 'Thermal',
        instrument_desc: 'Thermometer',
        make: 'Fluke',
        model: 'F52',
        asset_no: 'A001',
        instrument_sl_no: 'SL001',
        usage: 'For Lab',
        calibrated_at: 'Lab A',
        report_no: 'RPT001',
        next_due_on: '05/15/2026',
        range: [{ referencedoc: 'ISO 17025' }],
        remarks: '',
      }

      const enriched = enrichInstrument(instrument)

      expect(enriched.status).toBe('VALID')
      expect(enriched.capabilities).toBeUndefined()
    })
  })
})

describe('Parameter Group Functions', () => {
  const instruments: MasterInstrument[] = [
    {
      id: 1,
      type: 'Electro-Technical',
      parameter_group: 'Electrical (multi-function)',
      instrument_desc: 'Multimeter',
      make: 'Fluke',
      model: 'F87',
      asset_no: 'A001',
      instrument_sl_no: 'SL001',
      usage: 'For Lab',
      calibrated_at: 'Lab',
      report_no: 'RPT',
      next_due_on: '12/31/2025',
      range: [],
      remarks: '',
    },
    {
      id: 2,
      type: 'Electro-Technical',
      parameter_group: 'Electrical (power)',
      instrument_desc: 'Power Analyzer',
      make: 'Hioki',
      model: 'PW3337',
      asset_no: 'A002',
      instrument_sl_no: 'SL002',
      usage: 'For Lab',
      calibrated_at: 'Lab',
      report_no: 'RPT',
      next_due_on: '12/31/2025',
      range: [],
      remarks: '',
    },
    {
      id: 3,
      type: 'Thermal',
      parameter_group: 'Temperature (contact)',
      instrument_desc: 'Thermocouple',
      make: 'Omega',
      model: 'TC-K',
      asset_no: 'A003',
      instrument_sl_no: 'SL003',
      usage: 'For Lab',
      calibrated_at: 'Lab',
      report_no: 'RPT',
      next_due_on: '12/31/2025',
      range: [],
      remarks: '',
    },
    {
      id: 4,
      type: 'Electro-Technical',
      instrument_desc: 'Basic Meter',
      make: 'Generic',
      model: 'GM100',
      asset_no: 'A004',
      instrument_sl_no: 'SL004',
      usage: 'For Lab',
      calibrated_at: 'Lab',
      report_no: 'RPT',
      next_due_on: '12/31/2025',
      range: [],
      remarks: '',
    },
  ]

  describe('getParameterGroups', () => {
    it('extracts unique parameter groups', () => {
      const groups = getParameterGroups(instruments)
      expect(groups).toHaveLength(3)
      expect(groups).toContain('Electrical (multi-function)')
      expect(groups).toContain('Electrical (power)')
      expect(groups).toContain('Temperature (contact)')
    })

    it('returns sorted array', () => {
      const groups = getParameterGroups(instruments)
      expect(groups).toEqual([...groups].sort())
    })

    it('returns empty array for no groups', () => {
      const noGroupInstruments = [
        { ...instruments[0], parameter_group: undefined },
      ]
      expect(getParameterGroups(noGroupInstruments)).toHaveLength(0)
    })
  })

  describe('getParameterGroupsForCategory', () => {
    it('returns groups for specific category', () => {
      const groups = getParameterGroupsForCategory(
        instruments,
        'Electro-Technical'
      )
      expect(groups).toHaveLength(2)
      expect(groups).toContain('Electrical (multi-function)')
      expect(groups).toContain('Electrical (power)')
    })

    it('excludes groups from other categories', () => {
      const groups = getParameterGroupsForCategory(
        instruments,
        'Electro-Technical'
      )
      expect(groups).not.toContain('Temperature (contact)')
    })

    it('returns empty for category with no groups', () => {
      const groups = getParameterGroupsForCategory(instruments, 'Mechanical')
      expect(groups).toHaveLength(0)
    })
  })

  describe('filterByParameterGroup', () => {
    it('filters by category only', () => {
      const filtered = filterByParameterGroup(instruments, 'Electro-Technical')
      expect(filtered).toHaveLength(3)
    })

    it('filters by category and parameter group', () => {
      const filtered = filterByParameterGroup(
        instruments,
        'Electro-Technical',
        'Electrical (multi-function)'
      )
      expect(filtered).toHaveLength(1)
      expect(filtered[0].id).toBe(1)
    })

    it('returns empty for non-matching filter', () => {
      const filtered = filterByParameterGroup(
        instruments,
        'Thermal',
        'Non-existent'
      )
      expect(filtered).toHaveLength(0)
    })
  })
})

describe('Parameter Metadata Functions', () => {
  const instrumentWithMeta: MasterInstrument = {
    id: 1,
    type: 'Electro-Technical',
    instrument_desc: 'Calibrator',
    make: 'Fluke',
    model: 'F5520A',
    asset_no: 'A001',
    instrument_sl_no: 'SL001',
    usage: 'For Lab',
    calibrated_at: 'Lab',
    report_no: 'RPT',
    next_due_on: '12/31/2025',
    range: [],
    remarks: '',
    parameter: {
      role: ['source', 'measuring'],
      capabilities: ['DC Voltage', 'AC Voltage', 'DC Current'],
    },
    sop_references: ['SOP-001', 'SOP-002'],
  }

  const instrumentWithoutMeta: MasterInstrument = {
    id: 2,
    type: 'Thermal',
    instrument_desc: 'Basic Thermometer',
    make: 'Generic',
    model: 'T100',
    asset_no: 'A002',
    instrument_sl_no: 'SL002',
    usage: 'For Lab',
    calibrated_at: 'Lab',
    report_no: 'RPT',
    next_due_on: '12/31/2025',
    range: [],
    remarks: '',
  }

  describe('hasCapability', () => {
    it('returns true for exact capability match', () => {
      expect(hasCapability(instrumentWithMeta, 'DC Voltage')).toBe(true)
    })

    it('returns true for case-insensitive match', () => {
      expect(hasCapability(instrumentWithMeta, 'dc voltage')).toBe(true)
    })

    it('returns true for partial match', () => {
      expect(hasCapability(instrumentWithMeta, 'Voltage')).toBe(true)
    })

    it('returns false for non-matching capability', () => {
      expect(hasCapability(instrumentWithMeta, 'Temperature')).toBe(false)
    })

    it('returns false when instrument has no capabilities', () => {
      expect(hasCapability(instrumentWithoutMeta, 'Anything')).toBe(false)
    })
  })

  describe('hasRole', () => {
    it('returns true when instrument has source role', () => {
      expect(hasRole(instrumentWithMeta, 'source')).toBe(true)
    })

    it('returns true when instrument has measuring role', () => {
      expect(hasRole(instrumentWithMeta, 'measuring')).toBe(true)
    })

    it('returns false when instrument lacks parameter metadata', () => {
      expect(hasRole(instrumentWithoutMeta, 'source')).toBe(false)
    })
  })

  describe('getAllCapabilities', () => {
    it('extracts unique capabilities from all instruments', () => {
      const instruments = [instrumentWithMeta, instrumentWithoutMeta]
      const caps = getAllCapabilities(instruments)
      expect(caps).toHaveLength(3)
      expect(caps).toContain('DC Voltage')
      expect(caps).toContain('AC Voltage')
      expect(caps).toContain('DC Current')
    })

    it('returns sorted array', () => {
      const caps = getAllCapabilities([instrumentWithMeta])
      expect(caps).toEqual([...caps].sort())
    })

    it('returns empty array when no capabilities', () => {
      expect(getAllCapabilities([instrumentWithoutMeta])).toHaveLength(0)
    })
  })

  describe('getSopReferences', () => {
    it('returns SOP references array', () => {
      const refs = getSopReferences(instrumentWithMeta)
      expect(refs).toEqual(['SOP-001', 'SOP-002'])
    })

    it('returns empty array when no SOP references', () => {
      expect(getSopReferences(instrumentWithoutMeta)).toEqual([])
    })
  })
})

describe('Constants', () => {
  describe('PARAMETER_TYPES', () => {
    it('contains expected parameter types', () => {
      expect(PARAMETER_TYPES).toContain('Temperature')
      expect(PARAMETER_TYPES).toContain('Voltage')
      expect(PARAMETER_TYPES).toContain('Pressure')
      expect(PARAMETER_TYPES.length).toBeGreaterThan(10)
    })
  })

  describe('CATEGORY_LABELS', () => {
    it('has labels for all categories', () => {
      expect(CATEGORY_LABELS['Electro-Technical']).toBe('Electro-Technical')
      expect(CATEGORY_LABELS['Thermal']).toBe('Thermal')
      expect(CATEGORY_LABELS['Source']).toBe('Source Instruments')
    })
  })

  describe('STATUS_CONFIG', () => {
    it('has config for all statuses', () => {
      expect(STATUS_CONFIG['VALID'].label).toBe('Valid')
      expect(STATUS_CONFIG['EXPIRED'].label).toBe('Expired')
      expect(STATUS_CONFIG['EXPIRING_SOON'].color).toContain('amber')
    })
  })
})
