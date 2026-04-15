import { describe, it, expect } from 'vitest'
import { safeJsonParse, safeJsonStringify } from '../../src/lib/utils/safe-json'

describe('Safe JSON Utils', () => {
  describe('safeJsonParse', () => {
    it('should return default value for null', () => {
      expect(safeJsonParse(null, { default: true })).toEqual({ default: true })
    })

    it('should return default value for undefined', () => {
      expect(safeJsonParse(undefined, [])).toEqual([])
    })

    it('should return object as-is when already parsed (PostgreSQL native JSON)', () => {
      const input = { name: 'test', count: 5 }
      expect(safeJsonParse(input, {})).toEqual(input)
    })

    it('should return array as-is when already parsed (PostgreSQL native JSON)', () => {
      const input = [1, 2, 3]
      expect(safeJsonParse(input, [])).toEqual(input)
    })

    it('should parse valid JSON string (SQLite legacy format)', () => {
      const input = '{"name":"test","count":5}'
      expect(safeJsonParse(input, {})).toEqual({ name: 'test', count: 5 })
    })

    it('should parse JSON array string', () => {
      const input = '[1,2,3]'
      expect(safeJsonParse(input, [])).toEqual([1, 2, 3])
    })

    it('should return default value for invalid JSON string', () => {
      const input = 'not valid json'
      expect(safeJsonParse(input, { fallback: true })).toEqual({ fallback: true })
    })

    it('should return default value for malformed JSON string', () => {
      const input = '{"incomplete": '
      expect(safeJsonParse(input, [])).toEqual([])
    })

    it('should handle nested objects correctly', () => {
      const input = '{"outer":{"inner":{"value":42}}}'
      expect(safeJsonParse(input, {})).toEqual({
        outer: { inner: { value: 42 } },
      })
    })

    it('should handle empty object string', () => {
      expect(safeJsonParse('{}', { default: true })).toEqual({})
    })

    it('should handle empty array string', () => {
      expect(safeJsonParse('[]', [1, 2, 3])).toEqual([])
    })

    it('should return default for non-JSON primitive types', () => {
      expect(safeJsonParse(42, 'default')).toBe('default')
      expect(safeJsonParse(true, 'default')).toBe('default')
    })

    it('should preserve type information through parsing', () => {
      interface TestType {
        id: number
        name: string
      }
      const input = '{"id":1,"name":"test"}'
      const result = safeJsonParse<TestType>(input, { id: 0, name: '' })
      expect(result.id).toBe(1)
      expect(result.name).toBe('test')
    })
  })

  describe('safeJsonStringify', () => {
    it('should return string as-is if already a string', () => {
      expect(safeJsonStringify('already a string')).toBe('already a string')
    })

    it('should return JSON string as-is', () => {
      const jsonStr = '{"key":"value"}'
      expect(safeJsonStringify(jsonStr)).toBe(jsonStr)
    })

    it('should stringify objects', () => {
      const input = { name: 'test', count: 5 }
      expect(safeJsonStringify(input)).toBe('{"name":"test","count":5}')
    })

    it('should stringify arrays', () => {
      const input = [1, 2, 3]
      expect(safeJsonStringify(input)).toBe('[1,2,3]')
    })

    it('should stringify nested objects', () => {
      const input = { outer: { inner: { value: 42 } } }
      expect(safeJsonStringify(input)).toBe('{"outer":{"inner":{"value":42}}}')
    })

    it('should stringify null', () => {
      expect(safeJsonStringify(null)).toBe('null')
    })

    it('should stringify boolean', () => {
      expect(safeJsonStringify(true)).toBe('true')
      expect(safeJsonStringify(false)).toBe('false')
    })

    it('should stringify number', () => {
      expect(safeJsonStringify(42)).toBe('42')
      expect(safeJsonStringify(3.14)).toBe('3.14')
    })

    it('should stringify empty object', () => {
      expect(safeJsonStringify({})).toBe('{}')
    })

    it('should stringify empty array', () => {
      expect(safeJsonStringify([])).toBe('[]')
    })
  })

  describe('round-trip consistency', () => {
    it('should maintain data integrity through stringify -> parse', () => {
      const original = {
        id: 123,
        name: 'Test Certificate',
        values: [1.5, 2.5, 3.5],
        nested: { flag: true, count: 0 },
      }
      const stringified = safeJsonStringify(original)
      const parsed = safeJsonParse(stringified, {})
      expect(parsed).toEqual(original)
    })

    it('should handle complex nested structures', () => {
      const original = {
        parameters: [
          { id: 1, name: 'Temp', results: [{ point: 1, value: 25 }] },
          { id: 2, name: 'Humidity', results: [{ point: 1, value: 60 }] },
        ],
      }
      const stringified = safeJsonStringify(original)
      const parsed = safeJsonParse(stringified, {})
      expect(parsed).toEqual(original)
    })
  })
})
