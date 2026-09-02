import React, { type ReactElement, type ReactNode } from 'react'
import { cleanup, render, screen, within } from '@testing-library/react'
import { Text, View } from '@react-pdf/renderer'
import { afterEach, describe, expect, it } from 'vitest'
import { CalibrationResultsTable } from '@/components/certificate/CalibrationResultsTable'
import { CalibrationCertificatePDF } from '@/components/pdf/CalibrationCertificatePDF'
import { useCertificateStore } from '@/lib/stores/certificate-store'

afterEach(cleanup)

const failedParameter = {
  id: 'parameter-1',
  parameterName: 'Temperature',
  parameterUnit: '°C',
  leastCountValue: '0.1',
  requiresBinning: false,
  bins: [],
  showAfterAdjustment: false,
  results: [{
    id: 'result-1',
    pointNumber: 1,
    standardReading: '10',
    beforeAdjustment: '12',
    afterAdjustment: '',
    errorObserved: -2,
    isOutOfLimit: true,
  }],
}

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

describe('failed calibration point presentation', () => {
  it('renders failed points in the shared certificate table in red and bold with Fail*', () => {
    const parameterWithPass = {
      ...failedParameter,
      results: [
        ...failedParameter.results,
        {
          ...failedParameter.results[0],
          id: 'result-2',
          pointNumber: 2,
          standardReading: '20',
          beforeAdjustment: '20',
          errorObserved: 0,
          isOutOfLimit: false,
        },
      ],
    }
    render(<CalibrationResultsTable parameters={[parameterWithPass]} />)

    const failedStatus = screen.getByText('Fail*')
    const failedRow = failedStatus.closest('tr')!
    expect(failedStatus).toHaveClass('font-bold')
    expect(failedRow).toHaveClass('text-red-700', 'font-bold')
    for (const cell of within(failedRow).getAllByRole('cell').slice(0, -1)) {
      expect(cell).toHaveClass('text-red-700', 'font-bold')
    }

    const passingRow = screen.getByText('OK').closest('tr')!
    expect(passingRow).not.toHaveClass('text-red-700', 'font-bold')
  })

  it('renders failed points in the PDF in red and bold with Fail*', () => {
    const defaultData = useCertificateStore.getState().formData
    const data = {
      ...defaultData,
      parameters: [{
        ...defaultData.parameters[0],
        ...failedParameter,
      }],
      selectedConclusionStatements: ['out_of_accuracy'],
    }

    const document = CalibrationCertificatePDF({ data })
    const textElements = collectElements(document).filter((element) => element.type === Text)
    const failedStatus = textElements.find((element) => textContent(element) === 'Fail*')
    const failedReading = textElements.find((element) => textContent(element) === '10.0')
    const failedUucReading = textElements.find((element) => textContent(element) === '12.0')
    const failedError = textElements.find((element) => textContent(element) === '-2.0')

    expect(failedStatus).toBeDefined()
    expect(flattenStyle(failedStatus?.props.style)).toMatchObject({
      color: '#dc2626',
      fontFamily: 'Helvetica-Bold',
    })
    expect(flattenStyle(failedReading?.props.style)).toMatchObject({
      color: '#dc2626',
      fontFamily: 'Helvetica-Bold',
    })
    expect(flattenStyle(failedUucReading?.props.style)).toMatchObject({
      color: '#dc2626',
      fontFamily: 'Helvetica-Bold',
    })
    expect(flattenStyle(failedError?.props.style)).toMatchObject({
      color: '#dc2626',
      fontFamily: 'Helvetica-Bold',
    })
    expect(textElements.some((element) => textContent(element) === '10.0*')).toBe(false)
    expect(textElements.some((element) => textContent(element) === '12.0*')).toBe(false)
    expect(textElements.some((element) => textContent(element) === '-2.0*')).toBe(false)

    const conclusionMarker = textElements.find((element) => textContent(element) === '"*"')
    expect(flattenStyle(conclusionMarker?.props.style)).toMatchObject({
      color: '#dc2626',
      fontFamily: 'Helvetica-Bold',
    })
  })

  it('keeps Fail* visible when a failed PDF point has no calculated error', () => {
    const defaultData = useCertificateStore.getState().formData
    const data = {
      ...defaultData,
      parameters: [{
        ...defaultData.parameters[0],
        ...failedParameter,
        results: [{ ...failedParameter.results[0], errorObserved: null }],
      }],
    }

    const document = CalibrationCertificatePDF({ data })
    const textElements = collectElements(document).filter((element) => element.type === Text)

    expect(textElements.some((element) => textContent(element) === 'Fail*')).toBe(true)
  })
})

describe('PDF conclusion and signature pagination', () => {
  it('keeps conclusion, validity, signatures, and customer acknowledgment in one non-wrapping block', () => {
    const defaultData = useCertificateStore.getState().formData
    const data = {
      ...defaultData,
      selectedConclusionStatements: ['out_of_accuracy'],
    }
    const signatures = {
      customer: {
        name: 'Customer Signatory',
        companyName: 'Customer Company',
        email: 'customer@example.com',
        signedAt: '2026-08-31T10:00:00.000Z',
        signatureId: 'customer-signature-id',
      },
    }

    const document = CalibrationCertificatePDF({ data, signatures })
    const atomicGroup = collectElements(document).find((element) => {
      if (element.type !== View || element.props.wrap !== false) return false

      const content = textContent(element)
      return content.includes('Conclusion')
        && content.includes('The results reported in this Certificate are valid')
        && content.includes('CALIBRATED BY:')
        && content.includes('CUSTOMER ACKNOWLEDGMENT')
    })

    expect(atomicGroup).toBeDefined()
  })
})
