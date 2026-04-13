/**
 * Safe JSON Parsing Utility
 *
 * Handles both string JSON (SQLite legacy) and native JSON (PostgreSQL)
 * for backward compatibility during migration.
 */

// JSON value type (mirrors Prisma.JsonValue)
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * Safely parse a JSON field that may be either a string or native JSON
 * @param value - The value from Prisma (could be string, object, or null)
 * @param defaultValue - Default value if parsing fails or value is null
 * @returns Parsed JSON value or default
 */
export function safeJsonParse<T = unknown>(
  value: unknown,
  defaultValue: T
): T {
  if (value === null || value === undefined) {
    return defaultValue
  }

  // If it's already an object/array (native JSON from PostgreSQL), return as-is
  if (typeof value === 'object') {
    return value as T
  }

  // If it's a string, try to parse it (SQLite legacy format)
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return defaultValue
    }
  }

  return defaultValue
}

/**
 * Safely stringify a value for storage
 * For PostgreSQL native JSON, we can pass objects directly
 * For SQLite, we need to stringify
 * @param value - The value to stringify
 * @returns JSON string
 */
export function safeJsonStringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value)
}
