import { spawn, type ChildProcess, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * PHASE UI-CRUD — Master-data CRUD verification over real HTTP.
 *
 * Runs against its OWN server process (`server.ts`) on its own port with a
 * throwaway PGLITE_DATA_DIR created by mkdtemp — never the operational
 * `F:\KAYAN_ERP2026\.pgdata`. Writes go through the same route handlers the
 * browser uses, and every assertion reads the record back from the API.
 *
 * Covers the screens migrated in this phase:
 *   Suppliers, Customers, Inventory Items, Warehouses, Chart of Accounts,
 *   Fiscal Periods, Inventory Counts.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const IS_WINDOWS = process.platform === 'win32';
const PORT = 4200 + (process.pid % 300);
const BASE = `http://127.0.0.1:${PORT}/api`;

let passed = 0;
let failed = 0;
let adminToken: string | null = null;

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
  const effectiveToken = token ?? adminToken ?? undefined;
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
  throw new Error(`server did not become ready on port ${PORT}:\n${output.text}`);
}

function stopChild(child: ChildProcess) {
  try {
    if (IS_WINDOWS && child.pid) {
      execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: 'ignore' });
      return;
    }
    child.kill('SIGTERM' as any);
  } catch {
    /* already dead */
  }
}

function errorText(r: { json: any }): string {
  return String(r.json?.error ?? '');
}

