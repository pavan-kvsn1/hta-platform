/**
 * Filesystem storage utility for signed PDF certificates.
 *
 * Base dir: process.cwd() + '/uploads'
 * Path pattern: certificates/{certId}/signed.pdf
 */

import fs from 'fs/promises'
import path from 'path'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads')

/**
 * Store a PDF buffer on disk.
 * Creates directories as needed and overwrites existing files (for re-approval).
 * Returns the relative path: 'certificates/{certId}/signed.pdf'
 */
export async function storePDF(certificateId: string, buffer: Buffer): Promise<string> {
  const relativePath = path.join('certificates', certificateId, 'signed.pdf')
  const fullPath = path.join(UPLOADS_DIR, relativePath)

  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, buffer)

  return relativePath
}

/**
 * Read a stored PDF from disk.
 */
export async function readPDF(relativePath: string): Promise<Buffer> {
  const fullPath = path.join(UPLOADS_DIR, relativePath)
  return fs.readFile(fullPath)
}

/**
 * Delete a stored PDF from disk.
 */
export async function deletePDF(relativePath: string): Promise<void> {
  const fullPath = path.join(UPLOADS_DIR, relativePath)
  await fs.unlink(fullPath).catch(() => {
    // Ignore if file doesn't exist
  })
}
