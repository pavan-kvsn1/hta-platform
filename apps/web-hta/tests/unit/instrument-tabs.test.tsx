import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const apiFetch = vi.fn()
vi.mock('@/lib/api-client', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import InstrumentBanner from '@/components/admin/InstrumentBanner'
import CertificatesTab from '@/components/admin/CertificatesTab'
import AuditLogTab from '@/components/admin/AuditLogTab'
import MetadataTab from '@/components/admin/MetadataTab'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body })
const fail = (status: number, body: unknown = null) => ({
  ok: false,
  status,
  json: async () => {
    if (body === null) throw new Error('no body')
    return body
  },
})

const showDate = (iso: string | null) => (iso ? iso.slice(0, 10) : '—')

/**
 * The certificates tab asks for the certificates and the capabilities together, so the
 * mock has to answer by URL rather than returning one body to both.
 */
const routed = (certBody: unknown, capBody: unknown = { profiles: [], components: [], assetType: 'simple' }) =>
  vi.fn(async (url: string) => (String(url).includes('/capabilities') ? ok(capBody) : ok(certBody)))

const instrument = {
  assetNumber: '708 HTAIPL/L',
  category: 'Electro-Technical',
  make: 'Fluke',
  model: '754',
  serialNumber: 'NVE12502806',
  calibratedAtLocation: 'HTAIPL, Bangalore',
  calibrationDueDate: '2027-03-15T00:00:00.000Z',
  status: 'VALID',
  daysUntilExpiry: 365,
  createdAt: '2026-02-26T00:00:00.000Z',
  createdBy: { name: 'Harshvardhan' },
}

describe('the banner', () => {
  it('shows all eight facts that identify the instrument', () => {
    render(<InstrumentBanner instrument={instrument} formatDate={showDate} />)

    for (const label of ['Asset #', 'Status', 'Category', 'Calibrated At', 'Next Due', 'Last Updated', 'Model', 'Serial'])
      expect(screen.getByText(label)).toBeTruthy()

    expect(screen.getByText('708 HTAIPL/L')).toBeTruthy()
    expect(screen.getByText('Fluke 754')).toBeTruthy()
    expect(screen.getByText('NVE12502806')).toBeTruthy()
    expect(screen.getByText(/by Harshvardhan/)).toBeTruthy()
  })

  it('counts down only while the calibration still runs', () => {
    render(<InstrumentBanner instrument={instrument} formatDate={showDate} />)
    expect(screen.getByText(/365 days/)).toBeTruthy()
  })

  it('does not print a negative countdown on an expired instrument', () => {
    // "Expired · -12 days" reads as a counter that has gone wrong, not a date passed.
    render(
      <InstrumentBanner
        instrument={{ ...instrument, status: 'EXPIRED', daysUntilExpiry: -12 }}
        formatDate={showDate}
      />,
    )
    expect(screen.getByText('EXPIRED')).toBeTruthy()
    expect(screen.queryByText(/-12/)).toBeNull()
  })

  it('shows a dash for a fact it does not have, rather than a blank', () => {
    render(
      <InstrumentBanner
        instrument={{ ...instrument, serialNumber: null, calibratedAtLocation: '' }}
        formatDate={showDate}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2)
  })
})

