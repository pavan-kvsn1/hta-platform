/**
 * Desktop Login Page Unit Tests
 *
 * Component: apps/web-hta/src/app/desktop/login/page.tsx
 *
 * Tests the multi-view desktop login page:
 * - First-time login form (no stored credentials)
 * - Unlock form (credentials exist, password-only re-entry)
 * - Offline warning during first-time setup
 * - Form field rendering
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// ─── Mock electronAPI on window ─────────────────────────────────────────────

const mockPush = vi.fn()
const mockReplace = vi.fn()

// Override the global next/navigation mock from setup.ts for this file
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/desktop/login',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Default mock: first-time user, online, no credentials
const mockElectronAPI = {
  getOnlineStatus: vi.fn().mockResolvedValue(true),
  getAuthStatus: vi.fn().mockResolvedValue({
    hasCredentials: false,
    isSetUp: false,
    isUnlocked: false,
  }),
  getUserProfile: vi.fn().mockResolvedValue(null),
  setup: vi.fn().mockResolvedValue({ success: true }),
  logout: vi.fn().mockResolvedValue({ success: true }),
  unlock: vi.fn().mockResolvedValue({ success: true }),
  unlockPasswordOnly: vi.fn().mockResolvedValue({ success: true }),
  getReprovisionImpact: vi.fn().mockResolvedValue({
    unsyncedAuditEntries: 0,
    affectedCertificates: 0,
    pendingDrafts: 0,
    unsyncedImages: 0,
  }),
  resetLocalSetup: vi.fn().mockResolvedValue({ success: true }),
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

describe('DesktopLoginPage', () => {
  async function renderPage() {
    // Dynamic import to pick up fresh mocks each test
    const mod = await import('@/app/desktop/login/page')
    const DesktopLoginPage = mod.default
    return render(<DesktopLoginPage />)
  }

  it('renders login form when no stored credentials (first-time)', async () => {
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })

    expect(
      screen.getByText('Enter your staff credentials to set up this device')
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /sign in & set up device/i })
    ).toBeInTheDocument()
  })

  it('renders unlock form when credentials exist (password-only re-entry)', async () => {
    // Device is set up but locked (idle timeout = password-only view)
    ;(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = {
      ...mockElectronAPI,
      getAuthStatus: vi.fn().mockResolvedValue({
        isSetUp: true,
        isUnlocked: false,
        needsFullAuth: false,
        codesRemaining: 20,
        challengeKey: undefined,
      }),
      getUserProfile: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'engineer@htaipl.com',
        name: 'Test Engineer',
      }),
    }

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Engineer')).toBeInTheDocument()
    expect(screen.getByText('engineer@htaipl.com')).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unlock/i })).toBeInTheDocument()
  })

  it('shows offline warning when not online on first-time setup', async () => {
    ;(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = {
      ...mockElectronAPI,
      getOnlineStatus: vi.fn().mockResolvedValue(false),
      getAuthStatus: vi.fn().mockResolvedValue({
        isSetUp: false,
        isUnlocked: false,
      }),
    }

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })

    // Offline warning banner
    expect(screen.getByText('You are offline')).toBeInTheDocument()

    // Error message about needing to be online
    expect(
      screen.getByText('You must be online for first-time setup.')
    ).toBeInTheDocument()

    // Sign in button should be disabled when offline
    const signInButton = screen.getByRole('button', { name: /sign in & set up device/i })
    expect(signInButton).toBeDisabled()
  })

  it('renders password field and submit button', async () => {
    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })

    const passwordInput = screen.getByLabelText(/password/i)
    expect(passwordInput).toHaveAttribute('type', 'password')
    expect(passwordInput).toBeEnabled()

    const submitButton = screen.getByRole('button', { name: /sign in & set up device/i })
    expect(submitButton).toBeEnabled()
    expect(submitButton).toHaveAttribute('type', 'submit')
  })

  it('first-time setup prepares challenge screen after local cache is created', async () => {
    const user = userEvent.setup()
    const getAuthStatus = vi.fn()
      .mockResolvedValueOnce({ isSetUp: false, isUnlocked: false })
      .mockResolvedValueOnce({
        isSetUp: true,
        isUnlocked: false,
        needsFullAuth: true,
        codesRemaining: 20,
        challengeKey: 'B4',
      })
    const setup = vi.fn().mockResolvedValue({ success: true })
    const logout = vi.fn().mockResolvedValue({ success: true })

    ;(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = {
      ...mockElectronAPI,
      getAuthStatus,
      setup,
      logout,
      getUserProfile: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'user-123',
          email: 'engineer@htaipl.com',
          name: 'Test Engineer',
        }),
    }

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        user: {
          id: 'user-123',
          email: 'engineer@htaipl.com',
          name: 'Test Engineer',
          role: 'ENGINEER',
          isAdmin: false,
          adminType: null,
          tenantId: 'tenant-1',
        },
        refreshToken: 'refresh-token',
        accessToken: 'access-token',
      }),
    }))

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/email address/i), 'engineer@htaipl.com')
    await user.type(screen.getByLabelText(/password/i), 'correct-password')
    await user.click(screen.getByRole('button', { name: /sign in & set up device/i }))

    await waitFor(() => {
      expect(setup).toHaveBeenCalledWith(
        'correct-password',
        'user-123',
        'refresh-token',
        'access-token',
        expect.objectContaining({ email: 'engineer@htaipl.com' })
      )
      expect(logout).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText('Unlock Device')).toBeInTheDocument()
      expect(screen.getAllByText('B4').length).toBeGreaterThan(0)
      expect(screen.getByLabelText(/code for b4/i)).toBeInTheDocument()
    })
    expect(mockReplace).not.toHaveBeenCalledWith('/dashboard')
  })

  it('warns before reprovisioning an existing desktop setup', async () => {
    const user = userEvent.setup()
    const getReprovisionImpact = vi.fn().mockResolvedValue({
      unsyncedAuditEntries: 7,
      affectedCertificates: 3,
      pendingDrafts: 2,
      unsyncedImages: 4,
    })
    const resetLocalSetup = vi.fn().mockResolvedValue({ success: true })

    ;(window as unknown as { electronAPI: typeof mockElectronAPI }).electronAPI = {
      ...mockElectronAPI,
      getAuthStatus: vi.fn()
        .mockResolvedValueOnce({
          isSetUp: true,
          isUnlocked: false,
          needsFullAuth: false,
          codesRemaining: 20,
          challengeKey: undefined,
        }),
      getUserProfile: vi.fn().mockResolvedValue({
        id: 'user-123',
        email: 'engineer@htaipl.com',
        name: 'Test Engineer',
      }),
      getReprovisionImpact,
      resetLocalSetup,
    }

    await renderPage()

    await waitFor(() => {
      expect(screen.getByText('Welcome Back')).toBeInTheDocument()
    })

    expect(screen.getByText(/Not Test Engineer/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /reprovision device/i }))

    await waitFor(() => {
      expect(getReprovisionImpact).toHaveBeenCalled()
      expect(screen.getByText(/There are 7 audit entries not yet synced, including 3 certificates/i)).toBeInTheDocument()
      expect(screen.getByText(/2 pending local drafts and 4 unsynced images/i)).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /yes, reprovision/i }))

    await waitFor(() => {
      expect(resetLocalSetup).toHaveBeenCalled()
      expect(screen.getByText('Sign In')).toBeInTheDocument()
    })
  })
})
