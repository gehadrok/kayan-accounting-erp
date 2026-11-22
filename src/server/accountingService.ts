import { getDb, withTransaction } from './db.ts';
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

// =====================================================================
// PHASE 11.0 — Excel import (صيغة ملف «دليل.xlsx» للنظام المرجعي السابق)
// =====================================================================
//
// أحد أسطر ملف الاستيراد بالضبط كما يخرجها النظام السابق:
//   رقم الحساب | العملة | اسم الحساب | المستوى | النوع | الحساب الرئيسي | التضمين | نوع التقرير
//     1111010002  $,R.S,R.Y  النقدية لدى الصرافة   6      فرعي    111101         =        الميزانية العمومية
//
// قواعد الاستيراد:
//   * الكود هو مفتاح الدمج (UPSERT): الحساب الموجود يُحدَّث، والجديد يُنشأ.
//   * الأب يُربط برمز الحساب الرئيسي داخل الملف (طوبولوجيا: الأقصر أولًا).
//   * التصنيف المحاسبي يُستنتج من اسم جذر الشجرة (الأصول/الخصوم/حقوق
//     الملكية/المصاريف/الإيرادات) فيرثه كل أبنائه — لذا يعمل الملف سواء كان
//     الترتيب 3=المصاريف 4=الإيرادات أو الترتيب القياسي 4/5.
//   * طبيعة الرصيد والنوع (رئيسي/فرعي) يُستنتجان تلقائيًا عند غيابهما.

export interface AccountImportRow {
  code: string;
  name: string;
  currencyTokens?: string[];
  level?: number;
  isGroup?: boolean;
  parentCode?: string | null;
}

export interface AccountImportSummary {
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ row?: number; code?: string; message: string }>;
}

/** رموز العملات في ملف النظام السابق مقابل أكواد العملات القياسية (ISO). */
const CURRENCY_TOKEN_MAP: Record<string, string> = {
  '$': 'USD',
  'R.Y': 'YER',
  'R.S': 'SAR',
  'AED': 'AED',
  'G.S': 'GBP',
  'EUR': 'EUR',
  'EURO': 'EUR',
};

/** يحوّل قائمة رموز العملات إلى نص مخزن موحّد ("USD,SAR,YER"). */
function normalizeCurrencyTokens(tokens: Array<string>): string {
  const mapped = tokens
    .map((raw) => {
      const token = String(raw || '').trim().replace(/,/g, '');
      return CURRENCY_TOKEN_MAP[token.toUpperCase()] || token;
    })
    .filter(Boolean);
  return [...new Set(mapped)].join(',');
}

const ROOT_CLASSIFICATION: Array<{
  accountTypeId: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  keywords: string[];
}> = [
  { accountTypeId: 'ASSET', normalBalance: 'DEBIT', keywords: ['أصول', 'اصول', 'الأصل'] },
  { accountTypeId: 'LIABILITY', normalBalance: 'CREDIT', keywords: ['خصوم', 'الخصوم', 'التزامات', 'الالتزامات'] },
  { accountTypeId: 'EQUITY', normalBalance: 'CREDIT', keywords: ['حقوق', 'رأس المال', 'راس المال', 'الملكية'] },
  { accountTypeId: 'EXPENSE', normalBalance: 'DEBIT', keywords: ['مصاريف', 'مصروفات', 'تكاليف'] },
  { accountTypeId: 'REVENUE', normalBalance: 'CREDIT', keywords: ['إيرادات', 'ايرادات', 'الإيرادات', 'الايرادات'] },
];

function classifyRoot(rootName: string): { accountTypeId: string; normalBalance: 'DEBIT' | 'CREDIT' } | null {
  const compact = String(rootName || '').replace(/[أإآ]/g, 'ا').replace(/\s+/g, ' ').trim();
  for (const rule of ROOT_CLASSIFICATION) {
    for (const keyword of rule.keywords) {
      const normalizedKeyword = keyword.replace(/[أإآ]/g, 'ا');
      if (compact.includes(normalizedKeyword)) {
        return { accountTypeId: rule.accountTypeId, normalBalance: rule.normalBalance };
      }
    }
  }
  return null;
}

