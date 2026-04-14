/**
 * Storage Provider Types
 * Abstraction layer for GCS file storage
 */

export interface StorageFile {
  path: string
  size: number
  contentType: string
  lastModified: Date
}

export interface UploadOptions {
  contentType?: string
  metadata?: Record<string, string>
}

export interface SignedUrlOptions {
  expiresInMinutes?: number
  action?: 'read' | 'write'
}

/**
 * Storage provider interface
 */
export interface StorageProvider {
  upload(path: string, buffer: Buffer, options?: UploadOptions): Promise<string>
  download(path: string): Promise<Buffer>
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  getSignedUrl(path: string, options?: SignedUrlOptions): Promise<string>
  list(prefix: string): Promise<StorageFile[]>
  getMetadata(path: string): Promise<StorageFile | null>
}

export interface StorageConfig {
  gcsBucket?: string
  gcsProjectId?: string
}
