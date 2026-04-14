/**
 * Unit tests for GCP Secret Manager integration
 *
 * Tests for:
 * - Development mode env var fallback behavior
 * - Cache utilities
 * - Type-safe secret getters
 *
 * Migrated from hta-calibration/tests/unit/secrets.test.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the logger
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

describe('secrets module', () => {
  let getSecret: typeof import('../src/secrets').getSecret
  let initializeSecrets: typeof import('../src/secrets').initializeSecrets
  let clearSecretCache: typeof import('../src/secrets').clearSecretCache
  let getSecretCacheStats: typeof import('../src/secrets').getSecretCacheStats
  let secrets: typeof import('../src/secrets').secrets

  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules()

    // Import fresh module
    const secretsModule = await import('../src/secrets')
    getSecret = secretsModule.getSecret
    initializeSecrets = secretsModule.initializeSecrets
    clearSecretCache = secretsModule.clearSecretCache
    getSecretCacheStats = secretsModule.getSecretCacheStats
    secrets = secretsModule.secrets
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getSecret - development mode (env var fallback)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('returns environment variable for known secret', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-api-key-123')

      const result = await getSecret('resend-api-key')

      expect(result).toBe('test-api-key-123')
    })

    it('returns DATABASE_URL for database-url secret', async () => {
      vi.stubEnv('DATABASE_URL', 'postgresql://localhost:5432/test')

      const result = await getSecret('database-url')

      expect(result).toBe('postgresql://localhost:5432/test')
    })

    it('returns NEXTAUTH_SECRET for nextauth-secret', async () => {
      vi.stubEnv('NEXTAUTH_SECRET', 'super-secret-key')

      const result = await getSecret('nextauth-secret')

      expect(result).toBe('super-secret-key')
    })

    it('returns empty string if env var not set', async () => {
      vi.stubEnv('RESEND_API_KEY', '')

      const result = await getSecret('resend-api-key')

      expect(result).toBe('')
    })

    it('converts unknown secret ID to env var format', async () => {
      vi.stubEnv('CUSTOM_API_TOKEN', 'custom-value')

      const result = await getSecret('custom-api-token')

      expect(result).toBe('custom-value')
    })

    it('returns empty string for completely unknown secret', async () => {
      const result = await getSecret('nonexistent-secret')

      expect(result).toBe('')
    })
  })

  describe('getSecret - test mode (also uses env var fallback)', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'test')
    })

    it('uses env var fallback in test environment', async () => {
      vi.stubEnv('RESEND_API_KEY', 'test-mode-key')

      const result = await getSecret('resend-api-key')

      expect(result).toBe('test-mode-key')
    })
  })

  describe('getSecret - production mode without GCP_PROJECT_ID', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', '')
    })

    it('falls back to env var when GCP_PROJECT_ID not set', async () => {
      vi.stubEnv('RESEND_API_KEY', 'fallback-key')

      const result = await getSecret('resend-api-key')

      expect(result).toBe('fallback-key')
    })
  })

  describe('initializeSecrets', () => {
    it('skips pre-fetch in development', async () => {
      vi.stubEnv('NODE_ENV', 'development')

      await expect(initializeSecrets()).resolves.toBeUndefined()
    })

    it('skips pre-fetch in test environment', async () => {
      vi.stubEnv('NODE_ENV', 'test')

      await expect(initializeSecrets()).resolves.toBeUndefined()
    })
  })

  describe('clearSecretCache', () => {
    it('clears cache without error', () => {
      expect(() => clearSecretCache()).not.toThrow()
    })

    it('cache is empty after clear', () => {
      clearSecretCache()
      const stats = getSecretCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.entries).toHaveLength(0)
    })
  })

  describe('getSecretCacheStats', () => {
    it('returns empty stats initially', () => {
      clearSecretCache()
      const stats = getSecretCacheStats()

      expect(stats.size).toBe(0)
      expect(stats.entries).toEqual([])
    })

    it('returns correct structure', () => {
      const stats = getSecretCacheStats()

      expect(stats).toHaveProperty('size')
      expect(stats).toHaveProperty('entries')
      expect(Array.isArray(stats.entries)).toBe(true)
    })
  })

  describe('typed secret getters', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
    })

    it('secrets.nextAuthSecret() returns NEXTAUTH_SECRET', async () => {
      vi.stubEnv('NEXTAUTH_SECRET', 'auth-secret-value')

      const result = await secrets.nextAuthSecret()

      expect(result).toBe('auth-secret-value')
    })

    it('secrets.databaseUrl() returns DATABASE_URL', async () => {
      vi.stubEnv('DATABASE_URL', 'postgres://test')

      const result = await secrets.databaseUrl()

      expect(result).toBe('postgres://test')
    })

    it('secrets.resendApiKey() returns RESEND_API_KEY', async () => {
      vi.stubEnv('RESEND_API_KEY', 'resend-key')

      const result = await secrets.resendApiKey()

      expect(result).toBe('resend-key')
    })

    it('secrets.redisUrl() returns REDIS_URL', async () => {
      vi.stubEnv('REDIS_URL', 'redis://localhost:6379')

      const result = await secrets.redisUrl()

      expect(result).toBe('redis://localhost:6379')
    })

    it('secrets.emailFrom() returns EMAIL_FROM', async () => {
      vi.stubEnv('EMAIL_FROM', 'noreply@test.com')

      const result = await secrets.emailFrom()

      expect(result).toBe('noreply@test.com')
    })
  })

  describe('GetSecretOptions', () => {
    beforeEach(() => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('RESEND_API_KEY', 'test-key')
    })

    it('accepts version option (ignored in dev mode)', async () => {
      const result = await getSecret('resend-api-key', { version: '2' })

      expect(result).toBe('test-key')
    })

    it('accepts bypassCache option (no-op in dev mode)', async () => {
      const result = await getSecret('resend-api-key', { bypassCache: true })

      expect(result).toBe('test-key')
    })

    it('accepts cacheTtlMs option', async () => {
      const result = await getSecret('resend-api-key', { cacheTtlMs: 60000 })

      expect(result).toBe('test-key')
    })

    it('accepts all options together', async () => {
      const result = await getSecret('resend-api-key', {
        version: 'latest',
        bypassCache: false,
        cacheTtlMs: 300000,
      })

      expect(result).toBe('test-key')
    })
  })
})
