import { getDb } from './db.ts';
import { logAudit } from './auditService.ts';

export interface CreateJournalEntryLineDto {
  accountId: string;
  costCenterId?: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface CreateJournalEntryDto {
  companyId?: string;
  branchId?: string;
  entryDate: string;
  fiscalPeriodId?: string;
  sourceId?: string;
  description: string;
  lines: CreateJournalEntryLineDto[];
  userId?: string;
}

export class AccountingService {
  /**
   * Retrieves the Chart of Accounts, ordered hierarchically by code
   */
  static async getAccounts() {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT 
        a.id,
        a.company_id as "companyId",
        a.parent_id as "parentId",
        a.code,
        a.name,
        a.account_type_id as "accountTypeId",
        t.name as "accountTypeName",
        a.level,
        a.is_group as "isGroup",
        a.is_active as "isActive",
        a.normal_balance as "normalBalance",
        COALESCE(
          (SELECT SUM(jl.debit - jl.credit) 
           FROM accounting.journal_entry_lines jl 
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id 
           WHERE jl.account_id = a.id AND je.status = 'POSTED'), 0
        ) as "balance"
      FROM accounting.accounts a
      LEFT JOIN accounting.account_types t ON t.id = a.account_type_id
      ORDER BY a.code ASC
    `);
    return res.rows;
  }

  /**
   * Creates a new Account in the Chart of Accounts
   */
  static async createAccount(data: {
    companyId?: string;
    parentId?: string;
    code: string;
    name: string;
    accountTypeId: string;
    level?: number;
    isGroup?: boolean;
    normalBalance?: 'DEBIT' | 'CREDIT';
    userId?: string;
  }) {
    const db = await getDb();

    // Default company if not provided
    let companyId = data.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    // Determine normal balance from account type if not specified
    let normalBalance = data.normalBalance;
    if (!normalBalance) {
      const typeRes = await db.query<{ normal_balance: 'DEBIT' | 'CREDIT' }>(
        'SELECT normal_balance FROM accounting.account_types WHERE id = $1',
        [data.accountTypeId]
      );
      normalBalance = typeRes.rows[0]?.normal_balance || 'DEBIT';
    }

    const res = await db.query<any>(`
      INSERT INTO accounting.accounts 
      (company_id, parent_id, code, name, account_type_id, level, is_group, is_active, normal_balance)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
      RETURNING *
    `, [
      companyId,
      data.parentId || null,
      data.code,
      data.name,
      data.accountTypeId,
      data.level || 1,
      data.isGroup ?? false,
      normalBalance,
    ]);

    const newAccount: any = res.rows[0];
    await logAudit({
      userId: data.userId,
      action: 'CREATE',
      entityType: 'ACCOUNT',
      entityId: newAccount.id,
      newData: newAccount,
    });

    return newAccount;
  }

  /**
   * Updates an existing Account
   */
  static async updateAccount(id: string, data: { name?: string; isActive?: boolean; userId?: string }) {
    const db = await getDb();
    const existing = await db.query<any>('SELECT * FROM accounting.accounts WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      throw new Error(`الحساب بالمعرف ${id} غير موجود`);
    }

    const current = existing.rows[0];
    const newName = data.name ?? current.name;
    const newActive = data.isActive ?? current.is_active;

    const res = await db.query<any>(`
      UPDATE accounting.accounts 
      SET name = $1, is_active = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `, [newName, newActive, id]);

    await logAudit({
      userId: data.userId,
      action: 'UPDATE',
      entityType: 'ACCOUNT',
      entityId: id,
      oldData: current,
      newData: res.rows[0],
    });

    return res.rows[0];
  }

  /**
   * Finds or infers active fiscal period for a given date
   */
  static async getPeriodForDate(dateStr: string) {
    const db = await getDb();
    const res = await db.query<any>(`
      SELECT * FROM accounting.fiscal_periods
      WHERE $1::date >= start_date AND $1::date <= end_date
      LIMIT 1
    `, [dateStr]);

    if (res.rows.length > 0) {
      return res.rows[0];
    }

    // Fallback: pick any open period
    const openPeriod = await db.query<any>(`
      SELECT * FROM accounting.fiscal_periods
      WHERE status = 'OPEN'
      ORDER BY period_number ASC
      LIMIT 1
    `);
    return openPeriod.rows[0] || null;
  }

  /**
   * Creates a draft or new journal entry with lines
   */
  static async createJournalEntry(dto: CreateJournalEntryDto) {
    const db = await getDb();

    if (!dto.lines || dto.lines.length < 2) {
      throw new Error('يجب أن يحتوي القيد على سطرين على الأقل (طرف مدين وطرف دائن)');
    }

    // Default company and branch
    let companyId = dto.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }

    let branchId = dto.branchId;
    if (!branchId) {
      const branchRes = await db.query<{ id: string }>('SELECT id FROM core.branches LIMIT 1');
      branchId = branchRes.rows[0]?.id;
    }

    // Find fiscal period
    let period: any = null;
    if (dto.fiscalPeriodId) {
      const pRes = await db.query<any>('SELECT * FROM accounting.fiscal_periods WHERE id = $1', [dto.fiscalPeriodId]);
      period = pRes.rows[0];
    } else {
      period = await this.getPeriodForDate(dto.entryDate);
    }

    if (!period) {
      throw new Error('لم يتم العثور على فترة مالية صالحة لتاريخ القيد');
    }

    // Generate unique sequential entry number
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM accounting.journal_entries');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const entryNumber = `JE-2026-${seq.toString().padStart(4, '0')}`;

    // Insert master journal entry
    const entryRes = await db.query<any>(`
      INSERT INTO accounting.journal_entries 
      (company_id, branch_id, entry_number, entry_date, fiscal_period_id, source_id, description, status, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8)
      RETURNING *
    `, [
      companyId,
      branchId,
      entryNumber,
      dto.entryDate,
      period.id,
      dto.sourceId || 'GL',
      dto.description,
      dto.userId || null,
    ]);

    const entry: any = entryRes.rows[0];

    // Insert detail lines
    let lineNum = 1;
    const createdLines = [];
    for (const line of dto.lines) {
      const lineRes = await db.query<any>(`
        INSERT INTO accounting.journal_entry_lines
        (journal_entry_id, account_id, cost_center_id, description, debit, credit, line_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [
        entry.id,
        line.accountId,
        line.costCenterId || null,
        line.description || dto.description,
        line.debit || 0,
        line.credit || 0,
        lineNum++,
      ]);
      createdLines.push(lineRes.rows[0]);
    }

