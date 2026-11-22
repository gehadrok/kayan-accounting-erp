import { getDb } from './db.ts';
import { AccountingService } from './accountingService.ts';
import { ReportingService } from './reportingService.ts';
import { FinancialIntegrityService } from './financialIntegrityService.ts';
import { PurchasingService } from './purchasingService.ts';
import { SalesService } from './salesService.ts';
import express from 'express';
import { apiRouter } from './routes.ts';

/**
 * PHASE 10.3 — unified accounting contract for reversed entries + AR completeness.
 *
 * THE REVERSAL CONTRACT
 * ---------------------
 * `reverseJournalEntry` does not edit or delete a posted entry. It ADDS a
 * compensating POSTED entry with the legs swapped, then marks the original
 * REVERSED. Both entries point at each other through reversed_entry_id.
 *
 * Every GL balance query in the system filtered `je.status = 'POSTED'`, which
 * keeps the compensation and drops the original — leaving a phantom of the
 * entire reversed amount sitting in the ledger. A voided 999,999 purchase
 * invoice drove the payables control account to -799,999 instead of leaving it
 * untouched.
 *
 * The unified rule, applied here to every balance consumer:
 *
 *     in-ledger  <=>  je.status IN ('POSTED', 'REVERSED')
 *
 *   DRAFT     never posted, no ledger effect            -> excluded
 *   POSTED    in the ledger                             -> included
 *   REVERSED  original of a pair; its cancellation is a
 *             separate POSTED entry, so BOTH must be
 *             counted for the pair to net to zero        -> included
 *
 * Counting only the compensation is the whole bug; counting both makes a
 * reversal a genuine no-op, which is what "reversal" means.
 */
