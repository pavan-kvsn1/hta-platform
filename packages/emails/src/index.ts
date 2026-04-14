/**
 * @hta/emails
 *
 * Email templates and sending utilities.
 * Uses React Email for templates and Resend for delivery.
 */

// Templates
export * from './templates'

// Rendering
export { renderEmail, getEmailSubject } from './render'
export type { EmailTemplate, RenderEmailOptions } from './render'

// Components (for custom templates)
export { Layout, Button } from './components'
