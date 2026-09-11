'use client'

/**
 * The calibration certificates an instrument holds, laid out as the wireframe has them:
 * ACTIVE first, then ARCHIVED, each card carrying its own least count and accuracy.
 *
 * The split is the point. An instrument can hold several certificates at once - a
 * pressure calibrator with a high and a low transducer has one for each - so "the
 * latest" is not the same as "the one in force", and a single list sorted by upload date
 * invites reading an expired certificate as though it still stood.
 *
 * Least count and accuracy come from the capability a certificate covers. Until one is
 * assigned the card says so rather than inventing a figure: a wrong accuracy on a
 * certificate card is worse than an absent one.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Download, FileText, Loader2, MousePointerClick, Pencil, RotateCcw, X } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface Certificate {
  id: string
  fileName: string
  fileSize: number
  pageCount?: number | null
  reportNo: string | null
  validFrom: string | null
  validUntil: string | null
  uploadedAt: string
  isActive: boolean
  isLatest: boolean
  capabilityProfileId?: string | null
  uploadedBy?: { name?: string | null; email?: string | null } | null
}

interface Profile {
  id: string
  parameter: string
  role: string
  buckets: unknown[]
  subtypes: { buckets: unknown[] }[]
}

interface ProfileSummary {
  id: string
  label: string
  leastCount: string | null
  accuracy: string | null
}

function sizeText(bytes: number) {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

function Action({
  onClick,
  disabled,
  icon: Icon,
  children,
  danger,
}: {
  onClick: () => void
  disabled?: boolean
  icon: typeof Check
  children: string
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-[12px] inline-flex items-center gap-1 disabled:opacity-40 ${
        danger ? 'text-[#94a3b8] hover:text-[#dc2626]' : 'text-[#64748b] hover:text-[#0f172a]'
      }`}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

function CertificateCard({
  cert,
  profile,
  formatDate,
  onOpen,
  onDownload,
  onArchive,
  onRestore,
  onEdit,
  busy,
  archived,
}: {
  cert: Certificate
  profile: ProfileSummary | null
  formatDate: (iso: string | null) => string
  onOpen: (id: string) => void
  onDownload: (id: string) => void
  onArchive: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (id: string) => void
  busy: string | null
  archived: boolean
}) {
  const expired = cert.validUntil ? new Date(cert.validUntil) < new Date() : false
  const working = busy === cert.id

  return (
    <div className={`rounded-xl border p-4 ${archived ? 'border-[#e2e8f0] bg-[#f8fafc]' : 'border-[#e2e8f0] bg-white'}`}>
      <div className="flex items-start gap-2 mb-2.5">
        {archived ? (
          <X className="size-4 mt-0.5 shrink-0 text-[#94a3b8]" aria-label="Archived" />
        ) : (
          <Check className="size-4 mt-0.5 shrink-0 text-[#15803d]" aria-label="Active" />
        )}
        <FileText className={`size-4 mt-0.5 shrink-0 ${archived ? 'text-[#94a3b8]' : 'text-[#7c3aed]'}`} />
        <p className="text-[13px] font-medium text-[#0f172a] truncate flex-1" title={cert.fileName}>
          {cert.fileName}
        </p>
        {expired && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fee2e2] text-[#b91c1c] shrink-0">EXPIRED</span>
        )}
      </div>

      <dl className="text-[12px] space-y-1 mb-3">
        <div className="flex gap-2">
          <dt className="text-[#64748b] w-[86px] shrink-0">Cert #</dt>
          <dd className="text-[#0f172a] truncate">{cert.reportNo || '—'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[#64748b] w-[86px] shrink-0">Uploaded</dt>
          <dd className="text-[#0f172a]">
            {formatDate(cert.uploadedAt)} <span className="text-[#94a3b8]">·</span> {sizeText(cert.fileSize)}
            {cert.pageCount ? (
              <>
                {' '}
                <span className="text-[#94a3b8]">·</span> {cert.pageCount} pages
              </>
            ) : null}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[#64748b] w-[86px] shrink-0">Least Count</dt>
          <dd className={profile?.leastCount ? 'text-[#0f172a]' : 'text-[#94a3b8] italic'}>
            {profile?.leastCount ?? (cert.capabilityProfileId ? 'not declared' : 'no capability assigned')}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[#64748b] w-[86px] shrink-0">Accuracy</dt>
          <dd className={profile?.accuracy ? 'text-[#0f172a]' : 'text-[#94a3b8] italic'}>
            {profile?.accuracy ?? (cert.capabilityProfileId ? 'not declared' : 'no capability assigned')}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-[#64748b] w-[86px] shrink-0">Valid Until</dt>
          <dd className="text-[#0f172a]">
            {formatDate(cert.validUntil)}
            {expired && <span className="text-[#b91c1c]"> (expired)</span>}
          </dd>
        </div>
      </dl>

      <div className="flex items-center gap-3 flex-wrap">
        <Action onClick={() => onOpen(cert.id)} disabled={working} icon={working ? Loader2 : FileText}>
          View
        </Action>
        <Action onClick={() => onDownload(cert.id)} disabled={working} icon={Download}>
          Download
        </Action>
        <Action onClick={() => onEdit(cert.id)} disabled={working} icon={Pencil}>
          Edit
        </Action>
        {archived ? (
          <Action onClick={() => onRestore(cert.id)} disabled={working} icon={RotateCcw}>
            Restore
          </Action>
        ) : (
          <Action onClick={() => onArchive(cert.id)} disabled={working} icon={X} danger>
            Archive
          </Action>
        )}
      </div>
    </div>
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
  const [profiles, setProfiles] = useState<Map<string, ProfileSummary>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const base = `/api/admin/instruments/${instrumentId}/certificates`

  const explain = useCallback(async (res: Response, fallback: string) => {
    const body = await res.json().catch(() => null)
    if (body?.error) return body.error as string
    if (res.status === 401 || res.status === 403) return 'Your session has expired. Sign in again.'
    return `${fallback} (error ${res.status}).`
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Archived ones are wanted too - this tab is where they are restored from.
      const [certRes, capRes] = await Promise.all([
        apiFetch(`${base}?includeInactive=true`),
        apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`),
      ])

      if (!certRes.ok) {
        setCerts(null)
        setError(await explain(certRes, 'Could not load certificates'))
        return
      }
      setCerts((await certRes.json()).certificates ?? [])

      // The figures on each card come from the capability it covers. If this fails the
      // cards still list, they just cannot name a least count.
      if (capRes.ok) {
        const d = await capRes.json().catch(() => null)
        const m = new Map<string, ProfileSummary>()
        // Defensive: the cards are useful without these figures, so anything unexpected
        // here leaves them unnamed rather than emptying the whole tab.
        for (const p of (d?.profiles ?? []) as Profile[]) {
          const all = [...(p.buckets ?? []), ...(p.subtypes ?? []).flatMap((s) => s.buckets ?? [])] as {
            leastCountValue: number | null
            leastCountUnit: string | null
            accuracyKind: string | null
            accuracyValue: number | null
            accuracyUnit: string | null
            accuracyPolarity: string | null
            accuracyFormula: string | null
            accuracyClass: string | null
          }[]
          const lc = all.find((b) => b.leastCountValue !== null)
          const acc = all.find((b) => b.accuracyKind !== null)
          m.set(p.id, {
            id: p.id,
            label: `${p.parameter} (${String(p.role).toLowerCase()})`,
            leastCount: lc ? `${lc.leastCountValue}${lc.leastCountUnit ? ` ${lc.leastCountUnit}` : ''}` : null,
            accuracy: acc
              ? acc.accuracyKind === 'SYMMETRIC'
                ? `${acc.accuracyPolarity ?? '±'}${acc.accuracyValue}${acc.accuracyUnit ? ` ${acc.accuracyUnit}` : ''}`
                : acc.accuracyKind === 'FORMULA'
                  ? acc.accuracyFormula
                  : acc.accuracyClass
              : null,
          })
        }
        setProfiles(m)
      }
    } catch {
      setCerts(null)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [base, instrumentId, explain])

  useEffect(() => {
    void load()
  }, [load])

  const signedUrl = async (certId: string) => {
    const res = await apiFetch(`${base}/${certId}`)
    if (!res.ok) throw new Error(await explain(res, 'Could not open the certificate'))
    const { url } = await res.json()
    if (!url) throw new Error('That certificate has no file stored against it.')
    return url as string
  }

  const withBusy = async (certId: string, fn: () => Promise<void>) => {
    setBusy(certId)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.')
    } finally {
      setBusy(null)
    }
  }

  const open = (certId: string) =>
    withBusy(certId, async () => {
      window.open(await signedUrl(certId), '_blank', 'noopener')
    })

  const download = (certId: string) =>
    withBusy(certId, async () => {
      const url = await signedUrl(certId)
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      a.click()
    })

  const setActive = (certId: string, isActive: boolean) =>
    withBusy(certId, async () => {
      const res = await apiFetch(`${base}/${certId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      // The API refuses to archive the one in force; it says why, so show that.
      if (!res.ok) throw new Error(await explain(res, isActive ? 'Could not restore it' : 'Could not archive it'))
      await load()
    })

  const editReportNo = (certId: string) => {
    const cert = certs?.find((c) => c.id === certId)
    const next = window.prompt('Certificate number', cert?.reportNo ?? '')
    if (next === null || next === (cert?.reportNo ?? '')) return
    void withBusy(certId, async () => {
      const res = await apiFetch(`${base}/${certId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportNo: next }),
      })
      if (!res.ok) throw new Error(await explain(res, 'Could not update the certificate'))
      await load()
    })
  }

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type === 'application/pdf')
    if (!list.length) {
      setError('Only PDF files can be uploaded as certificates.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      for (const file of list) {
        const form = new FormData()
        form.append('file', file)
        const res = await apiFetch(base, { method: 'POST', body: form })
        if (!res.ok) {
          setError(await explain(res, `Could not upload ${file.name}`))
          break
        }
      }
      await load()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  const active = (certs ?? []).filter((c) => c.isActive)
  const archived = (certs ?? []).filter((c) => !c.isActive)

  const cards = (list: Certificate[], isArchived: boolean) => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {list.map((c) => (
        <CertificateCard
          key={c.id}
          cert={c}
          profile={c.capabilityProfileId ? (profiles.get(c.capabilityProfileId) ?? null) : null}
          formatDate={formatDate}
          onOpen={open}
          onDownload={download}
          onEdit={editReportNo}
          onArchive={(id) => setActive(id, false)}
          onRestore={(id) => setActive(id, true)}
          busy={busy}
          archived={isArchived}
        />
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#dc2626] flex-1">{error}</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-[#dc2626] underline shrink-0">
            Try again
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files.length) void upload(e.dataTransfer.files)
        }}
        className={`rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-[#7c3aed] bg-[#f5f3ff]' : 'border-[#cbd5e1] bg-white'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          multiple
          className="sr-only"
          disabled={uploading}
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files)
            e.target.value = ''
          }}
        />
        {uploading ? (
          <span className="inline-flex items-center gap-2 text-[13px] text-[#64748b]">
            <Loader2 className="size-4 animate-spin" />
            Uploading…
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-[13px] text-[#64748b]">
            <MousePointerClick className="size-4" />
            Drag PDF files here or
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="text-[#7c3aed] hover:text-[#6d28d9] underline"
            >
              Browse Files
            </button>
          </span>
        )}
      </div>

      {certs && (
        <>
          <section>
            <h3 className="text-[13px] font-semibold text-[#0f172a] mb-2">
              ACTIVE CERTIFICATES <span className="font-normal text-[#94a3b8]">(Current Calibration Valid)</span>
            </h3>
            {active.length === 0 ? (
              <p className="text-[13px] text-[#94a3b8]">No certificate is in force for this instrument.</p>
            ) : (
              cards(active, false)
            )}
          </section>

          {archived.length > 0 && (
            <section>
              <h3 className="text-[13px] font-semibold text-[#0f172a] mb-2">
                ARCHIVED CERTIFICATES <span className="font-normal text-[#94a3b8]">(Expired or Superseded)</span>
              </h3>
              {cards(archived, true)}
            </section>
          )}
        </>
      )}
    </div>
  )
}