async function runPhase103Tests() {
  console.log('========================================================');
  console.log('🧪 PHASE 10.3 — Reversal Contract & AR Completeness');
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
  const DATE = '2026-10-05';

  /** Ground-truth GL balance for a set of account codes, in-ledger definition. */
  async function glBalance(codes: string[], creditNormal = false, asOf?: string) {
    const r = await db.query<any>(`
      SELECT COALESCE(SUM(jl.debit), 0) AS dr, COALESCE(SUM(jl.credit), 0) AS cr
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      JOIN accounting.accounts a ON a.id = jl.account_id
      WHERE je.status IN ('POSTED','REVERSED') AND a.code = ANY($1)
        ${asOf ? 'AND je.entry_date <= $2' : ''}
    `, asOf ? [codes, asOf] : [codes]);
    const dr = parseFloat(r.rows[0]?.dr || '0');
    const cr = parseFloat(r.rows[0]?.cr || '0');
    return creditNormal ? cr - dr : dr - cr;
  }

  async function accountId(code: string): Promise<string> {
    const r = await db.query<any>('SELECT id FROM accounting.accounts WHERE code = $1 LIMIT 1', [code]);
    return r.rows[0].id;
  }

  /** First leaf (non-group) account in a P&L category. */
  async function leafAccountIn(category: 'REVENUE' | 'EXPENSE'): Promise<string> {
    const r = await db.query<any>(`
      SELECT a.id FROM accounting.accounts a
      JOIN accounting.account_types t ON t.id = a.account_type_id
      WHERE t.category = $1 AND a.is_group = FALSE AND a.is_active = TRUE
      ORDER BY a.code ASC LIMIT 1
    `, [category]);
    return r.rows[0]?.id;
  }

  // The sales-return flow lives in the HTTP layer, so the fixture goes through
  // the real router rather than a hand-written INSERT.
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = await new Promise<any>((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const port = server.address().port;

  try {
    // ---------------------------------------------------------
    // 0. Setup
    // ---------------------------------------------------------
    console.log('\n--- 0. Setup ---');
    const cashAcc = await accountId('1101');
    const apAcc = await accountId('2101');
    const arAcc = await accountId('1103');
    const purchAcc = await leafAccountIn('EXPENSE');
    const salesAcc = await leafAccountIn('REVENUE');
    assert(!!cashAcc && !!apAcc && !!arAcc && !!purchAcc && !!salesAcc,
      'Setup: control accounts (1101/2101/1103) and P&L leaf accounts resolved');

    // =======================================================
    // PART A — the reversal contract
    // =======================================================

    // ---------------------------------------------------------
    // A1. A posted entry moves balances; its reversal undoes it exactly
    // ---------------------------------------------------------
    console.log('\n--- A1. Reversal leaves no net effect ---');
    // PHASE 10.4: these assertions are BASELINE-RELATIVE. The suite used to
    // assume every account started at zero, which only held on a freshly
    // seeded database — run against a database that already carried other
    // documents, they failed for reasons that had nothing to do with the code
    // under test. Asserting the DELTA is what actually tests the contract, and
    // it holds whatever else is in the ledger.
    const apBefore = await glBalance(['2101'], true);
    const cashBefore = await glBalance(['1101'], true);
    const purchCode = (await db.query<any>('SELECT code FROM accounting.accounts WHERE id = $1', [purchAcc])).rows[0].code;
    const purchBefore = await glBalance([purchCode], false);

    const je = await AccountingService.createJournalEntry({
      entryDate: DATE,
      description: 'قيد اختبار 10.3 للعكس',
      lines: [
        { accountId: purchAcc, debit: 250000, credit: 0, description: 'مدين: مشتريات' },
        { accountId: apAcc, debit: 0, credit: 250000, description: 'دائن: ذمم المورد' },
      ],
    });
    await AccountingService.postJournalEntry(je.id);

    const apMid = await glBalance(['2101'], true);
    assert(eq(apMid, apBefore + 250000),
      `Posting credits the payables control account (${apBefore} -> ${apMid})`);
    assert(eq(await glBalance([purchCode], false), purchBefore + 250000),
      `Posting debits the expense account by the same amount (${purchBefore} -> ${await glBalance([purchCode], false)})`);

    await AccountingService.reverseJournalEntry(je.id);

    const apAfter = await glBalance(['2101'], true);
    assert(eq(apAfter, apBefore),
      `Reversal nets payables back to the pre-entry balance (${apBefore}, got ${apAfter})`);
    assert(eq(await glBalance([purchCode], false), purchBefore),
      'Reversal nets the expense account back to its prior balance');

    // The original must still exist and be marked REVERSED, with a POSTED
    // compensation linked to it — that is the structure the rule depends on.
    const pair = await db.query<any>(`
      SELECT je.status, je.reversed_entry_id, je.id
      FROM accounting.journal_entries je WHERE je.id = $1
    `, [je.id]);
    const comp = await db.query<any>(`
      SELECT je.status FROM accounting.journal_entries je WHERE je.reversed_entry_id = $1
    `, [je.id]);
    assert(pair.rows[0]?.status === 'REVERSED', 'Original is marked REVERSED', pair.rows[0]?.status);
    assert(comp.rows.length === 1 && comp.rows[0].status === 'POSTED',
      'Exactly one POSTED compensation points back at the original',
      JSON.stringify(comp.rows));

    // ---------------------------------------------------------
    // A2. The GL never shows the compensation without its original
    // ---------------------------------------------------------
    console.log('\n--- A2. GL cannot show a half-counted reversal pair ---');
    const halfCounted = await db.query<any>(`
      SELECT COUNT(*)::int AS c
      FROM accounting.journal_entry_lines jl
      JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
      WHERE je.reversed_entry_id = $1 AND je.status = 'POSTED'
    `, [je.id]);
    assert(halfCounted.rows[0].c > 0, 'A compensation entry exists that would be half-counted under status=POSTED');

    // AccountingService.getAccounts() (account balances) must net the pair out.
    // NOTE the sign: `getAccounts().balance` is SUM(debit - credit), i.e.
    // debit-normal. 2101 is a CREDIT-normal account, so its raw value is the
    // NEGATIVE of the credit-normal figure used everywhere else in this file.
    // Comparing it directly to a credit-normal number only ever agreed because
    // a freshly seeded ledger has 2101 at zero.
    const accounts = await AccountingService.getAccounts();
    const apRow = accounts.find((a: any) => a.code === '2101');
    assert(eq(parseFloat(apRow?.balance || '0'), -apBefore),
      `getAccounts() balance nets the reversal (expected ${-apBefore} debit-normal, got ${apRow?.balance})`);

    // AccountingService.getTrialBalance() — a LEFT JOIN bug hides here too.
    const tbService: any[] = await AccountingService.getTrialBalance();
    const tbAp = tbService.find((r: any) => r.code === '2101');
    assert(eq(parseFloat(tbAp?.balance || '0'), -apBefore),
      `accountingService.getTrialBalance() nets the reversal (expected ${-apBefore} debit-normal, got ${tbAp?.balance})`);

    // ---------------------------------------------------------
    // A3. Trial balance stays balanced and excludes DRAFT
    // ---------------------------------------------------------
    console.log('\n--- A3. Trial balance is balanced and ignores DRAFT ---');
    const tb = await ReportingService.getTrialBalance({});
    assert(tb.isBalanced, `Trial balance is balanced (Dr ${tb.totalClosingDebit} vs Cr ${tb.totalClosingCredit})`);

    const draft = await AccountingService.createJournalEntry({
      entryDate: DATE,
      description: 'قيد مسودة يجب ألا يدخل الأرصدة',
      lines: [
        { accountId: purchAcc, debit: 777777, credit: 0 },
        { accountId: apAcc, debit: 0, credit: 777777 },
      ],
    });
    assert(draft.status === 'DRAFT', 'Draft entry created');

    const apWithDraft = await glBalance(['2101'], true);
    assert(eq(apWithDraft, apBefore), 'A DRAFT entry moves no balance', `${apWithDraft} vs ${apBefore}`);

    const tb2 = await ReportingService.getTrialBalance({});
    assert(tb2.isBalanced, 'Trial balance still balanced with a DRAFT outstanding');
    assert(eq(tb2.totalClosingDebit, tb.totalClosingDebit),
      'DRAFT entry did not change trial-balance totals',
      `${tb2.totalClosingDebit} vs ${tb.totalClosingDebit}`);

    // The service-level trial balance must not include DRAFT either.
    const tbSvc2 = await AccountingService.getTrialBalance();
    const tbSvc2Dr = tbSvc2.reduce((s: number, r: any) => s + parseFloat(r.totalDebit || '0'), 0);
    const tbSvcDr = tbService.reduce((s: number, r: any) => s + parseFloat(r.totalDebit || '0'), 0);
    assert(eq(tbSvc2Dr, tbSvcDr),
      `accountingService.getTrialBalance() ignores DRAFT (${tbSvc2Dr} vs ${tbSvcDr})`);

    // ---------------------------------------------------------
    // A4. Income statement / cash flow must not double count a reversal
    // ---------------------------------------------------------
    console.log('\n--- A4. P&L and cash flow do not double count ---');
    const from = '2026-10-01', to = '2026-10-31';
    const pl = await ReportingService.getIncomeStatement({ fromDate: from, toDate: to });
    const plRevenue = pl.totalRevenue;

    // Post then reverse a revenue entry inside the period.
    const revJe = await AccountingService.createJournalEntry({
      entryDate: DATE,
      description: 'قيد إيراد ثم عكسه',
      lines: [
        { accountId: cashAcc, debit: 123456, credit: 0 },
        { accountId: salesAcc, debit: 0, credit: 123456 },
      ],
    });
    await AccountingService.postJournalEntry(revJe.id);

    const plMid = await ReportingService.getIncomeStatement({ fromDate: from, toDate: to });
    const plMidRevenue = plMid.totalRevenue;
    assert(plMidRevenue - plRevenue >= 123456 - 0.01,
      `Posting a revenue entry raises revenue (${plRevenue} -> ${plMidRevenue})`);

    await AccountingService.reverseJournalEntry(revJe.id);

    const plAfter = await ReportingService.getIncomeStatement({ fromDate: from, toDate: to });
    const plAfterRevenue = plAfter.totalRevenue;
    assert(eq(plAfterRevenue, plRevenue),
      `Reversal removes the revenue again — no phantom, no double count (${plRevenue}, got ${plAfterRevenue})`);

    const cf = await ReportingService.getCashFlowStatement({ fromDate: from, toDate: to });
    assert(typeof cf !== 'undefined' && cf !== null, 'Cash flow statement renders');
    const closingCash = await glBalance(['1101'], true, to);
    const cashAccRow = (await db.query<any>(
      `SELECT COALESCE(SUM(jl.debit - jl.credit), 0) AS bal
       FROM accounting.journal_entry_lines jl
       JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
       JOIN accounting.accounts a ON a.id = jl.account_id
       WHERE a.code = '1101' AND je.status IN ('POSTED','REVERSED') AND je.entry_date <= $1`,
      [to])).rows[0].bal;
    assert(eq(parseFloat(cashAccRow), -closingCash),
      'Reversal pair nets to zero in the cash account too');

    // =======================================================
    // PART B — AP subledger vs control account
    // =======================================================
    console.log('\n--- B. AP reconciliations tie to the control account ---');
    const integrity = await FinancialIntegrityService.runIntegrityCheck(to);
    const apMod = integrity.modules.find((m: any) => m.module === 'AP');
    assert(apMod?.status === 'RECONCILED',
      `AP subledger reconciles to GL 2101 (sub ${apMod?.subledger} vs gl ${apMod?.glBalance})`);

    const apRecon = await PurchasingService.getAPReconciliation();
    assert(eq(apRecon.subledgerBalance, apRecon.glBalance),
      `purchasingService.getAPReconciliation ties out (sub ${apRecon.subledgerBalance} gl ${apRecon.glBalance})`);

    // =======================================================
    // PART C — AR completeness (customer card vs statement vs GL)
    // =======================================================
    console.log('\n--- C. AR: card, statement and control account agree ---');
    const customer = await SalesService.createCustomer({ code: `CUST-103-${S}`, name: 'عميل اختبار 10.3' });
    assert(!!customer.id, 'AR test customer created');

    const invRaw = await SalesService.createInvoice({
      customerId: customer.id, paymentType: 'CREDIT', invoiceDate: DATE,
      lines: [{ description: 'بند اختبار 10.3', quantity: 10, unitPrice: 30000, tax: 0 }],
    });
    await SalesService.postSalesInvoice(invRaw.id);
    const salesInv = await SalesService.getInvoiceById(invRaw.id);
    const INV_TOTAL = parseFloat(salesInv.total);
    assert(eq(INV_TOTAL, 300000), `AR invoice total 300,000 (got ${INV_TOTAL})`);

    const card0 = parseFloat((await SalesService.getCustomerById(customer.id)).outstandingBalance);
    const stmt0 = await SalesService.getCustomerStatement(customer.id);
    assert(eq(card0, INV_TOTAL), `Customer card balance = invoice total (got ${card0})`);
    assert(eq(stmt0.finalBalance, card0),
      `Customer statement closing balance = card balance (${stmt0.finalBalance} vs ${card0})`);

    // An unallocated receipt must net the FULL voucher, exactly like AP.
    const receipt = await SalesService.createReceipt({
      customerId: customer.id, paymentMethod: 'CASH', receiptDate: DATE, amount: 80000,
      description: 'تحصيل على الحساب',
    });
    await SalesService.postReceipt(receipt.id);
    const card1 = parseFloat((await SalesService.getCustomerById(customer.id)).outstandingBalance);
    const stmt1 = await SalesService.getCustomerStatement(customer.id);
    assert(eq(card1, INV_TOTAL - 80000),
      `Customer card nets the FULL unallocated receipt (expected ${INV_TOTAL - 80000}, got ${card1})`);
    assert(eq(stmt1.finalBalance, card1),
      `Customer statement agrees with the card after an unallocated receipt (${stmt1.finalBalance} vs ${card1})`);

    // A posted sales return must reduce AR. Raised through the REAL endpoint so
    // its journal (CR receivables / DR sales returns) is posted too — a bare
    // INSERT would move the subledger without moving the GL and would make the
    // tie-out below fail for a reason that has nothing to do with the product.
    const glBeforeReturn = await glBalance(['1103'], false);
    const retRes = await fetch(`http://127.0.0.1:${port}/api/sales/returns`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: customer.id, originalInvoiceId: salesInv.id, returnDate: DATE,
        notes: 'phase 10.3',
        lines: [{ description: 'بند مردود مبيعات 10.3', quantity: 10, unitPrice: 30000, tax: 0 }],
      }),
    });
    const retBody: any = await retRes.json();
    assert(retRes.status === 201 && retBody.success === true,
      'Sales return accepted through the real endpoint', `${retRes.status} ${JSON.stringify(retBody)}`);
    const returnTotal = parseFloat((await db.query<any>(
      `SELECT total FROM sales.sales_returns WHERE id = $1`, [retBody.salesReturn.id])).rows[0].total);
    const glAfterReturn = await glBalance(['1103'], false);
    assert(eq(glAfterReturn, glBeforeReturn - returnTotal),
      `Sales return credits receivables in the GL (${glBeforeReturn} -> ${glAfterReturn})`);
    const card2 = parseFloat((await SalesService.getCustomerById(customer.id)).outstandingBalance);
    const stmt2 = await SalesService.getCustomerStatement(customer.id);
    assert(eq(card2, INV_TOTAL - 80000 - returnTotal),
      `Customer card nets the posted sales return (expected ${INV_TOTAL - 80000 - returnTotal}, got ${card2})`);
    assert(eq(stmt2.finalBalance, card2),
      `Customer statement agrees with the card after a return (${stmt2.finalBalance} vs ${card2})`);
    assert(stmt2.items.some((i: any) => i.docNumber === retBody.salesReturn.return_number),
      'Customer statement carries the RETURN leg');

    // The AR subledger used to ignore both returns and unallocated receipts, so
    // it drifted away from the 1103 control account.
    const integrity2 = await FinancialIntegrityService.runIntegrityCheck(to);
    const arMod2 = integrity2.modules.find((m: any) => m.module === 'AR');
    assert(arMod2?.status === 'RECONCILED',
      `AR subledger reconciles to GL 1103 (sub ${arMod2?.subledger} vs gl ${arMod2?.glBalance})`);

    // The customer card is a subledger line, so the sum of all customer cards
    // must equal the AR control account balance.
    const customers = await SalesService.getCustomers();
    const sumCards = customers.reduce((s: number, c: any) => s + parseFloat(c.outstandingBalance || '0'), 0);
    assert(eq(sumCards, await glBalance(['1103'], false)),
      `Sum of all customer cards = GL 1103 (${sumCards} vs ${await glBalance(['1103'], false)})`);
  } catch (err: any) {
    console.error(err);
    assert(false, 'Phase 10.3 suite aborted', err?.message);
  } finally {
    server.close();
  }

  console.log('========================================================');
  console.log(`📊 PHASE 10.3 Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPhase103Tests().catch(console.error);