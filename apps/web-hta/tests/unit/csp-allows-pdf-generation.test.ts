/**
 * The content security policy has to let the PDF generator work.
 *
 * middleware.test.ts checks a copy of the policy written inside the test, so it agrees
 * with itself whatever the real middleware says. That is how connect-src came to be
 * missing data: while script-src carried 'wasm-unsafe-eval' with a comment saying PDF
 * generation needs WebAssembly - the policy allowed running the engine and refused to
 * let the browser fetch it. Nothing failed at build time; the certificate simply came
 * out without its appendix.
 *
 * This reads the middleware itself, and deliberately asks the dullest possible question
 * of it: is this source listed under this directive. Three cleverer parsers went in the
 * bin first - apostrophes in the prose open quoted strings, stripping from "//" eats
 * 'https://unpkg.com', and stripping block comments eats everything after
 * 'https://*.sentry.io' because that asterisk-slash is one.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const source = readFileSync(join(__dirname, '..', '..', 'src', 'middleware.ts'), 'utf8')

/** The text between a directive's opening bracket and its closing one. */
function block(name: string): string {
  const open = source.indexOf(`'${name}': [`)
  if (open === -1) throw new Error(`the policy has no ${name} directive at all`)
  const close = source.indexOf('],', open)
  return source.slice(open, close)
}

/** Sources are quoted in the source file, so they are quoted here too. */
const allows = (name: string, source: string) => block(name).includes(source)

describe('the policy the certificate is generated under', () => {
  it('lets the browser fetch a data: URL', () => {
    // Two things arrive that way: react-pdf's layout engine, which is WebAssembly
    // inlined into the bundle, and every photograph in the appendix, inlined because
    // react-pdf lays out synchronously and cannot await an image. A fetch is
    // connect-src even when what it carries is a font or a picture.
    expect(allows('connect-src', "'data:'")).toBe(true)
  })

  it('lets the engine run once it has been fetched', () => {
    expect(allows('script-src', "'wasm-unsafe-eval'")).toBe(true)
  })

  it('still reaches the host react-pdf registers its fonts against', () => {
    expect(allows('connect-src', "'https://unpkg.com'")).toBe(true)
    expect(allows('font-src', "'https://unpkg.com'")).toBe(true)
  })

  it('can draw an inlined photograph, and hand over the finished file', () => {
    expect(allows('img-src', "'data:'")).toBe(true)
    expect(allows('img-src', "'blob:'")).toBe(true)
    // The generated PDF reaches the viewer as a blob URL.
    expect(allows('frame-src', "'blob:'")).toBe(true)
  })

  it('does not allow data: where it would let someone run code', () => {
    // Fetching bytes the document already carries is not the same decision as
    // executing whatever a data: URL happens to contain.
    expect(allows('script-src', "'data:'")).toBe(false)
    expect(allows('object-src', "'none'")).toBe(true)
  })
})
