/**
 * Google Cloud Storage Provider
 * Used for production environment
 */

import { Storage, Bucket } from '@google-cloud/storage'
import {
  StorageProvider,
  StorageFile,
  UploadOptions,
  SignedUrlOptions,
} from './types.js'

export class GCSStorageProvider implements StorageProvider {
  private storage: Storage
  private bucket: Bucket

  constructor(bucketName: string, projectId?: string) {
    this.storage = new Storage({
      projectId: projectId || process.env.GCP_PROJECT_ID,
    })
    this.bucket = this.storage.bucket(bucketName)
  }

  async upload(
    filePath: string,
    buffer: Buffer,
    options?: UploadOptions
  ): Promise<string> {
    const file = this.bucket.file(filePath)

    await file.save(buffer, {
      contentType: options?.contentType || 'application/octet-stream',
      metadata: options?.metadata,
      resumable: false, // Simpler for smaller files
    })

    return filePath
  }

  async download(filePath: string): Promise<Buffer> {
    const file = this.bucket.file(filePath)
    const [exists] = await file.exists()

    if (!exists) {
      throw new Error(`File not found: ${filePath}`)
    }

    const [contents] = await file.download()
    return contents
  }

  async delete(filePath: string): Promise<void> {
    const file = this.bucket.file(filePath)
    const [exists] = await file.exists()

    if (exists) {
      await file.delete()
    }
  }

  async exists(filePath: string): Promise<boolean> {
    const file = this.bucket.file(filePath)
    const [exists] = await file.exists()
    return exists
  }

  async getSignedUrl(
    filePath: string,
    options?: SignedUrlOptions
  ): Promise<string> {
    const file = this.bucket.file(filePath)
    const expiresInMinutes = options?.expiresInMinutes || 60

    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: options?.action || 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    })

    return url
  }

  async list(prefix: string): Promise<StorageFile[]> {
    const [files] = await this.bucket.getFiles({ prefix })

    return files.map((file) => ({
      path: file.name,
      size: parseInt(file.metadata.size as string) || 0,
      contentType: (file.metadata.contentType as string) || 'application/octet-stream',
      lastModified: new Date(file.metadata.updated as string),
    }))
  }

  async getMetadata(filePath: string): Promise<StorageFile | null> {
    const file = this.bucket.file(filePath)
    const [exists] = await file.exists()

    if (!exists) {
      return null
    }

    const [metadata] = await file.getMetadata()

    return {
      path: filePath,
      size: parseInt(metadata.size as string) || 0,
      contentType: metadata.contentType || 'application/octet-stream',
      lastModified: new Date(metadata.updated as string),
    }
  }
}
