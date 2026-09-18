/**
 * How far through a review the reviewer is.
 *
 * The chips sit in the section headers and the Approve button sits in the actions
 * panel, and the two have to agree. This is what they both read.
 */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  REVIEW_SECTION_IDS,
  rejectedMasters,
  sectionOpenCount,
  useReviewProgress,
} from '@/lib/stores/review-progress-store'

const CERT = 'cert-1'

const seedOnce = (over: Record<string, unknown> = {}) =>
  useReviewProgress.getState().start(CERT, 1, {
    signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z' }],
    decisions: [],
    openMasterIds: ['mi-1'],
    ...over,
  })

beforeEach(() => {
  useReviewProgress.setState({
    certificateId: null,
    revision: 0,
    signoffs: {},
    decisions: {},
    openMasterIds: [],
    busy: null,
    error: null,
    seeded: null,
  })
})

describe('seeding what the server already decided', () => {
  it('takes the signed sections and the open masters', () => {
    seedOnce()
    const s = useReviewProgress.getState()
    expect(s.signoffs.summary).toBeTruthy()
    expect(s.openMasterIds).toEqual(['mi-1'])
  })

  it('writes nothing the second time the same payload arrives', () => {
    /**
     * The effect that calls this watches the certificate, and the page above rebuilds
     * that object on every render - so start() runs again on every render. Writing
     * each time made the state change, which re-rendered, which ran the effect again:
     * React stopped it as a depth limit, which is the polite name for a loop.
     */
    seedOnce()
    const first = useReviewProgress.getState()
    seedOnce()
    const second = useReviewProgress.getState()
    expect(second.signoffs).toBe(first.signoffs)
    expect(second.openMasterIds).toBe(first.openMasterIds)
  })

  it('does write when the payload genuinely changed', () => {
    seedOnce()
    const first = useReviewProgress.getState().signoffs
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z' }, { section: 'remarks', checkedAt: '2026-09-18T12:01:00Z' }] })
    const second = useReviewProgress.getState().signoffs
    expect(second).not.toBe(first)
    expect(second.remarks).toBeTruthy()
  })

  it('re-seeds on a new revision, because a tick belongs to the one it was made at', () => {
    seedOnce()
    useReviewProgress.getState().start(CERT, 2, { signoffs: [], openMasterIds: ['mi-1'] })
    expect(useReviewProgress.getState().signoffs).toEqual({})
    expect(useReviewProgress.getState().revision).toBe(2)
  })
})

describe('what blocks a section', () => {
  it('counts a master nobody has answered as open', () => {
    seedOnce()
    expect(sectionOpenCount(useReviewProgress.getState(), 'master-inst')).toBe(1)
  })

  it('counts nothing once it is decided', () => {
    seedOnce({ decisions: [{ masterId: 'mi-1', decision: 'ACCEPTED' as const }] })
    expect(sectionOpenCount(useReviewProgress.getState(), 'master-inst')).toBe(0)
  })

  it('leaves the other six sections alone', () => {
    seedOnce()
    for (const s of REVIEW_SECTION_IDS.filter((x) => x !== 'master-inst')) {
      expect(sectionOpenCount(useReviewProgress.getState(), s)).toBe(0)
    }
  })

  it('counts a rejection as decided - it is answered, just not favourably', () => {
    seedOnce({ decisions: [{ masterId: 'mi-1', decision: 'REJECTED' as const, reason: 'No least count' }] })
    expect(sectionOpenCount(useReviewProgress.getState(), 'master-inst')).toBe(0)
  })
})

describe('what blocks the certificate', () => {
  it('finds the rejections, which are what close Approve', () => {
    seedOnce({
      decisions: [
        { masterId: 'mi-1', decision: 'REJECTED' as const, reason: 'No least count on its band' },
        { masterId: 'mi-2', decision: 'ACCEPTED' as const },
      ],
    })
    const rejected = rejectedMasters(useReviewProgress.getState())
    expect(rejected).toHaveLength(1)
    // The reason travels, because it is what pre-fills the revision request.
    expect(rejected[0].reason).toBe('No least count on its band')
  })

  it('finds none when everything was accepted', () => {
    seedOnce({ decisions: [{ masterId: 'mi-1', decision: 'ACCEPTED' as const }] })
    expect(rejectedMasters(useReviewProgress.getState())).toEqual([])
  })
})

