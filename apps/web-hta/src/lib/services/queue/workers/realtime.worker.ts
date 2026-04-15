/**
 * Realtime Worker
 *
 * Handles background processing of realtime event jobs:
 * - realtime:publish - Publish an event to a channel
 *
 * For polling-based realtime, this creates RealtimeEvent records.
 * For Firebase/Pusher, this would push to those services.
 */

import { prisma } from '@/lib/prisma'
import { JobWorker } from '../types'

/**
 * Process realtime publish
 * Creates realtime event records for polling-based delivery
 */
export const realtimePublishWorker: JobWorker<'realtime:publish'> = async (job) => {
  const { channel, event, recipientIds } = job.payload

  // If specific recipients, create events for each
  if (recipientIds && recipientIds.length > 0) {
    const events = recipientIds.map((id) => {
      // Determine if this is a user or customer based on channel prefix
      const isCustomer = channel.includes('customer:')

      return {
        userId: isCustomer ? null : id,
        customerId: isCustomer ? id : null,
        channel,
        type: event.type,
        data: JSON.stringify(event.data),
        delivered: false,
      }
    })

    await prisma.realtimeEvent.createMany({
      data: events.filter(e => e.userId || e.customerId),
    })

    console.log(`[RealtimeWorker] Published ${event.type} to ${recipientIds.length} recipients on ${channel}`)
  } else {
    // Broadcast to channel (for polling, we'd need to track channel subscriptions)
    // For now, just log - actual implementation depends on your needs
    console.log(`[RealtimeWorker] Broadcast ${event.type} to channel ${channel}`)
  }
}

// Export workers map
export const realtimeWorkers = {
  'realtime:publish': realtimePublishWorker,
}
