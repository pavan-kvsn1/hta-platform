'use client'

import { CheckCircle, Clock, User, Shield, Building2, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SignatureInfo {
  signerType: string
  signerName: string
  signedAt: string | null
}

interface SignatureStatusBarProps {
  signatures: SignatureInfo[]
  showAdminPending?: boolean
  className?: string
}

function formatSignedDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const datePart = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
  const timePart = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${timePart}, ${datePart}`
}

function getSignatureIcon(signerType: string) {
  switch (signerType) {
    case 'ASSIGNEE':
      return User
    case 'REVIEWER':
      return Shield
    case 'CUSTOMER':
      return Building2
    case 'ADMIN':
      return ShieldCheck
    default:
      return User
  }
}

function getSignatureLabel(signerType: string) {
  switch (signerType) {
    case 'ASSIGNEE':
      return 'Assignee'
    case 'REVIEWER':
      return 'Reviewer'
    case 'CUSTOMER':
      return 'Customer'
    case 'ADMIN':
      return 'Admin'
    default:
      return signerType
  }
}

export function SignatureStatusBar({
  signatures,
  showAdminPending = true,
  className,
}: SignatureStatusBarProps) {
  // Get signatures by type
  const getSignature = (type: string) => signatures.find(s => s.signerType === type)

  const assigneeSignature = getSignature('ASSIGNEE')
  const reviewerSignature = getSignature('REVIEWER')
  const customerSignature = getSignature('CUSTOMER')
  const adminSignature = getSignature('ADMIN')

  const signatureSlots = [
    { type: 'ASSIGNEE', signature: assigneeSignature },
    { type: 'REVIEWER', signature: reviewerSignature },
    { type: 'CUSTOMER', signature: customerSignature },
    ...(showAdminPending || adminSignature ? [{ type: 'ADMIN', signature: adminSignature }] : []),
  ]

  return (
    <div className={cn('border-b bg-slate-50 px-6 py-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Signature Status
        </span>
      </div>
      <div className="flex gap-3">
        {signatureSlots.map(({ type, signature }) => {
          const Icon = getSignatureIcon(type)
          const label = getSignatureLabel(type)
          const isSigned = !!signature
          const isPendingAdmin = type === 'ADMIN' && !isSigned

          return (
            <div
              key={type}
              className={cn(
                'flex-1 flex items-center gap-3 px-4 py-2.5 rounded-lg border',
                isSigned
                  ? 'bg-green-50 border-green-200'
                  : isPendingAdmin
                  ? 'bg-amber-50 border-amber-200'
                  : 'bg-slate-100 border-slate-200'
              )}
            >
              <div
                className={cn(
                  'size-9 rounded-full flex items-center justify-center flex-shrink-0',
                  isSigned
                    ? 'bg-green-100'
                    : isPendingAdmin
                    ? 'bg-amber-100'
                    : 'bg-slate-200'
                )}
              >
                {isSigned ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : isPendingAdmin ? (
                  <Clock className="h-5 w-5 text-amber-600" />
                ) : (
                  <Icon className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      'text-xs font-semibold',
                      isSigned
                        ? 'text-green-700'
                        : isPendingAdmin
                        ? 'text-amber-700'
                        : 'text-slate-600'
                    )}
                  >
                    {label}
                  </p>
                  {isPendingAdmin && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">
                      YOU
                    </span>
                  )}
                </div>
                {isSigned ? (
                  <>
                    <p className="text-xs text-green-600 truncate">{signature.signerName}</p>
                    <p className="text-[10px] text-green-500">{formatSignedDate(signature.signedAt)}</p>
                  </>
                ) : (
                  <p className={cn(
                    'text-xs',
                    isPendingAdmin ? 'text-amber-600' : 'text-slate-500'
                  )}>
                    {isPendingAdmin ? 'Awaiting your signature' : 'Pending'}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
