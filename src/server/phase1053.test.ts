import assert from 'assert';
import crypto from 'crypto';
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isSecretSettingKey, stripSecretSettings } from './settingKeyPolicy.ts';

/**
 * PHASE 10.5.3 — Session Secret Hardening & Access-Control Audit.
 *
 * FULLY ISOLATED FROM THE OPERATIONAL DATABASE: every spawned server gets its
 * own throwaway PGLITE directory (never `.pgdata`). No secret value is ever
 * printed — only booleans and non-sensitive status text.
 *
 * Covered:
 *   1. Session secret unit behaviour with a configured test secret:
 *      issue → verify roundtrip, tampered tokens, EXPIRED tokens, and the
 *      production fail-fast (no secret → refuse to boot, safe message).
 *   2. Secret durability: a token issued before a restart stays valid across
 *      restarts with the SAME secret, and dies when the secret is rotated.
 *   3. GET /api/settings read policy: boot keys present, secret-shaped keys
 *      stripped (classifier + HTTP).
 *   4. GET /api/audit-logs guard: 401 anonymous, 403 without permission,
 *      200 with permission; forged query identity cannot bypass.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT_BASE = 3300 + (process.pid % 600);

// Test-only secrets. NEVER reuse real ones; never printed.
const SECRET_A = 'phase1053-secret-alpha-0123456789';
const SECRET_C = 'phase1053-secret-canon-0123456789';
const SECRET_D = 'phase1053-secret-rotated-0123456789';

// Resolve secrets lazily AFTER the env is set (sessionTokens reads env on
// first use, so this import above is safe).
process.env.KAYAN_SESSION_SECRET = SECRET_A;
process.env.NODE_ENV = 'development';
const sessionTokens = await import('./sessionTokens.ts');

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

interface ChildHandle {
  child: ChildProcess;
  output: { text: string };
  port: number;
  dataDir: string;
}

function spawnServer(opts: { port: number; dataDir: string; env?: Record<string, string> }): ChildHandle {
  const tsxCli = path.join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const output = { text: '' };
  const child = spawn(process.execPath, [tsxCli, 'server.ts'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(opts.port),
      PGLITE_DATA_DIR: opts.dataDir,
      PGLITE_BOOTSTRAP: '1',
      ...opts.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk: Buffer) => { output.text += chunk.toString(); };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);
  return { child, output, port: opts.port, dataDir: opts.dataDir };
}

async function waitForReady(handle: ChildHandle): Promise<void> {
  const base = `http://127.0.0.1:${handle.port}/api`;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null) {
      throw new Error(`server exited early (code ${handle.child.exitCode}):\n${handle.output.text}`);
    }
    try {
      const res = await fetch(`${base}/settings`);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`server not ready on port ${handle.port} within 180s:\n${handle.output.text}`);
}

function stopChild(child: ChildProcess) {
  try {
    if (IS_WINDOWS && child.pid) {
      try {
        execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
        return;
      } catch { /* fall through */ }
    }
    child.kill('SIGTERM' as any);
  } catch { /* already dead */ }
}

