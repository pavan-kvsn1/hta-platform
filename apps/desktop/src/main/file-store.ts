import { app, safeStorage } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const IMAGES_DIR = path.join(app.getPath('userData'), 'images')

export function saveImageEncrypted(
  draftId: string,
  buffer: Buffer,
  extension: string
): { localPath: string; id: string; sizeBytes: number } {
  const dir = path.join(IMAGES_DIR, draftId)
  fs.mkdirSync(dir, { recursive: true })

  const id = crypto.randomUUID()
  const filename = `${id}.${extension}.enc`
  const localPath = path.join(dir, filename)

  // Encrypt with DPAPI (Windows) via Electron safeStorage
  const encrypted = safeStorage.encryptString(buffer.toString('base64'))
  fs.writeFileSync(localPath, encrypted)

  return { localPath, id, sizeBytes: buffer.length }
}

export function readImageDecrypted(localPath: string): Buffer | null {
  if (!fs.existsSync(localPath)) return null
  const encrypted = fs.readFileSync(localPath)
  const base64 = safeStorage.decryptString(encrypted)
  return Buffer.from(base64, 'base64')
}

export function deleteImagesForDraft(draftId: string): void {
  const dir = path.join(IMAGES_DIR, draftId)
  if (fs.existsSync(dir)) {
    // Secure delete: overwrite before unlinking
    for (const file of fs.readdirSync(dir)) {
      const filePath = path.join(dir, file)
      const size = fs.statSync(filePath).size
      fs.writeFileSync(filePath, crypto.randomBytes(size))
      fs.unlinkSync(filePath)
    }
    fs.rmdirSync(dir)
  }
}
