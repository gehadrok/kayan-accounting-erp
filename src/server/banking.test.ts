import { getDb } from './db.ts';
import { BankingService } from './bankingService.ts';
import { AccountingService } from './accountingService.ts';

export async function runBankingTests() {
  console.log('================================================================');
  console.log('🧪 Starting Kayan Comprehensive Cash & Banking Test Suite');
  console.log('================================================================');

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

  try {
    // ----------------------------------------------------
    // Scenario 1: Setup Master Cash & Bank Accounts
    // ----------------------------------------------------
    console.log('\n--- Scenario 1: Master Cash & Bank Accounts Setup ---');
    const cashA = await BankingService.createCashAccount({
      code: `CASH-TST-A-${Date.now().toString().slice(-4)}`,
      name: 'صندوق الاختبار الرئيسي (A)',
      type: 'MAIN',
      openingBalance: 500000,
      notes: 'صندوق اختبار الحركات المالية',
    });
    assert(!!cashA.id, '1. Create Cash Account A Successful');

    const cashB = await BankingService.createCashAccount({
      code: `CASH-TST-B-${Date.now().toString().slice(-4)}`,
      name: 'صندوق اختبار المبيعات (B)',
      type: 'SALES',
      openingBalance: 100000,
      notes: 'صندوق فرعي لاختبار التحويلات',
    });
    assert(!!cashB.id, '2. Create Cash Account B Successful');

    const bankA = await BankingService.createBankAccount({
      code: `BNK-TST-A-${Date.now().toString().slice(-4)}`,
      bankName: 'بنك التضامن التجريبي',
      accountName: 'حساب العمليات التجريبي',
      accountNumber: `ACC-${Date.now()}`,
      openingBalance: 2000000,
    });
    assert(!!bankA.id, '3. Create Bank Account A Successful');

    const bankB = await BankingService.createBankAccount({
      code: `BNK-TST-B-${Date.now().toString().slice(-4)}`,
      bankName: 'بنك الكريمي التجريبي',
      accountName: 'حساب المدفوعات التجريبي',
      accountNumber: `ACC-K-${Date.now()}`,
      openingBalance: 800000,
    });
    assert(!!bankB.id, '4. Create Bank Account B Successful');

    // ----------------------------------------------------
    // Scenario 2: Ledger Balance as Single Source of Truth
    // ----------------------------------------------------
    console.log('\n--- Scenario 2: Single Source of Truth Balance Computation ---');
    const balCashA = await BankingService.getAccountBalance('CASH', cashA.id);
    assert(balCashA === 500000, '5. Cash A Balance equals Opening Balance (500,000)');

    const balCashB = await BankingService.getAccountBalance('CASH', cashB.id);
    assert(balCashB === 100000, '6. Cash B Balance equals Opening Balance (100,000)');

    const balBankA = await BankingService.getAccountBalance('BANK', bankA.id);
    assert(balBankA === 2000000, '7. Bank A Balance equals Opening Balance (2,000,000)');

    // ----------------------------------------------------
    // Scenario 3: Cash to Cash Transfer (Atomic & Balanced JE)
    // ----------------------------------------------------
    console.log('\n--- Scenario 3: Cash to Cash Transfer (50,000 from A to B) ---');
    const trfCash = await BankingService.createTransfer({
      transferDate: '2026-10-06',
      transferType: 'CASH_TO_CASH',
      fromCategory: 'CASH',
      fromCashAccountId: cashA.id,
      toCategory: 'CASH',
      toCashAccountId: cashB.id,
      amount: 50000,
      description: 'تحويل نقدي لتغذية صندوق المبيعات B',
    });
    assert(!!trfCash.id, '8. Cash Transfer Created');
    assert(!!trfCash.journalEntryNumber, '9. Balanced Double-Entry Journal Entry Posted', trfCash.journalEntryNumber);

    const balCashAAfter = await BankingService.getAccountBalance('CASH', cashA.id);
    const balCashBAfter = await BankingService.getAccountBalance('CASH', cashB.id);
    assert(balCashAAfter === 450000, '10. Cash A Balance Decreased to 450,000', `Balance: ${balCashAAfter}`);
    assert(balCashBAfter === 150000, '11. Cash B Balance Increased to 150,000', `Balance: ${balCashBAfter}`);

    // ----------------------------------------------------
    // Scenario 4: Bank to Bank Transfer with Fee
    // ----------------------------------------------------
    console.log('\n--- Scenario 4: Bank to Bank Transfer (200,000 + 500 Fee) ---');
    const trfBank = await BankingService.createTransfer({
      transferDate: '2026-10-06',
      transferType: 'BANK_TO_BANK',
      fromCategory: 'BANK',
      fromBankAccountId: bankA.id,
      toCategory: 'BANK',
      toBankAccountId: bankB.id,
      amount: 200000,
      feeAmount: 500,
      description: 'تحويل بين الحسابات البنكية مع عمولة تحويل',
    });
    assert(!!trfBank.id, '12. Bank to Bank Transfer Created');

    const balBankAAfter = await BankingService.getAccountBalance('BANK', bankA.id);
    const balBankBAfter = await BankingService.getAccountBalance('BANK', bankB.id);
    assert(balBankAAfter === 2000000 - 200500, '13. Bank A Decreased by Amount + Fee (1,799,500)', `Balance: ${balBankAAfter}`);
    assert(balBankBAfter === 800000 + 200000, '14. Bank B Increased by Amount (1,000,000)', `Balance: ${balBankBAfter}`);

    // ----------------------------------------------------
    // Scenario 5: Cash Deposit (CASH_TO_BANK)
    // ----------------------------------------------------
    console.log('\n--- Scenario 5: Cash Deposit (100,000 from Cash A to Bank A) ---');
    const deposit = await BankingService.createTransfer({
      transferDate: '2026-10-06',
      transferType: 'CASH_TO_BANK',
      fromCategory: 'CASH',
      fromCashAccountId: cashA.id,
      toCategory: 'BANK',
      toBankAccountId: bankA.id,
      amount: 100000,
      description: 'إيداع نقدي يومي بحساب البنك A',
    });
    assert(!!deposit.id, '15. Cash Deposit Created');

    const balCashADeposit = await BankingService.getAccountBalance('CASH', cashA.id);
    const balBankADeposit = await BankingService.getAccountBalance('BANK', bankA.id);
    assert(balCashADeposit === 350000, '16. Cash A Decreased to 350,000', `Balance: ${balCashADeposit}`);
    assert(balBankADeposit === 1899500, '17. Bank A Increased to 1,899,500', `Balance: ${balBankADeposit}`);

    // ----------------------------------------------------
    // Scenario 6: Cash Withdrawal (BANK_TO_CASH)
    // ----------------------------------------------------
    console.log('\n--- Scenario 6: Cash Withdrawal (30,000 from Bank B to Cash B) ---');
    const withdrawal = await BankingService.createTransfer({
      transferDate: '2026-10-06',
      transferType: 'BANK_TO_CASH',
      fromCategory: 'BANK',
      fromBankAccountId: bankB.id,
      toCategory: 'CASH',
      toCashAccountId: cashB.id,
      amount: 30000,
      description: 'سحب نقدي من البنك لتغذية الصندوق',
    });
    assert(!!withdrawal.id, '18. Cash Withdrawal Created');

    const balBankBWithdraw = await BankingService.getAccountBalance('BANK', bankB.id);
    const balCashBWithdraw = await BankingService.getAccountBalance('CASH', cashB.id);
    assert(balBankBWithdraw === 970000, '19. Bank B Decreased to 970,000', `Balance: ${balBankBWithdraw}`);
    assert(balCashBWithdraw === 180000, '20. Cash B Increased to 180,000', `Balance: ${balCashBWithdraw}`);

    // ----------------------------------------------------
    // Scenario 7: Insufficient Balance Guard
    // ----------------------------------------------------
    console.log('\n--- Scenario 7: Overdraft Protection Guard ---');
    try {
      await BankingService.createTransfer({
        transferDate: '2026-10-06',
        transferType: 'CASH_TO_CASH',
        fromCategory: 'CASH',
        fromCashAccountId: cashA.id,
        toCategory: 'CASH',
        toCashAccountId: cashB.id,
        amount: 999999999, // Impossible amount
        description: 'تحويل يتجاوز الرصيد المتاح',
      });
      assert(false, '21. Transfer exceeding balance should be rejected');
    } catch (err: any) {
      assert(err.message.includes('غير كافٍ'), '21. Overdraft Transfer Rejected Successfully', err.message);
    }

    // ----------------------------------------------------
    // Scenario 8: Direct Bank Charge
    // ----------------------------------------------------
    console.log('\n--- Scenario 8: Direct Bank Charge (1,500 on Bank A) ---');
    const charge = await BankingService.createBankCharge({
      bankAccountId: bankA.id,
      chargeDate: '2026-10-06',
      amount: 1500,
      description: 'رسوم كشف حساب بنكي دوري',
      referenceNumber: 'CHG-REF-01',
    });
    assert(!!charge.transaction.id, '22. Bank Charge Transaction Recorded');
    assert(!!charge.journalEntryNumber, '23. Bank Charge Double-Entry Journal Posted');

    const balBankACharged = await BankingService.getAccountBalance('BANK', bankA.id);
    assert(balBankACharged === 1898000, '24. Bank A Balance Reflects Charge (1,898,000)', `Balance: ${balBankACharged}`);

    // ----------------------------------------------------
    // Scenario 9: Bank Statement & Bank Reconciliation
    // ----------------------------------------------------
    console.log('\n--- Scenario 9: Bank Statement & Reconciliation ---');
    const statement = await BankingService.createBankStatement({
      bankAccountId: bankA.id,
      statementNumber: `STMT-TST-${Date.now().toString().slice(-4)}`,
      statementDate: '2026-10-06',
      fromDate: '2026-10-01',
      toDate: '2026-10-06',
      openingBalance: 2000000,
      closingBalance: 1898000,
      lines: [
        {
          transactionDate: '2026-10-06',
          description: 'تحويل صادر',
          direction: 'WITHDRAWAL',
          amount: 200500,
          balanceAfter: 1799500,
        },
        {
          transactionDate: '2026-10-06',
          description: 'إيداع نقدي وارد',
          direction: 'DEPOSIT',
          amount: 100000,
          balanceAfter: 1899500,
        },
        {
          transactionDate: '2026-10-06',
          description: 'رسوم ومصروفات بنكية',
          direction: 'WITHDRAWAL',
          amount: 1500,
          balanceAfter: 1898000,
        },
      ],
    });
    assert(!!statement.id, '25. Bank Statement Uploaded & Created');
    assert(statement.lines.length === 3, '26. Statement Lines Parsed and Stored');

    const preview = await BankingService.getReconciliationPreview(bankA.id, '2026-10-06', 1898000);
    assert(preview.statementClosingBalance === 1898000, '27. Reconciliation Preview Matches Statement Closing Balance');
    assert(preview.glBookBalance === 1898000, '28. GL Book Balance equals 1,898,000');

    // Create & finalize reconciliation
    const reconciliation = await BankingService.createBankReconciliation({
      bankAccountId: bankA.id,
      statementId: statement.id,
      reconciliationDate: '2026-10-06',
      periodEndDate: '2026-10-06',
      statementClosingBalance: 1898000,
      notes: 'تسوية شهرية مطابقة بالكامل',
    });
    assert(reconciliation.status === 'COMPLETED', '29. Bank Reconciliation Completed Successfully');

    // ----------------------------------------------------
    // Scenario 10: Physical Cash Count & Auto Discrepancy Adjustment
    // ----------------------------------------------------
    console.log('\n--- Scenario 10: Cash Count & Auto Deficit/Surplus Settlement ---');
    // Cash B current ledger balance is 180,000
    // Suppose physical count finds: 178,000 (Deficit of 2,000)
    const countDraft = await BankingService.createCashCount({
      cashAccountId: cashB.id,
      countDate: '2026-10-06',
      countedByName: 'أمين الصندوق / علي صالح',
      denominations: [
        { denominationValue: 1000, countUnits: 170 }, // 170,000
        { denominationValue: 500, countUnits: 16 },    // 8,000 -> Total = 178,000
      ],
      notes: 'جرد نهاية الوردية مع وجود عجز بسيط بقيمة 2000 ر.ي',
    });
    assert(countDraft.book_balance === 180000, '30. Book Balance correctly identified as 180,000');
    assert(countDraft.actual_balance === 178000, '31. Actual Physical Balance calculated as 178,000');
    assert(countDraft.discrepancy === -2000, '32. Shortage / Deficit of -2,000 Detected');

    // Approve count and trigger auto-adjustment
    const approvedCount = await BankingService.approveCashCount(countDraft.id);
    assert(approvedCount.status === 'APPROVED', '33. Cash Count Approved');
    assert(!!approvedCount.adjustment_transaction_id, '34. Auto-Adjustment Outflow Transaction Generated');
    assert(!!approvedCount.adjustment_journal_entry_id, '35. Deficit Journal Entry Posted (Debit 5303 / Credit Cash B)');

    // Verify Cash B balance matches the actual physical count of 178,000!
    const balCashBFinal = await BankingService.getAccountBalance('CASH', cashB.id);
    assert(balCashBFinal === 178000, '36. Cash B Ledger Balance now exactly matches Physical Count (178,000)', `Balance: ${balCashBFinal}`);

    // ----------------------------------------------------
    // Scenario 11: Liquidity Summary
    // ----------------------------------------------------
    console.log('\n--- Scenario 11: Liquidity Summary ---');
    const summary = await BankingService.getLiquiditySummary();
    assert(summary.totalLiquidity > 0, '37. Total Liquidity Computed Across All Cash Boxes & Banks');
    assert(summary.cashAccountsCount >= 2, '38. Cash Accounts Count Validated');
    assert(summary.bankAccountsCount >= 2, '39. Bank Accounts Count Validated');

    console.log('\n================================================================');
    console.log(`🎉 COMPLETED: ${passedTests}/${totalTests} Tests Passed Successfully!`);
    console.log('================================================================');

    return { totalTests, passedTests, success: passedTests === totalTests };
  } catch (error: any) {
    console.error('Fatal Test Suite Error:', error);
    process.exitCode = 1;
    return { totalTests, passedTests, success: false, error: error.message };
  }
}

// Auto-run if executed directly via node
if (process.argv[1] && process.argv[1].endsWith('banking.test.ts')) {
  runBankingTests().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}
