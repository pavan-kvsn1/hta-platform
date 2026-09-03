/**
 * The calibration table in the generated PDF.
 *
 * This is the document the customer receives and the lab signs. It is a different
 * component from the on-screen certificate view, so a column reaching one proves
 * nothing about the other - the two have to be checked separately.
 */
import React, { type ReactElement, type ReactNode } from 'react'
import { Text } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { CalibrationCertificatePDF } from '@/components/pdf/CalibrationCertificatePDF'
import { useCertificateStore } from '@/lib/stores/certificate-store'
import { resultValues } from '@/lib/certificate-fields'

function textContent(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join('')
  if (!React.isValidElement(node)) return ''
  return textContent((node.props as { children?: ReactNode }).children)
}

function collectElements(node: ReactNode, elements: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, elements))
    return elements
  }
  if (!React.isValidElement(node)) return elements
  elements.push(node)
  collectElements((node.props as { children?: ReactNode }).children, elements)
  return elements
}

function flattenStyle(style: unknown): Record<string, unknown> {
  const styles = Array.isArray(style) ? style : [style]
  return Object.assign({}, ...styles.filter((value) => value && typeof value === 'object'))
}

function textsIn(data: unknown): string[] {
  const document = CalibrationCertificatePDF({ data } as never)
  return collectElements(document)
    .filter((element) => element.type === Text)
    .map(textContent)
}

function certificateWith(parameter: Record<string, unknown>) {
  const defaultData = useCertificateStore.getState().formData
  return {
    ...defaultData,
    parameters: [{ ...defaultData.parameters[0], ...parameter }],
  }
}

const legacyParameter = {
  id: 'p1',
  parameterName: 'Temperature',
  parameterUnit: '°C',
  leastCountValue: '0.1',
  requiresBinning: false,
  bins: [],
  showAfterAdjustment: false,
  rangeMin: '0',
  rangeMax: '100',
  fieldDefinitions: [],
  results: [
    {
      id: 'r1',
      pointNumber: 1,
      standardReading: '50',
      beforeAdjustment: '50.2',
      afterAdjustment: '',
      errorObserved: 0.2,
      isOutOfLimit: false,
    },
  ],
}

const declaredParameter = {
  ...legacyParameter,
  tableName: 'Calibration of Surface Temperature',
  fieldDefinitions: [
    { id: 'm1', name: 'Master Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
    { id: 'm2', name: 'Ambient', group: 'master', type: 'numeric', unit: '°C', order: 1 },
    { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
    {
      id: 'u2',
      name: 'Adjusted',
      group: 'uuc',
      type: 'expression',
      unit: '°C',
      order: 1,
      expression: '{u1} + 0.5',
    },
  ],
  errorConfig: { masterFieldId: 'm1', uucFieldId: 'u1', formula: 'A-B', unit: '°C' },
  results: [
    {
      id: 'r1',
      pointNumber: 1,
      standardReading: '50',
      beforeAdjustment: '50.2',
      afterAdjustment: '',
      errorObserved: 0.2,
      isOutOfLimit: false,
      values: { m1: '50', m2: '23.4', u1: '50.2' },
    },
  ],
}

describe('a certificate written before Section 05', () => {
  it('keeps the fixed column headings', () => {
    const texts = textsIn(certificateWith(legacyParameter))
    expect(texts).toContain('Standard Meter')
    expect(texts).toContain('Reading (y)')
    expect(texts).toContain('UUC Reading')
    expect(texts).toContain('(±) z = (x-y)')
  })

  it('prints its readings as before', () => {
    const texts = textsIn(certificateWith(legacyParameter))
    expect(texts).toContain('50.0')
    expect(texts).toContain('50.2')
  })
})

describe('a certificate whose columns the engineer declared', () => {
  it('prints every declared column heading', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    // The name row carries the name and, for the two columns the error reads, its
    // alias. Units live in their own row beneath, not inside the name.
    for (const name of ['Master Reading (x)', 'Ambient', 'UUC Reading (y)', 'Adjusted']) {
      expect(texts).toContain(name)
    }
  })

  it('bands the columns under the instrument they belong to', () => {
    // Two tiers, as the results table has, rather than a suffix on each heading.
    const texts = textsIn(certificateWith(declaredParameter))
    expect(texts).toContain('Master Instrument')
    expect(texts).toContain('UUC')
    expect(texts).not.toContain('(Master)')
  })

  it('spans Error and Remarks across both header tiers', () => {
    // They belong to neither instrument, so a band cell above them would be an empty
    // box. Their header cell is twice a tier high instead.
    const document = CalibrationCertificatePDF({
      data: certificateWith(declaredParameter),
    } as never)
    const headers = collectElements(document).filter(
      (el) => el.type === Text && ['Error Observed', 'Remarks'].includes(textContent(el)),
    )
    expect(headers.length).toBeGreaterThanOrEqual(2)
    expect(headers.length).toBeGreaterThanOrEqual(2)

    // Each sits in a cell given an explicit double-tier height.
    const cells = collectElements(document).filter((el) => {
      const text = textContent(el)
      if (el.type === Text) return false
      return text.startsWith('Error Observed(±)') || text === 'Remarks'
    })
    const heights = cells
      .map((el) => flattenStyle((el.props as { style?: unknown }).style).minHeight)
      .filter((h): h is number => typeof h === 'number')
    expect(heights.length).toBeGreaterThanOrEqual(2)
    // Twice the tier the bands and the column names each get.
    expect(new Set(heights).size).toBe(1)
  })

  it('keeps units on their own row, not inside the column name', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    // The unit stands alone in the units tier of the multi-index header.
    expect(texts).toContain('°C')
    expect(texts.some((t) => t.includes('Reading (°C)'))).toBe(false)
  })

  it('states the error formula in aliases', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    // A-B is master minus UUC, which in aliases is x-y.
    expect(texts.some((t) => t.includes('z = (x-y)'))).toBe(true)
  })

  it('follows the configured direction rather than assuming one', () => {
    const reversed = {
      ...declaredParameter,
      errorConfig: { ...declaredParameter.errorConfig, formula: 'B-A' },
    }
    const texts = textsIn(certificateWith(reversed))
    expect(texts.some((t) => t.includes('z = (y-x)'))).toBe(true)
  })

  it('prints the table name under Parameter & Range', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    expect(texts).toContain('Calibration of Surface Temperature')
    // The parameter name no longer occupies that cell when a table name is set.
    expect(texts).not.toContain('TEMPERATURE')
  })

  it('falls back to the parameter name when no table name was given', () => {
    const unnamed = { ...declaredParameter, tableName: '' }
    expect(textsIn(certificateWith(unnamed))).toContain('TEMPERATURE')
  })

  it('drops the fixed headings it replaced', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    // The fixed layout's own column names are gone. Its error label is not a useful
    // marker any more: the declared header states the same formula when the direction
    // works out the same way.
    expect(texts).not.toContain('Standard Meter')
    expect(texts).not.toContain('Reading (y)')
    expect(texts).not.toContain('UUC Reading(x)')
  })

  it('prints the value entered in each column', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    expect(texts).toContain('50.0') // Master Reading
    expect(texts).toContain('23.4') // Ambient - absent entirely before this
    expect(texts).toContain('50.2') // UUC Reading
  })

  it('computes an expression column onto the page', () => {
    // Adjusted = UUC Reading + 0.5. Nothing stores this; it has to be computed at
    // render time or the certificate shows a blank column.
    const texts = textsIn(certificateWith(declaredParameter))
    expect(texts).toContain('50.7')
  })

  it('keeps the error and remarks columns at the end', () => {
    const texts = textsIn(certificateWith(declaredParameter))
    expect(texts).toContain('Error Observed')
    expect(texts).toContain('Remarks')
    expect(texts).toContain('Pass')
  })

  it('still marks a failed point', () => {
    const failed = {
      ...declaredParameter,
      results: [{ ...declaredParameter.results[0], isOutOfLimit: true }],
    }
    expect(textsIn(certificateWith(failed))).toContain('Fail*')
  })

  it('prints a dash where nothing was entered', () => {
    const sparse = {
      ...declaredParameter,
      results: [{ ...declaredParameter.results[0], values: { m1: '50' } }],
    }
    expect(textsIn(certificateWith(sparse))).toContain('-')
  })
})

