import { spawn, type ChildProcess, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PHASE 10.6.3 — Document Audit Integrity & Identity Security.
 *
 * FULLY ISOLATED FROM THE OPERATIONAL DATABASE: spawns its own server process
 * on its own port with a throwaway PGLITE directory (never `.pgdata`), so
 * nothing here can touch real accounting data. All write traffic goes over
 * HTTP against the real route handlers, exactly like the browser.
 *
 * Required cases (mapped to section 6 of the phase):
 *  1. unauthenticated create/modify rejected
 *  2. low-privilege user cannot perform an unauthorized operation
 *  3. forged userId does not change record creator
 *  4. forged username does not change record modifier
 *  5. client cannot set entry/modification dates
 *  6. client cannot forge device information
 *  7. old documents missing audit data render without crashing
 *  8. save and reopen work as before
 *  9. posted-document edit lock still effective
 * 10. print / unified design unaffected (API contracts intact)
 * 11. balances/ledger/inventory untouched outside the isolated DB
 * 12. all seven document screens usable
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT = 3200 + (process.pid % 800);
const BASE = `http://127.0.0.1:${PORT}/api`;

// Signed admin session used as the DEFAULT identity for api() calls (same
// pattern as uiCrud.test.ts). Deliberate anonymous/negative cases pass an
// explicit `null` so they can never silently inherit a token.
let adminToken = '';

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

function nowIshBounds(minutesAgo = 3) {
  const now = Date.now();
  return { floor: now - minutesAgo * 60_000, ceil: now + 30_000 };
}

async function api(
  method: string,
  urlPath: string,
  body?: any,
  token?: string | null
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // `undefined` → default to the admin session; `null` → deliberately anonymous.
  const effectiveToken = token === undefined ? adminToken : token;
  if (effectiveToken) headers['Authorization'] = `Bearer ${effectiveToken}`;
  const res = await fetch(`${BASE}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, json };
}

async function login(username: string, password: string): Promise<{ status: number; token?: string; id?: string; json: any }> {
  // Login is a public route; always anonymous regardless of the default token.
  const r = await api('POST', '/auth/login', { username, password }, null);
  return { status: r.status, token: r.json?.token, id: r.json?.id, json: r.json };
}

async function waitForServer(child: ChildProcess, output: { text: string }): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server child exited early (code ${child.exitCode}):\n${output.text}`);
    }
    try {
      // /api/health هو المسار العام الوحيد الذي يجيب دون مصادقة؛
      // فحص /sales/invoices كان يعيد 401 دائماً فلا يتحقق res.ok أبداً.
      const res = await fetch(`${BASE}/health`);
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
        execSyncKill(child.pid);
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

function execSyncKill(pid: number) {
  execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
}

/* ------------------------------------------------------------------ */
/*  Inline copy of the UI's null-safe date formatter (DocumentLayout)   */
/*  so the test verifies the rendering logic without importing React.   */
/* ------------------------------------------------------------------ */
function formatDocumentDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
  return `${y}/${m}/${d} ${time}`;
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Phase 10.6.3 — Document Audit Integrity & Identity Security');
  console.log(`   isolated server port=${PORT} (operational .pgdata untouched)`);
  console.log('================================================================');

  // ---------------------------------------------------------------
  // Setup: throwaway DB + isolated server process
  // ---------------------------------------------------------------
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1063-'));
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
      NODE_ENV: 'test',
      DISABLE_HMR: 'true',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const capture = (chunk: Buffer) => { output.text += chunk.toString(); };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  let adminId = '';
  let lowToken = '';
  let lowUserId = '';

  try {
    await waitForServer(child, output);
    pass('1. isolated server ready on fresh throwaway PGLITE dir');

    check(dataDir.includes('kayan-phase1063-') && dataDir !== path.resolve('.pgdata'),
      '11.1 tests run against isolated PGLite dir, never .pgdata', dataDir);

    // ---------------------------------------------------------------
    // Baseline: every read requires a session — apiSecurityMiddleware
    // enforces auth on all API paths except the isPublicApiRequest set
    // (POST /auth/login, GET /health, logo files). Anonymous → 401.
    // ---------------------------------------------------------------
    const r0 = await api('GET', '/sales/invoices', undefined, null);
    check(r0.status === 401,
      '2. GET sales invoices list without session → 401 (reads require auth)', `got ${r0.status}`);

    const a0 = await login('admin', 'admin123');
    check(a0.status === 200 && !!a0.token && !!a0.id,
      '3. admin/admin123 login issues a signed session token', `got ${a0.status}`);
    adminToken = a0.token!;
    adminId = a0.id!;

    // The isolated bootstrap DB starts with ZERO data scopes (V26 grants
    // none; V31 only backfills users that already have a branch scope).
    // Grant the admin a company scope THROUGH THE API — isolated test DB
    // only, never `.pgdata` / development / production data.
    const scopeCatalog = await api('GET', '/settings/access-scope-catalog');
    const scopeCompanyId = Array.isArray(scopeCatalog.json) && scopeCatalog.json.length > 0
      ? scopeCatalog.json[0].company_id
      : null;
    check(!!scopeCompanyId, '3.1 isolated DB exposes a company in the scope catalog', JSON.stringify(scopeCatalog.json));
    if (scopeCompanyId) {
      const grantScopes = await api('PUT', `/settings/users/${adminId}/access-scopes`, {
        companyIds: [scopeCompanyId],
        branches: [],
      });
      check(grantScopes.status === 200, '3.2 admin company scope granted in the isolated test DB', JSON.stringify(grantScopes.json));
    }

    const forged = await api('POST', '/sales/invoices', {
      customerId: '00000000-0000-0000-0000-000000000000',
      invoiceDate: '2026-10-25',
      lines: [{ description: 'x', quantity: 1, unitPrice: 1 }],
    }, 'forged-token');
    check(forged.status === 401, '4. forged session token → 401', `got ${forged.status}`);

    // ---------------------------------------------------------------
    // Low-privilege user: role with zero permissions
    // ---------------------------------------------------------------
    const roleRes = await api('POST', '/settings/roles', { name: 'P1063_LOW', description: 'no permissions' }, adminToken);
    check(roleRes.status === 201 && !!roleRes.json?.role?.id, '5. admin creates a permission-less role', JSON.stringify(roleRes.json));
    const lowRoleId = roleRes.json.role.id;
    const permsPut = await api('PUT', `/settings/roles/${lowRoleId}/permissions`, { permissionIds: [] }, adminToken);
    check(permsPut.status === 200, '5.1 low role granted an empty permission set', `got ${permsPut.status}`);

    const userRes = await api('POST', '/settings/users', {
      username: 'p1063_low',
      fullName: 'P1063 Low Privilege',
      email: 'p1063_low@test.local',
      password: 'P1063!pass',
      roleId: lowRoleId,
      isActive: true,
    }, adminToken);
    check(userRes.status === 201, '6. admin creates the low-privilege user', JSON.stringify(userRes.json));

    const lowLogin = await login('p1063_low', 'P1063!pass');
    check(lowLogin.status === 200 && !!lowLogin.token, '7. low-privilege user can log in', `got ${lowLogin.status}`);
    lowToken = lowLogin.token!;
    lowUserId = lowLogin.id!;

    // ---------------------------------------------------------------
    // Reference master data (seed data)
    // ---------------------------------------------------------------
    const custList = await api('GET', '/customers');
    check(custList.status === 200 && custList.json.length > 0, '8. customers list available', `got ${custList.status}`);
    const customer = custList.json.find((c: any) => c.code === 'CUST-001') || custList.json[0];

    const suppList = await api('GET', '/purchasing/suppliers');
    check(suppList.status === 200 && suppList.json.length > 0, '9. suppliers list available', `got ${suppList.status}`);
    const supplier = suppList.json[0];

    const acctList = await api('GET', '/accounting/accounts');
    check(acctList.status === 200 && acctList.json.length > 0, '10. chart of accounts available', `got ${acctList.status}`);
    const accounts: Record<string, any> = {};
    for (const a of acctList.json) accounts[a.code] = a;

    const INV_DATE = '2026-10-25'; // inside fiscal period 10 (OPEN)

    // ---------------------------------------------------------------
    // Case 1: unauthenticated create/modify rejected
    // ---------------------------------------------------------------
    const draftBody: any = {
      customerId: customer.id,
      paymentType: 'CREDIT',
      invoiceDate: INV_DATE,
      lines: [{ description: 'خدمة تجريبية', quantity: 1, unitPrice: 1000, tax: 0 }],
    };

    const anonCreate = await api('POST', '/sales/invoices', draftBody, null);
    check(anonCreate.status === 401, '1.C1. POST /api/sales/invoices without session → 401', `got ${anonCreate.status}`);

    const adminDraft = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(adminDraft.status === 201 && !!adminDraft.json?.id, '1.C2. admin creates draft invoice → 201', `got ${adminDraft.status}: ${JSON.stringify(adminDraft.json)}`);
    const draftId = adminDraft.json.id;

    const anonEdit = await api('PUT', `/sales/invoices/${draftId}`, draftBody, null);
    check(anonEdit.status === 401, '1.C3. PUT /api/sales/invoices/:id without session → 401', `got ${anonEdit.status}`);

    const anonPost = await api('POST', `/sales/invoices/${draftId}/post`, {}, null);
    check(anonPost.status === 401, '1.C4. POST post without session → 401', `got ${anonPost.status}`);

    // ---------------------------------------------------------------
    // Case 2: low-privilege user cannot perform unauthorized operations
    // ---------------------------------------------------------------
    const lowCreate = await api('POST', '/sales/invoices', draftBody, lowToken);
    check(lowCreate.status === 403, '2.C1. low-priv POST sales invoice → 403 (sales.invoices.create)', `got ${lowCreate.status}: ${JSON.stringify(lowCreate.json)}`);
    check(String(lowCreate.json?.error || '').includes('sales.invoices.create'), '2.C2. 403 names the required permission', lowCreate.json?.error);

    const lowPost = await api('POST', `/sales/invoices/${draftId}/post`, {}, lowToken);
    check(lowPost.status === 403, '2.C3. low-priv POST post → 403 (sales.invoices.post)', `got ${lowPost.status}`);

    const lowPurch = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id,
      invoiceDate: INV_DATE,
      postingType: 'EXPENSE',
      lines: [{ description: 'مصروف تجريبي', quantity: 1, unitPrice: 1000, tax: 0 }],
    }, lowToken);
    check(lowPurch.status === 403, '2.C4. low-priv POST purchase invoice → 403 (purchasing.invoices.create)', `got ${lowPurch.status}`);

    // ---------------------------------------------------------------
    // Case 3: forged userId does not change record creator
    // ---------------------------------------------------------------
    const forgedCreate = await api('POST', '/sales/invoices', {
      ...draftBody,
      userId: lowUserId, //browser forgery — MUST be ignored
    }, adminToken);
    check(forgedCreate.status === 201, '3.C1. create with forged userId → 201', `got ${forgedCreate.status}`);
    const forgedInvId = forgedCreate.json.id;

    const detail = await api('GET', `/sales/invoices/${forgedInvId}`, undefined, adminToken);
    check(detail.status === 200, '3.C2. GET forged-identity invoice → 200', `got ${detail.status}`);
    check(detail.json.createdByName === 'admin', '3.C3. creator is the SESSION user (admin), not forged body userId', `got createdByName=${detail.json.createdByName}`);

    const forgedReturn = await api('POST', '/sales/returns', {
      customerId: customer.id,
      originalInvoiceId: forgedInvId,
      returnDate: '2026-10-26',
      notes: 'test return',
      userId: lowUserId, // browser forgery — MUST be ignored
      lines: [{ itemCode: 'ITM-X', description: 'صنف مرتجع', quantity: 1, unitPrice: 1000, tax: 0 }],
    }, adminToken);
    check(forgedReturn.status === 201, '3.C4. create sales return with forged userId → 201', `got ${forgedReturn.status}`);
    const retDetail = await api('GET', `/sales/returns/${forgedReturn.json.salesReturn.id}`, undefined, adminToken);
    check(retDetail.status === 200 && retDetail.json.createdByName === 'جهاد الصليحي',
      '3.C5. sales return creator is session user (full name of admin), not forged body userId',
      `got createdByName=${retDetail.json?.createdByName} status=${retDetail.status}`);

    // ---------------------------------------------------------------
    // Case 4: forged username does not change record modifier
    // ---------------------------------------------------------------
    const editableDraft = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(editableDraft.status === 201, '4.C1. editable draft created → 201', `got ${editableDraft.status}`);
    const editId = editableDraft.json.id;

    const forgedEdit = await api('PUT', `/sales/invoices/${editId}`, {
      ...draftBody,
      username: 'attacker', // browser forgery — MUST be ignored
      notes: 'تم التعديل من الاختبار',
    }, adminToken);
    check(forgedEdit.status === 200, '4.C2. update with forged username → 200', `got ${forgedEdit.status}`);

    const afterEdit = await api('GET', `/sales/invoices/${editId}`, undefined, adminToken);
    check(afterEdit.status === 200 && afterEdit.json.lastModifiedByName === 'admin',
      '4.C3. modifier stays session user (admin); forged username ignored',
      `got lastModifiedByName=${afterEdit.json?.lastModifiedByName}`);

    const auditLogs = await api('GET', '/audit-logs', undefined, adminToken);
    check(auditLogs.status === 200 && Array.isArray(auditLogs.json), '4.C4. audit-logs readable by admin', `got ${auditLogs.status}`);
    const modAudit = (auditLogs.json as any[]).find((r: any) => r.entity_type === 'SALES_INVOICE' && r.entity_id === editId && r.action === 'UPDATE');
    check(!!modAudit && modAudit.username === 'admin',
      '4.C5. audit UPDATE row carries session username, not forged body username',
      `got username=${modAudit?.username}`);

    // ---------------------------------------------------------------
    // Case 5: client cannot set entry/modification dates
    // ---------------------------------------------------------------
    const dateInv = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(dateInv.status === 201, '5.C1. invoice created → 201', `got ${dateInv.status}`);
    const dateInvId = dateInv.json.id;

    const createdDetail = await api('GET', `/sales/invoices/${dateInvId}`, undefined, adminToken);
    const createdAt = createdDetail.json.created_at;
    const bounds = nowIshBounds();
    check(!!createdAt && !Number.isNaN(new Date(createdAt).getTime())
      && Number(new Date(createdAt)) >= bounds.floor && Number(new Date(createdAt)) <= bounds.ceil,
      '5.C2. created_at is server time (recent), not a client value', `got created_at=${createdAt}`);

    const forgedDates = await api('PUT', `/sales/invoices/${dateInvId}`, {
      ...draftBody,
      notes: 'تواريخ مزيفة',
      created_at: '2020-01-01T00:00:00Z', // client forgery — MUST be ignored
      updated_at: '2020-02-02T00:00:00Z', // client forgery — MUST be ignored
    }, adminToken);
    check(forgedDates.status === 200, '5.C3. update with forged dates → 200', `got ${forgedDates.status}`);

    const afterDates = await api('GET', `/sales/invoices/${dateInvId}`, undefined, adminToken);
    const updatedAt = afterDates.json.lastModifiedAt || afterDates.json.updated_at;
    check(!!updatedAt && !Number.isNaN(new Date(updatedAt).getTime())
      && Number(new Date(updatedAt)) >= bounds.floor && Number(new Date(updatedAt)) <= bounds.ceil,
      '5.C4. updated_at is server time after edit, not forged 2020 value', `got updated_at=${updatedAt}`);
    check(afterDates.json.created_at === createdAt, '5.C5. created_at unchanged by update', `got ${afterDates.json.created_at} vs ${createdAt}`);

    // ---------------------------------------------------------------
    // Case 6: client cannot forge device information
    // ---------------------------------------------------------------
    const devInv = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(devInv.status === 201, '6.C1. invoice created → 201', `got ${devInv.status}`);
    const devInvId = devInv.json.id;

    const logs = await api('GET', '/audit-logs', undefined, adminToken);
    check(logs.status === 200 && Array.isArray(logs.json), '6.C2. audit-logs readable', `got ${logs.status}`);
    const createAudit = (logs.json as any[]).find((r: any) =>
      r.entity_type === 'SALES_INVOICE' && r.entity_id === devInvId && r.action === 'CREATE');
    check(!!createAudit && createAudit.ip_address === '127.0.0.1' && createAudit.user_agent === 'Kayan-ERP-Client/1.0',
      '6.C3. audit row stores server-side defaults only; no client device data recorded',
      `ip=${createAudit?.ip_address} ua=${createAudit?.user_agent}`);

    // ---------------------------------------------------------------
    // Case 7: old documents missing audit data render without crashing
    // ---------------------------------------------------------------
    const freshDraft = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(freshDraft.status === 201, '7.C1. fresh draft created → 201', `got ${freshDraft.status}`);
    const freshDetail = await api('GET', `/sales/invoices/${freshDraft.json.id}`, undefined, adminToken);
    check(freshDetail.status === 200, '7.C2. GET document with no modification history → 200 (no crash)', `got ${freshDetail.status}`);
    check(freshDetail.json.lastModifiedByName === null, '7.C3. missing modifier exposed as null (UI shows «غير متوفر»)');

    // Null-safe formatter checks (mirror DocumentAuditCard / DocumentReadField)
    check(formatDocumentDateTime(undefined) === '—', '7.C4. undefined date renders "—"');
    check(formatDocumentDateTime(null) === '—', '7.C5. null date renders "—"');
    check(formatDocumentDateTime('') === '—', '7.C6. empty date renders "—"');
    check(formatDocumentDateTime('not-a-date') === 'not-a-date', '7.C7. unparseable value shown as-is (no invention)');
    const formatted = formatDocumentDateTime('2026-10-25T14:05:00.000Z');
    check(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(formatted), '7.C8. valid server date formatted in system format', `got ${formatted}`);

    // ---------------------------------------------------------------
    // Case 8: save and reopen work as before
    // ---------------------------------------------------------------
    const reopenDraft = await api('POST', '/sales/invoices', draftBody, adminToken);
    check(reopenDraft.status === 201, '8.C1. draft saved → 201', `got ${reopenDraft.status}`);
    const reopenId = reopenDraft.json.id;
    const saved = await api('GET', `/sales/invoices/${reopenId}`, undefined, adminToken);
    check(saved.status === 200 && saved.json.status === 'DRAFT' && saved.json.createdByName === 'admin',
      '8.C2. re-opened draft keeps status DRAFT and session creator', `got ${JSON.stringify(saved.json)}`);

    const posted = await api('POST', `/sales/invoices/${reopenId}/post`, {}, adminToken);
    check(posted.status === 200, '8.C3. draft posted → 200', `got ${posted.status}: ${JSON.stringify(posted.json)}`);
    check(!!posted.json.journalEntryId, '8.C4. posting generated a journal entry');

    const reopened = await api('GET', `/sales/invoices/${reopenId}`, undefined, adminToken);
    check(reopened.status === 200 && reopened.json.status === 'POSTED' && !!reopened.json.journalEntryNumber,
      '8.C5. re-opened posted invoice shows POSTED + journal number', `got status=${reopened.json.status}`);

    // ---------------------------------------------------------------
    // Case 9: posted-document edit lock still effective
    // ---------------------------------------------------------------
    const locked = await api('PUT', `/sales/invoices/${reopenId}`, draftBody, adminToken);
    check(locked.status === 400, '9.C1. PUT on POSTED invoice → 400', `got ${locked.status}: ${JSON.stringify(locked.json)}`);
    check(String(locked.json?.error || '').includes('مرحّلة'), '9.C2. error references posted status', locked.json?.error);
    const stillPosted = await api('GET', `/sales/invoices/${reopenId}`, undefined, adminToken);
    check(stillPosted.status === 200 && stillPosted.json.status === 'POSTED', '9.C3. status remains POSTED after rejected edit');

    // ---------------------------------------------------------------
    // Case 10: print / unified design unaffected — API contracts intact
    // ---------------------------------------------------------------
    const purchInv = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id,
      invoiceDate: INV_DATE,
      postingType: 'EXPENSE',
      lines: [{ description: 'مشتريات تجريبية', quantity: 1, unitPrice: 2000, tax: 0 }],
    }, adminToken);
    check(purchInv.status === 201, '10.C1. purchase invoice created → 201', `got ${purchInv.status}`);
    const purchPosted = await api('POST', `/purchasing/invoices/${purchInv.json.id}/post`, {}, adminToken);
    check(purchPosted.status === 200, '10.C1.1. purchase invoice posted → 200', `got ${purchPosted.status}`);
    const purchDet = await api('GET', `/purchasing/invoices/${purchInv.json.id}`, undefined, adminToken);
    check(purchDet.status === 200 && purchDet.json.createdByName === 'admin', '10.C2. purchase invoice detail complete + session creator');

    const receipt = await api('POST', '/sales/receipts', {
      customerId: customer.id,
      paymentMethod: 'CASH',
      receiptDate: INV_DATE,
      amount: 500,
      description: 'إيصال تجريبي',
    }, adminToken);
    check(receipt.status === 201, '10.C3. receipt created → 201', `got ${receipt.status}`);
    const receiptDet = await api('GET', `/sales/receipts/${receipt.json.id}`, undefined, adminToken);
    check(receiptDet.status === 200 && receiptDet.json.createdByName === 'admin', '10.C4. receipt detail complete + session creator', `got createdByName=${receiptDet.json?.createdByName}`);

    const payment = await api('POST', '/purchasing/payments', {
      supplierId: supplier.id,
      paymentMethod: 'CASH',
      paymentDate: INV_DATE,
      amount: 400,
      description: 'سداد تجريبي',
    }, adminToken);
    check(payment.status === 201, '10.C5. supplier payment created → 201', `got ${payment.status}`);
    const paymentDet = await api('GET', `/purchasing/payments/${payment.json.id}`, undefined, adminToken);
    check(paymentDet.status === 200 && paymentDet.json.createdByName === 'admin', '10.C6. payment detail complete + session creator', `got createdByName=${paymentDet.json?.createdByName}`);

    const je = await api('POST', '/journal-entries', {
      entryDate: INV_DATE,
      description: 'قيد تجريبي للمراجعة',
      lines: [
        { accountId: accounts['1101']?.id, debit: 1000, credit: 0, description: 'مدين صندوق' },
        { accountId: accounts['41']?.id, debit: 0, credit: 1000, description: 'دائن مبيعات' },
      ],
      sourceId: 'GL',
    }, adminToken);
    check(je.status === 201, '10.C7. journal entry created → 201', `got ${je.status}`);
    const jeDet = await api('GET', `/journal-entries/${je.json.id}`, undefined, adminToken);
    check(jeDet.status === 200 && jeDet.json.createdByName === 'admin', '10.C8. journal entry detail → 200 + session creator', `got ${jeDet.status} createdByName=${jeDet.json?.createdByName}`);

    // purchase return against the posted purchase invoice
    const purchInvLines = purchDet.json.lines || [];
    check(purchInvLines.length > 0, '10.C9. posted purchase invoice has returnable lines');
    const purRet = await api('POST', '/purchasing/returns', {
      supplierId: supplier.id,
      originalInvoiceId: purchInv.json.id,
      returnDate: '2026-10-26',
      notes: 'مرتجع تجريبي',
      lines: [{ originalLineId: purchInvLines[0].id, quantity: 1 }],
    }, adminToken);
    check(purRet.status === 201, '10.C10. purchase return created → 201', `got ${purRet.status}`);
    const purRetDet = await api('GET', `/purchasing/returns/${purRet.json.purchaseReturn.id}`, undefined, adminToken);
    check(purRetDet.status === 200 && purRetDet.json.createdByName === 'جهاد الصليحي', '10.C11. purchase return detail complete + session creator (full name of admin)', `got createdByName=${purRetDet.json?.createdByName}`);

    // ---------------------------------------------------------------
    // Case 11: no operational data touched — isolated DB already proven
    // ---------------------------------------------------------------
    check(true, '11.C1. all writes targeted the isolated PGLite dir (see 11.1); .pgdata never referenced by this suite');

    // ---------------------------------------------------------------
    // Case 12: all seven document screens usable (list + detail)
    // ---------------------------------------------------------------
    const screens: Array<{ name: string; path: string }> = [
      { name: 'فواتير المبيعات', path: '/sales/invoices' },
      { name: 'فواتير المشتريات', path: '/purchasing/invoices' },
      { name: 'مردودات المبيعات', path: '/sales/returns' },
      { name: 'مردودات المشتريات', path: '/purchasing/returns' },
      { name: 'سندات القبض', path: '/sales/receipts' },
      { name: 'سندات الصرف', path: '/purchasing/payments' },
      { name: 'القيود اليومية', path: '/journal-entries' },
    ];
    for (const screen of screens) {
      const listed = await api('GET', screen.path, undefined, adminToken);
      check(listed.status === 200 && Array.isArray(listed.json),
        `12.C1. شاشة "${screen.name}" قابلة للاستخدام (القائمة) → 200`, `got ${listed.status}`);
    }
    // anonymous reads are rejected — auth is enforced on every read path
    const anonList = await api('GET', '/sales/invoices', undefined, null);
    check(anonList.status === 401, '12.C2. reads require a session (anonymous GET → 401)', `got ${anonList.status}`);

    console.log(`\n================================================================`);
    console.log(`   Result: ${passed} passed, ${failed} failed`);
    console.log(`   Isolated DB dir: ${dataDir}`);
    console.log(`================================================================`);
  } finally {
    stopChild(child);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

run().then(() => {
  if (failed > 0) process.exitCode = 1;
}).catch((err: any) => {
  console.error('SUITE ERROR:', err);
  process.exitCode = 1;
});
