import { getDb } from './db.ts';

export interface ReportFilterDto {
  companyId?: string;
  branchId?: string;
  costCenterId?: string;
  fiscalYearId?: string;
  fiscalPeriodId?: string;
  fromDate?: string;
  toDate?: string;
  accountId?: string;
  accountTypeId?: string;
  postedOnly?: boolean;
}

export class ReportingService {
  /**
   * Helper: Resolves date range from filters or fiscal periods
   */
  private static async resolveDateRange(filters: ReportFilterDto) {
    const db = await getDb();
    let fromDate = filters.fromDate;
    let toDate = filters.toDate;

    if (filters.fiscalPeriodId && (!fromDate || !toDate)) {
      const pRes = await db.query<any>('SELECT start_date, end_date FROM accounting.fiscal_periods WHERE id = $1', [filters.fiscalPeriodId]);
      if (pRes.rows[0]) {
        fromDate = fromDate || pRes.rows[0].start_date;
        toDate = toDate || pRes.rows[0].end_date;
      }
    } else if (filters.fiscalYearId && (!fromDate || !toDate)) {
      const yRes = await db.query<any>('SELECT start_date, end_date FROM accounting.fiscal_years WHERE id = $1', [filters.fiscalYearId]);
      if (yRes.rows[0]) {
        fromDate = fromDate || yRes.rows[0].start_date;
        toDate = toDate || yRes.rows[0].end_date;
      }
    }

    return { fromDate, toDate };
  }

  // ==========================================
  // 1. General Ledger Report (سجل الأستاذ العام)
  // ==========================================
  static async getGeneralLedger(filters: ReportFilterDto & { limit?: number; offset?: number }) {
    const db = await getDb();
    const { fromDate, toDate } = await this.resolveDateRange(filters);

    let whereClause = "WHERE je.status = 'POSTED'";
    const params: any[] = [];
    let pIdx = 1;

    if (filters.accountId) {
      whereClause += ` AND jel.account_id = $${pIdx++}`;
      params.push(filters.accountId);
    }
    if (filters.branchId) {
      whereClause += ` AND je.branch_id = $${pIdx++}`;
      params.push(filters.branchId);
    }
    if (filters.costCenterId) {
      whereClause += ` AND jel.cost_center_id = $${pIdx++}`;
      params.push(filters.costCenterId);
    }
    if (fromDate) {
      whereClause += ` AND je.entry_date >= $${pIdx++}`;
      params.push(fromDate);
    }
    if (toDate) {
      whereClause += ` AND je.entry_date <= $${pIdx++}`;
      params.push(toDate);
    }

    // Opening Balance query if fromDate is provided
    let openingDebit = 0;
    let openingCredit = 0;
    if (fromDate) {
      let openWhere = "WHERE je.status = 'POSTED' AND je.entry_date < $1";
      const openParams: any[] = [fromDate];
      let oIdx = 2;

      if (filters.accountId) {
        openWhere += ` AND jel.account_id = $${oIdx++}`;
        openParams.push(filters.accountId);
      }
      if (filters.branchId) {
        openWhere += ` AND je.branch_id = $${oIdx++}`;
        openParams.push(filters.branchId);
      }

      const openRes = await db.query<any>(`
        SELECT 
          COALESCE(SUM(jel.debit), 0) as "totalDebit",
          COALESCE(SUM(jel.credit), 0) as "totalCredit"
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        ${openWhere}
      `, openParams);

      openingDebit = parseFloat(openRes.rows[0]?.totalDebit || '0');
      openingCredit = parseFloat(openRes.rows[0]?.totalCredit || '0');
    }

    // Detail Transactions
    const query = `
      SELECT 
        jel.id as "lineId",
        je.id as "entryId",
        je.entry_number as "entryNumber",
        je.entry_date as "entryDate",
        je.source_id as "sourceId",
        je.description as "entryDescription",
        jel.description as "lineDescription",
        jel.debit,
        jel.credit,
        jel.line_number as "lineNumber",
        a.id as "accountId",
        a.code as "accountCode",
        a.name as "accountName",
        a.normal_balance as "normalBalance",
        b.name as "branchName",
        cc.name as "costCenterName"
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      LEFT JOIN core.branches b ON b.id = je.branch_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = jel.cost_center_id
      ${whereClause}
      ORDER BY je.entry_date ASC, je.entry_number ASC, jel.line_number ASC
    `;

    const res = await db.query<any>(query, params);

    // Calculate Running Balance in line order
    let runningBalance = openingDebit - openingCredit;
    let totalDebit = 0;
    let totalCredit = 0;

    const lines = res.rows.map((row: any) => {
      const dr = parseFloat(row.debit || '0');
      const cr = parseFloat(row.credit || '0');
      totalDebit += dr;
      totalCredit += cr;

      // Running balance logic (Debit increases, Credit decreases)
      runningBalance += (dr - cr);

      return {
        ...row,
        debit: dr,
        credit: cr,
        runningBalance,
      };
    });

    const netChange = totalDebit - totalCredit;
    const closingBalance = (openingDebit - openingCredit) + netChange;

    return {
      openingDebit,
      openingCredit,
      openingBalance: openingDebit - openingCredit,
      totalDebit,
      totalCredit,
      netChange,
      closingBalance,
      linesCount: lines.length,
      lines,
    };
  }

