/**
 * Safe JSON Utility Tests
 *
 * Tests for JSON parsing/stringify utilities that handle
 * both SQLite string JSON and PostgreSQL native JSON.
 */
import { describe, it, expect } from 'vitest'
import { safeJsonParse, safeJsonStringify } from '@/lib/utils/safe-json'

describe('safeJsonParse', () => {
  describe('null/undefined handling', () => {
    it('returns default value for null', () => {
      const result = safeJsonParse(null, { fallback: true })
      expect(result).toEqual({ fallback: true })
    })

    it('returns default value for undefined', () => {
      const result = safeJsonParse(undefined, [])
      expect(result).toEqual([])
    })

    it('returns empty array as default', () => {
      const result = safeJsonParse(null, [])
      expect(result).toEqual([])
    })

    it('returns empty object as default', () => {
      const result = safeJsonParse(null, {})
      expect(result).toEqual({})
    })
  })

  describe('native JSON (PostgreSQL format)', () => {
    it('returns object as-is when already parsed', () => {
      const input = { name: 'Test', value: 123 }
      const result = safeJsonParse(input, {})
      expect(result).toEqual(input)
    })

    it('returns array as-is when already parsed', () => {
      const input = [1, 2, 3, 'four']
      const result = safeJsonParse(input, [])
      expect(result).toEqual(input)
    })

    it('preserves nested objects', () => {
      const input = {
        level1: {
          level2: {
            value: 'deep',
          },
        },
      }
      const result = safeJsonParse(input, {})
      expect(result).toEqual(input)
    })
  })

  describe('string JSON (SQLite legacy format)', () => {
    it('parses valid JSON string to object', () => {
      const input = '{"name":"Test","value":123}'
      const result = safeJsonParse(input, {})
      expect(result).toEqual({ name: 'Test', value: 123 })
    })

    it('parses valid JSON string to array', () => {
      const input = '[1, 2, 3, "four"]'
      const result = safeJsonParse(input, [])
      expect(result).toEqual([1, 2, 3, 'four'])
    })

    it('returns default for invalid JSON string', () => {
      const input = 'not valid json {'
      const result = safeJsonParse(input, { error: true })
      expect(result).toEqual({ error: true })
    })

    it('returns default for empty string', () => {
      const input = ''
      const result = safeJsonParse(input, [])
      expect(result).toEqual([])
    })

    it('parses nested JSON string', () => {
      const input = '{"outer":{"inner":{"value":42}}}'
      const result = safeJsonParse(input, {})
      expect(result).toEqual({ outer: { inner: { value: 42 } } })
    })
  })

  describe('edge cases', () => {
    it('returns default for number input', () => {
      const result = safeJsonParse(123, 'default')
      expect(result).toBe('default')
    })

    it('returns default for boolean input', () => {
      const result = safeJsonParse(true, 'default')
      expect(result).toBe('default')
    })

    it('handles JSON strings with special characters', () => {
      const input = '{"message":"Hello\\nWorld"}'
      const result = safeJsonParse(input, {})
      expect(result).toEqual({ message: 'Hello\nWorld' })
    })

    it('handles JSON with unicode characters', () => {
      const input = '{"text":"こんにちは"}'
      const result = safeJsonParse(input, {})
      expect(result).toEqual({ text: 'こんにちは' })
    })
  })

  describe('type inference', () => {
    it('infers correct type from default value', () => {
      interface TestType {
        id: number
        name: string
      }
      const defaultValue: TestType = { id: 0, name: '' }
      const result = safeJsonParse<TestType>('{"id":1,"name":"Test"}', defaultValue)
      expect(result.id).toBe(1)
      expect(result.name).toBe('Test')
    })
  })
})

describe('safeJsonStringify', () => {
  describe('object stringification', () => {
    it('stringifies object to JSON', () => {
      const input = { name: 'Test', value: 123 }
      const result = safeJsonStringify(input)
      expect(result).toBe('{"name":"Test","value":123}')
    })

    it('stringifies array to JSON', () => {
      const input = [1, 2, 3]
      const result = safeJsonStringify(input)
      expect(result).toBe('[1,2,3]')
    })

    it('stringifies nested object', () => {
      const input = { outer: { inner: 'value' } }
      const result = safeJsonStringify(input)
      expect(result).toBe('{"outer":{"inner":"value"}}')
    })
  })

  describe('string passthrough', () => {
    it('returns string as-is', () => {
      const input = 'already a string'
      const result = safeJsonStringify(input)
      expect(result).toBe('already a string')
    })

    it('returns JSON string as-is', () => {
      const input = '{"already":"json"}'
      const result = safeJsonStringify(input)
      expect(result).toBe('{"already":"json"}')
    })
  })

  describe('special values', () => {
    it('stringifies null', () => {
      const result = safeJsonStringify(null)
      expect(result).toBe('null')
    })

    it('stringifies number', () => {
      const result = safeJsonStringify(42)
      expect(result).toBe('42')
    })

    it('stringifies boolean', () => {
      const result = safeJsonStringify(true)
      expect(result).toBe('true')
    })
  })
})
