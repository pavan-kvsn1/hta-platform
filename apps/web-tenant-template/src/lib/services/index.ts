/**
 * Services Index
 *
 * Central export for all service abstractions.
 * Each service has a provider-agnostic interface that can be swapped
 * between local (development) and cloud (production) implementations.
 */

// Queue Service
export {
  enqueue,
  enqueueBatch,
  getJob,
  cancelJob,
  getJobCounts,
  processJobs,
  cleanupJobs,
  resetStuckJobs,
} from './queue'

export type {
  JobType,
  JobPayloads,
  JobOptions,
  Job,
  JobStatus,
} from './queue'

// Notification Service
export {
  createNotification,
  getNotifications,
  getUnreadCount,
  markNotificationsAsRead,
  notifyReviewerOnSubmit,
  notifyAssigneeOnReview,
  notifyReviewerOnAssigneeResponse,
  notifyOnSentToCustomer,
  notifyReviewerOnCustomerRevision,
  notifyCustomerOnReviewerReply,
  notifyOnCustomerApproval,
  notifyAdminsOnRegistration,
  notifyCustomerOnRegistrationApproved,
  notifyCustomerOnRegistrationRejected,
  notifyOnChatMessage,
} from './notifications'

export type { NotificationType } from './notifications'

// Chat Service
export {
  getOrCreateThread,
  getThread,
  getThreadWithCertificate,
  getThreadsForCertificate,
  getThreadsForUser,
  sendMessage,
  getMessages,
  markMessagesAsRead,
  getUnreadMessageCount,
  getUnreadCountsByThread,
} from './chat'

export type {
  ThreadType,
  ChatThreadInfo,
  ChatMessageInfo,
  SendMessageInput,
  CreateThreadInput,
} from './chat'

// Re-export queue for direct access if needed
export * as queue from './queue'

// Re-export chat for direct access if needed
export * as chat from './chat'
