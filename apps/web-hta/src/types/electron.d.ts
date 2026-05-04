/**
 * Electron Desktop API types
 *
 * These types describe the API exposed by the Electron preload script
 * via contextBridge.exposeInMainWorld('electronAPI', ...).
 * Only available when running inside the Electron desktop app.
 */

interface ElectronAPI {
  isElectron: true

  // Auth
  setup: (password: string, userId: string, refreshToken: string, accessToken: string, userProfile: Record<string, unknown>) => Promise<{ success: boolean; deviceId?: string; error?: string }>
  unlock: (password: string, challengeKey: string, responseValue: string) => Promise<{ success: boolean; refreshToken?: string; codesRemaining?: number; attemptsRemaining?: number; error?: string }>
  unlockPasswordOnly: (password: string) => Promise<{ success: boolean; attemptsRemaining?: number; error?: string }>
  getAuthStatus: () => Promise<{ isSetUp: boolean; isUnlocked: boolean; codesRemaining?: number; needsFullAuth?: boolean; challengeKey?: string }>
  getUserProfile: () => Promise<Record<string, unknown> | null>
  logout: () => Promise<{ success: boolean }>

  // Connectivity
  getOnlineStatus: () => Promise<boolean>
  onConnectivityChange: (cb: (online: boolean) => void) => () => void

  // Offline request bridge (used by api-client.ts)
  isOffline: () => boolean
  handleOfflineRequest: (url: string, init?: RequestInit) => Promise<Response>

  // Draft CRUD
  createDraft: (data: unknown) => Promise<unknown>
  saveDraft: (id: string, data: unknown) => Promise<unknown>
  getDraft: (id: string) => Promise<unknown>
  listDrafts: () => Promise<unknown>
  deleteDraft: (id: string) => Promise<unknown>

  // Images
  saveImage: (draftId: string, meta: unknown, buffer: ArrayBuffer) => Promise<unknown>
  getImagePath: (imageId: string) => Promise<unknown>
  listImages: (draftId: string) => Promise<unknown>

  // Sync
  getSyncStatus: () => Promise<unknown>
  triggerSync: () => Promise<unknown>
  onSyncProgress: (cb: (progress: unknown) => void) => () => void

  // Reference data
  getMasterInstruments: () => Promise<unknown>
  getCustomers: () => Promise<unknown>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
