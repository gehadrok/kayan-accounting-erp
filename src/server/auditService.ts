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

export async function getAuditLogs(limit = 100) {
  const db = await getDb();
  const res = await db.query(
    `SELECT * FROM audit.audit_logs ORDER BY timestamp DESC LIMIT $1`,
    [limit]
  );
  return res.rows;
}
