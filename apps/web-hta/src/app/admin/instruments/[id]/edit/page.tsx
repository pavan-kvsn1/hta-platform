'use client'

/**
 * Retired.
 *
 * Editing happens on the instrument page itself: the Edit button turns the Basic Info
 * fields into inputs in place, and every other tab saves as it goes. Two pages that both
 * changed one record was how they drifted apart, so this one only forwards.
 *
 * The route stays so that links and bookmarks people already have keep working.
 */

import { use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function EditInstrumentRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  useEffect(() => {
    router.replace(`/admin/instruments/${id}`)
  }, [id, router])

  return (
    <div className="h-full flex items-center justify-center bg-[#f1f5f9]">
      <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
    </div>
  )
}
