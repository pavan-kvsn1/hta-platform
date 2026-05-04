'use client'

import * as React from 'react'
import { DayPicker } from 'react-day-picker'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { format, parse, isValid } from 'date-fns'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from './popover'

interface DatePickerProps {
  /** Date value as ISO string (YYYY-MM-DD) or empty string */
  value: string
  /** Called with ISO date string (YYYY-MM-DD) or empty string */
  onChange: (value: string) => void
  /** Placeholder when no date is selected */
  placeholder?: string
  /** Disable the input */
  disabled?: boolean
  /** Additional className for the trigger button */
  className?: string
  /** Size variant */
  size?: 'sm' | 'default'
}

function parseDate(value: string): Date | undefined {
  if (!value) return undefined
  const date = parse(value, 'yyyy-MM-dd', new Date())
  return isValid(date) ? date : undefined
}

function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function formatDisplay(date: Date): string {
  return format(date, 'dd MMM yyyy')
}

export function DatePicker({
  value,
  onChange,
  placeholder = 'Select date',
  disabled = false,
  className,
  size = 'default',
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = parseDate(value)

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(toDateString(date))
    } else {
      onChange('')
    }
    setOpen(false)
  }

  const isSmall = size === 'sm'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'inline-flex items-center gap-2 w-full border border-[#e2e8f0] bg-white text-left transition-colors',
            'hover:bg-[#f8fafc] focus:ring-2 focus:ring-[#7c3aed]/20 focus:border-[#7c3aed] outline-none',
            'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white',
            isSmall
              ? 'rounded-[7px] px-2.5 py-1.5 text-[12px]'
              : 'rounded-[9px] px-3 py-2 text-[13px]',
            selected ? 'text-[#0f172a]' : 'text-[#94a3b8]',
            className
          )}
        >
          <CalendarIcon className={cn('flex-shrink-0 text-[#94a3b8]', isSmall ? 'size-3.5' : 'size-4')} />
          <span className="flex-1 truncate">
            {selected ? formatDisplay(selected) : placeholder}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-3">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={handleSelect}
          defaultMonth={selected || new Date()}
          showOutsideDays
          classNames={{
            root: 'text-[13px]',
            months: 'flex gap-4',
            month: 'flex flex-col gap-3',
            month_caption: 'flex items-center justify-center relative h-8',
            caption_label: 'text-[13px] font-semibold text-[#0f172a]',
            nav: 'flex items-center justify-between absolute inset-x-0',
            button_previous: cn(
              'size-7 inline-flex items-center justify-center rounded-[7px] text-[#64748b]',
              'hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors',
            ),
            button_next: cn(
              'size-7 inline-flex items-center justify-center rounded-[7px] text-[#64748b]',
              'hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors',
            ),
            weekdays: 'flex',
            weekday: 'w-8 text-center text-[11px] font-semibold text-[#94a3b8] uppercase',
            weeks: 'flex flex-col gap-0.5',
            week: 'flex',
            day: 'p-0',
            day_button: cn(
              'size-8 inline-flex items-center justify-center rounded-[7px] text-[13px] font-medium',
              'text-[#475569] hover:bg-[#f1f5f9] hover:text-[#0f172a] transition-colors',
              'focus:outline-none focus:ring-2 focus:ring-[#7c3aed]/20',
            ),
            today: 'font-bold text-[#7c3aed]',
            selected:
              '!bg-[#0f172a] !text-white !rounded-[7px] hover:!bg-[#1e293b]',
            outside: 'text-[#cbd5e1] hover:text-[#94a3b8]',
            disabled: 'text-[#e2e8f0] cursor-not-allowed hover:bg-transparent',
          }}
          components={{
            Chevron: ({ orientation }) =>
              orientation === 'left' ? (
                <ChevronLeft className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              ),
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
