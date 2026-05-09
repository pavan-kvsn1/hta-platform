import crypto from 'crypto'
import { net } from 'electron'
import { type WrappedDb } from './sqlite-db'
import { readImageDecrypted } from './file-store'
import { auditLog, getUnsyncedAuditLogs, markAuditLogsSynced } from './audit'
import { checkDeviceStatus, sendHeartbeat } from './device'

export interface SyncResult {
  drafts: { synced: number; failed: number }
  images: { synced: number; failed: number }
  auditLogs: { synced: number }
}

const EMPTY_RESULT: SyncResult = {
  drafts: { synced: 0, failed: 0 },
  images: { synced: 0, failed: 0 },
  auditLogs: { synced: 0 },
}

export class SyncEngine {
  private syncing = false

  constructor(
    private db: WrappedDb,
    private apiBase: string,
    private getAuthToken: () => Promise<string>,
    private deviceId: string,
    private userId: string,
  ) {}

  async run(): Promise<SyncResult> {
    if (this.syncing || !net.isOnline()) return { ...EMPTY_RESULT }
    this.syncing = true

    const result: SyncResult = {
      drafts: { synced: 0, failed: 0 },
      images: { synced: 0, failed: 0 },
      auditLogs: { synced: 0 },
    }

    try {
      const token = await this.getAuthToken()
      console.log(`[sync-engine] Token: ${token ? token.slice(0, 20) + '...' : 'EMPTY'}`)

      // 1. Check device status (may trigger wipe if REVOKED)
      const status = await checkDeviceStatus(this.apiBase, token)
      console.log(`[sync-engine] Device status: ${status.status}`)
      if (status.status !== 'ACTIVE') return result

      await auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_STARTED', entityType: 'sync',
      })

      // 2. Process draft sync queue
      console.log('[sync-engine] Syncing drafts...')
      result.drafts = await this.syncDrafts(token)
      console.log(`[sync-engine] Drafts: ${result.drafts.synced} synced, ${result.drafts.failed} failed`)

      // 3. Upload unsynced images
      result.images = await this.syncImages(token)
      console.log(`[sync-engine] Images: ${result.images.synced} synced, ${result.images.failed} failed`)

      // 4. Push audit logs to server
      result.auditLogs = await this.syncAuditLogs(token)

      // 5. Update device heartbeat
      await sendHeartbeat(this.apiBase, token)

      // 6. Replenish one-time codes if running low
      await this.replenishCodesIfNeeded(token)

