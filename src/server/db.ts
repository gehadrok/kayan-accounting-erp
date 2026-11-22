import { PGlite } from '@electric-sql/pglite';
import { NodeFS } from '@electric-sql/pglite/nodefs';
import fs from 'fs';
import path from 'path';

// Global singleton instance for PostgreSQL
let pgInstance: PGlite | null = null;
let initPromise: Promise<PGlite> | null = null;

// PHASE 10.4 — persistent local storage.
//
// `new PGlite()` with no argument is an IN-MEMORY database: it lives inside the
// Node process and every document, return and journal entry is destroyed the
// moment the process ends. `NodeFS` binds PGlite to a real PGDATA directory on
// disk instead, so data survives a restart.
const DATA_DIR = path.resolve(process.cwd(), process.env.PGLITE_DATA_DIR || '.pgdata');

// Opening a brand-new data directory is a DESTRUCTIVE-LOOKING event: PGlite
// would happily create an empty cluster, the migrations would run, the seed
// would populate it, and the server would start up looking perfectly healthy
// while every real document has silently vanished. That is the one failure mode
// this guard exists to prevent, so a missing/empty data directory is refused
// unless the operator opts in explicitly via PGLITE_BOOTSTRAP=1.
const BOOTSTRAP_ALLOWED = process.env.PGLITE_BOOTSTRAP === '1';

export function getDataDir(): string {
  return DATA_DIR;
}

/** True when DATA_DIR already holds a real PostgreSQL data directory. */
export function isExistingDataDir(): boolean {
  try {
    return fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'));
  } catch {
    return false;
  }
}

export async function getDb(): Promise<PGlite> {
  if (pgInstance) {
    return pgInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      if (!isExistingDataDir() && !BOOTSTRAP_ALLOWED) {
        throw new Error(
          `PHASE 10.4 — refusing to start on an empty database.\n` +
          `  Data directory: ${DATA_DIR}\n` +
          `  No PG_VERSION was found there, so this is not an existing Kayan database.\n` +
          `  Starting anyway would create a fresh, seeded-but-empty database and\n` +
          `  every existing document would appear to have vanished.\n` +
          `  To create the database for the first time, start the server once with:\n` +
          `      PGLITE_BOOTSTRAP=1 npm run dev\n` +
          `  To restore existing data instead, place a backup in ${DATA_DIR} first.`,
        );
      }

      // PGlite on NodeFS can leave behind postmaster.pid if terminated abruptly.
      // Postgres WASM aborts on startup if postmaster.pid already exists in DATA_DIR.
      const pidPath = path.join(DATA_DIR, 'postmaster.pid');
      if (fs.existsSync(pidPath)) {
        try {
          fs.unlinkSync(pidPath);
          console.warn('[PostgreSQL] Removed stale postmaster.pid before starting.');
        } catch (warnErr) {
          console.warn('[PostgreSQL] Could not remove stale postmaster.pid:', warnErr);
        }
      }

      let db: PGlite;
      try {
        db = new PGlite(DATA_DIR, { fs: new NodeFS(DATA_DIR) });
        await db.waitReady;
      } catch (err: any) {
        // Never fall through to a fresh instance here: an unreadable or corrupt
        // directory must surface as a startup failure, never as an empty DB.
        throw new Error(
          `PHASE 10.4 — failed to open the persistent database at ${DATA_DIR}.\n` +
          `  ${err?.message || err}\n` +
          `  The database was NOT replaced or re-initialised. Nothing was written.`,
        );
      }

      await runMigrations(db);
      pgInstance = db;
      return db;
    })();
  }

  return initPromise;
}

/**
 * PHASE 10.4 — flush and release the persistent database.
 *
 * Must be awaited before the process exits, otherwise the last writes sitting
 * in the PGlite filesystem layer may not reach disk. Wired to SIGINT/SIGTERM
 * in server.ts. Safe to call more than once.
 */
export async function closeDb(): Promise<void> {
  if (!pgInstance) return;
  const db = pgInstance;
  pgInstance = null;
  initPromise = null;
  await db.close();
  console.log('[PostgreSQL] Persistent database closed and flushed.');
}