describe('the certificates tab', () => {
  const cert = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    fileName: 'HTA C50458 01.pdf',
    fileSize: 2_400_000,
    reportNo: 'HTA/C50458/01/25',
    validFrom: '2025-11-25T00:00:00.000Z',
    validUntil: '2026-11-25T00:00:00.000Z',
    uploadedAt: '2025-11-26T00:00:00.000Z',
    isActive: true,
    isLatest: true,
    ...over,
  })

  it('separates what is in force from what is archived', async () => {
    apiFetch.mockImplementation(routed({ certificates: [cert(), cert({ id: 'c2', fileName: 'old.pdf', isActive: false, isLatest: false })] }))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)

    expect(await screen.findByText(/ACTIVE CERTIFICATES/)).toBeTruthy()
    expect(screen.getByText(/ARCHIVED CERTIFICATES/)).toBeTruthy()
    expect(screen.getByText('HTA C50458 01.pdf')).toBeTruthy()
    expect(screen.getByText('old.pdf')).toBeTruthy()
  })

  it('asks for archived certificates too, since this is where they are restored', async () => {
    apiFetch.mockImplementation(routed({ certificates: [] }))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)

    await waitFor(() => expect(apiFetch).toHaveBeenCalled())
    expect(apiFetch.mock.calls.map((c: unknown[]) => String(c[0])).join(' ')).toContain('includeInactive=true')
  })

  it('says plainly when nothing is in force', async () => {
    apiFetch.mockImplementation(routed({ certificates: [] }))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    expect(await screen.findByText('No certificate is in force for this instrument.')).toBeTruthy()
  })

  it('passes on the API refusing to archive the certificate in force', async () => {
    let archiveTried = false
    apiFetch.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        archiveTried = true
        return fail(400, { error: 'Cannot archive the current certificate' })
      }
      return String(url).includes('/capabilities')
        ? ok({ profiles: [], components: [], assetType: 'simple' })
        : ok({ certificates: [cert()] })
    })

    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await screen.findByText('HTA C50458 01.pdf')
    await userEvent.click(screen.getByRole('button', { name: /Archive/ }))

    expect(await screen.findByText('Cannot archive the current certificate')).toBeTruthy()
    expect(archiveTried).toBe(true)
  })

  it('reports a failed load rather than showing an empty list', async () => {
    apiFetch.mockResolvedValue(fail(500))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)

    expect(await screen.findByText(/error 500/)).toBeTruthy()
    expect(screen.queryByText('No certificate is in force for this instrument.')).toBeNull()
  })

  it('marks an active certificate whose validity has already passed', async () => {
    apiFetch.mockImplementation(routed({ certificates: [cert({ validUntil: '2020-01-01T00:00:00.000Z' })] }))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    expect(await screen.findByText('EXPIRED')).toBeTruthy()
  })
})

describe('the audit log tab', () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: 'a1',
    action: 'BUCKET_UPDATED',
    profileKey: 'P1',
    subtypeKey: null,
    bucketKey: 'B2',
    bucketLabel: '0 to 100 bar',
    field: 'leastCountValue',
    before: '0.05',
    after: '0.01',
    createdAt: '2026-09-11T10:30:00.000Z',
    actor: { id: 'u1', name: 'Harshvardhan' },
    ...over,
  })

  it('names the field in words and shows what it moved from and to', async () => {
    apiFetch.mockResolvedValue(ok({ entries: [entry()], nextCursor: null }))
    render(<AuditLogTab instrumentId="row-1" formatDateTime={(s) => s.slice(0, 10)} />)

    // FIELD_UPDATED is also an option in the Filter dropdown, so look in the entry.
    // Identified by the range itself, because row numbers shift when one is deleted.
    const trail = await screen.findByText('Profile: P1 → 0 to 100 bar → Least Count')
    const row = trail.closest('div.px-4')!
    expect(within(row).getByText('FIELD_UPDATED')).toBeTruthy()
    expect(within(row).getByText('0.05')).toBeTruthy()
    expect(within(row).getByText('0.01')).toBeTruthy()
  })

  it('calls a field that was empty "nothing", so filling one in still reads as a change', async () => {
    apiFetch.mockResolvedValue(ok({ entries: [entry({ before: null })], nextCursor: null }))
    render(<AuditLogTab instrumentId="row-1" formatDateTime={(s) => s.slice(0, 10)} />)
    expect(await screen.findByText('nothing')).toBeTruthy()
  })

  it('explains an empty log instead of showing a blank panel', async () => {
    apiFetch.mockResolvedValue(ok({ entries: [], nextCursor: null }))
    render(<AuditLogTab instrumentId="row-1" formatDateTime={(s) => s} />)
    expect(await screen.findByText(/Nothing has changed since these capabilities were loaded/)).toBeTruthy()
  })

  it('falls back to a number for entries recorded before ranges carried a label', async () => {
    apiFetch.mockResolvedValue(ok({ entries: [entry({ bucketLabel: null })], nextCursor: null }))
    render(<AuditLogTab instrumentId="row-1" formatDateTime={(s) => s.slice(0, 10)} />)
    expect(await screen.findByText(/Range 2/)).toBeTruthy()
  })

  it('offers earlier changes only when there are more', async () => {
    apiFetch.mockResolvedValue(ok({ entries: [entry()], nextCursor: 'a1' }))
    render(<AuditLogTab instrumentId="row-1" formatDateTime={(s) => s} />)
    expect(await screen.findByRole('button', { name: /Show earlier changes/ })).toBeTruthy()
  })
})