async function api(base: string, method: string, urlPath: string, body?: any, token?: string) {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

function flattenKeys(payload: any): string[] {
  const groups = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.settings : payload;
  const rows: any[] = Array.isArray(groups)
    ? groups
    : groups && typeof groups === 'object'
      ? Object.values(groups).flat()
      : [];
  return rows.filter((r) => r && typeof r.key === 'string').map((r) => r.key);
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function craftSignedToken(payload: object, secret: string): string {
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf-8'));
  const sig = b64url(crypto.createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Phase 10.5.3 — Session Secret Hardening & Access-Control Audit');
  console.log('   isolated servers + throwaway DBs (operational .pgdata untouched)');
  console.log('================================================================');

  // ---------------------------------------------------------------
  // UNIT: token lifecycle with a configured secret
  // ---------------------------------------------------------------
  sessionTokens.assertSessionSecretReady();
  pass('1. assertSessionSecretReady() accepts a configured >=16-char secret');

  const tok = sessionTokens.issueSessionToken('11111111-1111-1111-1111-111111111111', 'unit_user');
  const payload = sessionTokens.verifySessionToken(tok);
  check(!!payload && payload.sub === '11111111-1111-1111-1111-111111111111' && payload.username === 'unit_user',
    '2. issue → verify roundtrip binds user id + username');

  const tamperedSig = tok.slice(0, -2) + (tok.endsWith('aa') ? 'bb' : 'aa');
  check(sessionTokens.verifySessionToken(tamperedSig) === null, '3. tampered signature rejected');
  const bodyParts = tok.split('.');
  const forgedBody = craftSignedToken(
    { sub: '22222222-2222-2222-2222-222222222222', username: 'attacker', iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 },
    SECRET_A
  );
  // signed correctly for a DIFFERENT payload than issued — must still verify
  // (signature covers the body); the point of test 3 is tamper detection.
  check(!!sessionTokens.verifySessionToken(forgedBody), '3.1 token signed with the configured secret verifies (signature covers body)');

  const expired = craftSignedToken(
    { sub: '11111111-1111-1111-1111-111111111111', username: 'unit_user', iat: 1, exp: Math.floor(Date.now() / 1000) - 10 },
    SECRET_A
  );
  check(sessionTokens.verifySessionToken(expired) === null, '4. EXPIRED token rejected regardless of valid signature');

  check(sessionTokens.verifySessionToken(craftSignedToken(
    { sub: 'x', username: 'y', iat: 1, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET_D)) === null,
    '5. token signed with a DIFFERENT secret (rotation) rejected');

  check(sessionTokens.extractBearerToken('Bearer abc.def') === 'abc.def', '6. extractBearerToken parses Bearer scheme');
  check(sessionTokens.extractBearerToken('Basic abc') === null, '6.1 non-Bearer scheme ignored');
  check(sessionTokens.verifySessionToken(null) === null, '6.2 empty token → no identity (never throws)');

  // ---------------------------------------------------------------
  // UNIT: settings key read policy
  // ---------------------------------------------------------------
  const secretKeys = ['reports.api_token', 'core.smtp_password', 'backup_api_key', 'auth.private_key', 'thirdparty_credential', 'mail_password'];
  for (const k of secretKeys) {
    check(isSecretSettingKey(k) === true, `7.${k} classified as SECRET (hidden from reads)`);
  }
  const normalKeys = ['ui.theme', 'ui.notify_save_success', 'reports.currency_symbol', 'core.company_name', 'inventory.auto_create_issue_on_sale', 'accounting.default_cash_account', 'reports.decimal_places'];
  for (const k of normalKeys) {
    check(isSecretSettingKey(k) === false, `8.${k} NOT classified as secret (still readable)`);
  }

  const stripped = stripSecretSettings({
    CORE: [{ key: 'core.company_name' }, { key: 'core.smtp_password' }],
    REPORTS: [{ key: 'reports.api_token' }],
  });
  check((stripped.CORE || []).length === 1 && (stripped.CORE || [])[0]?.key === 'core.company_name',
    '9. stripSecretSettings keeps normal keys');
  check((stripped.REPORTS || []).length === 0 && !('REPORTS' in stripped),
    '9.1 stripSecretSettings drops secret-only groups entirely');

  // ---------------------------------------------------------------
  // HTTP: settings reads + audit-trail guard (isolated server A)
  // ---------------------------------------------------------------
  const dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1053-a-'));
  const portA = PORT_BASE;
  const A = spawnServer({ port: portA, dataDir: dirA, env: { KAYAN_SESSION_SECRET: SECRET_A } });
  let adminToken = '';
  let lowToken = '';
  let adminId = '';

  const dirProd = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1053-prod-'));
  const dirC = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1053-c-'));

  try {
    await waitForReady(A);
    const baseA = `http://127.0.0.1:${portA}/api`;
    pass('10. isolated dev server ready with a configured test secret');

    // ---- GET /api/settings read policy ----
    const settingsRes = await api(baseA, 'GET', '/settings');
    check(settingsRes.status === 200, '11. GET /api/settings still works WITHOUT a session (UI boot preserved)', `got ${settingsRes.status}`);
    const keys = flattenKeys(settingsRes.json);
    check(keys.includes('ui.theme') && keys.includes('core.company_name') && keys.includes('reports.decimal_places'),
      '11.1 boot-critical keys still present in the response');
    const leaked = keys.filter((k) => isSecretSettingKey(k));
    check(leaked.length === 0, '11.2 NO secret-shaped key is returned by GET /api/settings', leaked.join(','));

    const moduleRes = await api(baseA, 'GET', '/settings/module/ACCOUNTING');
    check(moduleRes.status === 200 && Array.isArray(moduleRes.json), '12. GET /settings/module/:module still works');
    const moduleKeys = (moduleRes.json as any[]).map((r) => r.key);
    check(moduleKeys.filter((k) => isSecretSettingKey(k)).length === 0,
      '12.1 module read applies the same secret-key filter', moduleKeys.filter((k) => isSecretSettingKey(k)).join(','));
    check(moduleKeys.includes('accounting.default_cash_account'), '12.2 module read keeps its normal keys');

    // ---- GET /api/audit-logs guard ----
    const anonAudit = await api(baseA, 'GET', '/audit-logs');
    check(anonAudit.status === 401, '13. GET /api/audit-logs without session → 401', `got ${anonAudit.status}`);

    const anonForged = await api(baseA, 'GET', '/audit-logs?userId=00000000-0000-0000-0000-000000000000&username=admin&limit=5');
    check(anonForged.status === 401, '14. forged userId/username query params do NOT bypass the guard (anonymous)', `got ${anonForged.status}`);

    const login = await api(baseA, 'POST', '/auth/login', { username: 'admin', password: 'admin123' });
    check(login.status === 200 && !!login.json?.token, '15. admin login works (token signed with the configured secret)');
    adminToken = login.json.token;
    adminId = login.json.id;

    const adminAudit = await api(baseA, 'GET', '/audit-logs?limit=20', undefined, adminToken);
    check(adminAudit.status === 200 && Array.isArray(adminAudit.json), '16. admin (system.audit.view) GET /api/audit-logs → 200 array', `got ${adminAudit.status}`);
    check((adminAudit.json as any[]).length > 0, '16.1 audit rows exist (our own login/role/user actions are logged)');

    // low-privilege user via the guarded admin APIs
    const role = await api(baseA, 'POST', '/settings/roles', { name: 'PHASE1053_NOPERM', description: 'no permissions' }, adminToken);
    check(role.status === 201 && !!role.json?.role?.id, '17. admin creates permission-less role');
    await api(baseA, 'PUT', `/settings/roles/${role.json.role.id}/permissions`, { permissionIds: [] }, adminToken);
    const user = await api(baseA, 'POST', '/settings/users', {
      username: 'phase1053_low', fullName: 'Phase 10.5.3 Low', email: 'phase1053_low@test.local',
      password: 'Phase1053!pass', roleId: role.json.role.id, isActive: true,
    }, adminToken);
    check(user.status === 201, '17.1 admin creates low-privilege user');
    const lowLogin = await api(baseA, 'POST', '/auth/login', { username: 'phase1053_low', password: 'Phase1053!pass' });
    check(lowLogin.status === 200 && !!lowLogin.json?.token, '17.2 low-privilege user logs in');
    lowToken = lowLogin.json.token;

    const lowAudit = await api(baseA, 'GET', '/audit-logs', undefined, lowToken);
    check(lowAudit.status === 403, '18. low-privilege user GET /api/audit-logs → 403', `got ${lowAudit.status}`);
    check(String(lowAudit.json?.error || '').includes('system.audit.view'),
      '18.1 403 error names the required permission', lowAudit.json?.error);

    const lowForged = await api(baseA, 'GET', `/audit-logs?userId=${adminId}&username=admin`, undefined, lowToken);
    check(lowForged.status === 403, '19. low-privilege user with FORGED identity query params → still 403', `got ${lowForged.status}`);

    // settings write smoke with the env-signed token (regression of 10.5.2 gate)
    const putTheme = await api(baseA, 'PUT', '/settings/ui.theme', { value: 'dark', reason: 'phase1053 smoke' }, adminToken);
    check(putTheme.status === 200, '20. settings write gate still works with an env-signed token (ui.theme → 200)');
    const restore = await api(baseA, 'PUT', '/settings/ui.theme', { value: 'light', reason: 'phase1053 restore' }, adminToken);
    check(restore.status === 200, '20.1 theme restored');

    stopChild(A.child);
    await new Promise((r) => setTimeout(r, 800));

    // ---------------------------------------------------------------
    // PRODUCTION FAIL-FAST (no secret → refuse to boot)
    // ---------------------------------------------------------------
    const prodPort = PORT_BASE + 1;
    const P = spawnServer({ port: prodPort, dataDir: dirProd, env: { NODE_ENV: 'production', KAYAN_SESSION_SECRET: '' } });
    const prodDeadline = Date.now() + 45_000;
    while (P.child.exitCode === null && Date.now() < prodDeadline) {
      await new Promise((r) => setTimeout(r, 300));
    }
    check(P.child.exitCode !== null && P.child.exitCode !== 0,
      '21. production WITHOUT a secret: server process REFUSES to run (non-zero exit)', `exit=${P.child.exitCode}`);
    check(P.output.text.includes('KAYAN_SESSION_SECRET'), '21.1 failure message names the missing variable (safe — no secret value exists to print)');
    check(P.output.text.includes('Server startup refused'), '21.2 failure happens at startup with a clear marker');
    check(!P.output.text.includes('Full-Stack server running'), '21.3 the server never started listening');
    check(!P.output.text.includes('server.log'), '21.4 no unrelated noise in the refusal path');
    stopChild(P.child);

    // ---------------------------------------------------------------
    // SECRET DURABILITY: same secret survives restart; rotation kills tokens
    // ---------------------------------------------------------------
    const portC = PORT_BASE + 2;
    // C1 — bootstrap + login
    const C1 = spawnServer({ port: portC, dataDir: dirC, env: { KAYAN_SESSION_SECRET: SECRET_C } });
    await waitForReady(C1);
    const baseC = `http://127.0.0.1:${portC}/api`;
    const loginC = await api(baseC, 'POST', '/auth/login', { username: 'admin', password: 'admin123' });
    check(loginC.status === 200 && !!loginC.json?.token, '22. login on instance C1 issues a token signed with SECRET_C');
    const durableTok = loginC.json.token;
    const auditC1 = await api(baseC, 'GET', '/audit-logs?limit=5', undefined, durableTok);
    check(auditC1.status === 200, '22.1 token accepted on C1');
    stopChild(C1.child);
    await new Promise((r) => setTimeout(r, 800));

    // C2 — SAME secret, fresh process, SAME data dir → old token still valid
    const C2 = spawnServer({ port: portC, dataDir: dirC, env: { KAYAN_SESSION_SECRET: SECRET_C } });
    await waitForReady(C2);
    const auditC2 = await api(baseC, 'GET', '/audit-logs?limit=5', undefined, durableTok);
    check(auditC2.status === 200, '23. SAME secret after RESTART: the pre-restart token is STILL accepted (sessions survive restarts)');
    stopChild(C2.child);
    await new Promise((r) => setTimeout(r, 800));

    // C3 — ROTATED secret → old token dies; fresh login works
    const C3 = spawnServer({ port: portC, dataDir: dirC, env: { KAYAN_SESSION_SECRET: SECRET_D } });
    await waitForReady(C3);
    const auditC3 = await api(baseC, 'GET', '/audit-logs?limit=5', undefined, durableTok);
    check(auditC3.status === 401, '24. ROTATED secret: every previously issued token is rejected → 401', `got ${auditC3.status}`);
    const loginC3 = await api(baseC, 'POST', '/auth/login', { username: 'admin', password: 'admin123' });
    check(loginC3.status === 200 && !!loginC3.json?.token, '24.1 fresh login under the new secret works');
    stopChild(C3.child);
    await new Promise((r) => setTimeout(r, 800));
  } finally {
    stopChild(A.child);
    for (const dir of [dirA, dirProd, dirC]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
      } catch (err: any) {
        console.log(`⚠️  temp dir cleanup failed (non-fatal): ${err.message}`);
      }
    }
  }

  console.log('================================================================');
  console.log(`📋 RESULT: ${passed} passed, ${failed} failed`);
  console.log('================================================================');
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('\n💥 Phase 10.5.3 suite aborted:');
  console.error(err);
  console.log('================================================================');
  console.log(`📋 RESULT: ${passed} passed, ${failed} failed (aborted)`);
  process.exit(1);
});
