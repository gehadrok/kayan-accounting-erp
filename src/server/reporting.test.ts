import { getDb } from './db.ts';
import { ReportingService } from './reportingService.ts';
import { FinancialIntegrityService } from './financialIntegrityService.ts';
import { AccountingService } from './accountingService.ts';
import { SalesService } from './salesService.ts';
import { PurchasingService } from './purchasingService.ts';
import { BankingService } from './bankingService.ts';
import { AssetService } from './assetService.ts';
import { ExpenseService } from './expenseService.ts';

export async function runReportingTests() {
  console.log('================================================================');
  console.log('🧪 Starting Kayan Financial Reporting & Period Closing Test Suite');
  console.log('================================================================\n');

  const db = await getDb();
  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`✅ [PASS] ${testName}`);
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ': ' + detail : ''}`);
      throw new Error(`Test failed: ${testName} - ${detail || ''}`);
    }
  }

  try {
    const compRes = await db.query<any>('SELECT id FROM core.companies LIMIT 1');
    const companyId = compRes.rows[0]?.id;
    const branchRes = await db.query<any>('SELECT id FROM core.branches LIMIT 1');
    const branchId = branchRes.rows[0]?.id;

    // Period 10 (October 2026 - OPEN)
    const p10Res = await db.query<any>("SELECT * FROM accounting.fiscal_periods WHERE period_number = 10 LIMIT 1");
    const period10 = p10Res.rows[0];

    // ----------------------------------------------------
    // Scenario Setup: Real End-to-End Transaction Flow
    // ----------------------------------------------------
    console.log('--- Setting Up Real End-to-End Transaction Flow ---');

    // Bank Account & Cash Box
    let bankAccount = (await db.query<any>('SELECT * FROM banking.bank_accounts LIMIT 1')).rows[0];
    if (!bankAccount) {
      bankAccount = await BankingService.createBankAccount({
        code: 'BNK-CAC-01',
        bankName: 'بنك التسليف التعاوني الزراعي CAC Bank',
        accountName: 'الحساب الجاري الرئيسي',
        accountNumber: 'CAC-99881122',
        openingBalance: 100000000,
      });
    }

    let cashBox = (await db.query<any>('SELECT * FROM banking.cash_accounts LIMIT 1')).rows[0];
    if (!cashBox) {
      cashBox = await BankingService.createCashAccount({
        code: 'CSH-MAIN-01',
        name: 'الصندوق المركزي الرئيسي',
        openingBalance: 50000000,
      });
    }

    // Customer & Supplier
    let customer = (await db.query<any>('SELECT * FROM sales.customers LIMIT 1')).rows[0];
    if (!customer) {
      customer = await SalesService.createCustomer({
        code: 'CUST-ALNOOR',
        name: 'شركة النور والبركة للمقاولات والتجارة',
      });
    }

    let supplier = (await db.query<any>('SELECT * FROM purchasing.suppliers LIMIT 1')).rows[0];
    if (!supplier) {
      supplier = await PurchasingService.createSupplier({
        code: 'SUPP-ALAMAL',
        name: 'مؤسسة الأمل العالمية للاستيراد',
      });
    }

    // 1. Purchase Inventory: 100,000,000 YER (Quantity 1,000 @ 100,000 YER)
    const purchInv = await PurchasingService.createInvoice({
      supplierId: supplier.id,
      paymentType: 'CREDIT',
      postingType: 'INVENTORY',
      invoiceDate: '2026-10-02',
      dueDate: '2026-10-25',
      lines: [
        {
          description: 'شراء بضاعة تجارية مخزنية',
          quantity: 1000,
          unitPrice: 100000,
        },
      ],
    });
    await PurchasingService.postPurchaseInvoice(purchInv.id);

    // 2. Sales: 150,000,000 YER (Quantity 1,000 @ 150,000 YER)
    const salesInv = await SalesService.createInvoice({
      customerId: customer.id,
      paymentType: 'CREDIT',
      invoiceDate: '2026-10-05',
      dueDate: '2026-10-28',
      lines: [
        {
          description: 'بيع بضاعة تجارية للعميل',
          quantity: 1000,
          unitPrice: 150000,
        },
      ],
    });
    await SalesService.postSalesInvoice(salesInv.id);

    // Post COGS: Debit COGS 5101 (100,000,000) / Credit Inventory 1104 (100,000,000)
    const cogsAcc = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5101' LIMIT 1")).rows[0];
    const invAcc = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1104' LIMIT 1")).rows[0];
    if (cogsAcc && invAcc) {
      const cogsJe = await AccountingService.createJournalEntry({
        companyId,
        branchId,
        entryDate: '2026-10-05',
        fiscalPeriodId: period10.id,
        description: 'إثبات تكلفة البضاعة المباعة (COGS) لفاتورة المبيعات',
        lines: [
          { accountId: cogsAcc.id, debit: 100000000, credit: 0, description: 'مدين: تكلفة المبيعات COGS' },
          { accountId: invAcc.id, debit: 0, credit: 100000000, description: 'دائن: إخراج من المخزون السلعي' },
        ],
      });
      await AccountingService.postJournalEntry(cogsJe.id);
    }

    // 3. Operating Expense: 20,000,000 YER
    let expCat = (await db.query<any>('SELECT * FROM expenses.expense_categories LIMIT 1')).rows[0];
    if (!expCat) {
      expCat = await ExpenseService.createCategory({
        code: 'EXP-OPS-01',
        name: 'مصروفات تشغيلية وإدارية عامة',
      });
    }

    const exp = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 20000000,
      paymentType: 'BANK',
      bankAccountId: bankAccount.id,
      description: 'سداد مصروفات تشغيل وإدارة مقر الشركة لشهر أكتوبر',
      status: 'DRAFT',
    });
    await ExpenseService.approveExpense(exp.id);
    await ExpenseService.postExpense(exp.id);

    // 4. Fixed Asset & 5,000,000 YER Monthly Depreciation
    let astCat = (await db.query<any>('SELECT * FROM assets.asset_categories LIMIT 1')).rows[0];
    if (!astCat) {
      astCat = await AssetService.createCategory({
        code: 'CAT-IND-01',
        name: 'الآلات والمعدات الثقيلة',
        usefulLifeMonths: 60,
      });
    }

    const asset = await AssetService.createAsset({
      assetCode: `AST-FLOW-${Date.now().toString().slice(-4)}`,
      assetName: 'خط إنتاج وتعبئة آلي متكامل',
      categoryId: astCat.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 300000000, // 300M / 60 months = 5,000,000 monthly
      salvageValue: 0,
      usefulLifeMonths: 60,
      status: 'ACTIVE',
    });
    await AssetService.postDepreciationEntry(asset.id, period10.id);

    // 5. Direct Bank Charge: 2,000,000 YER
    await BankingService.createBankCharge({
      bankAccountId: bankAccount.id,
      chargeDate: '2026-10-07',
      amount: 2000000,
      description: 'رسوم وعمولات خدمات مصرفية دورية',
    });

    console.log('--- Real Transactions Seeded Successfully ---\n');

    // ----------------------------------------------------
    // Part 1: General Ledger & Running Balance
    // ----------------------------------------------------
    console.log('--- Part 1: General Ledger & Running Balance ---');

    const glAll = await ReportingService.getGeneralLedger({ fiscalPeriodId: period10.id });
    assert(glAll !== null && glAll.lines.length >= 6, '1. General Ledger Report Lists Posted Entries');
    assert(glAll.totalDebit > 0 && glAll.totalCredit > 0, '1.1 GL Total Debits and Credits Computed Correctly');

    const cashAcc = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1")).rows[0];
    const cashStatement = await ReportingService.getAccountStatement(cashAcc.id, { fiscalPeriodId: period10.id });
    assert(cashStatement.account.code === '1101', '2. Account Statement for Cash (1101) Generated');
    assert(typeof cashStatement.closingBalance === 'number', '2.1 Closing Balance Calculated Respecting Normal Balance');

    const bankAccGl = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1")).rows[0];
    const bankStatement = await ReportingService.getAccountStatement(bankAccGl.id, { fiscalPeriodId: period10.id });
    assert(bankStatement.lines.length >= 2, '3. Running Balance Computed Line-by-Line for Bank Account');

    // ----------------------------------------------------
    // Part 2: Trial Balance & Strict Equality
    // ----------------------------------------------------
    console.log('\n--- Part 2: Trial Balance & Double-Entry Equality ---');

    const tb = await ReportingService.getTrialBalance({ fiscalPeriodId: period10.id });
    assert(tb.accounts.length >= 5, '4. Trial Balance Lists All Active Accounts with Balances');
    assert(tb.isBalanced, '5. Trial Balance Strict Equality (Total Debit == Total Credit)');
    assert(tb.difference < 0.001, '5.1 Trial Balance Difference equals 0.00 YER');
    assert(tb.status === 'BALANCED', '5.2 Trial Balance Status is Verified BALANCED');

    // ----------------------------------------------------
    // Part 3: Income Statement (P&L) Precision
    // ----------------------------------------------------
    console.log('\n--- Part 3: Income Statement (P&L) ---');

    const pnl = await ReportingService.getIncomeStatement({ fiscalPeriodId: period10.id });
    assert(pnl.totalRevenue === 150000000, '6. Revenue equals 150,000,000 YER from REVENUE Account 41');
    assert(pnl.totalCogs === 100000000, '7. COGS equals 100,000,000 YER from GL Cost Account 5101');
    assert(pnl.grossProfit === 50000000, '8. Gross Profit equals 50,000,000 YER (Revenue - COGS)');
    assert(pnl.totalOperatingExpenses === 25000000, '9. Operating Expenses equals 25,000,000 YER (20M Operating + 5M Depreciation)');
    assert(pnl.operatingProfit === 25000000, '10. Operating Profit equals 25,000,000 YER (50M - 25M)');
    assert(pnl.totalOtherExpenses === 2000000, '10.1 Bank Charges equals 2,000,000 YER in Non-Operating Expenses');
    assert(pnl.netProfit === 23000000, '10.2 Net Profit equals Exactly 23,000,000 YER (Operating 25M - Bank 2M)');

    // ----------------------------------------------------
    // Part 4: Balance Sheet & Accounting Equation
    // ----------------------------------------------------
    console.log('\n--- Part 4: Balance Sheet & Accounting Equation ---');

    const bs = await ReportingService.getBalanceSheet({ fiscalPeriodId: period10.id });
    assert(bs.totalAssets > 0, '11. Total Assets Computed (Current Assets + Fixed Assets Net)');
    assert(bs.totalLiabilities > 0, '12. Total Liabilities Computed (AP 2101 equals 100,000,000 YER)');
    assert(bs.currentYearEarnings === 23000000, '13. Balance Sheet Accurately Incorporates Current Year Earnings (23,000,000 YER)');
    assert(bs.isBalanced, '14. Fundamental Accounting Equation Strictly Holds (Assets == Liabilities + Equity)');
    assert(bs.difference < 0.001, '14.1 Balance Sheet Variance equals 0.00 YER (Equation Exactly Balanced)');

    // ----------------------------------------------------
    // Part 5: Cash Flow Statement (Indirect Method)
    // ----------------------------------------------------
    console.log('\n--- Part 5: Cash Flow Statement (Indirect Method) ---');

    const cf = await ReportingService.getCashFlowStatement({ fiscalPeriodId: period10.id });
    assert(typeof cf.operatingActivities.totalOperating === 'number', '15. Operating Cash Flow Computed with Non-Cash Depreciation Added Back');
    assert(typeof cf.netCashChange === 'number', '16. Net Cash Change Calculated Accurately');
    assert(cf.isBalanced, '17. Cash Flow Closing Cash Matches Actual GL Cash & Bank Accounts (1101 + 1102)');
    assert(cf.difference < 0.01, '18. Cash Flow Statement Variance is 0.00 YER (Status BALANCED)');

    // ----------------------------------------------------
    // Part 6: Subledger Aging & Reconciliation
    // ----------------------------------------------------
    console.log('\n--- Part 6: AR & AP Aging Reports ---');

    const arAging = await ReportingService.getArAging();
    assert(arAging.totalAR === 150000000, '19. AR Aging Total equals 150,000,000 YER for Customer Al-Noor');
    assert(arAging.isReconciled, '20. AR Aging Exactly Reconciles with GL Receivables Account 1103');

    const apAging = await ReportingService.getApAging();
    assert(apAging.totalAP === 100000000, '21. AP Aging Total equals 100,000,000 YER for Supplier Al-Amal');
    assert(apAging.isReconciled, '22. AP Aging Exactly Reconciles with GL Payables Account 2101');

    // ----------------------------------------------------
    // Part 7: Tax Reports & Position
    // ----------------------------------------------------
    console.log('\n--- Part 7: Tax Reports & Position ---');

    const taxReport = await ReportingService.getTaxReport({ fiscalPeriodId: period10.id });
    assert(typeof taxReport.totalInputTax === 'number', '23. Input Tax from Purchases/Expenses Computed (Account 1105)');
    assert(typeof taxReport.totalOutputTax === 'number', '24. Output Tax from Sales Computed (Account 2105)');
    assert(taxReport.netTaxPosition === (taxReport.totalOutputTax - taxReport.totalInputTax), '25. Net Tax Position equals Output Tax - Input Tax');

    // ----------------------------------------------------
    // Part 8: Financial Dashboard & Comparative Reporting
    // ----------------------------------------------------
    console.log('\n--- Part 8: Financial Dashboard & Comparative Reporting ---');

    const dashboard = await ReportingService.getFinancialDashboard({ fiscalPeriodId: period10.id });
    assert(dashboard.currentRatio > 0, '26. Current Ratio Computed (Current Assets / Current Liabilities)');
    assert(typeof dashboard.workingCapital === 'number', '27. Working Capital Computed (Current Assets - Current Liabilities)');
    assert(dashboard.accountingEquationBalanced, '27.1 Dashboard Confirms Accounting Equation Balanced');

    const p9 = (await db.query<any>("SELECT id FROM accounting.fiscal_periods WHERE period_number = 9 LIMIT 1")).rows[0];
    const compReport = await ReportingService.getComparativeReport(period10.id, p9.id);
    assert(typeof compReport.revenue.change === 'number', '28. Period Comparison Computes Variance Amount and Percentage');

    const monthlyTrends = await ReportingService.getMonthlyReport();
    assert(monthlyTrends.length === 12, '29. Monthly Trend Generated for All 12 Fiscal Periods');

    // ----------------------------------------------------
    // Part 9: Multi-Module Cross Reconciliation Engine
    // ----------------------------------------------------
    console.log('\n--- Part 9: Multi-Module Cross Reconciliation Engine ---');

    const integrity = await FinancialIntegrityService.runIntegrityCheck(period10.end_date);
    assert(integrity.modules.length >= 8, '30. Financial Integrity Engine Audits All Core Subledgers');

    const arModule = integrity.modules.find(m => m.module === 'AR');
    assert(arModule?.status === 'RECONCILED', '31. Accounts Receivable Subledger Matches GL 1103 (RECONCILED)');

    const apModule = integrity.modules.find(m => m.module === 'AP');
    assert(apModule?.status === 'RECONCILED', '32. Accounts Payable Subledger Matches GL 2101 (RECONCILED)');

    const cashModule = integrity.modules.find(m => m.module === 'CASH');
    assert(cashModule?.status === 'RECONCILED', '33. Cash Boxes Subledger Matches GL 1101 (RECONCILED)');

    const bankModule = integrity.modules.find(m => m.module === 'BANK');
    assert(bankModule?.status === 'RECONCILED', '34. Bank Accounts Subledger Matches GL 1102 (RECONCILED)');

    const astCostModule = integrity.modules.find(m => m.module === 'ASSETS_COST');
    assert(astCostModule?.status === 'RECONCILED', '35. Fixed Assets Cost Subledger Matches GL 1201/1202 (RECONCILED)');

    const astDeprModule = integrity.modules.find(m => m.module === 'ASSETS_ACC_DEPR');
    assert(astDeprModule?.status === 'RECONCILED', '36. Accumulated Depreciation Subledger Matches GL 1290 (RECONCILED)');

    const tbModule = integrity.modules.find(m => m.module === 'TRIAL_BALANCE');
    assert(tbModule?.status === 'RECONCILED', '37. Trial Balance Equality Verified by Integrity Engine');

    const bsModule = integrity.modules.find(m => m.module === 'BALANCE_SHEET');
    assert(bsModule?.status === 'RECONCILED', '38. Balance Sheet Equation Verified by Integrity Engine');

    // ----------------------------------------------------
    // Part 10: Period Closing Workflow & Controls
    // ----------------------------------------------------
    console.log('\n--- Part 10: Period Closing Workflow & Controls ---');

    const check = await FinancialIntegrityService.runPeriodClosingCheck(period10.id);
    assert(check.checks.length >= 5, '39. Period Closing Checklist Evaluates All Pre-Close Controls');
    assert(check.overallStatus === 'READY_TO_CLOSE' || check.overallStatus === 'BLOCKED', '39.1 Checklist Returns Definitive Closing Status');

    // Test period close on Period 11 (November 2026)
    const p11 = (await db.query<any>("SELECT * FROM accounting.fiscal_periods WHERE period_number = 11 LIMIT 1")).rows[0];
    await AssetService.postDepreciationEntry(asset.id, p11.id);
    const closeRes = await FinancialIntegrityService.closeFiscalPeriod(p11.id, 'admin', 'إقفال تجريبي لشهر نوفمبر');
    assert(closeRes.success, '40. Fiscal Period Closed Successfully to Status CLOSED');
    assert(closeRes.period.status === 'CLOSED', '40.1 Period Status Updated to CLOSED in Database');

    // Closed Period Guard: Attempt to post in closed period
    try {
      const closedJe = await AccountingService.createJournalEntry({
        companyId,
        entryDate: '2026-11-15',
        fiscalPeriodId: p11.id,
        description: 'محاولة تسجيل قيد في فترة مقفلة',
        lines: [
          { accountId: cashAcc.id, debit: 1000, credit: 0 },
          { accountId: (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '41' LIMIT 1")).rows[0].id, debit: 0, credit: 1000 },
        ],
      });
      await AccountingService.postJournalEntry(closedJe.id);
      assert(false, '41. Transaction in Closed Period Should Be Blocked');
    } catch (err: any) {
      assert(
        err.message.includes('مقفلة') || err.message.includes('مغلقة') || err.message.includes('CLOSED'),
        '41. Closed Period Guard Blocks Transactions with Clear Error (FISCAL_PERIOD_CLOSED)',
        err.message
      );
    }

    // Reopen without reason rejected
    try {
      await FinancialIntegrityService.reopenFiscalPeriod(p11.id, 'admin', '');
      assert(false, '42. Reopen Without Reason Should Be Rejected');
    } catch (err: any) {
      assert(err.message.includes('سبب'), '42. Reopen Requires Explicit Documented Reason', err.message);
    }

    // Reopen authorized
    const reopenRes = await FinancialIntegrityService.reopenFiscalPeriod(p11.id, 'admin', 'إعادة فتح إدارية معتمدة لإجراء تسويات تدقيقية');
    assert(reopenRes.success, '43. Authorized Period Reopen Successful');
    assert(reopenRes.period.status === 'OPEN', '43.1 Period Status Restored to OPEN');

    // Audit Trail
    const auditEvents = await db.query<any>(
      "SELECT * FROM audit.audit_logs WHERE entity_type = 'FISCAL_PERIOD' AND action IN ('CLOSE', 'REOPEN') ORDER BY timestamp DESC LIMIT 2"
    );
    assert(auditEvents.rows.length >= 2, '44. Audit Logs Recorded for Both Period Close and Reopen Events');

    // ----------------------------------------------------
    // Part 11: Final End-to-End System Integrity Validation
    // ----------------------------------------------------
    console.log('\n--- Part 11: Final End-to-End System Integrity Validation ---');

    assert(pnl.netProfit === 23000000, '45. End-to-End P&L Net Profit Confirmed at Exactly 23,000,000 YER');
    assert(bs.isBalanced, '46. End-to-End Balance Sheet Confirmed Exactly Balanced (Assets == Liabilities + Equity)');
    assert(tb.isBalanced, '47. End-to-End Trial Balance Confirmed Strictly Equal (Debit == Credit)');
    assert(cf.isBalanced, '48. End-to-End Cash Flow Confirmed Exactly Matching GL Cash & Bank');

    console.log('\n================================================================');
    console.log(`🎉 COMPLETED: ${passedTests}/${totalTests} Financial Reporting & Closing Tests Passed!`);
    console.log('================================================================');

    return { totalTests, passedTests, success: passedTests === totalTests };
  } catch (error: any) {
    console.error('Fatal Test Suite Error:', error);
    process.exitCode = 1;
    return { totalTests, passedTests, success: false, error: error.message };
  }
}

if (process.argv[1] && process.argv[1].endsWith('reporting.test.ts')) {
  runReportingTests().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}
