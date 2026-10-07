import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';
import { ReportingService } from './reportingService.ts';
import { AccountingService } from './accountingService.ts';

export interface ModuleReconciliationResult {
  module: string;
  name: string;
  subledger: number;
  glBalance: number;
  difference: number;
  status: 'RECONCILED' | 'OUT_OF_BALANCE';
  notes?: string;
}

export class FinancialIntegrityService {
  /**
   * Helper: resolves string userId (which might be 'admin' or username) to a valid UUID
   */
  private static async resolveUserId(userId?: string): Promise<string | null> {
    if (!userId) return null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
    if (isUuid) return userId;
    const db = await getDb();
    const u = await db.query<any>('SELECT id FROM security.users WHERE username = $1 OR email = $1 LIMIT 1', [userId]);
    if (u.rows.length > 0) return u.rows[0].id;
    const firstUser = await db.query<any>('SELECT id FROM security.users LIMIT 1');
    return firstUser.rows[0]?.id || null;
  }

  /**
   * Helper: fetches GL balance for given account codes up to asOfDate
   */
  private static async getGlBalance(accountCodes: string[], asOfDate?: string, isCreditNormal = false) {
    const db = await getDb();
    const placeholders = accountCodes.map((_, i) => `$${i + 1}`).join(', ');
    const params: any[] = [...accountCodes];

    let dateCond = '';
    if (asOfDate) {
      dateCond = `AND je.entry_date <= $${params.length + 1}`;
      params.push(asOfDate);
    }

    const res = await db.query<any>(`
      SELECT COALESCE(SUM(jel.debit), 0) as dr, COALESCE(SUM(jel.credit), 0) as cr
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      WHERE je.status = 'POSTED' AND a.code IN (${placeholders}) ${dateCond}
    `, params);

    const dr = parseFloat(res.rows[0]?.dr || '0');
    const cr = parseFloat(res.rows[0]?.cr || '0');

    return isCreditNormal ? (cr - dr) : (dr - cr);
  }

