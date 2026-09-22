/**
 * The certificate does not leave while a reading is one no instrument could have shown.
 *
 * The results table warns where the reading is, so there is something to type. This is
 * the other half: the buttons refuse, because a certificate carrying 49.72 on a 0.05
 * instrument states the unit was found accurate to a precision the instrument cannot
 * resolve, and that is the claim the certificate exists to make.
 */
import { seedMasterStore } from '../helpers/seed-master-store'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { FinalizeSection } from '@/components/forms/FinalizeSection'
import { useCertificateStore, type Parameter } from '@/lib/stores/certificate-store'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next-auth/react', () => ({ useSession: () => ({ data: null }) }))
vi.mock('@/components/pdf', () => ({ PDFPreviewSection: () => null }))
vi.mock('@/components/signatures', () => ({ SignatureModal: () => null }))
vi.mock('@/components/forms/ReviewerSelect', () => ({ ReviewerSelect: () => null }))

/** 781 HTAIPL/L, legacy id 67, profile P1: -80 to 300 degC, least count 0.001 degC. */
const MASTER_LEGACY_ID = 67
const MASTER_PROFILE = 'P1'

function setReadings(master: string, uuc: string, over: Partial<Parameter> = {}) {
  const store = useCertificateStore.getState()
  const parameter = store.formData.parameters[0]
  const [masterField, uucField] = parameter.fieldDefinitions
  store.setParameter(0, {
    ...parameter,
    leastCountValue: '0.05',
    masterInstrumentId: MASTER_LEGACY_ID,
    masterProfileId: MASTER_PROFILE,
    resultRows: [
      { ...parameter.resultRows[0], values: { [masterField.id]: master, [uucField.id]: uuc } },
    ],
    ...over,
  })
}

const saveButton = () => screen.getByRole('button', { name: /Save Draft|Fix Errors First/ })

describe('a reading that lands on a step', () => {
  beforeAll(seedMasterStore)
  beforeEach(() => useCertificateStore.getState().resetForm())
  afterEach(cleanup)

  it('leaves the buttons alone', () => {
    setReadings('49.700', '49.70')
    render(<FinalizeSection />)
    expect(saveButton()).not.toBeDisabled()
    expect(screen.queryByText(/Critical Errors/)).toBeNull()
  })
})

describe('a reading that falls between steps', () => {
  beforeAll(seedMasterStore)
  beforeEach(() => useCertificateStore.getState().resetForm())
  afterEach(cleanup)

  it('refuses to save the draft and says why', () => {
    // The UUC steps in 0.05. It shows 49.70 and 49.75 and nothing between them.
    setReadings('49.700', '49.72')
    render(<FinalizeSection />)
    expect(saveButton()).toBeDisabled()
    expect(saveButton()).toHaveTextContent('Fix Errors First')
  })

  it('says why on screen, before anything is pressed', () => {
    setReadings('49.700', '49.72')
    render(<FinalizeSection />)
    expect(
      screen.getByText(
        '• 1 reading does not land on a step the instrument can show (Section 05)',
      ),
    ).toBeTruthy()
  })

  it('catches the master too, judged by the master\'s own step', () => {
    // 49.7001 is not a whole number of the thermometer's 0.001 steps. The UUC's 49.70
    // is fine on 0.05, so only one of the two is counted.
    setReadings('49.7001', '49.70')
    render(<FinalizeSection />)
    expect(
      screen.getByText(
        '• 1 reading does not land on a step the instrument can show (Section 05)',
      ),
    ).toBeTruthy()
  })
})

describe('a column that never said what step it uses', () => {
  beforeAll(seedMasterStore)
  beforeEach(() => useCertificateStore.getState().resetForm())
  afterEach(cleanup)

  it('refuses to save, because its readings cannot be checked at all', () => {
    const store = useCertificateStore.getState()
    const parameter = store.formData.parameters[0]
    setReadings('49.700', '49.70', {
      fieldDefinitions: parameter.fieldDefinitions.map((f) =>
        f.group === 'uuc' ? { ...f, resolution: { source: 'custom' as const, leastCount: '' } } : f,
      ),
    })
    render(<FinalizeSection />)
    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText('• 1 column does not say what least count it steps in (Section 05)'),
    ).toBeTruthy()
  })
})
