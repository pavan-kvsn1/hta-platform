import { ipcMain } from 'electron'
import crypto from 'crypto'
import { getDb } from './sqlite-db'
import { auditLog } from './audit'
import { saveImageEncrypted, readImageDecrypted, deleteImagesForDraft } from './file-store'
import { getDeviceId, getUserId } from './auth'

// ─── Helpers ───────────────────────────────────────────────────────────────

function ids() {
  const userId = getUserId()
  const deviceId = getDeviceId()
  if (!userId || !deviceId) throw new Error('Not authenticated')
  return { userId, deviceId }
}

// ─── Draft CRUD ────────────────────────────────────────────────────────────

interface CreateDraftInput {
  tenantId: string
  certificateNumber?: string
  customerName?: string
  customerAddress?: string
  customerContactName?: string
  customerContactEmail?: string
  customerAccountId?: string
  uucDescription?: string
  uucMake?: string
  uucModel?: string
  uucSerialNumber?: string
  uucInstrumentId?: string
  uucLocationName?: string
  uucMachineName?: string
  dateOfCalibration?: string
  calibrationDueDate?: string
  calibrationTenure?: number
  dueDateAdjustment?: number
  dueDateNotApplicable?: boolean
  ambientTemperature?: string
  relativeHumidity?: string
  srfNumber?: string
  srfDate?: string
  parameters?: ParameterInput[]
}

interface ParameterInput {
  id?: string
  sortOrder: number
  parameterName: string
  parameterUnit: string
  rangeMin?: string
  rangeMax?: string
  rangeUnit?: string
  operatingMin?: string
  operatingMax?: string
  operatingUnit?: string
  leastCountValue?: string
  leastCountUnit?: string
  accuracyValue?: string
  accuracyUnit?: string
  accuracyType?: string
  errorFormula?: string
  showAfterAdjustment?: boolean
  requiresBinning?: boolean
  bins?: unknown
  sopReference?: string
  masterInstrumentId?: string
  results?: ResultInput[]
}

interface ResultInput {
  id?: string
  pointNumber: number
  standardReading?: string
  beforeAdjustment?: string
  afterAdjustment?: string
  errorObserved?: number
  isOutOfLimit?: boolean
}

interface SaveDraftInput extends Omit<CreateDraftInput, 'tenantId'> {
  statusNotes?: string
  calibrationStatus?: unknown
  stickerOldRemoved?: string
  stickerNewAffixed?: string
  selectedConclusionStatements?: unknown
  additionalConclusionStatement?: string
}

interface ImageMeta {
  imageType: string
  originalName?: string
  mimeType?: string
  caption?: string
  masterInstrumentIndex?: number
  parameterIndex?: number
  pointNumber?: number
}

