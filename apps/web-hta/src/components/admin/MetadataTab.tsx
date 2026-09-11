'use client'

/**
 * Where this instrument's record came from, and how much of it is actually filled in.
 *
 * The completeness figures are counted from the record itself rather than stored, so
 * they cannot drift away from what they describe. The same goes for whether it is a
 * composite: that is "does it have components", not a flag someone has to keep true.
 */

import { useCallback, useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, MinusCircle } from 'lucide-react'
import { apiFetch } from '@/lib/api-client'

interface Props {
  instrumentId: string
  version: number
  createdAt: string | null
  createdByName: string | null
  parameterGroup: string | null
  sopReferences: string[]
  certificateCount: number | null
  formatDate: (iso: string | null) => string
}

interface CapabilitySummary {
  profiles: number
  ranges: number
  fromRegistry: number
  addedHere: number
  rangesMissingLeastCount: number
  rangesMissingAccuracy: number
  components: { role: string; make: string | null; model: string | null; serialNumber: string | null }[]
  assetType: string
}

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const Icon = ok === null ? MinusCircle : ok ? CheckCircle2 : AlertCircle
  const tone = ok === null ? 'text-[#94a3b8]' : ok ? 'text-[#15803d]' : 'text-[#b45309]'
  return (
    <li className="flex items-start gap-2 py-1">
      <Icon className={`size-4 mt-0.5 shrink-0 ${tone}`} />
      <span className="text-[13px] text-[#0f172a]">{label}</span>
      <span className="text-[13px] text-[#64748b] ml-auto text-right">{detail}</span>
    </li>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#e2e8f0] p-5">
      <h3 className="text-[13px] font-semibold text-[#0f172a] mb-3">{title}</h3>
      {children}
    </div>
  )
}

