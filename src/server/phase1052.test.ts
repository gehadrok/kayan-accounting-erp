import assert from 'assert';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchesEntrySearch } from '../pages/journalEntrySearch.ts';

/**
 * PHASE 10.5.2 — Settings Security & Regression Verification.
 *
 * FULLY ISOLATED FROM THE OPERATIONAL DATABASE: this suite spawns its own
 * server process on its own port with a throwaway PGLITE directory (never
 * `.pgdata`), so nothing here can touch real accounting or settings data.
 *
 * Covered:
 *   1. HTTP security matrix for settings writes:
 *      401 (no/forged session) · 403 (permission) · 200 (allowed) ·
 *      deny-by-default for unknown keys · bulk validate-before-write ·
 *      identity ALWAYS from the token (forged body userId/username ignored) ·
 *      audit read guarded · settings reads stay open (app boot).
 *   2. Contract/root-cause checks: list endpoint returns camelCase
 *      entryNumber; App.tsx routes /journal-entries; search predicate units.
 *   3. Immutability proof: full settings map and full journal-entry list are
 *      deep-equal to the baseline captured before any test write.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT = 3100 + (process.pid % 800);
const BASE = `http://127.0.0.1:${PORT}/api`;

const LOW_USER = {
  username: 'phase1052_low',
  fullName: 'Phase 10.5.2 Low Priv User',
  email: 'phase1052_low@test.local',
  password: 'Phase1052!pass',
  roleName: 'PHASE1052_NOPERM',
};

let passed = 0;
let failed = 0;

function pass(msg: string) {
  passed++;
  console.log(`✅ [PASS] ${msg}`);
}

function fail(msg: string, detail?: any): never {
  failed++;
  console.log(`❌ [FAIL] ${msg}`);
  if (detail !== undefined) console.log(`         ${String(detail)}`);
  throw new Error(`FAILED: ${msg}`);
}

function check(cond: boolean, msg: string, detail?: any) {
  if (cond) pass(msg);
  else fail(msg, detail);
}

async function api(
  method: string,
  urlPath: string,
  body?: any,
  token?: string
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(username: string, password: string): Promise<{ status: number; token: string; id: string; json: any }> {
  const r = await api('POST', '/auth/login', { username, password });
  return { status: r.status, token: r.json?.token, id: r.json?.id, json: r.json };
}

function flattenMap(payload: any): Record<string, any> {
  const groups = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.settings : payload;
  const rows: any[] = Array.isArray(groups)
    ? groups
    : groups && typeof groups === 'object'
      ? Object.values(groups).flat()
      : [];
  const out: Record<string, any> = {};
  for (const row of rows) {
    if (!row || typeof row.key !== 'string') continue;
    out[row.key] = row.value !== null && row.value !== undefined ? row.value : row.defaultValue;
  }
  return out;
}

async function rawSettingRows(): Promise<any[]> {
  const r = await api('GET', '/settings');
  const groups = r.json?.settings ?? r.json;
  const rows: any[] = Array.isArray(groups)
    ? groups
    : groups && typeof groups === 'object'
      ? Object.values(groups).flat()
      : [];
  return rows.filter((row) => row && typeof row.key === 'string');
}

async function waitForServer(child: ChildProcess, output: { text: string }): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server child exited early (code ${child.exitCode}):\n${output.text}`);
    }
    try {
      const res = await fetch(`${BASE}/settings`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server did not become ready on port ${PORT} within 180s:\n${output.text}`);
}

function stopChild(child: ChildProcess) {
  try {
    if (IS_WINDOWS && child.pid) {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        return;
      } catch {
        /* fall through */
      }
    }
    child.kill('SIGTERM' as any);
  } catch {
    /* already dead */
  }
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Phase 10.5.2 — Settings Security & Regression Verification');
  console.log(`   isolated server port=${PORT} (operational .pgdata untouched)`);
  console.log('================================================================');

  // ---------------------------------------------------------------
  // Setup: throwaway DB + isolated server process
  // ---------------------------------------------------------------
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1052-'));
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  if (!fs.existsSync(tsxCli)) throw new Error(`tsx cli not found: ${tsxCli}`);

  const output = { text: '' };
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      PGLITE_DATA_DIR: dataDir,
      PGLITE_BOOTSTRAP: '1',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk: Buffer) => { output.text += chunk.toString(); };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  let baselineMap: Record<string, any>;
  let baselineRawRows: any[];
  let baselineEntries: any[];
  let adminToken: string;
  let adminId: string;
  let lowToken: string;

  try {
    await waitForServer(child, output);
    pass('1. isolated server ready on fresh throwaway PGLITE dir');

    // ---------------------------------------------------------------
    // Baseline snapshots (BEFORE any test write)
    // ---------------------------------------------------------------
    const s0 = await api('GET', '/settings');
    check(s0.status === 200, '2. GET /api/settings works WITHOUT a session (reads stay open for app boot)');
    baselineMap = flattenMap(s0.json);
    check(Object.keys(baselineMap).length > 0, `2.1 baseline settings map captured (${Object.keys(baselineMap).length} keys)`);

    // RAW rows (value + defaultValue) captured BEFORE any test write, so the
    // restore step at the end puts back exactly what was there originally.
    baselineRawRows = await rawSettingRows();

    const e0 = await api('GET', '/journal-entries?limit=100000');
    check(e0.status === 200 && Array.isArray(e0.json), '3. baseline journal-entry list captured');
    baselineEntries = e0.json as any[];

    const a0 = await login('admin', 'admin123');
    check(a0.status === 200 && !!a0.token, '4. admin/admin123 login issues a signed session token');
    adminToken = a0.token;
    adminId = a0.id;
    check(!!adminId, '4.1 login response carries the real user id');

    // ---------------------------------------------------------------
    // 401: anonymous / forged session
    // ---------------------------------------------------------------
    const anonProtected = await api('PUT', '/settings/reports.decimal_places', { value: 3 });
    check(anonProtected.status === 401, '5. PUT protected key with NO session → 401', `got ${anonProtected.status}`);

    const anonPersonal = await api('PUT', '/settings/ui.theme', { value: 'dark' });
    check(anonPersonal.status === 401, '6. PUT personal ui.* key with NO session → 401 (all writes need a session)', `got ${anonPersonal.status}`);

    const forgedToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.not-a-real-signature';
    const forged = await api('PUT', '/settings/reports.decimal_places', { value: 3 }, forgedToken);
    check(forged.status === 401, '7. PUT protected key with FORGED token → 401', `got ${forged.status}`);

    const anonBulk = await api('POST', '/settings/bulk', { settings: [{ key: 'ui.language', value: 'ar' }] });
    check(anonBulk.status === 401, '8. POST /settings/bulk with NO session → 401', `got ${anonBulk.status}`);

    const anonReset = await api('POST', '/settings/reset/ui.theme');
    check(anonReset.status === 401, '9. POST /settings/reset/:key with NO session → 401', `got ${anonReset.status}`);

    const anonAudit = await api('GET', '/settings/audit');
    check(anonAudit.status === 401, '10. GET /settings/audit with NO session → 401', `got ${anonAudit.status}`);

    // ---------------------------------------------------------------
    // 200: admin allowed (protected + personal) + forged identity ignored
    // ---------------------------------------------------------------
    const adminPut = await api(
      'PUT',
      '/settings/reports.decimal_places',
      { value: 3, reason: 'phase1052 protected write', userId: '00000000-0000-0000-0000-000000000000', username: 'attacker' },
      adminToken
    );
    check(adminPut.status === 200, '11. admin PUT protected key → 200', `got ${adminPut.status}: ${JSON.stringify(adminPut.json)}`);

    const afterAdminPut = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(String(afterAdminPut['reports.decimal_places']) === '3', '11.1 protected value persisted (reports.decimal_places = 3)', afterAdminPut['reports.decimal_places']);

    const adminPersonal = await api('PUT', '/settings/ui.theme', { value: 'dark', reason: 'phase1052 personal write' }, adminToken);
    check(adminPersonal.status === 200, '12. admin PUT personal ui.theme → 200', `got ${adminPersonal.status}`);

    const auditRows = await api('GET', '/settings/audit?limit=200', undefined, adminToken);
    check(auditRows.status === 200 && Array.isArray(auditRows.json), '13. admin GET /settings/audit → 200 array');
    const latestDp = (auditRows.json as any[]).find((r) => r.setting_key === 'reports.decimal_places');
    check(!!latestDp, '13.1 audit row exists for the protected write');
    check(
      latestDp.user_id === adminId && latestDp.username === 'admin',
      '13.2 audit identity comes from the TOKEN, not the forged body userId/username',
      `audit user_id=${latestDp.user_id} username=${latestDp.username} (admin=${adminId})`
    );

    // ---------------------------------------------------------------
    // Low-privilege user (created through the guarded admin APIs)
    // ---------------------------------------------------------------
    const roleRes = await api('POST', '/settings/roles', { name: LOW_USER.roleName, description: 'phase1052 no permissions' }, adminToken);
    check(roleRes.status === 201 && !!roleRes.json?.role?.id, '14. admin creates a permission-less role', JSON.stringify(roleRes.json));
    const lowRoleId = roleRes.json.role.id;

    const permsPut = await api('PUT', `/settings/roles/${lowRoleId}/permissions`, { permissionIds: [] }, adminToken);
    check(permsPut.status === 200, '14.1 role explicitly granted an EMPTY permission set', `got ${permsPut.status}: ${JSON.stringify(permsPut.json)}`);

    const userRes = await api('POST', '/settings/users', {
      username: LOW_USER.username,
      fullName: LOW_USER.fullName,
      email: LOW_USER.email,
      password: LOW_USER.password,
      roleId: lowRoleId,
      isActive: true,
    }, adminToken);
    check(userRes.status === 201, '15. admin creates the low-privilege user', JSON.stringify(userRes.json));

    const lowLogin = await login(LOW_USER.username, LOW_USER.password);
    check(lowLogin.status === 200 && !!lowLogin.token, '16. low-privilege user can log in', `got ${lowLogin.status}: ${JSON.stringify(lowLogin.json)}`);
    lowToken = lowLogin.token;

    const lowRead = await api('GET', '/settings', undefined, lowToken);
    check(lowRead.status === 200, '17. low-privilege user can still READ settings', `got ${lowRead.status}`);

    // ---------------------------------------------------------------
    // 403: permission denials + forged identity in the body
    // ---------------------------------------------------------------
    const lowProtected = await api('PUT', '/settings/reports.decimal_places', { value: 1 }, lowToken);
    check(lowProtected.status === 403, '18. low-priv PUT protected key → 403', `got ${lowProtected.status}`);
    check(
      String(lowProtected.json?.error || '').includes('system.settings.manage'),
      '18.1 403 error names the required permission',
      lowProtected.json?.error
    );

    const dpAuditBefore = ((await api('GET', '/settings/audit?limit=200', undefined, adminToken)).json as any[])
      .filter((r) => r.setting_key === 'ui.confirm_before_post').length;
    const lowForged = await api(
      'PUT',
      '/settings/ui.confirm_before_post',
      { value: false, userId: adminId, username: 'admin', branchId: 'forged-branch', companyId: 'forged-company' },
      lowToken
    );
    check(lowForged.status === 403, '19. low-priv PUT protected key with FORGED body identity (admin userId/username) → 403', `got ${lowForged.status}`);
    const dpAuditAfter = ((await api('GET', '/settings/audit?limit=200', undefined, adminToken)).json as any[])
      .filter((r) => r.setting_key === 'ui.confirm_before_post').length;
    check(dpAuditBefore === dpAuditAfter, '19.1 rejected write left NO audit row (nothing was persisted)', `${dpAuditBefore} → ${dpAuditAfter}`);

    const lowPersonal = await api('PUT', '/settings/ui.density', { value: 'compact', reason: 'phase1052 low personal' }, lowToken);
    check(lowPersonal.status === 200, '20. low-priv PUT personal ui.density → 200 (allowed without system.settings.manage)', `got ${lowPersonal.status}`);
    const afterLowPersonal = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(afterLowPersonal['ui.density'] === 'compact', '20.1 personal value persisted', afterLowPersonal['ui.density']);

    const lowUnknown = await api('PUT', '/settings/ui.session_lock_minutes', { value: 30 }, lowToken);
    check(lowUnknown.status === 403, '21. low-priv PUT UNKNOWN key → 403 (deny-by-default, not silently world-writable)', `got ${lowUnknown.status}`);

    const adminUnknown = await api('PUT', '/settings/ui.session_lock_minutes', { value: 30 }, adminToken);
    check(adminUnknown.status === 400, '22. admin PUT unknown key → 400 (nonexistent-key validation preserved)', `got ${adminUnknown.status}`);

    // ---------------------------------------------------------------
    // Bulk: validate BEFORE write — a rejected batch persists nothing
    // ---------------------------------------------------------------
    const lowBulk = await api('POST', '/settings/bulk', {
      settings: [
        { key: 'ui.language', value: 'ar' },
        { key: 'ui.confirm_before_post', value: false },
      ],
    }, lowToken);
    check(lowBulk.status === 403, '23. low-priv bulk containing a protected key → 403', `got ${lowBulk.status}`);
    const afterLowBulk = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(
      afterLowBulk['ui.language'] === baselineMap['ui.language'],
      '23.1 rejected bulk wrote NOTHING — the personal item in the batch stayed untouched (validate-before-write)',
      `ui.language=${afterLowBulk['ui.language']} (baseline ${baselineMap['ui.language']})`
    );

    const adminBulk = await api('POST', '/settings/bulk', {
      settings: [
        { key: 'ui.language', value: 'ar' },
        { key: 'ui.confirm_before_post', value: false },
      ],
      reason: 'phase1052 admin bulk',
    }, adminToken);
    check(adminBulk.status === 200 && adminBulk.json?.updatedCount === 2, '24. admin bulk (personal + protected) → 200, 2 updated', JSON.stringify(adminBulk.json));
    const afterAdminBulk = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(afterAdminBulk['ui.language'] === 'ar' && String(afterAdminBulk['ui.confirm_before_post']) === 'false', '24.1 both bulk values persisted');

    // ---------------------------------------------------------------
    // Reset: same gate, identity from token
    // ---------------------------------------------------------------
    const lowReset = await api('POST', '/settings/reset/reports.decimal_places', undefined, lowToken);
    check(lowReset.status === 403, '25. low-priv reset of a protected key → 403', `got ${lowReset.status}`);
    const stillAdmin = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(String(stillAdmin['reports.decimal_places']) === '3', '25.1 rejected reset changed nothing', stillAdmin['reports.decimal_places']);

    const adminReset = await api('POST', '/settings/reset/reports.decimal_places', undefined, adminToken);
    check(adminReset.status === 200, '26. admin reset of a protected key → 200', `got ${adminReset.status}`);
    const afterReset = flattenMap(await api('GET', '/settings').then((r) => r.json));
    check(String(afterReset['reports.decimal_places']) === String(baselineMap['reports.decimal_places']), '26.1 reset restored the baseline value', `${afterReset['reports.decimal_places']} vs ${baselineMap['reports.decimal_places']}`);

    // ---------------------------------------------------------------
    // Root-cause contracts for the two documented UI bugs
    // ---------------------------------------------------------------
    const list = await api('GET', '/journal-entries?limit=50');
    check(list.status === 200 && Array.isArray(list.json), '27. journal-entries list returns an array');
    const rows = list.json as any[];
    if (rows.length > 0) {
      check(typeof rows[0].entryNumber === 'string', '27.1 ROOT CAUSE: list rows carry camelCase entryNumber (client searched entry_number)', `keys: ${Object.keys(rows[0]).join(',')}`);
      check(typeof rows[0].entryDate !== 'undefined' && typeof rows[0].totalDebit !== 'undefined', '27.2 list rows carry camelCase entryDate/totalDebit too (row cells relied on snake_case)');
    } else {
      console.log('ℹ️ [INFO] 27.x journal list is empty in this fresh DB — camelCase contract asserted in predicate/units below');
    }

    const appSource = fs.readFileSync(path.join(ROOT, 'src', 'App.tsx'), 'utf8');
    check(
      appSource.includes("case '/journal-entries':"),
      '28. App.tsx routes /journal-entries to the JournalEntries page (was falling through to Dashboard)'
    );

    // ---------------------------------------------------------------
    // Search predicate units (both row shapes)
    // ---------------------------------------------------------------
    check(matchesEntrySearch({ entryNumber: 'JE-2026-0007', description: 'قيد' }, 'je-2026-0007') === true, '29. predicate matches camelCase entryNumber (case-insensitive)');
    check(matchesEntrySearch({ entry_number: 'JE-2026-0007', description: 'قيد' }, '0007') === true, '30. predicate still matches legacy snake_case entry_number');
    check(matchesEntrySearch({ entryNumber: 'JE-2026-0007', description: 'قيد بيع' }, 'بيع') === true, '31. predicate matches description');
    check(matchesEntrySearch({ entryNumber: 'JE-2026-0007', description: 'قيد' }, 'JE-2026-9999') === false, '32. predicate rejects non-matching number');
    check(matchesEntrySearch({ entryNumber: 'JE-2026-0007', description: 'قيد' }, '   ') === true, '33. blank/whitespace search shows everything');
    check(matchesEntrySearch(null, 'x') === false, '34. null entry never matches a real query');

    // ---------------------------------------------------------------
    // Restore every touched key → prove the settings map is unchanged
    // ---------------------------------------------------------------
    const touchedKeys = ['ui.theme', 'ui.density', 'ui.language', 'ui.confirm_before_post', 'reports.decimal_places'];
    for (const key of touchedKeys) {
      const raw = baselineRawRows.find((r) => r.key === key);
      if (raw && raw.value !== null && raw.value !== undefined) {
        const restore = await api('PUT', `/settings/${encodeURIComponent(key)}`, { value: raw.value, reason: 'phase1052 restore baseline' }, adminToken);
        check(restore.status === 200, `35.${key} baseline value restored via PUT → 200`, `got ${restore.status}`);
      } else {
        const restore = await api('POST', `/settings/reset/${encodeURIComponent(key)}`, undefined, adminToken);
        check(restore.status === 200, `35.${key} baseline (default) restored via reset → 200`, `got ${restore.status}`);
      }
    }

    const finalMap = flattenMap(await api('GET', '/settings').then((r) => r.json));
    try {
      assert.deepStrictEqual(finalMap, baselineMap);
      pass('36. FINAL settings map is deep-equal to the pre-test baseline (nothing changed unintentionally)');
    } catch (err: any) {
      fail('36. FINAL settings map differs from baseline', err.message);
    }

    const finalEntries = (await api('GET', '/journal-entries?limit=100000')).json as any[];
    try {
      assert.deepStrictEqual(finalEntries, baselineEntries);
      pass('37. FINAL journal-entry list (numbers, totals, line counts) is deep-equal to baseline — accounting data untouched');
    } catch (err: any) {
      fail('37. journal-entry data changed during the suite', err.message);
    }
  } finally {
    stopChild(child);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
    } catch (err: any) {
      console.log(`⚠️  temp dir cleanup failed (non-fatal): ${err.message}`);
    }
  }

  console.log('================================================================');
  console.log(`📋 RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Phase 10.5.2 suite aborted:');
  console.error(err);
  console.log('================================================================');
  console.log(`📋 RESULT: ${passed} passed, ${failed} failed (aborted)`);
  process.exit(1);
});