    await logAudit({
      userId: dto.userId,
      action: 'CREATE',
      entityType: 'JOURNAL_ENTRY',
      entityId: entry.id,
      newData: { entry, lines: createdLines },
    });

    return { ...entry, lines: createdLines };
  }

  /**
   * Posts a journal entry:
   * 1. Validates SUM(debit) == SUM(credit) (Strict Double Entry Engine)
   * 2. Validates that fiscal period is 'OPEN' (Rejects posting to CLOSED or LOCKED)
   * 3. Changes status to 'POSTED' and sets posted_at timestamp
   */
  static async postJournalEntry(id: string, userId?: string) {
    const db = await getDb();

    // 1. Fetch entry
    const entryRes = await db.query<any>(`
      SELECT je.*, fp.status as "periodStatus", fp.name as "periodName"
      FROM accounting.journal_entries je
      JOIN accounting.fiscal_periods fp ON fp.id = je.fiscal_period_id
      WHERE je.id = $1
    `, [id]);

    if (entryRes.rows.length === 0) {
      throw new Error(`القيد المحاسبي برقم ${id} غير موجود`);
    }

    const entry: any = entryRes.rows[0];

    if (entry.status === 'POSTED') {
      throw new Error('القيد مرحل بالفعل ولا يمكن ترحيله مرة أخرى');
    }

    if (entry.status === 'REVERSED') {
      throw new Error('لا يمكن ترحيل قيد تم عكسه مسبقاً');
    }

    // 2. Fiscal Period Validation
    if (entry.periodStatus !== 'OPEN') {
      throw new Error(`لا يمكن ترحيل القيد: الفترة المالية "${entry.periodName}" مقفلة أو مغلقة (${entry.periodStatus})`);
    }

    // 3. Fetch lines and calculate totals
    const linesRes = await db.query<any>(`
      SELECT * FROM accounting.journal_entry_lines 
      WHERE journal_entry_id = $1 
      ORDER BY line_number ASC
    `, [id]);

    if (linesRes.rows.length < 2) {
      throw new Error('لا يمكن ترحيل قيد يحتوي على أقل من سطرين');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    for (const line of linesRes.rows as any[]) {
      totalDebit += parseFloat(line.debit);
      totalCredit += parseFloat(line.credit);
    }

    // Double-Entry Balance Check
    const diff = Math.abs(totalDebit - totalCredit);
    if (diff > 0.0001) {
      throw new Error(
        `فشل الترحيل: القيد غير متوازن! إجمالي المدين (${totalDebit.toLocaleString()}) لا يتساوى مع إجمالي الدائن (${totalCredit.toLocaleString()}). الفارق: ${diff.toFixed(2)}`
      );
    }

    // 4. Update status to POSTED
    const updatedRes = await db.query<any>(`
      UPDATE accounting.journal_entries 
      SET status = 'POSTED', posted_at = NOW(), posted_by = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [userId || null, id]);

    const postedEntry: any = updatedRes.rows[0];

    await logAudit({
      userId,
      action: 'POST',
      entityType: 'JOURNAL_ENTRY',
      entityId: id,
      newData: { postedEntry, totalDebit, totalCredit },
    });

    return {
      ...postedEntry,
      lines: linesRes.rows,
      totalDebit,
      totalCredit,
    };
  }

  /**
   * Reverses a POSTED journal entry:
   * 1. Creates an offsetting reversal entry (debits and credits swapped)
   * 2. Automatically posts the reversal entry
   * 3. Sets original entry status to 'REVERSED'
   */
  static async reverseJournalEntry(id: string, userId?: string) {
    const db = await getDb();

    const entryRes = await db.query<any>(`
      SELECT * FROM accounting.journal_entries WHERE id = $1
    `, [id]);

    if (entryRes.rows.length === 0) {
      throw new Error(`القيد المحاسبي برقم ${id} غير موجود`);
    }

    const original: any = entryRes.rows[0];

    if (original.status !== 'POSTED') {
      throw new Error('لا يمكن عكس قيد غير مرحّل؛ فقط القيود المرحلة يمكن عكسها');
    }

    // Fetch original lines
    const linesRes = await db.query<any>(`
      SELECT * FROM accounting.journal_entry_lines 
      WHERE journal_entry_id = $1
      ORDER BY line_number ASC
    `, [id]);

    // Swap debit and credit for reversal
    const reversalLines: CreateJournalEntryLineDto[] = linesRes.rows.map((l: any) => ({
      accountId: l.account_id,
      costCenterId: l.cost_center_id,
      description: `عكس: ${l.description || original.description}`,
      debit: parseFloat(l.credit), // Swapped!
      credit: parseFloat(l.debit), // Swapped!
    }));

    // Create the reversal entry
    const countRes = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM accounting.journal_entries');
    const seq = parseInt(countRes.rows[0].count, 10) + 1;
    const reversalNumber = `REV-2026-${seq.toString().padStart(4, '0')}`;

    const revRes = await db.query<any>(`
      INSERT INTO accounting.journal_entries 
      (company_id, branch_id, entry_number, entry_date, fiscal_period_id, source_id, description, status, reversed_entry_id, posted_at, posted_by, created_by)
      VALUES ($1, $2, $3, CURRENT_DATE, $4, 'SYSTEM', $5, 'POSTED', $6, NOW(), $7, $7)
      RETURNING *
    `, [
      original.company_id,
      original.branch_id,
      reversalNumber,
      original.fiscal_period_id,
      `عكس القيد رقم ${original.entry_number}: ${original.description}`,
      original.id,
      userId || null,
    ]);

    const reversalEntry: any = revRes.rows[0];

    // Insert swapped lines
    let lineNum = 1;
    for (const rl of reversalLines) {
      await db.query(`
        INSERT INTO accounting.journal_entry_lines
        (journal_entry_id, account_id, cost_center_id, description, debit, credit, line_number)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        reversalEntry.id,
        rl.accountId,
        rl.costCenterId || null,
        rl.description,
        rl.debit,
        rl.credit,
        lineNum++,
      ]);
    }

