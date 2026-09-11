import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { pdfPageCount } from '../../src/lib/pdf-page-count.js'

/** Real certificates from the master list, if this machine has them. */
const STORE = 'C:/Users/kcsva/OneDrive/Documents/HTACalibr8s/reference_docs/master_list/MASTER LIST AS PER ASSENT NUMBER 02032026'

describe('reading a page count out of PDF bytes', () => {
  it('returns null for something that is not a PDF', () => {
    expect(pdfPageCount(Buffer.from('hello'))).toBeNull()
  })

  it('reads the total off the page tree root', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' +
        '2 0 obj\n<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>\nendobj\n' +
        '3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n' +
        '4 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n%%EOF',
    )
    expect(pdfPageCount(pdf)).toBe(2)
  })

  it('takes the largest count, not a nested branch of the page tree', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n' +
        '2 0 obj\n<< /Type /Pages /Kids [5 0 R 6 0 R] /Count 9 >>\nendobj\n' +
        '5 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 4 >>\nendobj\n%%EOF',
    )
    expect(pdfPageCount(pdf)).toBe(9)
  })

  it('reads a dictionary that puts Count before Type', () => {
    const pdf = Buffer.from('%PDF-1.7\n2 0 obj\n<< /Count 3 /Type /Pages >>\nendobj\n%%EOF')
    expect(pdfPageCount(pdf)).toBe(3)
  })

  it('counts page objects when the file declares no Count', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n3 0 obj\n<< /Type /Page >>\nendobj\n4 0 obj\n<< /Type /Page >>\nendobj\n%%EOF',
    )
    expect(pdfPageCount(pdf)).toBe(2)
  })

  it('does not mistake /Pages for a page when falling back', () => {
    const pdf = Buffer.from('%PDF-1.4\n2 0 obj\n<< /Type /Pages /Kids [] >>\nendobj\n%%EOF')
    expect(pdfPageCount(pdf)).toBeNull()
  })

  it('ignores bytes inside a compressed stream that look like a page object', () => {
    // Without stripping streams this reads as an extra page.
    const pdf = Buffer.from(
      '%PDF-1.4\n' +
        '3 0 obj\n<< /Type /Page >>\nendobj\n' +
        '9 0 obj\n<< /Length 40 >>\nstream\n/Type /Page /Type /Page\nendstream\nendobj\n%%EOF',
    )
    expect(pdfPageCount(pdf)).toBe(1)
  })

  it('says null rather than guessing when it can find nothing', () => {
    expect(pdfPageCount(Buffer.from('%PDF-1.4\nnothing useful here\n%%EOF'))).toBeNull()
  })
})

describe('against the real certificate store', () => {
  const files = existsSync(STORE)
    ? readdirSync(STORE)
        .filter((f) => f.toLowerCase().endsWith('.pdf'))
        .slice(0, 25)
    : []

  it.skipIf(files.length === 0)('reads a plausible count out of every one it is given', () => {
    const results = files.map((f) => ({ f, n: pdfPageCount(readFileSync(join(STORE, f))) }))
    const unread = results.filter((r) => r.n === null)
    const absurd = results.filter((r) => r.n !== null && (r.n < 1 || r.n > 500))

    // Reported so a regression names the file rather than just a count.
    expect({ unread: unread.map((r) => r.f), absurd: absurd.map((r) => `${r.f}=${r.n}`) }).toEqual({
      unread: [],
      absurd: [],
    })
    expect(results.length).toBeGreaterThan(0)
  })
})