describe('changing your mind', () => {
  it('a cleared decision leaves the master open again, not answered the other way', () => {
    /**
     * Change used to call the opposite decision straight through, so a reviewer who
     * had rejected a master and wanted another look accepted it instead - in one
     * click, with a blank reason slipped past the validation. Clearing it puts the
     * question back where it was.
     */
    seedOnce({ decisions: [{ masterId: 'mi-1', decision: 'REJECTED' as const, reason: 'No least count' }] })
    expect(sectionOpenCount(useReviewProgress.getState(), 'master-inst')).toBe(0)

    useReviewProgress.setState((s) => {
      const decisions = { ...s.decisions }
      delete decisions['mi-1']
      return { decisions }
    })

    expect(useReviewProgress.getState().decisions['mi-1']).toBeUndefined()
    expect(sectionOpenCount(useReviewProgress.getState(), 'master-inst')).toBe(1)
    expect(rejectedMasters(useReviewProgress.getState())).toEqual([])
  })
})

describe('a tick whose section has moved since', () => {
  /**
   * Held against a revision, a tick was wrong both ways: a resubmission cleared all
   * seven even where the engineer touched two, and a section edited without raising a
   * revision kept its tick. The server compares the section's content instead, and says
   * which have drifted.
   *
   * A drifted section is simply unchecked. It was briefly a third state - amber, "changed
   * since checked" - which said more but asked the reader to learn a colour rather than
   * do the thing. Unchecked already means "this needs reading".
   */
  it('is not a tick at all', () => {
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: true }] })
    expect(useReviewProgress.getState().signoffs.summary).toBeUndefined()
  })

  it('does not count towards approving', () => {
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: true }] })
    expect(useReviewProgress.getState().signoffs.summary).toBeFalsy()
  })

  it('counts again once it is ticked afresh', () => {
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: false }] })
    expect(useReviewProgress.getState().signoffs.summary).toBeTruthy()
  })

  it('leaves the sections nobody touched standing', () => {
    // The point of the whole thing: a resubmission that changed the masters should not
    // make anyone re-read the conclusion.
    seedOnce({
      signoffs: [
        { section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: false },
        { section: 'conclusion', checkedAt: '2026-09-18T11:41:00Z', stale: false },
        { section: 'master-inst', checkedAt: '2026-09-18T11:40:00Z', stale: true },
      ],
    })
    const s = useReviewProgress.getState().signoffs
    expect(s.summary).toBeTruthy()
    expect(s.conclusion).toBeTruthy()
    expect(s['master-inst']).toBeUndefined()
  })

  it('is noticed when staleness is all that changed', () => {
    // The seed fingerprint has to include it, or a re-seed marking a tick stale would
    // be discarded as "same payload" and the box would stay ticked.
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: false }] })
    seedOnce({ signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', stale: true }] })
    expect(useReviewProgress.getState().signoffs.summary).toBeUndefined()
  })
})

describe('a tick that outlived the revision it was made at', () => {
  /**
   * It survives because its section did not change, which is the point of hashing the
   * content. But "Checked 11:42" then reads as though it were just looked at, when the
   * reviewer read it a revision or two ago and nothing has moved since. The chip names
   * the revision instead; at the current one the number is noise and the time is shown.
   */
  it('keeps the revision it was read at', () => {
    useReviewProgress.getState().start(CERT, 3, {
      signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', revision: 2 }],
      openMasterIds: [],
    })
    const s = useReviewProgress.getState()
    expect(s.signoffs.summary.revision).toBe(2)
    expect(s.revision).toBe(3)
  })

  it('still counts - an unchanged section does not need reading twice', () => {
    useReviewProgress.getState().start(CERT, 3, {
      signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', revision: 2 }],
      openMasterIds: [],
    })
    expect(useReviewProgress.getState().signoffs.summary).toBeTruthy()
  })

  it('notices when only the revision differs between two seeds', () => {
    // The fingerprint has to include it, or a reload after a resubmission would be
    // discarded as "same payload" and the chip would go on naming the old revision.
    useReviewProgress.getState().start(CERT, 3, {
      signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', revision: 2 }],
      openMasterIds: [],
    })
    useReviewProgress.getState().start(CERT, 3, {
      signoffs: [{ section: 'summary', checkedAt: '2026-09-18T11:39:00Z', revision: 3 }],
      openMasterIds: [],
    })
    expect(useReviewProgress.getState().signoffs.summary.revision).toBe(3)
  })
})
