import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { SalesService } from './salesService.ts';
import { InventoryService } from './inventoryService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * PHASE 9.5.1 — Warehouse-scoped weighted average cost.
 * Every posting snapshots and moves value in the DOCUMENT warehouse
 * (never a silent default); replay and reconciliation aggregate per
 * (item, warehouse); the global average stays a derived KPI only.
 */
async function runPhase95Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 9.5.1 — Warehouse-Scoped WAC');
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
  const D1 = '2026-11-10';
  const D2 = '2026-11-11';
  const D3 = '2026-11-12';
  const D4 = '2026-11-13';
  const D5 = '2026-11-14';

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

  async function jeBalanced(journalEntryId: string) {
    const lines = await jeLinesByCode(journalEntryId);
    const dr = lines.reduce((a, l) => a + l.debit, 0);
    const cr = lines.reduce((a, l) => a + l.credit, 0);
    return Math.abs(dr - cr) < 0.01 && dr > 0;
  }

  console.log('\n--- 0. Setup: two explicit warehouses ---');
  const supplier = await PurchasingService.createSupplier({ code: `SUP-95-${S}`, name: 'مورد 9.5', creditLimit: 100000000 });
  const customer = await SalesService.createCustomer({ code: `CUST-95-${S}`, name: 'عميل 9.5', creditLimit: 100000000 });
  const item = await InventoryService.createItem({ sku: `SKU-95-${S}`, name: 'صنف 9.5', purchasePrice: 10000, salePrice: 20000 });
  const wh1 = await InventoryService.createWarehouse({ code: `WH-95A-${S}`, name: 'مستودع 9.5-A' });
  const wh2 = await InventoryService.createWarehouse({ code: `WH-95B-${S}`, name: 'مستودع 9.5-B' });
  assert(!!supplier.id && !!customer.id && !!item.id && !!wh1.id && !!wh2.id && wh1.id !== wh2.id, 'Setup master data + two warehouses');

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;

  try {
    // ----------------------------------------------------
    // TEST 1: receipt lands in the DOCUMENT warehouse (not the default)
    // ----------------------------------------------------
    console.log('\n--- TEST 1: receipt honors line warehouse ---');
    const inv1 = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: item.id, itemCode: item.sku, description: item.name, warehouseId: wh2.id, quantity: 10, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(inv1.id);
    const rcptTx = await db.query<any>(`
      SELECT warehouse_id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'PURCHASE_RECEIPT'`, [inv1.id]);
    assert(rcptTx.rows.length === 1 && rcptTx.rows[0]?.warehouse_id === wh2.id, 'TEST1: receipt movement in WH2 (not default)');
    const stWh2 = await InventoryService.getItemStock(item.id, wh2.id);
    assert(eq(stWh2.currentStock, 10) && eq(stWh2.stockValue, 50000), 'TEST1b: WH2 holds 10 units / 50,000');

    // ----------------------------------------------------
    // TEST 2: split-cost sale — the 200.03 gap is gone
    // ----------------------------------------------------
    console.log('\n--- TEST 2: split-state sale keeps warehouse COGS ---');
    // Build split state on a second item for exact arithmetic.
    const itemB = await InventoryService.createItem({ sku: `SKU-95B-${S}`, name: 'صنف 9.5-B', purchasePrice: 10000, salePrice: 20000 });
    const invB1 = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, warehouseId: wh1.id, quantity: 3, unitPrice: 10000, discount: 1, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(invB1.id);
    await InventoryService.createStockTransfer({ fromWarehouseId: wh1.id, toWarehouseId: wh2.id, transferDate: D2, lines: [{ itemId: itemB.id, quantity: 1 }] });
    const invB2 = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D2,
      lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, warehouseId: wh1.id, quantity: 2, unitPrice: 12000, discount: 0, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(invB2.id);
    const whAvg = (await InventoryService.getItemStock(itemB.id, wh1.id)).averageCost;
    const glAvg = (await InventoryService.getItemStock(itemB.id)).averageCost;
    assert(Math.abs(whAvg - glAvg) > 1, `TEST2 precondition: split averages differ (wh ${whAvg} vs global ${glAvg})`);
    const sinv = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D3,
      lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, warehouseId: wh1.id, quantity: 1, unitPrice: 20000, discount: 0, tax: 1000 }],
    });
    await SalesService.postSalesInvoice(sinv.id);
    const issueTx = await db.query<any>(`
      SELECT id, warehouse_id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'SALES_ISSUE'`, [sinv.id]);
    assert(issueTx.rows.length === 1 && issueTx.rows[0]?.warehouse_id === wh1.id, 'TEST2: SALES_ISSUE issued from WH1 (selling warehouse)');
    const issueVal = await db.query<any>(`SELECT unit_cost FROM inventory.stock_transaction_lines WHERE transaction_id = $1`, [issueTx.rows[0]?.id]);
    assert(eq(parseFloat(issueVal.rows[0]?.unit_cost), whAvg), `TEST2b: movement at WH1 average ${whAvg} (not global ${glAvg})`);
    const sinvFull = await SalesService.getInvoiceById(sinv.id);
    const cogsJE = await db.query<any>(`
      SELECT je.id FROM accounting.journal_entries je
      WHERE je.description LIKE '%COGS%' AND je.description LIKE $1 AND je.status = 'POSTED' ORDER BY je.created_at DESC LIMIT 1`,
      [`%${sinvFull.invoice_number}%`]);
    assert(cogsJE.rows.length === 1, 'TEST2c: COGS journal exists');
    assert(await jeBalanced(cogsJE.rows[0]?.id), 'TEST2d: COGS journal balanced');
    const cogsLines = await jeLinesByCode(cogsJE.rows[0]?.id);
    const cogsCredit = cogsLines.find((l) => l.credit > 0)?.credit || 0;
    assert(eq(cogsCredit, whAvg), 'TEST2e: COGS credit equals WH1 average (unified movement + journal)');
    const rec2 = await InventoryService.getInventoryReconciliation();
    assert(rec2.status === 'RECONCILED', `TEST2f: reconciled after split-state sale (diff ${rec2.difference}) — the 200.03 class is gone`);

    // ----------------------------------------------------
    // TEST 3: one invoice, two warehouses — two movements, one COGS JE
    // ----------------------------------------------------
    console.log('\n--- TEST 3: multi-warehouse sale ---');
    const sinv2 = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D3,
      lines: [
        { itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, warehouseId: wh1.id, quantity: 1, unitPrice: 20000, discount: 0, tax: 1000 },
        { itemId: item.id, itemCode: item.sku, description: item.name, warehouseId: wh2.id, quantity: 2, unitPrice: 20000, discount: 0, tax: 2000 },
      ],
    });
    await SalesService.postSalesInvoice(sinv2.id);
    const multiTx = await db.query<any>(`
      SELECT warehouse_id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'SALES_ISSUE' ORDER BY warehouse_id`, [sinv2.id]);
    assert(multiTx.rows.length === 2, `TEST3: two SALES_ISSUE movements (got ${multiTx.rows.length})`);
    const whSet = new Set(multiTx.rows.map((r: any) => r.warehouse_id));
    assert(whSet.has(wh1.id) && whSet.has(wh2.id), 'TEST3b: one movement per selling warehouse');
    const sinv2Full = await SalesService.getInvoiceById(sinv2.id);
    const cogs2 = await db.query<any>(`
      SELECT je.id FROM accounting.journal_entries je
      WHERE je.description LIKE '%COGS%' AND je.description LIKE $1 AND je.status = 'POSTED' ORDER BY je.created_at DESC LIMIT 1`,
      [`%${sinv2Full.invoice_number}%`]);
    assert(cogs2.rows.length === 1 && await jeBalanced(cogs2.rows[0]?.id), 'TEST3c: single balanced COGS journal for the invoice');

    // ----------------------------------------------------
    // TEST 4: sales return to the sale warehouse + invoice void
    // ----------------------------------------------------
    console.log('\n--- TEST 4: return + reversal keep warehouse/value ---');
    const preStock = await InventoryService.getItemStock(itemB.id, wh1.id);
    const srRes = await fetch(`http://127.0.0.1:${port}/api/sales/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id, originalInvoiceId: sinv.id, returnDate: D4,
        lines: [{ itemId: itemB.id, itemCode: itemB.sku, description: itemB.name, warehouseId: wh1.id, quantity: 1, unitPrice: 20000, tax: 1000 }],
      }),
    });
    assert(srRes.status === 201, `TEST4: sales return accepted (got ${srRes.status})`);
    const srBody: any = await srRes.json();
    const retInTx = await db.query<any>(`SELECT warehouse_id FROM inventory.stock_transactions WHERE reference_id = $1 AND transaction_type = 'RETURN_IN'`, [srBody.salesReturn.id]);
    assert(retInTx.rows.length >= 1 && retInTx.rows.every((r: any) => r.warehouse_id === wh1.id), 'TEST4b: RETURN_IN landed in WH1 (sale warehouse)');
    const retRow = await db.query<any>('SELECT * FROM sales.sales_returns WHERE id = $1', [srBody.salesReturn.id]);
    assert(await jeBalanced(retRow.rows[0].journal_entry_id), 'TEST4c: return journal balanced');
    const voidRes = await SalesService.voidSalesInvoice(sinv.id);
    assert(voidRes.success === true, 'TEST4d: sale voided');
    const voidedInv = await SalesService.getInvoiceById(sinv.id);
    assert(voidedInv.status === 'VOIDED', 'TEST4e: invoice VOIDED');
    const postVoid = await InventoryService.getItemStock(itemB.id, wh1.id);
    // Return restored one unit; void reverses only the sales journal (JE-only
    // by design), so stock ends one unit above the pre-return level.
    assert(eq(postVoid.currentStock, preStock.currentStock + 1), `TEST4f: WH1 stock = pre-return + 1 after return + void (got ${postVoid.currentStock})`);
    const rec4 = await InventoryService.getInventoryReconciliation();
    assert(rec4.status === 'RECONCILED', `TEST4g: reconciled after return + void (diff ${rec4.difference})`);

    // ----------------------------------------------------
    // TEST 5: replay + reconciliation per warehouse and global
    // ----------------------------------------------------
    console.log('\n--- TEST 5: per-warehouse replay ---');
    const rec5 = await InventoryService.getInventoryReconciliation();
    assert(Array.isArray(rec5.warehouses) && rec5.warehouses.length >= 2, 'TEST5: per-warehouse breakdown present');
    const whSum = rec5.warehouses.reduce((s: number, w: any) => s + w.value, 0);
    assert(eq(whSum, rec5.subledgerValue), `TEST5b: warehouse values sum to subledger (${whSum} vs ${rec5.subledgerValue})`);
    const w1entry = rec5.warehouses.find((w: any) => w.warehouseId === wh1.id) as any;
    assert(!!w1entry, 'TEST5: WH1 entry present in breakdown');
    const w1direct = await InventoryService.getItemStock(itemB.id, wh1.id);
    const w1all = await (async () => {
      let q = 0; let v = 0;
      for (const it of [item, itemB]) {
        const m = await InventoryService.getItemStock(it.id, wh1.id);
        q += m.currentStock; v += m.stockValue;
      }
      return { q, v };
    })();
    assert(eq(w1entry.value, w1all.v) && eq(w1entry.quantity, w1all.q), 'TEST5c: WH1 breakdown matches direct replay');
    assert(eq(w1direct.currentStock, (await InventoryService.getItemStock(itemB.id, wh1.id)).currentStock), 'TEST5d: scoped replay deterministic');
    assert(rec5.status === 'RECONCILED', `TEST5e: global reconciliation green (diff ${rec5.difference})`);

    // ----------------------------------------------------
    // TEST 6: historical policies replay unchanged
    // ----------------------------------------------------
    console.log('\n--- TEST 6: historical policies ---');
    // item holds stock only in WH2 here (receipt TEST1, sale TEST3) — probe there.
    const legWh2Avg = (await InventoryService.getItemStock(item.id, wh2.id)).averageCost;
    const legOut = await InventoryService.createStockTransaction({
      transactionType: 'TRANSFER_OUT', transactionDate: D5, warehouseId: wh2.id,
      notes: 'legacy probe', lines: [{ itemId: item.id, quantity: 1 }],
    });
    const legPol = await db.query<any>('SELECT valuation_policy FROM inventory.stock_transactions WHERE id = $1', [legOut.id]);
    assert(legPol.rows[0]?.valuation_policy === 'WAC', 'TEST6: unflagged legs stay WAC (legacy semantics)');
    await InventoryService.createStockTransaction({
      transactionType: 'TRANSFER_IN', transactionDate: D5, warehouseId: wh1.id,
      notes: 'legacy probe', lines: [{ itemId: item.id, quantity: 1, unitCost: legWh2Avg }],
    });
    const led6 = await InventoryService.getItemLedger(item.id);
    const st6 = await InventoryService.getItemStock(item.id);
    assert(eq(led6.finalStock, st6.currentStock) && eq(led6.finalValue, st6.stockValue), 'TEST6b: ledger/stock agree over mixed history');

    // ----------------------------------------------------
    // TEST 7: no negative stock, journals balanced
    // ----------------------------------------------------
    console.log('\n--- TEST 7: guards ---');
    const wh2stock = await InventoryService.getItemStock(item.id, wh2.id);
    const badInv = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D5,
      lines: [{ itemId: item.id, itemCode: item.sku, description: item.name, warehouseId: wh2.id, quantity: wh2stock.currentStock + 10, unitPrice: 20000, discount: 0, tax: 0 }],
    });
    let threw = false;
    try {
      await SalesService.postSalesInvoice(badInv.id);
    } catch {
      threw = true;
    }
    assert(threw, 'TEST7: oversell from WH2 rejected');
    const negScan = await db.query<any>(`
      SELECT COUNT(*) AS c FROM inventory.stock_transaction_lines l
      JOIN inventory.stock_transactions t ON t.id = l.transaction_id
      WHERE l.quantity <= 0 AND t.status = 'POSTED'`);
    assert(parseInt(negScan.rows[0]?.c, 10) === 0, 'TEST7b: no non-positive posted movement quantities');
    const unbalScan = await db.query<any>(`
      SELECT je.id FROM accounting.journal_entries je
      WHERE je.status = 'POSTED' AND (
        SELECT COALESCE(SUM(debit), 0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id
      ) <> (
        SELECT COALESCE(SUM(credit), 0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id
      )`);
    assert(unbalScan.rows.length === 0, 'TEST7c: no unbalanced posted journals');
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 9.5.1 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase95Tests().catch((e) => {
  console.error('PHASE 9.5.1 SUITE CRASH:', e);
  process.exitCode = 1;
});
