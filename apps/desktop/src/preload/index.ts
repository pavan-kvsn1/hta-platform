import { contextBridge, ipcRenderer } from 'electron'

// Strict channel allowlist — only these IPC channels are accessible from renderer
const ALLOWED_INVOKE_CHANNELS = [
  'app:online-status',
  'auth:setup', 'auth:unlock', 'auth:unlock-password-only', 'auth:status', 'auth:get-user-profile', 'auth:logout',
  'draft:create', 'draft:save', 'draft:get', 'draft:list', 'draft:delete',
  'draft:get-conflict', 'draft:resolve-conflict',
  'image:save', 'image:get-path', 'image:list',
  'sync:status', 'sync:trigger',
  'ref:master-instruments', 'ref:customers', 'ref:reviewers',
  'app:is-api-reachable',
  'certificates:list-cached',
  'certificates:get-cached-full',
  'images:get-cached',
  'images:list-cached',
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

// ─── Offline Request Bridge ──────────────────────────────────────────────────
// Translates API-style fetch calls into local IPC calls when offline.
// Returns plain { status, body } — context bridge can't transfer Response objects.
// api-client.ts wraps this into a real Response.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOfflineRequest(url: string, init?: { method?: string; body?: string }): Promise<{ status: number; body: any }> {
  const method = (init?.method || 'GET').toUpperCase()
  const reqBody = init?.body ? JSON.parse(init.body) : undefined

  // GET /api/certificates/:id → draft:get then cached cert
  const getMatch = url.match(/^\/api\/certificates\/([^/?]+)$/)
  if (method === 'GET' && getMatch) {
    const id = getMatch[1]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const draft = await ipcRenderer.invoke('draft:get', id) as any
    if (draft) {
      return { status: 200, body: mapDraftToApi(draft) }
    }
    const cached = await ipcRenderer.invoke('certificates:get-cached-full', id)
    if (cached) {
      return { status: 200, body: cached }
    }
    return { status: 404, body: { error: 'Not available offline' } }
  }

  // PUT /api/certificates/:id → draft:save
  const putMatch = url.match(/^\/api\/certificates\/([^/?]+)$/)
  if (method === 'PUT' && putMatch) {
    const id = putMatch[1]
    const result = await ipcRenderer.invoke('draft:save', id, reqBody)
    if (result?.success) {
      return { status: 200, body: { certificate: { id, updatedAt: new Date().toISOString() } } }
    }
    return { status: 400, body: { error: result?.error || 'Draft save failed' } }
  }

  // POST /api/certificates → draft:create
  if (method === 'POST' && /^\/api\/certificates\/?$/.test(url)) {
    const result = await ipcRenderer.invoke('draft:create', { tenantId: 'hta-calibration', ...reqBody })
    if (result?.success) {
      return { status: 201, body: { certificate: { id: result.id, updatedAt: new Date().toISOString() } } }
    }
    return { status: 400, body: { error: result?.error || 'Draft create failed' } }
  }

  return { status: 503, body: { error: 'Offline — route not handled locally' } }
}

// Safe JSON parse — returns the parsed value or the original string
function tryParse(val: string): unknown {
  try { return JSON.parse(val) } catch { return val }
}