export async function runMigrations(db: PGlite) {
  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const migrationFiles = [
    'V1__core.sql',
    'V2__security.sql',
    'V3__accounting.sql',
    'V4__audit.sql',
    'V5__seed.sql',
    'V6__sales.sql',
    'V7__purchasing.sql',
    'V8__inventory.sql',
    'V9__cash_banking.sql',
    'V10__fixed_assets_expenses.sql',
    'V11__reporting_period_closing.sql',
    'V12__returns.sql',
    'V13__central_settings.sql',
    'V14__lookup_indexes.sql',
    'V15__line_item_warehouse_fields.sql',
    'V16__purchase_return_integrity.sql',
    'V17__return_economics_integrity.sql',
    'V18__transfer_valuation_consistency.sql',
    'V19__purchase_return_line_guards.sql',
    'V20__receipt_exact_cost_policy.sql',
    'V21__company_identity.sql',
    'V22__admin_password_recovery.sql',
    'V23__user_management_rbac.sql',
    'V24__permission_catalog.sql',
    'V25__ui_preferences.sql',
    'V26__user_data_scopes.sql',
    'V27__company_scope_branch_access.sql',
    'V28__audit_public_writes.sql',
    'V29__account_currency_codes.sql',
    'V30__voucher_counterparty.sql',
    'V31__company_scope_backfill.sql',
  ];

  // Create schema migrations tracking table using exec for multi-statement execution
  await db.exec(`
    CREATE SCHEMA IF NOT EXISTS core;
    CREATE TABLE IF NOT EXISTS core.schema_migrations (
      version VARCHAR(50) PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  for (const file of migrationFiles) {
    const version = file.split('__')[0];
    const check = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM core.schema_migrations WHERE version = $1`,
      [version]
    );

    if (parseInt(check.rows[0]?.count || '0', 10) === 0) {
      console.log(`[PostgreSQL Migration] Applying ${file}...`);
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        const sql = fs.readFileSync(filePath, 'utf-8');
        await db.exec(sql);
        await db.query(
          `INSERT INTO core.schema_migrations (version) VALUES ($1)`,
          [version]
        );
        console.log(`[PostgreSQL Migration] ${file} applied successfully.`);
      }
    }
  }
}

/**
 * PHASE 9.1 — Atomic transaction helper built on the existing PGlite
 * singleton connection (same mechanism as every other query in the
 * codebase: `db.query`). PGlite exposes a single connection, so issuing
 * BEGIN on the shared instance wraps all subsequent sequential queries —
 * including those issued inside service methods via `getDb()` — in one
 * atomic unit until COMMIT/ROLLBACK.
 *
 * Usage: wrap an entire posting flow (validate-first, then all writes)
 * so a failure anywhere leaves NO partial state behind
 * (no DRAFT invoice + POSTED journal, no GL without inventory, etc.).
 *
 * PHASE 10.6.4 — the helper is now reentrant: a call made while a
 * transaction is already open runs inside that transaction instead of
 * issuing a second BEGIN, and its failure still rolls back everything.
 */
// Reentrancy depth (PHASE 10.6.4): see withTransaction docs below.
let txDepth = 0;

export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  // PHASE 10.6.4 — reentrancy guard. Services that open their own transaction
  // (create invoice/receipt/payment, post receipt/payment, void invoice)
  // are ALSO called from inside a larger posting flow that already holds the
  // shared connection's transaction (postSalesInvoice, postPurchaseInvoice).
  // PGlite exposes ONE connection, so issuing a nested BEGIN would fail.
  // When a transaction is already open the caller's work simply runs inside
  // it: any failure still propagates to the outermost wrapper, which owns
  // BEGIN/COMMIT/ROLLBACK. The atomic guarantee is unchanged — nesting just
  // stops double-opening.
  if (txDepth > 0) {
    return fn();
  }
  const db = await getDb();
  txDepth++;
  await db.query('BEGIN');
  try {
    const result = await fn();
    await db.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await db.query('ROLLBACK');
    } catch {
      // ROLLBACK itself must never mask the original error
    }
    throw err;
  } finally {
    txDepth--;
  }
}