describe('the metadata tab', () => {
  const caps = {
    profiles: [
      {
        source: 'registry',
        subtypes: [],
        buckets: [
          { leastCountValue: 0.01, accuracyKind: 'SYMMETRIC' },
          { leastCountValue: null, accuracyKind: null },
        ],
      },
    ],
    components: [],
    assetType: 'simple',
  }

  it('counts ranges that declare no least count, without calling them wrong', async () => {
    apiFetch.mockResolvedValue(ok(caps))
    render(
      <MetadataTab
        instrumentId="row-1"
        version={3}
        createdAt="2026-02-26T00:00:00.000Z"
        createdByName="Harshvardhan"
        parameterGroup="Pressure"
        sopReferences={['NLAB/CAL/ML1/R01']}
        certificateCount={2}
        formatDate={showDate}
      />,
    )

    await screen.findByText('Data Completeness:')
    const lc = screen.getByText('Least counts').closest('li')!
    expect(within(lc).getByText('1 not declared')).toBeTruthy()
    expect(screen.getByText(/is not the same as zero/)).toBeTruthy()
  })

  it('says where the capabilities came from', async () => {
    apiFetch.mockResolvedValue(ok(caps))
    render(
      <MetadataTab
        instrumentId="row-1"
        version={1}
        createdAt={null}
        createdByName={null}
        parameterGroup={null}
        sopReferences={[]}
        certificateCount={null}
        formatDate={showDate}
      />,
    )
    expect(await screen.findByText('Master Registry JSON')).toBeTruthy()
  })

  it('leaves the certificate count as a dash when it is not known', async () => {
    apiFetch.mockResolvedValue(ok(caps))
    render(
      <MetadataTab
        instrumentId="row-1"
        version={1}
        createdAt={null}
        createdByName={null}
        parameterGroup={null}
        sopReferences={[]}
        certificateCount={null}
        formatDate={showDate}
      />,
    )
    await screen.findByText('Master Registry JSON')
    const row = screen.getByText('Certificates').closest('li')!
    expect(row.textContent).toContain('—')
  })
})

describe('opening a certificate', () => {
  const cert = (over: Record<string, unknown> = {}) => ({
    id: 'c1',
    fileName: 'HTA C50458 01.pdf',
    fileSize: 2_400_000,
    reportNo: 'HTA/C50458/01/25',
    validFrom: null,
    validUntil: '2027-11-25T00:00:00.000Z',
    uploadedAt: '2025-11-26T00:00:00.000Z',
    isActive: true,
    isLatest: true,
    ...over,
  })

  /** Answers the list, the capabilities and the single-certificate open. */
  const viewerMock = (c: Record<string, unknown>, pageCount: number | null = 4) =>
    vi.fn(async (url: string) => {
      const u = String(url)
      if (u.includes('/capabilities')) return ok({ profiles: [], components: [], assetType: 'simple' })
      if (/\/certificates\/c1$/.test(u)) return ok({ certificate: { ...c, pageCount }, url: 'https://signed/cert.pdf' })
      return ok({ certificates: [c] })
    })

  it('opens in the page, not in a new browser tab', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    apiFetch.mockImplementation(viewerMock(cert()))

    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))

    expect(await screen.findByText('Back to Details')).toBeTruthy()
    expect(openSpy).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })

  it('says whether what you are reading is in force', async () => {
    apiFetch.mockImplementation(viewerMock(cert({ isActive: false })))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))

    expect(await screen.findByText('ARCHIVED')).toBeTruthy()
  })

  it('shows the page count the server counted, and steps through pages', async () => {
    apiFetch.mockImplementation(viewerMock(cert(), 4))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))

    expect(await screen.findByText('1 of 4')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous page' })).toHaveProperty('disabled', true)

    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('2 of 4')).toBeTruthy()
  })

  it('says "page 2" rather than inventing a total it does not have', async () => {
    apiFetch.mockImplementation(viewerMock(cert(), null))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))

    await screen.findByText('page 1')
    await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getByText('page 2')).toBeTruthy()
  })

  it('goes back to the list it came from', async () => {
    apiFetch.mockImplementation(viewerMock(cert()))
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))
    await userEvent.click(await screen.findByText('Back to Details'))

    expect(await screen.findByText(/ACTIVE CERTIFICATES/)).toBeTruthy()
  })

  it('says so when the file cannot be fetched, instead of a blank frame', async () => {
    apiFetch.mockImplementation(async (url: string) => {
      const u = String(url)
      if (u.includes('/capabilities')) return ok({ profiles: [], components: [], assetType: 'simple' })
      if (/\/certificates\/c1$/.test(u)) return fail(404, { error: 'Certificate not found' })
      return ok({ certificates: [cert()] })
    })
    render(<CertificatesTab instrumentId="row-1" formatDate={showDate} />)
    await userEvent.click(await screen.findByRole('button', { name: /Open HTA C50458 01.pdf/ }))

    expect(await screen.findByText('Certificate not found')).toBeTruthy()
    expect(screen.getByText('This certificate could not be opened')).toBeTruthy()
  })
})
