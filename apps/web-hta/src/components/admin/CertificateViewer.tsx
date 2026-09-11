'use client'

/**
 * A certificate open in the page, with the banner still above it.
 *
 * The wireframe's Screen 4:
 *
 *   ◀ [Back to Details] │ ✓ ACTIVE │ VILLP_24-25_T-0184.pdf │ [p] < 2 of 4 > [n] │ [x]
 *
 * Whether the certificate is in force is shown here and not only on the card, because
 * this is where someone reads the figures off it. An archived certificate that looks
 * like a current one is the mistake this control bar exists to prevent.
 */

import { ChevronLeft, ChevronRight, Check, Loader2, X } from 'lucide-react'

export interface ViewerCertificate {
  id: string
  fileName: string
  isActive: boolean
  pageCount?: number | null
}

export default function CertificateViewer({
  certificate,
  url,
  loading,
  page,
  onPage,
  onBack,
  onClose,
}: {
  certificate: ViewerCertificate
  url: string | null
  loading: boolean
  page: number
  onPage: (page: number) => void
  onBack: () => void
  onClose: () => void
}) {
  const total = certificate.pageCount ?? null
  const canPrev = page > 1
  // Without a total we cannot know when to stop, so Next stays available and the PDF
  // simply does not move past its last page.
  const canNext = total === null || page < total

  return (
    <div className="flex flex-col h-[70vh] min-h-[520px]">
      <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-t-xl border border-[#e2e8f0] border-b-0 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="text-[12px] text-[#64748b] hover:text-[#0f172a] inline-flex items-center gap-1 shrink-0"
        >
          <ChevronLeft className="size-3.5" />
          Back to Details
        </button>

        <span className="text-[#cbd5e1]">│</span>

        <span
          className={`text-[11px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 shrink-0 ${
            certificate.isActive ? 'bg-[#dcfce7] text-[#15803d]' : 'bg-[#f1f5f9] text-[#64748b]'
          }`}
        >
          {certificate.isActive ? <Check className="size-3" /> : <X className="size-3" />}
          {certificate.isActive ? 'ACTIVE' : 'ARCHIVED'}
        </span>

        <span className="text-[12px] text-[#0f172a] truncate min-w-0 flex-1" title={certificate.fileName}>
          {certificate.fileName}
        </span>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={!canPrev}
            aria-label="Previous page"
            className="p-1 rounded text-[#64748b] hover:text-[#0f172a] disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="text-[12px] text-[#64748b] tabular-nums px-1">
            {total === null ? `page ${page}` : `${page} of ${total}`}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={!canNext}
            aria-label="Next page"
            className="p-1 rounded text-[#64748b] hover:text-[#0f172a] disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close viewer"
          className="p-1 rounded text-[#94a3b8] hover:text-[#0f172a] shrink-0"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 bg-[#f1f5f9] rounded-b-xl border border-[#e2e8f0] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="size-6 animate-spin text-[#94a3b8]" />
          </div>
        ) : url ? (
          // The page fragment is how a browser's built-in PDF viewer is told where to
          // open. Keying on it remounts the frame, which is what makes the arrows move
          // the page rather than only changing the address.
          <iframe
            key={`${certificate.id}-${page}`}
            src={`${url}#page=${page}`}
            className="w-full h-full"
            title={certificate.fileName}
          />
        ) : (
          <div className="flex items-center justify-center h-full p-6 text-center">
            <div>
              <p className="text-[13px] font-semibold text-[#475569]">This certificate could not be opened</p>
              <p className="mt-1 text-[12px] text-[#94a3b8]">
                The record exists but its file could not be fetched from storage.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
