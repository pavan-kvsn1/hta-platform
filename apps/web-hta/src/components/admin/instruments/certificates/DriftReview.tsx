'use client'

/**
 * The capability was edited after the certificate was read.
 *
 * That means one of two things: the edit corrected a mistake in transcription,
 * or the instrument has moved and needs recalibrating. Only a person can say
 * which, so both readings go side by side rather than the app guessing.
 *
 * What the certificate was read as is not stored anywhere, so the left column
 * is honest about that: it shows what the capability holds now and says the
 * certificate predates the edit. Storing a snapshot at upload time would let
 * this show a true before-and-after, and is the next thing worth doing here.
 */

import { Icon } from '../Icons'
import AccuracyCell from '../capabilities/AccuracyCell'
import { rowsOf, type Profile } from '../capabilities/CapabilitiesTab'

export default function DriftReview({
  certificateNumber,
  uploadedAt,
  editedAt,
  profile,
  busy,
  onBack,
  onAccept,
  onUpload,
}: {
  certificateNumber: string
  uploadedAt: string
  editedAt: string
  profile: Profile
  busy: boolean
  onBack: () => void
  onAccept: () => void
  onUpload: () => void
}) {
  const rows = rowsOf(profile)

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
            The certificate <span className="dim">uploaded {uploadedAt}</span>
          </p>
          <p className="subempty">
            What was transcribed from it is not kept, so there is nothing to compare against. The
            certificate is older than the edit beside it.
          </p>
        </div>
        <div>
          <p className="revh">
            As the capability now stands <span className="dim">edited {editedAt}</span>
          </p>
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
                  <tr key={b.id}>
                    <td className="n">{i + 1}</td>
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
        </div>
      </div>

      <div className="uplfoot">
        <span className="dim">
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
