import { cleanup, render, screen } from '@testing-library/react'
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
})
