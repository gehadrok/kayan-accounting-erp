import { getDb } from './db.ts';
import { PurchasingService } from './purchasingService.ts';
import { AccountingService } from './accountingService.ts';

async function runPurchasingTests() {
  console.log('========================================================');
  console.log('🧪 Starting Kayan Purchasing & Automatic Accounting Test Suite');
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

  // ----------------------------------------------------
  // Test 1: Supplier CRUD
  // ----------------------------------------------------
  console.log('\n--- 1. Supplier CRUD Tests ---');
  let supplierId = '';
  try {
    const supp = await PurchasingService.createSupplier({
      code: `SUP-T-${Date.now().toString().slice(-4)}`,
      name: 'مؤسسة الرواد للحلول التقنية',
      phone: '+967-775566778',
      email: 'alrowad@tech.com',
      address: 'صنعاء - شارع الستين',
      creditLimit: 500000,
      paymentTermsDays: 45,
    });
    supplierId = supp.id;
    assert(!!supp.id, 'Create Supplier Successful', `ID: ${supp.id}`);

    // Update
    const updated = await PurchasingService.updateSupplier(supplierId, {
      name: 'مؤسسة الرواد الدولية للحلول التقنية',
    });
    assert(updated.name === 'مؤسسة الرواد الدولية للحلول التقنية', 'Update Supplier Name Successful');

    // Deactivate
    const deactivated = await PurchasingService.updateSupplier(supplierId, {
      isActive: false,
    });
    assert(deactivated.is_active === false, 'Deactivate Supplier Successful');

    // Reactivate for tests
    await PurchasingService.updateSupplier(supplierId, { isActive: true });
  } catch (err: any) {
    assert(false, 'Supplier CRUD Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 2: Purchase Invoice Creation & Automatic Accounting (The End-to-End Scenario)
  // ----------------------------------------------------
  console.log('\n--- 2. Purchase Invoice & Automatic Accounting ---');
  let invoiceId = '';
  try {
    const inv = await PurchasingService.createInvoice({
      supplierId,
      paymentType: 'CREDIT',
      postingType: 'EXPENSE',
      invoiceDate: '2026-10-02',
      dueDate: '2026-11-02',
      lines: [
        {
          itemCode: 'SRV-01',
          description: 'خوادم سحابية وتجهيزات شبكية للمركز الرئيسي',
          quantity: 1,
          unitPrice: 100000,
          discount: 0,
          tax: 0,
        },
      ],
    });
    invoiceId = inv.id;
    assert(inv.status === 'DRAFT', 'Create Draft Purchase Invoice Successful');
    assert(parseFloat(inv.total) === 100000, 'Invoice Total calculated correctly at 100,000');

    // Post the invoice
    const postRes = await PurchasingService.postPurchaseInvoice(invoiceId);
    assert(postRes.success === true, 'Post Purchase Invoice Successful');
    assert(!!postRes.journalEntryId, 'Automatic Journal Entry Generated', `JE: ${postRes.journalEntryNumber}`);

    // Verify Journal Entry is POSTED and strictly balanced
    const je = await db.query<any>('SELECT * FROM accounting.journal_entries WHERE id = $1', [postRes.journalEntryId]);
    assert(je.rows[0].status === 'POSTED', 'Generated Journal Entry is POSTED');

    // Verify Lines debit = 100,000 and credit = 100,000
    const lines = await db.query<any>('SELECT * FROM accounting.journal_entry_lines WHERE journal_entry_id = $1', [postRes.journalEntryId]);
    const debitSum = lines.rows.reduce((sum: number, l: any) => sum + parseFloat(l.debit), 0);
    const creditSum = lines.rows.reduce((sum: number, l: any) => sum + parseFloat(l.credit), 0);
    assert(debitSum === 100000 && creditSum === 100000, 'Journal Entry is strictly balanced: 100,000 Debit = 100,000 Credit');

    // Verify Supplier Outstanding Balance increased to 100,000
    const suppAfterInv = await PurchasingService.getSupplierById(supplierId);
    assert(parseFloat(suppAfterInv.outstandingBalance) === 100000, 'Supplier Outstanding Balance increased to 100,000');
  } catch (err: any) {
    assert(false, 'Purchase Invoice Automatic Accounting Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 3: Rejection of Closed Fiscal Period & Inactive Supplier
  // ----------------------------------------------------
  console.log('\n--- 3. Validation Rules (Closed Period & Inactive Supplier) ---');
  try {
    // Closed Period (January 2026 is CLOSED)
    const closedPeriodInv = await PurchasingService.createInvoice({
      supplierId,
      paymentType: 'CREDIT',
      invoiceDate: '2026-01-15',
      lines: [{ description: 'بند في فترة مغلقة', quantity: 1, unitPrice: 5000 }],
    });

    let closedRejected = false;
    try {
      await PurchasingService.postPurchaseInvoice(closedPeriodInv.id);
    } catch (e: any) {
      closedRejected = true;
      assert(e.message.includes('مغلقة'), 'Closed Fiscal Period Posting Rejected as Expected');
    }
    assert(closedRejected, 'Must reject posting in a closed fiscal period');

    // Inactive Supplier
    const inactiveSupp = await PurchasingService.createSupplier({
      code: `SUP-INACT-${Date.now().toString().slice(-4)}`,
      name: 'مورد معطل للتجربة',
    });
    await PurchasingService.updateSupplier(inactiveSupp.id, { isActive: false });

    let inactiveRejected = false;
    try {
      await PurchasingService.createInvoice({
        supplierId: inactiveSupp.id,
        invoiceDate: '2026-10-02',
        lines: [{ description: 'بند لمورد معطل', quantity: 1, unitPrice: 2000 }],
      });
    } catch (e: any) {
      inactiveRejected = true;
      assert(e.message.includes('معطل'), 'Invoice creation for deactivated supplier rejected as expected');
    }
    assert(inactiveRejected, 'Must reject invoice for deactivated supplier');
  } catch (err: any) {
    assert(false, 'Validation Rules Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 4: Supplier Payments, Multi-Invoice Allocation & Over-Allocation Prevention
  // ----------------------------------------------------
  console.log('\n--- 4. Supplier Payment & Allocation Tests ---');
  let paymentId = '';
  try {
    // Create second invoice of 50,000 for multi-allocation test
    const inv2 = await PurchasingService.createInvoice({
      supplierId,
      paymentType: 'CREDIT',
      invoiceDate: '2026-10-02',
      lines: [{ description: 'خدمات إضافية', quantity: 1, unitPrice: 50000 }],
    });
    await PurchasingService.postPurchaseInvoice(inv2.id);

    // Total supplier liability is now 100,000 + 50,000 = 150,000.
    // Create a Payment of 120,000 allocated: 100,000 to inv1, 20,000 to inv2
    const payment = await PurchasingService.createPayment({
      supplierId,
      paymentMethod: 'CASH',
      paymentDate: '2026-10-02',
      amount: 120000,
      description: 'سداد جزئي للفواتير',
      allocations: [
        { invoiceId, amount: 100000 },
        { invoiceId: inv2.id, amount: 20000 },
      ],
    });
    paymentId = payment.id;
    assert(payment.status === 'DRAFT', 'Create Draft Payment Voucher Successful');

    // Test Over-Allocation prevention (attempting to allocate 60,000 to inv2 which only has 50,000)
    let overAllocRejected = false;
    try {
      await PurchasingService.createPayment({
        supplierId,
        paymentMethod: 'CASH',
        paymentDate: '2026-10-02',
        amount: 80000,
        allocations: [{ invoiceId: inv2.id, amount: 60000 }],
      });
    } catch (err: any) {
      overAllocRejected = true;
      assert(err.message.includes('يتجاوز'), 'Over-Allocation Rejected as Expected');
    }
    assert(overAllocRejected, 'Over-allocation must be strictly blocked');

    // Post the valid payment
    const postPayRes = await PurchasingService.postSupplierPayment(paymentId);
    assert(postPayRes.success === true, 'Post Supplier Payment Successful');
    assert(!!postPayRes.journalEntryId, 'Payment Journal Entry Generated');

    // Verify invoice 1 is fully paid (100,000) and invoice 2 is partially paid (20,000)
    const inv1After = await PurchasingService.getInvoiceById(invoiceId);
    const inv2After = await PurchasingService.getInvoiceById(inv2.id);
    assert(parseFloat(inv1After.paid_amount) === 100000, 'Invoice 1 paid_amount updated to 100,000 (Fully Settled)');
    assert(parseFloat(inv2After.paid_amount) === 20000, 'Invoice 2 paid_amount updated to 20,000 (Partially Settled)');

    // Verify supplier balance is now 150,000 - 120,000 = 30,000
    const suppAfterPay = await PurchasingService.getSupplierById(supplierId);
    assert(parseFloat(suppAfterPay.outstandingBalance) === 30000, `Supplier Outstanding Balance is 30,000 (Calculated: ${suppAfterPay.outstandingBalance})`);
  } catch (err: any) {
    assert(false, 'Supplier Payment Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 5: Supplier Subledger Statement
  // ----------------------------------------------------
  console.log('\n--- 5. Supplier Statement Verification ---');
  try {
    const statement = await PurchasingService.getSupplierStatement(supplierId);
    assert(statement.items.length >= 3, 'Supplier Statement contains all invoices and payments');
    assert(statement.finalBalance === 30000, `Running Balance correctly verified at 30,000 (Calculated: ${statement.finalBalance})`);
  } catch (err: any) {
    assert(false, 'Supplier Statement Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 5b: A posted purchase return must appear in the statement
  // ----------------------------------------------------
  // Regression guard. The statement used to be a 2-way UNION over
  // purchase_invoices + payments, so a posted purchase return was silently
  // dropped and the supplier kept showing the full invoiced balance. The
  // sales-side counterpart has always carried its RETURN leg (asserted in
  // phase91.test.ts); this is the purchase-side twin of that assertion.
  console.log('\n--- 5b. Purchase Return in Supplier Statement ---');
  try {
    const before = await PurchasingService.getSupplierStatement(supplierId);
    const balanceBefore = before.finalBalance;

    // Same header shape that POST /purchasing/returns inserts. The return
    // endpoint itself lives in the HTTP layer; the phase93/94 suites already
    // cover that it writes these rows, so what is under test here is that the
    // statement READS them.
    const srcRes = await db.query<any>(
      `SELECT id, company_id, branch_id, invoice_date
         FROM purchasing.purchase_invoices
        WHERE supplier_id = $1 AND status = 'POSTED'
        ORDER BY invoice_date ASC LIMIT 1`,
      [supplierId]
    );
    const src = srcRes.rows[0];
    assert(!!src, 'Found a posted invoice to build the return against');

    const RETURN_TOTAL = 15000;
    const returnNumber = `PR-T-${Date.now().toString().slice(-6)}`;
    await db.query<any>(
      `INSERT INTO purchasing.purchase_returns
         (company_id, branch_id, return_number, supplier_id, original_invoice_id,
          return_date, subtotal, tax, total, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 0, $7, 'POSTED', $8)`,
      [src.company_id, src.branch_id, returnNumber, supplierId, src.id,
       src.invoice_date, RETURN_TOTAL, 'Regression: return visibility in statement']
    );

    const after = await PurchasingService.getSupplierStatement(supplierId);
    const returnRow: any = after.items.find((i: any) => i.type === 'RETURN');

    assert(!!returnRow, 'Supplier Statement contains the posted purchase return');
    assert(returnRow?.docNumber === returnNumber, `Statement shows return number ${returnNumber}`, JSON.stringify(returnRow));
    assert(returnRow?.debit === RETURN_TOTAL && returnRow?.credit === 0,
      'Return is a DEBIT against the supplier, mirroring the payment leg',
      JSON.stringify(returnRow));
    assert(after.finalBalance === balanceBefore - RETURN_TOTAL,
      `Statement balance reduced by the return: ${balanceBefore} -> ${balanceBefore - RETURN_TOTAL} (got ${after.finalBalance})`);

    // The balance printed on the supplier card sits next to the statement on the
    // same screen, so it must not contradict it.
    const suppAfterReturn = await PurchasingService.getSupplierById(supplierId);
    assert(parseFloat(suppAfterReturn.outstandingBalance) === balanceBefore - RETURN_TOTAL,
      `outstandingBalance nets the return too (got ${suppAfterReturn.outstandingBalance})`);

    // Remove the fixture: it was never posted to the GL, so leaving it behind
    // would make the AP reconciliation test below legitimately report a
    // subledger/GL difference caused by the test harness, not by the app.
    await db.query('DELETE FROM purchasing.purchase_returns WHERE return_number = $1', [returnNumber]);
    const restored = await PurchasingService.getSupplierStatement(supplierId);
    assert(restored.finalBalance === balanceBefore, 'Statement balance restored after fixture cleanup');
  } catch (err: any) {
    assert(false, 'Purchase Return Statement Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 6: Accounts Payable Aging Report
  // ----------------------------------------------------
  console.log('\n--- 6. AP Aging Report Tests ---');
  try {
    const aging = await PurchasingService.getAccountsPayableAging();
    assert(aging.totalPayables > 0, 'AP Aging Report calculated successfully');
    assert(aging.suppliers.length > 0, 'AP Aging contains supplier breakdown');
  } catch (err: any) {
    assert(false, 'AP Aging Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 7: AP Reconciliation (Quality Requirement #19)
  // ----------------------------------------------------
  console.log('\n--- 7. AP Reconciliation (Subledger vs GL Control Account) ---');
  try {
    const recon = await PurchasingService.getAPReconciliation();
    assert(recon.status === 'RECONCILED', `AP Reconciliation is RECONCILED (Subledger: ${recon.subledgerBalance}, GL: ${recon.glBalance}, Diff: ${recon.difference})`);
  } catch (err: any) {
    assert(false, 'AP Reconciliation Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 8: Reversal of Purchase Invoice & Payment
  // ----------------------------------------------------
  console.log('\n--- 8. Reversal / Void Tests ---');
  try {
    const testInv = await PurchasingService.createInvoice({
      supplierId,
      paymentType: 'CASH',
      invoiceDate: '2026-10-02',
      lines: [{ description: 'فاتورة نقدية للتجربة والإلغاء', quantity: 1, unitPrice: 25000 }],
    });
    await PurchasingService.postPurchaseInvoice(testInv.id);

    const voidRes = await PurchasingService.reversePurchaseInvoice(testInv.id);
    assert(voidRes.success === true, 'Invoice Voided and Journal Entry Reversed');

    const voidedInv = await PurchasingService.getInvoiceById(testInv.id);
    assert(voidedInv.status === 'VOIDED', 'Invoice Status is VOIDED');
  } catch (err: any) {
    assert(false, 'Void Test Failed', err.message);
  }

  console.log('========================================================');
  console.log(`📊 Purchasing Test Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runPurchasingTests().catch(console.error);
