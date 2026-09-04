'use client'

// A dropdown you can type into.
//
// A plain select is fine for a handful of options. This lab's master list has 209
// instruments across 96 descriptions and dozens of makes, and finding one by scrolling
// is the slowest part of building a certificate. Typing narrows it.
//
// Three things the first version got wrong, all visible at a glance:
//
//  - the panel sized itself to its content rather than to the field, because Tailwind 4
//    dropped the bare `w-[--css-var]` shorthand and the class was silently doing
//    nothing. It now matches the field edge for edge.
//  - "Any description" sat in the list and could be filtered out of it. A reset is not
//    a search result; it is pinned above them.
//  - every row was reachable only by mouse. Arrow keys move, Enter chooses, Escape
//    closes.
//
// The search is a case-insensitive substring match on what the engineer sees, and the
// matched run is emphasised so it is clear why a row is in the list. Deliberately not
// fuzzy: an asset number typed in full should land on that asset and nothing else.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  /** Shown under the label, and searched along with it. */
  detail?: string
  /** Kept above the results and never filtered out - "Any make", and the like. */
  pinned?: boolean
}

interface SearchableSelectProps {
  value: string
  options: SearchableOption[]
  onChange: (value: string) => void
  placeholder?: string
  /** Tied to the visible label, so the field can be addressed by name. */
  id?: string
  disabled?: boolean
  className?: string
  emptyMessage?: string
}

/** The matched run, emphasised, so it is clear why a row is in the list. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="bg-transparent font-bold text-slate-900">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  )
}

export function SearchableSelect({
  value,
  options,
  onChange,
  placeholder = 'Select...',
  id,
  disabled,
  className,
  emptyMessage = 'Nothing matches that.',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const pinned = useMemo(() => options.filter((o) => o.pinned), [options])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rest = options.filter((o) => !o.pinned)
    if (!q) return rest
    return rest.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

  // One flat list for the keyboard: the reset is as reachable as any result.
  const navigable = useMemo(() => [...pinned, ...matches], [pinned, matches])

  useEffect(() => {
    setActive(0)
  }, [query, open])

  useEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)
    // Optional: not every environment the component renders in implements it, and
    // keeping the active row visible is a convenience, not a requirement.
    row?.scrollIntoView?.({ block: 'nearest' })
  }, [active, open])

  const choose = (option?: SearchableOption) => {
    if (!option) return
    onChange(option.value)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(i + 1, navigable.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(navigable.length - 1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      choose(navigable[active])
    }
  }

  const Row = ({ option, index }: { option: SearchableOption; index: number }) => (
    <button
      key={option.value}
      type="button"
      data-index={index}
      role="option"
      aria-selected={option.value === value}
      onMouseEnter={() => setActive(index)}
      onClick={() => choose(option)}
      className={cn(
        // A fixed tick gutter, so every label starts on the same column whether or not
        // its row is the chosen one.
        'w-full grid grid-cols-[1.5rem_1fr] items-start gap-x-1 px-3 py-2 text-left',
        index === active && 'bg-slate-50',
      )}
    >
      <Check
        className={cn(
          'size-4 mt-0.5 text-primary justify-self-start',
          option.value === value ? 'opacity-100' : 'opacity-0',
        )}
      />
      <span className="min-w-0">
        <span
          className={cn(
            'block text-sm truncate',
            option.value === value ? 'font-semibold text-slate-900' : 'text-slate-800',
          )}
        >
          <Highlight text={option.label} query={query.trim()} />
        </span>
        {option.detail && (
          <span className="block text-xs text-slate-500 truncate">
            <Highlight text={option.detail} query={query.trim()} />
          </span>
        )}
      </span>
    </button>
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            'w-full rounded-xl border border-slate-300 h-12 px-4 bg-white font-medium text-sm',
            'flex items-center justify-between gap-2 text-left disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-slate-400')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        // Edge for edge with the field. The bare `w-[--var]` shorthand this used to
        // carry is not valid in Tailwind 4, so the panel sized itself to its content.
        className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchRef.current?.focus()
        }}
      >
        <div className="flex items-center gap-2 border-b border-slate-200 px-3">
          <Search className="size-4 text-slate-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type to narrow the list"
            aria-label="Search"
            className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div ref={listRef} role="listbox" className="max-h-72 overflow-y-auto">
          {pinned.length > 0 && (
            <div className="border-b border-slate-100 py-1">
              {pinned.map((option, i) => (
                <Row key={option.value} option={option} index={i} />
              ))}
            </div>
          )}

          {matches.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>
          ) : (
            <div className="py-1">
              {matches.map((option, i) => (
                <Row key={option.value} option={option} index={pinned.length + i} />
              ))}
            </div>
          )}
        </div>

        <p className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500">
          {query.trim()
            ? `${matches.length} of ${options.length - pinned.length} shown`
            : `${matches.length} to choose from`}
          <span className="text-slate-400"> &middot; &uarr;&darr; to move &middot; &crarr; to choose</span>
        </p>
      </PopoverContent>
    </Popover>
  )
}
