import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';
import { AccountingService } from './accountingService.ts';

export interface CreateCashAccountDto {
  code: string;
  name: string;
  type?: 'MAIN' | 'SALES' | 'PETTY_CASH' | 'BRANCH' | 'CUSTOM';
  currencyId?: string;
  glAccountId?: string;
  openingBalance?: number;
  branchId?: string;
  companyId?: string;
  notes?: string;
  userId?: string;
}

export interface CreateBankAccountDto {
  code: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  iban?: string;
  swiftBic?: string;
  branchName?: string;
  currencyId?: string;
  glAccountId?: string;
  openingBalance?: number;
  branchId?: string;
  companyId?: string;
  notes?: string;
  userId?: string;
}

export interface CreateTransferDto {
  transferDate: string;
  transferType: 'CASH_TO_CASH' | 'BANK_TO_BANK' | 'CASH_TO_BANK' | 'BANK_TO_CASH';
  fromCategory: 'CASH' | 'BANK';
  fromCashAccountId?: string;
  fromBankAccountId?: string;
  toCategory: 'CASH' | 'BANK';
  toCashAccountId?: string;
  toBankAccountId?: string;
  amount: number;
  feeAmount?: number;
  description: string;
  branchId?: string;
  companyId?: string;
  userId?: string;
}

export interface CreateBankChargeDto {
  bankAccountId: string;
  chargeDate: string;
  amount: number;
  description: string;
  referenceNumber?: string;
  branchId?: string;
  companyId?: string;
  userId?: string;
}

export interface StatementLineInput {
  transactionDate: string;
  referenceNumber?: string;
  description: string;
  direction: 'DEPOSIT' | 'WITHDRAWAL';
  amount: number;
  balanceAfter?: number;
}

export interface CreateBankStatementDto {
  bankAccountId: string;
  statementNumber: string;
  statementDate: string;
  fromDate: string;
  toDate: string;
  openingBalance: number;
  closingBalance: number;
  notes?: string;
  lines: StatementLineInput[];
  userId?: string;
}

export interface CreateBankReconciliationDto {
  bankAccountId: string;
  statementId?: string;
  reconciliationDate: string;
  periodEndDate: string;
  statementClosingBalance: number;
  matchedTransactionIds?: string[];
  matchedStatementLineIds?: string[];
  notes?: string;
  userId?: string;
}

export interface CashDenominationInput {
  denominationValue: number;
  countUnits: number;
}

export interface CreateCashCountDto {
  cashAccountId: string;
  countDate: string;
  countedByName: string;
  denominations: CashDenominationInput[];
  notes?: string;
  userId?: string;
}

export class BankingService {
  // ==========================================
  // Helper: Default Company & Branch
  // ==========================================
  private static async getDefaults(companyId?: string, branchId?: string) {
    const db = await getDb();
    let compId = companyId;
    if (!compId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      compId = compRes.rows[0]?.id;
    }
    let brId = branchId;
    if (!brId) {
      const brRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      brId = brRes.rows[0]?.id;
    }
    return { companyId: compId, branchId: brId };
  }

  // ==========================================
  // 1. Cash Accounts (الخزائن والصناديق النقدية)
  // ==========================================

