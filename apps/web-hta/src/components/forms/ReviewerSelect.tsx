'use client'

import { apiFetch } from '@/lib/api-client'

import { useState, useEffect } from 'react'
import { Check, ChevronsUpDown, User, Briefcase, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Reviewer {
  id: string
  name: string
  email: string
  role: 'ENGINEER' | 'ADMIN'
  adminType?: string | null
  hasSignature: boolean
  pendingReviews: number
}

interface ReviewerSelectProps {
  value: string | null
  onChange: (reviewerId: string | null) => void
  disabled?: boolean
  error?: string
  className?: string
}

export function ReviewerSelect({
  value,
  onChange,
  disabled = false,
  error,
  className,
}: ReviewerSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [reviewers, setReviewers] = useState<Reviewer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  // Fetch reviewers on mount
  useEffect(() => {
    const fetchReviewers = async () => {
      setIsLoading(true)
      setFetchError(null)

      try {
        const res = await apiFetch('/api/users/reviewers')
        if (!res.ok) throw new Error('Failed to fetch reviewers')

        const data = await res.json()
        setReviewers(data.reviewers)
      } catch (err) {
        setFetchError('Unable to load reviewers')
        console.error('Fetch reviewers error:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchReviewers()
  }, [])

  const selectedReviewer = reviewers.find((r) => r.id === value)

  const handleSelect = (reviewerId: string) => {
    onChange(reviewerId === value ? null : reviewerId)
    setIsOpen(false)
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-slate-500', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Loading reviewers...</span>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-red-600', className)}>
        <AlertCircle className="h-4 w-4" />
        <span>{fetchError}</span>
        <button
          onClick={() => window.location.reload()}
          className="text-primary hover:underline ml-2"
        >
          Retry
        </button>
      </div>
    )
  }

  if (reviewers.length === 0) {
    return (
      <div className={cn('text-sm text-amber-600 bg-amber-50 p-3 rounded-lg', className)}>
        <AlertCircle className="h-4 w-4 inline mr-2" />
        No other engineers available for review. Please contact an administrator.
      </div>
    )
  }

  return (
    <div className={cn('relative', className)}>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full justify-between h-12 px-4 rounded-xl font-medium border-slate-300',
          error && 'border-red-500 focus:ring-red-500',
          !selectedReviewer && 'text-slate-400'
        )}
      >
        {selectedReviewer ? (
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-slate-500" />
            <span className='text-xs'>{selectedReviewer.name}</span>
            {selectedReviewer.role === 'ADMIN' && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">
                Admin
              </span>
            )}
          </div>
        ) : (
          <span>Select a reviewer...</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {error && (
        <p className="text-sm text-red-600 mt-1">{error}</p>
      )}

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute z-50 w-full mt-2 bg-white border border-slate-300 rounded-xl shadow-lg max-h-64 overflow-auto">
            {reviewers.map((reviewer) => (
              <button
                key={reviewer.id}
                type="button"
                onClick={() => handleSelect(reviewer.id)}
                className={cn(
                  'w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center gap-3 transition-colors',
                  'first:rounded-t-xl last:rounded-b-xl text-xs',
                  reviewer.id === value && 'bg-primary/5'
                )}
              >
                <div className="flex-shrink-0">
                  {reviewer.id === value ? (
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-xs">
                      <Check className="h-3 w-3 text-white" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-xs">
                      <User className="h-3 w-3 text-slate-400" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900 truncate">
                      {reviewer.name}
                    </span>
                    {reviewer.role === 'ADMIN' && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex-shrink-0">
                        {reviewer.adminType === 'MASTER' ? 'Master Admin' : 'Admin'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate">{reviewer.email}</p>
                </div>

                <div className="flex-shrink-0 text-right">
                  {reviewer.pendingReviews > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Briefcase className="h-3 w-3" />
                      <span>{reviewer.pendingReviews} pending</span>
                    </div>
                  ) : (
                    <span className="text-xs text-green-600">Available</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