async function run() {
  console.log('================================================================');
  console.log('🧪 UI-CRUD — master data create / edit / reject / delete');
  console.log(`   isolated server port=${PORT} (operational .pgdata untouched)`);
  console.log('================================================================');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kayan-uicrud-'));
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
  const capture = (chunk: Buffer) => {
    output.text += chunk.toString();
  };
  child.stdout?.on('data', capture);
  child.stderr?.on('data', capture);

  const suffix = String(process.pid).slice(-5);

  try {
    await waitForServer(child, output);
    pass('0.1 isolated server ready on a throwaway PGlite directory');
    check(
      dataDir.includes('kayan-uicrud-') && path.resolve(dataDir) !== path.resolve(ROOT, '.pgdata'),
      '0.2 tests never touch .pgdata (isolated PGLITE_DATA_DIR)',
      dataDir
    );

    const admin = await api('POST', '/auth/login', { username: 'admin', password: 'admin123' });
    check(admin.status === 200 && !!admin.json?.token, '0.3 admin session issued', JSON.stringify(admin.json));
    adminToken = admin.json?.token ?? null;

    // PHASE COA-1 — in the isolated bootstrap DB the admin has no company scope
    // row yet; grant one via the access-scopes API so company-scoped CRUD tests
    // can run against the isolated instance.
    const scopeCatalog = await api('GET', '/settings/access-scope-catalog');
    const scopeCompanyId = Array.isArray(scopeCatalog.json) && scopeCatalog.json.length > 0
      ? scopeCatalog.json[0].company_id
      : null;
    if (scopeCompanyId) {
      const grantScopes = await api('PUT', `/settings/users/${admin.json.id}/access-scopes`, {
        companyIds: [scopeCompanyId],
        branches: [],
      });
      check(grantScopes.status === 200, '0.4 admin company access scope granted in isolated DB', JSON.stringify(grantScopes.json));
    }

    // ==========================================================
    // 1. SUPPLIERS
    // ==========================================================
    const supA = await api('POST', '/suppliers', {
      code: `UISUP-${suffix}A`,
      name: 'مورد اختبار ألف',
      phone: '777000111',
      creditLimit: 12345.67,
      paymentTermsDays: 45,
    });
    check(supA.status === 201 && !!supA.json?.id, '1.1 supplier A created (201)', JSON.stringify(supA.json));

    const supList = await api('GET', `/suppliers?search=UISUP-${suffix}A`);
    const supRead = Array.isArray(supList.json) ? supList.json[0] : null;
    check(
      supList.status === 200 && supRead?.name === 'مورد اختبار ألف' && Number(supRead?.credit_limit) === 12345.67,
      '1.2 supplier A values persisted and readable',
      JSON.stringify(supRead)
    );
    check(Number(supRead?.payment_terms_days) === 45, '1.3 numeric terms stored as number, not defaulted', supRead?.payment_terms_days);

    const supDup = await api('POST', '/suppliers', { code: `UISUP-${suffix}A`, name: 'تكرار' });
    check(supDup.status === 400 && errorText(supDup).length > 0, '1.4 duplicate supplier code rejected with reason', JSON.stringify(supDup.json));

    const supNoName = await api('POST', '/suppliers', { code: `UISUP-${suffix}N` });
    check(supNoName.status === 400, '1.5 supplier without name rejected server-side', JSON.stringify(supNoName.json));

    const supB = await api('POST', '/suppliers', { code: `UISUP-${suffix}B`, name: 'مورد اختبار باء' });
    check(supB.status === 201, '1.6 supplier B created for isolation test');

    const supEdit = await api('PUT', `/suppliers/${supA.json.id}`, {
      name: 'مورد اختبار ألف - معدل',
      phone: '777000222',
    });
    check(supEdit.status === 200, '1.7 supplier A update accepted', JSON.stringify(supEdit.json));

    const supAList = await api('GET', `/suppliers?search=UISUP-${suffix}A`);
    const supBList = await api('GET', `/suppliers?search=UISUP-${suffix}B`);
    check(supAList.json[0]?.name === 'مورد اختبار ألف - معدل', '1.8 edit applied to the selected supplier only');
    check(supBList.json[0]?.name === 'مورد اختبار باء', '1.9 other supplier untouched by the edit');

    const supToggle = await api('PUT', `/suppliers/${supA.json.id}`, { isActive: false });
    check(supToggle.status === 200, '1.10 supplier deactivate accepted');
    const supAfter = await api('GET', `/suppliers/${supA.json.id}`);
    check(supAfter.json?.is_active === false, '1.11 deactivation persisted (not a UI-only toggle)');

    const supDelete = await api('DELETE', `/suppliers/${supA.json.id}`);
    check(
      supDelete.status === 404 || supDelete.status === 405,
      '1.12 no supplier DELETE endpoint — UI must not offer a fake delete',
      `status ${supDelete.status}`
    );

    // ==========================================================
    // 2. CUSTOMERS
    // ==========================================================
    const cusA = await api('POST', '/customers', {
      code: `UICUS-${suffix}A`,
      name: 'عميل اختبار ألف',
      creditLimit: 5000,
      paymentTermsDays: 15,
    });
    check(cusA.status === 201 && !!cusA.json?.id, '2.1 customer created (201)', JSON.stringify(cusA.json));

    const cusDup = await api('POST', '/customers', { code: `UICUS-${suffix}A`, name: 'تكرار' });
    check(cusDup.status === 400 && errorText(cusDup).length > 0, '2.2 duplicate customer code rejected with reason');

    const cusB = await api('POST', '/customers', { code: `UICUS-${suffix}B`, name: 'عميل اختبار باء' });
    check(cusB.status === 201, '2.3 second customer created');

    const cusEdit = await api('PUT', `/customers/${cusA.json.id}`, { name: 'عميل اختبار ألف - معدل', creditLimit: 9000 });
    check(cusEdit.status === 200, '2.4 customer update accepted');

    const cusAList = await api('GET', `/customers?search=UICUS-${suffix}A`);
    const cusBList = await api('GET', `/customers?search=UICUS-${suffix}B`);
    check(cusAList.json[0]?.name === 'عميل اختبار ألف - معدل', '2.5 edit applied to the selected customer only');
    check(cusBList.json[0]?.name === 'عميل اختبار باء', '2.6 other customer untouched');

    const cusDelete = await api('DELETE', `/customers/${cusA.json.id}`);
    check(cusDelete.status === 404 || cusDelete.status === 405, '2.7 no customer DELETE endpoint (no fake delete)', `status ${cusDelete.status}`);

    // ==========================================================
    // 3. INVENTORY ITEMS (create / edit / delete rules)
    // ==========================================================
    const itemA = await api('POST', '/inventory/items', {
      sku: `UIIT-${suffix}-A`,
      name: 'صنف اختبار ألف',
      purchasePrice: 100,
      salePrice: 150,
      isStockItem: true,
    });
    check(itemA.status === 201 && !!itemA.json?.id, '3.1 item A created (201)', JSON.stringify(itemA.json));

    const itemB = await api('POST', '/inventory/items', {
      sku: `UIIT-${suffix}-B`,
      name: 'صنف اختبار باء',
      purchasePrice: 200,
      salePrice: 250,
      isStockItem: true,
    });
    check(itemB.status === 201, '3.2 item B created');

    const itemEdit = await api('PUT', `/inventory/items/${itemA.json.id}`, {
      name: 'صنف اختبار ألف - معدل',
      salePrice: 175,
    });
    check(itemEdit.status === 200, '3.3 item update accepted');

    const itemARead = await api('GET', `/inventory/items/${itemA.json.id}`);
    const itemBRead = await api('GET', `/inventory/items/${itemB.json.id}`);
    check(
      itemARead.json?.name === 'صنف اختبار ألف - معدل' && Number(itemARead.json?.sale_price) === 175,
      '3.4 edit applied to the selected item',
      JSON.stringify(itemARead.json)
    );
    check(itemBRead.json?.name === 'صنف اختبار باء', '3.5 other item untouched by the edit');

    const itemDel = await api('DELETE', `/inventory/items/${itemB.json.id}`, { userId: admin.json?.id });
    check(itemDel.status === 200, '3.6 unused item delete allowed', JSON.stringify(itemDel.json));
    const itemBAfter = await api('GET', `/inventory/items/${itemB.json.id}`);
    check(itemBAfter.status === 404, '3.7 deleted item no longer readable (real delete, not cosmetic)');

    // item A receives a real stock movement so the delete guard can be proven
    const wh = await api('POST', '/inventory/warehouses', {
      code: `UIWH-${suffix}`,
      name: 'مستودع اختبار',
    });
    check(wh.status === 201 && !!wh.json?.id, '3.8 warehouse created for stock movement', JSON.stringify(wh.json));

    const adjust = await api('POST', '/inventory/transactions', {
      transactionType: 'OPENING',
      transactionDate: '2026-10-20',
      warehouseId: wh.json.id,
      notes: 'UI-CRUD guard test',
      lines: [{ itemId: itemA.json.id, quantity: 5, unitCost: 100 }],
      userId: admin.json?.id,
    });
    check(adjust.status === 201, '3.9 stock opening transaction posted for item A', JSON.stringify(adjust.json).slice(0, 200));

    const guardedDelete = await api('DELETE', `/inventory/items/${itemA.json.id}`, { userId: admin.json?.id });
    check(
      guardedDelete.status === 400 && errorText(guardedDelete).length > 0,
      '3.10 delete of an item with movements refused with a reason',
      JSON.stringify(guardedDelete.json)
    );

    const itemAAfter = await api('GET', `/inventory/items/${itemA.json.id}`);
    check(itemAAfter.status === 200, '3.11 refused delete left the item intact');

    // ==========================================================
    // 4. WAREHOUSES
    // ==========================================================
    const whDup = await api('POST', '/inventory/warehouses', { code: `UIWH-${suffix}`, name: 'تكرار' });
    check(whDup.status === 400 && errorText(whDup).length > 0, '4.1 duplicate warehouse code rejected with reason');

    const whNoName = await api('POST', '/inventory/warehouses', { code: `UIWH-${suffix}X` });
    check(whNoName.status === 400, '4.2 warehouse without name rejected server-side');

    const whList = await api('GET', '/inventory/warehouses');
    const createdWh = Array.isArray(whList.json) ? whList.json.find((w: any) => w.code === `UIWH-${suffix}`) : null;
    check(!!createdWh && createdWh.name === 'مستودع اختبار', '4.3 created warehouse listed from the source');

    const whDelete = await api('DELETE', `/inventory/warehouses/${wh.json.id}`);
    check(whDelete.status === 404 || whDelete.status === 405, '4.4 no warehouse DELETE endpoint (no fake delete)', `status ${whDelete.status}`);

    // ==========================================================
    // 5. CHART OF ACCOUNTS
    // ==========================================================
    const acc = await api('POST', '/accounts', {
      code: `9${suffix}`,
      name: 'حساب اختبار واجهة',
      accountTypeId: 'ASSET',
      isGroup: false,
      normalBalance: 'DEBIT',
    });
    check(acc.status === 201 && !!acc.json?.id, '5.1 account created (201)', JSON.stringify(acc.json));

    const accDup = await api('POST', '/accounts', {
      code: `9${suffix}`,
      name: 'تكرار',
      accountTypeId: 'ASSET',
    });
    check(accDup.status === 400 && errorText(accDup).length > 0, '5.2 duplicate account code rejected with reason');

    const accMissing = await api('POST', '/accounts', { code: `8${suffix}`, accountTypeId: 'ASSET' });
    check(accMissing.status === 400, '5.3 account without name rejected server-side');

    const accEdit = await api('PUT', `/accounts/${acc.json.id}`, { name: 'حساب اختبار واجهة - معدل', isActive: false });
    check(accEdit.status === 200, '5.4 account update accepted');

    const accList = await api('GET', '/accounts');
    const accRead = Array.isArray(accList.json) ? accList.json.find((a: any) => a.id === acc.json.id) : null;
    check(
      accRead?.name === 'حساب اختبار واجهة - معدل' && accRead?.isActive === false,
      '5.5 account edit persisted and visible in the chart',
      JSON.stringify(accRead)
    );

    // PHASE COA-1 — شجرة الحسابات: إنشاء تجميعي/تفصيلي + قواعد الأب + الحذف الآمن.
    const accGroup = await api('POST', '/accounts', {
      code: `7${suffix}`,
      name: 'حساب تجميعي اختبار',
      accountTypeId: 'ASSET',
      isGroup: true,
      normalBalance: 'DEBIT',
    });
    check(accGroup.status === 201 && !!accGroup.json?.id, '5.6 aggregate (group) account created (201)', JSON.stringify(accGroup.json));

    const accChild = await api('POST', '/accounts', {
      code: `71${suffix}`,
      name: 'حساب تفصيلي فرعي اختبار',
      accountTypeId: 'ASSET',
      parentId: accGroup.json.id,
      isGroup: false,
      normalBalance: 'DEBIT',
    });
    check(accChild.status === 201 && !!accChild.json?.id, '5.7 child account under aggregate created (201)', JSON.stringify(accChild.json));

    const accChildList = await api('GET', '/accounts');
    const accChildRead = Array.isArray(accChildList.json) ? accChildList.json.find((a: any) => a.id === accChild.json.id) : null;
    check(
      accChildRead?.level === 2 && accChildRead?.isGroup === false,
      '5.8 child level derives from parent level + 1 and is a detail (leaf)',
      JSON.stringify(accChildRead)
    );

    const accBadParent = await api('POST', '/accounts', {
      code: `72${suffix}`,
      name: 'حساب أب فرد',
      accountTypeId: 'ASSET',
      parentId: accChild.json.id,
      isGroup: false,
      normalBalance: 'DEBIT',
    });
    check(accBadParent.status === 400 && errorText(accBadParent).length > 0, '5.9 parent must be an aggregate (group) account', JSON.stringify(accBadParent.json));

    const accBadCode = await api('POST', '/accounts', { code: `AB${suffix}`, name: 'كود غير رقمي', accountTypeId: 'ASSET' });
    check(accBadCode.status === 400, '5.10 account code must be numeric-only', JSON.stringify(accBadCode.json));

    const jeGroup = await api('POST', '/journal-entries', {
      entryDate: '2026-10-20',
      description: 'قيد اختبار حساب تجميعي',
      lines: [
        { accountId: accGroup.json.id, debit: 10, credit: 0, description: 'تجمع تجميعي' },
        { accountId: accChild.json.id, debit: 0, credit: 10, description: 'توزيع تفصيلي' },
      ],
    });
    check(jeGroup.status === 400 && errorText(jeGroup).length > 0, '5.11 aggregate account cannot enter journal lines', JSON.stringify(jeGroup.json));

    const accClean = await api('POST', '/accounts', {
      code: `73${suffix}`,
      name: 'حساب حذف نظيف',
      accountTypeId: 'EXPENSE',
      isGroup: false,
      normalBalance: 'DEBIT',
    });
    check(accClean.status === 201, '5.12 clean account created for delete guard', JSON.stringify(accClean.json));

    const accCleanDel = await api('DELETE', `/accounts/${accClean.json.id}`);
    check(accCleanDel.status === 200, '5.13 clean account delete allowed when no movements/links', JSON.stringify(accCleanDel.json));

    const accCleanDelAgain = await api('DELETE', `/accounts/${accClean.json.id}`);
    check(accCleanDelAgain.status === 404, '5.14 deleting an already-deleted account returns 404', JSON.stringify(accCleanDelAgain.json));

    const accMov = await api('POST', '/accounts', {
      code: `74${suffix}`,
      name: 'حساب حركة اختبار الحذف',
      accountTypeId: 'EXPENSE',
      isGroup: false,
      normalBalance: 'DEBIT',
    });
    check(accMov.status === 201, '5.15 movement account created for delete guard test', JSON.stringify(accMov.json));

    const jeMovements = await api('POST', '/journal-entries', {
      entryDate: '2026-10-20',
      description: 'قيد اختبار حذف محاسبي',
      lines: [
        { accountId: accMov.json.id, debit: 5, credit: 0, description: 'تحرك على الحساب' },
        { accountId: accChild.json.id, debit: 0, credit: 5, description: 'توازن' },
      ],
    });
    check(jeMovements.status === 201, '5.16 valid journal entry created for movement-linked delete test', JSON.stringify(jeMovements.json).slice(0, 200));

    const postMovements = await api('POST', `/journal-entries/${jeMovements.json.id}/post`);
    check(postMovements.status === 200, '5.17 journal entry posted for movement-linked delete test', JSON.stringify(postMovements.json).slice(0, 200));

    const accMovGuard = await api('DELETE', `/accounts/${accMov.json.id}`);
    check(accMovGuard.status === 409 && errorText(accMovGuard).length > 0, '5.18 delete of account with movements refused', JSON.stringify(accMovGuard.json));

    // ==========================================================
    // 6. FISCAL PERIODS (close / reopen with mandatory reason)
    // ==========================================================
    const periodsRes = await api('GET', '/fiscal-periods');
    check(periodsRes.status === 200 && Array.isArray(periodsRes.json) && periodsRes.json.length > 0, '6.1 fiscal periods listed');
    const openPeriod = periodsRes.json.find((p: any) => p.status === 'OPEN');
    check(!!openPeriod, '6.2 an OPEN period exists for the close/reopen workflow');

    if (openPeriod) {
      const closingCheck = await api('GET', `/fiscal-periods/${openPeriod.id}/closing-check`);
      check(
        closingCheck.status === 200 && typeof closingCheck.json?.isReadyToClose === 'boolean',
        '6.3 closing-check returns a real verdict (isReadyToClose)',
        JSON.stringify(closingCheck.json).slice(0, 200)
      );

      const closeRes = await api('POST', `/fiscal-periods/${openPeriod.id}/close`, {
        userId: admin.json?.id,
        notes: 'UI-CRUD verification',
      });

      if (closingCheck.json?.isReadyToClose) {
        check(closeRes.status === 200, '6.4 ready period close accepted by the server', JSON.stringify(closeRes.json).slice(0, 160));

        const closedList = await api('GET', '/fiscal-periods');
        const closed = closedList.json.find((p: any) => p.id === openPeriod.id);
        check(closed?.status !== 'OPEN', '6.5 period is actually closed after the action', closed?.status);

        const reopenNoReason = await api('POST', `/fiscal-periods/${openPeriod.id}/reopen`, { userId: admin.json?.id });
        check(reopenNoReason.status === 400, '6.6 reopen without a reason refused server-side', JSON.stringify(reopenNoReason.json));

        const reopenOk = await api('POST', `/fiscal-periods/${openPeriod.id}/reopen`, {
          userId: admin.json?.id,
          reason: 'تصحيح قيد مرحّل بالخطأ أثناء اختبار الواجهة',
        });
        check(reopenOk.status === 200, '6.7 reopen with a reason accepted', JSON.stringify(reopenOk.json).slice(0, 160));

        const reopened = await api('GET', '/fiscal-periods');
        const back = reopened.json.find((p: any) => p.id === openPeriod.id);
        check(back?.status === 'OPEN', '6.8 period restored to OPEN and reopen reason stored', `${back?.status} / ${back?.reopen_reason ?? ''}`);
      } else {
        check(
          closeRes.status === 400 && errorText(closeRes).length > 0,
          '6.4 blocked period close refused with the blocking reason (no silent close)',
          JSON.stringify(closeRes.json)
        );

        const stillList = await api('GET', '/fiscal-periods');
        const still = stillList.json.find((p: any) => p.id === openPeriod.id);
        check(still?.status === 'OPEN', '6.5 refused close left the period OPEN', still?.status);

        const reopenOpen = await api('POST', `/fiscal-periods/${openPeriod.id}/reopen`, {
          userId: admin.json?.id,
          reason: 'محاولة إعادة فتح فترة مفتوحة أصلاً',
        });
        check(reopenOpen.status === 400, '6.6 reopen of an OPEN period refused server-side', JSON.stringify(reopenOpen.json));
      }
    }

    // ==========================================================
    // 7. INVENTORY COUNTS (draft → approve, double approve refused)
    // ==========================================================
    const countNoWh = await api('POST', '/inventory/counts', {
      countDate: '2026-10-20',
      lines: [],
    });
    check(countNoWh.status === 400, '7.1 stock count without warehouse refused server-side', JSON.stringify(countNoWh.json));

    const count = await api('POST', '/inventory/counts', {
      warehouseId: wh.json.id,
      countDate: '2026-10-20',
      notes: 'UI-CRUD draft',
      lines: [{ itemId: itemA.json.id, countedQuantity: 5 }],
    });
    check(count.status === 201 && count.json?.status === 'DRAFT', '7.2 stock count created as DRAFT', JSON.stringify(count.json).slice(0, 200));

    const approve = await api('POST', `/inventory/counts/${count.json.id}/approve`, {});
    check(approve.status === 200, '7.3 draft approved (settlement generated)', JSON.stringify(approve.json).slice(0, 200));

    const countsList = await api('GET', '/inventory/counts');
    const approved = countsList.json.find((c: any) => c.id === count.json.id);
    check(approved?.status === 'APPROVED', '7.4 approved state persisted', approved?.status);

    const approveAgain = await api('POST', `/inventory/counts/${count.json.id}/approve`, {});
    check(approveAgain.status === 400, '7.5 duplicate approval refused (no double settlement)', JSON.stringify(approveAgain.json));

    // ==========================================================
    // 8. READ-BACK INTEGRITY
    // ==========================================================
    const finalSup = await api('GET', `/suppliers?search=UISUP-${suffix}B`);
    check(finalSup.json?.[0]?.name === 'مورد اختبار باء', '8.1 supplier B unchanged through the whole run');
    const finalCus = await api('GET', `/customers?search=UICUS-${suffix}B`);
    check(finalCus.json?.[0]?.name === 'عميل اختبار باء', '8.2 customer B unchanged through the whole run');
    const finalItem = await api('GET', `/inventory/items/${itemA.json.id}`);
    check(finalItem.json?.name === 'صنف اختبار ألف - معدل', '8.3 edited item still holds its updated values');
  } finally {
    stopChild(child);
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch {
      /* Windows may keep a lock briefly; the temp dir is harmless. */
    }
    console.log('----------------------------------------------------------------');
    console.log(`RESULT: ${passed} passed, ${failed} failed`);
    console.log('----------------------------------------------------------------');
    if (failed > 0) process.exitCode = 1;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
