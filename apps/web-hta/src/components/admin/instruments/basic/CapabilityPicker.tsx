'use client'

/**
 * A component's capabilities are a set, so the control is a set.
 *
 * The row reads "Thermocouple +2". A single dropdown sitting on the first of
 * the three would drop the other two on save, which is exactly what it used to
 * do. Ticked ones sort to the top so the menu opens on the selection rather
 * than on the alphabet, and the search is inside the menu because forty-seven
 * parameters do not fit on a screen.
 *
 * A tick only ticks. The unit, range and accuracy a capability still needs are
 * asked for on save, by the capability form, which is the only place that can.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from '../Icons'

export default function CapabilityPicker({
  parameters,
  selected,
  declared,
  onToggle,
  onDrop,
}: {
  parameters: string[]
  /** What the component will carry once this row is saved. */
  selected: string[]
  /** What it carries now, so the difference can be marked. */
  declared: string[]
  onToggle: (parameter: string) => void
  onDrop: (parameter: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const pending = (x: string) => selected.includes(x) && !declared.includes(x)

  // Ticked first, then what starts with the query, then the rest.
  const rows = (() => {
    const q = query.trim().toLowerCase()
    const hit = q ? parameters.filter((x) => x.toLowerCase().includes(q)) : parameters
    const on = hit.filter((x) => selected.includes(x))
    const off = hit.filter((x) => !selected.includes(x))
    if (!q) return [...on, ...off]
    return [
      ...on,
      ...off.filter((x) => x.toLowerCase().startsWith(q)),
      ...off.filter((x) => !x.toLowerCase().startsWith(q)),
    ]
  })()

  useEffect(() => {
    if (open && search.current) search.current.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [open])

  useEffect(() => {
    const el = list.current?.querySelector('.caprow.active')
    el?.scrollIntoView?.({ block: 'nearest' })
  }, [active, query])

  const toggle = (x: string) => {
    onToggle(x)
    setQuery('')
    setActive(0)
  }

  const boxKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen((o) => !o)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }
  const menuKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (rows[active]) toggle(rows[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      setQuery('')
    }
  }

  const mark = (x: string) => {
    const q = query.trim()
    if (!q) return x
    const i = x.toLowerCase().indexOf(q.toLowerCase())
    if (i < 0) return x
    return (
      <>
        {x.slice(0, i)}
        <b>{x.slice(i, i + q.length)}</b>
        {x.slice(i + q.length)}
      </>
    )
  }

  return (
    <div className="f caps">
      <span className="k">
        Capabilities <span className="kn">{selected.length}</span>
      </span>
      <div className={'combo' + (open ? ' open' : '')} ref={box}>
        {/* A div, not a button: each chip carries a button, and a button may not
            contain a button - the parser hoists every chip after the first one
            clean out of the control. */}
        <div
          className="capsbox"
          role="combobox"
          tabIndex={0}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Capabilities"
          onClick={() => setOpen((o) => !o)}
          onKeyDown={boxKeys}
        >
          <span className="capchips">
            {selected.length ? (
              selected.map((x) => (
                <span
                  key={x}
                  className={'capchip' + (pending(x) ? ' pending' : '')}
                  title={pending(x) ? `${x} still needs a unit and a range` : x}
                >
                  {x}
                  <button
                    type="button"
                    className="x"
                    aria-label={`Take ${x} off`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onDrop(x)
                    }}
                  >
                    &times;
                  </button>
                </span>
              ))
            ) : (
              <span className="capnone">none yet</span>
            )}
          </span>
          <span className="caret">
            <Icon.down />
          </span>
        </div>

        {open && (
          <div className="menu capmenu" role="listbox">
            <div className="capsearch">
              <input
                ref={search}
                autoComplete="off"
                placeholder={`Search ${parameters.length} parameters`}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setActive(0)
                }}
                onKeyDown={menuKeys}
              />
            </div>
            <div className="scroll caplist" ref={list}>
              {rows.length ? (
                rows.map((x, i) => (
                  <label
                    key={x}
                    role="option"
                    aria-selected={selected.includes(x)}
                    className={
                      'caprow' + (i === active ? ' active' : '') + (selected.includes(x) ? ' on' : '')
                    }
                    onMouseEnter={() => setActive(i)}
                  >
                    <input type="checkbox" checked={selected.includes(x)} onChange={() => toggle(x)} />
                    <span className="cn">{mark(x)}</span>
                    {pending(x) ? <span className="cneed">needs a range</span> : null}
                  </label>
                ))
              ) : (
                <p className="nohit">Nothing matches “{query}”.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
