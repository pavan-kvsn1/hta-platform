/**
 * Secrets Access Module Unit Tests
 *
 * Tests for:
 * - getSecret() — dev mode env fallback, prod mode with client, missing secret
 * - getSecretWithMetadata() — retrieves value + metadata
 * - secretExists() — checks if secret exists in Secret Manager
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock the logger
vi.mock('../src/logger/index.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}))

const mockAccessSecretVersion = vi.fn()
const mockGetSecret = vi.fn()

vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn().mockImplementation(() => ({
    accessSecretVersion: mockAccessSecretVersion,
    getSecret: mockGetSecret,
  })),
}))

import { getSecret, getSecretWithMetadata, secretExists } from '../src/secrets/access'

describe('Secrets Access Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('getSecret', () => {
    it('returns env var in development mode', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('DATABASE_URL', 'postgres://dev:5432/test')

      const result = await getSecret('database-url')

      expect(result).toBe('postgres://dev:5432/test')
    })

    it('converts secret ID to env var format (hyphens to underscores, uppercase)', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('MY_CUSTOM_SECRET', 'custom-value')

      const result = await getSecret('my-custom-secret')

      expect(result).toBe('custom-value')
    })

    it('fetches from Secret Manager in production when env var not set', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: Buffer.from('secret-from-sm') },
        name: 'projects/test-project/secrets/my-secret/versions/latest',
      }])

      const result = await getSecret('my-secret')

      expect(result).toBe('secret-from-sm')
      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/my-secret/versions/latest',
      })
    })

    it('uses custom version when specified', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: Buffer.from('v2-value') },
      }])

      const result = await getSecret('my-secret', { version: '2' })

      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/my-secret/versions/2',
      })
      expect(result).toBe('v2-value')
    })

    it('uses custom projectId when specified', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: Buffer.from('val') },
      }])

      await getSecret('my-secret', { projectId: 'custom-project' })

      expect(mockAccessSecretVersion).toHaveBeenCalledWith({
        name: 'projects/custom-project/secrets/my-secret/versions/latest',
      })
    })

    it('throws when secret has no data', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: undefined },
      }])

      await expect(getSecret('empty-secret')).rejects.toThrow('has no data')
    })

    it('throws when access fails', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockRejectedValue(new Error('Permission denied'))

      await expect(getSecret('forbidden-secret')).rejects.toThrow('Permission denied')
    })

    it('handles string payload data', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: 'string-payload' },
      }])

      const result = await getSecret('my-secret')

      expect(result).toBe('string-payload')
    })
  })

  describe('getSecretWithMetadata', () => {
    it('returns value and metadata', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: Buffer.from('secret-val') },
        name: 'projects/test-project/secrets/db-url/versions/3',
        createTime: { seconds: 1700000000 },
        state: 'ENABLED',
      }])

      const result = await getSecretWithMetadata('db-url')

      expect(result.value).toBe('secret-val')
      expect(result.metadata.name).toBe('projects/test-project/secrets/db-url/versions/3')
      expect(result.metadata.version).toBe('3')
      expect(result.metadata.state).toBe('ENABLED')
      expect(result.metadata.createTime).toBeInstanceOf(Date)
    })

    it('handles missing metadata fields', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: { data: Buffer.from('val') },
      }])

      const result = await getSecretWithMetadata('my-secret')

      expect(result.value).toBe('val')
      expect(result.metadata.name).toBe('my-secret')
      expect(result.metadata.version).toBe('latest')
    })

    it('throws when no payload data', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('GCP_PROJECT_ID', 'test-project')

      mockAccessSecretVersion.mockResolvedValue([{
        payload: {},
      }])

      await expect(getSecretWithMetadata('no-data')).rejects.toThrow('has no data')
    })
  })

  describe('secretExists', () => {
    it('returns true when secret exists', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      mockGetSecret.mockResolvedValue([{}])

      const result = await secretExists('my-secret', 'test-project')

      expect(result).toBe(true)
      expect(mockGetSecret).toHaveBeenCalledWith({
        name: 'projects/test-project/secrets/my-secret',
      })
    })

    it('returns false when secret not found (code 5)', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error: any = new Error('NOT_FOUND')
      error.code = 5
      mockGetSecret.mockRejectedValue(error)

      const result = await secretExists('missing-secret', 'test-project')

      expect(result).toBe(false)
    })

    it('throws for non-NOT_FOUND errors', async () => {
      vi.stubEnv('NODE_ENV', 'production')

      const error: any = new Error('Permission denied')
      error.code = 7
      mockGetSecret.mockRejectedValue(error)

      await expect(secretExists('my-secret', 'test-project')).rejects.toThrow('Permission denied')
    })
  })
})
