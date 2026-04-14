/**
 * Storage Provider Types
 * Abstraction layer for file storage (local filesystem or cloud storage)
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
 * Storage provider interface - implemented by local and GCS providers
 */
export interface StorageProvider {
  /**
   * Upload a file to storage
   * @param path - Relative path/key for the file
   * @param buffer - File content as Buffer
   * @param options - Upload options (contentType, metadata)
   * @returns The storage path/key of the uploaded file
   */
  upload(path: string, buffer: Buffer, options?: UploadOptions): Promise<string>

  /**
   * Download a file from storage
   * @param path - Relative path/key of the file
   * @returns File content as Buffer
   */
  download(path: string): Promise<Buffer>

  /**
   * Delete a file from storage
   * @param path - Relative path/key of the file
   */
  delete(path: string): Promise<void>

  /**
   * Check if a file exists in storage
   * @param path - Relative path/key of the file
   */
  exists(path: string): Promise<boolean>

  /**
   * Get a signed URL for direct access to the file
   * For local storage, this returns a relative API path
   * For GCS, this returns a time-limited signed URL
   * @param path - Relative path/key of the file
   * @param options - Signed URL options
   */
  getSignedUrl(path: string, options?: SignedUrlOptions): Promise<string>

  /**
   * List files in storage with a given prefix
   * @param prefix - Path prefix to filter files
   */
  list(prefix: string): Promise<StorageFile[]>

  /**
   * Get file metadata without downloading
   * @param path - Relative path/key of the file
   */
  getMetadata(path: string): Promise<StorageFile | null>
}

/**
 * Storage type configuration
 */
export type StorageType = 'local' | 'gcs'

export interface StorageConfig {
  type: StorageType
  localPath?: string      // For local storage
  gcsBucket?: string      // For GCS
  gcsProjectId?: string   // For GCS
}
