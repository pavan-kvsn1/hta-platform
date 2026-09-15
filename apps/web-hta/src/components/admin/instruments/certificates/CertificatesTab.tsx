'use client'

/**
 * The calibration certificates on file.
 *
 * Active and archived are separate panes, green and red, so the certificate
 * actually in force is never one card among many. Archived starts shut: it is
 * history, consulted rather than watched.
 *
 * Least count and accuracy are read from the capability a certificate covers,
 * never stored on the certificate, so a card and the capability behind it can
 * never disagree. The cost of that is drift: a capability edited after the
 * certificate was read is flagged rather than quietly shown as current.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'
import { Icon } from '../Icons'
import AccuracyCell from '../capabilities/AccuracyCell'
import { rowsOf, type Component, type Profile } from '../capabilities/CapabilitiesTab'
import ArchiveDialog from './ArchiveDialog'
import CertificateUpload, { blankUpload, type UploadDraft } from './CertificateUpload'
import CertificateViewer from './CertificateViewer'
import DriftReview from './DriftReview'

interface Certificate {
  id: string
  reportNo: string | null
  fileName: string
  fileSize: number | null
  pageCount: number | null
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  isLatest: boolean
  uploadedAt: string
  archivedReason: string | null
  archivedAt: string | null
  uploadedBy?: { name?: string | null; email?: string | null } | null
  capabilityProfileId?: string | null
  /** Empty means "whatever capabilityProfileId says", for rows written before this. */
  capabilityProfileIds?: string[]
  supersededBy?: { id: string; reportNo: string | null; fileName: string } | null
  capabilityProfile?: { id: string; profileKey: string; parameter: string; role: string; updatedAt: string } | null
}

