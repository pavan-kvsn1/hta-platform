'use client'

import { Button } from '@/components/ui/button'
import { Eye, FileText, Download } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ViewToggleButtonProps {
  viewMode: 'details' | 'pdf'
  onViewModeChange: (mode: 'details' | 'pdf') => void
  /** When true, shows "Download PDF" instead of "Preview PDF" with download styling */
  isAuthorized?: boolean
  /** Called when download is clicked (only when isAuthorized is true) */
  onDownload?: () => void
  /** Shows loading state on the download button */
  isDownloading?: boolean
}

/**
 * Toggle button for switching between certificate details and PDF preview.
 * When authorized, shows "Download PDF" with download functionality.
 */
export function ViewToggleButton({
  viewMode,
  onViewModeChange,
  isAuthorized = false,
  onDownload,
  isDownloading = false,
}: ViewToggleButtonProps) {
  const handleClick = () => {
    if (viewMode === 'details') {
      if (isAuthorized && onDownload) {
        onDownload()
      } else {
        onViewModeChange('pdf')
      }
    } else {
      onViewModeChange('details')
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={isDownloading}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold',
        viewMode === 'details' && isAuthorized
          ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-500 hover:border-blue-500 hover:text-white'
          : 'bg-white border-gray-200 text-gray-700'
      )}
    >
      {viewMode === 'details' ? (
        isAuthorized ? (
          <>
            <Download className="h-4 w-4" />
            {isDownloading ? 'Downloading...' : 'Download PDF'}
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            Preview PDF
          </>
        )
      ) : (
        <>
          <FileText className="h-4 w-4" />
          View Details
        </>
      )}
    </Button>
  )
}
