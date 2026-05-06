import { contextBridge, ipcRenderer } from 'electron'

// Strict channel allowlist — only these IPC channels are accessible from renderer
const ALLOWED_INVOKE_CHANNELS = [
  'app:online-status',
  'auth:setup', 'auth:unlock', 'auth:unlock-password-only', 'auth:status', 'auth:get-user-profile', 'auth:logout',
  'draft:create', 'draft:save', 'draft:get', 'draft:list', 'draft:delete',
  'draft:get-conflict', 'draft:resolve-conflict',
  'image:save', 'image:get-path', 'image:list',
  'sync:status', 'sync:trigger',
  'ref:master-instruments', 'ref:customers',
  'app:is-api-reachable',
  'certificates:list-cached',
  'sync:get-status',
  'vpn:provision', 'vpn:status',
  'auth:get-access-token',
  'auth:refresh-access-token',
  'app:load-production',
] as const

const ALLOWED_ON_CHANNELS = [
  'app:connectivity-changed',
  'sync:progress',
] as const

type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
type OnChannel = typeof ALLOWED_ON_CHANNELS[number]

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  // ─── Auth (password + challenge-response 2FA) ────────────────────────
  setup: (password: string, userId: string, refreshToken: string, accessToken: string, userProfile: Record<string, unknown>) =>
    ipcRenderer.invoke('auth:setup' satisfies InvokeChannel, password, userId, refreshToken, accessToken, userProfile),
  unlock: (password: string, challengeKey: string, responseValue: string) =>
    ipcRenderer.invoke('auth:unlock' satisfies InvokeChannel, password, challengeKey, responseValue),
  unlockPasswordOnly: (password: string) =>
    ipcRenderer.invoke('auth:unlock-password-only' satisfies InvokeChannel, password),
  getAuthStatus: () =>
    ipcRenderer.invoke('auth:status' satisfies InvokeChannel),
  getUserProfile: () =>
    ipcRenderer.invoke('auth:get-user-profile' satisfies InvokeChannel),
  logout: () =>
    ipcRenderer.invoke('auth:logout' satisfies InvokeChannel),

  // ─── Connectivity ────────────────────────────────────────────────────
  isOffline: () => !(globalThis as unknown as { navigator: { onLine: boolean } }).navigator.onLine,
  getOnlineStatus: () =>
    ipcRenderer.invoke('app:online-status' satisfies InvokeChannel),
  onConnectivityChange: (cb: (online: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, online: boolean) => cb(online)
    ipcRenderer.on('app:connectivity-changed' satisfies OnChannel, handler)
    return () => ipcRenderer.removeListener('app:connectivity-changed', handler)
  },

  // ─── Draft CRUD ──────────────────────────────────────────────────────
  createDraft: (data: unknown) =>
    ipcRenderer.invoke('draft:create' satisfies InvokeChannel, data),
  saveDraft: (id: string, data: unknown) =>
    ipcRenderer.invoke('draft:save' satisfies InvokeChannel, id, data),
  getDraft: (id: string) =>
    ipcRenderer.invoke('draft:get' satisfies InvokeChannel, id),
  listDrafts: () =>
    ipcRenderer.invoke('draft:list' satisfies InvokeChannel),
  deleteDraft: (id: string) =>
    ipcRenderer.invoke('draft:delete' satisfies InvokeChannel, id),
  getConflict: (draftId: string) =>
    ipcRenderer.invoke('draft:get-conflict' satisfies InvokeChannel, draftId),
  resolveConflict: (draftId: string, resolvedData: unknown) =>
    ipcRenderer.invoke('draft:resolve-conflict' satisfies InvokeChannel, draftId, resolvedData),

  // ─── Images ──────────────────────────────────────────────────────────
  saveImage: (draftId: string, meta: unknown, buffer: ArrayBuffer) =>
    ipcRenderer.invoke('image:save' satisfies InvokeChannel, draftId, meta, buffer),
  getImagePath: (imageId: string) =>
    ipcRenderer.invoke('image:get-path' satisfies InvokeChannel, imageId),
  listImages: (draftId: string) =>
    ipcRenderer.invoke('image:list' satisfies InvokeChannel, draftId),

  // ─── Sync ────────────────────────────────────────────────────────────
  getSyncStatus: () =>
    ipcRenderer.invoke('sync:status' satisfies InvokeChannel),
  triggerSync: () =>
    ipcRenderer.invoke('sync:trigger' satisfies InvokeChannel),
  onSyncProgress: (cb: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => cb(progress)
    ipcRenderer.on('sync:progress' satisfies OnChannel, handler)
    return () => ipcRenderer.removeListener('sync:progress', handler)
  },

  // ─── Reference Data ──────────────────────────────────────────────────
  getMasterInstruments: () =>
    ipcRenderer.invoke('ref:master-instruments' satisfies InvokeChannel),
  getCustomers: () =>
    ipcRenderer.invoke('ref:customers' satisfies InvokeChannel),

  // ─── VPN ─────────────────────────────────────────────────────────────
  vpnProvision: (token: string) =>
    ipcRenderer.invoke('vpn:provision' satisfies InvokeChannel, token),
  vpnStatus: () =>
    ipcRenderer.invoke('vpn:status' satisfies InvokeChannel),
  isApiReachable: () =>
    ipcRenderer.invoke('app:is-api-reachable' satisfies InvokeChannel),
  listCachedCertificates: (role?: string) =>
    ipcRenderer.invoke('certificates:list-cached' satisfies InvokeChannel, role),
  onSyncStatus: (callback: (status: Record<string, unknown>) => void) => {
    ipcRenderer.on('sync:status', (_event, status) => callback(status))
  },
  getAccessToken: () =>
    ipcRenderer.invoke('auth:get-access-token' satisfies InvokeChannel),
  refreshAccessToken: () =>
    ipcRenderer.invoke('auth:refresh-access-token' satisfies InvokeChannel),
  loadProductionApp: () =>
    ipcRenderer.invoke('app:load-production' satisfies InvokeChannel),
})
