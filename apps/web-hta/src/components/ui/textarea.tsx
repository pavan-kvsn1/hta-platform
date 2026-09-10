import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
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
        "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-xs",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
