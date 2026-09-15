'use client'

/**
 * Picking several of something.
 *
 * The same control the component row uses for capabilities, with the options
 * given as {value, label, detail} rather than bare strings, so it can pick
 * capabilities on one screen and certificates on another.
 *
 * Chosen items show as chips, each removable. Opening it puts what is already
 * chosen at the top, because a list that opens on the alphabet makes you hunt
 * for what you have. Search lives inside the menu: a dozen capabilities fit on
 * a screen, but the search costs nothing and a busy instrument has more.
 */

import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icons'

export interface PickOption {
  value: string
  label: string
  detail?: string
}

export default function MultiPicker({
  id,
  label,
  options,
  selected,
  onChange,
  placeholder = 'none yet',
  emptyMessage = 'Nothing matches that.',
  noneMessage,
}: {
  id?: string
  label: string
  options: PickOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  emptyMessage?: string
  /** Shown instead of the menu when there is nothing at all to pick. */
  noneMessage?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const q = query.trim().toLowerCase()
  const hit = q
    ? options.filter((o) => o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q))
    : options
  const rows = [...hit.filter((o) => selected.includes(o.value)), ...hit.filter((o) => !selected.includes(o.value))]

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
    list.current?.querySelector('.caprow.active')?.scrollIntoView?.({ block: 'nearest' })
  }, [active, query])

  const toggle = (v: string) => {
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
    // The menu stays open and the search clears, so the next one can be picked
    // straight away. Closing after each tick would make choosing three a chore.
    setQuery('')
    setActive(0)
    search.current?.focus()
  }

  const boxKeys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen((o) => !o)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      setOpen(false)
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
      if (rows[active]) toggle(rows[active].value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
    }
  }

  const mark = (text: string) => {
    if (!q) return text
    const i = text.toLowerCase().indexOf(q)
    if (i < 0) return text
    return (
      <>
        {text.slice(0, i)}
        <b>{text.slice(i, i + query.trim().length)}</b>
        {text.slice(i + query.trim().length)}
      </>
    )
  }

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v

  return (
    <div className="pf caps">
      <span className="k">
        {label}
        {/* A count of nothing is noise; the placeholder already says none. */}
        {selected.length > 0 ? <span className="kn">{selected.length}</span> : null}
        {selected.length > 1 ? (
          <button type="button" className="link knclear" onClick={() => onChange([])}>
            clear
          </button>
        ) : null}
      </span>

      {options.length === 0 && noneMessage ? (
        <p className="hint" style={{ margin: 0 }}>
          {noneMessage}
        </p>
      ) : (
        <div className={'combo' + (open ? ' open' : '')} ref={box}>
          {/* A div, not a button: each chip carries a button, and a button may not
              contain a button - the parser hoists the chips clean out of it. */}
          <div
            id={id}
            className="capsbox"
            role="combobox"
            tabIndex={0}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label={label}
            onClick={() => setOpen((o) => !o)}
            onKeyDown={boxKeys}
          >
            <span className="capchips">
              {selected.length ? (
                selected.map((v) => (
                  <span className="capchip" key={v} title={labelOf(v)}>
                    {labelOf(v)}
                    <button
                      type="button"
                      className="x"
                      aria-label={`Take ${labelOf(v)} off`}
                      onClick={(e) => {
                        e.stopPropagation()
                        onChange(selected.filter((x) => x !== v))
                      }}
                    >
                      &times;
                    </button>
                  </span>
                ))
              ) : (
                <span className="capnone">{placeholder}</span>
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
                  placeholder="Search"
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
                  rows.map((o, i) => (
                    <label
                      key={o.value}
                      role="option"
                      aria-selected={selected.includes(o.value)}
                      className={
                        'caprow' + (i === active ? ' active' : '') + (selected.includes(o.value) ? ' on' : '')
                      }
                      onMouseEnter={() => setActive(i)}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(o.value)}
                        onChange={() => toggle(o.value)}
                      />
                      <span className="cn">
                        <span className="sslabel">{mark(o.label)}</span>
                        {o.detail ? <span className="ssdetail">{mark(o.detail)}</span> : null}
                      </span>
                      {selected.includes(o.value) ? <span className="cneed on">chosen</span> : null}
                    </label>
                  ))
                ) : (
                  <p className="nohit">{emptyMessage}</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
