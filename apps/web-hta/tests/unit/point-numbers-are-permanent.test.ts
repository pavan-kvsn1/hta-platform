/**
 * A photograph stays attached to the reading it was taken of.
 *
 * A reading has no identity that survives a save - the certificate rewrites every
 * parameter and every row and hands them fresh database ids - so a photograph names its
 * reading by parameter position and point number. That only works if point numbers
 * never move.
 *
 * They used to. Removing a row renumbered the ones below it, so deleting point 3 turned
 * point 4 into point 3, and the photographs of point 4 were suddenly filed under a
 * different reading. Nothing failed; the certificate simply showed the wrong evidence.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import { useCertificateStore } from '@/lib/stores/certificate-store'

const points = (parameterIndex = 0) =>
  useCertificateStore.getState().formData.parameters[parameterIndex].results.map((r) => r.pointNumber)

const fivePoints = () => {
  const store = useCertificateStore.getState()
  store.resetForm()
  store.addParameter()
  // A fresh parameter starts with one row; take it to five.
  while (useCertificateStore.getState().formData.parameters[0].results.length < 5) {
    useCertificateStore.getState().addResult(0)
  }
}

beforeEach(() => {
  fivePoints()
})

describe('removing a reading', () => {
  it('leaves the numbers of the readings that remain alone', () => {
    expect(points()).toEqual([1, 2, 3, 4, 5])

    useCertificateStore.getState().removeResult(0, 2) // the third row, point 3

    // 4 and 5 keep their numbers. A photograph of point 4 still means point 4.
    expect(points()).toEqual([1, 2, 4, 5])
  })

  it('leaves a gap rather than closing it, however many go', () => {
    useCertificateStore.getState().removeResult(0, 1) // point 2
    useCertificateStore.getState().removeResult(0, 1) // point 3, now at index 1
    expect(points()).toEqual([1, 4, 5])
  })

  it('still refuses to remove the last row', () => {
    const store = useCertificateStore.getState()
    while (useCertificateStore.getState().formData.parameters[0].results.length > 1) {
      useCertificateStore.getState().removeResult(0, 0)
    }
    const before = points()
    store.removeResult(0, 0)
    expect(points()).toEqual(before)
  })
})

describe('adding a reading after one was removed', () => {
  it('never reuses a number a photograph might point at', () => {
    useCertificateStore.getState().removeResult(0, 2) // point 3 goes
    expect(points()).toEqual([1, 2, 4, 5])

    useCertificateStore.getState().addResult(0)

    // Counting the rows would have produced 5, which is still in use. One past the
    // highest gives 6, which has never been used and never will be again.
    expect(points()).toEqual([1, 2, 4, 5, 6])
  })

  it('keeps handing out unused numbers as rows come and go', () => {
    const store = useCertificateStore.getState()
    store.removeResult(0, 4) // 5 goes, leaving 1..4
    store.addResult(0) // 6
    store.removeResult(0, 0) // 1 goes
    store.addResult(0) // 7

    const used = points()
    expect(new Set(used).size).toBe(used.length) // no number appears twice
    expect(used).toEqual([2, 3, 4, 6, 7])
  })
})

describe('what the certificate prints', () => {
  it('is the row position, so a gap in the numbering never reaches the customer', () => {
    useCertificateStore.getState().removeResult(0, 2)

    // The store holds 1, 2, 4, 5 - the table and the PDF both print index + 1.
    const printed = points().map((_, index) => index + 1)
    expect(printed).toEqual([1, 2, 3, 4])
  })
})
