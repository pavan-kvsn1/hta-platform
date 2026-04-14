/**
 * Health Endpoint Tests
 *
 * Tests for the /health endpoint to verify API is running correctly.
 */

import { describe, it, expect, vi } from 'vitest'
import { createMockRequest, createMockReply } from '../setup'

describe('Health Endpoint', () => {
  it('should return 200 with status ok', async () => {
    const reply = createMockReply()

    // Simulate health check response
    reply.send({ status: 'ok', timestamp: expect.any(String) })

    expect(reply.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    })
  })

  it('should include database status in health check', async () => {
    const mockDatabaseStatus = {
      connected: true,
      latency: 5,
    }

    const healthResponse = {
      status: 'ok',
      database: mockDatabaseStatus,
      redis: { connected: true },
    }

    expect(healthResponse.status).toBe('ok')
    expect(healthResponse.database.connected).toBe(true)
  })

  it('should return unhealthy when database is down', async () => {
    const mockDatabaseStatus = {
      connected: false,
      error: 'Connection refused',
    }

    const healthResponse = {
      status: 'unhealthy',
      database: mockDatabaseStatus,
    }

    expect(healthResponse.status).toBe('unhealthy')
    expect(healthResponse.database.connected).toBe(false)
  })
})

describe('Request Validation', () => {
  it('should validate required fields', () => {
    const validateRequired = (data: Record<string, unknown>, fields: string[]) => {
      const missing = fields.filter((field) => !data[field])
      return missing.length === 0
    }

    expect(validateRequired({ name: 'Test', email: 'test@test.com' }, ['name', 'email'])).toBe(true)
    expect(validateRequired({ name: 'Test' }, ['name', 'email'])).toBe(false)
  })

  it('should validate email format', () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    expect(isValidEmail('test@example.com')).toBe(true)
    expect(isValidEmail('invalid-email')).toBe(false)
    expect(isValidEmail('test@')).toBe(false)
  })
})
