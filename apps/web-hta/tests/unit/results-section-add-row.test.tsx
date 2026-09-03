import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsSection } from '@/components/forms/ResultsSection'
import { useCertificateStore } from '@/lib/stores/certificate-store'

vi.mock('@/lib/hooks/useCertificateImages', () => ({
  useCertificateImages: () => ({
    uploadImageWithId: vi.fn(),
    deleteImage: vi.fn(),
    getReadingImages: vi.fn(() => ({ uuc: null, master: null })),
    refreshWithId: vi.fn(),
  }),
}))

vi.mock('@/components/forms/ReadingImageModal', () => ({
  ReadingImageModal: () => null,
}))

describe('ResultsSection add-row action', () => {
  beforeEach(() => {
    useCertificateStore.getState().resetForm()
  })

  afterEach(() => {
    cleanup()
  })

  it('adds one blank measurement row to the parameter', async () => {
    const user = userEvent.setup()
    render(<ResultsSection />)

    await user.click(screen.getByRole('button', { name: 'Add measurement row' }))

    const results = useCertificateStore.getState().formData.parameters[0].results
    expect(results).toHaveLength(2)
    expect(results[1]).toMatchObject({
      pointNumber: 2,
      standardReading: '',
      beforeAdjustment: '',
      afterAdjustment: '',
      errorObserved: null,
      isOutOfLimit: false,
    })
  })

  it('does not expose the action when the results section is read-only', () => {
    render(<ResultsSection disabled />)

    expect(screen.queryByRole('button', { name: 'Add measurement row' })).not.toBeInTheDocument()
  })

  it('renders a failed calibration point in red and bold with a Fail* status', () => {
    const store = useCertificateStore.getState()
    const parameter = store.formData.parameters[0]
    // Section 05 now renders from resultRows against the parameter's field schema;
    // `results` is a projection kept for the PDF and API paths.
    const [masterField, uucField] = parameter.fieldDefinitions
    store.setParameter(0, {
      ...parameter,
      resultRows: [{
        ...parameter.resultRows[0],
        values: { [masterField.id]: '10', [uucField.id]: '12' },
        errorObserved: -2,
        isOutOfLimit: true,
      }],
    })

    render(<ResultsSection />)

    const failedStatus = screen.getByText('Fail*')
    const failedRow = failedStatus.closest('tr')
    expect(failedRow).toHaveClass('text-red-700', 'font-bold')
    for (const input of within(failedRow!).getAllByRole('textbox')) {
      expect(input).toHaveClass('text-red-700', 'font-bold')
    }
  })

  it('keeps Fail* visible when a failed point has no calculated error', () => {
    const store = useCertificateStore.getState()
    const parameter = store.formData.parameters[0]
    store.setParameter(0, {
      ...parameter,
      resultRows: [{
        ...parameter.resultRows[0],
        isOutOfLimit: true,
        errorObserved: null,
      }],
    })

    render(<ResultsSection />)

    expect(screen.getByText('Fail*')).toBeInTheDocument()
  })
})