export default function MetadataTab({
  instrumentId,
  version,
  createdAt,
  createdByName,
  parameterGroup,
  sopReferences,
  certificateCount,
  formatDate,
}: Props) {
  const [summary, setSummary] = useState<CapabilitySummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setSummary(null)
        setError(body?.error || `Could not load capability details (error ${res.status}).`)
        return
      }
      const d = await res.json()
      let ranges = 0
      let noLeastCount = 0
      let noAccuracy = 0
      for (const p of d.profiles) {
        const all = [...p.buckets, ...p.subtypes.flatMap((s: { buckets: unknown[] }) => s.buckets)] as {
          leastCountValue: number | null
          accuracyKind: string | null
        }[]
        ranges += all.length
        for (const b of all) {
          if (b.leastCountValue === null) noLeastCount++
          if (b.accuracyKind === null) noAccuracy++
        }
      }
      setSummary({
        profiles: d.profiles.length,
        ranges,
        fromRegistry: d.profiles.filter((p: { source: string }) => p.source === 'registry').length,
        addedHere: d.profiles.filter((p: { source: string }) => p.source !== 'registry').length,
        rangesMissingLeastCount: noLeastCount,
        rangesMissingAccuracy: noAccuracy,
        components: d.components,
        assetType: d.assetType,
      })
    } catch {
      setSummary(null)
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-[#fef2f2] border border-[#fee2e2] rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="size-4 text-[#dc2626] mt-0.5 shrink-0" />
          <p className="text-[13px] text-[#dc2626] flex-1">{error}</p>
          <button type="button" onClick={() => void load()} className="text-[12px] text-[#dc2626] underline shrink-0">
            Try again
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="DATA SOURCE &amp; ORIGIN">
          <dl className="text-[13px] space-y-2">
            <div className="flex justify-between gap-4">
              <dt className="text-[#64748b]">Source</dt>
              <dd className="text-[#0f172a] text-right">
                {summary ? (
                  summary.addedHere === 0 ? (
                    'Master Registry JSON'
                  ) : summary.fromRegistry === 0 ? (
                    'Typed in here'
                  ) : (
                    `${summary.fromRegistry} from the registry, ${summary.addedHere} added here`
                  )
                ) : (
                  '—'
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#64748b]">Asset Type</dt>
              <dd className="text-[#0f172a]">
                {summary?.assetType === 'composite' ? 'Composite' : 'Simple'}
                {summary?.assetType === 'composite' && (
                  <span className="text-[#94a3b8]"> · {summary.components.length} parts</span>
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#64748b]">Parameter Group</dt>
              <dd className="text-[#0f172a]">{parameterGroup || '—'}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#64748b]">Version</dt>
              <dd className="text-[#0f172a]">{version}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[#64748b]">Last Updated</dt>
              <dd className="text-[#0f172a] text-right">
                {formatDate(createdAt)}
                {createdByName && <span className="text-[#64748b]"> by {createdByName}</span>}
              </dd>
            </div>
          </dl>

          {summary && summary.components.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#f1f5f9]">
              <p className="text-[11px] text-[#94a3b8] mb-1.5">Components</p>
              <ul className="text-[12px] text-[#0f172a] space-y-1">
                {summary.components.map((c, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[#64748b] w-16 shrink-0">
                      {c.role === 'INDICATOR' ? 'Indicator' : 'Sensor'}
                    </span>
                    <span className="truncate">
                      {[c.make, c.model].filter(Boolean).join(' ')}
                      {c.serialNumber && <span className="text-[#64748b]"> · {c.serialNumber}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Panel>

        <Panel title="LIFECYCLE &amp; TRACKING">
          <p className="text-[11px] font-semibold text-[#64748b] mb-1">Data Completeness:</p>
          <ul className="divide-y divide-[#f1f5f9]">
            <Row
              ok={summary ? summary.profiles > 0 : null}
              label="Capabilities"
              detail={summary ? `${summary.profiles} recorded` : '—'}
            />
            <Row
              ok={summary ? summary.ranges > 0 : null}
              label="Ranges"
              detail={summary ? `${summary.ranges} recorded` : '—'}
            />
            <Row
              ok={summary ? summary.rangesMissingLeastCount === 0 : null}
              label="Least counts"
              detail={
                summary
                  ? summary.rangesMissingLeastCount === 0
                    ? 'all declared'
                    : `${summary.rangesMissingLeastCount} not declared`
                  : '—'
              }
            />
            <Row
              ok={summary ? summary.rangesMissingAccuracy === 0 : null}
              label="Accuracies"
              detail={
                summary
                  ? summary.rangesMissingAccuracy === 0
                    ? 'all declared'
                    : `${summary.rangesMissingAccuracy} not declared`
                  : '—'
              }
            />
            <Row
              ok={certificateCount === null ? null : certificateCount > 0}
              label="Certificates"
              detail={certificateCount === null ? '—' : `${certificateCount} on file`}
            />
            <Row
              ok={sopReferences.length > 0}
              label="Procedures"
              detail={`${sopReferences.length} linked`}
            />
          </ul>
          {/* Not declared is a fact about the source certificate, not a mistake to fix,
              so these read as amber rather than red. */}
          <p className="text-[11px] text-[#94a3b8] mt-3">
            &ldquo;Not declared&rdquo; means the calibration certificate did not state one. It is not the same as zero.
          </p>
        </Panel>
      </div>

      <Panel title="SOP REFERENCES &amp; MAPPING">
        {sopReferences.length === 0 ? (
          <p className="text-[13px] text-[#94a3b8]">No procedures linked to this instrument.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {sopReferences.map((s) => (
                <span key={s} className="text-[12px] px-2 py-1 rounded-md bg-[#f1f5f9] text-[#0f172a]">
                  {s}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-[#94a3b8] mt-3">
              Every procedure an instrument holds is offered against every one of its capabilities. Narrow them per
              capability in the Capabilities tab, where a procedure belongs to a parameter rather than to the box.
            </p>
          </>
        )}
      </Panel>
    </div>
  )
}
