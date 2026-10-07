import { getDb } from './db.ts';
import { SalesService } from './salesService.ts';
import { AccountingService } from './accountingService.ts';

async function runSalesTests() {
  console.log('========================================================');
  console.log('🧪 Starting Kayan Sales & Automatic Accounting Test Suite');
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
  // Test 1: Customer CRUD
  // ----------------------------------------------------
  console.log('\n--- 1. Customer CRUD Tests ---');
  let customerId = '';
  try {
    const cust = await SalesService.createCustomer({
      code: `CUST-T-${Date.now().toString().slice(-4)}`,
      name: 'شركة الصقر العالمية للتجارة',
      phone: '+967-773344556',
      email: 'falcon@trade.com',
      creditLimit: 200000,
      paymentTermsDays: 30,
    });
    customerId = cust.id;
    assert(!!cust.id, 'Create Customer Successful', `ID: ${cust.id}`);

    // Update customer
    const updated = await SalesService.updateCustomer(customerId, {
      name: 'شركة الصقر العالمية المحدودة',
    });
    assert(updated.name === 'شركة الصقر العالمية المحدودة', 'Update Customer Name Successful');

    // Deactivate customer
    const deactivated = await SalesService.updateCustomer(customerId, {
      isActive: false,
    } as any);
    assert(deactivated.is_active === false, 'Deactivate Customer Successful');

    // Reactivate for subsequent tests
    await SalesService.updateCustomer(customerId, { isActive: true } as any);
  } catch (err: any) {
    assert(false, 'Customer CRUD Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 2: Sales Invoice Creation & Automatic Accounting
  // ----------------------------------------------------
  console.log('\n--- 2. Sales Invoice & Automatic Accounting ---');
  let invoiceId = '';
  try {
    const inv = await SalesService.createInvoice({
      customerId,
      paymentType: 'CREDIT',
      invoiceDate: '2026-10-02',
      lines: [
        {
          itemCode: 'ITM-001',
          description: 'نظام إدارة نقاط البيع السحابي',
          quantity: 1,
          unitPrice: 100000,
        },
      ],
    });
    invoiceId = inv.id;
    assert(inv.status === 'DRAFT', 'Create Draft Invoice Successful');
    assert(parseFloat(inv.total) === 100000, 'Invoice Total calculated correctly at 100,000');

    // Post the invoice
    const postRes = await SalesService.postSalesInvoice(invoiceId);
    assert(postRes.success === true, 'Post Invoice Successful');
    assert(!!postRes.journalEntryId, 'Automatic Journal Entry Generated', `JE: ${postRes.journalEntryNumber}`);

    // Verify Journal Entry is POSTED and balanced
    const je = await db.query<any>('SELECT * FROM accounting.journal_entries WHERE id = $1', [postRes.journalEntryId]);
    assert(je.rows[0].status === 'POSTED', 'Generated Journal Entry is POSTED');

    // Verify Lines debit = 100,000 and credit = 100,000
    const lines = await db.query<any>('SELECT * FROM accounting.journal_entry_lines WHERE journal_entry_id = $1', [postRes.journalEntryId]);
    const debitSum = lines.rows.reduce((sum: number, l: any) => sum + parseFloat(l.debit), 0);
    const creditSum = lines.rows.reduce((sum: number, l: any) => sum + parseFloat(l.credit), 0);
    assert(debitSum === 100000 && creditSum === 100000, 'Journal Entry is strictly balanced: 100,000 Debit = 100,000 Credit');

    // Verify Customer balance updated to 100,000
    const custAfterInv = await SalesService.getCustomerById(customerId);
    assert(parseFloat(custAfterInv.outstandingBalance) === 100000, 'Customer Outstanding Balance is 100,000');
  } catch (err: any) {
    assert(false, 'Sales Invoice Automatic Accounting Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 3: Credit Limit Enforcement & Override
  // ----------------------------------------------------
  console.log('\n--- 3. Credit Limit Control ---');
  try {
    // Customer limit is 200,000. Balance is currently 100,000.
    // Try to create and post an invoice of 150,000 (total would be 250,000 > 200,000)
    const bigInv = await SalesService.createInvoice({
      customerId,
      paymentType: 'CREDIT',
      invoiceDate: '2026-10-02',
      lines: [
        { description: 'خوادم سحابية ضخمة', quantity: 1, unitPrice: 150000 },
      ],
    });

    let limitBlocked = false;
    try {
      await SalesService.postSalesInvoice(bigInv.id, undefined, false); // No override
    } catch (err: any) {
      limitBlocked = true;
      assert(err.message.includes('تجاوز الحد الائتماني'), 'Over Credit Limit Invoice Rejected as Expected', err.message);
    }
    assert(limitBlocked, 'Invoice exceeding credit limit must be blocked without override');

    // Post with authorized override
    const overrideRes = await SalesService.postSalesInvoice(bigInv.id, undefined, true);
    assert(overrideRes.success === true, 'Authorized Credit Limit Override Allowed Successfully');
  } catch (err: any) {
    assert(false, 'Credit Limit Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 4: Receipts, Allocation, & Automatic Accounting
  // ----------------------------------------------------
  console.log('\n--- 4. Receipt & Allocation Tests ---');
  try {
    // Create receipt of 40,000 allocated to invoiceId (which was 100,000)
    const receipt = await SalesService.createReceipt({
      customerId,
      paymentMethod: 'CASH',
      receiptDate: '2026-10-02',
      amount: 40000,
      description: 'دفعة نقدية سداد جزئي للفاتورة',
      allocations: [
        { invoiceId, amount: 40000 },
      ],
    });
    assert(receipt.status === 'DRAFT', 'Create Receipt Successful');

    // Test over-allocation prevention
    let overAllocRejected = false;
    try {
      await SalesService.createReceipt({
        customerId,
        paymentMethod: 'CASH',
        receiptDate: '2026-10-02',
        amount: 10000,
        allocations: [{ invoiceId, amount: 20000 }], // 20,000 allocated for 10,000 receipt!
      });
    } catch (err: any) {
      overAllocRejected = true;
      assert(err.message.includes('يتجاوز مبلغ سند القبض'), 'Over-Allocation Rejected as Expected');
    }
    assert(overAllocRejected, 'Over-allocation must throw error');

    // Post the valid receipt
    const postReceiptRes = await SalesService.postReceipt(receipt.id);
    assert(postReceiptRes.success === true, 'Post Receipt Successful');
    assert(!!postReceiptRes.journalEntryId, 'Receipt Journal Entry Generated');

    // Verify invoice paid_amount is updated to 40,000
    const invAfterPayment = await SalesService.getInvoiceById(invoiceId);
    assert(parseFloat(invAfterPayment.paid_amount) === 40000, 'Invoice paid_amount updated to 40,000');
  } catch (err: any) {
    assert(false, 'Receipt Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 5: Customer Statement & Final Balance Check
  // ----------------------------------------------------
  console.log('\n--- 5. Customer Statement Verification ---');
  try {
    const statement = await SalesService.getCustomerStatement(customerId);
    assert(statement.items.length >= 2, 'Customer Statement contains all invoices and receipts');

    // Invoices: 100,000 + 150,000 = 250,000 Debit. Receipt: 40,000 Credit. Net: 210,000
    assert(statement.finalBalance === 210000, `Running Balance verified at 210,000 (Calculated: ${statement.finalBalance})`);
  } catch (err: any) {
    assert(false, 'Customer Statement Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 6: Voiding Invoice and Reversing Journal Entry
  // ----------------------------------------------------
  console.log('\n--- 6. Void / Reversal Test ---');
  try {
    const testInv = await SalesService.createInvoice({
      customerId,
      paymentType: 'CASH',
      invoiceDate: '2026-10-02',
      lines: [{ description: 'خدمة سيتم إلغاؤها', quantity: 1, unitPrice: 15000 }],
    });
    await SalesService.postSalesInvoice(testInv.id);

    const voidRes = await SalesService.voidSalesInvoice(testInv.id);
    assert(voidRes.success === true, 'Invoice Voided and Journal Entry Reversed');

    const voidedInv = await SalesService.getInvoiceById(testInv.id);
    assert(voidedInv.status === 'VOIDED', 'Invoice Status is VOIDED');
  } catch (err: any) {
    assert(false, 'Void Test Failed', err.message);
  }

  console.log('========================================================');
  console.log(`📊 Sales Test Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runSalesTests().catch(console.error);
