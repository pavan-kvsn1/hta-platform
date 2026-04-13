'use client'

import { CheckCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SignatureStatusCardProps {
  title: string
  icon: React.ComponentType<{ className?: string }>
  signature?: { signerName: string; signedAt: string | null }
  isYours?: boolean
}

/**
 * Signature status card for certificate approval workflow.
 * Shows signed/pending status with timestamp for each signature type.
 */
export function SignatureStatusCard({
  title,
  icon: Icon,
  signature,
  isYours,
}: SignatureStatusCardProps) {
  const isSigned = !!signature

  return (
    <div className={cn(
      'rounded-lg border p-4',
      isSigned ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'
    )}>
      <div className="flex items-start gap-3">
        <div className={cn(
          'size-10 rounded-full flex items-center justify-center flex-shrink-0',
          isSigned ? 'bg-green-100' : 'bg-slate-200'
        )}>
          {isSigned ? (
            <CheckCircle className="h-5 w-5 text-green-600" />
          ) : (
            <Clock className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={cn(
              'text-sm font-medium',
              isSigned ? 'text-green-800' : 'text-slate-700'
            )}>
              {title}
            </p>
            {isYours && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                You
              </span>
            )}
          </div>
          {isSigned ? (
            <>
              <p className="text-xs text-green-700 truncate">{signature.signerName}</p>
              {signature.signedAt && (
                <p className="text-[10px] text-green-600 mt-1">
                  {new Date(signature.signedAt).toLocaleDateString('en-GB', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-slate-500">
              {isYours ? 'Awaiting your signature' : 'Pending'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
