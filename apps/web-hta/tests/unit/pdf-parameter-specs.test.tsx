/**
 * How the certificate attributes a specification to a parameter.
 *
 * Least count, accuracy, operating range and the calibration procedure used to be
 * flattened across every parameter into shared fields, so a certificate covering
 * temperature and pressure printed four unattributed lines and two procedures joined
 * by a comma. The reader inferred which was which from the units, and a binned
 * parameter broke even that.
 */
import React, { type ReactElement, type ReactNode } from 'react'
import { Text } from '@react-pdf/renderer'
import { describe, expect, it } from 'vitest'
import { CalibrationCertificatePDF } from '@/components/pdf/CalibrationCertificatePDF'
import { useCertificateStore } from '@/lib/stores/certificate-store'

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

function textsIn(data: unknown): string[] {
  const document = CalibrationCertificatePDF({ data } as never)
  return collectElements(document)
    .filter((element) => element.type === Text)
    .map(textContent)
}

const parameter = (over: Record<string, unknown>) => ({
  ...useCertificateStore.getState().formData.parameters[0],
  requiresBinning: false,
  bins: [],
  results: [],
  fieldDefinitions: [],
  ...over,
})

const temperature = parameter({
  id: 'p1',
  parameterName: 'Temperature',
  parameterUnit: '°C',
  rangeMin: '-10',
  rangeMax: '40',
  operatingMin: '-10',
  operatingMax: '40',
  leastCountValue: '0.1',
  accuracyValue: '0.5',
  accuracyType: 'ABSOLUTE',
  sopReference: 'NLAB/CAL/T01/R01',
})

const pressure = parameter({
  id: 'p2',
  parameterName: 'Pressure',
  parameterUnit: 'bar',
  rangeMin: '0',
  rangeMax: '600',
  operatingRangeNotApplicable: true,
  leastCountValue: '0.01',
  accuracyValue: '0.1',
  accuracyType: 'ABSOLUTE',
  sopReference: 'NLAB/CAL/P02/R01',
})

const master = (over: Record<string, unknown>) => ({
  id: 'm1',
  masterInstrumentId: 67,
  category: 'Thermal',
  description: 'RTD Thermometer',
  make: 'Fluke',
  model: '1524',
  assetNo: '966 HTAIPL/L',
  serialNumber: 'B12345',
  calibratedAt: 'NABL Lab',
  reportNo: '966/25',
  calibrationDueDate: '2027-03-12',
  isExpired: false,
  isExpiringSoon: false,
  ...over,
})

function certificateWith(parameters: unknown[], masterInstruments: unknown[] = []) {
  const defaults = useCertificateStore.getState().formData
  return { ...defaults, parameters, masterInstruments }
}

describe('a certificate covering one parameter', () => {
  const texts = () => textsIn(certificateWith([temperature]))

  it('prints no banner, since there is nothing to tell apart', () => {
    expect(texts().some((t) => t.includes('PARAMETER UNDER CALIBRATION ASSESSMENT'))).toBe(false)
  })

  it('still prints that parameter own specification', () => {
    const all = texts()
    expect(all).toContain('0.1 °C')
    expect(all.some((t) => t.includes('-10 to 40 °C'))).toBe(true)
  })

  it('keeps the procedure as one sentence rather than a table', () => {
    const all = texts()
    expect(all.some((t) => t.includes('HTA Cal Procedure NLAB/CAL/T01/R01'))).toBe(true)
    expect(all.some((t) => t === 'HTA Calibration SOP Reference')).toBe(false)
  })
})

describe('a certificate covering two parameters', () => {
  const texts = () => textsIn(certificateWith([temperature, pressure]))

  it('gives each parameter its own banner', () => {
    const all = texts()
    expect(all).toContain('PARAMETER UNDER CALIBRATION ASSESSMENT : Temperature')
    expect(all).toContain('PARAMETER UNDER CALIBRATION ASSESSMENT : Pressure')
  })

  it('states each least count under its own banner', () => {
    // The fault: both appeared in one cell, and nothing said which was which.
    const all = texts()
    expect(all).toContain('0.1 °C')
    expect(all).toContain('0.01 bar')
  })

  it('says Not Applicable where the operating range is not applicable', () => {
    expect(texts()).toContain('Not Applicable')
  })

  it('gives each parameter its own procedure row instead of a joined sentence', () => {
    const all = texts()
    expect(all.filter((t) => t === 'HTA Calibration SOP Reference')).toHaveLength(2)
    expect(all).toContain('NLAB/CAL/T01/R01')
    expect(all).toContain('NLAB/CAL/P02/R01')
    expect(all.some((t) => t.includes('NLAB/CAL/T01/R01, NLAB/CAL/P02/R01'))).toBe(false)
  })
})

