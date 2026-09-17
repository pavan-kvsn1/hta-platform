'use client'

/**
 * The capability was edited after the certificate was read.
 *
 * That means one of two things: the edit corrected a mistake in transcription,
 * or the instrument has moved and needs recalibrating. Only a person can say
 * which, so both readings go side by side rather than the app guessing.
 *
 * The left column is the snapshot taken when the certificate was uploaded - the
 * capability verbatim, as of that moment, written once and never updated. The
 * right is the capability as it now stands. Rows that differ are marked on both
 * sides, so the question stops being "has something changed" and becomes "is
 * this a change someone meant".
 *
 * Certificates uploaded before the snapshot column existed have no left column
 * to show. That is said plainly rather than filled in with the current figures,
 * which would make a certificate look like it agreed with an edit it predates.
 */

import { Icon } from '../Icons'
import AccuracyCell, { accuracyText } from '../capabilities/AccuracyCell'
import { rowsOf, type Bucket, type Profile } from '../capabilities/CapabilitiesTab'

/** One capability as it was kept against the certificate: raw rows, Decimals as strings. */
export interface SnapshotProfile {
  id: string
  profileKey?: string
  parameter?: string
  role?: string
  unit?: string | null
  subtypes?: { subtypeKey: string; buckets: Record<string, unknown>[] }[]
  buckets?: Record<string, unknown>[]
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v))

/** A stored row, in the shape the table and AccuracyCell already read. */
function bucketFrom(raw: Record<string, unknown>, i: number): Bucket {
  return {
    id: String(raw.id ?? `snap-${i}`),
    bucketKey: String(raw.bucketKey ?? `B${i + 1}`),
    min: num(raw.minValue),
    max: num(raw.maxValue),
    minInclusive: raw.minInclusive !== false,
    maxInclusive: raw.maxInclusive !== false,
    leastCountValue: num(raw.leastCountValue),
    leastCountUnit: (raw.leastCountUnit as string | null) ?? null,
    accuracyKind: (raw.accuracyKind as string | null) ?? null,
    accuracyValue: num(raw.accuracyValue),
    accuracyUnit: (raw.accuracyUnit as string | null) ?? null,
    accuracyPolarity: (raw.accuracyPolarity as string | null) ?? null,
    accuracyFormula: (raw.accuracyFormula as string | null) ?? null,
    accuracyClass: (raw.accuracyClass as string | null) ?? null,
    accuracyUpper: num(raw.accuracyUpper),
    accuracyLower: num(raw.accuracyLower),
  }
}

/** Every bucket the snapshot holds, in the same order rowsOf walks a live one. */
export function snapshotRows(s: SnapshotProfile | null): Bucket[] | null {
  if (!s) return null
  const raws = s.subtypes?.length ? s.subtypes.flatMap((t) => t.buckets ?? []) : (s.buckets ?? [])
  return raws.map(bucketFrom)
}

/** What a row says, flattened, so two of them can be compared as one value. */
const signature = (b: Bucket) =>
  [
    b.min ?? '',
    b.max ?? '',
    b.minInclusive ? 'i' : 'x',
    b.leastCountValue ?? '',
    b.leastCountUnit ?? '',
    accuracyText(b),
  ].join('|')

function RangeTable({ rows, diff }: { rows: Bucket[]; diff: Set<number> }) {
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 30 }}>#</th>
            <th style={{ textAlign: 'right' }}>From</th>
            <th style={{ textAlign: 'right' }}>To</th>
            <th>Least Count</th>
            <th>Accuracy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b, i) => (
            <tr key={b.id} className={diff.has(i) ? 'rowdiff' : undefined}>
              <td className="n">
                {diff.has(i) ? <span className="diffdot">●</span> : null}
                {i + 1}
              </td>
              <td className="num rt">
                {!b.minInclusive ? <span className="excl">▸</span> : null}
                {b.min ?? '—'}
              </td>
              <td className="num rt">{b.max ?? '—'}</td>
              <td className="num">
                {b.leastCountValue !== null ? (
                  `${b.leastCountValue}${b.leastCountUnit ? ` ${b.leastCountUnit}` : ''}`
                ) : (
                  <span className="undecl">not declared</span>
                )}
              </td>
              <td>
                <AccuracyCell bucket={b} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="paneempty" style={{ padding: '14px' }}>
                No ranges are declared on this capability.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

export default function DriftReview({
  certificateNumber,
  uploadedAt,
  editedAt,
  profile,
  snapshot,
  busy,
  onBack,
  onAccept,
  onUpload,
}: {
  certificateNumber: string
  uploadedAt: string
  editedAt: string
  profile: Profile
  /** Null for a certificate uploaded before the snapshot was kept. */
  snapshot: SnapshotProfile | null
  busy: boolean
  onBack: () => void
  onAccept: () => void
  onUpload: () => void
}) {
  const rows = rowsOf(profile)
  const was = snapshotRows(snapshot)

  // Compared by position, which is how the ranges are ordered on both sides. A
  // row added or removed shifts everything below it and every one of those rows
  // is then marked - which is the honest reading: the range a figure belongs to
  // has moved, so the figure means something different.
  const diffLeft = new Set<number>()
  const diffRight = new Set<number>()
  if (was) {
    const n = Math.max(was.length, rows.length)
    for (let i = 0; i < n; i++) {
      const a = was[i]
      const b = rows[i]
      if (!a || !b || signature(a) !== signature(b)) {
        if (a) diffLeft.add(i)
        if (b) diffRight.add(i)
      }
    }
  }
  const changed = Math.max(diffLeft.size, diffRight.size)

  return (
    <div className="card rev">
      <div className="uplhead">
        <button type="button" className="link" onClick={onBack}>
          <Icon.left /> Back to Certificates
        </button>
        <span className="revtitle">
          <b className="mono">{certificateNumber}</b> · {profile.profileKey} {profile.parameter} (
          {profile.role.toLowerCase()})
        </span>
      </div>

      <p className="uplwarn wide">
        ⚠ This capability was edited after the certificate was uploaded. Either the edit corrected a
        mistake in transcription, or the instrument has changed and needs recalibrating.
      </p>

      <div className="revgrid">
        <div>
          <p className="revh">
            As the certificate was read <span className="dim">uploaded {uploadedAt}</span>
          </p>
          {was ? (
            <RangeTable rows={was} diff={diffLeft} />
          ) : (
            <p className="subempty">
              What was transcribed from it is not kept - this certificate was uploaded before the
              capability was snapshotted against it - so there is nothing to compare. The certificate
              is older than the edit beside it.
            </p>
          )}
        </div>
        <div>
          <p className="revh">
            As the capability now stands <span className="dim">edited {editedAt}</span>
          </p>
          <RangeTable rows={rows} diff={diffRight} />
        </div>
      </div>

      <div className="uplfoot">
        <span className="dim">
          {was
            ? changed
              ? `${changed === 1 ? 'One range differs' : `${changed} ranges differ`}. `
              : 'No range differs; only the record around them changed. '
            : ''}
          Settling this records the decision; it does not change the capability or the certificate.
        </span>
        <span className="sp">
          <button type="button" className="btn ghost" onClick={onAccept} disabled={busy}>
            The capability is right
          </button>
          <button type="button" className="btn primary" onClick={onUpload} disabled={busy}>
            Upload a new certificate
          </button>
        </span>
      </div>
    </div>
  )
}
