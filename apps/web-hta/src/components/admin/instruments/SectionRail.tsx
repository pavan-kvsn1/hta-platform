'use client'

/**
 * The sections, as one band across the page.
 *
 * They were tabs under the banner, which meant the only thing you could see
 * about a section you were not on was its name. Each one now carries its own
 * state and its own count, so what needs attention is visible without opening
 * anything: an amber triangle on Training means somebody's sign-off has lapsed.
 *
 * The sections share the width evenly so the bar reads as one band rather than
 * a cluster of buttons with dead space after it.
 */

import { RAIL_ICON, type SectionState } from './Icons'

export interface Section {
  id: string
  label: string
  state: SectionState
  /** Omitted when there is nothing to count, so the tab shows no badge at all. */
  count?: number | null
}

export default function SectionRail({
  sections,
  active,
  onGo,
  complete,
}: {
  sections: Section[]
  active: string
  onGo: (id: string) => void
  /** How much of the record is filled in, as [done, total]. */
  complete?: [number, number]
}) {
  return (
    <nav className="card secbar" aria-label="Sections">
      {sections.map((s) => {
        const I = RAIL_ICON[s.state]
        return (
          <button
            key={s.id}
            type="button"
            className="nav"
            aria-current={active === s.id}
            onClick={() => onGo(s.id)}
          >
            <span className="ico">
              <I />
            </span>
            <span className="txt">{s.label}</span>
            {s.count ? <span className="cnt">{s.count}</span> : null}
          </button>
        )
      })}

      {complete && (
        <div className="meter">
          <span className="t">
            Complete{' '}
            <b>
              {complete[0]}/{complete[1]}
            </b>
          </span>
          <span className="bar">
            <i style={{ width: `${Math.round((complete[0] / complete[1]) * 100)}%` }} />
          </span>
        </div>
      )}
    </nav>
  )
}
