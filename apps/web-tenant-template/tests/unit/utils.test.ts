import { describe, it, expect } from 'vitest'
import { cn } from '../../src/lib/utils'

describe('Utils', () => {
  describe('cn (classNames utility)', () => {
    it('should merge single class', () => {
      expect(cn('text-red-500')).toBe('text-red-500')
    })

    it('should merge multiple classes', () => {
      expect(cn('text-red-500', 'bg-blue-500')).toBe('text-red-500 bg-blue-500')
    })

    it('should handle conditional classes', () => {
      const isActive = true
      const isDisabled = false

      expect(cn(
        'base-class',
        isActive && 'active',
        isDisabled && 'disabled'
      )).toBe('base-class active')
    })

    it('should merge Tailwind classes intelligently', () => {
      // tailwind-merge should handle conflicting classes
      expect(cn('px-2', 'px-4')).toBe('px-4')
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('should handle arrays of classes', () => {
      expect(cn(['text-red-500', 'font-bold'])).toBe('text-red-500 font-bold')
    })

    it('should handle objects with boolean values', () => {
      expect(cn({
        'text-red-500': true,
        'text-blue-500': false,
        'font-bold': true,
      })).toBe('text-red-500 font-bold')
    })

    it('should handle mixed input types', () => {
      expect(cn(
        'base',
        ['array-class'],
        { 'object-class': true },
        false && 'hidden',
        undefined,
        null
      )).toBe('base array-class object-class')
    })

    it('should handle empty inputs', () => {
      expect(cn()).toBe('')
      expect(cn('')).toBe('')
      expect(cn(null)).toBe('')
      expect(cn(undefined)).toBe('')
    })

    it('should preserve important Tailwind modifiers', () => {
      expect(cn('hover:bg-red-500', 'hover:bg-blue-500')).toBe('hover:bg-blue-500')
      expect(cn('md:text-lg', 'lg:text-xl')).toBe('md:text-lg lg:text-xl')
    })

    it('should handle dark mode classes', () => {
      expect(cn('dark:bg-gray-800', 'dark:bg-gray-900')).toBe('dark:bg-gray-900')
      expect(cn('bg-white', 'dark:bg-gray-800')).toBe('bg-white dark:bg-gray-800')
    })
  })
})
