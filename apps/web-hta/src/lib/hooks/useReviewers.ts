'use client'

/**
 * The people who can review a certificate, fetched once for the whole page.
 *
 * The picker used to own this list privately, so it was the only thing on the screen
 * that could turn a reviewer's id into their name. The header beside it showed a name
 * captured when the certificate loaded and never looked again - so choosing a different
 * reviewer changed the dropdown and left the header naming the old one until a reload.
 *
 * Shared, and cached at module scope: an engineer opens several certificates in a
 * session and the list does not change between them.
 */

import { useEffect, useState } from 'react'

import { apiFetch } from '@/lib/api-client'

export interface Reviewer {
  id: string
  name: string
  email: string
  role: 'ENGINEER' | 'ADMIN'
  adminType?: string | null
  hasSignature: boolean
  pendingReviews: number
}

/** Resolved once per page load; a second caller joins the request in flight. */
let cache: Reviewer[] | null = null
let inFlight: Promise<Reviewer[]> | null = null

async function load(): Promise<Reviewer[]> {
  const res = await apiFetch('/api/users/reviewers')
  if (!res.ok) throw new Error('Failed to fetch reviewers')
  const data = await res.json()
  return data.reviewers ?? []
}

/** What the desktop build cached, for an engineer working away from the network. */
async function cached(): Promise<Reviewer[] | null> {
  const electronAPI =
    typeof window !== 'undefined'
      ? (window as unknown as { electronAPI?: { getReviewers?: () => Promise<Reviewer[]> } })
          .electronAPI
      : undefined
  if (!electronAPI?.getReviewers) return null
  try {
    const list = await electronAPI.getReviewers()
    return list?.length ? list : null
  } catch {
    return null
  }
}

export function useReviewers() {
  const [reviewers, setReviewers] = useState<Reviewer[]>(cache ?? [])
  const [isLoading, setIsLoading] = useState(cache === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cache !== null) return
    let alive = true

    inFlight =
      inFlight ??
      load().catch(async (err) => {
        const fallback = await cached()
        if (fallback) return fallback
        throw err
      })

    inFlight
      .then((list) => {
        cache = list
        if (alive) setReviewers(list)
      })
      .catch((err) => {
        console.error('Fetch reviewers error:', err)
        if (alive) setError('Unable to load reviewers')
      })
      .finally(() => {
        inFlight = null
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  return { reviewers, isLoading, error }
}

/**
 * A reviewer's name from their id, for a screen that holds only the id.
 *
 * Falls back to whatever the certificate was loaded with, so the header still reads
 * correctly while the list is in flight and on a reviewer who has since been
 * deactivated and dropped off it.
 */
export function reviewerNameFrom(
  reviewers: Reviewer[],
  reviewerId: string | null | undefined,
  fallback: string | null = null,
): string | null {
  if (!reviewerId) return null
  return reviewers.find((r) => r.id === reviewerId)?.name ?? fallback
}
