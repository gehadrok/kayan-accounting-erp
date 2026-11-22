import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { SalesService } from './salesService.ts';
import { InventoryService } from './inventoryService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * HOTFIX regression suite — purchase receipt + warehouse selection.
 *
 * Isolated: runs against an in-memory PGlite database created fresh by db.ts
 * (no production data, no persisted files, no destructive operations).
 *
 * Covers every case required by the hotfix brief:
 *   1. INVENTORY invoice qty 10 -> exactly one correct PURCHASE_RECEIPT
 *   2. warehouse balance after receipt == 10
 *   3. sale of 2 from the same warehouse succeeds, leaves 8
 *   4. sale from another warehouse does not consume the first warehouse
 *   5. EXPENSE invoice creates no stock movement
 *   6. posting_type / line-content conflict is rejected with a readable reason
 *   7. deactivated warehouses are neither offered nor accepted
 *   8. receipt + journal + reconciliation agree, and a retry never duplicates
 */
async function runHotfixTests() {
  console.log('========================================================');
  console.log('🛠️  HOTFIX — Purchase Receipt & Warehouse Selection');
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

  const supplier = await PurchasingService.createSupplier({ code: `SUP-HF-${S}`, name: `مورد ${S}`, creditLimit: 1e9 });
  const customer = await SalesService.createCustomer({ code: `CUST-HF-${S}`, name: `عميل ${S}`, creditLimit: 1e9 });

  // Two dedicated warehouses so receipt/issue targets are unambiguous.
  const whA = await InventoryService.createWarehouse({ code: `WH-HFA-${S}`, name: `مستودع أ ${S}` });
  const whB = await InventoryService.createWarehouse({ code: `WH-HFB-${S}`, name: `مستودع ب ${S}` });

  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;

  const receiptMovements = async (invoiceId: string) =>
    db.query<any>(`
      SELECT tx.id, tx.warehouse_id, tx.valuation_policy, l.item_id, l.quantity, l.unit_cost, l.total_cost
      FROM inventory.stock_transactions tx
      JOIN inventory.stock_transaction_lines l ON l.transaction_id = tx.id
      WHERE tx.reference_id = $1 AND tx.reference_type = 'PURCHASE_INVOICE'
        AND tx.transaction_type = 'PURCHASE_RECEIPT'
      ORDER BY tx.created_at ASC, l.line_number ASC`, [invoiceId]);

  try {
    // -----------------------------------------------------------------
    console.log('\n--- 1/2/3. INVENTORY receipt 10 -> balance 10 -> sell 2 -> 8 ---');
    // -----------------------------------------------------------------
    const item1 = await InventoryService.createItem({ sku: `SKU-HF1-${S}`, name: `صنف 1 ${S}`, purchasePrice: 5000, salePrice: 9000 });

    const inv1 = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: item1.id, itemCode: item1.sku, description: item1.name, warehouseId: whA.id, quantity: 10, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    const post1 = await PurchasingService.postPurchaseInvoice(inv1.id);

    const mv1 = await receiptMovements(inv1.id);
    assert(mv1.rows.length === 1, '1. exactly one PURCHASE_RECEIPT movement', `got ${mv1.rows.length}`);
    assert(mv1.rows[0]?.warehouse_id === whA.id, '1b. receipt landed in the DOCUMENT warehouse', String(mv1.rows[0]?.warehouse_id));
    assert(eq(parseFloat(mv1.rows[0]?.quantity), 10), '1c. receipt quantity stored = 10', String(mv1.rows[0]?.quantity));
    assert(mv1.rows[0]?.valuation_policy === 'EXACT_COST', '1d. receipt keeps the EXACT_COST policy (untouched by this hotfix)', String(mv1.rows[0]?.valuation_policy));
    assert((post1 as any).receiptMovements === 1, '1e. posting response reports the receipt count', JSON.stringify((post1 as any).receiptMovements));

    const stA = await InventoryService.getItemStock(item1.id, whA.id);
    assert(eq(stA.currentStock, 10), '2. warehouse balance after receipt = 10', String(stA.currentStock));
    assert(eq(stA.stockValue, 50000), '2b. stock value after receipt = 50,000', String(stA.stockValue));

    const sinv1 = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D2,
      lines: [{ itemId: item1.id, itemCode: item1.sku, description: item1.name, warehouseId: whA.id, quantity: 2, unitPrice: 9000, discount: 0, tax: 0 }],
    });
    let saleErr = '';
    try { await SalesService.postSalesInvoice(sinv1.id); } catch (e: any) { saleErr = e.message; }
    assert(saleErr === '', '3. sale of 2 from the same warehouse is accepted', saleErr);
    const stA2 = await InventoryService.getItemStock(item1.id, whA.id);
    assert(eq(stA2.currentStock, 8), '3b. warehouse balance after selling 2 = 8', String(stA2.currentStock));

    // -----------------------------------------------------------------
    console.log('\n--- 4. sale from ANOTHER warehouse must not consume warehouse A ---');
    // -----------------------------------------------------------------
    const sinv2 = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D2,
      lines: [{ itemId: item1.id, itemCode: item1.sku, description: item1.name, warehouseId: whB.id, quantity: 2, unitPrice: 9000, discount: 0, tax: 0 }],
    });
    let crossErr = '';
    try { await SalesService.postSalesInvoice(sinv2.id); } catch (e: any) { crossErr = e.message; }
    assert(crossErr !== '', '4. cross-warehouse sale is rejected (warehouse B has no stock)', crossErr);
    const stA3 = await InventoryService.getItemStock(item1.id, whA.id);
    const stB3 = await InventoryService.getItemStock(item1.id, whB.id);
    assert(eq(stA3.currentStock, 8), '4b. rejected sale left warehouse A untouched at 8', String(stA3.currentStock));
    assert(eq(stB3.currentStock, 0), '4c. rejected sale left warehouse B at 0', String(stB3.currentStock));

    // -----------------------------------------------------------------
    console.log('\n--- 5. EXPENSE invoice creates NO stock movement ---');
    // -----------------------------------------------------------------
    const item2 = await InventoryService.createItem({ sku: `SKU-HF2-${S}`, name: `صنف 2 ${S}`, purchasePrice: 5000, salePrice: 9000 });
    const invExp = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: D1,
      lines: [{ description: 'خدمة استشارية وصيانة', quantity: 2, unitPrice: 30000, discount: 0, tax: 0 }],
    });
    const expPost = await PurchasingService.postPurchaseInvoice(invExp.id);
    assert((await receiptMovements(invExp.id)).rows.length === 0, '5. EXPENSE (service line) creates no receipt', 'movements found');
    assert(eq((await InventoryService.getItemStock(item2.id)).currentStock, 0), '5b. EXPENSE leaves stock at 0', 'stock moved');
    assert((expPost as any).receiptMovements === 0, '5c. EXPENSE posting reports 0 receipt movements', JSON.stringify((expPost as any).receiptMovements));

    // -----------------------------------------------------------------
    console.log('\n--- 6. posting_type / line-content conflict is REJECTED ---');
    // -----------------------------------------------------------------
    const invConflict = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: D1,
      lines: [{ itemId: item2.id, itemCode: item2.sku, description: item2.name, warehouseId: whA.id, quantity: 10, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    let conflictErr = '';
    try { await PurchasingService.postPurchaseInvoice(invConflict.id); } catch (e: any) { conflictErr = e.message; }
    assert(conflictErr !== '', '6. EXPENSE + stock item is rejected', 'it was accepted');
    assert(conflictErr.includes('تعارض') && conflictErr.includes('استلام'), '6b. rejection message explains the conflict and the missing receipt', conflictErr);
    const conflictInv = await PurchasingService.getInvoiceById(invConflict.id);
    assert(conflictInv.status === 'DRAFT', '6c. rejected invoice stays DRAFT (no partial posting)', conflictInv.status);
    assert((await receiptMovements(invConflict.id)).rows.length === 0, '6d. rejected conflict created no receipt', 'movement found');
    assert(eq((await InventoryService.getItemStock(item2.id)).currentStock, 0), '6e. rejected conflict did not touch stock', 'stock moved');

    // Non-stock item stays postable as EXPENSE (nothing is reclassified).
    const nonStock = await InventoryService.createItem({ sku: `SKU-HFN-${S}`, name: `خدمة مسجلة ${S}`, purchasePrice: 0, salePrice: 0, isStockItem: false });
    const invNonStock = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: D1,
      lines: [{ itemId: nonStock.id, itemCode: nonStock.sku, description: nonStock.name, quantity: 1, unitPrice: 1000, discount: 0, tax: 0 }],
    });
    let nonStockErr = '';
    try { await PurchasingService.postPurchaseInvoice(invNonStock.id); } catch (e: any) { nonStockErr = e.message; }
    assert(nonStockErr === '', '6f. EXPENSE with an explicitly non-stock item is still allowed', nonStockErr);
    assert((await receiptMovements(invNonStock.id)).rows.length === 0, '6g. non-stock EXPENSE still creates no receipt', 'movement found');

    // -----------------------------------------------------------------
    console.log('\n--- 7. deactivated warehouses: not offered, not accepted ---');
    // -----------------------------------------------------------------
    const whOff = await InventoryService.createWarehouse({ code: `WH-HFO-${S}`, name: `مستودع معطل ${S}` });
    await db.query('UPDATE inventory.warehouses SET is_active = FALSE WHERE id = $1', [whOff.id]);

    const listedAll = await fetch(`http://127.0.0.1:${port}/api/inventory/warehouses`).then((r) => r.json()) as any[];
    const listedActive = await fetch(`http://127.0.0.1:${port}/api/inventory/warehouses?activeOnly=true`).then((r) => r.json()) as any[];
    assert(listedAll.some((w) => w.id === whOff.id), '7. master-data listing still includes the deactivated warehouse');
    assert(!listedActive.some((w) => w.id === whOff.id), '7b. activeOnly listing EXCLUDES the deactivated warehouse', 'deactivated warehouse offered');
    assert(listedActive.length === listedAll.length - 1, '7c. exactly one warehouse filtered out', `${listedActive.length} vs ${listedAll.length}`);

    let createErr = '';
    try {
      await PurchasingService.createInvoice({
        supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
        lines: [{ itemId: item2.id, itemCode: item2.sku, description: item2.name, warehouseId: whOff.id, quantity: 1, unitPrice: 5000, discount: 0, tax: 0 }],
      });
    } catch (e: any) { createErr = e.message; }
    assert(createErr !== '', '7d. saving a line against a deactivated warehouse is rejected', 'it was accepted');

    const item3 = await InventoryService.createItem({ sku: `SKU-HF3-${S}`, name: `صنف 3 ${S}`, purchasePrice: 5000, salePrice: 9000 });
    const invOffWh = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: item3.id, itemCode: item3.sku, description: item3.name, warehouseId: whB.id, quantity: 5, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(invOffWh.id);
    // Deactivate AFTER the document exists, then re-check via a forced line.
    await db.query('UPDATE inventory.warehouses SET is_active = FALSE WHERE id = $1', [whB.id]);
    const invOffWh2 = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: item3.id, itemCode: item3.sku, description: item3.name, quantity: 5, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    await db.query(
      'UPDATE purchasing.purchase_invoice_lines SET warehouse_id = $1 WHERE invoice_id = $2',
      [whB.id, invOffWh2.id]
    );
    let postOffErr = '';
    try { await PurchasingService.postPurchaseInvoice(invOffWh2.id); } catch (e: any) { postOffErr = e.message; }
    assert(postOffErr !== '', '7e. posting into a deactivated warehouse is rejected', 'it was accepted');
    assert((await receiptMovements(invOffWh2.id)).rows.length === 0, '7f. rejected posting created no receipt', 'movement found');
    const offInv = await PurchasingService.getInvoiceById(invOffWh2.id);
    assert(offInv.status === 'DRAFT', '7g. invoice pointing at a deactivated warehouse stays DRAFT', offInv.status);
    await db.query('UPDATE inventory.warehouses SET is_active = TRUE WHERE id = $1', [whB.id]);

    // -----------------------------------------------------------------
    console.log('\n--- 8. receipt / journal / reconciliation agree + no duplicates on retry ---');
    // -----------------------------------------------------------------
    const led1 = await InventoryService.getItemLedger(item1.id, whA.id);
    assert(led1.entries.length === 2, '8. ledger holds exactly the receipt and the issue', String(led1.entries.length));
    assert(eq(led1.finalStock, 8), '8b. ledger final stock = 8', String(led1.finalStock));
    assert(eq(led1.finalStock, (await InventoryService.getItemStock(item1.id, whA.id)).currentStock), '8c. ledger and stock service agree');

    const invFull = await PurchasingService.getInvoiceById(inv1.id);
    const jeRes = await db.query<any>(`
      SELECT je.id,
        (SELECT COALESCE(SUM(debit),0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id) AS dr,
        (SELECT COALESCE(SUM(credit),0) FROM accounting.journal_entry_lines WHERE journal_entry_id = je.id) AS cr
      FROM accounting.journal_entries je WHERE je.id = $1`, [invFull.journal_entry_id]);
    assert(Math.abs(parseFloat(jeRes.rows[0].dr) - parseFloat(jeRes.rows[0].cr)) < 0.01, '8d. purchase journal balanced', JSON.stringify(jeRes.rows[0]));
    assert(Math.abs(parseFloat(jeRes.rows[0].dr) - 50000) < 0.01, '8e. purchase journal = receipt value (50,000)', String(jeRes.rows[0].dr));

    const rec = await InventoryService.getInventoryReconciliation();
    assert(rec.status === 'RECONCILED', `8f. subledger reconciles against GL (diff ${rec.difference})`, rec.status);

    // Retry must never duplicate the receipt.
    const before = (await receiptMovements(inv1.id)).rows.length;
    let retryErr = '';
    try { await PurchasingService.postPurchaseInvoice(inv1.id); } catch (e: any) { retryErr = e.message; }
    assert(retryErr !== '', '8g. re-posting an already posted invoice is rejected', 'it was accepted');
    assert((await receiptMovements(inv1.id)).rows.length === before, '8h. retry created no duplicate receipt', 'duplicated');
    assert(eq((await InventoryService.getItemStock(item1.id, whA.id)).currentStock, 8), '8i. retry left the balance at 8', 'balance changed');

    // -----------------------------------------------------------------
    console.log('\n--- 9. deterministic default warehouse resolution ---');
    // -----------------------------------------------------------------
    const defA = await InventoryService.getDefaultActiveWarehouse();
    const defB = await InventoryService.getDefaultActiveWarehouse();
    assert(defA === defB && !!defA, '9. default active warehouse resolution is stable', `${defA} vs ${defB}`);
    const listedFirst = (await fetch(`http://127.0.0.1:${port}/api/inventory/warehouses?activeOnly=true`).then((r) => r.json()) as any[])[0];
    assert(defA === listedFirst.id, '9b. server default equals the first ACTIVE warehouse the UI offers', `${defA} vs ${listedFirst?.id}`);

    // A purchase without a warehouse must still be received where sales looks.
    const item4 = await InventoryService.createItem({ sku: `SKU-HF4-${S}`, name: `صنف 4 ${S}`, purchasePrice: 5000, salePrice: 9000 });
    const invNoWh = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: D1,
      lines: [{ itemId: item4.id, itemCode: item4.sku, description: item4.name, quantity: 4, unitPrice: 5000, discount: 0, tax: 0 }],
    });
    await PurchasingService.postPurchaseInvoice(invNoWh.id);
    const mvNoWh = await receiptMovements(invNoWh.id);
    assert(mvNoWh.rows[0]?.warehouse_id === defA, '9c. warehouse-less receipt lands in the shared default', String(mvNoWh.rows[0]?.warehouse_id));
    const sinvNoWh = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: D2,
      lines: [{ itemId: item4.id, itemCode: item4.sku, description: item4.name, quantity: 1, unitPrice: 9000, discount: 0, tax: 0 }],
    });
    let noWhSaleErr = '';
    try { await SalesService.postSalesInvoice(sinvNoWh.id); } catch (e: any) { noWhSaleErr = e.message; }
    assert(noWhSaleErr === '', '9d. a warehouse-less sale from the same default is accepted', noWhSaleErr);

    const recFinal = await InventoryService.getInventoryReconciliation();
    assert(recFinal.status === 'RECONCILED', `9e. still reconciled at the end (diff ${recFinal.difference})`, recFinal.status);
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 HOTFIX Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runHotfixTests().catch((e) => {
  console.error('HOTFIX SUITE CRASH:', e);
  process.exitCode = 1;
});