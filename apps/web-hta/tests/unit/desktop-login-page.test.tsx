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
  unlock: vi.fn().mockResolvedValue({ success: true }),
  unlockPasswordOnly: vi.fn().mockResolvedValue({ success: true }),
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
})
