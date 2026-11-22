import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { InventoryService } from './inventoryService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * PHASE 10.2 — Accounts Payable Returns Completeness & Subledger Integrity
 *
 * The purchase-return leg was already added to the supplier statement and to
 * `outstandingBalance`, but the rest of the AP surface was never brought along:
 *
 *  - getAccountsPayableAging  built its buckets straight off
 *    `invoice.total - invoice.paid_amount` and never looked at
 *    purchase_returns at all, so a posted return left the aging schedule
 *    showing money the supplier no longer owed.
 *  - getAPReconciliation compared that same returns-blind subledger against
 *    the GL control account — which DOES carry the return's debit leg — so any
 *    posted return turned a healthy ledger into OUT_OF_BALANCE.
 *  - outstandingBalance netted allocations (via paid_amount) while the
 *    statement netted full posted payment amounts (the figure the payment
 *    journal actually debits), so the two disagreed whenever a payment carried
 *    an unallocated remainder.
 *
 * These tests pin ONE invariant instead: every AP-facing figure must be the
 * same number, derived the same way, for the same scope —
 *
 *     credits (POSTED CREDIT invoices) - debits (POSTED payments + returns)
 *
 * which is exactly what the 2101 control account carries.
 */
async function runPhase102Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 10.2 — AP Returns Completeness Test Matrix');
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
  const S = Date.now().toString().slice(-7);
  const INV_DATE = '2026-10-02';
  const RET_DATE = '2026-10-20';

  // ---------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------

  /** Direct GL read of every payables account the system actually uses. */
  async function glPayablesBalance(): Promise<number> {
    const r = await db.query<any>(`
      SELECT COALESCE(SUM(jl.credit - jl.debit), 0) AS bal
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE je.status IN ('POSTED', 'REVERSED')
        AND (
          a.code = '2101'
          OR a.id IN (SELECT DISTINCT payables_account_id
                      FROM purchasing.suppliers
                      WHERE payables_account_id IS NOT NULL)
        )
    `);
    return parseFloat(r.rows[0]?.bal || '0');
  }

  /** Every supplier card balance, summed — the subledger side of the tie-out. */
  async function sumOfSupplierCards(): Promise<number> {
    const supps = await PurchasingService.getSuppliers();
    return supps.reduce((s, x: any) => s + parseFloat(x.outstandingBalance || '0'), 0);
  }

  async function agingRowFor(supplierId: string): Promise<any> {
    const aging = await PurchasingService.getAccountsPayableAging();
    return aging.suppliers.find((r: any) => r.supplierId === supplierId) as any;
  }

  /** Return the aging figure a supplier is expected to carry, GL-derived. */
  async function expectedApBalance(supplierId: string): Promise<number> {
    const r = await db.query<any>(`
      SELECT
        COALESCE((SELECT SUM(inv.total) FROM purchasing.purchase_invoices inv
                   WHERE inv.supplier_id = $1 AND inv.status = 'POSTED'
                     AND inv.payment_type = 'CREDIT'), 0)
        - COALESCE((SELECT SUM(p.amount) FROM purchasing.payments p
                    WHERE p.supplier_id = $1 AND p.status = 'POSTED'), 0)
        - COALESCE((SELECT SUM(pr.total) FROM purchasing.purchase_returns pr
                    WHERE pr.supplier_id = $1 AND pr.status = 'POSTED'), 0) AS bal
    `, [supplierId]);
    return parseFloat(r.rows[0]?.bal || '0');
  }

  // HTTP surface for the returns endpoint (the return flow lives in the route).
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
    // ---------------------------------------------------------
    // 0. Setup
    // ---------------------------------------------------------
    console.log('\n--- 0. Setup ---');
    const supplier = await PurchasingService.createSupplier({ code: `SUP-102-${S}`, name: 'مورد اختبار 10.2', creditLimit: 100000000 });
    const item = await InventoryService.createItem({ sku: `SKU-102-${S}`, name: 'صنف مخزني 10.2', purchasePrice: 10000, salePrice: 20000 });
    const whId = (await InventoryService.getDefaultActiveWarehouse())!;
    assert(!!supplier.id && !!item.id && !!whId, 'Setup supplier, item and warehouse');

    const invRaw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'INVENTORY', invoiceDate: INV_DATE,
      lines: [{ itemId: item.id, itemCode: item.sku, description: item.name, quantity: 40, unitPrice: 10000, discount: 0, tax: 0, warehouseId: whId }],
    });
    await PurchasingService.postPurchaseInvoice(invRaw.id);
    const inv = await PurchasingService.getInvoiceById(invRaw.id);
    const invLine = inv.lines[0];
    const INV_TOTAL = parseFloat(inv.total);
    assert(eq(INV_TOTAL, 400000), `Credit invoice total 400,000 (got ${INV_TOTAL})`);

    // ---------------------------------------------------------
    // 1. Baseline: the four reports must already agree
    // ---------------------------------------------------------
    console.log('\n--- 1. Baseline agreement across the four AP reports ---');
    const baseCard = parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance);
    const baseStmt = (await PurchasingService.getSupplierStatement(supplier.id)).finalBalance;
    const baseAging = await agingRowFor(supplier.id);
    assert(eq(baseCard, INV_TOTAL), `Card balance = invoice total (got ${baseCard})`);
    assert(eq(baseStmt, baseCard), `Statement closing balance = card balance (stmt ${baseStmt} vs card ${baseCard})`);
    assert(!!baseAging && eq(baseAging.total, INV_TOTAL), `Aging total = card balance (got ${baseAging?.total})`);

    // ---------------------------------------------------------
    // 2. A posted return must land in ALL FOUR reports
    // ---------------------------------------------------------
    console.log('\n--- 2. Posted return lands in card, statement, aging and reconciliation ---');
    const retRes = await postReturn({
      supplierId: supplier.id, originalInvoiceId: inv.id, returnDate: RET_DATE,
      lines: [{ originalLineId: invLine.id, quantity: 10 }],
    });
    assert(retRes.status === 201 && retRes.body.success === true,
      'Return accepted through the real endpoint', `${retRes.status} ${JSON.stringify(retRes.body)}`);

    const retId: string = retRes.body.purchaseReturn.id;
    const retRow = (await db.query<any>('SELECT total FROM purchasing.purchase_returns WHERE id = $1', [retId])).rows[0];
    const RET_TOTAL = parseFloat(retRow.total);
    const expectedAfter = INV_TOTAL - RET_TOTAL;

    const cardAfter = parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance);
    assert(eq(cardAfter, expectedAfter), `Card balance nets the return: ${INV_TOTAL} - ${RET_TOTAL} = ${expectedAfter} (got ${cardAfter})`);

    const stmtAfter = await PurchasingService.getSupplierStatement(supplier.id);
    const retLeg = stmtAfter.items.find((i: any) => i.type === 'RETURN');
    assert(!!retLeg, 'Statement carries the RETURN leg');
    assert(eq(retLeg?.debit ?? 0, RET_TOTAL) && eq(retLeg?.credit ?? 0, 0),
      'RETURN leg is a DEBIT (credit-normal supplier balance)', JSON.stringify(retLeg));
    assert(eq(stmtAfter.finalBalance, expectedAfter),
      `Statement closing balance nets the return (got ${stmtAfter.finalBalance}, expected ${expectedAfter})`);

    const agingAfter = await agingRowFor(supplier.id);
    assert(!!agingAfter && eq(agingAfter.total, expectedAfter),
      `Aging nets the return: expected ${expectedAfter}, got ${agingAfter?.total}`);
    assert(!!agingAfter && eq(agingAfter.current + agingAfter.days1to30 + agingAfter.days31to60 + agingAfter.days61to90 + agingAfter.days90plus, expectedAfter),
      'Aging buckets still sum to the (return-netted) supplier total',
      JSON.stringify(agingAfter));

    const reconAfter = await PurchasingService.getAPReconciliation();
    const glDirect = await glPayablesBalance();
    assert(eq(reconAfter.subledgerBalance, reconAfter.glBalance),
      `Subledger ties to GL after a return (sub ${reconAfter.subledgerBalance} vs gl ${reconAfter.glBalance}, diff ${reconAfter.difference})`);
    assert(reconAfter.status === 'RECONCILED',
      `Reconciliation RECONCILED after a return (got ${reconAfter.status})`);
    assert(eq(reconAfter.glBalance, glDirect),
      `Reported GL balance equals a direct GL read (${reconAfter.glBalance} vs ${glDirect})`);

    // ---------------------------------------------------------
    // 3. No double counting
    // ---------------------------------------------------------
    console.log('\n--- 3. No double counting ---');
    const sumCards = await sumOfSupplierCards();
    assert(eq(sumCards, reconAfter.subledgerBalance),
      `Sum of all supplier cards = subledger (${sumCards} vs ${reconAfter.subledgerBalance})`);
    const agingAll = await PurchasingService.getAccountsPayableAging();
    const bucketSum = agingAll.suppliers.reduce((s: number, r: any) =>
      s + r.current + r.days1to30 + r.days31to60 + r.days61to90 + r.days90plus, 0);
    assert(eq(agingAll.totalPayables, agingAll.suppliers.reduce((s: number, r: any) => s + r.total, 0)),
      'Aging grand total equals the sum of its supplier rows');
    assert(eq(agingAll.totalPayables, reconAfter.subledgerBalance),
      `Aging grand total = subledger (${agingAll.totalPayables} vs ${reconAfter.subledgerBalance})`);
    assert(agingAll.suppliers.filter((r: any) => r.supplierId === supplier.id).length === 1,
      'Each supplier appears exactly once in the aging schedule');
    assert(eq(bucketSum + agingAll.unappliedTotal, agingAll.totalPayables),
      `Aging buckets + unapplied = aging grand total (${bucketSum} + ${agingAll.unappliedTotal} vs ${agingAll.totalPayables})`);

    // A second, separate return of the SAME line must reduce the balance again.
    const ret2 = await postReturn({
      supplierId: supplier.id, originalInvoiceId: inv.id, returnDate: RET_DATE,
      lines: [{ originalLineId: invLine.id, quantity: 5 }],
    });
    assert(ret2.status === 201, 'Second partial return accepted');
    const ret2Total = parseFloat((await db.query<any>('SELECT total FROM purchasing.purchase_returns WHERE id = $1', [ret2.body.purchaseReturn.id])).rows[0].total);
    const expectedAfter2 = expectedAfter - ret2Total;
    assert(eq(parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance), expectedAfter2),
      `Second return reduces the balance again (expected ${expectedAfter2})`);
    assert(eq((await PurchasingService.getSupplierStatement(supplier.id)).finalBalance, expectedAfter2),
      'Statement agrees with the card after two returns');
    assert(eq((await agingRowFor(supplier.id)).total, expectedAfter2),
      `Aging agrees with the card after two returns (expected ${expectedAfter2})`);
    const recon2 = await PurchasingService.getAPReconciliation();
    assert(eq(recon2.subledgerBalance, recon2.glBalance) && recon2.status === 'RECONCILED',
      `Still RECONCILED after two returns (sub ${recon2.subledgerBalance} gl ${recon2.glBalance})`);

    // ---------------------------------------------------------
    // 4. Unallocated payment: card, statement and GL must still agree
    // ---------------------------------------------------------
    console.log('\n--- 4. Unallocated payment does not split the reports ---');
    const beforePay = expectedAfter2;
    const pay = await PurchasingService.createPayment({
      supplierId: supplier.id, paymentMethod: 'CASH', paymentDate: RET_DATE, amount: 50000,
      description: 'دفعة على الحساب (بدون تخصيص)',
    });
    await PurchasingService.postSupplierPayment(pay.id);

    // The payment journal debits payables by the FULL amount, so the subledger
    // must too — netting only the allocated part is what let card and statement
    // drift apart in the first place.
    const expectedAfterPay = beforePay - 50000;
    const cardAfterPay = parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance);
    const stmtAfterPay = (await PurchasingService.getSupplierStatement(supplier.id)).finalBalance;
    assert(eq(cardAfterPay, expectedAfterPay), `Card nets the full unallocated payment (expected ${expectedAfterPay}, got ${cardAfterPay})`);
    assert(eq(stmtAfterPay, cardAfterPay), `Statement closing balance = card balance for an unallocated payment (stmt ${stmtAfterPay} vs card ${cardAfterPay})`);
    assert(eq((await agingRowFor(supplier.id)).total, cardAfterPay),
      `Aging = card balance for an unallocated payment (aging ${(await agingRowFor(supplier.id)).total} vs card ${cardAfterPay})`);
    const recon3 = await PurchasingService.getAPReconciliation();
    assert(eq(recon3.subledgerBalance, recon3.glBalance) && recon3.status === 'RECONCILED',
      `RECONCILED after an unallocated payment (sub ${recon3.subledgerBalance} gl ${recon3.glBalance})`);

    // ---------------------------------------------------------
    // 5. Voided / draft documents must not move any report
    // ---------------------------------------------------------
    console.log('\n--- 5. Draft and voided documents are excluded ---');
    const snapshot = async () => {
      const card = parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance);
      const stmt = (await PurchasingService.getSupplierStatement(supplier.id)).finalBalance;
      const aging = (await agingRowFor(supplier.id)).total;
      const recon = await PurchasingService.getAPReconciliation();
      return { card, stmt, aging, recon };
    };
    const pre = await snapshot();

    const voidInvRaw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CREDIT', postingType: 'EXPENSE', invoiceDate: RET_DATE,
      lines: [{ description: 'فاتورة ملغاة يجب ألا تظهر', quantity: 1, unitPrice: 999999 }],
    });
    await PurchasingService.postPurchaseInvoice(voidInvRaw.id);
    await PurchasingService.reversePurchaseInvoice(voidInvRaw.id);

    // A DRAFT payment must not reduce the balance either.
    const draftPay = await PurchasingService.createPayment({
      supplierId: supplier.id, paymentMethod: 'CASH', paymentDate: RET_DATE, amount: 777777,
      description: 'سند مسودة',
    });
    assert(draftPay.status === 'DRAFT', 'Payment fixture created as DRAFT');

    const post = await snapshot();
    assert(eq(pre.card, post.card) && eq(pre.stmt, post.stmt) && eq(pre.aging, post.aging),
      `VOIDED invoice + DRAFT payment move nothing (${JSON.stringify(pre)} -> ${JSON.stringify(post)})`);
    assert(eq(post.recon.subledgerBalance, post.recon.glBalance) && post.recon.status === 'RECONCILED',
      'Reconciliation unaffected by DRAFT/VOIDED documents');

    // ---------------------------------------------------------
    // 6. Filters: fromDate / toDate / branchId
    // ---------------------------------------------------------
    console.log('\n--- 6. Declared report filters are actually applied ---');
    const full = await PurchasingService.getSupplierStatement(supplier.id);
    assert(eq(full.finalBalance, parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance)),
      'Unfiltered statement equals the card balance');

    // All of this supplier's documents are dated <= RET_DATE, so a toDate of
    // RET_DATE is the full book and anything earlier must exclude the last leg.
    const scopedTo = await PurchasingService.getSupplierStatement(supplier.id, undefined, RET_DATE);
    assert(eq(scopedTo.finalBalance, full.finalBalance),
      `toDate = last document date keeps the same closing balance (${scopedTo.finalBalance} vs ${full.finalBalance})`);

    const scopedEarly = await PurchasingService.getSupplierStatement(supplier.id, undefined, '2026-10-01');
    assert(scopedEarly.items.length === 0,
      `toDate before every document yields an empty statement (got ${scopedEarly.items.length} rows)`);
    assert(eq(scopedEarly.finalBalance, 0), 'toDate before every document yields a zero closing balance');

    // fromDate is INCLUSIVE of that date's own rows and the opening balance
    // carries everything dated strictly earlier — the same contract
    // getCustomerStatement already uses on the sales side.
    const scopedFrom = await PurchasingService.getSupplierStatement(supplier.id, RET_DATE, undefined);
    assert(eq(scopedFrom.openingBalance, INV_TOTAL),
      `fromDate opens at the balance of everything dated earlier (got ${scopedFrom.openingBalance}, expected ${INV_TOTAL})`);
    assert(scopedFrom.items.length === 3,
      `fromDate includes that date's own rows (got ${scopedFrom.items.length})`);
    assert(eq(
      scopedFrom.finalBalance,
      scopedFrom.openingBalance + scopedFrom.totalCredit - scopedFrom.totalDebit,
    ), 'Closing balance = opening + credits - debits (credit-normal supplier)');
    assert(eq(scopedFrom.finalBalance, full.finalBalance),
      `A range covering the whole book still closes at the card balance (${scopedFrom.finalBalance} vs ${full.finalBalance})`);

    // A range strictly after the last document leaves the balance untouched.
    const afterAll = await PurchasingService.getSupplierStatement(supplier.id, '2026-10-25', undefined);
    assert(afterAll.items.length === 0 && eq(afterAll.openingBalance, full.finalBalance) && eq(afterAll.finalBalance, full.finalBalance),
      `A range after every document carries the full balance forward (got ${afterAll.finalBalance}, expected ${full.finalBalance})`);

    const branchRes = await db.query<any>('SELECT id FROM core.branches ORDER BY created_at ASC LIMIT 1');
    const mainBranchId = branchRes.rows[0].id;
    const branchScoped = await PurchasingService.getSupplierStatement(supplier.id, undefined, undefined, mainBranchId);
    assert(eq(branchScoped.finalBalance, full.finalBalance),
      `branchId = the document's own branch keeps the same balance (${branchScoped.finalBalance} vs ${full.finalBalance})`);
    const otherBranch = await db.query<any>('SELECT id FROM core.branches WHERE id <> $1 LIMIT 1', [mainBranchId]);
    if (otherBranch.rows.length > 0) {
      const noneScoped = await PurchasingService.getSupplierStatement(supplier.id, undefined, undefined, otherBranch.rows[0].id);
      assert(noneScoped.items.length === 0,
        `branchId with no documents excludes every row (got ${noneScoped.items.length})`);
      assert(eq(noneScoped.finalBalance, 0), 'branchId with no documents yields a zero closing balance');
    }

    // CASH invoices never touch payables, so they must not appear in the ledger.
    const cashRaw = await PurchasingService.createInvoice({
      supplierId: supplier.id, paymentType: 'CASH', postingType: 'EXPENSE', invoiceDate: RET_DATE,
      lines: [{ description: 'فاتورة نقدية لا تدخل الذمم', quantity: 1, unitPrice: 500000 }],
    });
    await PurchasingService.postPurchaseInvoice(cashRaw.id);
    const cashInv = await PurchasingService.getInvoiceById(cashRaw.id);
    const stmtWithCash = await PurchasingService.getSupplierStatement(supplier.id);
    assert(!stmtWithCash.items.some((i: any) => i.docNumber === cashInv.invoice_number),
      'A CASH purchase invoice never appears in the supplier subledger');
    assert(eq(stmtWithCash.finalBalance, full.finalBalance),
      'A CASH purchase invoice leaves the payable balance unchanged');
    assert(eq(parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance), full.finalBalance),
      'Card balance unchanged by a CASH purchase invoice');

    // A return raised against a CASH invoice has no open payable invoice to age
    // against, yet the return journal still debits payables. The reduction must
    // therefore land somewhere explicit instead of being smeared across the
    // buckets or quietly dropped.
    const cashRet = await postReturn({
      supplierId: supplier.id, originalInvoiceId: cashRaw.id, returnDate: RET_DATE,
      lines: [{ originalLineId: cashInv.lines[0].id, quantity: 1 }],
    });
    assert(cashRet.status === 201, 'A return against a CASH invoice is accepted', `${cashRet.status} ${JSON.stringify(cashRet.body)}`);
    const cashRetTotal = parseFloat((await db.query<any>('SELECT total FROM purchasing.purchase_returns WHERE id = $1', [cashRet.body.purchaseReturn.id])).rows[0].total);
    const afterCashRet = full.finalBalance - cashRetTotal;
    const cashAgingRow = await agingRowFor(supplier.id);
    assert(eq(cashAgingRow.total, afterCashRet),
      `Aging total nets the CASH-invoice return (expected ${afterCashRet}, got ${cashAgingRow.total})`);
    assert(eq(cashAgingRow.unapplied, -cashRetTotal),
      `The unattributable reduction is reported as unapplied, not hidden in a bucket (got ${cashAgingRow.unapplied})`);
    assert(eq(
      cashAgingRow.current + cashAgingRow.days1to30 + cashAgingRow.days31to60 + cashAgingRow.days61to90 + cashAgingRow.days90plus + cashAgingRow.unapplied,
      cashAgingRow.total,
    ), 'Aging row still sums to its own total with the unapplied credit');
    assert(eq((await PurchasingService.getSupplierStatement(supplier.id)).finalBalance, afterCashRet),
      `Statement nets the CASH-invoice return (expected ${afterCashRet})`);
    const reconCash = await PurchasingService.getAPReconciliation();
    assert(eq(reconCash.subledgerBalance, reconCash.glBalance) && reconCash.status === 'RECONCILED',
      `Still RECONCILED after a CASH-invoice return (sub ${reconCash.subledgerBalance} gl ${reconCash.glBalance})`);

    // ---------------------------------------------------------
    // 6b. Purchase summary honours its declared filters too
    // ---------------------------------------------------------
    console.log('\n--- 6b. Purchase summary filters ---');
    const postedTotalIn = async (where: string, params: any[]) =>
      parseFloat((await db.query<any>(
        `SELECT COALESCE(SUM(total), 0) AS t FROM purchasing.purchase_invoices WHERE status = 'POSTED' ${where}`,
        params)).rows[0].t);

    const summaryAll = await PurchasingService.getPurchaseSummary();
    assert(eq(summaryAll.totalPurchases, await postedTotalIn('', [])),
      `Unfiltered purchase summary equals every posted invoice (got ${summaryAll.totalPurchases})`);

    const summaryNarrow = await PurchasingService.getPurchaseSummary({ fromDate: RET_DATE, toDate: RET_DATE });
    assert(eq(summaryNarrow.totalPurchases, await postedTotalIn('AND invoice_date = $1', [RET_DATE])),
      `dateRange scopes the total to that date (got ${summaryNarrow.totalPurchases})`);

    const summaryNoRange = await PurchasingService.getPurchaseSummary({ toDate: '2026-10-01' });
    assert(eq(summaryNoRange.totalPurchases, await postedTotalIn('AND invoice_date <= $1', ['2026-10-01'])),
      'A toDate before the seed data excludes every fixture invoice');

    const summaryOtherBranch = await PurchasingService.getPurchaseSummary({ branchId: '00000000-0000-0000-0000-000000000000' });
    assert(summaryOtherBranch.totalPurchases === 0 && summaryOtherBranch.postedCount === 0,
      `A branch with no invoices yields a zero summary (got ${summaryOtherBranch.totalPurchases})`);

    // ---------------------------------------------------------
    // 7. Final whole-ledger tie-out
    // ---------------------------------------------------------
    console.log('\n--- 7. Final whole-ledger tie-out ---');
    const finalRecon = await PurchasingService.getAPReconciliation();
    const finalGl = await glPayablesBalance();
    assert(eq(finalRecon.subledgerBalance, finalGl), `Final subledger = GL (${finalRecon.subledgerBalance} vs ${finalGl})`);
    assert(finalRecon.status === 'RECONCILED', `Final status RECONCILED (got ${finalRecon.status})`);
    assert(eq(await sumOfSupplierCards(), finalGl), 'Final sum of supplier cards = GL');
    const expectedFinal = await expectedApBalance(supplier.id);
    assert(eq(parseFloat((await PurchasingService.getSupplierById(supplier.id)).outstandingBalance), expectedFinal),
      `Final card balance = credits - payments - returns (${expectedFinal})`);
  } catch (err: any) {
    console.error(err);
    assert(false, 'Phase 10.2 suite aborted', err?.message);
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 10.2 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase102Tests().catch(console.error);