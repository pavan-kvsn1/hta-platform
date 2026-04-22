import { NextResponse } from 'next/server'

/**
 * CSP Violation Report Handler
 *
 * Receives Content-Security-Policy violation reports from browsers.
 * High-severity violations (script-src from external sources) trigger admin alerts.
 */

interface CSPViolationReport {
  'csp-report': {
    'document-uri': string
    'violated-directive': string
    'effective-directive': string
    'original-policy': string
    'blocked-uri': string
    'source-file'?: string
    'line-number'?: number
    'column-number'?: number
    'status-code'?: number
  }
}

// Simple in-memory rate limiting (resets on pod restart)
const reportCounts = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10 // max reports per window
const RATE_WINDOW = 60000 // 1 minute

function isRateLimited(key: string): boolean {
  const now = Date.now()
  const record = reportCounts.get(key)

  if (!record || record.resetAt < now) {
    reportCounts.set(key, { count: 1, resetAt: now + RATE_WINDOW })
    return false
  }

  if (record.count >= RATE_LIMIT) {
    return true
  }

  record.count++
  return false
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type') || ''

    if (!contentType.includes('csp-report') && !contentType.includes('json')) {
      return NextResponse.json({ error: 'Invalid content type' }, { status: 400 })
    }

    const report: CSPViolationReport = await request.json()
    const violation = report['csp-report']

    if (!violation) {
      return NextResponse.json({ error: 'Invalid report format' }, { status: 400 })
    }

    // Rate limit by blocked URI to prevent flooding
    const rateLimitKey = violation['blocked-uri'] || 'unknown'
    if (isRateLimited(rateLimitKey)) {
      return new NextResponse(null, { status: 204 })
    }

    // Determine severity
    const isScriptViolation = violation['effective-directive']?.startsWith('script-src')
    const isExternalSource =
      violation['blocked-uri'] &&
      !violation['blocked-uri'].startsWith("'") &&
      violation['blocked-uri'] !== 'inline' &&
      violation['blocked-uri'] !== 'eval' &&
      !violation['blocked-uri'].startsWith('data:')

    const severity = isScriptViolation && isExternalSource ? 'HIGH' : 'LOW'

    const logData = {
      timestamp: new Date().toISOString(),
      severity,
      documentUri: violation['document-uri'],
      violatedDirective: violation['violated-directive'],
      effectiveDirective: violation['effective-directive'],
      blockedUri: violation['blocked-uri'],
      sourceFile: violation['source-file'],
      lineNumber: violation['line-number'],
      columnNumber: violation['column-number'],
    }

    // Always log for audit trail
    console.warn('[CSP-VIOLATION]', JSON.stringify(logData))

    // Forward HIGH severity violations to API for admin alerts
    if (severity === 'HIGH') {
      const apiUrl = process.env.API_URL || 'http://localhost:4000'

      // Fire and forget - don't block the response
      fetch(`${apiUrl}/api/security/csp-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Service': 'web-hta',
        },
        body: JSON.stringify(logData),
      }).catch((err) => {
        console.error('[CSP-VIOLATION] Failed to send alert:', err.message)
      })
    }

    return new NextResponse(null, { status: 204 })
  } catch (error) {
    console.error('[CSP-VIOLATION] Failed to parse report:', error)
    return NextResponse.json({ error: 'Failed to process report' }, { status: 400 })
  }
}
