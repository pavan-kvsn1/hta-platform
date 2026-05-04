import crypto from 'crypto'
import type { WrappedDb } from './sqlite-db'

export interface AuditEntry {
  userId: string
  deviceId: string
  action: string
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}

/**
 * Append an entry to the local audit log.
 * The audit_log table has triggers that prevent UPDATE and DELETE,
 * making this an append-only ledger.
 */
export async function auditLog(db: WrappedDb, entry: AuditEntry): Promise<void> {
  await db.run(
    `INSERT INTO audit_log (id, user_id, device_id, action, entity_type, entity_id, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    crypto.randomUUID(),
    entry.userId,
    entry.deviceId,
    entry.action,
    entry.entityType || null,
    entry.entityId || null,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  )
}

/**
 * Get count of unsynced audit log entries.
 */
export async function getUnsyncedAuditCount(db: WrappedDb): Promise<number> {
  const row = await db.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM audit_log WHERE synced = 0')
  return row?.cnt ?? 0
}

/**
 * Get unsynced audit log entries (oldest first, limited batch).
 */
export async function getUnsyncedAuditLogs(db: WrappedDb, limit: number = 500): Promise<Record<string, unknown>[]> {
  return db.all(
    'SELECT * FROM audit_log WHERE synced = 0 ORDER BY timestamp ASC LIMIT ?',
    limit
  )
}

/**
 * Mark audit log entries as synced (only updates the synced flag,
 * which is allowed by the trigger — it only blocks changes to content columns).
 */
export async function markAuditLogsSynced(db: WrappedDb, ids: string[]): Promise<void> {
  for (const id of ids) {
    await db.run('UPDATE audit_log SET synced = 1 WHERE id = ?', id)
  }
}
