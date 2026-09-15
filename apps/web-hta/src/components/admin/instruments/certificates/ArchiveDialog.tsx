'use client'

/**
 * Archiving a certificate with nothing to replace it.
 *
 * A modal, not a page: it is one decision with one reason, and losing the list
 * behind it to ask for a sentence was the wrong trade.
 *
 * It says what will be true afterwards - that the capability will have no
 * certificate in force - because that is the thing worth stopping for.
 */

import { useEffect, useState } from 'react'

export default function ArchiveDialog({
  certificateNumber,
  covers,
  validUntil,
  busy,
  onCancel,
  onConfirm,
}: {
  certificateNumber: string
  covers: string | null
  validUntil: string
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onCancel])

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="card upl modal" role="dialog" aria-modal="true" aria-label="Archive this certificate">
        <div className="uplhead">
          <span className="lbl">Archive this certificate</span>
          <button type="button" className="iconbtn" aria-label="Close" onClick={onCancel}>
            ✕
          </button>
        </div>

        <div className="uplsec">
          <p className="uplwhich">
            <b className="mono">{certificateNumber}</b> · {covers ?? 'no capability assigned'} · valid to{' '}
            {validUntil}
          </p>
          <p className="uplwarn">
            ⚠ Nothing replaces it, so {covers ? covers : 'this capability'} will have no certificate in
            force once archived.
          </p>
          <div className="pf" style={{ maxWidth: 460 }}>
            <span className="k">Reason</span>
            <input
              autoFocus
              value={reason}
              placeholder="uploaded against the wrong instrument"
              onChange={(e) => setReason(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onConfirm(reason)
              }}
            />
          </div>
        </div>

        <div className="uplfoot">
          <span className="dim">To replace it instead, upload the new one — that archives this in the same step.</span>
          <span className="sp">
            <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={() => onConfirm(reason)} disabled={busy}>
              {busy ? 'Archiving…' : 'Archive'}
            </button>
          </span>
        </div>
      </div>
    </div>
  )
}
