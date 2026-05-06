'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api-client'
import { Loader2 } from 'lucide-react'

export default function NewCertificatePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function createDraft() {
      // Try online first
      try {
        const res = await apiFetch('/api/certificates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'create-draft' }),
        })

        if (res.ok) {
          const { id } = await res.json()
          router.replace(`/dashboard/certificates/${id}/edit`)
          return
        }
      } catch {
        // API unreachable — try offline
      }

      // Offline: create local draft via Electron IPC
      const electronAPI = (window as unknown as { electronAPI?: {
        createDraft?: () => Promise<{ id: string }>
      } }).electronAPI

      if (electronAPI?.createDraft) {
        try {
          const tempNumber = `DRAFT-${Date.now()}`
          const { id } = await electronAPI.createDraft()
          router.replace(`/dashboard/certificates/${id}/edit?offline=true&tempNumber=${encodeURIComponent(tempNumber)}`)
          return
        } catch {
          setError('Failed to create offline draft.')
          return
        }
      }

      setError('Failed to create certificate. Please check your connection.')
    }

    createDraft()
  }, [router])

  if (error) {
    return (
      <div className="h-full bg-[#f1f5f9] flex items-center justify-center">
        <div className="bg-white rounded-[14px] border border-[#e2e8f0] p-8 max-w-md text-center">
          <p className="text-[14px] text-[#dc2626] mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-[13px] font-semibold text-white bg-[#7c3aed] hover:bg-[#6d28d9] rounded-[9px]"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-[#f1f5f9] flex items-center justify-center">
      <div className="flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-[#7c3aed]" />
        <span className="text-[14px] text-[#64748b]">Creating draft certificate...</span>
      </div>
    </div>
  )
}