  static async getCashAccounts() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        a.name as "glAccountName",
        a.code as "glAccountCode",
        b.name as "branchName",
        curr.symbol as "currencySymbol",
        COALESCE(
          (SELECT SUM(CASE WHEN t.direction = 'INFLOW' THEN t.amount ELSE -t.amount END)
           FROM banking.transactions t
           WHERE t.cash_account_id = c.id), 0.0000
        ) as "currentBalance",
        (SELECT COUNT(*) FROM banking.transactions t WHERE t.cash_account_id = c.id) as "transactionsCount"
      FROM banking.cash_accounts c
      LEFT JOIN accounting.accounts a ON a.id = c.gl_account_id
      LEFT JOIN core.branches b ON b.id = c.branch_id
      LEFT JOIN core.currencies curr ON curr.id = c.currency_id
      ORDER BY c.created_at ASC
    `);
    return res.rows.map((row: any) => ({
      ...row,
      currentBalance: parseFloat(row.currentBalance || '0'),
      opening_balance: parseFloat(row.opening_balance || '0'),
      transactionsCount: parseInt(row.transactionsCount || '0', 10),
    }));
  }

  static async getCashAccountById(id: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        c.*,
        a.name as "glAccountName",
        a.code as "glAccountCode",
        b.name as "branchName",
        curr.symbol as "currencySymbol",
        COALESCE(
          (SELECT SUM(CASE WHEN t.direction = 'INFLOW' THEN t.amount ELSE -t.amount END)
           FROM banking.transactions t
           WHERE t.cash_account_id = c.id), 0.0000
        ) as "currentBalance"
      FROM banking.cash_accounts c
      LEFT JOIN accounting.accounts a ON a.id = c.gl_account_id
      LEFT JOIN core.branches b ON b.id = c.branch_id
      LEFT JOIN core.currencies curr ON curr.id = c.currency_id
      WHERE c.id = $1
    `, [id]);

    if (res.rows.length === 0) {
      throw new Error(`حساب الصندوق برقم ${id} غير موجود`);
    }

    const row = res.rows[0];
    return {
      ...row,
      currentBalance: parseFloat(row.currentBalance || '0'),
      opening_balance: parseFloat(row.opening_balance || '0'),
    };
  }

  static async createCashAccount(dto: CreateCashAccountDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    // Validate code uniqueness
    const codeCheck = await db.query<any>(
      'SELECT id FROM banking.cash_accounts WHERE company_id = $1 AND code = $2 LIMIT 1',
      [companyId, dto.code]
    );
    if (codeCheck.rows.length > 0) {
      throw new Error(`كود الصندوق (${dto.code}) مسجل بالفعل، يرجى اختيار كود فريد`);
    }

    // Default GL Account: 1101 (الصندوق والخزينة)
    let glAccountId = dto.glAccountId;
    if (!glAccountId) {
      const glRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1101' LIMIT 1");
      glAccountId = glRes.rows[0]?.id;
    }

    // Base Currency
    let currencyId = dto.currencyId;
    if (!currencyId) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      currencyId = curRes.rows[0]?.id;
    }

    const openingBalance = dto.openingBalance || 0;

    const res = await db.query<any>(`
      INSERT INTO banking.cash_accounts 
      (company_id, branch_id, code, name, type, currency_id, gl_account_id, opening_balance, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.code,
      dto.name,
      dto.type || 'MAIN',
      currencyId,
      glAccountId,
      openingBalance,
      dto.notes || null,
    ]);

    const created = res.rows[0];

    // If opening balance > 0, generate opening transaction in ledger
    if (openingBalance > 0) {
      const txNum = `TXN-INIT-CASH-${Date.now().toString().slice(-6)}`;
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, description, is_reconciled, created_by)
        VALUES ($1, $2, $3, CURRENT_DATE, 'CASH', $4, 'OPENING', 'INFLOW', $5, $6, 'OPENING', $7, TRUE, $8)
      `, [
        companyId,
        branchId,
        txNum,
        created.id,
        openingBalance,
        currencyId,
        `رصيد افتتاحي للصندوق: ${created.name}`,
        dto.userId || null,
      ]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'CASH_ACCOUNT',
      entityId: created.id,
      newData: created,
    });

    return created;
  }

  static async updateCashAccount(id: string, dto: { name?: string; type?: string; isActive?: boolean; notes?: string; userId?: string }) {
    const db = await getDb();
    const existing = await this.getCashAccountById(id);

    const res = await db.query<any>(`
      UPDATE banking.cash_accounts
      SET name = COALESCE($1, name),
          type = COALESCE($2, type),
          is_active = COALESCE($3, is_active),
          notes = COALESCE($4, notes),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `, [
      dto.name ?? null,
      dto.type ?? null,
      dto.isActive !== undefined ? dto.isActive : null,
      dto.notes ?? null,
      id,
    ]);

    const updated = res.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'UPDATE',
      entityType: 'CASH_ACCOUNT',
      entityId: id,
      oldData: existing,
      newData: updated,
    });

    return updated;
  }

  // ==========================================
  // 2. Bank Accounts (حسابات البنوك)
  // ==========================================

  static async getBankAccounts() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        b.*,
        a.name as "glAccountName",
        a.code as "glAccountCode",
        br.name as "branchName",
        curr.symbol as "currencySymbol",
        COALESCE(
          (SELECT SUM(CASE WHEN t.direction = 'INFLOW' THEN t.amount ELSE -t.amount END)
           FROM banking.transactions t
           WHERE t.bank_account_id = b.id), 0.0000
        ) as "currentBalance",
        (SELECT COUNT(*) FROM banking.transactions t WHERE t.bank_account_id = b.id) as "transactionsCount",
        (SELECT COUNT(*) FROM banking.bank_statements bs WHERE bs.bank_account_id = b.id) as "statementsCount",
        (SELECT COUNT(*) FROM banking.transactions t WHERE t.bank_account_id = b.id AND t.is_reconciled = FALSE) as "unreconciledCount"
      FROM banking.bank_accounts b
      LEFT JOIN accounting.accounts a ON a.id = b.gl_account_id
      LEFT JOIN core.branches br ON br.id = b.branch_id
      LEFT JOIN core.currencies curr ON curr.id = b.currency_id
      ORDER BY b.created_at ASC
    `);
    return res.rows.map((row: any) => ({
      ...row,
      currentBalance: parseFloat(row.currentBalance || '0'),
      opening_balance: parseFloat(row.opening_balance || '0'),
      transactionsCount: parseInt(row.transactionsCount || '0', 10),
      statementsCount: parseInt(row.statementsCount || '0', 10),
      unreconciledCount: parseInt(row.unreconciledCount || '0', 10),
    }));
  }

  static async getBankAccountById(id: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        b.*,
        a.name as "glAccountName",
        a.code as "glAccountCode",
        br.name as "branchName",
        curr.symbol as "currencySymbol",
        COALESCE(
          (SELECT SUM(CASE WHEN t.direction = 'INFLOW' THEN t.amount ELSE -t.amount END)
           FROM banking.transactions t
           WHERE t.bank_account_id = b.id), 0.0000
        ) as "currentBalance"
      FROM banking.bank_accounts b
      LEFT JOIN accounting.accounts a ON a.id = b.gl_account_id
      LEFT JOIN core.branches br ON br.id = b.branch_id
      LEFT JOIN core.currencies curr ON curr.id = b.currency_id
      WHERE b.id = $1
    `, [id]);

    if (res.rows.length === 0) {
      throw new Error(`حساب البنك برقم ${id} غير موجود`);
    }

    const row = res.rows[0];
    return {
      ...row,
      currentBalance: parseFloat(row.currentBalance || '0'),
      opening_balance: parseFloat(row.opening_balance || '0'),
    };
  }

  static async createBankAccount(dto: CreateBankAccountDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    // Validate code uniqueness
    const codeCheck = await db.query<any>(
      'SELECT id FROM banking.bank_accounts WHERE company_id = $1 AND code = $2 LIMIT 1',
      [companyId, dto.code]
    );
    if (codeCheck.rows.length > 0) {
      throw new Error(`كود البنك (${dto.code}) مسجل مسبقاً، يرجى استخدام كود فريد`);
    }

    // Default GL Account: 1102 (حسابات البنوك)
    let glAccountId = dto.glAccountId;
    if (!glAccountId) {
      const glRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '1102' LIMIT 1");
      glAccountId = glRes.rows[0]?.id;
    }

    // Base Currency
    let currencyId = dto.currencyId;
    if (!currencyId) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      currencyId = curRes.rows[0]?.id;
    }

    const openingBalance = dto.openingBalance || 0;

    const res = await db.query<any>(`
      INSERT INTO banking.bank_accounts 
      (company_id, branch_id, code, bank_name, account_name, account_number, iban, swift_bic, branch_name, currency_id, gl_account_id, opening_balance, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      companyId,
      branchId,
      dto.code,
      dto.bankName,
      dto.accountName,
      dto.accountNumber,
      dto.iban || null,
      dto.swiftBic || null,
      dto.branchName || null,
      currencyId,
      glAccountId,
      openingBalance,
      dto.notes || null,
    ]);

    const created = res.rows[0];

    // If opening balance > 0, generate opening ledger transaction
    if (openingBalance > 0) {
      const txNum = `TXN-INIT-BANK-${Date.now().toString().slice(-6)}`;
      await db.query(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, description, is_reconciled, created_by)
        VALUES ($1, $2, $3, CURRENT_DATE, 'BANK', $4, 'OPENING', 'INFLOW', $5, $6, 'OPENING', $7, TRUE, $8)
      `, [
        companyId,
        branchId,
        txNum,
        created.id,
        openingBalance,
        currencyId,
        `رصيد افتتاحي لحساب البنك: ${created.bank_name} - ${created.account_name}`,
        dto.userId || null,
      ]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'BANK_ACCOUNT',
      entityId: created.id,
      newData: created,
    });

    return created;
  }

  static async updateBankAccount(id: string, dto: {
    bankName?: string;
    accountName?: string;
    accountNumber?: string;
    iban?: string;
    swiftBic?: string;
    branchName?: string;
    isActive?: boolean;
    notes?: string;
    userId?: string;
  }) {
    const db = await getDb();
    const existing = await this.getBankAccountById(id);

    const res = await db.query<any>(`
      UPDATE banking.bank_accounts
      SET bank_name = COALESCE($1, bank_name),
          account_name = COALESCE($2, account_name),
          account_number = COALESCE($3, account_number),
          iban = COALESCE($4, iban),
          swift_bic = COALESCE($5, swift_bic),
          branch_name = COALESCE($6, branch_name),
          is_active = COALESCE($7, is_active),
          notes = COALESCE($8, notes),
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `, [
      dto.bankName ?? null,
      dto.accountName ?? null,
      dto.accountNumber ?? null,
      dto.iban ?? null,
      dto.swiftBic ?? null,
      dto.branchName ?? null,
      dto.isActive !== undefined ? dto.isActive : null,
      dto.notes ?? null,
      id,
    ]);

    const updated = res.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'UPDATE',
      entityType: 'BANK_ACCOUNT',
      entityId: id,
      oldData: existing,
      newData: updated,
    });

    return updated;
  }

  // ==========================================
  // 3. Transactions Ledger (Single Source of Truth)
  // ==========================================

  static async getTransactions(filters: {
    accountCategory?: 'CASH' | 'BANK';
    cashAccountId?: string;
    bankAccountId?: string;
    transactionType?: string;
    isReconciled?: boolean;
    fromDate?: string;
    toDate?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const db = await getDb();
    let query = `
      SELECT 
        t.*,
        ca.name as "cashAccountName",
        ca.code as "cashAccountCode",
        ba.bank_name as "bankName",
        ba.account_name as "bankAccountName",
        ba.account_number as "bankAccountNumber",
        ba.code as "bankAccountCode",
        curr.symbol as "currencySymbol",
        je.entry_number as "journalEntryNumber",
        u.full_name as "createdByName"
      FROM banking.transactions t
      LEFT JOIN banking.cash_accounts ca ON ca.id = t.cash_account_id
      LEFT JOIN banking.bank_accounts ba ON ba.id = t.bank_account_id
      LEFT JOIN core.currencies curr ON curr.id = t.currency_id
      LEFT JOIN accounting.journal_entries je ON je.id = t.journal_entry_id
      LEFT JOIN security.users u ON u.id = t.created_by
      WHERE 1=1
    `;
    const params: any[] = [];
    let pIdx = 1;

    if (filters.accountCategory) {
      query += ` AND t.account_category = $${pIdx++}`;
      params.push(filters.accountCategory);
    }
    if (filters.cashAccountId) {
      query += ` AND t.cash_account_id = $${pIdx++}`;
      params.push(filters.cashAccountId);
    }
    if (filters.bankAccountId) {
      query += ` AND t.bank_account_id = $${pIdx++}`;
      params.push(filters.bankAccountId);
    }
    if (filters.transactionType) {
      query += ` AND t.transaction_type = $${pIdx++}`;
      params.push(filters.transactionType);
    }
    if (filters.isReconciled !== undefined) {
      query += ` AND t.is_reconciled = $${pIdx++}`;
      params.push(filters.isReconciled);
    }
    if (filters.fromDate) {
      query += ` AND t.transaction_date >= $${pIdx++}`;
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      query += ` AND t.transaction_date <= $${pIdx++}`;
      params.push(filters.toDate);
    }
    if (filters.search) {
      query += ` AND (t.description ILIKE $${pIdx} OR t.transaction_number ILIKE $${pIdx} OR t.reference_number ILIKE $${pIdx})`;
      params.push(`%${filters.search}%`);
      pIdx++;
    }

    query += ` ORDER BY t.transaction_date DESC, t.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${pIdx++}`;
      params.push(filters.limit);
    }
    if (filters.offset) {
      query += ` OFFSET $${pIdx++}`;
      params.push(filters.offset);
    }

    const res = await db.query<any>(query, params);
    return res.rows.map((row: any) => ({
      ...row,
      amount: parseFloat(row.amount || '0'),
    }));
  }

  static async getAccountBalance(category: 'CASH' | 'BANK', accountId: string): Promise<number> {
    const db = await getDb();
    const idColumn = category === 'CASH' ? 'cash_account_id' : 'bank_account_id';
    const res = await db.query<any>(`
      SELECT COALESCE(
        SUM(CASE WHEN direction = 'INFLOW' THEN amount ELSE -amount END),
        0.0000
      ) as balance
      FROM banking.transactions
      WHERE ${idColumn} = $1
    `, [accountId]);

    return parseFloat(res.rows[0]?.balance || '0');
  }

  // ==========================================
  // 4. Transfers (التحويلات النقدية والبنكية والإيداعات والسحوبات)
  // ==========================================

  static async createTransfer(dto: CreateTransferDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    if (dto.amount <= 0) {
      throw new Error('مبلغ التحويل يجب أن يكون أكبر من صفر');
    }

    const feeAmount = dto.feeAmount || 0;
    const totalRequired = dto.amount + feeAmount;

    // Validate Source Account & Destination Account
    let sourceName = '';
    let destName = '';
    let sourceGlId = '';
    let destGlId = '';
    let sourceBalance = 0;

    if (dto.fromCategory === 'CASH') {
      if (!dto.fromCashAccountId) throw new Error('يرجى تحديد حساب الصندوق المصدر');
      const srcAcc = await this.getCashAccountById(dto.fromCashAccountId);
      sourceName = srcAcc.name;
      sourceGlId = srcAcc.gl_account_id;
      sourceBalance = await this.getAccountBalance('CASH', dto.fromCashAccountId);
    } else {
      if (!dto.fromBankAccountId) throw new Error('يرجى تحديد حساب البنك المصدر');
      const srcAcc = await this.getBankAccountById(dto.fromBankAccountId);
      sourceName = `${srcAcc.bank_name} - ${srcAcc.account_name}`;
      sourceGlId = srcAcc.gl_account_id;
      sourceBalance = await this.getAccountBalance('BANK', dto.fromBankAccountId);
    }

    if (dto.toCategory === 'CASH') {
      if (!dto.toCashAccountId) throw new Error('يرجى تحديد حساب الصندوق المستلم');
      const dstAcc = await this.getCashAccountById(dto.toCashAccountId);
      destName = dstAcc.name;
      destGlId = dstAcc.gl_account_id;
    } else {
      if (!dto.toBankAccountId) throw new Error('يرجى تحديد حساب البنك المستلم');
      const dstAcc = await this.getBankAccountById(dto.toBankAccountId);
      destName = `${dstAcc.bank_name} - ${dstAcc.account_name}`;
      destGlId = dstAcc.gl_account_id;
    }

    // Guard: Prevent transferring to same account
    if (dto.fromCategory === 'CASH' && dto.toCategory === 'CASH' && dto.fromCashAccountId === dto.toCashAccountId) {
      throw new Error('لا يمكن التحويل من وإلى نفس الصندوق');
    }
    if (dto.fromCategory === 'BANK' && dto.toCategory === 'BANK' && dto.fromBankAccountId === dto.toBankAccountId) {
      throw new Error('لا يمكن التحويل من وإلى نفس الحساب البنكي');
    }

    // Guard: Sufficient Balance Check
    if (sourceBalance < totalRequired) {
      throw new Error(`الرصيد المتاح في الحساب المصدر (${sourceBalance.toLocaleString()} ر.ي) غير كافٍ لتغطية مبلغ التحويل مع العمولات (${totalRequired.toLocaleString()} ر.ي)`);
    }

    // Bank Charge Expense GL Account: 5302
    let bankChargeGlId = '';
    if (feeAmount > 0) {
      const chargeGlRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5302' LIMIT 1");
      if (chargeGlRes.rows.length === 0) {
        throw new Error('حساب عمولات ومصروفات بنكية (كود 5302) غير موجود في دليل الحسابات');
      }
      bankChargeGlId = chargeGlRes.rows[0].id;
    }

    // Generate Transfer Number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM banking.transfers');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const transferNumber = `TRF-2026-${seq.toString().padStart(4, '0')}`;

    // Base Currency
    const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
    const currencyId = curRes.rows[0]?.id;

    // 1. Create Double-Entry Journal Entry (Atomic)
    const journalLines = [
      {
        accountId: destGlId,
        debit: dto.amount,
        credit: 0,
        description: `مدين: ${destName} (تحويل وارد من ${sourceName} - سند ${transferNumber})`,
      },
    ];

    if (feeAmount > 0) {
      journalLines.push({
        accountId: bankChargeGlId,
        debit: feeAmount,
        credit: 0,
        description: `مدين: عمولات ومصروفات تحويل بنكي (سند ${transferNumber})`,
      });
    }

    journalLines.push({
      accountId: sourceGlId,
      debit: 0,
      credit: totalRequired,
      description: `دائن: ${sourceName} (تحويل صادر إلى ${destName} - سند ${transferNumber})`,
    });

    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.transferDate,
      sourceId: 'GL',
      description: `قيد تحويل مالي (${transferNumber}): من ${sourceName} إلى ${destName} بمبلغ ${dto.amount.toLocaleString()} ر.ي`,
      lines: journalLines,
      userId: dto.userId,
    });

    // Post Journal Entry immediately
    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    // 2. Determine Outflow & Inflow Transaction Types
    let outflowType = 'CASH_TRANSFER_OUT';
    let inflowType = 'CASH_TRANSFER_IN';
    if (dto.transferType === 'BANK_TO_BANK') {
      outflowType = 'BANK_TRANSFER_OUT';
      inflowType = 'BANK_TRANSFER_IN';
    } else if (dto.transferType === 'CASH_TO_BANK') {
      outflowType = 'CASH_TRANSFER_OUT';
      inflowType = 'CASH_DEPOSIT';
    } else if (dto.transferType === 'BANK_TO_CASH') {
      outflowType = 'CASH_WITHDRAWAL';
      inflowType = 'CASH_TRANSFER_IN';
    }

    // 3. Record Outflow Transaction
    const outTxNum = `TXN-${transferNumber}-OUT`;
    const outTxRes = await db.query<any>(`
      INSERT INTO banking.transactions 
      (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, payee_or_payer, description, journal_entry_id, is_reconciled, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OUTFLOW', $9, $10, 'TRANSFER', $11, $12, $13, $14, FALSE, $15)
      RETURNING *
    `, [
      companyId,
      branchId,
      outTxNum,
      dto.transferDate,
      dto.fromCategory,
      dto.fromCategory === 'CASH' ? dto.fromCashAccountId : null,
      dto.fromCategory === 'BANK' ? dto.fromBankAccountId : null,
      outflowType,
      dto.amount,
      currencyId,
      transferNumber,
      destName,
      `تحويل صادر إلى: ${destName} - ${dto.description}`,
      postedJe.id,
      dto.userId || null,
    ]);

    // 4. Record Fee Transaction if applicable
    let feeTxId: string | null = null;
    if (feeAmount > 0) {
      const feeTxNum = `TXN-${transferNumber}-FEE`;
      const feeTxRes = await db.query<any>(`
        INSERT INTO banking.transactions 
        (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, description, journal_entry_id, is_reconciled, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'BANK_CHARGE', 'OUTFLOW', $8, $9, 'CHARGE', $10, $11, $12, FALSE, $13)
        RETURNING id
      `, [
        companyId,
        branchId,
        feeTxNum,
        dto.transferDate,
        dto.fromCategory,
        dto.fromCategory === 'CASH' ? dto.fromCashAccountId : null,
        dto.fromCategory === 'BANK' ? dto.fromBankAccountId : null,
        feeAmount,
        currencyId,
        transferNumber,
        `عمولة ومصروفات تحويل بنكي (سند ${transferNumber})`,
        postedJe.id,
        dto.userId || null,
      ]);
      feeTxId = feeTxRes.rows[0]?.id;
    }

    // 5. Record Inflow Transaction
    const inTxNum = `TXN-${transferNumber}-IN`;
    const inTxRes = await db.query<any>(`
      INSERT INTO banking.transactions 
      (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, payee_or_payer, description, journal_entry_id, is_reconciled, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'INFLOW', $9, $10, 'TRANSFER', $11, $12, $13, $14, FALSE, $15)
      RETURNING *
    `, [
      companyId,
      branchId,
      inTxNum,
      dto.transferDate,
      dto.toCategory,
      dto.toCategory === 'CASH' ? dto.toCashAccountId : null,
      dto.toCategory === 'BANK' ? dto.toBankAccountId : null,
      inflowType,
      dto.amount,
      currencyId,
      transferNumber,
      sourceName,
      `تحويل وارد من: ${sourceName} - ${dto.description}`,
      postedJe.id,
      dto.userId || null,
    ]);

    // 6. Save Transfer Master Record
    const trfRes = await db.query<any>(`
      INSERT INTO banking.transfers 
      (company_id, branch_id, transfer_number, transfer_date, transfer_type, from_category, from_cash_account_id, from_bank_account_id, to_category, to_cash_account_id, to_bank_account_id, amount, fee_amount, description, status, outflow_transaction_id, inflow_transaction_id, fee_transaction_id, journal_entry_id, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'COMPLETED', $15, $16, $17, $18, $19)
      RETURNING *
    `, [
      companyId,
      branchId,
      transferNumber,
      dto.transferDate,
      dto.transferType,
      dto.fromCategory,
      dto.fromCashAccountId || null,
      dto.fromBankAccountId || null,
      dto.toCategory,
      dto.toCashAccountId || null,
      dto.toBankAccountId || null,
      dto.amount,
      feeAmount,
      dto.description,
      outTxRes.rows[0].id,
      inTxRes.rows[0].id,
      feeTxId,
      postedJe.id,
      dto.userId || null,
    ]);

    const transfer = trfRes.rows[0];

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'TRANSFER',
      entityId: transfer.id,
      newData: { transfer, journalEntryId: postedJe.id },
    });

    return {
      ...transfer,
      journalEntryNumber: postedJe.entry_number,
    };
  }

  static async getTransfers(limit = 50) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        tr.*,
        fca.name as "fromCashName",
        fba.bank_name as "fromBankName",
        fba.account_name as "fromBankAccountName",
        tca.name as "toCashName",
        tba.bank_name as "toBankName",
        tba.account_name as "toBankAccountName",
        je.entry_number as "journalEntryNumber"
      FROM banking.transfers tr
      LEFT JOIN banking.cash_accounts fca ON fca.id = tr.from_cash_account_id
      LEFT JOIN banking.bank_accounts fba ON fba.id = tr.from_bank_account_id
      LEFT JOIN banking.cash_accounts tca ON tca.id = tr.to_cash_account_id
      LEFT JOIN banking.bank_accounts tba ON tba.id = tr.to_bank_account_id
      LEFT JOIN accounting.journal_entries je ON je.id = tr.journal_entry_id
      ORDER BY tr.transfer_date DESC, tr.created_at DESC
      LIMIT $1
    `, [limit]);

    return res.rows.map((row: any) => ({
      ...row,
      amount: parseFloat(row.amount || '0'),
      fee_amount: parseFloat(row.fee_amount || '0'),
    }));
  }

  // ==========================================
  // 5. Direct Bank Charges (المصروفات والعمولات البنكية)
  // ==========================================

  static async createBankCharge(dto: CreateBankChargeDto) {
    const db = await getDb();
    const { companyId, branchId } = await this.getDefaults(dto.companyId, dto.branchId);

    if (dto.amount <= 0) {
      throw new Error('مبلغ العمولة البنكية يجب أن يكون أكبر من صفر');
    }

    const bankAcc = await this.getBankAccountById(dto.bankAccountId);

    // Expense GL Account: 5302
    const expGlRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5302' LIMIT 1");
    if (expGlRes.rows.length === 0) {
      throw new Error('حساب عمولات ومصروفات بنكية (كود 5302) غير موجود في دليل الحسابات');
    }
    const expGlId = expGlRes.rows[0].id;

    // Double-Entry Journal:
    // Debit: 5302 عمولات ومصروفات بنكية
    // Credit: Bank GL Account (1102)
    const je = await AccountingService.createJournalEntry({
      companyId,
      branchId,
      entryDate: dto.chargeDate,
      sourceId: 'PAYMENTS',
      description: `عمولات ومصروفات بنكية لحساب ${bankAcc.bank_name} - ${dto.description}`,
      lines: [
        {
          accountId: expGlId,
          debit: dto.amount,
          credit: 0,
          description: `مدين: عمولات ومصروفات بنكية - ${bankAcc.bank_name}`,
        },
        {
          accountId: bankAcc.gl_account_id,
          debit: 0,
          credit: dto.amount,
          description: `دائن: ${bankAcc.bank_name} - خصم عمولة ومصروفات بنكية`,
        },
      ],
      userId: dto.userId,
    });

    const postedJe = await AccountingService.postJournalEntry(je.id, dto.userId);

    // Record in Banking Transactions Ledger
    const txNum = `CHG-${Date.now().toString().slice(-6)}`;
    const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
    const currencyId = curRes.rows[0]?.id;

    const txRes = await db.query<any>(`
      INSERT INTO banking.transactions 
      (company_id, branch_id, transaction_number, transaction_date, account_category, bank_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_number, description, journal_entry_id, is_reconciled, created_by)
      VALUES ($1, $2, $3, $4, 'BANK', $5, 'BANK_CHARGE', 'OUTFLOW', $6, $7, 'CHARGE', $8, $9, $10, FALSE, $11)
      RETURNING *
    `, [
      companyId,
      branchId,
      txNum,
      dto.chargeDate,
      bankAcc.id,
      dto.amount,
      currencyId,
      dto.referenceNumber || null,
      dto.description,
      postedJe.id,
      dto.userId || null,
    ]);

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'BANK_CHARGE',
      entityId: txRes.rows[0].id,
      newData: { transaction: txRes.rows[0], journalEntryId: postedJe.id },
    });

    return {
      transaction: txRes.rows[0],
      journalEntryNumber: postedJe.entry_number,
    };
  }

  // ==========================================
  // 6. Bank Statements (كشوف الحسابات البنكية)
  // ==========================================

  static async getBankStatements(bankAccountId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        bs.*,
        ba.bank_name as "bankName",
        ba.account_name as "accountName",
        ba.account_number as "accountNumber",
        ba.code as "bankCode",
        (SELECT COUNT(*) FROM banking.bank_statement_lines bsl WHERE bsl.statement_id = bs.id) as "totalLines",
        (SELECT COUNT(*) FROM banking.bank_statement_lines bsl WHERE bsl.statement_id = bs.id AND bsl.is_reconciled = TRUE) as "reconciledLines"
      FROM banking.bank_statements bs
      JOIN banking.bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (bankAccountId) {
      query += ` AND bs.bank_account_id = $1`;
      params.push(bankAccountId);
    }
    query += ` ORDER BY bs.statement_date DESC, bs.created_at DESC`;

    const res = await db.query<any>(query, params);
    return res.rows.map((row: any) => ({
      ...row,
      opening_balance: parseFloat(row.opening_balance || '0'),
      closing_balance: parseFloat(row.closing_balance || '0'),
      total_deposits: parseFloat(row.total_deposits || '0'),
      total_withdrawals: parseFloat(row.total_withdrawals || '0'),
      totalLines: parseInt(row.totalLines || '0', 10),
      reconciledLines: parseInt(row.reconciledLines || '0', 10),
    }));
  }

  static async getBankStatementById(id: string) {
    const db = await getDb();
    const sRes = await db.query<any>(`
      SELECT 
        bs.*,
        ba.bank_name as "bankName",
        ba.account_name as "accountName",
        ba.account_number as "accountNumber",
        ba.code as "bankCode"
      FROM banking.bank_statements bs
      JOIN banking.bank_accounts ba ON ba.id = bs.bank_account_id
      WHERE bs.id = $1
    `, [id]);

    if (sRes.rows.length === 0) {
      throw new Error(`كشف الحساب البنكي بالمعرف ${id} غير موجود`);
    }

    const linesRes = await db.query<any>(`
      SELECT 
        bsl.*,
        t.transaction_number as "matchedTransactionNumber",
        t.description as "matchedTransactionDescription"
      FROM banking.bank_statement_lines bsl
      LEFT JOIN banking.transactions t ON t.id = bsl.matched_transaction_id
      WHERE bsl.statement_id = $1
      ORDER BY bsl.line_number ASC
    `, [id]);

    const statement = sRes.rows[0];
    return {
      ...statement,
      opening_balance: parseFloat(statement.opening_balance || '0'),
      closing_balance: parseFloat(statement.closing_balance || '0'),
      total_deposits: parseFloat(statement.total_deposits || '0'),
      total_withdrawals: parseFloat(statement.total_withdrawals || '0'),
      lines: linesRes.rows.map((l: any) => ({
        ...l,
        amount: parseFloat(l.amount || '0'),
        balance_after: l.balance_after ? parseFloat(l.balance_after) : null,
      })),
    };
  }

  static async createBankStatement(dto: CreateBankStatementDto) {
    const db = await getDb();
    const { companyId } = await this.getDefaults();

    // Check duplicate statement number for this bank
    const checkDup = await db.query<any>(
      'SELECT id FROM banking.bank_statements WHERE bank_account_id = $1 AND statement_number = $2 LIMIT 1',
      [dto.bankAccountId, dto.statementNumber]
    );
    if (checkDup.rows.length > 0) {
      throw new Error(`رقم كشف الحساب (${dto.statementNumber}) مسجل مسبقاً لهذا الحساب البنكي`);
    }

    // Calculate deposits and withdrawals from lines
    let totalDeposits = 0;
    let totalWithdrawals = 0;
    for (const line of dto.lines) {
      if (line.direction === 'DEPOSIT') {
        totalDeposits += line.amount;
      } else {
        totalWithdrawals += line.amount;
      }
    }

    const sRes = await db.query<any>(`
      INSERT INTO banking.bank_statements 
      (company_id, bank_account_id, statement_number, statement_date, from_date, to_date, opening_balance, closing_balance, total_deposits, total_withdrawals, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'OPEN', $11, $12)
      RETURNING *
    `, [
      companyId,
      dto.bankAccountId,
      dto.statementNumber,
      dto.statementDate,
      dto.fromDate,
      dto.toDate,
      dto.openingBalance,
      dto.closingBalance,
      totalDeposits,
      totalWithdrawals,
      dto.notes || null,
      dto.userId || null,
    ]);

    const statement = sRes.rows[0];

    // Insert lines
    let lineNum = 1;
    const insertedLines = [];
    for (const line of dto.lines) {
      const lRes = await db.query<any>(`
        INSERT INTO banking.bank_statement_lines 
        (statement_id, line_number, transaction_date, reference_number, description, direction, amount, balance_after, is_reconciled)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, FALSE)
        RETURNING *
      `, [
        statement.id,
        lineNum++,
        line.transactionDate,
        line.referenceNumber || null,
        line.description,
        line.direction,
        line.amount,
        line.balanceAfter || null,
      ]);
      insertedLines.push(lRes.rows[0]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'BANK_STATEMENT',
      entityId: statement.id,
      newData: { statement, linesCount: insertedLines.length },
    });

    return {
      ...statement,
      lines: insertedLines,
    };
  }

  // ==========================================
  // 7. Bank Reconciliation (التسويات والمطابقات البنكية)
  // ==========================================

  static async getBankReconciliations(bankAccountId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        br.*,
        ba.bank_name as "bankName",
        ba.account_name as "accountName",
        ba.account_number as "accountNumber",
        ba.code as "bankCode",
        bs.statement_number as "statementNumber"
      FROM banking.bank_reconciliations br
      JOIN banking.bank_accounts ba ON ba.id = br.bank_account_id
      LEFT JOIN banking.bank_statements bs ON bs.id = br.statement_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (bankAccountId) {
      query += ` AND br.bank_account_id = $1`;
      params.push(bankAccountId);
    }
    query += ` ORDER BY br.reconciliation_date DESC, br.created_at DESC`;

    const res = await db.query<any>(query, params);
    return res.rows.map((row: any) => ({
      ...row,
      statement_closing_balance: parseFloat(row.statement_closing_balance || '0'),
      gl_book_balance: parseFloat(row.gl_book_balance || '0'),
      unreconciled_deposits: parseFloat(row.unreconciled_deposits || '0'),
      unreconciled_withdrawals: parseFloat(row.unreconciled_withdrawals || '0'),
      adjusted_bank_balance: parseFloat(row.adjusted_bank_balance || '0'),
      difference: parseFloat(row.difference || '0'),
    }));
  }

  static async getReconciliationPreview(bankAccountId: string, periodEndDate: string, statementClosingBalance: number) {
    const db = await getDb();
    const bank = await this.getBankAccountById(bankAccountId);

    // Book balance at period end date from banking.transactions
    const bookBalanceRes = await db.query<any>(`
      SELECT COALESCE(
        SUM(CASE WHEN direction = 'INFLOW' THEN amount ELSE -amount END),
        0.0000
      ) as balance
      FROM banking.transactions
      WHERE bank_account_id = $1 AND transaction_date <= $2
    `, [bankAccountId, periodEndDate]);

    const glBookBalance = parseFloat(bookBalanceRes.rows[0]?.balance || '0');

    // Unreconciled transactions in book up to periodEndDate
    const unreconciledTxRes = await db.query<any>(`
      SELECT * FROM banking.transactions
      WHERE bank_account_id = $1 
        AND transaction_date <= $2 
        AND is_reconciled = FALSE
      ORDER BY transaction_date ASC
    `, [bankAccountId, periodEndDate]);

    const unreconciledTx = unreconciledTxRes.rows.map((r: any) => ({
      ...r,
      amount: parseFloat(r.amount || '0'),
    }));

    // Inflows in book not yet in bank statement = Deposits in transit
    let unreconciledDeposits = 0;
    // Outflows in book not yet in bank statement = Outstanding checks / withdrawals
    let unreconciledWithdrawals = 0;

    for (const tx of unreconciledTx) {
      if (tx.direction === 'INFLOW') {
        unreconciledDeposits += tx.amount;
      } else {
        unreconciledWithdrawals += tx.amount;
      }
    }

    // Standard Bank Reconciliation Formula:
    // Adjusted Bank Balance = Statement Balance + Deposits in Transit - Outstanding Withdrawals
    const adjustedBankBalance = statementClosingBalance + unreconciledDeposits - unreconciledWithdrawals;
    const difference = adjustedBankBalance - glBookBalance;

    return {
      bank,
      periodEndDate,
      statementClosingBalance,
      glBookBalance,
      unreconciledDeposits,
      unreconciledWithdrawals,
      adjustedBankBalance,
      difference,
      isBalanced: Math.abs(difference) < 0.001,
      unreconciledTransactions: unreconciledTx,
    };
  }

  static async createBankReconciliation(dto: CreateBankReconciliationDto) {
    const db = await getDb();
    const { companyId } = await this.getDefaults();

    const preview = await this.getReconciliationPreview(
      dto.bankAccountId,
      dto.periodEndDate,
      dto.statementClosingBalance
    );

    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM banking.bank_reconciliations');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const recNumber = `REC-2026-${seq.toString().padStart(4, '0')}`;

    const rRes = await db.query<any>(`
      INSERT INTO banking.bank_reconciliations 
      (company_id, bank_account_id, statement_id, reconciliation_number, reconciliation_date, period_end_date, statement_closing_balance, gl_book_balance, unreconciled_deposits, unreconciled_withdrawals, adjusted_bank_balance, difference, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'COMPLETED', $13, $14)
      RETURNING *
    `, [
      companyId,
      dto.bankAccountId,
      dto.statementId || null,
      recNumber,
      dto.reconciliationDate,
      dto.periodEndDate,
      dto.statementClosingBalance,
      preview.glBookBalance,
      preview.unreconciledDeposits,
      preview.unreconciledWithdrawals,
      preview.adjustedBankBalance,
      preview.difference,
      dto.notes || null,
      dto.userId || null,
    ]);

    const reconciliation = rRes.rows[0];

    // Mark matched transactions as reconciled
    if (dto.matchedTransactionIds && dto.matchedTransactionIds.length > 0) {
      for (const txId of dto.matchedTransactionIds) {
        await db.query(`
          UPDATE banking.transactions 
          SET is_reconciled = TRUE, reconciled_at = NOW(), reconciliation_id = $1
          WHERE id = $2
        `, [reconciliation.id, txId]);
      }
    }

    // Mark matched statement lines as reconciled
    if (dto.matchedStatementLineIds && dto.matchedStatementLineIds.length > 0) {
      for (const lineId of dto.matchedStatementLineIds) {
        await db.query(`
          UPDATE banking.bank_statement_lines 
          SET is_reconciled = TRUE
          WHERE id = $1
        `, [lineId]);
      }
    }

    // If linked to a statement, update statement status to RECONCILED
    if (dto.statementId) {
      await db.query(`
        UPDATE banking.bank_statements 
        SET status = 'RECONCILED'
        WHERE id = $1
      `, [dto.statementId]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'BANK_RECONCILIATION',
      entityId: reconciliation.id,
      newData: reconciliation,
    });

    return reconciliation;
  }

  // ==========================================
  // 8. Cash Counts & Cash Reconciliation (جرد وتسوية الصناديق)
  // ==========================================

  static async getCashCounts(cashAccountId?: string) {
    const db = await getDb();
    let query = `
      SELECT 
        cc.*,
        ca.name as "cashAccountName",
        ca.code as "cashAccountCode",
        u.full_name as "createdByName",
        ap.full_name as "approvedByName",
        je.entry_number as "journalEntryNumber"
      FROM banking.cash_counts cc
      JOIN banking.cash_accounts ca ON ca.id = cc.cash_account_id
      LEFT JOIN security.users u ON u.id = cc.created_by
      LEFT JOIN security.users ap ON ap.id = cc.approved_by
      LEFT JOIN accounting.journal_entries je ON je.id = cc.adjustment_journal_entry_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (cashAccountId) {
      query += ` AND cc.cash_account_id = $1`;
      params.push(cashAccountId);
    }
    query += ` ORDER BY cc.count_date DESC, cc.created_at DESC`;

    const res = await db.query<any>(query, params);
    return res.rows.map((row: any) => ({
      ...row,
      book_balance: parseFloat(row.book_balance || '0'),
      actual_balance: parseFloat(row.actual_balance || '0'),
      discrepancy: parseFloat(row.discrepancy || '0'),
    }));
  }

  static async getCashCountById(id: string) {
    const db = await getDb();
    const cRes = await db.query<any>(`
      SELECT 
        cc.*,
        ca.name as "cashAccountName",
        ca.code as "cashAccountCode",
        u.full_name as "createdByName",
        ap.full_name as "approvedByName",
        je.entry_number as "journalEntryNumber"
      FROM banking.cash_counts cc
      JOIN banking.cash_accounts ca ON ca.id = cc.cash_account_id
      LEFT JOIN security.users u ON u.id = cc.created_by
      LEFT JOIN security.users ap ON ap.id = cc.approved_by
      LEFT JOIN accounting.journal_entries je ON je.id = cc.adjustment_journal_entry_id
      WHERE cc.id = $1
    `, [id]);

    if (cRes.rows.length === 0) {
      throw new Error(`محضر جرد الصندوق بالمعرف ${id} غير موجود`);
    }

    const denomsRes = await db.query<any>(`
      SELECT * FROM banking.cash_count_denominations
      WHERE cash_count_id = $1
      ORDER BY denomination_value DESC
    `, [id]);

    const count = cRes.rows[0];
    return {
      ...count,
      book_balance: parseFloat(count.book_balance || '0'),
      actual_balance: parseFloat(count.actual_balance || '0'),
      discrepancy: parseFloat(count.discrepancy || '0'),
      denominations: denomsRes.rows.map((d: any) => ({
        ...d,
        denomination_value: parseFloat(d.denomination_value || '0'),
        count_units: parseInt(d.count_units || '0', 10),
        subtotal: parseFloat(d.subtotal || '0'),
      })),
    };
  }

  static async createCashCount(dto: CreateCashCountDto) {
    const db = await getDb();
    const { companyId } = await this.getDefaults();

    const cashAcc = await this.getCashAccountById(dto.cashAccountId);

    // Book balance from Ledger transactions up to now
    const bookBalance = await this.getAccountBalance('CASH', dto.cashAccountId);

    // Calculate actual physical cash from denominations
    let actualBalance = 0;
    const denomRecords = [];
    for (const d of dto.denominations) {
      const subtotal = d.denominationValue * d.countUnits;
      actualBalance += subtotal;
      denomRecords.push({
        ...d,
        subtotal,
      });
    }

    // Discrepancy = actual - book
    // negative = shortage (عجز), positive = surplus (فائض)
    const discrepancy = actualBalance - bookBalance;

    const countSeq = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM banking.cash_counts');
    const seq = parseInt(countSeq.rows[0].count, 10) + 1;
    const countNumber = `CNT-2026-${seq.toString().padStart(4, '0')}`;

    const ccRes = await db.query<any>(`
      INSERT INTO banking.cash_counts 
      (company_id, cash_account_id, count_number, count_date, counted_by_name, book_balance, actual_balance, discrepancy, status, notes, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'DRAFT', $9, $10)
      RETURNING *
    `, [
      companyId,
      dto.cashAccountId,
      countNumber,
      dto.countDate,
      dto.countedByName,
      bookBalance,
      actualBalance,
      discrepancy,
      dto.notes || null,
      dto.userId || null,
    ]);

    const count = ccRes.rows[0];

    // Insert denomination breakdown
    for (const d of denomRecords) {
      await db.query(`
        INSERT INTO banking.cash_count_denominations 
        (cash_count_id, denomination_value, count_units, subtotal)
        VALUES ($1, $2, $3, $4)
      `, [count.id, d.denominationValue, d.countUnits, d.subtotal]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'CASH_COUNT',
      entityId: count.id,
      newData: { count, denominations: denomRecords },
    });

    return {
      ...count,
      book_balance: parseFloat(count.book_balance || '0'),
      actual_balance: parseFloat(count.actual_balance || '0'),
      discrepancy: parseFloat(count.discrepancy || '0'),
      denominations: denomRecords,
    };
  }

  static async approveCashCount(countId: string, userId?: string) {
    const db = await getDb();
    const count = await this.getCashCountById(countId);

    if (count.status === 'APPROVED') {
      throw new Error('محضر الجرد معتمد بالفعل');
    }
    if (count.status === 'VOIDED') {
      throw new Error('لا يمكن اعتماد محضر جرد ملغى');
    }

    const { companyId, branchId } = await this.getDefaults();
    const cashAcc = await this.getCashAccountById(count.cash_account_id);
    const discrepancy = count.discrepancy;

    let adjustmentTxId: string | null = null;
    let adjustmentJeId: string | null = null;

    // If there is discrepancy, post auto-adjustment
    if (Math.abs(discrepancy) > 0.001) {
      const curRes = await db.query<any>('SELECT id FROM core.currencies WHERE is_base = TRUE LIMIT 1');
      const currencyId = curRes.rows[0]?.id;

      if (discrepancy < 0) {
        // Shortage / Deficit (عجز نقدية)
        // Debit: 5303 خسائر وعجز الصندوق والخزينة
        // Credit: Cash GL Account (1101)
        const absShortage = Math.abs(discrepancy);
        const shortageAccRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '5303' LIMIT 1");
        const shortageAccId = shortageAccRes.rows[0]?.id;

        const je = await AccountingService.createJournalEntry({
          companyId,
          branchId,
          entryDate: count.count_date,
          sourceId: 'SYSTEM',
          description: `تسوية عجز جرد الصندوق (${count.cashAccountName}) بموجب المحضر ${count.count_number}`,
          lines: [
            {
              accountId: shortageAccId,
              debit: absShortage,
              credit: 0,
              description: `مدين: خسائر وعجز الصندوق والخزينة (محضر ${count.count_number})`,
            },
            {
              accountId: cashAcc.gl_account_id,
              debit: 0,
              credit: absShortage,
              description: `دائن: ${cashAcc.name} (تخفيض الرصيد لتسوية العجز)`,
            },
          ],
          userId,
        });

        const postedJe = await AccountingService.postJournalEntry(je.id, userId);
        adjustmentJeId = postedJe.id;

        // Ledger Outflow
        const txRes = await db.query<any>(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_id, reference_number, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'CASH', $5, 'ADJUSTMENT_OUT', 'OUTFLOW', $6, $7, 'RECONCILIATION', $8, $9, $10, $11, TRUE, $12)
          RETURNING id
        `, [
          companyId,
          branchId,
          `ADJ-${count.count_number}`,
          count.count_date,
          cashAcc.id,
          absShortage,
          currencyId,
          count.id,
          count.count_number,
          `تسوية عجز جرد الصندوق بموجب محضر الجرد ${count.count_number}`,
          postedJe.id,
          userId || null,
        ]);
        adjustmentTxId = txRes.rows[0].id;

      } else {
        // Surplus / Overage (فائض نقدية)
        // Debit: Cash GL Account (1101)
        // Credit: 4102 فائض وأرباح تسوية الصندوق
        const surplusAmount = discrepancy;
        const surplusAccRes = await db.query<any>("SELECT id FROM accounting.accounts WHERE code = '4102' LIMIT 1");
        const surplusAccId = surplusAccRes.rows[0]?.id;

        const je = await AccountingService.createJournalEntry({
          companyId,
          branchId,
          entryDate: count.count_date,
          sourceId: 'SYSTEM',
          description: `تسوية فائض جرد الصندوق (${count.cashAccountName}) بموجب المحضر ${count.count_number}`,
          lines: [
            {
              accountId: cashAcc.gl_account_id,
              debit: surplusAmount,
              credit: 0,
              description: `مدين: ${cashAcc.name} (زيادة الرصيد لتسوية الفائض)`,
            },
            {
              accountId: surplusAccId,
              debit: 0,
              credit: surplusAmount,
              description: `دائن: فائض وأرباح تسوية الصندوق (محضر ${count.count_number})`,
            },
          ],
          userId,
        });

        const postedJe = await AccountingService.postJournalEntry(je.id, userId);
        adjustmentJeId = postedJe.id;

        // Ledger Inflow
        const txRes = await db.query<any>(`
          INSERT INTO banking.transactions 
          (company_id, branch_id, transaction_number, transaction_date, account_category, cash_account_id, transaction_type, direction, amount, currency_id, reference_type, reference_id, reference_number, description, journal_entry_id, is_reconciled, created_by)
          VALUES ($1, $2, $3, $4, 'CASH', $5, 'ADJUSTMENT_IN', 'INFLOW', $6, $7, 'RECONCILIATION', $8, $9, $10, $11, TRUE, $12)
          RETURNING id
        `, [
          companyId,
          branchId,
          `ADJ-${count.count_number}`,
          count.count_date,
          cashAcc.id,
          surplusAmount,
          currencyId,
          count.id,
          count.count_number,
          `تسوية فائض جرد الصندوق بموجب محضر الجرد ${count.count_number}`,
          postedJe.id,
          userId || null,
        ]);
        adjustmentTxId = txRes.rows[0].id;
      }
    }

    // Update count status
    const updateRes = await db.query<any>(`
      UPDATE banking.cash_counts
      SET status = 'APPROVED',
          adjustment_transaction_id = $1,
          adjustment_journal_entry_id = $2,
          approved_at = NOW(),
          approved_by = $3
      WHERE id = $4
      RETURNING *
    `, [adjustmentTxId, adjustmentJeId, userId || null, countId]);

    const approvedCount = updateRes.rows[0];

    await logAudit({
      userId,
      action: 'APPROVE',
      entityType: 'CASH_COUNT',
      entityId: countId,
      newData: approvedCount,
    });

    return approvedCount;
  }

  // ==========================================
  // 9. Liquidity & Financial Summary
  // ==========================================

  static async getLiquiditySummary() {
    const cashAccounts = await this.getCashAccounts();
    const bankAccounts = await this.getBankAccounts();

    const totalCash = cashAccounts.reduce((sum, c) => sum + (c.is_active ? c.currentBalance : 0), 0);
    const totalBank = bankAccounts.reduce((sum, b) => sum + (b.is_active ? b.currentBalance : 0), 0);
    const totalLiquidity = totalCash + totalBank;

    // 30-day Inflow & Outflow
    const db = await getDb();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const dateStr = thirtyDaysAgo.toISOString().split('T')[0];

    const flowsRes = await db.query<any>(`
      SELECT 
        direction,
        SUM(amount) as total
      FROM banking.transactions
      WHERE transaction_date >= $1
      GROUP BY direction
    `, [dateStr]);

    let total30DayInflow = 0;
    let total30DayOutflow = 0;
    for (const r of flowsRes.rows) {
      if (r.direction === 'INFLOW') total30DayInflow = parseFloat(r.total || '0');
      if (r.direction === 'OUTFLOW') total30DayOutflow = parseFloat(r.total || '0');
    }

    const recentTx = await this.getTransactions({ limit: 10 });

    return {
      totalCash,
      totalBank,
      totalLiquidity,
      total30DayInflow,
      total30DayOutflow,
      cashAccountsCount: cashAccounts.length,
      bankAccountsCount: bankAccounts.length,
      recentTransactions: recentTx,
    };
  }
}
