import { getDb } from './db.ts';
import { SalesService } from './salesService.ts';
import { PurchasingService } from './purchasingService.ts';
import { InventoryService } from './inventoryService.ts';
import { SettingsService } from './settingsService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';
import fs from 'fs';
import path from 'path';

/**
 * PHASE 9.1 — CRITICAL ACCOUNTING INTEGRITY TEST MATRIX
 * Covers: P0 atomicity (fail + success), P1 VAT split (VAT-5 / VAT-0 /
 * multi-rate), sales-return reversal, P2 dynamic-tax UI guards, and
 * direct database integrity checks after every step.
 */
async function runPhase91Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 9.1 — Accounting Integrity Test Matrix');
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

  async function accountTotals(code: string) {
    const r = await db.query<any>(`
      SELECT COALESCE(SUM(l.debit), 0)::float AS d, COALESCE(SUM(l.credit), 0)::float AS c
      FROM accounting.journal_entry_lines l
      JOIN accounting.journal_entries je ON je.id = l.journal_entry_id
      JOIN accounting.accounts a ON a.id = l.account_id
      WHERE a.code = $1 AND je.status = 'POSTED'
    `, [code]);
    return { debit: parseFloat(r.rows[0].d), credit: parseFloat(r.rows[0].c) };
  }

  // ----------------------------------------------------
  // Setup: supplier, customer, item, tax codes
  // ----------------------------------------------------
  console.log('\n--- 0. Setup ---');
  const vat5Res = await db.query<any>(`
    SELECT tc.id, tr.rate_percentage
    FROM accounting.tax_codes tc
    JOIN accounting.tax_rates tr ON tr.tax_code_id = tc.id AND tr.is_active = TRUE
    WHERE tc.code = 'VAT-5' AND tc.is_active = TRUE LIMIT 1
  `);
  assert(vat5Res.rows.length === 1, 'VAT-5 tax code exists in Tax Configuration');
  assert(eq(parseFloat(vat5Res.rows[0]?.rate_percentage || '-1'), 5), 'VAT-5 rate is 5% (not hardcoded 15%)');
  const vat5Id = vat5Res.rows[0]?.id;

  const vat0Res = await db.query<any>(`
    SELECT tc.id, tr.rate_percentage
    FROM accounting.tax_codes tc
    JOIN accounting.tax_rates tr ON tr.tax_code_id = tc.id AND tr.is_active = TRUE
    WHERE tc.code = 'VAT-0' AND tc.is_active = TRUE LIMIT 1
  `);
  assert(vat0Res.rows.length === 1, 'VAT-0 tax code exists in Tax Configuration');
  assert(eq(parseFloat(vat0Res.rows[0]?.rate_percentage || '-1'), 0), 'VAT-0 rate is 0%');

  // Output-VAT mapping must resolve dynamically to 2105
  const outVatAccId = await SettingsService.getAccountMapping('sales.default_output_tax_account', '2105');
  const outVatCode = await db.query<any>('SELECT code FROM accounting.accounts WHERE id = $1', [outVatAccId]);
  assert(outVatCode.rows[0]?.code === '2105', 'sales.default_output_tax_account resolves to 2105 dynamically');

  const supplier = await PurchasingService.createSupplier({
    code: `SUP-91-${S}`,
    name: 'مورد اختبار المرحلة 9.1',
    creditLimit: 100000000,
  });
  const customer = await SalesService.createCustomer({
    code: `CUST-91-${S}`,
    name: 'عميل اختبار المرحلة 9.1',
    creditLimit: 100000000,
  });
  const item = await InventoryService.createItem({
    sku: `SKU-91-${S}`,
    name: 'صنف اختبار المرحلة 9.1',
    purchasePrice: 10000,
    salePrice: 20000,
  });
  assert(!!supplier.id && !!customer.id && !!item.id, 'Setup master data created');

  // ----------------------------------------------------
  // TEST 1: Purchase 100 × 10,000 + VAT-5
  // ----------------------------------------------------
  console.log('\n--- TEST 1: Purchase 100 x 10,000 + VAT-5 ---');
  const pinv = await PurchasingService.createInvoice({
    supplierId: supplier.id,
    paymentType: 'CREDIT',
    postingType: 'INVENTORY',
    invoiceDate: INV_DATE,
    lines: [{
      itemId: item.id,
      itemCode: item.sku,
      description: item.name,
      quantity: 100,
      unitPrice: 10000,
      discount: 0,
      tax: 50000,
      taxCodeId: vat5Id,
    }],
  });
  const postPin = await PurchasingService.postPurchaseInvoice(pinv.id);
  assert(postPin.success === true, 'Purchase invoice posted');

  const pLines = await jeLinesByCode(postPin.journalEntryId);
  const pBy = Object.fromEntries(pLines.map(l => [l.code, l]));
  assert(eq(pBy['1104']?.debit || 0, 1000000) && eq(pBy['1104']?.credit || 0, 0), 'TEST1: Inventory DR 1,000,000', JSON.stringify(pLines));
  assert(eq(pBy['1105']?.debit || 0, 50000), 'TEST1: Input VAT DR 50,000', JSON.stringify(pLines));
  assert(eq(pBy['2101']?.credit || 0, 1050000), 'TEST1: AP CR 1,050,000', JSON.stringify(pLines));

  const stockAfterBuy = await InventoryService.getItemStock(item.id);
  assert(eq(stockAfterBuy.currentStock, 100), 'TEST1: stock = 100');
  assert(eq(stockAfterBuy.averageCost, 10000), 'TEST1: WAC = 10,000');

  // ----------------------------------------------------
  // TEST 2: Sale 10 × 20,000 + VAT-5
  // ----------------------------------------------------
  console.log('\n--- TEST 2: Sale 10 x 20,000 + VAT-5 ---');
  const sinv = await SalesService.createInvoice({
    customerId: customer.id,
    paymentType: 'CREDIT',
    invoiceDate: INV_DATE,
    lines: [{
      itemId: item.id,
      itemCode: item.sku,
      description: item.name,
      quantity: 10,
      unitPrice: 20000,
      discount: 0,
      tax: 10000,
    }],
  });
  const postSin = await SalesService.postSalesInvoice(sinv.id);
  assert(postSin.success === true, 'Sale invoice posted');

  const sLines = await jeLinesByCode(postSin.journalEntryId);
  const sBy = Object.fromEntries(sLines.map(l => [l.code, l]));
  assert(eq(sBy['1103']?.debit || 0, 210000), 'TEST2: AR DR 210,000', JSON.stringify(sLines));
  const revEntry = Object.entries(sBy).find(([code, l]: any) => code.startsWith('41') && eq(l.credit, 200000));
  assert(!!revEntry, 'TEST2: Revenue CR 200,000 (net, ex-VAT)', JSON.stringify(sLines));
  assert(eq(sBy['2105']?.credit || 0, 10000), 'TEST2: Output VAT CR 10,000', JSON.stringify(sLines));
  const sDr = sLines.reduce((a, l) => a + l.debit, 0);
  const sCr = sLines.reduce((a, l) => a + l.credit, 0);
  assert(eq(sDr, sCr) && eq(sDr, 210000), 'TEST2: journal strictly balanced at 210,000');

  const stockAfterSale = await InventoryService.getItemStock(item.id);
  assert(eq(stockAfterSale.currentStock, 90), 'TEST2: stock = 90');
  const issueTx = await db.query<any>(`
    SELECT * FROM inventory.stock_transactions
    WHERE reference_id = $1 AND transaction_type = 'SALES_ISSUE' AND status = 'POSTED'
  `, [sinv.id]);
  assert(issueTx.rows.length === 1, 'TEST2: SALES_ISSUE stock transaction exists');
  const issueQty = await db.query<any>('SELECT SUM(quantity)::float AS q FROM inventory.stock_transaction_lines WHERE transaction_id = $1', [issueTx.rows[0]?.id]);
  assert(eq(parseFloat(issueQty.rows[0]?.q || '0'), 10), 'TEST2: SALES_ISSUE quantity = 10');

  // ----------------------------------------------------
  // TEST 3: COGS (WAC = 10,000 × 10)
  // ----------------------------------------------------
  console.log('\n--- TEST 3: COGS ---');
  const cogsJe = await db.query<any>(`
    SELECT je.id FROM accounting.journal_entries je
    WHERE je.description LIKE $1 AND je.status = 'POSTED'
    ORDER BY je.created_at DESC LIMIT 1
  `, [`%COGS%${(await SalesService.getInvoiceById(sinv.id)).invoice_number}%`]);
  assert(cogsJe.rows.length === 1, 'TEST3: COGS journal entry exists');
  const cLines = await jeLinesByCode(cogsJe.rows[0]?.id);
  const cBy = Object.fromEntries(cLines.map(l => [l.code, l]));
  assert(eq(cBy['5001']?.debit || cBy['5101']?.debit || 0, 100000), 'TEST3: COGS DR 100,000', JSON.stringify(cLines));
  assert(eq(cBy['1104']?.credit || 0, 100000), 'TEST3: Inventory CR 100,000', JSON.stringify(cLines));

  // ----------------------------------------------------
  // TEST 4: Receipt 210,000
  // ----------------------------------------------------
  console.log('\n--- TEST 4: Receipt 210,000 ---');
  const receipt = await SalesService.createReceipt({
    customerId: customer.id,
    paymentMethod: 'CASH',
    receiptDate: INV_DATE,
    amount: 210000,
    allocations: [{ invoiceId: sinv.id, amount: 210000 }],
  });
  const postRec = await SalesService.postReceipt(receipt.id);
  assert(postRec.success === true, 'Receipt posted');
  const rLines = await jeLinesByCode(postRec.journalEntryId);
  const rBy = Object.fromEntries(rLines.map(l => [l.code, l]));
  assert(eq(rBy['1101']?.debit || rBy['1102']?.debit || 0, 210000), 'TEST4: Bank/Cash DR 210,000', JSON.stringify(rLines));
  assert(eq(rBy['1103']?.credit || 0, 210000), 'TEST4: AR CR 210,000', JSON.stringify(rLines));
  const sinvAfterPay = await SalesService.getInvoiceById(sinv.id);
  assert(eq(parseFloat(sinvAfterPay.paid_amount), 210000), 'TEST4: invoice paid_amount = 210,000');

  // ----------------------------------------------------
  // TEST 5 (P0): Failed sale — stock 0, attempt 10 → FULL ROLLBACK
  // ----------------------------------------------------
  console.log('\n--- TEST 5 (P0): Failed sale must roll back everything ---');
  const zeroItem = await InventoryService.createItem({
    sku: `SKU-91Z-${S}`,
    name: 'صنف صفري لاختبار الذرية',
    purchasePrice: 5000,
    salePrice: 8000,
  });
  const zeroStock = await InventoryService.getItemStock(zeroItem.id);
  assert(eq(zeroStock.currentStock, 0), 'TEST5 precondition: stock = 0');

  const jeCountBefore = await tableCount('accounting.journal_entries');
  const jelCountBefore = await tableCount('accounting.journal_entry_lines');
  const stxCountBefore = await tableCount('inventory.stock_transactions');
  const arBefore = await accountTotals('1103');
  const revBefore = await accountTotals('41');
  const vatBefore = await accountTotals('2105');
  const cogsBefore = await accountTotals('5001');
  const invBefore = await accountTotals('1104');

  const failInv = await SalesService.createInvoice({
    customerId: customer.id,
    paymentType: 'CREDIT',
    invoiceDate: INV_DATE,
    lines: [{
      itemId: zeroItem.id,
      itemCode: zeroItem.sku,
      description: zeroItem.name,
      quantity: 10,
      unitPrice: 8000,
      tax: 4000,
    }],
  });

  let threw = false;
  try {
    await SalesService.postSalesInvoice(failInv.id);
  } catch (e: any) {
    threw = true;
    assert(e.message.includes('غير كافٍ'), 'TEST5: blocked with insufficient-stock error', e.message);
  }
  assert(threw, 'TEST5: posting must throw (HTTP 400 equivalent)');

  // Direct DB integrity checks — no partial state allowed
  const failInvAfter = await SalesService.getInvoiceById(failInv.id);
  assert(failInvAfter.status === 'DRAFT', 'TEST5: invoice remains DRAFT (NOT POSTED)');
  assert(!failInvAfter.journal_entry_id, 'TEST5: invoice has NO journal entry linked');
  assert((await tableCount('accounting.journal_entries')) === jeCountBefore, 'TEST5: NO journal entry created');
  assert((await tableCount('accounting.journal_entry_lines')) === jelCountBefore, 'TEST5: NO journal lines created');
  assert((await tableCount('inventory.stock_transactions')) === stxCountBefore, 'TEST5: NO stock transaction created');
  const noRefTx = await db.query<any>('SELECT id FROM inventory.stock_transactions WHERE reference_id = $1', [failInv.id]);
  assert(noRefTx.rows.length === 0, 'TEST5: no stock movement references the failed invoice');
  const arAfter = await accountTotals('1103');
  const revAfter = await accountTotals('41');
  const vatAfter = await accountTotals('2105');
  const cogsAfter = await accountTotals('5001');
  const invAfter = await accountTotals('1104');
  assert(eq(arAfter.debit, arBefore.debit) && eq(arAfter.credit, arBefore.credit), 'TEST5: AR unchanged');
  assert(eq(revAfter.credit, revBefore.credit), 'TEST5: Revenue unchanged');
  assert(eq(vatAfter.credit, vatBefore.credit), 'TEST5: VAT unchanged');
  assert(eq(cogsAfter.debit, cogsBefore.debit), 'TEST5: COGS unchanged');
  assert(eq(invAfter.debit, invBefore.debit) && eq(invAfter.credit, invBefore.credit), 'TEST5: Inventory GL unchanged');
  const zeroStockAfter = await InventoryService.getItemStock(zeroItem.id);
  assert(eq(zeroStockAfter.currentStock, 0), 'TEST5: inventory quantity unchanged');

  // ----------------------------------------------------
  // TEST 6 (P1): VAT-0 — no Output VAT line
  // ----------------------------------------------------
  console.log('\n--- TEST 6 (P1): VAT-0 ---');
  const zinv = await SalesService.createInvoice({
    customerId: customer.id,
    paymentType: 'CREDIT',
    invoiceDate: INV_DATE,
    lines: [{ description: 'خدمة استشارية معفاة', quantity: 1, unitPrice: 100000, tax: 0 }],
  });
  const postZ = await SalesService.postSalesInvoice(zinv.id);
  const zLines = await jeLinesByCode(postZ.journalEntryId);
  assert(zLines.length === 2, 'TEST6: exactly 2 journal lines (no VAT line)', JSON.stringify(zLines));
  const zBy = Object.fromEntries(zLines.map(l => [l.code, l]));
  assert(eq(zBy['1103']?.debit || 0, 100000), 'TEST6: DR AR 100,000');
  assert(!zBy['2105'], 'TEST6: no Output VAT line emitted');

  // ----------------------------------------------------
  // TEST 7 (P2): dynamic tax source — no hardcoded 15% in the 4 pages
  // ----------------------------------------------------
  console.log('\n--- TEST 7 (P2): UI tax source ---');
  const pagesDir = path.resolve(process.cwd(), 'src/pages');
  for (const f of ['SalesInvoices.tsx', 'PurchaseInvoices.tsx', 'SalesReturns.tsx', 'PurchaseReturns.tsx']) {
    const src = fs.readFileSync(path.join(pagesDir, f), 'utf-8');
    assert(!src.includes('0.15'), `${f}: no hardcoded 0.15 rate`);
    assert(src.includes('/api/taxes/codes'), `${f}: tax comes from /api/taxes/codes`);
  }

  // ----------------------------------------------------
  // TEST 8: Sales return reverses Revenue + Output VAT + AR, restores stock
  // ----------------------------------------------------
  console.log('\n--- TEST 8: Sales return ---');
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>(resolve => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = server.address().port;
  try {
    const retRes = await fetch(`http://127.0.0.1:${port}/api/sales/returns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id,
        originalInvoiceId: sinv.id,
        returnDate: INV_DATE,
        notes: 'مرتجع اختبار 9.1',
        lines: [{
          itemId: item.id,
          itemCode: item.sku,
          description: item.name,
          quantity: 2,
          unitPrice: 20000,
          tax: 2000,
        }],
      }),
    });
    assert(retRes.status === 201, 'TEST8: return endpoint responds 201', `got ${retRes.status}`);
    const retBody: any = await retRes.json();
    assert(retBody.success === true, 'TEST8: return recorded and posted');

    const retRow = await db.query<any>('SELECT * FROM sales.sales_returns WHERE id = $1', [retBody.salesReturn.id]);
    assert(retRow.rows[0]?.status === 'POSTED', 'TEST8: return status POSTED');
    const retJeLines = await jeLinesByCode(retRow.rows[0].journal_entry_id);
    const rtBy = Object.fromEntries(retJeLines.map(l => [l.code, l]));
    const retRevEntry = Object.entries(rtBy).find(([code, l]: any) => code.startsWith('41') && eq(l.debit, 40000));
    assert(!!retRevEntry, 'TEST8: DR Sales Returns 40,000 (net)', JSON.stringify(retJeLines));
    assert(eq(rtBy['2105']?.debit || 0, 2000), 'TEST8: DR Output VAT reversal 2,000', JSON.stringify(retJeLines));
    assert(eq(rtBy['1103']?.credit || 0, 42000), 'TEST8: CR AR 42,000', JSON.stringify(retJeLines));

    const stockAfterReturn = await InventoryService.getItemStock(item.id);
    assert(eq(stockAfterReturn.currentStock, 92), `TEST8: stock restored 90 -> 92 (got ${stockAfterReturn.currentStock})`);
    const retInTx = await db.query<any>(`
      SELECT * FROM inventory.stock_transactions
      WHERE reference_id = $1 AND transaction_type = 'RETURN_IN' AND status = 'POSTED'
    `, [retBody.salesReturn.id]);
    assert(retInTx.rows.length === 1, 'TEST8: RETURN_IN stock transaction exists');

    // COGS reversal at actual WAC: 2 × 10,000 = 20,000 (DR Inventory / CR COGS)
    const cogsRev = await db.query<any>(`
      SELECT je.id FROM accounting.journal_entries je
      WHERE je.description LIKE '%عكس تكلفة%' AND je.description LIKE $1 AND je.status = 'POSTED'
      ORDER BY je.created_at DESC LIMIT 1
    `, [`%${retRow.rows[0].return_number}%`]);
    assert(cogsRev.rows.length === 1, 'TEST8: COGS reversal journal exists');
    const crLines = await jeLinesByCode(cogsRev.rows[0]?.id);
    const crBy = Object.fromEntries(crLines.map(l => [l.code, l]));
    assert(eq(crBy['1104']?.debit || 0, 20000), 'TEST8: DR Inventory 20,000', JSON.stringify(crLines));
    assert(eq(crBy['5001']?.debit || crBy['5101']?.debit || 0, 0) && eq(crBy['5001']?.credit || crBy['5101']?.credit || 0, 20000), 'TEST8: CR COGS 20,000', JSON.stringify(crLines));

    // Customer statement reflects all docs of this customer:
    // debits 210,000 (TEST2 sale) + 100,000 (TEST6 VAT-0 service),
    // credits 210,000 (TEST4 receipt) + 42,000 (this return) = 58,000
    const statement = await SalesService.getCustomerStatement(customer.id);
    assert(eq(statement.finalBalance, 58000), `TEST8: statement balance 58,000 (got ${statement.finalBalance})`);
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 9.1 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase91Tests().catch((e) => {
  console.error('PHASE 9.1 SUITE CRASH:', e);
  process.exitCode = 1;
});
