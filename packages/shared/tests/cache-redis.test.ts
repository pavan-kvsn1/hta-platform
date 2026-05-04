/**
 * Redis Cache Provider Unit Tests
 *
 * Tests for:
 * - get/set/delete operations
 * - TTL expiry handling
 * - Connection error handling (graceful fallback)
 * - Key pattern invalidation (deletePattern)
 * - Batch operations (mget/mset)
 * - incr, expire, ttl, ping, exists, close
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock Redis client methods
const mockGet = vi.fn()
const mockSet = vi.fn()
const mockSetex = vi.fn()
const mockDel = vi.fn()
const mockScan = vi.fn()
const mockExists = vi.fn()
const mockMget = vi.fn()
const mockIncr = vi.fn()
const mockExpire = vi.fn()
const mockTtl = vi.fn()
const mockPing = vi.fn()
const mockQuit = vi.fn()
const mockConnect = vi.fn()
const mockPipelineExec = vi.fn()
const mockPipelineSetex = vi.fn()
const mockPipelineSet = vi.fn()
const mockPipeline = vi.fn().mockReturnValue({
  setex: mockPipelineSetex,
  set: mockPipelineSet,
  exec: mockPipelineExec,
})
const mockOn = vi.fn()

const mockRedisInstance = {
  get: mockGet,
  set: mockSet,
  setex: mockSetex,
  del: mockDel,
  scan: mockScan,
  exists: mockExists,
  mget: mockMget,
  incr: mockIncr,
  expire: mockExpire,
  ttl: mockTtl,
  ping: mockPing,
  quit: mockQuit,
  connect: mockConnect,
  pipeline: mockPipeline,
  on: mockOn,
}

// Mock ioredis module
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => mockRedisInstance),
}))

import { RedisCacheProvider } from '../src/cache/providers/redis'

describe('RedisCacheProvider', () => {
  let provider: RedisCacheProvider

  beforeEach(() => {
    vi.clearAllMocks()
    mockConnect.mockResolvedValue(undefined)
    // Create a fresh provider each test
    provider = new RedisCacheProvider({
      host: 'localhost',
      port: 6379,
    })
  })

  describe('get', () => {
    it('returns parsed JSON value for existing key', async () => {
      mockGet.mockResolvedValue(JSON.stringify({ name: 'test' }))

      const result = await provider.get<{ name: string }>('key1')

      expect(result).toEqual({ name: 'test' })
      expect(mockGet).toHaveBeenCalledWith('key1')
    })

    it('returns null for non-existent key', async () => {
      mockGet.mockResolvedValue(null)

      const result = await provider.get('missing')

      expect(result).toBeNull()
    })

    it('returns null on connection error', async () => {
      mockGet.mockRejectedValue(new Error('Connection refused'))

      const result = await provider.get('key1')

      expect(result).toBeNull()
    })

    it('handles string values', async () => {
      mockGet.mockResolvedValue('"hello"')

      const result = await provider.get<string>('key1')

      expect(result).toBe('hello')
    })

    it('handles numeric values', async () => {
      mockGet.mockResolvedValue('42')

      const result = await provider.get<number>('key1')

      expect(result).toBe(42)
    })
  })

  describe('set', () => {
    it('sets value with TTL using setex', async () => {
      mockSetex.mockResolvedValue('OK')

      await provider.set('key1', { data: 'val' }, 300)

      expect(mockSetex).toHaveBeenCalledWith(
        'key1',
        300,
        JSON.stringify({ data: 'val' })
      )
    })

    it('sets value without TTL using set', async () => {
      mockSet.mockResolvedValue('OK')

      await provider.set('key1', 'value')

      expect(mockSet).toHaveBeenCalledWith('key1', JSON.stringify('value'))
    })

    it('handles set error gracefully (no throw)', async () => {
      mockSetex.mockRejectedValue(new Error('Write error'))

      await expect(provider.set('key1', 'val', 60)).resolves.not.toThrow()
    })
  })

  describe('delete', () => {
    it('returns true when key was deleted', async () => {
      mockDel.mockResolvedValue(1)

      const result = await provider.delete('key1')

      expect(result).toBe(true)
      expect(mockDel).toHaveBeenCalledWith('key1')
    })

    it('returns false when key did not exist', async () => {
      mockDel.mockResolvedValue(0)

      const result = await provider.delete('missing')

      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockDel.mockRejectedValue(new Error('Connection lost'))

      const result = await provider.delete('key1')

      expect(result).toBe(false)
    })
  })

  describe('deletePattern', () => {
    it('scans and deletes keys matching pattern', async () => {
      mockScan
        .mockResolvedValueOnce(['5', ['hta:user:1', 'hta:user:2']])
        .mockResolvedValueOnce(['0', ['hta:user:3']])
      mockDel
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(1)

      const count = await provider.deletePattern('hta:user:*')

      expect(count).toBe(3)
      expect(mockScan).toHaveBeenCalledTimes(2)
    })

    it('returns 0 when no keys match', async () => {
      mockScan.mockResolvedValue(['0', []])

      const count = await provider.deletePattern('nonexistent:*')

      expect(count).toBe(0)
    })

    it('returns 0 on error', async () => {
      mockScan.mockRejectedValue(new Error('Error'))

      const count = await provider.deletePattern('hta:*')

      expect(count).toBe(0)
    })
  })

  describe('exists', () => {
    it('returns true when key exists', async () => {
      mockExists.mockResolvedValue(1)

      const result = await provider.exists('key1')

      expect(result).toBe(true)
    })

    it('returns false when key does not exist', async () => {
      mockExists.mockResolvedValue(0)

      const result = await provider.exists('missing')

      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockExists.mockRejectedValue(new Error('Error'))

      const result = await provider.exists('key1')

      expect(result).toBe(false)
    })
  })

  describe('mget', () => {
    it('returns parsed values for multiple keys', async () => {
      mockMget.mockResolvedValue([
        JSON.stringify('a'),
        null,
        JSON.stringify('c'),
      ])

      const results = await provider.mget<string>(['k1', 'k2', 'k3'])

      expect(results).toEqual(['a', null, 'c'])
    })

    it('returns empty array for empty input', async () => {
      const results = await provider.mget<string>([])

      expect(results).toEqual([])
      expect(mockMget).not.toHaveBeenCalled()
    })

    it('returns nulls on error', async () => {
      mockMget.mockRejectedValue(new Error('Error'))

      const results = await provider.mget<string>(['k1', 'k2'])

      expect(results).toEqual([null, null])
    })

    it('handles invalid JSON gracefully', async () => {
      mockMget.mockResolvedValue(['invalid-json', JSON.stringify('valid')])

      const results = await provider.mget<string>(['k1', 'k2'])

      expect(results[0]).toBeNull()
      expect(results[1]).toBe('valid')
    })
  })

  describe('mset', () => {
    it('uses pipeline to set multiple values', async () => {
      mockPipelineExec.mockResolvedValue([])

      await provider.mset([
        { key: 'a', value: 1, ttlSeconds: 60 },
        { key: 'b', value: 2 },
      ])

      expect(mockPipeline).toHaveBeenCalled()
      expect(mockPipelineSetex).toHaveBeenCalledWith('a', 60, JSON.stringify(1))
      expect(mockPipelineSet).toHaveBeenCalledWith('b', JSON.stringify(2))
      expect(mockPipelineExec).toHaveBeenCalled()
    })

    it('does nothing for empty entries', async () => {
      await provider.mset([])

      expect(mockPipeline).not.toHaveBeenCalled()
    })

    it('handles mset error gracefully', async () => {
      mockPipelineExec.mockRejectedValue(new Error('Pipeline error'))

      await expect(
        provider.mset([{ key: 'a', value: 1 }])
      ).resolves.not.toThrow()
    })
  })

  describe('incr', () => {
    it('increments key and returns new value', async () => {
      mockIncr.mockResolvedValue(5)

      const result = await provider.incr('counter')

      expect(result).toBe(5)
      expect(mockIncr).toHaveBeenCalledWith('counter')
    })

    it('returns 0 on error', async () => {
      mockIncr.mockRejectedValue(new Error('Error'))

      const result = await provider.incr('counter')

      expect(result).toBe(0)
    })
  })

  describe('expire', () => {
    it('returns true when expiry was set', async () => {
      mockExpire.mockResolvedValue(1)

      const result = await provider.expire('key1', 300)

      expect(result).toBe(true)
      expect(mockExpire).toHaveBeenCalledWith('key1', 300)
    })

    it('returns false when key does not exist', async () => {
      mockExpire.mockResolvedValue(0)

      const result = await provider.expire('missing', 300)

      expect(result).toBe(false)
    })

    it('returns false on error', async () => {
      mockExpire.mockRejectedValue(new Error('Error'))

      const result = await provider.expire('key1', 300)

      expect(result).toBe(false)
    })
  })

  describe('ttl', () => {
    it('returns remaining TTL in seconds', async () => {
      mockTtl.mockResolvedValue(120)

      const result = await provider.ttl('key1')

      expect(result).toBe(120)
    })

    it('returns -2 on error', async () => {
      mockTtl.mockRejectedValue(new Error('Error'))

      const result = await provider.ttl('key1')

      expect(result).toBe(-2)
    })
  })

  describe('ping', () => {
    it('returns true when Redis responds with PONG', async () => {
      mockPing.mockResolvedValue('PONG')

      const result = await provider.ping()

      expect(result).toBe(true)
    })

    it('returns false on error', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'))

      const result = await provider.ping()

      expect(result).toBe(false)
    })

    it('returns false when ping returns unexpected value', async () => {
      mockPing.mockResolvedValue('NOT_PONG')

      const result = await provider.ping()

      expect(result).toBe(false)
    })
  })

  describe('close', () => {
    it('calls quit on the Redis client', async () => {
      mockQuit.mockResolvedValue('OK')

      // First make a call to initialize the client
      mockGet.mockResolvedValue(null)
      await provider.get('test')

      await provider.close()

      expect(mockQuit).toHaveBeenCalled()
    })

    it('handles close when no client exists', async () => {
      // New provider, never connected
      const freshProvider = new RedisCacheProvider({ host: 'localhost', port: 6379 })

      await expect(freshProvider.close()).resolves.not.toThrow()
    })
  })
})
