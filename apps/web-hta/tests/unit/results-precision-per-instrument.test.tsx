import { seedMasterStore } from '../helpers/seed-master-store'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { ResultsSection } from '@/components/forms/ResultsSection'
import { useCertificateStore, type Parameter } from '@/lib/stores/certificate-store'
import { useMasterInstrumentStore } from '@/lib/stores/master-instrument-store'

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

/**
 * 781 HTAIPL/L, legacy id 67, profile P1: -80 to 300 degC, least count 0.001 degC.
 * Its readings are good to three decimals; the UUC below is good to two.
 */
const MASTER_LEGACY_ID = 67
const MASTER_PROFILE = 'P1'

/** The parameter as the certificate holds it, with both readings written. */
function setUp(master: string, uuc: string, over: Partial<Parameter> = {}) {
  const store = useCertificateStore.getState()
  const parameter = store.formData.parameters[0]
  const [masterField, uucField] = parameter.fieldDefinitions
  store.setParameter(0, {
    ...parameter,
    leastCountValue: '0.01',
    masterInstrumentId: MASTER_LEGACY_ID,
    masterProfileId: MASTER_PROFILE,
    resultRows: [
      { ...parameter.resultRows[0], values: { [masterField.id]: master, [uucField.id]: uuc } },
    ],
    ...over,
  })
  return { masterField, uucField }
}

const warning = () => screen.queryByText(/more decimal places than the least count allows/)
const notice = () => screen.queryByText(/records no resolution/)

describe('each column is judged by its own instrument', () => {
  beforeAll(() => {
    seedMasterStore()
  })

  beforeEach(() => {
    useCertificateStore.getState().resetForm()
  })

  afterEach(cleanup)

  it('leaves a master reading written to its own three decimals alone', () => {
    // The fault this closes: judged by the UUC's 0.01, a thermometer resolving to
    // 0.001 was told off for writing the decimal it can actually show.
    setUp('25.001', '25.00')
    render(<ResultsSection />)
    expect(warning()).not.toBeInTheDocument()
  })

  it('still catches a UUC reading finer than the UUC can show', () => {
    setUp('25.001', '25.0001')
    render(<ResultsSection />)
    expect(warning()).toBeInTheDocument()
    expect(screen.getByText(/UUC readings expect 2 decimals/)).toBeInTheDocument()
  })

  it('names the instrument whose resolution was exceeded, not both', () => {
    setUp('25.0001', '25.00')
    render(<ResultsSection />)
    expect(screen.getByText(/Master readings expect 3 decimals/)).toBeInTheDocument()
    expect(screen.queryByText(/UUC readings expect/)).not.toBeInTheDocument()
  })
})

describe('a master whose resolution nobody recorded', () => {
  beforeAll(() => {
    seedMasterStore()
  })

  beforeEach(() => {
    useCertificateStore.getState().resetForm()
  })

  afterEach(cleanup)

  it('says so rather than judging by the UUC', () => {
    // No capability declared, so there is no bucket to read a least count from.
    setUp('25.00001', '25.00', { masterProfileId: undefined })
    render(<ResultsSection />)
    expect(notice()).toBeInTheDocument()
    expect(warning()).not.toBeInTheDocument()
  })

  it('goes on checking the UUC, whose resolution is recorded', () => {
    setUp('25.00001', '25.0001', { masterProfileId: undefined })
    render(<ResultsSection />)
    expect(notice()).toBeInTheDocument()
    expect(screen.getByText(/UUC readings expect 2 decimals/)).toBeInTheDocument()
  })
})
