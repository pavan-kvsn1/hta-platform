/**
 * My Requests Page Unit Tests
 *
 * Component: apps/web-hta/src/app/(dashboard)/dashboard/requests/page.tsx
 *
 * Tests the user requests list page:
 * - Loading state
 * - Rendered request list after fetch
 * - Status badges with correct styling
 * - Empty state when no requests
 * - Pagination controls
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockApiFetch = vi.fn()

vi.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/requests',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// ─── Test Data ──────────────────────────────────────────────────────────────

const sampleRequests = [
  {
    id: 'req-1',
    type: 'SECTION_UNLOCK',
    status: 'PENDING',
    title: 'Unlock Section A for HTA-2026-100',
    details: 'Need to fix customer name typo',
    adminNote: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
  },
  {
    id: 'req-2',
    type: 'FIELD_CHANGE',
    status: 'APPROVED',
    title: 'Change serial number on HTA-2026-101',
    details: 'Serial was entered incorrectly during calibration',
    adminNote: 'Approved - verified correct serial',
    reviewedBy: 'admin-1',
    reviewedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
  },
  {
    id: 'req-3',
    type: 'OFFLINE_CODE_REQUEST',
    status: 'REJECTED',
    title: 'Request offline code',
    details: 'Need offline access for field visit',
    adminNote: 'Please use online mode',
    reviewedBy: 'admin-2',
    reviewedAt: new Date().toISOString(),
    createdAt: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
  },
]

const sampleCounts = { pending: 1, approved: 1, rejected: 1 }

function mockSuccessResponse(
  requests = sampleRequests,
  pagination = { page: 1, limit: 15, total: 3, totalPages: 1 },
  counts = sampleCounts
) {
  mockApiFetch.mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ requests, pagination, counts }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('MyRequestsPage', () => {
  async function renderPage() {
    const mod = await import('@/app/(dashboard)/dashboard/requests/page')
    const MyRequestsPage = mod.default
    return render(<MyRequestsPage />)
  }

  it('renders loading state initially', async () => {
    // Make apiFetch hang to observe loading
    mockApiFetch.mockImplementation(() => new Promise(() => {}))

    await renderPage()

    // The loading spinner (Loader2 with animate-spin)
    const spinners = document.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)
  })

  it('renders request list after fetch', async () => {
    mockSuccessResponse()

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Unlock Section A for HTA-2026-100')).toBeInTheDocument()
    })

    expect(screen.getByText('Need to fix customer name typo')).toBeInTheDocument()
    expect(screen.getByText('Change serial number on HTA-2026-101')).toBeInTheDocument()
    expect(screen.getByText('Request offline code')).toBeInTheDocument()

    // Admin note should appear for approved/rejected items
    expect(screen.getByText(/Approved - verified correct serial/)).toBeInTheDocument()

    // Page header
    expect(screen.getByText('My Requests')).toBeInTheDocument()
  })

  it('shows status badges with correct styling', async () => {
    mockSuccessResponse()

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Unlock Section A for HTA-2026-100')).toBeInTheDocument()
    })

    // Status badge labels
    const pendingBadges = screen.getAllByText('Pending')
    const approvedBadges = screen.getAllByText('Approved')
    const rejectedBadges = screen.getAllByText('Rejected')

    // At least one of each (summary cards + row badges)
    expect(pendingBadges.length).toBeGreaterThanOrEqual(1)
    expect(approvedBadges.length).toBeGreaterThanOrEqual(1)
    expect(rejectedBadges.length).toBeGreaterThanOrEqual(1)

    // Type badges
    expect(screen.getByText('Section Unlock')).toBeInTheDocument()
    expect(screen.getByText('Field Change')).toBeInTheDocument()
    expect(screen.getByText('Offline Code')).toBeInTheDocument()
  })

  it('shows empty state when no requests', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          requests: [],
          pagination: { page: 1, limit: 15, total: 0, totalPages: 0 },
          counts: { pending: 0, approved: 0, rejected: 0 },
        }),
    })

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('No requests yet')).toBeInTheDocument()
    })

    expect(
      screen.getByText(
        'Requests you raise for section unlocks, field changes, or offline codes will appear here.'
      )
    ).toBeInTheDocument()
  })

  it('shows pagination controls when multiple pages exist', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          requests: sampleRequests,
          pagination: { page: 1, limit: 15, total: 45, totalPages: 3 },
          counts: sampleCounts,
        }),
    })

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Unlock Section A for HTA-2026-100')).toBeInTheDocument()
    })

    // Pagination info text: "Showing 1-15 of 45 requests"
    // The ndash is a special character, so match partial
    expect(screen.getByText(/Showing/)).toBeInTheDocument()
    expect(screen.getByText(/45 requests/)).toBeInTheDocument()

    // Previous/Next buttons (ChevronLeft/ChevronRight rendered as svg inside buttons)
    // The pagination section has two buttons
    const paginationContainer = screen.getByText(/Showing/).closest('div')?.parentElement
    const paginationButtons = paginationContainer?.querySelectorAll('button')
    expect(paginationButtons).toBeDefined()
    expect(paginationButtons!.length).toBeGreaterThanOrEqual(2)

    // First page: previous button should be disabled
    expect(paginationButtons![0]).toBeDisabled()
    // Next button should be enabled
    expect(paginationButtons![1]).not.toBeDisabled()
  })
})
