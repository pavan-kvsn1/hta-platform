'use client'

// A dropdown you can type into.
//
// A plain select is fine for a handful of options. This lab's master list has 209
// instruments across dozens of descriptions and makes, and finding one by scrolling a
// list that long is the slowest part of building a certificate. Typing narrows it.
//
// The search is a substring match, case-insensitive, on the label the engineer sees -
// deliberately not fuzzy: an asset number typed in full should land on that asset and
// nothing else.

import { useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  /** Shown under the label, and searched along with it. */
  detail?: string
}

interface SearchableSelectProps {
  value: string
  options: SearchableOption[]
  onChange: (value: string) => void
  placeholder?: string
  /** Announced to screen readers and tied to the visible label. */
  id?: string
  disabled?: boolean
  className?: string
  /** Shown when the search matches nothing. */
  emptyMessage?: string
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
  const searchRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || (o.detail ?? '').toLowerCase().includes(q),
    )
  }, [options, query])

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
          <ChevronDown className="size-4 shrink-0 text-slate-400" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
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
            placeholder="Type to narrow the list"
            aria-label="Search"
            className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
          />
        </div>

        <div className="max-h-64 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">{emptyMessage}</p>
          ) : (
            matches.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  setQuery('')
                }}
                className={cn(
                  'w-full px-3 py-2 text-left flex items-start gap-2 hover:bg-slate-50',
                  option.value === value && 'bg-slate-50',
                )}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0 mt-0.5 text-primary',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800 truncate">
                    {option.label}
                  </span>
                  {option.detail && (
                    <span className="block text-xs text-slate-500 truncate">{option.detail}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>

        {query.trim() !== '' && matches.length > 0 && (
          <p className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-500">
            {matches.length} of {options.length} shown
          </p>
        )}
      </PopoverContent>
    </Popover>
  )
}
