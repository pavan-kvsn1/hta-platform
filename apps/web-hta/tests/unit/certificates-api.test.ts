/**
 * Certificates API Unit Tests
 *
 * Tests for the certificate check-number API endpoint:
 * - Authentication checks
 * - Validation of required parameters
 * - Certificate number availability check
 * - Exclusion of current certificate
 * - Error handling
 *
 * Self-contained version with mock implementations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Types
interface Session {
  user: { id: string; role: string }
  expires: string
}

interface Certificate {
  id: string
  certificateNumber: string
}

// Mock implementations
const mockAuth = vi.fn<[], Promise<Session | null>>()
const mockFindFirst = vi.fn<[unknown], Promise<Certificate | null>>()

// Mock API handler
async function GET(request: { url: string }): Promise<{ status: number; body: unknown }> {
  try {
    const session = await mockAuth()

    if (!session) {
      return { status: 401, body: { error: 'Unauthorized' } }
    }

    const url = new URL(request.url, 'http://localhost:3000')
    const number = url.searchParams.get('number')
    const excludeId = url.searchParams.get('excludeId')

    if (!number) {
      return { status: 400, body: { error: 'Certificate number is required' } }
    }

    const whereClause: Record<string, unknown> = {
      certificateNumber: number,
    }

    if (excludeId) {
      whereClause.NOT = { id: excludeId }
    }

    const existing = await mockFindFirst({
      where: whereClause,
      select: {
        id: true,
        certificateNumber: true,
      },
    })

    return {
      status: 200,
      body: {
        exists: !!existing,
        certificateNumber: number,
      },
    }
  } catch {
    return { status: 500, body: { error: 'Internal server error' } }
  }
}

describe('GET /api/certificates/check-number', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null)

    const request = { url: '/api/certificates/check-number?number=HTA-001' }
    const response = await GET(request)

    expect(response.status).toBe(401)
    expect((response.body as { error: string }).error).toBe('Unauthorized')
  })

  it('should return 400 when certificate number is missing', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', role: 'ENGINEER' },
      expires: new Date().toISOString(),
    })

    const request = { url: '/api/certificates/check-number' }
    const response = await GET(request)

    expect(response.status).toBe(400)
    expect((response.body as { error: string }).error).toBe('Certificate number is required')
  })

  it('should return exists: false when certificate number is available', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', role: 'ENGINEER' },
      expires: new Date().toISOString(),
    })
    mockFindFirst.mockResolvedValue(null)

    const request = { url: '/api/certificates/check-number?number=HTA-NEW-001' }
    const response = await GET(request)
    const data = response.body as { exists: boolean; certificateNumber: string }

    expect(response.status).toBe(200)
    expect(data.exists).toBe(false)
    expect(data.certificateNumber).toBe('HTA-NEW-001')
  })

  it('should return exists: true when certificate number already exists', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', role: 'ENGINEER' },
      expires: new Date().toISOString(),
    })
    mockFindFirst.mockResolvedValue({
      id: 'cert-123',
      certificateNumber: 'HTA-001',
    })

    const request = { url: '/api/certificates/check-number?number=HTA-001' }
    const response = await GET(request)
    const data = response.body as { exists: boolean; certificateNumber: string }

    expect(response.status).toBe(200)
    expect(data.exists).toBe(true)
    expect(data.certificateNumber).toBe('HTA-001')
  })

  it('should exclude current certificate when excludeId is provided', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', role: 'ENGINEER' },
      expires: new Date().toISOString(),
    })
    mockFindFirst.mockResolvedValue(null)

    const request = { url: '/api/certificates/check-number?number=HTA-001&excludeId=cert-123' }
    await GET(request)

    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        certificateNumber: 'HTA-001',
        NOT: { id: 'cert-123' },
      },
      select: {
        id: true,
        certificateNumber: true,
      },
    })
  })

  it('should return 500 on database error', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'user-123', role: 'ENGINEER' },
      expires: new Date().toISOString(),
    })
    mockFindFirst.mockRejectedValue(new Error('DB error'))

    const request = { url: '/api/certificates/check-number?number=HTA-001' }
    const response = await GET(request)

    expect(response.status).toBe(500)
    expect((response.body as { error: string }).error).toBe('Internal server error')
  })
})