      await auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_COMPLETED', entityType: 'sync',
        metadata: { ...result },
      })
      console.log('[sync-engine] Sync complete')
    } catch (err) {
      console.error('[sync-engine] Sync failed:', err)
      await auditLog(this.db, {
        userId: this.userId, deviceId: this.deviceId,
        action: 'SYNC_FAILED', entityType: 'sync',
        metadata: { error: String(err) },
      }).catch(() => {})
    } finally {
      this.syncing = false
    }

    return result
  }

  // ─── Draft Sync Queue ──────────────────────────────────────────────

  private async syncDrafts(token: string): Promise<{ synced: number; failed: number }> {
    let synced = 0, failed = 0

    const pending = await this.db.all<{
      id: string; draft_id: string; action: string; payload: string; retries: number
    }>(
      `SELECT * FROM sync_queue WHERE status IN ('PENDING', 'FAILED')
       AND retries < max_retries ORDER BY created_at ASC`
    )

    console.log(`[sync-engine] ${pending.length} items in sync queue`)

    for (const item of pending) {
      console.log(`[sync-engine] Processing: ${item.action} draft=${item.draft_id} retries=${item.retries}`)
      await this.db.run(`UPDATE sync_queue SET status = 'IN_PROGRESS' WHERE id = ?`, item.id)

      try {
        const headers: Record<string, string> = {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Tenant-ID': 'hta-calibration',
        }
        const payload = JSON.parse(item.payload)
        // Fix JSON string fields that may have been double-serialized
        // (Prisma Json? fields need actual arrays/objects, not JSON strings)
        const jsonFields = ['calibrationStatus', 'selectedConclusionStatements'] as const
        for (const field of jsonFields) {
          if (typeof payload[field] === 'string') {
            try { payload[field] = JSON.parse(payload[field]) } catch { /* leave as-is */ }
          }
        }
        // Also fix nested parameter bins
        if (Array.isArray(payload.parameters)) {
          for (const param of payload.parameters) {
            if (typeof param.bins === 'string') {
              try { param.bins = JSON.parse(param.bins) } catch { /* leave as-is */ }
            }
          }
        }
        let serverId: string | undefined

        switch (item.action) {
          case 'CREATE': {
            const res = await fetch(`${this.apiBase}/api/certificates`, {
              method: 'POST', headers, body: JSON.stringify(payload),
            })
            if (!res.ok) throw new Error(`Create failed: ${res.status} ${await res.text()}`)
            const body = await res.json() as { id: string }
            serverId = body.id
            break
          }
          case 'UPDATE': {
            const draft = await this.db.get<{ server_id: string }>(
              'SELECT server_id FROM drafts WHERE id = ?', item.draft_id
            )
            if (!draft?.server_id) throw new Error('Cannot update: no server_id')
            const res = await fetch(`${this.apiBase}/api/certificates/${draft.server_id}`, {
              method: 'PUT', headers, body: JSON.stringify(payload),
            })
            if (res.status === 409) {
              // Conflict — server has a newer version
              const body = await res.json() as { serverVersion: unknown }
              await this.db.run(
                `UPDATE drafts SET status = 'CONFLICT', conflict_server_data = ? WHERE id = ?`,
                JSON.stringify(body.serverVersion), item.draft_id
              )
              // Mark queue entry as handled (not a retry-able failure)
              await this.db.run(
                `UPDATE sync_queue SET status = 'CONFLICT', processed_at = datetime('now') WHERE id = ?`,
                item.id
              )
              await auditLog(this.db, {
                userId: this.userId, deviceId: this.deviceId,
                action: 'SYNC_CONFLICT', entityType: 'draft', entityId: item.draft_id,
              })
              failed++
              continue
            }
            if (!res.ok) throw new Error(`Update failed: ${res.status}`)
            break
          }
          case 'SUBMIT': {
            const draft = await this.db.get<{ server_id: string }>(
              'SELECT server_id FROM drafts WHERE id = ?', item.draft_id
            )
            if (!draft?.server_id) throw new Error('Cannot submit: no server_id')
            const res = await fetch(`${this.apiBase}/api/certificates/${draft.server_id}/submit`, {
              method: 'POST', headers,
            })
            if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
            break
          }
        }

        // Mark queue entry as synced
        await this.db.run(
          `UPDATE sync_queue SET status = 'SYNCED', processed_at = datetime('now') WHERE id = ?`,
          item.id
        )

        // Update draft status
        if (serverId) {
          await this.db.run(
            `UPDATE drafts SET status = 'SYNCED', synced_at = datetime('now'), server_id = ? WHERE id = ?`,
            serverId, item.draft_id
          )
        } else {
          await this.db.run(
            `UPDATE drafts SET status = 'SYNCED', synced_at = datetime('now') WHERE id = ?`,
            item.draft_id
          )
        }

        console.log(`[sync-engine] ✓ ${item.action} ${item.draft_id} synced`)
        synced++
      } catch (err) {
        console.error(`[sync-engine] ✗ ${item.action} ${item.draft_id} failed:`, err)
        await this.db.run(
          `UPDATE sync_queue SET status = 'FAILED', retries = retries + 1, last_error = ? WHERE id = ?`,
          String(err), item.id
        )
        failed++
      }
    }

    return { synced, failed }
  }

  // ─── Image Upload ──────────────────────────────────────────────────

  private async syncImages(token: string): Promise<{ synced: number; failed: number }> {
    let synced = 0, failed = 0

    // Only sync images for drafts that have a server_id
    const unsyncedImages = await this.db.all<{
      id: string; local_path: string; mime_type: string; original_name: string
      image_type: string; master_instrument_index: number | null
      parameter_index: number | null; point_number: number | null
      caption: string | null; server_id: string
    }>(
      `SELECT di.*, d.server_id FROM draft_images di
       JOIN drafts d ON d.id = di.draft_id
       WHERE di.synced = 0 AND d.server_id IS NOT NULL`
    )

    for (const img of unsyncedImages) {
      try {
        const buffer = readImageDecrypted(img.local_path)
        if (!buffer) { failed++; continue }

        const formData = new FormData()
        formData.append('file', new Blob([buffer], { type: img.mime_type }), img.original_name)
        formData.append('metadata', JSON.stringify({
          imageType: img.image_type,
          masterInstrumentIndex: img.master_instrument_index,
          parameterIndex: img.parameter_index,
          pointNumber: img.point_number,
          caption: img.caption,
        }))

        const res = await fetch(`${this.apiBase}/api/certificates/${img.server_id}/images`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'X-Tenant-ID': 'hta-calibration' },
          body: formData,
        })

        if (res.ok) {
          await this.db.run('UPDATE draft_images SET synced = 1 WHERE id = ?', img.id)
          synced++
        } else {
          failed++
        }
      } catch {
        failed++
      }
    }

    return { synced, failed }
  }

  // ─── Audit Log Upload ─────────────────────────────────────────────

  private async syncAuditLogs(token: string): Promise<{ synced: number }> {
    const unsynced = await getUnsyncedAuditLogs(this.db, 500)
    if (unsynced.length === 0) return { synced: 0 }

    try {
      // Map SQLite snake_case rows to API camelCase shape
      const mapped = unsynced.map((row: Record<string, unknown>) => ({
        action: row.action,
        entityType: row.entity_type || undefined,
        entityId: row.entity_id || undefined,
        metadata: row.metadata ? (typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : row.metadata) : undefined,
        occurredAt: row.timestamp || new Date().toISOString(),
      }))
      const res = await fetch(`${this.apiBase}/api/devices/${this.deviceId}/audit-logs`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Tenant-ID': 'hta-calibration' },
        body: JSON.stringify({ logs: mapped }),
      })

      if (res.ok) {
        const ids = unsynced.map(l => l.id as string)
        await markAuditLogsSynced(this.db, ids)
        return { synced: unsynced.length }
      }
    } catch { /* Will retry next cycle */ }

    return { synced: 0 }
  }

  // ─── Code Replenishment ────────────────────────────────────────────

  private async replenishCodesIfNeeded(token: string): Promise<void> {
    const row = await this.db.get<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM offline_codes WHERE used = 0'
    )
    const remaining = row?.cnt ?? 0

    if (remaining >= 10) return // Enough codes remaining

    try {
      const res = await fetch(`${this.apiBase}/api/offline-codes/generate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      })

      if (res.ok) {
        const { batchId, pairs } = await res.json() as {
          batchId: string; pairs: { key: string; value: string; sequence: number }[]
        }

        // Clear old codes and insert new batch
        await this.db.run('DELETE FROM offline_codes')

        for (const p of pairs) {
          const hash = crypto.createHash('sha256')
            .update(p.value.toUpperCase().replace(/\s/g, ''))
            .digest('hex')
          await this.db.run(
            'INSERT INTO offline_codes (id, code_hash, key, sequence, batch_id) VALUES (?, ?, ?, ?, ?)',
            crypto.randomUUID(), hash, p.key, p.sequence, batchId
          )
        }

        await auditLog(this.db, {
          userId: this.userId, deviceId: this.deviceId,
          action: 'CODES_REPLENISHED', entityType: 'auth',
          metadata: { batchId, count: pairs.length },
        })
      }
    } catch { /* Will retry next sync cycle */ }
  }
}