  // ==========================================
  // 2. Account Statement (كشف حساب)
  // ==========================================
  static async getAccountStatement(accountId: string, filters: ReportFilterDto) {
    const db = await getDb();
    const accRes = await db.query<any>(`
      SELECT a.*, at.category as "typeCategory"
      FROM accounting.accounts a
      JOIN accounting.account_types at ON at.id = a.account_type_id
      WHERE a.id = $1
    `, [accountId]);

    if (accRes.rows.length === 0) {
      throw new Error(`الحساب برقم ${accountId} غير موجود`);
    }

    const account = accRes.rows[0];
    const isDebitNormal = account.normal_balance === 'DEBIT';

    const glResult = await this.getGeneralLedger({
      ...filters,
      accountId,
    });

    // Account Statement specific balance representation
    const openingBal = isDebitNormal ? glResult.openingBalance : -glResult.openingBalance;
    const closingBal = isDebitNormal ? glResult.closingBalance : -glResult.closingBalance;

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        normalBalance: account.normal_balance,
        category: account.typeCategory,
      },
      openingBalance: openingBal,
      totalDebit: glResult.totalDebit,
      totalCredit: glResult.totalCredit,
      closingBalance: closingBal,
      lines: glResult.lines.map(l => ({
        ...l,
        displayRunningBalance: isDebitNormal ? l.runningBalance : -l.runningBalance,
      })),
    };
  }

  // ==========================================
  // 3. Trial Balance Report (ميزان المراجعة)
  // ==========================================
  static async getTrialBalance(filters: ReportFilterDto) {
    const db = await getDb();
    const { fromDate, toDate } = await this.resolveDateRange(filters);

    // SQL Aggregation across all accounts
    let whereBranch = '';
    const params: any[] = [];
    let pIdx = 1;

    if (filters.branchId) {
      whereBranch = `AND je.branch_id = $${pIdx++}`;
      params.push(filters.branchId);
    }

    let dateCond = '';
    let openDateCond = '';

    if (fromDate) {
      openDateCond = ` AND je.entry_date < $${pIdx++}`;
      params.push(fromDate);
      dateCond += ` AND je.entry_date >= $${pIdx++}`;
      params.push(fromDate);
    } else {
      openDateCond = ` AND 1 = 0`; // No opening balance if no fromDate
    }

    if (toDate) {
      dateCond += ` AND je.entry_date <= $${pIdx++}`;
      params.push(toDate);
    }

    const query = `
      WITH opening_balances AS (
        SELECT 
          jel.account_id,
          COALESCE(SUM(jel.debit), 0) as open_debit,
          COALESCE(SUM(jel.credit), 0) as open_credit
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'POSTED' ${whereBranch} ${openDateCond}
        GROUP BY jel.account_id
      ),
      period_movements AS (
        SELECT 
          jel.account_id,
          COALESCE(SUM(jel.debit), 0) as period_debit,
          COALESCE(SUM(jel.credit), 0) as period_credit
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        WHERE je.status = 'POSTED' ${whereBranch} ${dateCond}
        GROUP BY jel.account_id
      )
      SELECT 
        a.id as "accountId",
        a.code as "accountCode",
        a.name as "accountName",
        a.level,
        a.is_group as "isGroup",
        a.normal_balance as "normalBalance",
        at.category as "category",
        COALESCE(ob.open_debit, 0) as "openDebit",
        COALESCE(ob.open_credit, 0) as "openCredit",
        COALESCE(pm.period_debit, 0) as "periodDebit",
        COALESCE(pm.period_credit, 0) as "periodCredit"
      FROM accounting.accounts a
      JOIN accounting.account_types at ON at.id = a.account_type_id
      LEFT JOIN opening_balances ob ON ob.account_id = a.id
      LEFT JOIN period_movements pm ON pm.account_id = a.id
      WHERE (
        COALESCE(ob.open_debit, 0) != 0 OR 
        COALESCE(ob.open_credit, 0) != 0 OR 
        COALESCE(pm.period_debit, 0) != 0 OR 
        COALESCE(pm.period_credit, 0) != 0
      )
      ORDER BY a.code ASC
    `;

    const res = await db.query<any>(query, params);

    let totalOpeningDebit = 0;
    let totalOpeningCredit = 0;
    let totalPeriodDebit = 0;
    let totalPeriodCredit = 0;
    let totalClosingDebit = 0;
    let totalClosingCredit = 0;

    const accounts = res.rows.map((row: any) => {
      const openDr = parseFloat(row.openDebit || '0');
      const openCr = parseFloat(row.openCredit || '0');
      const perDr = parseFloat(row.periodDebit || '0');
      const perCr = parseFloat(row.periodCredit || '0');

      totalOpeningDebit += openDr;
      totalOpeningCredit += openCr;
      totalPeriodDebit += perDr;
      totalPeriodCredit += perCr;

      // Net cumulative position
      const net = (openDr - openCr) + (perDr - perCr);
      let closingDebit = 0;
      let closingCredit = 0;

      if (net > 0) {
        closingDebit = net;
      } else if (net < 0) {
        closingCredit = -net;
      }

      totalClosingDebit += closingDebit;
      totalClosingCredit += closingCredit;

      return {
        ...row,
        openDebit: openDr,
        openCredit: openCr,
        periodDebit: perDr,
        periodCredit: perCr,
        closingDebit,
        closingCredit,
      };
    });

    // Check Double-Entry equality
    const difference = Math.abs(totalClosingDebit - totalClosingCredit);
    const isBalanced = difference < 0.001;

    return {
      fromDate,
      toDate,
      totalOpeningDebit,
      totalOpeningCredit,
      totalPeriodDebit,
      totalPeriodCredit,
      totalClosingDebit,
      totalClosingCredit,
      difference,
      isBalanced,
      status: isBalanced ? 'BALANCED' : 'TRIAL_BALANCE_ERROR',
      accounts,
    };
  }

  // ==========================================
  // 4. Income Statement / P&L (قائمة الدخل والأرباح والخسائر)
  // ==========================================
  static async getIncomeStatement(filters: ReportFilterDto) {
    const db = await getDb();
    const { fromDate, toDate } = await this.resolveDateRange(filters);

    let whereClause = "WHERE je.status = 'POSTED' AND at.category IN ('REVENUE', 'EXPENSE')";
    const params: any[] = [];
    let pIdx = 1;

    if (filters.branchId) {
      whereClause += ` AND je.branch_id = $${pIdx++}`;
      params.push(filters.branchId);
    }
    if (filters.costCenterId) {
      whereClause += ` AND jel.cost_center_id = $${pIdx++}`;
      params.push(filters.costCenterId);
    }
    if (fromDate) {
      whereClause += ` AND je.entry_date >= $${pIdx++}`;
      params.push(fromDate);
    }
    if (toDate) {
      whereClause += ` AND je.entry_date <= $${pIdx++}`;
      params.push(toDate);
    }

    const query = `
      SELECT 
        a.id as "accountId",
        a.code as "accountCode",
        a.name as "accountName",
        at.category as "category",
        COALESCE(SUM(jel.debit), 0) as "totalDebit",
        COALESCE(SUM(jel.credit), 0) as "totalCredit"
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      JOIN accounting.account_types at ON at.id = a.account_type_id
      ${whereClause}
      GROUP BY a.id, a.code, a.name, at.category
      ORDER BY a.code ASC
    `;

    const res = await db.query<any>(query, params);

    const revenues: any[] = [];
    const cogs: any[] = [];
    const operatingExpenses: any[] = [];
    const otherIncomes: any[] = [];
    const otherExpenses: any[] = [];

    let totalRevenue = 0;
    let totalCogs = 0;
    let totalOperatingExpenses = 0;
    let totalOtherIncome = 0;
    let totalOtherExpenses = 0;

    for (const row of res.rows) {
      const dr = parseFloat(row.totalDebit || '0');
      const cr = parseFloat(row.totalCredit || '0');

      if (row.category === 'REVENUE') {
        const net = cr - dr; // Revenue normal balance is Credit
        if (row.accountCode.startsWith('4103') || row.accountCode.startsWith('4104')) {
          otherIncomes.push({ ...row, amount: net });
          totalOtherIncome += net;
        } else {
          revenues.push({ ...row, amount: net });
          totalRevenue += net;
        }
      } else if (row.category === 'EXPENSE') {
        const net = dr - cr; // Expense normal balance is Debit
        if (row.accountCode.startsWith('5101') || row.accountCode.startsWith('5102') || row.accountName.includes('تكلفة البضاعة المباعة')) {
          cogs.push({ ...row, amount: net });
          totalCogs += net;
        } else if (
          row.accountCode.startsWith('5302') || // Bank charges / fees
          row.accountCode.startsWith('5309') || // Loss on disposal
          row.accountCode.startsWith('5303')    // Deficit on cash count
        ) {
          otherExpenses.push({ ...row, amount: net });
          totalOtherExpenses += net;
        } else {
          operatingExpenses.push({ ...row, amount: net });
          totalOperatingExpenses += net;
        }
      }
    }

    const grossProfit = totalRevenue - totalCogs;
    const operatingProfit = grossProfit - totalOperatingExpenses;
    const netProfit = operatingProfit + totalOtherIncome - totalOtherExpenses;

    const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
    const netMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      fromDate,
      toDate,
      totalRevenue,
      totalCogs,
      grossProfit,
      grossMargin: Math.round(grossMargin * 100) / 100,
      totalOperatingExpenses,
      operatingProfit,
      totalOtherIncome,
      totalOtherExpenses,
      netProfit,
      netMargin: Math.round(netMargin * 100) / 100,
      sections: {
        revenues,
        cogs,
        operatingExpenses,
        otherIncomes,
        otherExpenses,
      },
    };
  }

  // ==========================================
  // 5. Balance Sheet / Financial Position (الميزانية العمومية)
  // ==========================================
  static async getBalanceSheet(filters: ReportFilterDto) {
    const db = await getDb();
    const { toDate } = await this.resolveDateRange(filters);

    let whereClause = "WHERE je.status = 'POSTED'";
    const params: any[] = [];
    let pIdx = 1;

    if (filters.branchId) {
      whereClause += ` AND je.branch_id = $${pIdx++}`;
      params.push(filters.branchId);
    }
    if (toDate) {
      whereClause += ` AND je.entry_date <= $${pIdx++}`;
      params.push(toDate);
    }

    // Aggregated balance for all accounts up to toDate
    const query = `
      SELECT 
        a.id as "accountId",
        a.code as "accountCode",
        a.name as "accountName",
        a.normal_balance as "normalBalance",
        at.category as "category",
        COALESCE(SUM(jel.debit), 0) as "totalDebit",
        COALESCE(SUM(jel.credit), 0) as "totalCredit"
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      JOIN accounting.account_types at ON at.id = a.account_type_id
      ${whereClause}
      GROUP BY a.id, a.code, a.name, a.normal_balance, at.category
      ORDER BY a.code ASC
    `;

    const res = await db.query<any>(query, params);

    const currentAssets: any[] = [];
    const nonCurrentAssets: any[] = [];
    const currentLiabilities: any[] = [];
    const nonCurrentLiabilities: any[] = [];
    const equityItems: any[] = [];

    let totalCurrentAssets = 0;
    let totalNonCurrentAssets = 0;
    let totalCurrentLiabilities = 0;
    let totalNonCurrentLiabilities = 0;
    let totalEquity = 0;

    for (const row of res.rows) {
      const dr = parseFloat(row.totalDebit || '0');
      const cr = parseFloat(row.totalCredit || '0');

      if (row.category === 'ASSET') {
        // Normal balance Debit (except 1290 which is Contra-Asset Credit)
        const net = row.accountCode === '1290' ? -(cr - dr) : (dr - cr);

        if (row.accountCode.startsWith('12')) {
          nonCurrentAssets.push({ ...row, amount: net });
          totalNonCurrentAssets += net;
        } else {
          currentAssets.push({ ...row, amount: net });
          totalCurrentAssets += net;
        }
      } else if (row.category === 'LIABILITY') {
        const net = cr - dr; // Normal balance Credit
        if (row.accountCode.startsWith('22')) {
          nonCurrentLiabilities.push({ ...row, amount: net });
          totalNonCurrentLiabilities += net;
        } else {
          currentLiabilities.push({ ...row, amount: net });
          totalCurrentLiabilities += net;
        }
      } else if (row.category === 'EQUITY') {
        const net = cr - dr; // Normal balance Credit
        equityItems.push({ ...row, amount: net });
        totalEquity += net;
      }
    }

    // Current Year Net Earnings from P&L up to this date
    const pnl = await this.getIncomeStatement({ ...filters, toDate });
    const currentYearEarnings = pnl.netProfit;

    // Total Equity including Current Year Net Earnings
    const finalTotalEquity = totalEquity + currentYearEarnings;

    const totalAssets = totalCurrentAssets + totalNonCurrentAssets;
    const totalLiabilities = totalCurrentLiabilities + totalNonCurrentLiabilities;
    const totalLiabilitiesAndEquity = totalLiabilities + finalTotalEquity;

    const difference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
    const isBalanced = difference < 0.001;

    return {
      asOfDate: toDate || new Date().toISOString().split('T')[0],
      totalCurrentAssets,
      totalNonCurrentAssets,
      totalAssets,
      totalCurrentLiabilities,
      totalNonCurrentLiabilities,
      totalLiabilities,
      baseEquity: totalEquity,
      currentYearEarnings,
      totalEquity: finalTotalEquity,
      totalLiabilitiesAndEquity,
      difference,
      isBalanced,
      status: isBalanced ? 'BALANCED' : 'OUT_OF_BALANCE',
      sections: {
        currentAssets,
        nonCurrentAssets,
        currentLiabilities,
        nonCurrentLiabilities,
        equity: equityItems,
      },
    };
  }

  // ==========================================
  // 6. Cash Flow Statement (قائمة التدفقات النقدية - Indirect Method)
  // ==========================================
  static async getCashFlowStatement(filters: ReportFilterDto) {
    const db = await getDb();
    const { fromDate, toDate } = await this.resolveDateRange(filters);

    // 1. Net Profit for the period
    const pnl = await this.getIncomeStatement(filters);
    const netProfit = pnl.netProfit;

    // Helper for account balance change between fromDate and toDate
    const getChangeForAccounts = async (codes: string[]) => {
      if (!fromDate || !toDate) return 0;
      const placeholders = codes.map((_, i) => `$${i + 2}`).join(', ');

      const openRes = await db.query<any>(`
        SELECT COALESCE(SUM(jel.debit - jel.credit), 0) as val
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        JOIN accounting.accounts a ON a.id = jel.account_id
        WHERE je.status = 'POSTED' AND je.entry_date < $1 AND a.code IN (${placeholders})
      `, [fromDate, ...codes]);

      const closeRes = await db.query<any>(`
        SELECT COALESCE(SUM(jel.debit - jel.credit), 0) as val
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        JOIN accounting.accounts a ON a.id = jel.account_id
        WHERE je.status = 'POSTED' AND je.entry_date <= $1 AND a.code IN (${placeholders})
      `, [toDate, ...codes]);

      const openVal = parseFloat(openRes.rows[0]?.val || '0');
      const closeVal = parseFloat(closeRes.rows[0]?.val || '0');
      return closeVal - openVal;
    };

    // Non-Cash Adjustments
    let depreciationExpense = 0;
    let gainOnDisposal = 0;
    let lossOnDisposal = 0;

    for (const exp of pnl.sections.operatingExpenses) {
      if (exp.accountCode.startsWith('5301')) depreciationExpense += exp.amount;
    }
    for (const inc of pnl.sections.otherIncomes) {
      if (inc.accountCode.startsWith('4103')) gainOnDisposal += inc.amount;
    }
    for (const exp of pnl.sections.otherExpenses) {
      if (exp.accountCode.startsWith('5309')) lossOnDisposal += exp.amount;
    }

    // Working Capital Changes (Assets change sign is inverted; Liabilities change sign is positive)
    const arChange = await getChangeForAccounts(['1103']); // AR increase -> cash outflow
    const invChange = await getChangeForAccounts(['1104']); // Inv increase -> cash outflow
    const prepaidChange = await getChangeForAccounts(['1106']); // Prepaid increase -> cash outflow
    const apChange = -(await getChangeForAccounts(['2101'])); // AP increase (Credit) -> cash inflow
    const accrualsChange = -(await getChangeForAccounts(['2106'])); // Accruals increase (Credit) -> cash inflow
    const taxChange = -(await getChangeForAccounts(['2105'])) - (await getChangeForAccounts(['1105']));

    const operatingCashFlow =
      netProfit +
      depreciationExpense +
      lossOnDisposal -
      gainOnDisposal -
      arChange -
      invChange -
      prepaidChange +
      apChange +
      accrualsChange +
      taxChange;

    // Investing Activities (Fixed Assets Capex vs Disposal proceeds)
    const fixedAssetsGrossChange = await getChangeForAccounts(['1201', '1202']);
    const investingCashFlow = -fixedAssetsGrossChange;

    // Financing Activities (Capital, Retained earnings, Loans)
    const capitalChange = -(await getChangeForAccounts(['31']));
    const financingCashFlow = capitalChange;

    const netCashChange = operatingCashFlow + investingCashFlow + financingCashFlow;

    // Reconcile with GL Cash & Bank accounts (1101 + 1102)
    const getCashGLBalance = async (dateCondition: string, dateParam?: string) => {
      const q = `
        SELECT COALESCE(SUM(jel.debit - jel.credit), 0) as balance
        FROM accounting.journal_entry_lines jel
        JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
        JOIN accounting.accounts a ON a.id = jel.account_id
        WHERE je.status = 'POSTED' AND a.code IN ('1101', '1102') ${dateCondition}
      `;
      const res = await db.query<any>(q, dateParam ? [dateParam] : []);
      return parseFloat(res.rows[0]?.balance || '0');
    };

    const openingCash = fromDate ? await getCashGLBalance('AND je.entry_date < $1', fromDate) : 0;
    const actualClosingCash = toDate ? await getCashGLBalance('AND je.entry_date <= $1', toDate) : await getCashGLBalance('');

    const calculatedClosingCash = openingCash + netCashChange;
    const difference = Math.abs(calculatedClosingCash - actualClosingCash);
    const isBalanced = difference < 0.01;

    return {
      fromDate,
      toDate,
      operatingActivities: {
        netProfit,
        depreciationExpense,
        gainOnDisposal,
        lossOnDisposal,
        arChange: -arChange,
        invChange: -invChange,
        prepaidChange: -prepaidChange,
        apChange,
        accrualsChange,
        taxChange,
        totalOperating: operatingCashFlow,
      },
      investingActivities: {
        capitalExpenditures: investingCashFlow,
        totalInvesting: investingCashFlow,
      },
      financingActivities: {
        capitalContributions: financingCashFlow,
        totalFinancing: financingCashFlow,
      },
      netCashChange,
      openingCash,
      calculatedClosingCash,
      actualClosingCash,
      difference,
      isBalanced,
      status: isBalanced ? 'BALANCED' : 'OUT_OF_BALANCE',
    };
  }

  // ==========================================
  // 7. AR Aging Report (أعمار ديون العملاء)
  // ==========================================
  static async getArAging(asOfDate?: string) {
    const db = await getDb();
    const dateLimit = asOfDate || new Date().toISOString().split('T')[0];

    const res = await db.query<any>(`
      SELECT 
        c.id as "customerId",
        c.code as "customerCode",
        c.name as "customerName",
        si.id as "invoiceId",
        si.invoice_number as "invoiceNumber",
        si.invoice_date as "invoiceDate",
        si.due_date as "dueDate",
        (si.total - si.paid_amount) as "remainingAmount",
        GREATEST(0, ($1::date - si.due_date::date)) as "daysOverdue"
      FROM sales.sales_invoices si
      JOIN sales.customers c ON c.id = si.customer_id
      WHERE si.status = 'POSTED' AND si.payment_type = 'CREDIT' AND (si.total - si.paid_amount) > 0.0001
      ORDER BY c.name ASC, si.due_date ASC
    `, [dateLimit]);

    const customerMap: Record<string, any> = {};
    let totalAR = 0;
    let totalCurrent = 0;
    let total1_30 = 0;
    let total31_60 = 0;
    let total61_90 = 0;
    let total91_120 = 0;
    let totalOver120 = 0;

    for (const row of res.rows) {
      const rem = parseFloat(row.remainingAmount || '0');
      const days = parseInt(row.daysOverdue || '0', 10);
      totalAR += rem;

      if (!customerMap[row.customerId]) {
        customerMap[row.customerId] = {
          customerId: row.customerId,
          customerCode: row.customerCode,
          customerName: row.customerName,
          totalDue: 0,
          current: 0,
          days1_30: 0,
          days31_60: 0,
          days61_90: 0,
          days91_120: 0,
          daysOver120: 0,
        };
      }

      const c = customerMap[row.customerId];
      c.totalDue += rem;

      if (days === 0) {
        c.current += rem;
        totalCurrent += rem;
      } else if (days <= 30) {
        c.days1_30 += rem;
        total1_30 += rem;
      } else if (days <= 60) {
        c.days31_60 += rem;
        total31_60 += rem;
      } else if (days <= 90) {
        c.days61_90 += rem;
        total61_90 += rem;
      } else if (days <= 120) {
        c.days91_120 += rem;
        total91_120 += rem;
      } else {
        c.daysOver120 += rem;
        totalOver120 += rem;
      }
    }

    // Reconcile with GL Account 1103 (Receivables)
    const glRes = await db.query<any>(`
      SELECT COALESCE(SUM(jel.debit - jel.credit), 0) as balance
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      WHERE a.code = '1103' AND je.status = 'POSTED' AND je.entry_date <= $1
    `, [dateLimit]);

    const glBalance = parseFloat(glRes.rows[0]?.balance || '0');
    const difference = Math.abs(totalAR - glBalance);

    return {
      asOfDate: dateLimit,
      totalAR,
      totalCurrent,
      total1_30,
      total31_60,
      total61_90,
      total91_120,
      totalOver120,
      glBalance,
      difference,
      isReconciled: difference < 0.01,
      customers: Object.values(customerMap),
    };
  }

  // ==========================================
  // 8. AP Aging Report (أعمار ديون الموردين)
  // ==========================================
  static async getApAging(asOfDate?: string) {
    const db = await getDb();
    const dateLimit = asOfDate || new Date().toISOString().split('T')[0];

    const res = await db.query<any>(`
      SELECT 
        s.id as "supplierId",
        s.code as "supplierCode",
        s.name as "supplierName",
        pi.id as "invoiceId",
        pi.invoice_number as "invoiceNumber",
        pi.invoice_date as "invoiceDate",
        pi.due_date as "dueDate",
        (pi.total - pi.paid_amount) as "remainingAmount",
        GREATEST(0, ($1::date - pi.due_date::date)) as "daysOverdue"
      FROM purchasing.purchase_invoices pi
      JOIN purchasing.suppliers s ON s.id = pi.supplier_id
      WHERE pi.status = 'POSTED' AND pi.payment_type = 'CREDIT' AND (pi.total - pi.paid_amount) > 0.0001
      ORDER BY s.name ASC, pi.due_date ASC
    `, [dateLimit]);

    const supplierMap: Record<string, any> = {};
    let totalAP = 0;
    let totalCurrent = 0;
    let total1_30 = 0;
    let total31_60 = 0;
    let total61_90 = 0;
    let total91_120 = 0;
    let totalOver120 = 0;

    for (const row of res.rows) {
      const rem = parseFloat(row.remainingAmount || '0');
      const days = parseInt(row.daysOverdue || '0', 10);
      totalAP += rem;

      if (!supplierMap[row.supplierId]) {
        supplierMap[row.supplierId] = {
          supplierId: row.supplierId,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          totalDue: 0,
          current: 0,
          days1_30: 0,
          days31_60: 0,
          days61_90: 0,
          days91_120: 0,
          daysOver120: 0,
        };
      }

      const s = supplierMap[row.supplierId];
      s.totalDue += rem;

      if (days === 0) {
        s.current += rem;
        totalCurrent += rem;
      } else if (days <= 30) {
        s.days1_30 += rem;
        total1_30 += rem;
      } else if (days <= 60) {
        s.days31_60 += rem;
        total31_60 += rem;
      } else if (days <= 90) {
        s.days61_90 += rem;
        total61_90 += rem;
      } else if (days <= 120) {
        s.days91_120 += rem;
        total91_120 += rem;
      } else {
        s.daysOver120 += rem;
        totalOver120 += rem;
      }
    }

    // Reconcile with GL Account 2101 (Payables)
    const glRes = await db.query<any>(`
      SELECT COALESCE(SUM(jel.credit - jel.debit), 0) as balance
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      WHERE a.code = '2101' AND je.status = 'POSTED' AND je.entry_date <= $1
    `, [dateLimit]);

    const glBalance = parseFloat(glRes.rows[0]?.balance || '0');
    const difference = Math.abs(totalAP - glBalance);

    return {
      asOfDate: dateLimit,
      totalAP,
      totalCurrent,
      total1_30,
      total31_60,
      total61_90,
      total91_120,
      totalOver120,
      glBalance,
      difference,
      isReconciled: difference < 0.01,
      suppliers: Object.values(supplierMap),
    };
  }

  // ==========================================
  // 9. Tax Report (تقرير الإقرار الضريبي)
  // ==========================================
  static async getTaxReport(filters: ReportFilterDto) {
    const db = await getDb();
    const { fromDate, toDate } = await this.resolveDateRange(filters);

    let dateCond = '';
    const params: any[] = [];
    let pIdx = 1;

    if (fromDate) {
      dateCond += ` AND je.entry_date >= $${pIdx++}`;
      params.push(fromDate);
    }
    if (toDate) {
      dateCond += ` AND je.entry_date <= $${pIdx++}`;
      params.push(toDate);
    }

    // Input Tax (from Purchases and Expenses on Account 1105)
    const inputRes = await db.query<any>(`
      SELECT 
        'VAT-IN' as "taxCode",
        'ضريبة القيمة المضافة على المدخلات والمشتريات' as "taxName",
        15 as "rate",
        COALESCE(SUM(jel.debit - jel.credit), 0) as "inputTaxAmount"
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      WHERE a.code = '1105' AND je.status = 'POSTED' ${dateCond}
    `, params);

    // Output Tax (from Sales on Account 2105)
    const outputRes = await db.query<any>(`
      SELECT 
        'VAT-OUT' as "taxCode",
        'ضريبة القيمة المضافة المحصلة على المبيعات' as "taxName",
        15 as "rate",
        COALESCE(SUM(jel.credit - jel.debit), 0) as "outputTaxAmount"
      FROM accounting.journal_entry_lines jel
      JOIN accounting.journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting.accounts a ON a.id = jel.account_id
      WHERE a.code = '2105' AND je.status = 'POSTED' ${dateCond}
    `, params);

    const totalInputTax = inputRes.rows.reduce((sum, r) => sum + parseFloat(r.inputTaxAmount || '0'), 0);
    const totalOutputTax = outputRes.rows.reduce((sum, r) => sum + parseFloat(r.outputTaxAmount || '0'), 0);
    const netTaxPosition = totalOutputTax - totalInputTax; // Positive: payable to tax authority, Negative: refund/credit

    return {
      fromDate,
      toDate,
      totalInputTax,
      totalOutputTax,
      netTaxPosition,
      isPayable: netTaxPosition >= 0,
      inputTaxDetails: inputRes.rows,
      outputTaxDetails: outputRes.rows,
    };
  }

  // ==========================================
  // 10. Financial Dashboard & KPIs (المؤشرات المالية الرئيسية)
  // ==========================================
  static async getFinancialDashboard(filters: ReportFilterDto) {
    const pnl = await this.getIncomeStatement(filters);
    const bs = await this.getBalanceSheet(filters);

    const currentRatio = bs.totalCurrentLiabilities > 0
      ? Math.round((bs.totalCurrentAssets / bs.totalCurrentLiabilities) * 100) / 100
      : bs.totalCurrentAssets > 0 ? 999 : 1;

    const workingCapital = bs.totalCurrentAssets - bs.totalCurrentLiabilities;

    // Inventory Turnover = COGS / Average or Ending Inventory
    const invItem = bs.sections.currentAssets.find((a: any) => a.accountCode === '1104');
    const endingInventory = invItem ? invItem.amount : 0;
    const inventoryTurnover = endingInventory > 0
      ? Math.round((pnl.totalCogs / endingInventory) * 100) / 100
      : 0;

    return {
      revenue: pnl.totalRevenue,
      cogs: pnl.totalCogs,
      grossProfit: pnl.grossProfit,
      grossMargin: pnl.grossMargin,
      operatingExpenses: pnl.totalOperatingExpenses,
      operatingProfit: pnl.operatingProfit,
      netProfit: pnl.netProfit,
      netMargin: pnl.netMargin,
      currentRatio,
      workingCapital,
      inventoryTurnover,
      totalAssets: bs.totalAssets,
      totalLiabilities: bs.totalLiabilities,
      totalEquity: bs.totalEquity,
      accountingEquationBalanced: bs.isBalanced,
    };
  }

  // ==========================================
  // 11. Comparative Report (المقارنات المالية بين الفترات)
  // ==========================================
  static async getComparativeReport(currentPeriodId: string, previousPeriodId: string) {
    const curPnl = await this.getIncomeStatement({ fiscalPeriodId: currentPeriodId });
    const prevPnl = await this.getIncomeStatement({ fiscalPeriodId: previousPeriodId });

    const calcMetric = (cur: number, prev: number) => {
      const change = cur - prev;
      const changePct = prev !== 0 ? Math.round((change / Math.abs(prev)) * 10000) / 100 : cur !== 0 ? 100 : 0;
      return { current: cur, previous: prev, change, changePct };
    };

    return {
      revenue: calcMetric(curPnl.totalRevenue, prevPnl.totalRevenue),
      cogs: calcMetric(curPnl.totalCogs, prevPnl.totalCogs),
      grossProfit: calcMetric(curPnl.grossProfit, prevPnl.grossProfit),
      operatingExpenses: calcMetric(curPnl.totalOperatingExpenses, prevPnl.totalOperatingExpenses),
      operatingProfit: calcMetric(curPnl.operatingProfit, prevPnl.operatingProfit),
      netProfit: calcMetric(curPnl.netProfit, prevPnl.netProfit),
    };
  }

  // ==========================================
  // 12. Monthly Trend Report (الاتجاه المالي الشهري على مدار السنة)
  // ==========================================
  static async getMonthlyReport(fiscalYearId?: string) {
    const db = await getDb();
    let fyId = fiscalYearId;

    if (!fyId) {
      const fyRes = await db.query<any>('SELECT id FROM accounting.fiscal_years ORDER BY start_date DESC LIMIT 1');
      fyId = fyRes.rows[0]?.id;
    }

    const periodsRes = await db.query<any>(`
      SELECT id, period_number, name, start_date, end_date, status
      FROM accounting.fiscal_periods
      WHERE fiscal_year_id = $1
      ORDER BY period_number ASC
    `, [fyId]);

    const monthlyTrends: any[] = [];

    for (const p of periodsRes.rows) {
      const pnl = await this.getIncomeStatement({ fiscalPeriodId: p.id });
      monthlyTrends.push({
        periodNumber: p.period_number,
        periodName: p.name,
        status: p.status,
        revenue: pnl.totalRevenue,
        cogs: pnl.totalCogs,
        grossProfit: pnl.grossProfit,
        expenses: pnl.totalOperatingExpenses,
        netProfit: pnl.netProfit,
      });
    }

    return monthlyTrends;
  }
}
