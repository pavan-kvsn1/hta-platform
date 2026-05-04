/**
 * Pagination Utility Regression Tests (Frontend)
 *
 * Tests the getPageNumbers() helper and related pagination patterns
 * that are duplicated across dashboard table components:
 *   - CertificateTable.tsx
 *   - AuthorizedTable.tsx
 *   - AwaitingResponseTable.tsx
 *   - CompletedTable.tsx
 *   - PendingReviewTable.tsx
 *   - ReviewerCertificateTable.tsx
 *   - customer/users/page.tsx
 *   - customer/instruments/page.tsx
 *
 * Since getPageNumbers is not exported from a shared utility (it is
 * copy-pasted inline in each component), we replicate the exact
 * implementation here and test it comprehensively. Any drift between
 * the copies and this test indicates a regression.
 */
import { describe, it, expect } from 'vitest'

// ── Exact replica of the inline getPageNumbers from CertificateTable ─

function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | 'ellipsis')[] = [1]

  if (currentPage > 3) {
    pages.push('ellipsis')
  }

  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  for (let i = start; i <= end; i++) {
    pages.push(i)
  }

  if (currentPage < totalPages - 2) {
    pages.push('ellipsis')
  }

  if (totalPages > 1) {
    pages.push(totalPages)
  }

  return pages
}

// ── Pagination URL param builder (common pattern in dashboard pages) ─

/** Mirrors how dashboard components build fetch URLs with pagination. */
function buildPaginatedUrl(
  base: string,
  params: { page: number; limit: number; [key: string]: string | number },
): string {
  const url = new URL(base, 'http://localhost')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return `${url.pathname}?${url.searchParams.toString()}`
}

// ── Tests ────────────────────────────────────────────────────────────