export function registerDraftHandlers(): void {
  // ─── draft:create ──────────────────────────────────────────────────
  ipcMain.handle('draft:create', async (_event, data: CreateDraftInput) => {
    const { userId, deviceId } = ids()
    const db = getDb()
    const id = crypto.randomUUID()

    await db.run(
      `INSERT INTO drafts (
        id, tenant_id, engineer_id,
        certificate_number, customer_name, customer_address,
        customer_contact_name, customer_contact_email, customer_account_id,
        uuc_description, uuc_make, uuc_model, uuc_serial_number,
        uuc_instrument_id, uuc_location_name, uuc_machine_name,
        date_of_calibration, calibration_due_date, calibration_tenure,
        due_date_adjustment, due_date_not_applicable,
        ambient_temperature, relative_humidity,
        srf_number, srf_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, data.tenantId, userId,
      data.certificateNumber || null, data.customerName || null, data.customerAddress || null,
      data.customerContactName || null, data.customerContactEmail || null, data.customerAccountId || null,
      data.uucDescription || null, data.uucMake || null, data.uucModel || null, data.uucSerialNumber || null,
      data.uucInstrumentId || null, data.uucLocationName || null, data.uucMachineName || null,
      data.dateOfCalibration || null, data.calibrationDueDate || null, data.calibrationTenure ?? 12,
      data.dueDateAdjustment ?? 0, data.dueDateNotApplicable ? 1 : 0,
      data.ambientTemperature || null, data.relativeHumidity || null,
      data.srfNumber || null, data.srfDate || null
    )

    // Insert parameters if provided
    if (data.parameters?.length) {
      await insertParameters(db, id, data.parameters)
    }

    await auditLog(db, {
      userId, deviceId,
      action: 'DRAFT_CREATED',
      entityType: 'draft',
      entityId: id,
      metadata: { certificateNumber: data.certificateNumber },
    })

    return { success: true, id }
  })

  // ─── draft:save ────────────────────────────────────────────────────
  ipcMain.handle('draft:save', async (_event, id: string, data: SaveDraftInput) => {
    const { userId, deviceId } = ids()
    const db = getDb()

    // Verify draft exists and belongs to this engineer
    const draft = await db.get<{ id: string; engineer_id: string }>(
      'SELECT id, engineer_id FROM drafts WHERE id = ?', id
    )
    if (!draft) return { success: false, error: 'Draft not found' }
    if (draft.engineer_id !== userId) return { success: false, error: 'Access denied' }

    await db.run(
      `UPDATE drafts SET
        certificate_number = ?, customer_name = ?, customer_address = ?,
        customer_contact_name = ?, customer_contact_email = ?, customer_account_id = ?,
        uuc_description = ?, uuc_make = ?, uuc_model = ?, uuc_serial_number = ?,
        uuc_instrument_id = ?, uuc_location_name = ?, uuc_machine_name = ?,
        date_of_calibration = ?, calibration_due_date = ?, calibration_tenure = ?,
        due_date_adjustment = ?, due_date_not_applicable = ?,
        ambient_temperature = ?, relative_humidity = ?,
        srf_number = ?, srf_date = ?,
        calibration_status = ?, status_notes = ?,
        sticker_old_removed = ?, sticker_new_affixed = ?,
        selected_conclusion_statements = ?, additional_conclusion_statement = ?,
        revision = revision + 1,
        updated_at = datetime('now')
      WHERE id = ?`,
      data.certificateNumber || null, data.customerName || null, data.customerAddress || null,
      data.customerContactName || null, data.customerContactEmail || null, data.customerAccountId || null,
      data.uucDescription || null, data.uucMake || null, data.uucModel || null, data.uucSerialNumber || null,
      data.uucInstrumentId || null, data.uucLocationName || null, data.uucMachineName || null,
      data.dateOfCalibration || null, data.calibrationDueDate || null, data.calibrationTenure ?? 12,
      data.dueDateAdjustment ?? 0, data.dueDateNotApplicable ? 1 : 0,
      data.ambientTemperature || null, data.relativeHumidity || null,
      data.srfNumber || null, data.srfDate || null,
      data.calibrationStatus ? JSON.stringify(data.calibrationStatus) : null,
      data.statusNotes || null,
      data.stickerOldRemoved || null, data.stickerNewAffixed || null,
      data.selectedConclusionStatements ? JSON.stringify(data.selectedConclusionStatements) : null,
      data.additionalConclusionStatement || null,
      id
    )

    // Replace parameters: delete existing, insert new
    if (data.parameters) {
      await db.run('DELETE FROM draft_parameters WHERE draft_id = ?', id)
      if (data.parameters.length) {
        await insertParameters(db, id, data.parameters)
      }
    }

    await auditLog(db, {
      userId, deviceId,
      action: 'DRAFT_UPDATED',
      entityType: 'draft',
      entityId: id,
    })

    return { success: true }
  })

  // ─── draft:get ─────────────────────────────────────────────────────
  ipcMain.handle('draft:get', async (_event, id: string) => {
    const { userId } = ids()
    const db = getDb()

    const draft = await db.get<Record<string, unknown>>(
      'SELECT * FROM drafts WHERE id = ? AND engineer_id = ?', id, userId
    )
    if (!draft) return null

    const parameters = await db.all<Record<string, unknown>>(
      'SELECT * FROM draft_parameters WHERE draft_id = ? ORDER BY sort_order', id
    )

    // Fetch results for each parameter
    for (const param of parameters) {
      const results = await db.all<Record<string, unknown>>(
        'SELECT * FROM draft_calibration_results WHERE parameter_id = ? ORDER BY point_number',
        param.id
      )
      ;(param as Record<string, unknown>).results = results
    }

    const images = await db.all<Record<string, unknown>>(
      'SELECT id, draft_id, image_type, master_instrument_index, parameter_index, point_number, original_name, mime_type, size_bytes, caption, created_at FROM draft_images WHERE draft_id = ?', id
    )

    const masterInstruments = await db.all<Record<string, unknown>>(
      'SELECT * FROM draft_master_instruments WHERE draft_id = ?', id
    )

    return { ...draft, parameters, images, masterInstruments }
  })

  // ─── draft:list ────────────────────────────────────────────────────
  ipcMain.handle('draft:list', async () => {
    const { userId } = ids()
    const db = getDb()

    return db.all<Record<string, unknown>>(
      `SELECT id, certificate_number, customer_name, uuc_description, status, revision,
              created_at, updated_at, synced_at
       FROM drafts WHERE engineer_id = ? ORDER BY updated_at DESC`,
      userId
    )
  })

  // ─── draft:delete ──────────────────────────────────────────────────
  ipcMain.handle('draft:delete', async (_event, id: string) => {
    const { userId, deviceId } = ids()
    const db = getDb()

    const draft = await db.get<{ id: string; engineer_id: string }>(
      'SELECT id, engineer_id FROM drafts WHERE id = ?', id
    )
    if (!draft) return { success: false, error: 'Draft not found' }
    if (draft.engineer_id !== userId) return { success: false, error: 'Access denied' }

    // Delete encrypted images from disk
    deleteImagesForDraft(id)

    // CASCADE deletes parameters, results, images metadata
    await db.run('DELETE FROM drafts WHERE id = ?', id)

    await auditLog(db, {
      userId, deviceId,
      action: 'DRAFT_DELETED',
      entityType: 'draft',
      entityId: id,
    })

    return { success: true }
  })
}

// ─── Conflict Resolution Handlers ──────────────────────────────────────────────

export function registerConflictHandlers(): void {
  // ─── draft:get-conflict ─────────────────────────────────────────────
  // Returns both the local draft and the server version for side-by-side diff
  ipcMain.handle('draft:get-conflict', async (_event, draftId: string) => {
    const { userId } = ids()
    const db = getDb()

    const draft = await db.get<Record<string, unknown>>(
      'SELECT * FROM drafts WHERE id = ? AND engineer_id = ? AND status = ?',
      draftId, userId, 'CONFLICT'
    )
    if (!draft) return null

    // Get local parameters + results
    const parameters = await db.all<Record<string, unknown>>(
      'SELECT * FROM draft_parameters WHERE draft_id = ? ORDER BY sort_order', draftId
    )
    for (const param of parameters) {
      const results = await db.all<Record<string, unknown>>(
        'SELECT * FROM draft_calibration_results WHERE parameter_id = ? ORDER BY point_number',
        param.id
      )
      ;(param as Record<string, unknown>).results = results
    }

    const masterInstruments = await db.all<Record<string, unknown>>(
      'SELECT * FROM draft_master_instruments WHERE draft_id = ?', draftId
    )

    const local = { ...draft, parameters, masterInstruments }

    // Parse server version from conflict_server_data
    let server = null
    if (draft.conflict_server_data) {
      try {
        server = JSON.parse(draft.conflict_server_data as string)
      } catch { /* corrupt data */ }
    }

    return { local, server }
  })

  // ─── draft:resolve-conflict ─────────────────────────────────────────
  // Applies the engineer's resolved values and re-queues for sync
  ipcMain.handle('draft:resolve-conflict', async (_event, draftId: string, resolvedData: SaveDraftInput & { parameters?: ParameterInput[] }) => {
    const { userId, deviceId } = ids()
    const db = getDb()

    const draft = await db.get<{ id: string; engineer_id: string; server_id: string; status: string }>(
      'SELECT id, engineer_id, server_id, status FROM drafts WHERE id = ?', draftId
    )
    if (!draft) return { success: false, error: 'Draft not found' }
    if (draft.engineer_id !== userId) return { success: false, error: 'Access denied' }
    if (draft.status !== 'CONFLICT') return { success: false, error: 'Draft is not in conflict' }

    // Update draft with resolved values
    await db.run(
      `UPDATE drafts SET
        certificate_number = ?, customer_name = ?, customer_address = ?,
        customer_contact_name = ?, customer_contact_email = ?, customer_account_id = ?,
        uuc_description = ?, uuc_make = ?, uuc_model = ?, uuc_serial_number = ?,
        uuc_instrument_id = ?, uuc_location_name = ?, uuc_machine_name = ?,
        date_of_calibration = ?, calibration_due_date = ?, calibration_tenure = ?,
        due_date_adjustment = ?, due_date_not_applicable = ?,
        ambient_temperature = ?, relative_humidity = ?,
        srf_number = ?, srf_date = ?,
        calibration_status = ?, status_notes = ?,
        sticker_old_removed = ?, sticker_new_affixed = ?,
        selected_conclusion_statements = ?, additional_conclusion_statement = ?,
        status = 'LOCAL_DRAFT',
        conflict_server_data = NULL,
        revision = revision + 1,
        updated_at = datetime('now')
      WHERE id = ?`,
      resolvedData.certificateNumber || null, resolvedData.customerName || null, resolvedData.customerAddress || null,
      resolvedData.customerContactName || null, resolvedData.customerContactEmail || null, resolvedData.customerAccountId || null,
      resolvedData.uucDescription || null, resolvedData.uucMake || null, resolvedData.uucModel || null, resolvedData.uucSerialNumber || null,
      resolvedData.uucInstrumentId || null, resolvedData.uucLocationName || null, resolvedData.uucMachineName || null,
      resolvedData.dateOfCalibration || null, resolvedData.calibrationDueDate || null, resolvedData.calibrationTenure ?? 12,
      resolvedData.dueDateAdjustment ?? 0, resolvedData.dueDateNotApplicable ? 1 : 0,
      resolvedData.ambientTemperature || null, resolvedData.relativeHumidity || null,
      resolvedData.srfNumber || null, resolvedData.srfDate || null,
      resolvedData.calibrationStatus ? JSON.stringify(resolvedData.calibrationStatus) : null,
      resolvedData.statusNotes || null,
      resolvedData.stickerOldRemoved || null, resolvedData.stickerNewAffixed || null,
      resolvedData.selectedConclusionStatements ? JSON.stringify(resolvedData.selectedConclusionStatements) : null,
      resolvedData.additionalConclusionStatement || null,
      draftId
    )

    // Replace parameters with resolved versions
    if (resolvedData.parameters) {
      await db.run('DELETE FROM draft_parameters WHERE draft_id = ?', draftId)
      if (resolvedData.parameters.length) {
        await insertParameters(db, draftId, resolvedData.parameters)
      }
    }

    // Re-queue for sync as UPDATE
    const payload = { ...resolvedData, clientUpdatedAt: new Date().toISOString() }
    await db.run(
      `INSERT INTO sync_queue (id, draft_id, action, payload) VALUES (?, ?, 'UPDATE', ?)`,
      crypto.randomUUID(), draftId, JSON.stringify(payload)
    )

    await auditLog(db, {
      userId, deviceId,
      action: 'CONFLICT_RESOLVED',
      entityType: 'draft',
      entityId: draftId,
    })

    return { success: true }
  })
}

// ─── Image Handlers ──────────────────────────────────────────────────────────

export function registerImageHandlers(): void {
  // ─── image:save ────────────────────────────────────────────────────
  ipcMain.handle('image:save', async (_event, draftId: string, meta: ImageMeta, arrayBuffer: ArrayBuffer) => {
    const { userId, deviceId } = ids()
    const db = getDb()

    // Verify draft ownership
    const draft = await db.get<{ engineer_id: string }>(
      'SELECT engineer_id FROM drafts WHERE id = ?', draftId
    )
    if (!draft || draft.engineer_id !== userId) {
      return { success: false, error: 'Draft not found or access denied' }
    }

    const buffer = Buffer.from(arrayBuffer)
    const extension = (meta.mimeType?.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const { localPath, id, sizeBytes } = saveImageEncrypted(draftId, buffer, extension)

    await db.run(
      `INSERT INTO draft_images (
        id, draft_id, image_type, master_instrument_index, parameter_index,
        point_number, local_path, original_name, mime_type, size_bytes, caption
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, draftId, meta.imageType,
      meta.masterInstrumentIndex ?? null, meta.parameterIndex ?? null,
      meta.pointNumber ?? null, localPath,
      meta.originalName || null, meta.mimeType || null, sizeBytes, meta.caption || null
    )

    await auditLog(db, {
      userId, deviceId,
      action: 'IMAGE_ATTACHED',
      entityType: 'image',
      entityId: id,
      metadata: { draftId, imageType: meta.imageType, sizeBytes },
    })

    return { success: true, id, sizeBytes }
  })

  // ─── image:get-path ────────────────────────────────────────────────
  ipcMain.handle('image:get-path', async (_event, imageId: string) => {
    const { userId } = ids()
    const db = getDb()

    const image = await db.get<{ local_path: string; draft_id: string; mime_type: string }>(
      'SELECT local_path, draft_id, mime_type FROM draft_images WHERE id = ?', imageId
    )
    if (!image) return null

    // Verify draft ownership
    const draft = await db.get<{ engineer_id: string }>(
      'SELECT engineer_id FROM drafts WHERE id = ?', image.draft_id
    )
    if (!draft || draft.engineer_id !== userId) return null

    const buffer = readImageDecrypted(image.local_path)
    if (!buffer) return null

    // Return as base64 data URL for renderer display
    const mimeType = image.mime_type || 'image/jpeg'
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  })

  // ─── image:list ────────────────────────────────────────────────────
  ipcMain.handle('image:list', async (_event, draftId: string) => {
    const { userId } = ids()
    const db = getDb()

    // Verify draft ownership
    const draft = await db.get<{ engineer_id: string }>(
      'SELECT engineer_id FROM drafts WHERE id = ?', draftId
    )
    if (!draft || draft.engineer_id !== userId) return []

    return db.all<Record<string, unknown>>(
      `SELECT id, image_type, master_instrument_index, parameter_index,
              point_number, original_name, mime_type, size_bytes, caption, created_at
       FROM draft_images WHERE draft_id = ? ORDER BY created_at`,
      draftId
    )
  })
}

// ─── Parameter Insert Helper ─────────────────────────────────────────────────

async function insertParameters(
  db: ReturnType<typeof getDb>,
  draftId: string,
  parameters: ParameterInput[]
): Promise<void> {
  for (const param of parameters) {
    const paramId = param.id || crypto.randomUUID()

    await db.run(
      `INSERT INTO draft_parameters (
        id, draft_id, sort_order, parameter_name, parameter_unit,
        range_min, range_max, range_unit,
        operating_min, operating_max, operating_unit,
        least_count_value, least_count_unit,
        accuracy_value, accuracy_unit, accuracy_type,
        error_formula, show_after_adjustment, requires_binning, bins,
        sop_reference, master_instrument_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      paramId, draftId, param.sortOrder, param.parameterName, param.parameterUnit,
      param.rangeMin || null, param.rangeMax || null, param.rangeUnit || null,
      param.operatingMin || null, param.operatingMax || null, param.operatingUnit || null,
      param.leastCountValue || null, param.leastCountUnit || null,
      param.accuracyValue || null, param.accuracyUnit || null, param.accuracyType || 'ABSOLUTE',
      param.errorFormula || 'A-B', param.showAfterAdjustment ? 1 : 0,
      param.requiresBinning ? 1 : 0, param.bins ? JSON.stringify(param.bins) : null,
      param.sopReference || null, param.masterInstrumentId || null
    )

    // Insert calibration results if provided
    if (param.results?.length) {
      for (const result of param.results) {
        await db.run(
          `INSERT INTO draft_calibration_results (
            id, parameter_id, point_number, standard_reading,
            before_adjustment, after_adjustment, error_observed, is_out_of_limit
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          result.id || crypto.randomUUID(), paramId, result.pointNumber,
          result.standardReading || null, result.beforeAdjustment || null,
          result.afterAdjustment || null, result.errorObserved ?? null,
          result.isOutOfLimit ? 1 : 0
        )
      }
    }
  }
}
