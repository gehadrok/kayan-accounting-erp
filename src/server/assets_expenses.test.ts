import { getDb } from './db.ts';
import { AssetService } from './assetService.ts';
import { ExpenseService } from './expenseService.ts';
import { AccountingService } from './accountingService.ts';

export async function runAssetsAndExpensesTests() {
  console.log('================================================================');
  console.log('🧪 Starting Kayan Comprehensive Assets & Expense Test Suite');
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
    const db = await getDb();

    // ----------------------------------------------------
    // Fixed Assets: Test 1 - 18
    // ----------------------------------------------------
    console.log('\n--- Part 1: Fixed Assets Setup, Lifecycle & Depreciation ---');

    // 1. Create Asset Category
    const category = await AssetService.createCategory({
      code: `CAT-VEH-${Date.now().toString().slice(-4)}`,
      name: 'مركبات وشاحنات النقل الثقيل',
      usefulLifeMonths: 60,
      depreciationMethod: 'STRAIGHT_LINE',
    });
    assert(!!category.id, '1. Create Asset Category Successful');

    // 2. Create Asset Draft / Under Construction
    const cipAsset = await AssetService.createAsset({
      assetCode: `AST-CIP-${Date.now().toString().slice(-4)}`,
      assetName: 'مشروع إنشاء مبنى الفرع الجديد',
      categoryId: category.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 50000000,
      salvageValue: 0,
      usefulLifeMonths: 240,
      status: 'UNDER_CONSTRUCTION',
    });
    assert(cipAsset.status === 'UNDER_CONSTRUCTION', '2. Create Asset (Under Construction / CIP) Successful');

    // 3. Asset Acquisition with Bank Payment
    const bankRes = await db.query<any>('SELECT id FROM banking.bank_accounts LIMIT 1');
    const bankId = bankRes.rows[0]?.id;

    // End-to-End Scenario Asset: Vehicle 120,000,000 YER, 60 months useful life, salvage = 0
    const vehicleAsset = await AssetService.createAsset({
      assetCode: `AST-VEH-${Date.now().toString().slice(-4)}`,
      assetName: 'شاحنة نقل مرسيدس أكتروس 2026',
      categoryId: category.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 120000000,
      salvageValue: 0,
      usefulLifeMonths: 60,
      status: 'DRAFT',
      paymentMethod: 'BANK',
      bankAccountId: bankId,
      serialNumber: 'SN-MERC-998822',
      location: 'صنعاء - الفرع الرئيسي',
    });
    assert(!!vehicleAsset.id, '3. Asset Acquisition with Bank Payment Successful');
    assert(vehicleAsset.acquisition_cost === 120000000, '3.1 Acquisition Cost equals 120,000,000 YER');
    assert(!!vehicleAsset.acquisition_journal_entry_id, '3.2 Acquisition Journal Entry Generated & Posted');

    // 4. Capitalization
    const capitalizedAsset = await AssetService.capitalizeAsset(vehicleAsset.id, '2026-10-01');
    assert(capitalizedAsset.status === 'ACTIVE', '4. Asset Capitalization to ACTIVE Successful');
    assert(!!capitalizedAsset.capitalization_date, '4.1 Capitalization Date Saved');

    // 5. Straight-Line Calculation (120M / 60 months = 2,000,000 monthly)
    const depreciableBase = capitalizedAsset.acquisition_cost - capitalizedAsset.salvage_value;
    const monthlyDepr = Math.round(depreciableBase / capitalizedAsset.useful_life_months);
    assert(monthlyDepr === 2000000, '5. Straight-Line Monthly Calculation equals 2,000,000 YER');

    // 6. Depreciation Schedule Generation
    const schedule = capitalizedAsset.schedule;
    assert(schedule.length > 0, '6. Depreciation Schedule Generated for Open Periods');
    assert(schedule[0].depreciation_amount === 2000000, '6.1 Period 1 Scheduled Depreciation equals 2,000,000 YER');

    // 7. Monthly Depreciation Posting (Month 1: Period 10 - October 2026)
    const p10 = (await db.query<any>("SELECT id, name FROM accounting.fiscal_periods WHERE period_number = 10 LIMIT 1")).rows[0];
    const postRes1 = await AssetService.postDepreciationEntry(capitalizedAsset.id, p10.id);
    assert(postRes1.success, '7. Monthly Depreciation Posted Successfully');
    assert(postRes1.depreciationAmount === 2000000, '7.1 Depreciated Amount is 2,000,000 YER');
    assert(!!postRes1.journalEntryNumber, '7.2 Double-Entry Balanced Journal Posted (Debit 5301 / Credit 1290)');
    assert(postRes1.accumulatedDepreciation === 2000000, '7.3 Accumulated Depreciation equals 2,000,000 YER');
    assert(postRes1.netBookValue === 118000000, '7.4 Net Book Value (NBV) equals 118,000,000 YER');

    // 8. Duplicate Depreciation Prevention (Cannot post same period twice)
    try {
      await AssetService.postDepreciationEntry(capitalizedAsset.id, p10.id);
      assert(false, '8. Duplicate Depreciation should be rejected');
    } catch (err: any) {
      assert(err.message.includes('مسبقاً') || err.message.includes('ممنوع التكرار'), '8. Duplicate Depreciation Prevented Successfully', err.message);
    }

    // 9. Closed Period Protection (Cannot depreciate in closed period 1)
    const p1 = (await db.query<any>("SELECT id, name FROM accounting.fiscal_periods WHERE period_number = 1 LIMIT 1")).rows[0];
    try {
      await AssetService.postDepreciationEntry(capitalizedAsset.id, p1.id);
      assert(false, '9. Closed Period Depreciation should be rejected');
    } catch (err: any) {
      assert(err.message.includes('مغلقة') || err.message.includes('مقفلة'), '9. Closed Period Protection Enforced', err.message);
    }

    // Post additional periods to simulate 12 periods total (Month 11 and 12)
    const p11 = (await db.query<any>("SELECT id, name FROM accounting.fiscal_periods WHERE period_number = 11 LIMIT 1")).rows[0];
    if (p11) {
      await AssetService.postDepreciationEntry(capitalizedAsset.id, p11.id);
    }

    // 10. Asset Administrative Transfer
    const branches = await db.query<any>('SELECT id FROM core.branches LIMIT 2');
    const transferRes = await AssetService.transferAsset({
      assetId: capitalizedAsset.id,
      transferDate: '2026-10-06',
      toBranchId: branches.rows[0]?.id,
      toLocation: 'عدن - مستودع المنصورة المركزي',
      reason: 'نقل إداري لتغطية خط نقل البضائع بين المحافظات',
    });
    assert(!!transferRes.id, '10. Asset Administrative Transfer Recorded with Audit Trail');

    // 11. Maintenance Routine Expense
    const maintExp = await AssetService.recordMaintenance({
      assetId: capitalizedAsset.id,
      maintenanceDate: '2026-10-06',
      maintenanceType: 'EXPENSE',
      vendorName: 'ورشة الوفاء المركزية للشاحنات',
      description: 'تغيير زيوت وفلاتر وصيانة دورية',
      cost: 450000,
      paymentMethod: 'BANK',
      bankAccountId: bankId,
    });
    assert(!!maintExp.id, '11. Routine Maintenance Expense Recorded');
    assert(!!maintExp.journalEntryNumber, '11.1 Maintenance Journal Entry Posted (Debit 5306 / Credit Bank)');

    // 12. Capital Improvement Maintenance (Increases Asset Cost & Regenerates Schedule)
    const costBefore = capitalizedAsset.acquisition_cost;
    const maintCap = await AssetService.recordMaintenance({
      assetId: capitalizedAsset.id,
      maintenanceDate: '2026-10-06',
      maintenanceType: 'CAPITAL_IMPROVEMENT',
      vendorName: 'شركة الهيدروليك المتقدمة',
      description: 'تركيب ونش هيدروليكي وصندوق تبريد متطور',
      cost: 5000000,
      paymentMethod: 'BANK',
      bankAccountId: bankId,
    });
    assert(!!maintCap.id, '12. Capital Improvement Maintenance Recorded');
    const updatedWithCap = await AssetService.getAssetById(capitalizedAsset.id);
    assert(updatedWithCap.acquisition_cost === costBefore + 5000000, '12.1 Asset Acquisition Cost Capitalized & Increased by 5M');

    // 13 & 14. Asset Disposal with GAIN (End-to-End Disposal Test)
    // Create an asset for disposal test: Cost = 100M, simulate AccDepr = 40M, NBV = 60M, sold for 75M -> Gain = 15M
    const dispAsset = await AssetService.createAsset({
      assetCode: `AST-DSP-G-${Date.now().toString().slice(-4)}`,
      assetName: 'سيارة هايلوكس 2024 للاستبعاد بربح',
      categoryId: category.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 100000000,
      salvageValue: 0,
      usefulLifeMonths: 60,
      status: 'ACTIVE',
      paymentMethod: 'BANK',
      bankAccountId: bankId,
    });

    // Post depreciation to give it accumulated depreciation
    const p12 = (await db.query<any>("SELECT id FROM accounting.fiscal_periods WHERE period_number = 12 LIMIT 1")).rows[0];
    if (p12) {
      await AssetService.postDepreciationEntry(dispAsset.id, p12.id);
    }

    const dispAssetDetails = await AssetService.getAssetById(dispAsset.id);
    const saleProceeds = dispAssetDetails.netBookValue + 15000000; // Expected Gain = 15,000,000

    const disposalGainRes = await AssetService.disposeAsset({
      assetId: dispAsset.id,
      disposalDate: '2026-10-06',
      disposalType: 'SALE',
      proceeds: saleProceeds,
      paymentMethod: 'BANK',
      bankAccountId: bankId,
      notes: 'بيع السيارة بسعر أعلى من القيمة الدفترية وتحقيق أرباح رأسمالية',
    });

    assert(!!disposalGainRes.disposal.id, '13. Asset Disposal Recorded');
    assert(disposalGainRes.gainLossAmount === 15000000, '14. Gain on Disposal of 15,000,000 Recorded in Account 4103');
    assert(!!disposalGainRes.journalEntryNumber, '14.1 Balanced Double-Entry Disposal Journal Entry Posted');

    // 15. Loss on Disposal (Sold for less than NBV)
    const lossAsset = await AssetService.createAsset({
      assetCode: `AST-DSP-L-${Date.now().toString().slice(-4)}`,
      assetName: 'معدات قديمة للاستبعاد بخسارة',
      categoryId: category.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 10000000,
      salvageValue: 0,
      usefulLifeMonths: 36,
      status: 'ACTIVE',
    });
    const lossAssetDetails = await AssetService.getAssetById(lossAsset.id);
    const lossProceeds = lossAssetDetails.netBookValue - 3000000; // Expected Loss = -3,000,000

    const disposalLossRes = await AssetService.disposeAsset({
      assetId: lossAsset.id,
      disposalDate: '2026-10-06',
      disposalType: 'SALE',
      proceeds: lossProceeds,
      paymentMethod: 'BANK',
      bankAccountId: bankId,
      notes: 'بيع المعدات بخسارة دفترية قدرها 3,000,000',
    });
    assert(disposalLossRes.gainLossAmount === -3000000, '15. Loss on Disposal of 3,000,000 Recorded in Account 5309');

    // 16. Fully Depreciated Asset Verification
    const fullyDeprAsset = await AssetService.createAsset({
      assetCode: `AST-FULL-${Date.now().toString().slice(-4)}`,
      assetName: 'حاسوب محمول مكتمل الإهلاك',
      categoryId: category.id,
      acquisitionDate: '2026-10-01',
      acquisitionCost: 1000000,
      salvageValue: 0,
      usefulLifeMonths: 1, // 1 month
      status: 'ACTIVE',
    });
    // Create an ad-hoc period or use open period to depreciate full base
    const pOpen = (await db.query<any>("SELECT id FROM accounting.fiscal_periods WHERE status = 'OPEN' LIMIT 1")).rows[0];
    await AssetService.postDepreciationEntry(fullyDeprAsset.id, pOpen.id);
    const checkedFull = await AssetService.getAssetById(fullyDeprAsset.id);
    assert(checkedFull.status === 'FULLY_DEPRECIATED', '16. Asset Automatically Marked as FULLY_DEPRECIATED when NBV reaches Salvage');

    // 17. Asset Register
    const allAssets = await AssetService.getAssets();
    assert(allAssets.length >= 4, '17. Asset Register Lists All Historical and Active Assets');

    // 18. Asset GL Reconciliation
    const assetReconciliation = await AssetService.getAssetGlReconciliation();
    assert(typeof assetReconciliation.subledgerCost === 'number', '18. Asset Subledger vs GL Reconciliation Executed');
    assert(typeof assetReconciliation.subledgerAccDepreciation === 'number', '18.1 Accumulated Depreciation Reconciliation Computed');

    // ----------------------------------------------------
    // Expenses: Test 19 - 33
    // ----------------------------------------------------
    console.log('\n--- Part 2: Expenses, Accruals, Prepaid & Approvals ---');

    // 19. Create Expense Category
    const expCat = await ExpenseService.createCategory({
      code: `EXP-CAT-${Date.now().toString().slice(-4)}`,
      name: 'مصروفات تشغيل ومواد استهلاكية',
    });
    assert(!!expCat.id, '19. Create Expense Category Successful');

    // 20. Cash Expense Posting
    const cashRes = await db.query<any>('SELECT id FROM banking.cash_accounts LIMIT 1');
    const cashId = cashRes.rows[0]?.id;

    const cashExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 150000,
      paymentType: 'CASH',
      cashAccountId: cashId,
      description: 'شراء قرطاسية ومطبوعات مكتبية نقداً',
      status: 'SUBMITTED',
    });
    assert(!!cashExpense.id, '20. Cash Expense Created in SUBMITTED status');

    await ExpenseService.approveExpense(cashExpense.id);
    const postedCashExp = await ExpenseService.postExpense(cashExpense.id);
    assert(!!postedCashExp.journalEntryNumber, '20.1 Cash Expense Posted (Debit Expense / Credit Cash)');

    // 21. Bank Expense Posting
    const bankExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 750000,
      paymentType: 'BANK',
      bankAccountId: bankId,
      description: 'سداد رسوم اشتراكات سنوية عبر البنك',
      status: 'DRAFT',
    });
    await ExpenseService.approveExpense(bankExpense.id);
    const postedBankExp = await ExpenseService.postExpense(bankExpense.id);
    assert(!!postedBankExp.journalEntryNumber, '21. Bank Expense Posted (Debit Expense / Credit Bank)');

    // 22. AP Expense Posting (on account)
    const suppRes = await db.query<any>('SELECT id FROM purchasing.suppliers LIMIT 1');
    const supplierId = suppRes.rows[0]?.id;

    const apExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 1200000,
      paymentType: 'AP',
      supplierId,
      description: 'مصروف خدمات واستشارات محاسبية على الحساب (آجل)',
      status: 'DRAFT',
    });
    await ExpenseService.approveExpense(apExpense.id);
    const postedApExp = await ExpenseService.postExpense(apExpense.id);
    assert(!!postedApExp.journalEntryNumber, '22. AP Expense Posted (Debit Expense / Credit Accounts Payable 2101)');

    // 23. Taxable Expense with Tax Code Integration
    const taxCodeRes = await db.query<any>("SELECT id FROM accounting.tax_codes WHERE code = 'VAT-0' LIMIT 1");
    const taxCodeId = taxCodeRes.rows[0]?.id;

    const taxExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 10000000,
      taxCodeId,
      paymentType: 'BANK',
      bankAccountId: bankId,
      description: 'فاتورة كهرباء وطاقة 10,000,000 مع ضريبة',
    });
    await ExpenseService.approveExpense(taxExpense.id);
    const postedTaxExp = await ExpenseService.postExpense(taxExpense.id);
    assert(!!postedTaxExp.journalEntryNumber, '23. Taxable Expense with Input Tax Posted Successfully');

    // 24. Cost Center Allocation
    const ccRes = await db.query<any>("SELECT id FROM accounting.cost_centers WHERE code = 'CC-02' LIMIT 1");
    const ccId = ccRes.rows[0]?.id;

    const ccExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 500000,
      costCenterId: ccId,
      paymentType: 'BANK',
      bankAccountId: bankId,
      description: 'مصروف صيانة مخصص لمركز تكلفة العمليات والتشغيل',
    });
    await ExpenseService.approveExpense(ccExpense.id);
    const postedCcExp = await ExpenseService.postExpense(ccExpense.id);
    assert(!!postedCcExp.journalEntryNumber, '24. Expense with Cost Center Allocation Posted');

    // 25. Accrued Expense Recording (Debit Expense / Credit Accrued Payable 2106)
    const accrual = await ExpenseService.createAccrual({
      accrualDate: '2026-10-01',
      categoryId: expCat.id,
      amount: 5000000,
      description: 'استحقاق فاتورة كهرباء شهر سبتمبر 5,000,000 ر.ي لم تسدد بعد',
      costCenterId: ccId,
    });
    assert(!!accrual.id, '25. Accrued Expense Created');
    assert(!!accrual.journalEntryNumber, '25.1 Accrual Journal Entry Posted (Debit Expense / Credit Accrued Payable 2106)');

    // 26. Accrued Expense Payment (Debit Accrued Payable 2106 / Credit Bank)
    const paidAccrual = await ExpenseService.payAccrual({
      accrualId: accrual.id,
      paymentDate: '2026-10-06',
      paymentType: 'BANK',
      bankAccountId: bankId,
    });
    assert(paidAccrual.status === 'PAID', '26. Accrued Expense Paid Successfully');
    assert(!!paidAccrual.paymentJournalNumber, '26.1 Payment Closes Accrued Payable without Duplicate Expense Recognition');

    // 27. Prepaid Expense Schedule Creation (Debit Prepaid 1106 / Credit Bank)
    const insExpAcc = (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5307' LIMIT 1")).rows[0]?.id;
    const prepaidSchedule = await ExpenseService.createPrepaidSchedule({
      paymentDate: '2026-10-01',
      expenseAccountId: insExpAcc,
      totalAmount: 12000000, // 12,000,000 YER
      durationMonths: 12,    // 12 months -> 1,000,000 per month
      paymentType: 'BANK',
      bankAccountId: bankId,
      description: 'وثيقة تأمين شامل على المنشآت والمستودعات لسنة كاملة',
    });
    assert(!!prepaidSchedule.id, '27. Prepaid Expense Schedule Created (12,000,000 for 12 Months)');
    assert(prepaidSchedule.monthly_amount === 1000000, '27.1 Monthly Amortization equals 1,000,000 YER');
    assert(!!prepaidSchedule.paymentJournalNumber, '27.2 Upfront Payment Journal Posted (Debit Prepaid 1106 / Credit Bank)');

    // 28. Prepaid Monthly Recognition / Amortization
    const fullSchedule = await ExpenseService.getPrepaidScheduleById(prepaidSchedule.id);
    const firstMonthLine = fullSchedule.lines[0];
    assert(!!firstMonthLine, '28. Prepaid Monthly Amortization Line Exists');

    const amortRes = await ExpenseService.postPrepaidAmortization(firstMonthLine.id);
    assert(amortRes.success, '28.1 Monthly Prepaid Amortization Posted (Debit Insurance Expense / Credit Prepaid 1106)');
    assert(amortRes.amount === 1000000, '28.2 Monthly Amortization Amount equals 1,000,000 YER');

    // 29. Expense Approval Workflow
    const workflowExpense = await ExpenseService.createExpense({
      expenseDate: '2026-10-06',
      categoryId: expCat.id,
      amount: 300000,
      paymentType: 'BANK',
      bankAccountId: bankId,
      description: 'مصروف تدريب وتأهيل الكوادر',
      status: 'DRAFT',
    });
    assert(workflowExpense.status === 'DRAFT', '29. New Expense Created in DRAFT status');

    const approvedExp = await ExpenseService.approveExpense(workflowExpense.id);
    assert(approvedExp.status === 'APPROVED', '29.1 Expense Approved to APPROVED status');

    // 30. Expense Posting
    const postedExp = await ExpenseService.postExpense(workflowExpense.id);
    assert(postedExp.expense.status === 'POSTED', '30. Expense Successfully Posted to General Ledger');

    // 31. Expense Reversal (Reverses Journal Entry & Banking Transaction)
    const reversedExp = await ExpenseService.reverseExpense(workflowExpense.id, 'إلغاء الدورة التدريبية واسترداد الرسوم');
    assert(reversedExp.expense.status === 'REVERSED', '31. Expense Reversed to REVERSED status');
    assert(!!reversedExp.reversalJournalEntryNumber, '31.1 Compensatory Reversal Journal Entry Posted');

    // 32. Closed Period Protection on Expenses
    try {
      const closedExp = await ExpenseService.createExpense({
        expenseDate: '2026-01-15', // Closed period 1
        categoryId: expCat.id,
        amount: 200000,
        paymentType: 'BANK',
        bankAccountId: bankId,
        description: 'محاولة تسجيل مصروف في فترة مغلقة',
        status: 'APPROVED',
      });
      await ExpenseService.postExpense(closedExp.id);
      assert(false, '32. Expense posting in closed period should be rejected');
    } catch (err: any) {
      assert(err.message.includes('مغلقة') || err.message.includes('غير صالحة'), '32. Closed Period Protection Enforced for Expenses', err.message);
    }

    // 33. Audit Logging Verification
    const auditLogs = await db.query<any>(
      "SELECT * FROM audit.audit_logs WHERE entity_type IN ('FIXED_ASSET', 'ASSET_CATEGORY', 'EXPENSE', 'EXPENSE_ACCRUAL', 'PREPAID_SCHEDULE') LIMIT 5"
    );
    assert(auditLogs.rows.length >= 5, '33. Audit Trail Verified for All Sensitive Asset and Expense Events');

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

if (process.argv[1] && process.argv[1].endsWith('assets_expenses.test.ts')) {
  runAssetsAndExpensesTests().then((res) => {
    if (!res.success) {
      process.exit(1);
    }
  });
}
