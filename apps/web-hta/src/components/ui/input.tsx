import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      // The field's size is settled here rather than left to callers.
      //
      // This read "md:text-sm", and a caller asking for text-xs got back
      // "md:text-sm text-xs" from the class merge - two different keys as far as it is
      // concerned, one plain and one behind a media query - so every field in the app
      // rendered at 14px from 768px up however small the caller asked.
      //
      // text-base below that width stays: iOS zooms the page when it focuses a field
      // under 16px, which is worse than a size that does not match.
      className={cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-xs',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        className
      )}
      {...props}
    />
  )
}

export { Input }
