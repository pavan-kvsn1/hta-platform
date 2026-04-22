/**
 * @hta/emails
 *
 * Email templates and sending utilities.
 * Uses React Email for templates and Resend for delivery.
 */

// Templates
export * from './templates/index.js'

// Rendering
export { renderEmail, getEmailSubject } from './render.js'
export type { EmailTemplate, RenderEmailOptions } from './render.js'

// Components (for custom templates)
export { Layout, Button } from './components/index.js'
