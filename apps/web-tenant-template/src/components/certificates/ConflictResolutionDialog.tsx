'use client'

import { AlertTriangle, RefreshCw, Download } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useCertificateStore } from '@/lib/stores/certificate-store'

interface ConflictResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  serverTimestamp: Date | null
  onRefresh: () => void
}

export function ConflictResolutionDialog({
  open,
  onOpenChange,
  serverTimestamp,
  onRefresh,
}: ConflictResolutionDialogProps) {
  const { formData } = useCertificateStore()

  const handleDownloadChanges = () => {
    // Create a JSON blob with the current form data
    const dataToExport = {
      exportedAt: new Date().toISOString(),
      certificateNumber: formData.certificateNumber,
      note: 'Your unsaved changes (exported due to conflict)',
      formData: formData,
    }

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    })

    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `certificate-backup-${formData.certificateNumber || 'draft'}-${Date.now()}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    // Close dialog after download
    onOpenChange(false)
  }

  const handleRefresh = () => {
    onRefresh()
    onOpenChange(false)
  }

  const formatTimestamp = (date: Date | null) => {
    if (!date) return 'Unknown time'
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-full bg-orange-100">
              <AlertTriangle className="size-5 text-orange-600" />
            </div>
            <AlertDialogTitle className="text-lg">
              Save Conflict Detected
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-slate-600">
            This certificate was modified by another user at{' '}
            <span className="font-medium text-slate-900">
              {formatTimestamp(serverTimestamp)}
            </span>
            . Your changes cannot be saved without overwriting their work.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="bg-slate-50 rounded-lg p-4 my-2 border border-slate-200">
          <p className="text-sm text-slate-700 font-medium mb-2">
            Choose how to proceed:
          </p>
          <ul className="text-sm text-slate-600 space-y-2">
            <li className="flex items-start gap-2">
              <RefreshCw className="size-4 mt-0.5 text-blue-600 flex-shrink-0" />
              <span>
                <strong>Refresh</strong> - Load the latest version from the
                server. Your unsaved changes will be lost.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Download className="size-4 mt-0.5 text-green-600 flex-shrink-0" />
              <span>
                <strong>Download</strong> - Save your changes as a backup file.
                You can manually merge them later.
              </span>
            </li>
          </ul>
        </div>

        <AlertDialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={handleDownloadChanges}
            className="flex items-center gap-2"
          >
            <Download className="size-4" />
            Download My Changes
          </Button>
          <Button
            onClick={handleRefresh}
            className="flex items-center gap-2 bg-primary"
          >
            <RefreshCw className="size-4" />
            Refresh from Server
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