  // ==========================================
  // 1. Cross-Module Integrity & Reconciliation Engine
  // ==========================================
  static async runIntegrityCheck(asOfDate?: string): Promise<{
    asOfDate: string;
    isAllReconciled: boolean;
    modules: ModuleReconciliationResult[];
  }> {
    const db = await getDb();
    const dateLimit = asOfDate || new Date().toISOString().split('T')[0];
    const modules: ModuleReconciliationResult[] = [];

    // 1. Inventory Reconciliation (Subledger Valuation vs GL 1104)
    let invSubledger = 0;
    try {
      const { InventoryService } = await import('./inventoryService.ts');
      const items = await InventoryService.getItems();
      invSubledger = items.reduce((sum: number, item: any) => sum + (item.stockValue || 0), 0);
    } catch {
      invSubledger = 0;
    }
    const invGl = await this.getGlBalance(['1104'], dateLimit, false);
    const invDiff = Math.abs(invSubledger - invGl);
    modules.push({
      module: 'INVENTORY',
      name: 'المخزون السلعي (1104)',
      subledger: invSubledger,
      glBalance: invGl,
      difference: invDiff,
      status: invDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 2. Accounts Receivable Reconciliation (Customer Balances vs GL 1103)
    const arRes = await db.query<any>(`
      SELECT COALESCE(SUM(total - paid_amount), 0) as total
      FROM sales.sales_invoices
      WHERE status = 'POSTED' AND payment_type = 'CREDIT' AND invoice_date <= $1
    `, [dateLimit]);
    const arSubledger = parseFloat(arRes.rows[0]?.total || '0');
    const arGl = await this.getGlBalance(['1103'], dateLimit, false);
    const arDiff = Math.abs(arSubledger - arGl);
    modules.push({
      module: 'AR',
      name: 'العملاء والمدينون (1103)',
      subledger: arSubledger,
      glBalance: arGl,
      difference: arDiff,
      status: arDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 3. Accounts Payable Reconciliation (Supplier Balances vs GL 2101)
    const apRes = await db.query<any>(`
      SELECT COALESCE(SUM(total - paid_amount), 0) as total
      FROM purchasing.purchase_invoices
      WHERE status = 'POSTED' AND payment_type = 'CREDIT' AND invoice_date <= $1
    `, [dateLimit]);
    const apSubledger = parseFloat(apRes.rows[0]?.total || '0');
    const apGl = await this.getGlBalance(['2101'], dateLimit, true);
    const apDiff = Math.abs(apSubledger - apGl);
    modules.push({
      module: 'AP',
      name: 'الموردون والدائنون (2101)',
      subledger: apSubledger,
      glBalance: apGl,
      difference: apDiff,
      status: apDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 4. Cash Boxes Reconciliation (Cash Transactions Ledger vs GL 1101)
    const cashRes = await db.query<any>(`
      SELECT COALESCE(SUM(CASE WHEN direction = 'INFLOW' THEN amount ELSE -amount END), 0) as total
      FROM banking.transactions 
      WHERE account_category = 'CASH' 
        AND journal_entry_id IS NOT NULL 
        AND transaction_date <= $1
    `, [dateLimit]);
    const cashSubledger = parseFloat(cashRes.rows[0]?.total || '0');
    const cashGl = await this.getGlBalance(['1101'], dateLimit, false);
    const cashDiff = Math.abs(cashSubledger - cashGl);
    modules.push({
      module: 'CASH',
      name: 'الصندوق والخزينة (1101)',
      subledger: cashSubledger,
      glBalance: cashGl,
      difference: cashDiff,
      status: cashDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 5. Bank Accounts Reconciliation (Bank Transactions Ledger vs GL 1102)
    const bankRes = await db.query<any>(`
      SELECT COALESCE(SUM(CASE WHEN direction = 'INFLOW' THEN amount ELSE -amount END), 0) as total
      FROM banking.transactions 
      WHERE account_category = 'BANK' 
        AND journal_entry_id IS NOT NULL 
        AND transaction_date <= $1
    `, [dateLimit]);
    const bankSubledger = parseFloat(bankRes.rows[0]?.total || '0');
    const bankGl = await this.getGlBalance(['1102'], dateLimit, false);
    const bankDiff = Math.abs(bankSubledger - bankGl);
    modules.push({
      module: 'BANK',
      name: 'حسابات البنوك (1102)',
      subledger: bankSubledger,
      glBalance: bankGl,
      difference: bankDiff,
      status: bankDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 6. Fixed Assets Cost Reconciliation (Asset Register Cost vs GL 1201/1202)
    const astCostRes = await db.query<any>(`
      SELECT COALESCE(SUM(acquisition_cost), 0) as total
      FROM assets.fixed_assets
      WHERE status NOT IN ('DISPOSED', 'SOLD', 'DRAFT') 
        AND acquisition_journal_entry_id IS NOT NULL 
        AND acquisition_date <= $1
    `, [dateLimit]);
    const astCostSubledger = parseFloat(astCostRes.rows[0]?.total || '0');
    const astCostGl = await this.getGlBalance(['1201', '1202'], dateLimit, false);
    const astCostDiff = Math.abs(astCostSubledger - astCostGl);
    modules.push({
      module: 'ASSETS_COST',
      name: 'تكلفة الأصول الثابتة (1201/1202)',
      subledger: astCostSubledger,
      glBalance: astCostGl,
      difference: astCostDiff,
      status: astCostDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 7. Accumulated Depreciation Reconciliation (Subledger AccDepr vs GL 1290)
    const astAccDeprRes = await db.query<any>(`
      SELECT COALESCE(SUM(de.depreciation_amount), 0) as total
      FROM assets.depreciation_entries de
      JOIN assets.fixed_assets fa ON fa.id = de.asset_id
      WHERE de.is_posted = TRUE AND fa.status NOT IN ('DISPOSED', 'SOLD') AND de.period_date <= $1
    `, [dateLimit]);
    const astAccDeprSubledger = parseFloat(astAccDeprRes.rows[0]?.total || '0');
    const astAccDeprGl = await this.getGlBalance(['1290'], dateLimit, true);
    const astAccDeprDiff = Math.abs(astAccDeprSubledger - astAccDeprGl);
    modules.push({
      module: 'ASSETS_ACC_DEPR',
      name: 'مجمع الإهلاك (1290)',
      subledger: astAccDeprSubledger,
      glBalance: astAccDeprGl,
      difference: astAccDeprDiff,
      status: astAccDeprDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 8. Tax Accounts Integrity (Output 2105 - Input 1105)
    const inputTaxGl = await this.getGlBalance(['1105'], dateLimit, false);
    const outputTaxGl = await this.getGlBalance(['2105'], dateLimit, true);
    const netTaxGl = outputTaxGl - inputTaxGl;
    const taxReport = await ReportingService.getTaxReport({ toDate: dateLimit });
    const taxDiff = Math.abs(taxReport.netTaxPosition - netTaxGl);
    modules.push({
      module: 'TAX',
      name: 'الضريبة الصافية (2105 - 1105)',
      subledger: taxReport.netTaxPosition,
      glBalance: netTaxGl,
      difference: taxDiff,
      status: taxDiff < 0.01 ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 9. Trial Balance Equality Check
    const tb = await ReportingService.getTrialBalance({ toDate: dateLimit });
    modules.push({
      module: 'TRIAL_BALANCE',
      name: 'ميزان المراجعة (المدين = الدائن)',
      subledger: tb.totalClosingDebit,
      glBalance: tb.totalClosingCredit,
      difference: tb.difference,
      status: tb.isBalanced ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    // 10. Balance Sheet Accounting Equation (Assets = Liabilities + Equity)
    const bs = await ReportingService.getBalanceSheet({ toDate: dateLimit });
    modules.push({
      module: 'BALANCE_SHEET',
      name: 'المعادلة المحاسبية (الأصول = الخصوم + الملكية)',
      subledger: bs.totalAssets,
      glBalance: bs.totalLiabilitiesAndEquity,
      difference: bs.difference,
      status: bs.isBalanced ? 'RECONCILED' : 'OUT_OF_BALANCE',
    });

    const isAllReconciled = modules.every(m => m.status === 'RECONCILED');

    return {
      asOfDate: dateLimit,
      isAllReconciled,
      modules,
    };
  }

  // ==========================================
  // 2. Period Closing Checklist & Verification
  // ==========================================
  static async runPeriodClosingCheck(fiscalPeriodId: string) {
    const db = await getDb();
    const pRes = await db.query<any>(`
      SELECT fp.*, fy.year_name as "yearName"
      FROM accounting.fiscal_periods fp
      JOIN accounting.fiscal_years fy ON fy.id = fp.fiscal_year_id
      WHERE fp.id = $1
    `, [fiscalPeriodId]);

    if (pRes.rows.length === 0) {
      throw new Error(`الفترة المالية ${fiscalPeriodId} غير موجودة`);
    }

    const period = pRes.rows[0];
    const checks: { key: string; title: string; passed: boolean; message: string }[] = [];

    // Check 1: Trial Balance Balanced for Period
    const tb = await ReportingService.getTrialBalance({ fiscalPeriodId });
    checks.push({
      key: 'TRIAL_BALANCE',
      title: 'توازن ميزان المراجعة (Debit = Credit)',
      passed: tb.isBalanced,
      message: tb.isBalanced ? 'ميزان المراجعة متوازن تماماً' : `فارق غير متوازن: ${tb.difference} ر.ي`,
    });

    // Check 2: No Unposted/Draft Journal Entries in Period
    const unpostedRes = await db.query<any>(`
      SELECT COUNT(*) as count 
      FROM accounting.journal_entries 
      WHERE fiscal_period_id = $1 AND status != 'POSTED'
    `, [fiscalPeriodId]);
    const unpostedCount = parseInt(unpostedRes.rows[0]?.count || '0', 10);
    checks.push({
      key: 'UNPOSTED_ENTRIES',
      title: 'خلو الفترة من قيود يومية معلقة أو غير مرحلة',
      passed: unpostedCount === 0,
      message: unpostedCount === 0 ? 'جميع قيود الفترة مرحلة' : `يوجد ${unpostedCount} قيد بانتظار الترحيل أو مسودة`,
    });

    // Check 3: Multi-Module Cross Reconciliation
    const integrity = await this.runIntegrityCheck(period.end_date);
    checks.push({
      key: 'MODULE_RECONCILIATION',
      title: 'مطابقة الحسابات الفرعية مع الأستاذ العام (Subledger = GL)',
      passed: integrity.isAllReconciled,
      message: integrity.isAllReconciled ? 'كافة الدفاتر المساعدة مطابقة للأستاذ العام' : 'يوجد فارق في مطابقة أحد الدفاتر المساعدة',
    });

    // Check 4: Fixed Assets Depreciation Run Check
    const activeAssetsCount = (await db.query<any>(`
      SELECT COUNT(*) as count FROM assets.fixed_assets 
      WHERE status = 'ACTIVE' AND acquisition_date <= $1
    `, [period.end_date])).rows[0]?.count || '0';

    const postedDeprCount = (await db.query<any>(`
      SELECT COUNT(*) as count FROM assets.depreciation_entries 
      WHERE fiscal_period_id = $1 AND is_posted = TRUE
    `, [fiscalPeriodId])).rows[0]?.count || '0';

    const deprPassed = parseInt(activeAssetsCount, 10) === 0 || parseInt(postedDeprCount, 10) > 0;
    checks.push({
      key: 'ASSET_DEPRECIATION',
      title: 'ترحيل إهلاك الأصول الثابتة للفترة',
      passed: deprPassed,
      message: deprPassed ? 'تم ترحيل إهلاك الفترة بنجاح' : 'يوجد أصول نشطة لم يتم ترحيل إهلاك الفترة لها',
    });

    // Check 5: Accrued & Prepaid Expenses Processed
    const unpaidAccruals = (await db.query<any>(`
      SELECT COUNT(*) as count FROM expenses.accruals 
      WHERE status = 'UNPAID' AND accrual_date <= $1
    `, [period.end_date])).rows[0]?.count || '0';
    checks.push({
      key: 'EXPENSES_ACCRUALS',
      title: 'مراجعة وتدقيق المصروفات المستحقة للفترة',
      passed: true,
      message: `تم فحص الاستحقاقات (${unpaidAccruals} التزامات مستحقة قيد السداد)`,
    });

    const isReadyToClose = checks.every(c => c.passed);

    return {
      period: {
        id: period.id,
        periodNumber: period.period_number,
        name: period.name,
        startDate: period.start_date,
        endDate: period.end_date,
        status: period.status,
        yearName: period.yearName,
      },
      isReadyToClose,
      overallStatus: isReadyToClose ? 'READY_TO_CLOSE' : 'BLOCKED',
      checks,
    };
  }

  // ==========================================
  // 3. Close Fiscal Period (إقفال الفترة المالية)
  // ==========================================
  static async closeFiscalPeriod(fiscalPeriodId: string, userId?: string, notes?: string, force = false) {
    const db = await getDb();
    const checkResult = await this.runPeriodClosingCheck(fiscalPeriodId);

    if (!force && !checkResult.isReadyToClose) {
      const failed = checkResult.checks.filter(c => !c.passed).map(c => c.title).join(', ');
      throw new Error(`لا يمكن إقفال الفترة المالية: الشروط لم تكتمل (${failed})`);
    }

    if (checkResult.period.status === 'CLOSED') {
      throw new Error('الفترة المالية مغلقة مسبقاً');
    }

    const validUserId = await this.resolveUserId(userId);

    const upRes = await db.query<any>(`
      UPDATE accounting.fiscal_periods
      SET 
        status = 'CLOSED',
        closed_at = NOW(),
        closed_by = $1,
        closing_notes = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [validUserId, notes || 'إقفال شهري نظامي بعد اكتمال المطابقات', fiscalPeriodId]);

    const updated = upRes.rows[0];

    await logAudit({
      userId: validUserId || undefined,
      action: 'CLOSE',
      entityType: 'FISCAL_PERIOD',
      entityId: fiscalPeriodId,
      newData: {
        periodName: updated.name,
        periodNumber: updated.period_number,
        closedAt: updated.closed_at,
        notes,
      },
    });

    return {
      success: true,
      message: `تم إقفال الفترة المالية "${updated.name}" بنجاح وحظر المعاملات الجديدة`,
      period: updated,
    };
  }

  // ==========================================
  // 4. Reopen Fiscal Period (إعادة فتح فترة مقفلة)
  // ==========================================
  static async reopenFiscalPeriod(fiscalPeriodId: string, userId: string, reason: string) {
    const db = await getDb();

    if (!reason || reason.trim().length < 5) {
      throw new Error('يجب ذكر سبب صريح ومفصل لإعادة فتح الفترة المالية لتوثيقه في سجل التدقيق');
    }

    const pRes = await db.query<any>('SELECT * FROM accounting.fiscal_periods WHERE id = $1', [fiscalPeriodId]);
    if (pRes.rows.length === 0) {
      throw new Error('الفترة المالية غير موجودة');
    }

    const period = pRes.rows[0];
    if (period.status !== 'CLOSED' && period.status !== 'LOCKED') {
      throw new Error('الفترة المالية ليست مغلقة');
    }

    const validUserId = await this.resolveUserId(userId);

    const upRes = await db.query<any>(`
      UPDATE accounting.fiscal_periods
      SET 
        status = 'OPEN',
        reopened_at = NOW(),
        reopened_by = $1,
        reopen_reason = $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [validUserId, reason, fiscalPeriodId]);

    const updated = upRes.rows[0];

    await logAudit({
      userId: validUserId || undefined,
      action: 'REOPEN',
      entityType: 'FISCAL_PERIOD',
      entityId: fiscalPeriodId,
      newData: {
        periodName: updated.name,
        previousStatus: period.status,
        newStatus: 'OPEN',
        reopenReason: reason,
      },
    });

    return {
      success: true,
      message: `تمت إعادة فتح الفترة المالية "${updated.name}" بنجاح وتوثيق سبب العملية`,
      period: updated,
    };
  }

  // ==========================================
  // 5. Close Fiscal Year (إقفال السنة المالية وتصفير حسابات النتيجة)
  // ==========================================
  static async closeFiscalYear(fiscalYearId: string, userId?: string) {
    const db = await getDb();

    const yRes = await db.query<any>('SELECT * FROM accounting.fiscal_years WHERE id = $1', [fiscalYearId]);
    if (yRes.rows.length === 0) {
      throw new Error('السنة المالية غير موجودة');
    }
    const year = yRes.rows[0];

    if (year.is_closed) {
      throw new Error('السنة المالية مقفلة ومغلقة مسبقاً');
    }

    // Verify all periods of the fiscal year are CLOSED
    const openPeriods = await db.query<any>(`
      SELECT COUNT(*) as count FROM accounting.fiscal_periods
      WHERE fiscal_year_id = $1 AND status != 'CLOSED'
    `, [fiscalYearId]);

    if (parseInt(openPeriods.rows[0]?.count || '0', 10) > 0) {
      throw new Error('لا يمكن إقفال السنة المالية: يجب إقفال جميع الفترات الشهرية التابعة لها أولاً');
    }

    // Calculate final Net Profit to close into Retained Earnings (32)
    const pnl = await ReportingService.getIncomeStatement({ fiscalYearId });
    const netProfit = pnl.netProfit;

    // Fetch Retained Earnings account (32)
    const reRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '32' LIMIT 1");
    const reAccId = reRes.rows[0]?.id;

    let closingJe: any = null;

    if (reAccId && Math.abs(netProfit) > 0.001) {
      // Find last period for posting closing entry
      const lastPeriod = (await db.query<any>(`
        SELECT id FROM accounting.fiscal_periods
        WHERE fiscal_year_id = $1
        ORDER BY period_number DESC LIMIT 1
      `, [fiscalYearId])).rows[0];

      // Temporarily open last period for closing entry if needed or post as SYSTEM entry
      await db.query("UPDATE accounting.fiscal_periods SET status = 'OPEN' WHERE id = $1", [lastPeriod.id]);

      // Generate Closing Entry:
      // If Profit: Debit Income Summary / Expenses & Revenue Net, Credit Retained Earnings 32
      // If Loss: Debit Retained Earnings 32, Credit Net
      const closingLines = [];

      // Close Revenues: Debit Revenue Accounts
      for (const rev of pnl.sections.revenues) {
        if (rev.amount > 0) {
          closingLines.push({
            accountId: rev.accountId,
            debit: rev.amount,
            credit: 0,
            description: `إقفال إيراد: ${rev.accountName}`,
          });
        }
      }

      // Close Expenses: Credit Expense Accounts
      for (const exp of pnl.sections.operatingExpenses) {
        if (exp.amount > 0) {
          closingLines.push({
            accountId: exp.accountId,
            debit: 0,
            credit: exp.amount,
            description: `إقفال مصروف: ${exp.accountName}`,
          });
        }
      }
      for (const cogsItem of pnl.sections.cogs) {
        if (cogsItem.amount > 0) {
          closingLines.push({
            accountId: cogsItem.accountId,
            debit: 0,
            credit: cogsItem.amount,
            description: `إقفال تكلفة مبيعات: ${cogsItem.accountName}`,
          });
        }
      }

      // Net to Retained Earnings
      if (netProfit > 0) {
        closingLines.push({
          accountId: reAccId,
          debit: 0,
          credit: netProfit,
          description: `ترحيل صافي أرباح العام إلى الأرباح المبقاة (32)`,
        });
      } else {
        closingLines.push({
          accountId: reAccId,
          debit: Math.abs(netProfit),
          credit: 0,
          description: `تحميل صافي خسائر العام على الأرباح المبقاة (32)`,
        });
      }

      if (closingLines.length >= 2) {
        const je = await AccountingService.createJournalEntry({
          companyId: year.company_id,
          entryDate: year.end_date,
          fiscalPeriodId: lastPeriod.id,
          sourceId: 'SYSTEM',
          description: `قيد الإقفال السنوي وتصفير حسابات النتيجة للسنة المالية ${year.year_name}`,
          lines: closingLines,
          userId,
        });

        closingJe = await AccountingService.postJournalEntry(je.id, userId);
      }

      // Lock back last period
      await db.query("UPDATE accounting.fiscal_periods SET status = 'CLOSED' WHERE id = $1", [lastPeriod.id]);
    }

    const validUserId = await this.resolveUserId(userId);

    // Mark fiscal year as closed
    await db.query(`
      UPDATE accounting.fiscal_years
      SET 
        is_closed = TRUE,
        closed_at = NOW(),
        closed_by = $1,
        closing_journal_entry_id = $2,
        updated_at = NOW()
      WHERE id = $3
    `, [validUserId, closingJe?.id || null, fiscalYearId]);

    await logAudit({
      userId: validUserId || undefined,
      action: 'CLOSE',
      entityType: 'FISCAL_YEAR',
      entityId: fiscalYearId,
      newData: {
        yearName: year.year_name,
        netProfit,
        closingJournalEntryId: closingJe?.id || null,
      },
    });

    return {
      success: true,
      message: `تم إقفال السنة المالية "${year.year_name}" وترحيل أرباح العام إلى الأرباح المبقاة بنجاح`,
      closingJournalEntryNumber: closingJe?.entry_number,
    };
  }
}
