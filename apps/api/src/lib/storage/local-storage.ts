/**
 * Local File System Storage Provider
 * Used for development environment
 */

import * as fs from 'fs/promises'
import * as fsSync from 'fs'
import * as path from 'path'
import {
  StorageProvider,
  StorageFile,
  UploadOptions,
  SignedUrlOptions,
} from './types.js'

export class LocalStorageProvider implements StorageProvider {
  private basePath: string

  constructor(basePath: string) {
    this.basePath = path.resolve(basePath)
    // Ensure base directory exists
    this.ensureDirectory(this.basePath)
  }

  private ensureDirectory(dirPath: string): void {
    if (!fsSync.existsSync(dirPath)) {
      fsSync.mkdirSync(dirPath, { recursive: true })
    }
  }

  private getFullPath(relativePath: string): string {
    // Sanitize path to prevent directory traversal
    const sanitized = relativePath.replace(/\.\./g, '').replace(/^\/+/, '')
    return path.join(this.basePath, sanitized)
  }

  async upload(
    filePath: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string> {
    const fullPath = this.getFullPath(filePath)
    const dir = path.dirname(fullPath)

    // Ensure directory exists
    this.ensureDirectory(dir)

    // Write file
    await fs.writeFile(fullPath, buffer)

    // Optionally write metadata file
    if (options?.metadata) {
      const metadataPath = `${fullPath}.meta.json`
      await fs.writeFile(
        metadataPath,
        JSON.stringify({
          contentType: options.contentType || 'application/octet-stream',
          metadata: options.metadata,
          uploadedAt: new Date().toISOString(),
        })
      )
    }

    return filePath
  }

  async download(filePath: string): Promise<Buffer> {
    const fullPath = this.getFullPath(filePath)

    if (!fsSync.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`)
    }

    return fs.readFile(fullPath)
  }

  async delete(filePath: string): Promise<void> {
    const fullPath = this.getFullPath(filePath)

    if (fsSync.existsSync(fullPath)) {
      await fs.unlink(fullPath)
    }

    // Also delete metadata file if exists
    const metadataPath = `${fullPath}.meta.json`
    if (fsSync.existsSync(metadataPath)) {
      await fs.unlink(metadataPath)
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const fullPath = this.getFullPath(filePath)
    return fsSync.existsSync(fullPath)
  }

  async getSignedUrl(
    filePath: string,
    _options?: SignedUrlOptions
  ): Promise<string> {
    // For local storage, return an API route path
    // The actual file serving is handled by the API endpoint
    const encodedPath = encodeURIComponent(filePath)
    return `/api/storage/download?path=${encodedPath}`
  }

  async list(prefix: string): Promise<StorageFile[]> {
    const fullPrefix = this.getFullPath(prefix)
    const dir = path.dirname(fullPrefix)
    const filePrefix = path.basename(fullPrefix)

    if (!fsSync.existsSync(dir)) {
      return []
    }

    const files: StorageFile[] = []
    const entries = await fs.readdir(dir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isFile() && entry.name.startsWith(filePrefix)) {
        // Skip metadata files
        if (entry.name.endsWith('.meta.json')) continue

        const entryPath = path.join(dir, entry.name)
        const stats = await fs.stat(entryPath)
        const relativePath = path.relative(this.basePath, entryPath)

        files.push({
          path: relativePath.replace(/\\/g, '/'), // Normalize path separators
          size: stats.size,
          contentType: this.getContentType(entry.name),
          lastModified: stats.mtime,
        })
      }
    }

    return files
  }

  async getMetadata(filePath: string): Promise<StorageFile | null> {
    const fullPath = this.getFullPath(filePath)

    if (!fsSync.existsSync(fullPath)) {
      return null
    }

    const stats = await fs.stat(fullPath)

    return {
      path: filePath,
      size: stats.size,
      contentType: this.getContentType(filePath),
      lastModified: stats.mtime,
    }
  }

  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase()
    const contentTypes: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.heic': 'image/heic',
      '.heif': 'image/heif',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }
    return contentTypes[ext] || 'application/octet-stream'
  }
}
