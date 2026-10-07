import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';

export interface CreateExpenseCategoryDto {
  code: string;
  name: string;
  glAccountId?: string;
  defaultTaxCodeId?: string;
  companyId?: string;
  userId?: string;
}

export interface CreateExpenseDto {
  expenseDate: string;
  categoryId: string;
  amount: number;
  taxCodeId?: string;
  supplierId?: string;
  costCenterId?: string;
  branchId?: string;
  paymentType: 'CASH' | 'BANK' | 'AP';
  cashAccountId?: string;
  bankAccountId?: string;
  description: string;
  reference?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  companyId?: string;
  userId?: string;
}

export interface CreateAccrualDto {
  accrualDate: string;
  categoryId: string;
  amount: number;
  description: string;
  costCenterId?: string;
  branchId?: string;
  companyId?: string;
  userId?: string;
}

export interface PayAccrualDto {
  accrualId: string;
  paymentDate: string;
  paymentType: 'CASH' | 'BANK';
  cashAccountId?: string;
  bankAccountId?: string;
  userId?: string;
}

export interface CreatePrepaidScheduleDto {
  paymentDate: string;
  expenseAccountId: string;
  totalAmount: number;
  durationMonths: number;
  paymentType: 'CASH' | 'BANK';
  cashAccountId?: string;
  bankAccountId?: string;
  costCenterId?: string;
  branchId?: string;
  description: string;
  companyId?: string;
  userId?: string;
}