// Map SQLite draft (snake_case) to API shape (camelCase)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDraftToApi(d: any) {
  return {
    id: d.id,
    certificateNumber: d.certificate_number || '',
    status: d.status || 'DRAFT',
    calibratedAt: d.calibrated_at || 'LAB',
    srfNumber: d.srf_number || null,
    srfDate: d.srf_date || null,
    dateOfCalibration: d.date_of_calibration || null,
    calibrationTenure: d.calibration_tenure ?? 12,
    dueDateAdjustment: d.due_date_adjustment ?? 0,
    calibrationDueDate: d.calibration_due_date || null,
    dueDateNotApplicable: !!d.due_date_not_applicable,
    customerName: d.customer_name || null,
    customerAddress: d.customer_address || null,
    customerContactName: d.customer_contact_name || null,
    customerContactEmail: d.customer_contact_email || null,
    customerAccountId: d.customer_account_id || null,
    uucDescription: d.uuc_description || null,
    uucMake: d.uuc_make || null,
    uucModel: d.uuc_model || null,
    uucSerialNumber: d.uuc_serial_number || null,
    uucInstrumentId: d.uuc_instrument_id || null,
    uucLocationName: d.uuc_location_name || null,
    uucMachineName: d.uuc_machine_name || null,
    ambientTemperature: d.ambient_temperature || null,
    relativeHumidity: d.relative_humidity || null,
    calibrationStatus: typeof d.calibration_status === 'string' ? tryParse(d.calibration_status) : d.calibration_status || null,
    stickerOldRemoved: d.sticker_old_removed || null,
    stickerNewAffixed: d.sticker_new_affixed || null,
    statusNotes: d.status_notes || null,
    selectedConclusionStatements: typeof d.selected_conclusion_statements === 'string' ? tryParse(d.selected_conclusion_statements) : d.selected_conclusion_statements || null,
    additionalConclusionStatement: d.additional_conclusion_statement || null,
    engineerNotes: d.engineer_notes || '',
    updatedAt: d.updated_at || new Date().toISOString(),
    currentRevision: d.revision || 1,
    reviewer: d.reviewer_id ? { id: d.reviewer_id, name: null } : null,
    feedbacks: [], events: [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parameters: (d.parameters || []).map((p: any) => ({
      id: p.id,
      parameterName: p.parameter_name || '',
      parameterUnit: p.parameter_unit || '',
      rangeMin: p.range_min || null, rangeMax: p.range_max || null, rangeUnit: p.range_unit || null,
      operatingMin: p.operating_min || null, operatingMax: p.operating_max || null, operatingUnit: p.operating_unit || null,
      leastCountValue: p.least_count_value || null, leastCountUnit: p.least_count_unit || null,
      accuracyValue: p.accuracy_value || null, accuracyUnit: p.accuracy_unit || null, accuracyType: p.accuracy_type || null,
      errorFormula: p.error_formula || null,
      showAfterAdjustment: !!p.show_after_adjustment, requiresBinning: !!p.requires_binning,
      bins: typeof p.bins === 'string' ? tryParse(p.bins) : p.bins || null, sopReference: p.sop_reference || null, masterInstrumentId: p.master_instrument_id || null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      results: (p.results || []).map((r: any) => ({
        id: r.id, pointNumber: r.point_number,
        standardReading: r.standard_reading || null, beforeAdjustment: r.before_adjustment || null,
        afterAdjustment: r.after_adjustment || null, errorObserved: r.error_observed ?? null, isOutOfLimit: !!r.is_out_of_limit,
      })),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    masterInstruments: (d.masterInstruments || []).map((mi: any) => ({
      id: mi.id, masterInstrumentId: String(mi.master_instrument_id || ''),
      sopReference: mi.sop_reference || '', category: mi.category || null,
      description: mi.description || null, make: mi.make || null, model: mi.model || null,
      assetNo: mi.asset_no || null, serialNumber: mi.serial_number || null,
      calibratedAt: mi.calibrated_at || null, reportNo: mi.report_no || null,
      calibrationDueDate: mi.calibration_due_date || null,
    })),
    _isLocalDraft: true,
  }
}

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

  // ─── Offline Request Bridge ──────────────────────────────────────────
  handleOfflineRequest,

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
    ipcRenderer.invoke('sync:get-status' satisfies InvokeChannel),
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
  getReviewers: () =>
    ipcRenderer.invoke('ref:reviewers' satisfies InvokeChannel),

  // ─── VPN ─────────────────────────────────────────────────────────────
  vpnProvision: (token: string) =>
    ipcRenderer.invoke('vpn:provision' satisfies InvokeChannel, token),
  vpnStatus: () =>
    ipcRenderer.invoke('vpn:status' satisfies InvokeChannel),
  isApiReachable: () =>
    ipcRenderer.invoke('app:is-api-reachable' satisfies InvokeChannel),
  listCachedCertificates: (role?: string) =>
    ipcRenderer.invoke('certificates:list-cached' satisfies InvokeChannel, role),
  getCachedCertificateFull: (certId: string) =>
    ipcRenderer.invoke('certificates:get-cached-full' satisfies InvokeChannel, certId),
  getCachedImage: (certificateId: string, imageId: string) =>
    ipcRenderer.invoke('images:get-cached' satisfies InvokeChannel, certificateId, imageId),
  listCachedImages: (certificateId: string) =>
    ipcRenderer.invoke('images:list-cached' satisfies InvokeChannel, certificateId),
  onSyncStatus: (callback: (status: Record<string, unknown>) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: Record<string, unknown>) => callback(status)
    ipcRenderer.on('sync:status', handler)
    return () => ipcRenderer.removeListener('sync:status', handler)
  },
  getAccessToken: () =>
    ipcRenderer.invoke('auth:get-access-token' satisfies InvokeChannel),
  refreshAccessToken: () =>
    ipcRenderer.invoke('auth:refresh-access-token' satisfies InvokeChannel),
  loadProductionApp: () =>
    ipcRenderer.invoke('app:load-production' satisfies InvokeChannel),
})
