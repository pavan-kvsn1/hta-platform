/**
 * @hta/ui - Theme Tokens
 *
 * Design tokens for multi-tenant theming.
 * Each tenant can override these tokens to customize their branding.
 */

export interface ThemeTokens {
  colors: {
    primary: string
    primaryDark: string
    primaryLight: string
    secondary: string
    success: string
    warning: string
    error: string
    text: string
    textMuted: string
    background: string
    surface: string
    border: string
  }
  fonts: {
    sans: string
    mono: string
  }
  radii: {
    sm: string
    md: string
    lg: string
    full: string
  }
  shadows: {
    sm: string
    md: string
    lg: string
  }
}

export const defaultTheme: ThemeTokens = {
  colors: {
    primary: '#1e40af',
    primaryDark: '#1e3a8a',
    primaryLight: '#3b82f6',
    secondary: '#6b7280',
    success: '#059669',
    warning: '#d97706',
    error: '#dc2626',
    text: '#111827',
    textMuted: '#6b7280',
    background: '#f9fafb',
    surface: '#ffffff',
    border: '#e5e7eb',
  },
  fonts: {
    sans: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", Menlo, Monaco, Consolas, monospace',
  },
  radii: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    full: '9999px',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  },
}

/**
 * Deep partial type for theme overrides
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P]
}

/**
 * Create a theme by merging overrides with defaults
 */
export function createTheme(overrides: DeepPartial<ThemeTokens>): ThemeTokens {
  return {
    colors: { ...defaultTheme.colors, ...overrides.colors },
    fonts: { ...defaultTheme.fonts, ...overrides.fonts },
    radii: { ...defaultTheme.radii, ...overrides.radii },
    shadows: { ...defaultTheme.shadows, ...overrides.shadows },
  }
}

/**
 * Pre-defined tenant themes
 */
export const tenantThemes: Record<string, DeepPartial<ThemeTokens>> = {
  hta: {}, // Uses default theme
}

/**
 * Get theme for a tenant
 */
export function getTheme(tenantSlug: string): ThemeTokens {
  const overrides = tenantThemes[tenantSlug] || {}
  return createTheme(overrides)
}
