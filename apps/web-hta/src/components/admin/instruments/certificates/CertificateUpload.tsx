'use client'

/**
 * Adding a certificate.
 *
 * The PDF is chosen first and shown beside the form, so the figures are
 * transcribed from something readable rather than from memory.
 *
 * Superseding is one act: the new certificate arrives and the old one is
 * archived in the same step, and the two are linked. As two separate steps the
 * second half gets forgotten, which is how an instrument ends up with two
 * certificates both claiming to be current.
 */

import { useEffect, useState } from 'react'
import { Icon } from '../Icons'
import MultiPicker from '../MultiPicker'
import type { Profile } from '../capabilities/CapabilitiesTab'

export interface UploadDraft {
  reportNo: string
  /** One certificate often covers several capabilities. */
  capabilityProfileIds: string[]
  validFrom: string
  validUntil: string
  /** And can replace several at once. */
  replacesCertificateIds: string[]
  reason: string
}

export const blankUpload = (): UploadDraft => ({
  reportNo: '',
  capabilityProfileIds: [],
  validFrom: '',
  validUntil: '',
  replacesCertificateIds: [],
  reason: '',
})

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`)

function Tile({ on, title, sub, onClick }: { on: boolean; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className={'tile wide' + (on ? ' sel' : '')} onClick={onClick}>
      <span className="pick">{on ? '◉' : '○'}</span>
      <span className="tn">{title}</span>
      <span className="trule" />
      <span className="tv dim">{sub}</span>
    </button>
  )
}

export default function CertificateUpload({
  file,
  draft,
  set,
  profiles,
  live,
  componentName,
  busy,
  onCancel,
  onSave,
}: {
  file: File
  draft: UploadDraft
  set: (patch: Partial<UploadDraft>) => void
  profiles: Profile[]
  /** The certificates currently in force, as candidates to replace. */
  live: { id: string; reportNo: string | null; validUntil: string | null; capabilityProfileId: string | null }[]
  componentName: (profileId: string | null) => string
  busy: boolean
  onCancel: () => void
  onSave: () => void
}) {
  // The file only exists in this browser, so the preview URL is made here and
  // released when the form closes, or the blob leaks for the life of the tab.
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const u = URL.createObjectURL(file)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const chosen = live.filter((c) => draft.replacesCertificateIds.includes(c.id))
  const ready = draft.reportNo.trim() && draft.capabilityProfileIds.length > 0 && draft.validUntil
  const label = (p: Profile) => `${p.profileKey} ${p.parameter} (${p.role.toLowerCase()})`

  return (
    <div className="card upl">
      <div className="uplhead">
        <span className="lbl">New certificate</span>
        <span className="uplname">
          <Icon.file />
          <span className="nm">{file.name}</span>
          <span className="mono dim">{kb(file.size)}</span>
        </span>
        <button type="button" className="iconbtn" aria-label="Close" onClick={onCancel}>
          ✕
        </button>
      </div>

      <div className="uplsplit">
        <div className="uplpdf">
          {url ? <iframe src={`${url}#toolbar=1&navpanes=0`} title={file.name} /> : null}
        </div>

        <div className="uplform">
          <div className="uplgrid">
            <div className="pf">
              <span className="k">Cert #</span>
              <input
                value={draft.reportNo}
                placeholder="HTA/C50999/01/26"
                onChange={(e) => set({ reportNo: e.target.value })}
              />
            </div>
            <MultiPicker
              label="Covers"
              placeholder="Choose the capabilities…"
              emptyMessage="No capability matches that."
              noneMessage="This instrument has no capabilities declared yet, so there is nothing for a certificate to cover."
              options={profiles.map((p) => ({ value: p.id, label: label(p), detail: componentName(p.id) }))}
              selected={draft.capabilityProfileIds}
              onChange={(next) => set({ capabilityProfileIds: next })}
            />
            <div className="pf">
              <span className="k">Valid from</span>
              <input type="date" value={draft.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
            </div>
            <div className="pf">
              <span className="k">Valid until</span>
              <input type="date" value={draft.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
            </div>
          </div>

          <div className="uplsec">
            <span className="lbl">Does this replace one already on file?</span>
            <div className="tiles" style={{ marginTop: 9 }}>
              <Tile
                on={draft.replacesCertificateIds.length === 0}
                title="No"
                sub="certifies something not previously certified"
                onClick={() => set({ replacesCertificateIds: [] })}
              />
              <Tile
                on={draft.replacesCertificateIds.length > 0}
                title="Yes, it replaces one or more"
                sub="each is archived, with your reason recorded"
                onClick={() => set({ replacesCertificateIds: live[0] ? [live[0].id] : [] })}
              />
            </div>

            {draft.replacesCertificateIds.length > 0 && (
              <>
                <div className="uplgrid two">
                  <MultiPicker
                    label="Which ones"
                    placeholder="Choose the certificates…"
                    emptyMessage="No certificate in force matches that."
                    noneMessage="Nothing is in force for this instrument, so there is nothing to replace."
                    options={live.map((c) => ({
                      value: c.id,
                      label: c.reportNo || 'not recorded',
                      detail: componentName(c.capabilityProfileId),
                    }))}
                    selected={draft.replacesCertificateIds}
                    onChange={(next) => set({ replacesCertificateIds: next })}
                  />
                  <div className="pf">
                    <span className="k">Reason</span>
                    <input
                      value={draft.reason}
                      placeholder="annual recalibration"
                      onChange={(e) => set({ reason: e.target.value })}
                    />
                  </div>
                </div>
                {chosen.length > 0 && (
                  <p className="uplnote">
                    ⓘ On save: this becomes active,{' '}
                    <b>{chosen.map((c) => c.reportNo || 'a certificate').join(', ')}</b>{' '}
                    {chosen.length === 1 ? 'is' : 'are'} archived with your reason, and each is linked to
                    this one so the trail survives.
                    {draft.capabilityProfileIds.length === 0 &&
                      ' This certificate will cover whatever they covered.'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="uplfoot">
        <span className="dim">
          {ready ? '' : 'A certificate number, at least one capability it covers, and a valid-until date are needed.'}
        </span>
        <span className="sp">
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ready || busy}
            style={ready && !busy ? undefined : { opacity: 0.45 }}
            onClick={onSave}
          >
            {busy ? 'Adding…' : 'Add certificate'}
          </button>
        </span>
      </div>
    </div>
  )
}