describe('what the master resolves to', () => {
  it('prints the least count and accuracy snapshotted on the certificate', () => {
    const all = textsIn(
      certificateWith(
        [temperature],
        [
          master({
            parameterId: 'p1',
            capabilityParameter: 'Temperature',
            masterLeastCount: '0.001',
            masterLeastCountUnit: '°C',
            masterAccuracy: '0.05',
            masterAccuracyUnit: '°C',
          }),
        ],
      ),
    )
    expect(all).toContain('0.001 °C')
    expect(all).toContain('± 0.05 °C')
  })

  it('says the resolution is not recorded rather than printing a dash', () => {
    // 118 registry buckets state an accuracy and no least count. A dash reads as a
    // field nobody filled in.
    const all = textsIn(
      certificateWith(
        [temperature],
        [
          master({
            parameterId: 'p1',
            capabilityParameter: 'Temperature',
            masterAccuracy: '0.05',
            masterAccuracyUnit: '°C',
          }),
        ],
      ),
    )
    expect(all).toContain('Not recorded')
  })

  it('prints one table for an instrument used against two parameters', () => {
    const all = textsIn(
      certificateWith(
        [temperature, pressure],
        [
          master({
            id: 'm1',
            parameterId: 'p1',
            capabilityParameter: 'Temperature',
            masterLeastCount: '0.001',
            masterLeastCountUnit: '°C',
          }),
          master({
            id: 'm2',
            parameterId: 'p2',
            capabilityParameter: 'Temperature',
            masterLeastCount: '0.001',
            masterLeastCountUnit: '°C',
          }),
        ],
      ),
    )
    // Identity printed once, both uses listed underneath.
    expect(all.filter((t) => t === 'RTD Thermometer')).toHaveLength(1)
    expect(all).toContain('Used for UUC Parameters')
    expect(all).toContain('Pressure')
  })

  it('banners each capability where an instrument has two', () => {
    const all = textsIn(
      certificateWith(
        [temperature, pressure],
        [
          master({
            id: 'm1',
            parameterId: 'p1',
            capabilityParameter: 'Temperature',
            masterLeastCount: '0.001',
            masterLeastCountUnit: '°C',
          }),
          master({
            id: 'm2',
            parameterId: 'p2',
            capabilityParameter: 'DC Voltage',
            masterLeastCount: '0.0001',
            masterLeastCountUnit: 'mV',
          }),
        ],
      ),
    )
    expect(all).toContain('Master Parameter Used : Temperature')
    expect(all).toContain('Master Parameter Used : DC Voltage')
    expect(all).toContain('0.001 °C')
    expect(all).toContain('0.0001 mV')
  })

  it('does not put a sign in front of an accuracy that carries its own', () => {
    // 1000 HTAIPL/L states "+/- 0.1%FS" - a formula, not a figure. Prefixing it
    // printed "± +/- 0.1%FS".
    const all = textsIn(
      certificateWith(
        [temperature],
        [
          master({
            parameterId: 'p1',
            capabilityParameter: 'Pressure',
            masterAccuracy: '+/- 0.1%FS',
            masterAccuracyUnit: '',
          }),
        ],
      ),
    )
    expect(all).toContain('+/- 0.1%FS')
    expect(all.some((t) => t.includes('± +/-'))).toBe(false)
  })

  it('finds the parameter by position where the payload carries no id', () => {
    // The API's pdf-data route sends a position, the form sends an id, and both
    // reach this component. Matching only on the id left the table empty.
    const all = textsIn(
      certificateWith(
        [temperature, pressure],
        [
          master({ id: 'm1', parameterIndex: 0, capabilityParameter: 'Temperature' }),
          master({ id: 'm2', masterInstrumentId: 158, description: 'Digital Pressure Gauge', parameterIndex: 1, capabilityParameter: 'Pressure' }),
        ],
      ),
    )
    expect(all).toContain('Used for UUC Parameters')
    expect(all).toContain('Temperature')
    expect(all).toContain('Pressure')
  })

  it('does not sign an accuracy that carries its own', () => {
    // 1000 HTAIPL/L states "+/- 0.1%FS" - a formula, not a figure. Prefixing every
    // accuracy printed "± +/- 0.1%FS".
    const all = textsIn(
      certificateWith(
        [temperature],
        [
          master({
            parameterId: 'p1',
            capabilityParameter: 'Pressure',
            masterAccuracy: '+/- 0.1%FS',
            masterAccuracyUnit: '',
          }),
        ],
      ),
    )
    expect(all).toContain('+/- 0.1%FS')
    expect(all.some((t) => t.includes('± +/-'))).toBe(false)
  })

  it('finds the parameter by position where the payload carries no id', () => {
    // The API's pdf-data route sends a position and the form sends an id; both reach
    // this component. Matching only on the id left the used-for table empty.
    const all = textsIn(
      certificateWith(
        [temperature, pressure],
        [
          master({ id: 'm1', parameterIndex: 0, capabilityParameter: 'Temperature' }),
          master({
            id: 'm2',
            masterInstrumentId: 158,
            description: 'Digital Pressure Gauge',
            parameterIndex: 1,
            capabilityParameter: 'Pressure',
          }),
        ],
      ),
    )
    expect(all).toContain('Used for UUC Parameters')
    expect(all).toContain('Temperature')
    expect(all).toContain('Pressure')
  })


  it('drops the used-for table on a single-parameter certificate', () => {
    const all = textsIn(
      certificateWith(
        [temperature],
        [master({ parameterId: 'p1', capabilityParameter: 'Temperature' })],
      ),
    )
    expect(all).not.toContain('Used for UUC Parameters')
  })
})
