/**
 * Secrets Rotation Unit Tests
 *
 * Tests for:
 * - rotateSecret() — creates new version; returns version ID; handles API error
 * - disableOldVersions() — disables all except current; handles no old versions
 * - scheduleRotation() — creates Cloud Scheduler handler; processes configs
 * - generators — each produces valid format (base64, hex, alphanumeric)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the logger
vi.mock('../src/logger/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

// We need to mock the dynamic import of the secret manager client
const mockAddSecretVersion = vi.fn()
const mockListSecretVersions = vi.fn()
const mockDisableSecretVersion = vi.fn()

// Mock the Secret Manager client via dynamic import
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn().mockImplementation(() => ({
    addSecretVersion: mockAddSecretVersion,
    listSecretVersions: mockListSecretVersions,
    disableSecretVersion: mockDisableSecretVersion,
  })),
}))

import { rotateSecret, disableOldVersions, scheduleRotation } from '../src/secrets/rotation'

// We import generators separately as they don't need mocks
import { generators } from '../src/secrets/rotation'

describe('generators', () => {
  describe('base64', () => {
    it('produces a base64-encoded string', async () => {
      const gen = generators.base64(64)
      const result = await gen()
      // Base64 encoding of 64 bytes = ~88 chars
      expect(result.length).toBeGreaterThan(0)
      // Verify it is valid base64
      expect(() => Buffer.from(result, 'base64')).not.toThrow()
    })

    it('produces different values on each call', async () => {
      const gen = generators.base64(32)
      const a = await gen()
      const b = await gen()
      expect(a).not.toBe(b)
    })

    it('respects byte count parameter', async () => {
      const gen16 = generators.base64(16)
      const gen64 = generators.base64(64)
      const short = await gen16()
      const long = await gen64()
      expect(long.length).toBeGreaterThan(short.length)
    })
  })

  describe('hex', () => {
    it('produces a hex string of correct length', async () => {
      const gen = generators.hex(32)
      const result = await gen()
      expect(result).toHaveLength(64) // 32 bytes = 64 hex chars
      expect(result).toMatch(/^[0-9a-f]+$/)
    })

    it('produces different values on each call', async () => {
      const gen = generators.hex(16)
      const a = await gen()
      const b = await gen()
      expect(a).not.toBe(b)
    })
  })

  describe('alphanumeric', () => {
    it('produces a string of the specified length', async () => {
      const gen = generators.alphanumeric(32)
      const result = await gen()
      expect(result).toHaveLength(32)
    })

    it('contains only alphanumeric characters', async () => {
      const gen = generators.alphanumeric(100)
      const result = await gen()
      expect(result).toMatch(/^[A-Za-z0-9]+$/)
    })

    it('produces different values on each call', async () => {
      const gen = generators.alphanumeric(32)
      const a = await gen()
      const b = await gen()
      expect(a).not.toBe(b)
    })
  })
})

describe('rotateSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates a new version and returns version ID', async () => {
    mockAddSecretVersion.mockResolvedValue([
      { name: 'projects/test-project/secrets/my-secret/versions/5' },
    ])
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/test-project/secrets/my-secret/versions/5', state: 'ENABLED', createTime: { seconds: 1000 } },
      { name: 'projects/test-project/secrets/my-secret/versions/4', state: 'ENABLED', createTime: { seconds: 900 } },
    ]])

    const result = await rotateSecret(
      'my-secret',
      async () => 'new-secret-value',
      'test-project'
    )

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe('5')
    expect(mockAddSecretVersion).toHaveBeenCalledWith({
      parent: 'projects/test-project/secrets/my-secret',
      payload: {
        data: Buffer.from('new-secret-value', 'utf8'),
      },
    })
  })

  it('handles API error gracefully and returns failure result', async () => {
    mockAddSecretVersion.mockRejectedValue(new Error('API unavailable'))

    const result = await rotateSecret(
      'my-secret',
      async () => 'value',
      'test-project'
    )

    expect(result.success).toBe(false)
    expect(result.error).toBe('API unavailable')
    expect(result.newVersion).toBe('')
    expect(result.disabledVersions).toEqual([])
  })

  it('uses default generator when none provided', async () => {
    mockAddSecretVersion.mockResolvedValue([
      { name: 'projects/test-project/secrets/my-secret/versions/1' },
    ])
    mockListSecretVersions.mockResolvedValue([[]])

    const result = await rotateSecret('my-secret', undefined, 'test-project')

    expect(result.success).toBe(true)
    // Verify addSecretVersion was called with a Buffer payload
    const callArg = mockAddSecretVersion.mock.calls[0][0]
    expect(Buffer.isBuffer(callArg.payload.data)).toBe(true)
  })

  it('handles missing version name in response', async () => {
    mockAddSecretVersion.mockResolvedValue([{}])
    mockListSecretVersions.mockResolvedValue([[]])

    const result = await rotateSecret(
      'my-secret',
      async () => 'val',
      'test-project'
    )

    expect(result.success).toBe(true)
    expect(result.newVersion).toBe('unknown')
  })
})

describe('disableOldVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables versions beyond keepCount', async () => {
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/p/secrets/s/versions/3', state: 'ENABLED', createTime: { seconds: 300 } },
      { name: 'projects/p/secrets/s/versions/2', state: 'ENABLED', createTime: { seconds: 200 } },
      { name: 'projects/p/secrets/s/versions/1', state: 'ENABLED', createTime: { seconds: 100 } },
    ]])
    mockDisableSecretVersion.mockResolvedValue([{}])

    const disabled = await disableOldVersions('my-secret', 2, 'test-project')

    // Should disable version 1 (oldest, beyond keepCount of 2)
    expect(disabled).toHaveLength(1)
    expect(disabled[0]).toBe('1')
    expect(mockDisableSecretVersion).toHaveBeenCalledTimes(1)
    expect(mockDisableSecretVersion).toHaveBeenCalledWith({
      name: 'projects/p/secrets/s/versions/1',
    })
  })

  it('handles no old versions (nothing to disable)', async () => {
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/p/secrets/s/versions/1', state: 'ENABLED', createTime: { seconds: 100 } },
    ]])

    const disabled = await disableOldVersions('my-secret', 2, 'test-project')

    expect(disabled).toHaveLength(0)
    expect(mockDisableSecretVersion).not.toHaveBeenCalled()
  })

  it('ignores already-disabled versions', async () => {
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/p/secrets/s/versions/3', state: 'ENABLED', createTime: { seconds: 300 } },
      { name: 'projects/p/secrets/s/versions/2', state: 'DISABLED', createTime: { seconds: 200 } },
      { name: 'projects/p/secrets/s/versions/1', state: 'ENABLED', createTime: { seconds: 100 } },
    ]])
    mockDisableSecretVersion.mockResolvedValue([{}])

    const disabled = await disableOldVersions('my-secret', 1, 'test-project')

    // Only version 1 should be disabled (version 2 already disabled, not in enabled list)
    expect(disabled).toHaveLength(1)
    expect(disabled[0]).toBe('1')
  })

  it('handles disable API failure gracefully for individual versions', async () => {
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/p/secrets/s/versions/3', state: 'ENABLED', createTime: { seconds: 300 } },
      { name: 'projects/p/secrets/s/versions/2', state: 'ENABLED', createTime: { seconds: 200 } },
      { name: 'projects/p/secrets/s/versions/1', state: 'ENABLED', createTime: { seconds: 100 } },
    ]])
    mockDisableSecretVersion.mockRejectedValue(new Error('Permission denied'))

    const disabled = await disableOldVersions('my-secret', 1, 'test-project')

    // Failed disables are not added to the list
    expect(disabled).toHaveLength(0)
  })

  it('skips versions with no name', async () => {
    mockListSecretVersions.mockResolvedValue([[
      { name: 'projects/p/secrets/s/versions/3', state: 'ENABLED', createTime: { seconds: 300 } },
      { state: 'ENABLED', createTime: { seconds: 200 } }, // no name
      { name: 'projects/p/secrets/s/versions/1', state: 'ENABLED', createTime: { seconds: 100 } },
    ]])
    mockDisableSecretVersion.mockResolvedValue([{}])

    const disabled = await disableOldVersions('my-secret', 1, 'test-project')

    // The nameless version counts in the sort but is skipped during disable
    // versions sorted: 3 (300), unnamed (200), 1 (100)
    // keepCount=1, so disable the rest: unnamed (skipped) + version 1
    expect(disabled).toHaveLength(1)
    expect(disabled[0]).toBe('1')
  })
})

describe('scheduleRotation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddSecretVersion.mockResolvedValue([
      { name: 'projects/p/secrets/s/versions/1' },
    ])
    mockListSecretVersions.mockResolvedValue([[]])
  })

  it('returns a handler function', () => {
    const handler = scheduleRotation([
      { secretId: 'my-secret' },
    ])
    expect(typeof handler).toBe('function')
  })

  it('handler rotates all configured secrets', async () => {
    const handler = scheduleRotation([
      { secretId: 'secret-a', generateValue: async () => 'val-a' },
      { secretId: 'secret-b', generateValue: async () => 'val-b' },
    ])

    const results = await handler()

    expect(results).toHaveProperty('secret-a')
    expect(results).toHaveProperty('secret-b')
    expect(results['secret-a'].success).toBe(true)
    expect(results['secret-b'].success).toBe(true)
  })

  it('handler sends response when res object provided', async () => {
    const handler = scheduleRotation([
      { secretId: 'secret-a', generateValue: async () => 'val-a' },
    ])

    const mockJson = vi.fn()
    const mockStatus = vi.fn().mockReturnValue({ json: mockJson })
    const mockRes = { status: mockStatus }

    await handler(undefined, mockRes)

    expect(mockStatus).toHaveBeenCalledWith(200)
    expect(mockJson).toHaveBeenCalled()
  })

  it('handler returns 500 status when any rotation fails', async () => {
    // First call succeeds, second fails
    mockAddSecretVersion
      .mockResolvedValueOnce([{ name: 'projects/p/secrets/s/versions/1' }])
      .mockRejectedValueOnce(new Error('Failed'))

    const handler = scheduleRotation([
      { secretId: 'good-secret', generateValue: async () => 'val' },
      { secretId: 'bad-secret', generateValue: async () => 'val' },
    ])

    const mockJson = vi.fn()
    const mockStatus = vi.fn().mockReturnValue({ json: mockJson })
    const mockRes = { status: mockStatus }

    await handler(undefined, mockRes)

    expect(mockStatus).toHaveBeenCalledWith(500)
  })

  it('uses default base64 generator when none provided in config', async () => {
    const handler = scheduleRotation([
      { secretId: 'my-secret' },
    ])

    const results = await handler()

    expect(results['my-secret'].success).toBe(true)
    // Verify the payload is a Buffer (from base64 generator)
    const callArg = mockAddSecretVersion.mock.calls[0][0]
    expect(Buffer.isBuffer(callArg.payload.data)).toBe(true)
  })
})
