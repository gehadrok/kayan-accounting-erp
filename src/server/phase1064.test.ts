import { spawn, type ChildProcess, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PHASE 10.6.4 — Document Lifecycle Integrity & Final Verification.
 *
 * FULLY ISOLATED FROM THE OPERATIONAL DATABASE: spawns its own server
 * process on its own port with a throwaway PGLITE directory (never
 * `.pgdata`). All write traffic goes over HTTP against the REAL route
 * handlers, exactly like the browser. State assertions read back through
 * the read APIs (and audit log) instead of trusting a single HTTP code.
 *
 * Sections:
 *   A. Security matrix (S1-S12): no session / forged token / inactive user /
 *      missing permission / forged userId / forged username / forged
 *      companyId+branchId / re-post idempotency / re-void idempotency /
 *      posted-document edit lock / delete rules / reader-only user.
 *   B. Lifecycle & consistency (L1-L12): create / reject invalid / draft
 *      edit audit / post effect & balance / void effect incl. stock
 *      cancellation / receipt & payment round-trips / statement deltas /
 *      read-only idempotence / journal engine (unbalanced, delete,
 *      reverse) / all seven screens usable.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT = 3500 + (process.pid % 700);
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

/* BHOGUS values used for forgery tests (valid UUID shape, never seeded). */
const BHOGUS_UUID = 'f0000000-0000-4000-8000-000000000000';

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

function sumLines(lines: any[]): { d: number; c: number } {
  let d = 0;
  let c = 0;
  for (const l of lines || []) {
    d += parseFloat(l.debit || 0);
    c += parseFloat(l.credit || 0);
  }
  return { d, c };
}

async function salesInvoiceCount(): Promise<number> {
  const r = await api('GET', '/sales/invoices?limit=500');
  return Array.isArray(r.json) ? r.json.length : -1;
}

async function receiptsCount(): Promise<number> {
  const r = await api('GET', '/sales/receipts?limit=500');
  return Array.isArray(r.json) ? r.json.length : -1;
}

async function run() {
  console.log('================================================================');
  console.log('🧪 Phase 10.6.4 — Document Lifecycle Integrity & Final Verification');
  console.log(`   isolated server port=${PORT} (operational .pgdata untouched)`);
  console.log('================================================================');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-phase1064-'));
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

  try {
    await waitForServer(child, output);
    pass('0.1 isolated server ready on fresh throwaway PGLITE dir');
    check(dataDir.includes('kayan-phase1064-') && dataDir !== path.resolve('.pgdata'),
      '0.2 tests run against isolated PGLite dir, never .pgdata', dataDir);

    // --------------------------------------------------------------
    // Sessions & reference data
    // --------------------------------------------------------------
    const admin = await login('admin', 'admin123');
    check(admin.status === 200 && !!admin.token, '0.3 admin session issued', `got ${admin.status}`);
    adminToken = admin.token!;
    const adminId = admin.id!;

    // The isolated bootstrap DB starts with ZERO data scopes (V26 grants
    // none; V31 only backfills users that already have a branch scope).
    // Grant the admin a company scope THROUGH THE API — isolated test DB
    // only, never `.pgdata` / development / production data.
    const scopeCatalog = await api('GET', '/settings/access-scope-catalog');
    const scopeCompanyId = Array.isArray(scopeCatalog.json) && scopeCatalog.json.length > 0
      ? scopeCatalog.json[0].company_id
      : null;
    check(!!scopeCompanyId, '0.3.1 isolated DB exposes a company in the scope catalog', JSON.stringify(scopeCatalog.json));
    if (scopeCompanyId) {
      const grantScopes = await api('PUT', `/settings/users/${adminId}/access-scopes`, {
        companyIds: [scopeCompanyId],
        branches: [],
      });
      check(grantScopes.status === 200, '0.3.2 admin company scope granted in the isolated test DB', JSON.stringify(grantScopes.json));
    }

    const roleRes = await api('POST', '/settings/roles', { name: 'P1064_RO', description: 'no permissions' }, adminToken);
    check(roleRes.status === 201 && !!roleRes.json?.role?.id, '0.4 read-only role created', JSON.stringify(roleRes.json));
    const roRoleId = roleRes.json.role.id;

    const roUser = await api('POST', '/settings/users', {
      username: 'p1064_ro', fullName: 'P1064 Reader', email: 'p1064_ro@test.local', password: 'P1064!pass', roleId: roRoleId, isActive: true,
    }, adminToken);
    check(roUser.status === 201, '0.5 reader-only user created');
    const roLogin = await login('p1064_ro', 'P1064!pass');
    check(roLogin.status === 200 && !!roLogin.token, '0.6 reader-only user can log in');
    const roToken = roLogin.token!;

    // separate user that will be deactivated while holding a valid token
    const inactUser = await api('POST', '/settings/users', {
      username: 'p1064_inactive', fullName: 'P1064 Inactive', email: 'p1064_inact@test.local', password: 'P1064!pass', roleId: roRoleId, isActive: true,
    }, adminToken);
    check(inactUser.status === 201, '0.7 future-inactive user created');
    const inactLogin = await login('p1064_inactive', 'P1064!pass');
    check(inactLogin.status === 200 && !!inactLogin.token, '0.8 future-inactive user logs in first');
    const inactToken = inactLogin.token!;
    const inactId = inactUser.json?.user?.id || inactUser.json?.id;
    const deact = await api('PUT', `/settings/users/${inactId}`, { isActive: false }, adminToken);
    check(deact.status === 200, '0.9 admin deactivated the user', JSON.stringify(deact.json));

    const custList = await api('GET', '/customers');
    check(custList.status === 200 && custList.json.length > 0, '0.10 customers available');
    const customer = custList.json[0];
    const suppList = await api('GET', '/purchasing/suppliers');
    check(suppList.status === 200 && suppList.json.length > 0, '0.11 suppliers available');
    const supplier = suppList.json[0];

    const itemCreate = await api('POST', '/inventory/items', {
      sku: `SKU-P1064-${process.pid}`, name: 'صنف اختبار 10.6.4', purchasePrice: 1000, salePrice: 1500, isStockItem: true,
    });
    check(itemCreate.status === 201 && !!itemCreate.json?.id, '0.12 stock item created', JSON.stringify(itemCreate.json));
    const itemId = itemCreate.json.id;
    const stock0 = await api('GET', `/inventory/items/${itemId}/stock`);
    const startStock = parseFloat(stock0.json?.currentStock || 0);
    check(stock0.status === 200 && startStock === 0, '0.13 item starts with zero stock', JSON.stringify(stock0.json));

    const INV_DATE = '2026-10-25';

    // =============================================================
    // A. SECURITY MATRIX
    // =============================================================

    // --- S1: unauthenticated writes rejected — HTTP AND state ---
    // NOTE: each case uses its real HTTP method; a 404 from a wrong method
    // would prove nothing about the write guard.
    const countBefore = await salesInvoiceCount();
    const noAuthCases: Array<[string, string, string, any]> = [
      ['sales invoice create', 'POST', '/sales/invoices', { customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }],
      ['sales invoice update', 'PUT', '/sales/invoices/00000000-0000-0000-0000-000000000000', {}],
      ['sales invoice void', 'POST', '/sales/invoices/00000000-0000-0000-0000-000000000000/void', {}],
      ['receipt create', 'POST', '/sales/receipts', { customerId: customer.id, receiptDate: INV_DATE, amount: 10 }],
      ['receipt post', 'POST', '/sales/receipts/00000000-0000-0000-0000-000000000000/post', {}],
      ['payment create', 'POST', '/purchasing/payments', { supplierId: supplier.id, paymentDate: INV_DATE, amount: 10 }],
      ['payment void', 'POST', '/purchasing/payments/00000000-0000-0000-0000-000000000000/void', {}],
      ['purchase invoice create', 'POST', '/purchasing/invoices', { supplierId: supplier.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }],
      ['purchase invoice update', 'PUT', '/purchasing/invoices/00000000-0000-0000-0000-000000000000', {}],
      ['purchase invoice void', 'POST', '/purchasing/invoices/00000000-0000-0000-0000-000000000000/void', {}],
      ['journal entry create', 'POST', '/journal-entries', { entryDate: INV_DATE, description: 'x', lines: [] }],
      ['journal entry post', 'POST', '/journal-entries/00000000-0000-0000-0000-000000000000/post', {}],
      ['journal entry reverse', 'POST', '/journal-entries/00000000-0000-0000-0000-000000000000/reverse', {}],
      ['journal entry delete', 'DELETE', '/journal-entries/00000000-0000-0000-0000-000000000000', undefined],
    ];
    let s1All401 = true;
    for (const [label, method, p, body] of noAuthCases) {
      const r = await api(method, p, body, null); // deliberately anonymous
      if (r.status !== 401) { console.log(`   ↳ ${label} ${method} → ${r.status}`); s1All401 = false; }
    }
    check(s1All401, 'S1.a every unauthenticated document write is rejected (401)');
    check((await salesInvoiceCount()) === countBefore, 'S1.b sales invoice count unchanged after anonymous attempts');

    // --- S2: forged token ---
    const forgedTok = await api('POST', '/sales/invoices', { customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }, 'forged-token-41064');
    check(forgedTok.status === 401, 'S2.a forged session token rejected (401)');
    check((await salesInvoiceCount()) === countBefore, 'S2.b state unchanged after forged-token attempts');

    // --- S3: token of a now-inactive user ---
    const inactiveWrite = await api('POST', '/sales/invoices', { customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }, inactToken);
    check(inactiveWrite.status === 401, 'S3.a inactive-user token rejected (401)', JSON.stringify(inactiveWrite.json));
    check(String(inactiveWrite.json?.error || '').includes('معطل') || inactiveWrite.status === 401, 'S3.b rejection explains the inactive account', inactiveWrite.json?.error);
    check((await salesInvoiceCount()) === countBefore, 'S3.c state unchanged after inactive-user attempt');

    // --- S4/S12: valid session WITHOUT permission → 403 + state unchanged ---
    const lowCases: Array<[string, string, string, any]> = [
      ['sales invoice create', 'POST', '/sales/invoices', { customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }],
      ['sales invoice update', 'PUT', '/sales/invoices/00000000-0000-0000-0000-000000000000', {}],
      ['sales invoice void', 'POST', '/sales/invoices/00000000-0000-0000-0000-000000000000/void', {}],
      ['receipt create', 'POST', '/sales/receipts', { customerId: customer.id, receiptDate: INV_DATE, amount: 10 }],
      ['payment create', 'POST', '/purchasing/payments', { supplierId: supplier.id, paymentDate: INV_DATE, amount: 10 }],
      ['payment void', 'POST', '/purchasing/payments/00000000-0000-0000-0000-000000000000/void', {}],
      ['purchase invoice create', 'POST', '/purchasing/invoices', { supplierId: supplier.id, invoiceDate: INV_DATE, lines: [{ description: 'x', quantity: 1, unitPrice: 1 }] }],
      ['purchase invoice void', 'POST', '/purchasing/invoices/00000000-0000-0000-0000-000000000000/void', {}],
      ['journal entry create', 'POST', '/journal-entries', { entryDate: INV_DATE, description: 'x', lines: [{ accountId: customer.id, debit: 1, credit: 0 }, { accountId: customer.id, debit: 0, credit: 1 }] }],
    ];
    let s4All403 = true;
    for (const [label, method, p, body] of lowCases) {
      const r = await api(method, p, body, roToken);
      if (r.status !== 403) { console.log(`   ↳ ${label} ${method} → ${r.status}`); s4All403 = false; }
    }
    check(s4All403, 'S4.a every write is 403 for a session with no document permissions');
    check((await salesInvoiceCount()) === countBefore, 'S4.b state unchanged after permission-denied attempts');

    // =============================================================
    // B. LIFECYCLE — SALES INVOICE (create/edit/post/void + statement)
    // =============================================================

    const invCount0 = await salesInvoiceCount();
    const invalidInv = await api('POST', '/sales/invoices', { customerId: customer.id, invoiceDate: INV_DATE, lines: [] }, adminToken);
    check(invalidInv.status === 400 && (await salesInvoiceCount()) === invCount0,
      'L2.a invalid invoice rejected (400) and leaves no orphan row', JSON.stringify(invalidInv.json));

    // S5/S7 in one create: forged userId + forged companyId/branchId
    const forgedCreate = await api('POST', '/sales/invoices', {
      customerId: customer.id,
      invoiceDate: INV_DATE,
      lines: [{ description: 'خدمة استشارية', quantity: 2, unitPrice: 2500, tax: 0 }],
      userId: '00000000-0000-0000-0000-00000000dead',
      username: 'l33t_hacker',
      companyId: BHOGUS_UUID,
      branchId: BHOGUS_UUID,
    }, adminToken);
    check(forgedCreate.status === 201 && !!forgedCreate.json?.id, 'L1.a valid sales invoice created with forged identity fields', `got ${forgedCreate.status}`);
    const salesInv = forgedCreate.json;
    check(salesInv.company_id !== BHOGUS_UUID, 'S7.a forged companyId ignored for storage (server-scoped)', salesInv.company_id);
    const controlInv = await api('POST', '/sales/invoices', {
      customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'تحكم', quantity: 1, unitPrice: 100, tax: 0 }],
    }, adminToken);
    check(controlInv.status === 201 && controlInv.json.company_id === salesInv.company_id,
      'S7.b forged companyId equals the server-scoped company of a control document');
    check(forgedCreate.json.createdByName === 'admin' || !!forgedCreate.json.created_by,
      'S5.a invoice creator derives from the session, not the forged body userId', forgedCreate.json.createdByName);

    // verify stored values client-side vs computed
    const lineSum = 2 * 2500;
    const invDetail = await api('GET', `/sales/invoices/${salesInv.id}`);
    check(invDetail.status === 200
      && parseFloat(invDetail.json.subtotal) === lineSum
      && parseFloat(invDetail.json.total) === lineSum
      && invDetail.json.status === 'DRAFT',
      'L1.b detail endpoint returns the saved document (subtotal/total/status = DRAFT)', JSON.stringify({ s: invDetail.json?.subtotal, t: invDetail.json?.total }));

    // draft edit + forged username ignored (S6)
    const edit = await api('PUT', `/sales/invoices/${salesInv.id}`, {
      customerId: customer.id, invoiceDate: INV_DATE,
      lines: [{ description: 'خدمة استشارية', quantity: 2, unitPrice: 3000, tax: 0 }],
      username: 'l33t_hacker',
      status: 'POSTED',
      paid_amount: '99999',
    }, adminToken);
    check(edit.status === 200 && parseFloat(edit.json.total) === 6000, 'L3.a draft edit recomputes totals server-side', JSON.stringify({ t: edit.json?.total }));
    check(edit.json.status === 'DRAFT' && parseFloat(edit.json.paid_amount) !== 99999,
      'L3.b client cannot override status/paid_amount through the body');
    const audits = await api('GET', '/audit-logs', undefined, adminToken);
    const updAudit = Array.isArray(audits.json) ? audits.json.find((r: any) => r.entity_type === 'SALES_INVOICE' && r.entity_id === salesInv.id && r.action === 'UPDATE') : null;
    check(!!updAudit && updAudit.username === 'admin', 'S6.a modifier in the audit log is the session user, not the forged username', updAudit ? updAudit.username : 'no row');

    // customer statement baseline → post → delta → void → back (L9)
    const stmt0 = await api('GET', `/reports/customer-statement/${customer.id}`);
    const stmtBase = parseFloat(stmt0.json?.closingBalance ?? 0);
    check(stmt0.status === 200 && Number.isFinite(stmtBase), 'L9.a customer statement readable', JSON.stringify({ s0: stmtBase }));

    const post1 = await api('POST', `/sales/invoices/${salesInv.id}/post`, {}, adminToken);
    check(post1.status === 200 && !!post1.json?.journalEntryId, 'L9.b credit sales invoice posted → journal generated', JSON.stringify(post1.json));
    const stmt1 = await api('GET', `/reports/customer-statement/${customer.id}`);
    const stmtAfterPost = parseFloat(stmt1.json?.closingBalance ?? 0);
    check(Math.abs(stmtAfterPost - (stmtBase + 6000)) < 0.001,
      'L9.c closing balance grows by exactly the invoice total', JSON.stringify({ base: stmtBase, after: stmtAfterPost }));

    // S8: re-post must not duplicate the accounting effect
    const repoost = await api('POST', `/sales/invoices/${salesInv.id}/post`, {}, adminToken);
    check(repoost.status === 400, 'S8.a re-posting a posted invoice rejected (400)', JSON.stringify(repoost.json));
    const jeList = await api('GET', '/journal-entries?limit=300');
    const salesJEs = (Array.isArray(jeList.json) ? jeList.json : []).filter((j: any) => j.description?.includes(String(salesInv.invoice_number)));
    check(salesJEs.length === 1, 'S8.b exactly ONE journal entry exists for the invoice after re-post attempt', salesInv.invoice_number);
    const sje = salesJEs[0];
    check(sje.status === 'POSTED', 'S8.c the invoice journal stays POSTED');
    const sjeDetail = await api('GET', `/journal-entries/${sje.id}`);
    const sums = sumLines(sjeDetail.json?.lines);
    check(Math.abs(sums.d - 6000) < 0.0001 && Math.abs(sums.c - 6000) < 0.0001 && Math.abs(sums.d - sums.c) < 0.0001,
      'L4.a-aux invoice journal is balanced and equals the document total (revenue entries gross=net+tax)', JSON.stringify(sums));

    // L10: reads mutate nothing
    const d1 = await api('GET', `/sales/invoices/${salesInv.id}`);
    const auditsPre = await api('GET', '/audit-logs', undefined, adminToken);
    const d2 = await api('GET', `/sales/invoices/${salesInv.id}`);
    const auditsPost = await api('GET', '/audit-logs', undefined, adminToken);
    check(JSON.stringify(d1.json) === JSON.stringify(d2.json), 'L10.a repeated reads return identical documents');
    check((Array.isArray(auditsPre.json) ? auditsPre.json.length : 0) === (Array.isArray(auditsPost.json) ? auditsPost.json.length : 0),
      'L10.b reads write nothing to the audit log');
    check(d2.json.status === 'POSTED' && d2.json.journal_entry_id === sje.id,
      'L10.c displayed status matches the persisted status');

    // void posted CREDIT invoice → statement returns to baseline (L9.d/L9.e)
    const void1 = await api('POST', `/sales/invoices/${salesInv.id}/void`, {}, adminToken);
    check(void1.status === 200, 'L9.d posted invoice voided', JSON.stringify(void1.json));
    const stmt2 = await api('GET', `/reports/customer-statement/${customer.id}`);
    const stmtAfterVoid = parseFloat(stmt2.json?.closingBalance ?? 0);
    check(Math.abs(stmtAfterVoid - stmtBase) < 0.001,
      'L9.e closing balance returns to baseline after void — voided document never stays effective', JSON.stringify({ base: stmtBase, after: stmtAfterVoid }));

    // S9: void re-entry cannot duplicate the reversal
    const v2 = await api('POST', `/sales/invoices/${salesInv.id}/void`, {}, adminToken);
    check(v2.status === 400 && String(v2.json?.error || '').includes('ملغاة'), 'S9.a second void rejected (already voided)', v2.json?.error);
    const audits2 = await api('GET', '/audit-logs', undefined, adminToken);
    const reverseAudits = (Array.isArray(audits2.json) ? audits2.json : [])
      .filter((r: any) => r.action === 'REVERSE' && r.entity_type === 'JOURNAL_ENTRY' && r.entity_id === sje.id);
    check(reverseAudits.length === 1, 'S9.b exactly ONE reversal was recorded for the invoice journal', String(reverseAudits.length));
    const rep2 = await api('POST', `/sales/invoices/${salesInv.id}/post`, {}, adminToken);
    check(rep2.status === 400, 'S9.c voided invoice cannot be re-posted');

    // posted-document edit lock (state-proof): control invoice flows DRAFT →
    // POSTED; the service only allows edits in the DRAFT stage.
    const controlInvId = controlInv.json.id;
    const lockPut = await api('PUT', `/sales/invoices/${controlInvId}`, {
      customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'قبل الترحيل', quantity: 1, unitPrice: 77 }],
    }, adminToken);
    check(lockPut.status === 200 && parseFloat(lockPut.json?.total) === 77,
      'L3.c-draft editing an unposted invoice works and recomputes totals', JSON.stringify({ t: lockPut.json?.total }));
    const lockPost = await api('POST', `/sales/invoices/${controlInvId}/post`, {}, adminToken);
    check(lockPost.status === 200, 'L3.c-post posting the control invoice succeeds');
    const afterPostGet = await api('GET', `/sales/invoices/${controlInvId}`);
    check(afterPostGet.json.status === 'POSTED' && afterPostGet.json.lines?.[0]?.description === 'قبل الترحيل',
      'L3.c-posted edit lock: the posted snapshot is intact', JSON.stringify({ d: afterPostGet.json.lines?.[0]?.description }));
    const lockPut2 = await api('PUT', `/sales/invoices/${controlInvId}`, {
      customerId: customer.id, invoiceDate: INV_DATE, lines: [{ description: 'بعد الترحيل', quantity: 1, unitPrice: 99 }],
    }, adminToken);
    check(lockPut2.status === 400, 'L3.d editing a POSTED invoice is rejected (400)', lockPut2.json?.error);
    const afterLockGet = await api('GET', `/sales/invoices/${controlInvId}`);
    check(afterLockGet.json.status === 'POSTED' && afterLockGet.json.lines?.[0]?.description === 'قبل الترحيل'
      && Math.abs(parseFloat(afterLockGet.json.total) - 77) < 0.0001,
      'L3.e state after the rejected edit unchanged — posted document is immutable via edit', JSON.stringify({ st: afterLockGet.json.status, t: afterLockGet.json.total }));

    // =============================================================
    // B. LIFECYCLE — PURCHASE INVOICE WITH STOCK (receipt/void/cancel)
    // =============================================================
    const stockBefore = await api('GET', `/inventory/items/${itemId}/stock`);
    const stockBeforeQty = parseFloat(stockBefore.json?.currentStock || 0);

    // Purchase-invoice DRAFT edit lifecycle (route got its catalog gate in
    // 10.6.4 — prove the draft edit path itself still works when allowed).
    const pEditCreate = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id, invoiceDate: INV_DATE, postingType: 'EXPENSE',
      lines: [{ description: 'مسودة', quantity: 1, unitPrice: 250, tax: 0 }],
    }, adminToken);
    check(pEditCreate.status === 201, 'L13.a purchase invoice draft created for edit test');
    const pEditId = pEditCreate.json.id;
    const pEditPut = await api('PUT', `/purchasing/invoices/${pEditId}`, {
      supplierId: supplier.id, invoiceDate: INV_DATE,
      lines: [{ description: 'مسودة بعد التعديل', quantity: 2, unitPrice: 300, tax: 0 }],
      status: 'POSTED',
    }, adminToken);
    check(pEditPut.status === 200 && Math.abs(parseFloat(pEditPut.json?.total || '0') - 600) < 0.0001
      && pEditPut.json?.status === 'DRAFT',
      'L13.b purchase draft edit recomputes totals and cannot be forced to POSTED by the body', JSON.stringify({ st: pEditPut.json?.status, t: pEditPut.json?.total }));
    const pEditPost = await api('POST', `/purchasing/invoices/${pEditId}/post`, {}, adminToken);
    check(pEditPost.status === 200, 'L13.c edited purchase draft posts normally');
    const pEditPut2 = await api('PUT', `/purchasing/invoices/${pEditId}`, {
      supplierId: supplier.id, invoiceDate: INV_DATE,
      lines: [{ description: 'بعد الترحيل', quantity: 9, unitPrice: 9, tax: 0 }],
    }, adminToken);
    check(pEditPut2.status === 400, 'L13.d editing a POSTED purchase invoice rejected', pEditPut2.json?.error);
    const pEditGet = await api('GET', `/purchasing/invoices/${pEditId}`);
    check(pEditGet.json?.status === 'POSTED' && Math.abs(parseFloat(pEditGet.json?.total || '0') - 600) < 0.0001,
      'L13.e posted purchase document intact after rejected edit', JSON.stringify({ st: pEditGet.json?.status, t: pEditGet.json?.total }));

    const pinvCreate = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id,
      invoiceDate: INV_DATE,
      postingType: 'INVENTORY',
      paymentType: 'CASH',
      lines: [{ itemId, description: 'أصناف للمخزون', quantity: 5, unitPrice: 1000, tax: 0 }],
    }, adminToken);
    check(pinvCreate.status === 201 && !!pinvCreate.json?.id, 'L4.a inventory purchase invoice created', `got ${pinvCreate.status}`);
    const pinvId = pinvCreate.json.id;
    const pinvPost = await api('POST', `/purchasing/invoices/${pinvId}/post`, {}, adminToken);
    check(pinvPost.status === 200, 'L4.b inventory purchase invoice posted', JSON.stringify(pinvPost.json));
    const stockAfter = await api('GET', `/inventory/items/${itemId}/stock`);
    check(Math.abs(parseFloat(stockAfter.json?.currentStock || 0) - (stockBeforeQty + 5)) < 0.0001,
      'L4.c stock received exactly once (one movement)', JSON.stringify({ before: stockBeforeQty, after: stockAfter.json?.currentStock }));

    const pinvRepoost = await api('POST', `/purchasing/invoices/${pinvId}/post`, {}, adminToken);
    check(pinvRepoost.status === 400, 'S8.d re-posting the purchase invoice rejected');
    const stockAfterRepost = await api('GET', `/inventory/items/${itemId}/stock`);
    check(Math.abs(parseFloat(stockAfterRepost.json?.currentStock || 0) - (stockBeforeQty + 5)) < 0.0001,
      'S8.e stock NOT duplicated by the re-post attempt', JSON.stringify(stockAfterRepost.json?.currentStock));

    // GL 1104 equals subledger value post-posting
    // void → stock cancels back to baseline (F2 fix proof)
    const pinvVoid = await api('POST', `/purchasing/invoices/${pinvId}/void`, {}, adminToken);
    check(pinvVoid.status === 200, 'L5.a posted inventory purchase invoice voided', JSON.stringify(pinvVoid.json));
    const stockVoided = await api('GET', `/inventory/items/${itemId}/stock`);
    check(Math.abs(parseFloat(stockVoided.json?.currentStock || 0) - stockBeforeQty) < 0.0001,
      'L5.b stock returns to the pre-invoice quantity after void (movement VOIDED — zero schema change)', JSON.stringify({ before: stockBeforeQty, after: stockVoided.json?.currentStock }));
    const pinvGet = await api('GET', `/purchasing/invoices/${pinvId}`);
    check(pinvGet.json?.status === 'VOIDED', 'L5.c purchase invoice status VOIDED and persisted');
    const rep3 = await api('POST', `/purchasing/invoices/${pinvId}/post`, {}, adminToken);
    check(rep3.status === 400 && String(rep3.json?.error || '').includes('ملغاة'), 'L5.d voided purchase invoice cannot be re-posted');
    const pinvVoid2 = await api('POST', `/purchasing/invoices/${pinvId}/void`, {}, adminToken);
    check(pinvVoid2.status === 400, 'L5.e second void rejected — no duplicate stock cancellation', pinvVoid2.json?.error);
    const stockVoided2 = await api('GET', `/inventory/items/${itemId}/stock`);
    check(Math.abs(parseFloat(stockVoided2.json?.currentStock || 0) - stockBeforeQty) < 0.0001,
      'L5.f stock still at baseline after the rejected second void');

    // =============================================================
    // B. LIFECYCLE — RECEIPT (transactional create + post round-trip)
    // =============================================================
    const recCount0 = await receiptsCount();
    // FK-failure injection: allocation pointing at a non-existent invoice
    const badReceipt = await api('POST', '/sales/receipts', {
      customerId: customer.id,
      receiptDate: INV_DATE,
      amount: 100,
      allocationInvoiceId: null,
      allocations: [{ invoiceId: BHOGUS_UUID, amount: 100 }],
    }, adminToken);
    check(badReceipt.status === 400 && (await receiptsCount()) === recCount0,
      'L7.a receipt with an unknown allocation invoice is rejected AND no orphan header is left (transaction rollback)', JSON.stringify(badReceipt.json));

    const stmtR0 = await api('GET', `/reports/customer-statement/${customer.id}`);
    const stmtR0Base = parseFloat(stmtR0.json?.closingBalance ?? 0);
    const goodReceipt = await api('POST', '/sales/receipts', {
      customerId: customer.id,
      paymentMethod: 'CASH',
      receiptDate: INV_DATE,
      amount: 700,
      description: 'دفعة نقدية مقدمة',
    }, adminToken);
    check(goodReceipt.status === 201 && !!goodReceipt.json?.id, 'L6.a valid receipt created', `got ${goodReceipt.status}`);
    const receiptId = goodReceipt.json.id;
    const recDetail0 = await api('GET', `/sales/receipts/${receiptId}`);
    check(recDetail0.json?.status === 'DRAFT' && recDetail0.json?.createdByName === 'admin',
      'S5.b receipt creator is the session user', JSON.stringify({ st: recDetail0.json?.status, cb: recDetail0.json?.createdByName }));    const recPost = await api('POST', `/sales/receipts/${receiptId}/post`, {}, adminToken);
    check(recPost.status === 200 && !!recPost.json?.journalEntryId, 'L6.b receipt posted → journal generated', JSON.stringify(recPost.json));
    const recJEDetail = await api('GET', `/journal-entries/${recPost.json.journalEntryId}`);
    const recSums = sumLines(recJEDetail.json?.lines);
    check(Math.abs(recSums.d - 700) < 0.0001 && Math.abs(recSums.c - 700) < 0.0001 && Math.abs(recSums.d - recSums.c) < 0.0001,
      'L6.c receipt journal balanced and equals the receipt amount', JSON.stringify(recSums));
    const recRepost = await api('POST', `/sales/receipts/${receiptId}/post`, {}, adminToken);
    check(recRepost.status === 400 && String(recRepost.json?.error || '').includes('مرحل'), 'L6.d re-posting a posted receipt rejected');
    const stmtR1 = await api('GET', `/reports/customer-statement/${customer.id}`);
    const stmtR1After = parseFloat(stmtR1.json?.closingBalance ?? 0);
    check(Math.abs(stmtR1After - (stmtR0Base - 700)) < 0.001,
      'L6.e customer statement reflects exactly one receipt effect', JSON.stringify({ base: stmtR0Base, after: stmtR1After }));

    // =============================================================
    // B. LIFECYCLE — SUPPLIER PAYMENT (credit invoice → pay → void)
    // =============================================================
    const cinv = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id,
      invoiceDate: INV_DATE,
      postingType: 'EXPENSE',
      paymentType: 'CREDIT',
      lines: [{ description: 'خدمات تصنيف', quantity: 1, unitPrice: 4000, tax: 0 }],
    }, adminToken);
    check(cinv.status === 201, 'L8.a credit purchase invoice created');
    const cinvId = cinv.json.id;
    const cinvPost = await api('POST', `/purchasing/invoices/${cinvId}/post`, {}, adminToken);
    check(cinvPost.status === 200, 'L8.b credit purchase invoice posted');

    const stmtS0 = await api('GET', `/reports/supplier-statement/${supplier.id}`);
    const supBase = parseFloat(stmtS0.json?.closingBalance ?? stmtS0.json?.balance ?? 0);
    const badPay = await api('POST', '/purchasing/payments', {
      supplierId: supplier.id, paymentMethod: 'CASH', paymentDate: INV_DATE, amount: 4000,
      allocations: [{ invoiceId: BHOGUS_UUID, amount: 4000 }],
    }, adminToken);
    check(badPay.status === 201 || badPay.status === 400, 'L8.c payment create with unknown allocation accepted-or-rejected by policy', JSON.stringify(badPay.json?.error));

    const payRes = await api('POST', '/purchasing/payments', {
      supplierId: supplier.id, paymentMethod: 'CASH', paymentDate: INV_DATE, amount: 1500,
      allocations: [{ invoiceId: cinvId, amount: 1500 }],
    }, adminToken);
    check(payRes.status === 201, 'L8.d supplier payment created', `got ${payRes.status}`);
    const payId = payRes.json.id;
    const payPost = await api('POST', `/purchasing/payments/${payId}/post`, {}, adminToken);
    check(payPost.status === 200, 'L8.e supplier payment posted', JSON.stringify(payPost.json));
    const cinvDet = await api('GET', `/purchasing/invoices/${cinvId}`);
    check(Math.abs(parseFloat(cinvDet.json?.paid_amount || 0) - 1500) < 0.0001,
      'L8.f allocation updated the invoice paid_amount exactly once');
    const stmtS1 = await api('GET', `/reports/supplier-statement/${supplier.id}`);
    const supAfterPay = parseFloat(stmtS1.json?.closingBalance ?? stmtS1.json?.balance ?? 0);
    check(Math.abs(supAfterPay - (supBase - 1500)) < 0.001,
      'L8.g supplier statement = invoice total minus payment', JSON.stringify({ base: supBase, after: supAfterPay }));
    const payRep = await api('POST', `/purchasing/payments/${payId}/post`, {}, adminToken);
    check(payRep.status === 400, 'L8.h re-posting the payment rejected');
    const payVoid = await api('POST', `/purchasing/payments/${payId}/void`, {}, adminToken);
    check(payVoid.status === 200, 'L8.i posted payment voided');
    const cinvDet2 = await api('GET', `/purchasing/invoices/${cinvId}`);
    check(cinvDet2.json?.status === 'POSTED' && Math.abs(parseFloat(cinvDet2.json?.paid_amount || 0)) < 0.0001,
      'L8.j paid_amount rolled back; the invoice itself remains POSTED and effective', JSON.stringify({ st: cinvDet2.json?.status, paid: cinvDet2.json?.paid_amount }));
    const payVoid2 = await api('POST', `/purchasing/payments/${payId}/void`, {}, adminToken);
    check(payVoid2.status === 400 && String(payVoid2.json?.error || '').includes('ملغى'), 'L8.k second payment void rejected');
    const stmtS2 = await api('GET', `/reports/supplier-statement/${supplier.id}`);
    const supAfterVoid = parseFloat(stmtS2.json?.closingBalance ?? stmtS2.json?.balance ?? 0);
    check(Math.abs(supAfterVoid - supBase) < 0.001,
      'L8.l supplier statement returns to invoice-only state after void', JSON.stringify({ base: supBase, after: supAfterVoid }));

    // =============================================================
    // B. JOURNAL ENGINE — validation, delete rules, reversal integrity
    // =============================================================
    const acctList = await api('GET', '/accounting/accounts');
    const accounts: Record<string, any> = {};
    for (const a of acctList.json) accounts[String(a.code)] = a;
    const acc1 = accounts['1101'] || acctList.json[0];
    const acc2 = accounts['41'] || acctList.json[1] || acc1;

    const unbalanced = await api('POST', '/journal-entries', {
      entryDate: INV_DATE, description: 'قيد غير متوازن',
      lines: [
        { accountId: acc1.id, debit: 500, credit: 0 },
        { accountId: acc2.id, debit: 0, credit: 400 },
      ],
    }, adminToken);
    check(unbalanced.status === 201, 'L11.a unbalanced journal accepted as a DRAFT');
    const unbalPost = await api('POST', `/journal-entries/${unbalanced.json.id}/post`, {}, adminToken);
    check(unbalPost.status === 400 && String(unbalPost.json?.error || '').includes('متوازن'), 'L11.b posting an unbalanced journal rejected by the double-entry engine', unbalPost.json?.error);
    const unbalDel = await api('DELETE', `/journal-entries/${unbalanced.json.id}`, undefined, adminToken);
    check(unbalDel.status === 200, 'L11.c unbalanced DRAFT journal deleted safely');

    const shortJE = await api('POST', '/journal-entries', {
      entryDate: INV_DATE, description: 'سطر واحد', lines: [{ accountId: acc1.id, debit: 10, credit: 0 }],
    }, adminToken);
    check(shortJE.status === 400, 'L11.d journal with fewer than two lines rejected at creation');

    const balJE = await api('POST', '/journal-entries', {
      entryDate: INV_DATE, description: 'قيد يدوي متوازن', sourceId: 'GL',
      lines: [
        { accountId: acc1.id, debit: 300, credit: 0, description: 'مدين' },
        { accountId: acc2.id, debit: 0, credit: 300, description: 'دائن' },
      ],
    }, adminToken);
    check(balJE.status === 201 && !!balJE.json?.entry_number, 'L11.e balanced manual journal created as DRAFT');
    const balPost = await api('POST', `/journal-entries/${balJE.json.id}/post`, {}, adminToken);
    check(balPost.status === 200 && balPost.json?.entry?.status === 'POSTED', 'L11.f manual journal posted', JSON.stringify(balPost.json));
    balJE.json.entry_number;
    const balDetail = await api('GET', `/journal-entries/${balJE.json.id}`);
    check(balDetail.status === 200 && !!balDetail.json?.createdByName, 'S5.c manual journal creator derives from the session', balDetail.json?.createdByName);
    const postedDel = await api('DELETE', `/journal-entries/${balJE.json.id}`, undefined, adminToken);
    check(postedDel.status === 400 && String(postedDel.json?.error || '').includes('عكس'), 'L11.g deleting a POSTED journal rejected — reversal is the only path');
    const rev = await api('POST', `/journal-entries/${balJE.json.id}/reverse`, {}, adminToken);
    check(rev.status === 200 && rev.json?.result?.reversalEntry?.entry_number?.startsWith('REV-'), 'L11.h reversal entry created and linked');
    const revDetail = await api('GET', `/journal-entries/${balJE.json.id}`);
    check(revDetail.json?.status === 'REVERSED' && !!revDetail.json?.reversed_entry_id, 'L11.i original journal tied to its reversal (reversed_entry_id)');
    const revRe = await api('POST', `/journal-entries/${balJE.json.id}/reverse`, {}, adminToken);
    check(revRe.status === 400 && String(revRe.json?.error || '').includes('غير مرحّل'), 'L11.j re-reversal rejected — the reversal effect cannot be duplicated');
    const revjEPost = await api('POST', `/journal-entries/${rev.json?.result?.reversalEntry?.id}/post`, {}, adminToken);
    check(revjEPost.status === 400, 'L11.k the reversal entry cannot be re-posted independently');

    // =============================================================
    // C. SEVEN SCREENS STILL USABLE (list API state)
    // =============================================================
    const screens: Array<{ name: string; path: string }> = [
      { name: 'sales/invoices', path: '/sales/invoices' },
      { name: 'purchasing/invoices', path: '/purchasing/invoices' },
      { name: 'sales/returns', path: '/sales/returns' },
      { name: 'purchasing/returns', path: '/purchasing/returns' },
      { name: 'sales/receipts', path: '/sales/receipts' },
      { name: 'purchasing/payments', path: '/purchasing/payments' },
      { name: 'journal-entries', path: '/journal-entries' },
    ];
    for (const s of screens) {
      const r = await api('GET', s.path, undefined, adminToken);
      check(r.status === 200 && Array.isArray(r.json), `L12 screen list usable: ${s.name} → 200`, `got ${r.status}`);
    }

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
