import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConclusionSection } from '@/components/forms/ConclusionSection'
import { useCertificateStore } from '@/lib/stores/certificate-store'

describe('out-of-accuracy conclusion marker', () => {
  beforeEach(() => {
    useCertificateStore.getState().resetForm()
    useCertificateStore.getState().setFormField('selectedConclusionStatements', ['out_of_accuracy'])
  })

  afterEach(cleanup)

  it('renders only the leading "*" marker in red and bold', () => {
    render(<ConclusionSection />)

    const statement = screen.getByText(/Indicated readings are beyond specified accuracy limits/)
    const marker = within(statement).getByText('"*"')

    expect(marker).toHaveClass('text-red-700', 'font-bold')
    expect(statement).not.toHaveClass('text-red-700', 'font-bold')
  })
})
