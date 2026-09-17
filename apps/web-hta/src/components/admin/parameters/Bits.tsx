'use client'

/**
 * The small pieces the register is built from.
 *
 * A chip box and a text field that suggests without gating - both appear three
 * or four times across the editor and the create form, and both have one detail
 * that is easy to get wrong in a re-implementation. The chip box commits on
 * enter and refuses a duplicate silently rather than scolding; the field offers
 * what is already in use but takes anything, because a lab that starts
 * calibrating something new should not wait for a row to be added first.
 */

import { useId } from 'react'

export const Icon = {
  left: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  ),
  caret: (
    <svg className="caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" />
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  ),
  warn: (
    <svg className="w" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M12 9v5" />
      <path d="M12 17.5v.01" />
      <path d="M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    </svg>
  ),
  tick: (
    <svg className="w" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  lock: (
    <svg className="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  ),
}

/** A field that offers what is already in use and accepts anything else. */
export function Suggest({
  id,
  label,
  value,
  options,
  placeholder,
  disabled,
  hint,
  badge,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: string[]
  placeholder?: string
  disabled?: boolean
  hint?: React.ReactNode
  badge?: React.ReactNode
  onChange: (v: string) => void
}) {
  const listId = useId()
  return (
    <div className="f">
      <span className="k">
        {label}
        {badge}
      </span>
      <input
        id={id}
        type="text"
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
      {hint ? <span className="hint">{hint}</span> : null}
    </div>
  )
}

/**
 * A list of short values, added one at a time.
 *
 * `onRemove` returning false is how a caller refuses: the unit is measured in,
 * so it cannot come off. The box stays as it was and the caller shows why -
 * which is better than a disabled × nobody can explain.
 */
export function Chips({
  id,
  values,
  placeholder,
  highlight,
  lockedWhen,
  onAdd,
  onRemove,
}: {
  id: string
  values: string[]
  placeholder: string
  /** The one a form fills in first, marked so it reads as chosen. */
  highlight?: string | null
  /** Something is recorded in it, so it wears a lock. */
  lockedWhen?: (v: string) => boolean
  onAdd: (v: string) => void
  onRemove: (v: string) => void
}) {
  return (
    <div className="ubox">
      {values.map((v) => (
        <span key={v} className={'uchip' + (v === highlight ? ' def' : '')}>
          {lockedWhen?.(v) ? Icon.lock : null}
          {v}
          <button type="button" className="x" aria-label={`Remove ${v}`} onClick={() => onRemove(v)}>
            ×
          </button>
        </span>
      ))}
      <input
        id={id}
        className="uadd"
        type="text"
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          const target = e.currentTarget
          const v = target.value.trim()
          // A repeat is not an error worth a message; it is already there.
          if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) {
            target.value = ''
            return
          }
          onAdd(v)
          target.value = ''
        }}
      />
    </div>
  )
}

/** On or off, with the consequence beside it rather than in a tooltip. */
export function Switch({
  on,
  label,
  yes,
  no,
  onToggle,
}: {
  on: boolean
  label: string
  yes: string
  no: string
  onToggle: () => void
}) {
  return (
    <div className="sw">
      <button
        type="button"
        className={'track' + (on ? ' on' : '')}
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={onToggle}
      >
        <span className="knob" />
      </button>
      <span className="swtext">
        <b>{on ? 'Yes' : 'No'}</b>
        <span>{on ? yes : no}</span>
      </span>
    </div>
  )
}