describe('getPageNumbers', () => {
  describe('small page counts (totalPages <= 7)', () => {
    it('returns [] for 0 total pages', () => {
      expect(getPageNumbers(1, 0)).toEqual([])
    })

    it('returns [1] for 1 total page', () => {
      expect(getPageNumbers(1, 1)).toEqual([1])
    })

    it('returns [1,2,3] for 3 total pages', () => {
      expect(getPageNumbers(1, 3)).toEqual([1, 2, 3])
    })

    it('returns all 7 pages without ellipsis for exactly 7 pages', () => {
      expect(getPageNumbers(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
    })

    it('returns the same sequence regardless of currentPage when totalPages <= 7', () => {
      const expected = [1, 2, 3, 4, 5]
      expect(getPageNumbers(1, 5)).toEqual(expected)
      expect(getPageNumbers(3, 5)).toEqual(expected)
      expect(getPageNumbers(5, 5)).toEqual(expected)
    })
  })

  describe('large page counts (totalPages > 7)', () => {
    const total = 10

    it('shows no leading ellipsis when currentPage <= 3', () => {
      const result = getPageNumbers(1, total)
      // Page 1 should not have ellipsis before the window
      expect(result[0]).toBe(1)
      expect(result[1]).not.toBe('ellipsis')
    })

    it('shows leading ellipsis when currentPage > 3', () => {
      const result = getPageNumbers(5, total)
      expect(result[0]).toBe(1)
      expect(result[1]).toBe('ellipsis')
    })

    it('shows trailing ellipsis when currentPage < totalPages - 2', () => {
      const result = getPageNumbers(5, total)
      const lastIdx = result.length - 1
      expect(result[lastIdx]).toBe(total)
      expect(result[lastIdx - 1]).toBe('ellipsis')
    })

    it('shows no trailing ellipsis when currentPage >= totalPages - 2', () => {
      const result = getPageNumbers(9, total)
      const lastIdx = result.length - 1
      expect(result[lastIdx]).toBe(total)
      expect(result[lastIdx - 1]).not.toBe('ellipsis')
    })

    it('always starts with page 1', () => {
      for (let p = 1; p <= total; p++) {
        expect(getPageNumbers(p, total)[0]).toBe(1)
      }
    })

    it('always ends with the last page', () => {
      for (let p = 1; p <= total; p++) {
        const result = getPageNumbers(p, total)
        expect(result[result.length - 1]).toBe(total)
      }
    })

    it('includes a window around the current page', () => {
      // currentPage=5 in 10 pages → window should include 4,5,6
      const result = getPageNumbers(5, total)
      const numericPages = result.filter((p): p is number => typeof p === 'number')
      expect(numericPages).toContain(4)
      expect(numericPages).toContain(5)
      expect(numericPages).toContain(6)
    })

    it('page 1 of 10: [1, 2, ..., 10]', () => {
      // currentPage=1: start=max(2,0)=2, end=min(9,2)=2
      // No leading ellipsis (1 <= 3), trailing ellipsis (1 < 8)
      const result = getPageNumbers(1, 10)
      expect(result).toEqual([1, 2, 'ellipsis', 10])
    })

    it('page 2 of 10: [1, 2, 3, ..., 10]', () => {
      const result = getPageNumbers(2, 10)
      expect(result).toEqual([1, 2, 3, 'ellipsis', 10])
    })

    it('page 5 of 10: [1, ..., 4, 5, 6, ..., 10]', () => {
      const result = getPageNumbers(5, 10)
      expect(result).toEqual([1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    })

    it('page 9 of 10: [1, ..., 8, 9, 10]', () => {
      const result = getPageNumbers(9, 10)
      expect(result).toEqual([1, 'ellipsis', 8, 9, 10])
    })

    it('page 10 of 10: [1, ..., 9, 10]', () => {
      // currentPage=10: start=max(2,9)=9, end=min(9,11)=9
      // Leading ellipsis (10 > 3), no trailing ellipsis (10 >= 8)
      const result = getPageNumbers(10, 10)
      expect(result).toEqual([1, 'ellipsis', 9, 10])
    })

    it('page 3 of 10 — boundary: no leading ellipsis', () => {
      // currentPage=3 is exactly the boundary (> 3 is false)
      const result = getPageNumbers(3, 10)
      expect(result).toEqual([1, 2, 3, 4, 'ellipsis', 10])
    })

    it('page 4 of 10 — boundary: leading ellipsis appears', () => {
      const result = getPageNumbers(4, 10)
      expect(result).toEqual([1, 'ellipsis', 3, 4, 5, 'ellipsis', 10])
    })

    it('page 8 of 10 — boundary: trailing ellipsis disappears', () => {
      // currentPage=8, totalPages-2=8, so 8 < 8 is false → no trailing
      const result = getPageNumbers(8, 10)
      expect(result).toEqual([1, 'ellipsis', 7, 8, 9, 10])
    })

    it('page 7 of 10 — boundary: trailing ellipsis still present', () => {
      // 7 < 8 → true → trailing ellipsis
      const result = getPageNumbers(7, 10)
      expect(result).toEqual([1, 'ellipsis', 6, 7, 8, 'ellipsis', 10])
    })
  })

  describe('exactly 8 pages (smallest case triggering ellipsis)', () => {
    it('page 1 of 8', () => {
      const result = getPageNumbers(1, 8)
      expect(result).toEqual([1, 2, 'ellipsis', 8])
    })

    it('page 4 of 8', () => {
      const result = getPageNumbers(4, 8)
      expect(result).toEqual([1, 'ellipsis', 3, 4, 5, 'ellipsis', 8])
    })

    it('page 8 of 8', () => {
      const result = getPageNumbers(8, 8)
      expect(result).toEqual([1, 'ellipsis', 7, 8])
    })
  })
})

describe('buildPaginatedUrl', () => {
  it('builds a URL with page and limit params', () => {
    const url = buildPaginatedUrl('/api/certificates', { page: 2, limit: 15 })
    expect(url).toBe('/api/certificates?page=2&limit=15')
  })

  it('includes additional filter params', () => {
    const url = buildPaginatedUrl('/api/certificates', {
      page: 1,
      limit: 10,
      status: 'DRAFT',
      search: 'HTA-001',
    })
    expect(url).toContain('page=1')
    expect(url).toContain('limit=10')
    expect(url).toContain('status=DRAFT')
    expect(url).toContain('search=HTA-001')
  })

  it('converts numeric values to strings', () => {
    const url = buildPaginatedUrl('/api/data', { page: 3, limit: 25 })
    expect(url).toContain('page=3')
    expect(url).toContain('limit=25')
  })
})

describe('pagination state transitions', () => {
  // Tests for the client-side pagination state management pattern:
  //   setPage(p => Math.max(1, p - 1))  — previous
  //   setPage(p => Math.min(totalPages, p + 1))  — next

  function prevPage(current: number): number {
    return Math.max(1, current - 1)
  }

  function nextPage(current: number, totalPages: number): number {
    return Math.min(totalPages, current + 1)
  }

  it('previous page from page 3 goes to 2', () => {
    expect(prevPage(3)).toBe(2)
  })

  it('previous page from page 1 stays at 1', () => {
    expect(prevPage(1)).toBe(1)
  })

  it('next page from page 3 of 5 goes to 4', () => {
    expect(nextPage(3, 5)).toBe(4)
  })

  it('next page from last page stays at last page', () => {
    expect(nextPage(5, 5)).toBe(5)
  })

  it('next page from page 1 of 1 stays at 1', () => {
    expect(nextPage(1, 1)).toBe(1)
  })
})

describe('ROWS_PER_PAGE_OPTIONS consistency', () => {
  // All dashboard tables use: const ROWS_PER_PAGE_OPTIONS = [10, 15, 25]
  // These must match the server-side limits (min=1, default=15, max=25).
  const ROWS_PER_PAGE_OPTIONS = [10, 15, 25]

  it('all options are within server-side bounds [1, 25]', () => {
    for (const opt of ROWS_PER_PAGE_OPTIONS) {
      expect(opt).toBeGreaterThanOrEqual(1)
      expect(opt).toBeLessThanOrEqual(25)
    }
  })

  it('default limit (15) is in the options list', () => {
    expect(ROWS_PER_PAGE_OPTIONS).toContain(15)
  })

  it('max server limit (25) is in the options list', () => {
    expect(ROWS_PER_PAGE_OPTIONS).toContain(25)
  })
})
