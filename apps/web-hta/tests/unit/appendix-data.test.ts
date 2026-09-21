/**
 * What the appendix decides to print.
 *
 * The rules it encodes, each of which came from looking at the real data:
 *   - only photographed points appear;
 *   - a column is measured, computed or recorded because its declaration says so,
 *     never because of what its value looks like;
 *   - the error follows the direction errorConfig declares;
 *   - tables are keyed by position, because one certificate has two parameters with
 *     the same name;
 *   - a photograph whose point has been deleted is counted, not silently dropped.
 */
import { describe, expect, it } from 'vitest'

import {
  buildAppendixData,
  columnKind,
  columnRule,
  coverageLine,
  errorRule,
  tableColumns,
  type AppendixParameter,
  type AppendixPhoto,
} from '@/lib/certificate/appendix-data'
import type { ErrorConfig, FieldDefinition } from '@/lib/certificate/fields'

const master: FieldDefinition = {
  id: 'm1', name: 'Standard Meter Reading', group: 'master', type: 'numeric', unit: '°C', order: 0,
}
const uuc: FieldDefinition = {
  id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0,
}
const errorConfig: ErrorConfig = { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B', unit: '°C' }

/** HTA/S22734/165/26's shape: two measured columns and an error. */
const legacy = (over: Partial<AppendixParameter> = {}): AppendixParameter => ({
  parameterName: 'Temperature (Absolute)',
  parameterUnit: '°C',
  fieldDefinitions: [master, uuc],
  errorConfig,
  results: [
    { pointNumber: 1, values: { m1: '-5.00', u1: '-5.10' }, errorObserved: 0.1 },
    { pointNumber: 2, values: { m1: '15.00', u1: '15.20' }, errorObserved: -0.2 },
    { pointNumber: 3, values: { m1: '30.00', u1: '30.05' }, errorObserved: -0.05 },
  ],
  ...over,
})

const photo = (over: Partial<AppendixPhoto> = {}): AppendixPhoto => ({
  id: 'p1', imageType: 'READING_MASTER', parameterIndex: 0, pointNumber: 1,
  masterInstrumentIndex: null, fileName: 'a.jpg', dataUrl: 'data:,', ...over,
})

describe('what kind of column this is', () => {
  it('reads the declaration, never the value', () => {
    expect(columnKind({ ...master, type: 'numeric' })).toBe('measured')
    expect(columnKind({ ...master, type: 'expression' })).toBe('computed')
    expect(columnKind({ ...master, type: 'text' })).toBe('recorded')
  })

  it('says where a measured column was read, by its side of the table', () => {
    expect(columnRule(master, [master, uuc])).toBe('read from the master instrument')
    expect(columnRule(uuc, [master, uuc])).toBe('read from the unit')
  })

  it('says a recorded column was typed', () => {
    const note: FieldDefinition = { ...uuc, id: 't1', name: 'Probe Type', type: 'text', unit: '' }
    expect(columnRule(note, [note])).toBe('entered by the engineer')
  })

  it('prints a computed column as its formula in column names', () => {
    const source: FieldDefinition = { ...master, id: 'src', name: 'Source Output', unit: 'mV' }
    const derived: FieldDefinition = {
      ...master, id: 'd1', name: 'Standard Value', type: 'expression', expression: '{src} * 24.17', order: 1,
    }
    // Names, not ids: {src} on a customer's certificate would be a defect.
    expect(columnRule(derived, [source, derived])).toContain('Source Output')
    expect(columnRule(derived, [source, derived])).not.toContain('{src}')
  })

  it('says so when a formula cannot be read, rather than printing nothing', () => {
    const broken: FieldDefinition = { ...master, id: 'b1', type: 'expression', expression: '{{{' }
    expect(columnRule(broken, [broken])).toMatch(/could not be read/)
  })
})

describe('the error column', () => {
  it('is built from errorConfig, not looked up as a field', () => {
    const columns = tableColumns(legacy())
    const error = columns[columns.length - 1]
    expect(error.name).toBe('Error Observed')
    expect(error.rule).toBe('Standard Meter Reading − UUC Reading')
  })

  it('follows the declared direction', () => {
    expect(errorRule([master, uuc], { ...errorConfig, formula: 'B-A' }))
      .toBe('UUC Reading − Standard Meter Reading')
  })

  it('admits when it points at a column that is gone', () => {
    expect(errorRule([master], errorConfig)).toContain('no longer on this certificate')
  })

  it('comes last, after the columns it reads', () => {
    const names = tableColumns(legacy()).map((c) => c.name)
    expect(names).toEqual(['Standard Meter Reading', 'UUC Reading', 'Error Observed'])
  })
})

describe('which points appear', () => {
  it('shows only the photographed ones', () => {
    const data = buildAppendixData(
      [legacy()],
      [photo({ id: 'a', pointNumber: 1 }), photo({ id: 'b', pointNumber: 3 })],
    )
    expect(data.tables[0].points.map((p) => p.pointNumber)).toEqual([1, 3])
  })

  it('says which, so a reader does not wonder where point 2 went', () => {
    const data = buildAppendixData(
      [legacy()],
      [photo({ id: 'a', pointNumber: 1 }), photo({ id: 'b', pointNumber: 3 })],
    )
    expect(data.tables[0].coverage).toBe('Points 1 and 3 of 3 were photographed.')
  })

  it('drops a table nobody photographed rather than printing an empty section', () => {
    expect(buildAppendixData([legacy()], []).tables).toHaveLength(0)
  })

  it('counts a photograph whose point has been deleted', () => {
    // Live in production: point 6 was removed, its two photographs were not.
    const data = buildAppendixData(
      [legacy()],
      [photo({ id: 'a', pointNumber: 1 }), photo({ id: 'gone', pointNumber: 6 })],
    )
    expect(data.strandedCount).toBe(1)
    expect(data.tables[0].points.map((p) => p.pointNumber)).toEqual([1])
  })
})

describe('a point photographed on one side only', () => {
  it('keeps the side it has and leaves the other null', () => {
    // HTA/S22643/007/26: four points, seven photographs.
    const data = buildAppendixData([legacy()], [photo({ id: 'a', imageType: 'READING_MASTER' })])
    expect(data.tables[0].points[0].masterPhoto?.id).toBe('a')
    expect(data.tables[0].points[0].uucPhoto).toBeNull()
  })
})

describe('two tables with the same name', () => {
  it('keeps them apart, because they are keyed by position', () => {
    // HTA/S22734/165/26 has three parameters, two called "Temperature (Absolute)".
    const data = buildAppendixData(
      [legacy(), legacy()],
      [photo({ id: 'a', parameterIndex: 0 }), photo({ id: 'b', parameterIndex: 1 })],
    )
    expect(data.tables).toHaveLength(2)
    expect(data.tables[0].position).toBe('table 1 of 2')
    expect(data.tables[1].position).toBe('table 2 of 2')
  })

  it('heads a table by tableName when the engineer set one', () => {
    const data = buildAppendixData(
      [legacy({ tableName: 'Temperature Calibration' })],
      [photo()],
    )
    expect(data.tables[0].heading).toBe('Temperature Calibration')
  })

  it('falls back to the parameter name, as the body does', () => {
    expect(buildAppendixData([legacy()], [photo()])[('tables')][0].heading)
      .toBe('TEMPERATURE (ABSOLUTE)')
  })
})

describe('figure numbers', () => {
  it('run in one sequence across the whole appendix', () => {
    const data = buildAppendixData(
      [legacy()],
      [
        photo({ id: 'unit', imageType: 'UUC', parameterIndex: null, pointNumber: null }),
        photo({ id: 'mast', imageType: 'MASTER_INSTRUMENT', parameterIndex: null, pointNumber: null, masterInstrumentIndex: 0 }),
        photo({ id: 'r-m', imageType: 'READING_MASTER', pointNumber: 1 }),
        photo({ id: 'r-u', imageType: 'READING_UUC', pointNumber: 1 }),
      ],
    )
    // Unit, then masters, then readings - the order the appendix prints them.
    expect(data.figures).toEqual({ unit: 1, mast: 2, 'r-m': 3, 'r-u': 4 })
  })
})

describe('the figures at a point', () => {
  it('shows the error with its arithmetic, not just the answer', () => {
    const data = buildAppendixData([legacy()], [photo({ pointNumber: 1 })])
    const error = data.tables[0].points[0].values.find((v) => v.name === 'Error Observed')
    expect(error?.value).toContain('=')
    expect(error?.value).toContain('0.10')
  })

  it('brackets a negative so "15.00 - -0.20" never reaches a customer', () => {
    const data = buildAppendixData([legacy()], [photo({ pointNumber: 1 })])
    const error = data.tables[0].points[0].values.find((v) => v.name === 'Error Observed')
    expect(error?.value).toMatch(/\(-?−?5\.00\)|\(-5\.00\)/)
  })

  it('lists every column, not only the two the error reads', () => {
    const note: FieldDefinition = { id: 't1', name: 'Probe Type', group: 'uuc', type: 'text', unit: '', order: 5 }
    const param = legacy({
      fieldDefinitions: [master, uuc, note],
      results: [{ pointNumber: 1, values: { m1: '-5.00', u1: '-5.10', t1: 'Pt-100' }, errorObserved: 0.1 }],
    })
    const values = buildAppendixData([param], [photo({ pointNumber: 1 })]).tables[0].points[0].values
    expect(values.map((v) => v.name)).toEqual([
      'Standard Meter Reading', 'UUC Reading', 'Probe Type', 'Error Observed',
    ])
    expect(values.find((v) => v.name === 'Probe Type')?.value).toBe('Pt-100')
  })
})

describe('a parameter whose error reads two computed columns', () => {
  // The case the whole appendix exists for. The certificate stores readings, not
  // computed figures, so both sides of the error have nothing stored - and the working
  // silently disappeared until the computed columns were worked out and put back.
  const src: FieldDefinition = { id: 'src', name: 'Source Output', group: 'master', type: 'numeric', unit: 'mV', order: 0 }
  const stdv: FieldDefinition = { id: 'sv', name: 'Standard Value', group: 'master', type: 'expression', unit: '°C', order: 1, expression: '{src} * 24.17 + 0.83' }
  const ind: FieldDefinition = { id: 'ind', name: 'Indicated Output', group: 'uuc', type: 'numeric', unit: 'mV', order: 0 }
  const uucv: FieldDefinition = { id: 'uv', name: 'UUC Value', group: 'uuc', type: 'expression', unit: '°C', order: 1, expression: '{ind} * 24.17 + 0.83' }

  const derived = (): AppendixParameter => ({
    parameterName: 'Temperature (Thermocouple)', parameterUnit: '°C',
    fieldDefinitions: [src, stdv, ind, uucv],
    errorConfig: { masterFieldId: 'sv', uucFieldId: 'uv', formula: 'A-B', unit: '°C' },
    results: [{ pointNumber: 1, values: { src: '1.000', ind: '1.002' }, errorObserved: -0.04834 }],
  })

  const valuesOf = () =>
    buildAppendixData([derived()], [photo({ pointNumber: 1 })]).tables[0].points[0].values

  it('shows the error’s working, not just its answer', () => {
    const error = valuesOf().find((v) => v.name === 'Error Observed')
    expect(error?.value).toBe('25.00 − 25.05   =   -0.05 °C')
  })

  it('shows each computed column’s own working', () => {
    const standard = valuesOf().find((v) => v.name === 'Standard Value')
    expect(standard?.value).toContain('24.17')
    expect(standard?.value).toContain('=   25.00 °C')
  })

  it('keeps the measured inputs distinct, at the precision they were entered', () => {
    // Rounding these to the parameter's °C precision printed both as "1.00" - and the
    // difference between them is the entire reason there is an error.
    const values = valuesOf()
    expect(values.find((v) => v.name === 'Source Output')?.value).toBe('1.000 mV')
    expect(values.find((v) => v.name === 'Indicated Output')?.value).toBe('1.002 mV')
  })

  it('drops the arithmetic rather than printing a sum that does not add up', () => {
    // Operands are rounded for printing; the stored error is not. When the two disagree
    // in the last digit, the figures would read "25.00 - 25.05 = -0.04".
    const wrong = derived()
    wrong.results![0].errorObserved = -0.09
    const values = buildAppendixData([wrong], [photo({ pointNumber: 1 })]).tables[0].points[0].values
    expect(values.find((v) => v.name === 'Error Observed')?.value).toBe('-0.09 °C')
  })
})

describe('each side is rounded to the resolution it was read at', () => {
  // The master is a different instrument from the unit, with its own least count.
  // Rounding its column to the unit's resolution either invents digits it cannot
  // resolve or throws away ones it can.
  const src: FieldDefinition = { id: 'src', name: 'Source Output', group: 'master', type: 'numeric', unit: 'mV', order: 0 }
  const stdv: FieldDefinition = { id: 'sv', name: 'Standard Value', group: 'master', type: 'expression', unit: '°C', order: 1, expression: '{src} * 10' }
  const uucv: FieldDefinition = { id: 'uv', name: 'UUC Value', group: 'uuc', type: 'expression', unit: '°C', order: 0, expression: '{src} * 10 + 0.004' }

  const param = (masterLeastCount?: string): AppendixParameter => ({
    parameterName: 'Temperature', parameterUnit: '°C',
    leastCountValue: '0.01',
    masterLeastCount,
    fieldDefinitions: [src, stdv, uucv],
    errorConfig: { masterFieldId: 'sv', uucFieldId: 'uv', formula: 'A-B', unit: '°C' },
    results: [{ pointNumber: 1, values: { src: '2.5' }, errorObserved: -0.004 }],
  })

  const valueOf = (p: AppendixParameter, name: string) =>
    buildAppendixData([p], [photo({ pointNumber: 1 })]).tables[0].points[0].values
      .find((v) => v.name === name)?.value

  it('gives a master column the master’s resolution', () => {
    // Master reads to a thousandth, the unit to a hundredth.
    expect(valueOf(param('0.001'), 'Standard Value')).toContain('25.000 °C')
    expect(valueOf(param('0.001'), 'UUC Value')).toContain('25.00 °C')
  })

  it('falls back to the unit’s resolution when the master’s is not recorded', () => {
    // Every certificate written before the register carried a least count.
    expect(valueOf(param(undefined), 'Standard Value')).toContain('25.00 °C')
  })

  it('keeps a reading’s own resolution inside the working', () => {
    // 2.5 was entered as 2.5; the working must not print 2.500 or 3.
    expect(valueOf(param('0.001'), 'Standard Value')).toContain('2.5 × 10')
  })
})

describe('coverage wording', () => {
  it('handles the ordinary cases without reading oddly', () => {
    expect(coverageLine([1, 2, 3], 3)).toBe('All 3 points were photographed.')
    expect(coverageLine([2], 5)).toBe('Point 2 of 5 was photographed.')
    expect(coverageLine([1, 3, 4], 5)).toBe('Points 1, 3 and 4 of 5 were photographed.')
    expect(coverageLine([1], 1)).toBe('The single point was photographed.')
    expect(coverageLine([], 4)).toBe('None of the 4 points were photographed.')
  })
})
