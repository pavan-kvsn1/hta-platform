/**
 * Conflict Resolution Page Unit Tests
 *
 * Component: apps/web-hta/src/app/(dashboard)/dashboard/certificates/[id]/resolve/page.tsx
 *
 * Tests the desktop-only sync conflict resolution UI:
 * - Loading state then conflict view
 * - Displaying local vs server values
 * - Conflict count display
 * - Resolving conflicts via electronAPI
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockPush = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/certificates/test-id/resolve',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'test-cert-id' }),
}))

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

const conflictData = {
  local: {
    certificate_number: 'HTA-2026-001',
    customer_name: 'Local Corp',
    customer_address: '111 Local St',
    customer_contact_name: 'John Local',
    customer_contact_email: 'john@local.com',
    uuc_description: 'Temperature Gauge',
    uuc_make: 'BrandA',
    uuc_model: 'Model-X',
    uuc_serial_number: 'SN-001',
    uuc_location_name: 'Lab 1',
    date_of_calibration: '2026-05-01',
    calibration_due_date: '2027-05-01',
    srf_number: 'SRF-001',
    ambient_temperature: '23.0',
    relative_humidity: '55',
    status_notes: '',
    sticker_old_removed: 'Yes',
    sticker_new_affixed: 'Yes',
    additional_conclusion_statement: '',
    parameters: [],
  },
  server: {
    certificate_number: 'HTA-2026-001',
    customer_name: 'Server Corp',
    customer_address: '222 Server St',
    customer_contact_name: 'John Local',
    customer_contact_email: 'john@local.com',
    uuc_description: 'Temperature Gauge',
    uuc_make: 'BrandA',
    uuc_model: 'Model-X',
    uuc_serial_number: 'SN-001',
    uuc_location_name: 'Lab 1',
    date_of_calibration: '2026-05-01',
    calibration_due_date: '2027-05-01',
    srf_number: 'SRF-001',
    ambient_temperature: '23.0',
    relative_humidity: '55',
    status_notes: '',
    sticker_old_removed: 'Yes',
    sticker_new_affixed: 'Yes',
    additional_conclusion_statement: '',
    parameters: [],
  },
}

const mockElectronAPI = {
  getConflict: vi.fn().mockResolvedValue(conflictData),
  resolveConflict: vi.fn().mockResolvedValue({ success: true }),
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'electronAPI', {
    value: { ...mockElectronAPI },
    writable: true,
    configurable: true,
  })
})

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ConflictResolvePage', () => {
  async function renderPage() {
    const mod = await import(
      '@/app/(dashboard)/dashboard/certificates/[id]/resolve/page'
    )
    const ConflictResolvePage = mod.default
    return render(<ConflictResolvePage />)
  }

  it('renders loading state then conflict view', async () => {
    // Delay conflict resolution to observe loading state
    let resolveConflict!: (value: typeof conflictData) => void
    ;(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = {
      ...mockElectronAPI,
      getConflict: vi.fn().mockImplementation(
        () => new Promise((resolve) => { resolveConflict = resolve })
      ),
    }

    await renderPage()

    // Loading spinner should be visible (Loader2 renders as an svg with animate-spin)
    const spinners = document.querySelectorAll('.animate-spin')
    expect(spinners.length).toBeGreaterThan(0)

    // Resolve the promise
    resolveConflict(conflictData)

    // Wait for the conflict view to appear
    await waitFor(() => {
      expect(screen.getByText('HTA-2026-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Sync Conflict')).toBeInTheDocument()
  })

  it('shows local vs server values for conflicting fields', async () => {
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('HTA-2026-001')).toBeInTheDocument()
    })

    // The two differing fields are customer_name and customer_address
    expect(screen.getByText('Local Corp')).toBeInTheDocument()
    expect(screen.getByText('Server Corp')).toBeInTheDocument()
    expect(screen.getByText('111 Local St')).toBeInTheDocument()
    expect(screen.getByText('222 Server St')).toBeInTheDocument()

    // Section headers
    expect(screen.getByText('Customer Details')).toBeInTheDocument()
    expect(screen.getByText('UUC Details')).toBeInTheDocument()
  })

  it('displays conflict count', async () => {
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('HTA-2026-001')).toBeInTheDocument()
    })

    // Two fields differ: customer_name and customer_address
    // The toolbar and footer both show "0 of 2" — use getAllByText
    const countTexts = screen.getAllByText(/0 of 2/)
    expect(countTexts.length).toBeGreaterThanOrEqual(1)

    // The section badge shows "2 conflicts"
    expect(screen.getByText('2 conflicts')).toBeInTheDocument()
  })

  it('calls resolveConflict on submit after all conflicts resolved', async () => {
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('HTA-2026-001')).toBeInTheDocument()
    })

    // The "Resolve & Save" button should be disabled initially (not all resolved)
    const resolveButton = screen.getByRole('button', { name: /resolve & save/i })
    expect(resolveButton).toBeDisabled()

    // Click "Use All Local" to resolve all conflicts at once
    const useAllLocalButton = screen.getByRole('button', { name: /use all local/i })
    fireEvent.click(useAllLocalButton)

    // Now the resolve button should be enabled
    await waitFor(() => {
      const btn = screen.getByRole('button', { name: /resolve & save/i })
      expect(btn).not.toBeDisabled()
    })

    // Click resolve
    fireEvent.click(screen.getByRole('button', { name: /resolve & save/i }))

    await waitFor(() => {
      expect(mockElectronAPI.resolveConflict).toHaveBeenCalledWith(
        'test-cert-id',
        expect.objectContaining({
          customerName: 'Local Corp',
          customerAddress: '111 Local St',
        })
      )
    })

    // Should navigate to dashboard on success
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/dashboard')
    })
  })
})