export class ExpenseService {
  private static async getDefaults(companyId?: string, branchId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const cRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      compId = cRes.rows[0]?.id;
    }
    let brId = branchId;
    if (!brId) {
      const bRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      brId = bRes.rows[0]?.id;
    }
    return { companyId: compId, branchId: brId };
  }

  // ==========================================
  // 1. Expense Categories (تصنيفات المصروفات)
  // ==========================================

  static async getCategories() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        a.name as "glAccountName",
        a.code as "glAccountCode",
        tc.name as "taxCodeName",
        tc.code as "taxCodeCode",
        (SELECT COUNT(*) FROM expenses.transactions t WHERE t.category_id = c.id) as "transactionsCount"
      FROM expenses.expense_categories c
      LEFT JOIN accounting.accounts a ON a.id = c.gl_account_id
      LEFT JOIN accounting.tax_codes tc ON tc.id = c.default_tax_code_id
      ORDER BY c.code ASC
    `);
    return res.rows.map((r: any) => ({
      ...r,
      transactionsCount: parseInt(r.transactionsCount || '0', 10),
    }));
  }

  static async createCategory(dto: CreateExpenseCategoryDto) {
    const db = await getDb();
    const { companyId } = await this.getDefaults(dto.companyId);

    const dup = await db.query<any>(
      'SELECT id FROM expenses.expense_categories WHERE company_id = $1 AND code = $2 LIMIT 1',
      [companyId, dto.code]
    );
    if (dup.rows.length > 0) {
      throw new Error(`كود تصنيف المصروفات (${dto.code}) مسجل مسبقاً`);
    }

    let glAccId = dto.glAccountId;
    if (!glAccId) {
      const defAcc = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '53' LIMIT 1");
      glAccId = defAcc.rows[0]?.id;
    }

    const res = await db.query<any>(`
      INSERT INTO expenses.expense_categories 
      (company_id, code, name, gl_account_id, default_tax_code_id)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      companyId,
      dto.code,
      dto.name,
      glAccId,
      dto.defaultTaxCodeId || null,
    ]);

    const created = res.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'EXPENSE_CATEGORY',
      entityId: created.id,
      newData: created,
    });

    return created;
  }

  // ==========================================
  // 2. Expense Transactions (حركات وفواتير المصروفات)
  // ==========================================

  static async getExpenses(filters: {
    status?: string;
    categoryId?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
  } = {}) {
    const db = await getDb();
    let query = `
      SELECT 
        e.*,
        cat.name as "categoryName",
        cat.code as "categoryCode",
        s.name as "supplierName",
        br.name as "branchName",
        cc.name as "costCenterName",
        cc.code as "costCenterCode",
        tc.name as "taxCodeName",
        je.entry_number as "journalEntryNumber",
        u.full_name as "createdByName"
      FROM expenses.transactions e
      JOIN expenses.expense_categories cat ON cat.id = e.category_id
      LEFT JOIN purchasing.suppliers s ON s.id = e.supplier_id
      LEFT JOIN core.branches br ON br.id = e.branch_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = e.cost_center_id
      LEFT JOIN accounting.tax_codes tc ON tc.id = e.tax_code_id
      LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id
      LEFT JOIN security.users u ON u.id = e.created_by
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (filters.status) {
      query += ` AND e.status = $${pIdx++}`;
      params.push(filters.status);
    }
    if (filters.categoryId) {
      query += ` AND e.category_id = $${pIdx++}`;
      params.push(filters.categoryId);
    }
    if (filters.fromDate) {
      query += ` AND e.expense_date >= $${pIdx++}`;
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      query += ` AND e.expense_date <= $${pIdx++}`;
      params.push(filters.toDate);
    }
    if (filters.search) {
      query += ` AND (e.expense_number ILIKE $${pIdx} OR e.description ILIKE $${pIdx} OR e.reference ILIKE $${pIdx})`;
      params.push(`%${filters.search}%`);
      pIdx++;
    }

    query += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${pIdx++}`;
      params.push(filters.limit);
    }

    const res = await db.query<any>(query, params);
    return res.rows.map((r: any) => ({
      ...r,
      amount: parseFloat(r.amount || '0'),
      tax_amount: parseFloat(r.tax_amount || '0'),
      total_amount: parseFloat(r.total_amount || '0'),
    }));
  }

  static async getExpenseById(id: string) {
    const db = await getDb();
    const expenses = await this.getExpenses();
    const exp = expenses.find(e => e.id === id);
    if (!exp) throw new Error(`المصروف بالمعرف ${id} غير موجود`);
    return exp;
  }

  static async createExpense(dto: CreateExpenseDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    if (dto.amount <= 0) {
      throw new Error('مبلغ المصروف يجب أن يكون أكبر من صفر');
    }

    // Category
    const catRes = await db.query<any>('SELECT * FROM expenses.expense_categories WHERE id = $1', [dto.categoryId]);
    if (catRes.rows.length === 0) throw new Error('تصنيف المصروفات المحدد غير موجود');
    const cat = catRes.rows[0];

    // Tax calculation using existing tax codes and rates
    let taxAmount = 0;
    const taxCodeId = dto.taxCodeId || cat.default_tax_code_id;
    if (taxCodeId) {
      const rateRes = await db.query<any>(
        'SELECT rate_percentage FROM accounting.tax_rates WHERE tax_code_id = $1 AND is_active = TRUE ORDER BY valid_from DESC LIMIT 1',
        [taxCodeId]
      );
      if (rateRes.rows.length > 0) {
        const ratePct = parseFloat(rateRes.rows[0].rate_percentage || '0');
        taxAmount = Math.round((dto.amount * (ratePct / 100)) * 100) / 100;
      }
    }

    const totalAmount = dto.amount + taxAmount;

    // Sequential expense number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM expenses.transactions');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const expenseNumber = `EXP-2026-${seq.toString().padStart(4, '0')}`;

    // Payment account id
    let paymentAccId: string;
    if (dto.paymentType === 'CASH') {
      const cRes = dto.cashAccountId
        ? await db.query<any>('SELECT gl_account_id FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])
        : await db.query<any>("SELECT id as gl_account_id FROM accounting.accounts WHERE code = '1101' LIMIT 1");
      paymentAccId = cRes.rows[0]?.gl_account_id;
    } else if (dto.paymentType === 'BANK') {
      const bRes = dto.bankAccountId
        ? await db.query<any>('SELECT gl_account_id FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])
        : await db.query<any>("SELECT id as gl_account_id FROM accounting.accounts WHERE code = '1102' LIMIT 1");
      paymentAccId = bRes.rows[0]?.gl_account_id;
    } else {
      // AP
      const apRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2101' LIMIT 1");
      paymentAccId = apRes.rows[0]?.id;
    }

    const insRes = await db.query<any>(`
      INSERT INTO expenses.transactions 
      (company_id, branch_id, cost_center_id, expense_number, expense_date, category_id, supplier_id, amount, tax_code_id, tax_amount, total_amount, payment_type, cash_account_id, bank_account_id, payment_account_id, description, reference, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.costCenterId || null,
      expenseNumber,
      dto.expenseDate,
      dto.categoryId,
      dto.supplierId || null,
      dto.amount,
      taxCodeId || null,
      taxAmount,
      totalAmount,
      dto.paymentType,
      dto.cashAccountId || null,
      dto.bankAccountId || null,
      paymentAccId,
      dto.description,
      dto.reference || null,
      dto.status || 'DRAFT',
      dto.userId || null,
    ]);

    const created = insRes.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'EXPENSE',
      entityId: created.id,
      newData: created,
    });

    return created;
  }

  static async approveExpense(expenseId: string, userId?: string) {
    const db = await getDb();
    const exp = await this.getExpenseById(expenseId);

    if (exp.status !== 'DRAFT' && exp.status !== 'SUBMITTED') {
      throw new Error(`لا يمكن اعتماد مصروف بحالة ${exp.status}`);
    }

    const res = await db.query<any>(`
      UPDATE expenses.transactions 
      SET status = 'APPROVED', approved_by = $1, approved_at = NOW(), updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId || null, expenseId]);

    await logAudit({
      userId,
      action: 'APPROVE',
      entityType: 'EXPENSE',
      entityId: expenseId,
      newData: res.rows[0],
    });

    return res.rows[0];
  }

  /**
   * Posts an approved expense to the General Ledger:
   * 1. Validates fiscal period is OPEN
   * 2. Balanced Double-Entry Journal:
   *    Debit: Expense Account (category.gl_account_id) for amount
   *    Debit: Input Tax (1105) for tax_amount (if tax > 0)
   *    Credit: Payment Account (Cash / Bank / AP) for total_amount
   * 3. If Cash or Bank: logs outflow in banking.transactions
   * 4. Updates status to POSTED
   */
  static async postExpense(expenseId: string, userId?: string) {
    const db = await getDb();
    const exp = await this.getExpenseById(expenseId);

    if (exp.status === 'POSTED') {
      throw new Error('المصروف مرحل بالفعل');
    }
    if (exp.status === 'REVERSED') {
      throw new Error('لا يمكن ترحيل مصروف تم عكسه');
    }

    // Fiscal period check
    const period = await AccountingService.getPeriodForDate(exp.expense_date);
    if (!period || period.status !== 'OPEN') {
      throw new Error(`لا يمكن ترحيل المصروف: الفترة المالية مغلقة أو غير صالحة`);
    }

    // Get Category GL Account
    const catRes = await db.query<any>('SELECT gl_account_id FROM expenses.expense_categories WHERE id = $1', [exp.category_id]);
    const expAccId = catRes.rows[0]?.gl_account_id;

    // Journal Entry Lines
    const lines = [
      {
        accountId: expAccId,
        costCenterId: exp.cost_center_id || null,
        debit: exp.amount,
        credit: 0,
        description: `مدين: ${exp.categoryName} (${exp.description})`,
      },
    ];

    // Input Tax Line (Account 1105) if tax > 0
    if (exp.tax_amount > 0) {
      const taxAccRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1105' LIMIT 1");
      const taxAccId = taxAccRes.rows[0]?.id;
      if (taxAccId) {
        lines.push({
          accountId: taxAccId,
          costCenterId: null,
          debit: exp.tax_amount,
          credit: 0,
          description: `مدين: ضريبة القيمة المضافة على المدخلات (${exp.expense_number})`,
        });
      }
    }

    // Credit Payment Line
    lines.push({
      accountId: exp.payment_account_id,
      costCenterId: null,
      debit: 0,
      credit: exp.total_amount,
      description: `دائن: سداد مصروف ${exp.description}`,
    });

    const je = await AccountingService.createJournalEntry({
      companyId: exp.company_id,
      branchId: exp.branch_id,
      entryDate: exp.expense_date,
      sourceId: 'PAYMENTS',
      description: `قيد ترحيل مصروف (${exp.expense_number}): ${exp.description}`,
      lines,
      userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, userId);

    // If Cash or Bank, log in unified banking transactions ledger
    if (exp.payment_type === 'CASH' && exp.cash_account_id) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'CASH', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, $10, FALSE, $11)
      `, [
        exp.company_id,
        exp.branch_id,
        `TXN-${exp.expense_number}`,
        exp.expense_date,
        exp.cash_account_id,
        exp.total_amount,
        curRes.rows[0]?.id,
        exp.expense_number,
        `سداد مصروف: ${exp.description}`,
        postedJe.id,
        userId || null,
      ]);
    } else if (exp.payment_type === 'BANK' && exp.bank_account_id) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'BANK', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, $10, FALSE, $11)
      `, [
        exp.company_id,
        exp.branch_id,
        `TXN-${exp.expense_number}`,
        exp.expense_date,
        exp.bank_account_id,
        exp.total_amount,
        curRes.rows[0]?.id,
        exp.expense_number,
        `سداد مصروف بنكياً: ${exp.description}`,
        postedJe.id,
        userId || null,
      ]);
    }

    const upRes = await db.query<any>(`
      UPDATE expenses.transactions 
      SET status = 'POSTED', posted_by = $1, posted_at = NOW(), journal_entry_id = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [userId || null, postedJe.id, expenseId]);

    await logAudit({
      userId,
      action: 'POST',
      entityType: 'EXPENSE',
      entityId: expenseId,
      newData: { expenseId, journalEntryId: postedJe.id, totalAmount: exp.total_amount },
    });

    return {
      expense: upRes.rows[0],
      journalEntryNumber: postedJe.entry_number,
    };
  }

  static async reverseExpense(expenseId: string, reason: string, userId?: string) {
    const db = await getDb();
    const exp = await this.getExpenseById(expenseId);

    if (exp.status !== 'POSTED') {
      throw new Error('لا يمكن عكس مصروف غير مرحل');
    }

    if (!exp.journal_entry_id) {
      throw new Error('لا يوجد قيد يومية مرتبط لعكسه');
    }

    // Reverse GL Entry
    const revResult = await AccountingService.reverseJournalEntry(exp.journal_entry_id, userId);
    const revJe = revResult.reversalEntry;

    // If Cash or Bank, log compensatory inflow in banking transactions
    if (exp.payment_type === 'CASH' && exp.cash_account_id) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, CURRENT_DATE, 'CASH', $4, 'ADJUSTMENT_IN', 'INFLOW', $5, $6, 'REVERSAL', $7, $8, TRUE, $9)
      `, [
        exp.company_id,
        exp.branch_id,
        `REV-${exp.expense_number}`,
        exp.cash_account_id,
        exp.total_amount,
        curRes.rows[0]?.id,
        `عكس قيد المصروف: ${exp.description} - ${reason}`,
        revJe.id,
        userId || null,
      ]);
    } else if (exp.payment_type === 'BANK' && exp.bank_account_id) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, CURRENT_DATE, 'BANK', $4, 'ADJUSTMENT_IN', 'INFLOW', $5, $6, 'REVERSAL', $7, $8, TRUE, $9)
      `, [
        exp.company_id,
        exp.branch_id,
        `REV-${exp.expense_number}`,
        exp.bank_account_id,
        exp.total_amount,
        curRes.rows[0]?.id,
        `عكس قيد المصروف بنكياً: ${exp.description} - ${reason}`,
        revJe.id,
        userId || null,
      ]);
    }

    const upRes = await db.query<any>(`
      UPDATE expenses.transactions 
      SET status = 'REVERSED', reversal_journal_entry_id = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [revJe.id, expenseId]);

    await logAudit({
      userId,
      action: 'REVERSE',
      entityType: 'EXPENSE',
      entityId: expenseId,
      newData: { reversalJournalEntryId: revJe.id, reason },
    });

    return {
      expense: upRes.rows[0],
      reversalJournalEntryNumber: revJe.entry_number,
    };
  }

  // ==========================================
  // 3. Accrued Expenses (المصروفات المستحقة)
  // ==========================================

  static async getAccruals() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        acc.*,
        cat.name as "categoryName",
        cat.code as "categoryCode",
        ea.name as "expenseAccountName",
        apa.name as "accruedPayableAccountName",
        cc.name as "costCenterName",
        je.entry_number as "accrualJournalNumber",
        pje.entry_number as "paymentJournalNumber"
      FROM expenses.accruals acc
      JOIN expenses.expense_categories cat ON cat.id = acc.category_id
      LEFT JOIN accounting.accounts ea ON ea.id = acc.expense_account_id
      LEFT JOIN accounting.accounts apa ON apa.id = acc.accrued_payable_account_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = acc.cost_center_id
      LEFT JOIN accounting.journal_entries je ON je.id = acc.accrual_journal_entry_id
      LEFT JOIN accounting.journal_entries pje ON pje.id = acc.payment_journal_entry_id
      ORDER BY acc.accrual_date DESC
    `);
    return res.rows.map((r: any) => ({
      ...r,
      amount: parseFloat(r.amount || '0'),
    }));
  }

  /**
   * Creates an Accrual:
   * Debit: Expense Account (e.g. 5304 Utilities)
   * Credit: Accrued Expenses / Payable (2106)
   */
  static async createAccrual(dto: CreateAccrualDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    if (dto.amount <= 0) throw new Error('مبلغ الاستحقاق يجب أن يكون أكبر من صفر');

    // Category
    const catRes = await db.query<any>('SELECT * FROM expenses.expense_categories WHERE id = $1', [dto.categoryId]);
    const cat = catRes.rows[0];
    const expAccId = cat.gl_account_id;

    // Accrued Payable Account (2106)
    const payableAccRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '2106' LIMIT 1");
    const payableAccId = payableAccRes.rows[0]?.id;

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM expenses.accruals');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const accrualNumber = `ACR-2026-${seq.toString().padStart(4, '0')}`;

    // Balanced Journal Entry
    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.accrualDate,
      sourceId: 'SYSTEM',
      description: `إثبات استحقاق مصروف (${accrualNumber}): ${dto.description}`,
      lines: [
        {
          accountId: expAccId,
          costCenterId: dto.costCenterId || undefined,
          debit: dto.amount,
          credit: 0,
          description: `مدين: ${cat.name} (استحقاق)`,
        },
        {
          accountId: payableAccId,
          debit: 0,
          credit: dto.amount,
          description: `دائن: مصروفات مستحقة الدفع (${dto.description})`,
        },
      ],
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    const res = await db.query<any>(`
      INSERT INTO expenses.accruals 
      (company_id, branch_id, cost_center_id, accrual_number, accrual_date, category_id, amount, description, expense_account_id, accrued_payable_account_id, status, accrual_journal_entry_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'POSTED', $11, $12)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.costCenterId || null,
      accrualNumber,
      dto.accrualDate,
      dto.categoryId,
      dto.amount,
      dto.description,
      expAccId,
      payableAccId,
      postedJe.id,
      dto.userId || null,
    ]);

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'EXPENSE_ACCRUAL',
      entityId: res.rows[0].id,
      newData: res.rows[0],
    });

    return {
      ...res.rows[0],
      journalEntryNumber: postedJe.entry_number,
    };
  }

  /**
   * Pays an Accrual:
   * Debit: Accrued Expenses / Payable (2106)
   * Credit: Cash / Bank Account (1101 / 1102)
   * Prevents recording the expense twice!
   */
  static async payAccrual(dto: PayAccrualDto) {
    const db = await getDb();
    const accRes = await db.query<any>('SELECT * FROM expenses.accruals WHERE id = $1', [dto.accrualId]);
    if (accRes.rows.length === 0) throw new Error('المصروف المستحق غير موجود');
    const accrual = accRes.rows[0];

    if (accrual.status === 'PAID') throw new Error('المصروف المستحق مسدد بالفعل');

    const { companyId, branchId } = await this.getDefaults(accrual.company_id, accrual.branch_id);
    const amount = parseFloat(accrual.amount);

    let creditAccId: string;
    let creditDesc: string;

    if (dto.paymentType === 'CASH') {
      const cashAcc = (await db.query<any>('SELECT gl_account_id, name FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])).rows[0];
      creditAccId = cashAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1")).rows[0].id;
      creditDesc = `دائن: الصندوق - سداد استحقاق ${accrual.description}`;
    } else {
      const bankAcc = (await db.query<any>('SELECT gl_account_id, bank_name FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])).rows[0];
      creditAccId = bankAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1")).rows[0].id;
      creditDesc = `دائن: البنك - سداد استحقاق ${accrual.description}`;
    }

    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.paymentDate,
      sourceId: 'PAYMENTS',
      description: `سداد مصروف مستحق (${accrual.accrual_number}): ${accrual.description}`,
      lines: [
        {
          accountId: accrual.accrued_payable_account_id,
          debit: amount,
          credit: 0,
          description: `مدين: إقفال مصروفات مستحقة الدفع (${accrual.accrual_number})`,
        },
        {
          accountId: creditAccId,
          debit: 0,
          credit: amount,
          description: creditDesc,
        },
      ],
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    // Banking outflow
    const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
    if (dto.paymentType === 'CASH' && dto.cashAccountId) {
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'CASH', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
      `, [
        companyId,
        branchId,
        `TXN-PAY-${accrual.accrual_number}`,
        dto.paymentDate,
        dto.cashAccountId,
        amount,
        curRes.rows[0]?.id,
        `سداد استحقاق: ${accrual.description}`,
        postedJe.id,
        dto.userId || null,
      ]);
    } else if (dto.bankAccountId) {
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'BANK', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
      `, [
        companyId,
        branchId,
        `TXN-PAY-${accrual.accrual_number}`,
        dto.paymentDate,
        dto.bankAccountId,
        amount,
        curRes.rows[0]?.id,
        `سداد استحقاق بنكياً: ${accrual.description}`,
        postedJe.id,
        dto.userId || null,
      ]);
    }

    const upRes = await db.query<any>(`
      UPDATE expenses.accruals 
      SET status = 'PAID', payment_date = $1, payment_type = $2, cash_account_id = $3, bank_account_id = $4, payment_journal_entry_id = $5
      WHERE id = $6
      RETURNING *
    `, [
      dto.paymentDate,
      dto.paymentType,
      dto.cashAccountId || null,
      dto.bankAccountId || null,
      postedJe.id,
      dto.accrualId,
    ]);

    await logAudit({
      userId: dto.userId,
      action: 'PAY',
      entityType: 'EXPENSE_ACCRUAL',
      entityId: dto.accrualId,
      newData: upRes.rows[0],
    });

    return {
      ...upRes.rows[0],
      paymentJournalNumber: postedJe.entry_number,
    };
  }

  // ==========================================
  // 4. Prepaid Expenses & Schedules (المصروفات المدفوعة مقدماً)
  // ==========================================

  static async getPrepaidSchedules() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        s.*,
        ea.name as "expenseAccountName",
        pa.name as "prepaidAccountName",
        cc.name as "costCenterName",
        pje.entry_number as "paymentJournalNumber",
        (SELECT COUNT(*) FROM expenses.prepaid_amortizations a WHERE a.schedule_id = s.id AND a.is_posted = TRUE) as "postedMonthsCount",
        COALESCE((SELECT SUM(a.amount) FROM expenses.prepaid_amortizations a WHERE a.schedule_id = s.id AND a.is_posted = TRUE), 0.0000) as "amortizedAmount"
      FROM expenses.prepaid_schedules s
      LEFT JOIN accounting.accounts ea ON ea.id = s.expense_account_id
      LEFT JOIN accounting.accounts pa ON pa.id = s.prepaid_account_id
      LEFT JOIN accounting.cost_centers cc ON cc.id = s.cost_center_id
      LEFT JOIN accounting.journal_entries pje ON pje.id = s.payment_journal_entry_id
      ORDER BY s.payment_date DESC
    `);
    return res.rows.map((r: any) => {
      const tot = parseFloat(r.total_amount || '0');
      const amort = parseFloat(r.amortizedAmount || '0');
      return {
        ...r,
        total_amount: tot,
        monthly_amount: parseFloat(r.monthly_amount || '0'),
        amortizedAmount: amort,
        remainingBalance: Math.max(0, tot - amort),
        postedMonthsCount: parseInt(r.postedMonthsCount || '0', 10),
      };
    });
  }

  static async getPrepaidScheduleById(id: string) {
    const db = await getDb();
    const schedules = await this.getPrepaidSchedules();
    const schedule = schedules.find(s => s.id === id);
    if (!schedule) throw new Error(`جدول المصروف المقدم ${id} غير موجود`);

    const linesRes = await db.query<any>(`
      SELECT 
        a.*,
        fp.name as "periodName",
        je.entry_number as "journalEntryNumber"
      FROM expenses.prepaid_amortizations a
      JOIN accounting.fiscal_periods fp ON fp.id = a.fiscal_period_id
      LEFT JOIN accounting.journal_entries je ON je.id = a.journal_entry_id
      WHERE a.schedule_id = $1
      ORDER BY a.month_index ASC
    `, [id]);

    return {
      ...schedule,
      lines: linesRes.rows.map((l: any) => ({
        ...l,
        amount: parseFloat(l.amount || '0'),
      })),
    };
  }

  /**
   * Creates a Prepaid Expense Schedule:
   * 1. Upfront Payment Journal:
   *    Debit: Prepaid Expense (1106)
   *    Credit: Cash / Bank Account (1101 / 1102)
   * 2. Outflow logged in banking.transactions
   * 3. Generates monthly amortization schedule for duration_months
   */
  static async createPrepaidSchedule(dto: CreatePrepaidScheduleDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    if (dto.totalAmount <= 0 || dto.durationMonths <= 0) {
      throw new Error('إجمالي المبلغ والمدة بالأشهر يجب أن يكونا أكبر من صفر');
    }

    const prepaidAccRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1106' LIMIT 1");
    const prepaidAccId = prepaidAccRes.rows[0]?.id;

    const monthlyAmount = Math.round((dto.totalAmount / dto.durationMonths) * 100) / 100;

    let creditAccId: string;
    let creditDesc: string;

    if (dto.paymentType === 'CASH') {
      const cashAcc = (await db.query<any>('SELECT gl_account_id, name FROM banking.cash_accounts WHERE id = $1', [dto.cashAccountId])).rows[0];
      creditAccId = cashAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1")).rows[0].id;
      creditDesc = `دائن: الصندوق - سداد مصروف مقدم ${dto.description}`;
    } else {
      const bankAcc = (await db.query<any>('SELECT gl_account_id, bank_name FROM banking.bank_accounts WHERE id = $1', [dto.bankAccountId])).rows[0];
      creditAccId = bankAcc?.gl_account_id || (await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1")).rows[0].id;
      creditDesc = `دائن: البنك - سداد مصروف مقدم ${dto.description}`;
    }

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM expenses.prepaid_schedules');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const scheduleNum = `PRE-2026-${seq.toString().padStart(4, '0')}`;

    // Upfront Payment Journal Entry
    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.paymentDate,
      sourceId: 'PAYMENTS',
      description: `سداد مصروف مدفوع مقدماً (${scheduleNum}): ${dto.description}`,
      lines: [
        {
          accountId: prepaidAccId,
          debit: dto.totalAmount,
          credit: 0,
          description: `مدين: مصروفات مدفوعة مقدماً (${dto.description})`,
        },
        {
          accountId: creditAccId,
          debit: 0,
          credit: dto.totalAmount,
          description: creditDesc,
        },
      ],
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    // Banking outflow
    const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
    if (dto.paymentType === 'CASH' && dto.cashAccountId) {
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'CASH', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
      `, [
        companyId,
        branchId,
        `TXN-PRE-${scheduleNum}`,
        dto.paymentDate,
        dto.cashAccountId,
        dto.totalAmount,
        curRes.rows[0]?.id,
        `سداد مصروف مقدم: ${dto.description}`,
        postedJe.id,
        dto.userId || null,
      ]);
    } else if (dto.bankAccountId) {
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, 'BANK', $5, 'PAYMENT', 'OUTFLOW', $6, $7, 'PAYMENT', $8, $9, FALSE, $10)
      `, [
        companyId,
        branchId,
        `TXN-PRE-${scheduleNum}`,
        dto.paymentDate,
        dto.bankAccountId,
        dto.totalAmount,
        curRes.rows[0]?.id,
        `سداد مصروف مقدم بنكياً: ${dto.description}`,
        postedJe.id,
        dto.userId || null,
      ]);
    }

    const sRes = await db.query<any>(`
      INSERT INTO expenses.prepaid_schedules 
      (company_id, branch_id, cost_center_id, schedule_number, payment_date, total_amount, duration_months, monthly_amount, prepaid_account_id, expense_account_id, payment_type, cash_account_id, bank_account_id, payment_journal_entry_id, status, description, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'ACTIVE', $15, $16)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.costCenterId || null,
      scheduleNum,
      dto.paymentDate,
      dto.totalAmount,
      dto.durationMonths,
      monthlyAmount,
      prepaidAccId,
      dto.expenseAccountId,
      dto.paymentType,
      dto.cashAccountId || null,
      dto.bankAccountId || null,
      postedJe.id,
      dto.description,
      dto.userId || null,
    ]);

    const schedule = sRes.rows[0];

    // Generate monthly periods
    const periodsRes = await db.query<any>(`
      SELECT * FROM accounting.fiscal_periods
      WHERE end_date >= $1::date
      ORDER BY start_date ASC
      LIMIT $2
    `, [dto.paymentDate, dto.durationMonths]);

    const periods = periodsRes.rows;

    for (let i = 1; i <= Math.min(dto.durationMonths, periods.length); i++) {
      const p = periods[i - 1];
      await db.query(`
        INSERT INTO expenses.prepaid_amortizations 
        (schedule_id, fiscal_period_id, period_date, month_index, amount, is_posted)
        VALUES ($1, $2, $3, $4, $5, FALSE)
        ON CONFLICT (schedule_id, fiscal_period_id) DO NOTHING
      `, [schedule.id, p.id, p.end_date, i, monthlyAmount]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'PREPAID_SCHEDULE',
      entityId: schedule.id,
      newData: schedule,
    });

    return {
      ...schedule,
      total_amount: parseFloat(schedule.total_amount || '0'),
      monthly_amount: parseFloat(schedule.monthly_amount || '0'),
      paymentJournalNumber: postedJe.entry_number,
    };
  }

  /**
   * Posts monthly amortization of a prepaid expense:
   * Debit: Expense Account (e.g. 5307 Insurance)
   * Credit: Prepaid Expense (1106)
   * Prevents posting the same month twice!
   */
  static async postPrepaidAmortization(amortizationId: string, userId?: string) {
    const db = await getDb();
    const aRes = await db.query<any>(`
      SELECT a.*, s.company_id, s.branch_id, s.cost_center_id, s.expense_account_id, s.prepaid_account_id, s.description, fp.status as "periodStatus", fp.name as "periodName"
      FROM expenses.prepaid_amortizations a
      JOIN expenses.prepaid_schedules s ON s.id = a.schedule_id
      JOIN accounting.fiscal_periods fp ON fp.id = a.fiscal_period_id
      WHERE a.id = $1
    `, [amortizationId]);

    if (aRes.rows.length === 0) throw new Error('بند الإطفاء الشهري غير موجود');
    const item = aRes.rows[0];

    if (item.is_posted) throw new Error('تم ترحيل إطفاء هذا الشهر مسبقاً');
    if (item.periodStatus !== 'OPEN') throw new Error(`الفترة المالية "${item.periodName}" مغلقة`);

    const amount = parseFloat(item.amount);

    const je = await AccountingService.createJournalEntry({
      companyId: item.company_id,
      branchId: item.branch_id,
      entryDate: item.period_date,
      sourceId: 'SYSTEM',
      description: `إثبات إطفاء المصروف المقدم شهر ${item.periodName} (${item.description})`,
      lines: [
        {
          accountId: item.expense_account_id,
          costCenterId: item.cost_center_id || null,
          debit: amount,
          credit: 0,
          description: `مدين: مصروف شهر ${item.periodName} (${item.description})`,
        },
        {
          accountId: item.prepaid_account_id,
          debit: 0,
          credit: amount,
          description: `دائن: تخفيض المصروفات المدفوعة مقدماً (${item.description})`,
        },
      ],
      userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, userId);

    await db.query(`
      UPDATE expenses.prepaid_amortizations 
      SET is_posted = TRUE, posted_at = NOW(), journal_entry_id = $1
      WHERE id = $2
    `, [postedJe.id, amortizationId]);

    // Check if schedule is fully amortized
    const remainingRes = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM expenses.prepaid_amortizations WHERE schedule_id = $1 AND is_posted = FALSE',
      [item.schedule_id]
    );
    if (parseInt(remainingRes.rows[0].count, 10) === 0) {
      await db.query("UPDATE expenses.prepaid_schedules SET status = 'COMPLETED' WHERE id = $1", [item.schedule_id]);
    }

    await logAudit({
      userId,
      action: 'AMORTIZE',
      entityType: 'PREPAID_EXPENSE',
      entityId: amortizationId,
      newData: { scheduleId: item.schedule_id, journalEntryId: postedJe.id, amount },
    });

    return {
      success: true,
      journalEntryNumber: postedJe.entry_number,
      amount,
    };
  }

  // ==========================================
  // 5. Summaries & Subledger Reconciliations
  // ==========================================

  static async getExpenseSummary() {
    const db = await getDb();
    const today = new Date().toISOString().split('T')[0];
    const thisMonthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const thisYearStart = `${new Date().getFullYear()}-01-01`;

    const [todayRes, monthRes, yearRes, catRes, unpostedRes] = await Promise.all([
      db.query<any>('SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses.transactions WHERE expense_date = $1 AND status = $2', [today, 'POSTED']),
      db.query<any>('SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses.transactions WHERE expense_date >= $1 AND status = $2', [thisMonthStart, 'POSTED']),
      db.query<any>('SELECT COALESCE(SUM(total_amount), 0) as total FROM expenses.transactions WHERE expense_date >= $1 AND status = $2', [thisYearStart, 'POSTED']),
      db.query<any>(`
        SELECT cat.name, COALESCE(SUM(t.total_amount), 0) as total
        FROM expenses.transactions t
        JOIN expenses.expense_categories cat ON cat.id = t.category_id
        WHERE t.status = 'POSTED'
        GROUP BY cat.name
        ORDER BY total DESC
        LIMIT 5
      `),
      db.query<{ count: string }>("SELECT COUNT(*) as count FROM expenses.transactions WHERE status IN ('DRAFT', 'SUBMITTED', 'APPROVED')"),
    ]);

    const accruals = await this.getAccruals();
    const unPaidAccruals = accruals.filter(a => a.status === 'POSTED').reduce((sum, a) => sum + a.amount, 0);

    const prepaids = await this.getPrepaidSchedules();
    const remainingPrepaids = prepaids.reduce((sum, p) => sum + p.remainingBalance, 0);

    return {
      todayTotal: parseFloat(todayRes.rows[0]?.total || '0'),
      monthTotal: parseFloat(monthRes.rows[0]?.total || '0'),
      yearTotal: parseFloat(yearRes.rows[0]?.total || '0'),
      topCategories: catRes.rows.map((r: any) => ({ name: r.name, total: parseFloat(r.total || '0') })),
      unpostedCount: parseInt(unpostedRes.rows[0]?.count || '0', 10),
      unpaidAccruals: unPaidAccruals,
      remainingPrepaids: remainingPrepaids,
    };
  }
}