describe('a row that predates the schema it now has', () => {
  // A certificate written before Section 05 whose columns were derived on a later
  // edit: the schema exists, but the stored row still holds only the legacy three.
  const halfMigrated = {
    ...declaredParameter,
    fieldDefinitions: [
      { id: 'm1', name: 'Master Reading', group: 'master', type: 'numeric', unit: '°C', order: 0 },
      { id: 'u1', name: 'UUC Reading', group: 'uuc', type: 'numeric', unit: '°C', order: 0 },
      { id: 'u2', name: 'After Adjustment', group: 'uuc', type: 'numeric', unit: '°C', order: 1 },
    ],
    results: [
      {
        id: 'r1',
        pointNumber: 1,
        standardReading: '50',
        beforeAdjustment: '50.2',
        afterAdjustment: '50.1',
        errorObserved: 0.2,
        isOutOfLimit: false,
        // No values map at all.
      },
    ],
  }

  it('prints the readings rather than empty columns', () => {
    const texts = textsIn(certificateWith(halfMigrated))
    expect(texts).toContain('50.0') // standardReading, onto the master column
    expect(texts).toContain('50.2') // beforeAdjustment, onto the UUC column
    expect(texts).toContain('50.1') // afterAdjustment, onto the second UUC column
  })

  it('maps each legacy reading onto the column that replaced it', () => {
    // Asserted on the mapping rather than the rendered page: a dash can come from any
    // empty field anywhere on the certificate, so counting them proves nothing.
    const [master, uuc, after] = halfMigrated.fieldDefinitions
    const mapped = resultValues(
      halfMigrated.results[0],
      halfMigrated.fieldDefinitions as never,
      { masterFieldId: master.id, uucFieldId: uuc.id, formula: 'A-B', unit: '°C' },
    )
    expect(mapped).toEqual({ [master.id]: '50', [uuc.id]: '50.2', [after.id]: '50.1' })
  })

  it('prefers the stored values when a row has them', () => {
    const withValues = { ...halfMigrated.results[0], values: { m1: '99' } }
    expect(
      resultValues(withValues, halfMigrated.fieldDefinitions as never, {
        masterFieldId: 'm1',
        uucFieldId: 'u1',
        formula: 'A-B',
        unit: '°C',
      }),
    ).toEqual({ m1: '99' })
  })

  it('maps nothing when there is no error config to map onto', () => {
    expect(resultValues(halfMigrated.results[0], halfMigrated.fieldDefinitions as never, null)).toEqual({})
  })
})
