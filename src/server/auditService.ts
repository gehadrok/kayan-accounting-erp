import { getDb } from './db.ts';

export interface AuditLogParams {
  userId?: string;
  username?: string;
  action: 'LOGIN' | 'CREATE' | 'UPDATE' | 'POST' | 'REVERSE' | 'DELETE_ATTEMPT' | 'EXPORT' | 'PRINT' | string;
  entityType: string;
  entityId?: string;
  oldData?: any;
  newData?: any;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAudit(params: AuditLogParams) {
  try {
    const db = await getDb();
    // V26 set a row-security policy binding every audit row to the request's
    // session actor (kayan.user_id). Service-layer callers historically rely
    // on that implicit actor, so when the caller passes no userId, read it
    // from the request session instead of inserting a NULL owner (which the
    // policy rejects — and silently drops the audit trail).
    if (!params.userId) {
      try {
        const sessionRes = await db.query<{ user_id: string }>(
          "SELECT NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID AS user_id"
        );
        params.userId = sessionRes.rows[0]?.user_id || undefined;
      } catch {
        // No session context available (boot code/tests) — insert as before.
      }
    }
    await db.query(
      `INSERT INTO audit.audit_logs 
       (user_id, username, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        params.userId || null,
        params.username || 'جهاد الصليحي',
        params.action,
        params.entityType,
        params.entityId || null,
        params.oldData ? JSON.stringify(params.oldData) : null,
        params.newData ? JSON.stringify(params.newData) : null,
        params.ipAddress || '127.0.0.1',
        params.userAgent || 'Kayan-ERP-Client/1.0',
      ]
    );
  } catch (err) {
    console.error('[Audit Log Error]', err);
  }
}

/**
 * Strict audit write for voucher edit (PUT) — same columns as logAudit, but a
 * failure is NOT swallowed: the caller (inside withTransaction) rolls back
 * the entire voucher update. Use only inside a transaction.
 */
export async function logAuditStrict(params: AuditLogParams) {
  const db = await getDb();
  if (!params.userId) {
    const sessionRes = await db.query<{ user_id: string }>(
      "SELECT NULLIF(current_setting('kayan.user_id', TRUE), '')::UUID AS user_id"
    ).catch(() => null);
    params.userId = sessionRes?.rows[0]?.user_id || undefined;
  }
  await db.query(
    `INSERT INTO audit.audit_logs 
     (user_id, username, action, entity_type, entity_id, old_data, new_data, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      params.userId || null,
      params.username || 'جهاد الصليحي',
      params.action,
      params.entityType,
      params.entityId || null,
      params.oldData ? JSON.stringify(params.oldData) : null,
      params.newData ? JSON.stringify(params.newData) : null,
      params.ipAddress || '127.0.0.1',
      params.userAgent || 'Kayan-ERP-Client/1.0',
    ]
  );
}

export async function getAuditLogs(limit = 100) {
  const db = await getDb();
  const res = await db.query(
    `SELECT * FROM audit.audit_logs ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}
