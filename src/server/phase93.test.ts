import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { SalesService } from './salesService.ts';
import { InventoryService } from './inventoryService.ts';
import { AccountingService } from './accountingService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * PHASE 9.3 — Purchase Returns Integrity & Atomic Posting
 * Covers: linked-only returns, original-line matching, quantity caps over
 * partial returns, RETURN_OUT per stock line, expense returns without stock,
 * closed-period rejection, full rollback on journal/stock failure, journal
 * balance, concurrency guard, and sales-returns non-regression.
 */
async function runPhase93Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 9.3 — Purchase Returns Integrity Test Matrix');
  console.log('========================================================');

  const db = await getDb();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${detail || ''}`);
      process.exitCode = 1;
    }
  }

  const eq = (a: number, b: number) => Math.abs(a - b) < 0.01;
  const S = Date.now().toString().slice(-6);
  const INV_DATE = '2026-10-02';
  const RET_DATE = '2026-10-20';

  async function jeLinesByCode(journalEntryId: string) {
    const r = await db.query<any>(`
      SELECT a.code, SUM(l.debit)::float AS debit, SUM(l.credit)::float AS credit
      FROM accounting.journal_entry_lines l
      JOIN accounting.accounts a ON a.id = l.account_id
      WHERE l.journal_entry_id = $1
      GROUP BY a.code
      ORDER BY a.code
    `, [journalEntryId]);
    return r.rows as Array<{ code: string; debit: number; credit: number }>;
  }

  async function tableCount(table: string) {
    const r = await db.query<any>(`SELECT COUNT(*) AS c FROM ${table}`);
    return parseInt(r.rows[0].c, 10);
  }

  async function postedReturnQty(originalLineId: string) {
    const r = await db.query<any>(`
      SELECT COALESCE(SUM(prl.quantity), 0)::float AS q
      FROM purchasing.purchase_return_lines prl
      JOIN purchasing.purchase_returns pr ON pr.id = prl.return_id
      WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
    `, [originalLineId]);
    return parseFloat(r.rows[0]?.q || '0');
  }

  // ----------------------------------------------------
  // Setup
  // ----------------------------------------------------
  console.log('\n--- 0. Setup ---');
  const supplier = await PurchasingService.createSupplier({ code: `SUP-93-${S}`, name: 'مورد اختبار 9.3', creditLimit: 100000000 });
  const supplier2 = await PurchasingService.createSupplier({ code: `SUP-93B-${S}`, name: 'مورد مخالف 9.3', creditLimit: 100000000 });
  const itemA = await InventoryService.createItem({ sku: `SKU-93A-${S}`, name: 'صنف مخزني 9.3-A', purchasePrice: 10000, salePrice: 20000 });
  const itemB = await InventoryService.createItem({ sku: `SKU-93B-${S}`, name: 'صنف مخزني 9.3-B', purchasePrice: 8000, salePrice: 15000 });
  const defaultWhId = (await InventoryService.getDefaultActiveWarehouse())!;
  assert(!!supplier.id && !!itemA.id && !!itemB.id && !!defaultWhId, 'Setup master data + default warehouse');

  async function makeInventoryInvoice(lines: any[]) {
    const inv = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: INV_DATE,
      lines: lines.map((l) => ({ ...l, warehouseId: defaultWhId })),
    });
    const posted = await PurchasingService.postPurchaseInvoice(inv.id);
    assert(posted.success === true, `Purchase invoice posted (${inv.invoice_number})`);
    return PurchasingService.getInvoiceById(inv.id);
  }

  // INV1: line1 itemA 50 x 10000 tax 25000 | line2 itemA 30 x 12000 tax 18000
  const inv1 = await makeInventoryInvoice([
    { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 50, unitPrice: 10000, discount: 0, tax: 25000 },
    { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 30, unitPrice: 12000, discount: 0, tax: 18000 },
  ]);
  const line1 = inv1.lines.find((l: any) => parseFloat(l.quantity) === 50);
  const line2 = inv1.lines.find((l: any) => parseFloat(l.quantity) === 30);
  assert(!!line1?.id && !!line2?.id && line1.id !== line2.id, 'INV1 lines resolved with distinct ids');
  // WAC = (500000 + 360000) / 80 = 10750
  const wac0 = await InventoryService.getItemStock(itemA.id);
  assert(eq(wac0.currentStock, 80) && eq(wac0.averageCost, 10750), `Setup WAC = 10,750 over 80 units (got ${wac0.averageCost}/${wac0.currentStock})`);

  // INV2: EXPENSE service line (non-stock)
  const inv2raw = await PurchasingService.createInvoice({
    supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: INV_DATE,
    lines: [{ description: 'خدمة صيانة', quantity: 2, unitPrice: 30000, discount: 0, tax: 3000 }],
  });
  await PurchasingService.postPurchaseInvoice(inv2raw.id);
  const inv2 = await PurchasingService.getInvoiceById(inv2raw.id);
  // INV3: DRAFT (never posted)
  const inv3 = await PurchasingService.createInvoice({
    supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: INV_DATE,
    lines: [{ itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 5, unitPrice: 10000, tax: 2500 }],
  });

  // HTTP server for returns endpoints
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;
  const postReturn = async (body: any) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/purchasing/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() as any };
  };

  try {
    // ----------------------------------------------------
    // TEST 1: valid stock return (client prices ignored)
    // ----------------------------------------------------
    console.log('\n--- TEST 1: valid stock return, UI prices ignored ---');
    // NOTE (PHASE 9.4): value asserts below follow the discount-aware policy
    // (original line net after discount), superseding the 9.3 WAC figures by
    // design. line1 = 50 x 10,000, no discount => net unit 10,000.
    const t1 = await postReturn({
      supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE,
      lines: [{ originalLineId: line1.id, quantity: 10, unitPrice: 99999, tax: 99999 }],
    });
    assert(t1.status === 201 && t1.body.success === true, 'TEST1: return accepted (201)', `got ${t1.status} ${JSON.stringify(t1.body)}`);
    const ret1 = await db.query<any>('SELECT * FROM purchasing.purchase_returns WHERE id = $1', [t1.body.purchaseReturn.id]);
    assert(eq(parseFloat(ret1.rows[0]?.subtotal), 100000), `TEST1: subtotal = original net 100,000 (got ${ret1.rows[0]?.subtotal})`);
    assert(eq(parseFloat(ret1.rows[0]?.tax), 5000), `TEST1: tax = original share 5,000 (got ${ret1.rows[0]?.tax})`);
    assert(eq(parseFloat(ret1.rows[0]?.total), 105000), 'TEST1: total = 105,000');
    const mv1 = await db.query<any>(`
      SELECT * FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'RETURN_OUT' AND status = 'POSTED'
    `, [t1.body.purchaseReturn.id]);
    assert(mv1.rows.length === 1, 'TEST1: exactly one RETURN_OUT movement');
    const mvl1 = await db.query<any>('SELECT quantity, unit_cost, total_cost FROM inventory.stock_transaction_lines WHERE transaction_id = $1', [mv1.rows[0]?.id]);
    assert(eq(parseFloat(mvl1.rows[0]?.quantity), 10), 'TEST1: movement qty = 10');
    assert(eq(parseFloat(mvl1.rows[0]?.unit_cost), 10000), `TEST1: movement at original net 10,000 (got ${mvl1.rows[0]?.unit_cost})`);
    assert(eq(parseFloat(mvl1.rows[0]?.total_cost), 100000), 'TEST1: movement value = JE inventory credit 100,000');
    const j1 = await jeLinesByCode(ret1.rows[0].journal_entry_id);
    const j1by = Object.fromEntries(j1.map((l) => [l.code, l]));
    assert(eq(j1by['2101']?.debit || 0, 105000), 'TEST1: DR AP 105,000', JSON.stringify(j1));
    assert(eq(j1by['1104']?.credit || 0, 100000), 'TEST1: CR Inventory 100,000 = movement value', JSON.stringify(j1));
    assert(eq(j1by['1105']?.credit || 0, 5000), 'TEST1: CR Input VAT 5,000', JSON.stringify(j1));
    const dr1 = j1.reduce((a, l) => a + l.debit, 0);
    const cr1 = j1.reduce((a, l) => a + l.credit, 0);
    assert(eq(dr1, cr1) && eq(dr1, 105000), 'TEST1: journal balanced at 105,000');
    const rl1 = await db.query<any>('SELECT original_line_id FROM purchasing.purchase_return_lines WHERE return_id = $1', [t1.body.purchaseReturn.id]);
    assert(rl1.rows[0]?.original_line_id === line1.id, 'TEST1: return line linked to original line');
    const st1 = await InventoryService.getItemStock(itemA.id);
    assert(eq(st1.currentStock, 70), `TEST1: stock 80 -> 70 (got ${st1.currentStock})`);

    // ----------------------------------------------------
    // TEST 2: one RETURN_OUT per stock line
    // ----------------------------------------------------
    console.log('\n--- TEST 2: one RETURN_OUT per stock line ---');
    const t2 = await postReturn({
      supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE,
      lines: [{ originalLineId: line1.id, quantity: 5 }, { originalLineId: line2.id, quantity: 7 }],
    });
    assert(t2.status === 201, 'TEST2: multi-line return accepted', `got ${t2.status}`);
    const mv2 = await db.query<any>(`
      SELECT id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'RETURN_OUT' AND status = 'POSTED'
    `, [t2.body.purchaseReturn.id]);
    assert(mv2.rows.length === 2, `TEST2: two RETURN_OUT movements (got ${mv2.rows.length})`);
    assert(eq(await postedReturnQty(line1.id), 15) && eq(await postedReturnQty(line2.id), 7), 'TEST2: posted sums tracked per original line');

    // ----------------------------------------------------
    // TEST 3: expense (non-stock) return creates no movement
    // ----------------------------------------------------
    console.log('\n--- TEST 3: expense return without stock ---');
    const expLine = inv2.lines[0];
    const stxBefore3 = await tableCount('inventory.stock_transactions');
    const t3 = await postReturn({
      supplierId: supplier.id, originalInvoiceId: inv2.id, returnDate: RET_DATE,
      lines: [{ originalLineId: expLine.id, quantity: 1 }],
    });
    assert(t3.status === 201, 'TEST3: expense return accepted', `got ${t3.status} ${JSON.stringify(t3.body)}`);
    const mv3 = await db.query<any>('SELECT id FROM inventory.stock_transactions WHERE reference_id = $1', [t3.body.purchaseReturn.id]);
    assert(mv3.rows.length === 0 && (await tableCount('inventory.stock_transactions')) === stxBefore3, 'TEST3: no stock movement created');
    const ret3 = await db.query<any>('SELECT * FROM purchasing.purchase_returns WHERE id = $1', [t3.body.purchaseReturn.id]);
    const j3 = await jeLinesByCode(ret3.rows[0].journal_entry_id);
    const j3by = Object.fromEntries(j3.map((l) => [l.code, l]));
    assert(!(j3by['1104']), 'TEST3: no inventory line in journal', JSON.stringify(j3));
    assert(eq(j3by['2101']?.debit || 0, 31500), 'TEST3: DR AP 31,500 (30000 + 1500 VAT share)', JSON.stringify(j3));

    // ----------------------------------------------------
    // TESTs 4-9, 12-13: rejections leave no trace
    // ----------------------------------------------------
    console.log('\n--- TESTs 4-9,12-13: rejections ---');
    async function expectRejected(name: string, body: any, hint: string) {
      const c0 = {
        pr: await tableCount('purchasing.purchase_returns'),
        je: await tableCount('accounting.journal_entries'),
        jel: await tableCount('accounting.journal_entry_lines'),
        stx: await tableCount('inventory.stock_transactions'),
      };
      const r = await postReturn(body);
      const same =
        (await tableCount('purchasing.purchase_returns')) === c0.pr &&
        (await tableCount('accounting.journal_entries')) === c0.je &&
        (await tableCount('accounting.journal_entry_lines')) === c0.jel &&
        (await tableCount('inventory.stock_transactions')) === c0.stx;
      assert(r.status === 400, `${name}: rejected with 400 (got ${r.status})`);
      assert(same, `${name}: no journal/stock/document side effects`);
      if (hint) assert(String(r.body?.error || '').length > 0, `${name}: clear error message`);
    }

    // TEST 4: unknown invoice
    await expectRejected('TEST4', { supplierId: supplier.id, originalInvoiceId: '00000000-0000-0000-0000-000000000000', returnDate: RET_DATE, lines: [{ quantity: 1 }] }, 'x');
    // TEST 4b: missing link
    await expectRejected('TEST4b', { supplierId: supplier.id, returnDate: RET_DATE, lines: [{ quantity: 1 }] }, 'x');
    // TEST 5: DRAFT invoice
    await expectRejected('TEST5a', { supplierId: supplier.id, originalInvoiceId: inv3.id, returnDate: RET_DATE, lines: [{ quantity: 1 }] }, 'x');
    // TEST 5b: VOIDED invoice
    const inv4raw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: INV_DATE,
      lines: [{ itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 4, unitPrice: 10000, tax: 2000 }],
    });
    await PurchasingService.postPurchaseInvoice(inv4raw.id);
    await PurchasingService.reversePurchaseInvoice(inv4raw.id);
    await expectRejected('TEST5b', { supplierId: supplier.id, originalInvoiceId: inv4raw.id, returnDate: RET_DATE, lines: [{ quantity: 1 }] }, 'x');
    // TEST 6: supplier mismatch
    await expectRejected('TEST6', { supplierId: supplier2.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: 1 }] }, 'x');
    // TEST 7: zero / negative qty
    await expectRejected('TEST7a', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: 0 }] }, 'x');
    await expectRejected('TEST7b', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: -3 }] }, 'x');
    // TEST 8: exceeds original line (line1 remaining = 50-15 = 35)
    await expectRejected('TEST8', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: 36 }] }, 'x');
    // TEST 12: ambiguous match (itemA appears twice, no originalLineId)
    await expectRejected('TEST12', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ itemCode: itemA.sku, quantity: 1 }] }, 'x');
    // TEST 13: closed period / invalid / outside periods
    await expectRejected('TEST13a', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: '2026-09-15', lines: [{ originalLineId: line1.id, quantity: 1 }] }, 'x');
    await expectRejected('TEST13b', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: 'not-a-date', lines: [{ originalLineId: line1.id, quantity: 1 }] }, 'x');
    await expectRejected('TEST13c', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: '2025-06-01', lines: [{ originalLineId: line1.id, quantity: 1 }] }, 'x');

    // ----------------------------------------------------
    // TEST 9/10: partials capped, exact exhaustion, then blocked
    // ----------------------------------------------------
    console.log('\n--- TESTs 9-10: partial returns to exhaustion ---');
    const t9 = await postReturn({ supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: 35 }] });
    assert(t9.status === 201, 'TEST9: exact-remaining partial accepted', `got ${t9.status}`);
    assert(eq(await postedReturnQty(line1.id), 50), 'TEST9: line1 fully returned (50/50)');
    await expectRejected('TEST9b', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line1.id, quantity: 1 }] }, 'x');
    const t10 = await postReturn({ supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line2.id, quantity: 23 }] });
    assert(t10.status === 201, 'TEST10: second line exhausted via partials (7 + 23)', `got ${t10.status}`);
    assert(eq(await postedReturnQty(line2.id), 30), 'TEST10: line2 fully returned (30/30)');
    await expectRejected('TEST10b', { supplierId: supplier.id, originalInvoiceId: inv1.id, returnDate: RET_DATE, lines: [{ originalLineId: line2.id, quantity: 0.5 }] }, 'x');

    // ----------------------------------------------------
    // TEST 11: concurrent full-qty requests never exceed cap
    // ----------------------------------------------------
    console.log('\n--- TEST 11: concurrency guard ---');
    const inv5 = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 20, unitPrice: 10000, discount: 0, tax: 10000 },
    ]);
    const line5 = inv5.lines[0];
    const [cA, cB] = await Promise.all([
      postReturn({ supplierId: supplier.id, originalInvoiceId: inv5.id, returnDate: RET_DATE, lines: [{ originalLineId: line5.id, quantity: 20 }] }),
      postReturn({ supplierId: supplier.id, originalInvoiceId: inv5.id, returnDate: RET_DATE, lines: [{ originalLineId: line5.id, quantity: 20 }] }),
    ]);
    const oneEach = (cA.status === 201 && cB.status === 400) || (cA.status === 400 && cB.status === 201);
    assert(oneEach, `TEST11: exactly one winner (got ${cA.status}, ${cB.status})`);
    assert(eq(await postedReturnQty(line5.id), 20), 'TEST11: posted total capped at original 20');

    // ----------------------------------------------------
    // TEST 12b: unambiguous match by code works (single-line invoice)
    // ----------------------------------------------------
    console.log('\n--- TEST 12b: single-candidate match by code ---');
    const inv6 = await makeInventoryInvoice([
      { itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, quantity: 25, unitPrice: 8000, discount: 0, tax: 0 },
    ]);
    const t12b = await postReturn({ supplierId: supplier.id, originalInvoiceId: inv6.id, returnDate: RET_DATE, lines: [{ itemCode: itemB.sku, quantity: 5 }] });
    assert(t12b.status === 201, 'TEST12b: code match accepted for single-line invoice', `got ${t12b.status} ${JSON.stringify(t12b.body)}`);
    const ret12b = await db.query<any>('SELECT * FROM purchasing.purchase_returns WHERE id = $1', [t12b.body.purchaseReturn.id]);
    const j12b = await jeLinesByCode(ret12b.rows[0].journal_entry_id);
    assert(j12b.length === 2, 'TEST12b: zero-tax return emits exactly 2 journal lines (no VAT line)', JSON.stringify(j12b));

    // ----------------------------------------------------
    // TEST 14: rollback when journal posting fails
    // ----------------------------------------------------
    console.log('\n--- TEST 14: rollback on journal failure ---');
    const inv7 = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 40, unitPrice: 10000, discount: 0, tax: 20000 },
    ]);
    const line7 = inv7.lines[0];
    const c14 = {
      pr: await tableCount('purchasing.purchase_returns'),
      je: await tableCount('accounting.journal_entries'),
      jel: await tableCount('accounting.journal_entry_lines'),
      stx: await tableCount('inventory.stock_transactions'),
    };
    const origPost = AccountingService.postJournalEntry;
    (AccountingService as any).postJournalEntry = async () => { throw new Error('injected journal failure'); };
    let t14status = 0;
    try {
      const t14 = await postReturn({ supplierId: supplier.id, originalInvoiceId: inv7.id, returnDate: RET_DATE, lines: [{ originalLineId: line7.id, quantity: 4 }] });
      t14status = t14.status;
    } finally {
      (AccountingService as any).postJournalEntry = origPost;
    }
    assert(t14status === 400, `TEST14: request failed (got ${t14status})`);
    assert((await tableCount('purchasing.purchase_returns')) === c14.pr, 'TEST14: no return document left behind');
    assert((await tableCount('accounting.journal_entries')) === c14.je, 'TEST14: no orphan journal entry');
    assert((await tableCount('accounting.journal_entry_lines')) === c14.jel, 'TEST14: no orphan journal lines');
    assert((await tableCount('inventory.stock_transactions')) === c14.stx, 'TEST14: no orphan stock movement');
    assert(eq(await postedReturnQty(line7.id), 0), 'TEST14: posted sum still zero');

    // ----------------------------------------------------
    // TEST 15: rollback when stock movement fails
    // ----------------------------------------------------
    console.log('\n--- TEST 15: rollback on stock failure ---');
    const stockNow = await InventoryService.getItemStock(itemA.id);
    await InventoryService.createStockTransaction({
      transactionType: 'SALES_ISSUE', transactionDate: RET_DATE,
      warehouseId: defaultWhId, notes: 'deplete for 9.3 stock-failure test',
      lines: [{ itemId: itemA.id, quantity: stockNow.currentStock - 5 }],
    });
    const low = await InventoryService.getItemStock(itemA.id);
    assert(eq(low.currentStock, 5), `TEST15 precondition: stock = 5 (got ${low.currentStock})`);
    const c15 = {
      pr: await tableCount('purchasing.purchase_returns'),
      je: await tableCount('accounting.journal_entries'),
      jel: await tableCount('accounting.journal_entry_lines'),
      stx: await tableCount('inventory.stock_transactions'),
    };
    // line7 remaining = 40, physical stock = 5 -> RETURN_OUT guard must throw
    const t15 = await postReturn({ supplierId: supplier.id, originalInvoiceId: inv7.id, returnDate: RET_DATE, lines: [{ originalLineId: line7.id, quantity: 10 }] });
    assert(t15.status === 400, `TEST15: request failed (got ${t15.status})`);
    assert((await tableCount('purchasing.purchase_returns')) === c15.pr, 'TEST15: no return document left behind');
    assert((await tableCount('accounting.journal_entries')) === c15.je, 'TEST15: no orphan journal entry');
    assert((await tableCount('inventory.stock_transactions')) === c15.stx, 'TEST15: no orphan stock movement');
    assert(eq(await postedReturnQty(line7.id), 0), 'TEST15: posted sum still zero');
    const inv7after = await PurchasingService.getInvoiceById(inv7.id);
    assert(inv7after.status === 'POSTED', 'TEST15: original invoice untouched (still POSTED)');

    // ----------------------------------------------------
    // TEST 18: sales returns unchanged
    // ----------------------------------------------------
    console.log('\n--- TEST 18: sales returns non-regression ---');
    const customer = await SalesService.createCustomer({ code: `CUST-93-${S}`, name: 'عميل 9.3', creditLimit: 100000000 });
    const sinv = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: INV_DATE,
      lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, quantity: 5, unitPrice: 15000, discount: 0, tax: 3750 }],
    });
    await SalesService.postSalesInvoice(sinv.id);
    const srRes = await fetch(`http://127.0.0.1:${port}/api/sales/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id, originalInvoiceId: sinv.id, returnDate: RET_DATE,
        lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, quantity: 2, unitPrice: 15000, tax: 1500 }],
      }),
    });
    assert(srRes.status === 201, `TEST18: sales return still accepted (got ${srRes.status})`);
    const srBody: any = await srRes.json();
    assert(srBody.success === true, 'TEST18: sales return posted');
    const srRow = await db.query<any>('SELECT * FROM sales.sales_returns WHERE id = $1', [srBody.salesReturn.id]);
    const srJe = await jeLinesByCode(srRow.rows[0].journal_entry_id);
    const srBy = Object.fromEntries(srJe.map((l) => [l.code, l]));
    assert(eq(srBy['1103']?.credit || 0, 31500), 'TEST18: CR AR 31,500', JSON.stringify(srJe));
    assert(eq(srBy['2105']?.debit || 0, 1500), 'TEST18: DR Output VAT 1,500', JSON.stringify(srJe));
    const srIn = await db.query<any>(`SELECT id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'RETURN_IN'`, [srBody.salesReturn.id]);
    assert(srIn.rows.length === 1, 'TEST18: RETURN_IN exists');
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 9.3 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase93Tests().catch((e) => {
  console.error('PHASE 9.3 SUITE CRASH:', e);
  process.exitCode = 1;
});