const kb = (n: number | null) =>
  n === null ? '—' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`

/** The capability moved after this certificate was read. */
const drifted = (c: Certificate) =>
  Boolean(
    c.isActive &&
      c.capabilityProfile &&
      new Date(c.capabilityProfile.updatedAt).getTime() > new Date(c.uploadedAt).getTime() + 60_000,
  )

function Pane({
  tone,
  title,
  sub,
  list,
  empty,
  open,
  onToggle,
  children,
}: {
  tone: 'live' | 'gone'
  title: string
  sub: string
  list: unknown[]
  empty: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className={'pane ' + tone}>
      <button type="button" className="panehead" aria-expanded={open} onClick={onToggle}>
        <span className="cv">{open ? '▾' : '▸'}</span>
        <span className="pt">{title}</span>
        <span className="ps">{sub}</span>
        <span className="pn">{list.length}</span>
      </button>
      {open && (
        <div className="panebody">
          {list.length ? <div className="certgrid">{children}</div> : <p className="paneempty">{empty}</p>}
        </div>
      )}
    </section>
  )
}

export default function CertificatesTab({
  instrumentId,
  formatDate,
}: {
  instrumentId: string
  formatDate: (iso: string | null) => string
}) {
  const [certs, setCerts] = useState<Certificate[] | null>(null)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [paneActive, setPaneActive] = useState(true)
  const [paneArchived, setPaneArchived] = useState(false)

  const [viewing, setViewing] = useState<string | null>(null)
  /** The signed URL for whatever is being viewed, and why there is none. */
  const [viewUrl, setViewUrl] = useState<string | null>(null)
  const [viewError, setViewError] = useState<string | null>(null)
  /** Set when the viewer is showing a blob this page made and must release. */
  const revokeOnClose = useRef<string | null>(null)
  const [archiving, setArchiving] = useState<string | null>(null)
  const [reviewing, setReviewing] = useState<string | null>(null)
  const [settled, setSettled] = useState<Set<string>>(() => new Set())

  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<UploadDraft>(blankUpload)
  const [dragging, setDragging] = useState(false)
  const picker = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [c, caps] = await Promise.all([
        apiFetch(`/api/admin/instruments/${instrumentId}/certificates?includeInactive=true`),
        apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`),
      ])
      if (!c.ok) {
        setError(`Could not load the certificates (error ${c.status}).`)
        return
      }
      setCerts((await c.json()).certificates ?? [])
      if (caps.ok) {
        const d = await caps.json()
        setProfiles(d.profiles ?? [])
        setComponents(d.components ?? [])
      }
    } catch {
      setError('Could not reach the server.')
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  const componentName = (profileId: string | null) => {
    const pr = profiles.find((p) => p.id === profileId)
    if (!pr) return 'no capability assigned'
    const c = components.find((x) => x.id === pr.componentId)
    return c ? c.name : 'the instrument'
  }
  /** Every capability the certificate covers, old single-column rows included. */
  const coversIds = (c: Certificate) =>
    c.capabilityProfileIds?.length ? c.capabilityProfileIds : c.capabilityProfileId ? [c.capabilityProfileId] : []

  const coversLabel = (c: Certificate) => {
    const names = coversIds(c)
      .map((id) => profiles.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => `${p!.profileKey} ${p!.parameter} (${p!.role.toLowerCase()})`)
    return names.length ? names.join(', ') : null
  }

  /**
   * The file's own URL, signed and short-lived.
   *
   * Asking for it costs a round trip, which is why it is only asked for when
   * somebody opens or downloads a certificate rather than for every card.
   */
  const fileUrl = async (certId: string) => {
    // A signed URL is the better answer when it works: the file goes straight
    // from storage to the browser. It needs a service account to sign with,
    // which a developer signed in as themselves does not have, so a failure
    // here is expected rather than exceptional.
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/certificates/${certId}`)
      if (res.ok) {
        const body = await res.json()
        if (body.url) return { url: body.url as string, revoke: false }
      }
    } catch {
      /* fall through to the stream */
    }

    // Streaming needs no signing key, only the session this request already
    // carries. Slower, and always available.
    const res = await apiFetch(`/api/admin/instruments/${instrumentId}/certificates/${certId}/pdf`)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      throw new Error(body?.error || `Could not open the certificate (error ${res.status}).`)
    }
    return { url: URL.createObjectURL(await res.blob()), revoke: true }
  }

  const view = async (certId: string) => {
    setViewing(certId)
    setViewUrl(null)
    setViewError(null)
    try {
      const { url, revoke } = await fileUrl(certId)
      setViewUrl(url)
      // A blob belongs to this page; closing the viewer has to hand it back.
      revokeOnClose.current = revoke ? url : null
    } catch (e) {
      setViewError(e instanceof Error ? e.message : 'Could not open the certificate.')
    }
  }

  const download = async (c: Certificate) => {
    setError(null)
    try {
      const { url, revoke } = await fileUrl(c.id)
      const a = document.createElement('a')
      a.href = url
      a.download = c.fileName
      a.rel = 'noreferrer'
      document.body.appendChild(a)
      a.click()
      a.remove()
      if (revoke) window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not download the certificate.')
    }
  }

  const setActive = async (certId: string, isActive: boolean, reason?: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/certificates/${certId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive, reason }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not update the certificate (error ${res.status}).`)
        return false
      }
      if (!isActive) setPaneArchived(true)
      await load()
      return true
    } catch {
      setError('Could not reach the server.')
      return false
    } finally {
      setBusy(false)
    }
  }

  const upload = async () => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const body = new FormData()
      body.append('file', file)
      body.append('reportNo', draft.reportNo.trim())
      body.append('capabilityProfileIds', JSON.stringify(draft.capabilityProfileIds))
      if (draft.validFrom) body.append('validFrom', draft.validFrom)
      if (draft.validUntil) body.append('validUntil', draft.validUntil)
      if (draft.replacesCertificateIds.length) {
        body.append('replacesCertificateIds', JSON.stringify(draft.replacesCertificateIds))
        body.append('reason', draft.reason.trim())
      }
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/certificates`, { method: 'POST', body })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error || `Could not add the certificate (error ${res.status}).`)
        return
      }
      setFile(null)
      setDraft(blankUpload())
      setPaneActive(true)
      await load()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setBusy(false)
    }
  }

  if (error && !certs) {
    return (
      <div className="card sec">
        <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
      </div>
    )
  }
  if (!certs) {
    return (
      <div className="card sec" style={{ display: 'grid', placeItems: 'center', minHeight: 120 }}>
        <Loader2 className="size-5 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const live = certs.filter((c) => c.isActive)
  const gone = certs.filter((c) => !c.isActive)

  /* ── one thing at a time ── */
  const open = certs.find((c) => c.id === viewing)
  if (open) {
    return (
      <CertificateViewer
        src={viewUrl}
        error={viewError}
        fileName={open.fileName}
        pageCount={open.pageCount}
        isActive={open.isActive}
        backTo="Certificates"
        onDownload={() => void download(open)}
        onClose={() => {
          if (revokeOnClose.current) URL.revokeObjectURL(revokeOnClose.current)
          revokeOnClose.current = null
          setViewing(null)
          setViewUrl(null)
          setViewError(null)
        }}
      />
    )
  }

  const review = certs.find((c) => c.id === reviewing)
  if (review && review.capabilityProfileId) {
    const pr = profiles.find((p) => p.id === review.capabilityProfileId)
    if (pr) {
      return (
        <DriftReview
          certificateNumber={review.reportNo || review.fileName}
          uploadedAt={formatDate(review.uploadedAt)}
          editedAt={formatDate(review.capabilityProfile?.updatedAt ?? null)}
          profile={pr}
          busy={busy}
          onBack={() => setReviewing(null)}
          onAccept={() => {
            // Nothing to write: the flag is derived from the two timestamps. Settling
            // it is a decision by this reader, so it is remembered for this visit and
            // the certificate is left exactly as it was.
            setSettled((s) => new Set(s).add(review.id))
            setReviewing(null)
          }}
          onUpload={() => {
            setReviewing(null)
            picker.current?.click()
          }}
        />
      )
    }
  }

  if (file) {
    return (
      <>
        {error && (
          <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
            <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
          </div>
        )}
        <CertificateUpload
          file={file}
          draft={draft}
          set={(patch) => setDraft((d) => ({ ...d, ...patch }))}
          profiles={profiles}
          live={live.map((c) => ({
            id: c.id,
            reportNo: c.reportNo,
            validUntil: c.validUntil,
            capabilityProfileId: c.capabilityProfileId ?? null,
          }))}
          componentName={componentName}
          busy={busy}
          onCancel={() => {
            setFile(null)
            setDraft(blankUpload())
          }}
          onSave={() => void upload()}
        />
      </>
    )
  }

  const card = (c: Certificate) => {
    const covered = coversIds(c)
      .map((id) => profiles.find((p) => p.id === id))
      .filter((p): p is Profile => Boolean(p))
    const pr = covered[0] ?? null
    // The figures come off whichever covered capability declares them first.
    const rows = covered.flatMap(rowsOf)
    const lc = rows.find((b) => b.leastCountValue !== null)
    const acc = rows.find((b) => b.accuracyKind)
    const showDrift = drifted(c) && !settled.has(c.id)

    return (
      <div className={'card cert' + (c.isActive ? '' : ' arch')} key={c.id}>
        <div className="certtop">
          <span className="certno mono">{c.reportNo || 'not recorded'}</span>
          <span className={'pill ' + (c.isActive ? 'good' : 'crit')}>{c.isActive ? 'ACTIVE' : 'ARCHIVED'}</span>
          {!c.isActive && c.supersededBy ? <span className="expnote">replaced</span> : null}
        </div>

        <div className="covers">
          <span className="ck">Covers</span>
          <span className="cv">
            {pr ? (
              <>
                {coversLabel(c)}{' '}
                <span style={{ color: 'var(--faint)' }}>· {componentName(pr.id)}</span>
              </>
            ) : (
              <span className="undecl">no capability assigned</span>
            )}
          </span>
        </div>

        {showDrift && (
          <div className="driftband">
            <span className="dw">⚠</span>
            <span className="dt">
              Edited {formatDate(c.capabilityProfile?.updatedAt ?? null)}, after this certificate
            </span>
            <button type="button" className="link" onClick={() => setReviewing(c.id)}>
              Review
            </button>
          </div>
        )}

        {!c.isActive && (
          <div className="archmeta">
            <span>
              <span className="sk">Replaced by</span>{' '}
              <span className="mono">{c.supersededBy?.reportNo || c.supersededBy?.fileName || '—'}</span>
            </span>
            <span>
              <span className="sk">Reason</span> {c.archivedReason || '—'}
            </span>
            <span>
              <span className="sk">Archived</span> {c.archivedAt ? formatDate(c.archivedAt) : '—'}
            </span>
          </div>
        )}

        <div className="certstats">
          <div>
            <span className="sk">Least Count</span>
            <span className="sv mono">
              {lc ? (
                `${lc.leastCountValue}${lc.leastCountUnit ? ` ${lc.leastCountUnit}` : ''}`
              ) : (
                <span className="undecl">—</span>
              )}
            </span>
          </div>
          <div>
            <span className="sk">Accuracy</span>
            <span className="sv mono">{acc ? <AccuracyCell bucket={acc} /> : <span className="undecl">—</span>}</span>
          </div>
          <div>
            <span className="sk">Valid Until</span>
            <span className="sv mono">{formatDate(c.validUntil)}</span>
          </div>
        </div>

        <div className="certfoot">
          <span className="fn">
            <Icon.file />
            <span>{c.fileName}</span>
          </span>
          <span className="mt mono">
            {c.pageCount ? `${c.pageCount}p · ` : ''}
            {kb(c.fileSize)}
          </span>
        </div>

        <div className="certacts">
          <button type="button" className="link" onClick={() => void view(c.id)}>
            View
          </button>
          <button type="button" className="link" onClick={() => void download(c)}>
            Download
          </button>
          {c.isActive ? (
            <button type="button" className="link" disabled={busy} onClick={() => setArchiving(c.id)}>
              Archive
            </button>
          ) : (
            <button
              type="button"
              className="link"
              disabled={busy}
              onClick={() => {
                // Restoring one that was superseded would leave two in force against
                // one capability - the state the upload flow exists to prevent.
                const mine = coversIds(c)
                const clash = live.find((x) => coversIds(x).some((id) => mine.includes(id)))
                if (
                  clash &&
                  !window.confirm(
                    `${clash.reportNo || 'Another certificate'} is already in force for this capability. ` +
                      `Restoring ${c.reportNo || 'this one'} leaves two active against it. Continue?`,
                  )
                )
                  return
                void setActive(c.id, true)
              }}
            >
              Restore
            </button>
          )}
        </div>
      </div>
    )
  }

  const archiveTarget = certs.find((c) => c.id === archiving)

  return (
    <>
      <input
        ref={picker}
        type="file"
        accept="application/pdf"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setFile(f)
          e.target.value = ''
        }}
      />

      {error && (
        <div className="card sec" style={{ borderColor: 'var(--crit-br)', background: 'var(--crit-bg)' }}>
          <p style={{ margin: 0, color: 'var(--crit-tx)' }}>{error}</p>
        </div>
      )}

      {archiveTarget && (
        <ArchiveDialog
          certificateNumber={archiveTarget.reportNo || archiveTarget.fileName}
          covers={coversLabel(archiveTarget)}
          validUntil={formatDate(archiveTarget.validUntil)}
          busy={busy}
          onCancel={() => setArchiving(null)}
          onConfirm={(reason) => {
            void setActive(archiveTarget.id, false, reason).then((ok) => ok && setArchiving(null))
          }}
        />
      )}

      <div
        className={'drop' + (dragging ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          if (!dragging) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer?.files?.[0]
          if (f && f.type === 'application/pdf') setFile(f)
        }}
      >
        Drag a PDF here, or{' '}
        <button type="button" className="browse" onClick={() => picker.current?.click()}>
          Browse Files
        </button>
        <div style={{ fontSize: '11.5px', color: 'var(--faint)', marginTop: 3 }}>
          The certificate opens beside the form, so you can read it while you fill it in.
        </div>
      </div>

      <Pane
        tone="live"
        title="Active Certificates"
        sub="current calibration valid"
        list={live}
        empty="No certificate is in force for this instrument."
        open={paneActive}
        onToggle={() => setPaneActive((o) => !o)}
      >
        {live.map(card)}
      </Pane>

      <Pane
        tone="gone"
        title="Archived Certificates"
        sub="expired or superseded"
        list={gone}
        empty="Nothing archived."
        open={paneArchived}
        onToggle={() => setPaneArchived((o) => !o)}
      >
        {gone.map(card)}
      </Pane>
    </>
  )
}
