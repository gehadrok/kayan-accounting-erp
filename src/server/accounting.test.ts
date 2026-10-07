import { getDb } from './db.ts';
import { AccountingService } from './accountingService.ts';

async function runTests() {
  console.log('========================================================');
  console.log('🧪 Starting Kayan Accounting Core Engine Verification...');
  console.log('========================================================');

  const db = await getDb();

  // Retrieve test accounts
  const cashAcc = await db.query<{ id: string }>('SELECT id FROM accounting.accounts WHERE code = $1', ['1101']);
  const salesAcc = await db.query<{ id: string }>('SELECT id FROM accounting.accounts WHERE code = $1', ['41']);
  const salariesAcc = await db.query<{ id: string }>('SELECT id FROM accounting.accounts WHERE code = $1', ['51']);

  const cashId = cashAcc.rows[0].id;
  const salesId = salesAcc.rows[0].id;
  const salariesId = salariesAcc.rows[0].id;

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
  // Test 1: Valid Balanced Entry (POST = SUCCESS)
  // ----------------------------------------------------
  console.log('\n--- Test 1: Valid Entry (Debit = 1000, Credit = 1000) ---');
  try {
    const entry = await AccountingService.createJournalEntry({
      entryDate: '2026-10-02',
      description: 'فاتورة مبيعات نقدية تجريبية - اختبار التوازن',
      lines: [
        { accountId: cashId, debit: 1000, credit: 0, description: 'مدين: الصندوق' },
        { accountId: salesId, debit: 0, credit: 1000, description: 'دائن: إيرادات المبيعات' },
      ],
    });

    const posted = await AccountingService.postJournalEntry(entry.id);
    assert(posted.status === 'POSTED', 'Valid Entry Posted Successfully', `Status: ${posted.status}`);
    assert(posted.totalDebit === 1000 && posted.totalCredit === 1000, 'Debit equals Credit at 1000');
  } catch (err: any) {
    assert(false, 'Valid Entry Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 2: Invalid Unbalanced Entry (POST = REJECTED)
  // ----------------------------------------------------
  console.log('\n--- Test 2: Invalid Entry (Debit = 1000, Credit = 900) ---');
  try {
    const unbalancedEntry = await AccountingService.createJournalEntry({
      entryDate: '2026-10-02',
      description: 'قيد غير متوازن تجريبي',
      lines: [
        { accountId: cashId, debit: 1000, credit: 0 },
        { accountId: salesId, debit: 0, credit: 900 }, // Discrepancy of 100!
      ],
    });

    let caught = false;
    try {
      await AccountingService.postJournalEntry(unbalancedEntry.id);
    } catch (err: any) {
      caught = true;
      assert(err.message.includes('غير متوازن'), 'Unbalanced Entry was strictly rejected by Double-Entry Engine', err.message);
    }

    assert(caught, 'Unbalanced Entry must throw an error on post attempt');
  } catch (err: any) {
    assert(false, 'Unbalanced Entry Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 3: Posting to Closed Fiscal Period (POST = REJECTED)
  // ----------------------------------------------------
  console.log('\n--- Test 3: Closed Period (POST = REJECTED) ---');
  try {
    // Period 1 (January 2026) is CLOSED in seed data
    const closedPeriodRes = await db.query<{ id: string }>(
      "SELECT id FROM accounting.fiscal_periods WHERE period_number = 1 AND status = 'CLOSED'"
    );
    const closedPeriodId = closedPeriodRes.rows[0].id;

    const closedEntry = await AccountingService.createJournalEntry({
      entryDate: '2026-01-15',
      fiscalPeriodId: closedPeriodId,
      description: 'قيد في فترة مغلقة تجريبي',
      lines: [
        { accountId: salariesId, debit: 500, credit: 0 },
        { accountId: cashId, debit: 0, credit: 500 },
      ],
    });

    let caught = false;
    try {
      await AccountingService.postJournalEntry(closedEntry.id);
    } catch (err: any) {
      caught = true;
      assert(err.message.includes('مقفلة') || err.message.includes('مغلقة'), 'Posting to Closed Period was strictly rejected', err.message);
    }

    assert(caught, 'Closed Period must throw error on post attempt');
  } catch (err: any) {
    assert(false, 'Closed Period Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 4: Modifying or Deleting Posted Entry (DELETE = REJECTED)
  // ----------------------------------------------------
  console.log('\n--- Test 4: Delete Posted Entry (DELETE = REJECTED) ---');
  try {
    const entryToPost = await AccountingService.createJournalEntry({
      entryDate: '2026-10-02',
      description: 'قيد للاختبار ضد الحذف والتعديل',
      lines: [
        { accountId: cashId, debit: 2000, credit: 0 },
        { accountId: salesId, debit: 0, credit: 2000 },
      ],
    });

    await AccountingService.postJournalEntry(entryToPost.id);

    let caught = false;
    try {
      await AccountingService.deleteJournalEntry(entryToPost.id);
    } catch (err: any) {
      caught = true;
      assert(err.message.includes('ممنوع حذف قيد'), 'Deleting Posted Entry was strictly rejected and audited', err.message);
    }

    assert(caught, 'Posted Entry deletion must be prevented');
  } catch (err: any) {
    assert(false, 'Posted Entry Deletion Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 5: Reversal Entry (Balanced Reversal Created & Original REVERSED)
  // ----------------------------------------------------
  console.log('\n--- Test 5: Reversal Entry (Reversal = SUCCESS, Status = REVERSED) ---');
  try {
    const originalEntry = await AccountingService.createJournalEntry({
      entryDate: '2026-10-02',
      description: 'قيد سيتم عكسه لاحقاً',
      lines: [
        { accountId: cashId, debit: 3500, credit: 0 },
        { accountId: salesId, debit: 0, credit: 3500 },
      ],
    });

    await AccountingService.postJournalEntry(originalEntry.id);

    // Now execute reversal
    const revResult: any = await AccountingService.reverseJournalEntry(originalEntry.id);
    assert(revResult.status === 'REVERSED', 'Original Entry status updated to REVERSED');
    assert(revResult.reversalEntry.status === 'POSTED', 'Reversal Entry created in POSTED status');
    assert(revResult.reversalEntry.reversed_entry_id === originalEntry.id, 'Reversal entry points to original entry ID');
  } catch (err: any) {
    assert(false, 'Reversal Test Failed', err.message);
  }

  // ----------------------------------------------------
  // Test 6: Audit Log Integrity
  // ----------------------------------------------------
  console.log('\n--- Test 6: Audit Trail Verification ---');
  try {
    const logsRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM audit.audit_logs');
    const logCount = parseInt(logsRes.rows[0].count, 10);
    assert(logCount >= 5, `Audit log contains ${logCount} immutable records`);
  } catch (err: any) {
    assert(false, 'Audit Log Test Failed', err.message);
  }

  console.log('========================================================');
  console.log(`📊 Test Results: ${passedTests}/${totalTests} Passed.`);
  console.log('========================================================');
}

runTests().catch(console.error);
