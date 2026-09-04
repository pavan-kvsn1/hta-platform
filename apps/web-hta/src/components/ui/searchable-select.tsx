'use client'

// A dropdown that is also the search box.
//
// This lab's master list has 209 instruments across 96 descriptions and dozens of
// makes, and finding one by scrolling is the slowest part of building a certificate.
// So the field itself takes the typing: click it and the list opens, type and it
// narrows, and there is no second search box inside the panel to notice and move to.
//
// Closed, the field reads as a value - the chosen description, in full. Focused, it
// becomes what you type; leaving without choosing puts the value back, so a half-typed
// search never looks like a selection that was made.
//
// The search is a case-insensitive substring match on what the engineer sees, and the
// matched run is emphasised so it is clear why a row is in the list. Deliberately not
// fuzzy: an asset number typed in full should land on that asset and nothing else.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, X } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
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
  /** Put on the input, so a <Label htmlFor> names the field. */
  id?: string
  disabled?: boolean
  className?: string
  emptyMessage?: string
}

/** The matched run, emphasised, so a row explains why it is in the list. */
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
  /** What has been typed since the field was opened. Null while it reads as a value. */
  const [query, setQuery] = useState<string | null>(null)
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)
  const pinned = useMemo(() => options.filter((o) => o.pinned), [options])

  const matches = useMemo(() => {
    const q = (query ?? '').trim().toLowerCase()
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

  const close = () => {
    setOpen(false)
    setQuery(null)
  }

  const choose = (option?: SearchableOption) => {
    if (!option) return
    onChange(option.value)
    close()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' && !open) {
      setOpen(true)
      return
    }
    if (!open) return
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
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    }
  }

  const Row = ({ option, index }: { option: SearchableOption; index: number }) => (
    <button
      type="button"
      data-index={index}
      role="option"
      aria-selected={option.value === value}
      onMouseEnter={() => setActive(index)}
      // The field keeps the caret, so the panel never steals focus mid-search.
      onMouseDown={(e) => e.preventDefault()}
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
            'block text-xs truncate',
            option.value === value ? 'font-semibold text-slate-900' : 'text-slate-800',
          )}
        >
          <Highlight text={option.label} query={(query ?? '').trim()} />
        </span>
        {option.detail && (
          <span className="block text-xs text-slate-500 truncate">
            <Highlight text={option.detail} query={(query ?? '').trim()} />
          </span>
        )}
      </span>
    </button>
  )

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverAnchor asChild>
        <div
          ref={fieldRef}
          className={cn(
            'w-full rounded-xl border border-slate-300 h-9 bg-white flex items-center gap-2 pl-3 pr-1.5',
            'focus-within:border-primary focus-within:ring-1 focus-within:ring-primary',
            disabled && 'opacity-50',
            className,
          )}
        >
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            autoComplete="off"
            disabled={disabled}
            // Reads as the chosen value until it is typed into.
            value={query ?? selected?.label ?? ''}
            placeholder={placeholder}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-full w-full bg-transparent text-xs font-medium outline-none placeholder:text-slate-400"
          />
          {query !== null && query !== '' && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
              className="text-slate-400 hover:text-slate-600 shrink-0"
            >
              <X className="size-4" />
            </button>
          )}
          <button
            type="button"
            tabIndex={-1}
            disabled={disabled}
            aria-label={open ? 'Close the list' : 'Open the list'}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (open) close()
              else {
                setOpen(true)
                inputRef.current?.focus()
              }
            }}
            className="shrink-0 p-1 text-slate-400"
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        // Edge for edge with the field. The bare `w-[--var]` shorthand is not valid in
        // Tailwind 4, which is how this came to size itself to its content instead.
        className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
        // The caret stays in the field, so typing continues to narrow the list.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        // The field sits outside the panel, so clearing the search or working the
        // chevron reads as an interaction outside it and would dismiss the list. Those
        // controls belong to this field and handle themselves.
        onInteractOutside={(e) => {
          if (fieldRef.current?.contains(e.target as Node)) e.preventDefault()
        }}
      >
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
          {(query ?? '').trim()
            ? `${matches.length} of ${options.length - pinned.length} shown`
            : `${matches.length} to choose from`}
          <span className="text-slate-400">
            {' '}
            &middot; &uarr;&darr; to move &middot; &crarr; to choose
          </span>
        </p>
      </PopoverContent>
    </Popover>
  )
}
