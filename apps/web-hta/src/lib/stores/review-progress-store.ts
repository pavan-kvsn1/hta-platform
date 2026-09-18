'use client'

/**
 * How far through a review the reviewer is, shared by the two halves of the screen.
 *
 * The chips live in the section headers, inside ReviewerContent. The Approve button
 * lives in the actions panel, in ReviewerPageClient, which renders that content. They
 * have to agree - a tick must dim the button, a rejected master must close it - and
 * threading state through a nine-hundred-line component to say so would put the wiring
 * everywhere the reader is trying to read the certificate.
 *
 * Everything here is what the server already decided. Nothing is inferred locally: a
 * tick is written before it shows, so what the screen says and what the certificate
 * records are never two different answers.
 */

import { create } from 'zustand'

import { apiFetch } from '@/lib/api-client'

/** The seven, in the order the certificate presents them. */
export const REVIEW_SECTION_IDS = [
  'summary',
  'uuc-details',
  'master-inst',
  'environment',
  'results',
  'remarks',
  'conclusion',
] as const

export type ReviewSectionId = (typeof REVIEW_SECTION_IDS)[number]

export interface SectionSignoff {
  section: string
  checkedAt: string
  /**
   * The revision it was read at.
   *
   * A tick survives a resubmission that did not touch its section, which is the point
   * of hashing the content - but then "checked" alone is misleading: the reviewer read
   * that section two revisions ago and has not looked since. Where it is older than the
   * certificate's current revision, the chip says so instead of the time.
   */
  revision?: number
  /** Who ticked it. Shown downstream - on the admin's screen and in the history. */
  userName?: string | null
  /**
   * The section has changed since it was ticked, so the tick no longer vouches for
   * what is there. Decided by the server against a hash of the section's content, not
   * by the revision number: a resubmission that touched two sections leaves the other
   * five standing, and a section edited without a revision loses its tick anyway.
   *
   * A lapsed tick is not kept. The box goes back to unchecked, which is what it is -
   * the section needs reading again, and a third colour saying so is a state to learn
   * rather than an instruction to follow.
   */
  stale?: boolean
}

export interface MasterDecision {
  masterId: string
  decision: 'ACCEPTED' | 'REJECTED'
  reason?: string | null
}

interface ReviewProgressState {
  certificateId: string | null
  revision: number
  /** Sections ticked at the current revision, keyed by section id. */
  signoffs: Record<string, SectionSignoff>
  /** Decisions made at the current revision, keyed by the join row's id. */
  decisions: Record<string, MasterDecision>
  /** Masters the engineer had to justify, and so the reviewer must answer. */
  openMasterIds: string[]
  busy: string | null
  error: string | null
  /**
   * What the last seed said, so seeding the same thing twice writes nothing.
   *
   * start() is called from an effect that watches the certificate, and a certificate
   * is an object rebuilt on every render of the page above. Without this the effect
   * set state, the state re-rendered, the effect ran again - React caught it as a
   * depth limit, which is the polite name for a loop.
   *
   * It is deliberately not cleared when the reviewer ticks something. Re-seeding the
   * same payload after a tick would undo the tick; a payload that genuinely changed -
   * the certificate reloaded, a new revision - has a different fingerprint and seeds
   * as it should.
   */
  seeded: string | null

  start: (
    certificateId: string,
    revision: number,
    seed: {
      signoffs?: SectionSignoff[]
      decisions?: MasterDecision[]
      openMasterIds?: string[]
    },
  ) => void
  setChecked: (section: ReviewSectionId, checked: boolean) => Promise<void>
  /** Null puts the question back, rather than flipping to the opposite answer. */
  decide: (
    masterId: string,
    decision: 'ACCEPTED' | 'REJECTED' | null,
    reason?: string,
  ) => Promise<void>
}

/**
 * Whether a section can be ticked at all.
 *
 * A section cannot claim to be checked while it still holds a question nobody has
 * answered. Today that is a master the app could not rate; the shape allows more.
 */
export function sectionOpenCount(state: ReviewProgressState, section: string): number {
  if (section !== 'master-inst') return 0
  return state.openMasterIds.filter((id) => !state.decisions[id]).length
}

/** Masters this reviewer turned down at this revision. */
export function rejectedMasters(state: ReviewProgressState): MasterDecision[] {
  return Object.values(state.decisions).filter((d) => d.decision === 'REJECTED')
}

export const useReviewProgress = create<ReviewProgressState>((set, get) => ({
  certificateId: null,
  revision: 0,
  signoffs: {},
  decisions: {},
  openMasterIds: [],
  busy: null,
  error: null,
  seeded: null,

  start: (certificateId, revision, seed) => {
    const fingerprint = JSON.stringify([
      certificateId,
      revision,
      (seed.signoffs ?? []).map((s) => [s.section, s.checkedAt, s.revision ?? 0, s.stale ?? false]),
      (seed.decisions ?? []).map((d) => [d.masterId, d.decision, d.reason ?? '']),
      seed.openMasterIds ?? [],
    ])
    // Same certificate, same revision, same answers: nothing to write, and writing it
    // would wake every subscriber for no reason.
    if (get().seeded === fingerprint) return

    set({
      certificateId,
      revision,
      // A lapsed tick is dropped here rather than carried and special-cased later:
      // the section is unchecked, and everything downstream can just read that.
      signoffs: Object.fromEntries(
        (seed.signoffs ?? []).filter((s) => !s.stale).map((s) => [s.section, s]),
      ),
      decisions: Object.fromEntries((seed.decisions ?? []).map((d) => [d.masterId, d])),
      openMasterIds: seed.openMasterIds ?? [],
      seeded: fingerprint,
      error: null,
    })
  },

  setChecked: async (section, checked) => {
    const { certificateId } = get()
    if (!certificateId) return
    set({ busy: section, error: null })
    try {
      const res = await apiFetch(`/api/certificates/${certificateId}/section-signoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, checked }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Could not record that')

      set((s) => {
        const signoffs = { ...s.signoffs }
        if (checked)
          signoffs[section] = { section, checkedAt: data.checkedAt, revision: data.revision }
        else delete signoffs[section]
        return { signoffs }
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not record that' })
    } finally {
      set({ busy: null })
    }
  },

  decide: async (masterId, decision, reason) => {
    const { certificateId } = get()
    if (!certificateId) return
    set({ busy: masterId, error: null })
    try {
      const res = await apiFetch(`/api/certificates/${certificateId}/master-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ masterId, decision, reason }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.message || data.error || 'Could not record that')

      set((s) => {
        // Deciding a master unsettles the section it is in: what was checked is not
        // what stands now. The server clears the row; the screen follows.
        const signoffs = { ...s.signoffs }
        delete signoffs['master-inst']

        const decisions = { ...s.decisions }
        if (decision === null) delete decisions[masterId]
        else decisions[masterId] = { masterId, decision, reason }

        return { signoffs, decisions }
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Could not record that' })
    } finally {
      set({ busy: null })
    }
  },
}))
