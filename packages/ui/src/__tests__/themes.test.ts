/**
 * Unit tests for @hta/ui theme utilities
 */
import { describe, it, expect } from 'vitest'
import {
  defaultTheme,
  createTheme,
  getTheme,
  tenantThemes,
} from '../themes'

describe('defaultTheme', () => {
  it('should have all required color tokens', () => {
    expect(defaultTheme.colors).toHaveProperty('primary')
    expect(defaultTheme.colors).toHaveProperty('primaryDark')
    expect(defaultTheme.colors).toHaveProperty('primaryLight')
    expect(defaultTheme.colors).toHaveProperty('secondary')
    expect(defaultTheme.colors).toHaveProperty('success')
    expect(defaultTheme.colors).toHaveProperty('warning')
    expect(defaultTheme.colors).toHaveProperty('error')
    expect(defaultTheme.colors).toHaveProperty('text')
    expect(defaultTheme.colors).toHaveProperty('textMuted')
    expect(defaultTheme.colors).toHaveProperty('background')
    expect(defaultTheme.colors).toHaveProperty('surface')
    expect(defaultTheme.colors).toHaveProperty('border')
  })

  it('should have all required font tokens', () => {
    expect(defaultTheme.fonts).toHaveProperty('sans')
    expect(defaultTheme.fonts).toHaveProperty('mono')
  })

  it('should have all required radii tokens', () => {
    expect(defaultTheme.radii).toHaveProperty('sm')
    expect(defaultTheme.radii).toHaveProperty('md')
    expect(defaultTheme.radii).toHaveProperty('lg')
    expect(defaultTheme.radii).toHaveProperty('full')
  })

  it('should have all required shadow tokens', () => {
    expect(defaultTheme.shadows).toHaveProperty('sm')
    expect(defaultTheme.shadows).toHaveProperty('md')
    expect(defaultTheme.shadows).toHaveProperty('lg')
  })

  it('should have valid color values (hex format)', () => {
    const hexColorRegex = /^#[0-9a-fA-F]{6}$/
    expect(defaultTheme.colors.primary).toMatch(hexColorRegex)
    expect(defaultTheme.colors.primaryDark).toMatch(hexColorRegex)
    expect(defaultTheme.colors.primaryLight).toMatch(hexColorRegex)
  })

  it('should have valid radii values (rem format)', () => {
    expect(defaultTheme.radii.sm).toContain('rem')
    expect(defaultTheme.radii.md).toContain('rem')
    expect(defaultTheme.radii.lg).toContain('rem')
  })
})

describe('createTheme', () => {
  it('should return default theme when no overrides provided', () => {
    const theme = createTheme({})
    expect(theme).toEqual(defaultTheme)
  })

  it('should merge color overrides', () => {
    const theme = createTheme({
      colors: { primary: '#ff0000' },
    })
    expect(theme.colors.primary).toBe('#ff0000')
    // Other colors should remain from default
    expect(theme.colors.secondary).toBe(defaultTheme.colors.secondary)
  })

  it('should merge font overrides', () => {
    const theme = createTheme({
      fonts: { sans: 'Arial, sans-serif' },
    })
    expect(theme.fonts.sans).toBe('Arial, sans-serif')
    // Other fonts should remain from default
    expect(theme.fonts.mono).toBe(defaultTheme.fonts.mono)
  })

  it('should merge radii overrides', () => {
    const theme = createTheme({
      radii: { sm: '0.5rem' },
    })
    expect(theme.radii.sm).toBe('0.5rem')
    expect(theme.radii.md).toBe(defaultTheme.radii.md)
  })

  it('should merge shadow overrides', () => {
    const theme = createTheme({
      shadows: { sm: 'none' },
    })
    expect(theme.shadows.sm).toBe('none')
    expect(theme.shadows.md).toBe(defaultTheme.shadows.md)
  })

  it('should handle multiple category overrides', () => {
    const theme = createTheme({
      colors: { primary: '#00ff00' },
      fonts: { sans: 'Georgia, serif' },
      radii: { lg: '1rem' },
      shadows: { lg: 'none' },
    })
    expect(theme.colors.primary).toBe('#00ff00')
    expect(theme.fonts.sans).toBe('Georgia, serif')
    expect(theme.radii.lg).toBe('1rem')
    expect(theme.shadows.lg).toBe('none')
  })

  it('should not mutate the default theme', () => {
    const originalPrimary = defaultTheme.colors.primary
    createTheme({ colors: { primary: '#000000' } })
    expect(defaultTheme.colors.primary).toBe(originalPrimary)
  })
})

describe('tenantThemes', () => {
  it('should have hta tenant theme', () => {
    expect(tenantThemes).toHaveProperty('hta')
  })

  it('should be a valid record of partial themes', () => {
    Object.values(tenantThemes).forEach(theme => {
      expect(typeof theme).toBe('object')
    })
  })
})

describe('getTheme', () => {
  it('should return default theme for hta tenant', () => {
    const theme = getTheme('hta')
    expect(theme).toEqual(defaultTheme)
  })

  it('should return default theme for unknown tenant', () => {
    const theme = getTheme('unknown-tenant')
    expect(theme).toEqual(defaultTheme)
  })

  it('should return a complete ThemeTokens object', () => {
    const theme = getTheme('hta')
    expect(theme).toHaveProperty('colors')
    expect(theme).toHaveProperty('fonts')
    expect(theme).toHaveProperty('radii')
    expect(theme).toHaveProperty('shadows')
  })

  it('should return consistent results for same tenant', () => {
    const theme1 = getTheme('hta')
    const theme2 = getTheme('hta')
    expect(theme1).toEqual(theme2)
  })
})
