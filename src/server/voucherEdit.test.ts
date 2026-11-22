import { spawn, type ChildProcess, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Voucher edit (PUT) lifecycle test — FULLY ISOLATED from .pgdata.
 *
 * Spawns its own server on its own port with a throwaway PGLITE directory and
 * drives the REAL HTTP routes, exactly as the browser does after wiring the
 * «تعديل» button in Receipts.tsx / SupplierPayments.tsx.
 *
 *   npx tsx src/server/voucherEdit.test.ts
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT = 3900 + (process.pid % 100);
const BASE = `http://127.0.0.1:${PORT}/api`;
const INV_DATE = '2026-10-25';

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

async function api(
  method: string,
  urlPath: string,
  body?: any,
  token?: string | null
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
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

async function waitForServer(child: ChildProcess, output: { text: string }): Promise<void> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`server child exited early (code ${child.exitCode}):\n${output.text}`);
    }
    try {
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

async function main() {
  console.log('================================================================');
  console.log('🧪 Voucher edit (PUT) — isolated server, operational .pgdata untouched');
  console.log(`   port=${PORT}`);
  console.log('================================================================');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-voucher-edit-'));
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
  child.stdout?.on('data', (chunk: Buffer) => { output.text += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { output.text += chunk.toString(); });

  try {
    await waitForServer(child, output);
    check(dataDir.includes('kayan-voucher-edit-') && dataDir !== path.resolve('.pgdata'),
      '0.1 isolated PGLite dir, never .pgdata', dataDir);

    const login = await api('POST', '/auth/login', { username: 'admin', password: 'admin123' }, null);
    check(login.status === 200 && !!login.json?.token, '0.2 admin session issued', JSON.stringify(login.json));
    adminToken = login.json.token;

    const scopeCatalog = await api('GET', '/settings/access-scope-catalog');
    const companyId = Array.isArray(scopeCatalog.json) && scopeCatalog.json[0]?.company_id;
    check(!!companyId, '0.3 company scope available', JSON.stringify(scopeCatalog.json));
    if (companyId) {
      const grant = await api('PUT', `/settings/users/${login.json.id}/access-scopes`, {
        companyIds: [companyId], branches: [],
      });
      check(grant.status === 200, '0.4 admin scope granted in isolated DB', JSON.stringify(grant.json));
    }

    const customers = await api('GET', '/customers');
    const suppliers = await api('GET', '/suppliers');
    const customer = Array.isArray(customers.json) ? customers.json[0] : null;
    const supplier = Array.isArray(suppliers.json) ? suppliers.json[0] : null;
    check(!!customer?.id && !!supplier?.id, '0.5 seeded customer + supplier available',
      JSON.stringify({ customer: customer?.id, supplier: supplier?.id }));

    /* ---------------- 1. سند القبض ---------------- */
    const rc = await api('POST', '/sales/receipts', {
      customerId: customer.id,
      counterpartyType: 'CUSTOMER',
      paymentMethod: 'CASH',
      receiptDate: INV_DATE,
      amount: 700,
      referenceNumber: 'OLD-REF',
      description: 'قبل التعديل',
    });
    check(rc.status === 201 && !!rc.json?.id, '1.1 draft receipt created', JSON.stringify(rc.json));
    const receiptId = rc.json.id;

    const r0 = await api('GET', `/sales/receipts/${receiptId}`);
    check(r0.json?.status === 'DRAFT' && !!r0.json?.updated_at, '1.2 receipt loaded with updated_at for optimistic lock');

    const rEdit = await api('PUT', `/sales/receipts/${receiptId}`, {
      counterpartyType: 'CUSTOMER',
      customerId: customer.id,
      paymentMethod: 'CASH',
      receiptDate: '2026-10-26',
      amount: 850,
      referenceNumber: 'NEW-REF',
      description: 'بعد التعديل',
      expectedUpdatedAt: r0.json.updated_at,
    });
    check(rEdit.status === 200 && Number(rEdit.json?.amount) === 850,
      '1.3 PUT updates receipt amount/date/description', JSON.stringify(rEdit.json));

    const r1 = await api('GET', `/sales/receipts/${receiptId}`);
    check(Number(r1.json?.amount) === 850 && r1.json?.description === 'بعد التعديل' &&
      String(r1.json?.receipt_date).slice(0, 10) === '2026-10-26' && r1.json?.reference_number === 'NEW-REF',
      '1.4 receipt edit persisted (read-back)', JSON.stringify({
        amount: r1.json?.amount, desc: r1.json?.description,
        date: r1.json?.receipt_date, ref: r1.json?.reference_number,
      }));
    check(r1.json?.status === 'DRAFT' && r1.json?.receipt_number === rc.json.receipt_number,
      '1.5 receipt number/status unchanged by edit');

    const stale = await api('PUT', `/sales/receipts/${receiptId}`, {
      counterpartyType: 'CUSTOMER', customerId: customer.id, paymentMethod: 'CASH',
      receiptDate: INV_DATE, amount: 999, expectedUpdatedAt: r0.json.updated_at,
    });
    check(stale.status === 400 && String(stale.json?.error || '').includes('تغيّرت'),
      '1.6 stale edit rejected (optimistic lock)', JSON.stringify(stale.json));

    const rPost = await api('POST', `/sales/receipts/${receiptId}/post`, {});
    check(rPost.status === 200, '1.7 edited receipt can still be posted', JSON.stringify(rPost.json));
    const lockedReceipt = await api('PUT', `/sales/receipts/${receiptId}`, {
      counterpartyType: 'CUSTOMER', customerId: customer.id, paymentMethod: 'CASH',
      receiptDate: INV_DATE, amount: 100,
    });
    check(lockedReceipt.status === 400 && String(lockedReceipt.json?.error || '').includes('مرحّل'),
      '1.8 posted receipt edit refused by server', JSON.stringify(lockedReceipt.json));

    /* ---------------- 2. سند الصرف ---------------- */
    const inv = await api('POST', '/purchasing/invoices', {
      supplierId: supplier.id,
      invoiceDate: INV_DATE,
      postingType: 'EXPENSE',
      paymentType: 'CREDIT',
      lines: [{ description: 'خدمات', quantity: 1, unitPrice: 4000, tax: 0 }],
    });
    check(inv.status === 201, '2.1 credit purchase invoice created', JSON.stringify(inv.json));
    const invPost = await api('POST', `/purchasing/invoices/${inv.json.id}/post`, {});
    check(invPost.status === 200, '2.2 purchase invoice posted', JSON.stringify(invPost.json));

    const pc = await api('POST', '/purchasing/payments', {
      supplierId: supplier.id,
      counterpartyType: 'SUPPLIER',
      paymentMethod: 'CASH',
      paymentDate: INV_DATE,
      amount: 300,
      referenceNumber: 'P-OLD',
      description: 'قبل التعديل',
      allocations: [{ invoiceId: inv.json.id, amount: 300 }],
    });
    check(pc.status === 201 && !!pc.json?.id, '2.3 draft payment created', JSON.stringify(pc.json));
    const paymentId = pc.json.id;

    const p0 = await api('GET', `/purchasing/payments/${paymentId}`);
    check(p0.json?.status === 'DRAFT' && !!p0.json?.updated_at && p0.json?.allocations?.length === 1,
      '2.4 payment loaded with allocation + updated_at', JSON.stringify({
        status: p0.json?.status, alloc: p0.json?.allocations?.length,
      }));

    const pEdit = await api('PUT', `/purchasing/payments/${paymentId}`, {
      counterpartyType: 'SUPPLIER',
      supplierId: supplier.id,
      paymentMethod: 'CASH',
      paymentDate: '2026-10-26',
      amount: 450,
      referenceNumber: 'P-NEW',
      description: 'بعد التعديل',
      allocations: [{ invoiceId: inv.json.id, amount: 450 }],
      expectedUpdatedAt: p0.json.updated_at,
    });
    check(pEdit.status === 200 && Number(pEdit.json?.amount) === 450,
      '2.5 PUT updates payment amount/date/description', JSON.stringify(pEdit.json));

    const p1 = await api('GET', `/purchasing/payments/${paymentId}`);
    check(Number(p1.json?.amount) === 450 && p1.json?.description === 'بعد التعديل' &&
      p1.json?.reference_number === 'P-NEW' &&
      Math.abs(Number(p1.json?.allocated_amount || 0) - 450) < 0.0001,
      '2.6 payment edit + allocation persisted (read-back)', JSON.stringify({
        amount: p1.json?.amount, desc: p1.json?.description,
        alloc: p1.json?.allocated_amount, ref: p1.json?.reference_number,
      }));
    check(p1.json?.status === 'DRAFT' && p1.json?.payment_number === pc.json.payment_number,
      '2.7 payment number/status unchanged by edit');

    const badAlloc = await api('PUT', `/purchasing/payments/${paymentId}`, {
      counterpartyType: 'SUPPLIER', supplierId: supplier.id, paymentMethod: 'CASH',
      paymentDate: INV_DATE, amount: 100,
      allocations: [{ invoiceId: inv.json.id, amount: 200 }],
    });
    check(badAlloc.status === 400, '2.8 allocation greater than voucher amount rejected', JSON.stringify(badAlloc.json));
    const p2 = await api('GET', `/purchasing/payments/${paymentId}`);
    check(Number(p2.json?.amount) === 450, '2.9 rejected edit left the voucher untouched');

    const pPost = await api('POST', `/purchasing/payments/${paymentId}/post`, {});
    check(pPost.status === 200, '2.10 edited payment can still be posted', JSON.stringify(pPost.json));
    const lockedPayment = await api('PUT', `/purchasing/payments/${paymentId}`, {
      counterpartyType: 'SUPPLIER', supplierId: supplier.id, paymentMethod: 'CASH',
      paymentDate: INV_DATE, amount: 100,
    });
    check(lockedPayment.status === 400 && String(lockedPayment.json?.error || '').includes('مرحّل'),
      '2.11 posted payment edit refused by server', JSON.stringify(lockedPayment.json));

    console.log('================================================================');
    console.log(`RESULT: ${passed} passed, ${failed} failed`);
    console.log('================================================================');
  } finally {
    stopChild(child);
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
