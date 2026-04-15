/**
 * Typed Signature Logic Unit Tests
 *
 * Tests for typed signature functionality:
 * - Signature state management
 * - Name trimming and validation
 * - Signature readiness callbacks
 * - Canvas dimension handling
 *
 * Migrated from hta-calibration/src/components/__tests__/TypedSignature.test.tsx
 * Self-contained version testing logic without React rendering
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Types
interface SignatureState {
  name: string
  isEmpty: boolean
  isReady: boolean
  width: number
  height: number
}

interface SignatureConfig {
  width?: number
  height?: number
  defaultPlaceholder?: string
}

// Default configuration
const DEFAULT_CONFIG: Required<SignatureConfig> = {
  width: 320,
  height: 120,
  defaultPlaceholder: 'Your signature',
}

// Logic functions
function createSignatureState(name: string, config: SignatureConfig = {}): SignatureState {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }
  const trimmedName = name.trim()

  return {
    name: trimmedName,
    isEmpty: trimmedName.length === 0,
    isReady: trimmedName.length > 0,
    width: mergedConfig.width,
    height: mergedConfig.height,
  }
}

function getDisplayText(state: SignatureState, config: SignatureConfig = {}): string {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config }

  if (state.isEmpty) {
    return mergedConfig.defaultPlaceholder
  }
  return state.name
}

function getHelperText(state: SignatureState): string | null {
  if (state.isEmpty) {
    return 'Enter your name above to generate signature'
  }
  return null
}

function handleClear(state: SignatureState): SignatureState {
  return {
    ...state,
    name: '',
    isEmpty: true,
    isReady: false,
  }
}

function generateDataURL(state: SignatureState): string {
  if (state.isEmpty) {
    return ''
  }
  // In real implementation, this would render canvas and return data URL
  return `data:image/png;base64,mockSignature_${state.name}`
}

// Callback handling
type SignatureReadyCallback = (isReady: boolean) => void

function notifySignatureReady(
  callback: SignatureReadyCallback | undefined,
  isReady: boolean
): void {
  if (callback) {
    callback(isReady)
  }
}

describe('TypedSignature Logic', () => {
  describe('createSignatureState', () => {
    it('creates state with default dimensions', () => {
      const state = createSignatureState('John Doe')

      expect(state.width).toBe(320)
      expect(state.height).toBe(120)
    })

    it('accepts custom dimensions', () => {
      const state = createSignatureState('Test', { width: 500, height: 200 })

      expect(state.width).toBe(500)
      expect(state.height).toBe(200)
    })

    it('trims whitespace from name', () => {
      const state = createSignatureState('  John Doe  ')

      expect(state.name).toBe('John Doe')
    })

    it('sets isEmpty true for empty name', () => {
      const state = createSignatureState('')

      expect(state.isEmpty).toBe(true)
      expect(state.isReady).toBe(false)
    })

    it('sets isEmpty true for whitespace-only name', () => {
      const state = createSignatureState('   ')

      expect(state.isEmpty).toBe(true)
      expect(state.isReady).toBe(false)
    })

    it('sets isEmpty false for valid name', () => {
      const state = createSignatureState('John Doe')

      expect(state.isEmpty).toBe(false)
      expect(state.isReady).toBe(true)
    })
  })

  describe('getDisplayText', () => {
    it('returns placeholder when name is empty', () => {
      const state = createSignatureState('')
      const text = getDisplayText(state)

      expect(text).toBe('Your signature')
    })

    it('returns custom placeholder when configured', () => {
      const state = createSignatureState('')
      const text = getDisplayText(state, { defaultPlaceholder: 'Sign here' })

      expect(text).toBe('Sign here')
    })

    it('returns name when provided', () => {
      const state = createSignatureState('John Doe')
      const text = getDisplayText(state)

      expect(text).toBe('John Doe')
    })
  })

  describe('getHelperText', () => {
    it('returns helper text when name is empty', () => {
      const state = createSignatureState('')
      const text = getHelperText(state)

      expect(text).toBe('Enter your name above to generate signature')
    })

    it('returns null when name is provided', () => {
      const state = createSignatureState('John Doe')
      const text = getHelperText(state)

      expect(text).toBeNull()
    })
  })

  describe('handleClear', () => {
    it('clears the signature state', () => {
      const state = createSignatureState('John Doe')
      const clearedState = handleClear(state)

      expect(clearedState.name).toBe('')
      expect(clearedState.isEmpty).toBe(true)
      expect(clearedState.isReady).toBe(false)
    })

    it('preserves dimensions after clear', () => {
      const state = createSignatureState('John Doe', { width: 500, height: 200 })
      const clearedState = handleClear(state)

      expect(clearedState.width).toBe(500)
      expect(clearedState.height).toBe(200)
    })
  })

  describe('generateDataURL', () => {
    it('returns empty string when signature is empty', () => {
      const state = createSignatureState('')
      const dataUrl = generateDataURL(state)

      expect(dataUrl).toBe('')
    })

    it('returns data URL when signature has content', () => {
      const state = createSignatureState('John Doe')
      const dataUrl = generateDataURL(state)

      expect(dataUrl).toContain('data:image/png;base64')
      expect(dataUrl).toContain('John Doe')
    })
  })

  describe('notifySignatureReady', () => {
    it('calls callback with true when signature is ready', () => {
      const callback = vi.fn()
      notifySignatureReady(callback, true)

      expect(callback).toHaveBeenCalledWith(true)
    })

    it('calls callback with false when signature is not ready', () => {
      const callback = vi.fn()
      notifySignatureReady(callback, false)

      expect(callback).toHaveBeenCalledWith(false)
    })

    it('does not throw when callback is undefined', () => {
      expect(() => notifySignatureReady(undefined, true)).not.toThrow()
    })
  })

  describe('signature workflow', () => {
    it('correctly tracks state through workflow', () => {
      const onReady = vi.fn()

      // Initial empty state
      const emptyState = createSignatureState('')
      notifySignatureReady(onReady, emptyState.isReady)
      expect(onReady).toHaveBeenCalledWith(false)

      // After entering name
      const namedState = createSignatureState('John Doe')
      notifySignatureReady(onReady, namedState.isReady)
      expect(onReady).toHaveBeenCalledWith(true)

      // After clearing
      const clearedState = handleClear(namedState)
      notifySignatureReady(onReady, clearedState.isReady)
      expect(onReady).toHaveBeenLastCalledWith(false)
    })

    it('generates data URL only for valid signatures', () => {
      const emptyState = createSignatureState('')
      expect(generateDataURL(emptyState)).toBe('')

      const validState = createSignatureState('Jane Doe')
      const dataUrl = generateDataURL(validState)
      expect(dataUrl).not.toBe('')
      expect(typeof dataUrl).toBe('string')
    })
  })

  describe('edge cases', () => {
    it('handles very long names', () => {
      const longName = 'A'.repeat(100)
      const state = createSignatureState(longName)

      expect(state.name).toBe(longName)
      expect(state.isReady).toBe(true)
    })

    it('handles special characters in name', () => {
      const specialName = "John O'Connor-Smith III"
      const state = createSignatureState(specialName)

      expect(state.name).toBe(specialName)
      expect(state.isReady).toBe(true)
    })

    it('handles unicode characters', () => {
      const unicodeName = '山田太郎'
      const state = createSignatureState(unicodeName)

      expect(state.name).toBe(unicodeName)
      expect(state.isReady).toBe(true)
    })

    it('handles mixed whitespace', () => {
      const state = createSignatureState('\t John \n Doe \r')

      expect(state.name).toBe('John \n Doe')
      expect(state.isReady).toBe(true)
    })
  })
})
