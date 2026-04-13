/**
 * @hta/ui - Components
 *
 * Shared UI components for the HTA platform.
 * Components are designed to be:
 * - Accessible (WCAG 2.1 AA)
 * - Themeable (support tenant customization)
 * - Composable (built with Radix UI primitives)
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merge class names with Tailwind CSS support
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Status badge variants
 */
export const statusVariants = {
  draft: 'bg-gray-100 text-gray-700 border-gray-300',
  pending: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  submitted: 'bg-blue-100 text-blue-700 border-blue-300',
  review: 'bg-purple-100 text-purple-700 border-purple-300',
  approved: 'bg-green-100 text-green-700 border-green-300',
  rejected: 'bg-red-100 text-red-700 border-red-300',
} as const

export type StatusVariant = keyof typeof statusVariants

/**
 * Get status badge classes
 */
export function getStatusClasses(status: string): string {
  const normalized = status.toLowerCase().replace(/_/g, '')

  if (normalized.includes('draft')) return statusVariants.draft
  if (normalized.includes('pending')) return statusVariants.pending
  if (normalized.includes('submit')) return statusVariants.submitted
  if (normalized.includes('review')) return statusVariants.review
  if (normalized.includes('approv') || normalized.includes('authorized')) return statusVariants.approved
  if (normalized.includes('reject')) return statusVariants.rejected

  return statusVariants.draft
}

// Components will be added here as they are migrated
// TODO: Migrate from hta-calibration:
// - Button
// - Input
// - Select
// - Card
// - Badge
// - Modal/Dialog
// - Table
// - Form components
// - Loading spinners
// - Toast/Notifications
