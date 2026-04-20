/**
 * In-Memory Cache Provider
 *
 * Simple in-memory cache for local development.
 * Uses a Map with TTL support and automatic cleanup.
 */

import { CacheProvider } from '../types.js'

interface MemoryEntry<T> {
  value: T
  expiresAt: number | null
}

export class MemoryCacheProvider implements CacheProvider {
  private cache: Map<string, MemoryEntry<unknown>>
  private maxSize: number
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor(options: { maxSize?: number; checkPeriod?: number } = {}) {
    this.cache = new Map()
    this.maxSize = options.maxSize || 10000

    const checkPeriod = (options.checkPeriod || 60) * 1000
    this.cleanupInterval = setInterval(() => this.cleanup(), checkPeriod)

    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref()
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key) as MemoryEntry<T> | undefined

    if (!entry) {
      return null
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.value
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (this.cache.size >= this.maxSize) {
      const keysToDelete = Array.from(this.cache.keys()).slice(0, Math.floor(this.maxSize * 0.1))
      keysToDelete.forEach(k => this.cache.delete(k))
    }

    const expiresAt = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null

    this.cache.set(key, { value, expiresAt })
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key)
  }

  async deletePattern(pattern: string): Promise<number> {
    const regexPattern = pattern.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(`^${regexPattern}$`)
    let count = 0

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key)
        count++
      }
    }

    return count
  }

  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return false
    }

    return true
  }

  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)))
  }

  async mset<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void> {
    await Promise.all(
      entries.map(({ key, value, ttlSeconds }) => this.set(key, value, ttlSeconds))
    )
  }

  async incr(key: string): Promise<number> {
    const current = await this.get<number>(key)
    const newValue = (current || 0) + 1
    await this.set(key, newValue)
    return newValue
  }

  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    const entry = this.cache.get(key)

    if (!entry) {
      return false
    }

    entry.expiresAt = Date.now() + (ttlSeconds * 1000)
    return true
  }

  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key)

    if (!entry) {
      return -2
    }

    if (entry.expiresAt === null) {
      return -1
    }

    const remaining = Math.ceil((entry.expiresAt - Date.now()) / 1000)
    return remaining > 0 ? remaining : -2
  }

  async ping(): Promise<boolean> {
    return true
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.cache.clear()
  }

  private cleanup(): void {
    const now = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  get size(): number {
    return this.cache.size
  }

  get keys(): string[] {
    return Array.from(this.cache.keys())
  }
}

let memoryCache: MemoryCacheProvider | null = null

export function getMemoryCacheProvider(options?: { maxSize?: number; checkPeriod?: number }): MemoryCacheProvider {
  if (!memoryCache) {
    memoryCache = new MemoryCacheProvider(options)
  }
  return memoryCache
}
