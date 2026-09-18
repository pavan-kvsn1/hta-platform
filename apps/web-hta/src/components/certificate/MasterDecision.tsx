'use client'

/**
 * The one judgement on a certificate the app cannot make, put to the person whose job
 * it is to make it.
 *
 * When a master's accuracy ratio falls below the lab's threshold - or when there is
 * nothing to rate it by at all - the engineer is stopped and made to write why it was
 * used anyway. Nobody was ever asked to agree with that sentence. Approving the
 * certificate accepted it silently, which is the worst of both: a judgement recorded
 * as having been reviewed, by a review that never saw it.
 *
 * A rejection carries a reason, and that reason is what pre-fills Request Revision and
 * Reject - so it is written once, here, where the problem was seen.
 */

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useReviewProgress } from '@/lib/stores/review-progress-store'

export interface MasterDecisionProps {
  masterId: string
  /** The parameter this master served, named in the question. */
  parameterName?: string | null
  /** What the engineer wrote when they were stopped. */
  engineerReason: string
  /** Why the app could not rate it, in its own words. */
  note?: string | null
  canDecide?: boolean
}

export function MasterDecision({
  masterId,
  parameterName,
  engineerReason,
  note,
  canDecide = true,
}: MasterDecisionProps) {
  const decisions = useReviewProgress((s) => s.decisions)
  const decide = useReviewProgress((s) => s.decide)
  const busy = useReviewProgress((s) => s.busy) === masterId
  const decided = decisions[masterId]

  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  if (decided) {
    const accepted = decided.decision === 'ACCEPTED'
    return (
      <div
        className={cn(
          'mt-2 rounded-lg border px-3 py-2 text-xs',
          accepted
            ? 'border-green-200 bg-green-50 text-green-800'
            : 'border-red-200 bg-red-50 text-red-800',
        )}
      >
        <div className="flex items-center gap-2">
          {accepted ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          <span className="font-semibold">
            {accepted ? 'You accepted this master' : 'You rejected this master'}
          </span>
          {/* Back to being asked, not flipped to the other answer. Change used to call
              the opposite decision straight through - so a reviewer who rejected a
              master and wanted another look at it accepted it instead, in one click,
              with a blank reason to get past the validation. */}
          {canDecide && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setRejecting(false)
                setReason('')
                void decide(masterId, null)
              }}
              className="ml-auto underline underline-offset-2 opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              Change
            </button>
          )}
        </div>
        {/* The reason sits on its own lighter ground. The line above is a verdict and
            earns the strong colour; what follows is the reviewer's own sentence, and
            reading it off the same alarm-red made the words shout as loudly as the
            decision. Quoted, not repeated. */}
        {!accepted && decided.reason && (
          <p className="mt-2 rounded-md border border-red-100 bg-white/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-red-900/70">
            {decided.reason}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
      <p className="flex items-start gap-2 text-xs font-semibold text-amber-900">
        <AlertTriangle className="size-3.5 shrink-0 mt-px text-amber-600" />
        <span>
          Accept or reject this master{parameterName ? ` for ${parameterName}` : ''}?
        </span>
      </p>
      {note && <p className="mt-1 pl-5 text-xs text-amber-800 leading-relaxed">{note}</p>}
      <p className="mt-2 ml-5 rounded-md border border-amber-100 bg-white/70 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-amber-900/80">
        <span className="font-semibold">The engineer wrote:</span> {engineerReason}
      </p>

      {rejecting ? (
        <div className="mt-2.5 pl-5">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-red-700">
            Reject — why
          </label>
          <textarea
            autoFocus
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="What has to change before this certificate can go out?"
            className="mt-1 w-full rounded-lg border border-red-200 px-2.5 py-1.5 text-xs focus:border-red-400 focus:outline-none"
          />
          {/* Said plainly, because it is the reason this box exists: what is typed here
              is what the engineer receives, so it is written once rather than retyped
              into a modal afterwards. */}
          <p className="mt-1 text-[11px] text-slate-500">
            This is what the engineer will see, and it fills in the revision request.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              disabled={!reason.trim() || busy}
              onClick={() => void decide(masterId, 'REJECTED', reason.trim())}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              {busy && <Loader2 className="size-3 animate-spin" />}
              Reject this master
            </button>
            <button
              type="button"
              onClick={() => setRejecting(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2.5 flex items-center gap-2 pl-5">
          <button
            type="button"
            disabled={!canDecide || busy}
            onClick={() => void decide(masterId, 'ACCEPTED')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            Accept
          </button>
          <button
            type="button"
            disabled={!canDecide}
            onClick={() => setRejecting(true)}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
          >
            Reject
          </button>
          <span className="ml-auto text-[11px] text-amber-800">
            Section 3 cannot be checked until this is answered
          </span>
        </div>
      )}
    </div>
  )
}
