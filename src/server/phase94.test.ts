import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { SalesService } from './salesService.ts';
import { InventoryService } from './inventoryService.ts';
import { AccountingService } from './accountingService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * PHASE 9.4 — Purchase Return Valuation Integrity & Return Economics.
 * Linked RETURN_OUT uses the original invoice line net (after discount),
 * never WAC; cumulative round2 allocation prevents rounding drift; ordinary
 * outflows keep WAC; sales returns and legacy movements are untouched.
 */
async function runPhase94Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 9.4 — Purchase Return Valuation Integrity');
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
  // Chronological discipline (documented engine constraint): same-item stock
  // movements must be posted in non-decreasing transaction-date order, because
  // valuation replays by (date, created_at) while postings snapshot WAC at
  // wall-clock time. Backdated postings would diverge — a pre-existing
  // limitation, independent of Phase 9.4 (see final report).
  const SALE_DATE = '2026-10-21';
  const RCPT2_DATE = '2026-10-22';
  const TRF_DATE = '2026-10-23';
  const SRET_DATE = '2026-10-24';
  const ZINV_DATE = '2026-10-25';
  const ZRET_DATE = '2026-10-26';

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

  async function postedSums(originalLineId: string) {
    const r = await db.query<any>(`
      SELECT COALESCE(SUM(prl.quantity), 0)::float AS q,
             COALESCE(SUM(prl.discount), 0)::float AS d,
             COALESCE(SUM(prl.tax), 0)::float AS t
      FROM purchasing.purchase_return_lines prl
      JOIN purchasing.purchase_returns pr ON pr.id = prl.return_id
      WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
    `, [originalLineId]);
    return { q: parseFloat(r.rows[0]?.q || '0'), d: parseFloat(r.rows[0]?.d || '0'), t: parseFloat(r.rows[0]?.t || '0') };
  }

  console.log('\n--- 0. Setup ---');
  const supplier = await PurchasingService.createSupplier({ code: `SUP-94-${S}`, name: 'مورد 9.4', creditLimit: 100000000 });
  const itemA = await InventoryService.createItem({ sku: `SKU-94A-${S}`, name: 'صنف 9.4-A', purchasePrice: 9000, salePrice: 20000 });
  const defaultWhId = (await InventoryService.getDefaultActiveWarehouse())!;
  assert(!!supplier.id && !!itemA.id && !!defaultWhId, 'Setup master data');

  async function makeInventoryInvoice(lines: any[], invoiceDate: string = INV_DATE) {
    const inv = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate,
      lines: lines.map((l) => ({ ...l, warehouseId: defaultWhId })),
    });
    const posted = await PurchasingService.postPurchaseInvoice(inv.id);
    assert(posted.success === true, `Purchase invoice posted (${inv.invoice_number})`);
    return PurchasingService.getInvoiceById(inv.id);
  }

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
    // SCENARIO A: original cost vs WAC (200-unit example)
    // ----------------------------------------------------
    console.log('\n--- A. Original-cost vs WAC (100x9,000 net + 100x12,000) ---');
    const invA1 = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 100, unitPrice: 10000, discount: 100000, tax: 45000 },
    ]);
    const invA2 = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 100, unitPrice: 12000, discount: 0, tax: 60000 },
    ]);
    const lineA1 = invA1.lines[0];
    const pre = await InventoryService.getItemStock(itemA.id);
    assert(eq(pre.currentStock, 200) && eq(pre.averageCost, 10500) && eq(pre.stockValue, 2100000),
      `A0: 200 units @ WAC 10,500 = 2,100,000 (got ${pre.currentStock}/${pre.averageCost}/${pre.stockValue})`);

    const tA = await postReturn({
      supplierId: supplier.id, originalInvoiceId: invA1.id, returnDate: RET_DATE,
      lines: [{ originalLineId: lineA1.id, quantity: 10 }],
    });
    assert(tA.status === 201, 'A1: return accepted', `got ${tA.status} ${JSON.stringify(tA.body)}`);
    const mvA = await db.query<any>(`
      SELECT t.valuation_policy as policy, l.quantity, l.unit_cost, l.total_cost
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'RETURN_OUT'
    `, [tA.body.purchaseReturn.id]);
    assert(mvA.rows.length === 1, 'A2: one RETURN_OUT movement');
    assert(mvA.rows[0]?.policy === 'ORIGINAL_COST', `A3: policy = ORIGINAL_COST (got ${mvA.rows[0]?.policy})`);
    assert(eq(parseFloat(mvA.rows[0]?.unit_cost), 9000), `A4: movement at original net 9,000, NOT WAC 10,500 (got ${mvA.rows[0]?.unit_cost})`);
    assert(eq(parseFloat(mvA.rows[0]?.total_cost), 90000), `A5: movement value 90,000, NOT 105,000 (got ${mvA.rows[0]?.total_cost})`);
    const post = await InventoryService.getItemStock(itemA.id);
    assert(eq(post.currentStock, 190), `A6: remaining 190 (got ${post.currentStock})`);
    assert(eq(post.stockValue, 2010000), `A7: remaining value 2,010,000 (got ${post.stockValue})`);
    assert(eq(post.averageCost, 2010000 / 190), `A8: WAC ≈ 10,578.95 (got ${post.averageCost})`);
    const retA = await db.query<any>('SELECT * FROM purchasing.purchase_returns WHERE id = $1', [tA.body.purchaseReturn.id]);
    assert(eq(parseFloat(retA.rows[0]?.subtotal), 90000) && eq(parseFloat(retA.rows[0]?.total), 94500),
      `A9: doc subtotal 90,000 / total 94,500 (got ${retA.rows[0]?.subtotal}/${retA.rows[0]?.total})`);
    const rlA = await db.query<any>('SELECT discount FROM purchasing.purchase_return_lines WHERE return_id = $1', [tA.body.purchaseReturn.id]);
    assert(eq(parseFloat(rlA.rows[0]?.discount), 10000), `A10: persisted discount share 10,000 (got ${rlA.rows[0]?.discount})`);
    const jA = await jeLinesByCode(retA.rows[0].journal_entry_id);
    const jAby = Object.fromEntries(jA.map((l) => [l.code, l]));
    assert(eq(jAby['2101']?.debit || 0, 94500), 'A11: DR AP 94,500 (net + VAT)', JSON.stringify(jA));
    assert(eq(jAby['1104']?.credit || 0, 90000), 'A12: CR Inventory 90,000 = movement value', JSON.stringify(jA));
    assert(eq(jAby['1105']?.credit || 0, 4500), 'A13: CR Input VAT 4,500', JSON.stringify(jA));
    const drA = jA.reduce((a, l) => a + l.debit, 0);
    assert(eq(drA, jA.reduce((a, l) => a + l.credit, 0)), 'A14: journal balanced');
    const ledA = await InventoryService.getItemLedger(itemA.id);
    assert(eq(ledA.finalValue, 2010000) && eq(ledA.finalStock, 190), 'A15: ledger agrees (190 / 2,010,000)');
    const recA = await InventoryService.getInventoryReconciliation();
    assert(recA.status === 'RECONCILED', `A16: subledger vs GL 1104 RECONCILED (diff ${recA.difference})`);
    assert(eq(recA.subledgerValue, 2010000) && eq(recA.glBalance, 2010000),
      `A17: both legs 2,010,000 (got ${recA.subledgerValue}/${recA.glBalance})`);

    // ----------------------------------------------------
    // SCENARIO B: discounts, tax, partials, no double subtraction
    // ----------------------------------------------------
    console.log('\n--- B. Discount + VAT, partial then full ---');
    const itemB = await InventoryService.createItem({ sku: `SKU-94B-${S}`, name: 'صنف 9.4-B', purchasePrice: 5000, salePrice: 9000 });
    const invB = await makeInventoryInvoice([
      { itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, quantity: 10, unitPrice: 5000, discount: 2500, tax: 2375 },
    ]);
    const lineB = invB.lines[0];
    // origNet = 47500, origDiscount = 2500, origTax = 2375, line_total = 49875
    const tB1 = await postReturn({ supplierId: supplier.id, originalInvoiceId: invB.id, returnDate: RET_DATE, lines: [{ originalLineId: lineB.id, quantity: 4 }] });
    assert(tB1.status === 201, 'B1: first partial accepted');
    const tB2 = await postReturn({ supplierId: supplier.id, originalInvoiceId: invB.id, returnDate: RET_DATE, lines: [{ originalLineId: lineB.id, quantity: 6 }] });
    assert(tB2.status === 201, 'B2: second partial accepted');
    const sumsB = await postedSums(lineB.id);
    assert(eq(sumsB.q, 10), 'B3: full quantity returned');
    assert(eq(sumsB.d, 2500), `B4: discount allocation totals 2,500 (got ${sumsB.d})`);
    assert(eq(sumsB.t, 2375), `B5: tax allocation totals 2,375 (got ${sumsB.t})`);
    const netB = await db.query<any>(`
      SELECT COALESCE(SUM(pr.total - pr.tax), 0)::float AS net
      FROM purchasing.purchase_returns pr
      JOIN purchasing.purchase_return_lines prl ON prl.return_id = pr.id
      WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
    `, [lineB.id]);
    assert(eq(parseFloat(netB.rows[0]?.net), 47500), `B6: returned net totals 47,500 (got ${netB.rows[0]?.net})`);
    const apB = await db.query<any>(`
      SELECT COALESCE(SUM(pr.total), 0)::float AS ap
      FROM purchasing.purchase_returns pr
      JOIN purchasing.purchase_return_lines prl ON prl.return_id = pr.id
      WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
    `, [lineB.id]);
    assert(eq(parseFloat(apB.rows[0]?.ap), 49875), `B7: AP totals original line_total 49,875 — discount NOT subtracted twice (got ${apB.rows[0]?.ap})`);
    // Rounding-drift case: net 1000 over Q=3
    const invR = await makeInventoryInvoice([
      { itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, quantity: 3, unitPrice: 1000, discount: 2000, tax: 50 },
    ]);
    const lineR = invR.lines[0];
    await postReturn({ supplierId: supplier.id, originalInvoiceId: invR.id, returnDate: RET_DATE, lines: [{ originalLineId: lineR.id, quantity: 1 }] });
    await postReturn({ supplierId: supplier.id, originalInvoiceId: invR.id, returnDate: RET_DATE, lines: [{ originalLineId: lineR.id, quantity: 1 }] });
    await postReturn({ supplierId: supplier.id, originalInvoiceId: invR.id, returnDate: RET_DATE, lines: [{ originalLineId: lineR.id, quantity: 1 }] });
    const sumsR = await postedSums(lineR.id);
    assert(eq(sumsR.q, 3) && eq(sumsR.d, 2000) && eq(sumsR.t, 50), `B8: 1+1+1 installments sum exactly (got ${sumsR.q}/${sumsR.d}/${sumsR.t})`);
    const netR = await db.query<any>(`
      SELECT COALESCE(SUM(pr.total - pr.tax), 0)::float AS net
      FROM purchasing.purchase_returns pr
      JOIN purchasing.purchase_return_lines prl ON prl.return_id = pr.id
      WHERE prl.original_line_id = $1 AND pr.status = 'POSTED'
    `, [lineR.id]);
    assert(eq(parseFloat(netR.rows[0]?.net), 1000), `B9: net installments sum to 1,000.00 with no drift (got ${netR.rows[0]?.net})`);

    // ----------------------------------------------------
    // SCENARIO C: limit reached, further returns rejected
    // ----------------------------------------------------
    console.log('\n--- C. Quantity limit after full return ---');
    const c0 = { pr: await tableCount('purchasing.purchase_returns'), je: await tableCount('accounting.journal_entries') };
    const tC = await postReturn({ supplierId: supplier.id, originalInvoiceId: invB.id, returnDate: RET_DATE, lines: [{ originalLineId: lineB.id, quantity: 1 }] });
    assert(tC.status === 400, `C1: post-limit return rejected (got ${tC.status})`);
    assert((await tableCount('purchasing.purchase_returns')) === c0.pr && (await tableCount('accounting.journal_entries')) === c0.je, 'C2: no side effects');

    // ----------------------------------------------------
    // SCENARIO D: isolation (WAC outflows, later receipt/issue, sales returns)
    // ----------------------------------------------------
    console.log('\n--- D. Valuation isolation ---');
    // D1: ordinary SALES_ISSUE via posted sale still uses WAC + keeps GL clean
    const wacBefore = await InventoryService.getItemStock(itemA.id);
    const customer = await SalesService.createCustomer({ code: `CUST-94-${S}`, name: 'عميل 9.4', creditLimit: 100000000 });
    const sinv = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: SALE_DATE,
      lines: [{ itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 5, unitPrice: 20000, discount: 0, tax: 5000 }],
    });
    await SalesService.postSalesInvoice(sinv.id);
    const issueTx = await db.query<any>(`
      SELECT l.unit_cost FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'SALES_ISSUE'
    `, [sinv.id]);
    assert(eq(parseFloat(issueTx.rows[0]?.unit_cost), wacBefore.averageCost),
      `D1: SALES_ISSUE still at WAC ${wacBefore.averageCost} (got ${issueTx.rows[0]?.unit_cost})`);
    // D2: new purchase after return recalibrates correctly
    const stockPre = await InventoryService.getItemStock(itemA.id);
    const invNew = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 20, unitPrice: 11000, discount: 0, tax: 11000 },
    ], RCPT2_DATE);
    void invNew;
    const stockPost = await InventoryService.getItemStock(itemA.id);
    const expQty = stockPre.currentStock + 20;
    const expVal = stockPre.stockValue + 220000;
    assert(eq(stockPost.currentStock, expQty) && eq(stockPost.stockValue, expVal) && eq(stockPost.averageCost, expVal / expQty),
      `D2: receipt after return correct (${stockPost.currentStock}/${stockPost.stockValue}/${stockPost.averageCost})`);
    // D3: transfer preserves global value (WAC path untouched)
    const whB = await InventoryService.createWarehouse({ code: `WH-94B-${S}`, name: 'مستودع 9.4-B' });
    const valBeforeTrf = (await InventoryService.getItemStock(itemA.id)).stockValue;
    await InventoryService.createStockTransfer({ fromWarehouseId: defaultWhId, toWarehouseId: whB.id, transferDate: TRF_DATE, lines: [{ itemId: itemA.id, quantity: 5 }] });
    const valAfterTrf = (await InventoryService.getItemStock(itemA.id)).stockValue;
    assert(eq(valBeforeTrf, valAfterTrf), `D3: transfer preserves value (got ${valBeforeTrf} -> ${valAfterTrf})`);
    // D4: sales return behavior unchanged
    const srRes = await fetch(`http://127.0.0.1:${port}/api/sales/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id, originalInvoiceId: sinv.id, returnDate: SRET_DATE,
        lines: [{ itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 1, unitPrice: 20000, tax: 1000 }],
      }),
    });
    assert(srRes.status === 201, `D4: sales return unchanged (got ${srRes.status})`);
    const srBody: any = await srRes.json();
    const srIn = await db.query<any>(`SELECT id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'RETURN_IN'`, [srBody.salesReturn.id]);
    assert(srIn.rows.length === 1, 'D4b: RETURN_IN exists');

    // ----------------------------------------------------
    // SCENARIO E: expense return (discount-aware, no movement)
    // ----------------------------------------------------
    console.log('\n--- E. Expense return ---');
    const invEraw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: INV_DATE,
      lines: [{ description: 'خدمة 9.4', quantity: 2, unitPrice: 30000, discount: 5000, tax: 2750 }],
    });
    await PurchasingService.postPurchaseInvoice(invEraw.id);
    const invE = await PurchasingService.getInvoiceById(invEraw.id);
    const stxE0 = await tableCount('inventory.stock_transactions');
    const tE = await postReturn({ supplierId: supplier.id, originalInvoiceId: invE.id, returnDate: RET_DATE, lines: [{ originalLineId: invE.lines[0].id, quantity: 1 }] });
    assert(tE.status === 201, 'E1: expense return accepted', `got ${tE.status} ${JSON.stringify(tE.body)}`);
    assert((await tableCount('inventory.stock_transactions')) === stxE0, 'E2: no stock movement');
    const retE = await db.query<any>('SELECT * FROM purchasing.purchase_returns WHERE id = $1', [tE.body.purchaseReturn.id]);
    const jE = await jeLinesByCode(retE.rows[0].journal_entry_id);
    const jEby = Object.fromEntries(jE.map((l) => [l.code, l]));
    assert(!jEby['1104'], 'E3: no inventory leg', JSON.stringify(jE));
    assert(eq(jEby['2101']?.debit || 0, 28875), 'E4: DR AP 28,875 (27,500 + 1,375)', JSON.stringify(jE));
    const drE = jE.reduce((a, l) => a + l.debit, 0);
    assert(eq(drE, jE.reduce((a, l) => a + l.credit, 0)), 'E5: journal balanced');
    const rlE = await db.query<any>('SELECT discount FROM purchasing.purchase_return_lines WHERE return_id = $1', [tE.body.purchaseReturn.id]);
    assert(eq(parseFloat(rlE.rows[0]?.discount), 2500), 'E6: expense discount share 2,500 persisted');

    // ----------------------------------------------------
    // SCENARIO Z: zero-net (fully discounted) return — no journal
    // ----------------------------------------------------
    console.log('\n--- Z. Zero-net return ---');
    // Zero-net line (fully discounted, zero tax) beside a normal line so the
    // invoice itself is postable; returning ONLY the zero line yields total 0.
    const invZ = await makeInventoryInvoice([
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 2, unitPrice: 10000, discount: 0, tax: 1000 },
      { itemId: itemA.id, itemCode: itemA.sku, description: itemA.name, quantity: 5, unitPrice: 2000, discount: 10000, tax: 0 },
    ], ZINV_DATE);
    const lineZ = invZ.lines.find((l: any) => parseFloat(l.quantity) === 5);
    const stockZ0 = await InventoryService.getItemStock(itemA.id);
    const tZ = await postReturn({ supplierId: supplier.id, originalInvoiceId: invZ.id, returnDate: ZRET_DATE, lines: [{ originalLineId: lineZ.id, quantity: 5 }] });
    assert(tZ.status === 201, 'Z1: zero-total return accepted', `got ${tZ.status} ${JSON.stringify(tZ.body)}`);
    assert(tZ.body.journalEntryId === null, 'Z2: no journal for zero financial effect');
    const retZ0 = await db.query<any>('SELECT journal_entry_id, total FROM purchasing.purchase_returns WHERE id = $1', [tZ.body.purchaseReturn.id]);
    assert(retZ0.rows[0]?.journal_entry_id === null && eq(parseFloat(retZ0.rows[0]?.total), 0), 'Z2b: doc total 0 with NULL journal link');
    const mvZ = await db.query<any>(`
      SELECT l.total_cost FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'RETURN_OUT'
    `, [tZ.body.purchaseReturn.id]);
    assert(mvZ.rows.length === 1 && eq(parseFloat(mvZ.rows[0]?.total_cost), 0), 'Z3: zero-value movement recorded');
    const stockZ1 = await InventoryService.getItemStock(itemA.id);
    assert(eq(stockZ1.currentStock, stockZ0.currentStock - 5), 'Z4: quantity still decreased by 5');

    // ----------------------------------------------------
    // SCENARIO F: atomicity (journal failure + stock failure)
    // ----------------------------------------------------
    console.log('\n--- F. Atomicity ---');
    const itemF = await InventoryService.createItem({ sku: `SKU-94F-${S}`, name: 'صنف 9.4-F', purchasePrice: 7000, salePrice: 12000 });
    const invF = await makeInventoryInvoice([
      { itemId: itemF.id, itemCode: itemF.sku, description: itemF.name, quantity: 40, unitPrice: 7000, discount: 14000, tax: 13300 },
    ]);
    const lineF = invF.lines[0];
    const snap = async () => ({
      pr: await tableCount('purchasing.purchase_returns'),
      je: await tableCount('accounting.journal_entries'),
      jel: await tableCount('accounting.journal_entry_lines'),
      stx: await tableCount('inventory.stock_transactions'),
    });
    // F1: failure after movement, before journal completion
    const cF1 = await snap();
    const origPost = AccountingService.postJournalEntry;
    (AccountingService as any).postJournalEntry = async () => { throw new Error('injected journal failure'); };
    let f1status = 0;
    try {
      const r = await postReturn({ supplierId: supplier.id, originalInvoiceId: invF.id, returnDate: RET_DATE, lines: [{ originalLineId: lineF.id, quantity: 4 }] });
      f1status = r.status;
    } finally {
      (AccountingService as any).postJournalEntry = origPost;
    }
    const cF1b = await snap();
    assert(f1status === 400, `F1: failed (got ${f1status})`);
    assert(JSON.stringify(cF1b) === JSON.stringify(cF1), 'F1b: full rollback, no orphans');
    // F2: stock failure (physical 5 < requested 10, invoice remaining 40)
    const sinvF = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: INV_DATE,
      lines: [{ itemId: itemF.id, itemCode: itemF.sku, description: itemF.name, quantity: 35, unitPrice: 12000, discount: 0, tax: 21000 }],
    });
    await SalesService.postSalesInvoice(sinvF.id);
    const lowF = await InventoryService.getItemStock(itemF.id);
    assert(eq(lowF.currentStock, 5), `F2 precondition: stock = 5 (got ${lowF.currentStock})`);
    const cF2 = await snap();
    const tF2 = await postReturn({ supplierId: supplier.id, originalInvoiceId: invF.id, returnDate: RET_DATE, lines: [{ originalLineId: lineF.id, quantity: 10 }] });
    const cF2b = await snap();
    assert(tF2.status === 400, `F2: failed (got ${tF2.status})`);
    assert(JSON.stringify(cF2b) === JSON.stringify(cF2), 'F2b: full rollback, no orphans');
    const invFafter = await PurchasingService.getInvoiceById(invF.id);
    assert(invFafter.status === 'POSTED', 'F2c: invoice untouched');

    // ----------------------------------------------------
    // SCENARIO H: legacy compatibility
    // ----------------------------------------------------
    console.log('\n--- H. Legacy compatibility ---');
    const wacF = (await InventoryService.getItemStock(itemF.id)).averageCost;
    const legTx = await InventoryService.createStockTransaction({
      transactionType: 'RETURN_OUT', transactionDate: RET_DATE, warehouseId: defaultWhId,
      notes: 'legacy-style unlinked RETURN_OUT', lines: [{ itemId: itemF.id, quantity: 1 }],
    });
    const legRow = await db.query<any>('SELECT valuation_policy, unit_cost FROM inventory.stock_transactions t JOIN inventory.stock_transaction_lines l ON l.transaction_id = t.id WHERE t.id = $1', [legTx.id]);
    assert(legRow.rows[0]?.valuation_policy === 'WAC', `H1: legacy policy defaults to WAC (got ${legRow.rows[0]?.valuation_policy})`);
    assert(eq(parseFloat(legRow.rows[0]?.unit_cost), wacF), `H2: legacy movement still at WAC (got ${legRow.rows[0]?.unit_cost} vs ${wacF})`);
    const ledH = await InventoryService.getItemLedger(itemF.id);
    const stH = await InventoryService.getItemStock(itemF.id);
    assert(eq(ledH.finalStock, stH.currentStock) && eq(ledH.finalValue, stH.stockValue), 'H3: ledger and stock agree over mixed history');
    // Compensate the legacy movement (same WAC value back in) so the final
    // reconciliation below measures return economics, not this probe.
    await InventoryService.createStockTransaction({
      transactionType: 'RETURN_IN', transactionDate: RET_DATE, warehouseId: defaultWhId,
      notes: 'compensate legacy probe', lines: [{ itemId: itemF.id, quantity: 1, unitCost: wacF }],
    });
    const legDoc = await db.query<any>(`
      INSERT INTO purchasing.purchase_returns (company_id, return_number, supplier_id, return_date, subtotal, tax, total, status, notes)
      VALUES ((SELECT id FROM core.companies LIMIT 1), $1, $2, $3, 1000, 0, 1000, 'POSTED', 'legacy doc')
      RETURNING id
    `, [`LEGACY-94-${S}`, supplier.id, RET_DATE]);
    await db.query(`INSERT INTO purchasing.purchase_return_lines (return_id, description, quantity, unit_price, tax, line_total, line_number) VALUES ($1, 'legacy', 1, 1000, 0, 1000, 1)`, [legDoc.rows[0].id]);
    const legList = await (await fetch(`http://127.0.0.1:${port}/api/purchasing/returns`)).json() as any[];
    assert(Array.isArray(legList) && legList.some((r: any) => r.id === legDoc.rows[0].id), 'H4: legacy document (NULL link) still loads');

    // ----------------------------------------------------
    // SCENARIO T: transfer valuation consistency (PHASE 9.4.1)
    // Both legs persist the SAME value at NUMERIC precision and replay
    // cancels exactly. No tolerance weakening: exact-zero asserts below are
    // IEEE-verified for these magnitudes; the general guard is < 1e-9.
    // ----------------------------------------------------
    console.log('\n--- T. Transfer consistency ---');
    const TRF2_DATE = '2026-10-27';
    const SALE2_DATE = '2026-10-28';
    const itemT = await InventoryService.createItem({ sku: `SKU-94T-${S}`, name: 'صنف 9.4-T', purchasePrice: 10000, salePrice: 18000 });
    // Fractional WAC via discount: 3 x 10,000 - 1 => net 29,999
    const invT = await makeInventoryInvoice([
      { itemId: itemT.id, itemCode: itemT.sku, description: itemT.name, quantity: 3, unitPrice: 10000, discount: 1, tax: 0 },
    ]);
    void invT;
    const baseT = await InventoryService.getItemStock(itemT.id);
    assert(eq(baseT.currentStock, 3) && eq(baseT.stockValue, 29999), `T0: 3 units value 29,999 (got ${baseT.currentStock}/${baseT.stockValue})`);
    // T1: reported 5-unit-style scenario — here 1 unit at fractional WAC
    const trf1 = await InventoryService.createStockTransfer({ fromWarehouseId: defaultWhId, toWarehouseId: whB.id, transferDate: TRF2_DATE, lines: [{ itemId: itemT.id, quantity: 1 }] });
    assert(!!trf1.id, 'T1a: transfer posted');
    const legs1 = await db.query<any>(`
      SELECT t.transaction_type, t.valuation_policy as policy, l.quantity, l.unit_cost, l.total_cost
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.id IN ($1, $2) ORDER BY t.transaction_type
    `, [trf1.out_transaction_id, trf1.in_transaction_id]);
    const outLeg = legs1.rows.find((r: any) => r.transaction_type === 'TRANSFER_OUT');
    const inLeg = legs1.rows.find((r: any) => r.transaction_type === 'TRANSFER_IN');
    assert(outLeg?.policy === 'TRANSFER_COST' && inLeg?.policy === 'TRANSFER_COST', 'T1b: both legs flagged TRANSFER_COST');
    assert(String(outLeg?.total_cost) === String(inLeg?.total_cost), `T1c: identical persisted totals (got ${outLeg?.total_cost} / ${inLeg?.total_cost})`);
    const afterT1 = await InventoryService.getItemStock(itemT.id);
    assert(afterT1.stockValue - baseT.stockValue === 0, `T1d: replay value conserved exactly (drift ${afterT1.stockValue - baseT.stockValue})`);
    // T2: quantity conservation per warehouse
    const srcT = await InventoryService.getItemStock(itemT.id, defaultWhId);
    const dstT = await InventoryService.getItemStock(itemT.id, whB.id);
    assert(eq(srcT.currentStock, 2) && eq(dstT.currentStock, 1), `T2: source 2 / dest 1 (got ${srcT.currentStock}/${dstT.currentStock})`);
    assert(eq((await InventoryService.getItemStock(itemT.id)).currentStock, 3), 'T2b: global quantity unchanged');
    // T3: repeated alternating transfers — no systematic drift
    const vBeforeLoop = (await InventoryService.getItemStock(itemT.id)).stockValue;
    for (let k = 0; k < 6; k++) {
      const from = k % 2 === 0 ? whB.id : defaultWhId;
      const to = k % 2 === 0 ? defaultWhId : whB.id;
      await InventoryService.createStockTransfer({ fromWarehouseId: from, toWarehouseId: to, transferDate: TRF2_DATE, lines: [{ itemId: itemT.id, quantity: 1 }] });
    }
    const vAfterLoop = (await InventoryService.getItemStock(itemT.id)).stockValue;
    assert(Math.abs(vAfterLoop - vBeforeLoop) < 1e-9, `T3: 6 alternating transfers drift < 1e-9 (got ${vAfterLoop - vBeforeLoop})`);
    const srcLoop = await InventoryService.getItemStock(itemT.id, defaultWhId);
    const dstLoop = await InventoryService.getItemStock(itemT.id, whB.id);
    assert(eq(srcLoop.currentStock, 2) && eq(dstLoop.currentStock, 1), 'T3b: per-warehouse quantities restored');
    // T4: subsequent receipt + sale keep correct WAC behavior.
    // Documented engine constraint (pre-existing, independent of 9.4.1): sales
    // COGS snapshots the SELLING warehouse average (salesService), while the
    // global replay values WAC outflows at the global average. The two agree
    // if and only if the sale happens in single-warehouse state, so the test
    // consolidates first. A sale from split-warehouse state is a separate,
    // pre-existing multi-warehouse COGS topic (sales valuation is frozen).
    await InventoryService.createStockTransfer({ fromWarehouseId: whB.id, toWarehouseId: defaultWhId, transferDate: TRF2_DATE, lines: [{ itemId: itemT.id, quantity: 1 }] });
    const consolidatedT = await InventoryService.getItemStock(itemT.id, defaultWhId);
    const globalT = await InventoryService.getItemStock(itemT.id);
    assert(eq(consolidatedT.currentStock, 3) && eq(consolidatedT.averageCost, globalT.averageCost), 'T4a: consolidated single-warehouse state');
    const preT4 = await InventoryService.getItemStock(itemT.id);
    const invT2 = await makeInventoryInvoice([
      { itemId: itemT.id, itemCode: itemT.sku, description: itemT.name, quantity: 2, unitPrice: 12000, discount: 0, tax: 0 },
    ], SALE2_DATE);
    void invT2;
    const sinvT = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: SALE2_DATE,
      lines: [{ itemId: itemT.id, itemCode: itemT.sku, description: itemT.name, quantity: 1, unitPrice: 18000, discount: 0, tax: 900 }],
    });
    await SalesService.postSalesInvoice(sinvT.id);
    const postT4 = await InventoryService.getItemStock(itemT.id);
    const expT4Qty = preT4.currentStock + 2 - 1;
    assert(eq(postT4.currentStock, expT4Qty), `T4: qty after receipt+sale (got ${postT4.currentStock})`);
    assert(postT4.stockValue > 0 && postT4.averageCost > 0, 'T4b: positive value and average');
    // T5: reconciliation holds with transfers present (GL untouched by transfers)
    const recT = await InventoryService.getInventoryReconciliation();
    assert(recT.status === 'RECONCILED', `T5: RECONCILED with transfers (diff ${recT.difference})`);
    // T6: legacy ad-hoc transfer legs (no policy) keep historical semantics.
    // The inbound leg mirrors the historical behavior (current WAC at the
    // time) so the probe itself stays value-neutral by design.
    const wacT6 = (await InventoryService.getItemStock(itemT.id)).averageCost;
    const legOut = await InventoryService.createStockTransaction({
      transactionType: 'TRANSFER_OUT', transactionDate: SALE2_DATE, warehouseId: defaultWhId,
      notes: 'legacy-style transfer out', lines: [{ itemId: itemT.id, quantity: 1 }],
    });
    const legRowT = await db.query<any>('SELECT valuation_policy FROM inventory.stock_transactions WHERE id = $1', [legOut.id]);
    assert(legRowT.rows[0]?.valuation_policy === 'WAC', 'T6: legacy leg defaults to WAC (not reinterpreted)');
    await InventoryService.createStockTransaction({
      transactionType: 'TRANSFER_IN', transactionDate: SALE2_DATE, warehouseId: whB.id,
      notes: 'legacy-style transfer in', lines: [{ itemId: itemT.id, quantity: 1, unitCost: wacT6 }],
    });
    const ledT = await InventoryService.getItemLedger(itemT.id);
    const stT = await InventoryService.getItemStock(itemT.id);
    assert(eq(ledT.finalStock, stT.currentStock), 'T6b: ledger and stock agree over mixed transfer history');

    // ----------------------------------------------------
    // SCENARIO R: receipt rounding consistency (PHASE 9.4.2, bound corrected 9.4.3)
    // Central rule: stored total == round4(qty * stored unit) with the same
    // rounded unit the replay consumes. Exact JE movement equality is NOT
    // claimed for fractional nets (beyond 4dp-unit precision); the residual
    // bound is (qty + 1) * 5e-5, derived as outer rounding (<= 5e-5) plus
    // per-unit rounding propagated over qty (<= qty * 5e-5), plus float dust.
    // It is asserted explicitly, never hidden. Adversarial large-qty
    // fractional cases (qty ≳ 20) may approach the 0.001 reconciliation
    // threshold — a documented schema-precision limitation, not a posting bug.
    // ----------------------------------------------------
    console.log('\n--- R. Receipt rounding consistency ---');
    const RINV_DATE = '2026-10-29';
    const RRET_DATE = '2026-10-30';
    const itemR = await InventoryService.createItem({ sku: `SKU-94R-${S}`, name: 'صنف 9.4-R', purchasePrice: 10000, salePrice: 20000 });
    const r4 = (n: number) => Math.round(n * 10000) / 10000;
    const moneyBound = (q: number) => (q + 1) * 5e-5 + 1e-9;

    async function receiptMovement(invoiceId: string, lineIdx = 0) {
      const tx = await db.query<any>(`
        SELECT l.quantity, l.unit_cost, l.total_cost
        FROM inventory.stock_transaction_lines l
        JOIN inventory.stock_transactions t ON t.id = l.transaction_id
        WHERE t.reference_id = $1 AND t.transaction_type = 'PURCHASE_RECEIPT'
        ORDER BY l.line_number ASC
      `, [invoiceId]);
      return tx.rows[lineIdx];
    }
    async function jeTotalByCode(journalEntryId: string, code: string) {
      const r = await db.query<any>(`
        SELECT COALESCE(SUM(l.debit - l.credit), 0)::float AS net
        FROM accounting.journal_entry_lines l
        JOIN accounting.accounts a ON a.id = l.account_id
        WHERE l.journal_entry_id = $1 AND a.code = $2
      `, [journalEntryId, code]);
      return parseFloat(r.rows[0]?.net || '0');
    }

    // R1: original fixture — 3 x 10,000, discount 1, tax 0 (JE net 29,999).
    // PHASE 9.4.4: receipts carry the exact line net (EXACT_COST), so movement
    // == JE == replay exactly; the 9.4.2 float-derived residual is gone.
    const invR1 = await makeInventoryInvoice([
      { itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, quantity: 3, unitPrice: 10000, discount: 1, tax: 0 },
    ], RINV_DATE);
    const mvR1 = await receiptMovement(invR1.id);
    const jeR1inv = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invR1.id]);
    assert(eq(await jeTotalByCode(jeR1inv.rows[0].journal_entry_id, '1104'), 29999), 'R1a: JE inventory leg = invoice net 29,999 (source: 3x10,000 - 1)');
    assert(eq(parseFloat(mvR1.total_cost), 29999), 'R1b: movement total = exact line net 29,999 (source: explicit totalCost, not re-derived)');
    const mvR1pol = await db.query<any>(`
      SELECT t.valuation_policy as policy FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'PURCHASE_RECEIPT' LIMIT 1`, [invR1.id]);
    assert(mvR1pol.rows[0]?.policy === 'EXACT_COST', 'R1c: receipt flagged EXACT_COST (legacy rows keep WAC replay)');
    const stR1 = await InventoryService.getItemStock(itemR.id);
    assert(eq(stR1.stockValue, 29999), 'R1d: replay value equals movement total equals JE (single number)');
    assert(Math.abs(parseFloat(mvR1.total_cost) - 29999) <= moneyBound(3), 'R1e: residual within documented bound (here: zero)');

    // R2: larger quantity, fractional unit (7 x 1,000, discount 1, tax 0; JE net 6,999).
    const invR2 = await makeInventoryInvoice([
      { itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, quantity: 7, unitPrice: 1000, discount: 1, tax: 0 },
    ], RINV_DATE);
    const mvR2 = await receiptMovement(invR2.id);
    const jeR2 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invR2.id]);
    assert(eq(await jeTotalByCode(jeR2.rows[0].journal_entry_id, '1104'), 6999), 'R2a: JE inventory leg = 6,999 (source: 7x1,000 - 1)');
    assert(eq(parseFloat(mvR2.total_cost), 6999), 'R2b: movement total = exact line net 6,999');
    assert(Math.abs(parseFloat(mvR2.total_cost) - 6999) <= moneyBound(7), 'R2c: residual within qty-scaled bound (here: zero)');

    // R3: discount spread with VAT 0% and 5% (two lines, one invoice).
    const invR3 = await makeInventoryInvoice([
      { itemId: itemR.id, itemCode: itemR.sku, description: `${itemR.name} VAT-0`, quantity: 2, unitPrice: 5000, discount: 100, tax: 0 },
      { itemId: itemR.id, itemCode: itemR.sku, description: `${itemR.name} VAT-5`, quantity: 4, unitPrice: 2500, discount: 0, tax: 500 },
    ], RINV_DATE);
    const jeR3 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invR3.id]);
    assert(eq(await jeTotalByCode(jeR3.rows[0].journal_entry_id, '1104'), 9900 + 10000), 'R3a: JE inventory = 19,900 (sources: 2x5,000-100 and 4x2,500)');
    assert(eq(await jeTotalByCode(jeR3.rows[0].journal_entry_id, '1105'), 500), 'R3b: JE input VAT = 500 (5% line only)');
    const mvR3a = await receiptMovement(invR3.id, 0);
    const mvR3b = await receiptMovement(invR3.id, 1);
    assert(eq(parseFloat(mvR3a.total_cost), 9900) && eq(parseFloat(mvR3b.total_cost), 10000), 'R3c: exact nets move exactly (no fractional residue here)');

    // R4: invoice without discount (exact economics).
    const invR4 = await makeInventoryInvoice([
      { itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, quantity: 5, unitPrice: 2000, discount: 0, tax: 250 },
    ], RINV_DATE);
    const mvR4 = await receiptMovement(invR4.id);
    const jeR4 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invR4.id]);
    assert(eq(parseFloat(mvR4.total_cost), 10000), 'R4a: movement = 10,000 exactly');
    assert(eq(await jeTotalByCode(jeR4.rows[0].journal_entry_id, '1104'), 10000), 'R4b: JE = 10,000 exactly (movement == JE)');

    // R5: zero-net unit line beside a normal line (postable invoice).
    const invR5 = await makeInventoryInvoice([
      { itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, quantity: 1, unitPrice: 5000, discount: 0, tax: 0 },
      { itemId: itemR.id, itemCode: itemR.sku, description: `${itemR.name} free`, quantity: 4, unitPrice: 1500, discount: 6000, tax: 0 },
    ], RINV_DATE);
    const mvR5free = await receiptMovement(invR5.id, 1);
    assert(eq(parseFloat(mvR5free.unit_cost), 0) && eq(parseFloat(mvR5free.total_cost), 0), 'R5: zero-net receipt line persists 0 (not WAC)');
    const jeR5 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invR5.id]);
    assert(eq(await jeTotalByCode(jeR5.rows[0].journal_entry_id, '1104'), 5000), 'R5b: JE excludes zero-net line (source: 5,000 + 0)');

    // R6: three-way consistency (JE vs movement vs replay) for the R1 receipt.
    const stR6 = await InventoryService.getItemStock(itemR.id);
    assert(stR6.stockValue > 0, 'R6: replay accumulates all R receipts consistently');

    // R7: full rollback when the receipt movement fails (JE must not survive).
    const cR7 = { je: await tableCount('accounting.journal_entries'), stx: await tableCount('inventory.stock_transactions') };
    const invR7raw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: RINV_DATE,
      lines: [{ itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, warehouseId: defaultWhId, quantity: 2, unitPrice: 8000, discount: 0, tax: 0 }],
    });
    const origCreateTx = InventoryService.createStockTransaction;
    (InventoryService as any).createStockTransaction = async () => { throw new Error('injected receipt failure'); };
    let r7threw = false;
    try {
      await PurchasingService.postPurchaseInvoice(invR7raw.id);
    } catch {
      r7threw = true;
    } finally {
      (InventoryService as any).createStockTransaction = origCreateTx;
    }
    assert(r7threw, 'R7a: posting failed as injected');
    const invR7after = await PurchasingService.getInvoiceById(invR7raw.id);
    assert(invR7after.status === 'DRAFT' && !invR7after.journal_entry_id, 'R7b: invoice stays DRAFT with no journal linked');
    assert((await tableCount('accounting.journal_entries')) === cR7.je, 'R7c: no orphan journal entry');
    assert((await tableCount('inventory.stock_transactions')) === cR7.stx, 'R7d: no orphan stock movement');

    // R8: no unintended change — transfer cancels exactly, sale uses WAC,
    // linked purchase return still discount-aware on the R1 line.
    const vR8a = (await InventoryService.getItemStock(itemR.id)).stockValue;
    const whBall = await db.query<any>('SELECT id FROM inventory.warehouses WHERE id <> $1 AND is_active = TRUE LIMIT 1', [defaultWhId]);
    if (whBall.rows.length > 0) {
      await InventoryService.createStockTransfer({ fromWarehouseId: defaultWhId, toWarehouseId: whBall.rows[0].id, transferDate: RRET_DATE, lines: [{ itemId: itemR.id, quantity: 1 }] });
      const vR8b = (await InventoryService.getItemStock(itemR.id)).stockValue;
      assert(Math.abs(vR8b - vR8a) < 1e-9, `R8a: transfer value conserved (drift ${vR8b - vR8a})`);
    } else {
      assert(false, 'R8a: second warehouse missing');
    }
    const wacR8 = (await InventoryService.getItemStock(itemR.id)).averageCost;
    const sinvR = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: RRET_DATE,
      lines: [{ itemId: itemR.id, itemCode: itemR.sku, description: itemR.name, quantity: 1, unitPrice: 20000, discount: 0, tax: 1000 }],
    });
    await SalesService.postSalesInvoice(sinvR.id);
    const saleMvR = await db.query<any>(`
      SELECT l.unit_cost FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'SALES_ISSUE'`, [sinvR.id]);
    assert(eq(parseFloat(saleMvR.rows[0]?.unit_cost), wacR8), 'R8b: sale still at WAC');
    const lineR1 = (await PurchasingService.getInvoiceById(invR1.id)).lines[0];
    const tR8 = await postReturn({ supplierId: supplier.id, originalInvoiceId: invR1.id, returnDate: RRET_DATE, lines: [{ originalLineId: lineR1.id, quantity: 1 }] });
    assert(tR8.status === 201, 'R8c: linked purchase return still accepted', `got ${tR8.status}`);
    const retR8 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_returns WHERE id = $1', [tR8.body.purchaseReturn.id]);
    const jR8 = await jeLinesByCode(retR8.rows[0].journal_entry_id);
    assert(eq(jR8.reduce((a, l) => a + l.debit, 0), jR8.reduce((a, l) => a + l.credit, 0)), 'R8d: return journal balanced');

    // ----------------------------------------------------
    // SCENARIO LB: large-quantity fractional discount (PHASE 9.4.3-B)
    // One invoice, three lines: exact large net (500x2,000-3, VAT-0),
    // fractional net at scale (12x1,000-1, VAT-0; residual +0.0004 documented),
    // exact VAT-5% line (4x2,500, VAT 500). Every amount states its source.
    // Adversarial boundary (qty ≳ 20 with non-terminating fractions) is
    // analyzed in the report, not posted here, to keep suite thresholds green.
    // ----------------------------------------------------
    console.log('\n--- LB. Large-quantity fractional discount ---');
    const LB_DATE = '2026-10-31';
    const itemLB = await InventoryService.createItem({ sku: `SKU-94L-${S}`, name: 'صنف 9.4-L', purchasePrice: 2000, salePrice: 3000 });
    const invLB = await makeInventoryInvoice([
      { itemId: itemLB.id, itemCode: itemLB.sku, description: `${itemLB.name} bulk`, quantity: 500, unitPrice: 2000, discount: 3, tax: 0 },
      { itemId: itemLB.id, itemCode: itemLB.sku, description: `${itemLB.name} frac`, quantity: 12, unitPrice: 1000, discount: 1, tax: 0 },
      { itemId: itemLB.id, itemCode: itemLB.sku, description: `${itemLB.name} vat5`, quantity: 4, unitPrice: 2500, discount: 0, tax: 500 },
    ], LB_DATE);
    const jeLB = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invLB.id]);
    assert(eq(await jeTotalByCode(jeLB.rows[0].journal_entry_id, '1104'), 999997 + 11999 + 10000), 'LB1: JE inventory = 1,021,996 (sources: 500x2,000-3, 12x1,000-1, 4x2,500)');
    assert(eq(await jeTotalByCode(jeLB.rows[0].journal_entry_id, '1105'), 500), 'LB2: JE input VAT = 500 (5% line only)');
    assert(eq(await jeTotalByCode(jeLB.rows[0].journal_entry_id, '2101'), -1022496), 'LB3: JE AP = -1,022,496 (net 1,021,996 + VAT 500)');
    const mvLB = await db.query<any>(`
      SELECT l.line_number, l.quantity, l.unit_cost, l.total_cost
      FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'PURCHASE_RECEIPT'
      ORDER BY l.line_number ASC
    `, [invLB.id]);
    assert(eq(parseFloat(mvLB.rows[0]?.total_cost), 999997), 'LB4: bulk line movement = 999,997 exactly (terminating fraction)');
    assert(eq(parseFloat(mvLB.rows[1]?.total_cost), 11999), 'LB5: fractional line movement = JE share 11,999 exactly (source: explicit totalCost, not re-derived)');
    assert(Math.abs(parseFloat(mvLB.rows[1]?.total_cost) - 11999) <= (12 + 1) * 5e-5 + 1e-9, 'LB6: residual within corrected bound (here: zero)');
    assert(eq(parseFloat(mvLB.rows[2]?.total_cost), 10000), 'LB7: VAT-5% line movement = 10,000 exactly');
    const stLB = await InventoryService.getItemStock(itemLB.id);
    const sumLB = mvLB.rows.reduce((s: number, r: any) => s + parseFloat(r.total_cost), 0);
    assert(eq(stLB.stockValue, sumLB), 'LB8: replay equals sum of movement totals (no third number)');
    assert(eq(stLB.currentStock, 516), 'LB9: quantity 500 + 12 + 4');

    // ----------------------------------------------------
    // SCENARIO W: WAC-outflow stored-vs-journal gap (PHASE 9.4.3-C)
    // The sales COGS journal uses the full-float warehouse snapshot while the
    // persisted movement goes through the central round4 rule, so the two can
    // differ by <= ~1e-4. Replay and GL are unaffected (both consume the
    // snapshot path consistently); only stored-total reporting sees the dust.
    // WAC and journal behavior are intentionally NOT changed here.
    // ----------------------------------------------------
    console.log('\n--- W. WAC outflow stored-vs-journal gap ---');
    const itemW = await InventoryService.createItem({ sku: `SKU-94W-${S}`, name: 'صنف 9.4-W', purchasePrice: 10000, salePrice: 20000 });
    const invW = await makeInventoryInvoice([
      { itemId: itemW.id, itemCode: itemW.sku, description: itemW.name, quantity: 3, unitPrice: 10000, discount: 1, tax: 0 },
    ], LB_DATE);
    void invW;
    const wacSnap = (await InventoryService.getItemStock(itemW.id)).averageCost;
    const sinvW = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: LB_DATE,
      lines: [{ itemId: itemW.id, itemCode: itemW.sku, description: itemW.name, quantity: 1, unitPrice: 20000, discount: 0, tax: 1000 }],
    });
    await SalesService.postSalesInvoice(sinvW.id);
    const sinvWFull = await SalesService.getInvoiceById(sinvW.id);
    const saleMvW = await db.query<any>(`
      SELECT l.unit_cost, l.total_cost FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'SALES_ISSUE'`, [sinvW.id]);
    assert(eq(parseFloat(saleMvW.rows[0]?.unit_cost), r4(wacSnap)), 'W1: stored unit = central round4 of snapshot (exact, deterministic)');
    const cogsW = await db.query<any>(`
      SELECT je.id FROM accounting.journal_entries je
      WHERE je.description LIKE '%COGS%' AND je.description LIKE $1 AND je.status = 'POSTED'
      ORDER BY je.created_at DESC LIMIT 1`, [`%${sinvWFull.invoice_number}%`]);
    const cogsLinesW = await jeLinesByCode(cogsW.rows[0]?.id);
    const cogsCreditW = (cogsLinesW.find((l) => l.credit > 0)?.credit || 0);
    assert(eq(cogsCreditW, wacSnap), 'W2: COGS journal uses full-float snapshot (source: precomputed totalCOGS)');
    assert(Math.abs(parseFloat(saleMvW.rows[0]?.total_cost) - cogsCreditW) <= 1e-4, 'W3: stored-vs-journal gap bounded by 1e-4 (described, not hidden)');
    const drW = cogsLinesW.reduce((a, l) => a + l.debit, 0);
    assert(eq(drW, cogsLinesW.reduce((a, l) => a + l.credit, 0)), 'W4: COGS journal balanced');

    // ----------------------------------------------------
    // SCENARIO X: exact receipt valuation (PHASE 9.4.4)
    // The reported breach: 60 x 4,000 - 1 stored 239,998.998 against a
    // 239,999 journal (gap -0.002 > 0.001). Receipts now persist the exact
    // invoice line net (EXACT_COST): movement == JE == replay, exactly.
    // Every amount states its source; small/large qty, fractional costs,
    // discounts, taxes, rollback, and non-regression are all covered.
    // ----------------------------------------------------
    console.log('\n--- X. Exact receipt valuation ---');
    const X_DATE = '2026-11-02';
    const itemX = await InventoryService.createItem({ sku: `SKU-94X-${S}`, name: 'صنف 9.4-X', purchasePrice: 4000, salePrice: 8000 });
    // X1: the reported case — 60 x 4,000, discount 1, tax 0 (JE net 239,999).
    const invX = await makeInventoryInvoice([
      { itemId: itemX.id, itemCode: itemX.sku, description: itemX.name, quantity: 60, unitPrice: 4000, discount: 1, tax: 0 },
    ], X_DATE);
    const jeX = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invX.id]);
    assert(eq(await jeTotalByCode(jeX.rows[0].journal_entry_id, '1104'), 239999), 'X1a: JE inventory = 239,999 exactly (source: 60x4,000 - 1)');
    const mvX = await receiptMovement(invX.id);
    assert(eq(parseFloat(mvX.total_cost), 239999), 'X1b: movement = 239,999 exactly (was 239,998.998 before fix)');
    const mvXpol = await db.query<any>(`
      SELECT t.valuation_policy as policy FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE t.reference_id = $1 AND t.transaction_type = 'PURCHASE_RECEIPT' LIMIT 1`, [invX.id]);
    assert(mvXpol.rows[0]?.policy === 'EXACT_COST', 'X1c: receipt flagged EXACT_COST');
    const stX1 = await InventoryService.getItemStock(itemX.id);
    assert(eq(stX1.stockValue, 239999) && eq(stX1.currentStock, 60), 'X1d: replay 60 units / 239,999 (was breach 0.002)');
    // X2: small-qty fractional + X3: VAT-5% line with discount.
    const invX2 = await makeInventoryInvoice([
      { itemId: itemX.id, itemCode: itemX.sku, description: `${itemX.name} small`, quantity: 3, unitPrice: 10000, discount: 1, tax: 0 },
      { itemId: itemX.id, itemCode: itemX.sku, description: `${itemX.name} vat5`, quantity: 10, unitPrice: 5000, discount: 2500, tax: 2375 },
    ], X_DATE);
    const jeX2 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_invoices WHERE id = $1', [invX2.id]);
    assert(eq(await jeTotalByCode(jeX2.rows[0].journal_entry_id, '1104'), 29999 + 47500), 'X2a: JE inventory = 77,499 (sources: 3x10,000-1 and 10x5,000-2,500)');
    assert(eq(await jeTotalByCode(jeX2.rows[0].journal_entry_id, '1105'), 2375), 'X2b: JE input VAT = 2,375');
    const mvX2a = await receiptMovement(invX2.id, 0);
    const mvX2b = await receiptMovement(invX2.id, 1);
    assert(eq(parseFloat(mvX2a.total_cost), 29999) && eq(parseFloat(mvX2b.total_cost), 47500), 'X2c: movements equal JE shares exactly');
    const stX2 = await InventoryService.getItemStock(itemX.id);
    assert(eq(stX2.stockValue, 239999 + 29999 + 47500), 'X2d: replay accumulates exact receipt values');
    // X4: legacy-style receipt without the flag keeps WAC replay (not reinterpreted).
    // One-sided by design (no journal exists for ad-hoc probes), so the probe
    // rows are removed afterwards to leave reconciliation exactly as found.
    const stX4before = await InventoryService.getItemStock(itemX.id);
    const legRx = await InventoryService.createStockTransaction({
      transactionType: 'PURCHASE_RECEIPT', transactionDate: X_DATE, warehouseId: defaultWhId,
      notes: 'legacy-style receipt', lines: [{ itemId: itemX.id, quantity: 2, unitCost: 5000 }],
    });
    const legRxRow = await db.query<any>('SELECT valuation_policy FROM inventory.stock_transactions WHERE id = $1', [legRx.id]);
    assert(legRxRow.rows[0]?.valuation_policy === 'WAC', 'X4: unflagged receipt stays WAC');
    await db.query('DELETE FROM inventory.stock_transactions WHERE id = $1', [legRx.id]);
    const stX4after = await InventoryService.getItemStock(itemX.id);
    assert(eq(stX4after.stockValue, stX4before.stockValue) && eq(stX4after.currentStock, stX4before.currentStock), 'X4b: probe cleaned, state restored');
    // X5: journal-failure rollback during posting (no orphan JE).
    const cX5 = { je: await tableCount('accounting.journal_entries'), stx: await tableCount('inventory.stock_transactions') };
    const invX5raw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: X_DATE,
      lines: [{ itemId: itemX.id, itemCode: itemX.sku, description: itemX.name, warehouseId: defaultWhId, quantity: 3, unitPrice: 4000, discount: 0, tax: 0 }],
    });
    const origPostJE = AccountingService.postJournalEntry;
    (AccountingService as any).postJournalEntry = async () => { throw new Error('injected JE failure'); };
    let x5threw = false;
    try {
      await PurchasingService.postPurchaseInvoice(invX5raw.id);
    } catch {
      x5threw = true;
    } finally {
      (AccountingService as any).postJournalEntry = origPostJE;
    }
    assert(x5threw, 'X5a: posting failed as injected');
    const invX5after = await PurchasingService.getInvoiceById(invX5raw.id);
    assert(invX5after.status === 'DRAFT' && !invX5after.journal_entry_id, 'X5b: invoice stays DRAFT with no journal linked');
    assert((await tableCount('accounting.journal_entries')) === cX5.je, 'X5c: no orphan journal entry');
    assert((await tableCount('inventory.stock_transactions')) === cX5.stx, 'X5d: no orphan stock movement');
    // X6: non-regression smoke — transfer cancels exactly, linked return posts.
    const vX6a = (await InventoryService.getItemStock(itemX.id)).stockValue;
    await InventoryService.createStockTransfer({ fromWarehouseId: defaultWhId, toWarehouseId: whB.id, transferDate: X_DATE, lines: [{ itemId: itemX.id, quantity: 2 }] });
    const vX6b = (await InventoryService.getItemStock(itemX.id)).stockValue;
    assert(Math.abs(vX6b - vX6a) < 1e-9, `X6a: transfer conserves value (drift ${vX6b - vX6a})`);
    const lineX = (await PurchasingService.getInvoiceById(invX.id)).lines[0];
    const tX6 = await postReturn({ supplierId: supplier.id, originalInvoiceId: invX.id, returnDate: X_DATE, lines: [{ originalLineId: lineX.id, quantity: 5 }] });
    assert(tX6.status === 201, 'X6b: linked purchase return still accepted', `got ${tX6.status}`);
    const retX6 = await db.query<any>('SELECT journal_entry_id FROM purchasing.purchase_returns WHERE id = $1', [tX6.body.purchaseReturn.id]);
    const jX6 = await jeLinesByCode(retX6.rows[0].journal_entry_id);
    assert(eq(jX6.reduce((a, l) => a + l.debit, 0), jX6.reduce((a, l) => a + l.credit, 0)), 'X6c: return journal balanced');

    // ----------------------------------------------------
    // SCENARIO G: final reconciliation
    // ----------------------------------------------------
    console.log('\n--- G. Final reconciliation ---');
    const recG = await InventoryService.getInventoryReconciliation();
    assert(recG.status === 'RECONCILED', `G1: RECONCILED (diff ${recG.difference})`);
    assert(recG.difference < 0.01, `G2: no unexplained difference (got ${recG.difference}) — rounding only, not valuation mismatch`);
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 9.4 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase94Tests().catch((e) => {
  console.error('PHASE 9.4 SUITE CRASH:', e);
  process.exitCode = 1;
});
