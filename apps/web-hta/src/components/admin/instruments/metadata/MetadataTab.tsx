'use client'

/**
 * Where the record came from, and what it is still missing.
 *
 * The completeness figures are counted from the data rather than written down,
 * so the panel cannot claim a section is done after something was taken off it.
 *
 * "Not declared" is said out loud because it is not the same as zero: it means
 * the calibration certificate did not state one.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { Icon } from '../Icons'
import { rowsOf, type Component, type Profile } from '../capabilities/CapabilitiesTab'

function Check({ good, title, detail }: { good: boolean; title: string; detail: string }) {
  return (
    <div className="chk">
      {good ? <Icon.ok /> : <Icon.warn />}
      <span className="t">{title}</span>
      <span className="d">{detail}</span>
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
  activeCertificates,
  trainingCount,
  formatDate,
  onOpenTraining,
}: {
  instrumentId: string
  version: number
  createdAt: string
  createdByName: string | null
  parameterGroup: string | null
  sopReferences: string[]
  certificateCount: number | null
  activeCertificates: number | null
  trainingCount: number | null
  formatDate: (iso: string | null) => string
  onOpenTraining: () => void
}) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [components, setComponents] = useState<Component[]>([])
  const [assetType, setAssetType] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/admin/instruments/${instrumentId}/capabilities`)
      if (!res.ok) return
      const d = await res.json()
      setProfiles(d.profiles ?? [])
      setComponents(d.components ?? [])
      setAssetType(d.assetType ?? null)
    } catch {
      /* the panel simply shows nothing counted rather than a wrong count */
    }
  }, [instrumentId])

  useEffect(() => {
    void load()
  }, [load])

  const rows = profiles.reduce((n, p) => n + rowsOf(p).length, 0)
  const noLeastCount = profiles.reduce(
    (n, p) => n + rowsOf(p).filter((b) => b.leastCountValue === null).length,
    0,
  )

  return (
    <>
      <div className="grid2" style={{ gap: 14 }}>
        <div className="card sec">
          <span className="lbl">Data Source &amp; Origin</span>
          <dl className="kv">
            <dt>Source</dt>
            <dd>Master Registry</dd>
            <dt>Asset Type</dt>
            <dd>
              {assetType ? (
                <>
                  {assetType} <span style={{ color: 'var(--faint)' }}>· derived</span>
                </>
              ) : (
                <span className="undecl">not counted</span>
              )}
            </dd>
            <dt>Parameter Group</dt>
            <dd>{parameterGroup || <span className="undecl">—</span>}</dd>
            <dt>Version</dt>
            <dd className="mono">{version}</dd>
            <dt>Last Updated</dt>
            <dd>
              <span className="mono">{formatDate(createdAt)}</span>
              {createdByName && <span style={{ color: 'var(--muted)' }}> by {createdByName}</span>}
            </dd>
          </dl>
        </div>

        <div className="card sec">
          <span className="lbl">Completeness</span>
          <div className="checks">
            <Check
              good={components.length > 0}
              title="Components"
              detail={components.length ? `${components.length} on file` : 'none recorded'}
            />
            <Check
              good={profiles.length > 0}
              title="Capabilities"
              detail={`${profiles.length} profile${profiles.length === 1 ? '' : 's'} · ${rows} range${rows === 1 ? '' : 's'}`}
            />
            <Check
              good={noLeastCount === 0}
              title="Least Counts"
              detail={noLeastCount ? `${noLeastCount} not declared` : 'all declared'}
            />
            <Check
              good={(activeCertificates ?? 0) > 0}
              title="Certificates"
              detail={
                certificateCount === null
                  ? 'not counted'
                  : `${certificateCount} on file · ${activeCertificates ?? 0} in force`
              }
            />
            <Check
              good={sopReferences.length > 0}
              title="Procedures"
              detail={sopReferences.length ? `${sopReferences.length} linked` : 'none linked'}
            />
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 11, margin: '11px 0 0' }}>
            “Not declared” means the calibration certificate did not state one. It is not the same as zero.
          </p>
        </div>
      </div>

      <div className="card sec">
        <span className="lbl">SOP References &amp; Mapping</span>
        <div className="chips" style={{ marginTop: 11 }}>
          {sopReferences.length ? (
            sopReferences.map((s) => (
              <span className="chip" key={s}>
                <span className="mono">{s}</span>
              </span>
            ))
          ) : (
            <span className="undecl">No procedure is linked to this instrument.</span>
          )}
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 11, margin: '11px 0 0' }}>
          Every procedure here is offered against every capability. Narrow them per parameter in
          Capabilities — a procedure belongs to a parameter, not to a box.
        </p>
      </div>

      <div className="card sec">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          <span className="lbl">Training</span>
          <button type="button" className="link" onClick={onOpenTraining}>
            Open the Training section <Icon.right />
          </button>
        </div>
        <p className="metanote">
          {trainingCount === null ? (
            <span className="undecl">not counted</span>
          ) : (
            `${trainingCount} signed off`
          )}
        </p>
      </div>
    </>
  )
}
