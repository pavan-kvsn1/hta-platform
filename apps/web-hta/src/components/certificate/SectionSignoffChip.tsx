'use client'

/**
 * The reviewer's tick, in a section header.
 *
 * It says the useful half. Not "Checked by Rajesh" - Rajesh is the one reading it and
 * knows he checked it. On his own screen the chip carries the time and an undo, which
 * are the two things he might act on. The name matters to everyone downstream, so that
 * is where it appears: on the authorising admin's screen and in the history.
 *
 * Three states, and the third is the one that earns the design. A section holding a
 * question nobody has answered cannot be ticked at all - it would be claiming to have
 * checked something still undecided.
 */

import { Check, Loader2, Lock } from 'lucide-react'

import { cn } from '@/lib/utils'
import {
  sectionOpenCount,
  useReviewProgress,
  type ReviewSectionId,
} from '@/lib/stores/review-progress-store'

export interface SectionSignoffChipProps {
  section: ReviewSectionId
  /** Off for anyone who is not the reviewer; the state still shows, read-only. */
  canSign?: boolean
}

const shell =
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors'

export function SectionSignoffChip({ section, canSign = true }: SectionSignoffChipProps) {
  const state = useReviewProgress()
  const signed = state.signoffs[section]
  const open = sectionOpenCount(state, section)
  const busy = state.busy === section

  const time = signed
    ? new Date(signed.checkedAt).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : null

  /**
   * A tick that outlived the revision it was made at.
   *
   * It survives because its section did not change, which is right - but "Checked
   * 11:42" then reads as though the reviewer looked at it just now, when in fact they
   * read it a revision or two ago and nothing has moved since. The revision is the
   * useful half there; at the current one it is noise, so it is not shown.
   */
  const fromEarlier =
    signed?.revision !== undefined && state.revision > 0 && signed.revision < state.revision

  return (
    <span className="inline-flex items-center gap-2">
      {signed ? (
        <span
          className={cn(shell, 'border-green-200 bg-green-50 text-green-700')}
          title={
            fromEarlier
              ? `Checked at ${time} during revision ${signed.revision}; nothing in this section has changed since`
              : `Checked at ${time}`
          }
        >
          <Check className="size-3" />
          {fromEarlier ? `Checked at Revision ${signed.revision}` : `Checked ${time}`}
          {canSign && (
            <button
              type="button"
              onClick={() => state.setChecked(section, false)}
              className="ml-0.5 pl-2 border-l border-green-200 text-green-700/70 hover:text-green-800"
            >
              Undo
            </button>
          )}
        </span>
      ) : open > 0 ? (
        <span
          className={cn(shell, 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed')}
          title={`${open} item${open === 1 ? '' : 's'} to decide before this can be checked`}
        >
          <Lock className="size-3" />
          Mark checked
        </span>
      ) : (
        <button
          type="button"
          disabled={!canSign || busy}
          onClick={() => state.setChecked(section, true)}
          className={cn(
            shell,
            'border-slate-300 bg-white text-slate-500 hover:border-primary hover:text-primary',
            (!canSign || busy) && 'opacity-50',
          )}
        >
          {busy ? <Loader2 className="size-3 animate-spin" /> : <span className="size-3 rounded-[3px] border border-slate-300" />}
          Mark checked
        </button>
      )}

      {open > 0 ? (
        <span className="text-[11px] font-semibold text-amber-700">
          {open} open
        </span>
      ) : (
        <span className="text-[11px] text-slate-400">nothing open</span>
      )}
    </span>
  )
}