    // Mark original as REVERSED
    await db.query(`
      UPDATE accounting.journal_entries 
      SET status = 'REVERSED', reversed_entry_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [reversalEntry.id, original.id]);

    await logAudit({
      userId,
      action: 'REVERSE',
      entityType: 'JOURNAL_ENTRY',
      entityId: original.id,
      newData: { originalId: original.id, reversalId: reversalEntry.id },
    });

    return {
      originalId: original.id,
      reversalEntry,
      status: 'REVERSED',
    };
  }

  /**
   * Deletes a journal entry only if it is in DRAFT status
   */
  static async deleteJournalEntry(id: string, userId?: string) {
    const db = await getDb();
    const entryRes = await db.query<any>('SELECT * FROM accounting.journal_entries WHERE id = $1', [id]);
    if (entryRes.rows.length === 0) {
      throw new Error('القيد غير موجود');
    }

    const entry: any = entryRes.rows[0];
    if (entry.status !== 'DRAFT') {
      await logAudit({
        userId,
        action: 'DELETE_ATTEMPT',
        entityType: 'JOURNAL_ENTRY',
        entityId: id,
        oldData: entry,
      });
      throw new Error(`ممنوع حذف قيد بحالة ${entry.status}؛ القيود المرحلة لا يمكن حذفها بل يجب استخدام عكس القيد (Reversal)`);
    }

    await db.query('DELETE FROM accounting.journal_entries WHERE id = $1', [id]);
    await logAudit({
      userId,
      action: 'UPDATE',
      entityType: 'JOURNAL_ENTRY',
      entityId: id,
      oldData: entry,
    });
    return { success: true, message: 'تم حذف المسودة بنجاح' };
  }

  /**
   * Retrieves all Journal Entries with summary totals
   */
  static async getJournalEntries(limit = 50) {
    const db = await getDb();
    const res = await db.query(`
      SELECT 
        je.id,
        je.entry_number as "entryNumber",
        je.entry_date as "entryDate",
        je.description,
        je.status,
        je.source_id as "sourceId",
        fp.name as "periodName",
        COALESCE(SUM(jl.debit), 0) as "totalDebit",
        COALESCE(SUM(jl.credit), 0) as "totalCredit",
        COUNT(jl.id) as "linesCount",
        je.created_at as "createdAt"
      FROM accounting.journal_entries je
      LEFT JOIN accounting.fiscal_periods fp ON fp.id = je.fiscal_period_id
      LEFT JOIN accounting.journal_entry_lines jl ON jl.journal_entry_id = je.id
      GROUP BY je.id, fp.name
      ORDER BY je.created_at DESC
      LIMIT $1
    `, [limit]);

    return res.rows;
  }

  /**
   * Generates a Trial Balance (ميزان المراجعة) directly from posted journal lines
   */
  static async getTrialBalance() {
    const db = await getDb();
    const res = await db.query(`
      SELECT 
        a.id,
        a.code,
        a.name,
        a.normal_balance as "normalBalance",
        t.category,
        COALESCE(SUM(jl.debit), 0) as "totalDebit",
        COALESCE(SUM(jl.credit), 0) as "totalCredit",
        COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) as "balance"
      FROM accounting.accounts a
      JOIN accounting.account_types t ON t.id = a.account_type_id
      LEFT JOIN accounting.journal_entry_lines jl ON jl.account_id = a.id
      LEFT JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'POSTED'
      WHERE a.is_group = FALSE
      GROUP BY a.id, a.code, a.name, a.normal_balance, t.category
      ORDER BY a.code ASC
    `);
    return res.rows;
  }

  /**
   * Retrieves fiscal years and periods
   */
  static async getFiscalYears() {
    const db = await getDb();
    const res = await db.query(`
      SELECT fy.*, 
        (SELECT json_agg(fp.* ORDER BY fp.period_number ASC) 
         FROM accounting.fiscal_periods fp 
         WHERE fp.fiscal_year_id = fy.id) as periods
      FROM accounting.fiscal_years fy
      ORDER BY fy.start_date DESC
    `);
    return res.rows;
  }

  static async getFiscalPeriods() {
    const db = await getDb();
    const res = await db.query(`
      SELECT fp.*, fy.year_name as "yearName"
      FROM accounting.fiscal_periods fp
      JOIN accounting.fiscal_years fy ON fy.id = fp.fiscal_year_id
      ORDER BY fp.start_date ASC
    `);
    return res.rows;
  }
}
