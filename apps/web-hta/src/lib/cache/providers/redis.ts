/**
 * Redis Cache Provider
 *
 * Production-ready Redis cache provider using ioredis.
 * Supports GCP Memorystore and standalone Redis.
 */

import { CacheProvider } from '../types'

// Dynamic import to avoid requiring redis in development
let Redis: typeof import('ioredis').default | null = null

async function getRedis() {
  if (!Redis) {
    const ioredis = await import('ioredis')
    Redis = ioredis.default
  }
  return Redis
}

export class RedisCacheProvider implements CacheProvider {
  private client: import('ioredis').default | null = null
  private config: {
    host: string
    port: number
    password?: string
    tls?: boolean
    db?: number
    keyPrefix?: string
  }
  private connected: boolean = false

  constructor(config: {
    host: string
    port: number
    password?: string
    tls?: boolean
    db?: number
    keyPrefix?: string
  }) {
    this.config = config
  }

  /**
   * Initialize Redis connection
   */
  private async getClient(): Promise<import('ioredis').default> {
    if (this.client && this.connected) {
      return this.client
    }

    const RedisClient = await getRedis()

    this.client = new RedisClient({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db || 0,
      keyPrefix: this.config.keyPrefix || '',
      tls: this.config.tls ? {} : undefined,
      retryStrategy: (times) => {
        if (times > 3) {
          console.error('[Redis] Max retries reached, giving up')
          return null
        }
        return Math.min(times * 200, 2000)
      },
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    })

    this.client.on('connect', () => {
      this.connected = true
      console.log('[Redis] Connected')
    })

    this.client.on('error', (err) => {
      console.error('[Redis] Error:', err.message)
      this.connected = false
    })

    this.client.on('close', () => {
      this.connected = false
      console.log('[Redis] Connection closed')
    })

    await this.client.connect()
    return this.client
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const client = await this.getClient()
      const value = await client.get(key)

      if (value === null) {
        return null
      }

      return JSON.parse(value) as T
    } catch (error) {
      console.error('[Redis] Get error:', error)
      return null
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const client = await this.getClient()
      const serialized = JSON.stringify(value)

      if (ttlSeconds) {
        await client.setex(key, ttlSeconds, serialized)
      } else {
        await client.set(key, serialized)
      }
    } catch (error) {
      console.error('[Redis] Set error:', error)
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const result = await client.del(key)
      return result > 0
    } catch (error) {
      console.error('[Redis] Delete error:', error)
      return false
    }
  }

  async deletePattern(pattern: string): Promise<number> {
    try {
      const client = await this.getClient()
      let cursor = '0'
      let totalDeleted = 0

      do {
        const [newCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', 100)
        cursor = newCursor

        if (keys.length > 0) {
          const deleted = await client.del(...keys)
          totalDeleted += deleted
        }
      } while (cursor !== '0')

      return totalDeleted
    } catch (error) {
      console.error('[Redis] DeletePattern error:', error)
      return 0
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const client = await this.getClient()
      const result = await client.exists(key)
      return result > 0
    } catch (error) {
      console.error('[Redis] Exists error:', error)
      return false
    }
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) {
      return []
    }

    try {
      const client = await this.getClient()
      const values = await client.mget(...keys)

      return values.map(value => {
        if (value === null) {
          return null
        }
        try {
          return JSON.parse(value) as T
        } catch {
          return null
        }
      })
    } catch (error) {
      console.error('[Redis] Mget error:', error)
      return keys.map(() => null)
    }
  }

  async mset<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void> {
    if (entries.length === 0) {
      return
    }

    try {
      const client = await this.getClient()
      const pipeline = client.pipeline()

      for (const { key, value, ttlSeconds } of entries) {
        const serialized = JSON.stringify(value)
        if (ttlSeconds) {
          pipeline.setex(key, ttlSeconds, serialized)
        } else {
          pipeline.set(key, serialized)
        }
      }

      await pipeline.exec()
    } catch (error) {
      console.error('[Redis] Mset error:', error)
    }
  }

  async incr(key: string): Promise<number> {
    try {
      const client = await this.getClient()
      return await client.incr(key)
    } catch (error) {
      console.error('[Redis] Incr error:', error)
      return 0
    }
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      const client = await this.getClient()
      const result = await client.expire(key, ttlSeconds)
      return result === 1
    } catch (error) {
      console.error('[Redis] Expire error:', error)
      return false
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      const client = await this.getClient()
      return await client.ttl(key)
    } catch (error) {
      console.error('[Redis] TTL error:', error)
      return -2
    }
  }

  async ping(): Promise<boolean> {
    try {
      const client = await this.getClient()
      const result = await client.ping()
      return result === 'PONG'
    } catch (error) {
      console.error('[Redis] Ping error:', error)
      return false
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.quit()
      this.client = null
      this.connected = false
    }
  }
}

// Singleton instance
let redisCache: RedisCacheProvider | null = null

export function getRedisCacheProvider(config?: {
  host?: string
  port?: number
  password?: string
  tls?: boolean
  db?: number
  keyPrefix?: string
}): RedisCacheProvider {
  if (!redisCache) {
    const redisConfig = {
      host: config?.host || process.env.REDIS_HOST || 'localhost',
      port: config?.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: config?.password || process.env.REDIS_PASSWORD,
      tls: config?.tls ?? process.env.REDIS_TLS === 'true',
      db: config?.db || parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: config?.keyPrefix || process.env.REDIS_KEY_PREFIX || 'hta:',
    }

    redisCache = new RedisCacheProvider(redisConfig)
  }

  return redisCache
}