/** أقرب بادئة موجودة (في الملف أو في الدليل الحالي) للحساب — شبكة أمان للشجرة البادئية. */
function nearestExistingAncestor(
  code: string,
  codeToId: Map<string, string>,
  fileByCode: Map<string, unknown>
): string | null {
  let ancestor = code.slice(0, -1);
  while (ancestor.length >= 1) {
    if (codeToId.has(ancestor) || fileByCode.has(ancestor)) return ancestor;
    ancestor = ancestor.slice(0, -1);
  }
  return null;
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
        a.currency_codes as "currencyCodes",
        COALESCE(
          (SELECT SUM(jl.debit - jl.credit) 
           FROM accounting.journal_entry_lines jl 
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id 
           WHERE jl.account_id = a.id AND je.status IN ('POSTED', 'REVERSED')), 0
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
    currencyCodes?: string[] | string;
    userId?: string;
  }) {
    const db = await getDb();

    // PHASE COA-1 — دليل الحسابات: فحص سلامة الكود ونوع الحساب وقواعد الأب قبل الإنشاء.
    if (!data.code || !/^\d+$/.test(data.code) || data.code.length > 50) {
      throw new Error('كود الحساب يجب أن يتكون من أرقام فقط (بحد أقصى 50 خانة).');
    }
    if (!data.name || !data.accountTypeId) {
      throw new Error('كود الحساب واسمه ونوعه حقول مطلوبة.');
    }

    // PHASE COA-1 — حساب فرعي يرتبط بأب تجميعي (رئيسي) بمستوى الأب + 1،
    // والمستوى يُحسب من قاعدة البيانات وليس من قيمة موثقة من العميل.
    let level = data.level || 1;
    let parentId = data.parentId || null;
    if (parentId) {
      const parentRes = await db.query<any>('SELECT * FROM accounting.accounts WHERE id = $1', [parentId]);
      const parent = parentRes.rows[0];
      if (!parent) {
        throw new Error('الحساب الأب المحدد غير موجود في شجرة الحسابات.');
      }
      if (!parent.is_group) {
        throw new Error(`الحساب الأب المحدد «${parent.code} - ${parent.name}» حساب تفصيلي ولا يمكن أن يكون أباً — الحساب الرئيسي التجميعي مطلوب.`);
      }
      level = (parent.level || 1) + 1;
    }

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

    // العملات: تُقبل قائمة رموز أو نص مفصول بفواصل (نفس صيغة الاستيراد "USD,SAR,YER")
    let currencyInput: string[] = [];
    if (Array.isArray(data.currencyCodes)) {
      currencyInput = data.currencyCodes.filter(Boolean).map(String);
    } else if (typeof data.currencyCodes === 'string' && data.currencyCodes.trim()) {
      currencyInput = data.currencyCodes.split(',').map((t) => t.trim()).filter(Boolean);
    }

    const res = await db.query<any>(`
      INSERT INTO accounting.accounts 
      (company_id, parent_id, code, name, account_type_id, level, is_group, is_active, normal_balance, currency_codes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)
      RETURNING *
    `, [
      companyId,
      parentId,
      data.code,
      data.name,
      data.accountTypeId,
      level,
      data.isGroup ?? false,
      normalBalance,
      currencyInput.length ? normalizeCurrencyTokens(currencyInput) : null,
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

    // PHASE COA-1 — قواعد آمنة لتعديل الحساب: لا يُسمح بتعطيل حساب
    // مرتبط بحركات محاسبية مسجلة (مرحلة/معكوسة/تقرير).
    if (data.isActive === false) {
      const movementRes = await db.query<{ id: string }>(
        `SELECT jl.id AS "id"
           FROM accounting.journal_entry_lines jl
           JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
          WHERE jl.account_id = $1 AND je.status IN ('POSTED', 'REVERSED')
          LIMIT 1`,
        [id]
      );
      if (movementRes.rows.length > 0) {
        throw new Error(`الحساب «${current.code} - ${current.name}» مرتبط بحركات محاسبية مسجلة ولا يمكن تعطيله.`);
      }
    }

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
   * PHASE COA-1 — حذف آمن للحساب من دليل الحسابات.
   *
   * القواعد:
   *  - يُحذف فقط الحسابات الخالية من الفروع (الأبناء) وعن أي حركة محاسبية.
   *  - يُرفض حذف أي حساب تملك حسابات فرعية أو تمرّ بقيد/عكس/تقرير.
   */
  static async deleteAccount(id: string, userId?: string) {
    const db = await getDb();
    const accountRes = await db.query<any>('SELECT * FROM accounting.accounts WHERE id = $1', [id]);
    if (accountRes.rows.length === 0) {
      throw new Error(`الحساب بالمعرف ${id} غير موجود`);
    }
    const account: any = accountRes.rows[0];

    const childrenRes = await db.query<any>(
      'SELECT id FROM accounting.accounts WHERE parent_id = $1 LIMIT 1',
      [id]
    );
    if (childrenRes.rows.length > 0) {
      throw new Error(`الحساب «${account.code} - ${account.name}» له حسابات فرعية مرتبطة به ولا يمكن حذفه.`);
    }

    const movementsRes = await db.query<any>(
      `SELECT jl.id AS "id"
         FROM accounting.journal_entry_lines jl
         JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id
        WHERE jl.account_id = $1 AND je.status IN ('POSTED', 'REVERSED')
        LIMIT 1`,
      [id]
    );
    if (movementsRes.rows.length > 0) {
      throw new Error(`الحساب «${account.code} - ${account.name}» مرتبط بحركات محاسبية مسجلة (قيود/تقرير) ولا يمكن حذفه.`);
    }

    await db.query('DELETE FROM accounting.accounts WHERE id = $1', [id]);

    await logAudit({
      userId,
      action: 'DELETE',
      entityType: 'ACCOUNT',
      entityId: id,
      oldData: account,
    });

    return account;
  }

  /**
   * يفسر قيمة النوع في ملف الاستيراد: «رئيسي» = حساب تجميعي، «فرعي» = تفصيلي.
   * تقبل boolean صريحًا أو نص النظام السابق.
   */
  private static parseGroupFlag(raw: unknown): boolean | undefined {
    if (raw === undefined || raw === null || String(raw).trim() === '') return undefined;
    if (typeof raw === 'boolean') return raw;
    const value = String(raw).replace(/[أإآ]/g, 'ا').trim();
    if (value.includes('فرعي')) return false;
    if (value.includes('رئيسي')) return true;
    return undefined;
  }

  /**
   * PHASE 11.0 — استيراد دليل الحسابات من ملف إكسل (صيغة النظام المرجعي).
   *
   * الاستيراد دمـجي (merge): الحساب الموجود بنفس الكود يُحدَّث في مكانه
   * (الاسم/النوع/المستوى/الأب/العملات) والحساب الجديد يُنشأ. لا يُعطّل ولا يُحذف
   * أي حساب — القيود المرتبطة به تبقى سليمة. العملية ذرّية: أي خطأ يُجهض
   * الاستيراد كله فلا تبقى شجرة ناقصة في قاعدة البيانات.
   */
  static async importAccounts(data: {
    companyId?: string;
    rows: AccountImportRow[];
    userId?: string;
  }): Promise<AccountImportSummary> {
    const db = await getDb();
    const summary: AccountImportSummary = { inserted: 0, updated: 0, skipped: 0, errors: [] };
    const fail = (row: number, code: string | null, message: string) => {
      summary.errors.push({ row, code: code || undefined, message });
      summary.skipped++;
    };

    if (!Array.isArray(data.rows) || data.rows.length === 0) {
      throw new Error('لا توجد صفوف للاستيراد — تأكد من ورقة العمل.');
    }

    let companyId = data.companyId;
    if (!companyId) {
      const compRes = await db.query<{ id: string }>('SELECT id FROM core.companies LIMIT 1');
      companyId = compRes.rows[0]?.id;
    }
    if (!companyId) throw new Error('لا توجد شركة مرتبطة لحفظ الحسابات.');

    interface Prepared {
      index: number;       // رقم الصف داخل ورقة الإكسل (العنوان = سطر 1)
      code: string;
      name: string;
      parentCode: string | null;
      level: number | null;
      explicitGroup: boolean | undefined;
      currencyTokens: string[];
      valid: boolean;
      type: string;
      balance: 'DEBIT' | 'CREDIT';
    }

    await withTransaction(async () => {
      const existingRes = await db.query<{
        id: string; code: string; parent_id: string | null; account_type_id: string;
        level: number; is_group: boolean; normal_balance: 'DEBIT' | 'CREDIT';
      }>(
        'SELECT id, code, parent_id, account_type_id, level, is_group, normal_balance FROM accounting.accounts WHERE company_id = $1',
        [companyId]
      );
      const codeToId = new Map<string, string>();
      const levelById = new Map<string, number>();
      for (const acc of existingRes.rows) {
        codeToId.set(acc.code, acc.id);
        levelById.set(acc.id, acc.level);
      }
      const existingByCode = new Map(existingRes.rows.map((acc) => [acc.code, acc]));

      // حسابات عليها حركات: لا يجوز تغيير نوعها المحاسبي أثناء الدمج
      const typeLocked = new Set<string>(
        (
          await db.query<{ account_id: string }>(
            `SELECT DISTINCT jl.account_id::text AS account_id
               FROM accounting.journal_entry_lines jl
               JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id`
          )
        ).rows.map((r) => r.account_id)
      );

      // <- نوع وطبيعة كل تصنيف من جدول account_types (قراءة واحدة مسبقة)
      const typeBalances = new Map<string, 'DEBIT' | 'CREDIT'>(
        (
          await db.query<{ id: string; normal_balance: 'DEBIT' | 'CREDIT' }>(
            'SELECT id, normal_balance FROM accounting.account_types'
          )
        ).rows.map((r) => [r.id, r.normal_balance])
      );

      // ---- Pass 1: فحص الصفوف وبناء الخرائط ----
      const fileByCode = new Map<string, Prepared>();
      const prepared: Prepared[] = [];
      for (let i = 0; i < data.rows.length; i++) {
        const row = data.rows[i];
        const rowNum = i + 2; // سطر العناوين = 1 في ورقة الإكسل
        const code = String(row.code ?? '').trim();
        const name = String(row.name ?? '').trim();

        if (!code) { fail(rowNum, null, 'رقم الحساب فارغ.'); continue; }
        if (!/^\d+$/.test(code)) { fail(rowNum, code, 'رقم الحساب يجب أن يتكون من أرقام فقط.'); continue; }
        if (code.length > 50) { fail(rowNum, code, 'رقم الحساب أطول من الحد المسموح (50 خانة).'); continue; }
        if (fileByCode.has(code)) {
          fail(rowNum, code, `رقم الحساب ${code} مكرر في الملف (موجود قبل ذلك في الصف ${fileByCode.get(code)!.index}).`);
          continue;
        }
        if (!name) { fail(rowNum, code, 'اسم الحساب فارغ.'); continue; }

        let parentCode = row.parentCode ? String(row.parentCode).trim() : '';
        if (parentCode === '0' || parentCode === code) parentCode = '';
        if (parentCode && !/^\d+$/.test(parentCode)) {
          fail(rowNum, code, `الحساب الرئيسي «${row.parentCode}» يجب أن يكون رقمًا (وإذا كان حسابًا جذريًا اترك العمود فارغًا).`);
          continue;
        }

        const levelRaw = Number(row.level);
        const level = Number.isInteger(levelRaw) && levelRaw >= 1 && levelRaw <= 10 ? levelRaw : null;

        const item: Prepared = {
          index: rowNum,
          code,
          name,
          parentCode: parentCode || null,
          level,
          explicitGroup: AccountingService.parseGroupFlag(row.isGroup),
          currencyTokens: Array.isArray(row.currencyTokens)
            ? row.currencyTokens.filter(Boolean).map(String)
            : [],
          valid: true,
          type: '',
          balance: 'DEBIT',
        };
        prepared.push(item);
        fileByCode.set(code, item);
      }

      if (prepared.length === 0) {
        throw new Error('كل صفوف الملف غير صالحة — لا يوجد شيء للاستيراد.');
      }

      // ---- Pass 2: حل الأب لكل صف ----
      //  مصدر الأب: العمود «الحساب الرئيسي» من الملف. عند غيابه (جذر) بلغ الطول
      //  >1 نلجأ لأقرب بادئة موجودة (سلوك الشجرة البادئية في النظام السابق).
      for (const item of prepared) {
        if (item.parentCode || item.code.length === 1) {
          if (item.parentCode && !codeToId.has(item.parentCode) && !fileByCode.has(item.parentCode)) {
            // أب معلن وغير معروف → جرب أقرب بادئة موجودة
            item.parentCode = nearestExistingAncestor(item.code, codeToId, fileByCode);
            if (!item.parentCode) {
              item.valid = false;
              fail(item.index, item.code, `الحساب الرئيسي المعلن غير موجود في الملف أو في الدليل الحالي.`);
            }
          }
          continue;
        }
        // بلا العمود: بادئة عادية — إن لم توجد بادئة فهذا جذر شجرة غير مصنف (Pass 3 يقرر)
        item.parentCode = nearestExistingAncestor(item.code, codeToId, fileByCode);
      }

      // ---- Pass 3: التصنيف المحاسبي (النوع + طبيعة الرصيد) بالوراثة من الجذر ----
      const rootInfoByCode = new Map<string, { type: string; balance: 'DEBIT' | 'CREDIT' }>();
      const inheritFromAncestor = (ancestorCode: string): { type: string; balance: 'DEBIT' | 'CREDIT' } | undefined => {
        let ancestor = ancestorCode;
        while (ancestor) {
          const fromRoot = rootInfoByCode.get(ancestor);
          if (fromRoot) return fromRoot;
          const existing = existingByCode.get(ancestor);
          if (existing) return { type: existing.account_type_id, balance: existing.normal_balance };
          ancestor = ancestor.length > 1 ? ancestor.slice(0, -1) : '';
        }
        return undefined;
      };

      for (const item of [...prepared].sort((a, b) =>
        a.code.length !== b.code.length ? a.code.length - b.code.length : Number(a.code) - Number(b.code)
      )) {
        let type: string | undefined;
        let balance: 'DEBIT' | 'CREDIT' | undefined;

        const classified = classifyRoot(item.name);
        if (classified) {
          type = classified.accountTypeId;
          balance = classified.normalBalance;
          rootInfoByCode.set(item.code, { type, balance });
        }

        if (!type && item.parentCode) {
          const inherited = inheritFromAncestor(item.parentCode);
          if (inherited) {
            type = inherited.type;
            balance = inherited.balance;
          }
        }

        if (!type) {
          // لا تصنيف بالاسم ولا أحد سلفه في الملف — إن كان الحساب موجودًا
          // سابقًا فاحتفظ بنوعه الحالي (وهو ذاته جذر شجرته إذًا)
          const existing = existingByCode.get(item.code);
          if (existing) {
            type = existing.account_type_id;
            balance = existing.normal_balance;
            rootInfoByCode.set(item.code, { type, balance });
          }
        }

        if (type) {
          item.type = type;
          item.balance = balance || typeBalances.get(type) || 'DEBIT';
        }
      }

      const unresolved = prepared.filter((p) => p.valid && !p.type);
      for (const p of unresolved) {
        p.valid = false;
        fail(p.index, p.code, `تعذر تصنيف الحساب «${p.name}» — تأكد أن اسم جذر شجرته في الملف واحد من: أصول / خصوم / حقوق ملكية / مصاريف / إيرادات.`);
      }

      // تغيير نوع حساب عليه حركات = رفض الصف (النوع بقي كما هو في قاعدة البيانات)
      for (const item of prepared) {
        if (!item.valid) continue;
        const existing = existingByCode.get(item.code);
        if (existing && existing.id && typeLocked.has(existing.id) && existing.account_type_id !== item.type) {
          item.valid = false;
          fail(item.index, item.code, `لا يمكن تغيير نوع الحساب «${item.name}» من ${existing.account_type_id} إلى ${item.type} لأنه عليه حركات قيد مسجلة.`);
        }
      }

      if (summary.errors.length > 0) {
        const err = new Error(`الاستيراد أُجهض — عدّل الملف وأعد المحاولة. (${summary.errors.length} خطأ)`) as Error & { details?: AccountImportSummary['errors'] };
        err.details = summary.errors;
        throw err;
      }

      // ---- Pass 4: الكتابة (الأقصر أولًا: الأب قبل الابن دائمًا) ----
      const childCount = new Map<string, number>();
      for (const item of prepared) {
        if (item.parentCode && item.valid) childCount.set(item.parentCode, (childCount.get(item.parentCode) || 0) + 1);
      }
      const sorted = [...prepared].filter((p) => p.valid).sort((a, b) =>
        a.code.length !== b.code.length ? a.code.length - b.code.length : Number(a.code) - Number(b.code)
      );

      for (const item of sorted) {
        const existing = existingByCode.get(item.code);

        const isGroup = item.explicitGroup !== undefined
          ? item.explicitGroup
          : (childCount.get(item.code) || 0) > 0
            ? true
            : (existing?.is_group ?? false);

        const level = item.level
          ?? (item.parentCode ? (levelById.get(codeToId.get(item.parentCode) || '') || 1) + 1 : (existing?.level ?? 1));

        if (existing) {
          const updated = await db.query<{ id: string }>(
            `UPDATE accounting.accounts
                SET name = $1,
                    parent_id = $2,
                    account_type_id = $3,
                    level = $4,
                    is_group = $5,
                    normal_balance = $6,
                    currency_codes = $7,
                    updated_at = NOW()
              WHERE id = $8
              RETURNING id`,
            [
              item.name,
              item.parentCode ? (codeToId.get(item.parentCode) || existing.parent_id || null) : existing.parent_id || null,
              item.type,
              level,
              isGroup,
              item.balance,
              item.currencyTokens.length ? normalizeCurrencyTokens(item.currencyTokens) : null,
              existing.id,
            ]
          );
          codeToId.set(item.code, updated.rows[0].id);
          levelById.set(updated.rows[0].id, level);
          summary.updated++;
        } else {
          const inserted = await db.query<{ id: string }>(
            `INSERT INTO accounting.accounts
             (company_id, parent_id, code, name, account_type_id, level, is_group, is_active, normal_balance, currency_codes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8, $9)
             RETURNING id`,
            [
              companyId,
              item.parentCode ? (codeToId.get(item.parentCode) || null) : null,
              item.code,
              item.name,
              item.type,
              level,
              isGroup,
              item.balance,
              item.currencyTokens.length ? normalizeCurrencyTokens(item.currencyTokens) : null,
            ]
          );
          codeToId.set(item.code, inserted.rows[0].id);
          levelById.set(inserted.rows[0].id, level);
          summary.inserted++;
        }
      }
    });

    await logAudit({
      userId: data.userId,
      action: 'IMPORT',
      entityType: 'ACCOUNT_IMPORT',
      newData: { inserted: summary.inserted, updated: summary.updated, rows: data.rows.length },
    });

    return summary;
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

    // PHASE COA-1 — قاعدة التجميعي مقابل التفصيلي: الحسابات التجميعية
    // (Group/رئيسية) لا تقبل التحليل في القيود اليومية؛ فقط الحسابات
    // التفصيلية (الفرعية) هي التي تُدخل القيد وترحّله.
    for (const line of dto.lines) {
      const accRes = await db.query<any>(
        'SELECT id, code, name, is_group FROM accounting.accounts WHERE id = $1',
        [line.accountId]
      );
      const acc = accRes.rows[0];
      if (!acc) {
        throw new Error(`الحساب المالي المحدد غير موجود في دليل الحسابات (معرف: ${line.accountId})`);
      }
      if (acc.is_group) {
        throw new Error(`الحساب «${acc.code} - ${acc.name}» حساب تجميعي لا يقبل التحليل في القيود اليومية — يلزم استخدام الحساب التفصيلي الفرعي.`);
      }
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

    // PHASE 10.6.4 — the entry header and its lines persist in ONE
    // transaction: a failing line insert (e.g. FK violation) can no longer
    // leave an orphan DRAFT entry with missing/zero lines behind. The helper
    // is reentrant, so nested flows (invoice posting) stay atomic-end-to-end.
    return withTransaction(async () => {
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
    });
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
   *
   * PHASE 10.3 — two defects lived in this one query:
   *
   * 1. `LEFT JOIN journal_entries je ON ... AND je.status = 'POSTED'` looks
   *    like a status filter but is not: the LEFT JOIN keeps every line row and
   *    merely nulls the entry, so `SUM(jl.debit)` went on counting DRAFT
   *    entries (a 777,777 draft invoice landed in the trial balance).
   *    Filtering the summed expression on `je.id IS NOT NULL` is what actually
   *    restricts it to the ledger.
   * 2. `status = 'POSTED'` retired the original of a reversal pair while
   *    keeping its compensation. See the unified contract: an entry is in the
   *    ledger iff status IN ('POSTED','REVERSED').
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
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit  END), 0) as "totalDebit",
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.credit END), 0) as "totalCredit",
        COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit - jl.credit END), 0) as "balance"
      FROM accounting.accounts a
      JOIN accounting.account_types t ON t.id = a.account_type_id
      LEFT JOIN accounting.journal_entry_lines jl ON jl.account_id = a.id
      LEFT JOIN accounting.journal_entries je ON je.id = jl.journal_entry_id AND je.status IN ('POSTED', 'REVERSED')
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
